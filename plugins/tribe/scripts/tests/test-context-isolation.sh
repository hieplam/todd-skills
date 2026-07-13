#!/usr/bin/env bash
# test-context-isolation.sh — governance test for the Skinner dispatch seal (idea-02).
# Asserts the context-isolation rule is PRESENT and REACHABLE in the tribe's agent prompts.
# The artifact under test is prompt text, so the proof is a static check on that text.
# Offline, no network.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$HERE/../../agents"
WARCHIEF="$AGENTS/warchief.md"
SKINNER="$AGENTS/skinner.md"
HUNTER="$AGENTS/hunter.md"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

# has NAME FILE PATTERN — assert PATTERN (fixed string, case-insensitive) appears in FILE
has() {
  if grep -qiF -- "$3" "$2"; then ok "$1"; else bad "$1 (missing in $(basename "$2"): $3)"; fi
}

for f in "$WARCHIEF" "$SKINNER" "$HUNTER"; do
  [[ -f "$f" ]] || { printf 'not ok - agent file missing: %s\n' "$f"; exit 1; }
done

# --- T1: warchief step 6 carries the four-item allowlist ------------------------
has "T1a warchief: dispatch-content checklist exists" "$WARCHIEF" "Dispatch-content checklist"
has "T1b warchief: allowlist is exhaustive"           "$WARCHIEF" "may contain ONLY these four things"
has "T1c warchief: allows the contract"               "$WARCHIEF" "the spec and/or plan (paths or content), authored before the code existed"
has "T1d warchief: allows the diff"                   "$WARCHIEF" "the change under audit, in full, identified mechanically"
has "T1e warchief: allows the repo rules"             "$WARCHIEF" "C3 docs, and the like"
has "T1f warchief: allows mechanical scope"           "$WARCHIEF" "which change to audit and where"
has "T1g warchief: allowlist is a ceiling"            "$WARCHIEF" "CEILING, not a floor"

# --- T2: warchief step 6 bans the code side's narrative -------------------------
has "T2a warchief: bans the Hunter's report file"     "$WARCHIEF" "the Hunter's report file"
has "T2b warchief: bans the Hunter's return message"  "$WARCHIEF" "the Hunter's return message"
has "T2c warchief: bans the Warchief's own narrative" "$WARCHIEF" "your own narrative about the build"
has "T2d warchief: bans prior Skinner reports"        "$WARCHIEF" "prior Skinner reports on the same code"
has "T2e warchief: states the bias rationale"         "$WARCHIEF" "wants the code to get accepted"

# --- T3: the diff-carries-artifacts exception -----------------------------------
has "T3a warchief: diff is the only code-side channel" "$WARCHIEF" "ONLY channel from the code side"
has "T3b warchief: narrative banned, artifacts are not" "$WARCHIEF" "never on artifacts inside the diff"
has "T3c warchief: prose vs artifacts maxim"            "$WARCHIEF" "Prose persuades; artifacts get run"

# --- T4: every audit starts cold, including re-audits ---------------------------
has "T4a warchief: fresh Skinner per fix-round"        "$WARCHIEF" "Each fix-round gets a FRESH Skinner"
has "T4b warchief: no prior findings carried in"       "$WARCHIEF" "no previous findings"
has "T4c warchief: final audit carries no history"     "$WARCHIEF" "no accumulated per-task audit history"

# --- T5: CONTAMINATED routing -----------------------------------------------------
has "T5a warchief: contaminated is a dispatch fault"   "$WARCHIEF" "a verdict on YOUR dispatch, not on the code"
has "T5b warchief: never route it to a fixer"          "$WARCHIEF" "never route it to a fixer Hunter"
has "T5c warchief: it costs no fix-round"              "$WARCHIEF" "does NOT consume one of the 3 fix-rounds"

printf '\n# passed %d, failed %d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
