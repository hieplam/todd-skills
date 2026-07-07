# Repo-wide eval harness

Runs the `evals/evals.json` files that already sit next to some skills/plugins in this
repo and actually executes them — mirroring the official `skill-creator` eval loop
(`evals.json` → isolated-subagent run → `grading.json` with evidence → `benchmark.json`
with/without comparison) instead of inventing a new one.

## Why this exists

`refactor-for-testability/skills/refactor-for-testability/evals/evals.json` shipped with
3 well-formed cases and no runner. `run_evals.py` is that runner, and it applies to any
`plugins/**/evals/evals.json` in this shape — currently `check-diff-coverage`,
`splitting-plans`, `tribe` (agent-flavored: see `kind` below), and
`refactor-for-testability`.

## evals.json shape

```json
{
  "skill_name": "example-skill",
  "kind": "skill",                    // "skill" (default, omit-able) | "agent"
  "evals": [
    {
      "id": 1,
      "name": "short-slug",
      "agent": "hunter",              // only for kind: "agent" — which agents/<name>.md to test
      "prompt": "the task given to the model",
      "expected_output": "prose description of correct behavior — the grading rubric",
      "files": []
    }
  ]
}
```

`kind: "skill"` cases test a `SKILL.md`-based skill (the evals.json lives at
`<skill-dir>/evals/evals.json`); `kind: "agent"` cases test one of `tribe`'s agent
definitions per case (the evals.json lives at `plugins/tribe/evals/evals.json`, each
case names which `agents/<name>.md` it targets).

## What it does

For each case, up to two isolated `claude -p` subprocesses run (never the current
session — a genuinely clean context per skill-creator's own `run_eval.py` pattern):

- **with_skill** — the skill/agent under test is made available for that one process
  only: skill cases register a throwaway `.claude/commands/` entry carrying the real
  `SKILL.md` description (exactly the technique `skill-creator/scripts/run_eval.py`
  uses, so triggering is genuine, not forced); agent cases pass the named agent's real
  frontmatter + body straight through `--agents`/`--agent`, independent of whether it
  happens to be symlink-installed locally.
- **without_skill** — a plain `claude -p` call, nothing registered. The baseline.

Both configurations' token usage and wall-clock duration come straight from
`claude -p --output-format json`'s own `result` event (`duration_ms`, `usage`,
`total_cost_usd`) — no separate instrumentation. A second, tool-less `claude -p` call
(the grader) scores the transcript against `expected_output` and writes `grading.json`
with evidence. Everything rolls up into one `benchmark.json` per invocation.

This only reads skill/agent files and shells out to `claude -p` in a scratch temp
directory per case — it never edits a skill's or agent's runtime files.

## Usage

```bash
# One evals.json
scripts/evals/run_evals.py --evals plugins/splitting-plans/skills/splitting-plans/evals/evals.json

# Every evals.json in the repo
scripts/evals/run_evals.py --all

# Just prove the harness runs, cheaply, before committing to a full pass
scripts/evals/run_evals.py --all --mode with_skill --eval-id 1 --exec-model haiku --grader-model haiku

# See what would run without spending anything
scripts/evals/run_evals.py --all --dry-run
```

Key flags: `--mode {both,with_skill,without_skill}`, `--runs N` (repeats per
configuration, for variance), `--timeout SECONDS` (per `claude -p` call), `--exec-model`
/ `--grader-model` (default: your configured model — pin to something cheap for a smoke
pass), `--eval-id 1,3` (restrict to specific case ids).

Output lands in `scripts/evals/runs/<UTC-timestamp>/` (git-ignored — reproducible from
`evals.json` + this script, not checked in): per-case `transcript.md` / `metrics.json` /
`grading.json`, plus one rolled-up `benchmark.json` at the run root.

## Cost note

Each case with `--mode both` spends 4 `claude -p` calls (2 executors + 2 graders), and
executor calls have full tool access — they really do the task, so a slow/tool-heavy
case can run minutes and real tokens. Pin `--exec-model`/`--grader-model` to a cheap
model and use `--eval-id` to scope a smoke pass before running the full suite.
