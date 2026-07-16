# Task 1/6 report — `state.ts`: `dependsOn`, `blocked`, `autoAnswerRounds`

Hunter report to the Warchief. Branch: `feat/campaign-orchestration` (worked directly on it,
no worktree/new branch, per brief). Repo root: `/Users/todd.lam/WORK/_TestScripts/todd-skills`.
All commands run from `plugins/tribe/scripts/runner/`.

**Reopened once** by the Warchief's audit (stale-`blocked`-never-cleared defect) and fixed in
the same commit (amended, not a second commit) — see "Warchief audit fix" below for the full
RED→GREEN evidence and the live probe transcript. Everything above that section is the
original submission, left intact for the record; the fix section documents what changed on
top of it.

## What changed, file by file

### `plugins/tribe/scripts/runner/types.ts`
- `CardStatus` gains `'blocked'` (5th member alongside `staged | running | shipped |
  escalated`). Doc comment states explicitly that `blocked` is DERIVED — computed fresh by
  `nextCard` every call, never written by a session, and a stored `blocked` on disk is a hint
  from a prior run, never trusted as-is (Warchief ruling 2).
- `Card` gains two OPTIONAL fields: `dependsOn?: string[]` and `autoAnswerRounds?: number`.
  Both are genuinely optional at the type level (no default baked in) — doc comments say
  callers must read `card.autoAnswerRounds ?? 0` themselves, and that omitting the schema
  default is deliberate, for the byte-identical round-trip contract (see below).

### `plugins/tribe/scripts/runner/state.ts`
- **`CardStatusSchema`**: added `'blocked'` to the zod enum.
- **`CardSchema`**: added `dependsOn: z.array(z.string()).optional()` and
  `autoAnswerRounds: z.number().optional()` — deliberately `.optional()`, never
  `.default(...)` (a schema-injected default would appear in the re-serialized file even when
  the source JSON never had the key — that's what would break back-compat).
- **New error `UndefinedDependencyCardError`** — mirrors `UndefinedSequenceCardError` exactly
  one level down: a card's `dependsOn` naming an id absent from `cards`. Exported.
- **New error `CircularDependencyError`** (Warchief ruling 1) — thrown by `parseState` when
  the `dependsOn` graph contains a cycle (including direct self-dependency `A -> A`); carries
  `path: string[]`, the cycle in visit order with the repeated id at both ends. Placed
  immediately after `UndefinedSequenceCardError`, exported, same pattern (name/message/typed
  field).
- **`assertDependsOnReferentialIntegrity`** — new private validator, called from `parseState`
  right after the existing `assertSequenceReferentialIntegrity`. Walks every card's
  `dependsOn` and throws `UndefinedDependencyCardError` for any id not in `cards`.
- **`assertNoDependsOnCycles`** — new private validator (DFS with an `onStack` recursion-path
  set), called from `parseState` last (after referential integrity, so it never has to guard
  an undefined lookup). Throws `CircularDependencyError` on the first cycle found.
- **`parseState`** now runs, in order: `assertKnownVersion` → zod structural parse →
  `assertSequenceReferentialIntegrity` → `assertDependsOnReferentialIntegrity` →
  `assertNoDependsOnCycles`. Malformed state is refused loudly at load, exactly the existing
  pattern's rationale, extended.
- **`computeBlockedCardIds`** — new private function implementing the progressable rule's
  transitive cascade (see "Cascade implementation" below). Unchanged by the audit fix.
- **`reconcileBlockedStatuses`** (added by the audit fix, see below) — new private function:
  trues up **every** card in `state.cards` against `blockedCardIds` before the sequence walk
  starts, both directions (sets `blocked` where newly parked, resets a stale `blocked` back to
  `staged` where the parking has resolved).
- **`nextCard`** — gained the progressable rule (spec §O4). Current (post-fix) shape: before
  the sequence walk, compute `blockedCardIds` via `computeBlockedCardIds(state.cards)` and
  immediately call `reconcileBlockedStatuses(state.cards, blockedCardIds)` so every card's
  stored status already agrees with derived truth. The per-card walk then just needs a direct
  `if (card.status === 'blocked') continue;` alongside the existing shipped/escalated skip
  checks — a separate, un-reconciled "unmet dependency" check still skips (without mutating)
  a card whose dependency is merely unshipped-but-healthy. A card with no `dependsOn` (or an
  empty array) is unaffected — current behavior.

### `plugins/tribe/scripts/runner/state.test.ts`
- Imports `Card`, `CircularDependencyError`, `UndefinedDependencyCardError`.
- Two new test helpers: `cardFixture(overrides)` (a minimal, fully-formed `Card`) and
  `allFilesExistIo()` (an `io` whose `fileExists` always returns `true`, so dependency/block
  tests exercise only the new logic, never the pre-existing `PLANNING_NEEDED` path).
- New `describe('dependsOn / blocked / autoAnswerRounds — schema (Task 1)')`: accepts the new
  fields/status; rejects an unknown `dependsOn` id (`UndefinedDependencyCardError`); rejects a
  self-dependency and a transitive `A -> B -> A` cycle (`CircularDependencyError`, asserting
  the exact `path`); the byte-identical v1 back-compat test (see below).
- New `describe('nextCard — progressable rule (dependsOn / blocked, spec §O4/W6, Task 1)')`:
  13 tests (11 original + 2 added by the audit fix) — no-`dependsOn` independence, empty-array
  independence, healthy-unshipped-skip (dependent status untouched), running-dependency-skip
  (dependent status untouched), escalated-dependency-blocks, already-blocked-dependency-
  propagates, stale-blocked-recomputed (unblocks once the dependency has since shipped),
  **the Warchief audit probe** (stale `blocked` reset to `staged` even when the sequence walk
  never visits that card), **reconciliation-is-total** (a card newly becomes `blocked` even
  when the walk never visits it), two-deps-one-healthy (skip not block), two-deps-one-escalated
  (block), the worst-case-order transitive cascade (`A escalated -> B blocked -> C blocked`,
  `sequence: ['C','B','A']`), and an independent card still shipping amid an unrelated blocked
  cascade.

## Test counts (RED → GREEN)

- **Baseline** (verified before any change, from `plugins/tribe/scripts/runner/`):
  `bun test` → **116 pass / 0 fail**; `bunx tsc --noEmit` → clean.
- **RED**: after writing the new tests only (before touching `state.ts`/`types.ts`), running
  `bun test state.test.ts` failed immediately with:
  `SyntaxError: Export named 'UndefinedDependencyCardError' not found in module
  '.../state.ts'` — 0 pass / 1 fail / 1 error. Confirmed failing for the right reason (feature
  missing), not a typo.
- **GREEN**: after implementing `types.ts` + `state.ts`:
  - `bun test state.test.ts` → **27 pass / 0 fail** (54 `expect()` calls) — one test
    (`'a running (not yet shipped) dependency also merely skips the dependent, not blocks
    it'`) needed a fix on my first pass: I had put the dependency `A` (status `running`) *in*
    `sequence`, so `nextCard` legitimately returned `A` itself as the next candidate (a
    `running` card is not skipped by the pre-existing shipped/escalated checks — that's
    correct, unchanged behavior). I corrected the test to keep `A` out of `sequence` (it's
    mid-flight, resumed elsewhere) so the test isolates "B's only unmet dependency is
    running" cleanly. This was a test-authoring bug on my part, not a production-code
    ambiguity — noted for the reviewer.
  - Full suite: `bun test` → **132 pass / 0 fail** (318 `expect()` calls), **+16 tests** over
    the 116 baseline (7 files, same file count — all new tests landed in `state.test.ts`).
  - `bunx tsc --noEmit` → clean (no output, exit 0).
- **Audit-fix RED → GREEN** (see "Warchief audit fix" section below for the full trace): 2
  more tests added and watched fail for the right reason against the pre-fix code, then fixed.
  Final: `bun test` → **134 pass / 0 fail** (323 `expect()` calls) — **+18 over the 116
  baseline**, **+2 over the original 132-pass submission**. `bunx tsc --noEmit` → clean.

## Warchief audit fix: stale `blocked` was set but never cleared

**The defect, as the Warchief found it.** My original `nextCard` mutated `card.status =
'blocked'` only from *inside* the sequence walk, at the moment a candidate card was evaluated
and found parked. A card the walk never reaches — because an earlier, independent card in
`sequence` makes `nextCard` return before the walk gets that far — keeps whatever `status` it
already had. If that stored status happens to be a stale `blocked` from a previous run, and
the parking dependency has since shipped, the walk's early return means that stale `blocked`
is never corrected. `persistLocalState`/`serializeState` then write exactly that stale status
to disk, and Task 3's report (which the brief itself says renders `blockedOn` straight from
card status) would produce an incoherent line: "B is blocked, blockedOn: A" where A has
shipped. This directly contradicted my own doc comment's claim that "a stored `blocked` is
never trusted" — it wasn't trusted as an *input* to the parking computation, but it was left
untouched as an *output*.

**RED — reproduced exactly the Warchief's probe, as two new tests, before touching
`state.ts`:**

1. `'reconciles a stale blocked status back to staged once its dependency has shipped, even
   when an earlier card in sequence makes nextCard return before ever visiting it (Warchief
   audit probe)'` — `A: shipped`, `B: { status: 'blocked', dependsOn: ['A'] }`,
   `C: staged` (independent), `sequence: ['C', 'B']`. Asserts `state.cards.B.status ===
   'staged'` AND that `serializeState` persists `'staged'`, not `'blocked'`.
2. `'reconciliation is TOTAL, not walk-order dependent: a card that newly becomes blocked is
   marked even when an earlier independent card makes nextCard return before the walk ever
   reaches it'` — the mirror-image case: `D: staged` (independent, returned first),
   `X: { status: 'staged', dependsOn: ['Y'] }`, `Y: escalated`, `sequence: ['D', 'X', 'Y']`.
   Asserts `state.cards.X.status === 'blocked'` even though the walk never reaches `X`.

Ran against the pre-fix code — both failed for the right reason:

```
Expected: "staged"    Received: "blocked"   (test 1 — the stale-blocked defect, exactly as reported)
Expected: "blocked"   Received: "staged"    (test 2 — proves the OLD code also never marked a
                                              not-yet-visited card newly blocked, the same
                                              walk-order-dependence in the other direction)
27 pass, 2 fail, 58 expect() calls
```

**GREEN — the fix.** Replaced the in-loop mutation with `reconcileBlockedStatuses(cards,
blockedCardIds)`, called once, immediately after `computeBlockedCardIds`, before the sequence
walk starts. It walks every card in `state.cards` (not just `sequence`, not just what the walk
would visit) and applies both directions of the invariant:

```ts
function reconcileBlockedStatuses(cards, blockedCardIds) {
  for (const [cardId, card] of Object.entries(cards)) {
    const shouldBeBlocked = blockedCardIds.has(cardId);
    if (shouldBeBlocked && card.status !== 'blocked') {
      card.status = 'blocked';
    } else if (!shouldBeBlocked && card.status === 'blocked') {
      card.status = 'staged';       // never 'running' — see the doc comment: running is
    }                                // re-derived from gh/git by D4, never trusted from disk
  }
}
```

The sequence walk itself simplified as a result: it no longer needs to recompute "is this
unmet dependency parked" per candidate (that's now guaranteed true for every card by the time
the walk runs) — it just adds a direct `if (card.status === 'blocked') continue;` next to the
existing shipped/escalated checks, and keeps a separate (non-mutating) "has an unmet but
healthy dependency" skip for the merely-unshipped case.

`bun test state.test.ts` after the fix: **29 pass / 0 fail** (both new tests green, all 27
prior tests still green, including the byte-identical round-trip — see the explicit re-run
below).

**Live probe, reproducing the Warchief's exact scenario against the real module (not a
mock)** — `A shipped`, `B { status: 'blocked', dependsOn: ['A'] }`, `C staged`,
`sequence: ['C', 'B']`:

```
=== BEFORE the fix (Warchief probe, as reported) ===
nextCard -> card C
B.status after nextCard  : blocked      <-- WRONG: A has shipped, B is genuinely ready
persisted state for B    : blocked      <-- and this is what hits disk

=== AFTER the fix (live run against the module, this session) ===
nextCard -> card C
B.status after nextCard  : staged
persisted state for B    : staged
```

(Run via `bun -e "..."` importing `parseState`/`nextCard`/`serializeState` directly from
`state.ts` — not the test file — to prove it against the real module the way the Warchief's
own probe did.)

**Byte-identical round-trip re-verified after the fix**, isolated:
`bun test state.test.ts -t "byte-identical"` → **1 pass / 0 fail**. Reconciliation only
mutates a card's status when it actually needs to change (`shouldBeBlocked !==
(card.status === 'blocked')`), so a v1 fixture with no `dependsOn` anywhere and no card ever
`status: 'blocked'` computes an empty `blockedCardIds` and reconciles zero cards — nothing is
touched, so nothing is added to the re-serialized bytes.

## Cascade implementation: fixpoint, not topological sort — and why

`computeBlockedCardIds(cards)` iterates `Object.entries(cards)` in a `while (changed)` loop:
each pass, for every card not already `blocked`/`shipped`/`escalated`, checks whether any of
its `dependsOn` targets is `escalated` or already in the growing `blocked` set; if so, adds
the card and sets `changed = true`. The loop repeats until a full pass adds nothing new.

I chose **fixpoint over topological sort** for one reason: `nextCard`'s existing candidate
loop already computes `blockedCardIds` *before* walking `sequence`, so the values used during
that walk must already be a stable, order-independent answer — a single pass keyed to
`sequence` order is exactly the bug Warchief ruling 3 names (`C` visited before `B` is marked,
sees `B` as merely `staged`, gets silently skipped-but-not-marked). A topological sort would
also solve it, but requires establishing an order first (and erroring/degrading on a cycle,
which is already handled earlier at the `parseState` boundary — by the time `nextCard` runs,
the graph is guaranteed acyclic, so termination of the fixpoint loop is guaranteed: each pass
either adds ≥1 new id to a set bounded by `|cards|`, or the loop stops). A fixpoint is simpler
to reason about here (no explicit graph library, no Kahn's-algorithm bookkeeping) and is
manifestly correct regardless of `cards` object key order *or* `sequence` order — which is
exactly what the required test (`A escalated`, sequence deliberately `['C','B','A']`) proves.

Verified live in the suite — `state.test.ts`, test `'transitive blocked cascade computes to a
fixpoint REGARDLESS of sequence order...'`: `A: escalated`, `B: dependsOn ['A']`,
`C: dependsOn ['B']`, `sequence: ['C', 'B', 'A']`. After `nextCard`: `state.cards.B.status ===
'blocked'` and `state.cards.C.status === 'blocked'` — both correctly derived in one call
despite `C` being visited before `B` in the sequence walk, because `blockedCardIds` was
already computed to a fixpoint before the walk began.

## Byte-identical round-trip proof (v1 back-compat)

Test `'a pre-existing v1 state file with none of the new fields round-trips byte-identical'`
in `state.test.ts`:

```ts
const raw = fixtureState(); // no card anywhere declares dependsOn/autoAnswerRounds, no "blocked"
const originalBytes = `${JSON.stringify(raw, null, 2)}\n`; // exactly how serializeState formats

const loaded = await loadState(() => originalBytes);
expect(loaded.cards.C2?.dependsOn).toBeUndefined();
expect(loaded.cards.C2?.autoAnswerRounds).toBeUndefined();

const serialized = serializeState(loaded);
expect(serialized).toBe(originalBytes); // exact string equality, not toEqual on objects
```

This is a real string-equality assertion (`toBe`, not `toEqual`), so it fails if
`serializeState` ever emits a key the source JSON didn't have. It passes because
`dependsOn`/`autoAnswerRounds` are `.optional()` with **no** `.default(...)` in the zod
schema — I verified this independently before writing any implementation code, with a
throwaway script exercising zod directly:

```
$ bun -e "
import { z } from 'zod';
const s = z.looseObject({ a: z.string(), b: z.number().optional() });
const parsed = s.parse({ a: 'x' });
console.log(JSON.stringify(parsed));   // {"a":"x"}
console.log('b' in parsed);            // false
"
```

confirming zod v4's `.optional()` (no default) never materializes the key when it's absent
from the input — so `JSON.stringify` never emits it either, byte-identical round-trip holds.

## Gates (all run from `plugins/tribe/scripts/runner/`, final — post audit-fix)

1. `bun test` → **134 pass / 0 fail** (baseline 116; +18, no regressions).
2. `bunx tsc --noEmit` → clean.
3. `grep -rn 'ai-dict\|todd-skills\|/Users/' *.ts` → matches only in `run.test.ts:121`,
   `run.test.ts:130`, `session.test.ts:89` — all **pre-existing**, untouched by this task, and
   themselves assertions that those strings are ABSENT from runtime config (not hardcoded
   values). `grep -n '...' state.ts state.test.ts types.ts` (the 3 files this task touched) →
   **zero matches** — clean.
4. `state.ts` import check: only `node:path` (pre-existing, for `join`) and `zod` — still a
   pure module, no `fs`/`child_process`.

## Commit

One commit (`986c1e1`, **amended in place** after the audit fix per the Warchief's
instruction — not a second commit), only the 3 files this task touches (`state.ts`,
`state.test.ts`, `types.ts`) plus this report. I deliberately did **not** stage
`.claude/state/campaign-orchestration.md`, even though `git status` shows it modified — that
edit (Warchief findings W-F1/W-F2, scoped to Tasks 2 and 5) predates my session and is the
Warchief's own live STATE file; touching it is outside my brief and would misattribute
authorship of that record. I also left the pre-existing untracked stray files
(`.claude/settings.local.json.doctor-bak`, `b1.txt`, `conflict.txt`) untouched — none are mine
and none are in scope.

## Ambiguities / things I resolved myself (flagging for the Warchief, not the Shaman)

1. **No `- [ ]` checkboxes exist in the plan file to flip.** I grepped
   `docs/superpowers/plans/2026-07-16-campaign-orchestration.md` for `- [ ]`/`- [x]` —
   zero matches; the plan is prose under `### Task N:` headings, not a checklist. I checked
   the predecessor effort (`campaign-runner`, e.g. commit `78d2591`, task 2/7) for precedent:
   its task commits touch only source + a `.claude/state/campaign-runner/reports/task-N.md`
   report — never the plan file — and completion is tracked in
   `.claude/state/campaign-runner.md`'s own status table plus the commit's `Tribe-Task: N/M`
   trailer. I followed the same precedent here: no plan-file edit, and I did not touch
   `.claude/state/campaign-orchestration.md`'s status table either, since the global resume
   protocol assigns "update the STATE file at every state transition" to the orchestrator
   (Warchief), not the Hunter. The done-record for this task lives in the commit's
   `Tribe-Card`/`Tribe-Task` trailers, matching the repo's actual convention. **If this
   reading is wrong and the Warchief wants the STATE table flipped as part of my commit,
   that's a one-line addendum — flag it back to me or the next Hunter.**
2. **Report path.** The brief said `reports/orch-task-1.md`; the STATE file's own task table
   (`.claude/state/campaign-orchestration.md`) names the same path (`reports/orch-task-1.md`,
   repo-root-relative) for row 1, which is a different location than the predecessor effort's
   `.claude/state/campaign-runner/reports/task-N.md` convention. I followed the brief/STATE
   file literally: `reports/orch-task-1.md` at repo root.
3. **`UndefinedDependencyCardError` naming.** The brief said "extend the existing
   undefined-card validation" without naming a specific error class for the `dependsOn` case.
   I chose to mirror `UndefinedSequenceCardError` with a new, analogous, separately-named
   class (`UndefinedDependencyCardError`) rather than reusing the sequence error's exact
   class/message (which explicitly says "sequence names card id..." — reusing it verbatim for
   a `dependsOn` violation would be a misleading message). This felt like the natural reading
   of "extend the existing... validation" (extend the *pattern*, not literally throw the
   sequence-specific error for a different kind of dangling reference) and is consistent with
   how Warchief ruling 1 treats `CircularDependencyError` (a *new* class mirroring the
   existing pattern, not a reuse). **Flagging as an assumption a reviewer should double-check**
   — if the intent was actually to reuse `UndefinedSequenceCardError` itself for both cases,
   that's a one-line change (swap the throw), but I judged the clearer message worth the new
   class, matching the file's existing one-class-per-failure-mode style.
4. **`running` dependency semantics — SETTLED by the Warchief's audit reply.** The Warchief
   confirmed the brief's ruling 4 literally named `staged`/`running` together as
   "unshipped-but-healthy", so treating `running` identically to `staged` (skip, don't block)
   was the correct reading. No longer an open question.
5. **No new `NextCardResult` kind for `blocked`.** The plan/design describe the outcome as "a
   dependent is skipped" and "marked blocked" — I read this as the existing mutate-in-place +
   `continue` pattern (matching how `escalated` cards are already skipped without a dedicated
   result kind), not a new discriminated-union member. Warchief ruling 2 ("nextCard marking
   `card.status = 'blocked'` in place is correct") confirms this reading directly, so I'm
   fairly confident here, but noting it since it's a design-shape choice with no explicit
   plan sentence spelling out "no new result kind."

Nothing here rose to a genuine STOP-and-report — every item above was resolved using the
Warchief's own rulings in the brief, existing code patterns in the same file, or direct
precedent from the predecessor effort's commits. No product/What-Why decision surfaced.

## Assumptions a reviewer should specifically challenge

- That `UndefinedDependencyCardError` (a new class) is preferable to reusing
  `UndefinedSequenceCardError` for a `dependsOn` violation (item 3 above) — the Warchief's
  audit reply agreed with this choice ("keep it"), so this is now resolved, not open.
- That leaving `.claude/state/campaign-orchestration.md` untouched (both the pre-existing
  W-F1/W-F2 edit and the task-1 status row) is correct Hunter scope (item 1 above) — the
  Warchief's audit reply confirmed this too ("correct Hunter scope; the STATE table is mine").
- **Resolved by the audit**: the stale-`blocked`-never-cleared defect (see "Warchief audit
  fix" above) — flagging here only so a future reader of this report sees that the original
  submission's `nextCard` was audited and found to have a real defect, not just a style nit;
  the fix is now covered by two explicit regression tests plus a live-module probe transcript
  matching the Warchief's own.
