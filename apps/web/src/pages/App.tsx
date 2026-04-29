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

const highlightItems = [
  {
    title: "Stand up a governed workspace",
    description:
      "Region pinning, retention defaults, and role controls are configured before the first customer sees the agent."
  },
  {
    title: "Ingest the knowledge you already own",
    description:
      "Website crawl and short policy snippets give operators a fast path to useful retrieval coverage."
  },
  {
    title: "Publish the right support surface",
    description:
      "Start with a web widget, hosted help page, or voice endpoint, then extend to the rest of the support stack."
  },
  {
    title: "Review the system in the open",
    description:
      "Deflection, latency, top intents, and recent sessions stay visible in the same workbench."
  }
];

const benefitItems = [
  {
    title: "Shorter launch path",
    detail:
      "Operators can move from empty workspace to a live customer surface in one sitting, with each step leaving a usable artifact behind."
  },
  {
    title: "Cleaner weekly review",
    detail:
      "Deflection, retrieval quality, and session-level evidence are already organized for the next operating review."
  },
  {
    title: "Less fragile escalation handling",
    detail:
      "Low-confidence answers hand over with transcript, intent, and next action instead of disappearing into a queue."
  }
];

const testimonials = [
  {
    quote:
      "We had the first widget live before lunch. The useful part was seeing exactly which questions still needed a human.",
    author: "Ingrid Nymoen, support operations lead at Fjordhandel"
  },
  {
    quote:
      "Operations could launch the agent without a project plan, and leadership could read the outcomes without asking for a spreadsheet.",
    author: "Marius Aasen, CX director at Northline Cloud"
  }
];

const securitySignals = [
  "Norway and EU region pinning",
  "Retention and deletion audit trail",
  "SAML, roles, and allowlists"
];

const navItems = [
  { href: "#overview", label: "Overview" },
  { href: "#onboarding", label: "Onboarding" },
  { href: "#observability", label: "Observability" },
  { href: "#day-one", label: "Day one" },
  { href: "#trust", label: "Trust" }
];

const dayOneItems = [
  {
    title: "Governed workspace state",
    detail: "Tenant, agent, region, and retention policy are recorded before deployment."
  },
  {
    title: "Knowledge queue with retrain controls",
    detail: "Website crawl, snippet ingestion, and retrain actions stay in one operator surface."
  },
  {
    title: "Metrics that open the weekly loop",
    detail: "Deflection, response speed, top intents, and recent sessions start filling in after launch."
  }
];

const ctaItems = [
  "Norway or EU residency defaults",
  "One workbench for launch and review",
  "Deployment artifacts generated in-product"
];

const stepArtifacts: Record<(typeof steps)[number]["id"], string> = {
  tenant: "Workspace record plus residency policy",
  agent: "Agent profile plus escalation defaults",
  sources: "Knowledge queue plus retrain state",
  channels: "Deployment artifact plus allowlist"
};

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

const hasTwilioChannelConfig = (channel: Channel | null) => {
  if (!channel || channel.type !== "voice_agent") {
    return false;
  }
  return (
    channel.config?.twilioRealtimeEnabled === true ||
    typeof channel.config?.twilioAccountSid === "string" ||
    typeof channel.config?.twilioWebhookBaseUrl === "string" ||
    typeof channel.config?.twilioFromNumber === "string"
  );
};

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

const formatCount = (value: number) => String(value).padStart(2, "0");

const formatDateTime = (value?: string | null) => {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
};

const formatStepNumber = (index: number) => String(index + 1).padStart(2, "0");

export function App() {
  const [stepIndex, setStepIndex] = useState(0);
  const [activeSection, setActiveSection] = useState("overview");
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
  const [channelAuthToken, setChannelAuthToken] = useState("voice_shared_secret");
  const [voiceLocale, setVoiceLocale] = useState("nb-NO");
  const [voiceName, setVoiceName] = useState("nb-NO-Standard-A");
  const [voiceSpeakingRate, setVoiceSpeakingRate] = useState("1");
  const [twilioAccountSid, setTwilioAccountSid] = useState("");
  const [twilioAuthToken, setTwilioAuthToken] = useState("");
  const [twilioApiKeySid, setTwilioApiKeySid] = useState("");
  const [twilioApiKeySecret, setTwilioApiKeySecret] = useState("");
  const [twilioFromNumber, setTwilioFromNumber] = useState("");
  const [twilioWebhookBaseUrl, setTwilioWebhookBaseUrl] = useState("");
  const [twilioLanguage, setTwilioLanguage] = useState("nb-NO");
  const [twilioVoice, setTwilioVoice] = useState("alice");
  const [twilioValidateSignature, setTwilioValidateSignature] = useState(true);
  const [twilioRealtimeEnabled, setTwilioRealtimeEnabled] = useState(false);
  const [twilioRealtimeVoice, setTwilioRealtimeVoice] = useState("alloy");
  const [twilioRealtimeInstructions, setTwilioRealtimeInstructions] = useState("");
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
  const [settingsErrorField, setSettingsErrorField] = useState<
    "basePrompt" | "model" | "minScore" | "maxResults" | null
  >(null);
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
    if (typeof IntersectionObserver === "undefined") {
      return;
    }

    const sections = navItems
      .map((item) => document.getElementById(item.href.replace("#", "")))
      .filter((section): section is HTMLElement => Boolean(section));

    if (sections.length === 0) {
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visibleEntry = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)[0];

        if (visibleEntry) {
          setActiveSection(visibleEntry.target.id);
        }
      },
      {
        rootMargin: "-35% 0px -45% 0px",
        threshold: [0.15, 0.4, 0.65]
      }
    );

    sections.forEach((section) => observer.observe(section));

    return () => {
      observer.disconnect();
    };
  }, []);

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
    if (activeChannel.type === "voice_agent" && hasTwilioChannelConfig(activeChannel)) {
      return `${apiBase}/channels/${activeChannel.id}/twilio/voice`;
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
      return hasTwilioChannelConfig(activeChannel)
        ? "Twilio voice webhook"
        : "Voice webhook endpoint";
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

  const twilioCallExample = useMemo(() => {
    if (!activeChannel || activeChannel.type !== "voice_agent") {
      return null;
    }
    if (!hasTwilioChannelConfig(activeChannel)) {
      return null;
    }
    return [
      `curl -X POST "${apiBase}/channels/${activeChannel.id}/twilio/calls" \\`,
      '  -H "Content-Type: application/json" \\',
      '  -H "x-user-id: user_admin" \\',
      '  -d \'{"to":"+4799999999","initialPrompt":"Hei! Dette er en oppfolging fra support."}\''
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
    const checklistChannelType = activeChannel?.type ?? channelType;

    if (checklistChannelType === "voice_agent") {
      const authToken =
        (typeof activeChannel?.config?.authToken === "string" &&
          activeChannel.config.authToken.length > 0) ||
        channelAuthToken.trim().length > 0;
      const hasVoiceConfig =
        (typeof activeChannel?.config?.voiceLocale === "string" &&
          typeof activeChannel.config?.voiceName === "string") ||
        (voiceLocale.trim().length > 0 && voiceName.trim().length > 0);
      const hasTwilioAccountSid =
        (typeof activeChannel?.config?.twilioAccountSid === "string" &&
          activeChannel.config.twilioAccountSid.length > 0) ||
        twilioAccountSid.trim().length > 0;
      const hasTwilioAuthToken =
        (typeof activeChannel?.config?.twilioAuthToken === "string" &&
          activeChannel.config.twilioAuthToken.length > 0) ||
        twilioAuthToken.trim().length > 0;
      const hasTwilioApiKeyPair =
        ((typeof activeChannel?.config?.twilioApiKeySid === "string" &&
          activeChannel.config.twilioApiKeySid.length > 0 &&
          typeof activeChannel.config?.twilioApiKeySecret === "string" &&
          activeChannel.config.twilioApiKeySecret.length > 0) ||
          (twilioApiKeySid.trim().length > 0 && twilioApiKeySecret.trim().length > 0));
      const hasTwilioFromNumber =
        (typeof activeChannel?.config?.twilioFromNumber === "string" &&
          activeChannel.config.twilioFromNumber.length > 0) ||
        twilioFromNumber.trim().length > 0;
      const hasTwilioWebhookBaseUrl =
        (typeof activeChannel?.config?.twilioWebhookBaseUrl === "string" &&
          activeChannel.config.twilioWebhookBaseUrl.length > 0) ||
        twilioWebhookBaseUrl.trim().length > 0;
      const twilioReady =
        hasTwilioAccountSid &&
        (hasTwilioAuthToken || hasTwilioApiKeyPair) &&
        hasTwilioFromNumber &&
        hasTwilioWebhookBaseUrl;
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
          status: activeChannel && checklistChannelType === "voice_agent" ? "done" : "todo"
        },
        {
          id: "speech",
          label: "Render speech response",
          detail: "Use reply.speech.ssml (or reply.speech.text) in your TTS provider.",
          status: hasVoiceConfig ? "done" : "todo"
        },
        {
          id: "twilio",
          label: "Plug Twilio credentials",
          detail:
            "Set twilioAccountSid + auth token (or API key pair), from number, and webhook base URL.",
          status: twilioReady ? "done" : "todo"
        }
      ];
    }

    const allowedDomains =
      activeChannel?.config && "allowedDomains" in activeChannel.config
        ? (activeChannel.config.allowedDomains as string[] | undefined) ?? []
        : domain.trim()
          ? [domain.trim()]
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
  }, [
    activeChannel,
    channelAuthToken,
    channelType,
    domain,
    twilioAccountSid,
    twilioApiKeySecret,
    twilioApiKeySid,
    twilioAuthToken,
    twilioFromNumber,
    twilioWebhookBaseUrl,
    voiceLocale,
    voiceName
  ]);

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

  const stepProgressWidth = `${((stepIndex + 1) / steps.length) * 100}%`;
  const deployedChannelType = activeChannel?.type;
  const channelHeading = deployedChannelType
    ? isDomainChannel(deployedChannelType)
      ? deployedChannelType === "help_page"
        ? "Deploy a hosted help page"
        : "Deploy a web widget"
      : isVoiceChannel(deployedChannelType)
        ? "Deploy a voice endpoint"
        : "Deploy an integration endpoint"
    : step.title;

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

  const completedDeploymentItems = deploymentChecklist.filter(
    (item) => item.status === "done"
  ).length;
  const activeChannelLabel = activeChannel
    ? channelOptions.find((option) => option.value === activeChannel.type)?.label ?? activeChannel.type
    : "Pending";
  const latestConversation = metricConversations[0] ?? null;
  const launchSummaryItems = [
    {
      label: "Active workspace",
      value: tenant?.name ?? "No workspace yet",
      meta: tenant ? `${dataResidency} residency` : "Create tenant and residency profile"
    },
    {
      label: "Current channel",
      value: activeChannelLabel,
      meta: activeChannel ? deployArtifactLabel : "Deploy a customer-facing surface"
    },
    {
      label: "Last activity",
      value: latestConversation ? latestConversation.intent ?? latestConversation.conversationId : "No sessions yet",
      meta: latestConversation ? formatDateTime(latestConversation.lastActivityAt) : "Recent conversations appear after launch"
    }
  ];
  const stepStatusById: Record<string, "done" | "active" | "pending"> = {
    tenant: tenant ? "done" : step.id === "tenant" ? "active" : "pending",
    agent: agent ? "done" : step.id === "agent" ? "active" : "pending",
    sources: sources.length > 0 ? "done" : step.id === "sources" ? "active" : "pending",
    channels: activeChannel ? "done" : step.id === "channels" ? "active" : "pending"
  };

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

    const twilioWebhookBaseUrlValue = twilioWebhookBaseUrl.trim();
    if (twilioWebhookBaseUrlValue) {
      try {
        const parsed = new URL(twilioWebhookBaseUrlValue);
        if (!["http:", "https:"].includes(parsed.protocol)) {
          setErrorMessage("Twilio webhook base URL must use http or https.");
          return null;
        }
      } catch {
        setErrorMessage("Twilio webhook base URL must be a valid URL.");
        return null;
      }
    }

    const config: Record<string, unknown> = {
      authToken,
      voiceLocale: voiceLocale.trim() || "nb-NO",
      voiceName: voiceName.trim() || "nb-NO-Standard-A",
      speakingRate: Number(speakingRate.toFixed(2))
    };

    const twilioCredentials = [
      ["twilioAccountSid", twilioAccountSid],
      ["twilioAuthToken", twilioAuthToken],
      ["twilioApiKeySid", twilioApiKeySid],
      ["twilioApiKeySecret", twilioApiKeySecret],
      ["twilioFromNumber", twilioFromNumber]
    ] as const;
    for (const [key, value] of twilioCredentials) {
      const trimmed = value.trim();
      if (trimmed) {
        config[key] = trimmed;
      }
    }
    if (twilioWebhookBaseUrlValue) {
      config.twilioWebhookBaseUrl = twilioWebhookBaseUrlValue;
    }
    const twilioLanguageValue = twilioLanguage.trim();
    if (twilioLanguageValue) {
      config.twilioLanguage = twilioLanguageValue;
    }
    const twilioVoiceValue = twilioVoice.trim();
    if (twilioVoiceValue) {
      config.twilioVoice = twilioVoiceValue;
    }
    const hasTwilioFields = Object.keys(config).some((key) =>
      key.startsWith("twilio")
    );
    if (hasTwilioFields || !twilioValidateSignature) {
      config.twilioValidateSignature = twilioValidateSignature;
    }
    if (twilioRealtimeEnabled) {
      config.twilioRealtimeEnabled = true;
      const twilioRealtimeVoiceValue = twilioRealtimeVoice.trim();
      if (twilioRealtimeVoiceValue) {
        config.twilioRealtimeVoice = twilioRealtimeVoiceValue;
      }
      const twilioRealtimeInstructionsValue = twilioRealtimeInstructions.trim();
      if (twilioRealtimeInstructionsValue) {
        config.twilioRealtimeInstructions = twilioRealtimeInstructionsValue;
      }
    }

    return config;
  };

  const handleDeployChannel = async () => {
    if (!agent) {
      setErrorMessage("Create an agent before deploying a channel.");
      return;
    }
    setErrorMessage(null);
    setOnboardingSuccess(null);
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

  const handleSaveAgentSettings = async () => {
    setSettingsSuccess(null);
    setSettingsErrorField(null);
    if (!agent) {
      setSettingsError("Create an agent before updating settings.");
      return;
    }
    if (!basePrompt.trim()) {
      setSettingsError("Base prompt is required.");
      setSettingsErrorField("basePrompt");
      return;
    }
    if (!settingsModel.trim()) {
      setSettingsError("Model is required.");
      setSettingsErrorField("model");
      return;
    }
    const minScore = Number(settingsMinScore);
    if (!Number.isFinite(minScore) || minScore < 0 || minScore > 1) {
      setSettingsError("Min score must be between 0 and 1.");
      setSettingsErrorField("minScore");
      return;
    }
    const maxResults = Number(settingsMaxResults);
    if (!Number.isInteger(maxResults) || maxResults < 1 || maxResults > 10) {
      setSettingsError("Max results must be an integer from 1 to 10.");
      setSettingsErrorField("maxResults");
      return;
    }

    setIsSavingSettings(true);
    setSettingsError(null);
    setSettingsErrorField(null);
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
    <>
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <div className="app-shell">
        <header className="topbar">
          <div className="topbar-brand" aria-label="Nordic Support OS home">
            <span className="topbar-mark" aria-hidden="true">
              NS
            </span>
            <div>
              <p className="topbar-title">Nordic Support OS</p>
              <p className="topbar-meta">Operational AI for Norway-first support teams</p>
            </div>
          </div>
          <nav className="topbar-nav" aria-label="Primary navigation">
            {navItems.map((item) => {
              const sectionId = item.href.replace("#", "");
              const isActive = activeSection === sectionId;

              return (
                <a
                  key={item.href}
                  href={item.href}
                  aria-current={isActive ? "location" : undefined}
                  className={isActive ? "active" : undefined}
                >
                  {item.label}
                </a>
              );
            })}
          </nav>
          <div className="topbar-actions">
            <StatusIndicator state="active" label="System ready" size="sm" />
            <Button asChild>
              <a href="#onboarding">Open onboarding</a>
            </Button>
          </div>
        </header>

        <main id="main-content" className="app">
          {/* ============================================================
              HERO
              ============================================================ */}
          <section id="overview" className="hero" aria-label="Overview">
            <div className="hero-content">
              <div className="hero-heading">
                <div className="hero-kicker-row">
                  <p className="eyebrow accent">Norway-first AI support operations</p>
                  <Badge variant="secondary" className="tabular">
                    light workspace
                  </Badge>
                </div>
                <h1>
                  Build an AI support agent that your team can
                  <em> launch, govern, and review</em>
                  from one operational workbench.
                </h1>
                <p className="lead">
                  Stand up the workspace, ingest live support knowledge, publish a customer-facing
                  channel, and keep the operating evidence in view from the same surface.
                </p>
              </div>
              <div className="hero-cta-row">
                <Button asChild size="lg">
                  <a href="#onboarding">Start onboarding</a>
                </Button>
                <Button variant="secondary" asChild size="lg">
                  <a href="#observability">Review metrics</a>
                </Button>
              </div>
              <div className="hero-meta-grid" aria-label="Live operational summary">
                {launchSummaryItems.map((item) => (
                  <article key={item.label} className="hero-meta-panel">
                    <p className="status-label">{item.label}</p>
                    <p className="hero-meta-value">{item.value}</p>
                    <p className="status-meta">{item.meta}</p>
                  </article>
                ))}
              </div>
              <ul className="hero-points" aria-label="Key platform qualities">
                <li>Light-only, paper-toned interface tuned for daytime desk work</li>
                <li>Region, retention, and deployment state are visible before launch</li>
                <li>Deflection, latency, and live sessions stay in the same operator flow</li>
              </ul>
            </div>
            <aside className="hero-card hero-ledger" aria-label="Launch ledger">
              <div className="hero-card-header">
                <p className="eyebrow">Launch ledger</p>
                <StatusIndicator
                  state={activeChannel ? "active" : "idle"}
                  label={activeChannel ? "Channel live" : "Setup in progress"}
                  size="sm"
                />
              </div>
              <div className="hero-metrics hero-ledger-grid">
                <article className="hero-metric-panel">
                  <p className="status-label">Setup progress</p>
                  <p className="status-value tabular">
                    {formatCount(stepIndex + 1)} / {formatCount(steps.length)}
                  </p>
                  <p className="status-meta">Current step: {step.title}</p>
                </article>
                <article className="hero-metric-panel accent-panel">
                  <p className="status-label">Deflection</p>
                  <p className="status-value tabular">
                    {metricsSummary ? formatPercent(metricsSummary.rates.deflectionRate) : "47.2%"}
                  </p>
                  <p className="status-meta">
                    {metricsSummary
                      ? `${metricsSummary.totals.deflected} resolved in ${metricsWindowLabel}`
                      : "Recommended first 30-day benchmark"}
                  </p>
                </article>
                <article className="hero-metric-panel">
                  <p className="status-label">Knowledge sources</p>
                  <p className="status-value tabular">{formatCount(readySources)}</p>
                  <p className="status-meta">Ready for retrieval</p>
                </article>
                <article className="hero-metric-panel">
                  <p className="status-label">Deployment checks</p>
                  <p className="status-value tabular">
                    {formatCount(completedDeploymentItems)} / {formatCount(deploymentChecklist.length)}
                  </p>
                  <p className="status-meta">Checklist items complete</p>
                </article>
              </div>
              <div className="hero-checklist">
                {deploymentChecklist.map((item) => (
                  <div key={item.id} className="hero-checklist-row">
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
            </aside>
          </section>

          {/* ============================================================
              HIGHLIGHTS
              ============================================================ */}
          <section className="highlights" aria-label="Platform highlights">
            <div className="highlights-intro">
              <p className="eyebrow">Operating model</p>
              <h2>One flow from workspace setup to production review.</h2>
              <p className="muted">
                The product is shaped for support leads who need evidence, not a demo. Each stage
                creates something a team can act on immediately.
              </p>
            </div>
            <div className="highlights-grid">
              {highlightItems.map((item, index) => (
                <article key={item.title} className={`highlight-card highlight-card-${index + 1}`}>
                  <span className="highlight-num">— {formatStepNumber(index)}</span>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.description}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ============================================================
              HOW IT WORKS
              ============================================================ */}
          <section id="how-it-works" className="story-section" aria-label="How it works">
            <div className="section-head">
              <div>
                <p className="eyebrow">Launch sequence</p>
                <h2>Four operator steps, each with a concrete artifact.</h2>
                <p className="muted">
                  The workbench moves left to right: govern the workspace, configure the agent,
                  ingest the knowledge base, then publish a channel with review state attached.
                </p>
              </div>
              <Button variant="secondary" asChild>
                <a href="#onboarding">Run the setup flow</a>
              </Button>
            </div>
            <div className="story-grid">
              {steps.map((item, index) => (
                <article key={item.id} className="story-card">
                  <p className="story-step">Step {formatStepNumber(index)}</p>
                  <h3>{item.title}</h3>
                  <p className="muted">{item.description}</p>
                  <p className="story-artifact">Artifact · {stepArtifacts[item.id]}</p>
                </article>
              ))}
            </div>
          </section>

          {/* ============================================================
              ONBOARDING FLOW
              ============================================================ */}
          <section id="onboarding" className="onboarding" aria-label="Onboarding">
            <div className="panel onboarding-summary-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Onboarding</p>
                  <h2>Set up the first production agent.</h2>
                  <p className="muted">
                    Move through the governed setup flow, then hand operators a live deployment
                    artifact and the first review surface.
                  </p>
                </div>
                <Badge variant="secondary" className="tabular">
                  {formatStepNumber(stepIndex + 1)} / {formatStepNumber(steps.length)}
                </Badge>
              </div>

              <div className="progress-track">
                <div
                  className="progress-bar"
                  role="progressbar"
                  aria-valuenow={stepIndex + 1}
                  aria-valuemin={1}
                  aria-valuemax={steps.length}
                  aria-valuetext={`${stepIndex + 1} of ${steps.length} steps complete`}
                >
                  <span style={{ width: stepProgressWidth }} />
                </div>
                <p className="meta tabular">
                  {stepIndex + 1} of {steps.length} steps complete
                </p>
              </div>

              <div className="onboarding-summary-grid">
                <article className="summary-tile">
                  <p className="status-label">Workspace</p>
                  <p className="summary-tile-value">{tenant?.name ?? workspaceName}</p>
                  <p className="status-meta">{dataResidency}</p>
                </article>
                <article className="summary-tile">
                  <p className="status-label">Agent</p>
                  <p className="summary-tile-value">{agent?.name ?? agentName}</p>
                  <p className="status-meta">{agent?.status ?? "draft"}</p>
                </article>
                <article className="summary-tile">
                  <p className="status-label">Sources</p>
                  <p className="summary-tile-value tabular">{formatCount(sources.length)}</p>
                  <p className="status-meta">{readySources} ready</p>
                </article>
                <article className="summary-tile">
                  <p className="status-label">Channel</p>
                  <p className="summary-tile-value">{activeChannelLabel}</p>
                  <p className="status-meta">{completedDeploymentItems} deployment checks done</p>
                </article>
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
                    <span className="step-copy">
                      <strong>{item.title}</strong>
                      <span>{item.description}</span>
                      <span className="step-meta-row">
                        <span className="step-artifact">{stepArtifacts[item.id]}</span>
                        <span className={`pill ${stepStatusById[item.id] === "done" ? "ready" : "soft"}`}>
                          {stepStatusById[item.id]}
                        </span>
                      </span>
                    </span>
                  </button>
                ))}
              </div>

              <div className="status-grid">
                <div className="status-card">
                  <p className="status-label">Sources connected</p>
                  <p className="status-value tabular">{formatCount(sources.length)}</p>
                </div>
                <div className="status-card">
                  <p className="status-label">Ingestion queue</p>
                  <p className="status-value tabular">{formatCount(queuedSources + processingSources)}</p>
                </div>
                <div className="status-card">
                  <p className="status-label">Deployment checks</p>
                  <p className="status-value tabular">
                    {formatCount(completedDeploymentItems)} / {formatCount(deploymentChecklist.length)}
                  </p>
                </div>
              </div>

              {errorMessage && <div className="notice error">{errorMessage}</div>}
              {onboardingSuccess && <div className="notice success">{onboardingSuccess}</div>}

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
                  <p className="eyebrow">
                    Step {stepIndex + 1} of {steps.length} — {step.id}
                  </p>
                  <h3>{step.id === "channels" ? channelHeading : step.title}</h3>
                  <p className="muted">{step.description}</p>
                </div>
                <div className="detail-header-meta">
                  <span className="status">Artifact</span>
                  <p className="detail-header-artifact">{stepArtifacts[step.id]}</p>
                </div>
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
                  <div className="empty-state">
                    <p className="empty-state-title">No sources added yet</p>
                    <p className="muted">
                      Add a website or a short policy snippet to start building retrieval context.
                    </p>
                  </div>
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
                  <div className="empty-state soft-surface">
                    <p className="empty-state-title">No ingestion jobs yet</p>
                    <p className="muted">Jobs appear here once a crawl or snippet enters the queue.</p>
                  </div>
                ) : (
                  ingestionJobs.map((run) => (
                    <div key={run.id} className="ingestion-card">
                      <div className="ingestion-card-head">
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
                  <fieldset className="field-group">
                    <legend>Voice synthesis</legend>
                    <label>
                      Voice locale
                      <Input
                        value={voiceLocale}
                        onChange={(event) => setVoiceLocale(event.target.value)}
                        placeholder="nb-NO"
                      />
                    </label>
                    <label>
                      Voice name
                      <Input
                        value={voiceName}
                        onChange={(event) => setVoiceName(event.target.value)}
                        placeholder="nb-NO-Standard-A"
                      />
                    </label>
                    <label>
                      Speaking rate
                      <Input
                        value={voiceSpeakingRate}
                        onChange={(event) => setVoiceSpeakingRate(event.target.value)}
                      />
                      <span className="field-hint">Accepted range 0.5–2.0</span>
                    </label>
                  </fieldset>

                  <fieldset className="field-group">
                    <legend>Twilio credentials</legend>
                    <label>
                      Twilio account SID
                      <Input
                        value={twilioAccountSid}
                        onChange={(event) => setTwilioAccountSid(event.target.value)}
                        placeholder="AC..."
                      />
                    </label>
                    <label>
                      Twilio auth token
                      <Input
                        type="password"
                        value={twilioAuthToken}
                        onChange={(event) => setTwilioAuthToken(event.target.value)}
                      />
                    </label>
                    <label>
                      Twilio API key SID
                      <Input
                        value={twilioApiKeySid}
                        onChange={(event) => setTwilioApiKeySid(event.target.value)}
                        placeholder="SK..."
                      />
                    </label>
                    <label>
                      Twilio API key secret
                      <Input
                        type="password"
                        value={twilioApiKeySecret}
                        onChange={(event) => setTwilioApiKeySecret(event.target.value)}
                      />
                    </label>
                  </fieldset>

                  <fieldset className="field-group">
                    <legend>Twilio behavior</legend>
                    <label>
                      Twilio from number
                      <Input
                        value={twilioFromNumber}
                        onChange={(event) => setTwilioFromNumber(event.target.value)}
                        placeholder="+4712345678"
                      />
                    </label>
                    <label>
                      Twilio webhook base URL
                      <Input
                        value={twilioWebhookBaseUrl}
                        onChange={(event) => setTwilioWebhookBaseUrl(event.target.value)}
                        placeholder="https://api.example.com"
                      />
                    </label>
                    <label>
                      Twilio language
                      <Input
                        value={twilioLanguage}
                        onChange={(event) => setTwilioLanguage(event.target.value)}
                        placeholder="nb-NO"
                      />
                    </label>
                    <label>
                      Twilio voice
                      <Input
                        value={twilioVoice}
                        onChange={(event) => setTwilioVoice(event.target.value)}
                      />
                    </label>
                    <label>
                      Validate Twilio signature
                      <Select
                        value={twilioValidateSignature ? "true" : "false"}
                        onChange={(event) => setTwilioValidateSignature(event.target.value === "true")}
                      >
                        <option value="true">Enabled</option>
                        <option value="false">Disabled</option>
                      </Select>
                    </label>
                  </fieldset>

                  <fieldset className="field-group">
                    <legend>Realtime streaming</legend>
                    <label>
                      Twilio realtime streaming
                      <Select
                        value={twilioRealtimeEnabled ? "true" : "false"}
                        onChange={(event) => setTwilioRealtimeEnabled(event.target.value === "true")}
                      >
                        <option value="false">Disabled</option>
                        <option value="true">Enabled</option>
                      </Select>
                    </label>
                    {twilioRealtimeEnabled && (
                      <>
                        <label>
                          Realtime voice
                          <Input
                            value={twilioRealtimeVoice}
                            onChange={(event) => setTwilioRealtimeVoice(event.target.value)}
                            placeholder="alloy"
                          />
                        </label>
                        <label>
                          Realtime instructions
                          <Textarea
                            value={twilioRealtimeInstructions}
                            onChange={(event) => setTwilioRealtimeInstructions(event.target.value)}
                            rows={4}
                          />
                        </label>
                      </>
                    )}
                  </fieldset>
                </>
              )}
              <div className="panel-controls flush">
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
              {twilioCallExample && (
                <div className="info-card">
                  <h4>Twilio outbound call example</h4>
                  <code>{twilioCallExample}</code>
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
                <p className="status-label">
                  {isVoiceChannel(channelType) ? "Voice preview" : "Widget preview"}
                </p>
                <p className="preview-title">
                  {isVoiceChannel(channelType) ? (
                    <em>Voice agent {agentName} is ready for call transcripts.</em>
                  ) : (
                    <em>Hi, I&apos;m {agentName}.</em>
                  )}
                </p>
                <p className="muted">
                  {isVoiceChannel(channelType)
                    ? "Webhook replies include text + SSML so your telephony stack can synthesize audio."
                    : "Ask me about returns, shipping, or warranty policies."}
                </p>
                <div>
                  <Button type="button">
                    {isVoiceChannel(channelType) ? "Simulate call turn" : "Open live chat"}
                  </Button>
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
                Tune prompt, retrieval, and model defaults without restarting the governed setup flow.
              </p>
            </div>
            <span className="status">{isSavingSettings ? "Saving…" : "Ready"}</span>
          </div>

          {!agent && (
            <div className="empty-state soft-surface">
              <p className="empty-state-title">No agent connected</p>
              <p className="muted">
                Complete onboarding first, then configure prompt, model, and retrieval behavior here.
              </p>
            </div>
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
                      if (settingsErrorField === "basePrompt") setSettingsErrorField(null);
                    }}
                    aria-invalid={settingsErrorField === "basePrompt" || undefined}
                    aria-describedby={
                      settingsErrorField === "basePrompt" ? "settings-error" : undefined
                    }
                  />
                </label>
                <label>
                  Model
                  <Select
                    value={settingsModel}
                    onChange={(event) => {
                      setSettingsModel(event.target.value);
                      setSettingsSuccess(null);
                      if (settingsErrorField === "model") setSettingsErrorField(null);
                    }}
                    aria-invalid={settingsErrorField === "model" || undefined}
                    aria-describedby={
                      settingsErrorField === "model" ? "settings-error" : undefined
                    }
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
                      if (settingsErrorField === "minScore") setSettingsErrorField(null);
                    }}
                    aria-invalid={settingsErrorField === "minScore" || undefined}
                    aria-describedby={
                      settingsErrorField === "minScore" ? "settings-error" : undefined
                    }
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
                      if (settingsErrorField === "maxResults") setSettingsErrorField(null);
                    }}
                    aria-invalid={settingsErrorField === "maxResults" || undefined}
                    aria-describedby={
                      settingsErrorField === "maxResults" ? "settings-error" : undefined
                    }
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

          {settingsError && (
            <div id="settings-error" className="notice error" role="alert">
              {settingsError}
            </div>
          )}
          {settingsSuccess && <div className="notice success">{settingsSuccess}</div>}
        </div>
          </section>

      {/* ============================================================
          OBSERVABILITY
          ============================================================ */}
          <section id="observability" className="observability" aria-label="Observability dashboard">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Observability</p>
              <h2>Deflection, speed, retrieval.</h2>
              <p className="muted">
                Monitor the system the same way operators discuss it: resolved volume, response
                speed, retrieval behavior, and recent evidence.
              </p>
            </div>
            <Badge variant="secondary" className="tabular">{metricsWindowLabel}</Badge>
          </div>

          {metricsError && <div className="notice error">{metricsError}</div>}

          {metricsLoading && !metricsSummary && (
            <div className="metric-skeleton-grid" aria-hidden="true">
              {Array.from({ length: 6 }).map((_, index) => (
                <div key={index} className="metric-skeleton-card" />
              ))}
            </div>
          )}

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
              <div className="empty-state soft-surface">
                <p className="empty-state-title">No metrics yet</p>
                <p className="muted">
                  Metrics appear once conversations start moving through the deployed channel.
                </p>
              </div>
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
              <div className="empty-state soft-surface">
                <p className="empty-state-title">No resolved intents yet</p>
                <p className="muted">Intent breakdowns populate after the first resolved conversations.</p>
              </div>
            )}
          </div>
        </div>

        {/* Conversation review — data-table rhythm */}
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Conversation review</p>
              <h3>Recent sessions.</h3>
              <p className="muted">
                Response times, intent, and escalation state for the most recent conversations.
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
            <div className="empty-state soft-surface">
              <p className="empty-state-title">No agent connected</p>
              <p className="muted">
                Finish onboarding first, then this view will start collecting session-level data.
              </p>
            </div>
          )}
          {agent && metricConversations.length === 0 && !metricsLoading && (
            <div className="empty-state soft-surface">
              <p className="empty-state-title">No conversations yet</p>
              <p className="muted">As soon as customers start chatting, recent sessions appear here.</p>
            </div>
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
                <p className="eyebrow">Why teams keep it</p>
                <h2>Launch speed matters, but operating clarity is the sticky part.</h2>
                <p className="muted">
                  The first win is getting live quickly. The longer-term value is having a tighter
                  weekly loop for improving quality, latency, and escalation handling.
                </p>
              </div>
              <Button asChild>
                <a href="#onboarding">Launch your first agent</a>
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
              DAY ONE
              ============================================================ */}
          <section id="day-one" className="split" aria-label="Day one delivery">
            <div className="section-head split-head">
              <div>
                <p className="eyebrow">Day one delivery</p>
                <h2>What exists before the first weekly operating review.</h2>
                <p className="muted">
                  By the end of onboarding, the team already has enough state to launch, prove
                  value, and decide what to tune next.
                </p>
              </div>
            </div>
            <div className="day-one-grid">
              <div className="day-one-stack">
                {dayOneItems.map((item, index) => (
                  <article key={item.title} className="day-one-panel">
                    <span className="highlight-num">— {formatStepNumber(index)}</span>
                    <h3>{item.title}</h3>
                    <p className="muted">{item.detail}</p>
                  </article>
                ))}
              </div>
              <aside className="day-one-aside">
                <p className="status-label">Included surfaces</p>
                <p className="day-one-aside-copy muted">
                  The first release is not just a chat widget. It is the supporting deployment,
                  routing, and review surface around it.
                </p>
                <div className="pill-row">
                  {[
                    "Website crawl",
                    "Policy snippets",
                    "Hosted help page",
                    "Web widget",
                    "Voice endpoint",
                    "Zendesk handoff",
                    "Slack routing",
                    "GDPR controls"
                  ].map((item) => (
                    <Badge key={item} className="pill soft" variant="outline">
                      {item}
                    </Badge>
                  ))}
                </div>
              </aside>
            </div>
          </section>

          {/* ============================================================
              TRUST
              ============================================================ */}
          <section id="trust" className="trust" aria-label="Trust and security">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Trust and security</p>
                  <h2>Enterprise-ready controls, expressed in operator language.</h2>
                  <p className="muted">
                    Compliance matters most when it is visible in the same flow as setup,
                    deployment, and escalation operations.
                  </p>
                </div>
                <Button variant="secondary" asChild>
                  <a href="#onboarding">Open onboarding</a>
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
                    Keep customer data in Norway or EU regions, enforce retention, and keep
                    escalation workflows auditable without making the interface feel legalistic.
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* ============================================================
              CTA STRIP
              ============================================================ */}
          <section className="cta-strip" aria-label="Primary call to action">
            <div>
              <p className="eyebrow">Ready to ship</p>
              <h2>Deploy the first agent, then keep the operating evidence in view.</h2>
            </div>
            <p className="muted">
              Start with the governed setup flow, publish the support surface, and let operators
              keep tuning the system from the same paper-light workbench.
            </p>
            <div className="cta-list" aria-label="Why start now">
              {ctaItems.map((item) => (
                <span key={item} className="cta-list-item">
                  {item}
                </span>
              ))}
            </div>
            <div className="hero-cta-row">
              <Button asChild size="lg">
                <a href="#onboarding">Start onboarding</a>
              </Button>
              <Button variant="secondary" asChild size="lg">
                <a href="#observability">See observability</a>
              </Button>
            </div>
          </section>
        </main>

        <footer className="site-footer">
          <div>
            <p className="topbar-title">Nordic Support OS</p>
            <p className="topbar-meta">AI support operations with Norway-first deployment defaults.</p>
          </div>
          <nav className="footer-links" aria-label="Footer">
            <a href="#overview">Back to top</a>
            <a href="#trust">Trust</a>
            <a href="#admin-settings">Settings</a>
            <a href="/privacy.html">Privacy policy</a>
            <a href="/terms.html">Terms of service</a>
          </nav>
        </footer>
      </div>
    </>
  );
}
