---
target: ref-evals-fixture
scope: block
base: ref-evals-fixture#n1946@v1:sha256:4ae0172f1dd33819a706b7e1331b7e6ff2c2b19cbf74e74f0cf0d34c72d73b73
---
This mirrors the official skill-creator eval loop (`evals.json` → isolated-subagent run → `grading.json` with evidence → `benchmark.json` with/without comparison) instead of inventing a new harness — `scripts/evals/README.md` states this as the design premise. The first fixture written in this shape shipped 3 well-formed cases before any runner existed; the runner was built to that shape, and the `kind: "agent"` extension let tribe's agent definitions join the same harness with one extra field instead of a second format.
