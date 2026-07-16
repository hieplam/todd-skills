# Task 4-fix report — F3: `commitStateAndMerge` idempotent-branch + always-restore

**Branch:** `worktree-agent-ab8ee3f6010a549f3`
**Commit:** `87ce1e0cab0ba77d42967e9dc8cd8e5905bb548f`
**Scope touched:** `plugins/tribe/runner/github.ts`, `plugins/tribe/runner/github.test.ts` only.

## 0. Setup

Worktree started at `48d691e` (master merge commit), older than `feat/campaign-runner`
(`2bbfe92`). Ran `git merge --ff-only feat/campaign-runner` first, as the brief warned —
fast-forwarded cleanly, no conflicts. `bun install` in `plugins/tribe/runner/` (107 packages).
Baseline confirmed before touching anything: `bun test` → 50 pass / 0 fail; `bunx tsc --noEmit`
→ clean.

## 1. The defect, reproduced (RED first)

Read design spec §D5 (escalation) + §D6 (state commits) in
`docs/superpowers/specs/2026-07-16-campaign-runner-design.md`. Confirmed the bug as described:
`commitStateAndMerge` used a bare `git checkout -b campaign-state/<card>` (fails outright if
that branch already exists) and only restored the base branch on the `merged` success path —
every `escalate` and `commit_failed` return left the target repo sitting on the state branch,
which the branch step itself created.

Added the RED tests first (before any implementation change), then ran `bun test
github.test.ts` against the **unmodified** `github.ts` to watch them fail for the right reason:

```
(fail) commit-failure path: fetching the base branch fails -> commit_failed at "fetch"...
  reason: "unexpected exec call: git checkout -b campaign-state/C2"   (impl still uses -b, no fetch step)

(fail) THE REGRESSION: a second call recovers from state the first (escalating) call left dirty...
  Expected: not "commit_failed"
  Received: "commit_failed"        <- exactly the bug: 2nd call's checkout -b hits the
                                       branch the 1st call created and never cleaned up

(fail) base branch is restored on the success exit path
  Expected: "merged"
  Received: "commit_failed"        <- impl still calls unmocked 'git checkout -b' (no fetch
                                       step existed yet, so the mock's default branch never
                                       matched and it threw "unexpected exec call")

(fail) base branch is restored on the escalate exit path
  Expected: "escalate"
  Received: "commit_failed"

(fail) base branch is restored on a commit_failed exit path
  Expected: true (restore checkout ran)
  Received: false

(fail) base branch is restored even after an unhandled exception from the very first git call
  Expected: true (restore checkout ran)
  Received: false

(fail) a cleanup failure (restore checkout itself fails) does not change the returned outcome
  Expected: {outcome: 'escalate', ...}
  Received: {outcome: 'commit_failed', reason: 'unexpected exec call: git checkout -b ...'}

 1 pass
 15 fail
```

(Full run also failed the 3 pre-existing tests I updated in the same commit — green path,
branch-create-fails, push-fails — because I changed their expected command sequence to match
the fix *before* writing the fix, which is the expected RED shape for tests-that-assert-new-
behavior. All failures were "feature missing" — either the old `checkout -b` command form, the
missing `fetch` step, or the missing base-branch restore — never a typo or bad import.)

## 2. Real-CLI verification of every git command introduced

Per the brief's explicit warning about `verify.ts`'s mocked-vs-real gap, every new git
invocation was run against a real, disposable repo before it went into a mock. Scratch repo at
`/private/tmp/claude-503/.../scratchpad/gitverify/` (bare "remote" + two clones, `work1`/
`work2`), never touching this repo or its worktrees.

**a) Idempotent branch creation — `git checkout -B <name> <origin/base>`, first time (branch absent):**
```
$ git fetch origin master
From .../remote
 * branch            master     -> FETCH_HEAD
$ git checkout -B campaign-state/C2 origin/master
Switched to a new branch 'campaign-state/C2'
branch 'campaign-state/C2' set up to track 'origin/master'.
```

**b) Same command, second time — already ON that branch with local history (the exact "dirtied by a previous run" case):**
```
$ git fetch origin master
$ git checkout -B campaign-state/C2 origin/master
Reset branch 'campaign-state/C2'
branch 'campaign-state/C2' set up to track 'origin/master'.
Your branch is behind 'origin/campaign-state/C2' by 1 commit, and can be fast-forwarded.
```
No error either time — confirms `checkout -B` is genuinely idempotent (create-or-reset),
whether the branch is absent, present-but-elsewhere, or present-and-currently-checked-out. This
is why the fix uses `-B` exclusively and never `-b`.

**c) The push-side gap I found beyond the brief's literal wording — plain push after a reset (retry scenario):**
```
$ git commit -q -m "state update attempt 1"; git push -u origin campaign-state/C2   # succeeds, dirties remote
$ git checkout master                                                                # simulated restore
$ git fetch origin master; git checkout -B campaign-state/C2 origin/master           # simulated retry, resets local
$ git commit -q -m "state update attempt 2"
$ git push -u origin campaign-state/C2
 ! [rejected]        campaign-state/C2 -> campaign-state/C2 (non-fast-forward)
error: failed to push some refs ...
```
This is the SAME regression (F3) manifesting one step later: if the first attempt's push
already succeeded and a *later* step failed (pr_create/pr_edit/merge — all of which run after
push), a retry's plain push is rejected non-fast-forward, and the campaign is stuck exactly as
before, just one step further along. Confirmed the fix:
```
$ git push -u origin campaign-state/C2 --force
 + b1f0c3f...d691bfb campaign-state/C2 -> campaign-state/C2 (forced update)
```
Force-push succeeds; verified from the "remote" side that the pushed commit is exactly the
retry's new state commit (`d691bfb "state update attempt 2"`), not a merge or stale ref. Since
this branch is single-purpose and ephemeral (owned entirely by this helper, deleted on merge),
force-pushing it on every attempt is always correct — it is never a branch a human works on.
Added `--force` to the `git push` invocation as part of the same fix (not a separate concern —
it is required for the retry this brief mandates to actually succeed end-to-end, not just at
the branch-creation step).

**d) Base-branch restore — plain `git checkout <base>`:** verified working from both "already
on base" and "on a divergent branch" starting states in the same scratch session (see
transcript (a)/(b) above — `git checkout master` succeeded in both cases actually tested).

All git commands introduced (`git fetch`, `git checkout -B`, `git push --force`, `git
checkout <base>`) were run against the real CLI first; none were guessed from documentation
alone.

## 3. The fix

`plugins/tribe/runner/github.ts`:

1. **Idempotent branch setup:** `attemptCommitStateAndMerge` (the renamed core logic) now
   does `git fetch origin <baseBranch>` then `git checkout -B <branch> origin/<baseBranch>`
   instead of a bare `git checkout -b <branch>`. This always starts from the up-to-date
   fetched base (never "whatever HEAD happens to be") and never fails because the branch
   already exists locally — it resets it. A `fetch` failure returns `commit_failed` step
   `fetch`; a `checkout -B` failure returns `commit_failed` step `branch` (same step name as
   before, so callers pattern-matching on `step` are unaffected).
2. **Force-push:** `git push -u origin <branch> --force` (was a plain push) — required so a
   retry whose first attempt already pushed can still push its new state commit (§2c above).
3. **Restore-on-every-exit wrapper:** `commitStateAndMerge` is now a thin wrapper: it calls
   the renamed `attemptCommitStateAndMerge` inside a `try/catch` (the catch converts any thrown
   error into `commit_failed` step `unexpected`, exactly as before), then — **unconditionally,
   regardless of which outcome was produced** — runs `git checkout <baseBranch>` in its own
   `try/catch` that swallows any failure. If the outcome was `merged`, it additionally runs
   `git pull --ff-only origin <baseBranch>` (the same ff-sync the old code only ran on
   success, now reached via the same single cleanup point instead of being duplicated inline).
   The `result` variable is computed and fixed *before* cleanup ever runs; cleanup can only
   fail silently, it can never reassign `result`. This satisfies the brief's requirement #3
   verbatim: a cleanup failure cannot mask the original outcome/reason, and it cannot convert a
   valid `escalate` into anything else.

## 4. How the original outcome is guaranteed to survive cleanup failure

Structurally, not by convention: `result` is a `let` bound once, before the cleanup block, and
the cleanup block's own `try { ... } catch { /* swallowed */ }` has no code path that can write
to `result` — it only ever reads `result.outcome` to decide whether to also run `git pull`.
Whether the cleanup's `git checkout`/`git pull` calls succeed, fail, or throw, the function's
final statement is always `return result;` with the value decided before cleanup started. Test
`a cleanup failure (restore checkout itself fails) does not change the returned outcome or
reason` proves this directly: it overrides `git checkout master` to fail, drives the
non-advisory-red path to `escalate`, and asserts the returned object is byte-for-byte the same
`escalate` result (branch/pr/reason/failedChecks) that the non-overridden version produces.

## 5. Required tests added (all in `github.test.ts`, all passing GREEN after the fix)

New `describe` block `commitStateAndMerge — F3: idempotent state branch + base-branch restore
on every exit`:

1. **`THE REGRESSION: a second call recovers from state the first (escalating) call left
   dirty — never commit_failed on a pre-existing branch`** — the test whose absence let the
   defect through. Uses a small stateful git/gh fake (`makeStatefulRepoIo`) that mirrors the
   exact real-git semantics verified in §2 above (plain `checkout -b` fails once the branch
   exists; `checkout -B` always succeeds/resets; plain `push` is rejected non-fast-forward once
   the remote branch has a prior commit, `--force` always succeeds). Calls
   `commitStateAndMerge` twice against the SAME fake — first call's checks stay red for all
   `D6_MAX_RETRIES + 1` polls → `escalate`; second call's checks pass on the first poll. Before
   the fix this failed with `second.outcome === 'commit_failed'` (step `branch`, "already
   exists"); after the fix `second.outcome === 'merged'`. Also asserts no call ever uses the
   old buggy `checkout -b` form.
2. **Base branch restored on each of the four exit paths** — four focused tests: success,
   escalate, commit_failed (via a `gh pr create` failure), and an unhandled exception thrown by
   the very first `io.exec` call (a fake `exec` that throws once then returns OK, so the
   post-catch cleanup call is observable). Each asserts `git checkout master` appears in the
   call log.
3. **Cleanup failure does not change the outcome** — described in §4.

Also strengthened three pre-existing tests to match the fixed command sequence: the green-path
test now asserts the full `fetch → checkout -B → add → commit → push --force → create → checks`
order; the branch-create-fails test now targets `checkout -B` and asserts add/commit/push/gh
never ran; a new `fetching the base branch fails` test covers the new `fetch` step
independently; the push-fails test's override key now matches the `--force` argv.

## 6. Gate output (verbatim)

```
$ bun test
bun test v1.3.13 (bf2e2cec)

 57 pass
 0 fail
 160 expect() calls
Ran 57 tests across 5 files. [131.00ms]

$ bunx tsc --noEmit
(no output — clean)
```

57 = the 50-test baseline + 7 new tests (6 in the new F3 describe block + 1 new `fetch`-failure
test). No pre-existing test was weakened or deleted; the 3 that changed had their *expected
command sequence* updated to match the new (fixed) behavior, not their assertions loosened.

## 7. Walls honored

- No repo names, absolute paths, model names, or campaign values added to source or tests
  (the new stateful fake and all new fixtures use the same neutral `config`/`PASS_CHECK`/
  `FAIL_UNIT_CHECK` values already in the file).
- Only `github.ts` and `github.test.ts` touched — confirmed via `git status`/`git diff --stat`
  before committing.
- D6 retry/waiver policy (`D6_MAX_RETRIES`, `D6_RETRY_SPACING_MS`, the sonar-504 waiver logic)
  untouched; only reused its constant in the new regression test.
- Fixed only F3 — no adjacent refactors beyond what F3's actual fix required (the force-push
  addition is part of the same root cause, verified live in §2c, not a separate concern).

## 8. Plan checkboxes

`docs/superpowers/plans/2026-07-16-campaign-runner.md` uses a "(N/7)" commit-marker
convention, not `- [ ]` checkboxes — confirmed via grep (no `- [ ]`/`- [x]` lines exist in the
file at all). Nothing to tick for this fix task.
