---
id: adr-20260903-fix-viewer-launch-docs
c3-seal: 1a361b213491049de8d13b642bcfea3af809308ae8a286ff9e0b66149d906fd2
title: fix-viewer-launch-docs
type: adr
goal: |-
    Fix the runner's `README.md` and the `c3-215` component fact's Contract row for
    `scripts/runner/run.ts (campaign runner)` so both stop claiming a viewer spawn failure is
    "logged to stderr" / "degrades to a stderr line" for the port-unavailable case, which is
    false: a detached, `stdio: 'ignore'` child that starts and then dies to `EADDRINUSE` is
    invisible to the runner — the URL was already printed on stdout before the child could
    fail. The docs must instead say precisely what the runner can and cannot observe.
status: accepted
date: "2026-09-03"
---

## Goal

Fix the runner's `README.md` and the `c3-215` component fact's Contract row for
`scripts/runner/run.ts (campaign runner)` so both stop claiming a viewer spawn failure is
"logged to stderr" / "degrades to a stderr line" for the port-unavailable case, which is
false: a detached, `stdio: 'ignore'` child that starts and then dies to `EADDRINUSE` is
invisible to the runner — the URL was already printed on stdout before the child could
fail. The docs must instead say precisely what the runner can and cannot observe.

## Context

Audit finding F49 (Critical, campaign-live-viewer plan task 14, audit round 1) reproduced
two failure modes named by both docs:

- **Port unavailable**: `probeViewer` returns `false` when the port is held by a
non-viewer process (identity marker mismatch), so `decideViewerLaunch` returns
`kind: 'spawn'` with a non-null `url`, and `cli/main.ts` prints
`campaign viewer: <url> (read-only)` on **stdout** — a false-positive success line, not a
stderr failure line. The child is spawned `detached: true, stdio: 'ignore'`, so its later
`EADDRINUSE` crash is genuinely invisible to the parent; there is no clock/timer budget in
this card to re-probe after spawn.
- **Spawn error** (e.g. `bun` unresolvable, ENOENT): `adapters/viewer-launch.adapter.ts`'s
`child.on('error', () => {})` handler was a silent no-op — nothing was ever logged. This
half IS fixed in code by this same change (a companion Hunter task, not part of this
change-unit's C3 material): the handler now emits one `campaign viewer: failed to start
(continuing): <message>` line to stderr and still never throws.

`.c3/c3-2-plugins/c3-215-tribe.md`'s Contract row for `scripts/runner/run.ts` mirrors the
same false claim ("viewer failure degrades to a stderr line and never affects the
campaign") without distinguishing the two failure shapes.

## Decision

Correct both documents to state, precisely:

- A failure the runner can SEE (viewer entry file missing, `--no-viewer`/`--dry-run` skip, a
thrown error in the launch path, or a spawn `error` event) produces one
`campaign viewer: …` line on stderr, and the run proceeds.
- A detached child that starts and then dies (port held by another, non-viewer process,
`EADDRINUSE`) is invisible to the runner: the URL is already printed on stdout and simply
will not answer — the reader's check is to open the URL or re-run with a different
`--viewer-port`.
- The run itself is never affected either way — that half of the original claim stays true.

No code changes are carried by this change-unit — the adapter fix (`child.on('error', ...)`
now logging) lands in the same commit but through the ordinary source-file edit path, not
through C3 (code is not a frozen fact).

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | Its Contract row for scripts/runner/run.ts states the false "viewer failure degrades to a stderr line and never affects the campaign" claim that must be corrected to distinguish the observable-vs-invisible failure shapes | c3-215#n1555@v1:sha256:cd4fb684d6f032696b02bb4e1f78dac974ac3f1dca1d9dec399b39cecf7b8b59 | Doc-only text correction to an existing row; no topology, boundary, or contract shape changes |

## Verification

| Check | Result |
| --- | --- |
| grep -n "logged to stderr" .c3/c3-2-plugins/c3-215-tribe.md | No match after apply |
| grep -n "EADDRINUSE | invisible" .c3/c3-2-plugins/c3-215-tribe.md |
| plugins/tribe/scripts/runner/README.md's "Never affects the campaign run" bullet | Manually corrected in the same commit to match this ADR's Decision |
