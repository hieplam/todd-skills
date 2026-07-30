#!/usr/bin/env bash
# plugins/tribe/scripts/tests/test-list-session-ids.sh
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
script="$here/../kanna/list-session-ids.sh"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

fail=0
assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [[ "$expected" != "$actual" ]]; then
    echo "FAIL: $desc — expected [$expected] got [$actual]"
    fail=1
  else
    echo "ok: $desc"
  fi
}

# Case 1: mixed null/non-null ids, sequence order preserved.
cat > "$tmp/state.json" <<'JSON'
{
  "v": 1,
  "sequence": ["A1", "A2", "A3"],
  "cards": {
    "A1": { "sessionId": "4f9c2b1e-8a31-4c7d-9b2e-1a2b3c4d5e6f" },
    "A2": { "sessionId": null },
    "A3": { "sessionId": "0f9c2b1e-8a31-4c7d-9b2e-1a2b3c4d5e6f" }
  }
}
JSON
out="$("$script" "$tmp/state.json")"
assert_eq "mixed ids, sequence order" \
  "$(printf '4f9c2b1e-8a31-4c7d-9b2e-1a2b3c4d5e6f\n0f9c2b1e-8a31-4c7d-9b2e-1a2b3c4d5e6f')" \
  "$out"

# Case 2: all-null ids -> exit 2, empty stdout.
cat > "$tmp/state-empty.json" <<'JSON'
{"v":1,"sequence":["B1"],"cards":{"B1":{"sessionId":null}}}
JSON
set +e
out2="$("$script" "$tmp/state-empty.json" 2>/dev/null)"
code2=$?
set -e
assert_eq "all-null exit code" "2" "$code2"
assert_eq "all-null stdout empty" "" "$out2"

# Case 3: missing file -> exit 1.
set +e
"$script" "$tmp/does-not-exist.json" >/dev/null 2>&1
code3=$?
set -e
assert_eq "missing file exit code" "1" "$code3"

# Case 4: malformed JSON -> exit 1 (jq parse errors must map to the same
# usage/parse-error contract as missing-file, not jq's own exit code 5).
echo "not json" > "$tmp/malformed.json"
set +e
"$script" "$tmp/malformed.json" >/dev/null 2>&1
code4=$?
set -e
assert_eq "malformed json exit code" "1" "$code4"

# Case 5: valid JSON missing the sequence/cards shape -> exit 1, same reason.
echo '{"foo":"bar"}' > "$tmp/nostruct.json"
set +e
"$script" "$tmp/nostruct.json" >/dev/null 2>&1
code5=$?
set -e
assert_eq "wrong-shape json exit code" "1" "$code5"

# Case 6: a failing clipboard tool must not corrupt the script's own success
# exit code — ids are already on stdout, the clipboard copy is best-effort.
fakebin="$tmp/fakebin"
mkdir -p "$fakebin"
cat > "$fakebin/pbcopy" <<'EOF'
#!/usr/bin/env bash
echo "pbcopy: cannot connect to the WindowServer" >&2
exit 1
EOF
chmod +x "$fakebin/pbcopy"
cat > "$tmp/state-clip.json" <<'JSON'
{"sequence":["A1"],"cards":{"A1":{"sessionId":"abc-123"}}}
JSON
set +e
out6="$(PATH="$fakebin:$PATH" "$script" "$tmp/state-clip.json" 2>/dev/null)"
code6=$?
set -e
assert_eq "failing clipboard tool exit code stays 0" "0" "$code6"
assert_eq "failing clipboard tool still prints ids" "abc-123" "$out6"

# Case 7: empty-string sessionId is filtered out like null (mixed case) —
# must not print a blank line, and must not shift real ids.
cat > "$tmp/state-empty-str.json" <<'JSON'
{"sequence":["A1","A2"],"cards":{"A1":{"sessionId":""},"A2":{"sessionId":"real-id-123"}}}
JSON
out7="$("$script" "$tmp/state-empty-str.json" 2>/dev/null)"
assert_eq "empty-string sessionId filtered, no blank line" "real-id-123" "$out7"

# Case 8: ALL sessionIds are empty string -> same "no ids yet" outcome as
# all-null, exit 2, empty stdout (not a false negative).
cat > "$tmp/state-only-empty-str.json" <<'JSON'
{"sequence":["A1"],"cards":{"A1":{"sessionId":""}}}
JSON
set +e
out8="$("$script" "$tmp/state-only-empty-str.json" 2>/dev/null)"
code8=$?
set -e
assert_eq "all-empty-string exit code" "2" "$code8"
assert_eq "all-empty-string stdout empty" "" "$out8"

exit "$fail"
