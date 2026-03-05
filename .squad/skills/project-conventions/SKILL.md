---
name: "project-conventions"
description: "Monorepo structure and integration conventions for chatbase"
domain: "project-conventions"
confidence: "high"
source: "observed"
---

## Context

Use this when adding or restructuring features across workspaces. The repo is a Node workspaces monorepo and favors explicit service boundaries with shared types in one package.

## Patterns

### Workspace boundaries

- `apps/api` owns Fastify API/runtime orchestration.
- `apps/worker` owns background worker loops and queue-style processing.
- `apps/web` owns React + Vite frontend flows.
- `packages/shared` holds shared cross-surface types/contracts.

### Root orchestration scripts

- Keep root `package.json` scripts as the canonical way to run all app surfaces (`dev`, `lint`, `test`, `build`).
- When adding a new app workspace, wire it into root scripts in the same change to keep CI/local behavior aligned.

### TypeScript + lint/test parity

- App workspaces use TypeScript (`tsconfig.json`) with ESM (`module`/`moduleResolution` NodeNext).
- Tests live close to source as `*.test.ts` and run via Vitest.
- ESLint is configured per workspace (`.eslintrc.cjs`) and run via workspace scripts.

## Examples

```
apps/
  api/
  worker/
  web/
packages/
  shared/

# Root scripts orchestrate all app workspaces
npm run lint
npm test
npm run build
```

## Anti-Patterns

- **Hiding cross-surface logic in one app** — Keep worker responsibilities out of API/web to preserve service boundaries.
- **Adding workspace-only scripts without root wiring** — Causes CI/local drift and incomplete validation coverage.
