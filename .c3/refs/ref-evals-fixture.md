---
id: ref-evals-fixture
c3-seal: fdd2a7c8977d8aedb34db5bebc33245199cb5b989f05b6564c584f67cfec1fa0
title: evals-fixture
type: ref
goal: |-
    One eval fixture format for every role-behavior and skill-trigger eval in the repo — cases shaped as a prompt plus a prose grading rubric — so a single runner can benchmark all of them and results are comparable across plugins. The recurring need: four plugins ship eval cases; without a shared shape each would need its own runner.

    Scope boundary (adr-20260820-detection-eval-standalone-harness): capability benchmarks that grade per seeded convention over a fixture codebase — an answer-key manifest held outside the sandbox, clean/mem arm assembly, recall/precision gates over repetition cells — sit outside this format by owner decision. The one instance is the detection eval at `plugins/tribe/evals/detection/` (own bun runner, `benchmark.json` contract). A future capability benchmark reuses that harness's shape; everything prompt-plus-rubric shaped stays here.
---

## Goal

One eval fixture format for every role-behavior and skill-trigger eval in the repo — cases shaped as a prompt plus a prose grading rubric — so a single runner can benchmark all of them and results are comparable across plugins. The recurring need: four plugins ship eval cases; without a shared shape each would need its own runner.

Scope boundary (adr-20260820-detection-eval-standalone-harness): capability benchmarks that grade per seeded convention over a fixture codebase — an answer-key manifest held outside the sandbox, clean/mem arm assembly, recall/precision gates over repetition cells — sit outside this format by owner decision. The one instance is the detection eval at `plugins/tribe/evals/detection/` (own bun runner, `benchmark.json` contract). A future capability benchmark reuses that harness's shape; everything prompt-plus-rubric shaped stays here.

## Choice

`evals/evals.json` next to the skill (or at `plugins/tribe/evals/evals.json` for agents): `{"skill_name", "kind": "skill"|"agent", "evals": [{"id", "name", "agent" (agent-kind only), "prompt", "expected_output", "files"}]}` — where `expected_output` is a prose grading rubric, not a literal string match.

## Why

This mirrors the official skill-creator eval loop (`evals.json` → isolated-subagent run → `grading.json` with evidence → `benchmark.json` with/without comparison) instead of inventing a new harness — `scripts/evals/README.md` states this as the design premise. `refactor-for-testability` shipped 3 well-formed cases in this shape before any runner existed; the runner was built to that shape, and the `kind: "agent"` extension let tribe's 5 agent definitions join the same harness with one extra field instead of a second format.

## How

From `plugins/tribe/evals/evals.json` shape (documented in `scripts/evals/README.md`):

```json
{
  "skill_name": "example-skill",
  "kind": "skill",                    // REQUIRED conceptually; "skill" is the default, omit-able
  "evals": [
    {
      "id": 1,                        // REQUIRED
      "name": "short-slug",           // REQUIRED
      "agent": "hunter",              // REQUIRED only when kind: "agent" — names agents/<name>.md
      "prompt": "the task given to the model",          // REQUIRED
      "expected_output": "prose rubric of correct behavior", // REQUIRED
      "files": []                     // OPTIONAL fixture files
    }
  ]
}
```
