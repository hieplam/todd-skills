# Task 3 report — Split `session.adapter.ts` out of `session.ts`

## Status: DONE

## Scope followed
Plan sections read: "## Amendments" (A1), "Global Constraints", "### Task 3: Split
`session.adapter.ts` out of `session.ts`" only. No other task implemented.

## Pre-flight anchor verification

```
$ grep -n "query\|sdkSpawnSession" session.ts run.ts
session.ts:1:// Pinned Claude Agent SDK query() options + session spawn/parse (Task 5b, spec §D1).
session.ts:8:import { query } from '@anthropic-ai/claude-agent-sdk';
session.ts:120:/** The real SDK spawn, wrapping `query()` — used to build the production `SessionIO`. Not
session.ts:123:export function sdkSpawnSession(params: SpawnSessionParams): AsyncIterable<SessionMessage> {
session.ts:124:  return query({ prompt: params.prompt, options: params.options }) as unknown as AsyncIterable<SessionMessage>;
run.ts:4:// wiring — gh/git via `child_process`, the filesystem, the real SDK spawn (`sdkSpawnSession`
run.ts:6:// deliberately NOT unit-tested, same precedent as session.ts's `sdkSpawnSession`: the logic
run.ts:23:import { sdkSpawnSession } from './session.ts';
run.ts:208:    spawnSession: (params: SpawnSessionParams): AsyncIterable<SessionMessage> => sdkSpawnSession(params),
```
Matched the plan's cited line numbers (session.ts:8, 120-125; run.ts:23) exactly — proceeded
without deviation.

Note: `structure.test.ts`'s pre-existing Task-3 `test.todo` line already carried the
`() => {}` callback (Amendment A1 was applied by the Task-2 hunter), so Step 1 below simply
replaced the whole `test.todo(...) => {});` line with the live `test(...)` per the brief.

## Step 1 — flip the guard (RED proof)

Replaced the `test.todo('session.ts is pure…', () => {});` line in `structure.test.ts` with
the live test from the plan. Ran it and watched it FAIL for the right reason (session.ts
still imports the SDK, not a typo):

```
$ bun test structure.test.ts
...
structure.test.ts:
...
   test('session.ts is pure: no SDK import outside session.adapter.ts', () => {
    expect(allImportsOf('session.ts').includes('@anthropic-ai/claude-agent-sdk')).toBe(false);
                                                                                       ^
error: expect(received).toBe(expected)

Expected: false
Received: true

      at <anonymous> (.../session/structure.test.ts:63:83)
(fail) structural contract > session.ts is pure: no SDK import outside session.adapter.ts [0.46ms]

 5 pass
 2 todo
 1 fail
 24 expect() calls
Ran 8 tests across 1 file. [31.00ms]
```

## Step 2 — create `session.adapter.ts`
Created verbatim from the plan (Task 3, Step 3): SDK-only `query` import, `import type`
of `SessionMessage`/`SpawnSessionParams` from `./session.ts`, exporting `sdkSpawnSession`.

## Step 3 — edit `session.ts`
- Deleted `import { query } from '@anthropic-ai/claude-agent-sdk';` (was line 8).
- Deleted the `sdkSpawnSession` function and its doc comment (was lines 120-125).
- Replaced the file-header lines 1-6 with the plan's new header (PURE module note pointing
  at `session.adapter.ts`).

## Step 4 — edit `run.ts`
Changed `import { sdkSpawnSession } from './session.ts';` (line 23) to
`import { sdkSpawnSession } from './session.adapter.ts';`. The adjacent
`import type { SessionMessage, SpawnSessionParams } from './session.ts';` line left unchanged
per the brief.

## Gate — final verification

```
$ bunx tsc --noEmit; echo "TSC EXIT: $?"
TSC EXIT: 0

$ bun test
bun test v1.3.13 (bf2e2cec)

 178 pass
 2 todo
 0 fail
 474 expect() calls
Ran 180 tests across 9 files. [317.00ms]
```

Matches brief's expected: tsc silent/exit 0; **178 pass / 2 todo / 0 fail** (the plan text's
"177 pass" is the same off-by-one the brief flagged via Amendment A1 — actual is 178, as
expected and pre-declared in the brief).

## Files staged/committed
`session.adapter.ts` (new), `session.ts`, `run.ts`, `structure.test.ts` — exactly the four
named in the brief. Nothing else (plan file, `.claude/state/**`, `.c3/**` all left untouched
and unstaged — confirmed via `git status --short` before commit, which showed only these
four plus the pre-existing untracked non-runner files that were never staged).

## Commit
```
2586764 [runner-purity-wall] refactor: Isolate the SDK import in session.adapter.ts
 4 files changed, 20 insertions(+), 14 deletions(-)
 create mode 100644 plugins/tribe/scripts/runner/session.adapter.ts
```
No Co-Authored-By trailer; commit message matches the brief's exact required subject.

## Deviations
None. All steps matched the plan's cited line numbers and expected outputs exactly.
