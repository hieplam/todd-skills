# Task 5 report — Extract `run-io.adapter.ts` from `run.ts`

**Status:** DONE

## Steps performed (plan order)

1. **Flip the guard.** Replaced the last `test.todo('run.ts is pure wiring…', () => {});` line
   in `structure.test.ts` with the live test from the plan:
   ```ts
   test('run.ts is pure wiring: no node:fs / node:child_process import', () => {
     expect(allImportsOf('run.ts').filter((s) => WORLD.includes(s))).toEqual([]);
   });
   ```

2. **RED proof — ran `bun test structure.test.ts` before touching `run.ts`:**
   ```
   (fail) structural contract > run.ts is pure wiring: no node:fs / node:child_process import [3.13ms]
   - []
   + [
   +   "node:fs",
   +   "node:child_process",
   + ]
    7 pass
    1 fail
   ```
   Failed for the right reason: `run.ts` still imports `node:fs` and `node:child_process` at
   the time of the run.

3. **Anchor grep before editing** (`grep -n "realExec\|buildRealIo\|isProcessAlive\|spawn\|sdkSpawnSession" run.ts`):
   ```
   4:// wiring — gh/git via `child_process`, the filesystem, the real SDK spawn (`sdkSpawnSession`
   6:// deliberately NOT unit-tested, same precedent as session.ts's `sdkSpawnSession`: the logic
   11:import { spawn } from 'node:child_process';
   23:import { sdkSpawnSession } from './session.adapter.ts';
   144:function realExec(cmd: string[], opts?: { cwd?: string }): Promise<ExecResult> {
   146:    const child = spawn(cmd[0] as string, cmd.slice(1), { cwd: opts?.cwd });
   156:function isProcessAlive(pid: number): boolean {
   165:function buildRealIo(config: RunLoopConfig): LoopIO {
   171:    exec: realExec,
   192:    isProcessAlive,
   208:    spawnSession: (params: SpawnSessionParams): AsyncIterable<SessionMessage> => sdkSpawnSession(params),
   249:  const io = buildRealIo(parsed.config);
   ```
   (Line numbers were slightly shifted from the plan's 153-223 estimate due to normal drift
   from prior tasks — content matched exactly, so no ambiguity.)

4. **Created `run-io.adapter.ts`** — verbatim from the plan's code block (header comment,
   `realExec`, `isProcessAlive`, `export function buildRealIo`).

5. **Stripped `run.ts`:**
   - Deleted the `node:fs` and `node:child_process` imports.
   - Deleted the `import { sdkSpawnSession } from './session.adapter.ts';` and
     `import type { SessionMessage, SpawnSessionParams } from './session.ts';` lines (both were
     used only inside `buildRealIo`).
   - Trimmed the `./loop.ts` import block down to only what's still used in `run.ts`
     (`runLoop`, `stateDirOf`, `LoopIO`, `LoopResult`, `RunLoopConfig` — `ExecResult`,
     `LockInfo`, `PendingCommit` were used only inside the deleted `buildRealIo` block, verified
     by grep before removal).
   - Deleted the "Real-world wiring" banner comment + `realExec`/`isProcessAlive`/`buildRealIo`
     block in full.
   - Added `import { buildRealIo } from './run-io.adapter.ts';`.
   - Kept `import { dirname, join } from 'node:path';` — verified still used:
     `grep -n "dirname\|join("` shows `parseArgs` (`defaultLogsDir = join(dirname(join(...` )
     and `tryWriteReport` (`io.readFile(join(config.repoRoot, config.statePath))`).

## Gate — verbatim output

```
$ bunx tsc --noEmit
(silent, exit 0)

$ bun test
bun test v1.3.13 (bf2e2cec)

 180 pass
 0 fail
 476 expect() calls
Ran 180 tests across 9 files. [287.00ms]
```

**180 pass / 0 todo / 0 fail** — matches the brief's expected count (the plan's own "179 pass"
was an off-by-one per Amendment A1, same pattern; 180 = 179 + the now-flipped last todo).

## CLI smoke test (plan Step 6)

```
$ bun run.ts --dry-run 2>&1 | head -3
campaign runner: missing required flag: --repo
```
Exact match to expected — parse still works, no import crash.

## Diff scope

```
$ git diff --stat (pre-commit)
 plugins/tribe/scripts/runner/run.ts            | 84 +-------------------------
 plugins/tribe/scripts/runner/structure.test.ts |  4 +-
 2 files changed, 4 insertions(+), 84 deletions(-)
(+ new file plugins/tribe/scripts/runner/run-io.adapter.ts)
```
Only the three files named in the brief changed. No plan file, `.claude/state/**`, or `.c3/**`
staged or committed (confirmed via `git status --porcelain` before `git add`).

## Commit

```
5406a00d448b4b653c77a2913a8e18587bcdbdca [runner-purity-wall] refactor: Extract production LoopIO into run-io.adapter.ts
 plugins/tribe/scripts/runner/run-io.adapter.ts | 82 +++++++++++++++++++++++++
 plugins/tribe/scripts/runner/run.ts            | 84 +-------------------------
 plugins/tribe/scripts/runner/structure.test.ts |  4 +-
 3 files changed, 86 insertions(+), 84 deletions(-)
```
No Co-Authored-By trailer, no attribution footer.

## Plan checkbox record

Ticked Task 5's `- [ ]` → `- [x]` in the LOCAL-ONLY plan file
(`docs/superpowers/plans/2026-07-23-runner-structure-purity.md`) for continuity — this file is
untracked in git (confirmed via `git status --porcelain` showing `??` both before and after the
edit) and was never staged or committed, per Global Constraints ("Never commit: this plan").

## Deviations from the brief

None. Every step executed as specified; all verification commands matched expected output
exactly (except the pre-known A1 off-by-one on the pass count, which the brief itself told me
to treat as expected).
