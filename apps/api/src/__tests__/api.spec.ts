import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { InjectOptions } from "light-my-request";
import { buildServer } from "../index.js";

describe("api routes", () => {
  let server: FastifyInstance;
  let vectorStoreDir: string;

  beforeAll(async () => {
    vectorStoreDir = await mkdtemp(path.join(tmpdir(), "vector-store-"));
    process.env.VECTOR_STORE_DIR = vectorStoreDir;
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    if (vectorStoreDir) {
      await rm(vectorStoreDir, { recursive: true, force: true });
    }
    delete process.env.VECTOR_STORE_DIR;
  });

  const authHeaders = (userId = "user_admin") => ({
    "x-user-id": userId
  });

  const injectAs = (userId: string, options: InjectOptions) =>
    server.inject({
      ...options,
      headers: {
        ...options.headers,
        ...authHeaders(userId)
      }
    });

  const adminInject = (options: InjectOptions) =>
    injectAs("user_admin", options);


  const seedAgentWithText = async (name: string, text: string) => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name,
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: `${name} Agent`
      }
    });
    const agent = agentResponse.json();

    const sourceResponse = await adminInject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: agent.id,
        type: "text",
        value: "seed"
      }
    });
    const source = sourceResponse.json();

    const ingestResponse = await adminInject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: {
        text
      }
    });
    expect(ingestResponse.statusCode).toBe(201);

    return { tenant, agent, source };
  };

  it("creates and lists tenants", async () => {
    const createResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Oslo Support",
        region: "no",
        dataResidency: "no"
      }
    });

    expect(createResponse.statusCode).toBe(201);
    const tenant = createResponse.json();
    expect(tenant.id).toMatch(/^tenant_/u);

    const listResponse = await adminInject({
      method: "GET",
      url: "/tenants"
    });

    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(listBody.items.some((item: { id: string }) => item.id === tenant.id)).toBe(
      true
    );
  });

  it("creates source, retrains, and deletes", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Bergen Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Shipping Agent"
      }
    });
    const agent = agentResponse.json();

    const sourceResponse = await adminInject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: agent.id,
        type: "website",
        value: "https://example.no/faq"
      }
    });

    expect(sourceResponse.statusCode).toBe(201);
    const source = sourceResponse.json();
    expect(source.status).toBe("queued");

    const retrainResponse = await adminInject({
      method: "POST",
      url: `/sources/${source.id}/retrain`
    });

    expect(retrainResponse.statusCode).toBe(200);
    const retrainBody = retrainResponse.json();
    expect(retrainBody.source.status).toBe("processing");
    expect(retrainBody.source.lastSyncedAt).toBeTypeOf("string");
    expect(retrainBody.mode).toBe("job");
    expect(retrainBody.job).toBeDefined();
    expect(retrainBody.job.sourceId).toBe(source.id);
    expect(retrainBody.job.status).toBe("queued");
    expect(retrainBody.deletedChunks).toBeTypeOf("number");

    const deleteResponse = await adminInject({
      method: "DELETE",
      url: `/sources/${source.id}`
    });

    expect(deleteResponse.statusCode).toBe(204);
  });

  it("retrain clears old chunks and auto-re-ingests from cached content", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "Retrain Corp", region: "no" }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "Retrain Agent" }
    });
    const agent = agentResponse.json();

    const sourceResponse = await adminInject({
      method: "POST",
      url: "/sources",
      payload: { agentId: agent.id, type: "text", value: "retrain-kb" }
    });
    const source = sourceResponse.json();

    // Ingest some text
    const ingestResponse = await adminInject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: { text: "Norway has a long coastline with many fjords and mountains" }
    });
    expect(ingestResponse.statusCode).toBe(201);

    // Verify retrieval finds the chunk
    const retrieveResponse = await adminInject({
      method: "POST",
      url: "/retrieve",
      payload: { agentId: agent.id, query: "fjords" }
    });
    expect(retrieveResponse.statusCode).toBe(200);
    const results = retrieveResponse.json();
    expect(results.items.length).toBeGreaterThan(0);

    // Retrain — should clear old chunks AND re-ingest from cache
    const retrainResponse = await adminInject({
      method: "POST",
      url: `/sources/${source.id}/retrain`
    });
    expect(retrainResponse.statusCode).toBe(200);
    const retrainBody = retrainResponse.json();
    expect(retrainBody.deletedChunks).toBeGreaterThan(0);
    expect(retrainBody.mode).toBe("auto");
    expect(retrainBody.reingestedChunks).toBeGreaterThan(0);
    expect(retrainBody.source.status).toBe("ready");
    expect(retrainBody.durationMs).toBeGreaterThanOrEqual(0);
    expect(retrainBody.slaMet).toBe(true);

    // Verify retrieval still works after retrain (chunks were re-created)
    const retrieveAfter = await adminInject({
      method: "POST",
      url: "/retrieve",
      payload: { agentId: agent.id, query: "fjords" }
    });
    expect(retrieveAfter.statusCode).toBe(200);
    const afterResults = retrieveAfter.json();
    expect(afterResults.items.length).toBeGreaterThan(0);
  });

  it("retrain falls back to job mode when no cached content exists", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "Retrain Job Corp", region: "no" }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "Retrain Job Agent" }
    });
    const agent = agentResponse.json();

    // Create source without ingesting any text (no cached content)
    const sourceResponse = await adminInject({
      method: "POST",
      url: "/sources",
      payload: { agentId: agent.id, type: "website", value: "https://example.no" }
    });
    const source = sourceResponse.json();

    // Retrain — no cached content, should create a job
    const retrainResponse = await adminInject({
      method: "POST",
      url: `/sources/${source.id}/retrain`
    });
    expect(retrainResponse.statusCode).toBe(200);
    const retrainBody = retrainResponse.json();
    expect(retrainBody.mode).toBe("job");
    expect(retrainBody.job.status).toBe("queued");
    expect(retrainBody.job.sourceId).toBe(source.id);
    expect(retrainBody.source.status).toBe("processing");
  });

  it("retrain with auto mode preserves chat functionality end-to-end", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "E2E Retrain Corp", region: "no" }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "E2E Retrain Agent" }
    });
    const agent = agentResponse.json();

    const sourceResponse = await adminInject({
      method: "POST",
      url: "/sources",
      payload: { agentId: agent.id, type: "text", value: "retrain-e2e-kb" }
    });
    const source = sourceResponse.json();

    // Ingest text about Norwegian weather
    await adminInject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: { text: "Bergen is known for its rainy weather and beautiful surrounding fjords" }
    });

    // Chat about Bergen weather — should get relevant response
    const chatBefore = await adminInject({
      method: "POST",
      url: "/chat",
      payload: { agentId: agent.id, message: "Tell me about Bergen weather" }
    });
    expect(chatBefore.statusCode).toBe(200);
    const chatBeforeBody = chatBefore.json();
    expect(chatBeforeBody.sources.length).toBeGreaterThan(0);
    expect(chatBeforeBody.confidence).toBeGreaterThan(0);

    // Retrain — auto-re-ingests from cache
    const retrainStartedAt = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const retrainCompletedAt = new Date().toISOString();
    const retrainResponse = await adminInject({
      method: "POST",
      url: `/sources/${source.id}/retrain`,
      payload: {
        startedAt: retrainStartedAt,
        completedAt: retrainCompletedAt
      }
    });
    const retrainBody = retrainResponse.json();
    expect(retrainBody.mode).toBe("auto");
    expect(retrainBody.source.status).toBe("ready");
    expect(retrainBody.durationMs).toBeGreaterThanOrEqual(0);
    expect(retrainBody.slaMet).toBe(false);

    // Chat again — should still work after retrain
    const chatAfter = await adminInject({
      method: "POST",
      url: "/chat",
      payload: { agentId: agent.id, message: "Tell me about Bergen weather" }
    });
    expect(chatAfter.statusCode).toBe(200);
    const chatAfterBody = chatAfter.json();
    expect(chatAfterBody.sources.length).toBeGreaterThan(0);
    expect(chatAfterBody.confidence).toBeGreaterThan(0);
  });

  it("queues crawl ingestion job", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Trondheim Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Onboarding Agent"
      }
    });
    const agent = agentResponse.json();

    const crawlResponse = await adminInject({
      method: "POST",
      url: "/sources/crawl",
      payload: {
        agentId: agent.id,
        startUrls: ["https://example.no"],
        includePaths: ["/help"],
        excludePaths: ["/legal"],
        depthLimit: 3
      }
    });

    expect(crawlResponse.statusCode).toBe(201);
    const body = crawlResponse.json();
    expect(body.source.id).toMatch(/^source_/u);
    expect(body.source.status).toBe("queued");
    expect(body.source.type).toBe("website");
    expect(body.job.id).toMatch(/^job_/u);
    expect(body.job.status).toBe("queued");
  });

  it("queues file ingestion and tracks job status", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Stavanger Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Docs Agent"
      }
    });
    const agent = agentResponse.json();

    const fileResponse = await adminInject({
      method: "POST",
      url: "/sources/file",
      payload: {
        agentId: agent.id,
        filename: "pricing.pdf",
        contentType: "application/pdf",
        sizeBytes: 1024
      }
    });

    expect(fileResponse.statusCode).toBe(201);
    const fileBody = fileResponse.json();
    expect(fileBody.source.type).toBe("file");
    expect(fileBody.source.status).toBe("queued");
    expect(fileBody.job.kind).toBe("file");
    expect(fileBody.job.status).toBe("queued");

    const listResponse = await adminInject({
      method: "GET",
      url: `/ingestion-jobs?sourceId=${fileBody.source.id}`
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(listBody.items.length).toBe(1);

    const jobResponse = await adminInject({
      method: "GET",
      url: `/ingestion-jobs/${fileBody.job.id}`
    });
    expect(jobResponse.statusCode).toBe(200);

    const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const completedAt = new Date().toISOString();

    const processingResponse = await adminInject({
      method: "POST",
      url: `/ingestion-jobs/${fileBody.job.id}/status`,
      payload: { status: "processing", startedAt }
    });
    expect(processingResponse.statusCode).toBe(200);
    expect(processingResponse.json().job.status).toBe("processing");

    const completeResponse = await adminInject({
      method: "POST",
      url: `/ingestion-jobs/${fileBody.job.id}/status`,
      payload: { status: "complete", startedAt, completedAt }
    });
    expect(completeResponse.statusCode).toBe(200);
    const completeBody = completeResponse.json();
    expect(completeBody.job.status).toBe("complete");
    expect(completeBody.job.durationMs).toBeGreaterThanOrEqual(0);
    expect(completeBody.job.slaMet).toBe(false);
  });

  it("rejects ingestion completion timestamps where completion precedes start", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "SLA Guard Tenant",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "SLA Guard Agent"
      }
    });
    const agent = agentResponse.json();

    const fileResponse = await adminInject({
      method: "POST",
      url: "/sources/file",
      payload: {
        agentId: agent.id,
        filename: "sla.pdf",
        contentType: "application/pdf",
        sizeBytes: 256
      }
    });
    const fileBody = fileResponse.json();

    const invalidResponse = await adminInject({
      method: "POST",
      url: `/ingestion-jobs/${fileBody.job.id}/status`,
      payload: {
        status: "complete",
        startedAt: new Date(Date.now() + 60_000).toISOString(),
        completedAt: new Date().toISOString()
      }
    });

    expect(invalidResponse.statusCode).toBe(400);
    expect(invalidResponse.json().error).toBe("completed_before_started");
  });

  it("ingests text chunks and retrieves relevant content", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Nordic Support",
        region: "norway-oslo"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "FAQ Agent"
      }
    });
    const agent = agentResponse.json();

    const sourceResponse = await adminInject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: agent.id,
        type: "text",
        value: "FAQ"
      }
    });
    const source = sourceResponse.json();

    const ingestResponse = await adminInject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: {
        text: "Shipping policy: We ship within 2 days. Refund policy: Refunds within 30 days.",
        chunkSize: 6,
        chunkOverlap: 0,
        metadata: {
          title: "Support FAQ"
        }
      }
    });

    expect(ingestResponse.statusCode).toBe(201);
    const ingestBody = ingestResponse.json();
    expect(ingestBody.chunks.length).toBeGreaterThan(1);
    expect(ingestBody.chunks[0].id).toMatch(/^chunk_/u);

    const vectorFile = path.join(vectorStoreDir, "norway-oslo", "chunks.jsonl");
    const storedData = await readFile(vectorFile, "utf8");
    const storedRecords = storedData
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    expect(
      storedRecords.some(
        (record: { agentId: string; content: string }) =>
          record.agentId === agent.id && /refund/i.test(record.content)
      )
    ).toBe(true);

    const retrieveResponse = await adminInject({
      method: "POST",
      url: "/retrieve",
      payload: {
        agentId: agent.id,
        query: "refunds",
        maxResults: 2
      }
    });

    expect(retrieveResponse.statusCode).toBe(200);
    const retrieveBody = retrieveResponse.json();
    expect(retrieveBody.items.length).toBeGreaterThan(0);
    expect(retrieveBody.items[0].chunk.content).toMatch(/refund/i);
  });

  it("ingests file content via ingestion job and retrieves", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Tromso Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Pricing Agent"
      }
    });
    const agent = agentResponse.json();

    const fileResponse = await adminInject({
      method: "POST",
      url: "/sources/file",
      payload: {
        agentId: agent.id,
        filename: "pricing.pdf",
        contentType: "application/pdf",
        sizeBytes: 2048
      }
    });

    expect(fileResponse.statusCode).toBe(201);
    const fileBody = fileResponse.json();

    const ingestResponse = await adminInject({
      method: "POST",
      url: `/ingestion-jobs/${fileBody.job.id}/ingest`,
      payload: {
        documents: [
          {
            content: "Pricing: The basic plan is 99 NOK per month.",
            metadata: { title: "Pricing Guide", page: 1 }
          }
        ],
        chunkSize: 8,
        chunkOverlap: 0
      }
    });

    expect(ingestResponse.statusCode).toBe(201);
    const ingestBody = ingestResponse.json();
    expect(ingestBody.chunks.length).toBeGreaterThan(0);

    const jobResponse = await adminInject({
      method: "GET",
      url: `/ingestion-jobs/${fileBody.job.id}`
    });
    expect(jobResponse.statusCode).toBe(200);
    const jobBody = jobResponse.json().job;
    expect(jobBody.status).toBe("complete");
    expect(jobBody.durationMs).toBeGreaterThanOrEqual(0);
    expect(jobBody.slaMet).toBe(true);

    const retrieveResponse = await adminInject({
      method: "POST",
      url: "/retrieve",
      payload: {
        agentId: agent.id,
        query: "basic plan price",
        maxResults: 2
      }
    });

    expect(retrieveResponse.statusCode).toBe(200);
    const retrieveBody = retrieveResponse.json();
    expect(retrieveBody.items.length).toBeGreaterThan(0);
    expect(retrieveBody.items[0].chunk.content).toMatch(/99 NOK/i);
  });

  it("ingests crawl content via ingestion job and retrieves", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Kristiansand Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Crawl Agent"
      }
    });
    const agent = agentResponse.json();

    const crawlResponse = await adminInject({
      method: "POST",
      url: "/sources/crawl",
      payload: {
        agentId: agent.id,
        startUrls: ["https://example.no"],
        includePaths: ["/help"],
        depthLimit: 1
      }
    });

    expect(crawlResponse.statusCode).toBe(201);
    const crawlBody = crawlResponse.json();

    const ingestResponse = await adminInject({
      method: "POST",
      url: `/ingestion-jobs/${crawlBody.job.id}/ingest`,
      payload: {
        documents: [
          {
            content: "Refund policy: refunds are accepted within 30 days.",
            metadata: {
              url: "https://example.no/help/refunds",
              title: "Refunds"
            }
          }
        ],
        chunkSize: 6,
        chunkOverlap: 0
      }
    });

    expect(ingestResponse.statusCode).toBe(201);
    const ingestBody = ingestResponse.json();
    expect(ingestBody.chunks.length).toBeGreaterThan(0);

    const retrieveResponse = await adminInject({
      method: "POST",
      url: "/retrieve",
      payload: {
        agentId: agent.id,
        query: "refunds",
        maxResults: 2
      }
    });

    expect(retrieveResponse.statusCode).toBe(200);
    const retrieveBody = retrieveResponse.json();
    expect(retrieveBody.items.length).toBeGreaterThan(0);
    expect(retrieveBody.items[0].chunk.content).toMatch(/refund/i);
  });

  it("runs chat with retrieval and streams responses", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Lillehammer Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Returns Agent",
        basePrompt: "Be helpful and cite sources."
      }
    });
    const agent = agentResponse.json();

    const sourceResponse = await adminInject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: agent.id,
        type: "text",
        value: "Returns FAQ"
      }
    });
    const source = sourceResponse.json();

    await adminInject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: {
        text: "Returns are accepted within 14 days with a receipt.",
        chunkSize: 6,
        chunkOverlap: 0
      }
    });

    const chatResponse = await adminInject({
      method: "POST",
      url: "/chat",
      payload: {
        agentId: agent.id,
        message: "What is the return window?"
      }
    });

    expect(chatResponse.statusCode).toBe(200);
    const chatBody = chatResponse.json();
    expect(chatBody.message).toMatch(/return/i);
    expect(chatBody.sources.length).toBeGreaterThan(0);
    expect(chatBody.prompt).toContain("Be helpful and cite sources");

    const streamResponse = await adminInject({
      method: "POST",
      url: "/chat",
      payload: {
        agentId: agent.id,
        message: "Return policy?",
        stream: true
      }
    });

    expect(streamResponse.statusCode).toBe(200);
    const streamBody = streamResponse.body;
    expect(streamBody).toContain("data:");
    expect(streamBody).toContain("\"done\":true");
  });

  it("creates and lists actions", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Roros Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Action Agent"
      }
    });
    const agent = agentResponse.json();

    const actionResponse = await adminInject({
      method: "POST",
      url: "/actions",
      payload: {
        agentId: agent.id,
        type: "slack_notify",
        config: {
          channel: "#support"
        }
      }
    });

    expect(actionResponse.statusCode).toBe(201);
    const action = actionResponse.json();
    expect(action.id).toMatch(/^action_/u);
    expect(action.enabled).toBe(true);

    const listResponse = await adminInject({
      method: "GET",
      url: `/actions?agentId=${agent.id}`
    });

    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(listBody.items.some((item: { id: string }) => item.id === action.id)).toBe(
      true
    );
  });

  it("executes a Slack notification action", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Arendal Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Slack Agent"
      }
    });
    const agent = agentResponse.json();

    const actionResponse = await adminInject({
      method: "POST",
      url: "/actions",
      payload: {
        agentId: agent.id,
        type: "slack_notify",
        config: {
          channel: "#support"
        }
      }
    });
    const action = actionResponse.json();

    const executeResponse = await adminInject({
      method: "POST",
      url: `/actions/${action.id}/execute`,
      payload: {
        message: "Customer requested escalation.",
        metadata: {
          conversationId: "conv_123"
        }
      }
    });

    expect(executeResponse.statusCode).toBe(200);
    const executeBody = executeResponse.json();
    expect(executeBody.execution.id).toMatch(/^execution_/u);
    expect(executeBody.execution.output.delivery.channel).toBe("#support");
    expect(executeBody.execution.output.delivery.text).toContain("escalation");
  });

  it("executes CRM escalation and Stripe billing actions", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Alta Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Ops Agent"
      }
    });
    const agent = agentResponse.json();

    const ticketActionResponse = await adminInject({
      method: "POST",
      url: "/actions",
      payload: {
        agentId: agent.id,
        type: "ticket_create",
        config: {
          provider: "zendesk",
          defaultPriority: "high"
        }
      }
    });
    const ticketAction = ticketActionResponse.json();

    const ticketExecuteResponse = await adminInject({
      method: "POST",
      url: `/actions/${ticketAction.id}/execute`,
      payload: {
        subject: "Billing issue",
        description: "Customer cannot update their card details."
      }
    });

    expect(ticketExecuteResponse.statusCode).toBe(200);
    const ticketBody = ticketExecuteResponse.json();
    expect(ticketBody.execution.output.ticket.provider).toBe("zendesk");
    expect(ticketBody.execution.output.ticket.priority).toBe("high");

    const billingActionResponse = await adminInject({
      method: "POST",
      url: "/actions",
      payload: {
        agentId: agent.id,
        type: "stripe_billing",
        config: {
          currency: "NOK",
          defaultAmount: 199
        }
      }
    });
    const billingAction = billingActionResponse.json();

    const billingExecuteResponse = await adminInject({
      method: "POST",
      url: `/actions/${billingAction.id}/execute`,
      payload: {
        customerId: "cus_123"
      }
    });

    expect(billingExecuteResponse.statusCode).toBe(200);
    const billingBody = billingExecuteResponse.json();
    expect(billingBody.execution.output.invoice.currency).toBe("NOK");
    expect(billingBody.execution.output.invoice.amount).toBe(199);
    expect(billingBody.execution.output.invoice.status).toBe("open");
    expect(billingBody.execution.output.invoice.id).toMatch(/^in_/);
    expect(billingBody.execution.output.invoice.paymentLink).toMatch(
      /^https:\/\/checkout\.stripe\.com/
    );
    expect(billingBody.execution.output.invoice.livemode).toBe(false);
    expect(billingBody.execution.output.customer).toBeDefined();
    expect(billingBody.execution.output.customer.id).toBe("cus_123");
  });

  it("creates and lists conversations with pagination", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Fredrikstad Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "History Agent"
      }
    });
    const agent = agentResponse.json();

    const channelResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "web_widget",
        enabled: true
      }
    });
    const channel = channelResponse.json();

    const firstConversationResponse = await adminInject({
      method: "POST",
      url: "/conversations",
      payload: {
        agentId: agent.id
      }
    });
    expect(firstConversationResponse.statusCode).toBe(201);
    const firstConversation = firstConversationResponse.json();
    expect(firstConversation.status).toBe("open");
    expect(firstConversation.startedAt).toBeTypeOf("string");
    expect(firstConversation.endedAt).toBeUndefined();

    const secondConversationResponse = await adminInject({
      method: "POST",
      url: "/conversations",
      payload: {
        agentId: agent.id,
        channelId: channel.id,
        userId: "user_123"
      }
    });
    expect(secondConversationResponse.statusCode).toBe(201);
    const secondConversation = secondConversationResponse.json();
    expect(secondConversation.channelId).toBe(channel.id);
    expect(secondConversation.userId).toBe("user_123");

    const thirdConversationResponse = await adminInject({
      method: "POST",
      url: "/conversations",
      payload: {
        agentId: agent.id
      }
    });
    expect(thirdConversationResponse.statusCode).toBe(201);
    const thirdConversation = thirdConversationResponse.json();

    const listResponse = await adminInject({
      method: "GET",
      url: `/conversations?agentId=${agent.id}&limit=2&offset=1`
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(listBody.items).toHaveLength(2);
    expect(listBody.items[0].id).toBe(secondConversation.id);
    expect(listBody.items[1].id).toBe(thirdConversation.id);

    const channelListResponse = await adminInject({
      method: "GET",
      url: `/conversations?channelId=${channel.id}`
    });
    expect(channelListResponse.statusCode).toBe(200);
    const channelListBody = channelListResponse.json();
    expect(channelListBody.items).toHaveLength(1);
    expect(channelListBody.items[0].id).toBe(secondConversation.id);
  });

  it("validates conversation create input", async () => {
    const response = await adminInject({
      method: "POST",
      url: "/conversations",
      payload: {
        agentId: "agent_missing"
      }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toBe("agent_not_found");
  });

  it("creates widget channel and enforces domain allowlist", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Fredrikstad Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Widget Agent"
      }
    });
    const agent = agentResponse.json();

    const channelResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "web_widget",
        config: {
          allowedDomains: ["support.nordiccare.no", "*.example.no"]
        }
      }
    });

    expect(channelResponse.statusCode).toBe(201);
    const channel = channelResponse.json();
    expect(channel.id).toMatch(/^channel_/u);
    expect(channel.enabled).toBe(true);

    const blockedResponse = await adminInject({
      method: "POST",
      url: "/chat",
      headers: {
        origin: "https://evil.com"
      },
      payload: {
        channelId: channel.id,
        message: "Hello from a blocked domain"
      }
    });

    expect(blockedResponse.statusCode).toBe(403);
    expect(blockedResponse.json().error).toBe("domain_not_allowed");

    const allowedResponse = await adminInject({
      method: "POST",
      url: "/chat",
      headers: {
        origin: "https://support.nordiccare.no"
      },
      payload: {
        channelId: channel.id,
        message: "Hello from allowed domain"
      }
    });

    expect(allowedResponse.statusCode).toBe(200);
    expect(allowedResponse.json().message.length).toBeGreaterThan(0);

    const wildcardResponse = await adminInject({
      method: "POST",
      url: "/chat",
      headers: {
        origin: "https://help.example.no"
      },
      payload: {
        channelId: channel.id,
        message: "Hello from wildcard domain"
      }
    });

    expect(wildcardResponse.statusCode).toBe(200);
  });

  it("serves widget script and help page", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Drammen Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Help Agent"
      }
    });
    const agent = agentResponse.json();

    const channelResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "help_page",
        config: {
          allowedDomains: ["help.nordiccare.no"]
        }
      }
    });

    expect(channelResponse.statusCode).toBe(201);
    const channel = channelResponse.json();

    const widgetResponse = await adminInject({
      method: "GET",
      url: "/widget.js"
    });

    expect(widgetResponse.statusCode).toBe(200);
    expect(widgetResponse.headers["content-type"]).toContain("application/javascript");
    expect(widgetResponse.body).toContain("createWidget");

    const helpResponse = await adminInject({
      method: "GET",
      url: `/help/${channel.id}`
    });

    expect(helpResponse.statusCode).toBe(200);
    expect(helpResponse.headers["content-type"]).toContain("text/html");
    expect(helpResponse.body).toContain(channel.id);
  });

  it("handles Slack webhook messages with shared auth", async () => {
    const { agent } = await seedAgentWithText(
      "Slack Workspace",
      "Refunds are processed within 5 business days."
    );

    const channelResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "slack",
        config: {
          authToken: "slack_secret"
        }
      }
    });
    const channel = channelResponse.json();

    const unauthorizedResponse = await adminInject({
      method: "POST",
      url: `/channels/${channel.id}/webhook`,
      payload: {
        type: "event_callback",
        event: {
          type: "message",
          text: "Refund policy?",
          user: "U123",
          ts: "1700000000.0001"
        }
      }
    });
    expect(unauthorizedResponse.statusCode).toBe(401);
    expect(unauthorizedResponse.json().error).toBe("channel_unauthorized");

    const verificationResponse = await adminInject({
      method: "POST",
      url: `/channels/${channel.id}/webhook`,
      headers: {
        authorization: "Bearer slack_secret"
      },
      payload: {
        type: "url_verification",
        challenge: "verify-me"
      }
    });
    expect(verificationResponse.statusCode).toBe(200);
    expect(verificationResponse.json().challenge).toBe("verify-me");

    const messageResponse = await adminInject({
      method: "POST",
      url: `/channels/${channel.id}/webhook`,
      headers: {
        authorization: "Bearer slack_secret"
      },
      payload: {
        type: "event_callback",
        event: {
          type: "message",
          text: "When are refunds processed?",
          user: "U123",
          ts: "1700000000.0002"
        }
      }
    });
    expect(messageResponse.statusCode).toBe(200);
    const messageBody = messageResponse.json();
    expect(messageBody.conversationId).toMatch(/^conversation_/u);
    expect(messageBody.reply.message).toContain("Refunds are processed within 5 business days.");
  });

  it("handles WhatsApp, email, Zendesk, and Salesforce webhooks", async () => {
    const { agent } = await seedAgentWithText(
      "Multi Channel",
      "Returns are accepted within 30 days with proof of purchase."
    );

    const whatsappResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "whatsapp",
        config: {
          authToken: "wa_secret",
          verifyToken: "wa_verify"
        }
      }
    });
    const whatsappChannel = whatsappResponse.json();

    const whatsappVerifyResponse = await adminInject({
      method: "GET",
      url: `/channels/${whatsappChannel.id}/webhook?hub.mode=subscribe&hub.verify_token=wa_verify&hub.challenge=12345`
    });
    expect(whatsappVerifyResponse.statusCode).toBe(200);
    expect(whatsappVerifyResponse.body).toBe("12345");

    const whatsappMessageResponse = await adminInject({
      method: "POST",
      url: `/channels/${whatsappChannel.id}/webhook`,
      headers: {
        authorization: "Bearer wa_secret"
      },
      payload: {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: "4799999999",
                      id: "wamid.1",
                      text: { body: "What is the return window?" }
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    });
    expect(whatsappMessageResponse.statusCode).toBe(200);
    expect(whatsappMessageResponse.json().reply.message).toContain(
      "Returns are accepted within 30 days"
    );

    const emailResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "email",
        config: {
          authToken: "email_secret"
        }
      }
    });
    const emailChannel = emailResponse.json();

    const emailWebhookResponse = await adminInject({
      method: "POST",
      url: `/channels/${emailChannel.id}/webhook`,
      headers: {
        authorization: "Bearer email_secret"
      },
      payload: {
        from: "customer@example.no",
        subject: "Returns",
        text: "How many days do I have?"
      }
    });
    expect(emailWebhookResponse.statusCode).toBe(200);
    expect(emailWebhookResponse.json().reply.message).toContain(
      "Returns are accepted within 30 days"
    );

    const zendeskResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "zendesk",
        config: {
          authToken: "zendesk_secret"
        }
      }
    });
    const zendeskChannel = zendeskResponse.json();

    const zendeskWebhookResponse = await adminInject({
      method: "POST",
      url: `/channels/${zendeskChannel.id}/webhook`,
      headers: {
        authorization: "Bearer zendesk_secret"
      },
      payload: {
        ticket: {
          id: 987,
          subject: "Return policy",
          description: "Is the return window 30 days?",
          requester: {
            email: "supporter@example.no"
          }
        }
      }
    });
    expect(zendeskWebhookResponse.statusCode).toBe(200);
    expect(zendeskWebhookResponse.json().reply.message).toContain(
      "Returns are accepted within 30 days"
    );

    const salesforceResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "salesforce",
        config: {
          authToken: "sf_secret"
        }
      }
    });
    const salesforceChannel = salesforceResponse.json();

    const salesforceWebhookResponse = await adminInject({
      method: "POST",
      url: `/channels/${salesforceChannel.id}/webhook`,
      headers: {
        authorization: "Bearer sf_secret"
      },
      payload: {
        Case: {
          Id: "5003t00002",
          Subject: "Return window",
          Description: "Need the return policy details.",
          Contact: {
            Email: "case@example.no"
          }
        }
      }
    });
    expect(salesforceWebhookResponse.statusCode).toBe(200);
    expect(salesforceWebhookResponse.json().reply.message).toContain(
      "Returns are accepted within 30 days"
    );
  });

  it("handles Messenger, Instagram, Shopify, Zapier, and WordPress webhooks", async () => {
    const { agent } = await seedAgentWithText(
      "Extended Connectors",
      "Support is available 24/7 via chat."
    );

    const messengerResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "messenger",
        config: {
          authToken: "messenger_secret",
          verifyToken: "messenger_verify"
        }
      }
    });
    const messengerChannel = messengerResponse.json();

    const messengerVerifyResponse = await adminInject({
      method: "GET",
      url: `/channels/${messengerChannel.id}/webhook?hub.mode=subscribe&hub.verify_token=messenger_verify&hub.challenge=ok123`
    });
    expect(messengerVerifyResponse.statusCode).toBe(200);
    expect(messengerVerifyResponse.body).toBe("ok123");

    const messengerWebhookResponse = await adminInject({
      method: "POST",
      url: `/channels/${messengerChannel.id}/webhook`,
      headers: {
        authorization: "Bearer messenger_secret"
      },
      payload: {
        object: "page",
        entry: [
          {
            messaging: [
              {
                sender: {
                  id: "m_user_1"
                },
                message: {
                  mid: "m_mid_1",
                  text: "When is support available?"
                },
                timestamp: 1700000300000
              }
            ]
          }
        ]
      }
    });
    expect(messengerWebhookResponse.statusCode).toBe(200);
    expect(messengerWebhookResponse.json().reply.message).toContain(
      "Support is available 24/7 via chat."
    );

    const instagramResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "instagram",
        config: {
          authToken: "instagram_secret",
          verifyToken: "instagram_verify"
        }
      }
    });
    const instagramChannel = instagramResponse.json();

    const instagramVerifyResponse = await adminInject({
      method: "GET",
      url: `/channels/${instagramChannel.id}/webhook?hub.mode=subscribe&hub.verify_token=instagram_verify&hub.challenge=ig123`
    });
    expect(instagramVerifyResponse.statusCode).toBe(200);
    expect(instagramVerifyResponse.body).toBe("ig123");

    const instagramWebhookResponse = await adminInject({
      method: "POST",
      url: `/channels/${instagramChannel.id}/webhook`,
      headers: {
        authorization: "Bearer instagram_secret"
      },
      payload: {
        object: "instagram",
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      from: "ig_user_1",
                      id: "ig_mid_1",
                      text: "Need support hours."
                    }
                  ]
                }
              }
            ]
          }
        ]
      }
    });
    expect(instagramWebhookResponse.statusCode).toBe(200);
    expect(instagramWebhookResponse.json().reply.message).toContain(
      "Support is available 24/7 via chat."
    );

    const shopifyResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "shopify",
        config: {
          authToken: "shopify_secret"
        }
      }
    });
    const shopifyChannel = shopifyResponse.json();

    const shopifyWebhookResponse = await adminInject({
      method: "POST",
      url: `/channels/${shopifyChannel.id}/webhook`,
      headers: {
        authorization: "Bearer shopify_secret"
      },
      payload: {
        id: 12345,
        note: "Do you have support around the clock?",
        customer: {
          email: "shopper@example.no"
        }
      }
    });
    expect(shopifyWebhookResponse.statusCode).toBe(200);
    expect(shopifyWebhookResponse.json().reply.message).toContain(
      "Support is available 24/7 via chat."
    );

    const zapierResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "zapier",
        config: {
          authToken: "zapier_secret"
        }
      }
    });
    const zapierChannel = zapierResponse.json();

    const zapierWebhookResponse = await adminInject({
      method: "POST",
      url: `/channels/${zapierChannel.id}/webhook`,
      headers: {
        authorization: "Bearer zapier_secret"
      },
      payload: {
        message: "Can I contact support at any hour?",
        userId: "zap_user_1",
        threadKey: "zap_thread_1"
      }
    });
    expect(zapierWebhookResponse.statusCode).toBe(200);
    expect(zapierWebhookResponse.json().reply.message).toContain(
      "Support is available 24/7 via chat."
    );

    const wordpressResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "wordpress",
        config: {
          authToken: "wordpress_secret"
        }
      }
    });
    const wordpressChannel = wordpressResponse.json();

    const wordpressWebhookResponse = await adminInject({
      method: "POST",
      url: `/channels/${wordpressChannel.id}/webhook`,
      headers: {
        authorization: "Bearer wordpress_secret"
      },
      payload: {
        id: 987,
        content: "Please confirm if support is 24/7.",
        author_email: "wpuser@example.no"
      }
    });
    expect(wordpressWebhookResponse.statusCode).toBe(200);
    expect(wordpressWebhookResponse.json().reply.message).toContain(
      "Support is available 24/7 via chat."
    );
  });

  it("auto-creates a CRM ticket for low-confidence webhook chats and avoids duplicate dispatch", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Escalation Workspace",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Escalation Agent"
      }
    });
    const agent = agentResponse.json();

    const actionResponse = await adminInject({
      method: "POST",
      url: "/actions",
      payload: {
        agentId: agent.id,
        type: "human_escalation",
        config: {
          provider: "zendesk",
          defaultPriority: "high"
        }
      }
    });
    expect(actionResponse.statusCode).toBe(201);
    const action = actionResponse.json();

    const channelResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "slack",
        config: {
          authToken: "escalation_secret"
        }
      }
    });
    expect(channelResponse.statusCode).toBe(201);
    const channel = channelResponse.json();

    const firstResponse = await adminInject({
      method: "POST",
      url: `/channels/${channel.id}/webhook`,
      headers: {
        authorization: "Bearer escalation_secret"
      },
      payload: {
        type: "event_callback",
        event: {
          type: "message",
          text: "Can you answer this?",
          user: "U-ESC",
          ts: "1700000100.0001"
        }
      }
    });
    expect(firstResponse.statusCode).toBe(200);
    const firstBody = firstResponse.json();
    expect(firstBody.reply.shouldEscalate).toBe(true);
    expect(firstBody.reply.escalation.actionId).toBe(action.id);
    expect(firstBody.reply.escalation.output.ticket.provider).toBe("zendesk");

    const secondResponse = await adminInject({
      method: "POST",
      url: `/channels/${channel.id}/webhook`,
      headers: {
        authorization: "Bearer escalation_secret"
      },
      payload: {
        type: "event_callback",
        event: {
          type: "message",
          text: "Still need help",
          user: "U-ESC",
          thread_ts: "1700000100.0001",
          ts: "1700000100.0002"
        }
      }
    });
    expect(secondResponse.statusCode).toBe(200);
    const secondBody = secondResponse.json();
    expect(secondBody.conversationId).toBe(firstBody.conversationId);
    expect(secondBody.reply.shouldEscalate).toBe(true);
    expect(secondBody.reply.escalation).toBeUndefined();

    const metricsResponse = await adminInject({
      method: "GET",
      url: `/metrics/summary?agentId=${agent.id}`
    });
    expect(metricsResponse.statusCode).toBe(200);
    const summary = metricsResponse.json();
    expect(summary.totals.actions).toBe(1);
    expect(summary.totals.escalated).toBe(1);
  });

  it("does not auto-escalate when confidence is high", async () => {
    const { agent } = await seedAgentWithText(
      "High Confidence Workspace",
      "Returns are accepted within 30 days with proof of purchase."
    );

    const actionResponse = await adminInject({
      method: "POST",
      url: "/actions",
      payload: {
        agentId: agent.id,
        type: "human_escalation",
        config: {
          provider: "zendesk",
          defaultPriority: "high"
        }
      }
    });
    expect(actionResponse.statusCode).toBe(201);

    const channelResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "slack",
        config: {
          authToken: "no_escalation_secret"
        }
      }
    });
    expect(channelResponse.statusCode).toBe(201);
    const channel = channelResponse.json();

    const messageResponse = await adminInject({
      method: "POST",
      url: `/channels/${channel.id}/webhook`,
      headers: {
        authorization: "Bearer no_escalation_secret"
      },
      payload: {
        type: "event_callback",
        event: {
          type: "message",
          text: "Returns are accepted within 30 days with proof of purchase?",
          user: "U-HIGH",
          ts: "1700000200.0001"
        }
      }
    });
    expect(messageResponse.statusCode).toBe(200);
    const body = messageResponse.json();
    expect(body.reply.shouldEscalate).toBe(false);
    expect(body.reply.escalation).toBeUndefined();

    const metricsResponse = await adminInject({
      method: "GET",
      url: `/metrics/summary?agentId=${agent.id}`
    });
    expect(metricsResponse.statusCode).toBe(200);
    const summary = metricsResponse.json();
    expect(summary.totals.actions).toBe(0);
    expect(summary.totals.escalated).toBe(0);
  });

  it("aggregates metrics events into summary and conversation review", async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Oslo Metrics",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Metrics Agent"
      }
    });
    const agent = agentResponse.json();

    const channelResponse = await adminInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "web_widget",
        config: {
          allowedDomains: ["metrics.example.no"]
        }
      }
    });
    const channel = channelResponse.json();

    const conversationOneResponse = await adminInject({
      method: "POST",
      url: "/conversations",
      payload: {
        agentId: agent.id,
        channelId: channel.id,
        userId: "user_1"
      }
    });
    const conversationOne = conversationOneResponse.json();

    const conversationTwoResponse = await adminInject({
      method: "POST",
      url: "/conversations",
      payload: {
        agentId: agent.id,
        channelId: channel.id,
        userId: "user_2"
      }
    });
    const conversationTwo = conversationTwoResponse.json();

    const start = new Date("2025-01-01T10:00:00.000Z");
    const addSeconds = (seconds: number) =>
      new Date(start.getTime() + seconds * 1000).toISOString();

    const metricsResponse = await adminInject({
      method: "POST",
      url: "/metrics/events",
      payload: {
        events: [
          {
            type: "conversation_started",
            agentId: agent.id,
            channelId: channel.id,
            conversationId: conversationOne.id,
            timestamp: start.toISOString()
          },
          {
            type: "message_sent",
            agentId: agent.id,
            channelId: channel.id,
            conversationId: conversationOne.id,
            timestamp: addSeconds(30),
            metadata: { role: "assistant" }
          },
          {
            type: "retrieval_performed",
            agentId: agent.id,
            channelId: channel.id,
            timestamp: addSeconds(35),
            metadata: { latencyMs: 120, resultCount: 3 }
          },
          {
            type: "feedback_received",
            agentId: agent.id,
            conversationId: conversationOne.id,
            timestamp: addSeconds(60),
            metadata: { rating: 5 }
          },
          {
            type: "conversation_resolved",
            agentId: agent.id,
            channelId: channel.id,
            conversationId: conversationOne.id,
            timestamp: addSeconds(120),
            metadata: { intent: "returns" }
          },
          {
            type: "conversation_started",
            agentId: agent.id,
            channelId: channel.id,
            conversationId: conversationTwo.id,
            timestamp: addSeconds(200)
          },
          {
            type: "conversation_escalated",
            agentId: agent.id,
            channelId: channel.id,
            conversationId: conversationTwo.id,
            timestamp: addSeconds(260),
            metadata: { intent: "billing" }
          }
        ]
      }
    });
    expect(metricsResponse.statusCode).toBe(201);

    const summaryResponse = await adminInject({
      method: "GET",
      url: `/metrics/summary?agentId=${agent.id}&from=${start.toISOString()}&to=${addSeconds(
        600
      )}`
    });
    expect(summaryResponse.statusCode).toBe(200);
    const summary = summaryResponse.json();
    expect(summary.totals.conversations).toBe(2);
    expect(summary.totals.deflected).toBe(1);
    expect(summary.totals.escalated).toBe(1);
    expect(summary.rates.deflectionRate).toBeCloseTo(0.5, 3);
    expect(summary.rates.avgFirstResponseSeconds).toBeCloseTo(30, 3);
    expect(summary.rates.avgResolutionSeconds).toBeCloseTo(90, 3);
    expect(summary.rates.avgRetrievalLatencyMs).toBeCloseTo(120, 3);
    expect(summary.rates.avgFeedbackRating).toBeCloseTo(5, 3);
    expect(summary.topIntents.map((item: { intent: string }) => item.intent)).toContain(
      "returns"
    );

    const conversationsResponse = await adminInject({
      method: "GET",
      url: `/metrics/conversations?agentId=${agent.id}&from=${start.toISOString()}&to=${addSeconds(
        600
      )}`
    });
    expect(conversationsResponse.statusCode).toBe(200);
    const conversations = conversationsResponse.json();
    expect(conversations.items).toHaveLength(2);
    const deflected = conversations.items.find(
      (item: { conversationId: string }) => item.conversationId === conversationOne.id
    );
    const escalated = conversations.items.find(
      (item: { conversationId: string }) => item.conversationId === conversationTwo.id
    );
    expect(deflected.status).toBe("closed");
    expect(deflected.firstResponseSeconds).toBeCloseTo(30, 3);
    expect(deflected.resolutionSeconds).toBeCloseTo(120, 3);
    expect(escalated.status).toBe("escalated");
    expect(escalated.resolutionSeconds).toBeCloseTo(60, 3);
  });

  it("enforces RBAC for GDPR retention and records audit events", async () => {
    const ownerId = "user_owner";
    const viewerId = "user_viewer";
    const ownerInject = (options: InjectOptions) =>
      injectAs(ownerId, options);
    const viewerInject = (options: InjectOptions) =>
      injectAs(viewerId, options);

    const tenantResponse = await ownerInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "GDPR Tenant",
        region: "no"
      }
    });
    expect(tenantResponse.statusCode).toBe(201);
    const tenant = tenantResponse.json();

    const memberResponse = await ownerInject({
      method: "POST",
      url: `/tenants/${tenant.id}/members`,
      payload: {
        userId: viewerId,
        role: "viewer"
      }
    });
    expect(memberResponse.statusCode).toBe(201);

    const retentionDenied = await viewerInject({
      method: "PUT",
      url: `/tenants/${tenant.id}/gdpr/retention`,
      payload: {
        days: 0,
        enabled: true
      }
    });
    expect(retentionDenied.statusCode).toBe(403);

    const retentionResponse = await ownerInject({
      method: "PUT",
      url: `/tenants/${tenant.id}/gdpr/retention`,
      payload: {
        days: 0,
        enabled: true
      }
    });
    expect(retentionResponse.statusCode).toBe(200);
    expect(retentionResponse.json().policy.days).toBe(0);

    const agentResponse = await ownerInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "GDPR Agent"
      }
    });
    const agent = agentResponse.json();

    const channelResponse = await ownerInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "web_widget",
        config: { allowedDomains: ["gdpr.example.no"] }
      }
    });
    const channel = channelResponse.json();

    const conversationResponse = await ownerInject({
      method: "POST",
      url: "/conversations",
      payload: {
        agentId: agent.id,
        channelId: channel.id,
        userId: "customer_1"
      }
    });
    expect(conversationResponse.statusCode).toBe(201);

    const listResponse = await ownerInject({
      method: "GET",
      url: `/conversations?agentId=${agent.id}`
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items).toHaveLength(0);

    const auditResponse = await ownerInject({
      method: "GET",
      url: `/tenants/${tenant.id}/audit-logs`
    });
    expect(auditResponse.statusCode).toBe(200);
    const auditActions = auditResponse.json().items.map(
      (item: { action: string }) => item.action
    );
    expect(auditActions).toContain("retention.updated");
    expect(auditActions).toContain("retention.purged");
  });

  it("deletes conversation data on GDPR deletion requests", async () => {
    const ownerId = "user_owner_delete";
    const ownerInject = (options: InjectOptions) =>
      injectAs(ownerId, options);

    const tenantResponse = await ownerInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Deletion Tenant",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await ownerInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Deletion Agent"
      }
    });
    const agent = agentResponse.json();

    const channelResponse = await ownerInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "web_widget",
        config: { allowedDomains: ["delete.example.no"] }
      }
    });
    const channel = channelResponse.json();

    const conversationResponse = await ownerInject({
      method: "POST",
      url: "/conversations",
      payload: {
        agentId: agent.id,
        channelId: channel.id,
        userId: "user_delete"
      }
    });
    expect(conversationResponse.statusCode).toBe(201);

    const deleteResponse = await ownerInject({
      method: "POST",
      url: `/tenants/${tenant.id}/gdpr/deletion-requests`,
      payload: {
        userId: "user_delete"
      }
    });
    expect(deleteResponse.statusCode).toBe(200);
    expect(deleteResponse.json().deletedConversations).toBe(1);

    const listResponse = await ownerInject({
      method: "GET",
      url: `/conversations?agentId=${agent.id}&userId=user_delete`
    });
    expect(listResponse.statusCode).toBe(200);
    expect(listResponse.json().items).toHaveLength(0);

    const auditResponse = await ownerInject({
      method: "GET",
      url: `/tenants/${tenant.id}/audit-logs`
    });
    expect(auditResponse.statusCode).toBe(200);
    const auditActions = auditResponse.json().items.map(
      (item: { action: string }) => item.action
    );
    expect(auditActions).toContain("gdpr.deletion_requested");
  });

  it("deletes vector chunks on GDPR deletion when deleteVectorData is true", async () => {
    const ownerId = "user_owner_gdpr_vector";
    const ownerInject = (options: InjectOptions) =>
      injectAs(ownerId, options);

    const tenantResponse = await ownerInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "GDPR Vector Tenant", region: "norway-oslo" }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await ownerInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "GDPR Vector Agent" }
    });
    const agent = agentResponse.json();

    const sourceResponse = await ownerInject({
      method: "POST",
      url: "/sources",
      payload: { agentId: agent.id, type: "text", value: "GDPR test source" }
    });
    const source = sourceResponse.json();

    const ingestResponse = await ownerInject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: { text: "GDPR vector chunk content for testing deletion." }
    });
    expect(ingestResponse.statusCode).toBe(201);

    // Verify chunks are retrievable before deletion
    const retrieveBefore = await ownerInject({
      method: "POST",
      url: "/retrieve",
      payload: { agentId: agent.id, query: "GDPR vector chunk", minScore: 0 }
    });
    expect(retrieveBefore.statusCode).toBe(200);
    expect(retrieveBefore.json().items.length).toBeGreaterThan(0);

    // Create a conversation for the deletion request
    const channelResponse = await ownerInject({
      method: "POST",
      url: "/channels",
      payload: {
        agentId: agent.id,
        type: "web_widget",
        config: { allowedDomains: ["gdpr-vec.example.no"] }
      }
    });
    const channel = channelResponse.json();

    await ownerInject({
      method: "POST",
      url: "/conversations",
      payload: { agentId: agent.id, channelId: channel.id, userId: "gdpr_user" }
    });

    // Delete with deleteVectorData flag
    const deleteResponse = await ownerInject({
      method: "POST",
      url: `/tenants/${tenant.id}/gdpr/deletion-requests`,
      payload: {
        userId: "gdpr_user",
        agentId: agent.id,
        deleteVectorData: true
      }
    });
    expect(deleteResponse.statusCode).toBe(200);
    const deleteResult = deleteResponse.json();
    expect(deleteResult.deletedConversations).toBe(1);
    expect(deleteResult.deletedChunks).toBeGreaterThan(0);

    // Verify chunks are gone after deletion
    const retrieveAfter = await ownerInject({
      method: "POST",
      url: "/retrieve",
      payload: { agentId: agent.id, query: "GDPR vector chunk", minScore: 0 }
    });
    expect(retrieveAfter.statusCode).toBe(200);
    expect(retrieveAfter.json().items).toHaveLength(0);
  });

  it("deletes vector chunks when a source is deleted", async () => {
    const ownerId = "user_owner_source_delete";
    const ownerInject = (options: InjectOptions) =>
      injectAs(ownerId, options);

    const tenantResponse = await ownerInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "Source Delete Tenant", region: "norway-oslo" }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await ownerInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "Source Delete Agent" }
    });
    const agent = agentResponse.json();

    const sourceResponse = await ownerInject({
      method: "POST",
      url: "/sources",
      payload: { agentId: agent.id, type: "text", value: "Source to delete" }
    });
    const source = sourceResponse.json();

    const ingestResponse = await ownerInject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: { text: "Content from the source that will be deleted." }
    });
    expect(ingestResponse.statusCode).toBe(201);

    // Verify chunks exist before source deletion
    const retrieveBefore = await ownerInject({
      method: "POST",
      url: "/retrieve",
      payload: { agentId: agent.id, query: "source that will be deleted", minScore: 0 }
    });
    expect(retrieveBefore.statusCode).toBe(200);
    expect(retrieveBefore.json().items.length).toBeGreaterThan(0);

    // Delete the source
    const deleteSourceResponse = await ownerInject({
      method: "DELETE",
      url: `/sources/${source.id}`
    });
    expect(deleteSourceResponse.statusCode).toBe(204);

    // Verify chunks are gone after source deletion
    const retrieveAfter = await ownerInject({
      method: "POST",
      url: "/retrieve",
      payload: { agentId: agent.id, query: "source that will be deleted", minScore: 0 }
    });
    expect(retrieveAfter.statusCode).toBe(200);
    expect(retrieveAfter.json().items).toHaveLength(0);
  });

  it("enforces tenant isolation for ingestion and retrieval endpoints", async () => {
    const ownerInject = (options: InjectOptions) =>
      injectAs("user_owner_isolation", options);
    const otherInject = (options: InjectOptions) =>
      injectAs("user_other_isolation", options);

    const ownerTenantResponse = await ownerInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Isolation Owner Tenant",
        region: "no"
      }
    });
    expect(ownerTenantResponse.statusCode).toBe(201);
    const ownerTenant = ownerTenantResponse.json();

    const ownerAgentResponse = await ownerInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: ownerTenant.id,
        name: "Isolation Owner Agent"
      }
    });
    expect(ownerAgentResponse.statusCode).toBe(201);
    const ownerAgent = ownerAgentResponse.json();

    const ownerSourceResponse = await ownerInject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: ownerAgent.id,
        type: "text",
        value: "Isolation source"
      }
    });
    expect(ownerSourceResponse.statusCode).toBe(201);
    const ownerSource = ownerSourceResponse.json();

    const ownerIngestResponse = await ownerInject({
      method: "POST",
      url: `/sources/${ownerSource.id}/ingest-text`,
      payload: {
        text: "Owner-only refund policy: 14 days."
      }
    });
    expect(ownerIngestResponse.statusCode).toBe(201);

    const ownerJobResponse = await ownerInject({
      method: "POST",
      url: "/sources/file",
      payload: {
        agentId: ownerAgent.id,
        filename: "owner.pdf",
        contentType: "application/pdf",
        sizeBytes: 1234
      }
    });
    expect(ownerJobResponse.statusCode).toBe(201);
    const ownerJob = ownerJobResponse.json().job;

    const otherTenantResponse = await otherInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Isolation Other Tenant",
        region: "no"
      }
    });
    expect(otherTenantResponse.statusCode).toBe(201);
    const otherTenant = otherTenantResponse.json();

    const otherAgentResponse = await otherInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: otherTenant.id,
        name: "Isolation Other Agent"
      }
    });
    expect(otherAgentResponse.statusCode).toBe(201);
    const otherAgent = otherAgentResponse.json();

    const crossTenantSourceCreate = await otherInject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: ownerAgent.id,
        type: "text",
        value: "Should fail"
      }
    });
    expect(crossTenantSourceCreate.statusCode).toBe(403);
    expect(crossTenantSourceCreate.json().error).toBe("tenant_access_denied");

    const crossTenantCrawlCreate = await otherInject({
      method: "POST",
      url: "/sources/crawl",
      payload: {
        agentId: ownerAgent.id,
        startUrls: ["https://example.no"],
        depthLimit: 1
      }
    });
    expect(crossTenantCrawlCreate.statusCode).toBe(403);
    expect(crossTenantCrawlCreate.json().error).toBe("tenant_access_denied");

    const crossTenantFileCreate = await otherInject({
      method: "POST",
      url: "/sources/file",
      payload: {
        agentId: ownerAgent.id,
        filename: "other.pdf",
        contentType: "application/pdf",
        sizeBytes: 100
      }
    });
    expect(crossTenantFileCreate.statusCode).toBe(403);
    expect(crossTenantFileCreate.json().error).toBe("tenant_access_denied");

    const crossTenantRetrieve = await otherInject({
      method: "POST",
      url: "/retrieve",
      payload: {
        agentId: ownerAgent.id,
        query: "refund policy"
      }
    });
    expect(crossTenantRetrieve.statusCode).toBe(403);
    expect(crossTenantRetrieve.json().error).toBe("tenant_access_denied");

    const crossTenantSourceList = await otherInject({
      method: "GET",
      url: `/sources?agentId=${ownerAgent.id}`
    });
    expect(crossTenantSourceList.statusCode).toBe(403);
    expect(crossTenantSourceList.json().error).toBe("tenant_access_denied");

    const crossTenantJobList = await otherInject({
      method: "GET",
      url: `/ingestion-jobs?agentId=${ownerAgent.id}`
    });
    expect(crossTenantJobList.statusCode).toBe(403);
    expect(crossTenantJobList.json().error).toBe("tenant_access_denied");

    const crossTenantJobGet = await otherInject({
      method: "GET",
      url: `/ingestion-jobs/${ownerJob.id}`
    });
    expect(crossTenantJobGet.statusCode).toBe(403);
    expect(crossTenantJobGet.json().error).toBe("tenant_access_denied");

    const crossTenantJobStatusUpdate = await otherInject({
      method: "POST",
      url: `/ingestion-jobs/${ownerJob.id}/status`,
      payload: {
        status: "processing"
      }
    });
    expect(crossTenantJobStatusUpdate.statusCode).toBe(403);
    expect(crossTenantJobStatusUpdate.json().error).toBe("tenant_access_denied");

    const crossTenantJobIngest = await otherInject({
      method: "POST",
      url: `/ingestion-jobs/${ownerJob.id}/ingest`,
      payload: {
        documents: [{ content: "Should not be ingested", metadata: { scope: "cross-tenant" } }]
      }
    });
    expect(crossTenantJobIngest.statusCode).toBe(403);
    expect(crossTenantJobIngest.json().error).toBe("tenant_access_denied");

    const sameTenantSourceCreate = await otherInject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: otherAgent.id,
        type: "text",
        value: "Other tenant source"
      }
    });
    expect(sameTenantSourceCreate.statusCode).toBe(201);
  });

  it("creates a Notion source with ingestion job and sync state", async () => {
    const tenantRes = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "Notion Tenant", region: "no" }
    });
    const tenant = tenantRes.json();

    const agentRes = await adminInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "Notion Agent" }
    });
    const agent = agentRes.json();

    // Create Notion source
    const notionRes = await adminInject({
      method: "POST",
      url: "/sources/notion",
      payload: {
        agentId: agent.id,
        workspaceId: "ws_abc123",
        accessToken: "ntn_test_token",
        pageIds: ["page1", "page2"],
        databaseIds: ["db1"],
        autoRetrain: true
      }
    });
    expect(notionRes.statusCode).toBe(201);
    const notionBody = notionRes.json();
    expect(notionBody.source.type).toBe("notion");
    expect(notionBody.source.config.workspaceId).toBe("ws_abc123");
    expect(notionBody.source.config.pageIds).toEqual(["page1", "page2"]);
    expect(notionBody.source.config.databaseIds).toEqual(["db1"]);
    expect(notionBody.source.config.autoRetrain).toBe(true);
    expect(notionBody.source.status).toBe("queued");
    expect(notionBody.job.kind).toBe("notion");
    expect(notionBody.job.status).toBe("queued");

    // Verify source appears in source list
    const sourceListRes = await adminInject({
      method: "GET",
      url: `/sources?agentId=${agent.id}`
    });
    expect(sourceListRes.statusCode).toBe(200);
    const sourceList = sourceListRes.json();
    const notionSources = sourceList.items.filter(
      (s: Record<string, unknown>) => s.type === "notion"
    );
    expect(notionSources.length).toBeGreaterThanOrEqual(1);
  });

  it("handles Notion webhook verification", async () => {
    const verifyRes = await server.inject({
      method: "POST",
      url: "/webhooks/notion",
      payload: { type: "verification" }
    });
    expect(verifyRes.statusCode).toBe(200);
    expect(verifyRes.json().status).toBe("verified");
  });

  it("triggers retrain on Notion webhook content change", async () => {
    const tenantRes = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "Notion Webhook Tenant", region: "no" }
    });
    const tenant = tenantRes.json();

    const agentRes = await adminInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "Notion Webhook Agent" }
    });
    const agent = agentRes.json();

    const notionRes = await adminInject({
      method: "POST",
      url: "/sources/notion",
      payload: {
        agentId: agent.id,
        workspaceId: "ws_webhook_test",
        accessToken: "ntn_token"
      }
    });
    expect(notionRes.statusCode).toBe(201);
    const notionSource = notionRes.json().source;

    // Trigger webhook by sourceId
    const webhookRes = await server.inject({
      method: "POST",
      url: "/webhooks/notion",
      payload: {
        sourceId: notionSource.id,
        type: "page_changed",
        pageId: "page_updated"
      }
    });
    expect(webhookRes.statusCode).toBe(200);
    const webhookBody = webhookRes.json();
    expect(webhookBody.status).toBe("retrain_triggered");
    expect(webhookBody.sources).toHaveLength(1);
    expect(webhookBody.sources[0].sourceId).toBe(notionSource.id);
    expect(webhookBody.sources[0].jobId).toBeDefined();

    // Verify the source status changed to processing
    const sourceListRes = await adminInject({
      method: "GET",
      url: `/sources?agentId=${agent.id}`
    });
    const updatedSource = sourceListRes.json().items.find(
      (s: Record<string, unknown>) => s.id === notionSource.id
    );
    expect(updatedSource.status).toBe("processing");
    expect(updatedSource.lastSyncedAt).toBeDefined();
  });

  it("triggers retrain on Notion webhook by workspaceId", async () => {
    const tenantRes = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "Notion WS Tenant", region: "no" }
    });
    const tenant = tenantRes.json();

    const agentRes = await adminInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "Notion WS Agent" }
    });
    const agent = agentRes.json();

    const wsId = "ws_lookup_test_" + Date.now();
    const notionRes = await adminInject({
      method: "POST",
      url: "/sources/notion",
      payload: {
        agentId: agent.id,
        workspaceId: wsId,
        accessToken: "ntn_token"
      }
    });
    expect(notionRes.statusCode).toBe(201);
    const notionSource = notionRes.json().source;

    // Trigger webhook by workspaceId
    const webhookRes = await server.inject({
      method: "POST",
      url: "/webhooks/notion",
      payload: {
        workspaceId: wsId,
        type: "database_changed",
        databaseId: "db_changed"
      }
    });
    expect(webhookRes.statusCode).toBe(200);
    const webhookBody = webhookRes.json();
    expect(webhookBody.status).toBe("retrain_triggered");
    expect(webhookBody.sources.length).toBeGreaterThanOrEqual(1);
    const triggered = webhookBody.sources.find(
      (s: Record<string, unknown>) => s.sourceId === notionSource.id
    );
    expect(triggered).toBeDefined();
  });

  it("returns 404 for Notion webhook with unknown source", async () => {
    const webhookRes = await server.inject({
      method: "POST",
      url: "/webhooks/notion",
      payload: {
        sourceId: "source_nonexistent",
        type: "page_changed"
      }
    });
    expect(webhookRes.statusCode).toBe(404);
    expect(webhookRes.json().error).toBe("notion_source_not_found");
  });

  it("sync-check identifies stale Notion sources for auto-retrain", async () => {
    const tenantRes = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "Notion Sync Tenant", region: "no" }
    });
    const tenant = tenantRes.json();

    const agentRes = await adminInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "Notion Sync Agent" }
    });
    const agent = agentRes.json();

    // Create Notion source with autoRetrain enabled
    const notionRes = await adminInject({
      method: "POST",
      url: "/sources/notion",
      payload: {
        agentId: agent.id,
        workspaceId: "ws_sync_check",
        accessToken: "ntn_token",
        autoRetrain: true
      }
    });
    expect(notionRes.statusCode).toBe(201);

    // Sync check when just created (should be up to date)
    const freshCheckRes = await adminInject({
      method: "POST",
      url: "/sources/notion/sync-check"
    });
    expect(freshCheckRes.statusCode).toBe(200);
    const freshCheck = freshCheckRes.json();
    // The source was just created so it should be up to date
    expect(freshCheck.upToDate.length).toBeGreaterThanOrEqual(1);
    expect(freshCheck.thresholdMs).toBe(24 * 60 * 60 * 1000);
  });

  it("rejects Notion source creation without required fields", async () => {
    const tenantRes = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "Notion Validation", region: "no" }
    });
    const tenant = tenantRes.json();

    const agentRes = await adminInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "Notion Val Agent" }
    });
    const agent = agentRes.json();

    // Missing workspaceId
    const noWorkspaceRes = await adminInject({
      method: "POST",
      url: "/sources/notion",
      payload: {
        agentId: agent.id,
        accessToken: "ntn_token"
      }
    });
    expect(noWorkspaceRes.statusCode).toBe(400);

    // Missing accessToken
    const noTokenRes = await adminInject({
      method: "POST",
      url: "/sources/notion",
      payload: {
        agentId: agent.id,
        workspaceId: "ws_no_token"
      }
    });
    expect(noTokenRes.statusCode).toBe(400);
  });

  it("rejects Notion source for nonexistent agent", async () => {
    const res = await adminInject({
      method: "POST",
      url: "/sources/notion",
      payload: {
        agentId: "agent_nonexistent",
        workspaceId: "ws_test",
        accessToken: "ntn_token"
      }
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("agent_not_found");
  });

  it("returns enriched source citations with URL and title for website source", async () => {
    const tenantRes = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "Citation Test Tenant", region: "no" }
    });
    const tenant = tenantRes.json();

    const agentRes = await adminInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "Citation Agent" }
    });
    const agent = agentRes.json();

    const sourceRes = await adminInject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: agent.id,
        type: "website",
        value: "https://example.no/hjelp"
      }
    });
    const source = sourceRes.json();

    await adminInject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: {
        text: "Vi tilbyr gratis retur innen 14 dager etter kjop. Kontakt kundeservice for returetiketter.",
        chunkSize: 10,
        chunkOverlap: 0
      }
    });

    const chatRes = await adminInject({
      method: "POST",
      url: "/chat",
      payload: { agentId: agent.id, message: "retur" }
    });

    expect(chatRes.statusCode).toBe(200);
    const body = chatRes.json();
    expect(body.sources.length).toBeGreaterThan(0);

    const citation = body.sources[0];
    expect(citation.chunkId).toMatch(/^chunk_/u);
    expect(citation.sourceId).toBe(source.id);
    expect(citation.sourceType).toBe("website");
    expect(citation.sourceUrl).toBe("https://example.no/hjelp");
    expect(citation.sourceTitle).toBe("https://example.no/hjelp");
    expect(citation.score).toBeGreaterThan(0);
    expect(citation.excerpt).toBeDefined();
    expect(typeof citation.excerpt).toBe("string");
  });

  it("enriches chunk metadata with source info during text ingestion", async () => {
    const tenantRes = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "Metadata Test Tenant", region: "no" }
    });
    const tenant = tenantRes.json();

    const agentRes = await adminInject({
      method: "POST",
      url: "/agents",
      payload: { tenantId: tenant.id, name: "Metadata Agent" }
    });
    const agent = agentRes.json();

    const sourceRes = await adminInject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: agent.id,
        type: "text",
        value: "billing-faq",
        config: { title: "Billing FAQ" }
      }
    });
    const source = sourceRes.json();

    const ingestRes = await adminInject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: {
        text: "Faktura sendes den forste i hver maned. Betaling forfaller innen 14 dager.",
        chunkSize: 8,
        chunkOverlap: 0
      }
    });

    expect(ingestRes.statusCode).toBe(201);
    const chunks = ingestRes.json().chunks;
    expect(chunks.length).toBeGreaterThan(0);

    const chunk = chunks[0];
    expect(chunk.metadata.sourceType).toBe("text");
    expect(chunk.metadata.sourceTitle).toBe("Billing FAQ");
    expect(chunk.metadata.sourceUrl).toBeUndefined();
  });

  it("includes source citation info in chat prompt labels", async () => {
    const tenantRes = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: { name: "Prompt Label Tenant", region: "no" }
    });
    const tenant = tenantRes.json();

    const agentRes = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Prompt Label Agent",
        basePrompt: "Du er en hjelpebot."
      }
    });
    const agent = agentRes.json();

    const sourceRes = await adminInject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: agent.id,
        type: "website",
        value: "https://docs.example.no/api"
      }
    });
    const source = sourceRes.json();

    await adminInject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: {
        text: "API-nokkelen finnes i innstillingene under konto-seksjonen.",
        chunkSize: 8,
        chunkOverlap: 0
      }
    });

    const chatRes = await adminInject({
      method: "POST",
      url: "/chat",
      payload: { agentId: agent.id, message: "API-nokkel" }
    });

    expect(chatRes.statusCode).toBe(200);
    const body = chatRes.json();
    // The prompt should use the source URL as the label
    expect(body.prompt).toContain("https://docs.example.no/api");
    // Should NOT contain the raw source ID in the prompt
    expect(body.prompt).not.toContain(source.id);
  });
});
