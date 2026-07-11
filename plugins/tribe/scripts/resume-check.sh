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
    --roadmap) [[ $# -ge 2 ]] || DIE "missing value for --roadmap"; ROADMAP="$2"; shift 2 ;;
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

def is_dirty(wt_path):
    # Anything uncommitted — modified OR untracked — is dirt. Untracked files count
    # because a Hunter's first move is often a brand-new test file.
    rc, out, _ = sh(["git", "-C", wt_path, "status", "--porcelain"])
    return rc == 0 and bool(out)

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
