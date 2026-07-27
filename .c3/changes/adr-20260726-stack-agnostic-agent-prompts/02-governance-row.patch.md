---
target: c3-215
scope: block
base: c3-215#n1069@v1:sha256:12132dc9df2539161d71de3a5bd4e4b39d1ab8a9d896ebcc5fdd484ba09501f1
---
| rule-no-squash-merge | rule | Every merge the Warchief performs, and the campaign runner's D3 point 2 that verifies it | binding | The agent definitions instructed squash-merge in 12 places, which the runner's 2-parent check rejects — the rule is what keeps agents, runner, and the owner's standing rule on one merge shape |
| rule-stack-agnostic-agent-prompts | rule | Every agent prompt file under `plugins/tribe/agents/*.md` | binding | Added by adr-20260726-stack-agnostic-agent-prompts after tracker.md/skinner.md hardcoded C#/.NET assumptions; keeps future agent-prompt edits checkable against a language-neutral standard |
