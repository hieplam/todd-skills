---
target: ref-evals-fixture
scope: block
base: ref-evals-fixture#n1612@v1:sha256:f721836fe1202e2368d7d811c32d640cfc55f26882336819d9735bc3a9dbfd04
---
One eval fixture format for every role-behavior and skill-trigger eval in the repo — cases shaped as a prompt plus a prose grading rubric — so a single runner can benchmark all of them and results are comparable across plugins. The recurring need: four plugins ship eval cases; without a shared shape each would need its own runner.

Scope boundary (adr-20260820-detection-eval-standalone-harness): capability benchmarks that grade per seeded convention over a fixture codebase — an answer-key manifest held outside the sandbox, clean/mem arm assembly, recall/precision gates over repetition cells — sit outside this format by owner decision. The one instance is the detection eval at `plugins/tribe/evals/detection/` (own bun runner, `benchmark.json` contract). A future capability benchmark reuses that harness's shape; everything prompt-plus-rubric shaped stays here.
