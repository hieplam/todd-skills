---
id: ref-plugin-layout
c3-seal: bdcdb32600e6f94bfe8eed542ebf6d0849346442bd6f460b344232126c960c16
title: plugin-layout
type: ref
goal: 'Standardize the directory shape of every plugin so the installer, the marketplace manifest, and the eval harness can walk any plugin without per-plugin logic. The recurring need: 8 plugins, one install code path.'
---

## Goal

Standardize the directory shape of every plugin so the installer, the marketplace manifest, and the eval harness can walk any plugin without per-plugin logic. The recurring need: 8 plugins, one install code path.

## Choice

A plugin is a directory under `plugins/<name>/` containing `.claude-plugin/plugin.json` (name, description, version) plus any of exactly these component directories: `agents/*.md` (symlinked file-by-file into `~/.claude/agents/`), `skills/<skill-name>/` with a `SKILL.md` (symlinked as a directory into `~/.claude/skills/`), `install.sh` (post-install hook, receives `CLAUDE_DIR`), `claude-md/` (snippets consumed by such hooks), `hooks/` (hook config), `scripts/` (repo-invoked validators, not installed), and `evals/` (dev fixtures, not installed).

## Why

`install.sh`'s `install_plugin()` is written against exactly these names — its case statement whitelists `agents|skills|claude-md|hooks|.claude-plugin|scripts|evals` and warns on anything else ("unsupported component type — not installed", `install.sh:107-117`). A predictable per-directory contract is what lets install be symlink-based and idempotent: the unit of linking is a whole file (agent) or whole directory (skill), never merged content. The alternative — per-plugin install logic — would grow linearly with plugins and break the "add a plugin = add a manifest entry" simplicity. A **skill-local** `skills/<name>/scripts/` (e.g. `plugins/explaining/skills/explaining/scripts/`) IS installed, because the installer symlinks the whole skill directory (`scripts/` included) — unlike a *plugin-level* `scripts/` (directly under `plugins/<name>/`), which the case statement above whitelists but never links.

## How

Golden layout, from the richest real plugin (`plugins/tribe/`):

`````plugins/tribe/
├── .claude-plugin/plugin.json   # REQUIRED — name matches directory basename
├── README.md                    # OPTIONAL
├── install.sh                   # OPTIONAL post-install hook (CLAUDE_DIR passed through)
├── agents/                      # OPTIONAL — each *.md linked to ~/.claude/agents/
│   ├── shaman.md … skinner.md
├── claude-md/global-rules.md    # OPTIONAL — snippet appended by install.sh hook
├── scripts/                     # OPTIONAL — repo-invoked, NOT installed
│   └── tests/                   #   shell tests for those scripts
└── evals/evals.json             # OPTIONAL — dev fixture, NOT installed
```
````

Skill-flavored plugins (e.g. `plugins/verify-shipped/`) use `skills/<name>/SKILL.md` instead of `agents/`.
`````
