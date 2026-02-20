import Fastify from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { z } from "zod";

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

const crawlConfigSchema = z.object({
  agentId: z.string().min(1),
  startUrls: z.array(z.string().url()).min(1),
  sitemapUrl: z.string().url().optional(),
  includePaths: z.array(z.string().min(1)).optional(),
  excludePaths: z.array(z.string().min(1)).optional(),
  depthLimit: z.number().int().min(1).max(10).optional()
});

type IngestionJob = {
  id: string;
  sourceId: string;
  kind: "crawl";
  status: "queued" | "processing" | "complete" | "failed";
  createdAt: string;
};
export const buildServer = async () => {
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

  const tenants = new Map<string, Tenant>();
  const agents = new Map<string, Agent>();
  const sources = new Map<string, Source>();
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

  fastify.post("/chat", async (request) => {
    const schema = z.object({
      agentId: z.string().min(1),
      message: z.string().min(1)
    });
    const data = schema.parse(request.body);
    if (!agents.has(data.agentId)) {
      return { error: "agent_not_found" };
    }
    return {
      message: `Echo: ${data.message}`,
      sources: []
    };
  });

  return fastify;
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
