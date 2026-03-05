# Project Context

- **Owner:** Aadne S Djuve
- **Project:** Norway-first AI support agent platform focused on fastest setup, broad ingestion sources, multi-channel deployment, and GDPR-aligned controls.
- **Stack:** Fastify API (`apps/api`), React + Vite web app (`apps/web`), shared types/utilities (`packages/shared`), docs (`docs`)
- **Created:** 2026-03-05

## Learnings

- Morpheus initialized as Lead for architecture and scope governance.
- Architecture boundary now explicit across `apps/api`, `apps/worker`, `apps/web`, and `packages/shared` to keep runtime concerns separated from UI.
- Delivery pattern for structural work: introduce reversible workspace scaffolding first, then wire root scripts (`dev`, `build`, `test`, `lint`) to include the new surface.
- User preference reinforced: keep scope tight and changes minimal while making integration direction explicit.
- Key paths for structure ownership: `package.json`, `README.md`, `apps/worker/package.json`, `apps/worker/src/index.ts`.
- Architectural decision: re-enable unattended Ralph monitoring by turning the `schedule` trigger back on in `.github/workflows/squad-heartbeat.yml` instead of altering triage routing logic.
- Reusable workflow pattern: keep heartbeat in a three-mode trigger shape (`schedule` + event-driven hooks + `workflow_dispatch`) so automation stays continuous but still reversible.
- User preference reinforced again: implement minimal operational toggles first (enable cron) before wider workflow rewrites.
- Key paths for squad triage automation: `.github/workflows/squad-heartbeat.yml`, `.github/workflows/squad-triage.yml`, `.squad/team.md`.
- Ralph heartbeat cron enabled (2026-03-05): 30-minute schedule active for automatic untriaged issue discovery and routing.
- Task-to-issue sync (2026-03-05): Synced 1 open task (`runtime-state-capacity-config`) to GitHub issue backlog. Pattern: match task ID/title, avoid duplicates, include task metadata (ID, priority, created date) in issue body. Note: `squad` label unavailable in repo; existing labels (bug, enhancement, etc.) should be reserved for traditional triage. Consider creating `squad` label if planning cross-repo label consistency.
- Squad label bootstrap (2026-03-05): Created `squad` label in repo (purple #6f42c1, description: "Squad automation and team triage") and applied to issue #1. Enables explicit marking of squad-sourced work for heartbeat/triage automation. This is a team-level behavior change (first explicit squad label namespace in repo).
- Implementation status audit (2026-03-05): Full stack assessment shows API at high maturity (46 tests, all core features live), web at beta-ready (onboarding E2E working), worker scaffolded but minimal (no queue processing), shared types-only, QA at CI-gate level. No critical gaps; issue #1 (runtime capacity config) is only known backlog. Identified 8 high-value missing items: worker queue processor (P1), analytics dashboard (P1), admin console agent config (P1), load testing (P2), rate limiting (P2), email connector webhooks (P2), shared logging lib (P2), deployment runbook (P2).
- API feature completeness: 30 completed tasks including tenancy, ingestion (file/website/Notion), retrieval (hybrid/rerank), chat streaming, widget+widget allowlist, onboarding flow, GDPR deletion+retention, audit logging, multi-channel connectors (12 types), CRM escalation, Stripe actions, runtime persistence with retry/backoff, beta acceptance automation. Test coverage solid (96 tests, all passing). Key paths: `apps/api/src/index.ts` (4.5K lines, 35+ endpoints), `apps/api/src/chat-runtime.ts`, `apps/api/src/vector-store.ts`.
- Web maturity: Onboarding flow complete (tenant→agent→source→channel); Playwright E2E validates full create-and-deploy flow; visual snapshots for UI regression detection; API client with auth header propagation (`x-user-id`); shadcn UI primitives adopted. Gap: no analytics dashboard, no admin console beyond onboarding, no error recovery UI for multi-step forms.
- Worker architecture: Currently a minimal heartbeat loop with configurable poll interval. No job queue integration, no persistence, no backpressure. Scaffolding complete; ready for queue processor implementation. Key path: `apps/worker/src/index.ts` (33 lines).
- Shared package: Types only (no runtime utilities). Has all API schemas (Tenant, Agent, Source, Channel, Conversation, Action, Notion types). No shared logging, error handling, or validation helpers. Opportunity to reduce cross-service code duplication.
- Build & test health: Full workspace lint, test, build all passing. CI workflow in place. E2E Playwright working. Beta acceptance runbook at `docs/acceptance.md` with operator runbook for release sign-off.
- Key file paths for future work: `apps/api/src/index.ts` (endpoints, runtime), `apps/api/src/chat-runtime.ts` (LLM orchestration), `apps/worker/src/index.ts` (job processor entry), `apps/web/src/pages/App.tsx` (onboarding UI), `packages/shared/src/index.ts` (type exports), `.github/workflows/ci-quality.yml` (test/lint/build gate), `.github/workflows/beta-acceptance.yml` (release runbook).
- Sprint planning backlog pass (2026-03-05): Checked open GitHub issues first (only #1 open) and kept backlog focused at 6 total open sprint issues.
- Practical status snapshot: API is functionally broad for MVP, worker is still heartbeat-only, web supports onboarding + observability, shared remains types-first, QA lacks dedicated load/performance gates.
- New squad-labeled sprint issues created: #2 (worker async queue runtime, P1, Backend), #3 (tenant rate limiting + quotas, P1, Backend), #4 (post-onboarding agent settings, P1, Frontend), #5 (shared logging/error utilities, P2, Lead), #6 (load/performance benchmark suite, P2, Tester).
- Sequencing learning: ship worker async execution first, then traffic governance and operator controls, then shared observability foundations and performance/SLO validation.
