# Task Breakdown

This document tracks the implementation tasks derived from the Chatbase competitor spec.

## Completed Tasks

1. Scaffold monorepo + tenancy model (API + web + worker + shared).
Why: Establish a shared, multi-tenant foundation so features can ship consistently across API, web, and worker surfaces.
Tests: Build and smoke coverage across the workspace confirms the scaffolded apps run and integrate cleanly.

2. Ingestion MVP: files + website crawl with job queue and status tracking.
Why: Reliable ingestion is required to populate knowledge bases and keep customer sources up to date.
Tests: API endpoint and ingestion job status tests validate queueing, state transitions, and error handling.

3. Knowledge base + retrieval service (chunking, embeddings, retrieval API; file/crawl chunk persistence for durable reuse + API ingestion job tests). Completed scope includes regional vector store persistence.
Why: Retrieval is the core of grounded answers, so durable chunk storage and embeddings are mandatory.
Tests: Retrieval API coverage plus ingestion-to-retrieval checks ensure chunk persistence and query correctness.

4. Agent runtime + chat API with streaming responses (orchestration + retrieval + streaming implemented and tested).
Why: Streaming chat is the primary user experience and must be reliable under load.
Tests: Streaming API tests confirm orchestration, retrieval integration, and incremental response delivery.

5. Web widget + help page deployment with domain allowlist enforcement. (High priority)
Why: The widget is the primary embed surface; the allowlist prevents unauthorized embeds and misuse.
Tests: Widget load + allowlist enforcement tests, plus help page smoke checks, validate the rollout.

6. Admin console onboarding flow (create agent → add sources → deploy widget).
Why: The guided flow wires the onboarding API integration so new customers can complete setup end-to-end.
Tests: `apps/web` onboarding API client tests validate tenant, agent, source, and channel request payloads.

## Planned Tasks

1. Retrieval hybrid/rerank + retrieval tests (accuracy + latency).
Why: Hybrid scoring and coverage tests close retrieval quality gaps and guard against regressions.
Tests: Retrieval accuracy cases plus latency benchmarks validate hybrid scoring and performance.

2. Actions framework and first integrations (CRM escalation, Slack notify, Stripe billing).
Why: Actions unlock operational workflows and revenue hooks beyond basic chat.
Tests: Integration contract tests validate payload shape and failure handling.

3. Multi-channel connectors (email, Slack, WhatsApp, Zendesk, Salesforce).
Why: Customers expect omnichannel coverage for support deflection.
Tests: Connector smoke tests ensure authentication and message routing work per channel.

4. Analytics and observability dashboards.
Why: Operators need visibility into deflection, response quality, and system health.
Tests: Metrics pipeline tests verify event capture and aggregation correctness.

5. GDPR controls (deletion, retention), RBAC, audit logging.
Why: Compliance and security are table stakes for EU customers.
Tests: Policy enforcement tests confirm data deletion, access controls, and audit trails.

6. Playwright visual tests for onboarding, widget, help page.
Why: Visual regressions on customer-facing flows are costly and hard to catch manually.
Tests: Playwright snapshots safeguard UI stability across releases.
