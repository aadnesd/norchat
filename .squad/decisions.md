# Squad Decisions

## Active Decisions

### Worker Workspace Scaffold

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Add a dedicated `apps/worker` workspace and include it in root workspace scripts (`dev`, `build`, `test`, `lint`).

**Why:** The project charter and planning artifacts define a four-surface scaffold (API, worker, web, shared). Making worker explicit now keeps service boundaries coherent and avoids overloading API runtime responsibilities.

**Scope:**
- Added `apps/worker` package scaffolding with TypeScript, ESLint, and Vitest setup
- Added a minimal heartbeat/polling worker entrypoint (`apps/worker/src/index.ts`) with unit coverage
- Updated `README.md` repo layout and root script orchestration

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
