#!/usr/bin/env bash
# test-install-canvases.sh — the install hook links canvases/*.md into $CLAUDE_DIR/canvases/.
#
# The hook's job: symlink each shipped canvas definition (canvases/*.md) into
# ~/.claude/canvases/, a stable machine-global path an installed tribe resolves
# (e.g. Scout self-provisioning the `debt` canvas in a target repo, CU-3 D10).
# Symlink — not copy — so the repo stays the single source of truth.
# Mirrors test-install-rules.sh 1:1 for the canvases/ component.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SRC="$HERE/../../install.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check() { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2 want: $3)"; fi; }

# Builds an isolated plugin dir holding a copy of the hook + the given canvas body, so each
# case controls canvases/ contents without touching the real plugin.
setup_case() {
  local name="$1" canvas_body="$2"
  local dir="$TMP/$name"
  mkdir -p "$dir/plugin/canvases" "$dir/claude"
  cp "$HOOK_SRC" "$dir/plugin/install.sh"
  printf '%s' "$canvas_body" > "$dir/plugin/canvases/debt.md"
  printf '%s' "$dir"
}
run_hook() { CLAUDE_DIR="$1/claude" bash "$1/plugin/install.sh"; }

CANVAS='---
id: debt
type: canvas
status:
    - open
    - closed
description: Tech-debt blacklist entry.
---

domain: governance
'

# --- 1. canvases-only plugin (no claude-md/): the canvas still lands --------------------
# Regression: the hook exited 0 early when claude-md/ was missing, never touching canvases/.
d="$(setup_case canvasesonly "$CANVAS")"
set +e; run_hook "$d" >/dev/null 2>&1; rc=$?; set -e
check "canvases-only plugin: hook exits 0" "$rc" "0"
if [ -L "$d/claude/canvases/debt.md" ]; then ok "canvases-only plugin: canvas is a symlink"
else bad "canvases-only plugin: canvas not linked into \$CLAUDE_DIR/canvases/"; fi
check "canvases-only plugin: link resolves to plugin source" \
  "$(readlink "$d/claude/canvases/debt.md" 2>/dev/null)" \
  "$(cd "$d/plugin/canvases" && pwd -P)/debt.md"

# --- 2. idempotence: re-running never duplicates or errors ------------------------------
set +e; run_hook "$d" >/dev/null 2>&1; rc=$?; set -e
check "re-running the hook is idempotent (exit 0)" "$rc" "0"
check "re-running keeps exactly one canvases file" \
  "$(find "$d/claude/canvases" -name 'debt.md*' | wc -l | tr -d ' ')" "1"

# --- 3. conflicting real file at the target: backed up, then linked ---------------------
d="$(setup_case conflict "$CANVAS")"
mkdir -p "$d/claude/canvases"
printf 'a hand-written local copy\n' > "$d/claude/canvases/debt.md"
set +e; out="$(run_hook "$d" 2>&1)"; rc=$?; set -e
check "conflicting target: hook exits 0" "$rc" "0"
if [ -L "$d/claude/canvases/debt.md" ]; then ok "conflicting target: replaced by symlink"
else bad "conflicting target: not replaced by symlink"; fi
if ls "$d/claude/canvases"/debt.md.bak.* >/dev/null 2>&1; then ok "conflicting target: original backed up"
else bad "conflicting target: no backup created (got: $out)"; fi

# --- 4. canvases/ AND claude-md/ together: both install ----------------------------------
d="$(setup_case both "$CANVAS")"
mkdir -p "$d/plugin/claude-md"
printf '## Some snippet heading\n\n- guidance line\n' > "$d/plugin/claude-md/snippet.md"
run_hook "$d" >/dev/null 2>&1
if [ -L "$d/claude/canvases/debt.md" ]; then ok "both dirs: canvas linked"
else bad "both dirs: canvas not linked"; fi
check "both dirs: snippet appended to CLAUDE.md" \
  "$(grep -cxF '## Some snippet heading' "$d/claude/CLAUDE.md" || true)" "1"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [[ "$FAIL" -eq 0 ]]
