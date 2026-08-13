#!/usr/bin/env bash
# test-check-spec-handoffs.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../check-spec-handoffs.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad(){ FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

# (a) a spec dir containing a file with a handoff phrase -> hit reported with file:line
specs_a="$TMP/a-specs"; mkdir -p "$specs_a"
printf 'line one\nsenses is always length 1, but flagged here so this is deferred to B14'"'"'s own future spec inherits the awareness\nline three\n' > "$specs_a/b13-related-words-design.md"
out_a="$(bash "$SCRIPT" "$specs_a")"
code_a=$?
printf '%s\n' "$out_a" | grep -q "^$specs_a/b13-related-words-design.md:2: " \
  && ok "(a) hit reported with file:line" || bad "(a) hit reported with file:line (got: $out_a)"
[[ "$code_a" -eq 0 ]] && ok "(a) exit 0 when listing" || bad "(a) exit 0 when listing"

# (b) dir with no handoff phrases -> zero hits, exit 0
specs_b="$TMP/b-specs"; mkdir -p "$specs_b"
printf 'nothing interesting here, just a normal design note.\n' > "$specs_b/plain.md"
set +e
out_b="$(bash "$SCRIPT" "$specs_b")"; code_b=$?
set -e
printf '%s\n' "$out_b" | grep -q "^check-spec-handoffs: 0 hit" \
  && ok "(b) zero hits reported" || bad "(b) zero hits reported (got: $out_b)"
[[ "$code_b" -eq 0 ]] && ok "(b) exit 0 with zero hits" || bad "(b) exit 0 with zero hits"

# (c) --strict + hits + no handoffs.md -> exit 1
specs_c="$TMP/c-specs"; mkdir -p "$specs_c"
printf 'obligation deferred to a future spec.\n' > "$specs_c/one.md"
set +e
bash "$SCRIPT" --strict "$specs_c" >/dev/null 2>"$TMP/c.err"; code_c=$?
set -e
[[ "$code_c" -eq 1 ]] && ok "(c) --strict exits 1 with hits and no ledger" \
  || bad "(c) --strict exits 1 with hits and no ledger (got exit $code_c)"

# (d) --strict + hits + handoffs.md present -> exit 0
specs_d="$TMP/d-specs"; mkdir -p "$specs_d"
printf 'obligation deferred to a future spec.\n' > "$specs_d/one.md"
printf '# Handoff ledger\n| From | Obligation | Receiving spec | Acknowledged at |\n' > "$specs_d/handoffs.md"
set +e
bash "$SCRIPT" --strict "$specs_d" >/dev/null; code_d=$?
set -e
[[ "$code_d" -eq 0 ]] && ok "(d) --strict exits 0 when ledger present" \
  || bad "(d) --strict exits 0 when ledger present (got exit $code_d)"

# (e) multiple dirs scanned
specs_e1="$TMP/e-specs-1"; mkdir -p "$specs_e1"
specs_e2="$TMP/e-specs-2"; mkdir -p "$specs_e2"
printf 'this is out of scope for this card and will be addressed in a follow-up spec.\n' > "$specs_e1/one.md"
printf 'another handoff: handed to the next card explicitly.\n' > "$specs_e2/two.md"
out_e="$(bash "$SCRIPT" "$specs_e1" "$specs_e2")"
printf '%s\n' "$out_e" | grep -q "$specs_e1/one.md:1" && ok "(e) hit found in first dir" \
  || bad "(e) hit found in first dir (got: $out_e)"
printf '%s\n' "$out_e" | grep -q "$specs_e2/two.md:1" && ok "(e) hit found in second dir" \
  || bad "(e) hit found in second dir (got: $out_e)"
printf '%s\n' "$out_e" | grep -q "^check-spec-handoffs: 2 hit(s) across 2 dir(s)" \
  && ok "(e) summary counts hits across both dirs" \
  || bad "(e) summary counts hits across both dirs (got: $out_e)"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [[ "$FAIL" -eq 0 ]]
