# Implementation Status & Backlog Assessment

**Date:** 2026-03-05  
**Owner:** Morpheus (Lead)  
**Scope:** Current implementation snapshot and high-value missing backlog items.

---

## Current Implementation Status

### API (`apps/api`)
- **Status:** High maturity
- **Coverage:** 46 API tests passing; full tenant/agent/source/chat/retrieval stack live
- **Key deliverables:** Tenancy model, multi-source ingestion (file/website/Notion), vector retrieval, chat streaming, widget embed, actions framework (Stripe), GDPR controls, audit/metrics persistence, CRM escalation, multi-channel connectors (email, Slack, WhatsApp, Zendesk, Salesforce, Messenger, Instagram, Shopify, Zapier, WordPress)
- **Known gaps:** None critical; runtime state capacity hardcoded (issue #1)

### Worker (`apps/worker`)
- **Status:** Scaffolded, minimal heartbeat
- **Coverage:** 4 unit tests; basic poll-loop structure
- **Key deliverables:** Polling framework with configurable interval, ESM entrypoint
- **Known gaps:** No queue/job processing; no integration with API runtime; no persistence or retry logic

### Web (`apps/web`)
- **Status:** Beta-ready onboarding UI
- **Coverage:** 3 tests for onboarding API integration; Playwright E2E for create-tenant-to-deploy workflow; visual snapshots
- **Key deliverables:** Onboarding flow (tenant → agent → source → channel), shadcn UI primitives, API client with auth headers, widget help page
- **Known gaps:** Analytics dashboard stub missing; admin console beyond onboarding not built; multi-step form error recovery UI

### Shared (`packages/shared`)
- **Status:** Type definitions only
- **Coverage:** No tests (type-checked via TS)
- **Key deliverables:** Tenant, Agent, Source, Channel, Conversation, Action schemas; Notion webhook types; API error contracts
- **Known gaps:** No shared utilities (logging, metrics client, error handling); no run-time validation helpers

### QA
- **Status:** Gated at CI level
- **Coverage:** 96 API tests, 7 web tests, 4 worker tests (107 total); lint + build in CI
- **Key deliverables:** CI workflow (lint/test/build), Playwright E2E for onboarding, beta acceptance runbook
- **Known gaps:** No performance benchmarks; no load/chaos testing; no monitoring/alerting setup docs

---

## High-Value Missing Backlog Items

### 1. Worker Queue Runtime & Async Job Processing

**Title:** Implement worker queue processor with durable job state  
**Scope:** Build the worker as a proper job queue consumer that picks up ingestion/retrain/action tasks from a durable work queue and applies backpressure when processing falls behind.  
**Acceptance Criteria:**
- Worker reads job queue from shared runtime state (file or Redis stub)
- Processes one job at a time with configurable concurrency (default: 1)
- Updates job status (queued → processing → done/failed) in persistent store
- Implements exponential backoff on transient failures; hard fails after max retries
- Logs job lifecycle (start, progress, completion) to observability endpoint
- Reachable via `npm run dev -w apps/worker` and includes test coverage for queue processing

**Owner Role:** Backend Lead  
**Priority:** P1 (blocks ingestion SLA enforcement and async action execution)

---

### 2. Analytics & Observability Dashboard

**Title:** Build analytics dashboard for conversations, deflection, and agent quality metrics  
**Scope:** Add a `/analytics` endpoint that returns time-series metrics (conversation count, avg resolution time, confidence distribution, escalation rate by agent/source). Build a corresponding dashboard tab in the web app showing trends and filters by agent/date range.  
**Acceptance Criteria:**
- API `/analytics/metrics` endpoint returns aggregated counts + percentiles (30/50/90/99) for chat latency, confidence, and escalation rate
- Dashboard UI tab displays line chart (conversations/day), histogram (confidence), and heatmap (escalation by agent)
- Metrics are computed from durable audit/metrics state (no real-time DB required)
- Filters work for agent, date range, and source type
- Endpoint requires `x-user-id` and respects tenant isolation

**Owner Role:** Full-stack Engineer  
**Priority:** P1 (required for operator visibility into bot performance and compliance)

---

### 3. Admin Console: Agent Configuration & Prompt Management

**Title:** Build admin UI for managing agent base prompts, model selection, and retrieval parameters  
**Scope:** Add admin form pages allowing operators to edit agent metadata (name, model, base prompt), retrieval settings (chunk size, top-k, rerank threshold), and escalation confidence thresholds—all persisted to API.  
**Acceptance Criteria:**
- Web app includes `/admin/agents/:agentId/edit` page with form for agent metadata + retrieval config
- POST `/agents/:agentId` accepts `model`, `basePrompt`, `retrievalConfig` fields (new optional fields)
- Form includes preview of how prompt template will render with sample context
- Changes persist immediately; API validates field types and ranges
- Form includes success/error toast notifications
- Page requires write permission (operationally enforced via token scoping, noted in docs)

**Owner Role:** Full-stack Engineer  
**Priority:** P1 (blocks ops from tuning agent behavior post-launch)

---

### 4. Load Testing & Performance Benchmarks

**Title:** Define and measure ingestion/chat latency and throughput SLOs  
**Scope:** Add a load test harness that simulates concurrent chat requests, ingestion jobs, and webhook events. Measure p50/p99 latencies and define operational SLOs (e.g., chat streaming response <200ms, ingestion job done <5min for <100MB).  
**Acceptance Criteria:**
- Load test script in `scripts/load-test.ts` can spawn N concurrent chat clients and M concurrent ingestion jobs
- Generates report with p50/p90/p99 latency, throughput (req/s), and error rate
- Baseline SLOs documented in `docs/performance.md` (e.g., chat <200ms p99, ingestion <5min)
- CI includes optional manual load test run (not on every commit)
- Report includes flamegraph or slow-query log if available

**Owner Role:** Infra/Performance Engineer  
**Priority:** P2 (important for pre-release validation; can defer if beta is smaller scale)

---

### 5. Multi-Tenant Rate Limiting & Quota Enforcement

**Title:** Add tenant-scoped request rate limits and usage quota tracking  
**Scope:** Implement token-bucket rate limiting per tenant (configurable limits by plan tier). Track monthly API calls, ingestion volume, and chat conversations against plan quotas; return 429 when exceeded.  
**Acceptance Criteria:**
- API middleware enforces rate limit (X req/sec per tenant, configurable)
- Quota tracking stored in runtime state; can be queried via `/diagnostics/quota/:tenantId`
- Endpoints return `X-RateLimit-*` headers (limit, remaining, reset-after)
- 429 response when tenant hits rate limit or monthly quota; includes retry-after
- Admin endpoint to override/reset quota for a tenant
- Tests cover rate limit triggered, quota exceeded, and header assertions

**Owner Role:** Backend Lead  
**Priority:** P2 (required for multi-customer fairness; can start with simple hard limits)

---

### 6. Email Connector Webhook Implementation & Message Routing

**Title:** Complete email connector inbound webhook and message routing  
**Scope:** Implement email inbound (via SendGrid, Mailgun, or similar webhook) that maps incoming emails to conversations, routes replies, and supports multi-address routing for ticket escalation.  
**Acceptance Criteria:**
- `POST /webhooks/email` accepts inbound message payload (from, to, subject, body, attachments)
- Route to conversation by ticket ID or email thread; create new conversation if no match
- Support email-to-SMS escalation (route reply to Twilio or similar)
- Webhook signature verification (HMAC or similar per provider)
- Tests cover happy path (message routed), missing thread (new conversation), and invalid signature
- Documentation includes provider setup steps (SendGrid API key, webhook URL, domain config)

**Owner Role:** Backend Lead  
**Priority:** P2 (high-value integr; add after core multi-channel connectors stabilize)

---

### 7. Shared Logging & Error Handling Library

**Title:** Build shared logging and error-handling utilities for consistent observability  
**Scope:** Create `packages/shared/src/logging.ts` and `packages/shared/src/errors.ts` providing structured logger factory, error context helpers, and middleware hooks that all services (API, worker, web) can use.  
**Acceptance Criteria:**
- Logger factory in shared supports JSON output with trace ID, tenant ID, user ID context
- Error class with `code`, `statusCode`, `message` fields; supports chaining for context
- API middleware auto-logs requests with trace ID, request/response size, and latency
- Worker jobs log start/finish with job ID and duration
- Web client includes error boundary that captures stack traces and sends to server
- All three services use shared logger by default; tests confirm JSON output format

**Owner Role:** Backend Lead  
**Priority:** P2 (improves observability; can be done incrementally alongside other work)

---

### 8. Deployment Guide & Production Runbook

**Title:** Document deployment architecture, environment config, and operational runbook for production  
**Scope:** Write `docs/deployment.md` covering environment variables, secrets management (Stripe API key, vector store credentials), scaling notes (worker concurrency, vector store partitioning), monitoring (logs, metrics, error rates), and incident response (how to drain queues, rollback, etc.).  
**Acceptance Criteria:**
- Deployment guide covers local (npm run dev), staging (Docker Compose or similar), and production (cloud provider TBD) setups
- Environment variables documented with safe defaults and required-vs-optional callout
- Includes health check endpoints and monitoring queries (e.g., queue depth, persistence latency)
- Runbook covers graceful shutdown, job draining, and rollback procedures
- CI/CD section outlines how to trigger beta acceptance and promote to prod
- Guide is clear enough that a new ops person can set up staging from scratch

**Owner Role:** Infra/Ops  
**Priority:** P2 (essential before any external deployment; can be drafted in parallel)

---

## Rationale

**P1 items** unblock critical paths: worker queue processing is essential for async job handling and SLA compliance; analytics/dashboard and admin console are required for operator control and visibility; both are table stakes for a launch. **P2 items** improve robustness and scaling: load tests validate pre-release readiness, rate limiting prevents abuse, email connectors extend multi-channel coverage, shared utilities reduce tech debt, and deployment docs enable production operations. **Not included:** Issue #1 (runtime capacity config) is already tracked; minor UI polish, advanced retrieval tuning, and billing portal are lower priority.

---

## Integration Notes

- **Worker-to-API:** Worker reads from shared runtime state file (`data/api-runtime/runtime-state.json`); can be refactored to Redis/RabbitMQ later without breaking API.
- **Dashboard:** Uses existing audit/metrics data already persisted by API; no new persistence layer needed initially.
- **Rate limiting:** Stored in runtime state; can use simple in-memory token bucket with periodic flush to disk.
- **Shared library:** Adopt incrementally; start with logging, migrate services one at a time.
- **Deployment:** Assume cloud-native (Docker + Kubernetes or similar); document env var overrides and scaling knobs.

---

## Risk Mitigation

- **Worker concurrency:** Start with serial (1 job at a time) to avoid race conditions; add concurrency control once proven stable.
- **Load testing:** Run on separate hardware/environment; don't benchmark against prod data.
- **Email connector:** Partner with a single provider (SendGrid) for first iteration; generalize webhook contract later.
- **Shared lib:** Use feature flags or optional imports to avoid breaking existing services during migration.
