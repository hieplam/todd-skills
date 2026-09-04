#!/usr/bin/env bash
# test-review-cell-v3.sh — contract tripwire for idea 11 (review-cell v3).
#
# TRIPWIRE, not a behavior test: proves the card's laws are WRITTEN into the agent prompts and
# the pre-gate script exists and behaves; behavior is proved by evals.json ids added by task 5.
# Offline, no network. Idea 11 is a DELTA on shipped ideas 01/02/03/04/05 — the dependency
# assertions below fail loudly if run before those baselines are present.
set -euo pipefail
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
# warchief.md step 6, whole span (task 2 of this wave onward reads from here). $AGENTS is
# already "$HERE/../../agents" (plugins/tribe/agents), same base $SKIN already reads
# "$AGENTS/skinner.md" from, two lines above.
WAR="$(tr '\n' ' ' < "$AGENTS/warchief.md" | tr -s ' ')"
STEP6="$(awk '/^### 6\./{f=1} /^### 7\./{f=0} f' "$AGENTS/warchief.md" | tr '\n' ' ' | tr -s ' ')"
RECORD="$(awk '/^#### Recording it/{f=1} /^\*\*The fixer brief/{f=0} f' "$AGENTS/warchief.md" \
          | tr '\n' ' ' | tr -s ' ')"
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

# --- Task 2 (Delta-C): the pre-gate script exists and behaves -----------------------------
GATE="$HERE/../pre-gate.sh"
if [ -x "$GATE" ]; then echo "ok: c: pre-gate.sh exists and is executable"; pass=$((pass+1)); \
else echo "FAIL: c: pre-gate.sh exists and is executable"; fail=$((fail+1)); fi

if [ "${PREGATE_INNER:-0}" != "1" ]; then
  # fail-closed-edges obligation 2: neutralise host git config for every git subprocess below
  # (including the pre-gate.sh children, which read %(trailers) themselves) — a legal global
  # setting such as `[trailer] separators = "#"` otherwise empties %(trailers) and reds these
  # assertions for reasons unrelated to the code under test.
  export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
  # Self-test 1 (pass case): sweep this repo's own suites over a 1-commit range, no fence.
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
    echo "$OUT" | grep -q '"verdict": *"pass"' \
      && { echo "ok: c: self-test pass case verdict"; pass=$((pass+1)); } \
      || { echo "FAIL: c: self-test pass case verdict"; fail=$((fail+1)); }
    grep -q 'test-review-cell-v3' "$REPORT" \
      && { echo "ok: c: report names every suite it ran"; pass=$((pass+1)); } \
      || { echo "FAIL: c: report names every suite it ran"; fail=$((fail+1)); }
  else
    echo "FAIL: c: self-test pass case verdict"; fail=$((fail+1))
    echo "FAIL: c: report names every suite it ran"; fail=$((fail+1))
  fi

  # Self-test 6 (host-config isolation): the gate's verdict must not depend on the machine's
  # global git config. A legal `[trailer] separators = "#"` empties %(trailers) for every commit;
  # the gate must neutralise it itself, whatever its caller's environment says. The per-command
  # GIT_CONFIG_GLOBAL below deliberately overrides this suite's own /dev/null export for that one
  # child. A stub tests dir keeps this self-test from re-sweeping the real suites.
  printf '[trailer]\n\tseparators = "#"\n' > "$TMPD/hostile.gitconfig"
  mkdir -p "$TMPD/stub-tests"
  printf '#!/usr/bin/env bash\necho "1 passed, 0 failed"\n' > "$TMPD/stub-tests/test-stub.sh"
  chmod +x "$TMPD/stub-tests/test-stub.sh"
  if [ -x "$GATE" ] && [ -n "$PASSRANGE" ] && HOSTILE_OUT="$(GIT_CONFIG_GLOBAL="$TMPD/hostile.gitconfig" \
        PREGATE_INNER=1 "$GATE" --repo "$HERE/../../../.." --range "$PASSRANGE" \
        --tests-dir "$TMPD/stub-tests" --report "$TMPD/hostile.md" 2>/dev/null)" \
     && echo "$HOSTILE_OUT" | grep -q '"trailers": *"pass"'; then
    echo "ok: c6: gate isolates itself from a hostile global git config"; pass=$((pass+1))
  else
    echo "FAIL: c6: gate isolates itself from a hostile global git config"; fail=$((fail+1))
  fi

  # Self-test 2 (red case): a fence that allows nothing must flag every changed file, exit 1.
  FENCE="$TMPD/fence.globs"; echo 'docs/never-matches-anything/**' > "$FENCE"
  if [ -x "$GATE" ]; then
    rc=0
    PREGATE_INNER=1 "$GATE" --repo "$HERE/../../../.." --range 'HEAD~1..HEAD' --tests-dir "$HERE" \
            --report "$TMPD/red.md" --fence "$FENCE" >/dev/null 2>&1 || rc=$?
    [ "$rc" -eq 1 ] && { echo "ok: c: fence violation exits 1"; pass=$((pass+1)); } \
                 || { echo "FAIL: c: fence violation exits 1"; fail=$((fail+1)); }
    grep -qi 'fence' "$TMPD/red.md" \
      && { echo "ok: c: violation named in the report"; pass=$((pass+1)); } \
      || { echo "FAIL: c: violation named in the report"; fail=$((fail+1)); }
  else
    echo "FAIL: c: fence violation exits 1"; fail=$((fail+1))
    echo "FAIL: c: violation named in the report"; fail=$((fail+1))
  fi
  # Self-test 3 (F1 fix): an unresolvable --range is a setup error (exit 2), never a silent
  # zero-iteration pass; a VALID but EMPTY range must stay a legitimate pass (exit 0). Uses an
  # isolated throwaway repo so the assertion never depends on this repo's real commit history.
  F1REPO="$TMPD/f1repo"
  git init -q "$F1REPO"
  git -C "$F1REPO" -c user.email=t@t.com -c user.name=t commit -q --allow-empty -m init
  if [ -x "$GATE" ]; then
    rc=0
    PREGATE_INNER=1 "$GATE" --repo "$F1REPO" --range 'nonexistent-ref-xyz..HEAD' --tests-dir "$HERE" \
      --report "$TMPD/f1-bad.md" >/dev/null 2>"$TMPD/f1-bad.err" || rc=$?
    F1BADCODE=$rc
    [ "$F1BADCODE" -eq 2 ] && grep -qi 'unresolvable range' "$TMPD/f1-bad.err" \
      && { echo "ok: f1: unresolvable range is a setup error (exit 2)"; pass=$((pass+1)); } \
      || { echo "FAIL: f1: unresolvable range is a setup error (exit 2)"; fail=$((fail+1)); }

    rc=0
    PREGATE_INNER=1 "$GATE" --repo "$F1REPO" --range 'HEAD..HEAD' --tests-dir "$HERE" \
      --report "$TMPD/f1-empty.md" >/dev/null 2>&1 || rc=$?
    [ "$rc" -eq 0 ] && { echo "ok: f1: valid empty range still exits 0"; pass=$((pass+1)); } \
                 || { echo "FAIL: f1: valid empty range still exits 0"; fail=$((fail+1)); }
  else
    echo "FAIL: f1: unresolvable range is a setup error (exit 2)"; fail=$((fail+1))
    echo "FAIL: f1: valid empty range still exits 0"; fail=$((fail+1))
  fi

  # Self-test 4 (F2 fix): a fence glob's lone `*` matches within ONE path segment only — it must
  # NOT cross a directory boundary. `plugins/tribe/scripts/*.sh` must allow a top-level file but
  # flag a same-named-extension file nested one level deeper as a violation.
  F2REPO="$TMPD/f2repo"
  git init -q "$F2REPO"
  git -C "$F2REPO" -c user.email=t@t.com -c user.name=t commit -q --allow-empty -m base
  mkdir -p "$F2REPO/plugins/tribe/scripts/tests"
  echo x > "$F2REPO/plugins/tribe/scripts/goodfile.sh"
  echo y > "$F2REPO/plugins/tribe/scripts/tests/nested.sh"
  ( cd "$F2REPO" && git add -A \
    && git -c user.email=t@t.com -c user.name=t commit -q -m changes --trailer "Tribe-Card: x" )
  F2FENCE="$TMPD/f2fence.globs"; printf 'plugins/tribe/scripts/*.sh\n' > "$F2FENCE"
  if [ -x "$GATE" ]; then
    rc=0
    PREGATE_INNER=1 "$GATE" --repo "$F2REPO" --range 'HEAD~1..HEAD' --tests-dir "$HERE" \
      --report "$TMPD/f2.md" --fence "$F2FENCE" >/dev/null 2>&1 || rc=$?
    F2CODE=$rc
    grep -q 'plugins/tribe/scripts/goodfile.sh — in fence' "$TMPD/f2.md" \
      && grep -q 'plugins/tribe/scripts/tests/nested.sh — FENCE VIOLATION' "$TMPD/f2.md" \
      && [ "$F2CODE" -eq 1 ] \
      && { echo "ok: f2: single-star fence glob does not cross a directory boundary"; pass=$((pass+1)); } \
      || { echo "FAIL: f2: single-star fence glob does not cross a directory boundary"; fail=$((fail+1)); }
  else
    echo "FAIL: f2: single-star fence glob does not cross a directory boundary"; fail=$((fail+1))
  fi

  # Self-test 5 (F3 fix): a fence FILE whose last glob line lacks a trailing newline must still
  # apply that last glob — a bare `read` returning non-zero on the unterminated final line must
  # not silently drop it and false-flag a legitimate file as a violation.
  F3REPO="$TMPD/f3repo"
  git init -q "$F3REPO"
  git -C "$F3REPO" -c user.email=t@t.com -c user.name=t commit -q --allow-empty -m base
  mkdir -p "$F3REPO/docs" "$F3REPO/plugins/tribe/scripts"
  echo x > "$F3REPO/docs/placeholder.txt"
  echo y > "$F3REPO/plugins/tribe/scripts/lastglobfile.sh"
  ( cd "$F3REPO" && git add -A \
    && git -c user.email=t@t.com -c user.name=t commit -q -m changes --trailer "Tribe-Card: x" )
  F3FENCE="$TMPD/f3fence.globs"
  printf 'docs/**\nplugins/tribe/scripts/*.sh' > "$F3FENCE"   # deliberately NO trailing newline
  if [ -x "$GATE" ]; then
    rc=0
    PREGATE_INNER=1 "$GATE" --repo "$F3REPO" --range 'HEAD~1..HEAD' --tests-dir "$HERE" \
      --report "$TMPD/f3.md" --fence "$F3FENCE" >/dev/null 2>&1 || rc=$?
    F3CODE=$rc
    grep -q 'plugins/tribe/scripts/lastglobfile.sh — in fence' "$TMPD/f3.md" && [ "$F3CODE" -eq 0 ] \
      && { echo "ok: f3: fence file's unterminated last line still applies its glob"; pass=$((pass+1)); } \
      || { echo "FAIL: f3: fence file's unterminated last line still applies its glob"; fail=$((fail+1)); }
  else
    echo "FAIL: f3: fence file's unterminated last line still applies its glob"; fail=$((fail+1))
  fi

  rm -rf "$TMPD"
fi

# --- Task 3a (Delta-A, warchief half): path-scoped cold diff ------------------------------
# idea-11 review-cell-v3 fix round 1 finding F4: all four needles below used to be bare
# keyword/proximity co-occurrence with no polarity guard, so each was satisfiable by prose
# asserting the exact OPPOSITE of the rule it locks in (e.g. "contract lens's diff never stays
# full-range" still matched 'contract lens.{0,60}stays full-range'). Tightened to require a
# contiguous (or near-contiguous, small-gap) match of the load-bearing phrase itself, so a
# negation word or clause inserted into the gap pushes the match past the bound and reds the
# assertion (verified by mutation, see Hunter report).
has "a: cold diff is path-scoped"              "$STEP6" \
    'cold lens.s diff is path-scoped, not just its brief'
has "a: planning dir excluded"                 "$STEP6" \
    'covering, at minimum,.{0,10}docs/tribe/planning'
has "a: unscoped range is a forbidden channel" "$STEP6" \
    'un-scoped full-range diff.{0,80}(range|diff) hands the cold lens the contract'
has "a: contract lens diff stays full-range"   "$STEP6" \
    'contract lens.s diff stays full-range'

# --- Task 3b (Delta-C, law half): the pre-gate step-6.0 law --------------------------------
# Polarity self-check (D14, applied before commit, not after a Skinner finding — see Hunter
# report): the plan's own draft needles for "a: pre-gate runs before any skinner", "a: red
# pre-gate is not an audit round" and "a: contract brief carries the report" used wide
# co-occurrence gaps (.{0,60}/.{0,160}/.{0,80}) that a natural opposite-meaning rewrite still
# satisfies (e.g. "the pre-gate need not run before dispatching any Skinner" still matches
# 'pre-gate.{0,60}before dispatching any skinner'; "...(path or content), which is never treated
# as settled mechanical fact" still matches the given contract-brief needle). Tightened to a
# near-zero-gap quote of the load-bearing phrase itself, same technique as fix round F4 above, so
# an inserted qualifier breaks the match (verified by mutation, see Hunter report). The "cold
# brief does not carry it" and "mandatory full-sweep clause is retired" needles below are used
# as originally drafted — both already anchor a specific verb-negation pair / a literal
# zero-gap phrase and survived the same polarity check unchanged.
#
# idea-11 review-cell-v3 fix round 2 finding F6: despite the note above, 4 of these 5 needles
# were STILL polarity-blind — their remaining wide gaps (`.{0,10}` before "against the range...",
# `.{0,6}` before "settled", `.{0,10}` twice around "not", and no anchor at all before "stop
# mandating") each had room for an inserted negation/duplication to slip through undetected (e.g.
# "do not run pre-gate.sh against the range..." still matched the old pre-gate-runs needle; "as
# NOT settled mechanical fact" still matched the old contract-brief needle; "does not fail to
# carry it" still matched the old cold-brief needle; "briefs never stop mandating..." still
# matched the old full-sweep needle — all four reproduced, see Hunter report). Re-tightened to
# near-literal, near-zero-gap quotes of the load-bearing phrase (including the markdown `**bold**`
# markers the real text actually uses around "not"/"settled", so a negation has no legal gap left
# to sit in), verified against the four reproductions above (now NOMATCH) plus one further
# mutation per needle (a qualifier inserted after the command path; "as never **settled**"; "does
# **not always** carry it"; "briefs no longer stop mandating..." — all four also NOMATCH; see
# Hunter report), and against the real unmutated warchief.md text (still MATCH).
has "c: pre-gate runs before any skinner"      "$STEP6" \
    'run .plugins/tribe/scripts/pre-gate\.sh. against the range under audit before dispatching any skinner'
has "c: red pre-gate is not an audit round"    "$STEP6" 'unfinished work, not an audit round'
has "c: contract brief carries the report"     "$STEP6" \
    "contract lens.s brief carries the pre-gate.s report \\(path or content\\) as \\*\\*settled mechanical fact"
has "c: cold brief does not carry it"          "$STEP6" "cold lens.s brief does \\*\\*not\\*\\* carry it"
has "c: the mandatory full-sweep clause is retired" "$STEP6" \
    'reviewer briefs stop mandating full-suite re-runs'

# idea-11 review-cell-v3 fix round 2 finding F5: step 6.0 says the contract lens's brief carries
# the pre-gate's report, but the Dispatch-content checklist's 4 categories (below, UNCHANGED
# structure/count) named no category it fits under, and no sentence anywhere reconciled the two —
# a dispatch following the checklist literally could not legally carry what step 6.0 mandates.
# Fixed by extending category 3 ("The repo's rules") with a clause admitting the pre-gate's report
# for the contract lens specifically, keeping the 4-category/"never more" ceiling intact (see
# Hunter report for the D14 mutation: deleting only this clause reds this needle alone, restoring
# it goes green again).
has "c: checklist admits pre-gate report for contract lens" "$STEP6" \
    "repo.s rules.{0,10}CLAUDE\\.md.{0,120}for the contract.{0,10}lens only, this also admits a green pre-gate.s own report"

# idea-11 review-cell-v3 fix round 2 finding F7: "Reviewer briefs stop mandating full-suite
# re-runs" only stopped the WARCHIEF's brief from saying "re-run everything" — skinner.md's own
# Method step 5 ("Execute the plan's exact per-task verification commands...") is untouched and
# unconditional, so a contract lens still following its own Method literally re-runs this
# campaign's full sibling-suite sweep every round regardless of what the brief omits. Fixed by
# adding one sentence to step 6.0 that tells the contract lens's brief to explicitly state the
# pre-gate's report already satisfies Method step 5 for the suites it ran, so the retirement is
# actually true instead of merely silent (D14 + polarity check: negating "already satisfies" to
# "does not already satisfy" or "never explicitly states" both fail this needle, see Hunter
# report).
has "c: contract brief states pre-gate satisfies method step 5" "$STEP6" \
    "the contract lens.s brief explicitly states.{0,20}that the pre-gate.s report already satisfies Method step 5.s suite-verification requirement"

# --- Task 4 (Delta-D): the ledger's lens column + Reviewer-yield table ---------------------
has "d: ledger gains a lens column"        "$RECORD" 'lens.{0,120}contract.{0,20}cold-exec.{0,20}cold-read'
has "d: multi-lens findings comma-join"    "$RECORD" 'comma-joined when more than one lens'
has "d: reviewer-yield table exists"       "$RECORD" 'reviewer yield'
has "d: yield rows are per lens"           "$RECORD" 'one row per lens'
has "d: yield columns named"               "$RECORD" \
    'raised.{0,40}unique.{0,40}confirmed.{0,40}refuted.{0,40}out-of-scope'
has "d: derived from the ledger only"      "$RECORD" 'derived entirely from the ledger'
has "d: non-authoritative, never resume"   "$RECORD" 'non-authoritative.{0,80}never.{0,40}resume'
has "d: cold-read may show zero dispatches" "$RECORD" 'cold-read.{0,160}zero dispatches'
has "d: the shaman decides from data"      "$RECORD" 'shaman.{0,120}from data'

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
