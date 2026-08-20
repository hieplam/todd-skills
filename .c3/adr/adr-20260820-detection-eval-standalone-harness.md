---
id: adr-20260820-detection-eval-standalone-harness
c3-seal: 86acdd33922ee1e25cf546e5ba2a1f317135a8cc6dafeed4a269930f127acc90
title: detection-eval-standalone-harness
type: adr
goal: 'Record the owner-decided scope boundary of `ref-evals-fixture`: the shared `evals.json` fixture format governs role-behavior and skill-trigger evals only, and the new detection-eval capability benchmark (`plugins/tribe/evals/detection/`, merged in PR #101, commit 8a0ac32) deliberately lives OUTSIDE that format as a standalone harness — so future audits read the standalone harness as a recorded decision, not as drift against the ref''s "one format for everything" claim.'
status: accepted
date: "2026-08-20"
---

## Goal

Record the owner-decided scope boundary of `ref-evals-fixture`: the shared `evals.json` fixture format governs role-behavior and skill-trigger evals only, and the new detection-eval capability benchmark (`plugins/tribe/evals/detection/`, merged in PR #101, commit 8a0ac32) deliberately lives OUTSIDE that format as a standalone harness — so future audits read the standalone harness as a recorded decision, not as drift against the ref's "one format for everything" claim.

## Context

`ref-evals-fixture` promises "One eval fixture format for every skill and agent in the repo, so a single runner can benchmark all of them" — and until now that held: 4 plugins ship `evals.json` cases and `scripts/evals/run_evals.py` runs them all. PR #101 added a different kind of eval under c3-215 (tribe): a detection benchmark that seeds 10 unwritten conventions + 3 decoys into a fixture codebase (`fixtures/orderly/`), runs the real scout/tracker agent definitions via `claude -p` in clean/mem sandbox arms, and grades per seeded convention into recall/precision with numeric gates (G1–G5, 2-of-3 repetitions per cell, top-level pass in `benchmark.json`). Its grading unit is *per convention with an answer-key manifest held outside the sandbox*, not *per case with a prose rubric* — the `evals.json` shape (`id/name/prompt/expected_output/files`) cannot carry a fixture directory, an answer key that must not enter the sandbox, arm assembly, or cell-level pass math. The owner explicitly chose a standalone harness over extending `run_evals.py` (design Q&A, 2026-08-20; spec `docs/superpowers/specs/2026-08-20-detection-eval-design.md` §Governance note). Without a recorded decision, `ref-evals-fixture`'s universal Goal claim and the shipped harness contradict each other and every future audit re-discovers the mismatch.

## Decision

Amend `ref-evals-fixture`'s Goal section to scope its "one format, one runner" claim to role-behavior and skill-trigger evals (prompt + prose-rubric shaped), and to name the recorded exception: capability benchmarks that grade per seeded convention over a fixture codebase live in their own harness, with `plugins/tribe/evals/detection/` as the one instance; a future capability benchmark reuses that harness's shape rather than forcing the `evals.json` format. This wins over the alternatives because (a) extending `run_evals.py` was explicitly rejected by the owner at design time, and (b) leaving the ref untouched makes `c3x` audits and the tracker's rule review flag PR #101's layout as unexplained drift forever. One `block` patch on the Goal section; Choice/Why/How stay frozen because the format they document is unchanged for its remaining scope.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| ref-evals-fixture | N.A - ref (governance doc, not topology; the fact this unit amends) | Its Goal claims one fixture format for every eval in the repo; the detection benchmark is now a recorded exception | ref-evals-fixture#n1596@v1:sha256:f721836fe1202e2368d7d811c32d640cfc55f26882336819d9735bc3a9dbfd04 "One eval fixture format for every skill and agent in the repo" | This unit's Goal patch is the review |
| c3-215 | component | Owns the detection harness (plugins/tribe/evals/detection/) that motivates the scope boundary; its Governance table binds it to ref-evals-fixture for agent-kind eval cases, which remain in force for plugins/tribe/evals/evals.json | c3-215#n1401@v1:sha256:39c5147f361f33a95ead5dd858c067d4bbd86a45ed183c27c6e59c5a77936db7 "Agent-kind eval cases" | No c3-215 body change in this unit; its broader PR #101 drift (new Contract surface) is follow-up bookkeeping, out of this unit's scope |

## Verification

| Check | Result |
| --- | --- |
| c3x change apply adr-20260820-detection-eval-standalone-harness lands the Goal patch atomically | apply reports the unit applied; c3x read ref-evals-fixture --section Goal shows the scope boundary naming plugins/tribe/evals/detection/ |
| c3x check after apply | no violations introduced by this unit |
| The exception it records exists as shipped code | git -C . show --no-patch --format="%H %P" 8a0ac32 shows the 2-parent merge of PR #101; plugins/tribe/evals/detection/run.ts exists on master |
