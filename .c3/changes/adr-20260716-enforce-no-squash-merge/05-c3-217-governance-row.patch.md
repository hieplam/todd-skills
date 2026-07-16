---
target: c3-217
scope: insert
base: c3-217#n571@v1:sha256:1dbed64c3c8399dee1b3f769642bbc9b98a413d602c23264b4b64dd48b5d3468
---
| rule-no-squash-merge | rule | Check 2 (merge_strategy_no_squash) — the parent-count assertion this skill exists to make | binding | This skill asserted the INVERSE (exactly 1 parent = squash) and failed the owner's own correctly-merged PR #37; the rule is the single source of the merge shape it must check |
