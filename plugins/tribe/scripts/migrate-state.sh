#!/usr/bin/env bash
# migrate-state.sh — one-shot: move committed docs/tribe/state/*.md into the
# per-repo local home (~/.tribe/<key>/state) and stop tracking them in git.
# Idempotent. Does not commit — prints the commit to make.
set -euo pipefail
REPO="${1:-$PWD}"
DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$("$DIR/tribe-home.sh" "$REPO")"
mkdir -p "$HOME_DIR/state"

copied=0
while IFS= read -r wt; do
  sd="$wt/docs/tribe/state"
  [[ -d "$sd" ]] || continue
  for f in "$sd"/*.md; do
    [[ -e "$f" ]] || continue
    dest="$HOME_DIR/state/$(basename "$f")"
    if [[ ! -e "$dest" ]]; then cp "$f" "$dest"; copied=$((copied+1)); fi
  done
done < <(git -C "$REPO" worktree list --porcelain | awk '/^worktree /{print $2}')

gi="$REPO/.gitignore"
grep -qxF 'docs/tribe/state/' "$gi" 2>/dev/null || printf 'docs/tribe/state/\n' >> "$gi"

if git -C "$REPO" ls-files --error-unmatch docs/tribe/state >/dev/null 2>&1; then
  git -C "$REPO" rm -r --cached -q docs/tribe/state
fi

echo "migrate-state: copied $copied file(s) to $HOME_DIR/state"
echo "next: git -C '$REPO' add .gitignore && git -C '$REPO' commit -m 'chore(tribe): stop tracking operational state (moved to ~/.tribe)'"
