import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import { createApiClient } from "../api";

const baseUrl = "http://api.test";

describe("onboarding api client", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("creates a tenant and agent with the expected payloads", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "ok" })
    });

    const api = createApiClient(baseUrl);
    await api.createTenant({ name: "Nordic Care", region: "norway-oslo", plan: "starter" });
    await api.createAgent({ tenantId: "tenant_123", name: "Hanna" });

    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [, tenantOptions] = fetchMock.mock.calls[0];
    const [, agentOptions] = fetchMock.mock.calls[1];

    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/tenants`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/agents`);

    expect(tenantOptions?.method).toBe("POST");
    expect(agentOptions?.method).toBe("POST");

    expect(JSON.parse(tenantOptions?.body as string)).toMatchObject({
      name: "Nordic Care",
      region: "norway-oslo",
      plan: "starter"
    });
    expect(JSON.parse(agentOptions?.body as string)).toMatchObject({
      tenantId: "tenant_123",
      name: "Hanna"
    });
  });

  it("creates a crawl source and updates a channel", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ id: "ok" })
    });

    const api = createApiClient(baseUrl);
    await api.createCrawlSource({ agentId: "agent_123", startUrls: ["https://example.no"] });
    await api.updateChannel("channel_123", {
      config: { allowedDomains: ["support.nordiccare.no"] }
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(`${baseUrl}/sources/crawl`);
    expect(fetchMock.mock.calls[1][0]).toBe(`${baseUrl}/channels/channel_123`);

    expect(JSON.parse(fetchMock.mock.calls[0][1]?.body as string)).toMatchObject({
      agentId: "agent_123",
      startUrls: ["https://example.no"]
    });
    expect(fetchMock.mock.calls[1][1]?.method).toBe("PATCH");
  });

  it("ingests text snippets for a source", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ chunks: [] })
    });

    const api = createApiClient(baseUrl);
    await api.ingestText("source_456", {
      text: "Sample knowledge snippet",
      metadata: { title: "Returns" }
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `${baseUrl}/sources/source_456/ingest-text`,
      expect.objectContaining({ method: "POST" })
    );
    const [, options] = fetchMock.mock.calls[0];
    expect(JSON.parse(options?.body as string)).toMatchObject({
      text: "Sample knowledge snippet",
      metadata: { title: "Returns" }
    });
  });
});
