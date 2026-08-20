---
target: ref-plugin-layout
scope: insert
base: ref-plugin-layout#n1646@v1:sha256:2c8167e4166c7f6ec55c64a44665ca722696501fc93bf0c24f7ebb5e172c650c
---
A **skill-local** `skills/<name>/scripts/` (e.g. `plugins/explaining/skills/explaining/scripts/`) IS installed — the installer symlinks the whole skill directory (`ln -s plugins/<plugin>/skills/<name> ~/.claude/skills/<name>`), `scripts/` included — unlike a *plugin-level* `scripts/` (directly under `plugins/<name>/`), which the installer's own `install_plugin()` whitelist explicitly skips as "repo-invoked, NOT installed".
