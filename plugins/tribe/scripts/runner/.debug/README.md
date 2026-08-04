# `.debug/` — local debugging sandbox (gitignored)

A throwaway `--home` so you can launch the runner without touching a real campaign.

```
.debug/home/
  campaign-state.json   two staged cards: C1 (spec+plan exist -> phase "fresh"),
                        C2 (spec/plan null, dependsOn C1 -> "planning_needed"/blocked)
  answers.md            required to exist by resolveRunContext(); content is free-form
```

Run it by hand (zero side effects — no lock, no writes, no Claude session):

```bash
cd plugins/tribe/scripts/runner
bun run.ts --repo "$(git rev-parse --show-toplevel)" --model sonnet \
           --home "$PWD/.debug/home" --dry-run
```

Same thing under the debugger: VS Code -> Run and Debug -> **"Runner: --dry-run (sandbox home)"**
(`.vscode/launch.json` at the repo root; needs `oven.bun-vscode`).

Zero-install alternative — Bun's own inspector:

```bash
bun --inspect-brk run.ts --repo … --model sonnet --home "$PWD/.debug/home" --dry-run
```

It prints a `debug.bun.sh` URL; open it for a Chrome-DevTools-style debugger in the browser.

**Do not drop `--dry-run` against a real `--repo`.** Without it the runner acquires the
single-instance lock, writes `run.json`/`campaign-state.json`/reports under `--home`, and
spawns a real Claude Agent SDK session that commits and opens PRs
(`adapters/session.adapter.ts`).
