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

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
exit $((FAIL > 0))
