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
