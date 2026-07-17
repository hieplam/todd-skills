---
target: c3-215
scope: insert
base: c3-215#n1149@v1:sha256:970d5ffe99602a2772a94b397df02b3750be76908960deefae87c5ad35224815
---
| scripts/doctor.sh | IN | Preflights the per-machine prerequisites the runner needs but the repo cannot carry: `bun` (the runner is TypeScript executed directly), `gh` plus its auth (PR state), Agent SDK credentials (an API key or an existing Claude Code login), and the runner's `node_modules/` (gitignored, so absent on a fresh clone). Reports EVERY gap in one pass with the command that fixes it, never fatal-on-first-miss, so a machine is provisioned in a single pass. Exits 0 when all are present, else 1. Run once per campaign before the first real run: a fresh clone can install with zero warnings and still fail hours into an unattended run, because these are provisioned per machine rather than per repo. Never installs anything itself — the plugin's boundary is linking, not provisioning | shell script, repo-invoked (never installed) | plugins/tribe/scripts/tests/test-fresh-machine.sh |
