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

# --- tracked reports: the index must follow the files ---------------------------------
# Cases (a)-(e) above never `git add` their fixture, so they only ever exercise UNTRACKED
# reports. The real migration moved reports that were committed — leaving the index still
# listing paths that no longer exist on disk.
seed_tracked(){
  mkdir -p "$repo/.claude/state/camp2/reports"
  printf '# report C2\ncommitted\n' > "$repo/.claude/state/camp2/reports/C2.md"
  git_c "$repo" add .claude/state/camp2/reports/C2.md
  git_c "$repo" commit -qm "add camp2 report"
}
tracked(){ git -C "$repo" ls-files --error-unmatch "$1" >/dev/null 2>&1; }

# (f) dry-run leaves the index alone
seed_tracked
bash "$SCRIPT" "$repo" --campaign camp2 --dry-run >/dev/null 2>&1
tracked .claude/state/camp2/reports/C2.md && ok "(f) dry-run leaves the index untouched" \
  || bad "(f) dry-run leaves the index untouched"

# (g) real run un-tracks the moved report and tells the owner what to commit
out_g="$(bash "$SCRIPT" "$repo" --campaign camp2 2>&1)"; rc_g="$?"
check "(g) tracked-report run exit 0" "$rc_g" "0"
[[ -f "$home/campaigns/camp2/reports/C2.md" ]] && ok "(g) tracked report moved to campaign home" \
  || bad "(g) tracked report moved to campaign home"
tracked .claude/state/camp2/reports/C2.md && bad "(g) moved report is no longer tracked" \
  || ok "(g) moved report is no longer tracked"
staged="$(git -C "$repo" diff --cached --name-status -- .claude/state/camp2 | head -1)"
check "(g) deletion is staged, ready to commit" "$staged" "D	.claude/state/camp2/reports/C2.md"
echo "$out_g" | grep -q 'un-tracked from git' && ok "(g) reports what it un-tracked" \
  || bad "(g) reports what it un-tracked (got: $out_g)"
echo "$out_g" | grep -q 'next: git' && ok "(g) prints the follow-up commit" \
  || bad "(g) prints the follow-up commit (got: $out_g)"

# (h) a conflicted slug keeps its tracking — its files are still on disk and still git's
# `|| true`: with (g)'s de-track absent there is nothing staged and commit exits 1, which
# under `set -e` would abort the run instead of reporting the failures below.
git_c "$repo" commit -qm "stop tracking camp2 reports" >/dev/null 2>&1 || true
seed_tracked
mkdir -p "$home/campaigns/camp2/reports"
printf 'occupied\n' > "$home/campaigns/camp2/reports/C2.md"
set +e; bash "$SCRIPT" "$repo" --campaign camp2 >/dev/null 2>&1; set -e
tracked .claude/state/camp2/reports/C2.md && ok "(h) conflicted slug stays tracked" \
  || bad "(h) conflicted slug stays tracked"

# --- operational-file migration: docs/tribe/planning/<slug>/* -> campaign home ---------
# campaign-state.json, answers.md, campaign-report.{json,md} and escalations/*.md are
# machine bookkeeping and move. SPEC.md/plan-*.md are contracts and must stay in the repo.
ops_home_dir(){ printf '%s/campaigns/%s' "$home" "$1"; }

seed_ops(){
  local slug="$1"
  mkdir -p "$repo/docs/tribe/planning/$slug/escalations"
  printf '{"v":1,"campaign":"%s"}\n' "$slug" > "$repo/docs/tribe/planning/$slug/campaign-state.json"
  printf '# Answers\n' > "$repo/docs/tribe/planning/$slug/answers.md"
  printf '{"campaign":"%s"}\n' "$slug" > "$repo/docs/tribe/planning/$slug/campaign-report.json"
  printf '# Report\n' > "$repo/docs/tribe/planning/$slug/campaign-report.md"
  printf '# C1 escalation\n' > "$repo/docs/tribe/planning/$slug/escalations/C1.md"
}

# (i) operational files move to the campaign home at fixed names; repo copies gone
seed_ops demo
out_i="$(bash "$SCRIPT" "$repo" --campaign demo 2>&1)"; rc_i="$?"
demo_home="$(ops_home_dir demo)"
check "(i) ops migration exit 0" "$rc_i" "0"
for fname in campaign-state.json answers.md campaign-report.json campaign-report.md; do
  [[ -f "$demo_home/$fname" ]] && ok "(i) $fname landed at campaign home" || bad "(i) $fname landed at campaign home"
  [[ -f "$repo/docs/tribe/planning/demo/$fname" ]] && bad "(i) $fname removed from repo" || ok "(i) $fname removed from repo"
done
[[ -f "$demo_home/escalations/C1.md" ]] && ok "(i) escalation landed at campaign home" || bad "(i) escalation landed at campaign home"
[[ -f "$repo/docs/tribe/planning/demo/escalations/C1.md" ]] && bad "(i) escalation removed from repo" \
  || ok "(i) escalation removed from repo"

# (j) SPEC.md and plan-*.md are contracts: left in place, with a named reminder
seed_ops contracts
printf '# Spec\n' > "$repo/docs/tribe/planning/contracts/SPEC.md"
printf '# Plan 01\n' > "$repo/docs/tribe/planning/contracts/plan-01.md"
out_j="$(bash "$SCRIPT" "$repo" --campaign contracts 2>&1)"; rc_j="$?"
check "(j) contracts migration exit 0" "$rc_j" "0"
[[ -f "$repo/docs/tribe/planning/contracts/SPEC.md" ]] && ok "(j) SPEC.md left in place" || bad "(j) SPEC.md left in place"
[[ -f "$repo/docs/tribe/planning/contracts/plan-01.md" ]] && ok "(j) plan-01.md left in place" \
  || bad "(j) plan-01.md left in place"
echo "$out_j" | grep -q 'SPEC.md' && ok "(j) reminder names SPEC.md" || bad "(j) reminder names SPEC.md (got: $out_j)"
echo "$out_j" | grep -q 'plan-01.md' && ok "(j) reminder names plan-01.md" \
  || bad "(j) reminder names plan-01.md (got: $out_j)"

# (k) pre-existing destination -> CONFLICT, non-zero exit, both copies untouched
seed_ops clash
clash_home="$(ops_home_dir clash)"
mkdir -p "$clash_home"
printf 'already here\n' > "$clash_home/campaign-state.json"
set +e
out_k="$(bash "$SCRIPT" "$repo" --campaign clash 2>&1)"; rc_k="$?"
set -e
check "(k) conflict exit 1" "$rc_k" "1"
echo "$out_k" | grep -q 'CONFLICT' && ok "(k) prints CONFLICT" || bad "(k) prints CONFLICT (got: $out_k)"
[[ -f "$repo/docs/tribe/planning/clash/campaign-state.json" ]] && ok "(k) repo copy left untouched on conflict" \
  || bad "(k) repo copy left untouched on conflict"
clash_dest_content="$(cat "$clash_home/campaign-state.json")"
check "(k) destination left untouched on conflict" "$clash_dest_content" "already here"

# (l) --dry-run moves nothing
seed_ops dry
dry_home="$(ops_home_dir dry)"
out_l="$(bash "$SCRIPT" "$repo" --campaign dry --dry-run 2>&1)"; rc_l="$?"
check "(l) dry-run ops exit 0" "$rc_l" "0"
[[ -e "$dry_home" ]] && bad "(l) dry-run created no campaign home" || ok "(l) dry-run created no campaign home"
[[ -f "$repo/docs/tribe/planning/dry/campaign-state.json" ]] && ok "(l) dry-run repo copy untouched" \
  || bad "(l) dry-run repo copy untouched"
echo "$out_l" | grep -qi 'would move' && ok "(l) dry-run prints would-move line" \
  || bad "(l) dry-run prints would-move line (got: $out_l)"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [[ "$FAIL" -eq 0 ]]
