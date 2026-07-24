# todd-skills

Todd Lam's personal Claude Code agents and skills, packaged as installable plugins. The repo is
the single source of truth; `.claude-plugin/marketplace.json` is the authoritative registry.

## Install

### From any machine (marketplace)

The repo is public, so no clone and no auth are needed:

```
/plugin marketplace add hieplam/todd-skills
/plugin install tribe@todd-skills
```

Run those inside a Claude Code session. `tribe@todd-skills` is `<plugin>@<marketplace>` — the
marketplace is named `todd-skills`, and any plugin from the table below works in its place.

### From a checkout (symlink install)

Use this on the machine where you edit the plugins. It symlinks them into `~/.claude`, so an
edit here takes effect in every session immediately — there is no marketplace snapshot to
refresh.

```bash
git clone https://github.com/hieplam/todd-skills.git
cd todd-skills
./install.sh --list          # show available plugins and their components
./install.sh tribe           # install named plugins
./install.sh                 # install all of them
```

Behaviour: `agents/*.md` link into `~/.claude/agents/`, `skills/<name>/` into
`~/.claude/skills/`. It is idempotent (an existing link to this repo is skipped), a conflicting
file is backed up to `<name>.bak.<epoch>` first, and a plugin's own `install.sh` runs as a
post-install hook. `CLAUDE_DIR` overrides the target root (used by the tests).

**Which one do I want?** Marketplace to *use* the plugins anywhere; symlink install to *develop*
them.

## Plugins

| Plugin | Kind | What it does |
| --- | --- | --- |
| `tribe` | agents + skills | Six agents under a strict chain of command (Owner ⇄ Shaman ⇄ Warchief ⇄ Hunter, plus Tracker and Skinner reviewers and the read-only Scout code-analyzer). Questions flow up as statuses, decisions flow down as cards and briefs. Ships the `orchestrate-campaign` and `verify-shipped` skills (the latter mechanically verifies a SHIPPED claim against GitHub and git). |
| `research-to-blog` | agents | Turn a session insight or a bare topic into a bilingual EN+VI research note and published blog posts. |
| `splitting-plans` | skills | Split a large plan into isolated, dependency-aware sub-plans for parallel subagents. |
| `check-diff-coverage` | skills | Measure uncovered diff vs main and drive a remediation loop (.NET, Go). |
| `refactor-for-testability` | skills | Reshape untestable code before changing its behaviour. |
| `workflow-journal` | skills | Render each Workflow run to a readable Markdown record. |
| `simple-image-video` | skills | Animate a still image into a short video. |
| `explaining` | skills | Two eval-proven writing rules (term discipline + grounding) for explanatory prose; refuted rule candidates excluded by A/B data. |

## The campaign runner (not installed — run it from a checkout)

`tribe` also ships the **campaign runner**: a stateless CLI that executes staged roadmap cards
unattended — one fresh Agent-SDK executor session per card, script-verified SHIPPED, resumable
after a crash, at zero token cost for the loop itself.

**Installing the `tribe` plugin does not give you a runnable runner.** It lives under
`plugins/tribe/scripts/runner/`, and `scripts/` is repo-invoked, never installed (see
`ref-plugin-layout`) — the runner *dispatches* the tribe rather than being part of the installed
runtime. It also needs its own dependencies, since `node_modules/` is not committed:

```bash
git clone https://github.com/hieplam/todd-skills.git
cd todd-skills/plugins/tribe/scripts/runner && bun install && cd -

# always dry-run first — it derives each card's phase from live GitHub with zero side effects
bun plugins/tribe/scripts/runner/run.ts \
  --repo <target-repo> --state <state.json relative to --repo> --model <model> --dry-run
```

Requires [bun](https://bun.sh) and an authenticated `gh`. Every environment value is a CLI
input; the campaign *instance* (state, specs, plans, answers, escalations) lives in the target
repo, never here. See `plugins/tribe/scripts/runner/README.md` for the full input table, resume
semantics, the escalation workflow, and its known limitations.

## Development

```bash
# runner tests
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit

# shell script tests (per plugin)
plugins/tribe/scripts/tests/test-validate-plan.sh

# agent/skill evals
python3 scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json
```

Architecture lives in `.c3/` and is CLI-only — query it with `/c3`, never by hand-editing.
Every plugin in `plugins/` must be registered in `.claude-plugin/marketplace.json`
(`rule-marketplace-registration`), and must follow the directory contract in
`ref-plugin-layout`: `install.sh` only understands `agents/`, `skills/`, `claude-md/`, `hooks/`,
`.claude-plugin/`, `scripts/`, and `evals/`, and warns on anything else.
