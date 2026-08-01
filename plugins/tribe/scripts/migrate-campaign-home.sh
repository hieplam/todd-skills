#!/usr/bin/env bash
# migrate-campaign-home.sh — one-shot: move committed campaign operational files into the
# per-repo campaign home (~/.tribe/<key>/campaigns/<slug>/). Two file sets, moved separately:
#   - .claude/state/<slug>/reports/*.md              (worker reports)      -> <home>/reports/
#   - docs/tribe/planning/<slug>/{campaign-state.json,answers.md,          -> <home>/
#     campaign-report.json,campaign-report.md,escalations/*.md}
# SPEC.md and plan-*.md under docs/tribe/planning/<slug>/ are contracts, not operational
# state, and are deliberately left in place — relocating them to this repo's own
# docs/specs, docs/plans or .c3/adr convention is a human call the migrator must not guess.
# Idempotent; refuses to touch a campaign whose .runner.lock holds a live pid.
# Never re-derives the ~/.tribe key itself — always via tribe-home.sh (W1).
#
# Both file sets this moves can be COMMITTED, so moving the files alone leaves the index
# claiming they still exist — a working tree full of unexplained deletions that the
# next `git status` reader has to reverse-engineer. Sibling migrate-state.sh already
# closes that loop (`git rm -r --cached` + the commit to run); this does the same, but only
# for the exact operational paths it moved — SPEC.md/plan-*.md are never untracked.
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
OPS_ROOT="$REPO/docs/tribe/planning"

failed=0
touched_campaigns=()
detracked_campaigns=()
detracked_ops_campaigns=()

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

if [[ ! -d "$STATE_ROOT" && ! -d "$OPS_ROOT" ]]; then
  echo "migrate-campaign-home: nothing to migrate, no $STATE_ROOT or $OPS_ROOT"
  exit 0
fi

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

# Operational state (campaign-state.json, answers.md, campaign-report.*, escalations/*.md) —
# moves into the campaign home at its fixed name. SPEC.md/plan-*.md are contracts and are
# never touched here; only named in a reminder so a human relocates them by hand.
for slugdir in "$OPS_ROOT"/*/; do
  [[ -d "$slugdir" ]] || continue
  slug="$(basename "$slugdir")"

  if [[ -n "$CAMPAIGN" && "$slug" != "$CAMPAIGN" ]]; then
    continue
  fi

  if slug_is_live_locked "$slug"; then
    echo "migrate-campaign-home: refusing $slug — .runner.lock is held by a live pid"
    failed=1
    continue
  fi

  ops_dest="$HOME_DIR/campaigns/$slug"
  ops_had_conflict=0
  ops_moved_any=0

  for fname in campaign-state.json answers.md campaign-report.json campaign-report.md; do
    src="$slugdir$fname"
    [[ -e "$src" ]] || continue
    dest="$ops_dest/$fname"

    if [[ -e "$dest" ]]; then
      echo "CONFLICT: $slug/$fname already exists at $dest — not migrated"
      failed=1
      ops_had_conflict=1
      continue
    fi

    if [[ "$DRY_RUN" -eq 1 ]]; then
      echo "would move: $src -> $dest"
    else
      mkdir -p "$ops_dest"
      mv "$src" "$dest"
      echo "moved: $src -> $dest"
    fi
    ops_moved_any=1
  done

  esc_src="${slugdir}escalations"
  if [[ -d "$esc_src" ]]; then
    esc_dest="$ops_dest/escalations"
    for f in "$esc_src"/*.md; do
      [[ -e "$f" ]] || continue
      fname="$(basename "$f")"
      dest="$esc_dest/$fname"

      if [[ -e "$dest" ]]; then
        echo "CONFLICT: $slug/escalations/$fname already exists at $dest — not migrated"
        failed=1
        ops_had_conflict=1
        continue
      fi

      if [[ "$DRY_RUN" -eq 1 ]]; then
        echo "would move: $f -> $dest"
      else
        mkdir -p "$esc_dest"
        mv "$f" "$dest"
        echo "moved: $f -> $dest"
      fi
      ops_moved_any=1
    done
  fi

  if [[ "$ops_moved_any" -eq 1 ]]; then
    touched_campaigns+=("$slug")
  fi

  # Contracts: leave in place, but the human needs to know they are there to relocate.
  for f in "$slugdir"SPEC.md "$slugdir"plan-*.md; do
    [[ -e "$f" ]] || continue
    echo "migrate-campaign-home: reminder — $f is a contract, left in place; relocate to this repo's own docs/specs, docs/plans, or .c3/adr convention by hand"
  done

  if [[ "$DRY_RUN" -ne 1 && "$ops_had_conflict" -eq 0 ]]; then
    # Index still lists the moved operational files; drop them so it matches the disk.
    # Only the fixed filenames actually moved are untracked here — SPEC.md/plan-*.md are
    # contracts and never touched, so a blanket `git rm -r --cached "$slugdir"` is
    # deliberately NOT used: it would silently untrack the contracts too (AG-2).
    ops_detracked=0
    for fname in campaign-state.json answers.md campaign-report.json campaign-report.md; do
      ops_rel="docs/tribe/planning/$slug/$fname"
      if git -C "$REPO" ls-files --error-unmatch "$ops_rel" >/dev/null 2>&1; then
        git -C "$REPO" rm --cached -q "$ops_rel"
        ops_detracked=1
      fi
    done
    # The escalations/ directory itself is moving in full, so untrack it whole — this also
    # drops a tracked escalations/.gitkeep placeholder (kept only to hold the dir in git),
    # which has no reason to survive once the directory it holds open is gone.
    esc_rel="docs/tribe/planning/$slug/escalations"
    if git -C "$REPO" ls-files --error-unmatch "$esc_rel" >/dev/null 2>&1; then
      git -C "$REPO" rm -r --cached -q "$esc_rel"
      ops_detracked=1
    fi
    if [[ "$ops_detracked" -eq 1 ]]; then
      detracked_ops_campaigns+=("$slug")
    fi
    rmdir "$esc_src" 2>/dev/null || true
    rmdir "$slugdir" 2>/dev/null || true
  fi
done

echo "migrate-campaign-home: summary — campaigns touched: ${touched_campaigns[*]:-none}"
echo "migrate-campaign-home: reminder — old session logs were caller-chosen (--logs-dir) and are NOT auto-migrated; move them by hand if wanted"

if [[ "${#detracked_campaigns[@]}" -gt 0 ]]; then
  echo "migrate-campaign-home: un-tracked from git: ${detracked_campaigns[*]}"
  echo "next: git -C '$REPO' commit -m 'chore(tribe): stop tracking campaign reports (moved to ~/.tribe)'"
fi

if [[ "${#detracked_ops_campaigns[@]}" -gt 0 ]]; then
  echo "migrate-campaign-home: un-tracked from git: ${detracked_ops_campaigns[*]} (operational files — SPEC.md/plan-*.md remain tracked)"
  echo "next: git -C '$REPO' commit -m 'chore(tribe): stop tracking campaign operational files (moved to ~/.tribe)'"
fi

exit "$failed"
