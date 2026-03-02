# Memories

## Patterns

## Decisions

## Fixes

### mem-1772474416-6877
> failure: cmd=ralph tools memory add "8starlabs UI source: https://github.com/8starlabs/ui; docs at https://ui.8starlabs.com. Library built on shadcn/ui and uses shadcn registry/CLI. Install via ; prerequisites: shadcn/ui init + Tailwind CSS (Node 18+)." -t context --tags ui,shadcn,8starlabs, exit=127, error=zsh:1: no such file or directory: component, next=avoid unquoted <> in shell commands
<!-- tags: tooling, error-handling | created: 2026-03-02 -->

### mem-1772474326-c505
> failure: cmd=read /Users/adne.skjelbreid.djuve/Documents/Codeprojects/chatbase/.ralph/agent/scratchpad.md, exit=tool_error, error=File not found, next=create scratchpad file before read
<!-- tags: tooling, error-handling | created: 2026-03-02 -->

### mem-1772468320-3cbe
> failure: cmd=read /Users/adne.skjelbreid.djuve/Documents/Codeprojects/chatbase/.ralph/agent/scratchpad.md, exit=tool_error, error=File not found, next=create scratchpad file before read
<!-- tags: tooling, error-handling | created: 2026-03-02 -->

### mem-1771674199-0b55
> failure: cmd=npm run test -w packages/shared, exit=1, error=Missing script: test, next=skip tests for shared package or add test script
<!-- tags: testing, tooling | created: 2026-02-21 -->

### mem-1771674101-e4bd
> failure: cmd=read /Users/adne.skjelbreid.djuve/Documents/Codeprojects/chatbase/.ralph/agent/scratchpad.md, exit=tool_error, error=File not found, next=create scratchpad file before read
<!-- tags: tooling, error-handling | created: 2026-02-21 -->

### mem-1771635435-a8f5
> failure: cmd=npm run e2e -w apps/web, exit=1, error=Playwright webServer timed out waiting for http://127.0.0.1:5173, next=use vite preview with production build or adjust webServer command to wait-on
<!-- tags: testing, playwright | created: 2026-02-21 -->

### mem-1771635151-e2cc
> failure: cmd=npm run e2e -w apps/web, exit=124, error=command timed out after 120000ms, next=install Playwright browsers and rerun e2e
<!-- tags: testing, playwright | created: 2026-02-21 -->

### mem-1771634353-96fc
> failure: cmd=npm run test -w packages/shared, exit=1, error=Missing script: test, next=skip tests for shared package or add test script
<!-- tags: testing, tooling | created: 2026-02-21 -->

### mem-1771612114-9865
> failure: cmd=npm run lint -w apps/web, exit=2, error=ESLint couldn't find a configuration file, next=add eslint config for apps/web or skip lint until configured
<!-- tags: tooling, linting | created: 2026-02-20 -->

### mem-1771612052-1327
> failure: cmd=npm run test -w apps/web, exit=1, error=No test files found, next=add minimal web tests or adjust script to handle empty test set
<!-- tags: testing, tooling | created: 2026-02-20 -->

### mem-1771611639-ef0b
> failure: cmd=npm run test -w apps/api, exit=124, error=vitest dev mode hung (no --run), next=use vitest --run in scripts
<!-- tags: testing, tooling | created: 2026-02-20 -->

### mem-1771611287-79ae
> Initialized git repository with git init to unblock commits
<!-- tags: tooling, git | created: 2026-02-20 -->

### mem-1771611139-c3f6
> failure: cmd=git status -sb, exit=128, error=not a git repository, next=skip git commit steps in this repo
<!-- tags: tooling, git | created: 2026-02-20 -->

### mem-1771611131-78e0
> failure: cmd=npm run test -w apps/api, exit=1, error=No test files found, next=run build or add tests; for now note missing tests
<!-- tags: testing, tooling | created: 2026-02-20 -->

### mem-1771610817-c88f
> failure: cmd=npm run test -w apps/api, exit=1, error=No test files found, next=run build or add tests; for now note missing tests
<!-- tags: testing, tooling | created: 2026-02-20 -->

### mem-1771610769-8e55
> failure: cmd=read /Users/adne.skjelbreid.djuve/Documents/Codeprojects/chatbase/.ralph/agent/scratchpad.md, exit=tool_error, error=File not found, next=create scratchpad file before read
<!-- tags: tooling, error-handling | created: 2026-02-20 -->

## Context

### mem-1772474412-02a0
> 8starlabs UI source: https://github.com/8starlabs/ui; docs at https://ui.8starlabs.com. Built on shadcn/ui and uses registry/CLI. Install via npx shadcn@latest add https://ui.8starlabs.com/r/<component>.json; prerequisites: shadcn/ui init + Tailwind CSS (Node 18+).
<!-- tags: ui, shadcn, 8starlabs | created: 2026-03-02 -->

### mem-1772474406-8815
> 8starlabs UI source: https://github.com/8starlabs/ui; docs at https://ui.8starlabs.com. Library built on shadcn/ui and uses shadcn registry/CLI. Install via ; prerequisites: shadcn/ui init + Tailwind CSS (Node 18+).
<!-- tags: ui, shadcn, 8starlabs | created: 2026-03-02 -->

### mem-1772397033-8f9e
> StripeClient now has SDK-style resource-namespaced interface (stripe.invoices.create, stripe.subscriptions.cancel, etc.) with in-memory state, StripeError class with typed error codes, and legacy backward-compat methods. Action executor supports stripe_billing, stripe_subscription, and stripe_refund types. 90 tests total.
<!-- tags: api, stripe, actions | created: 2026-03-01 -->

### mem-1772396590-cfe7
> Retrain endpoint supports two modes: 'auto' (re-ingests from sourceContentCache when available, sets status 'ready') and 'job' (creates queued ingestion job when no cached content). sourceContentCache stores raw text + chunking config per source, populated during ingest-text and job ingest. Cache cleaned up on source deletion.
<!-- tags: api, retrain, ingestion | created: 2026-03-01 -->

### mem-1772395240-24e8
> GDPR vector chunk deletion implemented: LocalVectorStore has deleteBySourceId and deleteByAgentId methods. GDPR endpoint accepts deleteVectorData boolean flag. DELETE /sources/:id also cleans up vector chunks. All persist to JSONL.
<!-- tags: api, gdpr, vector-store | created: 2026-03-01 -->

### mem-1772394861-15b9
> Notion source integration complete: POST /sources/notion (with safeParse validation), POST /webhooks/notion (verification + content change retrain), POST /sources/notion/sync-check (24h stale auto-retrain). notionSyncState Map tracks sync state per source. IngestionJob.kind now includes 'notion'. 8 tests added, 37 total pass.
<!-- tags: api, notion, ingestion | created: 2026-03-01 -->

### mem-1771676624-1a2b
> ran npm test after adding file ingestion endpoints and ingestion job tracking; tests passed
<!-- tags: testing, ingestion, api | created: 2026-02-21 -->
