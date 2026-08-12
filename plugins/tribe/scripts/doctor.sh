#!/usr/bin/env bash
# doctor.sh — preflight the campaign runner's prerequisites on THIS machine.
#
# The runner shells out to `bun` and `gh`, and drives the Claude Agent SDK. Each of
# those is provisioned per machine, not per repo, so a fresh checkout can install
# cleanly and still fail hours into a run. This reports every gap up front, by name,
# with the command that fixes it — instead of letting a callee die with
# "command not found" somewhere deep in a background run.
#
# Contract:
#   exit 0  every required prerequisite is present
#   exit 1  at least one is missing; each is named on stdout with its remedy
#
# Checks are additive and never fatal-on-first-miss: one run reports every gap, so a
# fresh machine is provisioned in a single pass rather than one error at a time.
set -euo pipefail

MISSING=0
ok()   { printf '  ok    %s\n' "$*"; }
gap()  { printf '  MISSING %s\n' "$*"; MISSING=$((MISSING + 1)); }
fix()  { printf '        -> %s\n' "$*"; }
warn() { printf '  WARN  %s\n' "$*"; }

printf 'campaign runner preflight\n'

# --- bun: the runner is TypeScript executed directly by bun -------------------
if command -v bun >/dev/null 2>&1; then
  ok "bun $(bun --version 2>/dev/null)"
else
  gap "bun — the campaign runner is TypeScript run directly by bun"
  fix "install it: curl -fsSL https://bun.sh/install | bash    (see https://bun.sh)"
fi

# --- gh: the runner opens/inspects PRs through the GitHub CLI -----------------
if command -v gh >/dev/null 2>&1; then
  if gh auth status >/dev/null 2>&1; then
    ok "gh (authenticated)"
  else
    gap "gh is installed but not authenticated — the runner cannot read or open PRs"
    fix "run: gh auth login"
  fi
else
  gap "gh — the runner shells out to the GitHub CLI for PR state"
  fix "install it: brew install gh    then: gh auth login"
fi

# --- Agent SDK credentials: the runner spawns Claude sessions ----------------
# Either an explicit API key, or an existing Claude Code login the SDK can reuse.
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  ok "Agent SDK credentials (ANTHROPIC_API_KEY is set)"
elif [ -f "${CLAUDE_CONFIG_DIR:-$HOME/.claude}/.credentials.json" ] || [ -f "$HOME/.claude.json" ]; then
  ok "Agent SDK credentials (Claude Code login found)"
else
  gap "Agent SDK credentials — the runner spawns Claude sessions and cannot authenticate"
  fix "either log in with Claude Code, or export ANTHROPIC_API_KEY=<key>"
fi

# --- ANTHROPIC_API_KEY trap (fix-list P10): the tribe never authenticates via this
# variable — executor sessions authenticate via Claude Code login only. Report-only: the
# runner itself enforces the rule (unsets the env var, scrubs the target repo's
# .env.local) at the top of every run, so this is a heads-up, not a gate — it never
# increments MISSING or affects the exit code.
if [ -n "${ANTHROPIC_API_KEY:-}" ]; then
  warn "ANTHROPIC_API_KEY is set in the environment — the tribe authenticates via Claude Code login, never this variable (the runner removes it automatically before spawning any session)"
fi
if [ -f ".env.local" ] && grep -qE '^\s*(export\s+)?ANTHROPIC_API_KEY\s*=' ".env.local"; then
  warn "$(pwd)/.env.local sets ANTHROPIC_API_KEY — the runner removes that line automatically on its next run against this repo"
fi

# --- runner dependencies: node_modules/ is gitignored ------------------------
# A fresh clone has no node_modules. Bun can serve deps from its global cache or
# auto-install them, but that first resolve needs the network — so a machine that
# is offline on its first run fails here, not mid-campaign.
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
RUNNER="$HERE/runner"
if [ -d "$RUNNER/node_modules" ]; then
  ok "runner dependencies installed"
elif command -v bun >/dev/null 2>&1; then
  gap "runner dependencies — node_modules/ is gitignored, so a fresh clone has none"
  fix "warm them offline-safe now: (cd '$RUNNER' && bun install)"
else
  gap "runner dependencies — cannot check without bun"
  fix "install bun first, then: (cd '$RUNNER' && bun install)"
fi

printf '\n'
if [ "$MISSING" -eq 0 ]; then
  printf 'all prerequisites present\n'
  exit 0
fi
printf '%s prerequisite(s) missing — fix the above before starting a campaign\n' "$MISSING"
exit 1
