# Plan — `test-review-cell-v3.sh` strict mode and bounded pass-range walk

**Card:** `review-cell-v3-strict-mode` · **Spec:** `docs/superpowers/specs/2026-09-04-review-cell-v3-strict-mode-design.md`
**Branch:** `chore/review-cell-v3-strict-mode` · **Base:** latest `origin/master` (after `pregate-host-config-isolation` merged) · **Worktree:** `/Users/hip/repo/todd-skills-wt/review-cell-v3-strict-mode`

Two tasks, one commit each, sequential (Task 2's measurement must be taken on a strict-mode suite).

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **Purity:** core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see `~/.claude/rules/pure-core.md`).
- **Worktree-first:** work in `/Users/hip/repo/todd-skills-wt/review-cell-v3-strict-mode` on branch `chore/review-cell-v3-strict-mode`, created from
  the latest `origin/master` at dispatch time. Never work in `/Users/hip/repo/todd-skills` itself.
- **Commit rules:** each task ends in exactly ONE commit (an audit fix round adds its own single
  commit). Tick this plan's checkboxes for the task in the SAME commit as the code. The commit
  message's final paragraph carries, one per line: `Tribe-Card: review-cell-v3-strict-mode`, `Tribe-Task: N/2`,
  `Campaign: followups-2026-09-04`. **Never add a `Co-Authored-By` trailer of any kind** —
  `pre-gate.sh` blocks on it. Push after every commit.
- **Toolchain:** the system `bash` 3.2.57 is the bash that must parse and run every shell file
  (verify with `bash -n`); C3 commands run only as `bunx @c3x/cli@11.6.3 <op>`; never stage
  `c3.db`, `c3.db-shm` or `c3.db-wal`. Every command stays under 600 s; nothing is backgrounded.
- **Do not touch** `plugins/tribe/scripts/runner/`, `plugins/tribe/scripts/viewer/`, or any
  file the live `feat/i74-mechanical-heartbeat` branch changes (`plugins/tribe/README.md`,
  `plugins/tribe/skills/orchestrate-campaign/SKILL.md`, `plugins/tribe/scripts/tests/test-watchdog-*.sh`,
  `.c3/c3-2-plugins/c3-215-tribe.md`, `.c3/adr/adr-20260904-mechanical-heartbeat-supersedes-p14.md`).
- **`pre-gate.sh` is NOT edited. Zero lines.** Only `plugins/tribe/scripts/tests/test-review-cell-v3.sh` changes.
- **No assertion's expectation changes; the tally stays equal to the branch base's tally** (expected
  `51 passed, 0 failed` without `PREGATE_INNER`).
- **Delivery chain (Warchief):** pre-gate over `origin/master..HEAD` green → tracker → two
  independent skinners (contract lens + cold lens, dispatched concurrently) → scout survey →
  before/after evidence per the spec's Evidence plan in the PR body → `gh pr merge <n> --merge`
  (regular merge only) → local master fast-forwarded → worktree removed → `SHIPPED`. A What/Why
  question is `NEEDS_DIRECTION` to the Shaman, never a guess.
- Hunters report to the Warchief at the report-file path given in their dispatch; they do not open
  PRs, merge, or dispatch agents.

---

### Task 1: strict mode — `set -u` becomes `set -euo pipefail`

**Contract:** spec section "C1". **File:** `plugins/tribe/scripts/tests/test-review-cell-v3.sh`.

- [x] **Step 1: Baseline**

```bash
cd /Users/hip/repo/todd-skills-wt/review-cell-v3-strict-mode
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh 2>&1 | tail -1
grep -n '^set ' plugins/tribe/scripts/tests/test-review-cell-v3.sh
```

Expected: `51 passed, 0 failed` and `8:set -u`. Record the tally; it is the number Task 1 must
reproduce exactly.

- [x] **Step 2: Change the header and watch the suite break (RED)**

Change line 8 to `set -euo pipefail`. Run the suite. Expected: it aborts early (exit non-zero, no
final tally or a short one). Paste the last lines of output — this is the RED that proves strict
mode is live.

- [x] **Step 3: Restructure every failure-expected site (GREEN)**

List them: `grep -n '\$?' plugins/tribe/scripts/tests/test-review-cell-v3.sh` (on the base these
are the self-test 2, 3, F1, F2, F3 sites) plus any plain-statement command that may legitimately
fail (a `$GATE` run outside an `if`, a `grep -q` used for its status). Rewrite each with the idiom

```bash
rc=0
PREGATE_INNER=1 "$GATE" --repo "$HERE/../../../.." --range 'HEAD~1..HEAD' --tests-dir "$HERE" \
        --report "$TMPD/red.md" --fence "$FENCE" >/dev/null 2>&1 || rc=$?
[ "$rc" -eq 1 ] && { echo "ok: c: fence violation exits 1"; pass=$((pass+1)); } \
               || { echo "FAIL: c: fence violation exits 1"; fail=$((fail+1)); }
```

(the `[ ... ] && { } || { }` chains already in the file are conditions and stay as they are).
Never `set +e`, never `|| true` on an assertion. Re-run until the suite prints the Step 1 tally
exactly, with exit 0. Verify parse under the system bash: `bash -n <file>; echo $?` → `0`.

- [x] **Step 4: Prove strict mode is live**

Temporarily insert `false` as a plain statement right after the header, run the suite, confirm it
exits non-zero immediately, then remove the line. Paste the transcript.

- [x] **Step 5: Commit**

Subject `chore(tribe): test-review-cell-v3 runs under set -euo pipefail (rule-bash-strict-mode)`,
`Tribe-Task: 1/2`, plan checkboxes ticked in the same commit.

---

### Task 2: bounded pass-range walk

**Contract:** spec section "C2". **File:** `plugins/tribe/scripts/tests/test-review-cell-v3.sh`
(the `PASSRANGE` block only).

- [x] **Step 1: Measure the old walk and record its choice**

Create a counting git shim and run the suite with it first on `PATH`:

```bash
REALGIT="$(command -v git)"
mkdir -p /tmp/gitshim && printf '#!/usr/bin/env bash\necho "$*" >> "${GIT_COUNT_FILE:?}"\nexec %s "$@"\n' "$REALGIT" > /tmp/gitshim/git
chmod +x /tmp/gitshim/git
: > /tmp/git-calls-before.txt
GIT_COUNT_FILE=/tmp/git-calls-before.txt PATH="/tmp/gitshim:$PATH" bash plugins/tribe/scripts/tests/test-review-cell-v3.sh >/dev/null 2>&1
grep -c "log -1 --format=%(trailers)" /tmp/git-calls-before.txt
```

Also print the old walk's choice: add a temporary `echo "PASSRANGE=$PASSRANGE" >&2` after the
block, run once, record it, remove the echo.

- [x] **Step 2: Write the throwaway-repo selection test (RED)**

Build `/tmp/walkrepo`: `git init`, then four commits with `-c user.name=t -c user.email=t@t.com`:
(1) `base`; (2) `qualifies` with `--trailer 'Tribe-Card: x'`; (3) `coauthored` with
`--trailer 'Tribe-Card: x' --trailer 'Co-Authored-By: someone'`; (4) `no-trailer`. Extract the
walk into a small function you can point at a repo (the block already takes the repo path from
`$HERE/../../../..`; parameterise it as a local variable `WALK_REPO` defaulting to that path).
Expected selection on `/tmp/walkrepo`: commit (2). The old walk selects (2) as well — this test
pins the predicate before you change the mechanism.

- [x] **Step 3: Replace the walk (GREEN)**

Implement spec C2's three-call design inside the same named block; keep `PASSRANGE` as the block's
only output; bash 3.2 only (no `mapfile`, no associative arrays — a newline-separated exclude
string tested with `case` or `grep -qx` is fine). Cap confirmations at 20. Run the suite: tally
identical to Task 1's. Run the `/tmp/walkrepo` check: selects (2). Print the new walk's
`PASSRANGE` on this repo: identical to Step 1's.

- [x] **Step 4: Measure the new walk**

Repeat Step 1's counting run into `/tmp/git-calls-after.txt`. Expected: the
`log -1 --format=%(trailers)` count is at most the number of confirmations (normally 1) and the
total git calls made by the block are at most 3 + confirmations. Paste both counts.

- [x] **Step 5: Commit**

Subject `perf(tribe): test-review-cell-v3 picks its pass range with three git calls, not one per commit`,
`Tribe-Task: 2/2`, plan checkboxes ticked.

## Definition of done for this plan

- [x] Both tasks committed and pushed; pre-gate green over `origin/master..HEAD`; `pre-gate.sh` untouched.
- [ ] Evidence per spec "Evidence plan" in the PR body (tallies; git-call counts before/after; both
      `PASSRANGE` values; the throwaway-repo transcript; full suite table).
- [ ] Two independent skinner audits PASS, tracker + scout recorded, PR merged with a regular merge,
      master fast-forwarded, worktree removed, `SHIPPED` returned.
