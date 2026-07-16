---
id: c3-3
c3-seal: 6aeb489677fc965d90f1e79823eb2fac4dc59857d30c6f3eee14ccd93033b61a
title: eval-harness
type: container
boundary: service
parent: c3-0
goal: 'Dev-time benchmarking: execute the `evals/evals.json` fixtures that sit next to skills/plugins in this repo against isolated `claude -p` subprocesses, producing graded with-skill vs without-skill evidence (`grading.json`, `benchmark.json`) in the style of the official skill-creator eval loop.'
---

## Goal

Dev-time benchmarking: execute the `evals/evals.json` fixtures that sit next to skills/plugins in this repo against isolated `claude -p` subprocesses, producing graded with-skill vs without-skill evidence (`grading.json`, `benchmark.json`) in the style of the official skill-creator eval loop.

## Components

| ID | Name | Category | Status | Goal Contribution |
| --- | --- | --- | --- | --- |
| c3-301 | eval-runner | foundation | active | The single runner for every eval fixture in the repo: isolates each case in a scratch dir, runs with_skill and --safe-mode baseline legs, grades transcripts, rolls up one benchmark.json |

## Responsibilities

- Discover and run any `plugins/**/evals/evals.json` (`--all`) or a single fixture (`--evals <path>`), for both `kind: "skill"` and `kind: "agent"` cases.
- Guarantee clean-context measurement: with_skill registers the skill for that one subprocess only; without_skill uses `claude -p --safe-mode` so a symlink-installed copy of the skill under test cannot contaminate the baseline.
- Capture cost truthfully from `claude -p --output-format stream-json --verbose` result events (`duration_ms`, `usage`, `total_cost_usd`) — no separate instrumentation.
- Write per-case, per-run `transcript.md` / `metrics.json` / `grading.json` plus one rolled-up `benchmark.json` under `scripts/evals/runs/<timestamp>/` (git-ignored) or `--out-dir`.
- Never edit a skill's or agent's runtime files — read-only against the repo, shelling out in scratch temp directories.
