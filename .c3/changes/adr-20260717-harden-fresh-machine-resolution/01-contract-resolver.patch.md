---
target: c3-215
scope: insert
base: c3-215#n1149@v1:sha256:970d5ffe99602a2772a94b397df02b3750be76908960deefae87c5ad35224815
---
| skills/orchestrate-campaign/resolve-runner.sh | IN | Resolves the campaign runner's directory and fails CLOSED. Prints an absolute path on stdout and exits 0 ONLY after proving `run.ts` exists there; otherwise prints nothing and exits 3 with a named diagnostic. Honours `$CLAUDE_PLUGIN_ROOT` first but only once proven, so a stale or foreign value falls through rather than winning on presence; otherwise locates itself via `cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P`, resolving the install symlink to its physical home in the repo. Never dereferences `~`, so an unrelated or empty HOME cannot influence it, and it can never emit a relative path. Because it ships inside the skill directory it travels with the symlink install: a moved repo takes the script with it, so bash fails loudly instead of a wrong path being computed. Callers take exit 3 at face value and stop — substituting a guess reintroduces the bug it exists to prevent | bundled skill script (symlinked with the skill dir) | plugins/tribe/scripts/tests/test-fresh-machine.sh |
