# Acceptance Criteria Validation

This document maps the Given-When-Then acceptance criteria to current tests and
coverage. It is intended to help confirm readiness and highlight gaps that need
explicit verification.

## Criteria Coverage

1) New tenant creates an agent, adds a website URL, and ingestion/retrain succeeds
- Evidence: API integration coverage exercises tenant creation, agent creation,
  website sources, retrain behavior, and job queueing.
- Tests: `apps/api/src/__tests__/api.spec.ts`

2) Agent with multiple sources answers with correct citations
- Evidence: Retrieval ingestion + chat tests assert source citations and prompt labels.
- Tests: `apps/api/src/__tests__/api.spec.ts`, `apps/api/src/__tests__/chat-runtime.spec.ts`

3) Low-confidence escalation creates a CRM ticket
- Evidence: Low-confidence webhook chat triggers a human escalation action with
  ticket creation and dedupe behavior.
- Tests: `apps/api/src/__tests__/api.spec.ts`

4) Web widget loads on allowed domain and streams responses
- Evidence: Widget script + help page are served, allowlist enforced, and chat
  streaming returns SSE output.
- Tests: `apps/api/src/__tests__/api.spec.ts`, `apps/web/tests/visual.spec.ts`

5) Notion changes trigger auto-retrain within 24 hours
- Evidence: Notion webhook and sync-check coverage validates retrain triggers
  and 24h stale detection.
- Tests: `apps/api/src/__tests__/api.spec.ts`

6) Action integrations (Stripe) execute with structured results
- Evidence: Stripe billing action returns invoice + customer payloads.
- Tests: `apps/api/src/__tests__/api.spec.ts`, `apps/api/src/__tests__/stripe-client.spec.ts`

7) GDPR deletion removes stored conversation data
- Evidence: GDPR deletion request removes conversations and can delete vector
  chunks when configured.
- Tests: `apps/api/src/__tests__/api.spec.ts`

## Gaps / Follow-ups

- SLA definition for ingestion/retrain success is not codified in tests; consider
  adding explicit timing checks or operational SLO tracking.

## Validation Runs

- 2026-03-01: `npm run test -w apps/api` (pass). Confirms API-level coverage for
  ingestion, retrieval, actions, widget streaming, and GDPR behaviors.
