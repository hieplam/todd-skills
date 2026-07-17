#!/usr/bin/env bash
# resolve-runner.sh — print the absolute path of the campaign runner's directory.
#
# Why this is a script and not a line of shell in SKILL.md: resolution used to be
# prose the model re-typed per session, and its `readlink -f` fallback failed OPEN.
# On a machine where the skill was not installed at ~/.claude/skills, `readlink -f`
# printed nothing and exited 1; the exit code was swallowed by `$(…)`, `dirname ""`
# returned ".", and the expression collapsed to the one thing SKILL.md forbids —
# a bare relative "./scripts/runner" resolved against the TARGET repo. With the repo
# merely moved it was worse: `readlink -f` prints the deepest surviving ancestor, so
# the result was a confident WRONG absolute path.
#
# This file cannot reproduce either failure. It ships INSIDE the skill directory, so
# it travels with the symlink install: if the repo is gone the script is gone and
# bash fails loudly on its own. It never prints a path it has not proven exists, and
# it never prints a relative one.
#
# Contract:
#   stdout  absolute path to the runner directory — ONLY on success
#   exit 0  resolved and proven (run.ts exists there)
#   exit 3  could not resolve; a named diagnostic is on stderr
#
# Usage (from the skill, via its announced base directory):
#   runner_dir="$(bash "<skill-dir>/resolve-runner.sh")" || exit 1
set -euo pipefail

die() { printf 'orchestrate-campaign: %s\n' "$*" >&2; exit 3; }

# Tier 1 — Claude Code's own plugin root, set for a native/marketplace-cached
# install, where scripts/ always lands as a sibling of skills/. Only honoured when
# it actually proves out: a stale or foreign value falls through to tier 2 rather
# than winning on presence alone.
if [ -n "${CLAUDE_PLUGIN_ROOT:-}" ] && [ -f "$CLAUDE_PLUGIN_ROOT/scripts/runner/run.ts" ]; then
  ( cd "$CLAUDE_PLUGIN_ROOT/scripts/runner" && pwd -P )
  exit 0
fi

# Tier 2 — locate ourselves. `cd … && pwd -P` resolves the install symlink to its
# physical home in the repo (the same idiom install.sh:27 and tribe/install.sh:13
# already use). Unlike `readlink -f`, a failure here is a non-zero cd, never a
# half-resolved path — and `set -e` plus the explicit guard both stop it.
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" 2>/dev/null && pwd -P)" || here=""
[ -n "$here" ] || die "cannot locate this skill's own directory — the install symlink is broken. Re-run ./install.sh from the todd-skills repo."

# skills/orchestrate-campaign -> up 2 -> the plugin root.
plugin_root="$(cd "$here/../.." 2>/dev/null && pwd -P)" || plugin_root=""
[ -n "$plugin_root" ] || die "resolved this skill to '$here' but its plugin root is unreachable. Re-run ./install.sh from the todd-skills repo."

runner_dir="$plugin_root/scripts/runner"
[ -f "$runner_dir/run.ts" ] || die "no campaign runner at '$runner_dir'. The skill resolved to '$plugin_root', which does not look like a complete tribe plugin checkout. If the todd-skills repo moved, re-run ./install.sh from its new location."

printf '%s\n' "$runner_dir"
