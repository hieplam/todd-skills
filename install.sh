#!/usr/bin/env bash
# install.sh — install todd-skills plugins into ~/.claude via symlinks.
#
# Symlink install means the repo stays the single source of truth: edit a file
# here and every session picks it up immediately — no marketplace snapshot to
# refresh. (Marketplace installs copy plugins into a cache; this repo is local,
# so we link instead.)
#
# Usage:
#   ./install.sh                 install ALL plugins
#   ./install.sh tribe ymir      install only the named plugins
#   ./install.sh --list          show available plugins and their components
#
# Behavior:
#   - agents/*.md      -> $CLAUDE_DIR/agents/<file>
#   - skills/<name>/   -> $CLAUDE_DIR/skills/<name>
#   - already linked to this repo  -> skipped (idempotent)
#   - conflicting file/dir/foreign link -> backed up to <name>.bak.<epoch>, then linked
#   - CLAUDE_DIR overrides the target root (default: ~/.claude) — used by tests.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
PLUGINS_DIR="$REPO_ROOT/plugins"
CLAUDE_DIR="${CLAUDE_DIR:-$HOME/.claude}"

installed=0 skipped=0 backedup=0 warned=0

say()  { printf '%s\n' "$*"; }
warn() { printf 'WARN: %s\n' "$*" >&2; warned=$((warned + 1)); }

list_plugins() {
  say "Available plugins in $PLUGINS_DIR:"
  local p name
  for p in "$PLUGINS_DIR"/*/; do
    name="$(basename "$p")"
    local parts=()
    [ -d "$p/agents" ] && parts+=("agents: $(find "$p/agents" -maxdepth 1 -name '*.md' | wc -l | tr -d ' ')")
    [ -d "$p/skills" ] && parts+=("skills: $(find "$p/skills" -mindepth 1 -maxdepth 1 -type d | wc -l | tr -d ' ')")
    say "  - $name (${parts[*]:-empty})"
  done
}

# link_one <source-path> <target-path> <label>
link_one() {
  local src="$1" dst="$2" label="$3"
  if [ -L "$dst" ] && [ "$(readlink "$dst")" = "$src" ]; then
    say "  ok      $label (already linked)"
    skipped=$((skipped + 1))
    return
  fi
  if [ -e "$dst" ] || [ -L "$dst" ]; then
    local bak="$dst.bak.$(date +%s)"
    mv "$dst" "$bak"
    warn "$label: existing target backed up to $bak"
    backedup=$((backedup + 1))
  fi
  ln -s "$src" "$dst"
  say "  linked  $label"
  installed=$((installed + 1))
}

install_plugin() {
  local plugin="$1" dir="$PLUGINS_DIR/$1"
  if [ ! -d "$dir" ]; then
    warn "plugin '$plugin' not found in $PLUGINS_DIR (see --list)"
    return
  fi
  say "$plugin:"

  local found_any=0 f d name

  if [ -d "$dir/agents" ]; then
    found_any=1
    mkdir -p "$CLAUDE_DIR/agents"
    for f in "$dir/agents"/*.md; do
      [ -e "$f" ] || continue
      link_one "$f" "$CLAUDE_DIR/agents/$(basename "$f")" "agent  $(basename "$f")"
    done
  fi

  if [ -d "$dir/skills" ]; then
    found_any=1
    mkdir -p "$CLAUDE_DIR/skills"
    for d in "$dir/skills"/*/; do
      [ -d "$d" ] || continue
      name="$(basename "$d")"
      link_one "${d%/}" "$CLAUDE_DIR/skills/$name" "skill  $name"
    done
  fi

  # Surface component types this script does not wire up.
  for d in "$dir"/*/; do
    name="$(basename "$d")"
    case "$name" in
      agents|skills|.claude-plugin) ;;
      *) warn "$plugin/$name: unsupported component type — not installed" ;;
    esac
  done

  [ "$found_any" -eq 1 ] || warn "$plugin: no agents/ or skills/ to install"
}

main() {
  if [ "${1:-}" = "--list" ] || [ "${1:-}" = "-l" ]; then
    list_plugins
    exit 0
  fi
  if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
    sed -n '2,18p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
    exit 0
  fi

  local plugins=("$@")
  if [ ${#plugins[@]} -eq 0 ]; then
    local p
    for p in "$PLUGINS_DIR"/*/; do plugins+=("$(basename "$p")"); done
  fi

  say "Installing into $CLAUDE_DIR (symlinks -> $REPO_ROOT)"
  local plugin
  for plugin in "${plugins[@]}"; do
    install_plugin "$plugin"
  done

  say ""
  say "Done: $installed linked, $skipped already linked, $backedup backed up, $warned warning(s)."
}

main "$@"
