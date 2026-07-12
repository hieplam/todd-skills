---
id: c3-301
c3-seal: ee26155311cdb296204771c248111f7f3f5eb832fd60b8ae029f5e757c018fc4
title: eval-runner
type: component
category: foundation
parent: c3-3
goal: Execute every `evals/evals.json` fixture in isolated `claude -p` subprocesses and grade the transcripts into with/without-skill benchmarks.
uses:
    - ref-evals-fixture
    - ref-plugin-layout
---

## Goal

Execute every `evals/evals.json` fixture in isolated `claude -p` subprocesses and grade the transcripts into with/without-skill benchmarks.

## Parent Fit

| Field | Value |
| --- | --- |
| Container | c3-3 eval-harness — dev-time Python boundary |
| Category | Foundation — the shared runner all plugin eval fixtures depend on |
| Role in parent | The container's only component: scripts/evals/run_evals.py plus its README and git-ignored runs/ output dir |
| Depends on siblings | None in-container; consumes fixtures owned by c3-2 plugins |

## Purpose

Owns the measurement methodology: isolation flags, baseline definition, metric capture, and grading. Non-goals: it never edits skill/agent runtime files, never defines what "correct" is (that lives in each fixture's `expected_output` rubric), and its outputs are reproducible artifacts, not checked-in state.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Precondition | claude CLI on PATH; fixture files in the shared evals.json shape | N.A - see scripts/evals/README.md |
| Inputs | --evals <path> or --all; flags --mode, --runs, --timeout, --exec-model, --grader-model, --eval-id, --out-dir, --dry-run | N.A - see scripts/evals/README.md Usage |
| State | Scratch temp dir per case; output tree scripts/evals/runs/<UTC-timestamp>/ (git-ignored) | N.A - see scripts/evals/.gitignore |
| Shared dependencies | evals.json fixture shape; claude -p stream-json result events for metrics | ref-evals-fixture |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | One benchmark.json rollup + per-case/per-run transcript.md, metrics.json, grading.json | ref-evals-fixture |
| Primary path | Per case: with_skill leg (skill registered for that subprocess only, or agent passed via --agents) → without_skill leg (claude -p --safe-mode) → tool-less grader call scores transcript against expected_output | N.A - see README |
| Alternates | Single-leg runs via the mode flag; case scoping via eval-id; dry-run prints the plan without spending | N.A - flags documented in scripts/evals/README.md |
| Failure behavior | Per-call --timeout; stream-json chosen specifically because plain json starves with_skill grading of transcript evidence under isolation flags | N.A - see README "What it does" |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-evals-fixture | ref | The input format it parses; kind: skill vs kind: agent handling | binding | Runner was built to the pre-existing fixture shape |
| ref-plugin-layout | ref | Where fixtures live (plugins/**/evals/) and that they are dev-only | advisory | Mirrors the installer's refusal to symlink evals/ |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| run_evals.py --evals/--all [flags] | IN | CLI documented in README; exit after writing rollup | Python CLI | scripts/evals/README.md Usage |
| plugins/**/evals/evals.json | IN | Shared fixture shape; kind: agent cases name agents/<name>.md | JSON file | ref-evals-fixture |
| runs/<ts>/**/benchmark.json, grading.json, metrics.json, transcript.md | OUT | 1-based run-<N> dirs so repeats never overwrite evidence; metrics come from claude's own result events | filesystem | scripts/evals/README.md |
| claude -p subprocesses | OUT | Never the current session; with_skill = scoped registration, without_skill = --safe-mode | subprocess | scripts/evals/README.md |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Baseline contamination (skill fires in without_skill leg) | Weakening --safe-mode / isolation flags | with/without deltas collapse to ~0 across all cases | Run scripts/evals/run_evals.py on a known-good fixture and confirm the legs diverge |
| Evidence starvation | Switching --output-format away from stream-json | grading.json verdicts lack transcript/tool-call evidence | Inspect a with_skill scripts/evals/runs/<ts>/**/grading.json for evidence fields |
| Runaway cost | Raising --runs / removing model pins in smoke passes | Wall-clock and total_cost_usd spikes in metrics | Smoke pass first: scripts/evals/run_evals.py --eval-id 1 --exec-model haiku (cost note in scripts/evals/README.md) |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| benchmark.json rollups | Contract section (the claude -p subprocess surface supplies all metrics) and Governance row ref-evals-fixture | No separate instrumentation permitted | scripts/evals/README.md |
