---
target: rule-bash-strict-mode
scope: block
base: rule-bash-strict-mode#n1965@v1:sha256:e3945f3598cc69005f8ecd6201c2a4bb5adafda91c183021a57843c1efeb9824
---
bash
#!/usr/bin/env bash
# install.sh — install the tribe repo's plugins into ~/.claude via symlinks.
# ... (header comment)                                   // OPTIONAL
set -euo pipefail                                        # REQUIRED — before any logic runs
