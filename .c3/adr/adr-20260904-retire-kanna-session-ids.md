---
id: adr-20260904-retire-kanna-session-ids
c3-seal: 11fc0c829431e5395e0e140729ead3b3692d8b5ee30cf8dfff7c3e8bbb12a326
title: retire-kanna-session-ids
type: adr
goal: |-
    Remove the Contract row for the deleted Kanna clipboard-copy script from `c3-215` because the
    surface it documents — the shell script under `plugins/tribe/scripts/kanna/` and its accompanying
    shell test under `plugins/tribe/scripts/tests/` — has been deleted from the repo (`chore(tribe):
    delete the Kanna session-id bridge script and test`, 2026-09-04). The fact must stop claiming a
    script that no longer exists.
status: proposed
date: "2026-09-04"
---

## Goal

Remove the Contract row for the deleted Kanna clipboard-copy script from `c3-215` because the
surface it documents — the shell script under `plugins/tribe/scripts/kanna/` and its accompanying
shell test under `plugins/tribe/scripts/tests/` — has been deleted from the repo (`chore(tribe):
delete the Kanna session-id bridge script and test`, 2026-09-04). The fact must stop claiming a
script that no longer exists.

## Context

The retired script read a campaign state JSON, printed each card's resolved SDK session id, and
best-effort copied them to the clipboard so an owner could paste the list into Kanna's sidebar
Import dialog to watch runner-owned sessions. The campaign live viewer shipped in PR #111
(`scripts/viewer/serve.ts`'s `GET /live` surface, already its own Contract row in `c3-215`) now
tails every card's transcript read-only and is auto-started by the runner, so the manual
copy-into-Kanna path is redundant. Worse, sending a message from Kanna after an import takes over
the session and conflicts with the runner's own resume — the live viewer avoids that failure mode
entirely because it never writes to the session. The owner ruled on 2026-09-04: delete the script
and its test outright, no shim, and repoint the runner README at the live viewer. That deletion
already landed; this ADR authorizes the remaining `c3-215` fact update the deletion left stale —
the Contract row still documents the removed script.

## Decision

Delete the retired script's Contract row from `c3-215` outright rather than rewriting it as
deprecated. The row is a Contract fact — it asserts a script exists at a given path with given
exit codes and behavior. Since the file no longer exists in the repo, any surviving row (even one
marked deprecated) would still be a false claim about the current topology, which is exactly the
kind of drift `.c3/` facts exist to prevent. A clean delete via a block patch is the only mutation
that keeps `c3-215` accurate.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | Its Contract table carries a row for the now-deleted script under plugins/tribe/scripts/kanna/; the row must be removed so the fact no longer documents a nonexistent surface (a table-row cite here would embed a raw pipe delimiter inside this ADR's own table cell, which c3x 11.6.3's serializer cannot round-trip — the same limitation .c3/adr/adr-20260821-explaining-illustration-scope.md records as F23 — so this cites the fact's prose Purpose section instead as proof of the entity) | c3-215#n1588@v1:sha256:41d6e7aed562043a062e505cecc44e3e6a2e77eefb4dbef4cbab9ae009a3466d "Owns the delivery role contracts: who may talk to whom (Owner ⇄ Shaman ⇄ Warchief ⇄ Hunter, adjacent ranks only), which question each role answers, how qu" | This unit's single patch (01-drop-kanna-contract-row.patch.md) is the review |

## Verification

| Check | Result |
| --- | --- |
| bash /tmp/g1-assert.sh | Four ok: lines, exit 0 (was two FAIL: lines naming .c3/c3-2-plugins/c3-215-tribe.md:78, exit 1) |
| bunx @c3x/cli@11.6.3 check --only c3-215 | Checked ... docs — all clear, exit 0 |
| bunx @c3x/cli@11.6.3 check | Checked ... docs — 2 errors naming only the inherited c3-213 and c3-216, exit 1 (unchanged from base) |
| pre-gate.sh suite sweep (bash plugins/tribe/scripts/pre-gate.sh --repo "$PWD" --range HEAD..HEAD --tests-dir plugins/tribe/scripts/tests --report /tmp/pregate-task2.md) | Same suite set and same two inherited red suites as Task 1's run, no new red suite |
