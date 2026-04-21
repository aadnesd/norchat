# Repository guide for agents

## Solutions & learnings

Durable learnings — bug fixes worth remembering and workflow patterns worth
applying — live in `docs/solutions/`, organized by category:

- `docs/solutions/runtime-errors/` — bugs, root causes, and fixes.
- `docs/solutions/developer-experience/` — workflow/debugging knowledge.

**Before debugging or investigating**, check `docs/solutions/` for prior
art on the same module or symptom. Each doc has frontmatter with `module`,
`component`, `problem_type`, and `tags` — grep or glance through filenames
first.

**After solving a non-trivial problem**, add a new doc using the
`/ce:compound` skill so the next agent (or the same agent on a new
session) can find the solution.

## Project docs

- `.impeccable.md` — design principles for UI work.
- `docs/tasks.md`, `docs/performance.md`, `docs/acceptance.md` — project
  planning and acceptance criteria.

## Commit conventions

Conventional commits with scope. Observed scopes in history:
`fix(runtime-state):`, `polish(web):`, `test(web):`, `docs(solutions):`.
Keep polish commits separate from bugfix commits.
