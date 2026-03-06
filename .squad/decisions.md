# Squad Decisions

## User Directives

### 2026-03-06T09:17:48Z: Frontend testing & Playwright validation
**By:** Aadne S Djuve (via Copilot)  
**What:** For frontend-related issues, always have Switch run tests using playwright-cli, capture screenshots and logs, and post the results on the issue. If tests are not fully successful and the issue is not completed properly, the responsible developer must review the feedback and iterate.  
**Why:** User request — captured for team memory

---

## Active Decisions

### Sprint Planning Backlog (2026-03-05)

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Adopt a focused sprint backlog of **6 total open issues** (1 existing + 5 newly created), with emphasis on production readiness and cross-surface coverage (API, worker, web, shared, QA).

**Backlog:**
1. **#2** Worker runtime: implement durable async job queue processing — **P1** — Owner: Backend
2. **#3** API hardening: enforce per-tenant rate limiting and quotas — **P1** — Owner: Backend
3. **#4** Admin console: post-onboarding agent settings (prompt/model/retrieval) — **P1** — Owner: Frontend
4. **#5** Shared package: structured logging + typed error utilities — **P2** — Owner: Lead
5. **#6** QA: add load/performance benchmark suite with SLO reporting — **P2** — Owner: Tester
6. **#1** Make runtime state caps configurable — **P3** — Owner: Backend (existing)

**Sequencing:**
- Phase 1 (P1): #2 → #3 → #4
- Phase 2 (P2): #5 → #6
- Phase 3 (P3): #1

**Rationale:** Worker async execution (#2) unlocks reliable ingestion/retrain scaling. Tenant governance (#3) and operator controls (#4) are highest impact for production. Observability (#5) and SLO validation (#6) harden platform for beta-to-prod.

---

### Worker Workspace Scaffold

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Add a dedicated `apps/worker` workspace and include it in root workspace scripts (`dev`, `build`, `test`, `lint`).

**Why:** The project charter and planning artifacts define a four-surface scaffold (API, worker, web, shared). Making worker explicit now keeps service boundaries coherent and avoids overloading API runtime responsibilities.

**Scope:**
- Added `apps/worker` package scaffolding with TypeScript, ESLint, and Vitest setup
- Added a minimal heartbeat/polling worker entrypoint (`apps/worker/src/index.ts`) with unit coverage
- Updated `README.md` repo layout and root script orchestration

### Ralph Heartbeat Cron Automation

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Enable the `schedule` trigger in `.github/workflows/squad-heartbeat.yml` with a 30-minute cron so Ralph continuously scans and auto-triages untriaged squad issues.

**Why:** The cloud heartbeat is the unattended automation layer for Ralph; with cron disabled, automatic triage depends on manual/event-only activation and can miss backlog drift.

**Scope:**
- Re-enabled `on.schedule` in `squad-heartbeat.yml`
- Kept existing `issues`, `pull_request`, and `workflow_dispatch` triggers unchanged
- Did not modify triage routing logic or label policy

### GitHub Issue Backlog Sync

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Sync open tasks from `.ralph/agent/tasks.jsonl` to GitHub issues and establish automated backlog linkage.

**Why:** Centralize squad work in GitHub for transparency and automation; enable Ralph heartbeat to triage issues sourced from Ralph task backlog.

**Scope:**
- Synced open task `runtime-state-capacity-config` to GitHub issue #1
- Task: Make runtime state caps configurable (priority 4, low)
- Issue includes task ID, description, priority, and creation timestamp
- No duplicates detected; backlog now synchronized

**Impact:**
- Squad tasks now have corresponding GitHub issues for community awareness
- Enables task/issue linkage and cross-tool triage automation
- One open task currently in backlog; all others closed

### Squad Label Bootstrap

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Create dedicated `squad` label in the GitHub repo and apply it to squad-sourced issues.

**Why:** The squad heartbeat and triage workflows need a reliable label signal to identify which issues originated from squad task sync vs. traditional GitHub issue creation. Without this namespace, squad-sourced work is indistinguishable from ad-hoc GitHub issues, making automation policy harder to enforce.

**Scope:**
- Created `squad` label in `aadnesd/norchat` with description "Squad automation and team triage" and color #6f42c1
- Applied label to issue #1 (the squad task sync source)
- This establishes the first explicit squad label namespace in the repo

**Impact:**
- **Triage automation:** Ralph and squad heartbeat can now filter issues by `squad` label to apply team-specific routing rules
- **Team visibility:** Issues marked with `squad` are clearly sourced from squad task backlog, not ad-hoc GitHub
- **Reversibility:** Label is additive; can be removed without breaking existing triage logic

### Worker Queue Runtime & Async Job Processing

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Build the worker as a proper job queue consumer that picks up ingestion/retrain/action tasks from a durable work queue.

**Key Points:**
- Worker reads job queue from shared runtime state (file or Redis stub)
- Processes one job at a time with configurable concurrency (default: 1)
- Updates job status (queued → processing → done/failed) in persistent store
- Implements exponential backoff on transient failures; hard fails after max retries
- Logs job lifecycle to observability endpoint
- Reachable via `npm run dev -w apps/worker` with test coverage

**Owner:** Backend Lead  
**Priority:** P1 (blocks ingestion SLA enforcement and async action execution)

---

### Analytics & Observability Dashboard

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Add analytics endpoint and dashboard UI for conversations, deflection, and agent quality metrics.

**Key Points:**
- API `/analytics/metrics` endpoint with aggregated counts + percentiles
- Dashboard UI tab with line chart (conversations/day), histogram (confidence), heatmap (escalation by agent)
- Metrics computed from durable audit/metrics state (no real-time DB required)
- Filters for agent, date range, source type
- Endpoint requires `x-user-id` and respects tenant isolation

**Owner:** Full-stack Engineer  
**Priority:** P1 (required for operator visibility into bot performance and compliance)

---

### Admin Console: Agent Configuration & Prompt Management

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Build admin UI for managing agent base prompts, model selection, and retrieval parameters.

**Key Points:**
- `/admin/agents/:agentId/edit` page with form for agent metadata + retrieval config
- POST `/agents/:agentId` accepts `model`, `basePrompt`, `retrievalConfig` fields
- Form includes preview of how prompt template will render with sample context
- Changes persist immediately; API validates field types and ranges
- Success/error toast notifications
- Page requires write permission

**Owner:** Full-stack Engineer  
**Priority:** P1 (blocks ops from tuning agent behavior post-launch)

---

### Load Testing & Performance Benchmarks

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Define and measure ingestion/chat latency and throughput SLOs.

**Key Points:**
- Load test script in `scripts/load-test.ts` spawns N concurrent chat clients and M concurrent ingestion jobs
- Generates report with p50/p90/p99 latency, throughput (req/s), and error rate
- Baseline SLOs documented in `docs/performance.md` (e.g., chat <200ms p99, ingestion <5min)
- CI includes optional manual load test run (not on every commit)

**Owner:** Infra/Performance Engineer  
**Priority:** P2 (important for pre-release validation; can defer if beta is smaller scale)

---

### Multi-Tenant Rate Limiting & Quota Enforcement

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Implement token-bucket rate limiting per tenant with usage quota tracking.

**Key Points:**
- API middleware enforces rate limit (X req/sec per tenant, configurable)
- Quota tracking stored in runtime state; queryable via `/diagnostics/quota/:tenantId`
- Endpoints return `X-RateLimit-*` headers
- 429 response when tenant hits rate limit or monthly quota
- Admin endpoint to override/reset quota for a tenant

**Owner:** Backend Lead  
**Priority:** P2 (required for multi-customer fairness; can start with simple hard limits)

---

### Email Connector Webhook Implementation & Message Routing

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Complete email connector inbound webhook and message routing.

**Key Points:**
- `POST /webhooks/email` accepts inbound message payload
- Route to conversation by ticket ID or email thread; create new conversation if no match
- Support email-to-SMS escalation
- Webhook signature verification (HMAC per provider)
- Tests cover happy path, missing thread, and invalid signature

**Owner:** Backend Lead  
**Priority:** P2 (high-value integr; add after core multi-channel connectors stabilize)

---

### Shared Logging & Error Handling Library

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Build shared logging and error-handling utilities for consistent observability.

**Key Points:**
- Logger factory supports JSON output with trace ID, tenant ID, user ID context
- Error class with `code`, `statusCode`, `message` fields; supports chaining
- API middleware auto-logs requests with trace ID, request/response size, and latency
- Worker jobs log start/finish with job ID and duration
- Web client includes error boundary that captures stack traces

**Owner:** Backend Lead  
**Priority:** P2 (improves observability; can be done incrementally)

---

### Deployment Guide & Production Runbook

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Document deployment architecture, environment config, and operational runbook for production.

**Key Points:**
- Covers local (npm run dev), staging (Docker Compose), and production setups
- Environment variables documented with safe defaults
- Includes health check endpoints and monitoring queries
- Runbook covers graceful shutdown, job draining, rollback procedures
- CI/CD section outlines beta acceptance and promotion to prod

**Owner:** Infra/Ops  
**Priority:** P2 (essential before any external deployment)

---

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
