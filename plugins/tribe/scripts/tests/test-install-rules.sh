#!/usr/bin/env bash
# test-install-rules.sh — the install hook links rules/*.md into $CLAUDE_DIR/rules/.
#
# The hook's job: symlink each machine-global rule file (rules/*.md) into
# ~/.claude/rules/, where reviewers (tracker, skinner) read every *.md fresh on
# each run. Symlink — not copy — so the repo stays the single source of truth.
# The regression this file pins: the hook used to exit early when claude-md/
# was absent, which would silently skip rules for any plugin shipping only rules/.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
HOOK_SRC="$HERE/../../install.sh"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check() { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2 want: $3)"; fi; }

# Builds an isolated plugin dir holding a copy of the hook + the given rule body, so each
# case controls rules/ contents without touching the real plugin.
setup_case() {
  local name="$1" rule_body="$2"
  local dir="$TMP/$name"
  mkdir -p "$dir/plugin/rules" "$dir/claude"
  cp "$HOOK_SRC" "$dir/plugin/install.sh"
  printf '%s' "$rule_body" > "$dir/plugin/rules/pure-core.md"
  printf '%s' "$dir"
}
run_hook() { CLAUDE_DIR="$1/claude" bash "$1/plugin/install.sh"; }

RULE='# Pure Core, Impure Edges

Core logic stays deterministic; side effects enter through injected abstractions.
'

# --- 1. rules-only plugin (no claude-md/): the rule still lands -------------------------
# Regression: the hook exited 0 early when claude-md/ was missing, never touching rules/.
d="$(setup_case rulesonly "$RULE")"
set +e; run_hook "$d" >/dev/null 2>&1; rc=$?; set -e
check "rules-only plugin: hook exits 0" "$rc" "0"
if [ -L "$d/claude/rules/pure-core.md" ]; then ok "rules-only plugin: rule is a symlink"
else bad "rules-only plugin: rule not linked into \$CLAUDE_DIR/rules/"; fi
check "rules-only plugin: link resolves to plugin source" \
  "$(readlink "$d/claude/rules/pure-core.md" 2>/dev/null)" \
  "$(cd "$d/plugin/rules" && pwd -P)/pure-core.md"

# --- 2. idempotence: re-running never duplicates or errors ------------------------------
set +e; run_hook "$d" >/dev/null 2>&1; rc=$?; set -e
check "re-running the hook is idempotent (exit 0)" "$rc" "0"
check "re-running keeps exactly one rules file" \
  "$(find "$d/claude/rules" -name 'pure-core.md*' | wc -l | tr -d ' ')" "1"

# --- 3. conflicting real file at the target: backed up, then linked ---------------------
d="$(setup_case conflict "$RULE")"
mkdir -p "$d/claude/rules"
printf 'a hand-written local copy\n' > "$d/claude/rules/pure-core.md"
set +e; out="$(run_hook "$d" 2>&1)"; rc=$?; set -e
check "conflicting target: hook exits 0" "$rc" "0"
if [ -L "$d/claude/rules/pure-core.md" ]; then ok "conflicting target: replaced by symlink"
else bad "conflicting target: not replaced by symlink"; fi
if ls "$d/claude/rules"/pure-core.md.bak.* >/dev/null 2>&1; then ok "conflicting target: original backed up"
else bad "conflicting target: no backup created (got: $out)"; fi

# --- 4. rules/ AND claude-md/ together: both install ------------------------------------
d="$(setup_case both "$RULE")"
mkdir -p "$d/plugin/claude-md"
printf '## Some snippet heading\n\n- guidance line\n' > "$d/plugin/claude-md/snippet.md"
run_hook "$d" >/dev/null 2>&1
if [ -L "$d/claude/rules/pure-core.md" ]; then ok "both dirs: rule linked"
else bad "both dirs: rule not linked"; fi
check "both dirs: snippet appended to CLAUDE.md" \
  "$(grep -cxF '## Some snippet heading' "$d/claude/CLAUDE.md" || true)" "1"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"; [[ "$FAIL" -eq 0 ]]
