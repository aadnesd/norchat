---
module: apps/web/playwright
date: 2026-04-29
problem_type: developer_experience
component: browser_test_workflow
severity: medium
applies_when:
  - Playwright points the app at the wrong API base URL during local runs
  - Browser tests fail with `Failed to fetch` before the expected request is sent
  - A fixed Playwright port is already occupied by an unrelated local dev server
  - `reuseExistingServer` is enabled for local browser tests
tags:
  - playwright
  - e2e
  - vite
  - environment
  - flaky-tests
related_issues: []
related_docs: []
---

# Avoid reusing arbitrary local dev servers in Playwright

## Context

`apps/web/playwright.config.ts` launches both the API and web dev servers on
fixed ports. When `reuseExistingServer` is enabled locally, Playwright may
attach to any already-running process on that port instead of the intended
test server.

In this repo that is especially dangerous for the web app, because the Vite
server bakes `VITE_API_BASE_URL` at startup. If Playwright reuses a stale or
unrelated Vite process, the browser can load successfully while pointing at a
dead or wrong API origin.

## Symptom

- The page renders normally.
- The onboarding panel shows `Failed to fetch` before the test's first expected
  network assertion completes.
- The API health endpoint may be healthy, yet `/tenants` is never hit.
- `lsof -i tcp:4173` often shows another repo or an old Vite process already
  bound to the Playwright port.

## Guidance

1. Check the bound process on the web port before debugging app code.
   `lsof -n -P -i tcp:4173`
2. If `reuseExistingServer` is enabled, assume env drift is possible.
3. Default Playwright to **not** reuse existing servers.
4. If reuse is ever desirable for local iteration, gate it behind an explicit
   env var like `PLAYWRIGHT_REUSE_EXISTING_SERVER=1`.
5. Re-run the browser spec after forcing Playwright to own both servers.

## Why This Matters

This failure looks like a product regression because the UI reports a network
error. In reality, the app under test may not be the one Playwright intended
to launch. That can waste a full debugging pass on onboarding logic, API
routes, or CORS when the root cause is just stale process reuse.

## This Session

The redesigned `apps/web/src/pages/App.tsx` passed unit tests, build, and
visual snapshot checks, but `tests/onboarding.spec.ts` timed out waiting for
the tenant creation response. The page already showed `Failed to fetch`.

Root cause: Playwright was reusing an existing Vite server on `127.0.0.1:4173`
with the wrong baked `VITE_API_BASE_URL`, so the browser never sent the
expected `/tenants` request to the test API.

Fix: change `playwright.config.ts` to only reuse existing servers when
`PLAYWRIGHT_REUSE_EXISTING_SERVER=1` is explicitly set.
