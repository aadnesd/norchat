import { useMemo, useState } from "react";
import { createApiClient } from "../api";

const apiBase = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000";
const apiClient = createApiClient(apiBase);

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
  const [channelType, setChannelType] = useState<ChannelType>("web_widget");
  const [tenant, setTenant] = useState<Tenant | null>(null);
  const [agent, setAgent] = useState<Agent | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [ingestionJobs, setIngestionJobs] = useState<IngestionJob[]>([]);
  const [activeChannel, setActiveChannel] = useState<Channel | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const step = steps[stepIndex];

  const embedSnippet = useMemo(() => {
    if (!activeChannel) {
      return "Create a channel to generate your snippet.";
    }
    return `<script src=\"${apiBase}/widget.js\" data-channel=\"${activeChannel.id}\" data-api-base=\"${apiBase}\"></script>`;
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

  const handleDeployChannel = async () => {
    if (!agent) {
      setErrorMessage("Create an agent before deploying a channel.");
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
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
            <p className="metric-value">Enabled</p>
          </div>
        </div>
      </header>

      <section className="onboarding">
        <div className="panel">
          <div className="panel-header">
            <div>
              <h2>10-minute onboarding flow</h2>
              <p className="muted">
                Complete each step to deploy your first widget and start deflecting tickets.
              </p>
            </div>
            <span className="badge">Step {stepIndex + 1} of {steps.length}</span>
          </div>
          <div className="progress-track">
            <div className="progress-bar">
              <span style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }} />
            </div>
            <p className="muted">{stepIndex + 1} of {steps.length} steps complete</p>
          </div>
          <div className="steps">
            {steps.map((item, index) => (
              <button
                key={item.id}
                type="button"
                className={`step ${index === stepIndex ? "active" : ""}`}
                onClick={() => setStepIndex(index)}
              >
                <span className="step-index">0{index + 1}</span>
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
          <div className="panel-controls">
            <button type="button" className="ghost" onClick={previousStep} disabled={stepIndex === 0}>
              Back
            </button>
            <button type="button" className="primary" onClick={handleContinue} disabled={!canContinue}>
              {continueLabel}
            </button>
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
                <input value={workspaceName} onChange={(event) => setWorkspaceName(event.target.value)} />
              </label>
              <label>
                Data region
                <select value={region} onChange={(event) => setRegion(event.target.value)}>
                  <option value="norway-oslo">Norway (Oslo)</option>
                  <option value="eu-north">EU North (Stockholm)</option>
                </select>
              </label>
              <label>
                Data residency profile
                <input value={dataResidency} onChange={(event) => setDataResidency(event.target.value)} />
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
                <input value={agentName} onChange={(event) => setAgentName(event.target.value)} />
              </label>
              <label>
                Tone preset
                <select value={agentTone} onChange={(event) => setAgentTone(event.target.value)}>
                  <option>Warm + professional</option>
                  <option>Concise + direct</option>
                  <option>Playful + friendly</option>
                </select>
              </label>
              <label>
                Base prompt
                <textarea
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
                  <input
                    value={websiteUrl}
                    onChange={(event) => setWebsiteUrl(event.target.value)}
                    placeholder="https://help.company.no"
                  />
                </label>
                <button type="button" className="secondary" onClick={handleAddWebsite} disabled={isSubmitting}>
                  Add website crawl
                </button>
                <label>
                  Snippet title
                  <input
                    value={snippetTitle}
                    onChange={(event) => setSnippetTitle(event.target.value)}
                    placeholder="Returns policy"
                  />
                </label>
                <label>
                  Knowledge snippet
                  <textarea
                    rows={4}
                    value={snippetContent}
                    onChange={(event) => setSnippetContent(event.target.value)}
                    placeholder="Paste a short policy or FAQ answer to ingest."
                  />
                </label>
                <button type="button" className="secondary" onClick={handleAddSnippet} disabled={isSubmitting}>
                  Add snippet source
                </button>
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
                      <span className={`pill ${source.status}`}>{source.status}</span>
                    </div>
                  ))
                )}
              </div>
              <div className="panel-controls">
                <button type="button" className="secondary" onClick={handleRetrain} disabled={isSubmitting}>
                  Trigger retrain
                </button>
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
                <select value={channelType} onChange={(event) => setChannelType(event.target.value as ChannelType)}>
                  {channelOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Allowed domain
                <input value={domain} onChange={(event) => setDomain(event.target.value)} />
              </label>
              <div className="panel-controls">
                <button type="button" className="secondary" onClick={handleDeployChannel} disabled={isSubmitting}>
                  Deploy channel
                </button>
                {activeChannel && (
                  <button type="button" className="ghost" onClick={handleUpdateAllowlist} disabled={isSubmitting}>
                    Update allowlist
                  </button>
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
                  <div key={item.id} className={`checklist-item ${item.status}`}>
                    <div>
                      <p className="checklist-title">{item.label}</p>
                      <p className="checklist-detail">{item.detail}</p>
                    </div>
                    <span className="pill soft">{item.status}</span>
                  </div>
                ))}
              </div>
              <div className="preview-card">
                <p className="status-label">Widget preview</p>
                <p className="preview-title">Hi, I am {agentName}.</p>
                <p className="muted">Ask me about returns, shipping, or warranty policies.</p>
                <button type="button" className="primary">Open live chat</button>
              </div>
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
              "Shopify",
              "Stripe",
              "Cal.com",
              "GDPR controls"
            ].map((item) => (
              <span key={item} className="pill soft">{item}</span>
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
