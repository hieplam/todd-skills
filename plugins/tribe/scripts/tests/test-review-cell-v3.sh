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
has "b1: executor must run things"           "$COLD" 'cold-executor.{0,200}must run'
has "b1: executor findings cite command output" "$COLD" 'cite.{0,80}command.{0,40}output'
has "b1: reading with no run is not an executor finding" "$COLD" \
    'no run behind it.{0,80}minor'
has "b1: reader must not execute the suites" "$COLD" \
    'cold-reader.{0,200}must not (execute|run).{0,60}(test|eval|suite)'
has "b1: reader inspect-vs-execute line drawn" "$COLD" \
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

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
