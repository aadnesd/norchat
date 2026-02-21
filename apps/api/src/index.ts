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

type Chunk = {
  id: string;
  agentId: string;
  sourceId: string;
  content: string;
  metadata?: Record<string, unknown>;
  embedding: Record<string, number>;
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
  const chunks = new Map<string, Chunk>();

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
    const chunkSize = data.chunkSize ?? 120;
    const chunkOverlap =
      data.chunkOverlap ?? Math.min(20, Math.max(chunkSize - 1, 0));
    const textChunks = splitIntoChunks(data.text, {
      chunkSize,
      chunkOverlap
    });
    const createdAt = new Date().toISOString();
    const chunkCount = textChunks.length;
    const createdChunks = textChunks.map((content, index) => {
      const chunkId = `chunk_${crypto.randomUUID()}`;
      const metadata: Record<string, unknown> = {
        ...data.metadata,
        chunkIndex: index,
        chunkCount
      };
      const chunk: Chunk = {
        id: chunkId,
        agentId: source.agentId,
        sourceId: source.id,
        content,
        metadata,
        embedding: buildEmbedding(content),
        createdAt
      };
      chunks.set(chunkId, chunk);
      return {
        id: chunkId,
        sourceId: source.id,
        content,
        metadata,
        createdAt
      };
    });

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

  fastify.post("/retrieve", async (request, reply) => {
    const schema = z.object({
      agentId: z.string().min(1),
      query: z.string().min(1),
      maxResults: z.number().int().min(1).max(20).optional(),
      sourceIds: z.array(z.string().min(1)).optional(),
      minScore: z.number().min(0).max(1).optional()
    });
    const data = schema.parse(request.body);
    if (!agents.has(data.agentId)) {
      return reply.code(404).send({ error: "agent_not_found" });
    }
    const queryEmbedding = buildEmbedding(data.query);
    const minScore = data.minScore ?? 0;
    const maxResults = data.maxResults ?? 5;
    const sourceFilter = data.sourceIds
      ? new Set(data.sourceIds)
      : undefined;

    const scored = Array.from(chunks.values())
      .filter((chunk) => {
        if (chunk.agentId !== data.agentId) {
          return false;
        }
        if (sourceFilter && !sourceFilter.has(chunk.sourceId)) {
          return false;
        }
        return true;
      })
      .map((chunk) => ({
        chunk,
        score: computeSimilarity(queryEmbedding, chunk.embedding)
      }))
      .filter((item) => item.score > minScore)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults)
      .map((item) => ({
        chunk: {
          id: item.chunk.id,
          sourceId: item.chunk.sourceId,
          content: item.chunk.content,
          metadata: item.chunk.metadata
        },
        score: item.score
      }));

    return { items: scored };
  });

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

const tokenize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/giu, " ")
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);

const buildEmbedding = (text: string) => {
  const embedding: Record<string, number> = {};
  for (const token of tokenize(text)) {
    embedding[token] = (embedding[token] ?? 0) + 1;
  }
  return embedding;
};

const computeSimilarity = (
  queryEmbedding: Record<string, number>,
  chunkEmbedding: Record<string, number>
) => {
  let dot = 0;
  let queryNorm = 0;
  let chunkNorm = 0;
  for (const value of Object.values(queryEmbedding)) {
    queryNorm += value * value;
  }
  for (const value of Object.values(chunkEmbedding)) {
    chunkNorm += value * value;
  }
  if (queryNorm === 0 || chunkNorm === 0) {
    return 0;
  }
  for (const [token, value] of Object.entries(queryEmbedding)) {
    const chunkValue = chunkEmbedding[token];
    if (chunkValue) {
      dot += value * chunkValue;
    }
  }
  return dot / (Math.sqrt(queryNorm) * Math.sqrt(chunkNorm));
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
