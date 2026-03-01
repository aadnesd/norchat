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

7. Retrieval hybrid/rerank (hybrid scoring + rerank).
Why: Hybrid scoring improves recall and relevance, while reranking stabilizes top results for grounded answers.
Tests: Retrieval hybrid scoring + rerank cases cover scoring blend correctness and result ordering.

8. Retrieval tests: accuracy + latency.
Why: Accuracy and latency tests catch regressions and keep retrieval quality within performance targets.
Tests: Retrieval accuracy fixtures and latency benchmarks validate quality and response time.

9. Actions framework and first integrations (CRM escalation, Slack notify, Stripe billing).
Why: Actions unlock operational workflows and revenue hooks beyond basic chat.
Tests: API action endpoint contract coverage plus execution flow tests validate payloads, dispatch, and failure handling.

10. Conversation API scaffolding (Conversation includes optional `user_id`).
Why: Conversation history is required for operators and customers to review past interactions, and the spec mismatch requires optional `user_id` support on Conversation.
Tests: Conversation list/create endpoint tests cover validation, defaults (including optional `user_id`), and pagination.

11. Multi-channel connectors (email, Slack, WhatsApp, Zendesk, Salesforce). (High priority)
Why: Customers expect omnichannel coverage for support deflection, and the platform must ingest + route all listed channels.
Tests: Connector smoke tests ensure authentication, webhook ingestion, and message routing work per channel. Tests run: `npm run test -w apps/api`. Build run: `npm run build`.

12. Analytics + observability dashboards (metrics endpoints, dashboard UI, conversation review).
Why: Operators need visibility into deflection, response quality, and system health.
Tests: `npm run test -w apps/api`, `npm run test -w apps/web`.

13. GDPR controls (deletion, retention), RBAC, audit logging.
Why: Compliance and security are table stakes for EU customers.
Tests: API coverage in `apps/api/src/__tests__/api.spec.ts` validates deletion, retention enforcement, RBAC gates, and audit logging events.

14. Playwright visual snapshots for onboarding, widget, and help page are unblocked and completed.
Why: Visual regressions on customer-facing flows are costly and hard to catch manually, so stable baselines are required in CI.
Tests: `npm run e2e -w apps/web -- --update-snapshots` regenerated baselines and `npm run e2e -w apps/web` verifies the snapshot suite against the Vite-backed Playwright harness.

15. GDPR retention purge now applies to `/conversations` listing results.
Why: Listing stale conversations after retention expiry is a GDPR/compliance risk and can expose data that should no longer be visible.
Tests: Conversation retention coverage in `apps/api/src/__tests__/api.spec.ts` (including the prior failing list case around line ~1486) now passes with zero stale rows returned when retention requires purge.

16. Gap: tenant isolation on ingestion/retrieval endpoints is now enforced and closed.
Why: Strict tenant-bound authorization/scoping is required to prevent cross-tenant data exposure and preserve multi-tenant data integrity.
Tests: API integration coverage verifies cross-tenant ingestion create/status and retrieval requests are rejected, while same-tenant requests succeed.
Implementation outcome: Ingestion and retrieval endpoints now consistently enforce tenant isolation, closing the previously tracked gap.

17. Gap: low-confidence escalation now auto-creates CRM ticket from chat runtime. (Highest priority)
Why: Spec acceptance requires low-confidence responses to trigger an immediate CRM handoff so unresolved chats are not dropped.
Tests: Runtime confidence-threshold escalation tests validate single ticket dispatch with conversation context; API/integration coverage verifies CRM ticket creation on low-confidence flows and no ticket creation on high-confidence flows.
Implementation outcome: Chat runtime now automatically escalates low-confidence responses by creating one CRM ticket per qualifying conversation with idempotent dispatch safeguards.

18. Gap: extend connector webhook support (Messenger, Instagram, Shopify, Zapier, WordPress). (Highest priority)
Why: Add inbound webhook handling + normalized event mapping for the remaining channels so message ingestion/routing works consistently across all listed connectors.
Tests: Per-connector webhook contract tests cover signature verification and payload normalization, and routing integration tests assert inbound events create/send messages on the correct tenant conversation.
Implementation outcome: Connector webhook support now verifies platform-specific webhooks, normalizes inbound events, and routes messages across Messenger, Instagram, Shopify, Zapier, and WordPress within tenant-scoped conversations.

## Planned Tasks

No remaining planned tasks as of 2026-03-01.
