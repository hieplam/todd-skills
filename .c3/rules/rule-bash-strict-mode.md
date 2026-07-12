---
id: rule-bash-strict-mode
c3-seal: c4dac0f2a723e54607a8e239d265acb695d2edb649c5242cc990add5fe30710b
title: bash-strict-mode
type: rule
goal: 'Every shell script in the repo fails fast and loud: unset variables, failed commands, and broken pipelines abort the script instead of silently producing half-done installs, false eval results, or bogus "shipped" verdicts. This holds across all 10 tracked `.sh` files today.'
---

## Goal

Every shell script in the repo fails fast and loud: unset variables, failed commands, and broken pipelines abort the script instead of silently producing half-done installs, false eval results, or bogus "shipped" verdicts. This holds across all 10 tracked `.sh` files today.

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

## Scope

Applies to every `*.sh` in the repo (installer, plugin post-install hooks, tribe scripts and their tests, skill helper scripts). Does not apply to Python (`run_evals.py`, `wf-export.py`) or TypeScript sources.

## Override

None expected. A script that genuinely needs to tolerate failing commands should scope it with explicit `|| true` on that command, not by dropping strict mode.
