# Idea card: `.tribe/` — the tribe's persistent home inside the consuming repo

- **Status:** captured for a future campaign (owner directive, 2026-07-12). Not yet specced.
- **Owner ruling context:** raised mid implementation-campaign; current campaign keeps its
  already-briefed report path (`~/.claude/tribe-reports/impl/`), this card governs everything after.

## What

Every tribe artifact that must **persist across agent deaths, session restarts, and host reboots**
lives in a `.tribe/` directory at the root of the repo the tribe is working on — not in the user's
home dir, not in `/tmp`.

First resident: **`.tribe/reports/`** — Warchief heartbeat/report files (one per card,
ISO-8601-timestamped milestone lines; the file `heartbeat-check.sh` reads). Example: when the
tribe plugin runs inside the `memo` repo, its reports live at `memo/.tribe/reports/idea-NN.md`.

From then on, "needs to persist and is tribe-related" defaults to `.tribe/` (operational state,
future: campaign frames, resume snapshots). Committed *contract* artifacts (specs, plans,
Decision Log, CODEX.md, idea-10's findings ledger) stay under `docs/tribe/` — contracts are
reviewable history; `.tribe/` is operational runtime state.

## Why

1. **Reboot survival, proven the hard way.** The planning campaign's reports lived in the `/tmp`
   scratchpad; a host crash wiped every heartbeat and the campaign frame, forcing forensic
   reconstruction from git. Home-dir storage (`~/.claude/tribe-reports/`) fixed reboot-survival
   but has the remaining flaws below.
2. **Locality.** Reports about repo X live in repo X. A repo's campaigns are self-contained:
   clone dir, `ls .tribe/reports/`, and any fresh Shaman/Warchief finds the operational state
   without knowing session-specific scratchpad paths or the machine's home layout.
3. **No cross-project bleed.** `~/.claude/tribe-reports/` mixes every project's campaigns in one
   global folder; `.tribe/` scopes them per repo, and deleting a repo deletes its residue.

## Design questions to settle at spec time

- **Gitignore or commit?** Default proposal: ship a `.tribe/.gitignore` (`*`, `!.gitignore`) so
  operational state never lands in PRs by accident — heartbeats are noisy and per-run. The owner
  may instead want reports committed per campaign for auditability; decide at spec time
  (interaction: idea-10's meta-loop reads report files as recurrence evidence — if reports are
  ignored, the findings **ledger** in `docs/tribe/ledger/` must carry everything idea-10 needs).
- **Who creates it?** Warchief step 1 (intake) and Shaman dispatch both `mkdir -p` it, so either
  side can go first; `install.sh` untouched.
- **Path resolution.** Report-file paths in dispatches become repo-relative
  (`<repo-root>/.tribe/reports/<card>.md`); `heartbeat-check.sh`/`resume-check.sh` take the same
  absolute path as today — no script change expected, only convention text in `warchief.md`
  (Channels), `shaman.md` (Channels & liveness), `hunter.md` (report path comes from the brief).
- **Interaction with idea-09 (ephemeral warchief):** the HANDOFF sentinel line lives in the report
  file — `.tribe/reports/` makes that file discoverable by the re-dispatched instance from the
  repo alone, strengthening 09.

## Touchpoints when implemented

`plugins/tribe/agents/warchief.md`, `shaman.md`, `hunter.md` (report-path convention text),
`plugins/tribe/README.md` (document `.tribe/`), possibly a `.tribe/.gitignore` template shipped
by the plugin. No behavior change to heartbeat/resume scripts.
