#!/usr/bin/env bash
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../archive-card.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad(){ FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
git_c(){ git -C "$1" -c user.email=t@t.test -c user.name=t "${@:2}"; }
export HOME="$TMP/home"; mkdir -p "$HOME"
repo="$TMP/proj"; git init --template= -q -b master "$repo"
git -C "$repo" config wtguard.protected ""
git_c "$repo" commit --allow-empty -qm init
home="$(bash "$HERE/../tribe-home.sh" "$repo")"; mkdir -p "$home/state"
printf '# tribe-state: idea-01\n' > "$home/state/idea-01.md"

bash "$SCRIPT" idea-01 "$repo" >/dev/null
[[ -f "$home/archive/idea-01.md" && ! -e "$home/state/idea-01.md" ]] \
  && ok "state archived" || bad "state archived"
bash "$SCRIPT" idea-01 "$repo" >/dev/null && ok "idempotent no-op when absent" || bad "idempotent no-op"
printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [[ "$FAIL" -eq 0 ]]
