import { useEffect, useMemo, useState } from "react";
import {
  createApiClient,
  type MetricConversation,
  type MetricsSummary
} from "../api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import StatusIndicator from "@/components/ui/status-indicator";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

const apiBase = import.meta.env?.VITE_API_BASE_URL ?? "http://localhost:4000";
const apiUserId = import.meta.env?.VITE_API_USER_ID ?? "user_admin";
const apiClient = createApiClient(apiBase, apiUserId);

const steps = [
  {
    id: "tenant",
    title: "Create your workspace",
    description: "Pick a name, data region, and retention policy for Norway-first compliance."
  },
  {
    id: "agent",
    title: "Name your support agent",
    description: "Set tone, escalation rules, and auto-routing for Norwegian + English."
  },
  {
    id: "sources",
    title: "Add sources",
    description: "Crawl your website, add snippets, and track ingestion with SLAs."
  },
  {
    id: "channels",
    title: "Deploy a channel",
    description: "Launch web or voice channels with the right deployment artifact and safeguards."
  }
];

type Tenant = {
  id: string;
  name: string;
  plan?: string;
  region: string;
  dataResidency?: string;
  createdAt: string;
};

type AgentStatus = "draft" | "active" | "paused" | "archived";

type Agent = {
  id: string;
  tenantId: string;
  name: string;
  basePrompt?: string;
  model?: string;
  status: AgentStatus;
  createdAt: string;
};

type SourceType = "website" | "file" | "text" | "notion" | "ticketing" | "qa";
type SourceStatus = "queued" | "processing" | "ready" | "failed";

type Source = {
  id: string;
  agentId: string;
  type: SourceType;
  value?: string;
  config?: Record<string, unknown>;
  status: SourceStatus;
  createdAt: string;
  lastSyncedAt?: string;
};

type IngestionJobStatus = "queued" | "processing" | "complete" | "failed";

type IngestionJob = {
  id: string;
  sourceId: string;
  kind: "crawl" | "file" | "text" | "qa";
  status: IngestionJobStatus;
  createdAt: string;
};

type ChannelType =
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

type Channel = {
  id: string;
  agentId: string;
  type: ChannelType;
  config?: Record<string, unknown>;
  enabled: boolean;
  createdAt: string;
};

const channelOptions: Array<{ label: string; value: ChannelType }> = [
  { label: "Web widget", value: "web_widget" },
  { label: "Help page", value: "help_page" },
  { label: "Voice agent", value: "voice_agent" },
  { label: "Slack", value: "slack" },
  { label: "Zendesk", value: "zendesk" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Shopify", value: "shopify" }
];

const domainChannelTypes = new Set<ChannelType>(["web_widget", "help_page"]);

const isDomainChannel = (channelType: ChannelType) => domainChannelTypes.has(channelType);

const isVoiceChannel = (channelType: ChannelType) => channelType === "voice_agent";

const formatError = (error: unknown) => {
  if (error instanceof Error) {
    return error.message;
  }
  return "Something went wrong. Please try again.";
};

const mapJobToProgress = (job: IngestionJob) => {
  if (job.status === "complete") {
    return 100;
  }
  if (job.status === "processing") {
    return 65;
  }
  if (job.status === "queued") {
    return 20;
  }
  return 5;
};

const formatPercent = (value: number | null) => {
  if (value === null) {
    return "--";
  }
  return `${(value * 100).toFixed(1)}%`;
};

const formatSeconds = (value: number | null) => {
  if (value === null) {
    return "--";
  }
  return `${Math.round(value)}s`;
};

const formatMillis = (value: number | null) => {
  if (value === null) {
    return "--";
  }
  return `${Math.round(value)}ms`;
};

const formatRating = (value: number | null) => {
  if (value === null) {
    return "--";
  }
  return value.toFixed(1);
};

export function App() {
  const [stepIndex, setStepIndex] = useState(0);
  const [workspaceName, setWorkspaceName] = useState("Nordic Care");
  const [region, setRegion] = useState("norway-oslo");
  const [dataResidency, setDataResidency] = useState("Norway (Oslo)");
  const [agentName, setAgentName] = useState("Hanna");
  const [agentTone, setAgentTone] = useState("Warm + professional");
  const [basePrompt, setBasePrompt] = useState(
    "You are a Norway-first support agent. Answer with clarity, cite sources when possible, and escalate if unsure."
  );
  const [websiteUrl, setWebsiteUrl] = useState("https://support.nordiccare.no");
  const [snippetTitle, setSnippetTitle] = useState("Returns policy");
  const [snippetContent, setSnippetContent] = useState(
    "Returns are accepted within 30 days with proof of purchase. Refunds post within 5 business days."
  );
  const [domain, setDomain] = useState("support.nordiccare.no");
  const [channelAuthToken, setChannelAuthToken] = useState("voice_shared_secret");
  const [voiceLocale, setVoiceLocale] = useState("nb-NO");
  const [voiceName, setVoiceName] = useState("nb-NO-Standard-A");
  const [voiceSpeakingRate, setVoiceSpeakingRate] = useState("1");
  const [channelType, setChannelType] = useState<ChannelType>("web_widget");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [ingestionJobs, setIngestionJobs] = useState<IngestionJob[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [metricsSummary, setMetricsSummary] = useState<MetricsSummary | null>(null);
  const [metricConversations, setMetricConversations] = useState<MetricConversation[]>([]);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(false);

  useEffect(() => {
    let isActive = true;
    if (!agent) {
      setMetricsSummary(null);
      setMetricConversations([]);
      return () => {
        isActive = false;
      };
    }
    setMetricsLoading(true);
    setMetricsError(null);
    Promise.all([
      apiClient.getMetricsSummary({ agentId: agent.id }),
      apiClient.getMetricConversations({ agentId: agent.id, limit: 6 })
    ])
      .then(([summary, conversations]) => {
        if (!isActive) {
          return;
        }
        setMetricsSummary(summary);
        setMetricConversations(conversations.items);
      })
      .catch((error) => {
        if (!isActive) {
          return;
        }
        setMetricsError(formatError(error));
      })
      .finally(() => {
        if (!isActive) {
          return;
        }
        setMetricsLoading(false);
      });
    return () => {
      isActive = false;
    };
  }, [agent]);

  const step = steps[stepIndex];

  const deployArtifact = useMemo(() => {
    if (!activeChannel) {
      return "Create a channel to generate deployment instructions.";
    }
    if (activeChannel.type === "web_widget") {
      return `<script src="${apiBase}/widget.js" data-channel="${activeChannel.id}" data-api-base="${apiBase}"></script>`;
    }
    if (activeChannel.type === "help_page") {
      return `${apiBase}/help/${activeChannel.id}`;
    }
    return `${apiBase}/channels/${activeChannel.id}/webhook`;
  }, [activeChannel]);

  const deployArtifactLabel = useMemo(() => {
    if (!activeChannel) {
      return "Deployment artifact";
    }
    if (activeChannel.type === "web_widget") {
      return "Embed snippet";
    }
    if (activeChannel.type === "help_page") {
      return "Help page URL";
    }
    if (activeChannel.type === "voice_agent") {
      return "Voice webhook endpoint";
    }
    return "Webhook endpoint";
  }, [activeChannel]);

  const voiceWebhookExample = useMemo(() => {
    if (!activeChannel || activeChannel.type !== "voice_agent") {
      return null;
    }
    const authToken =
      typeof activeChannel.config?.authToken === "string" &&
      activeChannel.config.authToken.length > 0
        ? activeChannel.config.authToken
        : "<voice_channel_token>";
    return [
      `curl -X POST "${apiBase}/channels/${activeChannel.id}/webhook" \\`,
      `  -H "Authorization: Bearer ${authToken}" \\`,
      '  -H "Content-Type: application/json" \\',
      '  -d \'{"transcript":"When are you open?","sessionId":"call_1001","caller":{"phone":"+4799999999"}}\''
    ].join("\n");
  }, [activeChannel]);

  const helpPageUrl = useMemo(() => {
    if (!activeChannel || activeChannel.type !== "help_page") {
      return null;
    }
    return `${apiBase}/help/${activeChannel.id}`;
  }, [activeChannel]);

  const nextStep = () =>
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  const previousStep = () =>
    setStepIndex((current) => Math.max(current - 1, 0));

  const readySources = sources.filter((source) => source.status === "ready").length;
  const processingSources = sources.filter((source) => source.status === "processing").length;
  const queuedSources = sources.filter((source) => source.status === "queued").length;

  const deploymentChecklist = useMemo(() => {
    if (activeChannel?.type === "voice_agent") {
      const authToken =
        typeof activeChannel.config?.authToken === "string" &&
        activeChannel.config.authToken.length > 0;
      const hasVoiceConfig =
        typeof activeChannel.config?.voiceLocale === "string" &&
        typeof activeChannel.config?.voiceName === "string";
      return [
        {
          id: "auth",
          label: "Set webhook auth",
          detail: "Protect voice webhook requests using a shared Bearer token.",
          status: authToken ? "done" : "todo"
        },
        {
          id: "transcript",
          label: "Send transcript payload",
          detail: "POST transcript + session metadata to the voice webhook endpoint.",
          status: activeChannel ? "done" : "todo"
        },
        {
          id: "speech",
          label: "Render speech response",
          detail: "Use reply.speech.ssml (or reply.speech.text) in your TTS provider.",
          status: hasVoiceConfig ? "done" : "todo"
        }
      ];
    }

    const allowedDomains =
      activeChannel?.config && "allowedDomains" in activeChannel.config
        ? (activeChannel.config.allowedDomains as string[] | undefined) ?? []
        : [];
    return [
      {
        id: "allowlist",
        label: "Add allowed domain",
        detail: "Only whitelisted domains can load the widget.",
        status: allowedDomains.length > 0 ? "done" : "todo"
      },
      {
        id: "snippet",
        label: "Install embed snippet",
        detail: "Paste the script tag before </body>.",
        status: activeChannel ? "done" : "todo"
      },
      {
        id: "handover",
        label: "Enable escalation",
        detail: "Route low-confidence answers to Zendesk.",
        status: "todo"
      }
    ];
  }, [activeChannel]);

  const seriesMax = useMemo(() => {
    if (!metricsSummary) {
      return 0;
    }
    return metricsSummary.series.reduce(
      (max, point) => Math.max(max, point.conversations),
      0
    );
  }, [metricsSummary]);

  const metricsWindowLabel = metricsSummary
    ? `${metricsSummary.window.from.slice(0, 10)} → ${metricsSummary.window.to.slice(0, 10)}`
    : "Last 7 days";

  const continueLabel = stepIndex === steps.length - 1 ? "Finish onboarding" : "Continue";

  const canContinue = useMemo(() => {
    if (isSubmitting) {
      return false;
    }
    if (step.id === "tenant") {
      return workspaceName.trim().length > 0;
    }
    if (step.id === "agent") {
      return Boolean(tenant) && agentName.trim().length > 0;
    }
    if (step.id === "sources") {
      return sources.length > 0;
    }
    if (step.id === "channels") {
      return Boolean(activeChannel);
    }
    return true;
  }, [activeChannel, agentName, isSubmitting, sources.length, step.id, tenant, workspaceName]);

  const handleCreateTenant = async () => {
    if (!workspaceName.trim()) {
      setErrorMessage("Workspace name is required.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const created = await apiClient.createTenant({
        name: workspaceName.trim(),
        plan: "starter",
        region,
        dataResidency
      });
      setTenant(created);
      nextStep();
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCreateAgent = async () => {
    if (!tenant) {
      setErrorMessage("Create a workspace before adding an agent.");
      return;
    }
    if (!agentName.trim()) {
      setErrorMessage("Agent name is required.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const created = await apiClient.createAgent({
        tenantId: tenant.id,
        name: agentName.trim(),
        basePrompt
      });
      setAgent(created);
      nextStep();
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddWebsite = async () => {
    if (!agent) {
      setErrorMessage("Create an agent before adding sources.");
      return;
    }
    if (!websiteUrl.trim()) {
      setErrorMessage("Enter a website URL to crawl.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.createCrawlSource({
        agentId: agent.id,
        startUrls: [websiteUrl.trim()]
      });
      setSources((current) => [...current, response.source]);
      setIngestionJobs((current) => [...current, response.job]);
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddSnippet = async () => {
    if (!agent) {
      setErrorMessage("Create an agent before adding sources.");
      return;
    }
    if (!snippetContent.trim()) {
      setErrorMessage("Add a snippet before ingesting.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const source = await apiClient.createSource({
        agentId: agent.id,
        type: "text",
        value: snippetTitle.trim() || "Knowledge snippet"
      });

      await apiClient.ingestText(source.id, {
        text: snippetContent,
        metadata: {
          title: snippetTitle.trim() || "Knowledge snippet",
          tone: agentTone
        }
      });

      setSources((current) => [
        ...current,
        {
          ...source,
          status: "ready",
          lastSyncedAt: new Date().toISOString()
        }
      ]);
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetrain = async () => {
    const readyItems = sources.filter((source) => source.status === "ready");
    if (readyItems.length === 0) {
      setErrorMessage("Add at least one ready source before retraining.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const updatedSources = await Promise.all(
        readyItems.map(async (source) => {
          const response = await apiClient.retrainSource(source.id);
          return response.source;
        })
      );
      setSources((current) =>
        current.map((source) =>
          updatedSources.find((item) => item.id === source.id) ?? source
        )
      );
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const buildChannelConfig = (selectedType: ChannelType) => {
    if (isDomainChannel(selectedType)) {
      return {
        allowedDomains: domain.trim() ? [domain.trim()] : []
      };
    }

    const authToken = channelAuthToken.trim();
    if (!authToken) {
      setErrorMessage("Auth token is required for webhook channels.");
      return null;
    }

    if (!isVoiceChannel(selectedType)) {
      return { authToken };
    }

    const speakingRate = Number(voiceSpeakingRate);
    if (!Number.isFinite(speakingRate) || speakingRate < 0.5 || speakingRate > 2) {
      setErrorMessage("Voice speaking rate must be between 0.5 and 2.0.");
      return null;
    }

    return {
      authToken,
      voiceLocale: voiceLocale.trim() || "nb-NO",
      voiceName: voiceName.trim() || "nb-NO-Standard-A",
      speakingRate: Number(speakingRate.toFixed(2))
    };
  };

  const handleDeployChannel = async () => {
    if (!agent) {
      setErrorMessage("Create an agent before deploying a channel.");
      return;
    }
    setErrorMessage(null);
    const config = buildChannelConfig(channelType);
    if (!config) {
      return;
    }
    setIsSubmitting(true);
    try {
      const channel = await apiClient.createChannel({
        agentId: agent.id,
        type: channelType,
        config,
        enabled: true
      });
      setActiveChannel(channel);
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateChannelConfig = async () => {
    if (!activeChannel) {
      return;
    }
    setErrorMessage(null);
    const config = buildChannelConfig(activeChannel.type);
    if (!config) {
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await apiClient.updateChannel(activeChannel.id, {
        config
      });
      setActiveChannel(response.channel);
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleContinue = async () => {
    if (step.id === "tenant") {
      await handleCreateTenant();
      return;
    }
    if (step.id === "agent") {
      await handleCreateAgent();
      return;
    }
    if (step.id === "sources") {
      if (sources.length === 0) {
        setErrorMessage("Add at least one source to continue.");
        return;
      }
      nextStep();
      return;
    }
    if (step.id === "channels") {
      return;
    }
    nextStep();
  };

  return (
    <div className="app">
      <header className="hero">
        <div>
          <p className="eyebrow">Norway-first AI Support OS</p>
          <h1>Launch a fully trained support agent in minutes.</h1>
          <p className="lead">
            The fastest way for Norwegian teams to onboard, ingest knowledge, and deploy
            a multi-channel AI assistant.
          </p>
        </div>
        <div className="hero-card">
          <div>
            <p className="metric-label">Time to first agent</p>
            <p className="metric-value">09:12</p>
          </div>
          <div>
            <p className="metric-label">Sources ingested</p>
            <p className="metric-value">{sources.length}</p>
          </div>
          <div>
            <p className="metric-label">GDPR mode</p>
            <div className="metric-value">
              <StatusIndicator state="active" label="Enabled" size="sm" labelClassName="text-white" />
            </div>
          </div>
        </div>
      </header>

      <section className="onboarding">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>10-minute onboarding flow</h2>
              <p className="muted">
                Complete each step to deploy your first channel and start deflecting tickets.
              </p>
            </div>
            <Badge className="badge" variant="secondary">
              Step {stepIndex + 1} of {steps.length}
            </Badge>
          </div>
          <div className="progress-track">
            <div className="progress-bar">
              <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
            </div>
            <p className="muted">{stepIndex + 1} of {steps.length} steps complete</p>
          </div>
          <div className="steps">
            {steps.map((item, index) => (
              <Button
                key={item.id}
                type="button"
                variant="ghost"
                className={`step ${index === stepIndex ? "active" : ""}`}
                onClick={() => setStepIndex(index)}
              >
                <span className="step-index">0{index + 1}</span>
                <span>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>
              </Button>
            ))}
          </div>
          <div className="status-grid">
            <div className="status-card">
              <p className="status-label">Sources connected</p>
              <p className="status-value">{sources.length}</p>
            </div>
            <div className="status-card">
              <p className="status-label">Ingestion queue</p>
              <p className="status-value">{queuedSources + processingSources}</p>
            </div>
            <div className="status-card">
              <p className="status-label">Deflection goal</p>
              <p className="status-value">65%</p>
            </div>
          </div>
          {errorMessage && <div className="notice error">{errorMessage}</div>}
          <div className="panel-controls">
            <Button type="button" variant="ghost" onClick={previousStep} disabled={stepIndex === 0}>
              Back
            </Button>
            <Button type="button" onClick={handleContinue} disabled={!canContinue}>
              {continueLabel}
            </Button>
          </div>
        </div>

        <div className="panel detail">
          <div className="panel-header">
            <div>
              <h3>{step.title}</h3>
              <p className="muted">{step.description}</p>
            </div>
            <span className="status">Live preview</span>
          </div>

          {step.id === "tenant" && (
            <div className="form-grid">
              <label>
                Workspace name
                <Input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
              </label>
              <label>
                Data region
                <Select value={region} onChange={(event) => setRegion(event.target.value)}>
                  <option value="norway-oslo">Norway (Oslo)</option>
                  <option value="eu-north">EU North (Stockholm)</option>
                </Select>
              </label>
              <label>
                Data residency profile
                <Input value={dataResidency} onChange={(event) => setDataResidency(event.target.value)} />
              </label>
              <div className="info-card">
                <h4>GDPR by default</h4>
                <p>
                  We keep data in-region, encrypt at rest, and provide deletion controls for end users.
                </p>
              </div>
              <div className="info-card">
                <h4>Retention policy</h4>
                <p>Conversation data stored for 30 days with auto-purge and audit logs.</p>
              </div>
            </div>
          )}

          {step.id === "agent" && (
            <div className="form-grid">
              <label>
                Agent name
                <Input value={agentName} onChange={(event) => setAgentName(event.target.value)} />
              </label>
              <label>
                Tone preset
                <Select value={agentTone} onChange={(event) => setAgentTone(event.target.value)}>
                  <option>Warm + professional</option>
                  <option>Concise + direct</option>
                  <option>Playful + friendly</option>
                </Select>
              </label>
              <label>
                Base prompt
                <Textarea
                  rows={4}
                  value={basePrompt}
                  onChange={(event) => setBasePrompt(event.target.value)}
                />
              </label>
              <div className="info-card">
                <h4>Model routing</h4>
                <p>
                  We automatically choose the best model for Norwegian and English based on query intent.
                </p>
              </div>
              <div className="info-card">
                <h4>Escalation rules</h4>
                <p>Low-confidence answers are escalated with transcript + next best action.</p>
              </div>
            </div>
          )}

          {step.id === "sources" && (
            <div>
              <div className="status-grid dense">
                <div className="status-card">
                  <p className="status-label">Ready</p>
                  <p className="status-value">{readySources}</p>
                </div>
                <div className="status-card">
                  <p className="status-label">Processing</p>
                  <p className="status-value">{processingSources}</p>
                </div>
                <div className="status-card">
                  <p className="status-label">Queued</p>
                  <p className="status-value">{queuedSources}</p>
                </div>
              </div>

              <div className="form-grid">
                <label>
                  Website URL
                  <Input
                    value={websiteUrl}
                    onChange={(event) => setWebsiteUrl(event.target.value)}
                    placeholder="https://help.company.no"
                  />
                </label>
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddWebsite}
              disabled={isSubmitting}
            >
              Add website crawl
            </Button>
                <label>
                  Snippet title
                  <Input
                    value={snippetTitle}
                    onChange={(event) => setSnippetTitle(event.target.value)}
                    placeholder="Returns policy"
                  />
                </label>
                <label>
                  Knowledge snippet
                  <Textarea
                    rows={4}
                    value={snippetContent}
                    onChange={(event) => setSnippetContent(event.target.value)}
                    placeholder="Paste a short policy or FAQ answer to ingest."
                  />
                </label>
            <Button
              type="button"
              variant="secondary"
              onClick={handleAddSnippet}
              disabled={isSubmitting}
            >
              Add snippet source
            </Button>
              </div>

              <div className="source-grid">
                {sources.length === 0 ? (
                  <p className="muted">No sources yet. Add a website or snippet to start ingestion.</p>
                ) : (
                  sources.map((source) => (
                    <div key={source.id} className="source-card">
                      <div>
                        <p className="source-type">{source.type}</p>
                        <p className="source-value">{source.value ?? "Configured source"}</p>
                      </div>
                      <Badge className={`pill ${source.status}`} variant="secondary">
                        {source.status}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
              <div className="panel-controls">
            <Button
              type="button"
              variant="secondary"
              onClick={handleRetrain}
              disabled={isSubmitting}
            >
              Trigger retrain
            </Button>
              </div>
              <div className="ingestion-grid">
                {ingestionJobs.length === 0 ? (
                  <p className="muted">Ingestion jobs will appear here once sources are queued.</p>
                ) : (
                  ingestionJobs.map((run) => (
                    <div key={run.id} className="ingestion-card">
                      <div>
                        <p className="status-label">{run.kind === "crawl" ? "Website crawl" : "File ingestion"}</p>
                        <p className="status-meta">Status: {run.status}</p>
                      </div>
                      <div className="progress-bar">
                        <span style={{ width: `${mapJobToProgress(run)}%` }} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {step.id === "channels" && (
            <div className="form-grid">
              <label>
                Channel
                <Select
                  value={channelType}
                  onChange={(event) => setChannelType(event.target.value as ChannelType)}
                >
                  {channelOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </Select>
              </label>
              {isDomainChannel(channelType) && (
                <label>
                  Allowed domain
                  <Input value={domain} onChange={(event) => setDomain(event.target.value)} />
                </label>
              )}
              {!isDomainChannel(channelType) && (
                <label>
                  Auth token
                  <Input
                    value={channelAuthToken}
                    onChange={(event) => setChannelAuthToken(event.target.value)}
                  />
                </label>
              )}
              {isVoiceChannel(channelType) && (
                <>
                  <label>
                    Voice locale
                    <Input value={voiceLocale} onChange={(event) => setVoiceLocale(event.target.value)} />
                  </label>
                  <label>
                    Voice name
                    <Input value={voiceName} onChange={(event) => setVoiceName(event.target.value)} />
                  </label>
                  <label>
                    Speaking rate (0.5-2.0)
                    <Input
                      value={voiceSpeakingRate}
                      onChange={(event) => setVoiceSpeakingRate(event.target.value)}
                    />
                  </label>
                </>
              )}
              <div className="panel-controls">
              <Button
                type="button"
                variant="secondary"
                onClick={handleDeployChannel}
                disabled={isSubmitting}
              >
                Deploy channel
              </Button>
              {activeChannel && (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={handleUpdateChannelConfig}
                  disabled={isSubmitting}
                >
                  {isDomainChannel(activeChannel.type) ? "Update allowlist" : "Update channel config"}
                </Button>
              )}
            </div>
              <div className="info-card">
                <h4>{deployArtifactLabel}</h4>
                <code>{deployArtifact}</code>
              </div>
              {helpPageUrl && (
                <div className="info-card">
                  <h4>Help page URL</h4>
                  <code>{helpPageUrl}</code>
                </div>
              )}
              {voiceWebhookExample && (
                <div className="info-card">
                  <h4>Voice webhook example</h4>
                  <code>{voiceWebhookExample}</code>
                </div>
              )}
              <div className="checklist">
                {deploymentChecklist.map((item) => (
                  <div key={item.id} className={`checklist-item ${item.status}`}>
                    <div>
                      <p className="checklist-title">{item.label}</p>
                      <p className="checklist-detail">{item.detail}</p>
                    </div>
                    <Badge className="pill soft" variant="outline">
                      {item.status}
                    </Badge>
                  </div>
                ))}
              </div>
            <div className="preview-card">
              <p className="status-label">
                {isVoiceChannel(channelType) ? "Voice preview" : "Widget preview"}
              </p>
              <p className="preview-title">
                {isVoiceChannel(channelType)
                  ? `Voice agent ${agentName} is ready for call transcripts.`
                  : `Hi, I am ${agentName}.`}
              </p>
              <p className="muted">
                {isVoiceChannel(channelType)
                  ? "Webhook replies include text + SSML so your telephony stack can synthesize audio."
                  : "Ask me about returns, shipping, or warranty policies."}
              </p>
              <Button type="button">
                {isVoiceChannel(channelType) ? "Simulate call turn" : "Open live chat"}
              </Button>
            </div>
            </div>
          )}
        </div>
      </section>

      <section className="observability">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>Observability dashboard</h2>
              <p className="muted">
                Monitor deflection, response speed, and retrieval quality across channels.
              </p>
            </div>
            <Badge className="badge" variant="secondary">{metricsWindowLabel}</Badge>
          </div>
          {metricsError && <div className="notice error">{metricsError}</div>}
          <div className="metric-grid">
            <div className="metric-card">
              <p className="metric-label">Deflection rate</p>
              <p className="metric-value">
                {formatPercent(metricsSummary ? metricsSummary.rates.deflectionRate : null)}
              </p>
              <p className="metric-meta">
                {metricsSummary
                  ? `${metricsSummary.totals.deflected} resolved · ${metricsSummary.totals.escalated} escalated`
                  : "Awaiting first conversations"}
              </p>
            </div>
            <div className="metric-card">
              <p className="metric-label">First response</p>
              <p className="metric-value">
                {formatSeconds(
                  metricsSummary ? metricsSummary.rates.avgFirstResponseSeconds : null
                )}
              </p>
              <p className="metric-meta">Average time to first agent reply.</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Resolution time</p>
              <p className="metric-value">
                {formatSeconds(
                  metricsSummary ? metricsSummary.rates.avgResolutionSeconds : null
                )}
              </p>
              <p className="metric-meta">Includes escalations.</p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Retrieval latency</p>
              <p className="metric-value">
                {formatMillis(
                  metricsSummary ? metricsSummary.rates.avgRetrievalLatencyMs : null
                )}
              </p>
              <p className="metric-meta">
                {metricsSummary ? `${metricsSummary.totals.retrievals} searches` : "—"}
              </p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Feedback score</p>
              <p className="metric-value">
                {formatRating(
                  metricsSummary ? metricsSummary.rates.avgFeedbackRating : null
                )}
              </p>
              <p className="metric-meta">
                {metricsSummary ? `${metricsSummary.totals.feedbackCount} ratings` : "—"}
              </p>
            </div>
            <div className="metric-card">
              <p className="metric-label">Ingestion completions</p>
              <p className="metric-value">
                {metricsSummary ? metricsSummary.totals.ingestionCompleted : "--"}
              </p>
              <p className="metric-meta">Last 7 days.</p>
            </div>
          </div>
          <div className="series-grid">
            <h3>Conversation volume</h3>
            {metricsSummary && metricsSummary.series.length > 0 ? (
              <div className="series-list">
                {metricsSummary.series.map((point) => (
                  <div key={point.date} className="series-row">
                    <span className="series-label">{point.date.slice(5)}</span>
                    <div className="series-bar">
                      <span
                        style={{
                          width: seriesMax
                            ? `${Math.max(
                                6,
                                (point.conversations / seriesMax) * 100
                              )}%`
                            : "6%"
                        }}
                      />
                    </div>
                    <span className="series-value">
                      {point.conversations} / {point.deflections} deflected
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Metrics will appear once conversations start flowing.</p>
            )}
          </div>
          <div className="intent-grid">
            <h3>Top intents</h3>
            {metricsSummary && metricsSummary.topIntents.length > 0 ? (
              <div className="intent-list">
                {metricsSummary.topIntents.map((intent) => (
                  <div key={intent.intent} className="intent-card">
                    <p className="intent-title">{intent.intent}</p>
                    <p className="intent-meta">{intent.count} conversations</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">Top intents will populate as conversations resolve.</p>
            )}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <h3>Conversation review</h3>
              <p className="muted">
                Track live sessions with response times, intent, and escalation signals.
              </p>
            </div>
            <span className="status">{metricsLoading ? "Refreshing" : "Live"}</span>
          </div>
          {!agent && (
            <p className="muted">
              Create an agent to start capturing conversation-level observability.
            </p>
          )}
          {agent && metricConversations.length === 0 && !metricsLoading && (
            <p className="muted">No conversations yet. Once customers chat, they appear here.</p>
          )}
          {agent && metricConversations.length > 0 && (
            <div className="conversation-list">
              {metricConversations.map((conversation) => (
                <div key={conversation.conversationId} className="conversation-row">
                  <div>
                    <p className="conversation-id">{conversation.conversationId}</p>
                    <p className="muted">
                      {conversation.intent ?? "Intent pending"}
                    </p>
                  </div>
                  <span className={`status-pill ${conversation.status}`}>
                    {conversation.status}
                  </span>
                  <div>
                    <p className="metric-label">First response</p>
                    <p className="metric-value">
                      {formatSeconds(conversation.firstResponseSeconds)}
                    </p>
                  </div>
                  <div>
                    <p className="metric-label">Resolution</p>
                    <p className="metric-value">
                      {formatSeconds(conversation.resolutionSeconds)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="split">
        <div>
          <h2>What you get on day one</h2>
          <p className="muted">
            Launch-ready ingestion, actions, and channels so teams can onboard fast and stay
            compliant from the start.
          </p>
          <div className="pill-row">
            {[
              "Website crawl",
              "PDF & files",
              "Notion",
              "Zendesk",
              "Slack",
              "Voice agent",
              "Shopify",
              "Stripe",
              "Cal.com",
              "GDPR controls"
            ].map((item) => (
              <Badge key={item} className="pill soft" variant="outline">
                {item}
              </Badge>
            ))}
          </div>
        </div>
        <div className="insight-card">
          <h3>Confidence routing</h3>
          <p className="muted">
            Low-confidence answers automatically escalate to your CRM with context and next actions.
          </p>
          <div className="timeline">
            <div>
              <p className="timeline-title">Ticket created</p>
              <p className="timeline-meta">Zendesk • 00:12</p>
            </div>
            <div>
              <p className="timeline-title">Slack alert sent</p>
              <p className="timeline-meta">#support • 00:15</p>
            </div>
            <div>
              <p className="timeline-title">Customer updated</p>
              <p className="timeline-meta">Web widget • 00:22</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
