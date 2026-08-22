---
target: ref-plugin-layout
scope: block
base: ref-plugin-layout#n1641@v1:sha256:746cee9fc8b862ca0c7baf82b2f1b47b0cd7295737bee04abfb69a030adb353d
---
A plugin is a directory under `plugins/<name>/` containing `.claude-plugin/plugin.json` (name, description, version) plus any of exactly these component directories: `agents/*.md` (symlinked file-by-file into `~/.claude/agents/`), `skills/<skill-name>/` with a `SKILL.md` (symlinked as a directory into `~/.claude/skills/`), `install.sh` (post-install hook, receives `CLAUDE_DIR`), `claude-md/` (snippets consumed by such hooks), `rules/*.md` (machine-global rule files a hook symlinks into `~/.claude/rules/`), `canvases/*.md` (shipped canvas definitions a hook symlinks into `~/.claude/canvases/`), `hooks/` (hook config), `scripts/` (repo-invoked validators, not installed), and `evals/` (dev fixtures, not installed).
