#!/usr/bin/env bash
# test-resume-check.sh — fixture tests for resume-check.sh (synthetic git repos, offline).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../resume-check.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check() { # check NAME ACTUAL WANT
  if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2, want: $3)"; fi
}
jget() { # jget FILE DOTTED.PATH — prints the value, or MISSING
  python3 - "$1" "$2" <<'EOF'
import json, sys
try:
    o = json.load(open(sys.argv[1]))
    for k in sys.argv[2].split("."):
        o = o[int(k)] if isinstance(o, list) else o[k]
    print(str(o).lower() if isinstance(o, bool) else o)
except (KeyError, IndexError, ValueError):
    print("MISSING")
EOF
}
git_c() { git -C "$1" -c user.email=t@t.test -c user.name=t "${@:2}"; }
new_repo() { # new_repo DIR — master repo with one empty commit
  git init --template= -q -b master "$1"
  # Disable any host-installed branch-protection guard (e.g. wtguard) for this
  # disposable fixture repo — local .git/config override, no env var, no global
  # config touched, portable to machines without such a guard installed.
  git -C "$1" config wtguard.protected ""
  git_c "$1" commit --allow-empty -qm "init"
}
run_check() { # run_check OUT_FILE REPO [extra args]
  local out="$1"; shift
  bash "$SCRIPT" "$@" > "$out"
}
new_card_worktree() { # new_card_worktree REPO SLUG — prints worktree path
  local repo="$1" slug="$2" wt="$1-wt-$2"
  git_c "$repo" worktree add -q "$wt" -b "wt-$slug" master
  mkdir -p "$wt/docs/tribe/state" "$wt/docs/superpowers/plans"
  cat > "$wt/docs/superpowers/plans/$slug.md" <<EOF
# $slug plan
### Task 1: First
- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Commit**
### Task 2: Second
- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Commit**
### Task 3: Third
- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Commit**
EOF
  local base_sha
  base_sha=$(git_c "$wt" rev-parse HEAD)
  cat > "$wt/docs/tribe/state/$slug.md" <<EOF
# tribe-state: $slug
roadmap: docs/ROADMAP.md
worktree: $wt
branch: wt-$slug
report: $TMP/$slug-report.md
base-sha: $base_sha
plan: docs/superpowers/plans/$slug.md

## Milestones
- [x] spec committed
- [x] plan committed
EOF
  git_c "$wt" add -A
  git_c "$wt" commit -qm "chore($slug): state file + plan" \
    -m "Tribe-Card: $slug" -m "Tribe-Milestone: plan committed"
  printf '%s\n' "$wt"
}
complete_task() { # complete_task WT SLUG N TOTAL — code + checkbox ticks + trailers, ONE commit
  local wt="$1" slug="$2" n="$3" total="$4"
  echo "work $n" >> "$wt/src.txt"
  python3 - "$wt/docs/superpowers/plans/$slug.md" "$n" <<'EOF'
import re, sys
path, n = sys.argv[1], int(sys.argv[2])
out, in_task = [], False
for ln in open(path).read().splitlines(keepends=True):
    m = re.match(r"^###\s*Task\s+(\d+)\b", ln)
    if m:
        in_task = int(m.group(1)) == n
    if in_task:
        ln = ln.replace("- [ ]", "- [x]")
    out.append(ln)
open(path, "w").write("".join(out))
EOF
  git_c "$wt" add -A
  git_c "$wt" commit -qm "feat($slug): task $n" \
    -m "Tribe-Card: $slug" -m "Tribe-Task: $n/$total"
}

# --- scenario: repo with no tribe state at all ---
R1="$TMP/plain"; new_repo "$R1"
run_check "$TMP/out1.json" "$R1"
check "plain repo lists no cards" "$(jget "$TMP/out1.json" cards)" "[]"
check "plain repo lists no orphans" "$(jget "$TMP/out1.json" orphaned_cards)" "[]"

# --- scenario: worktree with committed state file, nothing built yet ---
R2="$TMP/one"; new_repo "$R2"
WT2=$(new_card_worktree "$R2" alpha)
run_check "$TMP/out2.json" "$R2"
check "card discovered" "$(jget "$TMP/out2.json" cards.0.card)" "alpha"
check "card branch discovered" "$(jget "$TMP/out2.json" cards.0.branch)" "wt-alpha"
check "fresh card continues at task 1" "$(jget "$TMP/out2.json" cards.0.next_action)" "CONTINUE task 1"

# --- scenario: two tasks committed with trailers -> continue at task 3 ---
R3="$TMP/two"; new_repo "$R3"
WT3=$(new_card_worktree "$R3" beta)
complete_task "$WT3" beta 1 3
complete_task "$WT3" beta 2 3
run_check "$TMP/out3.json" "$R3"
check "trailers count completed tasks" "$(jget "$TMP/out3.json" cards.0.last_completed_task)" "2"
check "mid-plan card continues at next task" "$(jget "$TMP/out3.json" cards.0.next_action)" "CONTINUE task 3"

# --- scenario: checkboxes agree with trailers -> no inconsistencies, total counted ---
run_check "$TMP/out4.json" "$R3"
check "agreement means no inconsistencies" "$(jget "$TMP/out4.json" cards.0.inconsistencies)" "[]"
check "plan total counted" "$(jget "$TMP/out4.json" cards.0.total_tasks)" "3"

# --- scenario: checkbox ticked without a trailer commit -> git wins, inconsistency reported ---
R5="$TMP/lie"; new_repo "$R5"
WT5=$(new_card_worktree "$R5" gamma)
complete_task "$WT5" gamma 1 3
python3 - "$WT5/docs/superpowers/plans/gamma.md" <<'EOF'
import sys
path = sys.argv[1]
text = open(path).read()
# tick task 2's boxes by hand, committing WITHOUT a Tribe-Task trailer (rule violation)
parts = text.split("### Task 2: Second")
parts[1] = parts[1].replace("- [ ]", "- [x]", 2)
open(path, "w").write("### Task 2: Second".join(parts))
EOF
git_c "$WT5" add -A
git_c "$WT5" commit -qm "sneaky untrailed tick"
run_check "$TMP/out5.json" "$R5"
check "git wins over checkboxes" "$(jget "$TMP/out5.json" cards.0.last_completed_task)" "1"
check "inconsistency is reported" "$(jget "$TMP/out5.json" cards.0.inconsistencies.0 | grep -c 'git wins' || true)" "1"
check "lying card redoes from git truth" "$(jget "$TMP/out5.json" cards.0.next_action)" "CONTINUE task 2"

# --- scenario: every task done -> move to delivery ---
R6="$TMP/done"; new_repo "$R6"
WT6=$(new_card_worktree "$R6" delta)
complete_task "$WT6" delta 1 3
complete_task "$WT6" delta 2 3
complete_task "$WT6" delta 3 3
run_check "$TMP/out6.json" "$R6"
check "all tasks done moves to delivery" "$(jget "$TMP/out6.json" cards.0.next_action)" "RESUME_DELIVERY"

# --- scenario: uncommitted leftovers -> revert and redo the in-flight task ---
echo "half-finished work" >> "$WT3/src.txt"
echo "brand new file" > "$WT3/new.txt"
run_check "$TMP/out7.json" "$R3"
check "dirt is detected" "$(jget "$TMP/out7.json" cards.0.dirty)" "true"
check "dirty worktree reverts and redoes" "$(jget "$TMP/out7.json" cards.0.next_action)" "REVERT_AND_REDO task 3"
git_c "$WT3" checkout -q -- . && rm -f "$WT3/new.txt"

# --- scenario: died mid-merge (MERGE_HEAD present) -> redo the merge, not the dirt ---
R8="$TMP/merge"; new_repo "$R8"
WT8=$(new_card_worktree "$R8" epsilon)
BASE8=$(git_c "$WT8" rev-parse HEAD)
echo "ours" > "$WT8/clash.txt"
git_c "$WT8" add -A && git_c "$WT8" commit -qm "ours" -m "Tribe-Card: epsilon" -m "Tribe-Task: 1/3"
git_c "$WT8" branch -q side "$BASE8"
git_c "$WT8" checkout -q side
echo "theirs" > "$WT8/clash.txt"
git_c "$WT8" add -A && git_c "$WT8" commit -qm "theirs"
git_c "$WT8" checkout -q wt-epsilon
git_c "$WT8" merge side >/dev/null 2>&1 || true
check "merge fixture really conflicted" "$(git -C "$WT8" rev-parse -q --verify MERGE_HEAD >/dev/null && echo conflicted || true)" "conflicted"
run_check "$TMP/out8.json" "$R8"
check "mid-merge is detected" "$(jget "$TMP/out8.json" cards.0.mid_merge)" "true"
check "mid-merge outranks dirt" "$(jget "$TMP/out8.json" cards.0.next_action)" "REDO_MERGE"

# --- scenario: branch pushed to a local bare remote -> pushed true, derived not recorded ---
BARE="$TMP/origin.git"
git init --template= -q --bare "$BARE"
git_c "$WT6" remote add origin "$BARE"
git_c "$WT6" push -qu origin wt-delta
run_check "$TMP/out9.json" "$R6"
check "pushed is derived from upstream" "$(jget "$TMP/out9.json" cards.0.pushed)" "true"
git_c "$WT6" commit --allow-empty -qm "local only" -m "Tribe-Card: delta" -m "Tribe-Milestone: local probe"
run_check "$TMP/out10.json" "$R6"
check "unpushed commit flips pushed off" "$(jget "$TMP/out10.json" cards.0.pushed)" "false"

# --- scenario: gh says MERGED -> verify shipped; no PR -> none; gh absent -> unknown ---
STUB="$TMP/ghstub"; mkdir -p "$STUB"
cat > "$STUB/gh-merged" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' '{"state": "MERGED", "statusCheckRollup": []}'
EOF
cat > "$STUB/gh-nopr" <<'EOF'
#!/usr/bin/env bash
echo "no pull requests found for branch" >&2
exit 1
EOF
chmod +x "$STUB/gh-merged" "$STUB/gh-nopr"
RESUME_CHECK_GH="$STUB/gh-merged" run_check "$TMP/out11.json" "$R6"
check "merged PR means verify shipped" "$(jget "$TMP/out11.json" cards.0.next_action)" "VERIFY_SHIPPED"
RESUME_CHECK_GH="$STUB/gh-nopr" run_check "$TMP/out12.json" "$R6"
check "no PR reads as none" "$(jget "$TMP/out12.json" cards.0.delivery)" "none"
RESUME_CHECK_GH="$TMP/no-such-gh" run_check "$TMP/out13.json" "$R6"
check "missing gh degrades to unknown" "$(jget "$TMP/out13.json" cards.0.delivery)" "unknown"

cat > "$STUB/gh-open-green" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' '{"state": "OPEN", "statusCheckRollup": [{"conclusion": "SUCCESS"}, {"state": "SUCCESS"}, {"conclusion": "SKIPPED"}]}'
EOF
cat > "$STUB/gh-open-mixed" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' '{"state": "OPEN", "statusCheckRollup": [{"conclusion": "SUCCESS"}, {"conclusion": "FAILURE"}]}'
EOF
cat > "$STUB/gh-open-empty" <<'EOF'
#!/usr/bin/env bash
printf '%s\n' '{"state": "OPEN", "statusCheckRollup": []}'
EOF
chmod +x "$STUB/gh-open-green" "$STUB/gh-open-mixed" "$STUB/gh-open-empty"
RESUME_CHECK_GH="$STUB/gh-open-green" run_check "$TMP/out16.json" "$R6"
check "all-green rollup reads ci-green" "$(jget "$TMP/out16.json" cards.0.delivery)" "ci-green"
check "ci-green resumes delivery" "$(jget "$TMP/out16.json" cards.0.next_action)" "RESUME_DELIVERY"
RESUME_CHECK_GH="$STUB/gh-open-mixed" run_check "$TMP/out17.json" "$R6"
check "mixed rollup reads pr-open" "$(jget "$TMP/out17.json" cards.0.delivery)" "pr-open"
RESUME_CHECK_GH="$STUB/gh-open-empty" run_check "$TMP/out18.json" "$R6"
check "empty rollup reads pr-open, not ci-green" "$(jget "$TMP/out18.json" cards.0.delivery)" "pr-open"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
exit $((FAIL > 0))
