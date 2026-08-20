---
target: ref-plugin-layout
scope: block
base: ref-plugin-layout#n1643@v1:sha256:4c9c6168ffd43f892f75bb64728dfdec86c0c4a20db56b3224322cf897a9a706
---
`install.sh`'s `install_plugin()` is written against exactly these names — its case statement whitelists `agents|skills|claude-md|hooks|.claude-plugin|scripts|evals` and warns on anything else ("unsupported component type — not installed", `install.sh:107-117`). A predictable per-directory contract is what lets install be symlink-based and idempotent: the unit of linking is a whole file (agent) or whole directory (skill), never merged content. The alternative — per-plugin install logic — would grow linearly with plugins and break the "add a plugin = add a manifest entry" simplicity. A **skill-local** `skills/<name>/scripts/` (e.g. `plugins/explaining/skills/explaining/scripts/`) IS installed, because the installer symlinks the whole skill directory (`scripts/` included) — unlike a *plugin-level* `scripts/` (directly under `plugins/<name>/`), which the case statement above whitelists but never links.
