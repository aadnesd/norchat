# Implementation Plan

## Checklist
- [ ] Step 1: Project scaffolding and tenancy model
- [ ] Step 2: Ingestion pipeline MVP (files + website crawl)
- [ ] Step 3: Knowledge base + retrieval service
- [ ] Step 4: Agent runtime + chat API (streaming)
- [ ] Step 5: Web widget + help page deployment
- [ ] Step 6: Admin console onboarding flow
- [ ] Step 7: Actions framework + first integrations
- [ ] Step 8: Multi-channel connectors
- [ ] Step 9: Analytics + observability
- [ ] Step 10: Security, compliance, and data controls
- [ ] Step 11: E2E + Playwright visual testing
- [ ] Step 12: Beta readiness + acceptance validation

## Step 1: Project scaffolding and tenancy model
- Objective: Establish core service boundaries and tenant isolation.
- Implementation guidance: Create tenant, user, agent data models and API skeletons; add workspace/role scaffolding.
- Test requirements: Unit tests for model constraints and tenant scoping.
- Integration notes: Ensure all future services receive tenant_id in requests.
- Demo: Create a tenant and agent via API.

## Step 2: Ingestion pipeline MVP (files + website crawl)
- Objective: Ingest basic sources fast for first-time setup.
- Implementation guidance: Build file upload + crawler with include/exclude and sitemap; queue ingestion jobs.
- Test requirements: Unit tests for parser/crawler; integration test for end-to-end ingestion job.
- Integration notes: Store source metadata and ingestion status for UI.
- Demo: Add a URL and PDF; verify sources appear and are processed.

## Step 3: Knowledge base + retrieval service
- Objective: Provide reliable retrieval for agent answers.
- Implementation guidance: Implement chunking, embeddings, vector store; add retrieval API.
- Test requirements: Retrieval accuracy tests with known queries; latency benchmarks.
- Integration notes: Ingestion writes chunks + embeddings, runtime reads from retrieval.
- Demo: Query retrieval API and get relevant sources.

## Step 4: Agent runtime + chat API (streaming)
- Objective: Deliver chat responses with context and sources.
- Implementation guidance: Build chat orchestration, prompt templates, streaming responses, fallback on low confidence.
- Test requirements: Unit tests for prompt builders; integration test for streaming chat.
- Integration notes: Connect to retrieval and logging.
- Demo: Chat with agent and receive streamed response.

## Step 5: Web widget + help page deployment
- Objective: Provide first customer-facing channel with fast setup.
- Implementation guidance: JS embed for widget, hosted help page, domain allowlist.
- Test requirements: UI tests for widget loading; manual smoke tests.
- Integration notes: Widget uses chat API; help page uses same agent config.
- Demo: Embed widget on test site and see responses.

## Step 6: Admin console onboarding flow
- Objective: 10-minute setup flow for new customers.
- Implementation guidance: Wizard for creating agent, adding sources, launching widget.
- Test requirements: Playwright visual tests for onboarding steps.
- Integration notes: Call ingestion and channel APIs.
- Demo: Walkthrough: create agent → ingest → deploy.

## Step 7: Actions framework + first integrations
- Objective: Enable agent to perform tasks and escalations.
- Implementation guidance: Build action registry, execution sandbox, and CRM ticket creation.
- Test requirements: Unit tests for action validation; integration tests for ticket creation.
- Integration notes: Action invocation from runtime.
- Demo: Escalate to human creates a ticket.

## Step 8: Multi-channel connectors
- Objective: Expand to email, Slack, WhatsApp, Zendesk, Salesforce.
- Implementation guidance: Implement channel gateways with shared auth and webhook handling.
- Test requirements: Integration tests with sandbox environments.
- Integration notes: Reuse runtime and logging.
- Demo: Slack channel can query agent.

## Step 9: Analytics + observability
- Objective: Provide usage insights and performance tracking.
- Implementation guidance: Build metrics collection, dashboards, and conversation review UI.
- Test requirements: Unit tests for metrics aggregation.
- Integration notes: Ensure logs from runtime + channels are unified.
- Demo: View deflection rate and top intents.

## Step 10: Security, compliance, and data controls
- Objective: GDPR-ready controls and enterprise features.
- Implementation guidance: Data deletion, retention policies, role-based access, audit logging.
- Test requirements: Security tests for data isolation and deletion verification.
- Integration notes: Enforce policies across all data stores.
- Demo: Trigger data deletion request and confirm removal.

## Step 11: E2E + Playwright visual testing
- Objective: Validate UI flows and regressions.
- Implementation guidance: Add Playwright test suite for onboarding, widget, and help page.
- Test requirements: Visual diffs for key screens; smoke tests in CI.
- Integration notes: Use stable test fixtures and seeded data.
- Demo: CI run shows passing visual tests.

## Step 12: Beta readiness + acceptance validation
- Objective: Validate acceptance criteria and prepare pilot launch.
- Implementation guidance: Run acceptance checklist, fix gaps, document onboarding.
- Test requirements: Full acceptance run (Given-When-Then).
- Integration notes: Verify integrations and data sources.
- Demo: Pilot customer can onboard and deploy in < 10 minutes.
