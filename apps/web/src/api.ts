export type Tenant = {
  id: string;
  name: string;
  plan?: string;
  region: string;
  dataResidency?: string;
  createdAt: string;
};

export type TenantCreateInput = {
  name: string;
  plan?: string;
  region: string;
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

export type SourceType = "website" | "file" | "text" | "notion" | "ticketing" | "qa";

export type Source = {
  id: string;
  agentId: string;
  type: SourceType;
  value?: string;
  config?: Record<string, unknown>;
  status: "queued" | "processing" | "ready" | "failed";
  createdAt: string;
  lastSyncedAt?: string;
};

export type SourceCreateInput = {
  agentId: string;
  type: SourceType;
  value?: string;
  config?: Record<string, unknown>;
};

export type IngestionJobStatus = "queued" | "processing" | "complete" | "failed";

export type IngestionJob = {
  id: string;
  sourceId: string;
  kind: "crawl" | "file" | "text" | "qa";
  status: IngestionJobStatus;
  createdAt: string;
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

export type TextIngestionInput = {
  text: string;
  chunkSize?: number;
  chunkOverlap?: number;
  metadata?: Record<string, unknown>;
};

export type ChannelUpdateInput = {
  config?: Record<string, unknown>;
  enabled?: boolean;
};

type ApiError = {
  error?: string;
  message?: string;
};

const apiFetch = async <T,>(baseUrl: string, path: string, options: RequestInit): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options.headers ?? {})
    },
    ...options
  });

  if (!response.ok) {
    let error: ApiError = {};
    try {
      error = (await response.json()) as ApiError;
    } catch {
      error = {};
    }
    throw new Error(error.message ?? error.error ?? "Request failed");
  }

  return (await response.json()) as T;
};

export const createApiClient = (baseUrl: string) => {
  return {
    createTenant: (input: TenantCreateInput) =>
      apiFetch<Tenant>(baseUrl, "/tenants", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    createAgent: (input: AgentCreateInput) =>
      apiFetch<Agent>(baseUrl, "/agents", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    createSource: (input: SourceCreateInput) =>
      apiFetch<Source>(baseUrl, "/sources", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    createCrawlSource: (input: {
      agentId: string;
      startUrls: string[];
      sitemapUrl?: string;
      includePaths?: string[];
      excludePaths?: string[];
      depthLimit?: number;
    }) =>
      apiFetch<{ source: Source; job: IngestionJob }>(baseUrl, "/sources/crawl", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    ingestText: (sourceId: string, input: TextIngestionInput) =>
      apiFetch<{ chunks: unknown[] }>(baseUrl, `/sources/${sourceId}/ingest-text`, {
        method: "POST",
        body: JSON.stringify(input)
      }),
    retrainSource: (sourceId: string) =>
      apiFetch<{ source: Source }>(baseUrl, `/sources/${sourceId}/retrain`, {
        method: "POST"
      }),
    createChannel: (input: ChannelCreateInput) =>
      apiFetch<Channel>(baseUrl, "/channels", {
        method: "POST",
        body: JSON.stringify(input)
      }),
    updateChannel: (channelId: string, input: ChannelUpdateInput) =>
      apiFetch<{ channel: Channel }>(baseUrl, `/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      })
  };
};
