Scratchpad initialized.
2026-02-21: Initialized scratchpad file. Next: work on ready tasks.
2026-02-21: Plan: expand shared types in packages/shared, then run relevant tests if any exist, commit one logical change, close task.
2026-02-21: Implemented shared type expansions (sources, actions, channels, conversations, feedback). Tests blocked: packages/shared has no test script. Commit pending user request.
2026-02-21: Next task: Playwright baseline. Plan to adjust Playwright webServer to use a production preview in CI while keeping dev locally, then run e2e.
2026-02-21: Task chosen: Playwright baseline. Plan: align Vite preview port with Playwright baseURL to avoid CI webServer timeout; run e2e after change.
2026-02-21: Plan: set Playwright baseURL to 4173 in CI, keep 5173 locally, align webServer command ports, then run apps/web e2e.
2026-02-21: Picking Playwright baseline task; verify config, run apps/web e2e to validate preview baseURL alignment.
2026-02-21: Reviewed apps/web/playwright.config.ts; baseURL and webServer already aligned (CI 4173 preview, local 5173 dev). Next: optionally run apps/web e2e and commit if desired.
2026-02-21: Completed shared types + Playwright baseline; tests not run.
2026-02-21: Ran npm test (apps/api + apps/web). Added vitest exclude for Playwright tests in apps/web/vite.config.ts.
2026-02-21: Implemented ingestion MVP file source queue + ingestion job status endpoints; added API tests; ran npm test.
