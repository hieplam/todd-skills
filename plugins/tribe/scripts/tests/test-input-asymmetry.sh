#!/usr/bin/env bash
# test-input-asymmetry.sh — contract tripwire for the input-asymmetric Skinner pair (idea 03).
#
# TRIPWIRE, not a behavior test: it proves the delta-laws are WRITTEN into the agent prompts and
# fails loudly if a later edit deletes one. Behavior is proved by the evals in
# plugins/tribe/evals/evals.json. Offline, no network.
#
# Idea 03 is a DELTA on idea 01 (the dual-Skinner cell). The baseline assertions below are the
# dependency check: run this before idea 01 has landed and you get a clear failure, not a silent
# no-op edit.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$HERE/../../agents"
WARCHIEF="$AGENTS/warchief.md"
SKINNER="$AGENTS/skinner.md"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

# Agent prompts are hard-wrapped prose, so a sentence routinely straddles a newline; grep is
# line-based and would miss it. Flatten each haystack to one whitespace-normalized line so the
# assertions match meaning, not line-breaking accidents.
flat() { tr '\n' ' ' | tr -s ' '; }

has() { # has NAME HAYSTACK REGEX — the flattened text must contain the regex
  if grep -qiE "$3" <<<"$2"; then ok "$1"; else bad "$1 (missing: $3)"; fi
}
hasnt() { # hasnt NAME HAYSTACK REGEX — the flattened text must NOT contain the regex
  if grep -qiE "$3" <<<"$2"; then bad "$1 (found what must be gone: $3)"; else ok "$1"; fi
}

[[ -f "$WARCHIEF" ]] || { printf 'not ok - warchief.md not found\n'; exit 1; }
[[ -f "$SKINNER" ]]  || { printf 'not ok - skinner.md not found\n'; exit 1; }

SKINNER_ALL="$(flat < "$SKINNER")"

# The cold-lens rules must live in their OWN section, so assert against that section only —
# never against the whole file. skinner.md already says "self-refutation", "contract",
# "UN-AUDITABLE" etc. in its contract-lens Method, so a whole-file grep would go green before a
# single edit was made: a tripwire that passes on the unmodified file guards nothing.
LENS="$(awk '/^## Lens mode/{f=1} /^## Operating rules/{f=0} f' "$SKINNER" | flat)"

# --- Dependency check: idea 01's baseline must already be in place -------------------------
if ! grep -qiE 'law 1' "$WARCHIEF"; then
  printf 'not ok - DEPENDENCY: idea 01 baseline (labelled Laws in step 6) not found in warchief.md\n'
  printf '# idea 03 is a delta on idea 01. Land idea 01 first. Aborting.\n'
  exit 1
fi
ok "dependency: idea 01 baseline present in warchief.md"

# --- Task 1 — skinner.md cold-lens mode ----------------------------------------------------
# (Before Task 1's edit, "$LENS" is the empty string and every assertion below fails. That is the
# RED state, and it is the point.)

# The lens switch itself.
has "cold: skinner.md declares a lens mode (contract | cold)" "$LENS" 'lens: contract|lens: cold'
has "cold: the cold lens is named and described"             "$LENS" 'cold lens|bare-diff reviewer'
has "cold: contract lens is the default"                     "$LENS" 'contract.{0,30}default|default.{0,30}contract'

# The load-bearing suspension: having no contract is the ASSIGNMENT in cold mode, not a failure.
has "cold: the contract hunt is suspended"                   "$LENS" 'suspend'
has "cold: UN-AUDITABLE never applies in cold mode"          "$LENS" 'never return .?UN-AUDITABLE|UN-AUDITABLE.{0,80}cold'

# The cold lens must not go looking for the contract it was denied.
has "cold: must not read a spec/plan/card found on disk"     "$LENS" 'must not read'

# The verdict boundary: cold mode emits COLD-LENS:, never AUDIT:.
has "cold: emits a COLD-LENS terminator line"                "$LENS" 'COLD-LENS: [0-9N]+ hypothes'
has "cold: is forbidden from emitting an AUDIT line"         "$LENS" 'never emit an .?AUDIT:'
has "cold: findings are hypotheses, not a verdict"           "$LENS" 'not a verdict|hold no PASS/FAIL'

# Anti-Goodhart: zero hypotheses is honorable, and self-refutation still applies in full.
has "cold: zero hypotheses is an honorable result"           "$LENS" '0 hypotheses|zero hypotheses'
has "cold: self-refutation still applies in cold mode"       "$LENS" 'self-refutation'

# The one edit OUTSIDE the new section: Method step 1's UN-AUDITABLE stop must point at cold mode,
# so the two passages cannot contradict each other.
has "cold: Method step 1 carves out the cold lens"           "$SKINNER_ALL" 'contract lens only|in .?lens: cold.? this whole step is suspended'

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
