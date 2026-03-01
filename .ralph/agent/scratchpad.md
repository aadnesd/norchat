# Scratchpad — 2026-03-01

## Current State Assessment

All 18 completed tasks from docs/tasks.md are done. Build passes, 29 tests pass (3 files).

### Gap Analysis vs Acceptance Criteria

| AC# | Criteria | Status | Gap |
|-----|----------|--------|-----|
| AC1 | Tenant onboard + ingestion | ⚠️ Partial | Retrain endpoint exists but doesn't re-crawl/re-embed. No SLA tracking. |
| AC2 | Source citations in responses | ✅ Working | Citations return chunk IDs, but not human-readable source names/URLs. |
| AC3 | CRM escalation on low confidence | ✅ Working | In-memory ticket — no real Zendesk/Salesforce API call (acceptable for MVP). |
| AC4 | Web widget + streaming | ✅ Working | Widget loads, SSE streaming, domain allowlist enforced. |
| AC5 | Notion auto-retrain | ❌ Missing | Type exists but no Notion API client, no webhook handler, no scheduler. |
| AC6 | Stripe action execution | ⚠️ Stubbed | Returns fake invoice data, no Stripe SDK. |
| AC7 | GDPR deletion | ✅ Working | Deletes conversations/metrics, audit logged. Missing: vector chunk deletion. |

### Architectural Limitations (acceptable for MVP)
- All data in-memory (no DB)
- Bag-of-words embeddings (no real ML model)
- No real LLM integration (concatenates chunks)
- Header-based auth (no JWT)

## Priority Gaps to Close

1. **Notion source integration** — AC5 is completely missing. Need webhook handler + polling/scheduler stub.
2. **GDPR chunk deletion** — AC7 gap: deleting conversations but not associated KB chunks from vector store.
3. **Source citation enrichment** — AC2: citations use chunk IDs, should include source URL/title.
4. **Stripe action integration** — AC6: needs at least a realistic stubbed Stripe client pattern.
5. **Retrain logic** — AC1: retrain endpoint doesn't actually re-process sources.

## This Iteration

Focus on: **Notion source integration (AC5)** — the only acceptance criterion that is completely unimplemented.

Plan:
- Add Notion source handling: create source with type "notion" → create ingestion job → poll/sync endpoint
- Add webhook endpoint for Notion change notifications
- Add auto-retrain scheduler stub that checks for stale Notion sources
- Add tests for Notion source lifecycle
- Commit and close task
