# Task 2 report — `state.ts` schema, load/serialize, next-card (campaign runner)

Brief: dispatched by Warchief, Task 2/7 of `docs/superpowers/plans/2026-07-16-campaign-runner.md`.
Branch: `feat/campaign-runner` (already checked out, no new branch created).
Depends on Task 1 (`b264495`), still green.

## TDD sequence (RED -> GREEN -> REFACTOR)

1. Wrote `state.test.ts` first (10 tests) importing `CURRENT_STATE_VERSION`,
   `UnsupportedStateVersionError`, `loadState`, `parseState`, `serializeState`, `nextCard`
   from `./state.ts`, none of which existed yet (state.ts was still the Task 1 placeholder
   `export {}`). Deleted `placeholder.test.ts` at the same time (brief: delete once a real
   test file exists).
2. **RED**, confirmed for the right reason (missing exports, not a typo):
   ```
   $ bun test
   state.test.ts:
   # Unhandled error between tests
   SyntaxError: Export named 'UnsupportedStateVersionError' not found in module
   '.../plugins/tribe/runner/state.ts'.
    0 pass
    1 fail
    1 error
   Ran 1 test across 1 file. [21.00ms]
   ```
3. **GREEN**: implemented `types.ts` (shared types) + `state.ts` (schema/logic). Re-ran —
   all 10 tests pass on the first implementation; no further red/green cycling was needed
   (see Gate output below for the passing run).
4. **REFACTOR**: extracted `resolveMissing` helper inside `state.ts` to avoid duplicating
   the spec/plan-missing check; kept `assertKnownVersion` separate from the zod parse so the
   version check reads as a distinct, named rule (not buried in schema internals). Re-ran
   tests after refactor — still 10/10 green. Also had to fix two `tsc` type errors in the
   test file (casts through `unknown` for the unknown-field-preservation assertions) — ran
   both `bun test` and `bunx tsc --noEmit` again after that fix; both still clean.

## API exposed

`types.ts` (pure types, no logic):
- `CardStatus = 'staged' | 'running' | 'shipped' | 'escalated'`
- `Card` — the 9 D2 per-card fields (`status`, `spec`, `plan`, `branch`, `baseSha`, `pr`,
  `mergeSha`, `sessionId`, `updatedAt`), `baseSha` present-but-nullable per the brief.
- `CampaignState` — `v`, `campaign`, `mergePolicy`, `sequence`, `schemaLockPaths`,
  `ownerOnlyEscalations`, `cards: Record<string, Card>`.
- `StateIO` — `{ repoRoot: string; fileExists(resolvedPath: string): boolean }` (the io seam).
- `NextCardOptions`, `NoCardResult`, `PlanningNeededResult`, `CardResult`, `NextCardResult`
  (discriminated union on `kind`: `'done' | 'planning_needed' | 'card'`).

`state.ts`:
- `CURRENT_STATE_VERSION = 1`
- `class UnsupportedStateVersionError extends Error` (`.version` carries the offending raw
  value; thrown by both `parseState` and `loadState`).
- `CampaignStateSchema` (exported zod schema, in case Task 3/4/6 want to reuse/extend it).
- `parseState(raw: unknown): CampaignState` — checks `v` against `CURRENT_STATE_VERSION`
  FIRST (dedicated typed error), then structurally validates with zod.
- `loadState(readFile: () => string | Promise<string>): Promise<CampaignState>` — signature
  is literally what the brief specified, `loadState(readFile)`: a single zero-arg thunk that
  returns the raw file text (sync or async). Path resolution / the `--state` CLI flag is
  deliberately NOT this module's concern — the caller (Task 6's CLI/loop) owns the path and
  binds it into the thunk, e.g. `loadState(() => Bun.file(statePath).text())`. Flagging this
  as the one place I made an interpretation call — see "Ambiguity" below.
- `serializeState(state: CampaignState): string` — `JSON.stringify(state, null, 2) + '\n'`.
- `nextCard(state, io: StateIO, options?: NextCardOptions): NextCardResult` — walks
  `state.sequence` in order; skips `shipped` always, skips `escalated` unless
  `options.includeEscalated`; for the first eligible card, resolves `card.spec`/`card.plan`
  against `io.repoRoot` (via `node:path` `join` — pure string manipulation, not I/O) and
  checks existence via `io.fileExists`; returns `{ kind: 'planning_needed', cardId, missing }`
  if either is null or doesn't exist, else `{ kind: 'card', cardId, card }`; `{ kind: 'done' }`
  if nothing is eligible.

## Unknown-field preservation

Zod v4 strips unknown keys by default (`z.object()`); I used **`z.looseObject()`** for both
the top-level state schema and the per-card schema instead of the deprecated `.passthrough()`
(confirmed via `node_modules/zod/v4/classic/schemas.d.ts`: `passthrough()` is `@deprecated
Use z.looseObject() or .loose() instead`). `looseObject` keeps unrecognized keys as plain
properties on the parsed object (zod's `$loose` catchall), so they survive
`parseState` -> `serializeState` -> `JSON.parse` unchanged. Test
`'preserves unknown top-level and per-card fields across a load -> serialize cycle'` adds
`note` (top-level) and `reviewer` (per-card, on `C2`) and asserts both survive the full
`loadState` -> `serializeState` -> `JSON.parse` round trip.

## io seam shape

```ts
export interface StateIO {
  repoRoot: string;                              // --repo input, never hardcoded
  fileExists(resolvedPath: string): boolean;      // sync existence check, injected
}
```
`state.ts` imports only `node:path` (pure, no I/O) and `zod` — no `fs`, no `child_process`,
no network call anywhere in the module. Tests fake `io.fileExists` with a `Set<string>`
membership check (`io()` helper in `state.test.ts`) and never touch the real filesystem.

## Campaign-config field names (schema-lock / owner-only lists)

The spec names these as "campaign config in the state file" (D3 point 6, D5) but does not
give exact JSON key names. I named them `schemaLockPaths: string[]` and
`ownerOnlyEscalations: string[]` on `CampaignState`, matching the spec's own descriptive
language ("the schema-lock path list", "the owner-only list"). Fixture values are neutral
(`packages/app/src/domain/sample-types.ts`, `breaking-change`) — not ai-dict's real
`packages/app/src/domain/types.ts` value, per the plan's Task 2 note being disregarded
(owner ruling: ignore ai-dict mentions). If the Warchief/Task 3+ expect different key names,
this is a one-file rename (`types.ts` + `state.ts`), flagged here rather than guessed at
silently.

## Stateless-capability wall check

```
$ grep -rniE "ai-dict|/Users/|~/WORK|sonnet-|claude-3|gpt-4" plugins/tribe/runner \
    --include="*.ts" --include="*.json" | grep -v node_modules
(no output, grep exit 1 = no matches)
```
No repo names, absolute paths, model names, or campaign-specific values in any file I
authored (`types.ts`, `state.ts`, `state.test.ts`). Fixture card ids are `C1`/`C2`/`C3`;
fixture paths are generic (`docs/superpowers/specs/2026-01-01-c1-spec.md`, etc.).

## Scope check

Only `types.ts` and `state.ts` (+ `state.test.ts`) were touched; `run.ts`, `loop.ts`,
`verify.ts`, `github.ts`, `session.ts`, `brief.ts` remain the Task 1 placeholders,
unmodified. No CLI parsing added. `placeholder.test.ts` deleted per the brief.

## Gate output (verbatim, run from `plugins/tribe/runner/`)

### `bun test`
```
$ bun test
bun test v1.3.13 (bf2e2cec)

 10 pass
 0 fail
 22 expect() calls
Ran 10 tests across 1 file. [77.00ms]
```
(Re-ran after the `tsc` fix below: `10 pass / 0 fail`, `40.00ms` — same result, included for
completeness.)

### `bunx tsc --noEmit`
```
$ bunx tsc --noEmit
(no output)
```
Exit code: 0. (First pass surfaced two `TS2352` errors in `state.test.ts` — casting
`CampaignState`/`Card` straight to `Record<string, unknown>` for the unknown-field
assertions, since neither declared type has an index signature. Fixed by casting through
`unknown` first: `loaded as unknown as Record<string, unknown>`. This is test-only; no
production type in `types.ts`/`state.ts` changed.)

## Plan checkboxes

`docs/superpowers/plans/2026-07-16-campaign-runner.md` uses prose `### Task N` sections, not
`- [ ]` checkbox items (confirmed: `grep -n '- \[ \]\|- \[x\]'` on the plan file returns no
matches, and Task 1's commit `b264495` did not touch the plan file either). There is nothing
to tick for this task; noted here rather than silently doing nothing so the Warchief can
correct me if a checkbox convention is expected elsewhere.

## Commit

`78d25918adaaa1fb7278fa412e0d859ea7924269` — "feat(tribe): campaign runner — state schema,
load/serialize, next-card selection (2/7)" (`Tribe-Card: campaign-runner`,
`Tribe-Task: 2/7`). Files: `plugins/tribe/runner/types.ts`, `plugins/tribe/runner/state.ts`,
`plugins/tribe/runner/state.test.ts` (new), `plugins/tribe/runner/placeholder.test.ts`
(deleted), this report.

## Ambiguity flagged (not blocking — reported per Method, no guess made)

1. `loadState(readFile)` signature: brief literally shows a single-argument call. I read this
   as "the caller already knows/binds the `--state` path" (consistent with the CLI living in
   Task 6's `run.ts`, not here) and implemented `readFile: () => string | Promise<string>`
   with no path parameter. If Task 6 instead expects `loadState(readFile: (path: string) =>
   ...)` or a two-arg `loadState(readFile, path)`, that's a small, contained change to this
   file only.
2. Exact JSON key names for the two campaign-config lists (`schemaLockPaths`,
   `ownerOnlyEscalations`) — see "Campaign-config field names" above.

Neither of these forced a product/What-Why decision or contradicted the repo, so I proceeded
rather than blocking — flagging both here per the brief's instruction to leave nothing lost
for a successor.
