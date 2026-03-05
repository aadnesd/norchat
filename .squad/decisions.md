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

## Governance

- All meaningful changes require team consensus
- Document architectural decisions here
- Keep history focused on work, decisions focused on direction
