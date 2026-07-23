# Task 8 report — `runLoop` becomes a table of contents

## Status: DONE

## Pre-flight deviation (flag for Warchief — resolved locally, did not block)

The brief's plan file, `docs/superpowers/plans/2026-07-23-runner-structure-purity.md`, **did not
exist on disk** at task start (`Read` returned "File does not exist"; `find` under `docs/`
confirmed it). This matches the STATE file's own Anomaly log (`.claude/state/runner-structure-purity.md`
lines 47-49: reports and the STATE file itself vanished mid-campaign, cause unknown, `.claude/state/**`
flagged volatile) — except this time the vanished artifact was the plan file itself, which lives
under `docs/superpowers/plans/`, not `.claude/state/`.

Recovery (read-only, no guessing): `git stash list` showed 5 WIP stashes on `feat/runner-purity-wall`.
`stash@{4}`'s **untracked-files** commit (`git stash show -u stash@{4} --name-only` listed the plan
path; the real content lives in the stash's 3rd parent, the "untracked files on ..." commit,
`c5356a9`) contained the full 743-line plan file byte-for-byte matching the stash's own diffstat.
I extracted it with `git show c5356a9:docs/superpowers/plans/2026-07-23-runner-structure-purity.md`
and wrote it back to its original path (untracked — **not staged, not committed**, per the
"never commit this plan" rule and the brief's exclusion list). This let me read the exact
"Amendments" / "Global Constraints" / "# CU2" intro / "### Task 8" sections the brief named.
No content was invented — every line implemented below is either quoted directly from that
recovered file or is repo code read live from `loop.ts`.

I did not stop and report NEEDS_CONTEXT because: (a) the recovery method was purely mechanical
(git object read, not interpretation), (b) the recovered file matched every cross-reference the
STATE board makes to it (task list, amendments A1-A3, line-count expectations), and (c) the repo's
own current code (CU1 already landed: `EXIT_*` in `types.ts`, `ResolvedConfig` with `briefTemplate`,
`BRIEF_TEMPLATE_PATH` imported from `brief.ts`) matched the plan's stated CU1-done assumptions
exactly. Flagging this so the Warchief can decide whether to commit-track the plan file (or at
least investigate why it and the .claude/state files keep disappearing from the working tree).

## What changed (per brief)

`plugins/tribe/scripts/runner/loop.ts`: extracted four module-private helpers directly above
`runLoop` — `startupStopResult`, `resolveRunContext`, `retryPendingCommit`, `runPass` — and
shrank `runLoop` to the plan's table-of-contents form. Pure extract-method, no behavior change:

- `startupStopResult(config, io): LoopResult | null` — the STOP-file check, verbatim.
- `resolveRunContext(config, io): Promise<ResolvedConfig>` — base branch / answers / brief
  template resolution, verbatim.
- `retryPendingCommit(resolved, io): Promise<void>` — pending-commit retry, verbatim.
- `runPass(state, resolved, io): Promise<LoopResult>` — the while-loop body moved verbatim,
  with the in-loop `config.` references (`stopFilePathOf`, `filteredNextCard`, `config.maxCards`)
  changed to `resolved.` (type-identical: `ResolvedConfig extends RunLoopConfig`).

Doc comments moved with their code exactly as the brief specified:
- The D5′ "attempted vs worked" comment and the D5′ loop-termination comment (both previously
  sitting inside the old `runLoop` body around the while-loop) now sit inside `runPass`, at the
  same relative position (above `attempted`'s declaration, above `while`).
- The W-F5 `persistLocalState` comment stays in `runLoop`, still directly above the
  `persistLocalState(state, resolved, io)` call — now positioned after `runPass` returns and
  before the final `return result`.
- The top-level doc comment describing the overall lock → STOP → retry → loop algorithm stays
  attached to `runLoop` (it still accurately describes what `runLoop` does; it doesn't document
  the loop internals, so it wasn't a candidate to move).

One micro-deviation from the plan's literal code block: the plan's `runPass` doc-comment sample
contains an inline authoring instruction, `[move the existing attempted/worked doc comments here]`
— that bracketed text is a *note to the implementer*, not code to paste. I moved the actual
existing comments (quoted above) to their exact original positions in the function body and left
`runPass`'s doc comment as the plain two-line description the plan gives before the bracket. No
comment content was dropped — every line of prose from the original file is still present,
verbatim, at its original relative position.

## Before / after

- `runLoop` line count (function signature through closing brace, verbatim under
  `awk '/^export async function runLoop/,/^}/'`):
  - **Before: 128 lines** (`loop.ts:863-990`)
  - **After: 35 lines** (`loop.ts:973-1007`)
- `loop.ts` total: 992 → 1009 lines (+17; four new function signatures/braces/doc-comment
  headers, net of the code that moved rather than being deleted).

## RED/GREEN proof (extraction is invisible to callers — no new test needed; regression harness is `loop.test.ts`)

Baseline (before any edit):
```
$ bun test loop.test.ts
 45 pass
 0 fail
 129 expect() calls
Ran 45 tests across 1 file. [1032.00ms]

$ bun run check
$ bunx tsc --noEmit && bun test
 185 pass
 0 fail
 512 expect() calls
Ran 185 tests across 9 files. [400.00ms]
```

After the extraction:
```
$ bun run check
$ bunx tsc --noEmit && bun test
 185 pass
 0 fail
 512 expect() calls
Ran 185 tests across 9 files. [254.00ms]

$ bun test loop.test.ts
 45 pass
 0 fail
 129 expect() calls
Ran 45 tests across 1 file. [84.00ms]
```

tsc silent both times; identical pass/fail/expect counts before and after, exactly as the brief
predicted ("extraction is invisible to callers; loop.test.ts drives runLoop from outside").

## Commit

`git add loop.ts && git commit -m "[runner-loop-readability] refactor: Extract runLoop into named single-purpose steps"`
→ **`baf9fa456ceb47ccba46cad7faaf136ad4415f85`**, 1 file changed, 116 insertions(+), 99 deletions(-).
No Co-Authored-By trailer. Only `loop.ts` staged — verified `git status --porcelain` before commit
showed the three pre-existing `.c3/` modifications and the recovered plan file untouched/unstaged,
and confirmed again after commit that they remain untracked/modified-but-uncommitted.

## Deviations summary

1. Plan file was missing from disk; recovered read-only from a git stash's untracked-files commit
   and restored to its original path (untracked, not committed) — see "Pre-flight deviation" above.
2. The plan's `runPass` doc-comment sample contains an authoring placeholder
   (`[move the existing attempted/worked doc comments here]`) rather than literal text — resolved
   by moving the actual comments to the intended positions instead of pasting the placeholder.

No other deviations. No plan-checkbox flip was requested by this brief (the brief's Task 8 steps
are plain `- [ ]` in the plan file, but this brief's instructions did not ask me to tick them in a
tracked plan file — the plan file itself is LOCAL-ONLY/untracked per the repo's own rule, so there
is no tracked plan file to flip checkboxes in; the STATE board flip, if any, is the Warchief's per
its own STATE-file convention).
