#!/usr/bin/env bash
# test-review-cell-v3.sh — contract tripwire for idea 11 (review-cell v3).
#
# TRIPWIRE, not a behavior test: proves the card's laws are WRITTEN into the agent prompts and
# the pre-gate script exists and behaves; behavior is proved by evals.json ids added by task 5.
# Offline, no network. Idea 11 is a DELTA on shipped ideas 01/02/03/04/05 — the dependency
# assertions below fail loudly if run before those baselines are present.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$HERE/../../agents"
SKIN="$(tr '\n' ' ' < "$AGENTS/skinner.md" | tr -s ' ')"
# Cold-lens section only (never whole-file): everything from the lens-mode heading to
# '## Operating rules'. Sub-lens subsections use #### so they stay inside this span.
COLD="$(awk '/^## Lens mode/{f=1} /^## Operating rules/{f=0} f' "$AGENTS/skinner.md" \
        | tr '\n' ' ' | tr -s ' ')"
# Sub-lens spans, each anchored to its OWN heading (never the whole cold span): idea-11 fix
# round 1 finding F2 proved the whole-span assertions stay green even when a clause is
# relocated into the wrong sub-lens. These extractions make relocation observable.
COLD_EXEC="$(awk '/^#### `lens: cold-executor`/{f=1} /^#### `lens: cold-reader`/{f=0} f' \
        "$AGENTS/skinner.md" | tr '\n' ' ' | tr -s ' ')"
COLD_READER="$(awk '/^#### `lens: cold-reader`/{f=1} /^Both sub-lenses/{f=0} f' \
        "$AGENTS/skinner.md" | tr '\n' ' ' | tr -s ' ')"
# Operating-rules span only (never whole-file): idea-11 fix round 1 finding F1's carve-out lives
# here.
OPRULES="$(awk '/^## Operating rules/{f=1} /^## Method/{f=0} f' "$AGENTS/skinner.md" \
        | tr '\n' ' ' | tr -s ' ')"
# The single "Read + verify only" bullet, anchored to its OWN top-level-bullet span (never the
# whole $OPRULES span): idea-11 fix round 2 finding F8's precedence sentence lives here. A
# decoy planted anywhere else in $OPRULES (e.g. near the contamination bullet's "cold lens"
# mentions) must not satisfy this needle — verified by mutation, see Hunter report.
OPRULES_VERIFY="$(awk '/^- \*\*Read \+ verify only/{f=1} /^- \*\*Evidence or it didn.t happen/{f=0} f' \
        "$AGENTS/skinner.md" | tr '\n' ' ' | tr -s ' ')"
pass=0; fail=0
has()   { if echo "$2" | grep -qiE "$3"; then echo "ok: $1"; pass=$((pass+1)); \
          else echo "FAIL: $1 (missing: $3)"; fail=$((fail+1)); fi; }
hasnt() { if echo "$2" | grep -qiE "$3"; then echo "FAIL: $1 (found what must be gone: $3)"; \
          fail=$((fail+1)); else echo "ok: $1"; pass=$((pass+1)); fi; }

# --- Dependency check: idea 03's cold lens must already exist ------------------------------
has "dep: lens-mode section exists"          "$SKIN" 'lens mode.{0,40}contract.{0,20}default'
has "dep: cold lens exists"                  "$COLD" 'lens.{0,4}cold.{0,40}bare-diff reviewer'

# --- Delta-B1: the two sub-lenses ----------------------------------------------------------
has "b1: cold-executor subsection exists"    "$COLD" 'lens.{0,4}cold-executor'
has "b1: cold-reader subsection exists"      "$COLD" 'lens.{0,4}cold-reader'
# Bound capped at {0,200}, not the plan's literal {0,600}: BSD grep (the /usr/bin/grep this repo's
# contributors actually run) hard-errors "maximum repetition exceeds 255" on any {m,n} with n > 255,
# which makes the assertion never executable on ANY content (verified: fails identically before and
# after the skinner.md edit). Same fix, same reason, as test-input-asymmetry.sh's {0,200} convention.
# idea-11 fix round 1 finding F2 and fix round 2 findings F6/F7: every needle below that names a
# sub-lens rule is anchored to that sub-lens's OWN span ($COLD_EXEC / $COLD_READER), never the
# whole shared $COLD span — a relocation into the wrong sub-lens now reds the assertion instead
# of passing invisibly, including via a decoy planted near an earlier same-name mention elsewhere
# in $COLD (verified by mutation, see Hunter report).
has "b1: executor must run things"           "$COLD_EXEC" 'cold-executor.{0,200}must run'
has "b1: executor findings cite command output" "$COLD_EXEC" 'cite.{0,80}command.{0,40}output'
has "b1: reading with no run is not an executor finding" "$COLD_EXEC" \
    'no run behind it.{0,80}minor'
has "b1: reader must not execute the suites" "$COLD_READER" \
    'cold-reader.{0,200}must not (execute|run).{0,60}(test|eval|suite)'
has "b1: reader inspect-vs-execute line drawn" "$COLD_READER" \
    'inspect.{0,120}reading, not executing'
has "b1: bare cold deprecation ruling"       "$COLD" \
    'lens: cold.{0,80}(read|treated) as.{0,20}cold-executor'
has "b1: both sub-lenses inherit the cold base rules" "$COLD" \
    'inherit.{0,120}cold'
# The shipped cold base must survive intact for both sub-lenses:
has "base: never seeks the denied contract"  "$COLD" 'must not read it'
has "base: hypotheses not a verdict"         "$COLD" 'hypotheses, not a verdict'
has "base: self-refutation applies in full"  "$COLD" 'self-refutation.{0,40}applies in full'
has "base: cold-lens terminator survives"    "$COLD" 'cold-lens: n hypotheses'

# --- Delta-A: path-scope contamination (skinner.md half) -----------------------------------
has "a: contract-bearing diff is contamination" "$COLD" \
    '(diff|range).{0,120}(spec|plan|idea card|state file).{0,160}contaminat'
has "a: refusal reuses the shipped mechanism" "$COLD" 'audit: fail .{0,4}contaminated'

# idea-11 fix round 1 finding F1: the Operating-rules "ban is on narrative, never on artifacts"
# rule (line ~210) contradicted the new path-scope contamination rule (Delta-A above) for the
# same case — a committed spec/plan/idea-card/state file in a cold diff. The carve-out below
# stays COLD-SCOPED: the contract lens's own artifacts rule is asserted unconditional in the
# same clause, so this assertion also guards that the carve-out never widens onto the contract
# lens (spec Delta-A: "the contract lens's diff stays full-range").
has "f1: artifacts carve-out is cold-scoped; contract lens stays unconditional" "$OPRULES" \
    'unconditional for the contract lens.{0,200}cold lens only.{0,200}carved out'

# idea-11 fix round 2 finding F8: the Operating-rules "you may run verifying commands (... test
# runners ...)" bullet (line ~220) contradicted the new cold-reader sub-lens's method restriction
# ("must not execute the repo's test or eval suites") for the same action. The precedence
# sentence below reconciles them, in the same shape as the F1 reconciliation above: names both
# halves (the carve-out AND what stays unconditional for the other lenses) in one needle so
# neither half can silently drop out from under the other.
has "f8: cold-reader carved out of running test runners; executor+contract stay unconditional" \
    "$OPRULES_VERIFY" \
    'unconditional for the contract lens and the.{0,20}cold-executor.{0,180}cold-reader.{0,80}takes precedence.{0,120}test or eval suites is forbidden'

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
