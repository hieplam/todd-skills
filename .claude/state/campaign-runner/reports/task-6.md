# Task 6 report — `loop.ts` + `run.ts`: the loop, §D4 resume matrix, escalation, CLI

**Branch:** `worktree-agent-aeec0f7edbc6764f1` (merged `feat/campaign-runner` @ `e05345f` first,
per the brief's instruction — ff-only)
**Files touched:** `plugins/tribe/runner/loop.ts`, `plugins/tribe/runner/run.ts` (both were
empty stubs), plus new `plugins/tribe/runner/loop.test.ts` and
`plugins/tribe/runner/run.test.ts`. No other module edited.

## TDD discipline followed

`loop.ts`/`run.ts` were stubs (`export {};`). For each, I designed the full public API
(types + function signatures) first, then wrote the complete test suite against that API,
confirmed **RED for the right reason** (compile-time: `SyntaxError: Export named 'X' not
found`, i.e. genuinely missing, not a typo), then implemented to GREEN:

- `loop.ts`: `bun test loop.test.ts` against the stub →
  `SyntaxError: Export named 'EXIT_LOCKED' not found in module '.../loop.ts'` (0 pass / 1
  error) — confirmed missing-feature RED, not a test bug.
- `run.ts`: `bun test run.test.ts` against the stub →
  `SyntaxError: Export named 'parseArgs' not found in module '.../run.ts'` (0 pass / 1 error)
  — same.

After implementing both to match, iterated a handful of real test failures (documented below)
until GREEN, never weakening an assertion to make a test pass.

## Phase-derivation logic (`deriveCardPhase`, the §D4 table)

`deriveCardPhase(cardId, card, config, io)` never trusts `card.status` — every branch is
driven by a gh/git query or an fs check:

1. **Escalation-file short-circuit** (bypassed by `--include-escalated`): checks
   `<escalations-dir>/<cardId>.md` first. This is a crash-safety net for the window between
   "write the escalation file" and "commit `status: escalated` to state" — if a crash lands
   between those two writes, `nextCard()` (state.ts, untouched) would otherwise happily
   re-offer the card since its LOCAL state doesn't yet say `escalated`. `--include-escalated`
   is the explicit human override once they've ruled in `answers.md`.
2. If `card.branch` is null → `fresh` ("no trace" row).
3. Otherwise queries `gh pr view <branch> --json number,state` (new command, verified live —
   see transcript below):
   - `state: MERGED` → `verify_only` (PR merged, not yet shipped: verify + record, no
     session).
   - `state: OPEN` + `sessionId` recorded → `resume` (`reason: 'pr_open'`); no sessionId
     recorded → `fresh` (nothing to attempt — the resume-fallback rule only applies to a
     resume attempt that was actually made).
   - Otherwise (no PR / PR closed) checks `git worktree list --porcelain` +
     `git ls-remote --heads origin <branch>` (both reused, already-verified commands): if
     either shows the branch/worktree exists → `resume` (`reason: 'branch_no_pr'`) when a
     `sessionId` is recorded, else `revert_and_redo`; if neither → `fresh`.

`deriveCardPhase` never itself attempts a resume, spawns a session, or writes anything — it
purely classifies reality. The loop's `runCardSession` does the actual attempting, so a
resume-probe failure (`runSession(...).outcome === 'error'`) can fall back to a fresh session
carrying a crash-recovery digest (built via `buildStateDigest`, injected into
`executorBrief`'s existing `answersContent` param — never a rewrite of `brief.ts`). Falling
back only triggers on `error`, never on `timeout` — a timeout means the prior session might
still be running, so duplicating it would be wrong.

## Dead-pid lock decision + justification

`acquireLock(io)`: reads `.runner.lock` (pid + start time). If a lock exists AND
`io.isProcessAlive(pid)` is true → refuse (`EXIT_LOCKED`), lock is never overwritten. If no
lock, or the recorded pid is **not** alive → the lock is reclaimed (overwritten with the new
pid/time) and the run proceeds.

**Why an OS-level liveness probe (`process.kill(pid, 0)` in the real wiring) instead of a
time-based staleness guess (a lock-age TTL):**

- A TTL is a **guess under uncertainty in both directions**. Too short, and a legitimately
  long-running executor session (the spec's own default session timeout is 3h; a real one
  could run longer) gets its lock reclaimed out from under it while it's still alive —
  producing exactly the double-spawn/duplicate-PR outcome the lock exists to prevent. Too
  long, and a genuinely dead process (the common case: `kill -9`, a crashed VM) leaves the
  runner wedged for the whole TTL window with no way to force it early short of a manual
  `rm .runner.lock` — which is precisely the "wedges forever" failure the brief calls out.
- A liveness probe has **no such window**: `process.kill(pid, 0)` (send signal 0 — a no-op
  existence check, doesn't actually signal the process) either succeeds (process exists) or
  throws `ESRCH` (it doesn't), decided in one syscall, with no time dimension to mis-tune.
- **Residual risk, named honestly:** pid reuse — the OS could theoretically hand the recorded
  pid to an unrelated new process between the crash and the next start, making a genuinely
  dead lock look "alive". This is the standard risk of any pid-based liveness check (not
  specific to this design) and is low-probability on typical pid-recycling timescales for a
  single-operator campaign tool; it is not mitigated further here (e.g. by also comparing
  `startedAt` against the new process's own start time) since the brief scopes v1 to "one
  loop invocation at a time" on a machine the owner controls, not a hardened multi-tenant
  guard. Documented rather than silently accepted.

Tests: `existing lock held by a LIVE pid -> refused, lock is NOT overwritten`; `existing lock
held by a DEAD pid -> reclaimed, never wedges the runner`; `no existing lock -> acquired,
lock written with pid + start time`; `releaseLock removes the lock file`.

## Making the state/escalation-files-only constraint STRUCTURAL

The Warchief's non-negotiable: `github.ts`'s `commitStateAndMerge` assumes its diff is
docs-only **by construction** (only ever commits campaign state files) — its D6 sonar waiver
depends on that assumption, so this module must never be able to hand it a code file.

Two layers, not one:

1. **Type-level narrowing.** `commitStateAndMerge` still accepts a bare `files: string[]`
   (I cannot rewrite `github.ts`). But `loop.ts` never calls it directly — the ONLY call site
   in the whole module is inside `commitState(files: StateCommitFiles, ...)`, and
   `StateCommitFiles` has exactly two named, single-purpose fields (`statePath`,
   `escalationPath?`), never a generic array a caller could populate from arbitrary data
   (e.g. a git diff, an executor's output, a card field). There is no second code path into
   `commitStateAndMerge` anywhere in `loop.ts` — `grep -n "commitStateAndMerge(" loop.ts`
   shows exactly one call, inside `commitState`.
2. **Runtime assertion, belt-and-braces.** `toCommitFileList` (which `commitState` calls
   before ever touching `io.exec`) asserts every path ends in `.json` or `.md` and **throws
   synchronously** otherwise — so even a future edit that smuggled a non-state/escalation
   path into a `StateCommitFiles` value would fail loudly at the call site, before any
   git/gh call, rather than silently reaching the waiver logic. Tested directly:
   `toCommitFileList({ statePath: 'packages/app/src/domain/types.ts' })` throws
   `/only campaign state .* escalation .* files/i`.

Both layers only ever see two concrete values in this module: `resolved.statePath` (the
`--state` input, always `.json`) and `` `${resolved.escalationsDir}/${cardId}.md` `` (always
`.md`) — the only two places `StateCommitFiles` is constructed (`shipCard`, `escalateCard`,
plus the startup pending-commit retry, which replays an already-validated
`StateCommitFiles` from disk).

## `--dry-run` zero side effects

`runLoop` branches to `runDryRun(config, io)` **before** acquiring the lock, before reading
any pending commit, before anything else. `runDryRun`'s own code path calls only: `loadState`
(a read), `filteredNextCard`/`nextCard` (pure + one `io.fileExists` read), and
`deriveCardPhase` (reads: `gh pr view`, `git worktree list --porcelain`,
`git ls-remote --heads`, `io.fileExists`). It has **no call anywhere in its body** to
`writeFile`, `writeLock`, `removeLock`, `writePendingCommit`, `clearPendingCommit`,
`spawnSession`, or `appendLog` — this is a property of the function's call graph, not a
convention. The test `runLoop — --dry-run: zero side effects` proves this by execution, not
inspection: it wraps the mock `LoopIO` so every one of those methods **throws** if called at
all, and additionally wraps `exec` to throw on any mutating argv shape (`git push`,
`git commit`, `git checkout -B`, `gh pr create`, `gh pr merge`, `git worktree remove`,
`git branch -D`) — the test passes clean, meaning none of those calls were ever attempted.

## Real-CLI verification transcript

Reused, already-verified (per the brief, no re-check needed): `gh api pulls/<pr>`,
`gh pr checks --json name,bucket,description`, `git rev-list --parents`,
`git merge-base --is-ancestor`, `git worktree list --porcelain`, `git ls-remote --heads`.

**New commands this task introduces**, run read-only against this repo
(`hieplam/todd-skills`, `todd.lam`'s checkout) — never mutating:

```
$ gh pr view docs/campaign-runner-spec --json number,state,mergedAt,mergeCommit
{"mergeCommit":{"oid":"48d691efc57bb1dec8402bec23366f7ee94f0e65"},"mergedAt":"2026-07-16T11:49:43Z","number":36,"state":"MERGED"}
$ echo "exit=$?"
exit=0

$ gh pr view feat/this-branch-does-not-exist-xyz --json number,state 1>/tmp/out.txt 2>/tmp/err.txt
$ echo "exit=$?"; cat /tmp/out.txt; cat /tmp/err.txt
exit=1
STDOUT: (empty)
STDERR: no pull requests found for branch "feat/this-branch-does-not-exist-xyz"
```
→ confirms `deriveCardPhase`'s `queryPrForBranch`: exit 0 + parseable JSON with `state` when a
PR exists for the branch; exit 1 + empty stdout otherwise (folded into `not_found`).

```
$ git branch --show-current
feat/campaign-runner
$ git symbolic-ref --short refs/remotes/origin/HEAD
origin/master
```
→ confirms `resolveBaseBranch`'s command and the `origin/` prefix strip (used instead of
hardcoding `master`/`main` — stateless-capability wall).

```
$ git worktree remove -h
usage: git worktree remove [-f] <worktree>
    -f, --[no-]force      force removal even if worktree is dirty or locked
```
→ syntax-verified via `--help` only (read-only; this IS a mutating command so it was never
executed against a real worktree). Used by `performRevertAndRedo` as
`git worktree remove --force <path>`.

```
$ git branch -h | grep -A1 '\-D\b'
   -D                    delete branch (even if not merged)
$ git push --help | grep -A2 delete
       -d, --delete
           All listed refs are deleted from the remote repository.
```
→ syntax-verified via `--help` only (both mutating; never executed for real). Used as
`git branch -D <branch>` and `git push origin --delete <branch>` in `performRevertAndRedo`.

## Design decisions not spelled out verbatim in the brief (flagged for review)

- **`baseBranch`** has no `--base-branch` CLI flag in the spec/brief, and hardcoding
  `master` would violate the stateless-capability wall (some repos use `main`). Resolved it
  dynamically at loop startup via `git symbolic-ref --short refs/remotes/origin/HEAD`,
  stripping the `origin/` prefix (falls back to the literal string `master` only if that
  query itself fails — a protocol-level default, not a campaign value, same category as the
  spec's own `--session-timeout` default).
- **"D3 verification fails twice for a card"**: implemented as `verifyWithRetry` — call
  `verifyShipped` once; if it fails, call it again immediately (same process, no restart
  needed); escalate only if BOTH fail. This distinguishes a transient exec/network blip from
  a real, stable finding on an already-merged PR (whose CI/merge facts don't change after the
  fact) without requiring a persisted cross-run failure counter (which would have meant
  adding a field to `types.ts`'s `Card` — avoided since it wasn't necessary and touches a
  frozen module's schema surface).
- **PR body text** for `commitStateAndMerge`'s `GithubConfig.prBody`: generated as a neutral,
  campaign-agnostic sentence (`buildStatePrBody`) rather than imitating any specific target
  repo's PR template — the brief has no `--pr-body-template` flag, and Task 4's own doc
  comment is explicit that `prBody` convention text is supplied by the caller and this
  capability never hardcodes a repo's convention.
- **Session error/timeout with no D4 fallback available** (a `fresh`/`revert_and_redo`
  session, or a resume's own fresh-with-digest fallback, itself errors/times out): not
  treated as a D5 human-decision escalation (nothing for a human to rule on — no
  NEEDS_DIRECTION, no verify failure, no missing plan). The loop returns `{kind: 'stopped'}`
  and exits `EXIT_SESSION_INCOMPLETE` (3) without escalating; the card's `sessionId`/`branch`
  are already recorded locally (write locality), so the next external re-invocation resumes
  it via the same D4 derivation. Flagging this as a design call the Warchief should confirm
  matches intent — the brief's escalation trigger list (`needs_direction` / double
  verify-fail / `PLANNING_NEEDED`) doesn't explicitly cover this branch.

## Tests (33 in `loop.test.ts`, 18 in `run.test.ts`)

- `deriveCardPhase`: all 5 §D4 rows (no-trace→fresh, PR-merged→verify_only, PR-open+sessionId
  →resume/pr_open, PR-open+no-sessionId→fresh, branch/worktree+sessionId→resume/branch_no_pr,
  branch/worktree+no-sessionId→revert_and_redo) + escalation-file short-circuit +
  `--include-escalated` bypass.
- Lock: no lock→acquired; live pid→refused, not overwritten; dead pid→reclaimed;
  `releaseLock` removes.
- `isStopRequested`, `resolveBaseBranch` (incl. fallback).
- `toCommitFileList`: accepts state-only / state+escalation; throws on a `.ts` path.
- `extractMergeSha`: extracts from the `merged` point's detail; null when absent.
- `runLoop`: full happy path over two fresh cards (both ship); crash-resume via the
  `verify_only` phase (PR already merged, no session spawned); resume-probe failure →
  fresh-with-digest (asserts the second spawned brief contains the digest, never the
  short continuation prompt); STOP file (zero cards processed, no session spawned); lock
  contention (refused, lock never overwritten); escalation flow — `NEEDS_DIRECTION`,
  `PLANNING_NEEDED`, and the commit-failure path (exit code 2 + escalation file stand even
  though the state commit failed, and a pending-commit marker is written for retry); double
  verify-fail → escalation (asserts `verifyShipped`'s `gh api` call fired exactly twice, never
  escalating on one failure); `--dry-run` zero-side-effects (incl. the acceptance-test
  fixture shape: next card derives to `fresh`); a session error/timeout with no D4 fallback
  path stops the run (`EXIT_SESSION_INCOMPLETE`) without escalating.
- `run.test.ts`: `parseArgs` — all required flags present/each-missing-individually;
  `--session-timeout`/`--logs-dir` defaults (3h, `<state dir>/logs`); `--dry-run`/
  `--include-escalated` default false; `--cards`/`--max-cards` default undefined; explicit
  overrides for all of the above incl. duration unit parsing (`30m`/`90s`/`5000ms`/plain ms)
  and invalid-input errors; stateless-capability wall (`ai-dict` never appears in a default).

## Gate output (verbatim)

```
$ bun test
bun test v1.3.13 (bf2e2cec)

 113 pass
 0 fail
 277 expect() calls
Ran 113 tests across 7 files. [164.00ms]

$ bunx tsc --noEmit
$ echo $?
0
```

(113 = the 62-test baseline + 33 new in `loop.test.ts` + 18 new in `run.test.ts`.)

## Scope check

`git status --short` after implementation shows exactly 4 changed/new files:
`plugins/tribe/runner/loop.ts` (M), `plugins/tribe/runner/run.ts` (M),
`plugins/tribe/runner/loop.test.ts` (??), `plugins/tribe/runner/run.test.ts` (??). No other
module (`verify.ts`, `github.ts`, `session.ts`, `brief.ts`, `state.ts`, `types.ts`) was
touched — their existing exported APIs were consumed as-is. `grep -rn "ai-dict"
loop.ts run.ts loop.test.ts run.test.ts` matches only the one test string in
`run.test.ts` that asserts the wall itself (`.not.toContain('ai-dict')`) — no leaked
repo/path/model/campaign value anywhere else.

## Plan file note

`docs/superpowers/plans/2026-07-16-campaign-runner.md` carries this campaign's tasks as prose
(no `- [ ]` checkbox syntax anywhere in the file — confirmed via
`grep -n '\- \[ \]\|\- \[x\]'`, zero matches). Checked `git log` for all five prior task
commits (2/7 through 5/7 incl. two fix rounds): none of them touched the plan file either —
the report file (`.claude/state/campaign-runner/reports/task-N.md`) plus the
`Tribe-Card`/`Tribe-Task` commit trailers are this campaign's established done-record. This
commit follows that same precedent.

## Branch / commit

Branch: `worktree-agent-aeec0f7edbc6764f1`. Commit hash recorded after `git commit` (see the
Hunter's final reply to the Warchief for the exact SHA).
