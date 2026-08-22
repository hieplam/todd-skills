---
target: ref-plugin-layout
scope: block
base: ref-plugin-layout#n1706@v1:sha256:4c9c6168ffd43f892f75bb64728dfdec86c0c4a20db56b3224322cf897a9a706
---
`install.sh`'s `install_plugin()` is written against exactly these names — its case statement whitelists `agents|skills|claude-md|hooks|rules|canvases|.claude-plugin` plus separate `scripts` and `evals` arms, and warns on anything else ("unsupported component type — not installed", `install.sh:110-124`). `rules/` and `canvases/` are whitelisted but skipped *silently* by the root installer: the owning plugin's own `install.sh` hook links them, so a warning from the root would be a false alarm. A predictable per-directory contract is what lets install be symlink-based and idempotent: the unit of linking is a whole file (agent, rule, canvas) or whole directory (skill), never merged content. The alternative — per-plugin install logic — would grow linearly with plugins and break the "add a plugin = add a manifest entry" simplicity.
