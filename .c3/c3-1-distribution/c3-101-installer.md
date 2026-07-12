---
id: c3-101
c3-seal: a07e1089c3d007ab1898d62d569d9ac67db60b529337c01246d3aac838cdd5c4
title: installer
type: component
category: foundation
parent: c3-1
goal: Symlink every plugin's agents and skills into `~/.claude` idempotently, and expose the marketplace manifest that registers what exists.
uses:
    - ref-plugin-layout
    - rule-bash-strict-mode
    - rule-marketplace-registration
---

## Goal

Symlink every plugin's agents and skills into `~/.claude` idempotently, and expose the marketplace manifest that registers what exists.

## Parent Fit

| Field | Value |
| --- | --- |
| Container | c3-1 distribution — install-time bash tooling |
| Category | Foundation — every plugin reaches users through this path |
| Role in parent | The container's only component: install.sh + .claude-plugin/marketplace.json together are the whole distribution story |
| Depends on siblings | None — it walks plugins/*/ (c3-2 content) but has no peer components in c3-1 |

## Purpose

Owns the repo→`~/.claude` boundary: which component types get linked, how conflicts are handled, and which plugin directories are officially registered. Non-goals: it never copies content (symlinks only), never installs dev tooling (`evals/`, `scripts/`), and never decides what a plugin does — only whether its layout is walkable.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Precondition | Repo checked out locally; CLAUDE_DIR (default ~/.claude) writable | N.A - see ./install.sh |
| Inputs | Plugin-name args narrow the run; --list and --help short-circuit; CLAUDE_DIR env var overrides the target root (used by tests) | N.A - CLI surface defined in install.sh |
| State | Counters (installed/skipped/backedup/warned) feeding the summary line; .bak.<epoch> files it may create | N.A - transient in-process state only |
| Shared dependencies | Plugin layout contract — the case whitelist of component-type directory names | ref-plugin-layout |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | All (or named) plugins linked into $CLAUDE_DIR; summary printed | rule-marketplace-registration |
| Primary path | For each plugin: link agents/*.md file-by-file, link skills/<name>/ dir-by-dir, run the plugin's post-install hook with CLAUDE_DIR passed through | ref-plugin-layout |
| Alternates | Already-correct link → skipped ("ok … already linked"); --list prints inventory without touching anything | N.A - see ./install.sh |
| Failure behavior | Conflicting file/foreign link → backed up to .bak.<epoch> then linked; unknown plugin or unsupported component dir → WARN, never abort the whole run | N.A - see plugins/tribe/install.sh |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | ref | Which directories it walks and which it refuses to install | binding | The case whitelist is the enforcement point of that ref |
| rule-marketplace-registration | rule | Manifest entries ↔ plugins/*/ directory parity | binding | install_plugin resolves by directory basename |
| rule-bash-strict-mode | rule | Script preamble | binding | set -euo pipefail at install.sh:25 |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| ./install.sh [names…] with --list / --help flags | IN | No args = all plugins; names = only those; exits 0 with per-item status lines | shell CLI | install.sh |
| CLAUDE_DIR env var | IN | Overrides target root; everything created lives under it | env | install.sh |
| $CLAUDE_DIR/agents/*.md, $CLAUDE_DIR/skills/<name> | OUT | Symlinks pointing back into this repo; pre-existing targets preserved as .bak.<epoch> | filesystem | install.sh |
| Per-plugin post-install hook invocation | OUT | Called once per plugin that ships one, with CLAUDE_DIR in env; hook failure is a WARN not a stop | subprocess | plugins/tribe/install.sh |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| A new component type ships in a plugin and silently doesn't install | Adding a directory name outside the case whitelist | "unsupported component type" WARN in install output | ./install.sh <plugin> reports 0 warnings |
| Destroying a user's existing ~/.claude content | Changing the backup-then-link logic | Missing .bak.<epoch> after a conflicting install | CLAUDE_DIR=$(mktemp -d) ./install.sh twice over a conflicting fixture, then inspect the temp dir |
| Manifest drift (plugin exists but unregistered) | Adding a new plugin directory without a marketplace entry | ./install.sh --list vs manifest mismatch | Compare ./install.sh --list output against .claude-plugin/marketplace.json |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Marketplace manifest entries | Contract section (the ./install.sh surface resolves plugins by directory basename) and Governance row rule-marketplace-registration | Description wording free; name/source mechanical | .claude-plugin/marketplace.json |
