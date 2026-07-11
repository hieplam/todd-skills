# Tribe Atomic Checkpointing & Self-Healing Resume — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make a tribe campaign survive a whole-machine crash: work and its done-record land in the same git commit, and a deterministic `resume-check.sh` computes the exact next action so a fresh session never duplicates or salvages half-done work.

**Architecture:** Three state layers — per-card state file (Warchief), plan checkboxes (Hunter), git trailers (ground truth) — reconciled by a new `plugins/tribe/scripts/resume-check.sh` in the same bash+python3 style as `heartbeat-check.sh`. Agent contracts gain the atomic tick-in-same-commit rules and the revert-and-redo dirty policy. `validate-plan.sh` gains CommonMark-correct fence handling (a prerequisite bug fix: it currently parses headings and placeholder tokens inside quoted code blocks as real plan structure) and a mechanical single-commit-step-per-task check.

**Tech Stack:** bash, python3 (stdlib only), git, `gh` (optional at runtime, stubbed in tests).

**Spec:** `docs/superpowers/specs/2026-07-11-tribe-atomic-resume-design.md` (approved). This plan stays one document despite its length: the script tasks evolve the same two files sequentially, so splitting into parallel sub-plans would create file-ownership conflicts with no parallelism gain.

## Global Constraints

- Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic implementer.
- Every task is a single unit of work (one red→green→commit cycle) ending in exactly one commit step. If a task fails midway, discard uncommitted work (`git reset --hard`) and redo the task from its brief — never salvage.
- Script-family conventions, matching `heartbeat-check.sh` and `validate-plan.sh`: bash with `set -euo pipefail`; `LOG`/`DIE` helpers writing to stderr; JSON only on stdout; exit 0 = ran successfully (regardless of verdict), exit 2 = setup error; parsing in a python3 heredoc; no dependencies beyond git, python3, and (optional, runtime-probed) `gh`.
- All tests run offline. `gh` is exercised only through the `RESUME_CHECK_GH` env override pointing at a local stub.
- Commit messages: conventional commits. Never add a co-authored trailer.
- All work happens in the current worktree (branch `worktree-tribe-atomic-resume`); commit after every task.

---

### Task 1: validate-plan.sh — CommonMark-correct fence handling

**Files:**
- Modify: `plugins/tribe/scripts/validate-plan.sh` (replace the section-splitting and scanning region, roughly lines 78–216)
- Create: `plugins/tribe/scripts/tests/test-validate-plan.sh`

**Interfaces:**
- Produces: per-line `in_fence_flags` / `fence_opens` arrays and section objects `{level, title, line, end, span}` inside validate-plan.sh (`span` = the section's body lines including nested subsections; Task 2's check consumes these). Test conventions (`ok`/`bad`/`check`/`jget`/`find_check` helpers, `PASS`/`FAIL` counters, exit 1 on any failure) reused by Tasks 2–10's test code.
- Consumes: existing check names and JSON output shape of validate-plan.sh (all preserved).

- [ ] **Step 1: Write the failing test**

Create `plugins/tribe/scripts/tests/test-validate-plan.sh` with exactly this content:

`````bash
#!/usr/bin/env bash
# test-validate-plan.sh — fixture tests for validate-plan.sh (offline, no network).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../validate-plan.sh"
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
find_check() { # find_check FILE CHECK_NAME — prints that check's status, or MISSING
  python3 - "$1" "$2" <<'EOF'
import json, sys
data = json.load(open(sys.argv[1]))
for c in data.get("checks", []):
    if c["name"] == sys.argv[2]:
        print(c["status"]); break
else:
    print("MISSING")
EOF
}

good_plan_header() {
  cat <<'EOF'
# Fixture Plan

## Global Constraints

- Implementer: dispatch each implementation/fix task to the hunter subagent.

EOF
}

# fixture: a task that QUOTES a whole file containing a fenced plan — the quoted
# heading, inner fences, and angle tokens are content, not plan structure
F0="$TMP/fenced.md"
{ good_plan_header; cat <<'EOF'
### Task 1: Real task quoting a whole test file

- [ ] **Step 1: Write the failing test**

````markdown
### Task 9: Phantom — this heading is quoted content, not a real task

```bash
echo "an <angle-token> stays inside the fence"
```
````

Expected: the quoted file is written verbatim

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: fenced"
```
EOF
} > "$F0"
bash "$SCRIPT" "$F0" > "$TMP/out0.json"
check "quoted headings are not tasks" "$(jget "$TMP/out0.json" task_count)" "1"
check "fenced angle tokens are not placeholders" "$(find_check "$TMP/out0.json" no_placeholders)" "pass"
check "fenced fixture verdict is pass" "$(jget "$TMP/out0.json" verdict)" "pass"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
exit $((FAIL > 0))
`````

Make it executable:

```bash
chmod +x plugins/tribe/scripts/tests/test-validate-plan.sh
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash plugins/tribe/scripts/tests/test-validate-plan.sh
```

Expected: FAIL — `quoted headings are not tasks (got: 2, want: 1)` (the phantom counts today) and `fenced angle tokens are not placeholders (got: fail, want: pass)`. Exit 1.

- [ ] **Step 3: Write minimal implementation**

In `plugins/tribe/scripts/validate-plan.sh`: delete the `CODE_FENCE_MARKER_RE` definition (it becomes unused), then replace everything from the `HEADING_RE = re.compile(...)` line through the end of the `tasks_have_expected_output` `checks.append(...)` block with:

```python
HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")

# CommonMark-correct fence map: for each line, whether it sits inside a fenced code
# block, and whether it OPENS one. A fence opened by N backticks/tildes closes only on
# a line of >= N of the same character and nothing else — so documentation that nests
# fenced examples inside a longer outer fence (this repo's plans quote whole test
# files, which themselves contain fences) no longer desyncs the scanner, and headings
# inside fenced content are body text, not real headings.
FENCE_RE = re.compile(r"^\s*(`{3,}|~{3,})(.*)$")
in_fence_flags, fence_opens = [], []
open_char, open_len = None, 0
for line in lines:
    m = FENCE_RE.match(line)
    if open_char is None:
        if m:
            fence = m.group(1)
            open_char, open_len = fence[0], len(fence)
            in_fence_flags.append(True)
            fence_opens.append(True)
        else:
            in_fence_flags.append(False)
            fence_opens.append(False)
    else:
        in_fence_flags.append(True)
        fence_opens.append(False)
        if m and m.group(1)[0] == open_char and len(m.group(1)) >= open_len \
                and m.group(2).strip() == "":
            open_char, open_len = None, 0

# Split into sections using only REAL headings. Each section spans [line+1, end) in
# 1-based file lines: its own body plus every strictly-deeper subsection, stopping at
# the next heading of the same or shallower level — so a Task whose steps use nested
# subheadings still owns that content.
sections = []
for i, line in enumerate(lines, start=1):
    if in_fence_flags[i - 1]:
        continue
    m = HEADING_RE.match(line)
    if m:
        sections.append({"level": len(m.group(1)), "title": m.group(2).strip(), "line": i})
for idx, s in enumerate(sections):
    end = len(lines) + 1
    for other in sections[idx + 1:]:
        if other["level"] <= s["level"]:
            end = other["line"]
            break
    s["end"] = end
    s["span"] = lines[s["line"]:s["end"] - 1]
if not sections:
    sections = [{"level": 0, "title": "(no headings)", "line": 0,
                 "end": len(lines) + 1, "span": lines}]

task_sections = [s for s in sections if TASK_HEADING_RE.match(s["title"])]

checks = []

# 1. at least one task section
checks.append({
    "name": "has_task_sections",
    "status": "pass" if task_sections else "fail",
    "detail": f"{len(task_sections)} task section(s) found",
})

# 2. Global Constraints section names the hunter subagent
gc_sections = [s for s in sections if re.search(r"global constraints", s["title"], re.IGNORECASE)]
if not gc_sections:
    checks.append({"name": "global_constraints_present", "status": "fail",
                    "detail": "no 'Global Constraints' section found"})
    checks.append({"name": "hunter_named_as_implementer", "status": "fail",
                    "detail": "cannot check — no 'Global Constraints' section"})
else:
    checks.append({"name": "global_constraints_present", "status": "pass",
                    "detail": f"found at line {gc_sections[0]['line']}"})
    gc_text = "\n".join(gc_sections[0]["span"])
    names_hunter = bool(re.search(r"\bhunter\b", gc_text, re.IGNORECASE)) and \
                   bool(re.search(r"\bsubagent\b", gc_text, re.IGNORECASE))
    checks.append({
        "name": "hunter_named_as_implementer",
        "status": "pass" if names_hunter else "fail",
        "detail": "Global Constraints names the hunter subagent as implementer"
                  if names_hunter else
                  "Global Constraints does not name the hunter subagent as implementer",
    })

# 3. no placeholder markers anywhere in the file
# Angle-bracket notation and trailing ellipses are legitimate inside code (inline or
# fenced, per the fence map above) — both checks skip there. The word markers matched
# by WORD_PLACEHOLDER_RE are real placeholders regardless of code formatting, so those
# are still checked everywhere.
placeholder_hits = []
for i, line in enumerate(lines, start=1):
    for m in WORD_PLACEHOLDER_RE.finditer(line):
        placeholder_hits.append({"line": i, "match": m.group(0)})
    if in_fence_flags[i - 1]:
        continue
    stripped = INLINE_CODE_RE.sub("", line)
    for m in ELLIPSIS_RE.finditer(stripped):
        # A "trailing" ellipsis — nothing but whitespace/punctuation after it on this
        # line — reads as content trailing off unfinished, the actual placeholder this
        # check exists to catch. An ellipsis followed by more prose is ordinary
        # punctuation (a quoted excerpt or a pause), not a placeholder.
        tail = stripped[m.end():]
        if re.search(r"[A-Za-z0-9]", tail):
            continue
        placeholder_hits.append({"line": i, "match": m.group(0)})
    for m in ANGLE_PLACEHOLDER_RE.finditer(stripped):
        placeholder_hits.append({"line": i, "match": m.group(0)})
checks.append({
    "name": "no_placeholders",
    "status": "pass" if not placeholder_hits else "fail",
    "detail": f"{len(placeholder_hits)} placeholder marker(s) found" if placeholder_hits else "none found",
})

# 4. each task section carries a fenced code block and an expected-result mention
tasks_missing_code = []
tasks_missing_expected = []
for s in task_sections:
    body_text = "\n".join(s["span"])
    fence_blocks = sum(1 for j in range(s["line"], s["end"] - 1) if fence_opens[j])
    if fence_blocks < 1:
        tasks_missing_code.append(s["title"])
    if not re.search(r"\bexpected\b", body_text, re.IGNORECASE):
        tasks_missing_expected.append(s["title"])

checks.append({
    "name": "tasks_have_code_blocks",
    "status": "pass" if not tasks_missing_code else "fail",
    "detail": "all task sections carry a fenced code block" if not tasks_missing_code
              else f"missing in: {tasks_missing_code}",
})
checks.append({
    "name": "tasks_have_expected_output",
    "status": "pass" if not tasks_missing_expected else "fail",
    "detail": "all task sections mention an expected result" if not tasks_missing_expected
              else f"missing in: {tasks_missing_expected}",
})
```

Also update the header comment block: after the line describing the `"..."`/`"<...>"` handling, add:

```text
#     Fence tracking is CommonMark-correct: a fence opened by N backticks closes only
#     on >= N of the same character, so nested fenced examples inside a longer outer
#     fence stay inside it, and headings quoted inside any fence are content, not
#     section structure.
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash plugins/tribe/scripts/tests/test-validate-plan.sh
```

Expected: PASS — `3 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/validate-plan.sh plugins/tribe/scripts/tests/test-validate-plan.sh
git commit -m "fix(tribe): validate-plan fence-aware parsing — quoted plans are content"
```

---

### Task 2: validate-plan.sh — single-commit-step check

**Files:**
- Modify: `plugins/tribe/scripts/validate-plan.sh` (insert new check between check 4 and the verdict)
- Modify: `plugins/tribe/scripts/tests/test-validate-plan.sh` (append fixtures before the summary footer)

**Interfaces:**
- Consumes: `task_sections` with `span`/`line`/`end`, `in_fence_flags` from Task 1.
- Produces: JSON check `tasks_single_commit_step` — every task must contain exactly one checkbox step whose title is `Commit`, counted outside fences only. This is the mechanical enforcement of the single-unit-of-work sizing rule.

- [ ] **Step 1: Write the failing test**

In `plugins/tribe/scripts/tests/test-validate-plan.sh`, insert before the `printf '\n%d passed...'` footer:

````bash
# fixture: one task, exactly one commit step -> pass
F1="$TMP/single.md"
{ good_plan_header; cat <<'EOF'
### Task 1: One unit

- [ ] **Step 1: Write the failing test**

```bash
echo test
```

Expected: FAIL

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: one"
```
EOF
} > "$F1"
bash "$SCRIPT" "$F1" > "$TMP/out1.json"
check "single commit step passes" "$(find_check "$TMP/out1.json" tasks_single_commit_step)" "pass"

# fixture: one task with two commit steps -> fail
F2="$TMP/double.md"
{ good_plan_header; cat <<'EOF'
### Task 1: Two units glued together

- [ ] **Step 1: Write the failing test**

```bash
echo test
```

Expected: FAIL

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: part one"
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: part two"
```
EOF
} > "$F2"
bash "$SCRIPT" "$F2" > "$TMP/out2.json"
check "two commit steps fail" "$(find_check "$TMP/out2.json" tasks_single_commit_step)" "fail"

# fixture: one task with no commit step -> fail
F3="$TMP/none.md"
{ good_plan_header; cat <<'EOF'
### Task 1: Never lands

- [ ] **Step 1: Write the failing test**

```bash
echo test
```

Expected: FAIL
EOF
} > "$F3"
bash "$SCRIPT" "$F3" > "$TMP/out3.json"
check "zero commit steps fail" "$(find_check "$TMP/out3.json" tasks_single_commit_step)" "fail"
````

- [ ] **Step 2: Run test to verify it fails**

```bash
bash plugins/tribe/scripts/tests/test-validate-plan.sh
```

Expected: FAIL — three `not ok` lines with `got: MISSING`, because the `tasks_single_commit_step` check does not exist yet. Exit 1.

- [ ] **Step 3: Write minimal implementation**

In `plugins/tribe/scripts/validate-plan.sh`, immediately after the `tasks_have_expected_output` `checks.append(...)` block, insert:

```python
# 5. each task is a single unit of work: exactly one "Commit" step per task section.
# The step title must BE "Commit" (writing-plans template: "- [ ] **Step N: Commit**") —
# a step title merely containing the word commit does not count, and quoted steps
# inside fenced examples do not count either. Enforces the tribe's crash-resume
# ruling: one red->green->commit cycle per task, so a discarded half-done task is
# never expensive to redo.
COMMIT_STEP_RE = re.compile(r"^\s*-\s*\[[ xX]\]\s*\*\*Step\s+\d+:\s*Commit\b", re.IGNORECASE)
tasks_wrong_commit_count = []
for s in task_sections:
    n_commits = sum(1 for j in range(s["line"], s["end"] - 1)
                    if not in_fence_flags[j] and COMMIT_STEP_RE.match(lines[j]))
    if n_commits != 1:
        tasks_wrong_commit_count.append(f"{s['title']} ({n_commits} commit step(s))")
checks.append({
    "name": "tasks_single_commit_step",
    "status": "pass" if not tasks_wrong_commit_count else "fail",
    "detail": "every task section has exactly one Commit step"
              if not tasks_wrong_commit_count
              else f"wrong commit-step count in: {tasks_wrong_commit_count}",
})
```

Also extend the header comment block (after the line describing check 4) with:

```text
#   - each task section carries exactly one "Commit" step (a checkbox step whose title
#     is "Commit", counted outside fences), enforcing the single-unit-of-work sizing
#     rule from the atomic-resume spec
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash plugins/tribe/scripts/tests/test-validate-plan.sh
```

Expected: PASS — `6 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/validate-plan.sh plugins/tribe/scripts/tests/test-validate-plan.sh
git commit -m "feat(tribe): validate-plan enforces exactly one commit step per task"
```

---

### Task 3: resume-check.sh — scaffold, discovery, and state-file parsing

**Files:**
- Create: `plugins/tribe/scripts/resume-check.sh`
- Create: `plugins/tribe/scripts/tests/test-resume-check.sh`

**Interfaces:**
- Produces: `resume-check.sh [repo-root] [--roadmap FILE]` printing JSON `{repo, roadmap, checked_at, cards, orphaned_cards}`; each card has keys `card, worktree, branch, plan, state_file, milestones, last_completed_task, total_tasks, dirty, mid_merge, pushed, delivery, inconsistencies, next_action`. Python functions `sh, list_worktrees, parse_state_file, plan_checkbox_progress, trailer_progress, is_dirty, mid_merge, pushed, delivery_status, next_action` — Tasks 4–9 each replace exactly one of these with its real implementation; the main loop and `next_action` decision tree are final as written here. Test helpers `ok, bad, check, jget, git_c, new_repo, run_check, new_card_worktree, complete_task` — reused by every later scenario.
- Consumes: test helper conventions from Task 1.

- [ ] **Step 1: Write the failing test**

Create `plugins/tribe/scripts/tests/test-resume-check.sh` with exactly this content:

```bash
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
  git init -q -b master "$1"
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
```

Make it executable:

```bash
chmod +x plugins/tribe/scripts/tests/test-resume-check.sh
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: FAIL — the harness dies because `resume-check.sh` does not exist (`No such file or directory`). Non-zero exit.

- [ ] **Step 3: Write minimal implementation**

Create `plugins/tribe/scripts/resume-check.sh` with exactly this content. Functions marked "real implementation lands in Task N" are deliberate degraded defaults, each replaced by its own later task; the main loop and decision tree below are final and no later task edits them.

```bash
#!/usr/bin/env bash
# resume-check.sh — deterministic crash-resume reconciler for the tribe.
#
# After a crash (or on any re-dispatch), this script answers: which idea cards are
# in flight, how far did each REALLY get, and what is the single next action?
# It reconciles three state layers, in precedence order:
#   1. git commit trailers (Tribe-Card / Tribe-Task / Tribe-Milestone) — ground truth
#   2. plan checkboxes (the Hunter ticks its task's boxes in the same commit as the code)
#   3. the per-card state file (docs/tribe/state/CARD.md in each worktree)
# plus live signals: git status (dirty), MERGE_HEAD (died mid-merge), upstream
# comparison (pushed), and gh (PR/CI/merge — GitHub is the durable store post-push).
#
# The script computes and prints; the AGENTS act. It never mutates state.
# next_action is one of:
#   VERIFY_SHIPPED | REDO_MERGE | REVERT_AND_REDO task N | RESUME_DELIVERY | CONTINUE task N
# and for orphaned roadmap cards: RECREATE_WORKTREE from branch B | RESTART_CARD
#
# Env: RESUME_CHECK_GH overrides the gh binary (tests point it at a stub).
# Output: JSON on stdout (only). Logs go to stderr.
# Exit codes: 0 = ran successfully (regardless of findings); 2 = setup error.
#
# Usage:
#   resume-check.sh [repo-root] [--roadmap FILE]

set -euo pipefail

LOG() { printf '[resume-check] %s\n' "$*" >&2; }
DIE() { LOG "ERROR: $*"; exit 2; }

REPO_ROOT=""
ROADMAP=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --roadmap) ROADMAP="$2"; shift 2 ;;
    -h|--help) sed -n '2,24p' "$0"; exit 0 ;;
    -*)        DIE "unknown flag: $1" ;;
    *)
      if [[ -n "$REPO_ROOT" ]]; then DIE "unexpected extra argument: $1"; fi
      REPO_ROOT="$1"; shift ;;
  esac
done
REPO_ROOT="${REPO_ROOT:-$PWD}"
[[ -d "$REPO_ROOT" ]] || DIE "repo root not found: $REPO_ROOT"
git -C "$REPO_ROOT" rev-parse --git-dir >/dev/null 2>&1 || DIE "not a git repository: $REPO_ROOT"
command -v python3 >/dev/null 2>&1 || DIE "python3 is required but not on PATH"

python3 - "$REPO_ROOT" "$ROADMAP" <<'PY'
import json, os, re, shutil, subprocess, sys
from datetime import datetime, timezone

repo_root, roadmap_arg = sys.argv[1], sys.argv[2]
GH = os.environ.get("RESUME_CHECK_GH", "gh")

STATE_HEADER_RE = re.compile(r"^#\s*tribe-state:\s*(\S+)")
KV_RE = re.compile(r"^([a-z-]+):\s*(.+?)\s*$")
CHECKBOX_RE = re.compile(r"^\s*-\s*\[([ xX])\]\s*(.*)$")

def sh(args, cwd=None):
    r = subprocess.run(args, cwd=cwd, capture_output=True, text=True)
    return r.returncode, r.stdout.strip(), r.stderr.strip()

def list_worktrees(root):
    rc, out, _ = sh(["git", "-C", root, "worktree", "list", "--porcelain"])
    if rc != 0:
        return []
    wts, cur = [], None
    for line in out.splitlines():
        if line.startswith("worktree "):
            if cur:
                wts.append(cur)
            cur = {"path": line[len("worktree "):], "branch": None}
        elif line.startswith("branch ") and cur is not None:
            b = line[len("branch "):]
            cur["branch"] = b[len("refs/heads/"):] if b.startswith("refs/heads/") else b
    if cur:
        wts.append(cur)
    return wts

def parse_state_file(path):
    try:
        lines = open(path, errors="replace").read().splitlines()
    except OSError:
        return None
    if not lines:
        return None
    m = STATE_HEADER_RE.match(lines[0])
    if not m:
        return None
    fields, milestones, in_ms = {}, [], False
    for ln in lines[1:]:
        if re.match(r"^##\s*Milestones", ln):
            in_ms = True
            continue
        if in_ms:
            cb = CHECKBOX_RE.match(ln)
            if cb:
                milestones.append({"done": cb.group(1).lower() == "x",
                                   "text": cb.group(2).strip()})
        else:
            kv = KV_RE.match(ln)
            if kv:
                fields[kv.group(1)] = kv.group(2)
    return {"slug": m.group(1), "fields": fields, "milestones": milestones}

def plan_checkbox_progress(wt_path, plan_rel):
    # (prefix_done, total_tasks, plan_exists) — real implementation lands in Task 5
    return (0, 0, False)

def trailer_progress(wt_path, base_sha):
    # highest completed task number per Tribe-Task trailers — real implementation
    # lands in Task 4
    return 0

def is_dirty(wt_path):
    return False  # real implementation lands in Task 6

def mid_merge(wt_path):
    return False  # real implementation lands in Task 7

def pushed(wt_path):
    return False  # real implementation lands in Task 8

def delivery_status(wt_path):
    # one of: none | pr-open | ci-green | merged | unknown — real implementation
    # lands in Task 9
    return "unknown"

def next_action(card):
    if card["delivery"] == "merged":
        return "VERIFY_SHIPPED"
    if card["mid_merge"]:
        return "REDO_MERGE"
    if card["dirty"]:
        return f"REVERT_AND_REDO task {card['last_completed_task'] + 1}"
    if card["delivery"] in ("pr-open", "ci-green"):
        return "RESUME_DELIVERY"
    if card["total_tasks"] and card["last_completed_task"] >= card["total_tasks"]:
        return "RESUME_DELIVERY"
    return f"CONTINUE task {card['last_completed_task'] + 1}"

cards, discovered = [], set()
for wt in list_worktrees(repo_root):
    state_dir = os.path.join(wt["path"], "docs", "tribe", "state")
    if not os.path.isdir(state_dir):
        continue
    for name in sorted(os.listdir(state_dir)):
        if not name.endswith(".md"):
            continue
        state = parse_state_file(os.path.join(state_dir, name))
        if state is None:
            continue
        f = state["fields"]
        trailer_last = trailer_progress(wt["path"], f.get("base-sha"))
        cb_prefix, total, plan_exists = plan_checkbox_progress(wt["path"], f.get("plan"))
        inconsistencies = []
        if plan_exists and cb_prefix != trailer_last:
            inconsistencies.append(
                f"plan checkboxes show {cb_prefix} completed task(s) but git trailers show "
                f"{trailer_last} — git wins; correct the checkboxes before proceeding")
        card = {
            "card": state["slug"],
            "worktree": wt["path"],
            "branch": wt["branch"],
            "plan": f.get("plan"),
            "state_file": os.path.join("docs", "tribe", "state", name),
            "milestones": state["milestones"],
            "last_completed_task": trailer_last,
            "total_tasks": total,
            "dirty": is_dirty(wt["path"]),
            "mid_merge": mid_merge(wt["path"]),
            "pushed": pushed(wt["path"]),
            "delivery": delivery_status(wt["path"]),
            "inconsistencies": inconsistencies,
        }
        card["next_action"] = next_action(card)
        cards.append(card)
        discovered.add(state["slug"])

orphans = []
roadmap_path = roadmap_arg or os.path.join(repo_root, "docs", "ROADMAP.md")
IN_FLIGHT_RE = re.compile(r"in-flight:\s*(\S+)\s*(?:→|->)\s*(\S+)")
if os.path.isfile(roadmap_path):
    text = open(roadmap_path, errors="replace").read()
    for m in IN_FLIGHT_RE.finditer(text):
        slug, wt_path = m.group(1), m.group(2)
        if slug in discovered:
            continue
        rc, out, _ = sh(["git", "-C", repo_root, "for-each-ref", "refs/heads",
                         "--format=%(refname:short)"])
        found = None
        for b in out.splitlines():
            rc2, _, _ = sh(["git", "-C", repo_root, "cat-file", "-e",
                            f"{b}:docs/tribe/state/{slug}.md"])
            if rc2 == 0:
                found = b
                break
        orphans.append({
            "card": slug,
            "worktree": wt_path,
            "branch": found,
            "next_action": (f"RECREATE_WORKTREE from branch {found}"
                            if found else "RESTART_CARD"),
        })

print(json.dumps({
    "repo": repo_root,
    "roadmap": roadmap_path if os.path.isfile(roadmap_path) else None,
    "checked_at": datetime.now(timezone.utc).isoformat(),
    "cards": cards,
    "orphaned_cards": orphans,
}, indent=2, ensure_ascii=False))
PY
```

Make it executable:

```bash
chmod +x plugins/tribe/scripts/resume-check.sh
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: PASS — `5 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/resume-check.sh plugins/tribe/scripts/tests/test-resume-check.sh
git commit -m "feat(tribe): resume-check scaffold — worktree discovery and state-file parsing"
```

---

### Task 4: resume-check.sh — trailer progress (git is ground truth)

**Files:**
- Modify: `plugins/tribe/scripts/resume-check.sh` (replace the `trailer_progress` default)
- Modify: `plugins/tribe/scripts/tests/test-resume-check.sh` (append scenario before the summary footer)

**Interfaces:**
- Consumes: `complete_task` helper and card fixture from Task 3.
- Produces: real `trailer_progress(wt_path, base_sha)` — parses `Tribe-Task: n/total` trailers in `base_sha..HEAD` (whole history if the base is unusable) and returns the highest `n`, else 0.

- [ ] **Step 1: Write the failing test**

In `plugins/tribe/scripts/tests/test-resume-check.sh`, insert before the `printf '\n%d passed...'` footer:

```bash
# --- scenario: two tasks committed with trailers -> continue at task 3 ---
R3="$TMP/two"; new_repo "$R3"
WT3=$(new_card_worktree "$R3" beta)
complete_task "$WT3" beta 1 3
complete_task "$WT3" beta 2 3
run_check "$TMP/out3.json" "$R3"
check "trailers count completed tasks" "$(jget "$TMP/out3.json" cards.0.last_completed_task)" "2"
check "mid-plan card continues at next task" "$(jget "$TMP/out3.json" cards.0.next_action)" "CONTINUE task 3"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: FAIL — `trailers count completed tasks (got: 0, want: 2)` and the next_action assertion failing with `CONTINUE task 1`. Exit 1.

- [ ] **Step 3: Write minimal implementation**

In `plugins/tribe/scripts/resume-check.sh`, replace the whole `trailer_progress` function with:

```python
def trailer_progress(wt_path, base_sha):
    # Highest completed task number per Tribe-Task trailers in base..HEAD.
    # A bad/missing base degrades deterministically to scanning the whole history.
    fmt = "--format=%(trailers:key=Tribe-Task,valueonly,separator=,)"
    rng = f"{base_sha}..HEAD" if base_sha else "HEAD"
    rc, out, _ = sh(["git", "-C", wt_path, "log", fmt, rng])
    if rc != 0:
        rc, out, _ = sh(["git", "-C", wt_path, "log", fmt, "HEAD"])
        if rc != 0:
            return 0
    last = 0
    for line in out.splitlines():
        for val in line.split(","):
            m = re.match(r"\s*(\d+)\s*/\s*\d+", val)
            if m:
                last = max(last, int(m.group(1)))
    return last
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh && bash plugins/tribe/scripts/tests/test-validate-plan.sh
```

Expected: PASS — `7 passed, 0 failed` for resume-check and `6 passed, 0 failed` for validate-plan, exit 0 both.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/resume-check.sh plugins/tribe/scripts/tests/test-resume-check.sh
git commit -m "feat(tribe): resume-check reads task progress from Tribe-Task trailers"
```

---

### Task 5: resume-check.sh — checkbox progress and layer reconciliation

**Files:**
- Modify: `plugins/tribe/scripts/resume-check.sh` (replace the `plan_checkbox_progress` default)
- Modify: `plugins/tribe/scripts/tests/test-resume-check.sh` (append scenarios before the summary footer)

**Interfaces:**
- Consumes: fixtures from Tasks 3–4; the inconsistency wiring already in the main loop.
- Produces: real `plan_checkbox_progress(wt_path, plan_rel)` returning `(prefix_done, total_tasks, plan_exists)` — `prefix_done` counts leading contiguous tasks whose checkboxes are all ticked; enables the all-tasks-done RESUME_DELIVERY branch and the checkbox-vs-trailer inconsistency report.

- [ ] **Step 1: Write the failing test**

In `plugins/tribe/scripts/tests/test-resume-check.sh`, insert before the summary footer:

```bash
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: FAIL — `plan total counted (got: 0, want: 3)`, `inconsistency is reported (got: 0, want: 1)`, and `all tasks done moves to delivery (got: CONTINUE task 4, want: RESUME_DELIVERY)`. Exit 1.

- [ ] **Step 3: Write minimal implementation**

In `plugins/tribe/scripts/resume-check.sh`, replace the whole `plan_checkbox_progress` function with:

```python
def plan_checkbox_progress(wt_path, plan_rel):
    # (prefix_done, total_tasks, plan_exists). prefix_done counts leading contiguous
    # tasks whose checkboxes are all ticked — tasks execute in order, so a gap means
    # the later tick is unreliable and the trailer layer decides.
    if not plan_rel:
        return (0, 0, False)
    try:
        lines = open(os.path.join(wt_path, plan_rel), errors="replace").read().splitlines()
    except OSError:
        return (0, 0, False)
    tasks, cur = [], None
    for ln in lines:
        m = re.match(r"^#{1,6}\s*Task\s+(\d+)\b", ln, re.IGNORECASE)
        if m:
            cur = {"n": int(m.group(1)), "boxes": []}
            tasks.append(cur)
            continue
        if cur is not None:
            cb = CHECKBOX_RE.match(ln)
            if cb:
                cur["boxes"].append(cb.group(1).lower() == "x")
    tasks.sort(key=lambda t: t["n"])
    prefix = 0
    for t in tasks:
        if t["boxes"] and all(t["boxes"]):
            prefix += 1
        else:
            break
    return (prefix, len(tasks), True)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: PASS — `13 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/resume-check.sh plugins/tribe/scripts/tests/test-resume-check.sh
git commit -m "feat(tribe): resume-check reconciles plan checkboxes against trailers, git wins"
```

---

### Task 6: resume-check.sh — dirty worktree means revert and redo

**Files:**
- Modify: `plugins/tribe/scripts/resume-check.sh` (replace the `is_dirty` default)
- Modify: `plugins/tribe/scripts/tests/test-resume-check.sh` (append scenario before the summary footer)

**Interfaces:**
- Consumes: `$R3`/`$WT3` fixture (beta card, 2 of 3 tasks done) from Task 4.
- Produces: real `is_dirty(wt_path)` — true when `git status --porcelain` reports anything, tracked or untracked; drives the `REVERT_AND_REDO task N` verdict.

- [ ] **Step 1: Write the failing test**

In `plugins/tribe/scripts/tests/test-resume-check.sh`, insert before the summary footer:

```bash
# --- scenario: uncommitted leftovers -> revert and redo the in-flight task ---
echo "half-finished work" >> "$WT3/src.txt"
echo "brand new file" > "$WT3/new.txt"
run_check "$TMP/out7.json" "$R3"
check "dirt is detected" "$(jget "$TMP/out7.json" cards.0.dirty)" "true"
check "dirty worktree reverts and redoes" "$(jget "$TMP/out7.json" cards.0.next_action)" "REVERT_AND_REDO task 3"
git_c "$WT3" checkout -q -- . && rm -f "$WT3/new.txt"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: FAIL — `dirt is detected (got: false, want: true)` and `dirty worktree reverts and redoes (got: CONTINUE task 3, want: REVERT_AND_REDO task 3)`. Exit 1.

- [ ] **Step 3: Write minimal implementation**

In `plugins/tribe/scripts/resume-check.sh`, replace the whole `is_dirty` function with:

```python
def is_dirty(wt_path):
    # Anything uncommitted — modified OR untracked — is dirt. Untracked files count
    # because a Hunter's first move is often a brand-new test file.
    rc, out, _ = sh(["git", "-C", wt_path, "status", "--porcelain"])
    return rc == 0 and bool(out)
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: PASS — `15 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/resume-check.sh plugins/tribe/scripts/tests/test-resume-check.sh
git commit -m "feat(tribe): resume-check flags dirty worktrees for revert-and-redo"
```

---

### Task 7: resume-check.sh — crashed mid-merge means redo the merge

**Files:**
- Modify: `plugins/tribe/scripts/resume-check.sh` (replace the `mid_merge` default)
- Modify: `plugins/tribe/scripts/tests/test-resume-check.sh` (append scenario before the summary footer)

**Interfaces:**
- Consumes: `new_card_worktree` helper.
- Produces: real `mid_merge(wt_path)` — true when `MERGE_HEAD` exists; drives the `REDO_MERGE` verdict, which outranks `dirty` in the decision tree (a conflicted merge is also dirty, and the merge is the thing to redo). The wave number comes from the state file's first unticked wave milestone — the agent reads it there; the script's verdict stays `REDO_MERGE`.

- [ ] **Step 1: Write the failing test**

In `plugins/tribe/scripts/tests/test-resume-check.sh`, insert before the summary footer:

```bash
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: FAIL — `merge fixture really conflicted` passes, then `mid-merge is detected (got: false, want: true)` and `mid-merge outranks dirt (got: REVERT_AND_REDO task 2, want: REDO_MERGE)` fail. Exit 1.

- [ ] **Step 3: Write minimal implementation**

In `plugins/tribe/scripts/resume-check.sh`, replace the whole `mid_merge` function with:

```python
def mid_merge(wt_path):
    rc, _, _ = sh(["git", "-C", wt_path, "rev-parse", "-q", "--verify", "MERGE_HEAD"])
    return rc == 0
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: PASS — `18 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/resume-check.sh plugins/tribe/scripts/tests/test-resume-check.sh
git commit -m "feat(tribe): resume-check detects crashed mid-merge state"
```

---

### Task 8: resume-check.sh — pushed detection via upstream comparison

**Files:**
- Modify: `plugins/tribe/scripts/resume-check.sh` (replace the `pushed` default)
- Modify: `plugins/tribe/scripts/tests/test-resume-check.sh` (append scenario before the summary footer)

**Interfaces:**
- Consumes: `$R6`/`$WT6` fixture (delta card, all 3 tasks done) from Task 5.
- Produces: real `pushed(wt_path)` — true when an upstream exists and holds every local commit (`rev-list @{u}..HEAD` count is 0). Informational in the JSON: per the spec there is deliberately no `pushed` checkbox in the state file — git derives it.

- [ ] **Step 1: Write the failing test**

In `plugins/tribe/scripts/tests/test-resume-check.sh`, insert before the summary footer:

```bash
# --- scenario: branch pushed to a local bare remote -> pushed true, derived not recorded ---
BARE="$TMP/origin.git"
git init -q --bare "$BARE"
git_c "$WT6" remote add origin "$BARE"
git_c "$WT6" push -qu origin wt-delta
run_check "$TMP/out9.json" "$R6"
check "pushed is derived from upstream" "$(jget "$TMP/out9.json" cards.0.pushed)" "true"
git_c "$WT6" commit --allow-empty -qm "local only" -m "Tribe-Card: delta" -m "Tribe-Milestone: local probe"
run_check "$TMP/out10.json" "$R6"
check "unpushed commit flips pushed off" "$(jget "$TMP/out10.json" cards.0.pushed)" "false"
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: FAIL — `pushed is derived from upstream (got: false, want: true)`; the second assertion passes by coincidence of the default. Exit 1.

- [ ] **Step 3: Write minimal implementation**

In `plugins/tribe/scripts/resume-check.sh`, replace the whole `pushed` function with:

```python
def pushed(wt_path):
    rc, _, _ = sh(["git", "-C", wt_path, "rev-parse", "--abbrev-ref",
                   "--symbolic-full-name", "@{u}"])
    if rc != 0:
        return False
    rc, out, _ = sh(["git", "-C", wt_path, "rev-list", "@{u}..HEAD", "--count"])
    return rc == 0 and out == "0"
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: PASS — `20 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/resume-check.sh plugins/tribe/scripts/tests/test-resume-check.sh
git commit -m "feat(tribe): resume-check derives pushed state from upstream, never from files"
```

---

### Task 9: resume-check.sh — delivery phase from gh (GitHub is the durable store)

**Files:**
- Modify: `plugins/tribe/scripts/resume-check.sh` (replace the `delivery_status` default)
- Modify: `plugins/tribe/scripts/tests/test-resume-check.sh` (append scenarios before the summary footer)

**Interfaces:**
- Consumes: `$R6` fixture; the `RESUME_CHECK_GH` env override already read by the script (`GH` variable).
- Produces: real `delivery_status(wt_path)` — `merged` / `ci-green` / `pr-open` / `none` / `unknown`; `merged` drives `VERIFY_SHIPPED`, `pr-open`/`ci-green` drive `RESUME_DELIVERY`, and a missing/failing `gh` degrades loudly to `unknown` (the spec's offline rule), never blocking local verdicts.

- [ ] **Step 1: Write the failing test**

In `plugins/tribe/scripts/tests/test-resume-check.sh`, insert before the summary footer:

```bash
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
```

- [ ] **Step 2: Run test to verify it fails**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: FAIL — `merged PR means verify shipped (got: RESUME_DELIVERY, want: VERIFY_SHIPPED)` and `no PR reads as none (got: unknown, want: none)`; the missing-gh assertion passes by coincidence of the default. Exit 1.

- [ ] **Step 3: Write minimal implementation**

In `plugins/tribe/scripts/resume-check.sh`, replace the whole `delivery_status` function with:

```python
def delivery_status(wt_path):
    # GitHub owns post-push state (the spec keeps PR/CI/merge OUT of the state file —
    # committing ticks after the PR opens would retrigger CI). Probe it live; degrade
    # loudly to "unknown" when gh is unavailable so local verdicts still work offline.
    gh_bin = shutil.which(GH) or (GH if os.access(GH, os.X_OK) else None)
    if not gh_bin:
        return "unknown"
    r = subprocess.run([gh_bin, "pr", "view", "--json", "state,statusCheckRollup"],
                       cwd=wt_path, capture_output=True, text=True)
    if r.returncode != 0:
        return "none" if "no pull request" in (r.stderr or "").lower() else "unknown"
    try:
        data = json.loads(r.stdout)
    except ValueError:
        return "unknown"
    state = (data.get("state") or "").upper()
    if state == "MERGED":
        return "merged"
    if state == "OPEN":
        rollup = data.get("statusCheckRollup") or []
        if rollup and all(((c.get("conclusion") or c.get("state") or "")).upper()
                          in ("SUCCESS", "NEUTRAL", "SKIPPED") for c in rollup):
            return "ci-green"
        return "pr-open"
    return "unknown"
```

- [ ] **Step 4: Run test to verify it passes**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: PASS — `23 passed, 0 failed`, exit 0. (On machines with a real `gh` installed, earlier scenarios keep passing: fixture repos have no GitHub remote, so `gh` errors and delivery reads `unknown`, which no earlier assertion pins.)

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/resume-check.sh plugins/tribe/scripts/tests/test-resume-check.sh
git commit -m "feat(tribe): resume-check derives delivery phase live from gh"
```

---

### Task 10: resume-check.sh — orphaned roadmap cards (destroyed worktrees)

**Files:**
- Modify: `plugins/tribe/scripts/tests/test-resume-check.sh` (append scenario before the summary footer)
- Modify: `plugins/tribe/scripts/resume-check.sh` (only if the scenario exposes a defect; the orphan loop shipped in Task 3's scaffold)

**Interfaces:**
- Consumes: the `--roadmap` default path and orphan loop from Task 3; `new_card_worktree` helper.
- Produces: verified orphan behavior — a roadmap `in-flight:` marker whose card has no live worktree yields `RECREATE_WORKTREE from branch B` when some branch still carries the card's state file, else `RESTART_CARD`; live cards never appear as orphans.

- [ ] **Step 1: Write the failing test**

In `plugins/tribe/scripts/tests/test-resume-check.sh`, insert before the summary footer:

```bash
# --- scenario: roadmap says in-flight but the worktree is gone ---
R14="$TMP/orphan"; new_repo "$R14"
WT14=$(new_card_worktree "$R14" phantom)
git_c "$R14" worktree remove --force "$WT14"
mkdir -p "$R14/docs"
cat > "$R14/docs/ROADMAP.md" <<EOF
# Roadmap
in-flight: phantom -> $WT14
in-flight: ghost -> $TMP/never-existed
EOF
run_check "$TMP/out14.json" "$R14"
check "no live cards remain" "$(jget "$TMP/out14.json" cards)" "[]"
check "branch survivor is recreatable" "$(jget "$TMP/out14.json" orphaned_cards.0.next_action)" "RECREATE_WORKTREE from branch wt-phantom"
check "unknown card restarts" "$(jget "$TMP/out14.json" orphaned_cards.1.next_action)" "RESTART_CARD"

# --- scenario: live cards are not double-reported as orphans ---
mkdir -p "$R3/docs"
printf 'in-flight: beta -> %s\n' "$WT3" > "$R3/docs/ROADMAP.md"
run_check "$TMP/out15.json" "$R3"
check "live card is not an orphan" "$(jget "$TMP/out15.json" orphaned_cards)" "[]"
```

- [ ] **Step 2: Run test to verify it fails or passes honestly**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: PASS (`27 passed, 0 failed`) if the Task 3 scaffold's orphan loop is correct — this task is the verification that untested loop was owed. Any `not ok` line is a real defect: fix it in `resume-check.sh` (the orphan block is the last python section) and re-run until `27 passed, 0 failed`.

- [ ] **Step 3: Run the full suite**

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh && bash plugins/tribe/scripts/tests/test-validate-plan.sh
```

Expected: PASS — `27 passed, 0 failed` and `6 passed, 0 failed`, exit 0 both.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/scripts/tests/test-resume-check.sh plugins/tribe/scripts/resume-check.sh
git commit -m "test(tribe): resume-check orphan scenarios — recreate from branch or restart"
```

---

### Task 11: warchief.md — crash-safe state contract

**Files:**
- Modify: `plugins/tribe/agents/warchief.md`

**Interfaces:**
- Consumes: resume-check.sh verdict vocabulary from Tasks 3–10; state-file format from Task 3's fixtures (identical shape).
- Produces: the Warchief-facing rules that Tasks 12–13 reference (state file, trailers, tick-in-same-commit, revert-and-redo, verdict handling).

- [ ] **Step 1: Verify the section is absent**

```bash
grep -c "Crash-safe state" plugins/tribe/agents/warchief.md || true
```

Expected: `0` — the section does not exist yet.

- [ ] **Step 2: Insert the new section and wire the method steps**

Four edits in `plugins/tribe/agents/warchief.md`.

1. Immediately BEFORE the line `## The Warchief → Hunter dispatch contract (non-negotiable)`, insert:

````markdown
## Crash-safe state & resume (non-negotiable)

The report file above is a heartbeat for *liveness*; committed state is the memory for
*resume*. The rule that makes resume trivial: **work and its done-record land in the SAME
git commit**, so a crash can never separate them — and anything uncommitted is *defined*
as never having happened.

- **Create the state file at intake.** `docs/tribe/state/CARD-SLUG.md` in your worktree,
  committed before spec work starts, in this exact shape (resume-check.sh parses it —
  replace the capitalized tokens, keep the field names):

  ```markdown
  # tribe-state: CARD-SLUG
  roadmap: ROADMAP-PATH
  worktree: ABSOLUTE-WORKTREE-PATH
  branch: BRANCH-NAME
  report: REPORT-FILE-PATH
  base-sha: SHA
  plan: PLAN-PATH-RELATIVE-TO-WORKTREE

  ## Milestones
  - [ ] spec committed
  - [ ] plan committed
  - [ ] wave 1 integrated
  ```

  Re-record `base-sha` in the same commit as each wave integration (step 5 already
  re-records it operationally — the state file is where it persists).
- **Tick milestones atomically.** Each milestone tick lands in the same commit as its
  artifact: the spec commit also ticks `spec committed`; a wave's merge commit ticks its
  wave. A milestone with no natural artifact commit gets a tiny state-only commit — more,
  smaller commits are the accepted cost.
- **No post-push milestones in the state file.** Once the PR is open, never commit
  state-file ticks to the branch (it would retrigger CI). GitHub is the durable store for
  PR/CI/merge state; resume-check.sh derives it live via `gh`.
- **Trailers on every commit.** Every commit you or your Hunters make carries
  `Tribe-Card: CARD-SLUG`, plus `Tribe-Task: N/TOTAL` on task commits or
  `Tribe-Milestone: NAME` on your milestone commits. **Git history is ground truth**:
  when any file disagrees with the trailers, the trailers win and you correct the file
  before proceeding.
- **Resume protocol.** When your dispatch says you are resuming (or you inherit a saved
  worktree), run `resume-check.sh REPO-ROOT` — resolve its path exactly as you resolve
  `heartbeat-check.sh` in Channels above, and stop with `NEEDS_DIRECTION` if neither
  install path yields it — and obey its `next_action` verbatim:
  - `REVERT_AND_REDO task N` — the worktree is dirty. Run `git reset --hard` plus
    `git clean -fd` for untracked leftovers, then dispatch task N to a fresh Hunter.
    **Never inspect-and-continue** — salvaging half-done work is forbidden; the plan's
    single-unit task sizing exists precisely so this redo is cheap.
  - `REDO_MERGE` — you died mid-wave-merge: `git merge --abort`, then redo the wave
    merge per step 5 (the wave is the state file's first unticked wave milestone).
  - `CONTINUE task N` — tasks before N are done and committed; do not re-dispatch them.
  - `RESUME_DELIVERY` — re-enter step 7 (push / PR / CI watch) from wherever `gh` says
    delivery actually is.
  - `VERIFY_SHIPPED` — the PR already merged; skip to step 8 and close out.
  Never re-derive progress from prose, memory, or the report file — the script's
  reconciliation of trailers, checkboxes, and state file is the single source of resume
  truth (the report file stays what it is: a liveness heartbeat).

````

2. In Method step 1, after the `**Start the heartbeat now:**` bullet, add:

```markdown
- **Create and commit the state file now, too** (see Crash-safe state & resume above) —
  and if your dispatch points you at a saved worktree, run `resume-check.sh` FIRST and
  obey its `next_action` before doing anything else.
```

3. In Method step 3, after the sentence `Each task ends in an independently testable, committable deliverable.`, add:

```markdown
**Every task is a single unit of work** — one red→green→refactor→commit cycle ending in
exactly ONE commit step. `validate-plan.sh` fails oversized tasks mechanically. Small
tasks are the crash-safety budget: a task that dies mid-flight is always discarded
(`git reset --hard`) and redone, so its size caps the maximum redo cost.
```

4. In Method step 5, in the first bullet after `and the report-file path.`, add:

```markdown
Every brief also carries the atomic-commit rules verbatim: tick your task's plan
checkboxes in the SAME commit as the code, and stamp the commit with the
`Tribe-Card` and `Tribe-Task: N/TOTAL` trailers — a task commit missing either fails
the audit.
```

- [ ] **Step 3: Verify the wiring**

```bash
grep -c "Crash-safe state" plugins/tribe/agents/warchief.md
grep -c "REVERT_AND_REDO" plugins/tribe/agents/warchief.md
grep -c "single unit of work" plugins/tribe/agents/warchief.md
grep -c "Tribe-Task" plugins/tribe/agents/warchief.md
```

Expected: first `2` (heading + step-1 cross-reference), the rest all `1` or more. None zero.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/warchief.md
git commit -m "feat(tribe): warchief contract — atomic state file, trailers, resume protocol"
```

---

### Task 12: hunter.md — tick checkboxes and trailers in the task commit

**Files:**
- Modify: `plugins/tribe/agents/hunter.md`

**Interfaces:**
- Consumes: trailer names and tick rule from Task 11.
- Produces: the Hunter-side half of the atomic-commit contract that Task 14's eval asserts.

- [ ] **Step 1: Verify the rules are absent**

```bash
grep -c "Tribe-Task" plugins/tribe/agents/hunter.md || true
```

Expected: `0`.

- [ ] **Step 2: Amend the Method's commit step and the anti-goals**

Two edits in `plugins/tribe/agents/hunter.md`:

1. Replace Method step 7 (the `7. **Commit** with the message the brief specifies...` item) with:

```markdown
7. **Commit — one commit that carries the work AND its done-record.** In the SAME commit:
   the code, the test, and your task's ticked checkboxes in the plan file (flip each of
   your task's `- [ ]` to `- [x]` — only your task's). Stamp the commit message with the
   trailers the brief names — `Tribe-Card` and `Tribe-Task: N/TOTAL` — as separate
   trailing paragraphs, e.g. `git commit -m "msg" -m "Tribe-Card: widget-export" -m
   "Tribe-Task: 3/7"`. This is the tribe's crash-safety invariant: a crash can never
   separate the work from the record that it happened, and anything uncommitted is
   treated as never having existed. Use the message the brief specifies (or a clear,
   conventional one). Do **not** add a co-authored trailer. Do not push, open a PR, or
   merge — that is the Warchief's.
```

2. In the Anti-goals section, after item 5 (`**No silent green.**` ...), add:

```markdown
6. **No recordless done.** A task commit that doesn't tick your task's plan checkboxes,
   or is missing the `Tribe-Card`/`Tribe-Task` trailers, fails the Warchief's audit —
   the done-record travels inside the commit, never after it.
```

- [ ] **Step 3: Verify the wiring**

```bash
grep -c "Tribe-Task" plugins/tribe/agents/hunter.md
grep -c "No recordless done" plugins/tribe/agents/hunter.md
```

Expected: first `2` or more, second `1`.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/hunter.md
git commit -m "feat(tribe): hunter contract — checkbox ticks and trailers in the task commit"
```

---

### Task 13: shaman.md — resume-first campaign loop and in-flight markers

**Files:**
- Modify: `plugins/tribe/agents/shaman.md`

**Interfaces:**
- Consumes: resume-check.sh JSON and orphan verdicts from Tasks 3–10.
- Produces: the campaign-level resume entry point (the fresh-session behavior the whole design exists for).

- [ ] **Step 1: Verify the rules are absent**

```bash
grep -c "resume-check" plugins/tribe/agents/shaman.md || true
```

Expected: `0`.

- [ ] **Step 2: Amend Mode 2**

Two edits in `plugins/tribe/agents/shaman.md`:

1. In Mode 2, immediately after the line `The owner has approved the roadmap and set the batch. Now you are the master running delivery:`, insert:

```markdown
0. **Resume before you pick.** Run `resume-check.sh REPO-ROOT` first — resolve its path
   exactly as you resolve `heartbeat-check.sh` under Channels & liveness — every time
   you start or restart a campaign (a fresh session after a crash is the norm, not the
   exception). Any card it reports in flight resumes BEFORE any new card is picked:
   re-dispatch a Warchief pointed at that card's saved worktree, state file, and the
   script's JSON for it (the Warchief obeys the `next_action` itself). An
   `orphaned_cards` entry with `RECREATE_WORKTREE from branch B` means the branch
   survived the crash — the re-dispatched Warchief recreates its worktree from that
   branch; `RESTART_CARD` means nothing committed ever existed, so the card restarts
   from dispatch. Reading this JSON is operational diagnostics, not grading the How.
```

2. In the Mode 2 `**Dispatch**` step (item 2), after `Track the batch (a todo per card).`, add:

```markdown
   The moment you dispatch, record `in-flight: CARD-SLUG -> WORKTREE-PATH` in the
   roadmap next to the card, and remove that marker when the card is verified-SHIPPED
   or explicitly parked — this marker is how a fresh session finds the campaign even if
   the worktree was destroyed with the machine.
```

- [ ] **Step 3: Verify the wiring**

```bash
grep -c "resume-check" plugins/tribe/agents/shaman.md
grep -c "in-flight:" plugins/tribe/agents/shaman.md
```

Expected: both `1` or more.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/shaman.md
git commit -m "feat(tribe): shaman contract — resume-first Mode 2 and roadmap in-flight markers"
```

---

### Task 14: evals — atomic-commit and revert-policy scenarios

**Files:**
- Modify: `plugins/tribe/evals/evals.json`

**Interfaces:**
- Consumes: contract language from Tasks 11–12 (the evals assert agents follow it).
- Produces: evals 8 and 9 in the existing schema (`id, name, agent, prompt, expected_output, files`).

- [ ] **Step 1: Verify current eval count**

```bash
python3 -c "import json; print(len(json.load(open('plugins/tribe/evals/evals.json'))['evals']))"
```

Expected: `7`.

- [ ] **Step 2: Append the two evals**

In `plugins/tribe/evals/evals.json`, after the object with `"id": 7`, append these two objects to the `evals` array:

```json
{
  "id": 8,
  "name": "hunter-ticks-checkboxes-and-trailers-in-the-task-commit",
  "agent": "hunter",
  "prompt": "Your task brief: 'Task 3 of 7 from docs/superpowers/plans/2026-07-11-widget.md, card slug widget-export. Add a formatBytes(n) helper in src/format.js with test test_formatBytes_rounds_to_one_decimal.' The brief includes the tribe's atomic-commit rules: tick your task's plan checkboxes in the same commit as the code, and stamp the commit with Tribe-Card and Tribe-Task trailers. You have finished the code and the test is green. Describe exactly what your commit contains and what its message looks like.",
  "expected_output": "Hunter produces ONE commit containing the implementation, the test, AND the plan file with task 3's checkboxes flipped to [x] (only task 3's). The commit message carries the trailers Tribe-Card: widget-export and Tribe-Task: 3/7 as trailing paragraphs, with no co-authored trailer. It does NOT commit the code first and tick the checkboxes in a follow-up commit, does not tick other tasks' boxes, and does not omit the trailers — a task commit missing the ticks or trailers fails the Warchief's audit per the contract.",
  "files": []
},
{
  "id": 9,
  "name": "warchief-reverts-dirty-worktree-instead-of-salvaging",
  "agent": "warchief",
  "prompt": "You are a re-dispatched Warchief resuming after a machine crash. resume-check.sh reports for card checkout-retry: last_completed_task 3, total_tasks 5, dirty true, next_action 'REVERT_AND_REDO task 4'. Looking at the worktree, task 4's diff appears roughly 90% complete and its test file looks nearly right — finishing it by hand would take two minutes. What do you do?",
  "expected_output": "Warchief runs git reset --hard (plus git clean -fd for untracked leftovers) and dispatches task 4 to a fresh Hunter from its brief. It does NOT inspect-and-continue, complete the diff itself (it never writes feature source), or commit the salvaged state — uncommitted work is defined as never having happened, and the single-unit task sizing exists precisely so the redo is cheap. Tasks 1-3 are committed and are NOT redone.",
  "files": []
}
```

- [ ] **Step 3: Validate the JSON**

```bash
python3 -c "
import json
d = json.load(open('plugins/tribe/evals/evals.json'))
assert len(d['evals']) == 9, len(d['evals'])
assert [e['id'] for e in d['evals']] == list(range(1, 10))
assert all(set(e) == {'id','name','agent','prompt','expected_output','files'} for e in d['evals'])
print('evals ok')
"
```

Expected: `evals ok`.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/evals/evals.json
git commit -m "test(tribe): evals for atomic task commits and revert-and-redo resume"
```

---

### Task 15: Dogfood gate — full suites plus this plan through the new validator

**Files:**
- Modify: none expected; fix whatever the gate exposes (any file above), else no changes.

**Interfaces:**
- Consumes: everything above.
- Produces: mechanical proof the whole branch holds together — including this plan itself passing the sizing rule it introduces.

- [ ] **Step 1: Run every test suite**

```bash
bash plugins/tribe/scripts/tests/test-validate-plan.sh && bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: PASS — `6 passed, 0 failed` and `27 passed, 0 failed`, exit 0 both.

- [ ] **Step 2: Validate this very plan with the upgraded validator**

```bash
bash plugins/tribe/scripts/validate-plan.sh docs/superpowers/plans/2026-07-11-tribe-atomic-resume.md
```

Expected: JSON with `"verdict": "pass"` — 15 task sections, `no_placeholders` pass (every angle token and quoted heading in this plan sits inside a fence), and `tasks_single_commit_step` pass (every task ends in exactly one Commit step). A `fail` verdict here is a real defect in either the plan or the new checks: read the failing check's `detail`, fix the offending file, and re-run until the verdict is `pass`.

- [ ] **Step 3: Smoke-run resume-check against this repo**

```bash
bash plugins/tribe/scripts/resume-check.sh "$(git rev-parse --show-toplevel)"
```

Expected: valid JSON on stdout, exit 0. `cards` may be empty (this repo has no `docs/tribe/state/` directory yet) — the point is a clean run on a real repository.

- [ ] **Step 4: Commit**

```bash
git add -A
git diff --cached --quiet && echo "gate clean — nothing to commit" || git commit -m "chore(tribe): dogfood gate fixes"
```

Expected: either `gate clean — nothing to commit`, or one commit containing only genuine gate fixes.

---

## Self-review notes

- **Spec coverage:** state file (Tasks 3, 11), checkboxes (5, 12), trailers (4, 11–12), reconciler + all five verdicts (3–10), orphan/`RESTART_CARD`/`RECREATE_WORKTREE` edge rows (10, 13), dirty policy (6, 11, eval 9), single-unit sizing + validator (2, 11), fence-handling prerequisite fix (1), resume entry point (13), delivery-from-GitHub boundary (9, 11), tests (1–10, 15), evals (14). The spec's `REDO_MERGE wave N` verdict is implemented as plain `REDO_MERGE` — the wave number lives in the state file's first unticked wave milestone, where the acting Warchief reads it; noted in Task 7's interface block.
- **Type consistency:** verdict strings, trailer keys, state-file field names, and JSON card keys are identical across script, tests, contracts, and evals (single vocabulary defined in Task 3's interface block).
- **Placeholder scan:** all angle-bracket-like tokens and quoted plan structure sit inside fenced code blocks (nested fences use longer outer fences, which Task 1 teaches the validator to parse); every task carries code fences, an Expected line, and exactly one Commit step.
