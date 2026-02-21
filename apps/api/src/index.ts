import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { z } from "zod";
import path from "node:path";
import {
  buildChatPrompt,
  buildChatResponse,
  chunkResponseForStreaming
} from "./chat-runtime.js";
import { buildEmbedding } from "./embeddings.js";
import {
  createRegionalVectorStore,
  type VectorRecord
} from "./vector-store.js";

const tenantSchema = z.object({
  name: z.string().min(1),
  plan: z.string().min(1).optional(),
  region: z.string().min(2),
  dataResidency: z.string().min(2).optional()
});
type Tenant = z.infer<typeof tenantSchema> & { id: string; createdAt: string };

const agentSchema = z.object({
  tenantId: z.string().min(1),
  name: z.string().min(1),
  basePrompt: z.string().min(1).optional(),
  model: z.string().min(1).optional()
});
type Agent = z.infer<typeof agentSchema> & {
  id: string;
  status: "draft" | "active";
  createdAt: string;
};

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
  "wordpress"
]);

const channelSchema = z.object({
  agentId: z.string().min(1),
  type: channelTypeSchema,
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional()
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
};

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

type IngestionJob = {
  id: string;
  sourceId: string;
  kind: "crawl" | "file";
  status: z.infer<typeof ingestionJobStatusSchema>;
  createdAt: string;
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
  return {
    ...config,
    allowedDomains: normalizeAllowedDomains(allowedDomains)
  };
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

const buildWidgetScript = () => `
(function () {
  function createWidget(options) {
    var channelId = options.channelId;
    var apiBase = options.apiBase;
    var rootId = "ralph-widget-" + channelId;
    if (document.getElementById(rootId)) {
      return;
    }

    var style = document.createElement("style");
    style.textContent =
      "#" + rootId + "{position:fixed;bottom:24px;right:24px;font-family:'SF Pro Text',system-ui,sans-serif;z-index:2147483647;}" +
      "#" + rootId + " .rw-button{background:#0f3d2e;color:#fff;border:none;border-radius:999px;padding:12px 18px;box-shadow:0 10px 30px rgba(15,61,46,0.3);cursor:pointer;font-weight:600;}" +
      "#" + rootId + " .rw-panel{width:320px;max-height:420px;background:#fff;border-radius:16px;box-shadow:0 12px 40px rgba(17,24,39,0.2);overflow:hidden;display:none;flex-direction:column;}" +
      "#" + rootId + " .rw-header{background:#0f3d2e;color:#fff;padding:12px 16px;font-weight:600;display:flex;justify-content:space-between;align-items:center;}" +
      "#" + rootId + " .rw-body{padding:12px 16px;overflow:auto;flex:1;display:flex;flex-direction:column;gap:10px;background:#f6f7f9;}" +
      "#" + rootId + " .rw-message{padding:10px 12px;border-radius:12px;max-width:85%;font-size:14px;line-height:1.4;}" +
      "#" + rootId + " .rw-user{background:#0f3d2e;color:#fff;align-self:flex-end;}" +
      "#" + rootId + " .rw-assistant{background:#fff;color:#111827;align-self:flex-start;border:1px solid #e5e7eb;}" +
      "#" + rootId + " .rw-input{display:flex;gap:8px;padding:12px 16px;border-top:1px solid #e5e7eb;background:#fff;}" +
      "#" + rootId + " .rw-input input{flex:1;border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;font-size:14px;}" +
      "#" + rootId + " .rw-input button{background:#0f3d2e;color:#fff;border:none;border-radius:10px;padding:8px 12px;font-weight:600;cursor:pointer;}";
    document.head.appendChild(style);

    var root = document.createElement("div");
    root.id = rootId;
    var button = document.createElement("button");
    button.className = "rw-button";
    button.textContent = "Chat with support";
    var panel = document.createElement("div");
    panel.className = "rw-panel";
    var header = document.createElement("div");
    header.className = "rw-header";
    header.innerHTML = "<span>Ralph Support</span>";
    var close = document.createElement("button");
    close.textContent = "x";
    close.style.background = "transparent";
    close.style.border = "none";
    close.style.color = "#fff";
    close.style.fontSize = "18px";
    close.style.cursor = "pointer";
    header.appendChild(close);
    var body = document.createElement("div");
    body.className = "rw-body";
    var inputWrap = document.createElement("div");
    inputWrap.className = "rw-input";
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Ask about returns, shipping, pricing...";
    var send = document.createElement("button");
    send.textContent = "Send";
    inputWrap.appendChild(input);
    inputWrap.appendChild(send);

    panel.appendChild(header);
    panel.appendChild(body);
    panel.appendChild(inputWrap);
    root.appendChild(button);
    root.appendChild(panel);
    document.body.appendChild(root);

    function toggle(open) {
      panel.style.display = open ? "flex" : "none";
      button.style.display = open ? "none" : "inline-flex";
    }

    button.addEventListener("click", function () {
      toggle(true);
      input.focus();
    });
    close.addEventListener("click", function () {
      toggle(false);
    });

    function addMessage(text, role) {
      var item = document.createElement("div");
      item.className = "rw-message " + (role === "user" ? "rw-user" : "rw-assistant");
      item.textContent = text;
      body.appendChild(item);
      body.scrollTop = body.scrollHeight;
      return item;
    }

    function streamChat(message, onToken, onDone, onError) {
      fetch(apiBase + "/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelId: channelId, message: message, stream: true })
      })
        .then(function (response) {
          if (!response.ok) {
            throw new Error("chat_failed");
          }
          if (!response.body) {
            return response.json().then(function (data) {
              onDone(data.message || "");
            });
          }
          var reader = response.body.getReader();
          var decoder = new TextDecoder();
          var buffer = "";

          function read() {
            return reader.read().then(function (result) {
              if (result.done) {
                onDone();
                return;
              }
              buffer += decoder.decode(result.value, { stream: true });
              var parts = buffer.split("\\n\\n");
              buffer = parts.pop() || "";
              parts.forEach(function (part) {
                part.split("\\n").forEach(function (line) {
                  if (!line.startsWith("data:")) {
                    return;
                  }
                  var payload = line.replace("data: ", "");
                  try {
                    var parsed = JSON.parse(payload);
                    if (parsed.token) {
                      onToken(parsed.token);
                    }
                    if (parsed.done && parsed.response && parsed.response.message) {
                      onDone(parsed.response.message);
                    }
                  } catch (error) {
                    onError(error);
                  }
                });
              });
              return read();
            });
          }

          return read();
        })
        .catch(function (error) {
          onError(error);
        });
    }

    function sendMessage() {
      var message = input.value.trim();
      if (!message) {
        return;
      }
      input.value = "";
      addMessage(message, "user");
      var assistantBubble = addMessage("...", "assistant");

      streamChat(
        message,
        function (token) {
          assistantBubble.textContent =
          assistantBubble.textContent === "..."
              ? token
              : assistantBubble.textContent + " " + token;
          body.scrollTop = body.scrollHeight;
        },
        function (finalMessage) {
          if (finalMessage) {
            assistantBubble.textContent = finalMessage;
          }
        },
        function () {
          assistantBubble.textContent =
            "We hit a snag. Please try again or reach the team directly.";
        }
      );
    }

    send.addEventListener("click", sendMessage);
    input.addEventListener("keydown", function (event) {
      if (event.key === "Enter") {
        sendMessage();
      }
    });
  }

  var script = document.currentScript || document.querySelector("script[data-channel]");
  if (!script) {
    return;
  }
  var channelId = script.getAttribute("data-channel");
  if (!channelId) {
    return;
  }
  var apiBase = script.getAttribute("data-api-base");
  if (!apiBase) {
    try {
      apiBase = new URL(script.src).origin;
    } catch (error) {
      apiBase = "";
    }
  }
  if (!apiBase) {
    return;
  }
  createWidget({ channelId: channelId, apiBase: apiBase });
})();
`;

const buildHelpPage = (channelId: string) => `
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ralph Support</title>
    <style>
      body { margin: 0; font-family: "SF Pro Text", system-ui, sans-serif; background: #f6f7f9; color: #0f172a; }
      .hero { padding: 32px 40px; background: linear-gradient(120deg, #0f3d2e, #1f6f5c); color: #fff; }
      .hero h1 { margin: 0 0 8px; font-size: 28px; }
      .hero p { margin: 0; max-width: 560px; opacity: 0.9; }
      .chat-shell { max-width: 780px; margin: -32px auto 48px; background: #fff; border-radius: 20px; box-shadow: 0 20px 60px rgba(15, 23, 42, 0.2); overflow: hidden; }
      .chat-body { padding: 24px; min-height: 320px; display: flex; flex-direction: column; gap: 12px; background: #f8fafc; }
      .chat-message { padding: 12px 14px; border-radius: 14px; font-size: 15px; line-height: 1.4; max-width: 80%; }
      .chat-user { background: #0f3d2e; color: #fff; align-self: flex-end; }
      .chat-assistant { background: #fff; color: #0f172a; border: 1px solid #e2e8f0; align-self: flex-start; }
      .chat-input { display: flex; gap: 12px; padding: 16px 24px; border-top: 1px solid #e2e8f0; }
      .chat-input input { flex: 1; padding: 10px 12px; border-radius: 12px; border: 1px solid #e2e8f0; font-size: 15px; }
      .chat-input button { background: #0f3d2e; color: #fff; border: none; border-radius: 12px; padding: 10px 16px; font-weight: 600; cursor: pointer; }
    </style>
  </head>
  <body>
    <section class="hero">
      <h1>How can we help?</h1>
      <p>Ask about shipping, billing, or policies. The AI assistant will pull answers from your knowledge base.</p>
    </section>
    <section class="chat-shell" data-channel="${channelId}">
      <div class="chat-body" id="chat-body"></div>
      <div class="chat-input">
        <input id="chat-input" type="text" placeholder="Ask your question..." />
        <button id="chat-send" type="button">Send</button>
      </div>
    </section>
    <script>
      (function () {
        var channelId = "${channelId}";
        var apiBase = window.location.origin;
        var body = document.getElementById("chat-body");
        var input = document.getElementById("chat-input");
        var send = document.getElementById("chat-send");

        function addMessage(text, role) {
          var item = document.createElement("div");
          item.className = "chat-message " + (role === "user" ? "chat-user" : "chat-assistant");
          item.textContent = text;
          body.appendChild(item);
          body.scrollTop = body.scrollHeight;
          return item;
        }

        function streamChat(message, onToken, onDone, onError) {
          fetch(apiBase + "/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ channelId: channelId, message: message, stream: true })
          })
            .then(function (response) {
              if (!response.ok) {
                throw new Error("chat_failed");
              }
              if (!response.body) {
                return response.json().then(function (data) {
                  onDone(data.message || "");
                });
              }
              var reader = response.body.getReader();
              var decoder = new TextDecoder();
              var buffer = "";

              function read() {
                return reader.read().then(function (result) {
                  if (result.done) {
                    onDone();
                    return;
                  }
                  buffer += decoder.decode(result.value, { stream: true });
                  var parts = buffer.split("\\n\\n");
                  buffer = parts.pop() || "";
                  parts.forEach(function (part) {
                    part.split("\\n").forEach(function (line) {
                      if (!line.startsWith("data:")) {
                        return;
                      }
                      var payload = line.replace("data: ", "");
                      try {
                        var parsed = JSON.parse(payload);
                        if (parsed.token) {
                          onToken(parsed.token);
                        }
                        if (parsed.done && parsed.response && parsed.response.message) {
                          onDone(parsed.response.message);
                        }
                      } catch (error) {
                        onError(error);
                      }
                    });
                  });
                  return read();
                });
              }

              return read();
            })
            .catch(function (error) {
              onError(error);
            });
        }

        function sendMessage() {
          var message = input.value.trim();
          if (!message) {
            return;
          }
          input.value = "";
          addMessage(message, "user");
          var assistantBubble = addMessage("...", "assistant");

          streamChat(
            message,
            function (token) {
              assistantBubble.textContent =
                assistantBubble.textContent === "..."
                  ? token
                  : assistantBubble.textContent + " " + token;
              body.scrollTop = body.scrollHeight;
            },
            function (finalMessage) {
              if (finalMessage) {
                assistantBubble.textContent = finalMessage;
              }
            },
            function () {
              assistantBubble.textContent =
                "We hit a snag. Please try again or reach the team directly.";
            }
          );
        }

        send.addEventListener("click", sendMessage);
        input.addEventListener("keydown", function (event) {
          if (event.key === "Enter") {
            sendMessage();
          }
        });
      })();
    </script>
  </body>
</html>
`;
export const buildServer = async (options?: { vectorStoreDir?: string }) => {
  const fastify = Fastify({ logger: true });

  await fastify.register(cors, { origin: true });
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

  const vectorStoreDir =
    options?.vectorStoreDir ??
    process.env.VECTOR_STORE_DIR ??
    path.join(process.cwd(), "data", "vector-store");
  const vectorStore = createRegionalVectorStore(vectorStoreDir);

  const tenants = new Map<string, Tenant>();
  const agents = new Map<string, Agent>();
  const sources = new Map<string, Source>();
  const channels = new Map<string, Channel>();
  const ingestionJobs = new Map<string, IngestionJob>();

  fastify.get("/health", async () => ({ status: "ok" }));

  fastify.post("/tenants", async (request, reply) => {
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
    return reply.code(201).send(tenant);
  });

  fastify.get("/tenants", async () => ({ items: Array.from(tenants.values()) }));

  fastify.post("/agents", async (request, reply) => {
    const data = agentSchema.parse(request.body);
    if (!tenants.has(data.tenantId)) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const id = `agent_${crypto.randomUUID()}`;
    const agent: Agent = {
      id,
      tenantId: data.tenantId,
      name: data.name,
      basePrompt: data.basePrompt,
      model: data.model,
      status: "draft",
      createdAt: new Date().toISOString()
    };
    agents.set(id, agent);
    return reply.code(201).send(agent);
  });

  fastify.get("/agents", async () => ({ items: Array.from(agents.values()) }));

  fastify.post("/channels", async (request, reply) => {
    const data = channelSchema.parse(request.body);
    if (!agents.has(data.agentId)) {
      return reply.code(404).send({ error: "agent_not_found" });
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

  fastify.get("/channels", async (request) => {
    const querySchema = z.object({ agentId: z.string().min(1).optional() });
    const query = querySchema.parse(request.query);
    const items = query.agentId
      ? Array.from(channels.values()).filter(
          (channel) => channel.agentId === query.agentId
        )
      : Array.from(channels.values());
    return { items };
  });

  fastify.get("/channels/:id", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const channel = channels.get(id);
    if (!channel) {
      return reply.code(404).send({ error: "channel_not_found" });
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
    const update = channelUpdateSchema.parse(request.body);
    const mergedConfig = normalizeChannelConfig({
      ...(channel.config ?? {}),
      ...(update.config ?? {})
    });
    const updated: Channel = {
      ...channel,
      config: mergedConfig,
      enabled: update.enabled ?? channel.enabled
    };
    channels.set(id, updated);
    return { channel: updated };
  });

  fastify.post("/sources", async (request, reply) => {
    const data = sourceSchema.parse(request.body);
    if (!agents.has(data.agentId)) {
      return reply.code(404).send({ error: "agent_not_found" });
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
    if (!agents.has(data.agentId)) {
      return reply.code(404).send({ error: "agent_not_found" });
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
    return reply.code(201).send({ source, job });
  });

  fastify.post("/sources/file", async (request, reply) => {
    const data = fileIngestionSchema.parse(request.body);
    if (!agents.has(data.agentId)) {
      return reply.code(404).send({ error: "agent_not_found" });
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
    return reply.code(201).send({ source, job });
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
    const createdChunks = textChunks.map((content, index) => {
      const chunkId = `chunk_${crypto.randomUUID()}`;
      const metadata: Record<string, unknown> = {
        ...data.metadata,
        chunkIndex: index,
        chunkCount
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

    sources.set(source.id, {
      ...source,
      status: "ready",
      lastSyncedAt: createdAt
    });

    return reply.code(201).send({ chunks: createdChunks });
  });

  fastify.get("/ingestion-jobs", async (request) => {
    const schema = z.object({
      agentId: z.string().optional(),
      sourceId: z.string().optional(),
      status: ingestionJobStatusSchema.optional()
    });
    const data = schema.parse(request.query);
    let items = Array.from(ingestionJobs.values());
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
    const job = ingestionJobs.get(id);
    if (!job) {
      return reply.code(404).send({ error: "job_not_found" });
    }
    return { job };
  });

  fastify.post("/ingestion-jobs/:id/status", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const bodySchema = z.object({ status: ingestionJobStatusSchema });
    const { id } = paramsSchema.parse(request.params);
    const { status } = bodySchema.parse(request.body);
    const job = ingestionJobs.get(id);
    if (!job) {
      return reply.code(404).send({ error: "job_not_found" });
    }
    const updatedJob: IngestionJob = { ...job, status };
    ingestionJobs.set(id, updatedJob);

    const source = sources.get(updatedJob.sourceId);
    if (source) {
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
    }

    return { job: updatedJob };
  });

  fastify.post("/ingestion-jobs/:id/ingest", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const data = jobIngestionSchema.parse(request.body);
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
          chunkCount
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

    const updatedSource: Source = {
      ...source,
      status: "ready",
      lastSyncedAt: createdAt
    };
    sources.set(source.id, updatedSource);

    const updatedJob: IngestionJob = {
      ...job,
      status: "complete"
    };
    ingestionJobs.set(job.id, updatedJob);

    return reply.code(201).send({
      source: updatedSource,
      job: updatedJob,
      chunks: createdChunks
    });
  });

  fastify.get("/sources", async (request) => {
    const schema = z.object({
      agentId: z.string().optional()
    });
    const data = schema.parse(request.query);
    const items = Array.from(sources.values());
    if (!data.agentId) {
      return { items };
    }
    return { items: items.filter((source) => source.agentId === data.agentId) };
  });

  fastify.post("/sources/:id/retrain", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    const source = sources.get(id);
    if (!source) {
      return reply.code(404).send({ error: "source_not_found" });
    }
    const updated: Source = {
      ...source,
      status: "processing",
      lastSyncedAt: new Date().toISOString()
    };
    sources.set(id, updated);
    return { source: updated };
  });

  fastify.delete("/sources/:id", async (request, reply) => {
    const paramsSchema = z.object({ id: z.string().min(1) });
    const { id } = paramsSchema.parse(request.params);
    if (!sources.has(id)) {
      return reply.code(404).send({ error: "source_not_found" });
    }
    sources.delete(id);
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
    const tenant = tenants.get(agent.tenantId);
    if (!tenant) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }
    const queryEmbedding = buildEmbedding(data.query);
    const minScore = data.minScore ?? 0;
    const maxResults = data.maxResults ?? 5;
    const sourceFilter = data.sourceIds
      ? new Set(data.sourceIds)
      : undefined;

    const results = await vectorStore.query(tenant.region, {
      agentId: data.agentId,
      queryEmbedding,
      minScore,
      maxResults,
      sourceFilter
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
    const tenant = tenants.get(agent.tenantId);
    if (!tenant) {
      return reply.code(404).send({ error: "tenant_not_found" });
    }

    const queryEmbedding = buildEmbedding(data.message);
    const minScore = data.minScore ?? 0;
    const maxResults = data.maxResults ?? 4;
    const sourceFilter = data.sourceIds
      ? new Set(data.sourceIds)
      : undefined;

    const retrievalMatches = await vectorStore.query(tenant.region, {
      agentId,
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

    const prompt = buildChatPrompt({
      basePrompt: agent.basePrompt,
      message: data.message,
      context
    });
    const response = buildChatResponse({ message: data.message, context });

    if (data.stream) {
      reply.raw.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      reply.raw.setHeader("Cache-Control", "no-cache, no-transform");
      reply.raw.setHeader("Connection", "keep-alive");
      reply.raw.flushHeaders();

      const chunksToSend = chunkResponseForStreaming(response.message);
      for (const chunk of chunksToSend) {
        reply.raw.write(`data: ${JSON.stringify({ token: chunk })}\n\n`);
      }
      reply.raw.write(
        `data: ${JSON.stringify({ done: true, response })}\n\n`
      );
      reply.raw.end();
      return reply;
    }

    return reply.send({ ...response, prompt });
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
