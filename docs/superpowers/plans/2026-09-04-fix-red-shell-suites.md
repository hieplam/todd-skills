# Plan — make the tribe shell test suite green on master

**Card:** `fix-red-shell-suites` · **Spec:** `docs/superpowers/specs/2026-09-04-fix-red-shell-suites-design.md`
**Branch:** `fix/red-shell-suites` · **Base:** `d63a7d2` · **Worktree:** `/Users/hip/repo/todd-skills-wt/fix-red-shell-suites`

Two tasks, one file each, one commit each. Task 2 depends on Task 1 (Task 1's green is a
precondition for Task 2's red being the *right* red), so they run sequentially in one wave.
(Amended after Task 2's audit: one fix round followed, recorded below as **Task 2b**. A fix round
is not a new task — it is the audit loop doing its job — but it does produce a commit, so it is
written down here rather than left to be discovered in the log.)

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **Purity:** core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see `~/.claude/rules/pure-core.md`).
  Both files here are test harnesses (edge code by construction); the one purity-relevant rule is
  Task 2's: the git-history lookup stays in one named block whose only output is a range string.
- **`plugins/tribe/scripts/pre-gate.sh` is NOT to be edited. Zero lines.** The spec's D1
  adjudication (spec section "D1 adjudication") proves the script conforms to
  `docs/tribe/planning/idea-11-review-cell-v3/spec.md:181`. A Hunter that believes `pre-gate.sh`
  must change stops and reports `NEEDS_CONTEXT` instead of editing it.
- **Do not touch** `plugins/tribe/scripts/kanna/`, `plugins/tribe/scripts/tests/test-list-session-ids.sh`,
  `runner/README.md`, `.c3/c3-2-plugins/c3-215-tribe.md` — a concurrent card owns them.
- **Do not touch** any other `test-*.sh` suite, `runner/`, `viewer/`, or `.c3/`.
- **Change no assertion's expectation.** Task 1 changes zero assertions. Task 2 changes only the
  *input* one assertion is fed. Both suites must end with strictly more passing assertions than
  they start with.
- Shell rules: each file's existing shebang and `set` line stay **exactly as they are**; this
  card changes neither. (Correction, recorded by the final whole-branch audit: an earlier draft of
  this line claimed both files carry `set -euo pipefail`. They do not —
  `test-input-asymmetry.sh:3` does, but `test-review-cell-v3.sh:8` carries only `set -u`, and has
  since long before this branch. That is a pre-existing violation of
  `.c3/rules/rule-bash-strict-mode.md`; hardening it is outside this card's fence and is recorded
  as a follow-up for the Shaman, not fixed here.) The bash that must parse these files is the
  system `bash` 3.2.57 on this machine — verify with `bash -n`, not with a newer bash.
- Commit rules: each task ends in exactly ONE commit (an audit fix round on an already-committed
  task adds its own single commit — see Task 2b). Tick this plan's checkboxes for your task in
  the SAME commit as the code. Stamp the commit with `Tribe-Card: fix-red-shell-suites` and
  `Tribe-Task: N/2` on two lines of the commit message's single final paragraph.
  **Never add a `Co-Authored-By` trailer of any kind** — `pre-gate.sh` blocks on it.
- Report to the Warchief at the report-file path given in your dispatch. Do not open PRs, do not
  merge, do not dispatch agents.

---

### Task 1: `test-input-asymmetry.sh` — hoist the heredoc out of the command substitution

**Contract:** spec section "C1". **File:** `plugins/tribe/scripts/tests/test-input-asymmetry.sh`
(modify, lines 153 and 190-191 only).

**Why it is red:** `plugins/tribe/scripts/tests/test-input-asymmetry.sh:153` opens a quoted
heredoc (`<<'PY'`) *inside* a command substitution (`EVAL_CHECKS="$(python3 - "$EVALS" <<'PY'`).
bash 3.2.57 does not treat that heredoc body as literal while scanning for the closing `)`, so the
apostrophe in the Python comment at line 181 (`# Must NOT still assert idea 01's superseded,`)
opens a quote that never closes and the whole file fails to parse.

- [x] **Step 1: Watch the test fail (RED)**

The failing test IS the suite's own parse. Run both of these and paste both outputs into your
report:

```bash
cd /Users/hip/repo/todd-skills-wt/fix-red-shell-suites
bash -n plugins/tribe/scripts/tests/test-input-asymmetry.sh; echo "parse rc=$?"
bash plugins/tribe/scripts/tests/test-input-asymmetry.sh; echo "run rc=$?"
```

Expected RED output — the parse error naming line 199, and both exit codes 2:

```
plugins/tribe/scripts/tests/test-input-asymmetry.sh: line 199: unexpected EOF while looking for matching `''
plugins/tribe/scripts/tests/test-input-asymmetry.sh: line 201: syntax error: unexpected end of file
parse rc=2
```

If you do not see `parse rc=2`, stop and report `BLOCKED` — you are not on the right bash.

- [x] **Step 2: Make it parse (GREEN)**

Move the heredoc to statement level inside a shell function, and call that function from the
command substitution. This is the repo's own established idiom — see the `jget` function at
`plugins/tribe/scripts/tests/test-validate-plan.sh:14-25` and
`plugins/tribe/scripts/tests/test-resume-check.sh:15-24`, both of which put
`python3 - "$1" "$2" <<'EOF' ... EOF` in a function body and let the caller capture with
`$(jget ...)`.

Exactly two edits, and nothing else in the file changes:

1. Replace the single line that currently reads

```bash
EVAL_CHECKS="$(python3 - "$EVALS" <<'PY'
```

with these two lines (the function opens; the heredoc is now at statement level):

```bash
eval_checks() {
  python3 - "$1" <<'PY'
```

2. Replace the two lines that currently close the substitution

```bash
PY
)"
```

with these three lines (the heredoc terminator, the function's closing brace, then the capture):

```bash
PY
}
EVAL_CHECKS="$(eval_checks "$EVALS")"
```

**The Python body between them is not touched — not one character**, comments included. Do not
re-indent it: the heredoc is quoted (`<<'PY'`) and un-indented (`<<`, not `<<-`), so the
terminator `PY` must stay at column 0 and the body must keep its exact current text.

- [x] **Step 3: Verify green**

```bash
cd /Users/hip/repo/todd-skills-wt/fix-red-shell-suites
bash -n plugins/tribe/scripts/tests/test-input-asymmetry.sh; echo "parse rc=$?"
bash plugins/tribe/scripts/tests/test-input-asymmetry.sh | tail -2; echo "run rc=${PIPESTATUS[0]}"
git diff --stat
```

Expected: `parse rc=0`, a final tally line of exactly `47 passed, 0 failed`, `run rc=0`, and a
`git diff --stat` showing one file changed with 4 insertions and 2 deletions (each of Step 2's two
edits collapses to a `-1/+2` hunk, the shared `PY` line staying as context). The 47/0 tally is the
number the governing plan records for this suite
(`docs/tribe/planning/idea-11-review-cell-v3/plan-cheapwins.md:64`: *"`test-input-asymmetry.sh`
47/0"*), so a different tally means something else moved — stop and report it rather than adjusting
an assertion.

- [x] **Step 4: Commit**

```bash
cd /Users/hip/repo/todd-skills-wt/fix-red-shell-suites
git add plugins/tribe/scripts/tests/test-input-asymmetry.sh docs/superpowers/plans/2026-09-04-fix-red-shell-suites.md
git commit -F - <<'MSG'
fix(tests): hoist test-input-asymmetry's heredoc out of the command substitution

bash 3.2 does not treat a heredoc body nested inside $( ) as literal while
scanning for the closing paren, so the apostrophe in the Python comment
"idea 01's superseded" broke the parse of the whole file. Move the heredoc
to statement level in a function, matching the jget idiom the other suites
already use. No assertion changes: 19 partial -> 47 passed, 0 failed.

Tribe-Card: fix-red-shell-suites
Tribe-Task: 1/2
MSG
```

**Correction (final whole-branch audit):** the message above says "19 partial" — the measured
pre-fix count is **37** assertions executed before the parse death, not 19 (the last one is at
`test-input-asymmetry.sh:143`; the broken construct is at `:153`; 37 + the 10 heredoc-gated
eval-content assertions = the 47 that pass after the fix). The commit is already in history and is
not rewritten; the true number is recorded here, in the spec, and in the PR body.

Expected: one commit, two files (the suite and this plan with Task 1's boxes ticked). Verify the
trailers landed with `git log -1 --format='%(trailers)'` — expected output is exactly the two
`Tribe-Card:` and `Tribe-Task:` lines.

---

### Task 2: `test-review-cell-v3.sh` — make the pass-case self-test choose a range that passes

**Contract:** spec section "C2". **File:** `plugins/tribe/scripts/tests/test-review-cell-v3.sh`
(modify; the pass-case block at lines 186-196 only). **Depends on Task 1 being committed.**

**Why it is red:** `plugins/tribe/scripts/tests/test-review-cell-v3.sh:189-190` hardcodes
`--range 'HEAD~1..HEAD'` for self-test 1. Master's tip is a merge commit, so that range spans 42
commits including 6 merge commits, none of which carry a `Tribe-Card:` trailer — so `pre-gate.sh`
correctly records trailer violations and the verdict is `fail`. The governing spec asks for
*"a range and fence chosen to pass"* (`docs/tribe/planning/idea-11-review-cell-v3/spec.md:268`) and
the plan that realized it says *"sweep this repo's own suites over a 1-commit range, no fence"*
(`docs/tribe/planning/idea-11-review-cell-v3/plan-cheapwins.md:88`). `HEAD~1..HEAD` is neither. The
**test** is what contradicts the spec, so the test is what changes; `pre-gate.sh` is correct and
stays untouched (card D1).

- [x] **Step 1: Watch the test fail (RED)**

**Read this carefully — the red here is NOT a failing tally, and if you go looking for one you will
conclude, wrongly, that there is nothing to fix.**

`HEAD~1..HEAD` is red exactly when the tip is a merge commit. Task 1's commit left this branch with
a linear, trailer-clean tip, so the range happens to resolve to one good commit and the suite is
green *by luck, with the defect fully intact*. Confirm that accidental green, so you know the
starting state:

```bash
cd /Users/hip/repo/todd-skills-wt/fix-red-shell-suites
git rev-list HEAD~1..HEAD | wc -l
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh 2>&1 | tail -1
```

Expected: `1` commit, and `49 passed, 0 failed`. That is the accidental green, not success.

Now reproduce the actual defect, isolated. Point the gate at a range whose tip IS a merge commit —
`d63a7d2` is one that is already on master, and it is exactly the shape master's tip takes the
moment this card's PR merges:

```bash
cd /Users/hip/repo/todd-skills-wt/fix-red-shell-suites
PREGATE_INNER=1 bash plugins/tribe/scripts/pre-gate.sh --repo . \
  --range 'd63a7d2~1..d63a7d2' --tests-dir plugins/tribe/scripts/tests \
  --report /tmp/red-task2.md 2>/dev/null | python3 -c \
  'import json,sys; d=json.load(sys.stdin); print("verdict",d["verdict"],"trailers",d["trailers"],\
   "failing suites:",[x["suite"] for x in d["suites"] if x["status"]!="pass"])'
```

Expected RED output — the trailer check failing on its own, with no suite red:

```
verdict fail trailers fail failing suites: []
```

That is the red this task fixes: the pass-case self-test feeds the gate a range that spans merge
commits, which by contract carry no `Tribe-Card:` trailer. Transcribe both outputs into your
report before editing anything.

- [x] **Step 2: Choose a passing range (GREEN)**

In the `# Self-test 1 (pass case)` block, insert a range-selection step before the `if` that
invokes the gate, and feed its result to `--range` in place of the literal `HEAD~1..HEAD`.

Find this block (it begins at the comment `# Self-test 1 (pass case):`):

```bash
  TMPD="$(mktemp -d)"; REPORT="$TMPD/pregate-report.md"
  if [ -x "$GATE" ] && OUT="$(PREGATE_INNER=1 "$GATE" --repo "$HERE/../../../.." \
        --range 'HEAD~1..HEAD' --tests-dir "$HERE" --report "$REPORT" 2>/dev/null)"; then
```

Replace it with this — the comment above the block also gains a sentence saying WHY the range is
computed, so the next reader does not reintroduce a literal:

```bash
  TMPD="$(mktemp -d)"; REPORT="$TMPD/pregate-report.md"
  # The range is *computed*, never hardcoded: the spec asks for "a range and fence chosen to
  # pass", and a literal HEAD~1..HEAD spans the whole second-parent side whenever the tip is a
  # merge commit (42 commits on d63a7d2), which drags in merge commits that carry no
  # Tribe-Card: trailer and reds this assertion for reasons that have nothing to do with it.
  # Walk back for the newest non-merge commit that has a parent and satisfies the trailer
  # contract, and audit exactly that one commit.
  PASSRANGE=""
  for _sha in $(git -C "$HERE/../../../.." rev-list --no-merges -n 200 HEAD); do
    _tr="$(git -C "$HERE/../../../.." log -1 --format='%(trailers)' "$_sha")"
    printf '%s' "$_tr" | grep -q 'Tribe-Card:' || continue
    printf '%s' "$_tr" | grep -qi 'co-authored-by' && continue
    git -C "$HERE/../../../.." rev-parse -q --verify "$_sha^" >/dev/null || continue
    PASSRANGE="$_sha^..$_sha"; break
  done
  if [ -z "$PASSRANGE" ]; then
    echo "FAIL: c: a trailer-clean 1-commit range was found for the pass case"; fail=$((fail+1))
  else
    echo "ok: c: a trailer-clean 1-commit range was found for the pass case"; pass=$((pass+1))
  fi
  if [ -x "$GATE" ] && [ -n "$PASSRANGE" ] && OUT="$(PREGATE_INNER=1 "$GATE" --repo "$HERE/../../../.." \
        --range "$PASSRANGE" --tests-dir "$HERE" --report "$REPORT" 2>/dev/null)"; then
```

Three things to be careful about, because `set -euo pipefail` is in force:

1. `printf ... | grep -qi 'co-authored-by' && continue` is the LAST command of its loop iteration
   only when it matches. When it does not match, `grep` exits 1 and the `&&` short-circuits — the
   compound's status is 1. That is fine here because the loop body continues to further commands
   afterward, but do not make it the final statement of the body.
2. The `for` loop reads `git rev-list` inside a command substitution; if the repo had no commits
   this would be empty and `PASSRANGE` stays empty, which the explicit `if [ -z ... ]` handles as a
   loud failed assertion — never a silent pass. Keep that branch.
3. Do NOT change self-test 2 (the red case) — it keeps `HEAD~1..HEAD`. Its assertion is exit 1
   under a fence that allows nothing, it is green today, and it is insensitive to range length.

- [x] **Step 3: Verify green**

```bash
cd /Users/hip/repo/todd-skills-wt/fix-red-shell-suites
bash -n plugins/tribe/scripts/tests/test-review-cell-v3.sh; echo "parse rc=$?"
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh 2>&1 | tail -2
echo "run rc=$?"
```

Expected: `parse rc=0`, a final tally of exactly `50 passed, 0 failed` (47 recovered from Task 1,
plus the new "a trailer-clean 1-commit range was found" assertion, plus the two `c:` assertions
that now pass), and no `FAIL:` line anywhere in the output. Then confirm the whole directory is
green:

```bash
cd /Users/hip/repo/todd-skills-wt/fix-red-shell-suites
for f in plugins/tribe/scripts/tests/test-*.sh; do bash "$f" >/dev/null 2>&1; \
  printf '%-34s rc=%s\n' "$(basename "$f")" "$?"; done
```

Expected: every suite prints `rc=0` (17 of them today).

Finally, prove the fix is *durable* — that the computed range is one commit and trailer-clean no
matter what the tip is. Print the range the suite now selects and check it directly:

```bash
cd /Users/hip/repo/todd-skills-wt/fix-red-shell-suites
PASSRANGE=""
for _sha in $(git rev-list --no-merges -n 200 HEAD); do
  _tr="$(git log -1 --format='%(trailers)' "$_sha")"
  printf '%s' "$_tr" | grep -q 'Tribe-Card:' || continue
  printf '%s' "$_tr" | grep -qi 'co-authored-by' && continue
  git rev-parse -q --verify "$_sha^" >/dev/null || continue
  PASSRANGE="$_sha^..$_sha"; break
done
echo "range=$PASSRANGE spans $(git rev-list "$PASSRANGE" | wc -l | tr -d ' ') commit(s)"
git log -1 --format='%(trailers)' "${PASSRANGE##*..}"
```

Expected: a non-empty `range=`, `spans 1 commit(s)`, and trailers containing `Tribe-Card:` and no
`Co-Authored-By`. This is the property that survives a merge tip; the tally alone cannot show it.

- [x] **Step 4: Commit**

```bash
cd /Users/hip/repo/todd-skills-wt/fix-red-shell-suites
git add plugins/tribe/scripts/tests/test-review-cell-v3.sh docs/superpowers/plans/2026-09-04-fix-red-shell-suites.md
git commit -F - <<'MSG'
fix(tests): compute the pre-gate pass-case range instead of hardcoding HEAD~1..HEAD

The spec asks for "a range and fence chosen to pass" (idea-11 spec.md:268)
and the plan for a "1-commit range" (plan-cheapwins.md:88). A literal
HEAD~1..HEAD spans 42 commits once master's tip is a merge commit, pulling
in merge commits with no Tribe-Card: trailer, so pre-gate.sh correctly
returned fail. Walk history for the newest trailer-clean non-merge commit
and audit exactly that one. pre-gate.sh is unchanged.

Tribe-Card: fix-red-shell-suites
Tribe-Task: 2/2
MSG
```

Expected: one commit, two files. Verify with `git log -1 --format='%(trailers)'` — expected output
is exactly the two `Tribe-Card:` and `Tribe-Task:` lines.

---

---

### Task 2b (audit fix round 1): isolate host git config across the pass-case self-test

**Added by the Warchief after Task 2's audit, not part of the original two-task decomposition.**
It is recorded here because this plan's Definition of Done counts commits, and this fix round
produced a third `Tribe-Task:`-trailered commit (`7c3a855`) — the same way `2b6e16b` amended this
plan for the R2c discovery. The final whole-branch audit's contract lens raised the undocumented
commit as a Critical conformance finding against the DoD; this section, plus the DoD wording
below, is the recorded remedy.

**Finding F1 (`fail-closed-edges` obligation 2), reproduced before it was fixed:** Task 2's range
walk shells out to `git log -1 --format='%(trailers)'`, and `pre-gate.sh`'s own child invocations
read `%(trailers)` too. A *legal* host git setting — `[trailer] separators = "#"` in a global
config — empties `%(trailers)` for every one of those calls, so the suite reds for reasons wholly
unrelated to the code under test.

**Fix (commit `7c3a855`, `plugins/tribe/scripts/tests/test-review-cell-v3.sh` only, +5 lines):**
export `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null` once at the top of the
`PREGATE_INNER != 1` self-test block, so the walk, every `pre-gate.sh` invocation, and the
throwaway-repo git commands in self-tests 3-5 all inherit the isolation. No assertion's
expectation changes.

**Verification (run by the Warchief, not claimed by the Hunter)** — same command, same hostile
config, only the source file differing:

```
pre-fix file (171dbf8) + hostile GIT_CONFIG_GLOBAL  ->  45 passed, 5 failed
post-fix file (7c3a855) + hostile GIT_CONFIG_GLOBAL ->  50 passed, 0 failed
post-fix file (7c3a855) + clean environment         ->  50 passed, 0 failed
```

## Definition of done for this plan

- `bash -n` exits 0 for both suites under the system bash 3.2.57.
- Every `plugins/tribe/scripts/tests/test-*.sh` exits 0 (17 suites today; the plan was drafted
  against `d63a7d2`, when there were 18 — the concurrent `retire-kanna-session-ids` card retired
  `test-list-session-ids.sh` into this card's own base).
- `plugins/tribe/scripts/pre-gate.sh` has zero changed lines: `git diff d63a7d2..HEAD --
  plugins/tribe/scripts/pre-gate.sh` prints nothing.
- The two planned implementation commits, plus any audit fix-round commit recorded under
  "Task 2b" below — each carrying `Tribe-Card:` and `Tribe-Task:` trailers and no
  `Co-Authored-By` trailer.
