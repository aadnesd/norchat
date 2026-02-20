import { useMemo, useState } from "react";

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
    description: "Crawl your website, add PDFs, and track ingestion with SLAs."
  },
  {
    id: "channels",
    title: "Deploy a web widget",
    description: "Generate an embed snippet, allow your domain, and preview chat."
  }
];

type Source = {
  id: string;
  type: "website" | "file";
  value: string;
  status: "queued" | "processing" | "ready";
};

const initialSources: Source[] = [
  {
    id: "source-1",
    type: "website",
    value: "https://example.no",
    status: "ready"
  },
  {
    id: "source-2",
    type: "file",
    value: "Customer-FAQ.pdf",
    status: "processing"
  }
];

const channelOptions = [
  "Web widget",
  "Help page",
  "Slack",
  "Zendesk",
  "WhatsApp",
  "Shopify"
];

const deploymentChecklist = [
  {
    id: "allowlist",
    label: "Add allowed domain",
    detail: "Only whitelisted domains can load the widget.",
    status: "done"
  },
  {
    id: "snippet",
    label: "Install embed snippet",
    detail: "Paste the script tag before </body>.",
    status: "in-progress"
  },
  {
    id: "handover",
    label: "Enable escalation",
    detail: "Route low-confidence answers to Zendesk.",
    status: "todo"
  }
];

const ingestionRuns = [
  {
    id: "run-1",
    label: "Website crawl",
    progress: 76,
    eta: "6 min",
    status: "active"
  },
  {
    id: "run-2",
    label: "PDF ingestion",
    progress: 100,
    eta: "Complete",
    status: "complete"
  }
];

export function App() {
  const [stepIndex, setStepIndex] = useState(0);
  const [sources, setSources] = useState<Source[]>(initialSources);
  const [workspaceName, setWorkspaceName] = useState("Nordic Care");
  const [agentName, setAgentName] = useState("Hanna");
  const [domain, setDomain] = useState("support.nordiccare.no");
  const [channel, setChannel] = useState(channelOptions[0]);

  const step = steps[stepIndex];

  const nextStep = () =>
    setStepIndex((current) => Math.min(current + 1, steps.length - 1));
  const previousStep = () =>
    setStepIndex((current) => Math.max(current - 1, 0));

  const embedSnippet = useMemo(() => {
    return `<script src="https://cdn.nordicsupport.no/widget.js" data-agent="${agentName}"></script>`;
  }, [agentName]);

  const addSource = () => {
    setSources((current) => [
      ...current,
      {
        id: `source-${current.length + 1}`,
        type: "website",
        value: "https://help.nordiccare.no",
        status: "queued"
      }
    ]);
  };

  const retrainSources = () => {
    setSources((current) =>
      current.map((source) =>
        source.status === "ready" ? { ...source, status: "queued" } : source
      )
    );
  };

  const readySources = sources.filter((source) => source.status === "ready").length;
  const processingSources = sources.filter((source) => source.status === "processing").length;
  const queuedSources = sources.filter((source) => source.status === "queued").length;

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
            <p className="metric-value">12</p>
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
          <div className="panel-controls">
            <button type="button" className="ghost" onClick={previousStep}>
              Back
            </button>
            <button type="button" className="primary" onClick={nextStep}>
              Continue
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
                <select>
                  <option>Norway (Oslo)</option>
                  <option>EU North (Stockholm)</option>
                </select>
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
                <select>
                  <option>Warm + professional</option>
                  <option>Concise + direct</option>
                  <option>Playful + friendly</option>
                </select>
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
              <div className="source-grid">
                {sources.map((source) => (
                  <div key={source.id} className="source-card">
                    <div>
                      <p className="source-type">{source.type === "website" ? "Website" : "File"}</p>
                      <p className="source-value">{source.value}</p>
                    </div>
                    <span className={`pill ${source.status}`}>{source.status}</span>
                  </div>
                ))}
              </div>
              <div className="panel-controls">
                <button type="button" className="secondary" onClick={addSource}>
                  Add another source
                </button>
                <button type="button" className="ghost" onClick={retrainSources}>
                  Trigger retrain
                </button>
              </div>
              <div className="ingestion-grid">
                {ingestionRuns.map((run) => (
                  <div key={run.id} className="ingestion-card">
                    <div>
                      <p className="status-label">{run.label}</p>
                      <p className="status-meta">ETA {run.eta}</p>
                    </div>
                    <div className="progress-bar">
                      <span style={{ width: `${run.progress}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step.id === "channels" && (
            <div className="form-grid">
              <label>
                Channel
                <select value={channel} onChange={(event) => setChannel(event.target.value)}>
                  {channelOptions.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                Allowed domain
                <input value={domain} onChange={(event) => setDomain(event.target.value)} />
              </label>
              <div className="info-card">
                <h4>Embed snippet</h4>
                <code>{embedSnippet}</code>
              </div>
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
