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
    title: "Deploy a web widget",
    description: "Generate an embed snippet, allow your domain, and preview chat."
  }
];

const highlightItems = [
  {
    title: "Fast setup for support teams",
    description: "Launch an AI support agent in minutes with a guided, production-ready flow."
  },
  {
    title: "Broad ingestion coverage",
    description: "Combine website crawl, snippets, and app connectors in one onboarding journey."
  },
  {
    title: "Multi-channel from day one",
    description: "Deploy on web, help pages, and support tools without rebuilding your workflow."
  },
  {
    title: "GDPR-aligned controls",
    description: "Use region-aware storage, retention defaults, and escalation guardrails."
  }
];

const benefitItems = [
  {
    title: "Deflect repetitive tickets",
    detail: "Resolve recurring support questions instantly while keeping quality high."
  },
  {
    title: "Escalate with context",
    detail: "Send low-confidence cases to your team with transcript and next-best action."
  },
  {
    title: "Improve over time",
    detail: "Track intent coverage, latency, and feedback to optimize weekly."
  }
];

const testimonials = [
  {
    quote:
      "We went from pilot to production in one afternoon and saw faster first-response times within a week.",
    author: "Head of CX, Nordic ecommerce brand"
  },
  {
    quote:
      "The onboarding flow made it easy for operations and support to collaborate without engineering blockers.",
    author: "Support Operations Manager, SaaS scale-up"
  }
];

const securitySignals = [
  "GDPR-ready data handling",
  "SOC 2 Type II controls",
  "Norway/EU data residency options"
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
  retrievalConfig?: {
    minScore?: number;
    maxResults?: number;
  };
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
  | "wordpress";

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
  { label: "Slack", value: "slack" },
  { label: "Zendesk", value: "zendesk" },
  { label: "WhatsApp", value: "whatsapp" },
  { label: "Shopify", value: "shopify" }
];

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

const formatStepNumber = (index: number) => String(index + 1).padStart(2, "0");

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
  const [settingsModel, setSettingsModel] = useState("gpt-4.1");
  const [settingsMinScore, setSettingsMinScore] = useState("0");
  const [settingsMaxResults, setSettingsMaxResults] = useState("5");
  const [websiteUrl, setWebsiteUrl] = useState("https://support.nordiccare.no");
  const [snippetTitle, setSnippetTitle] = useState("Returns policy");
  const [snippetContent, setSnippetContent] = useState(
    "Returns are accepted within 30 days with proof of purchase. Refunds post within 5 business days."
  );
  const [domain, setDomain] = useState("support.nordiccare.no");
  const [channelType, setChannelType] = useState<ChannelType>("web_widget");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [ingestionJobs, setIngestionJobs] = useState<IngestionJob[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [onboardingSuccess, setOnboardingSuccess] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsSuccess, setSettingsSuccess] = useState<string | null>(null);
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

  useEffect(() => {
    let isActive = true;
    (async () => {
      try {
        const [agentsResponse, tenantsResponse] = await Promise.all([
          apiClient.getAgents(),
          apiClient.getTenants().catch(() => ({ items: [] as Tenant[] }))
        ]);
        if (!isActive || agentsResponse.items.length === 0) {
          return;
        }
        const latest = [...agentsResponse.items].sort(
          (left, right) =>
            new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
        )[0];
        setAgent(latest);
        setAgentName(latest.name);

        const matchingTenant =
          tenantsResponse.items.find((candidate) => candidate.id === latest.tenantId) ?? null;
        if (matchingTenant) {
          setTenant(matchingTenant);
          setWorkspaceName(matchingTenant.name);
          if (matchingTenant.region) {
            setRegion(matchingTenant.region);
          }
          if (matchingTenant.dataResidency) {
            setDataResidency(matchingTenant.dataResidency);
          }
        }

        const [sourcesResponse, channelsResponse] = await Promise.all([
          apiClient
            .getSources({ agentId: latest.id })
            .catch(() => ({ items: [] as Source[] })),
          apiClient
            .getChannels({ agentId: latest.id })
            .catch(() => ({ items: [] as Channel[] }))
        ]);
        if (!isActive) {
          return;
        }

        const restoredSources = sourcesResponse.items;
        setSources(restoredSources);

        const restoredChannel =
          [...channelsResponse.items].sort(
            (left, right) =>
              new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()
          )[0] ?? null;
        if (restoredChannel) {
          setActiveChannel(restoredChannel);
          setChannelType(restoredChannel.type);
          const allowedDomains = (restoredChannel.config as { allowedDomains?: unknown })
            ?.allowedDomains;
          const firstDomain = Array.isArray(allowedDomains) ? allowedDomains[0] : undefined;
          if (typeof firstDomain === "string" && firstDomain.length > 0) {
            setDomain(firstDomain);
          }
        }

        // Advance onboarding to the furthest completed step so counters stay accurate.
        const furthestIndex = restoredChannel
          ? steps.length - 1
          : restoredSources.length > 0
            ? steps.findIndex((entry) => entry.id === "channels")
            : steps.findIndex((entry) => entry.id === "sources");
        if (furthestIndex >= 0) {
          setStepIndex(furthestIndex);
        }
      } catch {
        // swallow hydration errors; user can still proceed manually
      }
    })();
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!agent) {
      return;
    }
    if (agent.basePrompt) {
      setBasePrompt(agent.basePrompt);
    }
    setSettingsModel(agent.model ?? "gpt-4.1");
    setSettingsMinScore(String(agent.retrievalConfig?.minScore ?? 0));
    setSettingsMaxResults(String(agent.retrievalConfig?.maxResults ?? 5));
    setSettingsError(null);
  }, [agent]);

  const step = steps[stepIndex];

  const embedSnippet = useMemo(() => {
    if (!activeChannel) {
      return "Create a channel to generate your snippet.";
    }
    return `<script src="${apiBase}/widget.js" data-channel="${activeChannel.id}" data-api-base="${apiBase}"></script>`;
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
    setOnboardingSuccess(null);
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
    setOnboardingSuccess(null);
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
    setOnboardingSuccess(null);
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
    setOnboardingSuccess(null);
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
    setOnboardingSuccess(null);
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

  const handleDeployChannel = async () => {
    if (!agent) {
      setErrorMessage("Create an agent before deploying a channel.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    setOnboardingSuccess(null);
    try {
      const channel = await apiClient.createChannel({
        agentId: agent.id,
        type: channelType,
        config: {
          allowedDomains: domain.trim() ? [domain.trim()] : []
        },
        enabled: true
      });
      setActiveChannel(channel);
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpdateAllowlist = async () => {
    if (!activeChannel) {
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await apiClient.updateChannel(activeChannel.id, {
        config: {
          allowedDomains: domain.trim() ? [domain.trim()] : []
        }
      });
      setActiveChannel(response.channel);
    } catch (error) {
      setErrorMessage(formatError(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveAgentSettings = async () => {
    setSettingsSuccess(null);
    if (!agent) {
      setSettingsError("Create an agent before updating settings.");
      return;
    }
    if (!basePrompt.trim()) {
      setSettingsError("Base prompt is required.");
      return;
    }
    if (!settingsModel.trim()) {
      setSettingsError("Model is required.");
      return;
    }
    const minScore = Number(settingsMinScore);
    if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
      setSettingsError("Min score must be between 0 and 1.");
      return;
    }
    const maxResults = Number(settingsMaxResults);
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 10) {
      setSettingsError("Max results must be an integer from 1 to 10.");
      return;
    }

    setIsSavingSettings(true);
    setSettingsError(null);
    setSettingsSuccess(null);
    try {
      const response = await apiClient.updateAgentSettings(agent.id, {
        basePrompt: basePrompt.trim(),
        model: settingsModel.trim(),
        retrievalConfig: {
          minScore,
          maxResults
        }
      });
      setAgent(response.agent);
      setSettingsSuccess("Agent settings saved.");
    } catch (error) {
      setSettingsError(formatError(error));
    } finally {
      setIsSavingSettings(false);
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
      if (!activeChannel) {
        setErrorMessage("Deploy a channel before finishing onboarding.");
        return;
      }
      setErrorMessage(null);
      setOnboardingSuccess("Onboarding complete. Your widget channel is ready.");
      window.requestAnimationFrame(() => {
        document
          .getElementById("admin-settings")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
      return;
    }
    nextStep();
  };

  return (
    <div className="app">
      {/* ============================================================
          HERO
          ============================================================ */}
      <header className="hero">
        <div className="hero-content">
          <p className="eyebrow accent">Norway-first AI Support OS</p>
          <h1>
            Build an AI support agent that resolves{" "}
            <em>more conversations, faster.</em>
          </h1>
          <p className="lead">
            Onboard in minutes, ingest knowledge from your existing stack, and launch across
            channels with GDPR-aligned defaults.
          </p>
          <div className="hero-cta-row">
            <Button asChild size="lg">
              <a href="#onboarding">Start onboarding</a>
            </Button>
            <Button variant="secondary" asChild size="lg">
              <a href="#how-it-works">See how it works</a>
            </Button>
          </div>
          <p className="hero-meta">
            Trusted by Nordic support teams in ecommerce, SaaS, and customer operations
          </p>
        </div>
        <aside className="hero-card" aria-label="Onboarding snapshot">
          <div>
            <p className="status-label">Time to first agent</p>
            <p className="status-value">09:12</p>
          </div>
          <div>
            <p className="status-label">Sources ingested</p>
            <p className="status-value">{sources.length}</p>
          </div>
          <div>
            <p className="status-label">GDPR mode</p>
            <div style={{ marginTop: "var(--space-1)" }}>
              <StatusIndicator state="active" label="Enabled — Norway (Oslo)" size="sm" />
            </div>
          </div>
        </aside>
      </header>

      {/* ============================================================
          HIGHLIGHTS — editorial columns
          ============================================================ */}
      <section className="highlights" aria-label="Platform highlights">
        {highlightItems.map((item, index) => (
          <article key={item.title} className="highlight-card">
            <span className="highlight-num">— {formatStepNumber(index)}</span>
            <h3>{item.title}</h3>
            <p className="muted">{item.description}</p>
          </article>
        ))}
      </section>

      {/* ============================================================
          HOW IT WORKS
          ============================================================ */}
      <section id="how-it-works" className="story-section" aria-label="How it works">
        <div className="section-head">
          <div>
            <p className="eyebrow">How it works</p>
            <h2>Four steps from signup to live deployment.</h2>
          </div>
          <Button variant="secondary" asChild>
            <a href="#onboarding">Try the 10-minute flow</a>
          </Button>
        </div>
        <div className="story-grid">
          {steps.map((item, index) => (
            <article key={item.id} className="story-card">
              <p className="story-step">Step {formatStepNumber(index)}</p>
              <h3>{item.title}</h3>
              <p className="muted">{item.description}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ============================================================
          ONBOARDING FLOW
          ============================================================ */}
      <section id="onboarding" className="onboarding" aria-label="Onboarding">
        {/* Left: step list + progress + overall status */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Onboarding</p>
              <h2>10-minute setup.</h2>
              <p className="muted">
                Complete each step to deploy your first widget and start deflecting tickets.
              </p>
            </div>
            <Badge variant="secondary" className="tabular">
              {formatStepNumber(stepIndex)} / {formatStepNumber(steps.length - 1)}
            </Badge>
          </div>

          <div className="progress-track">
            <div className="progress-bar" aria-hidden>
              <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
            </div>
            <p className="meta tabular">
              {stepIndex + 1} of {steps.length} steps complete
            </p>
          </div>

          <div className="steps" role="list">
            {steps.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`step ${index === stepIndex ? "active" : ""}`}
                onClick={() => setStepIndex(index)}
                aria-current={index === stepIndex ? "step" : undefined}
              >
                <span className="step-index">{formatStepNumber(index)}</span>
                <span>
                  <strong>{item.title}</strong>
                  <span>{item.description}</span>
                </span>
              </button>
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
          {onboardingSuccess && <div className="notice success">{onboardingSuccess}</div>}

          <div className="panel-controls">
            <Button type="button" variant="ghost" onClick={previousStep} disabled={stepIndex === 0}>
              ← Back
            </Button>
            <Button type="button" onClick={handleContinue} disabled={!canContinue}>
              {continueLabel} →
            </Button>
          </div>
        </div>

        {/* Right: detail panel, per-step content */}
        <div className="panel detail">
          <div className="panel-header">
            <div>
              <p className="eyebrow">
                Step {stepIndex + 1} of {steps.length} — {step.id}
              </p>
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
                  Data stays in-region, encrypts at rest, and ships with deletion controls for end users.
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
                <p>Low-confidence answers are escalated with transcript + next-best action.</p>
              </div>
            </div>
          )}

          {step.id === "sources" && (
            <div className="form-grid">
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

              <div className="source-grid">
                {sources.length === 0 ? (
                  <p className="muted" style={{ padding: "var(--space-3) 0" }}>
                    No sources yet. Add a website or snippet to start ingestion.
                  </p>
                ) : (
                  sources.map((source) => (
                    <div key={source.id} className="source-card">
                      <div>
                        <p className="source-type">{source.type}</p>
                        <p className="source-value">{source.value ?? "Configured source"}</p>
                      </div>
                      <span className={`pill ${source.status}`}>{source.status}</span>
                    </div>
                  ))
                )}
              </div>

              <div className="panel-controls">
                <Button
                  type="button"
                  variant="ghost"
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
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "var(--space-3)" }}>
                        <div>
                          <p className="status-label">
                            {run.kind === "crawl" ? "Website crawl" : "File ingestion"}
                          </p>
                          <p className="status-meta">Status: {run.status}</p>
                        </div>
                        <span className={`pill ${run.status === "complete" ? "ready" : run.status}`}>
                          {run.status}
                        </span>
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
              <label>
                Allowed domain
                <Input value={domain} onChange={(event) => setDomain(event.target.value)} />
              </label>
              <div className="panel-controls" style={{ borderTop: "none", paddingTop: 0 }}>
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
                    onClick={handleUpdateAllowlist}
                    disabled={isSubmitting}
                  >
                    Update allowlist
                  </Button>
                )}
              </div>

              <div className="info-card">
                <h4>Embed snippet</h4>
                <code>{embedSnippet}</code>
              </div>
              {helpPageUrl && (
                <div className="info-card">
                  <h4>Help page URL</h4>
                  <code>{helpPageUrl}</code>
                </div>
              )}

              <div className="checklist">
                {deploymentChecklist.map((item) => (
                  <div key={item.id} className="checklist-item">
                    <div>
                      <p className="checklist-title">{item.label}</p>
                      <p className="checklist-detail">{item.detail}</p>
                    </div>
                    <span className={`pill ${item.status === "done" ? "ready" : "soft"}`}>
                      {item.status}
                    </span>
                  </div>
                ))}
              </div>

              <div className="preview-card">
                <p className="status-label">Widget preview</p>
                <p className="preview-title"><em>Hi, I&apos;m {agentName}.</em></p>
                <p className="muted">Ask me about returns, shipping, or warranty policies.</p>
                <div>
                  <Button type="button">Open live chat →</Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ============================================================
          ADMIN SETTINGS
          ============================================================ */}
      <section id="admin-settings" aria-label="Agent settings">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Agent settings</p>
              <h2>Post-onboarding agent settings</h2>
              <p className="muted">
                Tune prompt, model, and retrieval defaults without re-running onboarding.
              </p>
            </div>
            <span className="status">{isSavingSettings ? "Saving…" : "Ready"}</span>
          </div>

          {!agent && (
            <p className="muted">
              Complete onboarding first, then configure prompt, model, and retrieval behavior here.
            </p>
          )}

          {agent && (
            <>
              <div className="form-grid">
                <label>
                  Base prompt
                  <Textarea
                    rows={4}
                    value={basePrompt}
                    onChange={(event) => {
                      setBasePrompt(event.target.value);
                      setSettingsSuccess(null);
                    }}
                  />
                </label>
                <label>
                  Model
                  <Select
                    value={settingsModel}
                    onChange={(event) => {
                      setSettingsModel(event.target.value);
                      setSettingsSuccess(null);
                    }}
                  >
                    <option value="gpt-4.1">gpt-4.1</option>
                    <option value="gpt-4o-mini">gpt-4o-mini</option>
                    <option value="claude-sonnet-4.5">claude-sonnet-4.5</option>
                  </Select>
                </label>
                <label>
                  Retrieval min score
                  <Input
                    type="number"
                    min={0}
                    max={1}
                    step={0.05}
                    value={settingsMinScore}
                    onChange={(event) => {
                      setSettingsMinScore(event.target.value);
                      setSettingsSuccess(null);
                    }}
                  />
                </label>
                <label>
                  Retrieval max results
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    step={1}
                    value={settingsMaxResults}
                    onChange={(event) => {
                      setSettingsMaxResults(event.target.value);
                      setSettingsSuccess(null);
                    }}
                  />
                </label>
              </div>
              <div className="panel-controls">
                <span className="meta">Changes apply immediately on save.</span>
                <Button type="button" onClick={handleSaveAgentSettings} disabled={isSavingSettings}>
                  {isSavingSettings ? "Saving…" : "Save settings"}
                </Button>
              </div>
            </>
          )}

          {settingsError && <div className="notice error">{settingsError}</div>}
          {settingsSuccess && <div className="notice success">{settingsSuccess}</div>}
        </div>
      </section>

      {/* ============================================================
          OBSERVABILITY
          ============================================================ */}
      <section className="observability" aria-label="Observability dashboard">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Observability</p>
              <h2>Deflection, speed, retrieval.</h2>
              <p className="muted">
                Monitor conversation outcomes and retrieval quality across channels.
              </p>
            </div>
            <Badge variant="secondary" className="tabular">{metricsWindowLabel}</Badge>
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
                            ? `${Math.max(4, (point.conversations / seriesMax) * 100)}%`
                            : "4%"
                        }}
                      />
                    </div>
                    <span className="series-value tabular">
                      {point.conversations} · {point.deflections} deflected
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

        {/* Conversation review — data-table rhythm */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Conversation review</p>
              <h3>Live sessions.</h3>
              <p className="muted">
                Response times, intent, and escalation signals for recent conversations.
              </p>
            </div>
            <span className="status">
              <StatusIndicator
                state={metricsLoading ? "fixing" : "active"}
                label={metricsLoading ? "Refreshing" : "Live"}
                size="sm"
              />
            </span>
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
                    <p className="meta">{conversation.intent ?? "Intent pending"}</p>
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

      {/* ============================================================
          BENEFITS
          ============================================================ */}
      <section id="benefits" className="benefits" aria-label="Benefits">
        <div className="section-head">
          <div>
            <p className="eyebrow">Benefits</p>
            <h2>Outcomes that compound after launch.</h2>
            <p className="muted">
              Improve support, operations, and compliance without changing your existing tooling.
            </p>
          </div>
          <Button asChild>
            <a href="#onboarding">Launch your first agent →</a>
          </Button>
        </div>
        <div className="benefit-grid">
          {benefitItems.map((item, index) => (
            <article key={item.title} className="benefit-card">
              <span className="highlight-num">— {formatStepNumber(index)}</span>
              <h3>{item.title}</h3>
              <p className="muted">{item.detail}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ============================================================
          TRUST
          ============================================================ */}
      <section className="trust" aria-label="Trust and security">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Trust and security</p>
              <h2>Enterprise-ready controls, built in.</h2>
            </div>
            <Button variant="secondary" asChild>
              <a href="#onboarding">Book onboarding walkthrough</a>
            </Button>
          </div>
          <div className="trust-grid">
            <div className="testimonial-list">
              {testimonials.map((item) => (
                <article key={item.author} className="testimonial-card">
                  <p className="testimonial-quote">&ldquo;{item.quote}&rdquo;</p>
                  <p className="testimonial-author">{item.author}</p>
                </article>
              ))}
            </div>
            <div>
              <p className="status-label">Security signals</p>
              <div className="security-badges">
                {securitySignals.map((signal) => (
                  <Badge key={signal} className="security-badge" variant="secondary">
                    {signal}
                  </Badge>
                ))}
              </div>
              <p className="muted">
                Keep customer data in Norway/EU regions, enforce retention, and maintain
                auditable escalation workflows.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================
          CTA STRIP
          ============================================================ */}
      <section className="cta-strip" aria-label="Primary call to action">
        <p className="eyebrow" style={{ color: "color-mix(in oklch, var(--ink-inverse) 70%, transparent)" }}>
          Ready to ship
        </p>
        <h2>
          Deploy an AI support agent this week&nbsp;
          <em style={{ color: "var(--accent-edge)" }}>— not next quarter.</em>
        </h2>
        <p className="muted">
          Start with the onboarding flow, then deploy your widget and track impact in one place.
        </p>
        <div className="hero-cta-row" style={{ marginTop: "var(--space-3)" }}>
          <Button asChild size="lg">
            <a href="#onboarding">Start onboarding →</a>
          </Button>
          <Button variant="outline" asChild size="lg">
            <a href="#benefits" style={{ color: "var(--ink-inverse)", borderColor: "color-mix(in oklch, var(--ink-inverse) 30%, transparent)", backgroundColor: "transparent" }}>
              See platform benefits
            </a>
          </Button>
        </div>
      </section>
    </div>
  );
}
