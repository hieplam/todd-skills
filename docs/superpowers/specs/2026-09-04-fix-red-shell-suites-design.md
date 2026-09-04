# Spec — make the tribe shell test suite green on master

**Card:** `fix-red-shell-suites` · **Warchief spec, 2026-09-04** · base `d63a7d2` (latest `origin/master`)

## Problem, grounded

Two suites under `plugins/tribe/scripts/tests/` are red on `d63a7d2`. Everything else in the
directory is green (16/18 suites, verified by running all 18 — see the before table below), so the
red is narrow and its causes are separable.

### R1 — `test-input-asymmetry.sh` does not parse under the bash actually on PATH

```
$ bash plugins/tribe/scripts/tests/test-input-asymmetry.sh
... 19 assertions pass ...
test-input-asymmetry.sh: line 199: unexpected EOF while looking for matching `''
$ echo $?    # 2
```

The suite embeds a Python program as a quoted heredoc **inside a command substitution**:

- `plugins/tribe/scripts/tests/test-input-asymmetry.sh:153` — `EVAL_CHECKS="$(python3 - "$EVALS" <<'PY'`
- `plugins/tribe/scripts/tests/test-input-asymmetry.sh:190` — the closing `PY` / `)"`

Line 181 of that Python body is the comment `# Must NOT still assert idea 01's superseded,
now-contradicted pre-asymmetry claims.` — it contains an apostrophe. `bash` 3.2.57, the
`/usr/bin/env bash` on this machine (`bash --version` → `GNU bash, version 3.2.57(1)-release
(arm64-apple-darwin25)`), does **not** treat a heredoc body nested inside `$( )` as literal while
scanning for the closing paren: the apostrophe opens a quote that is never closed, and the parse
dies at EOF. Reduced to nine lines, it reproduces standalone:

```bash
X="$(python3 - <<'PY'
# idea 01's superseded claim
print("OK hi")
PY
)"
```
```
$ bash -n repro.sh
repro.sh: line 2: unexpected EOF while looking for matching `''
```

Two facts correct the card's "Today" section and belong in the record:

1. **The card attributes the break to `61e87d7`. That is wrong.** `git show 61e87d7 --
   plugins/tribe/scripts/tests/test-input-asymmetry.sh` changes exactly one line (`20` → `47` in
   the eval-count assertion). Checking out the file at every commit that ever touched it and
   running `bash -n` gives `parse_rc=2` at **all four** (`61e87d7`, `62857ad`, `1c0af4c`,
   `d21724c`) — the file has never parsed under bash 3.2, from the commit that introduced it.
   It parsed for its authors because they ran a bash ≥ 4. This is a portability defect, not a
   regression.
2. **The failure is bash-version-dependent, and the repo has no written bash-version rule.**
   `.c3/rules/rule-bash-strict-mode.md` mandates `#!/usr/bin/env bash` + `set -euo pipefail` and
   nothing about versions. `/usr/bin/env bash` on macOS resolves to the system 3.2.57, so the
   suite must parse there. This is a rule candidate, not a rule (see Follow-ups).

### R2 — `test-review-cell-v3.sh` reports `45 passed, 4 failed`

The four are `c: self-test pass case verdict`, `c: report names every suite it ran`,
`f1: valid empty range still exits 0`, `f3: fence file's unterminated last line still applies its
glob`. All four assert on `plugins/tribe/scripts/pre-gate.sh`. They have **two** distinct causes,
and neither is a defect in `pre-gate.sh`.

**Cause R2a — the suite sweep (accounts for f1, f3, and part of c).** Every one of those
assertions invokes `pre-gate.sh` with `--tests-dir "$HERE"`, i.e. the real tests directory.
`pre-gate.sh:48-62` runs every `test-*.sh` there and sets `overall=fail` if any exits non-zero, so
R1's unparseable suite (exit 2) makes every pre-gate invocation in this file red no matter what
else it is testing. Reproduced verbatim:

```
$ PREGATE_INNER=1 bash plugins/tribe/scripts/pre-gate.sh --repo . --range 'HEAD~1..HEAD' \
    --tests-dir plugins/tribe/scripts/tests --report /tmp/pg1.md
... "suite":"test-input-asymmetry.sh","exit":2,"status":"fail" ...   # the only failing suite
```

`f1` expects exit 0 over an empty range in a throwaway repo (no commits ⇒ no trailer checks, no
fence) and `f3` expects exit 0 over a one-commit throwaway repo whose single commit carries a
`Tribe-Card:` trailer and whose fence matches both changed files. In both, the *only* thing that
can be red is the sibling-suite sweep. Fixing R1 therefore fixes f1 and f3 with no other edit.
(`f2` survives today only because it expects exit **1** anyway, so the spurious extra failure does
not change its expected code — which is exactly the evidence that the sweep, not the fence logic,
is what is red.)

**Cause R2b — the pass-case self-test's range choice has rotted (accounts for the two `c:`
assertions, and is NOT fixed by R1).** `test-review-cell-v3.sh:189-190` runs

```bash
  if [ -x "$GATE" ] && OUT="$(PREGATE_INNER=1 "$GATE" --repo "$HERE/../../../.." \
        --range 'HEAD~1..HEAD' --tests-dir "$HERE" --report "$REPORT" 2>/dev/null)"; then
```

against the real repo. On `d63a7d2` — a *merge* commit — `git rev-list HEAD~1..HEAD` is **42
commits**, not one, because the second-parent side of the merged PR is included. Two of them
(`d63a7d2`, `e05ee63`) are themselves merge commits and carry no `Tribe-Card:` trailer, so
`pre-gate.sh:69-80` records `trailer violation` and the verdict is `fail` regardless of the
suites. Reproduced: the report at `## Commit trailers (HEAD~1..HEAD)` lists those two as
`trailer violation` and 40 as `ok`, ending `## Verdict: fail`.

### R2c — the hardcoded range is *accidentally green* on a feature branch, and regresses on merge

Discovered while auditing C1, and it changes how C2 must be proved. `HEAD~1..HEAD` is not
statically red; it is red exactly when the tip is a merge commit. On this branch, after C1 landed,
the tip's parent chain is linear and trailer-clean, so `git rev-list HEAD~1..HEAD` is **1 commit**
and `test-review-cell-v3.sh` reports `49 passed, 0 failed` — green, by luck, with the defect fully
intact.

That is the most dangerous possible state for this card: C1 alone satisfies G1's letter ("every
`test-*.sh` exits 0 on the branch") while leaving master red the instant this PR lands, because a
regular merge gives master a merge-commit tip and `HEAD~1..HEAD` immediately spans it again.
Verified two ways:

1. **Simulated merge** (clone of master + `--no-ff` merge of this branch, C1 included):
   `test-review-cell-v3.sh` → `45 passed, 4 failed` — all four original failures return.
2. **Artifact-free probe**, run from this worktree against a real merge commit already on master:
   `pre-gate.sh --range 'd63a7d2~1..d63a7d2'` → `verdict fail | trailers fail`, failing suites
   `[]`. The trailer check alone is what is red; no suite is.

(The simulated merge additionally showed `test-fresh-machine.sh` failing — that is an artifact of
running from a *clone*, not a defect: the same suite exits 0 in this worktree. It is recorded here
so a reader of the transcript is not misled by it.)

So C2 is not optional polish on top of C1; it is the half of this card that makes the green
durable. Its proof obligation is correspondingly different: a tally alone cannot demonstrate it,
because the tally is already green. The proof is that the range the suite computes is *by
construction* one commit and trailer-clean, whatever the tip is.

## D1 adjudication — which side is wrong, and the governing line

Card D1: **spec wins over test wins over implementation.**

- **`pre-gate.sh` is right about trailers.** `docs/superpowers/../docs/tribe/planning/idea-11-review-cell-v3/spec.md:181-182`
  (Delta-C, Behavior): *"checks every commit in the range carries a `Tribe-Card:` trailer and no
  `Co-Authored-By` trailer"*. Unqualified, no merge-commit carve-out. `pre-gate.sh:69-80`
  implements exactly that. **The implementation conforms; it is not touched.**
- **The test's range choice is wrong.** `docs/tribe/planning/idea-11-review-cell-v3/spec.md:267-269`
  (Verification, "Pre-gate script self-test"): *"the suite also executes `pre-gate.sh` twice
  against the repo itself — once with a range and fence **chosen to pass** (expected exit 0 and a
  report file whose tallies match the suites' own output) and once with a deliberately violated
  fence (expected exit 1 and the violation named in the report)."* A hardcoded `HEAD~1..HEAD` is
  not a range *chosen to pass*; it is whatever history happens to be, and it stopped passing the
  moment master gained a merge commit. The plan that realized this spec agrees with itself:
  `docs/tribe/planning/idea-11-review-cell-v3/plan-cheapwins.md:88` writes the intent as
  *"Self-test 1 (pass case): sweep this repo's own suites over a **1-commit range**, no fence."* —
  and `HEAD~1..HEAD` across a merge is a 42-commit range, so the expression contradicts the very
  comment that introduces it.

**Conclusion:** the test is changed (its range is made one that is genuinely *chosen to pass* and
genuinely one commit); `pre-gate.sh` is not changed at all. G4 holds trivially — **zero** lines of
`pre-gate.sh` are touched, so nothing about what the gate blocks on changes, and no
`NEEDS_DIRECTION` on the governance promise is triggered.

**Rejected alternative, and why it is not taken:** exempting merge commits from the
`Tribe-Card:` requirement would also turn all four assertions green. It is rejected because (a) no
spec asks for it, (b) it would change what `pre-gate.sh` blocks on, which the card reserves to the
Shaman, and (c) it is unnecessary — the spec-conforming test fix already closes the card. It is
recorded as an observation for the Shaman, not built.

## The change

Two files, two commits, nothing else.

### C1 — `plugins/tribe/scripts/tests/test-input-asymmetry.sh`: hoist the heredoc out of `$( )`

Wrap the existing `python3 - "$EVALS" <<'PY' ... PY` in a shell function and call the function
from the command substitution. The Python body, every assertion, and the consuming
`while read` loop are untouched — only the two lines that open and close the command substitution
move. This is **the repo's own established idiom**, not a new invention:
`plugins/tribe/scripts/tests/test-validate-plan.sh:14-25` (`jget`) and
`plugins/tribe/scripts/tests/test-resume-check.sh:15-24` (the same `jget`) both put
`python3 - "$1" "$2" <<'EOF' ... EOF` in a **function body** at statement level and let the caller
capture with `$(jget ...)`. `test-input-asymmetry.sh:153` is the only heredoc-inside-`$( )` in the
whole `plugins/tribe/scripts/` tree (`grep -rn '<<' plugins/tribe/scripts/tests/*.sh | grep '$('`
returns it plus two `<<<` here-strings), i.e. it is the outlier, and conforming it to the
surrounding convention both fixes the parse and removes the outlier.

Feasibility is already proven, not assumed: a scratch copy patched exactly this way gives
`bash -n` rc 0 and, run from the real tests directory, **`47 passed, 0 failed`** — which is
precisely the tally the governing plan records for this suite
(`docs/tribe/planning/idea-11-review-cell-v3/plan-cheapwins.md:64`: *"`test-input-asymmetry.sh`
47/0"*). No assertion needs changing; G3's "if an assertion then fails for real" branch does not
arise.

### C2 — `plugins/tribe/scripts/tests/test-review-cell-v3.sh`: choose a range that passes

Replace the literal `HEAD~1..HEAD` in the **pass-case** self-test (self-test 1 only) with a range
the suite *chooses* at run time: walk `git rev-list --no-merges -n 200 HEAD` and take the newest
commit that has a parent, carries a `Tribe-Card:` trailer, and carries no `Co-Authored-By`
trailer; audit `<sha>^..<sha>`. That is a genuine 1-commit range, it satisfies the trailer contract
by construction, and — unlike a hardcoded SHA — it cannot rot as history grows. If no such commit
is found in the last 200, the suite records a **failed** assertion rather than silently passing.

Verified against today's history: the walk selects `79e5a4e`, and
`pre-gate.sh --range '79e5a4e^..79e5a4e'` returns
`{"trailers":"pass","fence":"skipped","verdict":"pass"}` with exit 0 once the suites are green.

Two deliberate non-changes, so a reviewer does not read them as oversights:

- **The red-case self-test (self-test 2) keeps `HEAD~1..HEAD`.** Its assertion is exit **1** under
  a fence that allows nothing; it is green today and is insensitive to how many commits the range
  spans. Changing a green assertion is scope the card does not grant.
- **No `--fence` is added to the pass case**, even though the spec sentence says "a range *and
  fence* chosen to pass". The fence *pass* path is already asserted by the `f2` and `f3`
  self-tests, which both grep the report for `— in fence` lines; adding a fence here would buy no
  coverage and would couple the assertion to which files the chosen commit happens to touch. The
  omission is pre-existing and no assertion fails because of it, so under G4-style minimality it
  stays.

## Scope fence

**IN:** `plugins/tribe/scripts/tests/test-input-asymmetry.sh`,
`plugins/tribe/scripts/tests/test-review-cell-v3.sh`, this spec, its plan.
**OUT and untouched:** `plugins/tribe/scripts/pre-gate.sh` (zero lines); the other 16 suites;
harness style; `runner/`; `viewer/`; `.c3/` (no contract row's claim changes — the sole `.c3`
mention of these files is `adr/adr-20260717-harden-fresh-machine-resolution.md:125`, an explicitly
historical note scoped to "before this unit", which stays a true record of that unit and must not
be rewritten); the files owned by the concurrent `retire-kanna-session-ids` card
(`plugins/tribe/scripts/kanna/`, `tests/test-list-session-ids.sh`, `runner/README.md`,
`.c3/c3-2-plugins/c3-215-tribe.md`).

## Pure core, impure edges

Both files are test harnesses — edge code by construction. The one purity-relevant decision is
C2's: the range is *derived from an outside-world dependency* (git history), and the derivation is
kept in one small, named block whose only output is a range string that the rest of the assertion
consumes as data. No decision logic moves into git, and no assertion is made about the derivation
beyond "a passing range was found".

## Testing strategy

The deliverables *are* tests, so TDD's "red" is the observed failure of the suite itself:

- C1's red is the **parse error** (`bash -n` exits 2; the suite exits 2 mid-run). Green is
  `bash -n` exit 0 and `47 passed, 0 failed`.
- C2's red is **not** a failing tally on this branch, and that fact is itself the finding
  (see "R2c" below). It is the pre-gate verdict over any merge-spanning range:
  `pre-gate.sh --range 'd63a7d2~1..d63a7d2'` returns `verdict fail | trailers fail` with **zero**
  failing suites — the trailer check, isolated, with nothing else red. Green is
  `50 passed, 0 failed` — 49 existing
  assertions all passing, plus one new assertion that the range walk actually found a candidate
  (so an empty walk fails loudly instead of skipping the pass case silently).

No assertion's *expectation* is weakened anywhere: C1 changes zero assertions, C2 changes only the
input a passing assertion is fed, and both suites end with strictly more passing assertions than
they start with (19 → 47; 45 → 50).

## Evidence plan

The repo has **no CI workflows** (`.github/` does not exist), so the harness that proves this is
the shell suite itself, run by hand. Captured by the Warchief, not claimed by a Hunter:

- **Before:** every `plugins/tribe/scripts/tests/test-*.sh` run on the branch base with runner
  dependencies installed, recorded as `suite → exit code → tally`.
- **After:** the identical loop on the final branch tree.
- Both tables are embedded in the PR body, plus the `bash -n` transcript for
  `test-input-asymmetry.sh` (rc 2 → rc 0) and the `pre-gate.sh` JSON verdict flipping
  `"verdict":"fail"` → `"verdict":"pass"` on the chosen range.
- Every test expectation touched is quoted against its governing spec line in the PR, per G2.

## Risks and rollback

- **The suite gets slower.** `test-review-cell-v3.sh` invokes `pre-gate.sh` five times and each
  invocation sweeps all 18 suites; once every suite is green, the sweep no longer short-circuits on
  a broken sibling. Accepted — it is the design the Delta-C spec asks for. Measured and reported in
  the after table so the number is on the record rather than a surprise.
- **`test-review-cell-v3.sh` is now coupled to every sibling suite being green.** Also by design
  (`pre-gate.sh` sweeps the whole directory); it is why this card exists. Worth knowing: any future
  suite that goes red reds this one too.
- **The chosen-range walk could find no candidate** (e.g. a shallow clone, or 200 commits without a
  tribe trailer). It fails loudly as an assertion, never silently green.
- **Rollback** is `git revert` of two commits that touch only test files; `pre-gate.sh` and every
  shipped behaviour are untouched, so the blast radius of a revert is the same red state as today.

## Follow-ups (for the Shaman, not built here)

1. **Rule candidate — no heredoc inside `$( )` in this repo's shell.** R1 is the second-order cost
   of an idiom that works on bash ≥ 4 and silently dies on the macOS system bash. The repo already
   has the correct idiom in two suites; a written rule (plus, ideally, a `bash -n` sweep over
   `plugins/**/*.sh`) would have caught this at authoring time instead of months later.
2. **Observation — `pre-gate.sh` will flag every merge commit** in any range that spans one, since
   merge commits never carry `Tribe-Card:`. Harmless for a feature branch's own `base..HEAD` range,
   but it makes any master-spanning range permanently red. Whether the gate should exempt merge
   commits is a change to what the gate blocks on, i.e. the Shaman's call, and is deliberately not
   made here.
3. **Observation — the card's `61e87d7` attribution is incorrect**; the defect is original to the
   file (`d21724c`). Recorded so the roadmap's history stays true.
