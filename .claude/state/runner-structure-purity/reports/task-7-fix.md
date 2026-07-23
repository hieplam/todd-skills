# Task 7 fix report — close structural-guard import-form bypasses + docs alignment

**Status:** DONE

## Commit 1 — close guard's import-form bypasses

### Reproduction (mandatory, done BEFORE any test/code change)

```
$ echo "export async function __probe() { return import('node:fs'); }" >> state.ts
$ bun test structure.test.ts
bun test v1.3.13 (bf2e2cec)

 10 pass
 0 fail
 43 expect() calls
Ran 10 tests across 1 file. [121.00ms]
$ git checkout state.ts
```

Confirmed: with a dynamic `import('node:fs')` injected into `state.ts` (a core, non-adapter
file that must never touch a world-touching module), the pre-fix guard stayed fully green —
the `from '...'` regex the old tests used never matches `import(...)` call syntax. The
finding is real; proceeding to fix.

### New tests added (structure.test.ts, inside `describe('structural contract', …)`)

Three tests added after the ambient-state-seal block:
1. `world-touching module specifiers appear nowhere in core files, in any form` — bans the
   bare specifier string (single- or double-quoted) anywhere in comment-stripped source,
   catching `import()`, `require()`, side-effect imports, and double-quoted forms alike.
2. `adapter/orchestrator specifiers appear in core (non-run) files only inside import type` —
   same string-level ban for `.adapter`/`./loop` specifiers, with `import type` stripped
   first (so type-only imports remain legal).
3. `adapters never value-import the orchestrator` — adapters must not value-import
   `./loop.ts`.

### RED proof — new tests catch what old ones missed

```
$ echo "export async function __probe() { return import('node:fs'); }" >> state.ts
$ bun test structure.test.ts
...
(fail) structural contract > world-workched  module specifiers appear nowhere in core files, in any form [4.61ms]
 12 pass
 1 fail
 60 expect() calls
$ git checkout state.ts
```
(Actual failing assertion: `{ file: "state.ts", bad: ["node:fs"] }` vs expected `bad: []`.)

```
$ echo "import './run-io.adapter.ts';" >> report.ts
$ bun test structure.test.ts
...
(fail) structural contract > adapter/orchestrator specifiers appear in core (non-run) files only inside import type [0.85ms]
 12 pass
 1 fail
 58 expect() calls
$ git checkout report.ts
```
(Actual failing assertion: `{ file: "report.ts", bad: ["./run-io.adapter.ts"] }` vs expected
`bad: []`.)

```
$ bun test structure.test.ts
 13 pass
 0 fail
 62 expect() calls
Ran 13 tests across 1 file. [48.00ms]
```
Clean again after both reverts — confirms the new tests are the only thing that flipped, not
noise.

### Gate

```
$ bunx tsc --noEmit
(silent, exit 0)
$ bun test
 185 pass
 0 fail
 512 expect() calls
Ran 185 tests across 9 files. [325.00ms]
```

**Commit:** `6c87d4e` — `[runner-purity-wall] test: Close import-form bypasses in structural guard`

## Commit 2 — docs alignment + README

Per brief:
1. `run.ts` lines 1-8 header replaced verbatim with the given composition-root text.
2. `loop.ts` header: `session.ts` → `session.adapter.ts` in the one sentence naming where the
   SDK stays confined (grep confirmed it was the only occurrence in the first 10 lines).
3. `session.adapter.ts` line 4: `Enforced by structure.test.ts + eslint.config.js, not by
   this comment.` → `Enforced by structure.test.ts (ESLint layer deferred until
   typescript-eslint supports TS >= 7.1 — plan Amendment A3).`
4. `run-io.adapter.ts` (grepped exact text first): `(purity wall — enforced by
   structure.test.ts + eslint.config.js)` → `(purity wall — enforced by structure.test.ts;
   ESLint layer deferred per Amendment A3)`.
5. `README.md`: added a `## Structure` section (placed just before `## Known limitations`,
   the closest existing "code organization" home) — the four roles (kernel/adapters/run.ts/
   core), a 3-row import-direction table, the `bun run check` enforcement note (tsc --noEmit
   + bun test, ESLint deferred to typescript-eslint#10940), and the flat-directory
   filename-convention note.

### Gate (docs-only; structure tests must stay green since comment edits are stripped by `codeOf`)

```
$ bunx tsc --noEmit
(silent, exit 0)
$ bun test
 185 pass
 0 fail
 512 expect() calls
Ran 185 tests across 9 files. [256.00ms]
```

**Commit:** `69aaac1` — `[runner-purity-wall] docs: Align headers and README with the shipped structure`

## Deviations from brief

None. Commit messages used exactly as specified in the brief (no Tribe-Card/Tribe-Task
trailers were requested by this brief, and none were added — brief gave explicit commit
commands to use verbatim). No Co-Authored-By trailer added, per repo convention.

## Files touched

- Commit 1: `structure.test.ts` (+24 lines, 3 new tests)
- Commit 2: `run.ts`, `loop.ts`, `session.adapter.ts`, `run-io.adapter.ts`, `README.md`
  (comment/header/docs edits only — 39 insertions, 9 deletions total)

No files outside the runner directory were touched. No `docs/superpowers/**`,
`.claude/state/**`, or `.c3/**` paths were committed.
