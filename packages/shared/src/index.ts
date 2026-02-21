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

export type CrawlConfig = {
  agentId: string;
  startUrls: string[];
  sitemapUrl?: string;
  includePaths?: string[];
  excludePaths?: string[];
  depthLimit?: number;
};

export type IngestionJobStatus = "queued" | "processing" | "complete" | "failed";

export type IngestionJob = {
  id: string;
  sourceId: string;
  kind: "crawl" | "file" | "text" | "qa";
  status: IngestionJobStatus;
  createdAt: string;
  completedAt?: string;
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

export type Channel = {
  id: string;
  agentId: string;
  type: ChannelType;
  config?: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
};

export type ChannelCreateInput = {
  agentId: string;
  type: ChannelType;
  config?: Record<string, unknown>;
  enabled?: boolean;
};

export type ConversationStatus = "open" | "closed" | "escalated";

export type Conversation = {
  id: string;
  agentId: string;
  channelId?: string;
  status: ConversationStatus;
  startedAt: string;
  endedAt?: string;
};

export type ConversationCreateInput = {
  agentId: string;
  channelId?: string;
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
