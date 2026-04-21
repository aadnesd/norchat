---
module: packages/shared/runtime-state
date: 2026-03-24
problem_type: runtime_error
component: tooling
severity: medium
root_cause: config_error
resolution_type: code_fix
tags:
  - runtime-state
  - file-locks
  - enoent
  - fresh-install
  - monorepo
related_issues: []
related_docs:
  - docs/solutions/developer-experience/stale-build-artifact-diagnosis-2026-03-24.md
---

# `tryAcquireLock` throws ENOENT on fresh installs before parent dir exists

## Problem

`persistDurableRuntimeState` reported lock-acquisition failures on fresh
installs even though the caller `mkdir`s the runtime-store directory inside
its own lock callback. API responses still reported success, but state
writes silently dropped. The regression only surfaced on machines without a
pre-existing `~/.local/share/<app>/runtime-state/` directory — CI and
long-running dev boxes masked it.

## Symptoms

- First write after a clean install logs `ENOENT: no such file or directory, open '.../runtime-state/<id>.lock'`.
- `persistDurableRuntimeState` returns an error envelope but upstream callers
  that ignore the envelope (fire-and-forget persistence) report success to
  the user.
- Subsequent writes *also* fail — the lock never gets acquired because the
  error bubbles before the `mkdir` inside the callback runs.
- Reproduces on any environment where the runtime-state parent directory
  has never been created (fresh clone, new machine, wiped cache).

## What Didn't Work

- **Moving the `mkdirSync` call to `persistDurableRuntimeState` before
  `tryAcquireLock`** — still races with concurrent lock holders and
  duplicates responsibility; the lock primitive should own its own
  filesystem preconditions.
- **Swallowing all lock errors and returning `false`** — hides real lock
  contention (EACCES, EBUSY, EMFILE) behind the same retry path, turning
  genuine failures into infinite loops.
- **`fs.ensureDirSync` at module import time** — breaks test isolation and
  forces a filesystem write for code paths that never acquire a lock.

## Solution

In `packages/shared/src/index.ts` inside `tryAcquireLock`, catch `ENOENT`
specifically, create the parent directory recursively, and return `false`
so the caller retries on the next tick. Any other errno rethrows.

```ts
try {
  fd = openSync(lockPath, constants.O_CREAT | constants.O_EXCL | constants.O_RDWR);
} catch (err) {
  const e = err as NodeJS.ErrnoException;
  if (e.code === "EEXIST") return false;          // lock held, retry
  if (e.code === "ENOENT") {                       // parent dir missing
    mkdirSync(dirname(lockPath), { recursive: true });
    return false;                                  // retry; next attempt sees the dir
  }
  throw err;                                       // EACCES/EBUSY/EMFILE bubble
}
```

Committed in `d53498a fix(runtime-state): recover from missing parent dir in lock acquisition`.

## Why This Works

- The lock primitive now owns its filesystem preconditions — callers don't
  need to know the lockfile's parent layout.
- Returning `false` (not `true`) means the caller's retry loop drives the
  second attempt, which finds the dir present and takes the normal
  `O_CREAT | O_EXCL` path. No special-case success branch.
- `mkdirSync(..., { recursive: true })` is idempotent and safe under
  concurrent invocation — if two workers race, both succeed.
- Only `ENOENT` triggers the recovery. `EEXIST` still means "lock held",
  and every other errno still surfaces, so real failures remain visible.

## Prevention

- When a primitive depends on a filesystem path, it owns creating that
  path — don't split the responsibility between caller and callee.
- Treat `ENOENT` on `O_CREAT` as a structural precondition, not a runtime
  error — the fix is to create the structure, not to fail the operation.
- Add a fresh-install smoke test to CI: run the runtime-state persistence
  path with `HOME=$(mktemp -d)` so the parent dir genuinely doesn't exist.
- When a persistence layer returns an error envelope, audit callers — a
  silent drop because nobody reads the envelope is worse than throwing.

## Related

- [Stale build artifact diagnosis](../developer-experience/stale-build-artifact-diagnosis-2026-03-24.md)
  — diagnosing why this fix appeared not to work in a downstream test
  harness even after the source was patched.
