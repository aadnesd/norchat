---
module: monorepo/build-workflow
date: 2026-03-24
problem_type: developer_experience
component: development_workflow
severity: medium
applies_when:
  - A source-level fix is verified by reading/grep but downstream tests still reproduce the old bug
  - Consumers import from `dist/` (compiled) while fixes land in `src/`
  - CUA / E2E / CI reports a regression that you can't reproduce from source
  - Monorepo with a shared package that other packages consume via compiled output
tags:
  - monorepo
  - build-artifacts
  - debugging
  - ci
  - workflow
related_issues: []
related_docs:
  - docs/solutions/runtime-errors/trylock-enoent-parent-dir-2026-03-24.md
---

# Diagnosing "source is fixed but tests still fail" — the stale-build trap

## Context

In this monorepo, `packages/shared` is authored in `src/` but consumed by
other packages (e.g. `apps/web`, test harnesses, CUA passes) via its
compiled `dist/` output. When a fix lands in `src/` but `dist/` is not
rebuilt — or when a reviewer runs tests against a checkout that has stale
`dist/` from a previous branch — the tests reproduce the *old* bug even
though `grep` of the source shows the fix is present.

The failure mode is especially nasty because:
- Source inspection confirms the fix.
- The committer sees tests pass locally (their `dist/` is fresh).
- A reviewer, CUA, or CI on a cold checkout hits the old compiled code.
- Everyone's evidence is internally consistent and mutually contradictory.

## Guidance

When a source-verified fix is reported broken by a downstream consumer:

1. **Check what the consumer imports from.** `grep` for the import path.
   If it ends in `dist/`, `lib/`, or a package name that resolves to
   compiled output, suspect staleness before re-examining the source.
2. **Compare timestamps.** `ls -lT packages/shared/src/index.ts packages/shared/dist/index.js`.
   If `src` is newer than `dist`, the compiled artifact is stale.
3. **Check if the consumer's checkout matches `origin`.** If the fix is
   committed locally but not pushed, CI and collaborators are testing a
   different tree. `git status -sb` shows `ahead N`.
4. **Resolve by syncing the tested build to the fixed source.** Options,
   in order of preference:
   - Push the fix to `origin` so all consumers check out the fixed source.
   - Rebuild `dist/` and commit it (only if `dist/` is tracked — usually
     it shouldn't be).
   - Add a prebuild step to the consumer so `dist/` is always regenerated
     before tests run.
5. **Only after syncing**, re-run the failing test. If it still fails,
   now you have a real bug to diagnose.

## Why This Matters

Without this check, you waste a review cycle — or worse, ship a
"fix-on-fix" that papers over the symptom in `dist/` while the real bug
in `src/` silently regresses on the next rebuild. Both sides believe they
have ground truth; neither does.

Symptomatically re-fixing a bug that's already fixed is one of the
highest-cost failure modes in a monorepo because the second fix usually
makes the code *worse* (added guards, extra branches, defensive copies)
while adding no real defense.

## When to Apply

Apply this check *first* whenever:
- A CUA pass, reviewer, or CI reports a bug that your `grep` says is fixed.
- You're debugging a consumer of a shared package and the shared package
  has recent commits.
- Tests pass locally but fail on CI, or vice versa.
- Two engineers disagree about whether a fix is present.

Skip this check only when the failing test reads directly from `src/`
(e.g. unit tests inside the same package, with path-based imports), in
which case staleness isn't possible.

## Examples

**This session.** The `tryAcquireLock` ENOENT fix landed in
`packages/shared/src/index.ts` and was committed as `d53498a`. A
subsequent CUA pass reported P1+P2 lock-acquisition failures still
present. `grep tryAcquireLock packages/shared/src/index.ts` showed the
fix in place with the correct `ENOENT → mkdir → return false` branch.
The divergence was resolved by pushing `d53498a` to `origin` so the
tested build matched the source on `main`. No second fix was needed —
the first fix was correct; only the build artifact was stale.

**General pattern.** Any "the code says X but the behavior says Y" report
in a monorepo with compiled intermediates should trigger a staleness
check before a code investigation.

## Related

- [tryAcquireLock ENOENT fix](../runtime-errors/trylock-enoent-parent-dir-2026-03-24.md)
  — the concrete fix whose apparent regression motivated this learning.
