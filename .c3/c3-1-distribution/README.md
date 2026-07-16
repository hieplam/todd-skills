---
id: c3-1
c3-seal: 06809bf27aaa4baafb6d9f31bcb18de6dbb152a32d6e1c97c7490b26d2f5c5d2
title: distribution
type: container
boundary: service
parent: c3-0
goal: 'Install-time distribution: register every plugin in the marketplace manifest and symlink plugin content into `~/.claude`, keeping this repo the single source of truth (edits are picked up immediately, no marketplace cache snapshot to refresh).'
---

## Goal

Install-time distribution: register every plugin in the marketplace manifest and symlink plugin content into `~/.claude`, keeping this repo the single source of truth (edits are picked up immediately, no marketplace cache snapshot to refresh).

## Components

| ID | Name | Category | Status | Goal Contribution |
| --- | --- | --- | --- | --- |
| c3-101 | installer | foundation | active | The only path from repo checkout to a working ~/.claude install: walks each plugin's layout, links agents/skills, runs post-install hooks idempotently |

## Responsibilities

- Own `.claude-plugin/marketplace.json` — the authoritative registry of installable plugins (name, source path, description).
- Symlink `agents/*.md` and `skills/<name>/` into `$CLAUDE_DIR` (default `~/.claude`), idempotently: already-correct links are skipped, conflicting targets are backed up to `<name>.bak.<epoch>` and never destroyed.
- Execute per-plugin `install.sh` post-install hooks (e.g. appending `claude-md/` snippets to the global CLAUDE.md), passing `CLAUDE_DIR` through.
- Deliberately NOT install dev-only content: `evals/` fixtures and repo-invoked `scripts/` stay out of `$CLAUDE_DIR`; unknown component types produce a warning instead of a silent skip.
