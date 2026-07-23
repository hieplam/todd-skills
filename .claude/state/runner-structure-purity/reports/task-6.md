# Task 6 report — ESLint purity wall (kanna's hard rule, ported)

**Status: NEEDS_CONTEXT** — hard environment/toolchain incompatibility, not a config typo.
No commit was made. Working tree left in place (uncommitted) so the Warchief/next Hunter can
inspect state directly; nothing has been reverted.

## What I did, in the brief's step order

### Step 1 — Install
```
$ bun add -d eslint typescript-eslint
```
Result: `eslint@10.7.0` and `typescript-eslint@8.65.0` added to devDependencies (installed
successfully; `bun.lock` updated). Note: plan expected `eslint@^9`; bun resolved the latest
published major, `eslint@10.7.0` — not a deviation I introduced, just what `bun add -d eslint`
(no version pin, per the plan's exact command) resolves to today. This did not cause the
failure below (confirmed — see "Root cause" section).

`package.json` devDependencies now:
```json
"devDependencies": {
  "@types/bun": "^1.3.14",
  "eslint": "^10.7.0",
  "typescript": "^7.0.2",
  "typescript-eslint": "^8.65.0"
}
```

### Step 2 — Created `eslint.config.js`
Created verbatim from the plan's code block (byte-for-byte, including the header comment,
`WORLD` array, `PROCESS_ENV`/`PROCESS_EXIT` selectors, and both config objects for `run.ts` and
pure core). File: `plugins/tribe/scripts/runner/eslint.config.js`.

### Step 3 — Updated `package.json` scripts
Exactly the plan's block:
```json
"scripts": {
  "test": "bun test",
  "lint": "eslint . --max-warnings=0",
  "check": "bun run lint && bunx tsc --noEmit && bun test"
},
```

### Step 4 — `bun run lint` (BLOCKED HERE)

```
$ bun run lint
$ eslint . --max-warnings=0
typescript-eslint does not support TS 7.0.
Please see https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0 to run typescript-eslint using the TS 6 API.
See also https://github.com/typescript-eslint/typescript-eslint/issues/10940 for tracking typescript-eslint's support for TS >=7.1

Oops! Something went wrong! :(

ESLint: 10.7.0

Error: typescript-eslint does not support TS 7.0.
    at Object.<anonymous> (/Users/todd.lam/WORK/_TestScripts/todd-skills/plugins/tribe/scripts/runner/node_modules/typescript-eslint/dist/index.js:52:11)
    ...
EXIT: 2
```

**This is NOT a glob/ignore typo in `eslint.config.js` and NOT a complaint about real source
files.** ESLint never gets to parsing any file in the runner — `typescript-eslint`'s own entry
module aborts at import time, before any config or file is evaluated.

## Root cause (verified, not guessed)

`node_modules/typescript-eslint/dist/index.js:38-52`:
```js
const ts = __importStar(require("typescript"));
const [versionMajor, _versionMinor] = ts.versionMajorMinor.split('.').map(Number);
if (versionMajor >= 7) {
  console.error([
    'typescript-eslint does not support TS 7.0.',
    'Please see https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/#running-side-by-side-with-typescript-6.0 to run typescript-eslint using the TS 6 API.',
    "See also https://github.com/typescript-eslint/typescript-eslint/issues/10940 for tracking typescript-eslint's support for TS >=7.1",
  ].join('\n'));
  throw new Error('typescript-eslint does not support TS 7.0.');
}
```

- The repo's pinned `typescript` (devDependency `^7.0.2`, per this plan's own Tech Stack line
  and Tasks 1-5's `bunx tsc --noEmit` calls) resolves to the **native TS 7 rewrite**. Confirmed:
  `node_modules/typescript/package.json` → `"version": "7.0.2"`; `bunx tsc --version` →
  `Version 7.0.2`; its `exports` map only exposes `./lib/version.cjs` as `.` (the new native
  entry) — there is no classic-API entry point in this package for `typescript-eslint` to load
  instead.
- `typescript-eslint@8.65.0` is the current published latest (checked `bun pm view
  typescript-eslint versions` — highest non-prerelease is `8.65.0`; no `8.66+` or `9.x` exists
  yet). It hard-fails on any `typescript` with major version `>= 7`, by design, pending its own
  tracked issue (#10940, linked in its own error message) — this is not fixed upstream yet.
- `bunx tsc --noEmit` on its own (no ESLint involved) succeeds cleanly (exit 0) — so TS 7 itself
  is fine for the runner's actual build; the incompatibility is specific to
  `typescript-eslint`'s parser refusing to run against a TS7 `typescript` package.

## Why I did not attempt a workaround myself

The brief's guardrail is: "do NOT change eslint.config.js rule semantics or add suppressions...
A glob/ignore typo in the config you may fix... any complaint about actual source code → STOP,
NEEDS_DIRECTION." This failure is worse than a false-positive lint complaint — it is a total
tool crash with no config-level fix available. The only paths I can see to unblock all require a
decision beyond "config correctness" / beyond this task's scope:

1. **Pin `typescript` down to a 6.x line** for the whole runner package — contradicts the plan's
   own stated Tech Stack ("TypeScript 7 (`strict`, `verbatimModuleSyntax`...)") and would revert
   the choice Tasks 1-5 already built and verified against (`bunx tsc --noEmit` against 7.0.2).
2. **Add a second, aliased `typescript` install at 6.x** (e.g. `"typescript-eslint-ts":
   "npm:typescript@^6"`) solely so `typescript-eslint`'s parser can load it, while the real
   build keeps 7.0.2 — a nontrivial toolchain/architecture decision (which package "typescript"
   resolves to for which consumer) that isn't mine to make unilaterally.
3. **Wait / pin an older `typescript-eslint` release that predates the TS7 guard** — I did not
   find one; the guard throws unconditionally for `versionMajor >= 7` in every published
   version up to and including the current latest (8.65.0); there is no flag to bypass it.
4. **Drop `typescript-eslint` and hand-roll a plain-ESLint no-restricted-imports-only config**
   (no TS parser) — would lose the AST `no-restricted-syntax` selectors the plan requires
   (`PROCESS_ENV`/`PROCESS_EXIT`) only if those need type info (they don't — they're plain
   `esquery` selectors on the untyped AST), but still changes the mechanism the plan names
   ("Mechanism ported from kanna... typescript-eslint") — a scope call, not mine to make.

Any of these is a product/tooling decision, not a "config correctness" fix, so I stopped per
the brief rather than guessing.

## Steps NOT executed (blocked by the above)

- Step 5 (both violation-injection proofs) — not run; `bun run lint` never succeeds even on
  clean source, so there's no "clean baseline" to inject violations against yet.
- Step 6 (`bun run check`) — not run (would fail identically at the `lint` stage).
- Step 7 (commit) — not made. No commit exists for this task.

## Current repo state (left as-is for inspection)

```
$ git status
On branch feat/runner-purity-wall
Changes not staged for commit:
  modified:   plugins/tribe/scripts/runner/bun.lock
  modified:   plugins/tribe/scripts/runner/package.json
Untracked files:
  plugins/tribe/scripts/runner/eslint.config.js
  (+ pre-existing untracked local-only artifacts: .claude/state/*, docs/superpowers/plans/*)
```

- `bun test` (whole suite, unaffected by any of the above): still **180 pass / 0 fail** —
  confirmed before starting Step 1, unchanged by anything done since (no runner source file
  was touched, only `package.json`/`bun.lock`/new `eslint.config.js`).
- `bunx tsc --noEmit`: clean, exit 0.

## Question for the Warchief

Which unblock path do you want? Concretely:
- (a) pin `typescript` to a 6.x line for this package (reverts the Tech Stack line's TS7
  choice), or
- (b) add a second aliased TS-6.x install dedicated to `typescript-eslint`'s parser only
  (keeps the real build on TS 7.0.2), or
- (c) accept `typescript-eslint` is currently incompatible with TS 7 upstream and defer Task 6
  until it's fixed (tracked: https://github.com/typescript-eslint/typescript-eslint/issues/10940),
  or
- (d) some other mechanism you'd prefer for the purity wall that doesn't route through
  `typescript-eslint`'s TS-aware parser.

Whichever you choose, please amend Task 6's brief with the exact commands/config to use, and
I (or the next Hunter) will re-run from Step 1 with that ruling in force.
