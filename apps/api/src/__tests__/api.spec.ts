import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
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

  it("creates and lists tenants", async () => {
    const createResponse = await server.inject({
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

    const listResponse = await server.inject({
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
    const tenantResponse = await server.inject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Bergen Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await server.inject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Shipping Agent"
      }
    });
    const agent = agentResponse.json();

    const sourceResponse = await server.inject({
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

    const retrainResponse = await server.inject({
      method: "POST",
      url: `/sources/${source.id}/retrain`
    });

    expect(retrainResponse.statusCode).toBe(200);
    const retrainBody = retrainResponse.json();
    expect(retrainBody.source.status).toBe("processing");
    expect(retrainBody.source.lastSyncedAt).toBeTypeOf("string");

    const deleteResponse = await server.inject({
      method: "DELETE",
      url: `/sources/${source.id}`
    });

    expect(deleteResponse.statusCode).toBe(204);
  });

  it("queues crawl ingestion job", async () => {
    const tenantResponse = await server.inject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Trondheim Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await server.inject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Onboarding Agent"
      }
    });
    const agent = agentResponse.json();

    const crawlResponse = await server.inject({
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
    const tenantResponse = await server.inject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Stavanger Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await server.inject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Docs Agent"
      }
    });
    const agent = agentResponse.json();

    const fileResponse = await server.inject({
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

    const listResponse = await server.inject({
      method: "GET",
      url: `/ingestion-jobs?sourceId=${fileBody.source.id}`
    });
    expect(listResponse.statusCode).toBe(200);
    const listBody = listResponse.json();
    expect(listBody.items.length).toBe(1);

    const jobResponse = await server.inject({
      method: "GET",
      url: `/ingestion-jobs/${fileBody.job.id}`
    });
    expect(jobResponse.statusCode).toBe(200);

    const processingResponse = await server.inject({
      method: "POST",
      url: `/ingestion-jobs/${fileBody.job.id}/status`,
      payload: { status: "processing" }
    });
    expect(processingResponse.statusCode).toBe(200);
    expect(processingResponse.json().job.status).toBe("processing");

    const completeResponse = await server.inject({
      method: "POST",
      url: `/ingestion-jobs/${fileBody.job.id}/status`,
      payload: { status: "complete" }
    });
    expect(completeResponse.statusCode).toBe(200);
    const completeBody = completeResponse.json();
    expect(completeBody.job.status).toBe("complete");
  });

  it("ingests text chunks and retrieves relevant content", async () => {
    const tenantResponse = await server.inject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Nordic Support",
        region: "norway-oslo"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await server.inject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "FAQ Agent"
      }
    });
    const agent = agentResponse.json();

    const sourceResponse = await server.inject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: agent.id,
        type: "text",
        value: "FAQ"
      }
    });
    const source = sourceResponse.json();

    const ingestResponse = await server.inject({
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

    const retrieveResponse = await server.inject({
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
    const tenantResponse = await server.inject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Tromso Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await server.inject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Pricing Agent"
      }
    });
    const agent = agentResponse.json();

    const fileResponse = await server.inject({
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

    const ingestResponse = await server.inject({
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

    const jobResponse = await server.inject({
      method: "GET",
      url: `/ingestion-jobs/${fileBody.job.id}`
    });
    expect(jobResponse.statusCode).toBe(200);
    expect(jobResponse.json().job.status).toBe("complete");

    const retrieveResponse = await server.inject({
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
    const tenantResponse = await server.inject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Kristiansand Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await server.inject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Crawl Agent"
      }
    });
    const agent = agentResponse.json();

    const crawlResponse = await server.inject({
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

    const ingestResponse = await server.inject({
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

    const retrieveResponse = await server.inject({
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
    const tenantResponse = await server.inject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Lillehammer Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await server.inject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Returns Agent",
        basePrompt: "Be helpful and cite sources."
      }
    });
    const agent = agentResponse.json();

    const sourceResponse = await server.inject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: agent.id,
        type: "text",
        value: "Returns FAQ"
      }
    });
    const source = sourceResponse.json();

    await server.inject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: {
        text: "Returns are accepted within 14 days with a receipt.",
        chunkSize: 6,
        chunkOverlap: 0
      }
    });

    const chatResponse = await server.inject({
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

    const streamResponse = await server.inject({
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

  it("creates widget channel and enforces domain allowlist", async () => {
    const tenantResponse = await server.inject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Fredrikstad Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await server.inject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Widget Agent"
      }
    });
    const agent = agentResponse.json();

    const channelResponse = await server.inject({
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

    const blockedResponse = await server.inject({
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

    const allowedResponse = await server.inject({
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

    const wildcardResponse = await server.inject({
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
    const tenantResponse = await server.inject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Drammen Support",
        region: "no"
      }
    });
    const tenant = tenantResponse.json();

    const agentResponse = await server.inject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Help Agent"
      }
    });
    const agent = agentResponse.json();

    const channelResponse = await server.inject({
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

    const widgetResponse = await server.inject({
      method: "GET",
      url: "/widget.js"
    });

    expect(widgetResponse.statusCode).toBe(200);
    expect(widgetResponse.headers["content-type"]).toContain("application/javascript");
    expect(widgetResponse.body).toContain("createWidget");

    const helpResponse = await server.inject({
      method: "GET",
      url: `/help/${channel.id}`
    });

    expect(helpResponse.statusCode).toBe(200);
    expect(helpResponse.headers["content-type"]).toContain("text/html");
    expect(helpResponse.body).toContain(channel.id);
  });
});
