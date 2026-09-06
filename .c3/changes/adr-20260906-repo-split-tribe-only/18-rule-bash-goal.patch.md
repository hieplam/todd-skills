---
target: rule-bash-strict-mode
scope: block
base: rule-bash-strict-mode#n1960@v1:sha256:cf218a707a61ba5ad906d29dec31f9f4eef92e5faeb9db74e3a75451c41c3c1d
---
Every shell script in the repo fails fast and loud: unset variables, failed commands, and broken pipelines abort the script instead of silently producing half-done installs, false eval results, or bogus "shipped" verdicts. This holds across all 34 tracked `.sh` files today.
