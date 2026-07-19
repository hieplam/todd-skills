#!/usr/bin/env bash
# test-migrate-state.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../migrate-state.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad(){ FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check(){ if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2 want: $3)"; fi; }
git_c(){ git -C "$1" -c user.email=t@t.test -c user.name=t "${@:2}"; }
export HOME="$TMP/home"; mkdir -p "$HOME"

repo="$TMP/proj"; git init --template= -q -b master "$repo"
git -C "$repo" config wtguard.protected ""
mkdir -p "$repo/docs/tribe/state"
printf '# tribe-state: idea-01\nworktree: %s\nbranch: master\n' "$repo" > "$repo/docs/tribe/state/idea-01.md"
git_c "$repo" add -A; git_c "$repo" commit -qm init

bash "$SCRIPT" "$repo" >/dev/null
home="$(bash "$HERE/../tribe-home.sh" "$repo")"
[[ -f "$home/state/idea-01.md" ]] && ok "state copied to home" || bad "state copied to home"
grep -q '^docs/tribe/state/' "$repo/.gitignore" && ok "gitignored" || bad "gitignored"
tracked="$(git -C "$repo" ls-files docs/tribe/state)"
check "state de-tracked from index" "$tracked" ""

bash "$SCRIPT" "$repo" >/dev/null            # idempotent re-run
n="$(grep -c '^docs/tribe/state/' "$repo/.gitignore")"
check "gitignore line not duplicated" "$n" "1"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [[ "$FAIL" -eq 0 ]]
