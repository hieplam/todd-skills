---
target: c3-215
scope: insert
base: c3-215#n1452@v1:sha256:aa31c384fd777dda33f0dc2b820d2420455d5a22816084dd2a85ea081edc0d12
---
| Machine-global rules symlink | OUT | Install hook symlinks every `rules/*.md` into `~/.claude/rules/`, where Claude Code loads a rule by its frontmatter contract: no `paths:` glob means it applies generally and loads every turn (`pure-core.md`, the cross-stack design standard), a `paths:` glob means it loads only when a matching file is in play (`html-illustration.md`, the HTML visual-output house style, globbed to `**/*.html` and `**/*.htm`). A glob is a mechanical filter only — a rule needing a narrower scope than its glob carries a semantic gate in its own body, which the model evaluates before applying it. The tribe's own reviewers honour the same frontmatter (`agents/tracker.md:43`), so one file governs both authoring and review with no prompt change. Symlink, not copy, so the repo stays the single source of truth; idempotent, backing a conflicting real file up to `<name>.bak.<epoch>`. The loop is generic over the directory — adding a rule needs no installer change | user's global config | plugins/tribe/scripts/tests/test-install-rules.sh |
