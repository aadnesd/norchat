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
