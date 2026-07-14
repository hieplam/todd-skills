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
# The "Both sub-lenses inherit ... / bare `lens: cold` reads as cold-executor" paragraph, on its
# own — never the whole $COLD span. idea-11 fix round 3 finding sweep: the naive version of this
# span (triggered by the paragraph's OWN opening words, "Both sub-lenses") re-opens if that exact
# clause is ever relocated elsewhere verbatim (the relocated copy re-triggers the same awk pattern
# and the window never closes). The trigger below is anchored to the END of the PRECEDING
# cold-reader paragraph instead ("...is executing the suites and evals themselves."), a stable
# phrase that is never itself the guarded content, so relocating the guarded clause cannot drag
# the extraction window along with it (verified by mutation, see Hunter report).
INHERIT_PARA="$(awk '/is executing the suites and evals themselves\.$/{f=1; next} \
        /^\*\*Path-scope contamination/{f=0} f' "$AGENTS/skinner.md" | tr '\n' ' ' | tr -s ' ')"
# The path-scope contamination paragraph, on its own — never the whole $COLD span. idea-11 fix
# round 3 finding F13: the whole-$COLD version of the "a:" assertions below stayed green even
# when the real paragraph was deleted and an opposite-meaning decoy was planted elsewhere in
# $COLD (e.g. near "You receive only the diff"). Same relocation-immune trigger design as
# $INHERIT_PARA above: anchored to the end of the PRECEDING paragraph ("...executor's method."),
# never to the guarded clause's own opening words, so a relocated copy of the clause cannot
# reopen the window at the wrong spot (verified by mutation, see Hunter report).
COLD_PATHSCOPE="$(awk '/executor.s method\.$/{f=1; next} /^## Operating rules/{f=0} f' \
        "$AGENTS/skinner.md" | tr '\n' ' ' | tr -s ' ')"
# The single "Read + verify only" bullet, anchored to its OWN top-level-bullet span (never the
# whole $OPRULES span): idea-11 fix round 2 finding F8's precedence sentence, and fix round 3
# finding F11's precedence sentence, both live here. A decoy planted anywhere else in $OPRULES
# (e.g. near the contamination bullet's "cold lens" mentions, or the "independent reviewers"
# bullet) must not satisfy either needle — verified by mutation, see Hunter report.
OPRULES_VERIFY="$(awk '/^- \*\*Read \+ verify only/{f=1} /^- \*\*Evidence or it didn.t happen/{f=0} f' \
        "$AGENTS/skinner.md" | tr '\n' ' ' | tr -s ' ')"
# The cold-executor mutation carve-out sub-bullet, on its own — never the whole $OPRULES_VERIFY
# span (idea-11 fix round 3 finding F11 lives here; see the f11 assertion below).
OPRULES_MUTATE="$(awk '/^  - \*\*Precedence over the `cold-executor`/{f=1} \
        /^- \*\*Evidence or it didn.t happen/{f=0} f' "$AGENTS/skinner.md" | tr '\n' ' ' | tr -s ' ')"
# The "ban is on narrative, never on artifacts" sub-bullet, on its own — never the whole
# $OPRULES span. idea-11 fix round 3 finding F12: the whole-$OPRULES version of the f1 assertion
# below stayed green even when the real F1 reconciliation sentence was deleted and a decoy
# containing the same three anchor phrases was planted near the "independent reviewers" bullet
# elsewhere in $OPRULES (verified by mutation, see Hunter report).
ARTIFACTS_BULLET="$(awk '/^  - \*\*The ban is on narrative/{f=1} /^- \*\*Read \+ verify only/{f=0} f' \
        "$AGENTS/skinner.md" | tr '\n' ' ' | tr -s ' ')"
pass=0; fail=0
has()   { if echo "$2" | grep -qiE "$3"; then echo "ok: $1"; pass=$((pass+1)); \
          else echo "FAIL: $1 (missing: $3)"; fail=$((fail+1)); fi; }
hasnt() { if echo "$2" | grep -qiE "$3"; then echo "FAIL: $1 (found what must be gone: $3)"; \
          fail=$((fail+1)); else echo "ok: $1"; pass=$((pass+1)); fi; }

# --- Dependency check: idea 03's cold lens must already exist ------------------------------
has "dep: lens-mode section exists"          "$SKIN" \
    'lens mode: .contract. \(default\).{0,10}.cold-executor.{0,10}or .cold-reader.'
has "dep: cold lens exists"                  "$COLD" '.lens: cold. — the bare-diff reviewer'

# --- Delta-B1: the two sub-lenses ----------------------------------------------------------
# idea-11 fix round 3 sweep: these two "exists" assertions used to accept the sub-lens NAME
# appearing anywhere in $COLD (including incidental mentions inside the OTHER sub-lens's own
# prose), so deleting the actual `####` heading still passed. Tightened to the literal heading
# line — deleting the heading now reds the assertion (verified by mutation, see Hunter report).
has "b1: cold-executor subsection exists"    "$COLD" \
    '#### .lens: cold-executor. — the cold lens that runs'
has "b1: cold-reader subsection exists"      "$COLD" \
    '#### .lens: cold-reader. — the cold lens that reads'
# Bound capped at {0,200}, not the plan's literal {0,600}: BSD grep (the /usr/bin/grep this repo's
# contributors actually run) hard-errors "maximum repetition exceeds 255" on any {m,n} with n > 255,
# which makes the assertion never executable on ANY content (verified: fails identically before and
# after the skinner.md edit). Same fix, same reason, as test-input-asymmetry.sh's {0,200} convention.
# idea-11 fix round 1 finding F2 and fix round 2 findings F6/F7: every needle below that names a
# sub-lens rule is anchored to that sub-lens's OWN span ($COLD_EXEC / $COLD_READER), never the
# whole shared $COLD span — a relocation into the wrong sub-lens now reds the assertion instead
# of passing invisibly, including via a decoy planted near an earlier same-name mention elsewhere
# in $COLD (verified by mutation, see Hunter report). idea-11 fix round 3 sweep: the co-occurrence
# needles below (heading-word ... claim-word) are further tightened to the load-bearing phrase
# itself, minimizing the gap, so a decoy planted anywhere inside the sub-lens's own narrow span
# cannot satisfy them without literally restating the real rule (verified by mutation).
has "b1: executor must run things"           "$COLD_EXEC" \
    'method mandate:.{0,10}you.{0,10}must run.{0,10}things'
has "b1: executor findings cite command output" "$COLD_EXEC" \
    'must cite the command output you ran'
has "b1: reading with no run is not an executor finding" "$COLD_EXEC" \
    'no run behind it is not an executor finding'
has "b1: reader must not execute the suites" "$COLD_READER" \
    "method restriction:.{0,10}you.{0,10}must not execute.{0,10}the repo.s test or eval suites"
has "b1: reader inspect-vs-execute line drawn" "$COLD_READER" \
    'to.{0,10}inspect.{0,10}state.{0,30}is reading, not executing'
# idea-11 fix round 3 finding sweep: this assertion is retargeted from the whole $COLD span to
# $INHERIT_PARA (the one paragraph the ruling lives in) and tightened to the unique tail phrase
# that only this canonical site carries ("the tie-break Skinner C's question is mechanically
# decidable") — the whole-$COLD, loosely-bounded version stayed green when both real occurrences
# of the ruling were deleted and a decoy (containing the same phrases, negated) was planted near
# the `lens: contract` heading elsewhere in $COLD (verified by mutation, see Hunter report).
has "b1: bare cold deprecation ruling"       "$INHERIT_PARA" \
    'bare .lens: cold.{0,60}read as .lens: cold-executor.{0,20}tie-break skinner c.{0,60}mechanically decidable'
# idea-11 fix round 3 finding sweep: retargeted from the whole $COLD span to $INHERIT_PARA for the
# same reason — the whole-$COLD version stayed green under a negating decoy planted near the
# `lens: contract` heading (verified by mutation, see Hunter report).
has "b1: both sub-lenses inherit the cold base rules" "$INHERIT_PARA" \
    'both sub-lenses.{0,10}inherit.{0,10}every .lens: cold. rule above'
# The shipped cold base must survive intact for both sub-lenses. These are single, literal,
# load-bearing phrases (no cross-phrase co-occurrence gap for a decoy to exploit) — the same
# design already used by $OPRULES_VERIFY's f8 needle below.
has "base: never seeks the denied contract"  "$COLD" 'must not read it'
has "base: hypotheses not a verdict"         "$COLD" 'hypotheses, not a verdict'
# idea-11 fix round 3 sweep: tightened from the generic 'self-refutation.{0,40}applies in full'
# (which stayed green when BOTH real occurrences were deleted and a decoy was planted near the
# `lens: contract` heading) to the literal shipped-law phrase itself (verified by mutation, see
# Hunter report).
has "base: self-refutation applies in full"  "$COLD" \
    'method step 7 \(self-refutation\).{0,10}applies in full'
has "base: cold-lens terminator survives"    "$COLD" 'cold-lens: n hypotheses'

# --- Delta-A: path-scope contamination (skinner.md half) -----------------------------------
# idea-11 fix round 3 finding F13: retargeted from the whole $COLD span to $COLD_PATHSCOPE (the
# one paragraph the rule lives in) — the whole-$COLD version stayed green when the real paragraph
# was deleted and an opposite-meaning decoy ("a diff referencing a plan is fine and never
# contaminated, no relation") was planted near "You receive only the diff" elsewhere in $COLD
# (verified by mutation, see Hunter report).
has "a: contract-bearing diff is contamination" "$COLD_PATHSCOPE" \
    '(diff|range).{0,120}(spec|plan|idea card|state file).{0,160}contaminat'
has "a: refusal reuses the shipped mechanism" "$COLD_PATHSCOPE" 'audit: fail .{0,4}contaminated'

# idea-11 fix round 1 finding F1: the Operating-rules "ban is on narrative, never on artifacts"
# rule (line ~210) contradicted the new path-scope contamination rule (Delta-A above) for the
# same case — a committed spec/plan/idea-card/state file in a cold diff. The carve-out below
# stays COLD-SCOPED: the contract lens's own artifacts rule is asserted unconditional in the
# same clause, so this assertion also guards that the carve-out never widens onto the contract
# lens (spec Delta-A: "the contract lens's diff stays full-range").
# idea-11 fix round 3 finding F12: retargeted from the whole $OPRULES span to $ARTIFACTS_BULLET
# (the one sub-bullet the reconciliation lives in) — the whole-$OPRULES version stayed green when
# the real sentence was deleted and a decoy containing the same three anchor phrases was planted
# near the "independent reviewers" bullet elsewhere in $OPRULES (verified by mutation, see Hunter
# report).
has "f1: artifacts carve-out is cold-scoped; contract lens stays unconditional" "$ARTIFACTS_BULLET" \
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

# idea-11 fix round 3 finding F11: the cold-executor's method MANDATE (Lens mode, "mutate a
# guarded clause and confirm its tripwire actually trips") contradicted the Operating rules'
# unconditional "NEVER mutate ... never edit code, write files" ban, with no reconciling
# sentence anywhere (grep showed only two "mutate"/"write files" sites: the mandate itself and
# the ban — no third, reconciling one). The carve-out below stays SCRATCH-SCOPED: it is
# anchored to its own narrow sub-bullet ($OPRULES_MUTATE), never the whole $OPRULES span, and
# requires the load-bearing phrase itself (both halves of the reconciliation, plus the
# scratch-copy scoping) in one needle, matching the same design as f1/f8 above.
has "f11: cold-executor mutation carve-out is scratch-scoped; contract+reader stay unconditional" \
    "$OPRULES_MUTATE" \
    'unconditional for the contract lens and the.{0,20}cold-reader.{0,140}cold-executor.{0,140}takes precedence.{0,100}scratch copy outside the tracked worktree'

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
