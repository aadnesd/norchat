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

Note: The API stores vector data under `data/vector-store` by default. Override with `VECTOR_STORE_DIR`. Runtime state uses `RUNTIME_STORE_DIR` (default `data/api-runtime`), and persistence retry/backoff settings are `RUNTIME_PERSIST_MAX_RETRIES` (default `3`), `RUNTIME_PERSIST_BACKOFF_MS` (default `100`), and `RUNTIME_PERSIST_BACKOFF_MAX_MS` (default `1000`). The web app uses `VITE_API_BASE_URL` (defaults to `http://localhost:4000`) to talk to the API, and onboarding requests send `x-user-id` from `VITE_API_USER_ID` (default `user_admin`). Operational note: `GET /diagnostics/persistence` requires the `x-user-id` header and helps inspect runtime persistence queue depth, latency, and failure counters.

## Azure OpenAI Model Provider

The API chat runtime now supports OpenAI SDK integration with Azure OpenAI.

Set these environment variables on the API process:

- `MODEL_PROVIDER=azure_openai`
- `AZURE_OPENAI_ENDPOINT=https://<resource>.openai.azure.com`
- `AZURE_OPENAI_API_KEY=<key>`
- `AZURE_OPENAI_DEPLOYMENT=<deployment-name>`
- Optional: `AZURE_OPENAI_API_VERSION` (default `2024-10-21`)
- Optional: `AZURE_OPENAI_MODEL` (defaults to deployment)
- Optional: `AZURE_OPENAI_TEMPERATURE` (default `0.2`)
- Optional: `AZURE_OPENAI_MAX_TOKENS` (default `450`)

If `MODEL_PROVIDER` is not set to `azure_openai`, the API keeps using local deterministic response generation.

## Voice Agent Channel (Webhook)

The API now supports a `voice_agent` channel type through `POST /channels` and
`POST /channels/:id/webhook`.

- Channel config requires `authToken` and supports optional `voiceLocale`, `voiceName`, and `speakingRate`.
- Voice webhook payloads accept transcript-like fields (`transcript`, `message`, `text`, or `input.transcript`).
- Voice webhook responses include `reply.speech` with `text`, `ssml`, and selected voice metadata for TTS pipelines.

## Validation

Run full workspace tests:

```bash
npm test
```

Run API tests:

```bash
npm run test -w apps/api
```

Run web tests:

```bash
npm run test -w apps/web
```

Run full build:

```bash
npm run build
```

## Playwright Visual Tests

Run visual tests for the web app with:

```bash
npm run e2e -w apps/web
```

Runbook: this command now runs against the Vite app through Playwright `webServer` + `baseURL`; no separate manual server startup is required.

Note: Ensure Playwright browsers are installed (for example `npx playwright install chromium`), and a working Chromium is required.

To update snapshots (onboarding, widget, help page):

```bash
npm run e2e -w apps/web -- --update-snapshots
```

## Repo Layout

- `apps/api` - Fastify API service (tenants, agents, sources, chat)
- `apps/web` - React + Vite web app (onboarding flow UI)
- `packages/shared` - Shared types and utilities
- `docs` - Implementation plan and task breakdown

## References

See `specs/chatbase-competitor-norway` for the full requirements, design, and research.
