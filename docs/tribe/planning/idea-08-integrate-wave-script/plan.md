# Plan — `integrate-wave.sh` (idea-08-integrate-wave-script)

**Spec:** `docs/tribe/planning/idea-08-integrate-wave-script/spec.md` (read it first — it carries the
exit-code contract and the resume-safety argument this plan implements).

**Deliverables:**
1. `plugins/tribe/scripts/integrate-wave.sh` — the deterministic wave-integration chain.
2. `plugins/tribe/scripts/tests/test-integrate-wave.sh` — fixture tests in the existing harness style.
3. `plugins/tribe/agents/warchief.md` step 5 — mechanical prose replaced by an invocation, judgment
   prose preserved verbatim.

**Repo has no CI** (`.github/workflows` does not exist). The three script test suites under
`plugins/tribe/scripts/tests/` **are** the gate; every task runs them.

---

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.** The Warchief running this plan does not write the script itself.
- **TDD, strictly.** Every task: write the failing test first, run it, watch it fail for the right
  reason, then write the minimal code that makes it pass, then commit. A task that produces code
  before a failing test has failed the task.
- **One commit per task**, and that commit contains the code **and** this plan's ticked checkboxes
  for that task. Trailers on every commit, both keys in the commit's ONE final paragraph:

  ```
  Tribe-Card: idea-08-integrate-wave-script
  Tribe-Task: N/8
  ```

- **No co-authored trailers.**
- **Bash 3.2 compatible** (macOS ships bash 3.2). Forbidden: `mapfile`/`readarray`, namerefs
  (`local -n`), `${var,,}`. Arrays are fine; expanding a possibly-empty array under `set -u` is not
  — guard it or use newline-delimited strings, which this plan does for every accumulator.
- **git mutates, python3 parses.** Every git write is a plain bash `git` call so the destructive
  logic is auditable line by line. `python3` is used only to serialize JSON and to parse
  `git worktree list --porcelain` / rewrite the state file. This matches `resume-check.sh` and
  `validate-plan.sh`, which shell out to `python3` for exactly that.
- **Convention parity with the sibling scripts** (`plugins/tribe/scripts/resume-check.sh:26-46`,
  `validate-plan.sh:43-63`): `set -euo pipefail`; `LOG`/`DIE` helpers; a header comment block that
  `-h|--help` prints back with `sed -n`; JSON to **stdout only**, logs to **stderr**.
- **Never widen the blast radius.** The script touches only the worktrees/branches named in its
  arguments. It deletes a branch only after proving the tip is contained in the integration branch.
- Test fixtures are offline synthetic repos under `mktemp -d`, with `git init --template=` and
  `git config wtguard.protected ""` (copied from `test-resume-check.sh:26-34`) so a host-installed
  branch guard cannot break them.

---

## Task 1: Skeleton, preflight validation, and the exit-2 contract

**Goal:** the script exists, parses its arguments, refuses every malformed invocation with exit `2`,
and emits its JSON envelope. No merging yet.

- [ ] **Step 1: Write the failing test**

  Create `plugins/tribe/scripts/tests/test-integrate-wave.sh` (mode `0755`):

  ````bash
  #!/usr/bin/env bash
  # test-integrate-wave.sh — fixture tests for integrate-wave.sh (synthetic git repos, offline).
  set -euo pipefail
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  SCRIPT="$HERE/../integrate-wave.sh"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  PASS=0; FAIL=0
  ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
  bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
  check() { # check NAME ACTUAL WANT
    if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2, want: $3)"; fi
  }
  git_c() { git -C "$1" -c user.email=t@t.test -c user.name=t "${@:2}"; }
  jget() { # jget FILE DOTTED.PATH — prints the value, or MISSING
    python3 - "$1" "$2" <<'EOF'
  import json, sys
  try:
      o = json.load(open(sys.argv[1]))
      for k in sys.argv[2].split("."):
          o = o[int(k)] if isinstance(o, list) else o[k]
      print(str(o).lower() if isinstance(o, bool) else o)
  except (KeyError, IndexError, ValueError, TypeError):
      print("MISSING")
  EOF
  }
  rc_of() { # rc_of OUT_FILE ARGS… — runs the script, captures stdout, prints its exit code
    local out="$1"; shift
    local rc=0
    bash "$SCRIPT" "$@" > "$out" 2>"$out.err" || rc=$?
    printf '%s\n' "$rc"
  }

  # new_wave REPO — an integration worktree + two sub-plan worktrees on disjoint files.
  # Prints: "<integration-wt> <base-sha>"
  new_wave() {
    local repo="$1"
    git init --template= -q -b master "$repo"
    git -C "$repo" config wtguard.protected ""
    git_c "$repo" commit --allow-empty -qm "init"
    local wt="$repo-int"
    git_c "$repo" worktree add -q "$wt" -b integration master
    local base
    base=$(git_c "$wt" rev-parse HEAD)
    local i
    for i in 1 2; do
      git_c "$repo" worktree add -q "$repo-sub$i" -b "subplan-$i" "$base"
      echo "sub $i" > "$repo-sub$i/file$i.txt"
      git_c "$repo-sub$i" add -A
      git_c "$repo-sub$i" commit -qm "feat: sub-plan $i" -m "Tribe-Card: demo" -m "Tribe-Task: $i/2"
    done
    printf '%s %s\n' "$wt" "$base"
  }

  # --- scenario: usage errors all exit 2 ---
  R1="$TMP/args"; read -r WT1 BASE1 <<<"$(new_wave "$R1")"
  check "no args exits 2"          "$(rc_of "$TMP/o0.json")" "2"
  check "worktree but no branch exits 2" "$(rc_of "$TMP/o1.json" "$WT1")" "2"
  check "unknown flag exits 2"     "$(rc_of "$TMP/o2.json" "$WT1" subplan-1 --nope)" "2"
  check "missing worktree exits 2" "$(rc_of "$TMP/o3.json" "$TMP/nope" subplan-1)" "2"
  check "non-git worktree exits 2" "$(rc_of "$TMP/o4.json" "$TMP" subplan-1)" "2"
  check "unknown branch exits 2"   "$(rc_of "$TMP/o5.json" "$WT1" no-such-branch)" "2"
  check "usage error says why"     "$(grep -c 'ERROR' "$TMP/o5.json.err")" "1"

  # --- scenario: a dirty integration worktree is refused before any merge ---
  echo "uncommitted" > "$WT1/dirt.txt"
  check "dirty worktree exits 2" "$(rc_of "$TMP/o6.json" "$WT1" subplan-1)" "2"
  check "dirty worktree was not merged into" \
    "$(git -C "$WT1" rev-parse HEAD)" "$BASE1"
  rm -f "$WT1/dirt.txt"

  printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
  exit $((FAIL > 0))
  ````

  Run it — it must fail because the script does not exist yet:

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: every `check` line reports `not ok` (the harness cannot run a missing script) and the
  footer reads `0 passed, 9 failed`, `rc=1`.

- [ ] **Step 2: Make it pass**

  Create `plugins/tribe/scripts/integrate-wave.sh` (mode `0755`):

  ````bash
  #!/usr/bin/env bash
  # integrate-wave.sh — deterministic wave integration for the tribe.
  #
  # Folds a wave's finished sub-plan branches into the Warchief's integration worktree:
  #   merge --no-ff in the DECLARED ORDER -> clean up each merged worktree+branch right
  #   after its merge lands -> print the new HEAD SHA as the next wave's base.
  # This is warchief.md step 5's mechanical chain, moved out of prose into code. The
  # judgment (auditing sub-plans, adjudicating a conflict) stays with the Warchief.
  #
  # RESUME-SAFE: re-running the identical command line after a crash converges.
  #
  # Exit codes — this script MUTATES git (unlike its compute-only siblings), so the
  # outcome is branchable from the shell without parsing JSON:
  #   0 = wave integrated; new_base_sha printed
  #   2 = usage/setup error (bad args, missing worktree, unknown branch, dirty worktree)
  #   3 = merge conflict: the merge was ABORTED and the tree restored; the JSON names the
  #       branch and the conflicted paths. A conflict means owns_files was wrong, so the
  #       Warchief returns NEEDS_DIRECTION instead of guessing a resolution
  #   4 = post-merge cleanup failure: the merge is durable but the worktree/branch could
  #       not be removed (or the ancestor safety check refused). Clear it, then re-run
  #   1 is never returned deliberately.
  #
  # Output: JSON on stdout (only). Logs go to stderr.
  #
  # Usage:
  #   integrate-wave.sh <worktree-path> <branch> [<branch>...]
  #                     [--card SLUG] [--state-file PATH] [--wave N]

  set -euo pipefail

  LOG() { printf '[integrate-wave] %s\n' "$*" >&2; }
  DIE() { LOG "ERROR: $*"; exit 2; }

  WORKTREE=""
  CARD=""
  STATE_FILE=""
  WAVE=""
  BRANCHES=()
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --card)       [[ $# -ge 2 ]] || DIE "missing value for --card"; CARD="$2"; shift 2 ;;
      --state-file) [[ $# -ge 2 ]] || DIE "missing value for --state-file"; STATE_FILE="$2"; shift 2 ;;
      --wave)       [[ $# -ge 2 ]] || DIE "missing value for --wave"; WAVE="$2"; shift 2 ;;
      -h|--help)    sed -n '2,28p' "$0"; exit 0 ;;
      -*)           DIE "unknown flag: $1" ;;
      *)
        if [[ -z "$WORKTREE" ]]; then WORKTREE="$1"; else BRANCHES+=("$1"); fi
        shift ;;
    esac
  done

  [[ -n "$WORKTREE" ]] || DIE "usage: integrate-wave.sh <worktree-path> <branch> [<branch>...]"
  [[ ${#BRANCHES[@]} -ge 1 ]] || DIE "a wave needs at least one branch: integrate-wave.sh <worktree-path> <branch> [<branch>...]"
  [[ -d "$WORKTREE" ]] || DIE "worktree not found: $WORKTREE"
  command -v python3 >/dev/null 2>&1 || DIE "python3 is required but not on PATH"
  git -C "$WORKTREE" rev-parse --is-inside-work-tree >/dev/null 2>&1 \
    || DIE "not a git worktree: $WORKTREE"

  GIT() { git -C "$WORKTREE" "$@"; }

  # Accumulators are newline-delimited strings, not arrays: expanding an empty array under
  # `set -u` is an error on bash 3.2 (macOS), and these can legitimately be empty.
  INTEGRATED=""
  MERGED_NOW=""
  SKIPPED=""
  PENDING=""
  CLEANUP_FAILED=""
  CONFLICT_BRANCH=""
  CONFLICT_PATHS=""
  NEW_BASE_SHA=""
  INTEGRATION_TIP=""
  STATE_UPDATED="0"

  emit_json() { # emit_json STATUS
    STATUS="$1" J_WORKTREE="$WORKTREE" J_INTEGRATED="$INTEGRATED" J_MERGED="$MERGED_NOW" \
    J_SKIPPED="$SKIPPED" J_PENDING="$PENDING" J_CLEANUP_FAILED="$CLEANUP_FAILED" \
    J_CONFLICT_BRANCH="$CONFLICT_BRANCH" J_CONFLICT_PATHS="$CONFLICT_PATHS" \
    J_NEW_BASE="$NEW_BASE_SHA" J_TIP="$INTEGRATION_TIP" J_STATE_UPDATED="$STATE_UPDATED" \
    python3 - <<'PY'
  import json, os

  def lines(key):
      return [x for x in os.environ.get(key, "").splitlines() if x.strip()]

  def opt(key):
      return os.environ.get(key) or None

  print(json.dumps({
      "worktree": os.environ["J_WORKTREE"],
      "status": os.environ["STATUS"],
      "integrated": lines("J_INTEGRATED"),
      "merged_this_run": lines("J_MERGED"),
      "skipped_already_integrated": lines("J_SKIPPED"),
      "pending": lines("J_PENDING"),
      "conflict_branch": opt("J_CONFLICT_BRANCH"),
      "conflicted_paths": lines("J_CONFLICT_PATHS"),
      "cleanup_failed": lines("J_CLEANUP_FAILED"),
      "integration_tip_sha": opt("J_TIP"),
      "new_base_sha": opt("J_NEW_BASE"),
      "state_file_updated": os.environ.get("J_STATE_UPDATED") == "1",
  }, indent=2))
  PY
  }

  # --- preflight -------------------------------------------------------------
  [[ -z "$(GIT status --porcelain)" ]] \
    || DIE "integration worktree is dirty — commit or discard before integrating: $WORKTREE"

  for b in "${BRANCHES[@]}"; do
    GIT rev-parse -q --verify "refs/heads/$b" >/dev/null 2>&1 \
      || DIE "branch not found: $b"
  done

  NEW_BASE_SHA="$(GIT rev-parse HEAD)"
  INTEGRATION_TIP="$NEW_BASE_SHA"
  emit_json ok
  exit 0
  ````

  Then `chmod +x` both files and run:

  ```bash
  chmod +x plugins/tribe/scripts/integrate-wave.sh plugins/tribe/scripts/tests/test-integrate-wave.sh
  bash -n plugins/tribe/scripts/integrate-wave.sh && echo "syntax ok"
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: `syntax ok`, then `9 passed, 0 failed` and `rc=0`.

- [ ] **Step 3: Commit**

  ```bash
  git add plugins/tribe/scripts/integrate-wave.sh \
          plugins/tribe/scripts/tests/test-integrate-wave.sh \
          docs/tribe/planning/idea-08-integrate-wave-script/plan.md
  git commit -m "feat(tribe): integrate-wave.sh skeleton + preflight validation" \
    -m $'Tribe-Card: idea-08-integrate-wave-script\nTribe-Task: 1/8'
  ```

  Expected: one commit; `git log -1 --format='%(trailers:key=Tribe-Task,valueonly)'` prints `1/8`.

---

## Task 2: Merge the wave in declared order, with trailers

**Goal:** each named branch is merged `--no-ff` into the integration worktree, **in argv order**,
each merge commit carrying `Tribe-Card` and `Tribe-Wave-Branch` trailers; the JSON reports what was
merged and the new base SHA.

- [ ] **Step 1: Write the failing test**

  Append to `plugins/tribe/scripts/tests/test-integrate-wave.sh`, above the final `printf` footer:

  ````bash
  # --- scenario: a two-branch wave merges in the declared order, no-ff, with trailers ---
  R2="$TMP/wave"; read -r WT2 BASE2 <<<"$(new_wave "$R2")"
  check "clean wave exits 0" "$(rc_of "$TMP/w.json" "$WT2" subplan-1 subplan-2 --card demo)" "0"
  check "both sub-plan files landed" \
    "$([[ -f "$WT2/file1.txt" && -f "$WT2/file2.txt" ]] && echo both)" "both"
  check "merge order follows argv" \
    "$(git -C "$WT2" log --merges --format=%s | tr '\n' ',')" \
    "merge(wave): integrate subplan-2,merge(wave): integrate subplan-1,"
  check "merges are real merge commits (--no-ff)" \
    "$(git -C "$WT2" log --merges --format='%p' | head -1 | wc -w | tr -d ' ')" "2"
  check "merge carries the wave-branch trailer" \
    "$(git -C "$WT2" log --merges --format='%(trailers:key=Tribe-Wave-Branch,valueonly)' | tr -d '[:space:]')" \
    "subplan-2subplan-1"
  check "merge carries the card trailer" \
    "$(git -C "$WT2" log --merges -1 --format='%(trailers:key=Tribe-Card,valueonly)' | tr -d '[:space:]')" \
    "demo"
  check "json reports both branches integrated" \
    "$(jget "$TMP/w.json" integrated.0),$(jget "$TMP/w.json" integrated.1)" "subplan-1,subplan-2"
  check "json new_base_sha is the worktree HEAD" \
    "$(jget "$TMP/w.json" new_base_sha)" "$(git -C "$WT2" rev-parse HEAD)"
  check "json new_base_sha moved off the old base" \
    "$([[ "$(jget "$TMP/w.json" new_base_sha)" != "$BASE2" ]] && echo moved)" "moved"
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: the 9 Task-1 checks still pass; the new checks fail (nothing is merged yet — e.g.
  `not ok - both sub-plan files landed (got: , want: both)`), footer `9 passed, 9 failed`, `rc=1`.

- [ ] **Step 2: Make it pass**

  In `integrate-wave.sh`, replace the three closing lines of the preflight block
  (`NEW_BASE_SHA=...` / `INTEGRATION_TIP=...` / `emit_json ok` / `exit 0`) with the merge loop:

  ````bash
  trailer_block() { # trailer_block BRANCH — ONE final paragraph, both keys (warchief.md:157-160)
    local branch="$1" block=""
    if [[ -n "$CARD" ]]; then block="Tribe-Card: $CARD"$'\n'; fi
    printf '%s%s' "$block" "Tribe-Wave-Branch: $branch"
  }

  # --- integrate -------------------------------------------------------------
  for b in "${BRANCHES[@]}"; do
    LOG "merging (no-ff): $b"
    GIT merge --no-ff -m "merge(wave): integrate $b" -m "$(trailer_block "$b")" "$b" >&2
    INTEGRATED="$INTEGRATED$b"$'\n'
    MERGED_NOW="$MERGED_NOW$b"$'\n'
  done

  INTEGRATION_TIP="$(GIT rev-parse HEAD)"
  NEW_BASE_SHA="$INTEGRATION_TIP"
  LOG "wave integrated; next wave's base: $NEW_BASE_SHA"
  emit_json ok
  exit 0
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: `18 passed, 0 failed`, `rc=0`.

- [ ] **Step 2b: Refactor check**

  Confirm `git merge` output goes to stderr only, so stdout stays pure JSON:

  ```bash
  bash plugins/tribe/scripts/integrate-wave.sh --help >/dev/null && echo "help ok"
  ```

  Expected: `help ok` (and the header's usage block is what `--help` printed).

- [ ] **Step 3: Commit**

  ```bash
  git add -A && git commit \
    -m "feat(tribe): integrate-wave merges the wave in declared order with trailers" \
    -m $'Tribe-Card: idea-08-integrate-wave-script\nTribe-Task: 2/8'
  ```

  Expected: `git log -1 --format='%(trailers:key=Tribe-Task,valueonly)'` prints `2/8`.

---

## Task 3: Clean up each merged worktree and branch, immediately, safely

**Goal:** right after a branch's merge lands (`warchief.md:411-419`), its worktree is removed and its
branch deleted — but **only** once `git merge-base --is-ancestor` proves the tip is contained in
HEAD. A refusal or a failed removal exits `4` with the merge left durable.

- [ ] **Step 1: Write the failing test**

  Append to the test file, above the footer:

  ````bash
  # --- scenario: cleanup removes each merged worktree and branch ---
  R3="$TMP/clean"; read -r WT3 BASE3 <<<"$(new_wave "$R3")"
  check "wave with cleanup exits 0" "$(rc_of "$TMP/c.json" "$WT3" subplan-1 subplan-2)" "0"
  check "sub-plan worktrees are gone" \
    "$(git -C "$WT3" worktree list --porcelain | grep -c 'sub[12]$' || true)" "0"
  check "sub-plan branches are deleted" \
    "$(git -C "$WT3" branch --list 'subplan-*' | wc -l | tr -d ' ')" "0"
  check "integration worktree survives" \
    "$(git -C "$WT3" rev-parse --is-inside-work-tree)" "true"

  # --- scenario: a branch whose tip is NOT contained in HEAD is never deleted (exit 4) ---
  R4="$TMP/safety"; read -r WT4 BASE4 <<<"$(new_wave "$R4")"
  # Simulate the dangerous case: the merge is faked as an ancestorless "already integrated"
  # claim by giving subplan-1 a commit AFTER the script would have merged it. We reach the
  # same guard directly: point the branch at a commit unrelated to HEAD, and merge it via a
  # stub that leaves the ref ahead. Simplest deterministic probe — an unrelated extra commit
  # pushed onto the branch while a stale ref name is reused:
  git_c "$R4" worktree add -q "$R4-solo" -b solo "$BASE4"
  echo "solo" > "$R4-solo/solo.txt"
  git_c "$R4-solo" add -A && git_c "$R4-solo" commit -qm "solo work"
  # Pre-merge it by hand WITHOUT the script's trailer, then advance the branch past HEAD so
  # the ancestor guard must refuse the delete.
  git_c "$WT4" merge --no-ff -qm "merge(wave): integrate solo" -m "Tribe-Wave-Branch: solo" solo
  echo "later" >> "$R4-solo/solo.txt"
  git_c "$R4-solo" add -A && git_c "$R4-solo" commit -qm "work after integration"
  check "unsafe delete exits 4" "$(rc_of "$TMP/s.json" "$WT4" solo)" "4"
  check "the branch survives an unsafe delete" \
    "$(git -C "$WT4" branch --list solo | wc -l | tr -d ' ')" "1"
  check "json names the branch it refused to clean" \
    "$(jget "$TMP/s.json" cleanup_failed.0)" "solo"
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: Task 1+2 checks still pass; the 7 new checks fail (no cleanup exists — worktrees and
  branches survive, and the unsafe case exits `0` instead of `4`), `rc=1`.

- [ ] **Step 2: Make it pass**

  Add to `integrate-wave.sh` above the integrate block:

  ````bash
  worktree_path_for() { # worktree_path_for BRANCH — prints the worktree checked out at BRANCH, if any
    GIT worktree list --porcelain | python3 -c '
  import sys
  branch = sys.argv[1]
  path = None
  for line in sys.stdin:
      line = line.rstrip("\n")
      if line.startswith("worktree "):
          path = line[len("worktree "):]
      elif line.startswith("branch "):
          if line[len("branch "):] == "refs/heads/" + branch:
              print(path)
              break
  ' "$branch"
  }

  cleanup_branch() { # cleanup_branch BRANCH — 0 on success, 1 on refusal/failure (caller exits 4)
    local branch="$1" wt_path=""
    if GIT rev-parse -q --verify "refs/heads/$branch" >/dev/null 2>&1; then
      # Destroy nothing until the branch tip is provably contained in the integration branch.
      if ! GIT merge-base --is-ancestor "$branch" HEAD; then
        LOG "refusing to delete $branch: its tip is not an ancestor of HEAD (work would be lost)"
        return 1
      fi
    fi
    wt_path="$(worktree_path_for "$branch")"
    if [[ -n "$wt_path" ]]; then
      LOG "removing worktree: $wt_path"
      GIT worktree remove "$wt_path" --force \
        || { LOG "could not remove worktree: $wt_path"; return 1; }
    fi
    if GIT rev-parse -q --verify "refs/heads/$branch" >/dev/null 2>&1; then
      LOG "deleting branch: $branch"
      GIT branch -D "$branch" >/dev/null \
        || { LOG "could not delete branch: $branch"; return 1; }
    fi
    return 0
  }
  ````

  And call it inside the loop, immediately after each merge (before the next branch is touched):

  ````bash
  for b in "${BRANCHES[@]}"; do
    LOG "merging (no-ff): $b"
    GIT merge --no-ff -m "merge(wave): integrate $b" -m "$(trailer_block "$b")" "$b" >&2
    INTEGRATED="$INTEGRATED$b"$'\n'
    MERGED_NOW="$MERGED_NOW$b"$'\n'
    if ! cleanup_branch "$b"; then
      CLEANUP_FAILED="$CLEANUP_FAILED$b"$'\n'
      INTEGRATION_TIP="$(GIT rev-parse HEAD)"
      NEW_BASE_SHA="$INTEGRATION_TIP"
      emit_json cleanup-failed
      exit 4
    fi
  done
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: `25 passed, 0 failed`, `rc=0`. (The safety scenario reaches `cleanup_branch` because the
  script re-merges `solo`, which is already an ancestor — git reports "Already up to date", the merge
  is a no-op, and the guard then refuses the delete because the branch has advanced past HEAD.)

- [ ] **Step 3: Commit**

  ```bash
  git add -A && git commit \
    -m "feat(tribe): integrate-wave cleans up each merged worktree and branch safely" \
    -m $'Tribe-Card: idea-08-integrate-wave-script\nTribe-Task: 3/8'
  ```

  Expected: `git log -1 --format='%(trailers:key=Tribe-Task,valueonly)'` prints `3/8`.

---

## Task 4: Conflict path — capture, abort, exit 3

**Goal:** a conflicting branch makes the script capture the conflicted paths, run `git merge --abort`
(restoring a clean tree so `resume-check.sh` never sees a phantom `REDO_MERGE`), emit JSON naming the
branch and the paths, and exit `3`. Branches merged earlier in the wave stay merged **and cleaned**.

- [ ] **Step 1: Write the failing test**

  Append to the test file, above the footer:

  ````bash
  # --- scenario: a conflicting branch aborts cleanly and exits 3 ---
  R5="$TMP/conflict"; read -r WT5 BASE5 <<<"$(new_wave "$R5")"
  # subplan-2 is rewritten to collide with subplan-1 on the SAME file (owns_files was wrong).
  git_c "$R5-sub2" reset -q --hard "$BASE5"
  echo "theirs" > "$R5-sub2/file1.txt"
  git_c "$R5-sub2" add -A
  git_c "$R5-sub2" commit -qm "feat: sub-plan 2 (collides)" -m "Tribe-Card: demo" -m "Tribe-Task: 2/2"
  check "conflicting wave exits 3" "$(rc_of "$TMP/x.json" "$WT5" subplan-1 subplan-2)" "3"
  check "json names the conflicting branch" "$(jget "$TMP/x.json" conflict_branch)" "subplan-2"
  check "json names the conflicted path" "$(jget "$TMP/x.json" conflicted_paths.0)" "file1.txt"
  check "the tree is restored (no MERGE_HEAD)" \
    "$(git -C "$WT5" rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 && echo mid-merge || echo clean)" "clean"
  check "the tree is restored (not dirty)" "$(git -C "$WT5" status --porcelain)" ""
  check "the pre-conflict merge survives" \
    "$(git -C "$WT5" log --merges --format='%(trailers:key=Tribe-Wave-Branch,valueonly)' | tr -d '[:space:]')" \
    "subplan-1"
  check "the pre-conflict branch was still cleaned up" \
    "$(git -C "$WT5" branch --list subplan-1 | wc -l | tr -d ' ')" "0"
  check "the conflicting branch is left alone for inspection" \
    "$(git -C "$WT5" branch --list subplan-2 | wc -l | tr -d ' ')" "1"
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: the new checks fail — with `set -e`, the failing `git merge` currently kills the script
  (exit `1`, not `3`) and leaves `MERGE_HEAD` behind, so `conflicting wave exits 3` reports
  `got: 1, want: 3`. `rc=1`.

- [ ] **Step 2: Make it pass**

  In the integrate loop, guard the merge and handle the conflict. Replace the `GIT merge` line with:

  ````bash
    if ! GIT merge --no-ff -m "merge(wave): integrate $b" -m "$(trailer_block "$b")" "$b" >&2; then
      # Conflict = owns_files was wrong (warchief.md:407-409). Capture the evidence BEFORE
      # restoring the tree, then abort so the worktree is left clean and re-runnable.
      CONFLICT_BRANCH="$b"
      CONFLICT_PATHS="$(GIT diff --name-only --diff-filter=U || true)"
      GIT merge --abort || LOG "warning: could not abort the conflicted merge"
      # Everything after this branch in the wave never ran.
      local_seen=0
      for p in "${BRANCHES[@]}"; do
        if [[ "$p" == "$b" ]]; then local_seen=1; continue; fi
        if [[ "$local_seen" == "1" ]]; then PENDING="$PENDING$p"$'\n'; fi
      done
      INTEGRATION_TIP="$(GIT rev-parse HEAD)"
      NEW_BASE_SHA="$INTEGRATION_TIP"
      LOG "merge conflict on $b — aborted and restored; the Warchief must return NEEDS_DIRECTION"
      emit_json conflict
      exit 3
    fi
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: `33 passed, 0 failed`, `rc=0`.

- [ ] **Step 3: Commit**

  ```bash
  git add -A && git commit \
    -m "feat(tribe): integrate-wave aborts a conflicting merge and exits 3" \
    -m $'Tribe-Card: idea-08-integrate-wave-script\nTribe-Task: 4/8'
  ```

  Expected: `git log -1 --format='%(trailers:key=Tribe-Task,valueonly)'` prints `4/8`.

---

## Task 5: Resume-safety I — die mid-merge, re-run, converge (`REDO_MERGE`)

**Goal:** a `MERGE_HEAD` left by a killed run is aborted by the script itself, which then redoes the
wave from the top. This **is** the `REDO_MERGE` action `resume-check.sh:15,200-202` prescribes; the
resuming Warchief just re-runs the same command line.

- [ ] **Step 1: Write the failing test**

  Append to the test file, above the footer:

  ````bash
  # --- scenario: a crash mid-merge is aborted and redone on re-run (REDO_MERGE) ---
  R6="$TMP/midmerge"; read -r WT6 BASE6 <<<"$(new_wave "$R6")"
  # Leave a half-finished merge in the tree, exactly as a killed Warchief would:
  git_c "$WT6" merge --no-ff --no-commit -q subplan-1 || true
  check "fixture really left a merge in progress" \
    "$(git -C "$WT6" rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 && echo mid-merge)" "mid-merge"
  check "re-run over a half-merge exits 0" "$(rc_of "$TMP/m.json" "$WT6" subplan-1 subplan-2)" "0"
  check "the half-merge was aborted, not committed twice" \
    "$(git -C "$WT6" log --merges --format=%s | wc -l | tr -d ' ')" "2"
  check "both sub-plans landed after the redo" \
    "$([[ -f "$WT6/file1.txt" && -f "$WT6/file2.txt" ]] && echo both)" "both"
  check "no MERGE_HEAD survives the redo" \
    "$(git -C "$WT6" rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1 && echo mid-merge || echo clean)" "clean"
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: `re-run over a half-merge exits 0` fails with `got: 2, want: 0` — the preflight dirty
  check currently rejects the mid-merge tree. `rc=1`.

- [ ] **Step 2: Make it pass**

  In the preflight block, **before** the dirty check, add the mid-merge recovery:

  ````bash
  # A MERGE_HEAD means a previous run died mid-merge. Aborting and redoing the wave IS
  # resume-check.sh's REDO_MERGE action — so a resuming Warchief just re-runs this line.
  if GIT rev-parse -q --verify MERGE_HEAD >/dev/null 2>&1; then
    LOG "MERGE_HEAD found — a previous run died mid-merge; aborting it and redoing the wave"
    GIT merge --abort || DIE "could not abort the in-progress merge in $WORKTREE"
  fi
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: `38 passed, 0 failed`, `rc=0`.

- [ ] **Step 3: Commit**

  ```bash
  git add -A && git commit \
    -m "feat(tribe): integrate-wave aborts and redoes a half-finished merge (REDO_MERGE)" \
    -m $'Tribe-Card: idea-08-integrate-wave-script\nTribe-Task: 5/8'
  ```

  Expected: `git log -1 --format='%(trailers:key=Tribe-Task,valueonly)'` prints `5/8`.

---

## Task 6: Resume-safety II — already-integrated branches are skipped, not re-merged

**Goal:** a branch merged **and cleaned up** by an earlier run has no ref left, so a naive "branch
must exist" preflight would hard-fail the re-run (the same deadlock `warchief.md:343-353` had to
patch for `worktree add`). Detect it from git history instead — the merge commit's
`Tribe-Wave-Branch` trailer — and skip it. Idempotence: a fully-integrated wave re-run makes **no new
commits**.

- [ ] **Step 1: Write the failing test**

  Append to the test file, above the footer:

  ````bash
  # --- scenario: partial-wave re-run — branch 1 merged+deleted, branch 2 still pending ---
  R7="$TMP/partial"; read -r WT7 BASE7 <<<"$(new_wave "$R7")"
  check "first pass integrates only branch 1" "$(rc_of "$TMP/p1.json" "$WT7" subplan-1 --card demo)" "0"
  check "branch 1 ref is gone after cleanup" \
    "$(git -C "$WT7" branch --list subplan-1 | wc -l | tr -d ' ')" "0"
  check "re-running the FULL wave exits 0" \
    "$(rc_of "$TMP/p2.json" "$WT7" subplan-1 subplan-2 --card demo)" "0"
  check "branch 1 was skipped, not re-merged" \
    "$(git -C "$WT7" log --merges --format='%(trailers:key=Tribe-Wave-Branch,valueonly)' | grep -c 'subplan-1')" "1"
  check "json reports branch 1 as skipped" "$(jget "$TMP/p2.json" skipped_already_integrated.0)" "subplan-1"
  check "json reports branch 2 as merged this run" "$(jget "$TMP/p2.json" merged_this_run.0)" "subplan-2"
  check "both sub-plan files are present" \
    "$([[ -f "$WT7/file1.txt" && -f "$WT7/file2.txt" ]] && echo both)" "both"

  # --- scenario: a fully-integrated wave re-run is a no-op ---
  HEAD_BEFORE="$(git -C "$WT7" rev-parse HEAD)"
  check "fully-integrated re-run exits 0" \
    "$(rc_of "$TMP/p3.json" "$WT7" subplan-1 subplan-2 --card demo)" "0"
  check "no new commits on a no-op re-run" "$(git -C "$WT7" rev-parse HEAD)" "$HEAD_BEFORE"

  # --- scenario: re-running a conflicted wave is deterministic (branch 1 already gone) ---
  check "conflicted wave re-run exits 3 again" "$(rc_of "$TMP/x2.json" "$WT5" subplan-1 subplan-2)" "3"
  check "conflicted wave re-run names the same branch" "$(jget "$TMP/x2.json" conflict_branch)" "subplan-2"
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: `re-running the FULL wave exits 0` fails with `got: 2, want: 0` — the preflight rejects
  the deleted `subplan-1` as an unknown branch. `rc=1`.

- [ ] **Step 2: Make it pass**

  Add the trailer-based detector next to `trailer_block` (git history is ground truth,
  `warchief.md:153-156` — read the structured trailer, never a subject-line grep):

  ````bash
  already_integrated() { # already_integrated BRANCH — was it merged by an earlier run of this wave?
    local branch="$1" sha wb card
    while read -r sha; do
      [[ -n "$sha" ]] || continue
      wb="$(GIT show -s --format='%(trailers:key=Tribe-Wave-Branch,valueonly)' "$sha" | tr -d '[:space:]')"
      [[ "$wb" == "$branch" ]] || continue
      if [[ -n "$CARD" ]]; then
        # With a card given, only THIS card's merges count — a recycled branch name from an
        # older campaign must not read as integrated.
        card="$(GIT show -s --format='%(trailers:key=Tribe-Card,valueonly)' "$sha" | tr -d '[:space:]')"
        [[ "$card" == "$CARD" ]] || continue
      fi
      return 0
    done < <(GIT log --merges --format='%H' HEAD)
    return 1
  }
  ````

  Relax the preflight branch check to accept an already-integrated (hence ref-less) branch:

  ````bash
  for b in "${BRANCHES[@]}"; do
    if GIT rev-parse -q --verify "refs/heads/$b" >/dev/null 2>&1; then continue; fi
    if already_integrated "$b"; then continue; fi
    DIE "branch not found and never integrated: $b"
  done
  ````

  And short-circuit inside the integrate loop, as the first thing done per branch:

  ````bash
    if already_integrated "$b"; then
      LOG "already integrated by an earlier run, skipping merge: $b"
      INTEGRATED="$INTEGRATED$b"$'\n'
      SKIPPED="$SKIPPED$b"$'\n'
      if ! cleanup_branch "$b"; then
        CLEANUP_FAILED="$CLEANUP_FAILED$b"$'\n'
        INTEGRATION_TIP="$(GIT rev-parse HEAD)"
        NEW_BASE_SHA="$INTEGRATION_TIP"
        emit_json cleanup-failed
        exit 4
      fi
      continue
    fi
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: `49 passed, 0 failed`, `rc=0`. Note the Task-3 safety scenario still passes: `solo`'s
  hand-made merge commit carries the `Tribe-Wave-Branch` trailer, so it is now *skipped* rather than
  re-merged, and the ancestor guard still refuses to delete the advanced branch, exiting `4`.

- [ ] **Step 3: Commit**

  ```bash
  git add -A && git commit \
    -m "feat(tribe): integrate-wave skips already-integrated branches (idempotent re-run)" \
    -m $'Tribe-Card: idea-08-integrate-wave-script\nTribe-Task: 6/8'
  ```

  Expected: `git log -1 --format='%(trailers:key=Tribe-Task,valueonly)'` prints `6/8`.

---

## Task 7: Optional state-file re-record (`--state-file` + `--wave`)

**Goal:** the base-SHA re-record that `warchief.md:150-152` demands becomes deterministic: after the
wave's merges land, rewrite `base-sha:` to the integration tip and tick `- [x] wave N integrated`, in
one commit trailered `Tribe-Milestone: wave N integrated`. **Idempotent:** if the wave's box is
already ticked, do nothing (no second commit).

- [ ] **Step 1: Write the failing test**

  Append to the test file, above the footer:

  ````bash
  # --- scenario: --state-file/--wave re-records the base SHA and ticks the milestone ---
  R8="$TMP/state"; read -r WT8 BASE8 <<<"$(new_wave "$R8")"
  mkdir -p "$WT8/docs/tribe/state"
  cat > "$WT8/docs/tribe/state/demo.md" <<EOF
  # tribe-state: demo
  worktree: $WT8
  branch: integration
  base-sha: $BASE8
  plan: docs/plan.md

  ## Milestones
  - [x] spec committed
  - [x] plan committed
  - [ ] wave 1 integrated
  EOF
  git_c "$WT8" add -A
  git_c "$WT8" commit -qm "chore(demo): state file" -m "Tribe-Card: demo" -m "Tribe-Milestone: plan committed"
  check "state-file run exits 0" \
    "$(rc_of "$TMP/st.json" "$WT8" subplan-1 subplan-2 --card demo --state-file "$WT8/docs/tribe/state/demo.md" --wave 1)" "0"
  check "wave milestone is ticked" \
    "$(grep -c '^- \[x\] wave 1 integrated' "$WT8/docs/tribe/state/demo.md")" "1"
  check "base-sha is re-recorded to the integration tip" \
    "$(grep '^base-sha:' "$WT8/docs/tribe/state/demo.md" | awk '{print $2}')" \
    "$(jget "$TMP/st.json" integration_tip_sha)"
  check "the state commit carries the milestone trailer" \
    "$(git -C "$WT8" log -1 --format='%(trailers:key=Tribe-Milestone,valueonly)' | tr -d '\n')" \
    "wave 1 integrated"
  check "json flags the state write" "$(jget "$TMP/st.json" state_file_updated)" "true"
  check "new_base_sha is HEAD after the state commit" \
    "$(jget "$TMP/st.json" new_base_sha)" "$(git -C "$WT8" rev-parse HEAD)"
  check "the state worktree is clean afterwards" "$(git -C "$WT8" status --porcelain)" ""
  # idempotence: the same line again writes nothing
  HEAD8="$(git -C "$WT8" rev-parse HEAD)"
  check "state re-run exits 0" \
    "$(rc_of "$TMP/st2.json" "$WT8" subplan-1 subplan-2 --card demo --state-file "$WT8/docs/tribe/state/demo.md" --wave 1)" "0"
  check "state re-run makes no commit" "$(git -C "$WT8" rev-parse HEAD)" "$HEAD8"
  check "state re-run flags no write" "$(jget "$TMP/st2.json" state_file_updated)" "false"
  # both flags are required together
  check "--state-file without --wave exits 2" \
    "$(rc_of "$TMP/st3.json" "$WT8" subplan-1 --state-file "$WT8/docs/tribe/state/demo.md")" "2"
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: `state-file run exits 0` fails with `got: 2, want: 0` (the flags are parsed but unused,
  so `--state-file` is currently inert and `--wave 1` unknown-flag-free yet unpaired), and every
  state assertion fails. `rc=1`.

- [ ] **Step 2: Make it pass**

  Add flag validation to the preflight (after the `python3` check):

  ````bash
  if [[ -n "$STATE_FILE$WAVE" ]]; then
    [[ -n "$STATE_FILE" && -n "$WAVE" ]] || DIE "--state-file and --wave must be given together"
    [[ "$WAVE" =~ ^[0-9]+$ ]] || DIE "invalid --wave: '$WAVE' (must be a non-negative integer)"
    [[ -f "$STATE_FILE" ]] || DIE "state file not found: $STATE_FILE"
  fi
  ````

  Add the writer next to `emit_json`:

  ````bash
  wave_already_ticked() { # wave_already_ticked — is "wave N integrated" already checked off?
    grep -Eq "^[[:space:]]*-[[:space:]]*\[[xX]\][[:space:]]*wave[[:space:]]+$WAVE[[:space:]]+integrated" \
      "$STATE_FILE"
  }

  record_state() { # record_state TIP_SHA — rewrite base-sha + tick the wave; ONE commit; idempotent
    local tip="$1"
    if wave_already_ticked; then
      LOG "state file already records wave $WAVE — nothing to write"
      return 0
    fi
    STATE_FILE="$STATE_FILE" WAVE="$WAVE" TIP="$tip" python3 - <<'PY'
  import os, re
  path, wave, tip = os.environ["STATE_FILE"], os.environ["WAVE"], os.environ["TIP"]
  lines = open(path).read().splitlines()
  out, ticked, rebased = [], False, False
  box = re.compile(r"^\s*-\s*\[[ xX]\]\s*wave\s+%s\s+integrated\s*$" % re.escape(wave))
  for ln in lines:
      if ln.startswith("base-sha:"):
          out.append("base-sha: %s" % tip)
          rebased = True
          continue
      if box.match(ln):
          out.append("- [x] wave %s integrated" % wave)
          ticked = True
          continue
      out.append(ln)
  if not rebased:
      # No base-sha field yet: put it above the Milestones section, or at the end.
      idx = next((i for i, l in enumerate(out) if l.startswith("## Milestones")), len(out))
      out.insert(idx, "base-sha: %s" % tip)
  if not ticked:
      out.append("- [x] wave %s integrated" % wave)
  open(path, "w").write("\n".join(out) + "\n")
  PY
    GIT add -- "$STATE_FILE"
    if [[ -z "$(GIT status --porcelain -- "$STATE_FILE")" ]]; then
      LOG "state file unchanged — no commit"
      return 0
    fi
    local trailers="Tribe-Milestone: wave $WAVE integrated"
    if [[ -n "$CARD" ]]; then trailers="Tribe-Card: $CARD"$'\n'"$trailers"; fi
    GIT commit -q -m "chore(wave): record wave $WAVE base $tip" -m "$trailers"
    STATE_UPDATED="1"
    LOG "state file updated: wave $WAVE integrated, base-sha $tip"
    return 0
  }
  ````

  And call it after the loop, before emitting:

  ````bash
  INTEGRATION_TIP="$(GIT rev-parse HEAD)"
  if [[ -n "$STATE_FILE" ]]; then record_state "$INTEGRATION_TIP"; fi
  # The state commit (if any) sits on top of the integration tip, so HEAD — not the tip — is
  # what the next wave's worktrees must branch from.
  NEW_BASE_SHA="$(GIT rev-parse HEAD)"
  LOG "wave integrated; next wave's base: $NEW_BASE_SHA"
  emit_json ok
  exit 0
  ````

  ```bash
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh; echo "rc=$?"
  ```

  Expected: `60 passed, 0 failed`, `rc=0`.

- [ ] **Step 3: Commit**

  ```bash
  git add -A && git commit \
    -m "feat(tribe): integrate-wave re-records the base SHA and ticks the wave milestone" \
    -m $'Tribe-Card: idea-08-integrate-wave-script\nTribe-Task: 7/8'
  ```

  Expected: `git log -1 --format='%(trailers:key=Tribe-Task,valueonly)'` prints `7/8`.

---

## Task 8: Shrink `warchief.md` step 5 to an invocation plus judgment

**Goal:** the ~52 mechanical lines at `warchief.md:402-433` become a script invocation and an
exit-code table. **Every judgment paragraph survives verbatim** — the mixed-outcome-wave rule, the
"do not merge any of the wave's branches on a capped FAIL" ruling, and `NEEDS_DIRECTION` on conflict.

- [ ] **Step 1: Verify the current text and its boundaries (the "failing test")**

  This task edits prose, so the proof is a text assertion, not a unit test. Capture the before-state:

  ```bash
  sed -n '402,433p' plugins/tribe/agents/warchief.md | wc -l
  grep -c 'git worktree remove\|git branch -D\|git -C .* merge --no-ff\|rev-parse HEAD' plugins/tribe/agents/warchief.md
  grep -n 'Mixed-outcome wave' plugins/tribe/agents/warchief.md
  ```

  Expected before the edit: `32` lines in that span; the hand-run git commands are present in step 5;
  `Mixed-outcome wave` appears at line 390.

- [ ] **Step 2: Make the edit**

  In `plugins/tribe/agents/warchief.md`, keep sub-step 1 (the wait/audit/mixed-outcome paragraph,
  lines 388-401) **unchanged**, and replace sub-steps 2-4 (lines 402-429) with:

  ````markdown
  2. Integrate the wave with **`integrate-wave.sh`** — do not hand-run the merge/cleanup/SHA chain.
     Resolve the script's path exactly as you resolve `heartbeat-check.sh` in Channels above (try
     `$CLAUDE_PLUGIN_ROOT/scripts` first, then the `readlink -f` fallback; if neither yields it, stop
     and return `NEEDS_DIRECTION`). Then, from anywhere:

     ```bash
     "$dir/integrate-wave.sh" <your-worktree-path> <branch-per-sub-plan-in-declared-order> \
       --card <card-slug> --state-file docs/tribe/state/<card-slug>.md --wave <N>
     ```

     It merges each branch `--no-ff` in the order you list them, removes each merged sub-plan's
     worktree and branch immediately after its merge lands, re-records `base-sha` in the state file,
     ticks the wave's milestone, and prints the next wave's base SHA as `new_base_sha`. Re-running
     the identical line after a crash converges (it aborts a half-merge — that is `resume-check.sh`'s
     `REDO_MERGE` — and skips branches an earlier run already integrated).

     Act on its exit code:

     | Exit | Meaning | Your move |
     |---|---|---|
     | `0` | wave integrated, worktrees cleaned, `new_base_sha` printed | use `new_base_sha` as the recorded base commit for wave N+1 |
     | `2` | usage/setup error (dirty worktree, unknown branch, bad args) | fix the invocation and re-run |
     | `3` | **merge conflict** — the merge was aborted and the tree restored | the sub-plans' `owns_files` were wrong. **Do not guess a resolution.** Save state and return `NEEDS_DIRECTION` to the Shaman, quoting the JSON's `conflict_branch` and `conflicted_paths` |
     | `4` | post-merge cleanup failure (the merge is durable) | clear the leftover worktree/branch named in `cleanup_failed`, then re-run the same line |

  3. Only now create wave N+1's per-sub-plan worktrees (step 4 — whose creation is itself
     resume-safe), branching them from the `new_base_sha` the script printed, and dispatch its
     Hunters.
  ````

  Leave lines 431-433 (the "a plan with only one wave has nothing to integrate" paragraph) in place.

  ```bash
  bash -n plugins/tribe/scripts/integrate-wave.sh && echo "script still ok"
  grep -c 'Mixed-outcome wave' plugins/tribe/agents/warchief.md
  grep -c 'integrate-wave.sh' plugins/tribe/agents/warchief.md
  grep -c 'git worktree remove <path-per-sub-plan> --force' plugins/tribe/agents/warchief.md
  bash plugins/tribe/scripts/tests/test-integrate-wave.sh | tail -1
  bash plugins/tribe/scripts/tests/test-resume-check.sh | tail -1
  bash plugins/tribe/scripts/tests/test-validate-plan.sh | tail -1
  ```

  Expected: `script still ok`; `Mixed-outcome wave` still `1` (judgment preserved);
  `integrate-wave.sh` at least `2`; the hand-run cleanup command now `1` — it survives **only** in
  step 4's worktree-creation block (`warchief.md:350`), never as a step-5 integration instruction;
  and all three suites end `0 failed` (`60 passed, 0 failed` for the new one).

- [ ] **Step 3: Commit**

  ```bash
  git add -A && git commit \
    -m "docs(tribe): warchief step 5 invokes integrate-wave.sh instead of narrating it" \
    -m $'Tribe-Card: idea-08-integrate-wave-script\nTribe-Task: 8/8'
  ```

  Expected: `git log -1 --format='%(trailers:key=Tribe-Task,valueonly)'` prints `8/8`.

---

## Definition of done (for the implementation campaign that runs this plan)

- All three suites green: `test-integrate-wave.sh` (`60 passed, 0 failed`), `test-resume-check.sh`,
  `test-validate-plan.sh` — pasted into the PR body (the repo has no CI; these are the gate).
- Evidence per the spec's §5: the before/after terminal captures, including the live three-act demo
  (clean wave → exit `0`; killed mid-merge → identical re-run converges; conflicting wave → exit `3`
  with a clean tree).
- `plugins/tribe/agents/warchief.md` step 5 contains no hand-run integration git commands, and its
  judgment paragraphs are byte-identical to before.
- Audited PASS by the `skinner` against the spec, then squash-merged.
