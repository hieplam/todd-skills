# Task 11: Delete the dead `maxTurns` plumbing — report

**Status: DONE**

## Pre-flight (re-verified unreachability before touching anything)

```
$ grep -rn "maxTurns" *.ts
loop.ts:355:  maxTurns?: number;
loop.ts:677:    maxTurns: resolved.maxTurns,
session.test.ts:70:    const config = fixtureConfig({ maxTurns: 12 });
session.test.ts:82:    expect(options.maxTurns).toBe(12);
session.ts:42:  maxTurns?: number;
session.ts:88:  maxTurns?: number;
session.ts:108:    maxTurns: config.maxTurns,

$ grep -n "max-turns" run.ts README.md
(no output — zero hits)
```

Hits landed exactly where the brief predicted (loop.ts field + mapping, session.ts field ×2 +
buildSessionOptions line, session.test.ts fixture + assertion). No stray setter/reader — proceeded.

## RED proof — the pinning test, run before deletion (source already edited at this point per
plan order; failure is the deletion manifesting, exactly as expected)

```
$ bun test session.test.ts
...
error: expect(received).toBe(expected)
Expected: 12
Received: undefined
      at session.test.ts:82:30
(fail) runSession — §D1 option set (regression guard against SDK drift) > passes exactly the pinned §D1 options to io.spawnSession [1.64ms]

 11 pass
 1 fail
 32 expect() calls
Ran 12 tests across 1 file.
```

## The six deletion sites

1. `loop.ts` — `RunLoopConfig.maxTurns?: number;` field (was line 355, no doc comment of its
   own — sat directly under `sessionTimeoutMs`'s doc comment). Deleted.
2. `loop.ts` — `sessionConfigFor`'s `maxTurns: resolved.maxTurns,` mapping line (was line 677).
   Deleted.
3. `session.ts` — `RunSessionConfig.maxTurns?: number;` field + its doc comment
   `/** \`--session-timeout\`-derived turn cap, if the caller wants one. */` (were lines 41-42).
   Both deleted.
4. `session.ts` — `PinnedSessionOptions.maxTurns?: number;` field (was line 88, no doc comment
   of its own). Deleted.
5. `session.ts` — `buildSessionOptions`'s `maxTurns: config.maxTurns,` line (was line 108).
   Deleted.
6. `session.test.ts` — fixture arg `fixtureConfig({ maxTurns: 12 })` → `fixtureConfig()` (line
   70) and `expect(options.maxTurns).toBe(12);` (line 82) removed; every other assertion in that
   test (`cwd`, `model`, `systemPrompt`, `settingSources`, `plugins`, `permissionMode`,
   `allowDangerouslySkipPermissions`, `abortController`, `executable`, `resume`) left untouched.

Post-edit confirmation: `grep -rn "maxTurns" *.ts` → zero hits.

## Gate

```
$ bun run check
$ bunx tsc --noEmit && bun test
bun test v1.3.13 (bf2e2cec)

 185 pass
 0 fail
 511 expect() calls
Ran 185 tests across 9 files. [403.00ms]
```

tsc silent (no errors printed before the test run); 185 pass / 0 fail — same count as the
baseline (an assertion was removed, not a test), exactly as the plan's Step 3 expects. Re-ran
`bun run check` again after the commit — same result (185 pass / 0 fail).

## Commit

```
9a0bf7d25fa64601c2cfcfbc90e5d0570d2450e2 [runner-loop-readability] refactor: Delete unreachable maxTurns plumbing
 3 files changed, 1 insertion(+), 8 deletions(-)
```

`git status --short` before and after the commit shows only the pre-existing untouched local
artifacts (`.c3/**`, `.claude/state/**`, `docs/superpowers/**`) — none of them staged or
committed.

## Deviations from the brief

- **Plan-file checkboxes not ticked/committed.** The brief's Method (global contract) calls for
  flipping this task's `- [ ]` → `- [x]` in the plan file inside the same commit. This repo's
  plan file (`docs/superpowers/plans/2026-07-23-runner-structure-purity.md`) is explicitly
  marked `> **LOCAL-ONLY ARTIFACT:** never commit this plan file` in its own header, and the
  brief's own Rules section lists `docs/superpowers/**` under "Never commit". I verified the
  three immediately-preceding task commits (Tasks 8, 9, 10 — `baf9fa4`, `a417598`, `5bf9a73`)
  each touch only `loop.ts`, confirming this repo's established convention never stages the plan
  file. I followed that convention and the brief's explicit commit line (`git add loop.ts
  session.ts session.test.ts && git commit -m ...`) verbatim, and did not touch the plan file at
  all (checkbox state there is unchanged, still `- [ ]` for Task 11, as a local-only artifact).
- No other deviations. All four brief steps executed as specified; no ambiguity encountered.
