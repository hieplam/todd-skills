# Task 2b — fix report

## Defect

`plugins/tribe/runner/state.ts`'s `nextCard()` silently `continue`d past a `sequence` entry
whose id had no matching `cards` entry. If that id were the only unshipped card, the loop
would fall through to `{ kind: 'done' }` — reporting the campaign complete while a card was
never built. Not reachable through `zod`'s structural schema check (`sequence: string[]`,
`cards: Record<string,Card>` are independently valid; the schema can't express the
cross-field constraint that every `sequence` id must resolve into `cards`).

## Option chosen: reject at parse time (Warchief's preferred option)

Implemented as the Warchief steered: a referential-integrity check inside `parseState`,
run immediately after the structural `zod` parse, alongside the existing
`assertKnownVersion` check. No concrete reason turned up during implementation to prefer
the alternative (a distinct `nextCard` result kind) — the parse-time check:

- matches the module's existing posture of refusing malformed state loudly, up front, with
  a dedicated typed error (`UnsupportedStateVersionError` was already doing exactly this
  for the version field) — this is now the second instance of the same pattern, not a new
  one;
- catches the typo the moment the file is loaded (at `loadState`/`parseState`), rather than
  mid-campaign inside `nextCard`'s loop, which is a strictly earlier and clearer failure
  point for an unattended runner;
- keeps `NextCardResult`'s union exactly as it was (`done` / `planning_needed` / `card`) —
  `nextCard` never has to see an invalid state in the first place, so it doesn't need a
  fourth result kind to describe an input it should never receive.

New typed error: `UndefinedSequenceCardError` (same shape/conventions as
`UnsupportedStateVersionError`: extends `Error`, carries the offending value as a readonly
field — `cardId` here vs. `version` there — sets `this.name`, doc comment explaining what it
guards against and why the schema alone can't catch it).

`parseState` now does: `assertKnownVersion(raw)` → structural `zod` parse → new
`assertSequenceReferentialIntegrity(state)`, which walks `state.sequence` and throws
`UndefinedSequenceCardError(cardId)` for the first id not present as a key in `state.cards`.

`nextCard`'s `if (!card) continue;` line is untouched — once `parseState` is the only path
that produces a `CampaignState`, that branch cannot be reached in normal use, and I did not
want to touch a file this task's brief didn't name (also: no adjacent Hunter is safe to
collide with on `nextCard`'s surrounding lines, but `types.ts`/`state.ts`/`state.test.ts`
was this task's declared scope regardless).

## TDD proof

### RED — failing test written first, run before any fix

Added to `state.test.ts` (new `describe('sequence/cards referential integrity', ...)`
block) a test with a state whose `sequence` includes `'C4'`, an id absent from `cards`,
asserting `parseState` throws the new `UndefinedSequenceCardError`. Also added the
(not-yet-existing) `UndefinedSequenceCardError` import.

Ran `bun test` before touching `state.ts` — fails for the right reason (the new export
doesn't exist yet, i.e. the guard is genuinely missing, not a typo in the test):

```
$ bun test
bun test v1.3.13 (bf2e2cec)

state.test.ts:

# Unhandled error between tests
-------------------------------
1 | })
2 | {
    ^
SyntaxError: Export named 'UndefinedSequenceCardError' not found in module '/Users/todd.lam/WORK/_TestScripts/todd-skills/plugins/tribe/runner/state.ts'.
      at loadAndEvaluateModule (2:1)
-------------------------------


 0 pass
 1 fail
 1 error
Ran 1 test across 1 file. [23.00ms]
```

(Baseline before this task, confirmed separately: `bun test` on unmodified `state.ts`/
`state.test.ts` → `10 pass, 0 fail, 22 expect() calls`.)

### GREEN — after implementing `UndefinedSequenceCardError` + `assertSequenceReferentialIntegrity`

```
$ bun test
bun test v1.3.13 (bf2e2cec)

 11 pass
 0 fail
 23 expect() calls
Ran 11 tests across 1 file. [29.00ms]
```

All 10 pre-existing tests still pass (including both unknown-field-preservation
round-trip tests — the loose-object schema behavior is untouched), plus the new test.
Test count: **10 → 11** (was 10 before this task per the brief; +1 new test, 0 removed,
0 weakened).

## Gates (verbatim, from `plugins/tribe/runner/`)

```
$ bun test
bun test v1.3.13 (bf2e2cec)

 11 pass
 0 fail
 23 expect() calls
Ran 11 tests across 1 file. [29.00ms]
```

```
$ bunx tsc --noEmit
(no output — clean)
```

## Scope

Touched only `plugins/tribe/runner/state.ts` and `plugins/tribe/runner/state.test.ts`
(`git status --porcelain plugins/tribe/runner` confirms exactly these two files changed).
`types.ts` was in the brief's allowed set but did not need a change — the new error is a
runtime class (like `UnsupportedStateVersionError`), not a type, so it lives in `state.ts`
next to its sibling. No new dependencies. No other file touched (no `run.ts`, `loop.ts`,
`verify.ts`, `github.ts`, `session.ts`, `brief.ts` — respecting the other Hunters'
concurrent worktrees). No stateless-capability violations introduced (no repo names, no
absolute paths, no model names — fixtures stayed on the existing neutral `C1`/`C2`/`C3`/
`sample-campaign` values, extended with a `C4` id that is deliberately never defined).

## Commit

```
fix(tribe): campaign runner — reject state whose sequence names an undefined card (2b/7)

Tribe-Card: campaign-runner
Tribe-Task: 2b/7
```

SHA: filled in after commit (see final report line below).
