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

exit "$fail"
