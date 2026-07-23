# Task 2 report — Move all `EXIT_*` constants to the shared kernel (`types.ts`)

**Status: NEEDS_DIRECTION**

Plan: `docs/superpowers/plans/2026-07-23-runner-structure-purity.md`
Task: "### Task 2: Move all `EXIT_*` constants to the shared kernel (`types.ts`)" only. No other
task touched. Work is complete and correct through Step 8 (mostly) but the mandated
`bunx tsc --noEmit` verification command fails for a reason that predates Task 2 — see
"Discrepancy" below. Per the brief's explicit rule ("If an expected output doesn't match ...
STOP, write your report with status NEEDS_DIRECTION"), I stopped **before committing**.
All edits are in the working tree, uncommitted, so a successor Hunter loses nothing.

## Anchor verification (Step 0, before editing)

`grep -n "EXIT_" loop.ts run.ts report.ts loop.test.ts report.test.ts` was run first. All line
numbers/content the plan cites for Task 2 matched the current (post-Task-1) files exactly:
- `loop.ts:370-373` — the four `export const EXIT_…` decls.
- `run.ts:12-35` — `EXIT_LOCKED` in the `./loop.ts` import block (line 13, other hits are
  comments) and `const EXIT_ERROR = 4;` with its full doc comment (lines 28-35).
- `report.ts:20` — `import { EXIT_ESCALATED, EXIT_LOCKED, EXIT_SESSION_INCOMPLETE } from './loop.ts';`
- `loop.test.ts:9-31` / `report.test.ts:19-28` — the four `EXIT_…` names inside the `./loop.ts`
  import block.

No anchor mismatches. Proceeded exactly per the plan's steps.

## Step 1 — Flip the guard (structure.test.ts)

Replaced the Task-2 `test.todo(...)` line with the live test from the plan, verbatim.

## Step 2 — RED proof (`bun test structure.test.ts`)

```
bun test v1.3.13 (bf2e2cec)

structure.test.ts:
54 |   });
55 |
56 |   // --- false today: flipped live by CU1 tasks ---
57 |   test('leaf modules never import the orchestrator (only run.ts + tests may)', () => {
58 |     for (const f of CORE_FILES.filter((f) => f !== 'run.ts')) {
59 |       expect({ file: f, bad: allImportsOf(f).filter((s) => s === './loop.ts' || s === './loop') }).toEqual({ file: f, bad: [] });
                                                                                                        ^
error: expect(received).toEqual(expected)

@@ -1,3 +1,5 @@
  {
-   "bad": [],
+   "bad": [
+     "./loop.ts",
+   ],
    "file": "report.ts",

- Expected  - 1
+ Received  + 3

      at <anonymous> (.../structure.test.ts:59:100)
(fail) structural contract > leaf modules never import the orchestrator (only run.ts + tests may) [5.76ms]

 4 pass
 3 todo
 1 fail
 19 expect() calls
Ran 8 tests across 1 file. [121.00ms]
```

Matches the brief exactly: FAIL, `report.ts` bad: `['./loop.ts']`.

## Steps 3–7 — the moves

- `types.ts`: appended the five `EXIT_*` constants + both doc comments verbatim (Step 3 code
  block, unedited).
- `loop.ts`: deleted the four `export const EXIT_…` lines (were 370-373); added
  `import { EXIT_ESCALATED, EXIT_LOCKED, EXIT_OK, EXIT_SESSION_INCOMPLETE } from './types.ts';`
  directly below the existing `import type { Card, CampaignState, NextCardResult, StateIO } from './types.ts';`.
- `report.ts:20`: changed `from './loop.ts'` → `from './types.ts'` (same three names). The
  following `import type { Card, CampaignState } from './types.ts';` line left as-is.
- `run.ts`: deleted `EXIT_LOCKED,` from the `./loop.ts` import block; deleted the
  `const EXIT_ERROR = 4;` declaration and its full doc comment (was lines 28-35); added
  `import { EXIT_ERROR } from './types.ts';`.
  `grep -n "EXIT_LOCKED" run.ts` after the edit → single hit, a comment
  (`// \`EXIT_LOCKED\` (a refused process must never clobber the live one's report).`), no code
  references — matches the brief's required check.
- `loop.test.ts` / `report.test.ts`: removed the four `EXIT_…` names from each file's
  `./loop.ts` import block; added
  `import { EXIT_ESCALATED, EXIT_LOCKED, EXIT_OK, EXIT_SESSION_INCOMPLETE } from './types.ts';`
  immediately after.

## Step 8 — Verify: `bunx tsc --noEmit && bun test`

### `bun test` (current diff, all Task-2 edits applied)

```
bun test v1.3.13 (bf2e2cec)

 177 pass
 3 todo
 0 fail
 473 expect() calls
Ran 180 tests across 9 files. [358.00ms]
```

This matches the dispatch brief's corrected expectation exactly: **177 pass, 3 todo, 0 fail**
(176 baseline-todo-adjusted count + the Task-2 guard now live and green; the plan text's "176
pass" undercounts by one because a `test.todo` became a live passing `test`).

### `bunx tsc --noEmit` — FAILS, and is a PRE-EXISTING failure, not caused by Task 2

```
structure.test.ts(62,8): error TS2554: Expected 2-3 arguments, but got 1.
structure.test.ts(63,8): error TS2554: Expected 2-3 arguments, but got 1.
structure.test.ts(64,8): error TS2554: Expected 2-3 arguments, but got 1.
```

Lines 62-64 are the three REMAINING `test.todo('...')` single-argument calls for Tasks 3/4/5
(`session.ts is pure...`, `brief.ts is pure...`, `run.ts is pure wiring...`) — none of which
Task 2 touches or is permitted to touch (Task 2's file list is
`types.ts, loop.ts, run.ts, report.ts, loop.test.ts, report.test.ts, structure.test.ts`, and
its only permitted `structure.test.ts` edit is flipping the Task-2 todo, which I did).

**Proof this predates Task 2 (baseline reproduction via `git stash`):**

```
$ git stash && bunx tsc --noEmit; echo "EXIT: $?"; git stash pop
structure.test.ts(57,8): error TS2554: Expected 2-3 arguments, but got 1.
structure.test.ts(58,8): error TS2554: Expected 2-3 arguments, but got 1.
structure.test.ts(59,8): error TS2554: Expected 2-3 arguments, but got 1.
structure.test.ts(60,8): error TS2554: Expected 2-3 arguments, but got 1.
EXIT: 1
```

At HEAD (`2436f69`, Task 1's own commit, before any Task-2 edit), `bunx tsc --noEmit` ALREADY
fails — with FOUR errors (all four original `test.todo(...)` calls), one more than my
post-Task-2 tree (three), because my edit turned one of the four into a fully-typed live
`test(...)` call, which resolves cleanly.

**Root cause:** the installed `@types/bun@1.3.14` (`node_modules/bun-types`, pulled in by the
`devDependencies.@types/bun: "^1.3.14"` in `package.json`) types `test.todo` as
`Test<T>` — i.e. it requires the same `(label, fn, options?)` signature as `test`, with no
label-only overload — even though Bun's runtime (`bun test`, v1.3.13) fully supports and
correctly runs the label-only `test.todo('...')` form (see the `3 todo` in the `bun test`
output above; Task 1's own report also used this form for all four original todos and never
ran `bunx tsc --noEmit` to catch it). This is a toolchain/type-definition version mismatch
introduced by Task 1's `structure.test.ts`, not anything Task 2 changed.

Task 1's own report (`.claude/state/runner-structure-purity/reports/task-1.md`) never ran
`bunx tsc --noEmit` (Task 1's plan steps only call for `bun test`), so this was never caught
before now.

## Discrepancy — why I stopped

The dispatch brief requires: "verify `bunx tsc --noEmit && bun test`" and states "If an
expected output doesn't match (other than the 176/177 note above), STOP, write your report
with status NEEDS_DIRECTION and the exact discrepancy."

- `bun test` output matches expectations exactly (177 pass / 3 todo / 0 fail).
- `bunx tsc --noEmit` does NOT typecheck clean — but the failure is proven pre-existing
  (present at HEAD before Task 2 started) and lives entirely in three `test.todo(...)` calls
  that belong to Tasks 3/4/5, outside Task 2's declared file scope. Fixing those calls (e.g.
  giving them a second `() => {}` argument) is not something Task 2's brief authorizes me to
  do, and choosing a fix shape (empty callback vs. upgrading `@types/bun` vs. some other
  signature) is a decision outside my scope to make unilaterally.

Per instruction I did not commit. **All six Task-2 edits are complete and correct and remain
in the working tree, uncommitted** (`git status --short` shows: `loop.test.ts`, `loop.ts`,
`report.test.ts`, `report.ts`, `run.ts`, `structure.test.ts`, `types.ts` all modified, nothing
staged). `git diff --stat`:

```
 plugins/tribe/scripts/runner/loop.test.ts      |  5 +----
 plugins/tribe/scripts/runner/loop.ts           |  6 +-----
 plugins/tribe/scripts/runner/report.test.ts    |  5 +----
 plugins/tribe/scripts/runner/report.ts         |  2 +-
 plugins/tribe/scripts/runner/run.ts            | 11 +----------
 plugins/tribe/scripts/runner/structure.test.ts |  6 +++++-
 plugins/tribe/scripts/runner/types.ts          | 11 +++++++++++
 7 files changed, 21 insertions(+), 25 deletions(-)
```

## Question for the Warchief

The pre-existing `bunx tsc --noEmit` failure (three `test.todo('label')` single-arg calls in
`structure.test.ts`, introduced by Task 1, type-incompatible with the installed
`@types/bun@1.3.14`) blocks Task 2's mandated clean-typecheck gate, and will equally block
Tasks 3, 4, and 5's own `bunx tsc --noEmit && bun test` gates for the same reason (each of
those tasks flips one more of the same-shaped `test.todo` calls, but the OTHER remaining ones
stay single-argument until their own task flips them). Please advise:

1. Should a Hunter be dispatched to fix `structure.test.ts`'s remaining `test.todo(...)` calls
   (e.g. add a `() => {}` second argument, matching `@types/bun`'s `Test<T>` signature) as its
   own small fix/task, before Task 2 (or any later CU1 task) can close its `bunx tsc --noEmit`
   gate?
2. Or is `@types/bun` expected to be upgraded/pinned differently so the label-only `test.todo`
   overload typechecks?
3. Once directed, should I resume and finish Task 2's Step 8/Step 9 (commit) as-is (the
   Task-2 production edits themselves are complete, tested, and don't touch the broken lines),
   or should the fix land first and Task 2 re-verify after?

## Commit SHA

None — no commit was made (per the STOP instruction, work is uncommitted in the working tree).

## Deviations

- No deviation in the Task-2 production edits themselves — every step matched the plan exactly
  and the RED proof (Step 2) and `bun test` GREEN proof (Step 8) both match expectations.
- Deviation is the `bunx tsc --noEmit` half of Step 8's combined verification command, which
  fails for a pre-existing, out-of-scope reason documented above. I stopped before committing
  rather than guess at a fix or silently drop the tsc requirement.
