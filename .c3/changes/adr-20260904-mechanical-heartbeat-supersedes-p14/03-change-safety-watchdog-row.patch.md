---
target: c3-215
scope: insert
base: c3-215#n1636@v1:sha256:1b7f41d161fb15d25a201570196216f34a5635e6ee1050182e9e54df6d13fcf6
---
| The watchdog waits forever, relaunches forever, or kills a healthy runner | Editing `core/watchdog/*` | The 48-row action-table test plus the double-driven integration tests | cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit; bash plugins/tribe/scripts/tests/test-watchdog-e2e.sh |
