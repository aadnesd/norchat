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

### Ralph Heartbeat Cron Automation

**Date:** 2026-03-05  
**Origin:** Morpheus (Lead)

Enable the `schedule` trigger in `.github/workflows/squad-heartbeat.yml` with a 30-minute cron so Ralph continuously scans and auto-triages untriaged squad issues.

**Why:** The cloud heartbeat is the unattended automation layer for Ralph; with cron disabled, automatic triage depends on manual/event-only activation and can miss backlog drift.

**Scope:**
- Re-enabled `on.schedule` in `squad-heartbeat.yml`
- Kept existing `issues`, `pull_request`, and `workflow_dispatch` triggers unchanged
- Did not modify triage routing logic or label policy

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
