---
target: c3-215
scope: insert
base: c3-215#n490@v1:sha256:dd641590a52398b0195988e63990d394839df66bc2aaf0ae9600d3980a00eac6
---
| Runner accepts an unshipped card, or wedges the campaign | Editing verify.ts (the D3 six-point replay), github.ts (D6 retry/waiver), or any gh/git invocation in the runner | Mocked seams validate logic but NOT the commands: `gh api pulls/<pr>` 404d in reality while 25 tests passed, which would have failed every card forever. A wrong invocation is invisible to the suite | cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit; plus execute any changed gh/git command against a real repo before trusting it |
