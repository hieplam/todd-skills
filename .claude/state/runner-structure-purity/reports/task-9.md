# Task 9 report — `CardCtx` parameter object

## Status: DONE

## Pre-flight
- Verified none of the six target functions are exported: `grep -n "^export" loop.ts` had zero
  hits matching `escalateCard|shipCard|buildSessionIOForCard|performRevertAndRedo|runCardSession|actOnCard`.
- Baseline gate before any change: `bun run check` → tsc silent, **185 pass / 0 fail** (matches brief).

## What changed (all in `loop.ts`, single file)

Added `CardCtx` interface (verbatim doc comment + shape from the plan) directly above
`escalateCard`:

```ts
interface CardCtx {
  cardId: string;
  state: CampaignState;
  resolved: ResolvedConfig;
  io: LoopIO;
}
```

### Six signature rewrites (old → new)

1. `escalateCard(cardId, reason, detail, state, resolved, io)` → `escalateCard(ctx, reason, detail)`
   — destructures `{ cardId, state, resolved, io } = ctx` at top; body (including its existing
   `const card = state.cards[cardId]; if (card) {...}` derivation) unchanged.
2. `shipCard(cardId, card, verifyResult, state, resolved, io)` → `shipCard(ctx, verifyResult)`
   — `card` param dropped; now `const card = state.cards[cardId];` derived after destructuring.
3. `buildSessionIOForCard(card, state, resolved, io)` → `buildSessionIOForCard(ctx)`
   — `card` derived from `state.cards[cardId]` after destructuring.
4. `performRevertAndRedo(card, resolved, io)` → `performRevertAndRedo(ctx)`
   — `card` derived from `state.cards[cardId]` after destructuring (`cardId`/`state` otherwise
     unused past the derivation, same as the plan's block).
5. `runCardSession(cardId, phase, card, state, resolved, io)` → `runCardSession(ctx, phase)`
   — `card` derived from `state.cards[cardId]`; both internal `buildSessionIOForCard(card, state, resolved, io)`
     call sites rewritten to `buildSessionIOForCard(ctx)`.
6. `actOnCard(cardId, phase, state, resolved, io)` → `actOnCard(ctx, phase)`
   — `card` derivation line kept as-is; all internal calls to `shipCard`/`escalateCard`/
     `performRevertAndRedo`/`runCardSession` rewritten to pass `ctx` (+ remaining non-ctx args).

### Call-site updates outside the six functions

- `runPass`: builds `const ctx: CardCtx = { cardId: nc.cardId, state, resolved, io };` once per
  tick (right after the `nc.kind === 'done'` break, before the `planning_needed` branch — the one
  spot both the `planning_needed` and the general-phase paths can share it), then:
  - `escalateCard(ctx, 'planning_needed', \`Missing on disk: ${nc.missing.join(', ')}\`)`
  - `actOnCard(ctx, phase)`
- `runDryRun` was checked and does **not** call any of the six functions (it only calls
  `filteredNextCard`/`deriveCardPhase`) — no change needed there, confirmed by reading the
  function body before editing.

No other files touched; `Card`/`CampaignState`/`ResolvedConfig`/`LoopIO` types are all already
in-scope locally in `loop.ts` (no new imports required).

## Gate output (after the rewrite)

```
$ bunx tsc --noEmit
(silent, exit 0)

$ bun run check
$ bunx tsc --noEmit && bun test
bun test v1.3.13 (bf2e2cec)

 185 pass
 0 fail
 512 expect() calls
Ran 185 tests across 9 files. [179.00ms]
```

Matches the brief's expectation exactly: tsc silent, 185 pass / 0 fail, same count as baseline
(behavior-preserving — same object references, only parameter bundling; the compiler caught every
call site since none of the six functions are exported and their old positional signatures no
longer exist).

## Diff shape
`git diff --stat` before commit: `plugins/tribe/scripts/runner/loop.ts | 98 +++++++++++++++---------------------`
(41 insertions, 57 deletions — net negative, consistent with a parameter-bundling refactor).

`git status` before staging showed only `loop.ts` modified beyond the pre-existing untouched
files (`.c3/*` local modifications, `.claude/state/*`, the plan doc under `docs/superpowers/`) —
none of those were staged or touched.

## Commit
```
commit a417598d23b436693be30f411b51829a7823e4ee
[runner-loop-readability] refactor: Bundle card-scoped parameters into CardCtx
1 file changed, 41 insertions(+), 57 deletions(-)
```
Staged/committed exactly `loop.ts` via `git add loop.ts && git commit -m "..."`. No
Co-Authored-By trailer. No `.c3/`, `.claude/state/`, or `docs/superpowers/` files staged.

## Deviations
None. Implemented exactly per the plan's Task 9 blocks; no scope beyond the six signatures + the
two `runPass` call sites (+ the interface itself).
