---
target: ref-evals-fixture
scope: block
base: ref-evals-fixture#n1632@v1:sha256:fb8e9cf86e0bd6e6c4a7a8ad5dac6401d24087de7026be640a2f54a0d73c2683
---
`evals/evals.json` next to the skill (or at `plugins/tribe/evals/evals.json` for agents): `{"skill_name", "kind": "skill"|"agent", "memory_fixture" (optional, top-level — a path to a CLAUDE.md fixture the `--arm mem` axis writes to the scratch cwd), "evals": [{"id", "name", "agent" (agent-kind only), "prompt", "expected_output", "files" (each entry may carry "source": a repo-relative path read instead of an inlined "content"), "checks" (optional — machine commands whose exit code decides pass/fail/ungraded before any LLM grader runs), "artifacts" (optional — glob patterns preserved from the scratch dir as evidence)}]}` — where `expected_output` is a prose grading rubric, not a literal string match.
