import { expect, test } from "@playwright/test";

const apiUserId = "user_admin";

type TenantResponse = {
  id: string;
  name: string;
  region: string;
};

type AgentResponse = {
  id: string;
  tenantId: string;
  name: string;
};

type SourceResponse = {
  id: string;
  agentId: string;
  type: string;
  status: string;
};

type ChannelResponse = {
  id: string;
  agentId: string;
  config?: {
    allowedDomains?: string[];
  };
  enabled: boolean;
};

test.describe("onboarding api-backed flow", () => {
  test("creates tenant, agent, source, and channel with persisted API outcomes", async ({
    page,
    request
  }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");

    await expect(
      page.getByRole("heading", { name: "Launch a fully trained support agent in minutes." })
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Create your workspace" })).toBeVisible();

    const continueButton = page.getByRole("button", { name: "Continue" });
    const [tenantCreateResponse] = await Promise.all([
      page.waitForResponse((response) => {
        const request = response.request();
        return (
          request.method() === "POST" &&
          response.url().endsWith("/tenants") &&
          response.status() === 201
        );
      }),
      continueButton.click()
    ]);
    const tenant = (await tenantCreateResponse.json()) as TenantResponse;
    const apiBaseUrl = new URL(tenantCreateResponse.url()).origin;

    expect(tenant.id).toMatch(/^tenant_/);
    expect(tenant.name).toBe("Nordic Care");
    expect(tenant.region).toBe("norway-oslo");
    await expect(page.getByText("Step 2 of 4")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Name your support agent" })).toBeVisible();

    const [agentCreateResponse] = await Promise.all([
      page.waitForResponse((response) => {
        const request = response.request();
        return (
          request.method() === "POST" &&
          response.url().endsWith("/agents") &&
          response.status() === 201
        );
      }),
      continueButton.click()
    ]);
    const agent = (await agentCreateResponse.json()) as AgentResponse;

    expect(agent.id).toMatch(/^agent_/);
    expect(agent.tenantId).toBe(tenant.id);
    expect(agent.name).toBe("Hanna");
    await expect(page.getByText("Step 3 of 4")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Add sources" })).toBeVisible();

    const [sourceCreateResponse, sourceIngestResponse] = await Promise.all([
      page.waitForResponse((response) => {
        const request = response.request();
        return (
          request.method() === "POST" &&
          new URL(response.url()).pathname === "/sources" &&
          response.status() === 201
        );
      }),
      page.waitForResponse((response) => {
        const request = response.request();
        return (
          request.method() === "POST" &&
          /\/sources\/source_[^/]+\/ingest-text$/.test(new URL(response.url()).pathname) &&
          response.status() === 201
        );
      }),
      page.getByRole("button", { name: "Add snippet source" }).click()
    ]);
    const source = (await sourceCreateResponse.json()) as SourceResponse;
    const sourceIngestion = (await sourceIngestResponse.json()) as { chunks: unknown[] };

    expect(source.id).toMatch(/^source_/);
    expect(source.agentId).toBe(agent.id);
    expect(source.type).toBe("text");
    expect(sourceIngestion.chunks.length).toBeGreaterThan(0);
    const sourceCard = page.locator(".source-card", { hasText: "Returns policy" });
    await expect(sourceCard).toBeVisible();
    await expect(sourceCard.getByText("ready")).toBeVisible();

    await continueButton.click();
    await expect(page.getByText("Step 4 of 4")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Deploy a web widget" })).toBeVisible();

    const [channelCreateResponse] = await Promise.all([
      page.waitForResponse((response) => {
        const request = response.request();
        return (
          request.method() === "POST" &&
          response.url().endsWith("/channels") &&
          response.status() === 201
        );
      }),
      page.getByRole("button", { name: "Deploy channel" }).click()
    ]);
    const channel = (await channelCreateResponse.json()) as ChannelResponse;

    expect(channel.id).toMatch(/^channel_/);
    expect(channel.agentId).toBe(agent.id);
    expect(channel.enabled).toBe(true);
    await expect(page.locator(".info-card code").first()).toContainText(channel.id);
    const allowlistChecklistItem = page.locator(".checklist-item", {
      has: page.getByText("Add allowed domain")
    });
    const snippetChecklistItem = page.locator(".checklist-item", {
      has: page.getByText("Install embed snippet")
    });
    await expect(allowlistChecklistItem).toContainText("done");
    await expect(snippetChecklistItem).toContainText("done");

    const authHeaders = { "x-user-id": apiUserId };
    const tenantsResponse = await request.get(`${apiBaseUrl}/tenants`, { headers: authHeaders });
    expect(tenantsResponse.ok()).toBeTruthy();
    const tenantsPayload = (await tenantsResponse.json()) as { items: TenantResponse[] };
    expect(tenantsPayload.items.some((item) => item.id === tenant.id)).toBeTruthy();

    const agentsResponse = await request.get(`${apiBaseUrl}/agents`, { headers: authHeaders });
    expect(agentsResponse.ok()).toBeTruthy();
    const agentsPayload = (await agentsResponse.json()) as { items: AgentResponse[] };
    expect(agentsPayload.items.some((item) => item.id === agent.id)).toBeTruthy();

    const sourcesResponse = await request.get(`${apiBaseUrl}/sources?agentId=${agent.id}`, {
      headers: authHeaders
    });
    expect(sourcesResponse.ok()).toBeTruthy();
    const sourcesPayload = (await sourcesResponse.json()) as { items: SourceResponse[] };
    expect(
      sourcesPayload.items.some((item) => item.id === source.id && item.status === "ready")
    ).toBeTruthy();

    const channelResponse = await request.get(`${apiBaseUrl}/channels/${channel.id}`, {
      headers: authHeaders
    });
    expect(channelResponse.ok()).toBeTruthy();
    const channelPayload = (await channelResponse.json()) as { channel: ChannelResponse };
    expect(channelPayload.channel.config).toMatchObject({
      allowedDomains: ["support.nordiccare.no"]
    });
  });
});
