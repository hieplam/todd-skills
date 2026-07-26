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
- **without_skill** — a `claude -p --safe-mode` call: nothing registered *and* every
  user/project-scope customization (CLAUDE.md, skills, plugins, hooks, MCP servers,
  custom commands/agents) disabled. Plain `claude -p` alone isn't a clean baseline when
  the skill under test is also symlink-installed at user scope (the normal state when
  dogfooding this repo's own marketplace) — it would fire anyway and collapse the
  comparison. `--safe-mode` is what actually makes this the baseline.

Both configurations' token usage and wall-clock duration come straight from
`claude -p --output-format stream-json --verbose`'s own `result` event (`duration_ms`,
`usage`, `total_cost_usd`) — no separate instrumentation. `stream-json` (one JSON
object per stdout line), not plain `json`, is used deliberately: plain
`--output-format json` silently collapses to a single bare `result` object (no
assistant/tool-call events at all) whenever `--setting-sources` excludes `"user"` —
exactly what the `with_skill` leg's isolation flags do — which would otherwise starve
every `with_skill` grading verdict of transcript/tool-call evidence. A second, tool-less `claude -p` call
(the grader) scores the transcript against `expected_output` and writes `grading.json`
with evidence. Everything rolls up into one `benchmark.json` per invocation.

### UNGRADED: a harness failure is not an agent failure

Grading is itself a `claude -p` subprocess call, and that call can fail the same way any
subprocess can: it can time out, exit non-zero, or hand back a reply that isn't valid
JSON (including one cut off mid-object — a truncated reply). When that happens the
*harness* failed to produce a verdict — nothing about the agent's actual behavior was
judged. Scoring that as `passed: false` would silently corrupt every pass-rate read off
the suite, so `grade()` reports a third outcome instead: `{"ungraded": true, "evidence":
"<why>"}`.

An ungraded run is excluded from the pass/total denominator wherever results roll up:

- a case's own `result` dict reports `"total": 0` (not `1`) with `"ungraded": 1` when
  its only run was ungraded — never a fake `"passed": 0` read as a FAIL;
- its `grading.json` expectation entry carries `"ungraded": true` instead of
  `"passed": false`;
- the per-configuration roll-up in `benchmark.json`'s `run_summary` (`with_skill` /
  `without_skill`) computes `pass_rate` only over graded runs and reports the excluded
  count as `"ungraded"` alongside it;
- `compare.py` (below) treats an ungraded run as a **missing sample** — the same
  treatment as a case present on only one side of a comparison — never as a fail; folding
  it in as a fail could manufacture a `CONFIRMED` regression out of nothing but a grader
  hiccup.

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

**Executor model resolution (`kind: "agent"` cases only).** An explicit `--exec-model`
used to be the *only* way to pick the executor's model, so every agent-kind case ran on
whatever one model the caller chose — even though production dispatches each agent on
the model its own frontmatter names (e.g. `plugins/tribe/agents/warchief.md` declares
`model: opus`). Benchmarking `warchief.md` on `sonnet` measures a model production never
runs it on, so any regression conclusion drawn from that run would not transfer.
Precedence, highest first:

1. **`--exec-model`**, if given — overrides everything (still the way to run a cheap
   smoke pass on `haiku` without touching any agent's frontmatter).
2. **The subject agent's frontmatter `model:` value** — a concrete value (`opus`,
   `sonnet`, `haiku`) is passed to the executor as `--model`.
3. **`inherit`** (Claude Code's own frontmatter convention for "use the caller's model"),
   or a missing `model:` key — resolves to the harness default (no `--model` flag passed
   at all), same as giving no model today.

The model actually used is recorded per run in `result.model` in `benchmark.json`, so a
benchmark is self-describing about which model each case ran on. `--grader-model` is
unaffected by any of this — the grader's model is always either `--grader-model` or,
failing that, `--exec-model`/default, exactly as before.

Output lands in `scripts/evals/runs/<UTC-timestamp>/` by default (git-ignored —
reproducible from `evals.json` + this script, not checked in), or under `--out-dir PATH`
(any path, including outside the repo, e.g. a CI artifacts dir): per-case, per-run
`transcript.md` / `metrics.json` / `grading.json` under
`<skill_name>/eval-<id>-<name>/<configuration>/run-<N>/` (1-based `run-<N>`, always
present even for the default `--runs 1`, so repeats never overwrite each other's
evidence), plus one rolled-up `benchmark.json` at the run root.

## Cost note

Each case with `--mode both` spends 4 `claude -p` calls (2 executors + 2 graders), and
executor calls have full tool access — they really do the task, so a slow/tool-heavy
case can run minutes and real tokens. Pin `--exec-model`/`--grader-model` to a cheap
model and use `--eval-id` to scope a smoke pass before running the full suite.

---

## Prompt-tuning mode: A/B one prompt against itself

The with/without benchmark above answers *"does this agent beat vanilla Claude?"*. Editing an
agent's prompt asks a different question — *"did my edit change how it behaves?"* — and that
needs the **same cases run against two versions of the same prompt**. Three pieces do that.

### 1. `prompt_size.py` — the objective metric

What you are trying to move. Bytes and lines are exact; the token column is an explicitly
labelled estimate (no local tokenizer, no network call), which is fine because trimming steers
on *deltas and rank order*, not absolute token counts.

```bash
scripts/evals/prompt_size.py                        # current tribe agents
scripts/evals/prompt_size.py --baseline plugins/tribe/agents --candidate /tmp/cand/agents
```

### 2. `--agents-dir` — the A/B axis

`run_evals.py` used to read agents only from `<plugin>/agents`. Point it at a candidate copy to
run the identical cases against edited prompts:

```bash
cp -r plugins/tribe/agents /tmp/cand-agents
# ... trim /tmp/cand-agents/warchief.md ...

scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json \
  --mode with_skill --runs 3 --jobs 5 --exec-model sonnet \
  --agents-dir /tmp/cand-agents --label trimmed \
  --out-dir scripts/evals/runs/trimmed
```

Each `benchmark.json` records a **sha256 + char count per subject prompt**, so a comparison can
prove the two runs really measured different text rather than trusting the `--label`.

### 3. `compare.py` — the regression tripwire

```bash
scripts/evals/compare.py \
  --baseline scripts/evals/baselines/<name>/benchmark.json \
  --candidate scripts/evals/runs/trimmed/benchmark.json
```

It reports prompt-size delta and pass rate **per agent** (a suite-wide average would bury one
agent's regression under twenty unrelated passes), and splits losses into two buckets that must
not be conflated:

| Bucket | Meaning | Exit |
|---|---|---|
| `CONFIRMED` | passed **every** baseline run, failed **every** candidate run | **1** |
| `UNSTABLE` | flipped, but inconsistently across runs | 0, always printed |

At `--runs 1` every flip is `UNSTABLE` by construction — one sample cannot separate a regression
from model variance. Use `--runs 3` before trusting a trim.

An `ungraded` run (see UNGRADED above) is never one of these two runs of `[true, false, ...]`
per case — `compare.py` drops it before pairing baseline against candidate, the same as a case
present on only one side of the comparison. Treating it as a fail instead could manufacture a
`CONFIRMED` regression (or hide a real one inside `UNSTABLE`) out of nothing but a grader
subprocess that happened to time out.

### Baselines are checked in

`runs/` is git-ignored (regenerable), but a reference `benchmark.json` under
`scripts/evals/baselines/` **is** committed — a trim needs a stable "before", and re-measuring
the baseline every time would let both sides of the comparison drift at once.

**The current comparison root is `scripts/evals/baselines/2026-07-26-prod-models/`** (3 runs
per case, production models, UNGRADED-aware — see its README for the noise floor and
known-invalid cases). `2026-07-25-sonnet/` is retained as history only: 1 run per case means
`compare.py` can never emit CONFIRMED against it, and it predates the case rewrites.

## Two harness bugs this mode required fixing

Both produced **false FAILs** — harness artifacts scored as agent defects. Any regression signal
read off the suite before these fixes was unreliable.

1. **`case["files"]` was parsed but never written to disk.** A case whose prompt named a file ran
   against an empty directory; the agent correctly reported `BLOCKED`, and the grader scored that
   FAIL against a rubric describing behavior on a real file. `materialize_files()` now writes
   fixtures (with a path-traversal guard) before the executor starts.
2. **The executor ran under the default permission mode.** Under `-p` there is no way to answer an
   approval prompt, so **every write was denied** — one observed executor even tried `dd` to get
   around it before giving up. `--permission-mode` (default `bypassPermissions`) fixes it.

> **Security note on the default.** `bypassPermissions` gives each executor unattended tool access.
> Every executor runs in a fresh `mkdtemp` scratch dir that the harness deletes afterwards, with
> user-scope settings and MCP servers already excluded — so the blast radius is that throwaway
> directory. If that trade is wrong for your machine, pass `--permission-mode default`, and expect
> every fixture-carrying case to fail spuriously.

Verified end-to-end: eval 2 went **FAIL -> PASS** on identical prompt text once both were fixed.

## Speed

`--jobs N` (default 4) runs executions concurrently — they are independent subprocesses in
separate temp dirs. Serially a 30-case suite is over an hour, which is slow enough that a gate
stops getting run.
