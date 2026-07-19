#!/usr/bin/env bash
# archive-card.sh — move a shipped card's state out of the in-flight set.
# Usage: archive-card.sh <slug> [repo-dir]
set -euo pipefail
SLUG="${1:?usage: archive-card.sh <slug> [repo-dir]}"
REPO="${2:-$PWD}"
DIR="$(cd "$(dirname "$0")" && pwd)"
HOME_DIR="$("$DIR/tribe-home.sh" "$REPO")"
src="$HOME_DIR/state/$SLUG.md"
if [[ ! -e "$src" ]]; then echo "archive-card: no in-flight state for $SLUG (nothing to do)"; exit 0; fi
mkdir -p "$HOME_DIR/archive"
mv "$src" "$HOME_DIR/archive/$SLUG.md"
echo "archive-card: $SLUG → $HOME_DIR/archive/$SLUG.md"
