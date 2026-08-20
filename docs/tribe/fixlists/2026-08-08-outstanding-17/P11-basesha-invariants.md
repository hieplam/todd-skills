# P11 — baseSha invariants: stale bases can no longer produce false schemaGuard trips

- **Status:** SHIPPED — PR #85, merge `9d9b502` (2026-08-13).
- **Incident:** log lines 200–210. Cards hand-reset to `staged` (with `sessionId: null`)
  kept their campaign-start `baseSha`; `recordBaseSha` never overwrites an existing value
  (`core/loop/card-actions.ts:262`, `if (card.baseSha) return`), so B13's verify diffed
  from before A1's designed ports.ts change and tripped schemaGuard on a PR that touched
  ports.ts zero times. Ruling R3: a stale base is worse than no base.

## Decision — two layers

1. **Blind-fresh spawns re-stamp the base.** When a card starts with NO prior world (no
   session, no PR, no digest — the `fresh`-without-digest phase), any pre-existing
   `baseSha` is by definition stale or hand-authored → overwrite with the spawn-time
   base. Resume/fresh-with-digest phases keep the existing base (the card genuinely
   started from it — the current comment's rationale stands for those).
2. **State load normalizes the impossible combo.** A card with `status: 'staged'`,
   `sessionId: null`, but `baseSha` set is invalid by invariant → normalize `baseSha` to
   null on load and surface a warning (do not hard-fail: the fix is deterministic and
   safe).

## Implementation guide (fresh session, smaller model)

Run tests with: `cd plugins/tribe/scripts/runner && bun test`.

### Step 1 — `recordBaseSha` learns the phase (`core/loop/card-actions.ts`)

- Change signature (line ~259) to `recordBaseSha(ctx: CardCtx, phase: CardPhase)`.
- Replace `if (card.baseSha) return;` with:

  ```ts
  const blindFresh = phase.kind === 'fresh' && !phase.digest;
  if (card.baseSha && !blindFresh) return;
  ```

  (Check `CardPhase`'s exact shape in `core/loop/phase.ts` — if the fresh variant's
  digest field is named differently, follow the code, not this sketch.)
- Update the call site `actOnCard` line ~331: `await recordBaseSha(ctx, phase);`.
- Update the function's doc comment: idempotent for resume-class phases; a blind fresh
  re-stamps (ruling R3, 08-08 campaign: stale base worse than no base).
- Tests in `core/loop.test.ts`: blind fresh + stale baseSha → overwritten with current
  `rev-parse` result; fresh-with-digest + baseSha → kept; resume + baseSha → kept.

### Step 2 — load-time normalization (`core/state.ts`)

- In `loadState` (find it; it parses and validates the state file), after parsing, for
  each card: if `status === 'staged' && sessionId == null && baseSha != null` → set
  `baseSha = null` and record a warning string
  `"<cardId>: cleared stale baseSha on staged card (R3 invariant)"`.
- Surface warnings without breaking the signature contract: if `loadState` returns the
  state directly, add an optional out-param or a `warnings: string[]` field on the
  returned object ONLY if a non-breaking spot exists; otherwise `console.error` at the
  single call sites (`run-loop.ts:251`, `cli/main.ts:170`) is acceptable — pick the
  smallest change consistent with the file's style (state.ts is pure: prefer returning
  warnings, printing at the edge).
- Tests in `core/state.test.ts`: the combo normalizes + warns; a running card with
  baseSha untouched; a staged card with null baseSha untouched.

### Acceptance

Replaying the 08-08 reconciliation (reset cards keep stale baseSha) no longer produces
the B13 false positive: load normalizes the base to null, the blind-fresh spawn stamps
the true current base, schemaGuard diffs from the right commit.

### Out of scope

A `reset-card` CLI subcommand (so humans never hand-edit state.json) — worth doing, but a
separate change; note it in the final report to the owner.
