# Task 3-fix report — W-F5: persist the last-tick blocked reconciliation

Fix Hunter report to the Warchief. Repo root: `/Users/todd.lam/WORK/_TestScripts/todd-skills`.
Worked directly on `feat/campaign-orchestration`, HEAD `f05a387` at start (no worktree/new
branch, per brief). All commands run from `plugins/tribe/scripts/runner/`.

## The finding (W-F5), reproduced first — mechanism confirmed by hand-tracing `loop.ts`/`state.ts`

Two-card sequence `[A, B]`. `A` has `spec: null, plan: null` (⇒ `PLANNING_NEEDED` ⇒ escalates).
`B` has `dependsOn: ['A']`.

- Tick 1: `filteredNextCard` → `nextCard` computes `blockedCardIds` — at this point `A` is still
  `staged` (not yet escalated), so `B` isn't blocked yet, but `B`'s dependency is unmet, so it's
  skipped anyway. `nextCard` returns `A` (`planning_needed`). The loop escalates `A`:
  `escalateCard` sets `card.status = 'escalated'` and calls `persistLocalState` — the file on
  disk now has `A: escalated, B: staged`. `worked` becomes 1, loop continues.
- Tick 2: `filteredNextCard` → `nextCard` recomputes `blockedCardIds` — now `A` is `escalated`,
  so `B` (which `dependsOn: ['A']`) is added to the fixpoint set. `reconcileBlockedStatuses`
  mutates `state.cards.B.status = 'blocked'` **in memory** (the same object reference `runLoop`
  holds). The sequence walk then finds nothing progressable and returns `{ kind: 'done' }`.
  `runLoop`'s `while` loop `break`s — no `actOnCard`/`escalateCard`/`shipCard` call happens on
  this tick, so **no `persistLocalState` call happens either**. `runLoop` returns immediately.
- `run.ts`'s `tryWriteReport` then calls `loadState` — reloading from disk, not from the
  in-memory object `runLoop` just returned — so it sees the stale `B: staged` and reports
  `not_reached` instead of `blocked`.

This is exactly W-F5 as briefed: the reconciliation is real and correct in memory, but it is
never flushed to the artifact every consumer (a resuming run, a human reading the JSON, the
report, the Task 4 skill) actually reads.

## Fix (Warchief ruling, implemented verbatim)

One line in `runLoop` (`plugins/tribe/scripts/runner/loop.ts`): `persistLocalState(state,
resolved, io)` immediately before the loop's normal `return { exitCode: computeExitCode(processed),
processed }` — i.e. on every path through the `try` block that reaches that return (state was
loaded, may have been mutated). Not added to:
- the `--dry-run` path (`runDryRun` returns before this point entirely — zero side effects by
  construction, unaffected);
- the startup STOP-file early return (before `state` is even loaded — nothing to persist);
- `EXIT_LOCKED` (returns before `acquireLock` succeeds, so this code path is never entered by a
  refused process).

No changes to `state.ts`, `report.ts`, or `toCommitFileList`/`assertStateOrEscalationPath` in
`loop.ts` — this is a **local write only**, per the ruling. `state.ts` stays the single owner of
the dependency graph; `report.ts` still derives everything purely from `CampaignState`.

## TDD

### RED (loop.test.ts)

Added `runLoop — W-F5: a last-tick blocked reconciliation must be PERSISTED, not left in memory`
in `loop.test.ts`: exactly the two-card `[A, B]` shape above (`A`: `spec: null, plan: null`; `B`:
`dependsOn: ['A']`), asserting the state written through the mock `io` seam shows
`cards.B.status === 'blocked'`.

Run against the code as it stood at `f05a387` (before the fix):

```
error: expect(received).toBe(expected)
Expected: "blocked"
Received: "staged"
      at loop.test.ts:1093:39
(fail) runLoop — W-F5: ... [8.48ms]
 0 pass, 1 fail, 6 expect() calls
```

Failed for the right reason (the exact staleness the finding describes), not a typo/bad import.

### RED (report.test.ts)

Added `writeReport — W-F5: last-tick blocked reconciliation reaches the report as blocked, not
not_reached`: runs the REAL `runLoop` (mocked `LoopIO`, same two-card shape, a clean git/gh
commit mock for `A`'s escalation) and feeds the resulting on-disk state through
`buildCampaignReport`, asserting `report.cards.B === { outcome: 'blocked', blockedOn: 'A' }`,
`report.stats === { shipped: 0, escalated: 1, blocked: 1, notReached: 0 }`, and
`report.pending === ['A']`.

Confirmed this test ALSO fails without the fix (verified by `git stash push -- loop.ts`, running
both new tests, then `git stash pop` to restore the fix):

```
loop.test.ts:1093:39 — Expected: "blocked", Received: "staged"  (fail)
report.test.ts:681:39 — Expected: "blocked", Received: "staged" (fail)
 0 pass, 2 fail, 11 expect() calls
```

### GREEN

After restoring the fix, both new tests pass:

```
bun test loop.test.ts report.test.ts -t "W-F5"
 2 pass, 0 fail
```

Full suite: `bun test` → **172 pass / 0 fail** (450 `expect()` calls) — baseline 170 + 2 new
tests (one in `loop.test.ts`, one in `report.test.ts`). More than 170, as required.

`bunx tsc --noEmit` → clean, no output.

`grep -n "claude-agent-sdk\|@anthropic" report.ts loop.ts run.ts` → empty (grep exit 1). No
`gh`/`git` command string was added or changed by this fix (only a local `writeFile` via the
already-existing `persistLocalState` helper) — W5/W2 hold trivially; nothing new to verify
against the real CLI on the command-string front, but the STATE-CORRECTNESS behavior itself
*was* verified against the real CLI (below), since a green mocked suite is not sufficient
evidence for this class of bug (the bug survived 170 green tests already).

## Must-not-break, verified explicitly

- **W-F2 regression** (`loop.test.ts`, `--include-escalated never re-selects the same card twice
  in one pass`): `bun test loop.test.ts -t "never re-selects the same card twice"` → 1 pass.
- **`--dry-run` writes no state file, no report**: `bun test loop.test.ts -t "dry-run"` → 2 pass
  (the "zero side effects" describe block guards every `io.writeFile`/mutating call and throws
  if dry-run ever calls one).
- **state.ts v1 byte-identical round-trip**: `bun test state.test.ts -t "round-trip"` → 4 pass.
- **Exit-code precedence** (`computeExitCode`): `bun test loop.test.ts -t "exit-code precedence"`
  → 1 pass.

## Real-CLI verification (required — a green mocked suite is not sufficient evidence)

Built a scratch repo (`git init`, 2-card `state.json` exactly matching the finding's
reproduction, empty `answers.md`), ran the real `run.ts` CLI (no mocks) — once against the code
as it stood at `f05a387` (BEFORE), once after the fix (AFTER), same fixture both times.

### BEFORE (HEAD `f05a387`, no fix)

```
$ bun run.ts --repo /tmp/wf5-repro --state docs/campaign/state.json --model fixture-model \
    --answers docs/campaign/answers.md --escalations-dir docs/campaign/escalations \
    --logs-dir /tmp/wf5-repro/docs/campaign/logs
[A] escalated
EXIT: 2
```

`docs/campaign/state.json` on disk afterward:
```json
"A": { "status": "escalated", ... },
"B": { "status": "staged", "dependsOn": ["A"], ... }
```

`docs/campaign/campaign-report.md`:
```
Stats: 0 shipped, 1 escalated, 0 blocked, 1 not reached.

### A — escalated
...
### B — not_reached

## Pending (needs the owner)

- A
```

`B` is genuinely blocked behind `A` but reports `not_reached` and stats show `0 blocked, 1 not
reached` — exactly the bug.

### AFTER (fix applied)

Same command, fresh scratch repo, identical fixture:
```
[A] escalated
EXIT: 2
```

`docs/campaign/state.json` on disk afterward:
```json
"A": { "status": "escalated", ... },
"B": { "status": "blocked", "dependsOn": ["A"], ... }
```

`docs/campaign/campaign-report.md`:
```
Stats: 0 shipped, 1 escalated, 1 blocked, 0 not reached.

### A — escalated
...
### B — blocked
- Blocked on: A

## Pending (needs the owner)

- A
```

`B` now correctly shows `blocked`/`Blocked on: A`, and stats correctly show `1 blocked, 0 not
reached`.

## Scope discipline

Touched only `plugins/tribe/scripts/runner/loop.ts` (the one-line persist + its doc comment),
`loop.test.ts` (one new test), and `report.test.ts` (one new test). No changes to `state.ts`,
`report.ts`, `run.ts`, `github.ts`, or `toCommitFileList`/`assertStateOrEscalationPath`'s
allowlist. No new `gh`/`git` command strings were introduced. Nothing beyond W-F5 was touched.

## Ledger (fixer-mode disposition)

- **W-F5: FIXED.** Reproduced first (RED test in `loop.test.ts`, confirmed failing for the
  documented reason; RED also confirmed independently in `report.test.ts` via a temporary
  `git stash`/`pop` of the fix), then fixed with the Warchief-specified one-line persist. The
  reproduction artifacts (both tests) and the fix land in this same commit. Real-CLI
  before/after evidence above corroborates the mocked-suite evidence.

## Test count / gates summary

| Gate | Before | After |
| --- | --- | --- |
| `bun test` | 170 pass / 0 fail | **172 pass / 0 fail** (450 expect() calls) |
| `bunx tsc --noEmit` | clean | clean |
| `grep claude-agent-sdk\|@anthropic` in report.ts/loop.ts/run.ts | empty | empty |

Final commit: see the Warchief-facing summary for the sha (this file is `git add`-ed in the same
commit as the code/test changes, per the crash-safety invariant).
