 # Ralph Build Prompt — Norway‑First AI Support Agent Platform

  0a. Study specs/chatbase-competitor-norway/* to learn the platform requirements, architecture, and retrieval expectations.

  0b. The source code lives in apps/api/, apps/web/, and packages/shared/.

  0c. Study PROMPT.md, docs/tasks.md, .ralph/agent/tasks.jsonl .ralph/agent/handoff.md, and .ralph/agent/scratchpad.md for current project intent and progress. If you’re lost, check .ralph/agent/
  tasks.jsonl.

  1. Your task is to implement missing functionality to ship a world‑class Norway‑first AI support agent platform (Chatbase competitor). Follow docs/tasks.md and pick the
     highest‑priority item. Before making changes, search the codebase (don’t assume it’s not implemented). Use subagents for search. Prefer existing conventions (Fastify in
     API, Vite/React in web) and keep the architecture consistent with specs/*.
  2. Code follows TDD: RED → GREEN → REFACTOR. After implementing functionality or resolving problems, run the tests for the unit of code you improved (e.g., npm run test -w
     apps/api or npm run test -w apps/web). If functionality is missing, add it per the specs. Think hard.
  3. When you discover a bug, gap, or mismatch between specs and code, immediately update docs/tasks.md and .ralph/agent/tasks.jsonl using a subagent. When resolved, update
     them again and remove the item using a subagent.
  4. When tests pass, run npm run build to verify the build. Update docs/tasks.md and .ralph/agent/tasks.jsonl, then add changed code with git add -A and git commit with a
     message describing the changes. Do not push unless explicitly asked.
  5. Important: When authoring documentation, capture the “why” and the importance of any tests and backing implementation.
  6. Important: We want single sources of truth. If tests unrelated to your work fail, resolve them as part of the increment of change.
  7. As soon as there are no build or test errors, create a git tag. If there are no git tags, start at 0.0.0 and increment patch by 1 (e.g., 0.0.1 if 0.0.0 does not exist).
  8. You may add extra logging if required to debug issues.
  9. ALWAYS KEEP .ralph/agent/tasks.jsonl and docs/tasks.md up to date with your learnings using a subagent, especially after wrapping up your turn.
  10. When you learn something new about how to run the app or tests, update README.md briefly using a subagent.
  11. ALWAYS update .ralph/agent/scratchpad.md after completing an iteration.

  9999999999. IMPORTANT: Do not introduce placeholder or toy implementations. Build real features with correct logic and tests.

  99999999999. IMPORTANT: The ingestion + retrieval foundations already exist. Extend them; don’t replace them:

  - ingestion endpoints in apps/api/src/index.ts (e.g., /sources, /sources/crawl, /sources/file, /ingestion-jobs)
  - retrieval API in apps/api/src/index.ts (/retrieve)
    Always preserve tests and add coverage for changes.

  999999999999. SUPER IMPORTANT DO NOT IGNORE: DO NOT PLACE STATUS REPORT UPDATES INTO AGENTS.md.