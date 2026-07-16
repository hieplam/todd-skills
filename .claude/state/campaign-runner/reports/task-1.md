# Task 1 report — Scaffold + dependency (campaign runner)

Brief: dispatched by Warchief, Task 1/7 of `docs/superpowers/plans/2026-07-16-campaign-runner.md`.
Commit: `b264495e83d79e55a701ca3ce48fdc236e44d1ac`
Branch: `feat/campaign-runner` (already checked out, no new branch created).

## What I created

`plugins/tribe/runner/` (plugin-local, NOT at repo root — repo root has no `package.json`,
confirmed still true after this change: `find . -maxdepth 1 -name package.json` → no match):

- `package.json` — `@tribe/campaign-runner`, `private: true`, `type: module`, `"test": "bun test"`,
  deps `@anthropic-ai/claude-agent-sdk` + `zod`, devDeps `@types/bun` + `typescript` (needed so
  `bunx tsc --noEmit` has a `bun` type-lib and a `tsc` binary — without them the gate fails with
  `TS2688: Cannot find type definition file for 'bun'` / bunx has to network-resolve `typescript`
  ad hoc each run; pinning as devDependency makes the gate reproducible offline after one
  `bun install`).
- `tsconfig.json` — `strict: true`, `noEmit: true`, `types: ["bun"]`, `moduleResolution: "bundler"`,
  ESM (`module`/`target`: `ESNext`), `verbatimModuleSyntax: true`.
- Eight module stubs, each `export {};` plus a one-line comment naming which later task fills it
  in (no logic): `run.ts`, `loop.ts`, `state.ts`, `verify.ts`, `github.ts`, `session.ts`,
  `brief.ts`, `types.ts`.
- `bun.lock` — produced by `bun install`/`bun add`, committed per the brief's instruction.
- `.gitignore` (`node_modules/`) — added because `bun install` populates
  `plugins/tribe/runner/node_modules/`; without this it would be untracked noise / accidental
  future `git add -A` bait. Scoped to this package dir only, not repo-wide.
- `placeholder.test.ts` — one file with `export {}` and no `test()` calls, so `bun test`
  discovers ≥1 file. This was necessary, not optional: `bun test` with **zero** matching files
  exits 1 with `error: 0 test files matching ...` (verified below), which contradicts the
  brief's own gate expectation ("an empty suite passing is the expected result"). One file with
  zero tests inside gives the actual "empty suite passes" behavior (`0 pass / 0 fail`, exit 0).
  Comment in the file notes it can be deleted once Task 2 adds a real `*.test.ts`.

No CLI parsing, no schemas, no logic beyond the placeholder exports — confirmed by reading every
file back before commit.

## Stateless-capability wall check

Grepped `plugins/tribe/runner/**/*.{ts,json}` (source only, not `node_modules/`) for
`ai-dict|/Users/|~/WORK|sonnet-|claude-3|gpt-4` — zero matches outside `node_modules/`
(the SDK's own `.d.ts` files mention model names like `claude-sonnet-5`, `claude-opus-4-8` as
part of its published type definitions; that's third-party dependency content, not our source,
and `node_modules/` is git-ignored so it will never enter the repo). No repo names, absolute
paths, model names, or campaign values appear in any file I authored.

```
$ grep -rniE "ai-dict|/Users/|~/WORK|sonnet-|claude-3|gpt-4" plugins/tribe/runner \
    --include="*.ts" --include="*.json" | grep -v node_modules
(no output)
```

## Resolved dependency versions

- `@anthropic-ai/claude-agent-sdk`: `^0.3.211` (resolved `0.3.211`)
- `zod`: `^4.4.3` (resolved `4.4.3`)
- `@types/bun` (devDependency): `^1.3.14`
- `typescript` (devDependency): `^7.0.2`
- bun runtime: `1.3.13` (pre-installed, per brief)

## Gate output (verbatim, run from `plugins/tribe/runner/`)

### `bun install`
```
$ bun install
bun install v1.3.13 (bf2e2cec)

Checked 108 installs across 134 packages (no changes) [64.00ms]
```
(First run — before `.gitignore`/pinning devDeps existed — resolved+downloaded 143/101 packages
and wrote the initial lockfile; the run above is the clean re-run after all files were in their
final state, showing the lockfile is stable/idempotent.)

### `bun test`
```
$ bun test
bun test v1.3.13 (bf2e2cec)

 0 pass
 0 fail
Ran 0 tests across 1 file. [12.00ms]
```
Exit code: 0.

Note: before adding `placeholder.test.ts`, `bun test` failed:
```
$ bun test
bun test v1.3.13 (bf2e2cec)
error: 0 test files matching **{.test,.spec,_test_,_spec_}.{js,ts,jsx,tsx} in --cwd=".../plugins/tribe/runner"
```
Exit code 1 — this does not satisfy "an empty suite passing", hence the placeholder file.

### `bunx tsc --noEmit`
```
$ bunx tsc --noEmit
(no output)
```
Exit code: 0.

(First run before devDeps were pinned failed with
`error TS2688: Cannot find type definition file for 'bun'` — fixed by adding `@types/bun` +
`typescript` as devDependencies, see above.)

## Files touched (final commit diff)

```
create mode 100644 plugins/tribe/runner/.gitignore
create mode 100644 plugins/tribe/runner/brief.ts
create mode 100644 plugins/tribe/runner/bun.lock
create mode 100644 plugins/tribe/runner/github.ts
create mode 100644 plugins/tribe/runner/loop.ts
create mode 100644 plugins/tribe/runner/package.json
create mode 100644 plugins/tribe/runner/placeholder.test.ts
create mode 100644 plugins/tribe/runner/run.ts
create mode 100644 plugins/tribe/runner/session.ts
create mode 100644 plugins/tribe/runner/state.ts
create mode 100644 plugins/tribe/runner/tsconfig.json
create mode 100644 plugins/tribe/runner/types.ts
create mode 100644 plugins/tribe/runner/verify.ts
```
13 files changed, 351 insertions(+). No files outside `plugins/tribe/runner/` were touched.
Pre-existing untracked files at repo root (`.claude/`, `b1.txt`, `conflict.txt`) were left alone
— not part of this task's scope.

## Plan checkbox note

`docs/superpowers/plans/2026-07-16-campaign-runner.md` uses prose `### Task N: ...` headers
ending in `Commit (N/7).` — it contains **no** `- [ ]` checkbox items anywhere in the file
(verified: `grep -n "- \[ \]\|- \[x\]"` → no matches). There was nothing to flip to `- [x]` for
this task. Flagging this explicitly in case the Warchief's audit expects a checkbox-style
done-record that this plan format doesn't use.

## Commit

```
$ git log -1 --format="%H%n%B"
b264495e83d79e55a701ca3ce48fdc236e44d1ac
feat(tribe): campaign runner — scaffold plugin-local package, tsconfig, module stubs (1/7)

Tribe-Card: campaign-runner
Tribe-Task: 1/7
```
No Co-Authored-By trailer, no attribution footer, no `[Branch]` prefix (per this task's explicit
convention override) — matches the brief's exact commit message and trailer instructions.

## Surprises / things worth the Warchief's attention

1. `bun test` with truly zero test files is a **hard error** (exit 1), not a soft pass — the
   gate's stated expectation ("empty suite passing") required adding one placeholder test file.
   This is a one-line, zero-logic file and gets superseded naturally as Task 2+ add real tests,
   but it wasn't explicitly named in the brief's file list, so flagging the reasoning here rather
   than silently doing it.
2. `bunx tsc --noEmit` needs `@types/bun` + `typescript` as devDependencies to pass
   deterministically/offline — added both, resolved versions above.
3. `typescript@^7.0.2` is what `bun add -d typescript` resolved to right now (native/Go compiler
   line) — flagging in case the Warchief expected a `5.x` "current stable" and wants it pinned
   differently; I left it as `bun install` resolved it, per the brief's "let `bun install` resolve
   them" instruction.
4. Repo root still has no `package.json` — confirmed unchanged.

## Gate summary

- `bun install`: PASS (exit 0)
- `bun test`: PASS (exit 0, 0 pass / 0 fail / 1 file)
- `bunx tsc --noEmit`: PASS (exit 0, no output)
