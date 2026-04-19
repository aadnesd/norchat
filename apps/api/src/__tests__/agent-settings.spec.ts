import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { FastifyInstance } from "fastify";
import type { InjectOptions } from "light-my-request";
import { buildServer } from "../index.js";

describe("agent settings flow", () => {
  let server: FastifyInstance;
  let vectorStoreDir: string;
  let runtimeStoreDir: string;

  beforeAll(async () => {
    vectorStoreDir = await mkdtemp(path.join(tmpdir(), "vector-store-agent-settings-"));
    runtimeStoreDir = await mkdtemp(path.join(tmpdir(), "runtime-store-agent-settings-"));
    process.env.VECTOR_STORE_DIR = vectorStoreDir;
    process.env.RUNTIME_STORE_DIR = runtimeStoreDir;
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
    if (vectorStoreDir) {
      await rm(vectorStoreDir, { recursive: true, force: true });
    }
    if (runtimeStoreDir) {
      await rm(runtimeStoreDir, { recursive: true, force: true });
    }
    delete process.env.VECTOR_STORE_DIR;
    delete process.env.RUNTIME_STORE_DIR;
  });

  const injectAs = (userId: string, options: InjectOptions) =>
    server.inject({
      ...options,
      headers: {
        ...options.headers,
        "x-user-id": userId
      }
    });

  const adminInject = (options: InjectOptions) => injectAs("user_admin", options);

  const createTenantAndAgent = async () => {
    const tenantResponse = await adminInject({
      method: "POST",
      url: "/tenants",
      payload: {
        name: "Settings Tenant",
        region: "no"
      }
    });
    expect(tenantResponse.statusCode).toBe(201);
    const tenant = tenantResponse.json();

    const agentResponse = await adminInject({
      method: "POST",
      url: "/agents",
      payload: {
        tenantId: tenant.id,
        name: "Settings Agent"
      }
    });
    expect(agentResponse.statusCode).toBe(201);
    const agent = agentResponse.json();

    return { tenant, agent };
  };

  it("updates prompt, model, and retrieval settings with tenant authorization", async () => {
    const { agent } = await createTenantAndAgent();

    const updateResponse = await adminInject({
      method: "PATCH",
      url: `/agents/${agent.id}`,
      payload: {
        basePrompt: "Answer in Norwegian first, then English if requested.",
        model: "gpt-4.1",
        retrievalConfig: {
          minScore: 0.35,
          maxResults: 3
        }
      }
    });

    expect(updateResponse.statusCode).toBe(200);
    const updated = updateResponse.json().agent;
    expect(updated.basePrompt).toContain("Norwegian");
    expect(updated.model).toBe("gpt-4.1");
    expect(updated.retrievalConfig).toEqual({
      minScore: 0.35,
      maxResults: 3
    });

    const listResponse = await adminInject({
      method: "GET",
      url: "/agents"
    });
    expect(listResponse.statusCode).toBe(200);
    const listed = listResponse
      .json()
      .items.find((item: { id: string }) => item.id === agent.id);
    expect(listed.retrievalConfig).toEqual({
      minScore: 0.35,
      maxResults: 3
    });

    const unauthorized = await injectAs("user_other", {
      method: "PATCH",
      url: `/agents/${agent.id}`,
      payload: {
        model: "gpt-4o-mini"
      }
    });
    expect(unauthorized.statusCode).toBe(403);
  });

  it("rejects invalid settings updates", async () => {
    const { agent } = await createTenantAndAgent();

    const invalidRangeResponse = await adminInject({
      method: "PATCH",
      url: `/agents/${agent.id}`,
      payload: {
        retrievalConfig: {
          minScore: 1.4,
          maxResults: 50
        }
      }
    });

    expect(invalidRangeResponse.statusCode).toBe(400);
    expect(invalidRangeResponse.json().error).toBe("invalid_agent_settings");
  });

  it("uses saved retrieval maxResults in chat runtime by default", async () => {
    const { agent } = await createTenantAndAgent();

    const createSourceResponse = await adminInject({
      method: "POST",
      url: "/sources",
      payload: {
        agentId: agent.id,
        type: "text",
        value: "Refund policy"
      }
    });
    expect(createSourceResponse.statusCode).toBe(201);
    const source = createSourceResponse.json();

    const ingestResponse = await adminInject({
      method: "POST",
      url: `/sources/${source.id}/ingest-text`,
      payload: {
        text: "Refund policy is available within thirty days with receipt. Refund policy applies to online orders and store purchases alike.",
        chunkSize: 5,
        chunkOverlap: 0
      }
    });
    expect(ingestResponse.statusCode).toBe(201);

    const updateResponse = await adminInject({
      method: "PATCH",
      url: `/agents/${agent.id}`,
      payload: {
        retrievalConfig: {
          minScore: 0,
          maxResults: 1
        }
      }
    });
    expect(updateResponse.statusCode).toBe(200);

    const defaultChatResponse = await adminInject({
      method: "POST",
      url: "/chat",
      payload: {
        agentId: agent.id,
        message: "What is the refund policy?"
      }
    });
    expect(defaultChatResponse.statusCode).toBe(200);
    expect(defaultChatResponse.json().sources).toHaveLength(1);

    const overrideChatResponse = await adminInject({
      method: "POST",
      url: "/chat",
      payload: {
        agentId: agent.id,
        message: "What is the refund policy?",
        maxResults: 3,
        minScore: 0
      }
    });
    expect(overrideChatResponse.statusCode).toBe(200);
    expect(overrideChatResponse.json().sources.length).toBeGreaterThan(1);

    const retrieveResponse = await adminInject({
      method: "POST",
      url: "/retrieve",
      payload: {
        agentId: agent.id,
        query: "refund policy"
      }
    });
    expect(retrieveResponse.statusCode).toBe(200);
    expect(retrieveResponse.json().items.length).toBe(1);
  });
});
