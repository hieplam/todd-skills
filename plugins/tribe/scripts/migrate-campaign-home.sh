#!/usr/bin/env bash
# migrate-campaign-home.sh — one-shot: move committed .claude/state/<slug>/reports/*.md
# worker reports into the per-repo campaign home (~/.tribe/<key>/campaigns/<slug>/reports).
# Idempotent; refuses to touch a campaign whose .runner.lock holds a live pid.
# Never re-derives the ~/.tribe key itself — always via tribe-home.sh (W1).
#
# The reports this moves were COMMITTED, so moving the files alone leaves the index
# claiming they still exist — a working tree full of unexplained deletions that the
# next `git status` reader has to reverse-engineer. Sibling migrate-state.sh already
# closes that loop (`git rm -r --cached` + the commit to run); this does the same.
# Does not commit — a migration decides where files live, never what lands in history.
set -euo pipefail

usage() {
  echo "usage: migrate-campaign-home.sh <repo> [--campaign <slug>] [--dry-run]" >&2
  exit 1
}

REPO=""
CAMPAIGN=""
DRY_RUN=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --campaign) CAMPAIGN="${2:-}"; shift 2 ;;
    --dry-run) DRY_RUN=1; shift ;;
    -h|--help) usage ;;
    -*) usage ;;
    *) if [[ -z "$REPO" ]]; then REPO="$1"; shift; else usage; fi ;;
  esac
done

[[ -n "$REPO" ]] || usage

DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$("$DIR/tribe-home.sh" "$REPO")"

STATE_ROOT="$REPO/.claude/state"

failed=0
touched_campaigns=()
detracked_campaigns=()

is_pid_alive() {
  local pid="$1"
  [[ -n "$pid" ]] || return 1
  kill -0 "$pid" 2>/dev/null
}

# Refuse a slug if any .runner.lock under the repo whose path contains
# "/<slug>/" holds a live pid.
slug_is_live_locked() {
  local slug="$1" lock pid
  while IFS= read -r lock; do
    [[ -e "$lock" ]] || continue
    pid="$(grep -o '"pid":[0-9]*' "$lock" 2>/dev/null | grep -o '[0-9]*' | head -n1)"
    if is_pid_alive "$pid"; then
      return 0
    fi
  done < <(find "$REPO" -type f -name '.runner.lock' -path "*/$slug/*" 2>/dev/null)
  return 1
}

[[ -d "$STATE_ROOT" ]] || { echo "migrate-campaign-home: nothing to migrate, no $STATE_ROOT"; exit 0; }

for slugdir in "$STATE_ROOT"/*/; do
  [[ -d "$slugdir" ]] || continue
  slug="$(basename "$slugdir")"

  if [[ -n "$CAMPAIGN" && "$slug" != "$CAMPAIGN" ]]; then
    continue
  fi

  reports_src="$STATE_ROOT/$slug/reports"
  [[ -d "$reports_src" ]] || continue

  if slug_is_live_locked "$slug"; then
    echo "migrate-campaign-home: refusing $slug — .runner.lock is held by a live pid"
    failed=1
    continue
  fi

  reports_dest="$HOME_DIR/campaigns/$slug/reports"
  slug_had_conflict=0

  for f in "$reports_src"/*.md; do
    [[ -e "$f" ]] || continue
    fname="$(basename "$f")"
    dest="$reports_dest/$fname"

    if [[ -e "$dest" ]]; then
      echo "CONFLICT: $slug/$fname already exists at $dest — not migrated"
      failed=1
      slug_had_conflict=1
      continue
    fi

    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "would move: $f -> $dest"
    else
      mkdir -p "$reports_dest"
      mv "$f" "$dest"
      echo "moved: $f -> $dest"
    fi
  done

  touched_campaigns+=("$slug")

  if [[ "$DRY_RUN" -ne 1 && "$slug_had_conflict" -eq 0 ]]; then
    # Index still lists the moved reports; drop them so it matches the disk.
    # --cached only: the files are already gone from the worktree, and a plain
    # `git rm` would fail on the missing paths. A conflicted slug keeps its
    # tracking — some of its files are still on disk and still belong to git.
    if git -C "$REPO" ls-files --error-unmatch ".claude/state/$slug/reports" >/dev/null 2>&1; then
      git -C "$REPO" rm -r --cached -q ".claude/state/$slug/reports"
      detracked_campaigns+=("$slug")
    fi
    rmdir "$reports_src" 2>/dev/null || true
    rmdir "$STATE_ROOT/$slug" 2>/dev/null || true
  fi
done

echo "migrate-campaign-home: summary — campaigns touched: ${touched_campaigns[*]:-none}"
echo "migrate-campaign-home: reminder — old session logs were caller-chosen (--logs-dir) and are NOT auto-migrated; move them by hand if wanted"

if [[ "${#detracked_campaigns[@]}" -gt 0 ]]; then
  echo "migrate-campaign-home: un-tracked from git: ${detracked_campaigns[*]}"
  echo "next: git -C '$REPO' commit -m 'chore(tribe): stop tracking campaign reports (moved to ~/.tribe)'"
fi

exit "$failed"
