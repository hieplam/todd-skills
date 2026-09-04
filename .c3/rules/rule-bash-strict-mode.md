---
id: rule-bash-strict-mode
c3-seal: f0995afbce1fd26b8f8be2644feb00d50773bb22f5ff7d1c67ce8bb74778a62d
title: bash-strict-mode
type: rule
goal: 'Every shell script in the repo fails fast and loud: unset variables, failed commands, and broken pipelines abort the script instead of silently producing half-done installs, false eval results, or bogus "shipped" verdicts. This holds across all 14 tracked `.sh` files today.'
---

## Goal

Every shell script in the repo fails fast and loud: unset variables, failed commands, and broken pipelines abort the script instead of silently producing half-done installs, false eval results, or bogus "shipped" verdicts. This holds across all 14 tracked `.sh` files today.

## Rule

All shell scripts start with `#!/usr/bin/env bash` followed by `set -euo pipefail`.

## Golden Example

From `install.sh:1` and `install.sh:25` (literal):

```bash
#!/usr/bin/env bash
# install.sh — install todd-skills plugins into ~/.claude via symlinks.
# ... (header comment)                                   // OPTIONAL
set -euo pipefail                                        # REQUIRED — before any logic runs
```

Every script follows this: the shebang is the first line (REQUIRED), `set -euo pipefail` appears before the first command that does work (REQUIRED); intervening comment lines are fine (OPTIONAL).

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| #!/bin/sh | #!/usr/bin/env bash | Scripts use bash-isms (arrays, local, [[); sh on macOS/Linux differs and breaks them |
| No set line, or only set -e | set -euo pipefail | Installer moves user files (.bak backups) and verify-shipped rules on done-ness — an unset var or hidden pipe failure must abort, not continue |
| A function whose last statement is cond && effect (e.g. [[ "$2" == provisioned ]] && mkdir -p …) | End the function with an explicit return 0, or write if cond; then effect; fi | Under set -e the function returns cond's non-zero status when cond is false, and the caller aborts — a later "cleanup" that removes a load-bearing return 0 silently kills the suite (test-fresh-machine.sh's doctor_fixture, PR #121) |

## Scope

Applies to every `*.sh` in the repo (installer, plugin post-install hooks, tribe scripts and their tests, skill helper scripts). Does not apply to Python (`run_evals.py`, `wf-export.py`) or TypeScript sources.

## Override

None expected. A script that genuinely needs to tolerate failing commands should scope it with explicit `|| true` on that command, not by dropping strict mode.
