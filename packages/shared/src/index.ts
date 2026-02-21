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

export type SourceStatus = "queued" | "processing" | "ready" | "failed";

export type Source = {
  id: string;
  agentId: string;
  type: SourceType;
  value?: string;
  config?: Record<string, unknown>;
  status: SourceStatus;
  createdAt: string;
  lastSyncedAt?: string;
};

export type SourceCreateInput = {
  agentId: string;
  type: SourceType;
  value?: string;
  config?: Record<string, unknown>;
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
  kind: "crawl" | "file" | "text";
  status: IngestionJobStatus;
  createdAt: string;
  completedAt?: string;
};

export type IngestionJobBundle = {
  source: Source;
  job: IngestionJob;
};

export type ActionType =
  | "slack_notify"
  | "ticket_create"
  | "lead_capture"
  | "schedule"
  | "billing"
  | "custom_api";

export type Action = {
  id: string;
  agentId: string;
  type: ActionType;
  config?: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
};

export type ChannelType =
  | "web_widget"
  | "help_page"
  | "slack"
  | "whatsapp"
  | "email"
  | "zendesk"
  | "salesforce";

export type Channel = {
  id: string;
  agentId: string;
  type: ChannelType;
  config?: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
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
