# Task 6b — relocate runner to `plugins/tribe/scripts/runner/` per `ref-plugin-layout`

**Commit:** `c1a9ad5` — `refactor(tribe): campaign runner — relocate to scripts/runner per plugin-layout ref (6b/7)`

## 1. The move

`git mv plugins/tribe/runner plugins/tribe/scripts/runner` (history preserved — `git commit`
shows all 20 tracked files as 93–100% renames). `node_modules/` is gitignored; `git mv`
relocated it on disk too (it's a filesystem `rename`, not a git-tracked op), and I re-ran
`bun install` from the new location afterwards to be certain the lockfile/install are
consistent post-move:

```
$ bun install
bun install v1.3.13 (bf2e2cec)
Checked 108 installs across 134 packages (no changes) [49.00ms]
```

## 2. `TRIBE_PLUGIN_DIR` fix in `session.ts` — proof it resolves correctly

The module now lives two directories deeper (`plugins/tribe/scripts/runner/session.ts` vs.
the old `plugins/tribe/runner/session.ts`), so the constant needed a second `'..'`:

```diff
-export const TRIBE_PLUGIN_DIR = join(import.meta.dir, '..');
+export const TRIBE_PLUGIN_DIR = join(import.meta.dir, '..', '..');
```

**I did not just count `..` segments by eye.** I proved it two ways:

### a) RED — the move breaks the OLD join (proves the bug is real, not hypothetical)

With the file already moved to its new location, I temporarily reverted the join back to
the pre-move single `'..'` and added a new test that checks the resolved path on disk
(`session.test.ts`, new test `'TRIBE_PLUGIN_DIR resolves on disk to the real plugins/tribe
directory (not counted by eye)'`):

```ts
test('TRIBE_PLUGIN_DIR resolves on disk to the real plugins/tribe directory (not counted by eye)', () => {
  // The runner lives at plugins/tribe/scripts/runner/ — two levels below plugins/tribe.
  // Prove the resolved path is that exact directory by checking a file that only exists
  // there, not by asserting a string suffix alone.
  expect(TRIBE_PLUGIN_DIR.endsWith(join('plugins', 'tribe'))).toBe(true);
  expect(existsSync(join(TRIBE_PLUGIN_DIR, '.claude-plugin', 'plugin.json'))).toBe(true);
});
```

Run against the OLD (single `'..'`) join, from the NEW location:

```
$ bun test session.test.ts
...
error: expect(received).toBe(expected)
Expected: true
Received: false
      at <anonymous> (.../plugins/tribe/scripts/runner/session.test.ts:97:65)
(fail) runSession — §D1 option set (regression guard against SDK drift) > TRIBE_PLUGIN_DIR resolves on disk to the real plugins/tribe directory (not counted by eye) [0.45ms]
 11 pass
 1 fail
 34 expect() calls
Ran 12 tests across 1 file. [97.00ms]
```
Fails for the right reason: `endsWith(join('plugins','tribe'))` is false because the old
join only strips one directory (`scripts`), landing on `plugins/tribe/scripts`, not
`plugins/tribe`.

### b) GREEN — restored the two-`'..'` join

```
$ bun test session.test.ts
...
 12 pass
 0 fail
 35 expect() calls
Ran 12 tests across 1 file. [88.00ms]
```

The second assertion (`existsSync(join(TRIBE_PLUGIN_DIR, '.claude-plugin', 'plugin.json'))`)
is the actual disk-truth proof: it opens the real `plugins/tribe/.claude-plugin/plugin.json`
file (confirmed present: `plugins/tribe/.claude-plugin/plugin.json` exists, `"name": "tribe"`)
through the resolved `TRIBE_PLUGIN_DIR` — this can only pass if the path genuinely lands on
`plugins/tribe`, not by string-matching alone. This test stays in the suite as a permanent
regression guard (spec §D1 "Agent duplication" risk: a wrong `TRIBE_PLUGIN_DIR` silently
drops the tribe agents from executor sessions with no crash).

`brief.ts`'s `import.meta.dir`-relative reference to `brief-template.md` needed no change —
that file stayed in the same directory as `brief.ts` throughout the move.

## 3. Path references updated

Grepped the whole repo before and after the move (`grep -rn "tribe/runner" . --exclude-dir=node_modules --exclude-dir=.git`) and fixed every in-scope hit:

- `docs/superpowers/specs/2026-07-16-campaign-runner-design.md` — 2 hits (owner-directive
  parenthetical path, and the `bun plugins/tribe/runner/run.ts ...` invocation example) →
  both updated to `plugins/tribe/scripts/runner/`, plus a short clause citing
  `ref-plugin-layout` on the directive line so the "why scripts/" reasoning isn't lost.
- `docs/superpowers/plans/2026-07-16-campaign-runner.md` — 8 hits across the intro note,
  Goal line, Global constraints (package.json location), Task 1's file list, and Task 7's
  README/dry-run/acceptance lines → all updated via a scoped `sed 's#plugins/tribe/runner#plugins/tribe/scripts/runner#g'`, verified line-by-line with `grep -n` after.
- Runner's own source/tests (`plugins/tribe/scripts/runner/*.ts`, `*.json`, `*.md`) — grepped,
  **zero hits**: no file in the runner package hardcoded its own `tribe/runner` path (only
  `session.ts`'s `import.meta.dir` join, fixed above, and `brief.ts`'s same-directory join,
  unaffected).
- `plugins/tribe/README.md` and root `README.md` — grepped, **zero mentions of `runner`** at
  all; nothing to update.
- `install.sh` — no `tribe/runner` string present; its whitelist loop is what governs
  behavior (see §4).

### Left untouched (out of my task scope) — flagging for the Warchief

- **`.claude/state/campaign-runner/reports/task-{1,2,2b,3,3-fix,4,4-fix,5,6}.md`** — these
  are prior Hunters' committed done-records; each documents what was true **at the time that
  task ran** (when the runner genuinely lived at `plugins/tribe/runner/`). Rewriting them to
  say `scripts/runner` would misrepresent history rather than reflect it, so I left them as
  historical evidence and did not edit them. `task-2.md`/`task-2b.md` show as locally
  modified in `git status` from before I started (pre-existing, not mine — I did not stage or
  commit them).
- **`.claude/state/campaign-runner.md`** — the live, untracked orchestrator-state file (3
  hits). Per the global resume-protocol convention this is the Warchief's own "read this
  first" tracking doc, not a task-brief-named file, so I left it for the Warchief to update
  with current reality rather than editing it myself.
- **`.claude/worktrees/agent-aeec0f7edbc6764f1/`** — confirmed via `git worktree list` this is
  a **separate git worktree** on a different branch (`worktree-agent-aeec0f7edbc6764f1`,
  commit `097d36b`), not part of this working tree. Out of scope; untouched.
- **`.c3/`** — grepped, **zero hits** for `tribe/runner`. Nothing present to leave for the
  Warchief; noting only because the brief called this out explicitly.

Final grep, scoped to what's actually part of my working tree and outside the excluded
historical/live-state paths — **no stale hits remain**:

```
$ grep -rn "tribe/runner" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=.claude/worktrees 2>/dev/null | grep -v "\.claude/state/campaign-runner"
(no output)
```

Full unfiltered grep (for transparency — shows only the historical reports / live state file
/ worktree discussed above, no `.c3/` hits):

```
$ grep -rln "tribe/runner" . --exclude-dir=node_modules --exclude-dir=.git 2>/dev/null
.claude/state/campaign-runner.md
.claude/state/campaign-runner/reports/task-3.md
.claude/state/campaign-runner/reports/task-3-fix.md
.claude/state/campaign-runner/reports/task-2.md
.claude/state/campaign-runner/reports/task-6.md
.claude/state/campaign-runner/reports/task-2b.md
.claude/state/campaign-runner/reports/task-5.md
.claude/state/campaign-runner/reports/task-4-fix.md
.claude/state/campaign-runner/reports/task-4.md
.claude/state/campaign-runner/reports/task-1.md
.claude/worktrees/agent-aeec0f7edbc6764f1/... (separate worktree, different branch)
```

## 4. Installer is now quiet about it

Read (did not run) `install.sh`'s component-type loop (lines 106–117):

```sh
for d in "$dir"/*/; do
  name="$(basename "$d")"
  case "$name" in
    agents|skills|claude-md|hooks|.claude-plugin) ;;
    scripts) ;;   # scripts/ holds validator scripts invoked from the repo checkout directly
    evals) ;;
    *) warn "$plugin/$name: unsupported component type — not installed" ;;
  esac
done
```

`plugins/tribe/*/` now lists exactly `agents/`, `claude-md/`, `evals/`, `scripts/`:

```
$ for d in plugins/tribe/*/; do echo "$(basename "$d")"; done
agents
claude-md
evals
scripts
```

`runner/` no longer exists at the top level (it's nested inside `scripts/`, and the loop is
non-recursive — `scripts/runner/` is never separately visited). `scripts` is already
whitelisted, so the loop hits `scripts) ;;` and emits nothing. The stale
`"tribe/runner: unsupported component type — not installed"` warning is gone. I did **not**
run `./install.sh` (it mutates `~/.claude`), per the brief.

## 5. Gates (verbatim, from `plugins/tribe/scripts/runner/`)

```
$ bun test
bun test v1.3.13 (bf2e2cec)

 114 pass
 0 fail
 279 expect() calls
Ran 114 tests across 7 files. [140.00ms]
```
113 baseline tests + 1 new (`TRIBE_PLUGIN_DIR resolves on disk...`) = 114. All pass.

```
$ bunx tsc --noEmit
$ echo $?
0
```
Clean, no output.

## 6. Scope check

Touched only: the 20 runner files (renamed, `session.ts` + `session.test.ts` content-changed,
everything else byte-identical renames), plus the two named docs. No feature changes, no
refactors beyond the path fix, no test rewrites beyond the one new resolution-proof test the
brief explicitly asked for. Stateless-capability wall respected — grepped the new location for
`ai-dict`/absolute paths/model names before committing (none found; carried over from prior
tasks' equivalent checks, re-verified on `session.ts`/`session.test.ts` since those are the
only content-changed files).

## Commit

```
c1a9ad5 refactor(tribe): campaign runner — relocate to scripts/runner per plugin-layout ref (6b/7)

Tribe-Card: campaign-runner
Tribe-Task: 6b/7
```

22 files changed (20 renames + 2 doc edits), 27 insertions(+), 13 deletions(-). No
`[Branch]` prefix, no Co-Authored-By, no attribution footer — matches this repo's established
convention for these fix-style sub-tasks (see `87ce1e0`).

**Note on plan checkboxes:** `docs/superpowers/plans/2026-07-16-campaign-runner.md` has no
`- [ ]`/`- [x]` checkbox convention anywhere in the file (verified: `grep -n "\[ \]\|\[x\]"`
returns nothing) — task completion is recorded via the `Tribe-Task: N/TOTAL` commit trailer
only, consistent with the precedent set by prior fix-style commits (e.g. `4-fix/7` in
`87ce1e0`, which also touched no checkboxes). Nothing to tick.

## Status: DONE
