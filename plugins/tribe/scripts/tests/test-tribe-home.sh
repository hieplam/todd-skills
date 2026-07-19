#!/usr/bin/env bash
# test-tribe-home.sh — key derivation is stable across linked worktrees.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../tribe-home.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check() { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2 want: $3)"; fi; }
git_c() { git -C "$1" -c user.email=t@t.test -c user.name=t "${@:2}"; }
export HOME="$TMP/home"; mkdir -p "$HOME"

main="$TMP/proj"; git init --template= -q -b master "$main"
git -C "$main" config wtguard.protected ""
git_c "$main" commit --allow-empty -qm init

from_main="$(bash "$SCRIPT" "$main")"
wt="$TMP/proj-wt-1"; git_c "$main" worktree add -q "$wt" -b feat-1 master
from_wt="$(cd "$wt" && bash "$SCRIPT")"          # default arg = PWD
check "main and linked worktree yield same home" "$from_main" "$from_wt"

realmain="$(cd "$main" && pwd -P)"
want="$HOME/.tribe/$(printf '%s' "$realmain" | sed 's#/#-#g')"
check "home path matches HOME/.tribe/<slash-dashed-root>" "$from_main" "$want"

set +e; bash "$SCRIPT" "$TMP" >/dev/null 2>&1; rc=$?; set -e
check "non-git dir exits 2" "$rc" "2"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [[ "$FAIL" -eq 0 ]]
