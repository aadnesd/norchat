import Fastify from "fastify";
import cors from "@fastify/cors";
import formbody from "@fastify/formbody";
import fastifyWebsocket from "@fastify/websocket";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { z } from "zod";
import path from "node:path";
import { promises as fs } from "node:fs";
import OpenAI, { AzureOpenAI } from "openai";
import { OpenAIRealtimeWS } from "openai/realtime/ws";
import twilio from "twilio";
import {
  buildChatPrompt,
  buildChatResponse,
  chunkResponseForStreaming,
  type ChatResponse,
  type SourceCitationInfo
} from "./chat-runtime.js";
import { buildEmbedding } from "./embeddings.js";
import {
  createRegionalVectorStore,
  type VectorRecord
} from "./vector-store.js";
import { buildHelpPage, buildWidgetScript } from "./ui-templates.js";
import { createStripeClient, StripeError } from "./stripe-client.js";
import {
  createStructuredLogger,
  createTypedError,
  isTypedError,
  resolveRuntimeStoreDir,
  runtimeStateLockPath,
  serializeTypedError,
  withFileLock
} from "@norway-support/shared";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const getString = (value: unknown) => (typeof value === "string" ? value : undefined);

const getRecord = (value: unknown) => (isRecord(value) ? value : undefined);

const getArray = (value: unknown) => (Array.isArray(value) ? value : undefined);

const tenantSchema = z.object({
  name: z.string().min(1),
  plan: z.string().min(1).optional(),
  region: z.string().min(2),
  dataResidency: z.string().min(2).optional()
});
type Tenant = z.infer<typeof tenantSchema> & { id: string; createdAt: string };

const tenantRoleSchema = z.enum(["owner", "admin", "member", "viewer"]);
type TenantRole = z.infer<typeof tenantRoleSchema>;

const tenantMemberInputSchema = z.object({
  userId: z.string().min(1),
  role: tenantRoleSchema
});

type TenantMember = z.infer<typeof tenantMemberInputSchema> & {
  id: string;
  tenantId: string;
  createdAt: string;
};

const retentionPolicyInputSchema = z
  .object({
    days: z.coerce.number().int().min(0).max(3650).optional(),
    enabled: z.boolean().optional()
  })
  .refine((data) => data.days !== undefined || data.enabled !== undefined, {
    message: "retention_update_required",
    path: ["days"]
  });

const tenantQuotaUpdateSchema = z
  .object({
    reset: z.boolean().optional(),
    used: z.coerce.number().int().min(0).optional(),
    limit: z.coerce.number().int().positive().optional()
  })
  .refine(
    (data) => data.reset !== undefined || data.used !== undefined || data.limit !== undefined,
    {
      message: "quota_update_required",
      path: ["reset"]
    }
  );

type RetentionPolicy = {
  tenantId: string;
  days: number;
  enabled: boolean;
  updatedAt: string;
  updatedBy: string;
};

const gdprDeletionSchema = z
  .object({
    userId: z.string().min(1).optional(),
    conversationId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    deleteVectorData: z.boolean().optional()
  })
  .refine((data) => data.userId || data.conversationId, {
    message: "user_or_conversation_required",
    path: ["userId"]
  });

type AuditEvent = {
  id: string;
  tenantId: string;
  actorId: string;
  action: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
};

const retrievalConfigSchema = z
  .object({
    minScore: z.number().min(0).max(1).optional(),
    maxResults: z.number().int().min(1).max(10).optional()
  })
  .refine((data) => data.minScore !== undefined || data.maxResults !== undefined, {
    message: "retrieval_config_requires_field",
    path: ["minScore"]
  });

const agentSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1),
  basePrompt: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  retrievalConfig: retrievalConfigSchema.optional()
});
type Agent = z.infer<typeof agentSchema> & {
  id: string;
  status: "draft" | "active";
  createdAt: string;
};

const agentSettingsUpdateSchema = z
  .object({
    basePrompt: z.string().min(1).optional(),
    model: z.string().min(1).optional(),
    retrievalConfig: retrievalConfigSchema.optional()
  })
  .refine(
    (data) =>
      data.basePrompt !== undefined ||
      data.model !== undefined ||
      data.retrievalConfig !== undefined,
    {
      message: "settings_required",
      path: ["basePrompt"]
    }
  );

const sourceSchema = z
  .object({
    agentId: z.string().min(1),
    type: z.enum(["website", "file", "text", "notion", "ticketing", "qa"]),
    value: z.string().min(1).optional(),
    config: z.record(z.unknown()).optional()
  })
  .refine((data) => data.value || data.config, {
    message: "value_or_config_required",
    path: ["value"]
  });
type Source = z.infer<typeof sourceSchema> & {
  id: string;
  status: "queued" | "processing" | "ready" | "failed";
  createdAt: string;
  lastSyncedAt?: string;
};

const channelTypeSchema = z.enum([
  "web_widget",
  "help_page",
  "slack",
  "whatsapp",
  "email",
  "messenger",
  "instagram",
  "zendesk",
  "salesforce",
  "shopify",
  "zapier",
  "wordpress",
  "voice_agent"
]);

const connectorChannelTypes = new Set([
  "slack",
  "whatsapp",
  "email",
  "messenger",
  "instagram",
  "zendesk",
  "salesforce",
  "shopify",
  "zapier",
  "wordpress",
  "voice_agent"
]);

const channelSchema = z
  .object({
    agentId: z.string().min(1),
    type: channelTypeSchema,
    config: z.record(z.unknown()).optional(),
    enabled: z.boolean().optional()
  })
  .superRefine((data, ctx) => {
    if (!connectorChannelTypes.has(data.type)) {
      return;
    }
    const authToken =
      data.config && typeof data.config.authToken === "string"
        ? data.config.authToken.trim()
        : "";
    if (!authToken) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "auth_token_required",
        path: ["config", "authToken"]
      });
    }
  });

const channelUpdateSchema = z.object({
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional()
});

type Channel = z.infer<typeof channelSchema> & {
  id: string;
  enabled: boolean;
  createdAt: string;
  config?: ChannelConfig;
};

type ChannelConfig = Record<string, unknown> & {
  allowedDomains?: string[];
  authToken?: string;
  verifyToken?: string;
  voiceLocale?: string;
  voiceName?: string;
  speakingRate?: number;
  twilioAccountSid?: string;
  twilioAuthToken?: string;
  twilioApiKeySid?: string;
  twilioApiKeySecret?: string;
  twilioFromNumber?: string;
  twilioWebhookBaseUrl?: string;
  twilioInitialPrompt?: string;
  twilioReprompt?: string;
  twilioLanguage?: string;
  twilioVoice?: string;
  twilioValidateSignature?: boolean;
  twilioRealtimeEnabled?: boolean;
  twilioRealtimeVoice?: string;
  twilioRealtimeInstructions?: string;
};

type InboundMessage = {
  message: string;
  userId?: string;
  threadKey?: string;
  metadata?: Record<string, unknown>;
};

type WebhookParseResult =
  | { kind: "message"; message: InboundMessage }
  | { kind: "challenge"; challenge: string }
  | { kind: "ignored" }
  | { kind: "error"; error: string };

const actionTypeSchema = z.enum([
  "human_escalation",
  "web_search",
  "slack_notify",
  "ticket_create",
  "lead_capture",
  "schedule",
  "billing",
  "stripe_billing",
  "stripe_subscription",
  "stripe_refund",
  "calendly_schedule",
  "calcom_schedule",
  "salesforce_ticket",
  "shopify_action",
  "custom_api"
]);

const actionSchema = z.object({
  agentId: z.string().min(1),
  type: actionTypeSchema,
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional()
});

const actionExecutionStatusSchema = z.enum(["success", "failed"]);

type Action = z.infer<typeof actionSchema> & {
  id: string;
  enabled: boolean;
  createdAt: string;
  config?: Record<string, unknown>;
};

type ActionExecution = {
  id: string;
  actionId: string;
  type: z.infer<typeof actionTypeSchema>;
  status: z.infer<typeof actionExecutionStatusSchema>;
  input: Record<string, unknown>;
  output?: Record<string, unknown>;
  error?: string;
  createdAt: string;
};

const conversationStatusSchema = z.enum(["open", "closed", "escalated"]);

const conversationSchema = z.object({
  agentId: z.string().min(1),
  channelId: z.string().min(1).optional(),
  userId: z.string().min(1).optional()
});

type Conversation = z.infer<typeof conversationSchema> & {
  id: string;
  status: z.infer<typeof conversationStatusSchema>;
  startedAt: string;
  endedAt?: string;
};

const metricEventTypeSchema = z.enum([
  "conversation_started",
  "conversation_resolved",
  "conversation_escalated",
  "message_sent",
  "feedback_received",
  "retrieval_performed",
  "action_executed",
  "ingestion_completed"
]);

const metricEventInputSchema = z
  .object({
    type: metricEventTypeSchema,
    tenantId: z.string().min(1).optional(),
    agentId: z.string().min(1).optional(),
    channelId: z.string().min(1).optional(),
    conversationId: z.string().min(1).optional(),
    timestamp: z.string().datetime().optional(),
    value: z.number().optional(),
    metadata: z.record(z.unknown()).optional()
  })
  .refine((data) => data.tenantId || data.agentId || data.channelId, {
    message: "metric_scope_required",
    path: ["tenantId"]
  });

type MetricEvent = Omit<z.infer<typeof metricEventInputSchema>, "timestamp"> & {
  id: string;
  timestamp: string;
};

const slackConfigSchema = z.object({
  channel: z.string().min(1),
  fallbackChannel: z.string().min(1).optional()
});

const slackPayloadSchema = z.object({
  message: z.string().min(1),
  metadata: z.record(z.unknown()).optional(),
  useFallback: z.boolean().optional()
});

const ticketConfigSchema = z.object({
  provider: z.enum(["zendesk", "salesforce", "freshdesk", "custom"]).optional(),
  defaultPriority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  defaultTags: z.array(z.string().min(1)).optional()
});

const ticketPayloadSchema = z.object({
  subject: z.string().min(1),
  description: z.string().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  requester: z
    .object({
      name: z.string().min(1),
      email: z.string().email().optional()
    })
    .optional(),
  tags: z.array(z.string().min(1)).optional()
});

const billingConfigSchema = z.object({
  currency: z.string().min(3).max(3).optional(),
  defaultAmount: z.number().positive().optional(),
  allowCustomAmount: z.boolean().optional()
});

const billingPayloadSchema = z.object({
  customerId: z.string().min(1),
  amount: z.number().positive().optional(),
  currency: z.string().min(3).max(3).optional(),
  description: z.string().min(1).optional()
});

const subscriptionPayloadSchema = z.object({
  customerId: z.string().min(1),
  priceId: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  trialDays: z.number().int().nonnegative().optional(),
  action: z.enum(["create", "cancel", "retrieve"]),
  subscriptionId: z.string().min(1).optional(),
  cancelAtPeriodEnd: z.boolean().optional()
});

const refundPayloadSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.number().positive().optional(),
  reason: z.enum(["duplicate", "fraudulent", "requested_by_customer"]).optional()
});

const notionSourceSchema = z.object({
  agentId: z.string().min(1),
  workspaceId: z.string().min(1),
  accessToken: z.string().min(1),
  pageIds: z.array(z.string().min(1)).optional(),
  databaseIds: z.array(z.string().min(1)).optional(),
  autoRetrain: z.boolean().optional()
});

const crawlConfigSchema = z.object({
  agentId: z.string().min(1),
  startUrls: z.array(z.string().url()).min(1),
  sitemapUrl: z.string().url().optional(),
  includePaths: z.array(z.string().min(1)).optional(),
  excludePaths: z.array(z.string().min(1)).optional(),
  depthLimit: z.number().int().min(1).max(10).optional()
});

const fileIngestionSchema = z.object({
  agentId: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1).optional(),
  sizeBytes: z.number().int().positive().optional()
});

const textIngestionSchema = z
  .object({
    text: z.string().min(1),
    chunkSize: z.number().int().min(5).max(1000).optional(),
    chunkOverlap: z.number().int().min(0).max(500).optional(),
    metadata: z.record(z.unknown()).optional()
  })
  .refine((data) => {
    if (data.chunkOverlap === undefined || data.chunkSize === undefined) {
      return true;
    }
    return data.chunkOverlap < data.chunkSize;
  }, {
    message: "chunk_overlap_must_be_less_than_chunk_size",
    path: ["chunkOverlap"]
  });

const jobIngestionSchema = z
  .object({
    documents: z
      .array(
        z.object({
          content: z.string().min(1),
          metadata: z.record(z.unknown()).optional()
        })
      )
      .min(1),
    chunkSize: z.number().int().min(5).max(1000).optional(),
    chunkOverlap: z.number().int().min(0).max(500).optional(),
    metadata: z.record(z.unknown()).optional()
  })
  .refine((data) => {
    if (data.chunkOverlap === undefined || data.chunkSize === undefined) {
      return true;
    }
    return data.chunkOverlap < data.chunkSize;
  }, {
    message: "chunk_overlap_must_be_less_than_chunk_size",
    path: ["chunkOverlap"]
  });

const ingestionJobStatusSchema = z.enum([
  "queued",
  "processing",
  "complete",
  "failed"
]);

const ingestionJobKindSchema = z.enum([
  "crawl",
  "file",
  "notion",
  "text",
  "qa",
  "retrain",
  "action"
]);

const ingestionJobErrorSchema = z.object({
  message: z.string().min(1),
  transient: z.boolean(),
  attempts: z.number().int().nonnegative(),
  at: z.string()
});

const ingestionJobSchema = z.object({
  id: z.string().min(1),
  sourceId: z.string().min(1),
  kind: ingestionJobKindSchema,
  status: ingestionJobStatusSchema,
  createdAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  durationMs: z.number().optional(),
  slaMet: z.boolean().optional(),
  attempts: z.number().int().nonnegative().optional(),
  maxAttempts: z.number().int().positive().optional(),
  nextAttemptAt: z.string().optional(),
  lastError: ingestionJobErrorSchema.optional()
});

type IngestionJob = z.infer<typeof ingestionJobSchema>;

const tenantQuotaUsageSchema = z.object({
  tenantId: z.string().min(1),
  used: z.number().int().min(0),
  periodStart: z.string(),
  quotaLimit: z.number().int().positive().optional()
});

type TenantQuotaUsage = z.infer<typeof tenantQuotaUsageSchema>;

const durableRuntimeStateSchema = z.object({
  ingestionJobs: z.array(ingestionJobSchema).default([]),
  metricEvents: z
    .array(
      z.object({
        id: z.string().min(1),
        type: metricEventTypeSchema,
        tenantId: z.string().min(1).optional(),
        agentId: z.string().min(1).optional(),
        channelId: z.string().min(1).optional(),
        conversationId: z.string().min(1).optional(),
        timestamp: z.string(),
        value: z.number().optional(),
        metadata: z.record(z.unknown()).optional()
      })
    )
    .default([]),
  auditEvents: z
    .array(
      z.object({
        id: z.string().min(1),
        tenantId: z.string().min(1),
        actorId: z.string().min(1),
        action: z.string().min(1),
        targetId: z.string().min(1).optional(),
        metadata: z.record(z.unknown()).optional(),
        createdAt: z.string()
      })
    )
    .default([]),
  tenantQuotaUsage: z
    .array(tenantQuotaUsageSchema)
    .default([])
});

type DurableRuntimeState = z.infer<typeof durableRuntimeStateSchema>;

const emptyDurableRuntimeState = (): DurableRuntimeState => ({
  ingestionJobs: [],
  metricEvents: [],
  auditEvents: [],
  tenantQuotaUsage: []
});

const loadDurableRuntimeState = async (
  filePath: string
): Promise<DurableRuntimeState> => {
  try {
    const data = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(data) as unknown;
    const result = durableRuntimeStateSchema.safeParse(parsed);
    return result.success ? result.data : emptyDurableRuntimeState();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return emptyDurableRuntimeState();
    }
    return emptyDurableRuntimeState();
  }
};

const persistDurableRuntimeState = async (
  filePath: string,
  state: DurableRuntimeState
) => {
  // Guard the whole read-merge-write with a cross-process lock so the
  // API and worker cannot clobber each other's ingestion-job writes. Both
  // processes mutate `ingestionJobs`: the API creates them on source
  // submission, the worker transitions their status. Inside the lock we
  // re-read the current on-disk state and merge by job id, preferring the
  // entry with the most progressed state (by status rank, then latest
  // activity timestamp). Other fields (metrics/quota/audit) are only
  // written by the API, so the snapshot values win for those.
  await withFileLock(runtimeStateLockPath(filePath), async () => {
    let merged = state;
    try {
      const existingRaw = await fs.readFile(filePath, "utf8");
      const existing = JSON.parse(existingRaw) as Partial<DurableRuntimeState>;
      if (Array.isArray(existing.ingestionJobs)) {
        const statusRank: Record<string, number> = {
          queued: 0,
          processing: 1,
          failed: 2,
          complete: 3
        };
        type JobEntry = DurableRuntimeState["ingestionJobs"][number];
        const jobActivity = (job: JobEntry) =>
          job.completedAt ?? job.nextAttemptAt ?? job.startedAt ?? job.createdAt ?? "";
        const isMoreProgressed = (a: JobEntry, b: JobEntry) => {
          const ra = statusRank[a.status] ?? 0;
          const rb = statusRank[b.status] ?? 0;
          if (ra !== rb) return ra > rb;
          const aa = jobActivity(a);
          const ba = jobActivity(b);
          if (aa !== ba) return aa > ba;
          return (a.attempts ?? 0) > (b.attempts ?? 0);
        };
        const byId = new Map<string, JobEntry>();
        for (const job of state.ingestionJobs) {
          byId.set(job.id, job);
        }
        for (const job of existing.ingestionJobs as JobEntry[]) {
          const current = byId.get(job.id);
          if (!current || isMoreProgressed(job, current)) {
            byId.set(job.id, job);
          }
        }
        merged = { ...state, ingestionJobs: Array.from(byId.values()) };
      }
    } catch (error) {
      // Missing or unparseable file: fall back to the in-memory snapshot.
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        // Swallow parse errors but do not overwrite job state on them —
        // the next write will repair the file.
      }
    }
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(tmpPath, JSON.stringify(merged), "utf8");
    await fs.rename(tmpPath, filePath);
  });
};

type RuntimePersistRetryOptions = {
  maxRetries?: number;
  backoffMs?: number;
  maxBackoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
};

type RuntimeStateCapOptions = {
  maxMetricEvents?: number;
  maxAuditEvents?: number;
};

type RuntimePersistenceObservability = {
  queueDepth: number;
  peakQueueDepth: number;
  writeAttempts: number;
  retryAttempts: number;
  failedAttempts: number;
  failedSnapshots: number;
  persistedSnapshots: number;
  lastWriteLatencyMs: number | null;
  totalWriteLatencyMs: number;
  lastFailureAt?: string;
  lastFailureMessage?: string;
};

type ChatCompletionProviderInput = {
  prompt: string;
  model?: string;
};

type ChatCompletionProvider = (
  input: ChatCompletionProviderInput
) => Promise<string>;

type AzureOpenAIProviderConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  model?: string;
  temperature: number;
  maxTokens: number;
};

type AzureOpenAIRealtimeConfig = {
  endpoint: string;
  apiKey: string;
  deployment: string;
  apiVersion: string;
  voice: string;
  instructions?: string;
  maxOutputTokens: number | "inf";
};

type TwilioRealtimeStreamToken = {
  channelId: string;
  expiresAt: number;
};

type TwilioCallRequest = {
  to: string;
  from: string;
  url: string;
};

type TwilioCallResult = {
  sid: string;
  status?: string;
  to?: string;
  from?: string;
};

type TwilioCallCreator = (
  input: TwilioCallRequest & {
    accountSid: string;
    authToken?: string;
    apiKeySid?: string;
    apiKeySecret?: string;
  }
) => Promise<TwilioCallResult>;

type BuildServerOptions = {
  vectorStoreDir?: string;
  runtimeStoreDir?: string;
  runtimeStatePersister?: (
    filePath: string,
    state: DurableRuntimeState
  ) => Promise<void>;
  runtimePersistRetry?: RuntimePersistRetryOptions;
  runtimeStateCaps?: RuntimeStateCapOptions;
  chatCompletionProvider?: ChatCompletionProvider;
  twilioCallCreator?: TwilioCallCreator;
};

const resolveNonNegativeInt = (value: number | string | undefined, fallback: number) => {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed < 0) {
    return fallback;
  }
  return Math.floor(parsed);
};

const resolvePositiveInt = (value: number | string | undefined, fallback: number) => {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }
  return Math.floor(parsed);
};

const resolveNumberWithinRange = (
  value: number | string | undefined,
  fallback: number,
  min: number,
  max: number
) => {
  const parsed = Number(value ?? "");
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, parsed));
};

const getTrimmedValue = (value: string | undefined) => {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const parseBooleanValue = (value: unknown): boolean | undefined => {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return undefined;
};

const MODEL_PROVIDER_AZURE_OPENAI = "azure_openai";
const DEFAULT_AZURE_OPENAI_API_VERSION = "2024-10-21";
const DEFAULT_AZURE_OPENAI_TEMPERATURE = 0.2;
const DEFAULT_AZURE_OPENAI_MAX_TOKENS = 450;
const DEFAULT_AZURE_OPENAI_REALTIME_VOICE = "alloy";
const DEFAULT_AZURE_OPENAI_REALTIME_MAX_OUTPUT_TOKENS = 1024;
const DEFAULT_TWILIO_REALTIME_STREAM_TOKEN_TTL_MS = 5 * 60 * 1000;

const resolveAzureOpenAIProviderConfig = (): AzureOpenAIProviderConfig | undefined => {
  const provider = getTrimmedValue(process.env.MODEL_PROVIDER)?.toLowerCase();
  if (!provider || provider !== MODEL_PROVIDER_AZURE_OPENAI) {
    return undefined;
  }
  const endpoint = getTrimmedValue(process.env.AZURE_OPENAI_ENDPOINT);
  const apiKey = getTrimmedValue(process.env.AZURE_OPENAI_API_KEY);
  const deployment = getTrimmedValue(process.env.AZURE_OPENAI_DEPLOYMENT);
  const model = getTrimmedValue(process.env.AZURE_OPENAI_MODEL);
  const apiVersion =
    getTrimmedValue(process.env.AZURE_OPENAI_API_VERSION) ??
    DEFAULT_AZURE_OPENAI_API_VERSION;
  const missing: string[] = [];
  if (!endpoint) {
    missing.push("AZURE_OPENAI_ENDPOINT");
  }
  if (!apiKey) {
    missing.push("AZURE_OPENAI_API_KEY");
  }
  if (!deployment) {
    missing.push("AZURE_OPENAI_DEPLOYMENT");
  }
  if (missing.length > 0) {
    throw new Error(
      `missing_azure_openai_configuration:${missing.join(",")}`
    );
  }
  const azureEndpoint = endpoint;
  const azureApiKey = apiKey;
  const azureDeployment = deployment;
  if (!azureEndpoint || !azureApiKey || !azureDeployment) {
    throw new Error("invalid_azure_openai_configuration");
  }
  const temperature = resolveNumberWithinRange(
    process.env.AZURE_OPENAI_TEMPERATURE,
    DEFAULT_AZURE_OPENAI_TEMPERATURE,
    0,
    2
  );
  const maxTokens = Math.max(
    1,
    resolveNonNegativeInt(
      process.env.AZURE_OPENAI_MAX_TOKENS,
      DEFAULT_AZURE_OPENAI_MAX_TOKENS
    )
  );
  return {
    endpoint: azureEndpoint,
    apiKey: azureApiKey,
    deployment: azureDeployment,
    apiVersion,
    model,
    temperature,
    maxTokens
  };
};

const resolveAzureOpenAIRealtimeConfig = (): AzureOpenAIRealtimeConfig | undefined => {
  const provider = getTrimmedValue(process.env.MODEL_PROVIDER)?.toLowerCase();
  if (!provider || provider !== MODEL_PROVIDER_AZURE_OPENAI) {
    return undefined;
  }
  const endpoint = getTrimmedValue(process.env.AZURE_OPENAI_ENDPOINT);
  const apiKey = getTrimmedValue(process.env.AZURE_OPENAI_API_KEY);
  const deployment =
    getTrimmedValue(process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT) ??
    getTrimmedValue(process.env.AZURE_OPENAI_DEPLOYMENT);
  if (!endpoint || !apiKey || !deployment) {
    return undefined;
  }
  const apiVersion =
    getTrimmedValue(process.env.AZURE_OPENAI_API_VERSION) ??
    DEFAULT_AZURE_OPENAI_API_VERSION;
  const voice =
    getTrimmedValue(process.env.AZURE_OPENAI_REALTIME_VOICE) ??
    DEFAULT_AZURE_OPENAI_REALTIME_VOICE;
  const instructions = getTrimmedValue(process.env.AZURE_OPENAI_REALTIME_INSTRUCTIONS);
  const maxOutputTokensRaw = getTrimmedValue(
    process.env.AZURE_OPENAI_REALTIME_MAX_OUTPUT_TOKENS
  );
  let maxOutputTokens: number | "inf" = DEFAULT_AZURE_OPENAI_REALTIME_MAX_OUTPUT_TOKENS;
  if (maxOutputTokensRaw?.toLowerCase() === "inf") {
    maxOutputTokens = "inf";
  } else if (maxOutputTokensRaw) {
    maxOutputTokens = Math.min(
      Math.max(1, resolveNonNegativeInt(maxOutputTokensRaw, DEFAULT_AZURE_OPENAI_REALTIME_MAX_OUTPUT_TOKENS)),
      4096
    );
  }
  return {
    endpoint,
    apiKey,
    deployment,
    apiVersion,
    voice,
    instructions,
    maxOutputTokens
  };
};

const createAzureOpenAIChatCompletionProvider = (
  config: AzureOpenAIProviderConfig
): ChatCompletionProvider => {
  const normalizedEndpoint = config.endpoint.replace(/\/+$/u, "");
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: `${normalizedEndpoint}/openai/deployments/${config.deployment}`,
    defaultQuery: { "api-version": config.apiVersion },
    defaultHeaders: { "api-key": config.apiKey }
  });
  return async (input) => {
    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      {
        role: "system",
        content:
          "You are a helpful support assistant for a Norwegian business. " +
          "Answer concisely and rely on provided context. " +
          "If context does not answer the question, clearly state uncertainty and suggest escalation."
      },
      {
        role: "user",
        content: input.prompt
      }
    ];
    const model = input.model?.trim() || config.model || config.deployment;
    const requestCompletion = (maxCompletionTokens: number) =>
      client.chat.completions.create({
        model,
        temperature: config.temperature,
        max_completion_tokens: maxCompletionTokens,
        messages
      });

    let completion: Awaited<ReturnType<typeof requestCompletion>>;
    try {
      completion = await requestCompletion(config.maxTokens);
    } catch (error) {
      const status =
        isRecord(error) && typeof error.status === "number" ? error.status : undefined;
      const message = error instanceof Error ? error.message : String(error);
      const shouldRetryWithHigherOutputBudget =
        status === 400 &&
        /max_tokens|model output limit was reached/iu.test(message);
      if (!shouldRetryWithHigherOutputBudget) {
        throw error;
      }
      const retryMaxCompletionTokens = Math.min(
        Math.max(config.maxTokens * 2, config.maxTokens + 256),
        4096
      );
      completion = await requestCompletion(retryMaxCompletionTokens);
    }
    const content = completion.choices[0]?.message?.content;
    if (typeof content === "string") {
      const text = content.trim();
      if (text.length > 0) {
        return text;
      }
    }
    if (Array.isArray(content)) {
      const textParts: string[] = [];
      for (const part of content) {
        if (!isRecord(part)) {
          continue;
        }
        const isTextPart = part.type === "text";
        const text = part.text;
        if (!isTextPart || typeof text !== "string") {
          continue;
        }
        const normalized = text.trim();
        if (normalized.length > 0) {
          textParts.push(normalized);
        }
      }
      if (textParts.length > 0) {
        return textParts.join(" ");
      }
    }
    throw new Error("model_empty_response");
  };
};

const createAzureOpenAIRealtimeSocket = async (
  config: AzureOpenAIRealtimeConfig
) => {
  const client = new AzureOpenAI({
    endpoint: config.endpoint,
    apiKey: config.apiKey,
    apiVersion: config.apiVersion,
    deployment: config.deployment
  });
  const realtime = await OpenAIRealtimeWS.azure(client, {
    deploymentName: config.deployment
  });
  await new Promise<void>((resolve, reject) => {
    const onOpen = () => {
      realtime.socket.off("error", onError);
      resolve();
    };
    const onError = (error: Error) => {
      realtime.socket.off("open", onOpen);
      reject(error);
    };
    realtime.socket.once("open", onOpen);
    realtime.socket.once("error", onError);
  });
  return realtime;
};

const issueTwilioRealtimeStreamToken = (input: {
  tokens: Map<string, TwilioRealtimeStreamToken>;
  channelId: string;
}) => {
  const now = Date.now();
  for (const [token, session] of input.tokens) {
    if (session.expiresAt <= now) {
      input.tokens.delete(token);
    }
  }
  const token = crypto.randomUUID().replace(/-/gu, "");
  input.tokens.set(token, {
    channelId: input.channelId,
    expiresAt: now + DEFAULT_TWILIO_REALTIME_STREAM_TOKEN_TTL_MS
  });
  return token;
};

const consumeTwilioRealtimeStreamToken = (input: {
  tokens: Map<string, TwilioRealtimeStreamToken>;
  token: string;
  channelId: string;
}) => {
  const now = Date.now();
  for (const [storedToken, session] of input.tokens) {
    if (session.expiresAt <= now) {
      input.tokens.delete(storedToken);
    }
  }
  const session = input.tokens.get(input.token);
  if (!session || session.channelId !== input.channelId) {
    return false;
  }
  input.tokens.delete(input.token);
  return true;
};

const normalizeAllowedDomain = (domain: string) => {
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  const isWildcard = trimmed.startsWith("*.");
  const rawHost = isWildcard ? trimmed.slice(2) : trimmed;
  let host = rawHost;
  try {
    if (rawHost.includes("://")) {
      host = new URL(rawHost).hostname;
    } else {
      host = rawHost.replace(/\/.*$/u, "");
    }
  } catch {
    return null;
  }
  host = host.replace(/:\d+$/u, "");
  if (!host) {
    return null;
  }
  return isWildcard ? `*.${host}` : host;
};

const normalizeAllowedDomains = (domains?: string[]) => {
  if (!domains || domains.length === 0) {
    return [];
  }
  const normalized = domains
    .map((domain) => normalizeAllowedDomain(domain))
    .filter((domain): domain is string => Boolean(domain));
  return Array.from(new Set(normalized));
};

const normalizeChannelConfig = (
  config?: Record<string, unknown>
): ChannelConfig => {
  if (!config) {
    return {};
  }
  const allowedDomains = Array.isArray(config.allowedDomains)
    ? config.allowedDomains.filter((item): item is string => typeof item === "string")
    : undefined;
  const authToken =
    typeof config.authToken === "string" ? config.authToken.trim() : undefined;
  const verifyToken =
    typeof config.verifyToken === "string" ? config.verifyToken.trim() : undefined;
  const voiceLocale =
    typeof config.voiceLocale === "string" ? config.voiceLocale.trim() : undefined;
  const voiceName =
    typeof config.voiceName === "string" ? config.voiceName.trim() : undefined;
  const speakingRateRaw =
    typeof config.speakingRate === "number" ? config.speakingRate : undefined;
  const speakingRate =
    speakingRateRaw !== undefined && Number.isFinite(speakingRateRaw)
      ? Math.max(0.5, Math.min(2, speakingRateRaw))
      : undefined;
  const twilioAccountSid =
    typeof config.twilioAccountSid === "string"
      ? config.twilioAccountSid.trim()
      : undefined;
  const twilioAuthToken =
    typeof config.twilioAuthToken === "string"
      ? config.twilioAuthToken.trim()
      : undefined;
  const twilioApiKeySid =
    typeof config.twilioApiKeySid === "string"
      ? config.twilioApiKeySid.trim()
      : undefined;
  const twilioApiKeySecret =
    typeof config.twilioApiKeySecret === "string"
      ? config.twilioApiKeySecret.trim()
      : undefined;
  const twilioFromNumber =
    typeof config.twilioFromNumber === "string"
      ? config.twilioFromNumber.trim()
      : undefined;
  const twilioWebhookBaseUrl =
    typeof config.twilioWebhookBaseUrl === "string"
      ? config.twilioWebhookBaseUrl.trim()
      : undefined;
  const twilioInitialPrompt =
    typeof config.twilioInitialPrompt === "string"
      ? config.twilioInitialPrompt.trim()
      : undefined;
  const twilioReprompt =
    typeof config.twilioReprompt === "string"
      ? config.twilioReprompt.trim()
      : undefined;
  const twilioLanguage =
    typeof config.twilioLanguage === "string"
      ? config.twilioLanguage.trim()
      : undefined;
  const twilioVoice =
    typeof config.twilioVoice === "string" ? config.twilioVoice.trim() : undefined;
  const twilioValidateSignature = parseBooleanValue(config.twilioValidateSignature);
  const twilioRealtimeEnabled = parseBooleanValue(config.twilioRealtimeEnabled);
  const twilioRealtimeVoice =
    typeof config.twilioRealtimeVoice === "string"
      ? config.twilioRealtimeVoice.trim()
      : undefined;
  const twilioRealtimeInstructions =
    typeof config.twilioRealtimeInstructions === "string"
      ? config.twilioRealtimeInstructions.trim()
      : undefined;
  return {
    ...config,
    allowedDomains: normalizeAllowedDomains(allowedDomains),
    authToken: authToken || undefined,
    verifyToken: verifyToken || undefined,
    voiceLocale: voiceLocale || undefined,
    voiceName: voiceName || undefined,
    speakingRate,
    twilioAccountSid: twilioAccountSid || undefined,
    twilioAuthToken: twilioAuthToken || undefined,
    twilioApiKeySid: twilioApiKeySid || undefined,
    twilioApiKeySecret: twilioApiKeySecret || undefined,
    twilioFromNumber: twilioFromNumber || undefined,
    twilioWebhookBaseUrl: twilioWebhookBaseUrl || undefined,
    twilioInitialPrompt: twilioInitialPrompt || undefined,
    twilioReprompt: twilioReprompt || undefined,
    twilioLanguage: twilioLanguage || undefined,
    twilioVoice: twilioVoice || undefined,
    twilioValidateSignature,
    twilioRealtimeEnabled,
    twilioRealtimeVoice: twilioRealtimeVoice || undefined,
    twilioRealtimeInstructions: twilioRealtimeInstructions || undefined
  };
};

const DEFAULT_VOICE_LOCALE = "nb-NO";
const DEFAULT_VOICE_NAME = "nb-NO-Standard-A";
const DEFAULT_VOICE_SPEAKING_RATE = 1;

const escapeXml = (value: string) =>
  value
    .replace(/&/gu, "&amp;")
    .replace(/</gu, "&lt;")
    .replace(/>/gu, "&gt;")
    .replace(/"/gu, "&quot;")
    .replace(/'/gu, "&apos;");

const buildVoiceSsml = (input: {
  text: string;
  locale: string;
  voiceName: string;
  speakingRate: number;
}) => {
  const speakingRatePercent = Math.round(input.speakingRate * 100);
  return (
    `<speak version="1.0" xml:lang="${escapeXml(input.locale)}">` +
    `<voice name="${escapeXml(input.voiceName)}">` +
    `<prosody rate="${speakingRatePercent}%">${escapeXml(input.text)}</prosody>` +
    "</voice></speak>"
  );
};

const buildVoiceReplyPayload = (response: ChatResponse, channel: Channel) => {
  const voiceLocale = channel.config?.voiceLocale ?? DEFAULT_VOICE_LOCALE;
  const voiceName = channel.config?.voiceName ?? DEFAULT_VOICE_NAME;
  const speakingRate = channel.config?.speakingRate ?? DEFAULT_VOICE_SPEAKING_RATE;
  return {
    ...response,
    speech: {
      text: response.message,
      ssml: buildVoiceSsml({
        text: response.message,
        locale: voiceLocale,
        voiceName,
        speakingRate
      }),
      voice: {
        locale: voiceLocale,
        name: voiceName,
        speakingRate
      }
    }
  };
};

const pickFirstString = (...values: Array<unknown>) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim().length > 0) {
      return value;
    }
  }
  return undefined;
};

type TwilioChannelSettings = {
  accountSid?: string;
  authToken?: string;
  apiKeySid?: string;
  apiKeySecret?: string;
  fromNumber?: string;
  webhookBaseUrl?: string;
  initialPrompt: string;
  reprompt: string;
  language: string;
  voice?: string;
  validateSignature: boolean;
  realtimeEnabled: boolean;
  realtimeVoice?: string;
  realtimeInstructions?: string;
};

const DEFAULT_TWILIO_LANGUAGE = "nb-NO";
const DEFAULT_TWILIO_INITIAL_PROMPT = "Hei! Hvordan kan jeg hjelpe deg i dag?";
const DEFAULT_TWILIO_REPROMPT = "Kan jeg hjelpe deg med noe mer?";

const getHeaderString = (value: unknown) => {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.find((item): item is string => typeof item === "string");
  }
  return undefined;
};

const resolveExternalBaseUrl = (input: {
  headers: Record<string, unknown>;
  fallbackProtocol?: string;
  configuredBaseUrl?: string;
}) => {
  const configured = getTrimmedValue(input.configuredBaseUrl);
  if (configured) {
    return configured.replace(/\/+$/u, "");
  }
  const hostHeader = pickFirstString(
    getHeaderString(input.headers["x-forwarded-host"]),
    getHeaderString(input.headers.host)
  );
  if (!hostHeader) {
    return undefined;
  }
  const protocol =
    pickFirstString(
      getHeaderString(input.headers["x-forwarded-proto"]),
      input.fallbackProtocol
    ) ?? "https";
  const normalizedProtocol = protocol.split(",")[0]?.trim() || "https";
  const normalizedHost = hostHeader.split(",")[0]?.trim();
  if (!normalizedHost) {
    return undefined;
  }
  return `${normalizedProtocol}://${normalizedHost}`;
};

const buildExternalUrl = (input: {
  routePath: string;
  headers: Record<string, unknown>;
  fallbackProtocol?: string;
  configuredBaseUrl?: string;
}) => {
  const baseUrl = resolveExternalBaseUrl(input);
  if (!baseUrl) {
    return undefined;
  }
  const routePath = input.routePath.startsWith("/")
    ? input.routePath
    : `/${input.routePath}`;
  return `${baseUrl}${routePath}`;
};

const resolveTwilioChannelSettings = (channel: Channel): TwilioChannelSettings => {
  const accountSid = getTrimmedValue(
    channel.config?.twilioAccountSid ?? process.env.TWILIO_ACCOUNT_SID
  );
  const authToken = getTrimmedValue(
    channel.config?.twilioAuthToken ?? process.env.TWILIO_AUTH_TOKEN
  );
  const apiKeySid = getTrimmedValue(
    channel.config?.twilioApiKeySid ?? process.env.TWILIO_API_KEY_SID
  );
  const apiKeySecret = getTrimmedValue(
    channel.config?.twilioApiKeySecret ?? process.env.TWILIO_API_KEY_SECRET
  );
  const fromNumber = getTrimmedValue(
    channel.config?.twilioFromNumber ?? process.env.TWILIO_FROM_NUMBER
  );
  const webhookBaseUrl = getTrimmedValue(
    channel.config?.twilioWebhookBaseUrl ?? process.env.TWILIO_WEBHOOK_BASE_URL
  );
  const initialPrompt =
    getTrimmedValue(channel.config?.twilioInitialPrompt) ??
    DEFAULT_TWILIO_INITIAL_PROMPT;
  const reprompt =
    getTrimmedValue(channel.config?.twilioReprompt) ??
    DEFAULT_TWILIO_REPROMPT;
  const language =
    getTrimmedValue(channel.config?.twilioLanguage) ??
    channel.config?.voiceLocale ??
    DEFAULT_TWILIO_LANGUAGE;
  const voice = getTrimmedValue(channel.config?.twilioVoice);
  const validateSignature =
    parseBooleanValue(
      channel.config?.twilioValidateSignature ??
        process.env.TWILIO_VALIDATE_SIGNATURE
    ) ?? true;
  const realtimeEnabled =
    parseBooleanValue(
      channel.config?.twilioRealtimeEnabled ?? process.env.TWILIO_REALTIME_ENABLED
    ) ?? false;
  const realtimeVoice =
    getTrimmedValue(channel.config?.twilioRealtimeVoice) ??
    getTrimmedValue(process.env.TWILIO_REALTIME_VOICE) ??
    getTrimmedValue(process.env.AZURE_OPENAI_REALTIME_VOICE);
  const realtimeInstructions = getTrimmedValue(
    channel.config?.twilioRealtimeInstructions ??
      process.env.TWILIO_REALTIME_INSTRUCTIONS
  );
  return {
    accountSid,
    authToken,
    apiKeySid,
    apiKeySecret,
    fromNumber,
    webhookBaseUrl,
    initialPrompt,
    reprompt,
    language,
    voice,
    validateSignature,
    realtimeEnabled,
    realtimeVoice,
    realtimeInstructions
  };
};

const validateTwilioWebhookRequest = (input: {
  settings: TwilioChannelSettings;
  signature?: string;
  requestUrl: string;
  body: Record<string, unknown>;
}) => {
  if (!input.settings.validateSignature) {
    return true;
  }
  if (!input.signature || !input.settings.authToken) {
    return false;
  }
  const params: Record<string, string> = {};
  for (const [key, value] of Object.entries(input.body)) {
    if (value === undefined || value === null) {
      continue;
    }
    params[key] = String(value);
  }
  return twilio.validateRequest(
    input.settings.authToken,
    input.signature,
    input.requestUrl,
    params
  );
};

const createTwimlGatherResponse = (input: {
  prompt: string;
  actionUrl: string;
  language: string;
  voice?: string;
}) => {
  const voiceResponse = new twilio.twiml.VoiceResponse();
  const gatherAttributes: Record<string, string> = {
    input: "speech",
    speechTimeout: "auto",
    method: "POST",
    action: input.actionUrl,
    language: input.language
  };
  const sayAttributes: Record<string, string> = {
    language: input.language
  };
  if (input.voice) {
    sayAttributes.voice = input.voice;
  }

  const gather = voiceResponse.addChild("Gather", gatherAttributes);
  gather.addChild("Say", sayAttributes).addText(input.prompt);
  voiceResponse
    .addChild("Say", sayAttributes)
    .addText("Beklager, jeg horte ingenting. Ring gjerne igjen.");
  voiceResponse.hangup();
  return voiceResponse.toString();
};

const createTwimlRealtimeStreamResponse = (input: {
  streamUrl: string;
  prompt?: string;
  language?: string;
  voice?: string;
}) => {
  const voiceResponse = new twilio.twiml.VoiceResponse();
  const sayAttributes: Record<string, string> = {};
  if (input.language) {
    sayAttributes.language = input.language;
  }
  if (input.voice) {
    sayAttributes.voice = input.voice;
  }
  if (input.prompt) {
    voiceResponse.addChild("Say", sayAttributes).addText(input.prompt);
  }
  const connect = voiceResponse.addChild("Connect", {});
  connect.addChild("Stream", { url: input.streamUrl });
  return voiceResponse.toString();
};

const createTwilioCallWithSdk: TwilioCallCreator = async (input) => {
  let client:
    | ReturnType<typeof twilio>
    | undefined;
  if (input.apiKeySid && input.apiKeySecret) {
    client = twilio(input.apiKeySid, input.apiKeySecret, {
      accountSid: input.accountSid
    });
  } else if (input.authToken) {
    client = twilio(input.accountSid, input.authToken);
  }
  if (!client) {
    throw new Error("twilio_credentials_missing");
  }
  const call = await client.calls.create({
    to: input.to,
    from: input.from,
    url: input.url,
    method: "POST"
  });
  return {
    sid: call.sid,
    status: call.status,
    to: call.to,
    from: call.from
  };
};

const getAuthTokenFromHeaders = (headers: Record<string, unknown>) => {
  const authHeader = headers.authorization;
  if (typeof authHeader === "string") {
    const match = authHeader.match(/^Bearer\s+(.+)$/iu);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  const channelToken = headers["x-channel-token"];
  if (typeof channelToken === "string") {
    return channelToken.trim();
  }
  const ralphToken = headers["x-ralph-token"];
  if (typeof ralphToken === "string") {
    return ralphToken.trim();
  }
  return undefined;
};

const parseSlackWebhook = (payload: Record<string, unknown>): WebhookParseResult => {
  const type = getString(payload.type);
  if (type === "url_verification") {
    const challenge = getString(payload.challenge);
    if (!challenge) {
      return { kind: "error", error: "slack_challenge_missing" };
    }
    return { kind: "challenge", challenge };
  }
  const event = getRecord(payload.event);
  if (!event) {
    return { kind: "error", error: "slack_event_missing" };
  }
  const eventType = getString(event.type);
  if (!eventType) {
    return { kind: "error", error: "slack_event_type_missing" };
  }
  if (eventType !== "message" && eventType !== "app_mention") {
    return { kind: "ignored" };
  }
  const botId = getString(event.bot_id);
  if (botId) {
    return { kind: "ignored" };
  }
  const text = getString(event.text);
  if (!text) {
    return { kind: "error", error: "slack_message_missing" };
  }
  const userId = getString(event.user);
  const threadKey = pickFirstString(event.thread_ts, event.ts);
  return {
    kind: "message",
    message: {
      message: text,
      userId,
      threadKey,
      metadata: {
        slackEventId: getString(payload.event_id)
      }
    }
  };
};

const extractWhatsAppMessages = (payload: Record<string, unknown>) => {
  if (Array.isArray(payload.messages)) {
    return payload.messages.map((item) => getRecord(item)).filter(Boolean);
  }
  const entries = getArray(payload.entry);
  if (!entries) {
    return undefined;
  }
  for (const entry of entries) {
    const entryRecord = getRecord(entry);
    if (!entryRecord) {
      continue;
    }
    const changes = getArray(entryRecord.changes);
    if (!changes) {
      continue;
    }
    for (const change of changes) {
      const changeRecord = getRecord(change);
      const value = changeRecord ? getRecord(changeRecord.value) : undefined;
      const messages = value ? getArray(value.messages) : undefined;
      if (messages && messages.length > 0) {
        return messages.map((item) => getRecord(item)).filter(Boolean);
      }
    }
  }
  return undefined;
};

const parseWhatsAppWebhook = (payload: Record<string, unknown>): WebhookParseResult => {
  const messages = extractWhatsAppMessages(payload);
  const message = messages && messages.length > 0 ? messages[0] : undefined;
  if (!message) {
    return { kind: "error", error: "whatsapp_message_missing" };
  }
  const textRecord = getRecord(message.text);
  const text = pickFirstString(textRecord?.body, message.body);
  if (!text) {
    return { kind: "error", error: "whatsapp_text_missing" };
  }
  const userId = getString(message.from);
  const context = getRecord(message.context);
  const threadKey = pickFirstString(context?.id, userId);
  return {
    kind: "message",
    message: {
      message: text,
      userId,
      threadKey,
      metadata: {
        whatsappMessageId: getString(message.id)
      }
    }
  };
};

const parseEmailWebhook = (payload: Record<string, unknown>): WebhookParseResult => {
  const subject = pickFirstString(payload.subject, payload.Subject);
  const text = pickFirstString(
    payload.text,
    payload["stripped-text"],
    payload["body-plain"],
    payload.plain
  );
  const html = pickFirstString(payload.html, payload["body-html"]);
  const message = [subject, text ?? html].filter(Boolean).join("\n\n").trim();
  if (!message) {
    return { kind: "error", error: "email_message_missing" };
  }
  const from = pickFirstString(payload.from, payload.sender);
  const threadKey = pickFirstString(payload["message-id"], payload["in-reply-to"], from);
  return {
    kind: "message",
    message: {
      message,
      userId: from,
      threadKey,
      metadata: {
        subject
      }
    }
  };
};

const parseZendeskWebhook = (payload: Record<string, unknown>): WebhookParseResult => {
  const ticket =
    getRecord(payload.ticket) ??
    getRecord(payload.current_ticket) ??
    getRecord(getRecord(payload.event)?.ticket);
  if (!ticket) {
    return { kind: "error", error: "zendesk_ticket_missing" };
  }
  const subject = pickFirstString(ticket.subject, ticket.title);
  const description = pickFirstString(
    ticket.description,
    getRecord(ticket.comment)?.body
  );
  const message = [subject, description].filter(Boolean).join("\n\n").trim();
  if (!message) {
    return { kind: "error", error: "zendesk_message_missing" };
  }
  const requester = getRecord(ticket.requester);
  const userId = pickFirstString(requester?.email, requester?.name);
  const threadKey = pickFirstString(ticket.id, ticket.external_id);
  return {
    kind: "message",
    message: {
      message,
      userId,
      threadKey,
      metadata: {
        ticketId: ticket.id
      }
    }
  };
};

const parseSalesforceWebhook = (payload: Record<string, unknown>): WebhookParseResult => {
  const caseRecord =
    getRecord(payload.Case) ??
    getRecord(payload.case) ??
    getRecord(payload.record) ??
    payload;
  const subject = pickFirstString(caseRecord.Subject, caseRecord.subject);
  const description = pickFirstString(
    caseRecord.Description,
    caseRecord.description
  );
  const message = [subject, description].filter(Boolean).join("\n\n").trim();
  if (!message) {
    return { kind: "error", error: "salesforce_message_missing" };
  }
  const contact = getRecord(caseRecord.Contact) ?? getRecord(caseRecord.contact);
  const userId = pickFirstString(contact?.Email, contact?.email);
  const threadKey = pickFirstString(caseRecord.Id, caseRecord.id);
  return {
    kind: "message",
    message: {
      message,
      userId,
      threadKey,
      metadata: {
        caseId: caseRecord.Id ?? caseRecord.id
      }
    }
  };
};

const parseMessengerWebhook = (payload: Record<string, unknown>): WebhookParseResult => {
  const entries = getArray(payload.entry);
  if (!entries) {
    return { kind: "error", error: "messenger_entry_missing" };
  }
  for (const entry of entries) {
    const entryRecord = getRecord(entry);
    if (!entryRecord) {
      continue;
    }
    const events = getArray(entryRecord.messaging);
    if (!events) {
      continue;
    }
    for (const event of events) {
      const eventRecord = getRecord(event);
      if (!eventRecord) {
        continue;
      }
      const messageRecord = getRecord(eventRecord.message);
      const text = pickFirstString(messageRecord?.text, eventRecord.text);
      if (!text) {
        continue;
      }
      const senderRecord = getRecord(eventRecord.sender);
      const userId = pickFirstString(senderRecord?.id, senderRecord?.user_ref);
      const threadKey = pickFirstString(
        messageRecord?.mid,
        eventRecord.message_id,
        userId
      );
      return {
        kind: "message",
        message: {
          message: text,
          userId,
          threadKey,
          metadata: {
            messengerMessageId: messageRecord?.mid
          }
        }
      };
    }
  }
  return { kind: "error", error: "messenger_message_missing" };
};

const parseInstagramWebhook = (payload: Record<string, unknown>): WebhookParseResult => {
  const entries = getArray(payload.entry);
  if (!entries) {
    return { kind: "error", error: "instagram_entry_missing" };
  }
  for (const entry of entries) {
    const entryRecord = getRecord(entry);
    if (!entryRecord) {
      continue;
    }
    const messagingEvents = getArray(entryRecord.messaging);
    if (messagingEvents) {
      for (const event of messagingEvents) {
        const eventRecord = getRecord(event);
        if (!eventRecord) {
          continue;
        }
        const messageRecord = getRecord(eventRecord.message);
        const text = pickFirstString(messageRecord?.text, eventRecord.text);
        if (!text) {
          continue;
        }
        const senderRecord = getRecord(eventRecord.sender);
        const userId = pickFirstString(senderRecord?.id, senderRecord?.username);
        const threadKey = pickFirstString(
          messageRecord?.mid,
          eventRecord.message_id,
          userId
        );
        return {
          kind: "message",
          message: {
            message: text,
            userId,
            threadKey,
            metadata: {
              instagramMessageId: messageRecord?.mid
            }
          }
        };
      }
    }
    const changes = getArray(entryRecord.changes);
    if (!changes) {
      continue;
    }
    for (const change of changes) {
      const changeRecord = getRecord(change);
      const value = changeRecord ? getRecord(changeRecord.value) : undefined;
      const messages = value ? getArray(value.messages) : undefined;
      if (!messages) {
        continue;
      }
      for (const message of messages) {
        const messageRecord = getRecord(message);
        if (!messageRecord) {
          continue;
        }
        const text = pickFirstString(messageRecord.text);
        if (!text) {
          continue;
        }
        const userId = pickFirstString(messageRecord.from, messageRecord.username);
        const threadKey = pickFirstString(messageRecord.id, userId);
        return {
          kind: "message",
          message: {
            message: text,
            userId,
            threadKey,
            metadata: {
              instagramMessageId: messageRecord.id
            }
          }
        };
      }
    }
  }
  return { kind: "error", error: "instagram_message_missing" };
};

const parseShopifyWebhook = (payload: Record<string, unknown>): WebhookParseResult => {
  const customer = getRecord(payload.customer);
  const text = pickFirstString(
    payload.message,
    payload.note,
    payload.content,
    payload.body,
    payload.question
  );
  if (!text) {
    return { kind: "error", error: "shopify_message_missing" };
  }
  const userId = pickFirstString(
    customer?.email,
    customer?.id,
    payload.email,
    payload.customer_email
  );
  const threadKey = pickFirstString(
    payload.id,
    payload.order_id,
    payload.ticket_id,
    userId
  );
  return {
    kind: "message",
    message: {
      message: text,
      userId,
      threadKey,
      metadata: {
        shopifyId: payload.id
      }
    }
  };
};

const parseZapierWebhook = (payload: Record<string, unknown>): WebhookParseResult => {
  const text = pickFirstString(
    payload.message,
    payload.text,
    payload.content,
    payload.body
  );
  if (!text) {
    return { kind: "error", error: "zapier_message_missing" };
  }
  const userId = pickFirstString(payload.userId, payload.user_id, payload.email);
  const threadKey = pickFirstString(
    payload.threadKey,
    payload.thread_key,
    payload.id,
    userId
  );
  return {
    kind: "message",
    message: {
      message: text,
      userId,
      threadKey,
      metadata: {
        source: "zapier"
      }
    }
  };
};

const parseWordpressWebhook = (payload: Record<string, unknown>): WebhookParseResult => {
  const text = pickFirstString(
    payload.message,
    payload.content,
    payload.body,
    payload.comment,
    payload.question
  );
  if (!text) {
    return { kind: "error", error: "wordpress_message_missing" };
  }
  const userId = pickFirstString(
    payload.author_email,
    payload.email,
    payload.author,
    payload.userId
  );
  const threadKey = pickFirstString(
    payload.id,
    payload.comment_ID,
    payload.post_id,
    userId
  );
  return {
    kind: "message",
    message: {
      message: text,
      userId,
      threadKey,
      metadata: {
        wordpressId: payload.id
      }
    }
  };
};

const parseVoiceAgentWebhook = (payload: Record<string, unknown>): WebhookParseResult => {
  const input = getRecord(payload.input);
  const caller = getRecord(payload.caller);
  const metadata = getRecord(payload.metadata);
  const provider = pickFirstString(payload.provider);
  const transcript = pickFirstString(
    payload.transcript,
    payload.message,
    payload.text,
    input?.transcript,
    input?.message,
    input?.text
  );
  if (!transcript) {
    return { kind: "error", error: "voice_transcript_missing" };
  }
  const userId = pickFirstString(
    payload.userId,
    payload.user_id,
    payload.callerId,
    payload.caller_id,
    caller?.id,
    caller?.phone,
    caller?.number
  );
  const threadKey = pickFirstString(
    payload.sessionId,
    payload.session_id,
    payload.callId,
    payload.call_id,
    payload.conversationId,
    payload.conversation_id,
    payload.threadKey,
    payload.thread_key,
    userId
  );
  return {
    kind: "message",
    message: {
      message: transcript,
      userId,
      threadKey,
      metadata: {
        ...metadata,
        transcript,
        callId: pickFirstString(payload.callId, payload.call_id),
        sessionId: pickFirstString(payload.sessionId, payload.session_id),
        ...(provider ? { provider } : {})
      }
    }
  };
};

const parseChannelWebhookPayload = (
  channelType: z.infer<typeof channelTypeSchema>,
  payload: Record<string, unknown>
): WebhookParseResult => {
  switch (channelType) {
    case "slack":
      return parseSlackWebhook(payload);
    case "whatsapp":
      return parseWhatsAppWebhook(payload);
    case "email":
      return parseEmailWebhook(payload);
    case "messenger":
      return parseMessengerWebhook(payload);
    case "instagram":
      return parseInstagramWebhook(payload);
    case "zendesk":
      return parseZendeskWebhook(payload);
    case "salesforce":
      return parseSalesforceWebhook(payload);
    case "shopify":
      return parseShopifyWebhook(payload);
    case "zapier":
      return parseZapierWebhook(payload);
    case "wordpress":
      return parseWordpressWebhook(payload);
    case "voice_agent":
      return parseVoiceAgentWebhook(payload);
    default:
      return { kind: "error", error: "channel_not_supported" };
  }
};

const requireConnectorAuth = (
  channel: Channel,
  headers: Record<string, unknown>
) => {
  const authToken =
    channel.config && typeof channel.config.authToken === "string"
      ? channel.config.authToken
      : undefined;
  if (!authToken) {
    return { ok: false, statusCode: 403, error: "channel_auth_not_configured" };
  }
  const provided = getAuthTokenFromHeaders(headers);
  if (!provided || provided !== authToken) {
    return { ok: false, statusCode: 401, error: "channel_unauthorized" };
  }
  return { ok: true as const };
};

const getRequestOriginHost = (request: { headers: Record<string, unknown> }) => {
  const originHeader =
    (request.headers.origin as string | undefined) ??
    (request.headers.referer as string | undefined) ??
    (request.headers.referrer as string | undefined);
  if (!originHeader) {
    return null;
  }
  try {
    const url = new URL(originHeader);
    return url.hostname.toLowerCase();
  } catch {
    return null;
  }
};

const isDomainAllowed = (allowedDomains: string[], originHost: string) => {
  return allowedDomains.some((entry) => {
    if (entry.startsWith("*.")) {
      const suffix = entry.slice(2);
      return originHost === suffix || originHost.endsWith(`.${suffix}`);
    }
    return originHost === entry;
  });
};

const parseWithSchema = <T>(
  schema: z.ZodSchema<T>,
  value: unknown,
  errorCode: string
) => {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw createTypedError({
      code: errorCode,
      statusCode: 400,
      details: parsed.error.flatten()
    });
  }
  return parsed.data;
};

const normalizeActionConfig = (
  type: z.infer<typeof actionTypeSchema>,
  config?: Record<string, unknown>
) => {
  switch (type) {
    case "slack_notify":
      return parseWithSchema(slackConfigSchema, config ?? {}, "invalid_slack_config");
    case "ticket_create":
    case "salesforce_ticket":
    case "human_escalation":
      return parseWithSchema(ticketConfigSchema, config ?? {}, "invalid_ticket_config");
    case "stripe_billing":
    case "billing":
    case "stripe_subscription":
    case "stripe_refund":
      return parseWithSchema(billingConfigSchema, config ?? {}, "invalid_billing_config");
    default:
      return config ?? {};
  }
};

const executeAction = (
  action: Action,
  payload: Record<string, unknown> | undefined
) => {
  const createdAt = new Date().toISOString();
  switch (action.type) {
    case "slack_notify": {
      const config = parseWithSchema(slackConfigSchema, action.config ?? {}, "invalid_slack_config");
      const input = parseWithSchema(slackPayloadSchema, payload ?? {}, "invalid_slack_payload");
      const channel =
        input.useFallback && config.fallbackChannel ? config.fallbackChannel : config.channel;
      return {
        input,
        output: {
          delivery: {
            channel,
            text: input.message,
            metadata: input.metadata,
            deliveredAt: createdAt
          }
        }
      };
    }
    case "ticket_create":
    case "salesforce_ticket":
    case "human_escalation": {
      const config = parseWithSchema(ticketConfigSchema, action.config ?? {}, "invalid_ticket_config");
      const input = parseWithSchema(ticketPayloadSchema, payload ?? {}, "invalid_ticket_payload");
      const provider =
        action.type === "salesforce_ticket"
          ? "salesforce"
          : config.provider ?? "custom";
      const priority = input.priority ?? config.defaultPriority ?? "normal";
      const tags = Array.from(
        new Set([...(config.defaultTags ?? []), ...(input.tags ?? [])])
      );
      return {
        input,
        output: {
          ticket: {
            id: `ticket_${crypto.randomUUID()}`,
            provider,
            status: "open",
            subject: input.subject,
            description: input.description,
            priority,
            requester: input.requester,
            tags: tags.length > 0 ? tags : undefined,
            createdAt
          }
        }
      };
    }
    case "stripe_billing":
    case "billing": {
      const config = parseWithSchema(billingConfigSchema, action.config ?? {}, "invalid_billing_config");
      const input = parseWithSchema(billingPayloadSchema, payload ?? {}, "invalid_billing_payload");
      const allowCustomAmount = config.allowCustomAmount ?? true;
      const amount = input.amount ?? config.defaultAmount;
      if (amount === undefined) {
        throw createTypedError({
          code: "billing_amount_required",
          statusCode: 400
        });
      }
      if (input.amount !== undefined && !allowCustomAmount) {
        throw createTypedError({
          code: "custom_amount_not_allowed",
          statusCode: 400
        });
      }
      const currency = (input.currency ?? config.currency ?? "NOK").toUpperCase();
      const stripeApiKey =
        action.config && typeof action.config.stripeApiKey === "string"
          ? action.config.stripeApiKey
          : undefined;
      const stripe = createStripeClient({ apiKey: stripeApiKey });

      // Use SDK-style namespaced methods
      const invoice = stripe.invoices.create({
        customerId: input.customerId,
        amount,
        currency,
        description: input.description,
        dueInDays: 30
      });
      const paymentLink = stripe.paymentLinks.create({
        invoiceId: invoice.id
      });
      const customer = stripe.customers.retrieve(input.customerId);
      return {
        input,
        output: {
          invoice: {
            id: invoice.id,
            customerId: invoice.customerId,
            amount: invoice.amount,
            currency: invoice.currency.toUpperCase(),
            status: invoice.status,
            description: invoice.description,
            dueDate: invoice.dueDate,
            hostedInvoiceUrl: invoice.hostedInvoiceUrl,
            createdAt,
            paymentLink: paymentLink.url,
            livemode: invoice.livemode
          },
          customer: {
            id: customer.id,
            currency: customer.currency,
            balance: customer.balance
          }
        }
      };
    }
    case "stripe_subscription": {
      const input = parseWithSchema(subscriptionPayloadSchema, payload ?? {}, "invalid_subscription_payload");
      const stripeApiKey =
        action.config && typeof action.config.stripeApiKey === "string"
          ? action.config.stripeApiKey
          : undefined;
      const stripe = createStripeClient({ apiKey: stripeApiKey });

      try {
        switch (input.action) {
          case "create": {
            if (!input.priceId) {
              throw createTypedError({
                code: "subscription_price_required",
                statusCode: 400
              });
            }
            const sub = stripe.subscriptions.create({
              customerId: input.customerId,
              priceId: input.priceId,
              quantity: input.quantity,
              trialDays: input.trialDays
            });
            return {
              input,
              output: {
                subscription: {
                  id: sub.id,
                  customerId: sub.customerId,
                  status: sub.status,
                  currentPeriodStart: sub.currentPeriodStart,
                  currentPeriodEnd: sub.currentPeriodEnd,
                  cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                  items: sub.items,
                  createdAt,
                  livemode: sub.livemode
                }
              }
            };
          }
          case "cancel": {
            if (!input.subscriptionId) {
              throw createTypedError({
                code: "subscription_id_required",
                statusCode: 400
              });
            }
            const canceled = stripe.subscriptions.cancel(input.subscriptionId, {
              cancelAtPeriodEnd: input.cancelAtPeriodEnd
            });
            return {
              input,
              output: {
                subscription: {
                  id: canceled.id,
                  customerId: canceled.customerId,
                  status: canceled.status,
                  cancelAtPeriodEnd: canceled.cancelAtPeriodEnd,
                  canceledAt: canceled.canceledAt,
                  livemode: canceled.livemode
                }
              }
            };
          }
          case "retrieve": {
            if (!input.subscriptionId) {
              throw createTypedError({
                code: "subscription_id_required",
                statusCode: 400
              });
            }
            const sub = stripe.subscriptions.retrieve(input.subscriptionId);
            return {
              input,
              output: {
                subscription: {
                  id: sub.id,
                  customerId: sub.customerId,
                  status: sub.status,
                  currentPeriodStart: sub.currentPeriodStart,
                  currentPeriodEnd: sub.currentPeriodEnd,
                  cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
                  items: sub.items,
                  livemode: sub.livemode
                }
              }
            };
          }
        }
        break;
      } catch (err) {
        if (err instanceof StripeError) {
          throw createTypedError({
            code: "stripe_error",
            message: err.message,
            statusCode: err.statusCode
          });
        }
        throw err;
      }
    }
    case "stripe_refund": {
      const input = parseWithSchema(refundPayloadSchema, payload ?? {}, "invalid_refund_payload");
      const stripeApiKey =
        action.config && typeof action.config.stripeApiKey === "string"
          ? action.config.stripeApiKey
          : undefined;
      const stripe = createStripeClient({ apiKey: stripeApiKey });

      try {
        const refund = stripe.refunds.create({
          invoiceId: input.invoiceId,
          amount: input.amount,
          reason: input.reason
        });
        return {
          input,
          output: {
            refund: {
              id: refund.id,
              invoiceId: refund.invoiceId,
              amount: refund.amount,
              currency: refund.currency,
              status: refund.status,
              reason: refund.reason,
              createdAt,
              livemode: refund.livemode
            }
          }
        };
      } catch (err) {
        if (err instanceof StripeError) {
          throw createTypedError({
            code: "stripe_error",
            message: err.message,
            statusCode: err.statusCode
          });
        }
        throw err;
      }
    }
    default:
      throw createTypedError({
        code: "action_type_not_supported",
        statusCode: 400
      });
  }
};

export const buildServer = async (options?: BuildServerOptions) => {
  const fastify = Fastify({ logger: true });
  const apiLogger = createStructuredLogger({
    service: "api",
    sink: (entry) => {
      const { level, message, ...metadata } = entry;
      if (level === "error") {
        fastify.log.error(metadata, message);
        return;
      }
      if (level === "warn") {
        fastify.log.warn(metadata, message);
        return;
      }
      if (level === "debug") {
        fastify.log.debug(metadata, message);
        return;
      }
      fastify.log.info(metadata, message);
    }
  });

  const getOptionalHeader = (value: unknown) =>
    typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;

  const getContentLength = (value: unknown) => {
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      return value;
    }
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value);
      if (Number.isFinite(parsed) && parsed >= 0) {
        return parsed;
      }
    }
    return undefined;
  };

  await fastify.register(cors, { origin: true });
  await fastify.register(formbody);
  await fastify.register(fastifyWebsocket);
  await fastify.register(helmet);
  await fastify.register(swagger, {
    openapi: {
      info: {
        title: "Norway Support Platform API",
        version: "0.1.0"
      }
    }
  });
  await fastify.register(swaggerUi, { routePrefix: "/docs" });
  fastify.addHook("onResponse", async (request, reply) => {
    apiLogger.info("request.completed", {
      traceId: getOptionalHeader(request.headers["x-trace-id"]) ?? request.id,
      tenantId: getOptionalHeader(request.headers["x-tenant-id"]),
      userId:
        getOptionalHeader(request.headers["x-user-id"]) ??
        getOptionalHeader(request.headers["x-actor-id"]),
      method: request.method,
      path: request.url,
      statusCode: reply.statusCode,
      latencyMs: Number.isFinite(reply.elapsedTime) ? Math.round(reply.elapsedTime) : undefined,
      requestSizeBytes: getContentLength(request.headers["content-length"]),
      responseSizeBytes: getContentLength(reply.getHeader("content-length"))
    });
  });

  const azureOpenAIProviderConfig = resolveAzureOpenAIProviderConfig();
  const azureOpenAIRealtimeConfig = resolveAzureOpenAIRealtimeConfig();
  const chatCompletionProvider =
    options?.chatCompletionProvider ??
    (azureOpenAIProviderConfig
      ? createAzureOpenAIChatCompletionProvider(azureOpenAIProviderConfig)
      : undefined);
  if (chatCompletionProvider && azureOpenAIProviderConfig) {
    fastify.log.info(
      {
        provider: MODEL_PROVIDER_AZURE_OPENAI,
        endpoint: azureOpenAIProviderConfig.endpoint,
        deployment: azureOpenAIProviderConfig.deployment,
        apiVersion: azureOpenAIProviderConfig.apiVersion
      },
      "chat model provider enabled"
    );
  }
  if (azureOpenAIRealtimeConfig) {
    fastify.log.info(
      {
        provider: MODEL_PROVIDER_AZURE_OPENAI,
        endpoint: azureOpenAIRealtimeConfig.endpoint,
        deployment: azureOpenAIRealtimeConfig.deployment,
        apiVersion: azureOpenAIRealtimeConfig.apiVersion,
        voice: azureOpenAIRealtimeConfig.voice
      },
      "realtime model provider available"
    );
  }
  const twilioCallCreator =
    options?.twilioCallCreator ?? createTwilioCallWithSdk;
  const twilioRealtimeStreamTokens = new Map<string, TwilioRealtimeStreamToken>();

  const vectorStoreDir =
    options?.vectorStoreDir ??
    process.env.VECTOR_STORE_DIR ??
    path.join(process.cwd(), "data", "vector-store");
  const vectorStore = createRegionalVectorStore(vectorStoreDir);
  const runtimeStoreDir =
    options?.runtimeStoreDir ?? resolveRuntimeStoreDir();
  const runtimeStatePath = path.join(runtimeStoreDir, "runtime-state.json");
  const runtimeStatePersister =
    options?.runtimeStatePersister ?? persistDurableRuntimeState;
  const runtimePersistMaxRetries = resolveNonNegativeInt(
    options?.runtimePersistRetry?.maxRetries ?? process.env.RUNTIME_PERSIST_MAX_RETRIES,
    3
  );
  const runtimePersistBackoffMs = resolveNonNegativeInt(
    options?.runtimePersistRetry?.backoffMs ?? process.env.RUNTIME_PERSIST_BACKOFF_MS,
    100
  );
  const runtimePersistMaxBackoffMs = Math.max(
    runtimePersistBackoffMs,
    resolveNonNegativeInt(
      options?.runtimePersistRetry?.maxBackoffMs ??
        process.env.RUNTIME_PERSIST_BACKOFF_MAX_MS,
      1000
    )
  );
  const runtimePersistSleep =
    options?.runtimePersistRetry?.sleep ??
    (async (delayMs: number) => {
      if (delayMs <= 0) {
        return;
      }
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    });
  const persistedRuntimeState = await loadDurableRuntimeState(runtimeStatePath);

  const tenants = new Map<string, Tenant>();
  const tenantMembers = new Map<string, TenantMember>();
  const retentionPolicies = new Map<string, RetentionPolicy>();
  const agents = new Map<string, Agent>();
  const sources = new Map<string, Source>();
  const channels = new Map<string, Channel>();
  const actions = new Map<string, Action>();
  const actionExecutions = new Map<string, ActionExecution>();
  const conversations = new Map<string, Conversation>();
  const ingestionJobs = new Map<string, IngestionJob>(
    persistedRuntimeState.ingestionJobs.map((job) => [job.id, job])
  );
  const tenantQuotaUsage = new Map<string, TenantQuotaUsage>(
    persistedRuntimeState.tenantQuotaUsage.map((entry) => [entry.tenantId, entry])
  );
  const tenantRateLimitState = new Map<
    string,
    {
      tokens: number;
      lastRefillAt: number;
    }
  >();
  const tenantRateLimitCapacity = resolveNonNegativeInt(
    process.env.TENANT_RATE_LIMIT_CAPACITY,
    120
  );
  const tenantRateLimitWindowMs = Math.max(
    resolveNonNegativeInt(process.env.TENANT_RATE_LIMIT_WINDOW_MS, 60_000),
    1000
  );
  const defaultTenantMonthlyQuota = resolveNonNegativeInt(
    process.env.TENANT_MONTHLY_QUOTA,
    10_000
  );
  const channelThreads = new Map<string, string>();
  const notionSyncState = new Map<
    string,
    {
      sourceId: string;
      workspaceId: string;
      lastSyncedAt: string;
      autoRetrain: boolean;
      staleSinceMs: number;
    }
  >();
  const NOTION_STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
  const INGESTION_SLA_MS =
    Number(process.env.INGESTION_SLA_MS ?? "") || 5 * 60 * 1000;
  // Cache ingested content per source so retrain can re-ingest automatically
  const sourceContentCache = new Map<
    string,
    {
      text: string;
      metadata?: Record<string, unknown>;
      chunkSize?: number;
      chunkOverlap?: number;
    }
  >();
  const maxMetricEvents = resolvePositiveInt(
    options?.runtimeStateCaps?.maxMetricEvents ??
      process.env.RUNTIME_STATE_MAX_METRIC_EVENTS,
    5000
  );
  const metricEvents: MetricEvent[] = persistedRuntimeState.metricEvents.slice(
    -maxMetricEvents
  );
  const maxAuditEvents = resolvePositiveInt(
    options?.runtimeStateCaps?.maxAuditEvents ??
      process.env.RUNTIME_STATE_MAX_AUDIT_EVENTS,
    5000
  );
  const auditEvents: AuditEvent[] = persistedRuntimeState.auditEvents.slice(
    -maxAuditEvents
  );
  const defaultRetentionDays = 30;

  const ensureMetricCapacity = () => {
    if (metricEvents.length <= maxMetricEvents) {
      return;
    }
    metricEvents.splice(0, metricEvents.length - maxMetricEvents);
  };

  const ensureAuditCapacity = () => {
    if (auditEvents.length <= maxAuditEvents) {
      return;
    }
    auditEvents.splice(0, auditEvents.length - maxAuditEvents);
  };

  let runtimePersistQueue: Promise<void> = Promise.resolve();
  const runtimePersistenceObservability: RuntimePersistenceObservability = {
    queueDepth: 0,
    peakQueueDepth: 0,
    writeAttempts: 0,
    retryAttempts: 0,
    failedAttempts: 0,
    failedSnapshots: 0,
    persistedSnapshots: 0,
    lastWriteLatencyMs: null,
    totalWriteLatencyMs: 0
  };

  const persistRuntimeStateWithRetry = async (snapshot: DurableRuntimeState) => {
    const writeStartedAt = Date.now();
    for (
      let retryAttempt = 0;
      retryAttempt <= runtimePersistMaxRetries;
      retryAttempt += 1
    ) {
      runtimePersistenceObservability.writeAttempts += 1;
      if (retryAttempt > 0) {
        runtimePersistenceObservability.retryAttempts += 1;
      }
      try {
        await runtimeStatePersister(runtimeStatePath, snapshot);
        const writeLatencyMs = Date.now() - writeStartedAt;
        runtimePersistenceObservability.lastWriteLatencyMs = writeLatencyMs;
        runtimePersistenceObservability.totalWriteLatencyMs += writeLatencyMs;
        runtimePersistenceObservability.persistedSnapshots += 1;
        return;
      } catch (error) {
        runtimePersistenceObservability.failedAttempts += 1;
        if (retryAttempt === runtimePersistMaxRetries) {
          runtimePersistenceObservability.failedSnapshots += 1;
          runtimePersistenceObservability.lastFailureAt = new Date().toISOString();
          runtimePersistenceObservability.lastFailureMessage =
            error instanceof Error ? error.message : String(error);
          throw error;
        }
        const delayMs = Math.min(
          runtimePersistBackoffMs * 2 ** retryAttempt,
          runtimePersistMaxBackoffMs
        );
        fastify.log.warn(
          {
            err: error,
            retryAttempt: retryAttempt + 1,
            maxRetries: runtimePersistMaxRetries,
            delayMs
          },
          "retrying runtime state persistence"
        );
        await runtimePersistSleep(delayMs);
      }
    }
  };

  const queueRuntimeStatePersist = () => {
    runtimePersistenceObservability.queueDepth += 1;
    runtimePersistenceObservability.peakQueueDepth = Math.max(
      runtimePersistenceObservability.peakQueueDepth,
      runtimePersistenceObservability.queueDepth
    );
    const snapshot: DurableRuntimeState = {
      ingestionJobs: Array.from(ingestionJobs.values()),
      metricEvents: [...metricEvents],
      auditEvents: [...auditEvents],
      tenantQuotaUsage: Array.from(tenantQuotaUsage.values())
    };
    runtimePersistQueue = runtimePersistQueue
      .catch(() => undefined)
      .then(() => persistRuntimeStateWithRetry(snapshot))
      .catch((error) => {
        fastify.log.error(
          {
            err: error,
            attempts: runtimePersistMaxRetries + 1
          },
          "failed to persist runtime state after retries"
        );
      })
      .finally(() => {
        runtimePersistenceObservability.queueDepth = Math.max(
          0,
          runtimePersistenceObservability.queueDepth - 1
        );
      });
  };

  const refreshIngestionJobsFromRuntimeState = async () => {
    const latestRuntimeState = await loadDurableRuntimeState(runtimeStatePath);
    for (const job of latestRuntimeState.ingestionJobs) {
      ingestionJobs.set(job.id, job);
    }
  };

  fastify.addHook("onClose", async () => {
    await runtimePersistQueue;
  });

  if (
    persistedRuntimeState.metricEvents.length !== metricEvents.length ||
    persistedRuntimeState.auditEvents.length !== auditEvents.length ||
    persistedRuntimeState.tenantQuotaUsage.length !== tenantQuotaUsage.size
  ) {
    queueRuntimeStatePersist();
  }

  const getTenantQuotaPeriodStart = (referenceDate: Date) =>
    new Date(
      Date.UTC(
        referenceDate.getUTCFullYear(),
        referenceDate.getUTCMonth(),
        1
      )
    ).toISOString();

  const getTenantQuotaPeriodEnd = (periodStart: string) => {
    const parsed = new Date(periodStart);
    const baseDate = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
    return new Date(
      Date.UTC(baseDate.getUTCFullYear(), baseDate.getUTCMonth() + 1, 1)
    ).toISOString();
  };

  const getTenantQuotaLimit = (entry?: TenantQuotaUsage) =>
    entry?.quotaLimit ?? defaultTenantMonthlyQuota;

  const ensureTenantQuotaEntry = (tenantId: string, now = new Date()) => {
    const periodStart = getTenantQuotaPeriodStart(now);
    const existing = tenantQuotaUsage.get(tenantId);
    if (!existing) {
      const created: TenantQuotaUsage = {
        tenantId,
        used: 0,
        periodStart
      };
      tenantQuotaUsage.set(tenantId, created);
      queueRuntimeStatePersist();
      return created;
    }
    if (existing.periodStart !== periodStart) {
      const rolled: TenantQuotaUsage = {
        ...existing,
        used: 0,
        periodStart
      };
      tenantQuotaUsage.set(tenantId, rolled);
      queueRuntimeStatePersist();
      return rolled;
    }
    return existing;
  };

  const buildTenantQuotaSnapshot = (tenantId: string, now = new Date()) => {
    const entry = ensureTenantQuotaEntry(tenantId, now);
    const limit = getTenantQuotaLimit(entry);
    const remaining = Math.max(0, limit - entry.used);
    const periodEnd = getTenantQuotaPeriodEnd(entry.periodStart);
    return {
      entry,
      limit,
      remaining,
      periodEnd
    };
  };

  const getRefilledTenantRateState = (tenantId: string, nowMs: number) => {
    const existing = tenantRateLimitState.get(tenantId) ?? {
      tokens: tenantRateLimitCapacity,
      lastRefillAt: nowMs
    };
    const elapsedMs = Math.max(0, nowMs - existing.lastRefillAt);
    const refillTokens =
      tenantRateLimitCapacity > 0
        ? (elapsedMs * tenantRateLimitCapacity) / tenantRateLimitWindowMs
        : 0;
    return {
      tokens: Math.min(tenantRateLimitCapacity, existing.tokens + refillTokens),
      lastRefillAt: nowMs
    };
  };

  const computeRateLimitResetEpochSeconds = (tokens: number, nowMs: number) => {
    if (tenantRateLimitCapacity <= 0) {
      return Math.ceil(nowMs / 1000);
    }
    const msUntilFull = Math.ceil(
      ((tenantRateLimitCapacity - tokens) * tenantRateLimitWindowMs) /
        tenantRateLimitCapacity
    );
    return Math.ceil((nowMs + Math.max(msUntilFull, 0)) / 1000);
  };

  const computeRateRetryAfterSeconds = (tokens: number) => {
    if (tenantRateLimitCapacity <= 0 || tokens >= 1) {
      return 0;
    }
    const retryAfterMs =
      ((1 - tokens) * tenantRateLimitWindowMs) / tenantRateLimitCapacity;
    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  };

  const peekTenantRateLimit = (tenantId: string, nowMs: number) => {
    if (tenantRateLimitCapacity <= 0) {
      return {
        limit: 0,
        remaining: 0,
        resetEpochSeconds: Math.ceil(nowMs / 1000),
        retryAfterSeconds: 0
      };
    }
    const refilledState = getRefilledTenantRateState(tenantId, nowMs);
    tenantRateLimitState.set(tenantId, refilledState);
    return {
      limit: tenantRateLimitCapacity,
      remaining: Math.max(0, Math.floor(refilledState.tokens)),
      resetEpochSeconds: computeRateLimitResetEpochSeconds(
        refilledState.tokens,
        nowMs
      ),
      retryAfterSeconds: computeRateRetryAfterSeconds(refilledState.tokens)
    };
  };

  const consumeTenantRateLimit = (tenantId: string, nowMs: number) => {
    if (tenantRateLimitCapacity <= 0) {
      return {
        limited: false,
        limit: 0,
        remaining: 0,
        resetEpochSeconds: Math.ceil(nowMs / 1000),
        retryAfterSeconds: 0
      };
    }
    const refilledState = getRefilledTenantRateState(tenantId, nowMs);
    if (refilledState.tokens < 1) {
      tenantRateLimitState.set(tenantId, refilledState);
      const retryAfterSeconds = computeRateRetryAfterSeconds(refilledState.tokens);
      return {
        limited: true,
        limit: tenantRateLimitCapacity,
        remaining: 0,
        resetEpochSeconds: Math.ceil((nowMs + retryAfterSeconds * 1000) / 1000),
        retryAfterSeconds
      };
    }
    const updatedState = {
      tokens: refilledState.tokens - 1,
      lastRefillAt: nowMs
    };
    tenantRateLimitState.set(tenantId, updatedState);
    return {
      limited: false,
      limit: tenantRateLimitCapacity,
      remaining: Math.max(0, Math.floor(updatedState.tokens)),
      resetEpochSeconds: computeRateLimitResetEpochSeconds(
        updatedState.tokens,
        nowMs
      ),
      retryAfterSeconds: 0
    };
  };

  const setTenantLimitHeaders = (
    reply: { header: (key: string, value: string) => unknown },
    input: {
      rateLimit: number;
      rateRemaining: number;
      rateResetEpochSeconds: number;
      quotaLimit: number;
      quotaRemaining: number;
      quotaPeriodEnd: string;
    }
  ) => {
    reply.header("X-RateLimit-Limit", String(input.rateLimit));
    reply.header("X-RateLimit-Remaining", String(Math.max(0, input.rateRemaining)));
    reply.header("X-RateLimit-Reset", String(input.rateResetEpochSeconds));
    reply.header("X-Quota-Limit", String(Math.max(0, input.quotaLimit)));
    reply.header("X-Quota-Remaining", String(Math.max(0, input.quotaRemaining)));
    reply.header("X-Quota-Reset", input.quotaPeriodEnd);
  };

  const enforceTenantLimits = (
    reply: {
      header: (key: string, value: string) => unknown;
      code: (statusCode: number) => { send: (body: unknown) => unknown };
    },
    tenantId: string
  ) => {
    const now = new Date();
    const nowMs = now.getTime();
    const quota = buildTenantQuotaSnapshot(tenantId, now);
    const rateSnapshot = peekTenantRateLimit(tenantId, nowMs);

    if (quota.limit > 0 && quota.remaining <= 0) {
      setTenantLimitHeaders(reply, {
        rateLimit: rateSnapshot.limit,
        rateRemaining: rateSnapshot.remaining,
        rateResetEpochSeconds: rateSnapshot.resetEpochSeconds,
        quotaLimit: quota.limit,
        quotaRemaining: 0,
        quotaPeriodEnd: quota.periodEnd
      });
      const retryAfterSeconds = Math.max(
        1,
        Math.ceil(
          (new Date(quota.periodEnd).getTime() - nowMs) / 1000
        )
      );
      reply.header("Retry-After", String(retryAfterSeconds));
      reply.code(429).send({ error: "tenant_quota_exceeded" });
      return undefined;
    }

    const rateResult = consumeTenantRateLimit(tenantId, nowMs);
    if (rateResult.limited) {
      setTenantLimitHeaders(reply, {
        rateLimit: rateResult.limit,
        rateRemaining: rateResult.remaining,
        rateResetEpochSeconds: rateResult.resetEpochSeconds,
        quotaLimit: quota.limit,
        quotaRemaining: quota.remaining,
        quotaPeriodEnd: quota.periodEnd
      });
      reply.header("Retry-After", String(rateResult.retryAfterSeconds));
      reply.code(429).send({ error: "tenant_rate_limited" });
      return undefined;
    }

    const updatedQuotaEntry: TenantQuotaUsage = {
      ...quota.entry,
      used: quota.entry.used + 1
    };
    tenantQuotaUsage.set(tenantId, updatedQuotaEntry);
    queueRuntimeStatePersist();

    setTenantLimitHeaders(reply, {
      rateLimit: rateResult.limit,
      rateRemaining: rateResult.remaining,
      rateResetEpochSeconds: rateResult.resetEpochSeconds,
      quotaLimit: quota.limit,
      quotaRemaining: Math.max(0, quota.limit - updatedQuotaEntry.used),
      quotaPeriodEnd: quota.periodEnd
    });

    return {
      quotaLimit: quota.limit,
      quotaPeriodEnd: quota.periodEnd,
      quotaUsed: updatedQuotaEntry.used
    };
  };

  const recordAuditEvent = (input: {
    tenantId: string;
    actorId: string;
    action: string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  }) => {
    const event: AuditEvent = {
      id: `audit_${crypto.randomUUID()}`,
      tenantId: input.tenantId,
      actorId: input.actorId,
      action: input.action,
      targetId: input.targetId,
      metadata: input.metadata,
      createdAt: new Date().toISOString()
    };
    auditEvents.push(event);
    ensureAuditCapacity();
    queueRuntimeStatePersist();
    return event;
  };

  const computeIngestionDuration = (startedAt: string, completedAt: string) => {
    const startMs = new Date(startedAt).getTime();
    const endMs = new Date(completedAt).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs)) {
      return 0;
    }
    return Math.max(0, endMs - startMs);
  };

  const computeIngestionSlaResult = (startedAt: string, completedAt: string) => {
    const durationMs = computeIngestionDuration(startedAt, completedAt);
    return {
      durationMs,
      slaMet: durationMs <= INGESTION_SLA_MS
    };
  };

  const applyIngestionCompletion = (
    job: IngestionJob,
    completedAt: string,
    startedAtOverride?: string
  ): IngestionJob => {
    const startedAt = startedAtOverride ?? job.startedAt ?? job.createdAt;
    const { durationMs, slaMet } = computeIngestionSlaResult(
      startedAt,
      completedAt
    );
    return {
      ...job,
      status: "complete",
      startedAt,
      completedAt,
      durationMs,
      slaMet
    } satisfies IngestionJob;
  };

  const getUserIdFromRequest = (request: { headers: Record<string, unknown> }) => {
    const headerValue = request.headers["x-user-id"] ?? request.headers["x-actor-id"];
    return typeof headerValue === "string" && headerValue.trim()
      ? headerValue.trim()
      : undefined;
  };

  const requireUserId = (request: { headers: Record<string, unknown> }, reply: { code: (statusCode: number) => { send: (body: unknown) => void } }) => {
    const userId = getUserIdFromRequest(request);
    if (!userId) {
      reply.code(401).send({ error: "user_required" });
      return undefined;
    }
    return userId;
  };

  const roleRank: Record<TenantRole, number> = {
    viewer: 1,
    member: 2,
    admin: 3,
    owner: 4
  };

  const isRoleAtLeast = (role: TenantRole, required: TenantRole) =>
    roleRank[role] >= roleRank[required];

  const getTenantMemberKey = (tenantId: string, userId: string) => `${tenantId}:${userId}`;

  const getTenantIdsForUser = (userId: string) => {
    const ids = new Set<string>();
    for (const member of tenantMembers.values()) {
      if (member.userId === userId) {
        ids.add(member.tenantId);
      }
    }
    return ids;
  };

  const getTenantIdForAgent = (agentId: string) => agents.get(agentId)?.tenantId;
  const getTenantIdForChannel = (channelId: string) => {
    const channel = channels.get(channelId);
    if (!channel) {
      return undefined;
    }
    return getTenantIdForAgent(channel.agentId);
  };
  const getTenantIdForSource = (sourceId: string) => {
    const source = sources.get(sourceId);
    if (!source) {
      return undefined;
    }
    return getTenantIdForAgent(source.agentId);
  };
  const getTenantIdForConversation = (conversationId: string) => {
    const conversation = conversations.get(conversationId);
    if (!conversation) {
      return undefined;
    }
    return getTenantIdForAgent(conversation.agentId);
  };
  const getTenantIdForIngestionJob = (jobId: string) => {
    const job = ingestionJobs.get(jobId);
    if (!job) {
      return undefined;
    }
    return getTenantIdForSource(job.sourceId);
  };

  const resolveAgentId = (input: { agentId?: string; channelId?: string }) => {
    if (input.agentId) {
      return input.agentId;
    }
    if (input.channelId) {
      return channels.get(input.channelId)?.agentId;
    }
    return undefined;
  };

  const resolveTenantId = (input: { tenantId?: string; agentId?: string; channelId?: string }) => {
    if (input.tenantId) {
      return input.tenantId;
    }
    const agentId = resolveAgentId(input);
    if (!agentId) {
      return undefined;
    }
    return agents.get(agentId)?.tenantId;
  };

  const recordMetricEvent = (
    input: z.infer<typeof metricEventInputSchema> & { timestamp?: string }
  ) => {
    const agentId = resolveAgentId(input);
    const tenantId = resolveTenantId({ ...input, agentId });
    if (!tenantId) {
      return undefined;
    }
    const event: MetricEvent = {
      id: `metric_${crypto.randomUUID()}`,
      type: input.type,
      tenantId,
      agentId,
      channelId: input.channelId,
      conversationId: input.conversationId,
      timestamp: input.timestamp ?? new Date().toISOString(),
      value: input.value,
      metadata: input.metadata
    };
    metricEvents.push(event);
    ensureMetricCapacity();
    queueRuntimeStatePersist();
    return event;
  };

  const removeConversations = (tenantId: string, conversationIds: Set<string>) => {
    if (conversationIds.size === 0) {
      return { removedConversations: 0, removedMetrics: 0 };
    }
    for (const conversationId of conversationIds) {
      conversations.delete(conversationId);
    }
    for (const [key, conversationId] of channelThreads.entries()) {
      if (conversationIds.has(conversationId)) {
        channelThreads.delete(key);
      }
    }
    let removedMetrics = 0;
    for (let index = metricEvents.length - 1; index >= 0; index -= 1) {
      const event = metricEvents[index];
      if (event.tenantId !== tenantId) {
        continue;
      }
      if (event.conversationId && conversationIds.has(event.conversationId)) {
        metricEvents.splice(index, 1);
        removedMetrics += 1;
      }
    }
    if (removedMetrics > 0) {
      queueRuntimeStatePersist();
    }
    return { removedConversations: conversationIds.size, removedMetrics };
  };

  const applyRetentionForTenant = (tenantId: string, actorId: string) => {
    const policy =
      retentionPolicies.get(tenantId) ??
      ({
        tenantId,
        days: defaultRetentionDays,
        enabled: true,
        updatedAt: new Date().toISOString(),
        updatedBy: "system"
      } satisfies RetentionPolicy);
    if (!retentionPolicies.has(tenantId)) {
      retentionPolicies.set(tenantId, policy);
    }
    if (!policy.enabled || policy.days < 0) {
      return { removedConversations: 0, removedMetrics: 0 };
    }
    const cutoff = Date.now() - policy.days * 24 * 60 * 60 * 1000;
    const expired = new Set<string>();
    for (const conversation of conversations.values()) {
      const conversationTenantId = getTenantIdForAgent(conversation.agentId);
      if (conversationTenantId !== tenantId) {
        continue;
      }
      const timestamp = new Date(conversation.endedAt ?? conversation.startedAt).getTime();
      if (!Number.isFinite(timestamp)) {
        continue;
      }
      if (timestamp <= cutoff) {
        expired.add(conversation.id);
      }
    }
    if (expired.size === 0) {
      return { removedConversations: 0, removedMetrics: 0 };
    }
    const removed = removeConversations(tenantId, expired);
    recordAuditEvent({
      tenantId,
      actorId,
      action: "retention.purged",
      metadata: {
        cutoff: new Date(cutoff).toISOString(),
        removedConversations: removed.removedConversations,
        removedMetrics: removed.removedMetrics
      }
    });
    return removed;
  };

  const requireTenantRole = (
    request: { headers: Record<string, unknown> },
    reply: { code: (statusCode: number) => { send: (body: unknown) => void } },
    tenantId: string,
    requiredRole: TenantRole
  ) => {
    const userId = requireUserId(request, reply);
    if (!userId) {
      return undefined;
    }
    const membership = tenantMembers.get(getTenantMemberKey(tenantId, userId));
    if (!membership) {
      reply.code(403).send({ error: "tenant_access_denied" });
      return undefined;
    }
    if (!isRoleAtLeast(membership.role, requiredRole)) {
      reply.code(403).send({ error: "insufficient_role" });
      return undefined;
    }
    applyRetentionForTenant(tenantId, userId);
    return { userId, membership };
  };

  const buildSourceLookup = (
    sourceIds: Set<string>
  ): Map<string, SourceCitationInfo> => {
    const lookup = new Map<string, SourceCitationInfo>();
    for (const sourceId of sourceIds) {
      const source = sources.get(sourceId);
      if (!source) {
        continue;
      }
      let sourceUrl: string | undefined;
      let sourceTitle: string | undefined;
      if (source.type === "website" && source.value) {
        sourceUrl = source.value;
        sourceTitle = source.value;
      } else if (source.type === "file") {
        const fileConfig = source.config as
          | { filename?: string }
          | undefined;
        sourceTitle = fileConfig?.filename ?? source.value;
      } else if (source.type === "text") {
        const textConfig = source.config as
          | { title?: string }
          | undefined;
        sourceTitle = textConfig?.title ?? source.value;
      } else if (source.type === "notion") {
        const notionConfig = source.config as
          | { workspaceId?: string }
          | undefined;
        sourceTitle = notionConfig?.workspaceId
          ? `Notion (${notionConfig.workspaceId})`
          : "Notion";
      } else if (source.type === "qa") {
        sourceTitle = source.value ?? "Q&A";
      } else if (source.type === "ticketing") {
        const ticketConfig = source.config as
          | { provider?: string }
          | undefined;
        sourceTitle = ticketConfig?.provider ?? "Ticketing";
      }
      lookup.set(sourceId, {
        sourceId,
        sourceType: source.type,
        sourceUrl,
        sourceTitle
      });
    }
    return lookup;
  };

  const runChatFlow = async (input: {
    agentId: string;
    message: string;
    maxResults?: number;
    minScore?: number;
    sourceIds?: string[];
  }) => {
    const agent = agents.get(input.agentId);
    if (!agent) {
      throw createTypedError({
        code: "agent_not_found",
        statusCode: 404
      });
    }
    const tenant = tenants.get(agent.tenantId);
    if (!tenant) {
      throw createTypedError({
        code: "tenant_not_found",
        statusCode: 404
      });
    }
    const queryEmbedding = buildEmbedding(input.message);
    const minScore = input.minScore ?? agent.retrievalConfig?.minScore ?? 0;
    const maxResults = input.maxResults ?? agent.retrievalConfig?.maxResults ?? 4;
    const sourceFilter = input.sourceIds ? new Set(input.sourceIds) : undefined;
    const retrievalMatches = await vectorStore.query(tenant.region, {
      agentId: input.agentId,
      queryText: input.message,
      queryEmbedding,
      minScore,
      maxResults,
      sourceFilter
    });
    const context = retrievalMatches.map((item) => ({
      id: item.chunk.id,
      sourceId: item.chunk.sourceId,
      content: item.chunk.content,
      score: item.score,
      metadata: item.chunk.metadata
    }));
    const referencedSourceIds = new Set(context.map((c) => c.sourceId));
    const sourceLookup = buildSourceLookup(referencedSourceIds);
    const prompt = buildChatPrompt({
      basePrompt: agent.basePrompt,
      message: input.message,
      context,
      sourceLookup
    });
    const fallbackResponse = buildChatResponse({
      message: input.message,
      context,
      sourceLookup
    });
    let response = fallbackResponse;
    if (chatCompletionProvider) {
      try {
        const modelMessage = await chatCompletionProvider({
          prompt,
          model: agent.model
        });
        response = {
          ...fallbackResponse,
          message: modelMessage
        };
      } catch (error) {
        fastify.log.error(
          {
            err: error,
            agentId: agent.id,
            provider: MODEL_PROVIDER_AZURE_OPENAI
          },
          "chat model provider request failed"
        );
        throw createTypedError({ code: "model_provider_failed", statusCode: 502 });
      }
    }
    return { agent, tenant, response, prompt, context };
  };

  const escalationActionPriority: Array<z.infer<typeof actionTypeSchema>> = [
    "human_escalation",
    "ticket_create",
    "salesforce_ticket"
  ];

  const getEscalationActionForAgent = (agentId: string) => {
    for (const type of escalationActionPriority) {
      const action = Array.from(actions.values()).find(
        (item) => item.agentId === agentId && item.enabled && item.type === type
      );
      if (action) {
        return action;
      }
    }
    return undefined;
  };

  const maybeDispatchAutoEscalation = (input: {
    agentId: string;
    message: string;
    response: ReturnType<typeof buildChatResponse>;
    channel?: Channel;
    conversation?: Conversation;
  }) => {
    if (!input.response.shouldEscalate) {
      return undefined;
    }
    if (input.conversation?.status === "escalated") {
      return undefined;
    }
    const action = getEscalationActionForAgent(input.agentId);
    if (!action) {
      return undefined;
    }

    const requester = input.conversation?.userId
      ? {
          name: input.conversation.userId,
          ...(input.conversation.userId.includes("@")
            ? { email: input.conversation.userId }
            : {})
        }
      : undefined;

    const payload: Record<string, unknown> = {
      subject: `Low-confidence escalation for agent ${input.agentId}`,
      description: [
        `User message: ${input.message}`,
        `Assistant response: ${input.response.message}`,
        `Confidence: ${input.response.confidence.toFixed(2)}`,
        input.channel ? `Channel: ${input.channel.type}` : undefined,
        input.conversation
          ? `Conversation ID: ${input.conversation.id}`
          : undefined
      ]
        .filter(Boolean)
        .join("\n"),
      priority: "high",
      requester,
      tags: ["auto-escalation", "low-confidence"],
      conversationId: input.conversation?.id,
      metadata: {
        reason: "low_confidence",
        confidence: input.response.confidence
      }
    };

    try {
      const { input: actionInput, output } = executeAction(action, payload);
      const createdAt = new Date().toISOString();
      const execution: ActionExecution = {
        id: `execution_${crypto.randomUUID()}`,
        actionId: action.id,
        type: action.type,
        status: "success",
        input: actionInput,
        output,
        createdAt
      };
      actionExecutions.set(execution.id, execution);
      recordMetricEvent({
        type: "action_executed",
        agentId: action.agentId,
        channelId: input.channel?.id,
        conversationId: input.conversation?.id,
        timestamp: createdAt,
        metadata: {
          actionType: action.type,
          status: execution.status,
          reason: "low_confidence"
        }
      });
      if (input.conversation) {
        const updatedConversation: Conversation = {
          ...input.conversation,
          status: "escalated",
          endedAt: input.conversation.endedAt ?? createdAt
        };
        conversations.set(input.conversation.id, updatedConversation);
        recordMetricEvent({
          type: "conversation_escalated",
          agentId: input.agentId,
          channelId: input.channel?.id ?? input.conversation.channelId,
          conversationId: input.conversation.id,
          timestamp: createdAt,
          metadata: {
            reason: "low_confidence",
            confidence: input.response.confidence,
            actionType: action.type,
            actionId: action.id
          }
        });
      }
      return {
        actionId: action.id,
        executionId: execution.id,
        type: action.type,
        status: execution.status,
        output
      };
    } catch (error) {
      if (isTypedError(error)) {
        const serialized = serializeTypedError(error);
        apiLogger.warn("automatic_escalation_failed", {
          actionId: action.id,
          agentId: input.agentId,
          error: serialized.error,
          statusCode: serialized.statusCode
        });
        return undefined;
      }
      throw error;
    }
  };

  const getOrCreateConversation = (input: {
    channel: Channel;
    userId?: string;
    threadKey?: string;
  }) => {
    const threadKey = input.threadKey?.trim();
    if (threadKey) {
      const indexKey = `${input.channel.id}:${threadKey}`;
      const existingId = channelThreads.get(indexKey);
      if (existingId) {
        const existing = conversations.get(existingId);
        if (existing) {
          return existing;
        }
      }
    }
    const id = `conversation_${crypto.randomUUID()}`;
    const conversation: Conversation = {
      id,
      agentId: input.channel.agentId,
      channelId: input.channel.id,
      userId: input.userId,
      status: "open",
      startedAt: new Date().toISOString()
    };
    conversations.set(id, conversation);
    if (threadKey) {
      channelThreads.set(`${input.channel.id}:${threadKey}`, id);
    }
    recordMetricEvent({
      type: "conversation_started",
      agentId: conversation.agentId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      timestamp: conversation.startedAt
    });
    return conversation;
  };

  const processInboundChannelMessage = async (input: {
    channel: Channel;
    inbound: InboundMessage;
  }) => {
    const conversation = getOrCreateConversation({
      channel: input.channel,
      userId: input.inbound.userId,
      threadKey: input.inbound.threadKey
    });
    recordMetricEvent({
      type: "message_sent",
      agentId: input.channel.agentId,
      channelId: input.channel.id,
      conversationId: conversation.id,
      timestamp: new Date().toISOString(),
      metadata: {
        role: "user"
      }
    });
    const { response, prompt } = await runChatFlow({
      agentId: input.channel.agentId,
      message: input.inbound.message
    });
    recordMetricEvent({
      type: "message_sent",
      agentId: input.channel.agentId,
      channelId: input.channel.id,
      conversationId: conversation.id,
      timestamp: new Date().toISOString(),
      metadata: {
        role: "assistant",
        sourceCount: response.sources.length
      }
    });
    const escalation = maybeDispatchAutoEscalation({
      agentId: input.channel.agentId,
      message: input.inbound.message,
      response,
      channel: input.channel,
      conversation
    });
    const replyPayload =
      input.channel.type === "voice_agent"
        ? buildVoiceReplyPayload(response, input.channel)
        : response;
    return {
      conversation,
      prompt,
      reply: escalation ? { ...replyPayload, escalation } : replyPayload,
      metadata: input.inbound.metadata
    };
  };

  const buildMetricWindow = (input: { from?: string; to?: string }) => {
    const to = input.to ? new Date(input.to) : new Date();
    const from = input.from
      ? new Date(input.from)
      : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
    return { from, to };
  };

  const matchesMetricScope = (
    event: MetricEvent,
    scope: { tenantId?: string; agentId?: string; channelId?: string }
  ) => {
    if (scope.tenantId && event.tenantId !== scope.tenantId) {
      return false;
    }
    if (scope.agentId && event.agentId !== scope.agentId) {
      return false;
    }
    if (scope.channelId && event.channelId !== scope.channelId) {
      return false;
    }
    return true;
  };

  const selectMetricEvents = (input: {
    tenantId?: string;
    agentId?: string;
    channelId?: string;
    from?: string;
    to?: string;
  }) => {
    const window = buildMetricWindow(input);
    const fromTime = window.from.getTime();
    const toTime = window.to.getTime();
    const items = metricEvents.filter((event) => {
      if (!matchesMetricScope(event, input)) {
        return false;
      }
      const timestamp = new Date(event.timestamp).getTime();
      return timestamp >= fromTime && timestamp <= toTime;
    });
    return { items, window };
  };

  const buildMetricSeries = (events: MetricEvent[], window: { from: Date; to: Date }) => {
    const start = new Date(Date.UTC(window.from.getUTCFullYear(), window.from.getUTCMonth(), window.from.getUTCDate()));
    const end = new Date(Date.UTC(window.to.getUTCFullYear(), window.to.getUTCMonth(), window.to.getUTCDate()));
    const dayMs = 24 * 60 * 60 * 1000;
    const seriesMap = new Map<string, { date: string; conversations: number; deflections: number; escalations: number }>();
    for (let current = start.getTime(); current <= end.getTime(); current += dayMs) {
      const dateKey = new Date(current).toISOString().slice(0, 10);
      seriesMap.set(dateKey, {
        date: dateKey,
        conversations: 0,
        deflections: 0,
        escalations: 0
      });
    }
    for (const event of events) {
      const dateKey = new Date(event.timestamp).toISOString().slice(0, 10);
      const entry = seriesMap.get(dateKey);
      if (!entry) {
        continue;
      }
      if (event.type === "conversation_started") {
        entry.conversations += 1;
      } else if (event.type === "conversation_resolved") {
        entry.deflections += 1;
      } else if (event.type === "conversation_escalated") {
        entry.escalations += 1;
      }
    }
    return Array.from(seriesMap.values());
  };

  const buildConversationStats = (events: MetricEvent[]) => {
    const stats = new Map<
      string,
      {
        conversationId: string;
        tenantId?: string;
        agentId?: string;
        channelId?: string;
        startedAt?: Date;
        firstResponseAt?: Date;
        resolvedAt?: Date;
        escalatedAt?: Date;
        lastActivityAt?: Date;
        intent?: string;
      }
    >();

    const ensureConversation = (conversationId: string) => {
      let entry = stats.get(conversationId);
      if (!entry) {
        entry = {
          conversationId
        };
        stats.set(conversationId, entry);
      }
      return entry;
    };

    for (const event of events) {
      if (!event.conversationId) {
        continue;
      }
      const entry = ensureConversation(event.conversationId);
      entry.tenantId = entry.tenantId ?? event.tenantId;
      entry.agentId = entry.agentId ?? event.agentId;
      entry.channelId = entry.channelId ?? event.channelId;
      const occurredAt = new Date(event.timestamp);
      if (!entry.lastActivityAt || occurredAt > entry.lastActivityAt) {
        entry.lastActivityAt = occurredAt;
      }
      if (event.type === "conversation_started") {
        entry.startedAt = occurredAt;
      } else if (event.type === "message_sent") {
        const role = event.metadata && typeof event.metadata.role === "string" ? event.metadata.role : undefined;
        if (role === "assistant" && !entry.firstResponseAt) {
          entry.firstResponseAt = occurredAt;
        }
      } else if (event.type === "conversation_resolved") {
        entry.resolvedAt = occurredAt;
        const intent =
          event.metadata && typeof event.metadata.intent === "string" ? event.metadata.intent : undefined;
        if (intent) {
          entry.intent = intent;
        }
      } else if (event.type === "conversation_escalated") {
        entry.escalatedAt = occurredAt;
        const intent =
          event.metadata && typeof event.metadata.intent === "string" ? event.metadata.intent : undefined;
        if (intent) {
          entry.intent = intent;
        }
      } else if (event.type === "action_executed") {
        const actionType =
          event.metadata && typeof event.metadata.actionType === "string"
            ? event.metadata.actionType
            : undefined;
        if (actionType === "human_escalation") {
          entry.escalatedAt = entry.escalatedAt ?? occurredAt;
        }
      }
    }

    return stats;
  };

  const buildMetricsSummary = (events: MetricEvent[], window: { from: Date; to: Date }) => {
    const conversationStats = buildConversationStats(events);
    let deflected = 0;
    let escalated = 0;
    let firstResponseTotal = 0;
    let firstResponseCount = 0;
    let resolutionTotal = 0;
    let resolutionCount = 0;

    for (const entry of conversationStats.values()) {
      if (entry.escalatedAt) {
        escalated += 1;
      } else if (entry.resolvedAt) {
        deflected += 1;
      }

      if (entry.startedAt && entry.firstResponseAt) {
        firstResponseTotal += (entry.firstResponseAt.getTime() - entry.startedAt.getTime()) / 1000;
        firstResponseCount += 1;
      }

      const resolutionAt = entry.resolvedAt ?? entry.escalatedAt;
      if (entry.startedAt && resolutionAt) {
        resolutionTotal += (resolutionAt.getTime() - entry.startedAt.getTime()) / 1000;
        resolutionCount += 1;
      }
    }

    let retrievalTotal = 0;
    let retrievalCount = 0;
    let feedbackTotal = 0;
    let feedbackCount = 0;
    let actionCount = 0;
    let ingestionCount = 0;
    const intentCounts = new Map<string, number>();

    for (const event of events) {
      if (event.type === "retrieval_performed") {
        retrievalCount += 1;
        const latency =
          event.metadata && typeof event.metadata.latencyMs === "number"
            ? event.metadata.latencyMs
            : typeof event.value === "number"
              ? event.value
              : undefined;
        if (typeof latency === "number") {
          retrievalTotal += latency;
        }
      } else if (event.type === "feedback_received") {
        const rating =
          event.metadata && typeof event.metadata.rating === "number"
            ? event.metadata.rating
            : undefined;
        if (typeof rating === "number") {
          feedbackTotal += rating;
          feedbackCount += 1;
        }
      } else if (event.type === "action_executed") {
        actionCount += 1;
      } else if (event.type === "ingestion_completed") {
        ingestionCount += 1;
      } else if (
        (event.type === "conversation_resolved" || event.type === "conversation_escalated") &&
        event.metadata &&
        typeof event.metadata.intent === "string"
      ) {
        const intent = event.metadata.intent;
        intentCounts.set(intent, (intentCounts.get(intent) ?? 0) + 1);
      }
    }

    const totalConversations = conversationStats.size;
    const deflectionRate =
      deflected + escalated > 0 ? deflected / (deflected + escalated) : 0;
    const avgFirstResponseSeconds =
      firstResponseCount > 0 ? firstResponseTotal / firstResponseCount : 0;
    const avgResolutionSeconds =
      resolutionCount > 0 ? resolutionTotal / resolutionCount : 0;
    const avgRetrievalLatencyMs =
      retrievalCount > 0 ? retrievalTotal / retrievalCount : 0;
    const avgFeedbackRating =
      feedbackCount > 0 ? feedbackTotal / feedbackCount : 0;

    const topIntents = Array.from(intentCounts.entries())
      .map(([intent, count]) => ({ intent, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      window: {
        from: window.from.toISOString(),
        to: window.to.toISOString()
      },
      totals: {
        conversations: totalConversations,
        deflected,
        escalated,
        retrievals: retrievalCount,
        actions: actionCount,
        ingestionCompleted: ingestionCount,
        feedbackCount
      },
      rates: {
        deflectionRate,
        avgFirstResponseSeconds,
        avgResolutionSeconds,
        avgRetrievalLatencyMs,
        avgFeedbackRating
      },
      topIntents,
      series: buildMetricSeries(events, window)
    };
  };

  const buildConversationReview = (
    events: MetricEvent[],
    window: { from: Date; to: Date },
    scope: { tenantId?: string; agentId?: string; channelId?: string }
  ) => {
    const stats = buildConversationStats(events);
    const fromTime = window.from.getTime();
    const toTime = window.to.getTime();

    const isConversationInScope = (conversation: Conversation) => {
      if (scope.agentId && conversation.agentId !== scope.agentId) {
        return false;
      }
      if (scope.channelId && conversation.channelId !== scope.channelId) {
        return false;
      }
      if (scope.tenantId) {
        const tenantId = agents.get(conversation.agentId)?.tenantId;
        if (tenantId !== scope.tenantId) {
          return false;
        }
      }
      return true;
    };

    for (const conversation of conversations.values()) {
      if (!isConversationInScope(conversation)) {
        continue;
      }
      const startedAt = new Date(conversation.startedAt);
      if (startedAt.getTime() < fromTime || startedAt.getTime() > toTime) {
        continue;
      }
      const entry = stats.get(conversation.id);
      if (!entry) {
        stats.set(conversation.id, {
          conversationId: conversation.id,
          tenantId: agents.get(conversation.agentId)?.tenantId,
          agentId: conversation.agentId,
          channelId: conversation.channelId,
          startedAt,
          lastActivityAt: startedAt
        });
      } else if (!entry.startedAt) {
        entry.startedAt = startedAt;
      }
    }

    const summaries = Array.from(stats.values()).map((entry) => {
      const status = entry.escalatedAt ? "escalated" : entry.resolvedAt ? "closed" : "open";
      const firstResponseSeconds =
        entry.startedAt && entry.firstResponseAt
          ? (entry.firstResponseAt.getTime() - entry.startedAt.getTime()) / 1000
          : null;
      const resolutionAt = entry.resolvedAt ?? entry.escalatedAt;
      const resolutionSeconds =
        entry.startedAt && resolutionAt
          ? (resolutionAt.getTime() - entry.startedAt.getTime()) / 1000
          : null;
      return {
        conversationId: entry.conversationId,
        tenantId: entry.tenantId,
        agentId: entry.agentId,
        channelId: entry.channelId,
        status,
        startedAt: entry.startedAt ? entry.startedAt.toISOString() : undefined,
        firstResponseSeconds,
        resolutionSeconds,
        lastActivityAt: entry.lastActivityAt ? entry.lastActivityAt.toISOString() : undefined,
        intent: entry.intent
      };
    });

    summaries.sort((a, b) => {
      const aTime = a.lastActivityAt ? new Date(a.lastActivityAt).getTime() : 0;
      const bTime = b.lastActivityAt ? new Date(b.lastActivityAt).getTime() : 0;
      return bTime - aTime;
    });

    return summaries;
  };

  fastify.get("/health", async () => ({ status: "ok" }));

  fastify.post("/tenants", async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) {
      return;
    }
    const data = tenantSchema.parse(request.body);
    const id = `tenant_${crypto.randomUUID()}`;
    const tenant: Tenant = {
      id,
      name: data.name,
      plan: data.plan,
      region: data.region,
      dataResidency: data.dataResidency,
      createdAt: new Date().toISOString()
    };
    tenants.set(id, tenant);
    const member: TenantMember = {
      id: `member_${crypto.randomUUID()}`,
      tenantId: id,
      userId,
      role: "owner",
      createdAt: new Date().toISOString()
    };
    tenantMembers.set(getTenantMemberKey(id, userId), member);
    retentionPolicies.set(id, {
      tenantId: id,
      days: defaultRetentionDays,
      enabled: true,
      updatedAt: new Date().toISOString(),
      updatedBy: userId
    });
    recordAuditEvent({
      tenantId: id,
      actorId: userId,
      action: "tenant.created"
    });
    return reply.code(201).send(tenant);
  });

  fastify.get("/tenants", async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) {
      return;
    }
    const allowedTenantIds = getTenantIdsForUser(userId);
    return {
      items: Array.from(tenants.values()).filter((tenant) =>
        allowedTenantIds.has(tenant.id)
      )
    };
  });

  fastify.get("/tenants/:tenantId/members", async (request, reply) => {
    const paramsSchema = z.object({ tenantId: z.string().min(1) });
    const { tenantId } = paramsSchema.parse(request.params);
    if (!tenants.has(tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "viewer");
    if (!access) {
      return;
    }
    const items = Array.from(tenantMembers.values()).filter(
      (member) => member.tenantId === tenantId
    );
    return { items };
  });

  fastify.post("/tenants/:tenantId/members", async (request, reply) => {
    const paramsSchema = z.object({ tenantId: z.string().min(1) });
    const { tenantId } = paramsSchema.parse(request.params);
    if (!tenants.has(tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "admin");
    if (!access) {
      return;
    }
    const data = tenantMemberInputSchema.parse(request.body);
    if (data.role === "owner" && access.membership.role !== "owner") {
      return reply.code(403).send({ error: "owner_required" });
    }
    const key = getTenantMemberKey(tenantId, data.userId);
    const existing = tenantMembers.get(key);
    const member: TenantMember = existing ?? {
      id: `member_${crypto.randomUUID()}`,
      tenantId,
      userId: data.userId,
      role: data.role,
      createdAt: new Date().toISOString()
    };
    member.role = data.role;
    tenantMembers.set(key, member);
    recordAuditEvent({
      tenantId,
      actorId: access.userId,
      action: existing ? "member.updated" : "member.added",
      targetId: member.userId,
      metadata: { role: member.role }
    });
    return reply.code(existing ? 200 : 201).send({ member });
  });

  fastify.get("/tenants/:tenantId/gdpr/retention", async (request, reply) => {
    const paramsSchema = z.object({ tenantId: z.string().min(1) });
    const { tenantId } = paramsSchema.parse(request.params);
    if (!tenants.has(tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "viewer");
    if (!access) {
      return;
    }
    const policy =
      retentionPolicies.get(tenantId) ??
      ({
        tenantId,
        days: defaultRetentionDays,
        enabled: true,
        updatedAt: new Date().toISOString(),
        updatedBy: "system"
      } satisfies RetentionPolicy);
    if (!retentionPolicies.has(tenantId)) {
      retentionPolicies.set(tenantId, policy);
    }
    return { policy };
  });

  fastify.put("/tenants/:tenantId/gdpr/retention", async (request, reply) => {
    const paramsSchema = z.object({ tenantId: z.string().min(1) });
    const { tenantId } = paramsSchema.parse(request.params);
    if (!tenants.has(tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "admin");
    if (!access) {
      return;
    }
    const update = retentionPolicyInputSchema.parse(request.body);
    const current =
      retentionPolicies.get(tenantId) ??
      ({
        tenantId,
        days: defaultRetentionDays,
        enabled: true,
        updatedAt: new Date().toISOString(),
        updatedBy: "system"
      } satisfies RetentionPolicy);
    const policy: RetentionPolicy = {
      tenantId,
      days: update.days ?? current.days,
      enabled: update.enabled ?? current.enabled,
      updatedAt: new Date().toISOString(),
      updatedBy: access.userId
    };
    retentionPolicies.set(tenantId, policy);
    recordAuditEvent({
      tenantId,
      actorId: access.userId,
      action: "retention.updated",
      metadata: { days: policy.days, enabled: policy.enabled }
    });
    const removed = applyRetentionForTenant(tenantId, access.userId);
    return { policy, removed };
  });

  fastify.post("/admin/tenants/:tenantId/quota", async (request, reply) => {
    const paramsSchema = z.object({ tenantId: z.string().min(1) });
    const { tenantId } = paramsSchema.parse(request.params);
    if (!tenants.has(tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "admin");
    if (!access) {
      return;
    }
    const update = tenantQuotaUpdateSchema.parse(request.body);
    const now = new Date();
    const current = ensureTenantQuotaEntry(tenantId, now);
    const next: TenantQuotaUsage = {
      ...current
    };

    if (update.limit !== undefined) {
      next.quotaLimit = update.limit;
    }
    if (update.reset) {
      next.used = 0;
      next.periodStart = getTenantQuotaPeriodStart(now);
      tenantRateLimitState.delete(tenantId);
    }
    const nextLimit = getTenantQuotaLimit(next);
    if (update.used !== undefined) {
      next.used = Math.min(update.used, nextLimit);
    } else {
      next.used = Math.min(next.used, nextLimit);
    }
    tenantQuotaUsage.set(tenantId, next);
    queueRuntimeStatePersist();

    const snapshot = buildTenantQuotaSnapshot(tenantId, now);
    recordAuditEvent({
      tenantId,
      actorId: access.userId,
      action: "quota.updated",
      metadata: {
        reset: update.reset ?? false,
        used: snapshot.entry.used,
        limit: snapshot.limit
      }
    });

    return {
      tenantId,
      quota: {
        used: snapshot.entry.used,
        limit: snapshot.limit,
        remaining: snapshot.remaining,
        periodStart: snapshot.entry.periodStart,
        periodEnd: snapshot.periodEnd
      }
    };
  });

  fastify.post("/tenants/:tenantId/gdpr/deletion-requests", async (request, reply) => {
    const paramsSchema = z.object({ tenantId: z.string().min(1) });
    const { tenantId } = paramsSchema.parse(request.params);
    if (!tenants.has(tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "admin");
    if (!access) {
      return;
    }
    const payload = gdprDeletionSchema.parse(request.body);
    if (payload.agentId) {
      const agentTenant = getTenantIdForAgent(payload.agentId);
      if (!agentTenant) {
        return reply.code(404).send({ error: "agent_not_found" });
      }
      if (agentTenant !== tenantId) {
        return reply.code(403).send({ error: "tenant_access_denied" });
      }
    }
    const toDelete = new Set<string>();
    if (payload.conversationId) {
      const conversationTenant = getTenantIdForConversation(payload.conversationId);
      if (!conversationTenant) {
        return reply.code(404).send({ error: "conversation_not_found" });
      }
      if (conversationTenant !== tenantId) {
        return reply.code(403).send({ error: "tenant_access_denied" });
      }
      toDelete.add(payload.conversationId);
    }
    if (payload.userId) {
      for (const conversation of conversations.values()) {
        if (conversation.userId !== payload.userId) {
          continue;
        }
        const conversationTenantId = getTenantIdForAgent(conversation.agentId);
        if (conversationTenantId !== tenantId) {
          continue;
        }
        if (payload.agentId && conversation.agentId !== payload.agentId) {
          continue;
        }
        toDelete.add(conversation.id);
      }
    }
    const removed = removeConversations(tenantId, toDelete);
    let deletedChunks = 0;
    if (payload.deleteVectorData && payload.agentId) {
      const agent = agents.get(payload.agentId);
      if (agent) {
        const tenant = tenants.get(tenantId);
        if (tenant) {
          deletedChunks = await vectorStore.deleteByAgentId(tenant.region, payload.agentId);
        }
      }
    }
    recordAuditEvent({
      tenantId,
      actorId: access.userId,
      action: "gdpr.deletion_requested",
      metadata: {
        userId: payload.userId,
        conversationId: payload.conversationId,
        agentId: payload.agentId,
        deletedConversations: removed.removedConversations,
        deletedMetrics: removed.removedMetrics,
        deletedChunks
      }
    });
    return {
      deletedConversations: removed.removedConversations,
      deletedMetrics: removed.removedMetrics,
      deletedChunks,
      requestedAt: new Date().toISOString()
    };
  });

  fastify.get("/tenants/:tenantId/audit-logs", async (request, reply) => {
    const paramsSchema = z.object({ tenantId: z.string().min(1) });
    const querySchema = z.object({
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      action: z.string().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(200).optional(),
      offset: z.coerce.number().int().min(0).optional()
    });
    const { tenantId } = paramsSchema.parse(request.params);
    if (!tenants.has(tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "viewer");
    if (!access) {
      return;
    }
    const query = querySchema.parse(request.query);
    const from = query.from ? new Date(query.from).getTime() : Number.NEGATIVE_INFINITY;
    const to = query.to ? new Date(query.to).getTime() : Number.POSITIVE_INFINITY;
    let items = auditEvents.filter((event) => event.tenantId === tenantId);
    if (query.action) {
      items = items.filter((event) => event.action === query.action);
    }
    items = items.filter((event) => {
      const timestamp = new Date(event.createdAt).getTime();
      return timestamp >= from && timestamp <= to;
    });
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const limit = query.limit ?? 100;
    const offset = query.offset ?? 0;
    return { items: items.slice(offset, offset + limit) };
  });

  fastify.post("/agents", async (request, reply) => {
    const data = agentSchema.parse(request.body);
    if (!tenants.has(data.tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, data.tenantId, "member");
    if (!access) {
      return;
    }
    const id = `agent_${crypto.randomUUID()}`;
    const agent: Agent = {
      id,
      tenantId: data.tenantId,
      name: data.name,
      basePrompt: data.basePrompt,
      model: data.model,
      retrievalConfig: data.retrievalConfig,
      status: "draft",
      createdAt: new Date().toISOString()
    };
    agents.set(id, agent);
    return reply.code(201).send(agent);
  });

  fastify.get("/agents", async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) {
      return;
    }
    const allowedTenantIds = getTenantIdsForUser(userId);
    const items = Array.from(agents.values()).filter((agent) =>
      allowedTenantIds.has(agent.tenantId)
    );
    return { items };
  });

  fastify.patch("/agents/:agentId", async (request, reply) => {
    const paramsSchema = z.object({ agentId: z.string().min(1) });
    const { agentId } = paramsSchema.parse(request.params);
    const parsedBody = agentSettingsUpdateSchema.safeParse(request.body);
    if (!parsedBody.success) {
      return reply.code(400).send({ error: "invalid_agent_settings" });
    }
    const existingAgent = agents.get(agentId);
    if (!existingAgent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, existingAgent.tenantId, "admin");
    if (!access) {
      return;
    }
    const updatedAgent: Agent = {
      ...existingAgent,
      ...parsedBody.data
    };
    agents.set(existingAgent.id, updatedAgent);
    recordAuditEvent({
      tenantId: existingAgent.tenantId,
      actorId: access.userId,
      action: "agent.settings_updated",
      targetId: existingAgent.id,
      metadata: {
        updatedFields: Object.keys(parsedBody.data)
      }
    });
    return { agent: updatedAgent };
  });

  fastify.post("/actions", async (request, reply) => {
    const data = actionSchema.parse(request.body);
    if (!agents.has(data.agentId)) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const tenantId = getTenantIdForAgent(data.agentId);
    if (!tenantId) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "member");
    if (!access) {
      return;
    }
    let normalizedConfig: Record<string, unknown> | undefined;
    try {
      normalizedConfig = normalizeActionConfig(data.type, data.config);
    } catch (error) {
      if (isTypedError(error)) {
        const serialized = serializeTypedError(error);
        return reply.code(serialized.statusCode).send({
          error: serialized.error,
          ...(serialized.details ? { details: serialized.details } : {})
        });
      }
      throw error;
    }
    const id = `action_${crypto.randomUUID()}`;
    const action: Action = {
      id,
      agentId: data.agentId,
      type: data.type,
      config: normalizedConfig,
      enabled: data.enabled ?? true,
      createdAt: new Date().toISOString()
    };
    actions.set(id, action);
    return reply.code(201).send(action);
  });

  fastify.get("/actions", async (request, reply) => {
    const schema = z.object({ agentId: z.string().optional() });
    const data = schema.parse(request.query);
    const userId = requireUserId(request, reply);
    if (!userId) {
      return;
    }
    const allowedTenantIds = getTenantIdsForUser(userId);
    if (data.agentId) {
      const tenantId = getTenantIdForAgent(data.agentId);
      if (!tenantId) {
        return reply.code(404).send({ error: "agent_not_found" });
      }
      if (!allowedTenantIds.has(tenantId)) {
        return reply.code(403).send({ error: "tenant_access_denied" });
      }
      const items = Array.from(actions.values()).filter(
        (action) => action.agentId === data.agentId
      );
      return { items };
    }
    const items = Array.from(actions.values()).filter((action) => {
      const tenantId = getTenantIdForAgent(action.agentId);
      return tenantId ? allowedTenantIds.has(tenantId) : false;
    });
    return { items };
  });

  fastify.get("/actions/:id", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const action = actions.get(id);
    if (!action) {
      return reply.code(404).send({ error: "action_not_found" });
    }
    const tenantId = getTenantIdForAgent(action.agentId);
    if (!tenantId) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "viewer");
    if (!access) {
      return;
    }
    return { action };
  });

  fastify.post("/actions/:id/execute", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const action = actions.get(id);
    if (!action) {
      return reply.code(404).send({ error: "action_not_found" });
    }
    const tenantId = getTenantIdForAgent(action.agentId);
    if (!tenantId) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "member");
    if (!access) {
      return;
    }
    if (!action.enabled) {
      return reply.code(403).send({ error: "action_disabled" });
    }
    const limit = enforceTenantLimits(reply, tenantId);
    if (!limit) {
      return;
    }
    const payload =
      request.body && typeof request.body === "object"
        ? (request.body as Record<string, unknown>)
        : {};
    try {
      const { input, output } = executeAction(action, payload);
      const execution: ActionExecution = {
        id: `execution_${crypto.randomUUID()}`,
        actionId: action.id,
        type: action.type,
        status: "success",
        input,
        output,
        createdAt: new Date().toISOString()
      };
      actionExecutions.set(execution.id, execution);
      const conversationId =
        typeof payload.conversationId === "string"
          ? payload.conversationId
          : typeof payload.metadata === "object" &&
              payload.metadata !== null &&
              typeof (payload.metadata as Record<string, unknown>).conversationId === "string"
            ? ((payload.metadata as Record<string, unknown>).conversationId as string)
            : undefined;
      recordMetricEvent({
        type: "action_executed",
        agentId: action.agentId,
        conversationId,
        timestamp: execution.createdAt,
        metadata: {
          actionType: action.type,
          status: execution.status
        }
      });
      return { execution };
    } catch (error) {
      if (isTypedError(error)) {
        const serialized = serializeTypedError(error);
        return reply.code(serialized.statusCode).send({
          error: serialized.error,
          ...(serialized.details ? { details: serialized.details } : {})
        });
      }
      throw error;
    }
  });

  fastify.post("/channels", async (request, reply) => {
    const data = channelSchema.parse(request.body);
    if (!agents.has(data.agentId)) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const tenantId = getTenantIdForAgent(data.agentId);
    if (!tenantId) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "member");
    if (!access) {
      return;
    }
    const id = `channel_${crypto.randomUUID()}`;
    const normalizedConfig = normalizeChannelConfig(data.config);
    const channel: Channel = {
      id,
      agentId: data.agentId,
      type: data.type,
      config: normalizedConfig,
      enabled: data.enabled ?? true,
      createdAt: new Date().toISOString()
    };
    channels.set(id, channel);
    return reply.code(201).send(channel);
  });

  fastify.get("/channels", async (request, reply) => {
    const querySchema = z.object({ agentId: z.string().min(1).optional() });
    const query = querySchema.parse(request.query);
    const userId = requireUserId(request, reply);
    if (!userId) {
      return;
    }
    const allowedTenantIds = getTenantIdsForUser(userId);
    if (query.agentId) {
      const tenantId = getTenantIdForAgent(query.agentId);
      if (!tenantId) {
        return reply.code(404).send({ error: "agent_not_found" });
      }
      if (!allowedTenantIds.has(tenantId)) {
        return reply.code(403).send({ error: "tenant_access_denied" });
      }
      const items = Array.from(channels.values()).filter(
        (channel) => channel.agentId === query.agentId
      );
      return { items };
    }
    const items = Array.from(channels.values()).filter((channel) => {
      const tenantId = getTenantIdForAgent(channel.agentId);
      return tenantId ? allowedTenantIds.has(tenantId) : false;
    });
    return { items };
  });

  fastify.get("/channels/:id", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const channel = channels.get(id);
    if (!channel) {
      return reply.code(404).send({ error: "channel_not_found" });
    }
    const tenantId = getTenantIdForAgent(channel.agentId);
    if (!tenantId) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "viewer");
    if (!access) {
      return;
    }
    return { channel };
  });

  fastify.patch("/channels/:id", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const channel = channels.get(id);
    if (!channel) {
      return reply.code(404).send({ error: "channel_not_found" });
    }
    const tenantId = getTenantIdForAgent(channel.agentId);
    if (!tenantId) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "member");
    if (!access) {
      return;
    }
    const update = channelUpdateSchema.parse(request.body);
    const mergedConfig = normalizeChannelConfig({
      ...(channel.config ?? {}),
      ...(update.config ?? {})
    });
    if (connectorChannelTypes.has(channel.type) && !mergedConfig.authToken) {
      return reply.code(400).send({ error: "auth_token_required" });
    }
    const updated: Channel = {
      ...channel,
      config: mergedConfig,
      enabled: update.enabled ?? channel.enabled
    };
    channels.set(id, updated);
    return { channel: updated };
  });

  fastify.get("/channels/:id/webhook", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const channel = channels.get(id);
    if (!channel) {
      return reply.code(404).send({ error: "channel_not_found" });
    }
    if (!connectorChannelTypes.has(channel.type)) {
      return reply.code(400).send({ error: "channel_webhook_not_supported" });
    }
    if (
      channel.type !== "whatsapp" &&
      channel.type !== "messenger" &&
      channel.type !== "instagram"
    ) {
      return reply.code(400).send({ error: "channel_webhook_not_supported" });
    }
    const querySchema = z
      .object({
        "hub.mode": z.string().optional(),
        "hub.verify_token": z.string().optional(),
        "hub.challenge": z.string().optional(),
        challenge: z.string().optional()
      })
      .passthrough();
    const query = querySchema.parse(request.query);
    const mode = query["hub.mode"];
    const verifyToken = query["hub.verify_token"];
    const challenge = query["hub.challenge"] ?? query.challenge;
    const configuredToken = channel.config?.verifyToken ?? channel.config?.authToken;
    if (!configuredToken) {
      return reply.code(403).send({ error: "channel_auth_not_configured" });
    }
    if (mode === "subscribe" && verifyToken === configuredToken && challenge) {
      reply.header("content-type", "text/plain; charset=utf-8");
      return reply.send(challenge);
    }
    return reply.code(403).send({ error: "channel_unauthorized" });
  });

  fastify.post("/channels/:id/webhook", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const channel = channels.get(id);
    if (!channel) {
      return reply.code(404).send({ error: "channel_not_found" });
    }
    if (!channel.enabled) {
      return reply.code(403).send({ error: "channel_disabled" });
    }
    if (!connectorChannelTypes.has(channel.type)) {
      return reply.code(400).send({ error: "channel_webhook_not_supported" });
    }
    const authResult = requireConnectorAuth(channel, request.headers);
    if (!authResult.ok) {
      return reply.code(authResult.statusCode).send({ error: authResult.error });
    }
    const payload = request.body;
    if (!isRecord(payload)) {
      return reply.code(400).send({ error: "invalid_payload" });
    }
    // Parse BEFORE rate limiting so that Slack URL-verification challenges and
    // ignored connector events (retries, bot-echoes, etc.) cannot be throttled
    // or consume tenant quota. Only genuine inbound messages should count.
    const parsed = parseChannelWebhookPayload(channel.type, payload);
    if (parsed.kind === "challenge") {
      return reply.send({ challenge: parsed.challenge });
    }
    if (parsed.kind === "ignored") {
      return reply.code(202).send({ status: "ignored" });
    }
    if (parsed.kind === "error") {
      return reply.code(400).send({ error: parsed.error });
    }
    const tenantId = getTenantIdForAgent(channel.agentId);
    if (!tenantId) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const limit = enforceTenantLimits(reply, tenantId);
    if (!limit) {
      return;
    }
    try {
      const result = await processInboundChannelMessage({
        channel,
        inbound: parsed.message
      });
      return reply.send({
        channelId: channel.id,
        conversationId: result.conversation.id,
        reply: result.reply,
        prompt: result.prompt,
        metadata: result.metadata
      });
    } catch (error) {
      if (isTypedError(error)) {
        const serialized = serializeTypedError(error);
        return reply.code(serialized.statusCode).send({
          error: serialized.error,
          ...(serialized.details ? { details: serialized.details } : {})
        });
      }
      throw error;
    }
  });

  fastify.post("/channels/:id/twilio/voice", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const querySchema = z.object({ prompt: z.string().min(1).optional() }).passthrough();
    const { id } = paramsSchema.parse(request.params);
    const query = querySchema.parse(request.query);
    const channel = channels.get(id);
    if (!channel) {
      return reply.code(404).send({ error: "channel_not_found" });
    }
    if (channel.type !== "voice_agent") {
      return reply.code(400).send({ error: "twilio_voice_channel_required" });
    }
    if (!channel.enabled) {
      return reply.code(403).send({ error: "channel_disabled" });
    }
    const twilioSettings = resolveTwilioChannelSettings(channel);
    if (twilioSettings.validateSignature && !twilioSettings.authToken) {
      return reply.code(400).send({ error: "twilio_auth_token_required" });
    }
    const payload = isRecord(request.body) ? request.body : {};
    const requestUrl = buildExternalUrl({
      routePath: request.raw.url ?? `/channels/${channel.id}/twilio/voice`,
      headers: request.headers,
      fallbackProtocol: request.protocol,
      configuredBaseUrl: twilioSettings.webhookBaseUrl
    });
    if (!requestUrl) {
      return reply.code(400).send({ error: "twilio_webhook_base_url_required" });
    }
    const signature = getHeaderString(request.headers["x-twilio-signature"]);
    const validRequest = validateTwilioWebhookRequest({
      settings: twilioSettings,
      signature,
      requestUrl,
      body: payload
    });
    if (!validRequest) {
      return reply.code(401).send({ error: "twilio_signature_invalid" });
    }
    const initialPrompt = query.prompt?.trim() || twilioSettings.initialPrompt;
    if (twilioSettings.realtimeEnabled) {
      if (!azureOpenAIRealtimeConfig) {
        return reply.code(400).send({ error: "twilio_realtime_not_configured" });
      }
      const realtimeStreamUrl = buildExternalUrl({
        routePath: `/channels/${channel.id}/twilio/realtime/stream`,
        headers: request.headers,
        fallbackProtocol: request.protocol,
        configuredBaseUrl: twilioSettings.webhookBaseUrl
      });
      if (!realtimeStreamUrl) {
        return reply.code(400).send({ error: "twilio_webhook_base_url_required" });
      }
      const streamUrl = new URL(realtimeStreamUrl);
      streamUrl.protocol = streamUrl.protocol === "http:" ? "ws:" : "wss:";
      const token = issueTwilioRealtimeStreamToken({
        tokens: twilioRealtimeStreamTokens,
        channelId: channel.id
      });
      streamUrl.searchParams.set("token", token);
      const realtimeTwiml = createTwimlRealtimeStreamResponse({
        streamUrl: streamUrl.toString(),
        prompt: initialPrompt,
        language: twilioSettings.language,
        voice: twilioSettings.voice
      });
      reply.header("content-type", "text/xml; charset=utf-8");
      return reply.send(realtimeTwiml);
    }
    const turnUrl = buildExternalUrl({
      routePath: `/channels/${channel.id}/twilio/turn`,
      headers: request.headers,
      fallbackProtocol: request.protocol,
      configuredBaseUrl: twilioSettings.webhookBaseUrl
    });
    if (!turnUrl) {
      return reply.code(400).send({ error: "twilio_webhook_base_url_required" });
    }
    const twiml = createTwimlGatherResponse({
      prompt: initialPrompt,
      actionUrl: turnUrl,
      language: twilioSettings.language,
      voice: twilioSettings.voice
    });
    reply.header("content-type", "text/xml; charset=utf-8");
    return reply.send(twiml);
  });

  fastify.get(
    "/channels/:id/twilio/realtime/stream",
    { websocket: true },
    (connection, request) => {
      const paramsSchema = z.object({ id: z.string().min(1) });
      const querySchema = z.object({ token: z.string().min(1) });
      const closeSocket = (code: number, reason: string) => {
        try {
          connection.socket.close(code, reason);
        } catch {
          // no-op
        }
      };

      let channelId: string;
      let token: string;
      try {
        const params = paramsSchema.parse(request.params);
        const query = querySchema.parse(request.query);
        channelId = params.id;
        token = query.token;
      } catch {
        closeSocket(1008, "invalid_request");
        return;
      }

      const channel = channels.get(channelId);
      if (!channel || channel.type !== "voice_agent" || !channel.enabled) {
        closeSocket(1008, "channel_unavailable");
        return;
      }
      const twilioSettings = resolveTwilioChannelSettings(channel);
      if (!twilioSettings.realtimeEnabled) {
        closeSocket(1008, "twilio_realtime_disabled");
        return;
      }
      if (!azureOpenAIRealtimeConfig) {
        closeSocket(1011, "realtime_not_configured");
        return;
      }
      const isTokenValid = consumeTwilioRealtimeStreamToken({
        tokens: twilioRealtimeStreamTokens,
        token,
        channelId
      });
      if (!isTokenValid) {
        closeSocket(1008, "invalid_stream_token");
        return;
      }

      const agent = agents.get(channel.agentId);
      const realtimeInstructions =
        twilioSettings.realtimeInstructions ??
        getTrimmedValue(agent?.basePrompt) ??
        azureOpenAIRealtimeConfig.instructions ??
        "You are a helpful support voice assistant for a Norwegian business. Keep answers concise and practical.";
      const realtimeVoice =
        twilioSettings.realtimeVoice ?? azureOpenAIRealtimeConfig.voice;

      let streamSid: string | undefined;
      let realtimeSocket: OpenAIRealtimeWS | undefined;
      let realtimeReady = false;
      let closed = false;
      const pendingAudioFrames: string[] = [];

      const sendRealtimeAudioFrame = (audioPayload: string) => {
        if (!realtimeSocket || !realtimeReady) {
          pendingAudioFrames.push(audioPayload);
          if (pendingAudioFrames.length > 1200) {
            pendingAudioFrames.shift();
          }
          return;
        }
        realtimeSocket.send({
          type: "input_audio_buffer.append",
          audio: audioPayload
        });
      };

      const sendToTwilio = (payload: Record<string, unknown>) => {
        if (closed || connection.socket.readyState !== 1) {
          return;
        }
        connection.socket.send(JSON.stringify(payload));
      };

      const shutdown = (input: {
        reason: string;
        twilioCode?: number;
        closeTwilioSocket?: boolean;
      }) => {
        if (closed) {
          return;
        }
        closed = true;
        if (realtimeSocket) {
          realtimeSocket.close({
            code: 1000,
            reason: input.reason
          });
        }
        if (input.closeTwilioSocket !== false && connection.socket.readyState < 2) {
          closeSocket(input.twilioCode ?? 1000, input.reason);
        }
      };

      connection.socket.on("message", (rawMessage: unknown) => {
        if (closed) {
          return;
        }
        const rawText =
          typeof rawMessage === "string"
            ? rawMessage
            : Buffer.isBuffer(rawMessage)
              ? rawMessage.toString("utf8")
              : rawMessage instanceof ArrayBuffer
                ? Buffer.from(rawMessage).toString("utf8")
                : Array.isArray(rawMessage)
                  ? Buffer.concat(rawMessage).toString("utf8")
                  : "";
        if (!rawText) {
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(rawText);
        } catch {
          return;
        }
        if (!isRecord(parsed)) {
          return;
        }
        const eventType = getString(parsed.event);
        if (!eventType) {
          return;
        }
        if (eventType === "start") {
          const start = getRecord(parsed.start);
          streamSid = getString(start?.streamSid);
          return;
        }
        if (eventType === "media") {
          const media = getRecord(parsed.media);
          const audioPayload = getString(media?.payload);
          if (!audioPayload) {
            return;
          }
          sendRealtimeAudioFrame(audioPayload);
          return;
        }
        if (eventType === "stop") {
          shutdown({ reason: "twilio_stream_stopped", closeTwilioSocket: false });
        }
      });

      connection.socket.on("close", () => {
        shutdown({ reason: "twilio_stream_closed", closeTwilioSocket: false });
      });

      connection.socket.on("error", (error: unknown) => {
        fastify.log.error(
          {
            err: error,
            channelId
          },
          "twilio media stream socket error"
        );
        shutdown({ reason: "twilio_stream_error", closeTwilioSocket: false });
      });

      void (async () => {
        try {
          realtimeSocket = await createAzureOpenAIRealtimeSocket(azureOpenAIRealtimeConfig);
          realtimeSocket.on("response.output_audio.delta", (event) => {
            if (!streamSid || !event.delta) {
              return;
            }
            sendToTwilio({
              event: "media",
              streamSid,
              media: {
                payload: event.delta
              }
            });
          });
          realtimeSocket.on("input_audio_buffer.speech_started", () => {
            if (!streamSid) {
              return;
            }
            sendToTwilio({
              event: "clear",
              streamSid
            });
          });
          realtimeSocket.on("error", (error) => {
            fastify.log.error(
              {
                err: error,
                channelId
              },
              "azure realtime websocket error"
            );
            shutdown({ reason: "realtime_error", twilioCode: 1011 });
          });

          realtimeSocket.send({
            type: "session.update",
            session: {
              type: "realtime",
              instructions: realtimeInstructions,
              output_modalities: ["audio"],
              audio: {
                input: {
                  format: { type: "audio/pcmu" },
                  turn_detection: {
                    type: "server_vad",
                    create_response: true,
                    interrupt_response: true
                  }
                },
                output: {
                  format: { type: "audio/pcmu" },
                  voice: realtimeVoice
                }
              },
              max_output_tokens: azureOpenAIRealtimeConfig.maxOutputTokens
            }
          });
          realtimeReady = true;
          for (const frame of pendingAudioFrames) {
            sendRealtimeAudioFrame(frame);
          }
          pendingAudioFrames.length = 0;
        } catch (error) {
          fastify.log.error(
            {
              err: error,
              channelId
            },
            "failed to initialize azure realtime stream"
          );
          shutdown({ reason: "realtime_connection_failed", twilioCode: 1011 });
        }
      })();
    }
  );

  fastify.post("/channels/:id/twilio/turn", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const channel = channels.get(id);
    if (!channel) {
      return reply.code(404).send({ error: "channel_not_found" });
    }
    if (channel.type !== "voice_agent") {
      return reply.code(400).send({ error: "twilio_voice_channel_required" });
    }
    if (!channel.enabled) {
      return reply.code(403).send({ error: "channel_disabled" });
    }
    const twilioSettings = resolveTwilioChannelSettings(channel);
    if (twilioSettings.validateSignature && !twilioSettings.authToken) {
      return reply.code(400).send({ error: "twilio_auth_token_required" });
    }
    const payload = isRecord(request.body) ? request.body : {};
    const requestUrl = buildExternalUrl({
      routePath: request.raw.url ?? `/channels/${channel.id}/twilio/turn`,
      headers: request.headers,
      fallbackProtocol: request.protocol,
      configuredBaseUrl: twilioSettings.webhookBaseUrl
    });
    if (!requestUrl) {
      return reply.code(400).send({ error: "twilio_webhook_base_url_required" });
    }
    const signature = getHeaderString(request.headers["x-twilio-signature"]);
    const validRequest = validateTwilioWebhookRequest({
      settings: twilioSettings,
      signature,
      requestUrl,
      body: payload
    });
    if (!validRequest) {
      return reply.code(401).send({ error: "twilio_signature_invalid" });
    }
    const turnUrl = buildExternalUrl({
      routePath: `/channels/${channel.id}/twilio/turn`,
      headers: request.headers,
      fallbackProtocol: request.protocol,
      configuredBaseUrl: twilioSettings.webhookBaseUrl
    });
    if (!turnUrl) {
      return reply.code(400).send({ error: "twilio_webhook_base_url_required" });
    }
    const transcript = pickFirstString(
      payload.SpeechResult,
      payload.TranscriptionText,
      payload.transcript,
      payload.text
    );
    if (!transcript) {
      const repromptTwiml = createTwimlGatherResponse({
        prompt: "Beklager, jeg fikk ikke med meg svaret ditt.",
        actionUrl: turnUrl,
        language: twilioSettings.language,
        voice: twilioSettings.voice
      });
      reply.header("content-type", "text/xml; charset=utf-8");
      return reply.send(repromptTwiml);
    }
    const inboundMessage: InboundMessage = {
      message: transcript,
      userId: pickFirstString(payload.From, payload.Caller),
      threadKey: pickFirstString(payload.CallSid, payload.SessionSid),
      metadata: {
        provider: "twilio",
        callSid: pickFirstString(payload.CallSid),
        accountSid: pickFirstString(payload.AccountSid),
        from: pickFirstString(payload.From),
        to: pickFirstString(payload.To),
        speechConfidence: pickFirstString(payload.Confidence)
      }
    };
    try {
      const result = await processInboundChannelMessage({
        channel,
        inbound: inboundMessage
      });
      const replyRecord = getRecord(result.reply);
      const speechRecord = getRecord(replyRecord?.["speech"]);
      const speechText = pickFirstString(
        speechRecord?.["text"],
        replyRecord?.["message"],
        twilioSettings.reprompt
      );
      const followupPrompt = `${speechText ?? twilioSettings.reprompt} ${twilioSettings.reprompt}`.trim();
      const twiml = createTwimlGatherResponse({
        prompt: followupPrompt,
        actionUrl: turnUrl,
        language: twilioSettings.language,
        voice: twilioSettings.voice
      });
      reply.header("content-type", "text/xml; charset=utf-8");
      return reply.send(twiml);
    } catch (error) {
      if (isTypedError(error)) {
        const serialized = serializeTypedError(error);
        return reply.code(serialized.statusCode).send({
          error: serialized.error,
          ...(serialized.details ? { details: serialized.details } : {})
        });
      }
      throw error;
    }
  });

  fastify.post("/channels/:id/twilio/calls", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const payloadSchema = z.object({
      to: z.string().min(3),
      from: z.string().min(3).optional(),
      webhookBaseUrl: z.string().url().optional(),
      initialPrompt: z.string().min(1).max(300).optional()
    });
    const { id } = paramsSchema.parse(request.params);
    const payload = payloadSchema.parse(request.body);
    const channel = channels.get(id);
    if (!channel) {
      return reply.code(404).send({ error: "channel_not_found" });
    }
    if (channel.type !== "voice_agent") {
      return reply.code(400).send({ error: "twilio_voice_channel_required" });
    }
    if (!channel.enabled) {
      return reply.code(403).send({ error: "channel_disabled" });
    }
    const tenantId = getTenantIdForAgent(channel.agentId);
    if (!tenantId) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "member");
    if (!access) {
      return;
    }
    const twilioSettings = resolveTwilioChannelSettings(channel);
    const accountSid = twilioSettings.accountSid;
    if (!accountSid) {
      return reply.code(400).send({ error: "twilio_account_sid_required" });
    }
    if (
      !twilioSettings.authToken &&
      !(twilioSettings.apiKeySid && twilioSettings.apiKeySecret)
    ) {
      return reply.code(400).send({ error: "twilio_credentials_missing" });
    }
    const from = payload.from ?? twilioSettings.fromNumber;
    if (!from) {
      return reply.code(400).send({ error: "twilio_from_number_required" });
    }
    const voiceUrl = buildExternalUrl({
      routePath: `/channels/${channel.id}/twilio/voice`,
      headers: request.headers,
      fallbackProtocol: request.protocol,
      configuredBaseUrl: payload.webhookBaseUrl ?? twilioSettings.webhookBaseUrl
    });
    if (!voiceUrl) {
      return reply.code(400).send({ error: "twilio_webhook_base_url_required" });
    }
    const url = new URL(voiceUrl);
    if (payload.initialPrompt) {
      url.searchParams.set("prompt", payload.initialPrompt);
    }
    try {
      const call = await twilioCallCreator({
        accountSid,
        authToken: twilioSettings.authToken,
        apiKeySid: twilioSettings.apiKeySid,
        apiKeySecret: twilioSettings.apiKeySecret,
        to: payload.to,
        from,
        url: url.toString()
      });
      return reply.code(201).send({
        call: {
          sid: call.sid,
          status: call.status,
          to: call.to ?? payload.to,
          from: call.from ?? from,
          url: url.toString()
        }
      });
    } catch (error) {
      fastify.log.error(
        {
          err: error,
          channelId: channel.id
        },
        "twilio outbound call failed"
      );
      return reply.code(502).send({ error: "twilio_call_failed" });
    }
  });

  fastify.post("/conversations", async (request, reply) => {
    const data = conversationSchema.parse(request.body);
    const agent = agents.get(data.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "member");
    if (!access) {
      return;
    }
    if (data.channelId) {
      const channel = channels.get(data.channelId);
      if (!channel) {
        return reply.code(404).send({ error: "channel_not_found" });
      }
      if (channel.agentId !== data.agentId) {
        return reply.code(400).send({ error: "channel_agent_mismatch" });
      }
    }
    const id = `conversation_${crypto.randomUUID()}`;
    const conversation: Conversation = {
      id,
      agentId: data.agentId,
      channelId: data.channelId,
      userId: data.userId,
      status: "open",
      startedAt: new Date().toISOString()
    };
    conversations.set(id, conversation);
    recordMetricEvent({
      type: "conversation_started",
      agentId: conversation.agentId,
      channelId: conversation.channelId,
      conversationId: conversation.id,
      timestamp: conversation.startedAt
    });
    return reply.code(201).send(conversation);
  });

  fastify.get("/conversations", async (request, reply) => {
    const querySchema = z.object({
      agentId: z.string().min(1).optional(),
      channelId: z.string().min(1).optional(),
      userId: z.string().min(1).optional(),
      status: conversationStatusSchema.optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    });
    const query = querySchema.parse(request.query);
    const userId = requireUserId(request, reply);
    if (!userId) {
      return;
    }
    const allowedTenantIds = getTenantIdsForUser(userId);
    const tenantsToRefresh = new Set<string>();
    if (query.agentId) {
      const tenantId = getTenantIdForAgent(query.agentId);
      if (!tenantId) {
        return reply.code(404).send({ error: "agent_not_found" });
      }
      if (!allowedTenantIds.has(tenantId)) {
        return reply.code(403).send({ error: "tenant_access_denied" });
      }
      tenantsToRefresh.add(tenantId);
    }
    if (query.channelId) {
      const tenantId = getTenantIdForChannel(query.channelId);
      if (!tenantId) {
        return reply.code(404).send({ error: "channel_not_found" });
      }
      if (!allowedTenantIds.has(tenantId)) {
        return reply.code(403).send({ error: "tenant_access_denied" });
      }
      tenantsToRefresh.add(tenantId);
    }
    if (tenantsToRefresh.size === 0) {
      for (const tenantId of allowedTenantIds) {
        tenantsToRefresh.add(tenantId);
      }
    }
    for (const tenantId of tenantsToRefresh) {
      applyRetentionForTenant(tenantId, userId);
    }
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    let items = Array.from(conversations.values()).filter((conversation) => {
      const tenantId = getTenantIdForAgent(conversation.agentId);
      return tenantId ? allowedTenantIds.has(tenantId) : false;
    });
    if (query.agentId) {
      items = items.filter((conversation) => conversation.agentId === query.agentId);
    }
    if (query.channelId) {
      items = items.filter((conversation) => conversation.channelId === query.channelId);
    }
    if (query.userId) {
      items = items.filter((conversation) => conversation.userId === query.userId);
    }
    if (query.status) {
      items = items.filter((conversation) => conversation.status === query.status);
    }
    return { items: items.slice(offset, offset + limit) };
  });

  fastify.post("/metrics/events", async (request, reply) => {
    const batchSchema = z.object({ events: z.array(metricEventInputSchema).min(1) });
    const bodySchema = z.union([metricEventInputSchema, batchSchema]);
    const body = bodySchema.parse(request.body);
    const events = "events" in body ? body.events : [body];
    const recorded: MetricEvent[] = [];

    for (const eventInput of events) {
      if (eventInput.channelId && !channels.has(eventInput.channelId)) {
        return reply.code(404).send({ error: "channel_not_found" });
      }
      if (eventInput.agentId && !agents.has(eventInput.agentId)) {
        return reply.code(404).send({ error: "agent_not_found" });
      }
      const agentId = resolveAgentId(eventInput);
      if (agentId && !agents.has(agentId)) {
        return reply.code(404).send({ error: "agent_not_found" });
      }
      const tenantId = resolveTenantId({ ...eventInput, agentId });
      if (!tenantId) {
        return reply.code(400).send({ error: "tenant_required" });
      }
      const event = recordMetricEvent({
        ...eventInput,
        agentId,
        tenantId
      });
      if (event) {
        recorded.push(event);
      }
    }

    return reply.code(201).send({ items: recorded });
  });

  fastify.get("/metrics/summary", async (request, reply) => {
    const querySchema = z.object({
      tenantId: z.string().min(1).optional(),
      agentId: z.string().min(1).optional(),
      channelId: z.string().min(1).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional()
    });
    const query = querySchema.parse(request.query);
    if (query.tenantId && !tenants.has(query.tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    if (query.agentId && !agents.has(query.agentId)) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    if (query.channelId && !channels.has(query.channelId)) {
      return reply.code(404).send({ error: "channel_not_found" });
    }

    const { items, window } = selectMetricEvents(query);
    if (window.from.getTime() > window.to.getTime()) {
      return reply.code(400).send({ error: "invalid_time_window" });
    }

    return buildMetricsSummary(items, window);
  });

  fastify.get("/metrics/conversations", async (request, reply) => {
    const querySchema = z.object({
      tenantId: z.string().min(1).optional(),
      agentId: z.string().min(1).optional(),
      channelId: z.string().min(1).optional(),
      from: z.string().datetime().optional(),
      to: z.string().datetime().optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
      offset: z.coerce.number().int().min(0).optional()
    });
    const query = querySchema.parse(request.query);
    if (query.tenantId && !tenants.has(query.tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    if (query.agentId && !agents.has(query.agentId)) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    if (query.channelId && !channels.has(query.channelId)) {
      return reply.code(404).send({ error: "channel_not_found" });
    }

    const { items, window } = selectMetricEvents(query);
    if (window.from.getTime() > window.to.getTime()) {
      return reply.code(400).send({ error: "invalid_time_window" });
    }

    const summaries = buildConversationReview(items, window, query);
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    return { items: summaries.slice(offset, offset + limit) };
  });

  fastify.get("/diagnostics/persistence", async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) {
      return reply;
    }
    const averageLatencyMs =
      runtimePersistenceObservability.persistedSnapshots > 0
        ? runtimePersistenceObservability.totalWriteLatencyMs /
          runtimePersistenceObservability.persistedSnapshots
        : null;
    return {
      queueDepth: runtimePersistenceObservability.queueDepth,
      peakQueueDepth: runtimePersistenceObservability.peakQueueDepth,
      totals: {
        persistedSnapshots: runtimePersistenceObservability.persistedSnapshots,
        writeAttempts: runtimePersistenceObservability.writeAttempts,
        retryAttempts: runtimePersistenceObservability.retryAttempts,
        failedAttempts: runtimePersistenceObservability.failedAttempts,
        failedSnapshots: runtimePersistenceObservability.failedSnapshots
      },
      latencyMs: {
        last: runtimePersistenceObservability.lastWriteLatencyMs,
        average: averageLatencyMs
      },
      lastFailure:
        runtimePersistenceObservability.lastFailureAt &&
        runtimePersistenceObservability.lastFailureMessage
          ? {
              at: runtimePersistenceObservability.lastFailureAt,
              message: runtimePersistenceObservability.lastFailureMessage
            }
          : null
      };
  });

  fastify.get("/diagnostics/quota/:tenantId", async (request, reply) => {
    const paramsSchema = z.object({ tenantId: z.string().min(1) });
    const { tenantId } = paramsSchema.parse(request.params);
    if (!tenants.has(tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const access = requireTenantRole(request, reply, tenantId, "viewer");
    if (!access) {
      return reply;
    }
    const nowMs = Date.now();
    const quota = buildTenantQuotaSnapshot(tenantId);
    const rate = peekTenantRateLimit(tenantId, nowMs);
    return {
      tenantId,
      quota: {
        used: quota.entry.used,
        limit: quota.limit,
        remaining: quota.remaining,
        periodStart: quota.entry.periodStart,
        periodEnd: quota.periodEnd
      },
      rateLimit: {
        limit: rate.limit,
        remaining: rate.remaining,
        resetEpochSeconds: rate.resetEpochSeconds,
        windowMs: tenantRateLimitWindowMs
      }
    };
  });

  fastify.post("/sources", async (request, reply) => {
    const data = sourceSchema.parse(request.body);
    const agent = agents.get(data.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "member");
    if (!access) {
      return reply;
    }
    const id = `source_${crypto.randomUUID()}`;
    const source: Source = {
      id,
      agentId: data.agentId,
      type: data.type,
      value: data.value,
      config: data.config,
      status: "queued",
      createdAt: new Date().toISOString()
    };
    sources.set(id, source);
    return reply.code(201).send(source);
  });

  fastify.post("/sources/crawl", async (request, reply) => {
    const data = crawlConfigSchema.parse(request.body);
    const agent = agents.get(data.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "member");
    if (!access) {
      return reply;
    }
    const sourceId = `source_${crypto.randomUUID()}`;
    const source: Source = {
      id: sourceId,
      agentId: data.agentId,
      type: "website",
      config: {
        startUrls: data.startUrls,
        sitemapUrl: data.sitemapUrl,
        includePaths: data.includePaths,
        excludePaths: data.excludePaths,
        depthLimit: data.depthLimit
      },
      status: "queued",
      createdAt: new Date().toISOString()
    };
    const jobId = `job_${crypto.randomUUID()}`;
    const job: IngestionJob = {
      id: jobId,
      sourceId,
      kind: "crawl",
      status: "queued",
      createdAt: new Date().toISOString()
    };
    sources.set(sourceId, source);
    ingestionJobs.set(jobId, job);
    queueRuntimeStatePersist();
    return reply.code(201).send({ source, job });
  });

  fastify.post("/sources/file", async (request, reply) => {
    const data = fileIngestionSchema.parse(request.body);
    const agent = agents.get(data.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "member");
    if (!access) {
      return reply;
    }
    const sourceId = `source_${crypto.randomUUID()}`;
    const source: Source = {
      id: sourceId,
      agentId: data.agentId,
      type: "file",
      config: {
        filename: data.filename,
        contentType: data.contentType,
        sizeBytes: data.sizeBytes
      },
      status: "queued",
      createdAt: new Date().toISOString()
    };
    const jobId = `job_${crypto.randomUUID()}`;
    const job: IngestionJob = {
      id: jobId,
      sourceId,
      kind: "file",
      status: "queued",
      createdAt: new Date().toISOString()
    };
    sources.set(sourceId, source);
    ingestionJobs.set(jobId, job);
    queueRuntimeStatePersist();
    return reply.code(201).send({ source, job });
  });

  // --- Notion source creation ---
  fastify.post("/sources/notion", async (request, reply) => {
    const parsed = notionSourceSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "validation_error", details: parsed.error.flatten() });
    }
    const data = parsed.data;
    const agent = agents.get(data.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "member");
    if (!access) {
      return reply;
    }
    const sourceId = `source_${crypto.randomUUID()}`;
    const source: Source = {
      id: sourceId,
      agentId: data.agentId,
      type: "notion",
      config: {
        workspaceId: data.workspaceId,
        pageIds: data.pageIds,
        databaseIds: data.databaseIds,
        autoRetrain: data.autoRetrain ?? true
      },
      status: "queued",
      createdAt: new Date().toISOString()
    };
    const jobId = `job_${crypto.randomUUID()}`;
    const job: IngestionJob = {
      id: jobId,
      sourceId,
      kind: "notion",
      status: "queued",
      createdAt: new Date().toISOString()
    };
    sources.set(sourceId, source);
    ingestionJobs.set(jobId, job);
    queueRuntimeStatePersist();
    const autoRetrain = data.autoRetrain ?? true;
    notionSyncState.set(sourceId, {
      sourceId,
      workspaceId: data.workspaceId,
      lastSyncedAt: new Date().toISOString(),
      autoRetrain,
      staleSinceMs: 0
    });
    return reply.code(201).send({ source, job });
  });

  // --- Notion webhook for change notifications ---
  fastify.post("/webhooks/notion", async (request, reply) => {
    const bodySchema = z.object({
      sourceId: z.string().min(1).optional(),
      workspaceId: z.string().min(1).optional(),
      type: z
        .enum(["page_changed", "database_changed", "content_updated", "verification"])
        .optional(),
      pageId: z.string().min(1).optional(),
      databaseId: z.string().min(1).optional(),
      timestamp: z.string().datetime().optional()
    });
    const data = bodySchema.parse(request.body);

    // Handle verification challenge
    if (data.type === "verification") {
      return reply.send({ status: "verified" });
    }

    // Find matching Notion sources
    const matchingSources: Source[] = [];
    if (data.sourceId) {
      const source = sources.get(data.sourceId);
      if (source && source.type === "notion") {
        matchingSources.push(source);
      }
    } else if (data.workspaceId) {
      for (const source of sources.values()) {
        if (
          source.type === "notion" &&
          isRecord(source.config) &&
          source.config.workspaceId === data.workspaceId
        ) {
          matchingSources.push(source);
        }
      }
    }

    if (matchingSources.length === 0) {
      return reply.code(404).send({ error: "notion_source_not_found" });
    }

    // Trigger retrain for each matching source
    const retriggered: Array<{ sourceId: string; jobId: string }> = [];
    for (const source of matchingSources) {
      const now = new Date().toISOString();
      sources.set(source.id, {
        ...source,
        status: "processing",
        lastSyncedAt: now
      });
      const jobId = `job_${crypto.randomUUID()}`;
      const job: IngestionJob = {
        id: jobId,
        sourceId: source.id,
        kind: "notion",
        status: "queued",
        createdAt: now
      };
      ingestionJobs.set(jobId, job);

      // Update sync state
      const syncState = notionSyncState.get(source.id);
      if (syncState) {
        notionSyncState.set(source.id, {
          ...syncState,
          lastSyncedAt: now,
          staleSinceMs: 0
        });
      }

      retriggered.push({ sourceId: source.id, jobId });
    }
    if (retriggered.length > 0) {
      queueRuntimeStatePersist();
    }

    return reply.send({
      status: "retrain_triggered",
      sources: retriggered
    });
  });

  // --- Notion auto-retrain sync check ---
  // This endpoint is designed to be called periodically (e.g., by a cron job / scheduler)
  // to identify Notion sources that haven't been synced within 24 hours and trigger retrain.
  fastify.post("/sources/notion/sync-check", async (request, reply) => {
    const userId = requireUserId(request, reply);
    if (!userId) {
      return reply;
    }
    const allowedTenantIds = getTenantIdsForUser(userId);
    const now = Date.now();
    const stale: Array<{ sourceId: string; jobId: string; lastSyncedAt: string; staleSinceMs: number }> = [];
    const upToDate: string[] = [];

    for (const [sourceId, syncState] of notionSyncState.entries()) {
      if (!syncState.autoRetrain) {
        continue;
      }
      const source = sources.get(sourceId);
      if (!source) {
        continue;
      }
      const tenantId = getTenantIdForAgent(source.agentId);
      if (!tenantId || !allowedTenantIds.has(tenantId)) {
        continue;
      }
      const lastSyncMs = new Date(syncState.lastSyncedAt).getTime();
      const elapsedMs = now - lastSyncMs;

      if (elapsedMs >= NOTION_STALE_THRESHOLD_MS) {
        // Source is stale — trigger retrain
        const retrainAt = new Date().toISOString();
        sources.set(sourceId, {
          ...source,
          status: "processing",
          lastSyncedAt: retrainAt
        });
        const jobId = `job_${crypto.randomUUID()}`;
        const job: IngestionJob = {
          id: jobId,
          sourceId,
          kind: "notion",
          status: "queued",
          createdAt: retrainAt
        };
        ingestionJobs.set(jobId, job);
        notionSyncState.set(sourceId, {
          ...syncState,
          lastSyncedAt: retrainAt,
          staleSinceMs: elapsedMs
        });
        stale.push({
          sourceId,
          jobId,
          lastSyncedAt: syncState.lastSyncedAt,
          staleSinceMs: elapsedMs
        });
      } else {
        upToDate.push(sourceId);
      }
    }
    if (stale.length > 0) {
      queueRuntimeStatePersist();
    }

    return reply.send({
      stale,
      upToDate,
      thresholdMs: NOTION_STALE_THRESHOLD_MS
    });
  });

  fastify.post("/sources/:id/ingest-text", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const data = textIngestionSchema.parse(request.body);
    const source = sources.get(id);
    if (!source) {
      return reply.code(404).send({ error: "source_not_found" });
    }
    const agent = agents.get(source.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "member");
    if (!access) {
      return reply;
    }
    const tenant = tenants.get(agent.tenantId);
    if (!tenant) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const chunkSize = data.chunkSize ?? 120;
    const chunkOverlap =
      data.chunkOverlap ?? Math.min(20, Math.max(chunkSize - 1, 0));
    const textChunks = splitIntoChunks(data.text, {
      chunkSize,
      chunkOverlap
    });
    const createdAt = new Date().toISOString();
    const chunkCount = textChunks.length;
    const vectorRecords: VectorRecord[] = [];
    const sourceInfo = buildSourceLookup(new Set([source.id])).get(source.id);
    const createdChunks = textChunks.map((content, index) => {
      const chunkId = `chunk_${crypto.randomUUID()}`;
      const metadata: Record<string, unknown> = {
        ...data.metadata,
        chunkIndex: index,
        chunkCount,
        sourceType: sourceInfo?.sourceType,
        ...(sourceInfo?.sourceUrl ? { sourceUrl: sourceInfo.sourceUrl } : {}),
        ...(sourceInfo?.sourceTitle
          ? { sourceTitle: sourceInfo.sourceTitle }
          : {})
      };
      vectorRecords.push({
        id: chunkId,
        agentId: source.agentId,
        sourceId: source.id,
        content,
        metadata,
        embedding: buildEmbedding(content),
        createdAt
      });
      return {
        id: chunkId,
        sourceId: source.id,
        content,
        metadata,
        createdAt
      };
    });

    await vectorStore.upsert(tenant.region, vectorRecords);

    // Cache ingested content for retrain
    sourceContentCache.set(source.id, {
      text: data.text,
      metadata: data.metadata as Record<string, unknown> | undefined,
      chunkSize,
      chunkOverlap
    });

    sources.set(source.id, {
      ...source,
      status: "ready",
      lastSyncedAt: createdAt
    });

    recordMetricEvent({
      type: "ingestion_completed",
      agentId: source.agentId,
      conversationId: undefined,
      timestamp: createdAt,
      metadata: {
        sourceId: source.id,
        kind: "text",
        chunkCount
      }
    });

    return reply.code(201).send({ chunks: createdChunks });
  });

  fastify.get("/ingestion-jobs", async (request, reply) => {
    const schema = z.object({
      agentId: z.string().optional(),
      sourceId: z.string().optional(),
      status: ingestionJobStatusSchema.optional()
    });
    const data = schema.parse(request.query);
    const userId = requireUserId(request, reply);
    if (!userId) {
      return reply;
    }
    await refreshIngestionJobsFromRuntimeState();
    const allowedTenantIds = getTenantIdsForUser(userId);

    if (data.agentId) {
      const tenantId = getTenantIdForAgent(data.agentId);
      if (tenantId && !allowedTenantIds.has(tenantId)) {
        return reply.code(403).send({ error: "tenant_access_denied" });
      }
    }
    if (data.sourceId) {
      const tenantId = getTenantIdForSource(data.sourceId);
      if (tenantId && !allowedTenantIds.has(tenantId)) {
        return reply.code(403).send({ error: "tenant_access_denied" });
      }
    }

    let items = Array.from(ingestionJobs.values()).filter((job) => {
      const tenantId = getTenantIdForIngestionJob(job.id);
      return tenantId ? allowedTenantIds.has(tenantId) : false;
    });
    if (data.sourceId) {
      items = items.filter((job) => job.sourceId === data.sourceId);
    }
    if (data.status) {
      items = items.filter((job) => job.status === data.status);
    }
    if (data.agentId) {
      items = items.filter((job) => {
        const source = sources.get(job.sourceId);
        return source?.agentId === data.agentId;
      });
    }
    return { items };
  });

  fastify.get("/ingestion-jobs/:id", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    await refreshIngestionJobsFromRuntimeState();
    const job = ingestionJobs.get(id);
    if (!job) {
      return reply.code(404).send({ error: "job_not_found" });
    }
    const source = sources.get(job.sourceId);
    if (!source) {
      return reply.code(404).send({ error: "source_not_found" });
    }
    const agent = agents.get(source.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "viewer");
    if (!access) {
      return reply;
    }
    return { job };
  });

  fastify.post("/ingestion-jobs/:id/status", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const bodySchema = z.object({
      status: ingestionJobStatusSchema,
      startedAt: z.string().datetime().optional(),
      completedAt: z.string().datetime().optional()
    });
    const { id } = paramsSchema.parse(request.params);
    const { status, startedAt, completedAt } = bodySchema.parse(request.body);
    await refreshIngestionJobsFromRuntimeState();
    const job = ingestionJobs.get(id);
    if (!job) {
      return reply.code(404).send({ error: "job_not_found" });
    }
    const source = sources.get(job.sourceId);
    if (!source) {
      return reply.code(404).send({ error: "source_not_found" });
    }
    const agent = agents.get(source.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "member");
    if (!access) {
      return reply;
    }
    if (status === "processing" && completedAt) {
      return reply
        .code(400)
        .send({ error: "completed_at_not_allowed_for_processing" });
    }
    if (status === "complete" && startedAt && completedAt) {
      const startMs = new Date(startedAt).getTime();
      const endMs = new Date(completedAt).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs < startMs) {
        return reply.code(400).send({ error: "completed_before_started" });
      }
    }
    let updatedJob: IngestionJob = { ...job, status };
    if (status === "processing") {
      updatedJob = {
        ...job,
        status,
        startedAt: startedAt ?? job.startedAt ?? new Date().toISOString()
      };
    }
    if (status === "complete") {
      updatedJob = applyIngestionCompletion(
        job,
        completedAt ?? new Date().toISOString(),
        startedAt
      );
    }
    ingestionJobs.set(id, updatedJob);
    queueRuntimeStatePersist();

    let nextStatus: Source["status"] = source.status;
    if (status === "processing") {
      nextStatus = "processing";
    } else if (status === "complete") {
      nextStatus = "ready";
    } else if (status === "failed") {
      nextStatus = "failed";
    } else if (status === "queued") {
      nextStatus = "queued";
    }
    sources.set(source.id, {
      ...source,
      status: nextStatus,
      lastSyncedAt: status === "complete" ? new Date().toISOString() : source.lastSyncedAt
    });
    if (status === "complete") {
      recordMetricEvent({
        type: "ingestion_completed",
        agentId: source.agentId,
        timestamp: new Date().toISOString(),
        metadata: {
          sourceId: source.id,
          jobId: updatedJob.id,
          kind: updatedJob.kind,
          durationMs: updatedJob.durationMs,
          slaMet: updatedJob.slaMet
        }
      });
    }

    return { job: updatedJob };
  });

  fastify.post("/ingestion-jobs/:id/ingest", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const data = jobIngestionSchema.parse(request.body);
    await refreshIngestionJobsFromRuntimeState();
    const job = ingestionJobs.get(id);
    if (!job) {
      return reply.code(404).send({ error: "job_not_found" });
    }
    const source = sources.get(job.sourceId);
    if (!source) {
      return reply.code(404).send({ error: "source_not_found" });
    }
    const agent = agents.get(source.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "member");
    if (!access) {
      return reply;
    }
    const tenant = tenants.get(agent.tenantId);
    if (!tenant) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }

    const chunkSize = data.chunkSize ?? 120;
    const chunkOverlap =
      data.chunkOverlap ?? Math.min(20, Math.max(chunkSize - 1, 0));
    const createdAt = new Date().toISOString();
    const createdChunks: Array<{
      id: string;
      sourceId: string;
      content: string;
      metadata?: Record<string, unknown>;
      createdAt: string;
    }> = [];
    const vectorRecords: VectorRecord[] = [];
    const sourceInfo = buildSourceLookup(new Set([source.id])).get(source.id);

    data.documents.forEach((document, documentIndex) => {
      const textChunks = splitIntoChunks(document.content, {
        chunkSize,
        chunkOverlap
      });
      const chunkCount = textChunks.length;
      textChunks.forEach((content, chunkIndex) => {
        const chunkId = `chunk_${crypto.randomUUID()}`;
        const metadata: Record<string, unknown> = {
          ...data.metadata,
          ...document.metadata,
          documentIndex,
          chunkIndex,
          chunkCount,
          sourceType: sourceInfo?.sourceType,
          ...(sourceInfo?.sourceUrl ? { sourceUrl: sourceInfo.sourceUrl } : {}),
          ...(sourceInfo?.sourceTitle
            ? { sourceTitle: sourceInfo.sourceTitle }
            : {})
        };
        vectorRecords.push({
          id: chunkId,
          agentId: source.agentId,
          sourceId: source.id,
          content,
          metadata,
          embedding: buildEmbedding(content),
          createdAt
        });
        createdChunks.push({
          id: chunkId,
          sourceId: source.id,
          content,
          metadata,
          createdAt
        });
      });
    });

    await vectorStore.upsert(tenant.region, vectorRecords);

    // Cache combined document content for retrain
    const combinedText = data.documents.map((d) => d.content).join("\n\n");
    sourceContentCache.set(source.id, {
      text: combinedText,
      metadata: data.metadata as Record<string, unknown> | undefined,
      chunkSize,
      chunkOverlap
    });

    const updatedSource: Source = {
      ...source,
      status: "ready",
      lastSyncedAt: createdAt
    };
    sources.set(source.id, updatedSource);

    const updatedJob: IngestionJob = applyIngestionCompletion(job, createdAt);
    ingestionJobs.set(job.id, updatedJob);
    queueRuntimeStatePersist();

    recordMetricEvent({
      type: "ingestion_completed",
      agentId: source.agentId,
      timestamp: createdAt,
      metadata: {
        sourceId: source.id,
        jobId: job.id,
        kind: job.kind,
        chunkCount: createdChunks.length,
        durationMs: updatedJob.durationMs,
        slaMet: updatedJob.slaMet
      }
    });

    return reply.code(201).send({
      source: updatedSource,
      job: updatedJob,
      chunks: createdChunks
    });
  });

  fastify.get("/sources", async (request, reply) => {
    const schema = z.object({
      agentId: z.string().optional()
    });
    const data = schema.parse(request.query);
    const userId = requireUserId(request, reply);
    if (!userId) {
      return reply;
    }
    const allowedTenantIds = getTenantIdsForUser(userId);

    if (data.agentId) {
      const tenantId = getTenantIdForAgent(data.agentId);
      if (tenantId && !allowedTenantIds.has(tenantId)) {
        return reply.code(403).send({ error: "tenant_access_denied" });
      }
    }

    let items = Array.from(sources.values()).filter((source) => {
      const tenantId = getTenantIdForAgent(source.agentId);
      return tenantId ? allowedTenantIds.has(tenantId) : false;
    });
    if (data.agentId) {
      items = items.filter((source) => source.agentId === data.agentId);
    }
    return { items };
  });

  fastify.post("/sources/:id/retrain", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const bodySchema = z.object({
      startedAt: z.string().datetime().optional(),
      completedAt: z.string().datetime().optional()
    });
    const { id } = paramsSchema.parse(request.params);
    const { startedAt: startedAtInput, completedAt: completedAtInput } =
      bodySchema.parse(request.body ?? {});
    const source = sources.get(id);
    if (!source) {
      return reply.code(404).send({ error: "source_not_found" });
    }
    const agent = agents.get(source.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "member");
    if (!access) {
      return reply;
    }
    const tenant = tenants.get(agent.tenantId);
    // Clear old vector chunks for this source
    const deletedChunks = tenant
      ? await vectorStore.deleteBySourceId(tenant.region, id)
      : 0;
    if (startedAtInput && completedAtInput) {
      const startMs = new Date(startedAtInput).getTime();
      const endMs = new Date(completedAtInput).getTime();
      if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs < startMs) {
        return reply.code(400).send({ error: "completed_before_started" });
      }
    }
    const retrainStartedAt = startedAtInput ?? new Date().toISOString();
    const now = new Date().toISOString();

    // Check if we have cached content for automatic re-ingestion
    const cached = sourceContentCache.get(id);
    if (cached && tenant) {
      // Re-ingest from cached content
      const chunkSize = cached.chunkSize ?? 120;
      const chunkOverlap =
        cached.chunkOverlap ?? Math.min(20, Math.max(chunkSize - 1, 0));
      const textChunks = splitIntoChunks(cached.text, {
        chunkSize,
        chunkOverlap
      });
      const chunkCount = textChunks.length;
      const vectorRecords: VectorRecord[] = [];
      const sourceInfo = buildSourceLookup(new Set([source.id])).get(
        source.id
      );
      textChunks.forEach((content, index) => {
        const chunkId = `chunk_${crypto.randomUUID()}`;
        const metadata: Record<string, unknown> = {
          ...cached.metadata,
          chunkIndex: index,
          chunkCount,
          sourceType: sourceInfo?.sourceType,
          ...(sourceInfo?.sourceUrl
            ? { sourceUrl: sourceInfo.sourceUrl }
            : {}),
          ...(sourceInfo?.sourceTitle
            ? { sourceTitle: sourceInfo.sourceTitle }
            : {})
        };
        vectorRecords.push({
          id: chunkId,
          agentId: source.agentId,
          sourceId: source.id,
          content,
          metadata,
          embedding: buildEmbedding(content),
          createdAt: now
        });
      });
      await vectorStore.upsert(tenant.region, vectorRecords);

      const updated: Source = {
        ...source,
        status: "ready",
        lastSyncedAt: now
      };
      sources.set(id, updated);

      const retrainCompletedAt = completedAtInput ?? new Date().toISOString();
      const { durationMs, slaMet } = computeIngestionSlaResult(
        retrainStartedAt,
        retrainCompletedAt
      );
      recordMetricEvent({
        type: "ingestion_completed",
        agentId: source.agentId,
        conversationId: undefined,
        timestamp: now,
        metadata: {
          sourceId: source.id,
          kind: "retrain",
          chunkCount,
          deletedChunks,
          durationMs,
          slaMet
        }
      });

      return {
        source: updated,
        deletedChunks,
        reingestedChunks: chunkCount,
        mode: "auto",
        durationMs,
        slaMet
      };
    }

    // No cached content — fall back to creating a queued ingestion job
    const updated: Source = {
      ...source,
      status: "processing",
      lastSyncedAt: now
    };
    sources.set(id, updated);
    const kind: IngestionJob["kind"] =
      source.type === "notion" ? "notion" : source.type === "file" ? "file" : "crawl";
    const jobId = `job_${crypto.randomUUID()}`;
    const job: IngestionJob = {
      id: jobId,
      sourceId: id,
      kind,
      status: "queued",
      createdAt: now
    };
    ingestionJobs.set(jobId, job);
    queueRuntimeStatePersist();
    return { source: updated, job, deletedChunks, mode: "job" };
  });

  fastify.delete("/sources/:id", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const source = sources.get(id);
    if (!source) {
      return reply.code(404).send({ error: "source_not_found" });
    }
    const agent = agents.get(source.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "member");
    if (!access) {
      return reply;
    }
    const tenant = tenants.get(agent.tenantId);
    if (tenant) {
      await vectorStore.deleteBySourceId(tenant.region, id);
    }
    sources.delete(id);
    sourceContentCache.delete(id);
    return reply.code(204).send();
  });

  fastify.get("/source-types", async () => ({
    items: ["website", "file", "text", "notion", "ticketing", "qa"]
  }));

  fastify.get("/widget.js", async (_request, reply) => {
    reply.header("content-type", "application/javascript; charset=utf-8");
    return reply.send(buildWidgetScript());
  });

  fastify.get("/help/:channelId", async (request, reply) => {
    const paramsSchema = z.object({ channelId: z.string().min(1) });
    const { channelId } = paramsSchema.parse(request.params);
    const channel = channels.get(channelId);
    if (!channel || channel.type !== "help_page") {
      return reply.code(404).send({ error: "help_page_not_found" });
    }
    if (!channel.enabled) {
      return reply.code(403).send({ error: "channel_disabled" });
    }
    reply.header("content-type", "text/html; charset=utf-8");
    return reply.send(buildHelpPage(channelId));
  });

  fastify.post("/retrieve", async (request, reply) => {
    const schema = z.object({
      agentId: z.string().min(1),
      query: z.string().min(1),
      maxResults: z.number().int().min(1).max(20).optional(),
      sourceIds: z.array(z.string().min(1)).optional(),
      minScore: z.number().min(0).max(1).optional()
    });
    const data = schema.parse(request.body);
    const agent = agents.get(data.agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const access = requireTenantRole(request, reply, agent.tenantId, "viewer");
    if (!access) {
      return reply;
    }
    const tenant = tenants.get(agent.tenantId);
    if (!tenant) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const limit = enforceTenantLimits(reply, tenant.id);
    if (!limit) {
      return;
    }
    const queryEmbedding = buildEmbedding(data.query);
    const minScore = data.minScore ?? agent.retrievalConfig?.minScore ?? 0;
    const maxResults = data.maxResults ?? agent.retrievalConfig?.maxResults ?? 5;
    const sourceFilter = data.sourceIds
      ? new Set(data.sourceIds)
      : undefined;

    const retrievalStart = Date.now();
    const results = await vectorStore.query(tenant.region, {
      agentId: data.agentId,
      queryText: data.query,
      queryEmbedding,
      minScore,
      maxResults,
      sourceFilter
    });

    recordMetricEvent({
      type: "retrieval_performed",
      agentId: data.agentId,
      timestamp: new Date().toISOString(),
      metadata: {
        latencyMs: Date.now() - retrievalStart,
        resultCount: results.length,
        minScore,
        maxResults
      }
    });

    return { items: results };
  });

  fastify.post("/chat", async (request, reply) => {
    const schema = z.object({
      agentId: z.string().min(1).optional(),
      channelId: z.string().min(1).optional(),
      message: z.string().min(1),
      stream: z.boolean().optional(),
      maxResults: z.number().int().min(1).max(10).optional(),
      minScore: z.number().min(0).max(1).optional(),
      sourceIds: z.array(z.string().min(1)).optional()
    }).refine((data) => data.agentId || data.channelId, {
      message: "agent_or_channel_required",
      path: ["agentId"]
    });
    const data = schema.parse(request.body);
    let channel: Channel | undefined;
    let agentId = data.agentId;
    if (data.channelId) {
      channel = channels.get(data.channelId);
      if (!channel) {
        return reply.code(404).send({ error: "channel_not_found" });
      }
      if (!channel.enabled) {
        return reply.code(403).send({ error: "channel_disabled" });
      }
      agentId = channel.agentId;
      if (data.agentId && data.agentId !== channel.agentId) {
        return reply.code(400).send({ error: "agent_channel_mismatch" });
      }
      const allowedDomains = channel.config?.allowedDomains ?? [];
      if (allowedDomains.length > 0) {
        const originHost = getRequestOriginHost(request);
        if (!originHost || !isDomainAllowed(allowedDomains, originHost)) {
          return reply.code(403).send({ error: "domain_not_allowed" });
        }
      }
    }

    if (!agentId) {
      return reply.code(400).send({ error: "agent_or_channel_required" });
    }
    const agent = agents.get(agentId);
    if (!agent) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const limit = enforceTenantLimits(reply, agent.tenantId);
    if (!limit) {
      return;
    }

    let conversation: Conversation | undefined;
    if (channel) {
      const threadKeyHeader =
        typeof request.headers["x-thread-key"] === "string"
          ? request.headers["x-thread-key"]
          : undefined;
      const endUserIdHeader =
        typeof request.headers["x-end-user-id"] === "string"
          ? request.headers["x-end-user-id"]
          : undefined;
      conversation = getOrCreateConversation({
        channel,
        userId: endUserIdHeader,
        threadKey: threadKeyHeader
      });
    }

    recordMetricEvent({
      type: "message_sent",
      agentId,
      channelId: channel?.id,
      conversationId: conversation?.id,
      timestamp: new Date().toISOString(),
      metadata: {
        role: "user",
        channelType: channel?.type
      }
    });

    try {
      const { response, prompt } = await runChatFlow({
        agentId,
        message: data.message,
        maxResults: data.maxResults,
        minScore: data.minScore,
        sourceIds: data.sourceIds
      });

      recordMetricEvent({
        type: "message_sent",
        agentId,
        channelId: channel?.id,
        conversationId: conversation?.id,
        timestamp: new Date().toISOString(),
        metadata: {
          role: "assistant",
          sourceCount: response.sources.length
        }
      });
      const escalation = maybeDispatchAutoEscalation({
        agentId,
        message: data.message,
        response,
        channel,
        conversation
      });
      const responsePayload =
        channel && channel.type === "voice_agent"
          ? buildVoiceReplyPayload(response, channel)
          : response;

      if (data.stream) {
        reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
        reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
        reply.raw.setHeader("Connection", "keep-alive");
        reply.raw.flushHeaders();

        const chunksToSend = chunkResponseForStreaming(response.message);
        for (const chunk of chunksToSend) {
          reply.raw.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
        }
        const streamedResponse = escalation
          ? { ...responsePayload, escalation }
          : responsePayload;
        reply.raw.write(
          `data: ${JSON.stringify({
            done: true,
            response: streamedResponse,
            conversationId: conversation?.id
          })}\n\n`
        );
        reply.raw.end();
        return reply;
      }

      return reply.send({
        ...responsePayload,
        ...(escalation ? { escalation } : {}),
        prompt,
        conversationId: conversation?.id
      });
    } catch (error) {
      if (isTypedError(error)) {
        const serialized = serializeTypedError(error);
        return reply.code(serialized.statusCode).send({
          error: serialized.error,
          ...(serialized.details ? { details: serialized.details } : {})
        });
      }
      throw error;
    }
  });

  return fastify;
};

const splitIntoChunks = (
  text: string,
  options: { chunkSize: number; chunkOverlap: number }
) => {
  const words = text.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) {
    return [];
  }
  const chunkSize = Math.max(options.chunkSize, 1);
  const chunkOverlap = Math.max(
    Math.min(options.chunkOverlap, chunkSize - 1),
    0
  );
  const chunks: string[] = [];
  let start = 0;
  while (start < words.length) {
    const end = Math.min(start + chunkSize, words.length);
    chunks.push(words.slice(start, end).join(" "));
    if (end >= words.length) {
      break;
    }
    const nextStart = end - chunkOverlap;
    if (nextStart <= start) {
      break;
    }
    start = nextStart;
  }
  return chunks;
};

const isMain =
  process.argv[1] && new URL(import.meta.url).pathname === process.argv[1];

if (isMain) {
  const port = Number.parseInt(process.env.PORT ?? "4000", 10);
  const server = await buildServer();
  server.listen({ port, host: "0.0.0.0" }).catch((error) => {
    server.log.error(error);
    process.exit(1);
  });
}
