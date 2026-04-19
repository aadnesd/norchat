export type PlanTier = "starter" | "pro" | "enterprise";

export type Region =
  | "norway-oslo"
  | "eu-north"
  | "eu-west"
  | "us-east"
  | "ap-southeast";

export type Tenant = {
  id: string;
  name: string;
  plan?: PlanTier | string;
  region: Region | string;
  dataResidency?: string;
  createdAt: string;
};

export type TenantCreateInput = {
  name: string;
  plan?: PlanTier | string;
  region: Region | string;
  dataResidency?: string;
};

export type AgentStatus = "draft" | "active" | "paused" | "archived";

export type MessageRole = "system" | "assistant" | "user" | "tool";

export type Agent = {
  id: string;
  tenantId: string;
  name: string;
  basePrompt?: string;
  model?: string;
  status: AgentStatus;
  createdAt: string;
};

export type AgentCreateInput = {
  tenantId: string;
  name: string;
  basePrompt?: string;
  model?: string;
};

export type SourceType =
  | "website"
  | "file"
  | "text"
  | "notion"
  | "ticketing"
  | "qa";

export type SourceWebsiteConfig = {
  startUrls: string[];
  sitemapUrl?: string;
  includePaths?: string[];
  excludePaths?: string[];
  depthLimit?: number;
};

export type SourceFileConfig = {
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
};

export type SourceTextConfig = {
  title?: string;
  language?: string;
};

export type SourceQaConfig = {
  pairs: Array<{
    question: string;
    answer: string;
  }>;
};

export type SourceNotionConfig = {
  workspaceId?: string;
  pageIds?: string[];
  databaseIds?: string[];
  autoRetrain?: boolean;
};

export type SourceTicketingConfig = {
  provider: "zendesk" | "salesforce";
  accountId?: string;
  projectId?: string;
};

export type SourceConfig =
  | SourceWebsiteConfig
  | SourceFileConfig
  | SourceTextConfig
  | SourceQaConfig
  | SourceNotionConfig
  | SourceTicketingConfig
  | Record<string, unknown>;

export type SourceStatus = "queued" | "processing" | "ready" | "failed";

export type Source = {
  id: string;
  agentId: string;
  type: SourceType;
  value?: string;
  config?: SourceConfig;
  status: SourceStatus;
  createdAt: string;
  lastSyncedAt?: string;
};

export type SourceCreateInput = {
  agentId: string;
  type: SourceType;
  value?: string;
  config?: SourceConfig;
};

export type Chunk = {
  id: string;
  agentId: string;
  sourceId: string;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type ChunkCreateInput = {
  sourceId: string;
  content: string;
  metadata?: Record<string, unknown>;
};

export type RetrievalRequest = {
  agentId: string;
  query: string;
  maxResults?: number;
  sourceIds?: string[];
  minScore?: number;
};

export type RetrievalResult = {
  chunk: Pick<Chunk, "id" | "sourceId" | "content" | "metadata">;
  score: number;
};

export type RetrievalResponse = {
  items: RetrievalResult[];
};

export type SourceCitation = {
  chunkId: string;
  sourceId: string;
  sourceType: SourceType;
  sourceUrl?: string;
  sourceTitle?: string;
  score: number;
  excerpt?: string;
};

export type CrawlConfig = {
  agentId: string;
  startUrls: string[];
  sitemapUrl?: string;
  includePaths?: string[];
  excludePaths?: string[];
  depthLimit?: number;
};

export type IngestionJobStatus = "queued" | "processing" | "complete" | "failed";

export type IngestionJobError = {
  message: string;
  transient: boolean;
  attempts: number;
  at: string;
};

export type IngestionJob = {
  id: string;
  sourceId: string;
  kind: "crawl" | "file" | "text" | "qa" | "notion" | "retrain" | "action";
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

export type IngestionJobBundle = {
  source: Source;
  job: IngestionJob;
};

export type ActionType =
  | "human_escalation"
  | "web_search"
  | "slack_notify"
  | "ticket_create"
  | "lead_capture"
  | "schedule"
  | "billing"
  | "stripe_billing"
  | "stripe_subscription"
  | "stripe_refund"
  | "calendly_schedule"
  | "calcom_schedule"
  | "salesforce_ticket"
  | "shopify_action"
  | "custom_api";

export type Action = {
  id: string;
  agentId: string;
  type: ActionType;
  config?: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
};

export type ActionCreateInput = {
  agentId: string;
  type: ActionType;
  config?: Record<string, unknown>;
  enabled?: boolean;
};

/** Stripe billing action configuration. */
export type StripeBillingConfig = {
  currency?: string;
  defaultAmount?: number;
  allowCustomAmount?: boolean;
  stripeApiKey?: string;
};

/** Stripe subscription action payload. */
export type StripeSubscriptionPayload = {
  customerId: string;
  priceId: string;
  quantity?: number;
  trialDays?: number;
  action: "create" | "cancel" | "retrieve";
  subscriptionId?: string;
  cancelAtPeriodEnd?: boolean;
};

/** Stripe refund action payload. */
export type StripeRefundPayload = {
  invoiceId: string;
  amount?: number;
  reason?: "duplicate" | "fraudulent" | "requested_by_customer";
};

export type ChannelType =
  | "web_widget"
  | "help_page"
  | "slack"
  | "whatsapp"
  | "email"
  | "messenger"
  | "instagram"
  | "zendesk"
  | "salesforce"
  | "shopify"
  | "zapier"
  | "wordpress";

export type ChannelWebWidgetConfig = {
  allowedDomains?: string[];
  theme?: "norway" | "neutral";
};

export type ChannelHelpPageConfig = {
  allowedDomains?: string[];
  title?: string;
  description?: string;
};

export type ChannelWebhookConfig = {
  authToken: string;
  verifyToken?: string;
};

export type ChannelConfig =
  | ChannelWebWidgetConfig
  | ChannelHelpPageConfig
  | ChannelWebhookConfig
  | Record<string, unknown>;

export type Channel = {
  id: string;
  agentId: string;
  type: ChannelType;
  config?: ChannelConfig;
  enabled: boolean;
  createdAt: string;
};

export type ChannelCreateInput = {
  agentId: string;
  type: ChannelType;
  config?: ChannelConfig;
  enabled?: boolean;
};

export type ConversationStatus = "open" | "closed" | "escalated";

export type Conversation = {
  id: string;
  agentId: string;
  channelId?: string;
  userId?: string;
  status: ConversationStatus;
  startedAt: string;
  endedAt?: string;
};

export type ConversationCreateInput = {
  agentId: string;
  channelId?: string;
  userId?: string;
};

export type Message = {
  id: string;
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

export type MessageCreateInput = {
  conversationId: string;
  role: MessageRole;
  content: string;
  metadata?: Record<string, unknown>;
};

export type Feedback = {
  id: string;
  messageId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
  createdAt: string;
};

export type FeedbackCreateInput = {
  messageId: string;
  rating: 1 | 2 | 3 | 4 | 5;
  comment?: string;
};

export type ApiError = {
  error: string;
  message?: string;
  details?: Record<string, unknown>;
};

export type ApiListResponse<T> = {
  items: T[];
};

export type ApiResponse<T> = T | ApiError;

export type StructuredLogLevel = "debug" | "info" | "warn" | "error";

export type StructuredLogContext = {
  traceId?: string;
  tenantId?: string;
  userId?: string;
} & Record<string, unknown>;

export type StructuredLogEntry = {
  timestamp: string;
  level: StructuredLogLevel;
  message: string;
  service?: string;
} & StructuredLogContext;

export type StructuredLogSink = (entry: StructuredLogEntry) => void;

export type StructuredLogger = {
  debug: (message: string, context?: StructuredLogContext) => void;
  info: (message: string, context?: StructuredLogContext) => void;
  warn: (message: string, context?: StructuredLogContext) => void;
  error: (message: string, context?: StructuredLogContext) => void;
  child: (context: StructuredLogContext) => StructuredLogger;
};

const normalizeLogContext = (context?: StructuredLogContext): StructuredLogContext => {
  if (!context) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(context).filter(([, value]) => value !== undefined)
  );
};

const defaultLogSink: StructuredLogSink = (entry) => {
  console.log(JSON.stringify(entry));
};

export const createStructuredLogger = (options?: {
  service?: string;
  context?: StructuredLogContext;
  sink?: StructuredLogSink;
}): StructuredLogger => {
  const baseContext = normalizeLogContext(options?.context);
  const sink = options?.sink ?? defaultLogSink;

  const emit = (
    level: StructuredLogLevel,
    message: string,
    context?: StructuredLogContext
  ) => {
    sink({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(options?.service ? { service: options.service } : {}),
      ...baseContext,
      ...normalizeLogContext(context)
    });
  };

  return {
    debug: (message, context) => emit("debug", message, context),
    info: (message, context) => emit("info", message, context),
    warn: (message, context) => emit("warn", message, context),
    error: (message, context) => emit("error", message, context),
    child: (context) =>
      createStructuredLogger({
        service: options?.service,
        sink,
        context: { ...baseContext, ...normalizeLogContext(context) }
      })
  };
};

export type TypedErrorInput = {
  code: string;
  message?: string;
  statusCode?: number;
  details?: Record<string, unknown>;
  cause?: unknown;
};

export class TypedError extends Error {
  code: string;
  statusCode: number;
  details?: Record<string, unknown>;

  constructor(input: TypedErrorInput) {
    super(input.message ?? input.code);
    this.name = "TypedError";
    this.code = input.code;
    this.statusCode = input.statusCode ?? 400;
    this.details = input.details;
    if (input.cause !== undefined) {
      this.cause = input.cause;
    }
  }
}

export const createTypedError = (input: TypedErrorInput) => new TypedError(input);

export const isTypedError = (value: unknown): value is TypedError =>
  value instanceof TypedError;

export type SerializedTypedError = ApiError & {
  statusCode: number;
  cause?: string;
};

const serializeCause = (cause: unknown): string | undefined => {
  if (cause instanceof Error) {
    return cause.message;
  }
  if (typeof cause === "string") {
    return cause;
  }
  return undefined;
};

export const serializeTypedError = (
  error: unknown,
  fallback: { code?: string; statusCode?: number } = {}
): SerializedTypedError => {
  const fallbackCode = fallback.code ?? "internal_error";
  const fallbackStatus = fallback.statusCode ?? 500;
  if (isTypedError(error)) {
    return {
      error: error.code,
      message: error.message,
      ...(error.details ? { details: error.details } : {}),
      ...(error.cause ? { cause: serializeCause(error.cause) } : {}),
      statusCode: error.statusCode
    };
  }
  if (error instanceof Error) {
    return {
      error: fallbackCode,
      message: error.message,
      statusCode: fallbackStatus
    };
  }
  return {
    error: fallbackCode,
    statusCode: fallbackStatus
  };
};

export type NotionSourceCreateInput = {
  agentId: string;
  workspaceId: string;
  accessToken: string;
  pageIds?: string[];
  databaseIds?: string[];
  autoRetrain?: boolean;
};

export type NotionWebhookPayload = {
  sourceId?: string;
  workspaceId?: string;
  type?: "page_changed" | "database_changed" | "content_updated" | "verification";
  pageId?: string;
  databaseId?: string;
  timestamp?: string;
};

export type NotionSyncCheckResult = {
  stale: Array<{
    sourceId: string;
    jobId: string;
    lastSyncedAt: string;
    staleSinceMs: number;
  }>;
  upToDate: string[];
  thresholdMs: number;
};

// --- Runtime store path resolution ---------------------------------------
//
// API and worker processes must agree on the same runtime-state file.
// npm workspaces run each workspace with its own cwd (apps/api, apps/worker,
// etc.), so `path.join(process.cwd(), "data", "api-runtime")` resolves to
// DIFFERENT directories per process and jobs written by the API would never
// be seen by the worker. This helper locates the repo root (the directory
// containing a package.json with `"workspaces"`) and anchors the default
// runtime store there, so both processes write to one shared location
// regardless of cwd.
//
// Environment overrides are still honored for deployments where processes
// run on different hosts or use an external queue.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const isWorkspaceRoot = (dir: string): boolean => {
  const pkgPath = path.join(dir, "package.json");
  if (!existsSync(pkgPath)) {
    return false;
  }
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as {
      workspaces?: unknown;
    };
    return Array.isArray(pkg.workspaces) || typeof pkg.workspaces === "object";
  } catch {
    return false;
  }
};

/**
 * Walk upward from `startDir` looking for a package.json with a `workspaces`
 * field. Falls back to `startDir` itself if no workspace root is found.
 */
export const findWorkspaceRoot = (startDir: string = process.cwd()): string => {
  let current = path.resolve(startDir);
  // Guard against infinite loops on broken filesystems.
  for (let i = 0; i < 32; i += 1) {
    if (isWorkspaceRoot(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return startDir;
    }
    current = parent;
  }
  return startDir;
};

/**
 * Resolve the canonical runtime store directory.
 *
 * Precedence:
 *   1. `RUNTIME_STORE_DIR` env var (if set and non-empty)
 *   2. `<workspace-root>/data/api-runtime`
 *
 * Both the API and every worker process MUST agree on this path, otherwise
 * jobs written by one process will never be seen by the other. Prefer
 * `RUNTIME_STORE_DIR` in production / multi-host deployments.
 */
export const resolveRuntimeStoreDir = (options?: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
}): string => {
  const env = options?.env ?? process.env;
  const override = env.RUNTIME_STORE_DIR;
  if (override && override.trim()) {
    return override;
  }
  const root = findWorkspaceRoot(options?.cwd ?? process.cwd());
  return path.join(root, "data", "api-runtime");
};

/**
 * Resolve the canonical runtime state file path (runtime-state.json inside
 * the runtime store dir). Accepts a full-path override for test harnesses.
 */
export const resolveRuntimeStatePath = (options?: {
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  runtimeStateFileOverride?: string;
}): string => {
  if (options?.runtimeStateFileOverride && options.runtimeStateFileOverride.trim()) {
    return options.runtimeStateFileOverride;
  }
  const env = options?.env ?? process.env;
  const explicit = env.WORKER_RUNTIME_STATE_PATH;
  if (explicit && explicit.trim()) {
    return explicit;
  }
  return path.join(resolveRuntimeStoreDir({ env, cwd: options?.cwd }), "runtime-state.json");
};

// --- Cross-process file lock --------------------------------------------
//
// The runtime state file is read-modify-written by both the API process
// (on every metric / quota / audit event) and by each worker process (on
// every claim / complete / retry). Without coordination the rename-based
// "atomic" writes can still clobber updates made by the other process
// between load and persist.
//
// We use a sidecar lockfile created with O_CREAT | O_EXCL. This works on
// POSIX and on Windows without extra dependencies, and is resilient to
// crashes via a stale-lock timeout: a lock older than `staleAfterMs` is
// considered abandoned and may be reclaimed. The lock body contains the
// owner's PID + timestamp to aid debugging. When the stale recovery
// reclaims a lock we keep a best-effort exclusive-create race so only one
// waiter wins.

import { openSync, closeSync, unlinkSync, statSync, writeSync } from "node:fs";

export type FileLockOptions = {
  /** How long to wait total (ms) before giving up. Default 10_000. */
  timeoutMs?: number;
  /** Retry poll interval (ms). Default 25. */
  retryMs?: number;
  /** Treat locks older than this as abandoned (ms). Default 30_000. */
  staleAfterMs?: number;
  /** Signal to abort waiting. */
  signal?: AbortSignal;
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const tryAcquireLock = (lockPath: string): boolean => {
  try {
    const fd = openSync(lockPath, "wx");
    try {
      const payload = `${process.pid}\n${Date.now()}\n`;
      writeSync(fd, payload);
    } finally {
      closeSync(fd);
    }
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  }
};

const reclaimIfStale = (lockPath: string, staleAfterMs: number): boolean => {
  try {
    const stat = statSync(lockPath);
    const ageMs = Date.now() - stat.mtimeMs;
    if (ageMs < staleAfterMs) {
      return false;
    }
    // Best-effort: remove the stale lock and let the caller retry. If
    // another waiter reclaims first we'll simply see EEXIST on the next
    // tryAcquireLock and keep polling.
    unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
};

/**
 * Acquire a cross-process lock on `lockPath` (typically
 * `<runtime-state>.lock`), run `fn`, then release. If acquisition takes
 * longer than `timeoutMs`, throws. Stale locks older than `staleAfterMs`
 * are reclaimed automatically so a crashed holder does not wedge the
 * system permanently.
 */
export const withFileLock = async <T>(
  lockPath: string,
  fn: () => Promise<T>,
  options: FileLockOptions = {}
): Promise<T> => {
  const timeoutMs = options.timeoutMs ?? 10_000;
  const retryMs = Math.max(1, options.retryMs ?? 25);
  const staleAfterMs = Math.max(1_000, options.staleAfterMs ?? 30_000);
  const deadline = Date.now() + timeoutMs;
  let acquired = false;

  while (!acquired) {
    if (options.signal?.aborted) {
      throw createTypedError({
        code: "file_lock_aborted",
        message: `aborted while waiting for file lock at ${lockPath}`,
        statusCode: 499
      });
    }
    if (tryAcquireLock(lockPath)) {
      acquired = true;
      break;
    }
    if (reclaimIfStale(lockPath, staleAfterMs) && tryAcquireLock(lockPath)) {
      acquired = true;
      break;
    }
    if (Date.now() >= deadline) {
      throw createTypedError({
        code: "file_lock_timeout",
        message: `timed out acquiring file lock at ${lockPath}`,
        statusCode: 503,
        details: { lockPath, timeoutMs }
      });
    }
    await sleep(retryMs);
  }

  try {
    return await fn();
  } finally {
    try {
      unlinkSync(lockPath);
    } catch {
      // best effort: if someone else already reclaimed a stale copy of
      // our lock, unlink may fail. Nothing to do.
    }
  }
};

/** Derive the conventional lock-file path for a given runtime state path. */
export const runtimeStateLockPath = (runtimeStatePath: string): string =>
  `${runtimeStatePath}.lock`;
