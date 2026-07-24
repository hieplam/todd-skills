#!/usr/bin/env bash
# test-migrate-campaign-home.sh
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../migrate-campaign-home.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok(){ PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad(){ FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check(){ if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2 want: $3)"; fi; }
git_c(){ git -C "$1" -c user.email=t@t.test -c user.name=t "${@:2}"; }
export HOME="$TMP/home"; mkdir -p "$HOME"

repo="$TMP/proj"; git init --template= -q -b master "$repo"
git -C "$repo" config wtguard.protected ""
git_c "$repo" commit --allow-empty -qm init

home="$(bash "$HERE/../tribe-home.sh" "$repo")"
dest="$home/campaigns/camp1/reports/C1.md"

seed_source(){
  mkdir -p "$repo/.claude/state/camp1/reports"
  printf '# report C1\nhello\n' > "$repo/.claude/state/camp1/reports/C1.md"
}

# (a) --dry-run moves nothing, prints the would-move line
seed_source
out_a="$(bash "$SCRIPT" "$repo" --dry-run 2>&1)"; rc_a=$?
check "(a) dry-run exit 0" "$rc_a" "0"
[[ -f "$repo/.claude/state/camp1/reports/C1.md" ]] && ok "(a) dry-run source untouched" || bad "(a) dry-run source untouched"
[[ -e "$dest" ]] && bad "(a) dry-run created no destination" || ok "(a) dry-run created no destination"
echo "$out_a" | grep -qi 'would move' && ok "(a) dry-run prints would-move line" || bad "(a) dry-run prints would-move line (got: $out_a)"

# (b) real run moves the file and empties the source
out_b="$(bash "$SCRIPT" "$repo" 2>&1)"; rc_b="$?"
check "(b) real run exit 0" "$rc_b" "0"
[[ -f "$dest" ]] && ok "(b) file moved to campaign home" || bad "(b) file moved to campaign home"
if [[ -f "$dest" ]]; then
  content="$(cat "$dest")"
  [[ "$content" == $'# report C1\nhello' ]] && ok "(b) moved content matches" || bad "(b) moved content matches (got: $content)"
fi
[[ -d "$repo/.claude/state/camp1/reports" ]] && bad "(b) emptied source dir removed" || ok "(b) emptied source dir removed"

# (c) re-run is a no-op, exit 0 (idempotent — nothing left to migrate)
out_c="$(bash "$SCRIPT" "$repo" 2>&1)"; rc_c="$?"
check "(c) idempotent re-run exit 0" "$rc_c" "0"

# (d) destination pre-seeded with different content -> CONFLICT, exit 1, source untouched
seed_source
mkdir -p "$home/campaigns/camp1/reports"
printf 'different content already here\n' > "$dest"
set +e
out_d="$(bash "$SCRIPT" "$repo" 2>&1)"; rc_d="$?"
set -e
check "(d) conflict exit 1" "$rc_d" "1"
echo "$out_d" | grep -q 'CONFLICT' && ok "(d) prints CONFLICT" || bad "(d) prints CONFLICT (got: $out_d)"
[[ -f "$repo/.claude/state/camp1/reports/C1.md" ]] && ok "(d) source left untouched on conflict" || bad "(d) source left untouched on conflict"
destcontent="$(cat "$dest")"
check "(d) destination left untouched on conflict" "$destcontent" "different content already here"
# clean up conflict fixture for next case
rm -f "$dest" "$repo/.claude/state/camp1/reports/C1.md"
rmdir "$repo/.claude/state/camp1/reports" "$repo/.claude/state/camp1" 2>/dev/null || true

# (e) live lock refusal
seed_source
mkdir -p "$repo/docs/x/camp1"
printf '{"pid":%d,"startedAt":"2026-07-24T00:00:00.000Z"}' "$$" > "$repo/docs/x/camp1/.runner.lock"
set +e
out_e="$(bash "$SCRIPT" "$repo" --campaign camp1 2>&1)"; rc_e="$?"
set -e
check "(e) live-lock refusal exit 1" "$rc_e" "1"
[[ -f "$repo/.claude/state/camp1/reports/C1.md" ]] && ok "(e) file not moved under live lock" || bad "(e) file not moved under live lock"
rm -f "$repo/docs/x/camp1/.runner.lock"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [[ "$FAIL" -eq 0 ]]
