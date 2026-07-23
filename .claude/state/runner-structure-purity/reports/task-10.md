# Task 10 report — One home for the `DerivePhaseConfig` literal

## Status
DONE

## Brief
Plan: `docs/superpowers/plans/2026-07-23-runner-structure-purity.md`, "### Task 10: One home for
the `DerivePhaseConfig` literal" (+ Amendments A1-A3, Global Constraints). Working dir:
`plugins/tribe/scripts/runner`. Branch `feat/runner-loop-readability`, started from HEAD
`a417598` (Tasks 8-9 landed).

## Locating the call sites
Plan line anchors (843-847, moved 949-953) were stale after Tasks 8/9's extraction. Located by
`grep -n "deriveCardPhase(" loop.ts`:

```
144:export async function deriveCardPhase(
827:  const phase = await deriveCardPhase(   <- inline literal #1, inside runDryRun
912:    const phase = await deriveCardPhase(  <- inline literal #2, inside runPass
```

Confirmed exactly 2 call sites with an inline `{ repoRoot, escalationsDir, includeEscalated }`
literal (the third `deriveCardPhase(` hit at line 144 is the function declaration itself, not a
call site) — matches the brief's "exactly 2" expectation. No STOP triggered.

## Step 1 — helper added
Added `derivePhaseConfigOf(config: RunLoopConfig): DerivePhaseConfig` directly above
`runDryRun` (next to `DerivePhaseConfig`'s call-site users, per the brief):

```ts
function derivePhaseConfigOf(config: RunLoopConfig): DerivePhaseConfig {
  return {
    repoRoot: config.repoRoot,
    escalationsDir: config.escalationsDir,
    includeEscalated: config.includeEscalated,
  };
}
```

## Step 2 — both inline literals replaced

### Call site 1 — `runDryRun` (built from `config.*`)

Before:
```ts
  const phase = await deriveCardPhase(
    nc.cardId,
    nc.card,
    {
      repoRoot: config.repoRoot,
      escalationsDir: config.escalationsDir,
      includeEscalated: config.includeEscalated,
    },
    io,
  );
```

After:
```ts
  const phase = await deriveCardPhase(nc.cardId, nc.card, derivePhaseConfigOf(config), io);
```

### Call site 2 — `runPass` (built from `resolved.*`, post-Task-8 location)

Before:
```ts
    const phase = await deriveCardPhase(
      nc.cardId,
      nc.card,
      {
        repoRoot: resolved.repoRoot,
        escalationsDir: resolved.escalationsDir,
        includeEscalated: resolved.includeEscalated,
      },
      io,
    );
```

After:
```ts
    const phase = await deriveCardPhase(nc.cardId, nc.card, derivePhaseConfigOf(resolved), io);
```

`ResolvedConfig extends RunLoopConfig`, so `derivePhaseConfigOf(resolved)` type-checks without
any signature change — no semantic change (behavior-preserving refactor per Global Constraints).

Post-edit verification that no inline literal call site remains:
```
$ grep -n "deriveCardPhase(" loop.ts
144:export async function deriveCardPhase(
835:  const phase = await deriveCardPhase(nc.cardId, nc.card, derivePhaseConfigOf(config), io);
911:    const phase = await deriveCardPhase(nc.cardId, nc.card, derivePhaseConfigOf(resolved), io);
```

## Step 3 — gate

```
$ bun run check
$ bunx tsc --noEmit && bun test
bun test v1.3.13 (bf2e2cec)

 185 pass
 0 fail
 512 expect() calls
Ran 185 tests across 9 files. [260.00ms]
```

tsc: silent (clean). Tests: 185 pass / 0 fail — matches the brief's expected baseline exactly (no
count change, as expected for a pure extract-method dedup with no new test).

## Commit

```
git add loop.ts && git commit -m "[runner-loop-readability] refactor: Deduplicate DerivePhaseConfig construction"
```

Result: `5bf9a7372e6364c5a5fcdf1c9d5ff4a2a4804e81`
`1 file changed, 10 insertions(+), 20 deletions(-)` — `loop.ts` only.

Pre-commit `git status` showed the pre-existing, out-of-scope local artifacts (`.c3/*` modified
files, `.claude/state/runner-structure-purity*`, `docs/superpowers/plans/*`) already present
before this task started; none were staged or committed, per the owner rule and the brief's
"Never commit" list.

## Deviations from the brief
None. The plan's line-number anchors (843-847 / 949-953) were stale post-Task-8/9 (as the brief
anticipated — "plan line anchors are stale"); the actual lines were 827-836 and 912-921. The helper
placement ("next to `DerivePhaseConfig`'s other users") was interpreted as directly above the
first call site (`runDryRun`), which is also adjacent to `deriveCardPhase`'s own declaration
region. No task-brief checkbox-ticking was required/possible since the plan file is a local-only
superpowers artifact excluded from commits (Global Constraints: "Never commit: this plan").

## Gate output (verbatim, captured above)
tsc --noEmit: silent / exit 0.
bun test: 185 pass, 0 fail, 512 expect() calls, 9 files.
