# Spec — ADRs whose work shipped stop saying `status: proposed`

**Card:** `adr-status-flip-shipped` · **Campaign:** `followups-2026-09-04` · **Shaman spec, 2026-09-04** · base: latest `origin/master` after `adr-illustration-scope-pipe-cell` merges
**Card file:** `~/.tribe/-Users-hip-repo-todd-skills/campaigns/followups-2026-09-04/cards/adr-status-flip-shipped.md`

## Problem, grounded

Grounded 2026-09-04 on `a9a6e7b`: `grep -l '^status: proposed' .c3/adr/*.md` lists six files
whose decided work merged long ago:

| ADR | Shipped evidence on master |
| --- | --- |
| `adr-20260726-stack-agnostic-agent-prompts` | PR #57, merge `3f52f03` |
| `adr-20260727-harness-gap-detection` | PR #59, merge `67cc16b` |
| `adr-20260728-purity-golden-standard` | PR #61, merge `a1aa6ed` |
| `adr-20260730-scout-ruling-loop` | PR #65, merge `1edfba4` |
| `adr-20260801-campaign-state-home-migration` | commits `43a9b16`, `c43dce4`, `2eb2372` |
| `adr-20260904-retire-kanna-session-ids` | PR #113, merge `d1ec881` |

A reader of the architecture record cannot tell a shipped decision from a pending one. PR #115's
Task 4/4 (`dbc6010`, "flip both 20260904 derived-materials ADRs to accepted") set the precedent:
per file, `status: proposed` → `status: accepted` and the regenerated `c3-seal` — two changed
lines, nothing else.

`bunx @c3x/cli@11.6.3 change status <id>` reports all 14 patches across the six change-units as
`drifted` (anchors stale), `applied 0`. That output is therefore no evidence either way about
whether the decisions are realised; the target facts' content is.

## Oracle

This spec is the contract. An ADR may be flipped only when both hold: (a) its shipped evidence
above is an ancestor of the branch base; (b) for every patch under `.c3/changes/<adr-id>/`, the
after-state the patch intends (the block it inserts or replaces, the frontmatter edge it adds,
or the row it deletes) is present in — or, for a delete, absent from — the target fact today,
checked by reading the fact's content. An ADR failing (a) or (b) stays `proposed`, and the PR
names the patch whose after-state is missing. Flipping without (b) is a bug; force-applying a
drifted patch to make (b) true is out of scope and a bug in this card.

## The change

### C1 — verify realisation per ADR (Warchief-run, recorded)

For each of the six: confirm (a) with `git merge-base --is-ancestor <sha> HEAD`; confirm (b) by
opening each `*.patch.md` under `.c3/changes/<adr-id>/`, extracting the intended after-state, and
grepping the target fact for it (for a delete patch, grepping that the row is gone). Record a
six-row table (ADR · evidence sha · patches · verdict) in the PR body.

### C2 — flip the realised ones

Card decision D1: first try `bunx @c3x/cli@11.6.3 change accept <adr-id>` (the tool's own
"status → accepted" command). If it refuses (for example because the patches are drifted), use
the `dbc6010` precedent: edit the frontmatter line to `status: accepted`, then run
`bunx @c3x/cli@11.6.3 repair` to regenerate the seal. Either way the per-file diff must be exactly
the status line plus the `c3-seal` line. Record which mechanism each ADR took. If `accept` or
`repair` touches any file outside the six ADRs, discard that churn (card D3) and report it.

### C3 — prove the tree is clean

`bunx @c3x/cli@11.6.3 check` exits 0 "all clear" on the branch;
`grep -l '^status: proposed' .c3/adr/*.md` lists only the ADRs C1 left proposed (expected: none).

## Scope fence

**IN:** the six ADR files named above, this spec, its plan. **OUT:** every other `.c3/` file
(including `adr-20260821-explaining-illustration-scope.md`, owned by the preceding card); the
`.c3/changes/` folders; `c3.db*`; every fact; every file the live `feat/i74-mechanical-heartbeat`
branch touches (it adds its own ADR and change-unit under `.c3/` — leave them alone).

## Testing strategy

No test file; the proof is tool output and diffs: the C1 table, `git diff --stat` showing six
files × 2 lines, `check` exit 0, and the `grep -l` result before (6 files) and after.

## Evidence plan

PR body: the C1 realisation table; per-ADR mechanism (`change accept` or edit+`repair`); the
before/after `grep -l` output; the `check` transcript; `git diff --stat`.

## Risks and rollback

`change accept` may have side effects beyond the status line in 11.6.3 (it "records the one
stored human judgment"); the per-file 2-line diff is the guard — anything more is discarded and
reported. Rollback is one commit.

## Adjudication rule (for the auditors)

REFUTED in advance: a finding that the patches are `drifted` so the ADRs "are not applied" — the
oracle is content presence in the fact, by design, and the drifted patch state is recorded as a
follow-up for the Shaman, not fixed here; a finding that an ADR should be flipped to a status
other than `accepted` — this repo uses exactly `proposed`/`accepted` (see `dbc6010`).
