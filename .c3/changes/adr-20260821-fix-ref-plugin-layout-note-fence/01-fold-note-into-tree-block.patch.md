---
target: ref-plugin-layout
scope: block
base: ref-plugin-layout#n1646@v1:sha256:2c8167e4166c7f6ec55c64a44665ca722696501fc93bf0c24f7ebb5e172c650c
---
`````
plugins/tribe/
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

A **skill-local** `skills/<name>/scripts/` (e.g. `plugins/explaining/skills/explaining/scripts/`) IS installed — the installer symlinks the whole skill directory (`ln -s plugins/<plugin>/skills/<name> ~/.claude/skills/<name>`), `scripts/` included — unlike a *plugin-level* `scripts/` (directly under `plugins/<name>/`), which the installer's own `install_plugin()` whitelist explicitly skips as "repo-invoked, NOT installed".
`````
