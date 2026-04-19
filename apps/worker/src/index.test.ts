import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  type RuntimeIngestionJob,
  loadRuntimeState,
  parseConcurrency,
  parseMaxAttempts,
  parsePollInterval,
  persistRuntimeState,
  recoverProcessingJobs,
  runWorkerCycle,
  runWorkerTick,
  startWorker
} from "./index.js";

const runtimeDirs: string[] = [];

const createRuntimeStatePath = async () => {
  const runtimeDir = await mkdtemp(path.join(tmpdir(), "worker-runtime-"));
  runtimeDirs.push(runtimeDir);
  return path.join(runtimeDir, "runtime-state.json");
};

const createQueuedJob = (
  overrides: Partial<RuntimeIngestionJob> = {}
): RuntimeIngestionJob => ({
  id: "job_123",
  sourceId: "source_123",
  kind: "file",
  status: "queued",
  createdAt: "2026-01-01T00:00:00.000Z",
  attempts: 0,
  ...overrides
});

afterEach(async () => {
  await Promise.all(
    runtimeDirs.splice(0).map((runtimeDir) =>
      rm(runtimeDir, { recursive: true, force: true })
    )
  );
});

describe("worker config parsers", () => {
  it("returns defaults when values are unset", () => {
    expect(parsePollInterval(undefined)).toBe(5000);
    expect(parseConcurrency(undefined)).toBe(1);
    expect(parseMaxAttempts(undefined)).toBe(3);
  });

  it("parses valid integer values", () => {
    expect(parsePollInterval("2500")).toBe(2500);
    expect(parseConcurrency("2")).toBe(2);
    expect(parseMaxAttempts("5")).toBe(5);
  });

  it("throws for invalid values", () => {
    expect(() => parsePollInterval("0")).toThrow("positive integer");
    expect(() => parseConcurrency("-1")).toThrow("positive integer");
    expect(() => parseMaxAttempts("x")).toThrow("positive integer");
  });
});

describe("worker queue processing", () => {
  it("processes queued jobs through lifecycle transitions", async () => {
    const runtimeStatePath = await createRuntimeStatePath();
    const processJob = vi.fn(async () => undefined);

    await persistRuntimeState(runtimeStatePath, {
      ingestionJobs: [createQueuedJob()],
      metricEvents: [],
      auditEvents: []
    });

    const processed = await runWorkerCycle({
      runtimeStatePath,
      processJob,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      concurrency: 1,
      maxAttempts: 3,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 10000,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    });

    expect(processed).toBe(1);
    const runtimeState = await loadRuntimeState(runtimeStatePath);
    const job = runtimeState.ingestionJobs[0];
    expect(job.status).toBe("complete");
    expect(job.attempts).toBe(1);
    expect(job.startedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(job.completedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(job.durationMs).toBe(0);
    expect(job.lastError).toBeUndefined();
    expect(processJob).toHaveBeenCalledTimes(1);
  });

  it("retries transient failures with backoff and stores terminal error details", async () => {
    const runtimeStatePath = await createRuntimeStatePath();
    let nowMs = Date.parse("2026-01-01T00:00:00.000Z");
    const now = () => new Date(nowMs);
    const processJob = vi.fn(async () => {
      const error = new Error("upstream timeout") as Error & { code?: string };
      error.code = "ETIMEDOUT";
      throw error;
    });

    await persistRuntimeState(runtimeStatePath, {
      ingestionJobs: [createQueuedJob()],
      metricEvents: [],
      auditEvents: []
    });

    await runWorkerCycle({
      runtimeStatePath,
      processJob,
      now,
      concurrency: 1,
      maxAttempts: 2,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 10000,
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    });

    let runtimeState = await loadRuntimeState(runtimeStatePath);
    let job = runtimeState.ingestionJobs[0];
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(1);
    expect(job.nextAttemptAt).toBe("2026-01-01T00:00:01.000Z");
    expect(job.lastError?.transient).toBe(true);
    expect(job.lastError?.attempts).toBe(1);

    nowMs += 500;
    await runWorkerCycle({
      runtimeStatePath,
      processJob,
      now,
      concurrency: 1,
      maxAttempts: 2,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 10000
    });

    runtimeState = await loadRuntimeState(runtimeStatePath);
    job = runtimeState.ingestionJobs[0];
    expect(job.status).toBe("queued");
    expect(job.attempts).toBe(1);
    expect(processJob).toHaveBeenCalledTimes(1);

    nowMs += 600;
    await runWorkerCycle({
      runtimeStatePath,
      processJob,
      now,
      concurrency: 1,
      maxAttempts: 2,
      retryBaseDelayMs: 1000,
      retryMaxDelayMs: 10000
    });

    runtimeState = await loadRuntimeState(runtimeStatePath);
    job = runtimeState.ingestionJobs[0];
    expect(job.status).toBe("failed");
    expect(job.attempts).toBe(2);
    expect(job.completedAt).toBe("2026-01-01T00:00:01.100Z");
    expect(job.nextAttemptAt).toBeUndefined();
    expect(job.lastError).toMatchObject({
      transient: true,
      attempts: 2,
      message: "upstream timeout"
    });
    expect(processJob).toHaveBeenCalledTimes(2);
  });

  it("recovers processing jobs after restart and avoids duplicate work", async () => {
    const runtimeStatePath = await createRuntimeStatePath();
    const now = () => new Date("2026-01-01T00:00:00.000Z");
    const processJob = vi.fn(async () => undefined);

    await persistRuntimeState(runtimeStatePath, {
      ingestionJobs: [
        createQueuedJob({
          status: "processing",
          attempts: 1,
          startedAt: "2025-12-31T23:59:00.000Z"
        })
      ],
      metricEvents: [],
      auditEvents: []
    });

    const recovered = await recoverProcessingJobs(runtimeStatePath, now);
    expect(recovered).toBe(1);
    expect(await recoverProcessingJobs(runtimeStatePath, now)).toBe(0);

    let runtimeState = await loadRuntimeState(runtimeStatePath);
    let job = runtimeState.ingestionJobs[0];
    expect(job.status).toBe("queued");
    expect(job.nextAttemptAt).toBe("2026-01-01T00:00:00.000Z");
    expect(job.lastError?.message).toBe("recovered_after_worker_restart");

    await runWorkerCycle({
      runtimeStatePath,
      processJob,
      now,
      concurrency: 1,
      maxAttempts: 3
    });
    await runWorkerCycle({
      runtimeStatePath,
      processJob,
      now,
      concurrency: 1,
      maxAttempts: 3
    });

    runtimeState = await loadRuntimeState(runtimeStatePath);
    job = runtimeState.ingestionJobs[0];
    expect(job.status).toBe("complete");
    expect(processJob).toHaveBeenCalledTimes(1);
  });

  it("drains in-flight work during shutdown", async () => {
    const runtimeStatePath = await createRuntimeStatePath();
    let releaseJob: (() => void) | undefined;
    const processJob = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseJob = resolve;
        })
    );

    await persistRuntimeState(runtimeStatePath, {
      ingestionJobs: [createQueuedJob()],
      metricEvents: [],
      auditEvents: []
    });

    const controller = startWorker({
      runtimeStatePath,
      pollIntervalMs: 10,
      processJob,
      now: () => new Date("2026-01-01T00:00:00.000Z"),
      log: {
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      }
    });

    for (let index = 0; index < 40; index += 1) {
      const runtimeState = await loadRuntimeState(runtimeStatePath);
      if (runtimeState.ingestionJobs[0]?.status === "processing") {
        break;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, 5);
      });
    }

    const stopPromise = controller.stop();
    expect(processJob).toHaveBeenCalledTimes(1);
    expect(releaseJob).toBeDefined();
    releaseJob?.();
    await stopPromise;

    const runtimeState = await loadRuntimeState(runtimeStatePath);
    expect(runtimeState.ingestionJobs[0]?.status).toBe("complete");
  });
});

describe("runWorkerTick", () => {
  it("formats the worker poll marker", () => {
    expect(runWorkerTick(new Date("2026-01-01T00:00:00.000Z"))).toBe(
      "[worker] queue tick 2026-01-01T00:00:00.000Z"
    );
  });
});

describe("default processor safety", () => {
  it("fails claimed jobs instead of silently marking them complete when no processJob is injected", async () => {
    const runtimeStatePath = await createRuntimeStatePath();
    await persistRuntimeState(runtimeStatePath, {
      ingestionJobs: [createQueuedJob({ maxAttempts: 1 })],
      metricEvents: [],
      auditEvents: []
    });

    // Intentionally pass no `processJob`: the worker should refuse to
    // complete real work and mark the job failed with a clear error code.
    const processed = await runWorkerCycle({ runtimeStatePath, maxAttempts: 1 });
    expect(processed).toBe(1);

    const runtimeState = await loadRuntimeState(runtimeStatePath);
    const job = runtimeState.ingestionJobs[0];
    expect(job?.status).toBe("failed");
    expect(job?.lastError?.message).toContain("no processJob configured");
    expect(job?.lastError?.transient).toBe(false);
  });
});
