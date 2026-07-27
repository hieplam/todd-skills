# EFFORT STATE — tribe-status-viewer

**Status:** SHIPPED + migrated — effort complete (2026-07-24)
**Repo:** /Users/todd.lam/WORK/_TestScripts/todd-skills

## Outcome (all independently verified, not agent-claimed)
- PR #51 MERGED to master, merge commit `a660bbbbee71170961a5ce52d99825590baeab8f`, **2 parents verified via `git cat-file`** (regular merge, never squash).
- Grep gate: `.claude/state` appears in runner code only as a historical doc-comment (`core/brief.ts:41`).
- Viewer suite re-run on merged master by the Shaman session: 27 pass / 0 fail.
- Migration EXECUTED for ai-dict (dry-run then real, exit 0): 5 reports → `~/.tribe/-Users-todd.lam-WORK-_TestScripts-ai-dict/campaigns/{least-effort-5,onboarding-category-c}/reports/`; old `.claude/state/*/reports` emptied. Old session logs NOT auto-migrated (caller-chosen `--logs-dir`) — by design.
- Worktree `.claude/worktrees/tribe-status-viewer` removed; branch `feat/tribe-status-viewer` deleted (was 67af438).

## Task status
| Task | Status |
|---|---|
| 1–7 (all plan tasks) | ✅ shipped in PR #51 |
| Migration run (owner directive #6) | ✅ executed for ai-dict |

## Standing changes that bind future work
- Runner CLI now REQUIRES `--home` — every invocation (incl. manual debug) must pass it; orchestrate-campaign injects `--home "$(tribe-home.sh <repo>)/campaigns/<slug>"`.
- Start the viewer: `bun plugins/tribe/scripts/viewer/serve.ts` (defaults: `$HOME/.tribe`, port 4321, 127.0.0.1, refresh = re-poll).
- Migrated historical campaigns have no `runs/` yet → viewer shows NEVER RUN + reports until their first `--home` run writes a run.json.

## Recorded follow-ups (owner to schedule; NOT started)
1. DEBT (skinner, Important): run.json write/finalize failure is silently swallowed; spec §9 wording says "log a warning" — wire through the runner's existing `LogPort.appendLog` seam.
2. Align the agent-dispatch report convention (`agents/hunter.md:48` `~/.tribe/<key>/reports/<card-slug>.md`, no `campaigns/` level) with the campaign tree.

## Evidence trail
- Warchief final report + heartbeats + disposition ledger: `~/.tribe/-Users-todd.lam-WORK-_TestScripts-todd-skills/reports/tribe-status-viewer-warchief.md` (task reports alongside).
- Spec: `docs/superpowers/specs/2026-07-24-tribe-status-viewer-design.md`; Plan: `docs/superpowers/plans/2026-07-24-tribe-status-viewer.md` (both on master via PR #51).
