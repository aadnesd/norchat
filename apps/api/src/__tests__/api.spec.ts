import { describe, expect, it, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../index.js";

describe("api routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
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
});
