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

export type RetrievalConfig = {
  minScore?: number;
  maxResults?: number;
};

export type Agent = {
  id: string;
  tenantId: string;
  name: string;
  basePrompt?: string;
  model?: string;
  retrievalConfig?: RetrievalConfig;
  status: AgentStatus;
  createdAt: string;
};

export type AgentCreateInput = {
  tenantId: string;
  name: string;
  basePrompt?: string;
  model?: string;
  retrievalConfig?: RetrievalConfig;
};

export type AgentSettingsUpdateInput = {
  basePrompt?: string;
  model?: string;
  retrievalConfig?: RetrievalConfig;
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
  | "wordpress"
  | "voice_agent";

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

export type MetricsSeriesPoint = {
  date: string;
  conversations: number;
  deflections: number;
  escalations: number;
};

export type MetricsSummary = {
  window: {
    from: string;
    to: string;
  };
  totals: {
    conversations: number;
    deflected: number;
    escalated: number;
    retrievals: number;
    actions: number;
    ingestionCompleted: number;
    feedbackCount: number;
  };
  rates: {
    deflectionRate: number;
    avgFirstResponseSeconds: number;
    avgResolutionSeconds: number;
    avgRetrievalLatencyMs: number;
    avgFeedbackRating: number;
  };
  topIntents: Array<{ intent: string; count: number }>;
  series: MetricsSeriesPoint[];
};

export type MetricConversation = {
  conversationId: string;
  tenantId?: string;
  agentId?: string;
  channelId?: string;
  status: "open" | "closed" | "escalated";
  startedAt?: string;
  firstResponseSeconds: number | null;
  resolutionSeconds: number | null;
  lastActivityAt?: string;
  intent?: string;
};

type ApiError = {
  error?: string;
  message?: string;
};

const apiFetch = async <T,>(
  baseUrl: string,
  path: string,
  options: RequestInit,
  userId: string
): Promise<T> => {
  const response = await fetch(`${baseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      "x-user-id": userId,
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

const buildQuery = (params: Record<string, string | number | undefined>) => {
  const searchParams = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === "") {
      return;
    }
    searchParams.set(key, String(value));
  });
  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
};

export const createApiClient = (baseUrl: string, userId = "user_admin") => {
  return {
    createTenant: (input: TenantCreateInput) =>
      apiFetch<Tenant>(baseUrl, "/tenants", {
        method: "POST",
        body: JSON.stringify(input)
      }, userId),
    createAgent: (input: AgentCreateInput) =>
      apiFetch<Agent>(baseUrl, "/agents", {
        method: "POST",
        body: JSON.stringify(input)
      }, userId),
    getAgents: () =>
      apiFetch<{ items: Agent[] }>(baseUrl, "/agents", {
        method: "GET"
      }, userId),
    getTenants: () =>
      apiFetch<{ items: Tenant[] }>(baseUrl, "/tenants", {
        method: "GET"
      }, userId),
    getSources: (input: { agentId?: string } = {}) =>
      apiFetch<{ items: Source[] }>(
        baseUrl,
        `/sources${buildQuery(input)}`,
        { method: "GET" },
        userId
      ),
    getChannels: (input: { agentId?: string } = {}) =>
      apiFetch<{ items: Channel[] }>(
        baseUrl,
        `/channels${buildQuery(input)}`,
        { method: "GET" },
        userId
      ),
    updateAgentSettings: (agentId: string, input: AgentSettingsUpdateInput) =>
      apiFetch<{ agent: Agent }>(baseUrl, `/agents/${agentId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      }, userId),
    createSource: (input: SourceCreateInput) =>
      apiFetch<Source>(baseUrl, "/sources", {
        method: "POST",
        body: JSON.stringify(input)
      }, userId),
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
      }, userId),
    ingestText: (sourceId: string, input: TextIngestionInput) =>
      apiFetch<{ chunks: unknown[] }>(baseUrl, `/sources/${sourceId}/ingest-text`, {
        method: "POST",
        body: JSON.stringify(input)
      }, userId),
    retrainSource: (sourceId: string) =>
      apiFetch<{ source: Source }>(baseUrl, `/sources/${sourceId}/retrain`, {
        method: "POST"
      }, userId),
    createChannel: (input: ChannelCreateInput) =>
      apiFetch<Channel>(baseUrl, "/channels", {
        method: "POST",
        body: JSON.stringify(input)
      }, userId),
    updateChannel: (channelId: string, input: ChannelUpdateInput) =>
      apiFetch<{ channel: Channel }>(baseUrl, `/channels/${channelId}`, {
        method: "PATCH",
        body: JSON.stringify(input)
      }, userId),
    getMetricsSummary: (input: {
      tenantId?: string;
      agentId?: string;
      channelId?: string;
      from?: string;
      to?: string;
    }) =>
      apiFetch<MetricsSummary>(
        baseUrl,
        `/metrics/summary${buildQuery(input)}`,
        {
          method: "GET"
        },
        userId
      ),
    getMetricConversations: (input: {
      tenantId?: string;
      agentId?: string;
      channelId?: string;
      from?: string;
      to?: string;
      limit?: number;
      offset?: number;
    }) =>
      apiFetch<{ items: MetricConversation[] }>(
        baseUrl,
        `/metrics/conversations${buildQuery(input)}`,
        {
          method: "GET"
        },
        userId
      )
  };
};
