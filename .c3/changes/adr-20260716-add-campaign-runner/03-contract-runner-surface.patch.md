---
target: c3-215
scope: insert
base: c3-215#n483@v1:sha256:0d72c5b33af258bd408c2228856e6d3b11313dd6dc51cf1794f615b9bfd510eb
---
| scripts/runner/run.ts (campaign runner) | IN | Stateless CLI capability: every environment value is an input (--repo, --state, --model, --answers, --escalations-dir, --logs-dir, --session-timeout, --dry-run, --cards, --max-cards, --include-escalated). Executes staged cards sequentially — one fresh Agent-SDK executor session per card, script-verified SHIPPED, state committed to the target repo. Zero LLM calls in the loop itself; the campaign instance lives in the target repo, never here | bun CLI, repo-invoked (never installed) | plugins/tribe/scripts/runner/run.test.ts |
