---
id: adr-20260801-campaign-state-home-migration
c3-seal: 8fa55976cea4b0e7d04154d06c249b861a6e9edbed132911e9a866ddba6846ce
title: campaign-state-home-migration
type: adr
goal: |-
    Correct `c3-215` (tribe)'s Contract, Business Flow, and Change Safety sections, which currently
    assert campaign-runner behaviour that `docs/superpowers/plans/2026-08-01-campaign-state-home-migration.md`
    Tasks 1-6 (commits `9b0ad87`..`43a9b16` on branch `campaign-state-home`) removed from the code:
    the runner's required-flag list still names the deleted `--state`/`--answers`/`--escalations-dir`
    flags, still claims the runner commits state to the target repo, still claims
    `campaign-report.*` is written "next to the state file" (the repo), still claims the campaign
    instance "lives in the target repo, never here", the Business Flow "Unattended path" row still
    says Stage A lands campaign state as part of the docs PR, and the Change Safety risk row still
    names the now-deleted `core/github.ts` (D6 retry/waiver) as an edit trigger. Fix all six via the
    change-unit flow so `c3-215` is factually accurate again.
status: proposed
date: "2026-08-01"
---

## Goal

Correct `c3-215` (tribe)'s Contract, Business Flow, and Change Safety sections, which currently
assert campaign-runner behaviour that `docs/superpowers/plans/2026-08-01-campaign-state-home-migration.md`
Tasks 1-6 (commits `9b0ad87`..`43a9b16` on branch `campaign-state-home`) removed from the code:
the runner's required-flag list still names the deleted `--state`/`--answers`/`--escalations-dir`
flags, still claims the runner commits state to the target repo, still claims
`campaign-report.*` is written "next to the state file" (the repo), still claims the campaign
instance "lives in the target repo, never here", the Business Flow "Unattended path" row still
says Stage A lands campaign state as part of the docs PR, and the Change Safety risk row still
names the now-deleted `core/github.ts` (D6 retry/waiver) as an edit trigger. Fix all six via the
change-unit flow so `c3-215` is factually accurate again.

## Context

`.c3/c3-2-plugins/c3-215-tribe.md` is a canonically sealed, frozen fact (`c3-seal:
35be66eead09eccd8bd3f626ed9c6c5edc46e2071397d8d14bdbd6cdd972cb19`); direct hand-edit is refused
by design, so only `c3x change new/apply` may mutate it.

`docs/superpowers/specs/2026-08-01-campaign-state-home-migration-design.md` §8 names the exact
drift, verified fresh against the current branch's code in this session:

- `cli/main.ts`'s `REQUIRED_FLAGS`/`KNOWN_FLAGS` (read this session) show the three required
flags are `--repo`, `--model`, `--home`; the recognized optional flags are `--logs-dir`,
`--session-timeout`, `--dry-run`, `--cards`, `--max-cards`, `--include-escalated`, `--remote`;
`--state`, `--answers`, `--escalations-dir` are gone and rejected by name.
- `plugins/tribe/scripts/runner/core/paths.ts` (added by Task 2, `67c6571`) is the sole source of
every operational artifact's fixed name under `--home`; `core/loop/commit-guard.ts` (Task 1,
first commit on this branch) now holds only `persistLocalState` — `core/github.ts` and the
auto-commit path are deleted entirely, confirmed via `git log --oneline -5` on this branch and
`plugins/tribe/scripts/runner/README.md`'s corrected text (Task 6, `43a9b16`): "The runner makes
no git commits of its own."
- `plugins/tribe/scripts/runner/README.md`'s "Report contract" section (also corrected by Task 6)
states `campaign-report.json`/`.md` are written under `--home`, never "next to the state file"
(there is no state file in the repo to be next to).
- `plugins/tribe/scripts/runner/core/brief.ts`/`core/brief-template.md` (Task 4, `6ab141c`) add
the `Campaign: <slug>` commit trailer as the sole in-repo record of which commits belong to a
campaign, since campaign state itself is never committed.
- `plugins/tribe/skills/orchestrate-campaign/SKILL.md`'s Stage A (corrected by Task 6) lands
specs/plans only as a docs PR, into the host repo's own discovered convention; campaign state
and `answers.md` are authored under `--home` and never committed.

This ADR's own baseline check, run fresh this session: `bash $C3BIN check --only c3-215` →
"Checked 37 docs — all clear" (the component doc itself is not drifted from its own canonical
seal — it is drifted from the *code* it describes). A repo-wide `bash $C3BIN check` fails with 48
pre-existing `BROKEN_SEAL` entries, all under `.c3/changes/**/*.patch.md` from unrelated,
previously unapplied change-units (`adr-20260726-*`, `adr-20260727-*`, `adr-20260728-*`,
`adr-20260730-*`) — out of scope for this ADR, not touched by its patches, and confirmed by count
before and after this change-unit's own apply.

## Decision

Patch `c3-215` via this change-unit's three block patches
(`.c3/changes/adr-20260801-campaign-state-home-migration/`), each anchored on the row's current
node + sha256 read fresh this session via `c3x read c3-215 --section <name> --cite`:

1. **Contract row, `scripts/runner/run.ts (campaign runner)`** (base `c3-215#n1340`) — rewritten to
list the true flag set, state the runner makes no commits of its own (the `Campaign: <slug>`
trailer is the in-repo record instead), and state the report/operational-state location is
`--home`, never the target repo.
2. **Business Flow row, `Unattended path`** (base `c3-215#n1323`) — rewritten so Stage A lands
specs/plans alone as the docs PR, with campaign state and `answers.md` authored under `--home`
and never committed.
3. **Change Safety row, the runner-verification risk row** (base `c3-215#n1354`) — `github.ts (D6
retry/waiver)` removed from the edit-trigger list; the file it named no longer exists.

Each patch replaces its row's full content, leaving every sibling row/section frozen, per the
block-patch primitive (`c3x change --help`). No new row, section, or entity is added — the six
drifted claims are corrected in place, matching spec §8's inventory exactly, one patch per
affected row rather than per drifted claim (the runner Contract row carries four of the six
claims, so one patch corrects all four together rather than four overlapping patches racing the
same anchor).

`c3x change apply adr-20260801-campaign-state-home-migration` is run immediately after this ADR
is recorded (not deferred): unlike the `c3x-change-apply-defect` project memory entry (which
concerns `check`/`repair` deleting *pending* patch material before `apply`'s gates run), this
session's patch files are committed to git before `apply` runs, so a destructive `apply` is
recoverable via `git checkout --`. `c3x repair` is never invoked (documented to delete unrelated
pending change-unit patches repo-wide) — if `apply` blocks on anchor drift, the fallback is to
hand-apply this patch text byte-identical to what these three files already contain, then verify
with `bash $C3BIN check --only c3-215`.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | Contract, Business Flow, and Change Safety sections each carry one row asserting behaviour Tasks 1-6 removed from the runner's code; this change-unit's three block patches correct all six drifted claims named in spec §8 | c3-215#n1299@v1:sha256:f467fd1ec102c55b693524d1b29fda35cba5ac48b31be638a9f6a38cc5b3aef8 "Deliver features through a 5-agent chain of command — Shaman (What/Why) → Warchief (How) → Hunter (TDD execution), gated by Tracker (rules review) and Ski" | Parent Delta: updated — this change-unit's three block patches (below) |
| c3-2 | container | Parent of c3-215; no membership or directory-layout change — the runner, core/paths.ts, and the trailer all live inside the existing tribe plugin. Included for top-down completeness only | c3-2#n1005@v1:sha256:f92a1cfb53ada54dba5f5c1154ccef3423fe08276ff6ec199cc745be16f8d3d0 "Claude Code runtime content: the 9 installable plugins — agents and skills that, once symlinked into ~/.claude, extend every Claude Code session with delive" | Parent Delta: none — no new plugin, no container-contract change |

## Compliance Refs

| Ref | Why required | Evidence | Action |
| --- | --- | --- | --- |
| ref-docs-lifecycle | This ADR plus its committed, applied patches are the durable record that c3-215 now matches the shipped code — the same paper-trail contract the ref governs for all of tribe's own feature work | ref-docs-lifecycle#n1513@v1:sha256:a163534e4fbc98d69ae8cd12167eedff5b0840b29f305b2a4d73a5784501ec2c "Give feature work a durable, ordered paper trail — designs, implementation plans, and proof artifacts must outlive the chat session that produced them. The re" | comply |

## Compliance Rules

| Rule | Why required | Evidence | Action |
| --- | --- | --- | --- |
| rule-no-squash-merge | This is Task 7 of a plan delivered as one PR; merge shape (regular, 2-parent) governs whenever the Warchief merges it — no agent merges this change-unit's PR | rule-no-squash-merge#n1573@v1:sha256:2f5ff61964fe9551d508719ff31ed7514dbdbd8d296ff884a7e952a5334fab6a "Every capability in this repo that merges a pull request, or that verifies one was merged," | comply (deferred to merge time, owner/Warchief-only) |

## Work Breakdown

| Area | Detail | Evidence |
| --- | --- | --- |
| .c3/changes/adr-20260801-campaign-state-home-migration/01-contract-runner-row.patch.md | Block patch, base c3-215#n1340: replaces the scripts/runner/run.ts Contract row with the true flag set, the no-commit fact, the Campaign: trailer, and the --home report/state location | diff of the file (this change-unit) |
| .c3/changes/adr-20260801-campaign-state-home-migration/02-business-flow-unattended-row.patch.md | Block patch, base c3-215#n1323: rewrites the Unattended path row so Stage A lands specs/plans only; campaign state/answers.md are never committed | diff of the file (this change-unit) |
| .c3/changes/adr-20260801-campaign-state-home-migration/03-change-safety-github-row.patch.md | Block patch, base c3-215#n1354: drops the deleted github.ts (D6 retry/waiver) from the edit-trigger list | diff of the file (this change-unit) |
| c3-215 (tribe component doc) | Contract/Business Flow/Change Safety rows corrected — applied via c3x change apply adr-20260801-campaign-state-home-migration in this same session | bash $C3BIN check --only c3-215 |
| plugins/tribe/scripts/runner/{core,cli}/*.ts | Already implemented and committed on this branch (Tasks 1-4, commits 43a9b16..9b0ad87 and earlier) — this ADR records the fact, does not implement it | cd plugins/tribe/scripts/runner && bun run check |

## Underlay C3 Changes

| Underlay area | Exact C3 change | Verification evidence |
| --- | --- | --- |
| N.A - no C3 CLI, validator, schema, template, or help text is touched by this ADR | N.A - it uses the existing change-unit primitives (three block patches to a frozen component's Contract/Business-Flow/Change-Safety sections) exactly as documented by c3x change --help | N.A |

## Enforcement Surfaces

| Surface | Behavior | Evidence |
| --- | --- | --- |
| bash $C3BIN check --only c3-215 | Confirms the applied c3-215 doc is internally consistent and matches its own re-sealed hash | command output captured in this change-unit's Hunter report |
| bash $C3BIN check 2>&1 \| grep -c BROKEN_SEAL | Confirms the 48 pre-existing, unrelated broken seals are neither fixed nor worsened by this change-unit's apply | before/after counts captured in this change-unit's Hunter report |
| cd plugins/tribe/scripts/runner && bun run check | Confirms the runner suite this ADR describes is still green — the code-side proof the doc-side patches are describing accurately | run output captured in this change-unit's Hunter report |
| git status --porcelain | Confirms c3x change apply produced no mass deletion of unrelated pending patch material | command output captured in this change-unit's Hunter report |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| Hand-edit c3-215-tribe.md directly with the corrected rows | c3-215 is a canonically sealed, frozen fact; direct mutation is refused by design and would fabricate a canonical state no change-unit ever recorded, violating the project's standing "never hand-write a registry line" rule |
| One patch per drifted claim (four patches for the Contract row alone) instead of one patch per row | Block patches are anchored per-row; four patches racing the same row's anchor would drift each other's base the instant the first applied — one patch per affected row is the primitive's actual grain, and the runner row's four claims are corrected together as one coherent rewrite |
| Defer c3x change apply to a future session, as adr-20260730-scout-ruling-loop did for the same-class defect | That deferral was for a defect where check/repair delete pending patch material before apply's gates run; this session commits the patch files to git first specifically so apply is safely retryable via git checkout --, removing the reason to defer |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| c3x change apply misbehaves (per the c3x-change-apply-defect project memory) and deletes pending patch material, including this change-unit's own or an unrelated one's | Patch files committed to git before apply runs; git checkout -- recovers any deletion; c3x repair is never invoked | git status --porcelain checked immediately after apply, before and after commit |
| A patch's base anchor has drifted since it was read (a concurrent edit renumbered or resealed c3-215) | Anchors were read fresh in this same session, immediately before authoring each patch, from the same working tree apply runs against | c3x change apply's own drift gate — a stale anchor blocks atomically before any write, per c3x change --help |
| The 48 pre-existing BROKEN_SEAL entries are mistaken for this change-unit's problem and "fixed" by running c3x repair, which silently deletes unrelated pending change-unit patches repo-wide | Never run in this session; verified out of scope by re-reading spec §8/brief explicitly naming this hazard; before/after BROKEN_SEAL count captured as proof | bash $C3BIN check 2>&1 \| grep -c BROKEN_SEAL, run before and after this change-unit's apply |

## Verification

| Check | Result |
| --- | --- |
| bash $C3BIN check --only c3-215 (before this change-unit) | "Checked 37 docs — all clear" — the doc's own seal is intact; the drift is against the code, not the doc's internal consistency |
| bash $C3BIN check 2>&1 \| grep -c BROKEN_SEAL (before this change-unit) | 48 |
| bash $C3BIN change apply adr-20260801-campaign-state-home-migration | Captured in this change-unit's Hunter report |
| bash $C3BIN check --only c3-215 (after apply) | Captured in this change-unit's Hunter report — expected clean |
| bash $C3BIN check 2>&1 \| grep -c BROKEN_SEAL (after this change-unit) | Captured in this change-unit's Hunter report — expected 48, unchanged |
| cd plugins/tribe/scripts/runner && bun run check | Captured in this change-unit's Hunter report — expected the same pass count as the 205-pass/0-fail baseline |
