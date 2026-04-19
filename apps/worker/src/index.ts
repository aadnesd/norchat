import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createStructuredLogger, createTypedError, resolveRuntimeStatePath, runtimeStateLockPath, withFileLock } from "@norway-support/shared";

const DEFAULT_POLL_INTERVAL_MS = 5000;
const DEFAULT_CONCURRENCY = 1;
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_BASE_DELAY_MS = 1000;
const DEFAULT_RETRY_MAX_DELAY_MS = 30000;
const RETRYABLE_ERROR_CODES = new Set([
  "ETIMEDOUT",
  "ECONNRESET",
  "EAI_AGAIN",
  "ECONNREFUSED",
  "EPIPE"
]);

export type IngestionJobStatus = "queued" | "processing" | "complete" | "failed";

export type IngestionJobError = {
  message: string;
  transient: boolean;
  attempts: number;
  at: string;
};

export type RuntimeIngestionJob = {
  id: string;
  sourceId: string;
  kind: string;
  status: IngestionJobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  slaMet?: boolean;
  attempts?: number;
  maxAttempts?: number;
  nextAttemptAt?: string;
  lastError?: IngestionJobError;
};

type DurableRuntimeState = {
  ingestionJobs: RuntimeIngestionJob[];
  metricEvents: unknown[];
  auditEvents: unknown[];
};

type WorkerLogger = Pick<Console, "info" | "warn" | "error">;
type WorkerClock = () => Date;

export type JobProcessor = (job: RuntimeIngestionJob) => Promise<void>;

export type RunWorkerCycleOptions = {
  runtimeStatePath: string;
  processJob?: JobProcessor;
  now?: WorkerClock;
  concurrency?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  retryMaxDelayMs?: number;
  log?: WorkerLogger;
};

export type StartWorkerOptions = Omit<RunWorkerCycleOptions, "runtimeStatePath"> & {
  runtimeStatePath?: string;
  pollIntervalMs?: number;
  /**
   * When true, the worker will use a no-op processor if none is injected.
   * Intended for tests and lifecycle-only deployments. In normal operation
   * leave this unset — the default behavior is to fail loudly when no real
   * processor is configured, so jobs are never silently marked complete.
   * Can also be enabled via the WORKER_ALLOW_NOOP_PROCESSOR env var.
   */
  allowNoopProcessor?: boolean;
};

export type WorkerController = {
  tick: () => Promise<void>;
  stop: () => Promise<void>;
};

const emptyRuntimeState = (): DurableRuntimeState => ({
  ingestionJobs: [],
  metricEvents: [],
  auditEvents: []
});

const serializeLogData = (values: unknown[]) =>
  values
    .map((value) => {
      if (typeof value === "string") {
        return value;
      }
      if (value instanceof Error) {
        return value.message;
      }
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    })
    .join(" ");

const sharedWorkerLogger = createStructuredLogger({
  service: "worker",
  sink: (entry) => {
    const line = JSON.stringify(entry);
    if (entry.level === "error") {
      console.error(line);
      return;
    }
    if (entry.level === "warn") {
      console.warn(line);
      return;
    }
    console.info(line);
  }
});

const defaultWorkerLogger: WorkerLogger = {
  info: (...data: unknown[]) => {
    sharedWorkerLogger.info("worker.log", { message: serializeLogData(data) });
  },
  warn: (...data: unknown[]) => {
    sharedWorkerLogger.warn("worker.log", { message: serializeLogData(data) });
  },
  error: (...data: unknown[]) => {
    sharedWorkerLogger.error("worker.log", { message: serializeLogData(data) });
  }
};

const parsePositiveInt = (
  value: string | undefined,
  fallback: number,
  variableName: string
) => {
  if (value === undefined) {
    return fallback;
  }
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw createTypedError({
      code: `${variableName.toLowerCase()}_invalid`,
      message: `${variableName} must be a positive integer`,
      statusCode: 400,
      details: {
        variableName,
        value
      }
    });
  }
  return parsed;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const asString = (value: unknown) => (typeof value === "string" ? value : undefined);
const asBoolean = (value: unknown) => (typeof value === "boolean" ? value : undefined);
const asNonNegativeInt = (value: unknown) =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : undefined;
const asNonNegativeNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : undefined;

const asIngestionJobStatus = (value: unknown): IngestionJobStatus | undefined => {
  if (
    value === "queued" ||
    value === "processing" ||
    value === "complete" ||
    value === "failed"
  ) {
    return value;
  }
  return undefined;
};

const asIngestionJobError = (value: unknown): IngestionJobError | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const message = asString(value.message);
  const transient = asBoolean(value.transient);
  const attempts = asNonNegativeInt(value.attempts);
  const at = asString(value.at);
  if (!message || transient === undefined || attempts === undefined || !at) {
    return undefined;
  }
  return {
    message,
    transient,
    attempts,
    at
  };
};

const asRuntimeIngestionJob = (value: unknown): RuntimeIngestionJob | undefined => {
  if (!isRecord(value)) {
    return undefined;
  }
  const id = asString(value.id);
  const sourceId = asString(value.sourceId);
  const kind = asString(value.kind);
  const status = asIngestionJobStatus(value.status);
  const createdAt = asString(value.createdAt);
  if (!id || !sourceId || !kind || !status || !createdAt) {
    return undefined;
  }
  return {
    id,
    sourceId,
    kind,
    status,
    createdAt,
    startedAt: asString(value.startedAt),
    completedAt: asString(value.completedAt),
    durationMs: asNonNegativeNumber(value.durationMs),
    slaMet: asBoolean(value.slaMet),
    attempts: asNonNegativeInt(value.attempts),
    maxAttempts: asNonNegativeInt(value.maxAttempts),
    nextAttemptAt: asString(value.nextAttemptAt),
    lastError: asIngestionJobError(value.lastError)
  };
};

const normalizeRuntimeState = (value: unknown): DurableRuntimeState => {
  if (!isRecord(value)) {
    return emptyRuntimeState();
  }

  const ingestionJobs = Array.isArray(value.ingestionJobs)
    ? value.ingestionJobs
        .map((job) => asRuntimeIngestionJob(job))
        .filter((job): job is RuntimeIngestionJob => Boolean(job))
    : [];
  const metricEvents = Array.isArray(value.metricEvents) ? value.metricEvents : [];
  const auditEvents = Array.isArray(value.auditEvents) ? value.auditEvents : [];

  return {
    ingestionJobs,
    metricEvents,
    auditEvents
  };
};

/**
 * Sentinel used when the worker runs without a real processor. Throws a
 * non-retryable error so the job is marked `failed` with an explicit
 * message instead of silently "completing" ingestion / retrain / action
 * work. Operators will see a clear failure in the runtime state and the
 * scheduler will not keep retrying an unconfigured worker.
 */
const defaultProcessJob: JobProcessor = async (job) => {
  throw createTypedError({
    code: "worker_processor_not_configured",
    message:
      `worker has no processJob configured; refusing to mark ${job.kind} job ${job.id} complete`,
    statusCode: 500,
    details: {
      jobId: job.id,
      jobKind: job.kind,
      hint:
        "Inject processJob via startWorker({ processJob }) or set WORKER_ALLOW_NOOP_PROCESSOR=1 to opt into no-op mode (tests only)."
    }
  });
};

/**
 * Opt-in no-op processor. Kept separate so it is only reachable via an
 * explicit flag, never by accident. Intended for tests and the lifecycle-
 * only worker variant used while real processors live elsewhere.
 */
const noopProcessJob: JobProcessor = async () => undefined;

const isTruthyEnv = (value: string | undefined): boolean => {
  if (!value) {
    return false;
  }
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

const isRetryableError = (error: unknown) => {
  if (isRecord(error) && typeof error.transient === "boolean") {
    return error.transient;
  }
  if (isRecord(error) && typeof error.code === "string") {
    return RETRYABLE_ERROR_CODES.has(error.code);
  }
  const message = getErrorMessage(error).toLowerCase();
  return message.includes("timeout") || message.includes("temporary");
};

const isJobReadyForProcessing = (job: RuntimeIngestionJob, nowMs: number) => {
  if (job.status !== "queued") {
    return false;
  }
  if (!job.nextAttemptAt) {
    return true;
  }
  const scheduledAt = Date.parse(job.nextAttemptAt);
  if (Number.isNaN(scheduledAt)) {
    return true;
  }
  return scheduledAt <= nowMs;
};

const sortByCreatedAtAsc = (a: RuntimeIngestionJob, b: RuntimeIngestionJob) => {
  const left = Date.parse(a.createdAt);
  const right = Date.parse(b.createdAt);
  if (Number.isNaN(left) && Number.isNaN(right)) {
    return 0;
  }
  if (Number.isNaN(left)) {
    return 1;
  }
  if (Number.isNaN(right)) {
    return -1;
  }
  return left - right;
};

const buildBackoffDelay = (
  attempts: number,
  retryBaseDelayMs: number,
  retryMaxDelayMs: number
) => Math.min(retryBaseDelayMs * 2 ** Math.max(0, attempts - 1), retryMaxDelayMs);

const buildIngestionJobError = (
  error: unknown,
  transient: boolean,
  attempts: number,
  at: string
): IngestionJobError => ({
  message: getErrorMessage(error),
  transient,
  attempts,
  at
});

const patchIngestionJob = async (
  runtimeStatePath: string,
  jobId: string,
  update: (job: RuntimeIngestionJob) => RuntimeIngestionJob | null
) => {
  // Guard the read-modify-write with the shared cross-process lock so
  // concurrent API metric/quota writes and worker claim/complete updates
  // cannot clobber each other. The lock also serializes this worker's
  // own in-cycle patches, so concurrency > 1 is safe.
  return withFileLock(runtimeStateLockPath(runtimeStatePath), async () => {
    const runtimeState = await loadRuntimeState(runtimeStatePath);
    const index = runtimeState.ingestionJobs.findIndex((job) => job.id === jobId);
    if (index === -1) {
      return undefined;
    }
    const currentJob = runtimeState.ingestionJobs[index];
    const nextJob = update(currentJob);
    if (!nextJob) {
      return undefined;
    }
    runtimeState.ingestionJobs[index] = nextJob;
    await persistRuntimeState(runtimeStatePath, runtimeState);
    return nextJob;
  });
};

export function parsePollInterval(value = process.env.WORKER_POLL_INTERVAL_MS): number {
  return parsePositiveInt(value, DEFAULT_POLL_INTERVAL_MS, "WORKER_POLL_INTERVAL_MS");
}

export function parseConcurrency(value = process.env.WORKER_CONCURRENCY): number {
  return parsePositiveInt(value, DEFAULT_CONCURRENCY, "WORKER_CONCURRENCY");
}

export function parseMaxAttempts(value = process.env.WORKER_MAX_ATTEMPTS): number {
  return parsePositiveInt(value, DEFAULT_MAX_ATTEMPTS, "WORKER_MAX_ATTEMPTS");
}

export function parseRetryBaseDelay(
  value = process.env.WORKER_RETRY_BASE_DELAY_MS
): number {
  return parsePositiveInt(
    value,
    DEFAULT_RETRY_BASE_DELAY_MS,
    "WORKER_RETRY_BASE_DELAY_MS"
  );
}

export function parseRetryMaxDelay(
  value = process.env.WORKER_RETRY_MAX_DELAY_MS,
  minimumDelayMs = DEFAULT_RETRY_BASE_DELAY_MS
): number {
  const parsed = parsePositiveInt(
    value,
    Math.max(DEFAULT_RETRY_MAX_DELAY_MS, minimumDelayMs),
    "WORKER_RETRY_MAX_DELAY_MS"
  );
  return Math.max(parsed, minimumDelayMs);
}

export function parseRuntimeStatePath(value = process.env.WORKER_RUNTIME_STATE_PATH): string {
  // Prefer the shared resolver so API and worker always land on the same file,
  // even when npm workspaces launch each process with its own cwd. Explicit
  // overrides are honored in this precedence order:
  //   1. `value` / WORKER_RUNTIME_STATE_PATH (explicit full file path)
  //   2. WORKER_RUNTIME_STORE_DIR (worker-only dir override, legacy)
  //   3. RUNTIME_STORE_DIR (shared dir override)
  //   4. <workspace-root>/data/api-runtime (shared default)
  if (value && value.trim()) {
    return value;
  }
  const workerDirOverride = process.env.WORKER_RUNTIME_STORE_DIR;
  if (workerDirOverride && workerDirOverride.trim()) {
    return path.join(workerDirOverride, "runtime-state.json");
  }
  return resolveRuntimeStatePath();
}

export function runWorkerTick(now = new Date()): string {
  return `[worker] queue tick ${now.toISOString()}`;
}

export async function loadRuntimeState(
  runtimeStatePath: string
): Promise<DurableRuntimeState> {
  try {
    const raw = await fs.readFile(runtimeStatePath, "utf8");
    return normalizeRuntimeState(JSON.parse(raw) as unknown);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyRuntimeState();
    }
    return emptyRuntimeState();
  }
}

export async function persistRuntimeState(
  runtimeStatePath: string,
  runtimeState: DurableRuntimeState
) {
  await fs.mkdir(path.dirname(runtimeStatePath), { recursive: true });
  const tempFilePath = `${runtimeStatePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempFilePath, JSON.stringify(runtimeState), "utf8");
  await fs.rename(tempFilePath, runtimeStatePath);
}

export async function recoverProcessingJobs(
  runtimeStatePath: string,
  now: WorkerClock = () => new Date()
) {
  return withFileLock(runtimeStateLockPath(runtimeStatePath), async () => {
    const runtimeState = await loadRuntimeState(runtimeStatePath);
    const recoveredAt = now().toISOString();
    let recovered = 0;
    runtimeState.ingestionJobs = runtimeState.ingestionJobs.map((job) => {
      if (job.status !== "processing") {
        return job;
      }
      recovered += 1;
      return {
        ...job,
        status: "queued",
        completedAt: undefined,
        nextAttemptAt: recoveredAt,
        lastError: {
          message: "recovered_after_worker_restart",
          transient: true,
          attempts: job.attempts ?? 0,
          at: recoveredAt
        }
      };
    });
    if (recovered > 0) {
      await persistRuntimeState(runtimeStatePath, runtimeState);
    }
    return recovered;
  });
}

export async function runWorkerCycle(
  options: RunWorkerCycleOptions
): Promise<number> {
  const now = options.now ?? (() => new Date());
  const processJob = options.processJob ?? defaultProcessJob;
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_CONCURRENCY);
  const maxAttempts = Math.max(1, options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
  const retryBaseDelayMs = Math.max(
    1,
    options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS
  );
  const retryMaxDelayMs = Math.max(
    retryBaseDelayMs,
    options.retryMaxDelayMs ?? DEFAULT_RETRY_MAX_DELAY_MS
  );
  const log = options.log ?? defaultWorkerLogger;
  const runtimeState = await loadRuntimeState(options.runtimeStatePath);
  const nowMs = now().getTime();
  const candidateIds = runtimeState.ingestionJobs
    .filter((job) => isJobReadyForProcessing(job, nowMs))
    .sort(sortByCreatedAtAsc)
    .slice(0, concurrency)
    .map((job) => job.id);

  const processedJobs = await Promise.all(
    candidateIds.map(async (jobId) => {
      const claimedJob = await patchIngestionJob(options.runtimeStatePath, jobId, (job) => {
        const claimStartedAt = now();
        const claimStartedAtMs = claimStartedAt.getTime();
        const claimStartedAtIso = claimStartedAt.toISOString();
        if (!isJobReadyForProcessing(job, claimStartedAtMs)) {
          return null;
        }
        const attempts = (job.attempts ?? 0) + 1;
        const resolvedMaxAttempts = Math.max(1, job.maxAttempts ?? maxAttempts);
        if (attempts > resolvedMaxAttempts) {
          return {
            ...job,
            status: "failed",
            completedAt: claimStartedAtIso,
            maxAttempts: resolvedMaxAttempts,
            nextAttemptAt: undefined,
            lastError: {
              message: "max_attempts_exhausted",
              transient: false,
              attempts: job.attempts ?? 0,
              at: claimStartedAtIso
            }
          };
        }
        return {
          ...job,
          status: "processing",
          startedAt: job.startedAt ?? claimStartedAtIso,
          completedAt: undefined,
          attempts,
          maxAttempts: resolvedMaxAttempts,
          nextAttemptAt: undefined
        };
      });

      if (!claimedJob || claimedJob.status !== "processing") {
        return 0;
      }

      try {
        await processJob(claimedJob);
        const completedAt = now();
        const completedAtIso = completedAt.toISOString();
        await patchIngestionJob(options.runtimeStatePath, claimedJob.id, (job) => {
          if (job.status !== "processing") {
            return null;
          }
          const startedAtMs = Date.parse(job.startedAt ?? completedAtIso);
          const completedAtMs = completedAt.getTime();
          const durationMs = Number.isNaN(startedAtMs)
            ? undefined
            : Math.max(0, completedAtMs - startedAtMs);
          return {
            ...job,
            status: "complete",
            completedAt: completedAtIso,
            durationMs,
            nextAttemptAt: undefined,
            lastError: undefined
          };
        });
        log.info(`[worker] completed job ${claimedJob.id}`);
      } catch (error) {
        const failedAt = now();
        const failedAtIso = failedAt.toISOString();
        const failedAtMs = failedAt.getTime();
        const transient = isRetryableError(error);
        await patchIngestionJob(options.runtimeStatePath, claimedJob.id, (job) => {
          if (job.status !== "processing") {
            return null;
          }
          const attempts = job.attempts ?? claimedJob.attempts ?? 1;
          const resolvedMaxAttempts = Math.max(1, job.maxAttempts ?? maxAttempts);
          const jobError = buildIngestionJobError(error, transient, attempts, failedAtIso);
          if (!transient || attempts >= resolvedMaxAttempts) {
            return {
              ...job,
              status: "failed",
              completedAt: failedAtIso,
              maxAttempts: resolvedMaxAttempts,
              nextAttemptAt: undefined,
              lastError: jobError
            };
          }
          const delayMs = buildBackoffDelay(
            attempts,
            retryBaseDelayMs,
            retryMaxDelayMs
          );
          return {
            ...job,
            status: "queued",
            completedAt: undefined,
            maxAttempts: resolvedMaxAttempts,
            nextAttemptAt: new Date(failedAtMs + delayMs).toISOString(),
            lastError: jobError
          };
        });
        if (transient) {
          log.warn(`[worker] retry scheduled for job ${claimedJob.id}`);
        } else {
          log.error(`[worker] failed job ${claimedJob.id}: ${getErrorMessage(error)}`);
        }
      }
      return 1;
    })
  );

  return processedJobs.reduce<number>((total, value) => total + value, 0);
}

export function startWorker(options: StartWorkerOptions = {}): WorkerController {
  const pollIntervalMs = options.pollIntervalMs ?? parsePollInterval();
  const runtimeStatePath = options.runtimeStatePath ?? parseRuntimeStatePath();
  const concurrency = options.concurrency ?? parseConcurrency();
  const maxAttempts = options.maxAttempts ?? parseMaxAttempts();
  const retryBaseDelayMs =
    options.retryBaseDelayMs ?? parseRetryBaseDelay();
  const retryMaxDelayMs =
    options.retryMaxDelayMs ??
    parseRetryMaxDelay(undefined, retryBaseDelayMs);
  const now = options.now ?? (() => new Date());
  const allowNoop =
    options.allowNoopProcessor ?? isTruthyEnv(process.env.WORKER_ALLOW_NOOP_PROCESSOR);
  const processJob =
    options.processJob ?? (allowNoop ? noopProcessJob : defaultProcessJob);
  const log = options.log ?? defaultWorkerLogger;

  let stopped = false;
  let cycleQueue: Promise<void> = Promise.resolve();

  const enqueueCycle = () => {
    if (stopped) {
      return;
    }
    cycleQueue = cycleQueue
      .then(async () => {
        log.info(runWorkerTick(now()));
        const processed = await runWorkerCycle({
          runtimeStatePath,
          processJob,
          now,
          concurrency,
          maxAttempts,
          retryBaseDelayMs,
          retryMaxDelayMs,
          log
        });
        if (processed > 0) {
          log.info(`[worker] processed ${processed} job(s)`);
        }
      })
      .catch((error) => {
        log.error(`[worker] cycle failure: ${getErrorMessage(error)}`);
      });
  };

  cycleQueue = cycleQueue.then(async () => {
    const recovered = await recoverProcessingJobs(runtimeStatePath, now);
    if (recovered > 0) {
      log.warn(`[worker] recovered ${recovered} processing job(s)`);
    }
  });

  enqueueCycle();
  const timer = setInterval(enqueueCycle, pollIntervalMs);
  log.info(
    `[worker] started (poll interval: ${pollIntervalMs}ms, concurrency: ${concurrency}, runtime state: ${runtimeStatePath})`
  );
  if (!options.processJob) {
    if (allowNoop) {
      log.warn(
        "[worker] running with no-op processor (WORKER_ALLOW_NOOP_PROCESSOR). Jobs will be marked complete without doing any work. Not safe for production."
      );
    } else {
      log.warn(
        "[worker] no processJob injected. Claimed jobs will FAIL with worker_processor_not_configured until a real processor is wired in. Set WORKER_ALLOW_NOOP_PROCESSOR=1 only if you intentionally want no-op completion."
      );
    }
  }

  return {
    tick: async () => {
      enqueueCycle();
      await cycleQueue;
    },
    stop: async () => {
      if (stopped) {
        return;
      }
      stopped = true;
      clearInterval(timer);
      await cycleQueue;
      log.info("[worker] stopped");
    }
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const controller = startWorker();
  let stopping = false;

  const stopAndExit = async (signal: NodeJS.Signals) => {
    if (stopping) {
      return;
    }
    stopping = true;
    console.info(`[worker] received ${signal}, draining in-flight jobs`);
    await controller.stop();
    process.exit(0);
  };

  process.on("SIGINT", () => {
    void stopAndExit("SIGINT");
  });
  process.on("SIGTERM", () => {
    void stopAndExit("SIGTERM");
  });
}
