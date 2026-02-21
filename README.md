# Norway-First AI Support Agent Platform

This repository contains the initial scaffold for a Norway-first AI support agent platform
focused on fastest time-to-setup, broad ingestion sources, multi-channel deployment, and
GDPR-aligned controls.

## Quick Start

1) Install dependencies in each workspace
2) Run the API and web apps in development mode

```bash
npm install
npm run dev
```

Note: The API stores vector data under `data/vector-store` by default. Override with `VECTOR_STORE_DIR`. The web app uses `VITE_API_BASE_URL` (defaults to `http://localhost:4000`) to talk to the API.

## Repo Layout

- `apps/api` - Fastify API service (tenants, agents, sources, chat)
- `apps/web` - React + Vite web app (onboarding flow UI)
- `packages/shared` - Shared types and utilities
- `docs` - Implementation plan and task breakdown

## References

See `specs/chatbase-competitor-norway` for the full requirements, design, and research.
