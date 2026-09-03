---
id: adr-20260903-explaining-blind-reader-review
c3-seal: 9cb051d1374bc66417dffc1e37aaa810c415ee646d838527d24653dd1e22c205
title: explaining-blind-reader-review
type: adr
goal: |-
    Bring `c3-201` (the `explaining` component) back into sync with the skill it now describes on
    disk: five rules instead of two, a `references/` directory carrying the blind-reader brief
    template, and a three-script `scripts/` directory instead of two. Concretely: the Contract row for
    `SKILL.md` names Rule 5 and its evidence; the Derived Materials row for `SKILL.md` cites the new
    evidence document; the Derived Materials scripts row adds `check-review-log.ts` and its exit-code
    contract; a new Derived Materials row is created for `references/blind-reader-brief.md`; and the
    Parent-Fit Boundary cell is widened to name the review-log checker and the brief template
    alongside the existing illustration validator/renderer, while keeping the standing "no hooks, no
    agents" boundary intact.
status: accepted
date: "2026-09-03"
---

## Goal

Bring `c3-201` (the `explaining` component) back into sync with the skill it now describes on
disk: five rules instead of two, a `references/` directory carrying the blind-reader brief
template, and a three-script `scripts/` directory instead of two. Concretely: the Contract row for
`SKILL.md` names Rule 5 and its evidence; the Derived Materials row for `SKILL.md` cites the new
evidence document; the Derived Materials scripts row adds `check-review-log.ts` and its exit-code
contract; a new Derived Materials row is created for `references/blind-reader-brief.md`; and the
Parent-Fit Boundary cell is widened to name the review-log checker and the brief template
alongside the existing illustration validator/renderer, while keeping the standing "no hooks, no
agents" boundary intact.

## Context

`c3-201`'s Contract row for `skills/explaining/SKILL.md` still reads "term discipline + grounding,
plus Rule 4" — it has no knowledge of Rule 5 (blind-reader review before delivery), which now
ships in `plugins/explaining/skills/explaining/SKILL.md`. The component's Derived Materials table
lists a two-script `scripts/` directory (`validate-mermaid.ts`, `render-illustration.ts`) and has
no row at all for `plugins/explaining/skills/explaining/references/blind-reader-brief.md`, the
template the rule dispatches with (`D106-6`: the brief template ships inside the skill directory,
no new agent file). `check-review-log.ts` — the skill-local checker the eval harness gates case 4
on (`0` sound, `1` unsound, `2` could not run) — is absent from the doc entirely. Left uncorrected,
`c3x check` and every future audit of `c3-201` read the component as still shipping a four-rule
skill with no review-log mechanism, which is no longer true of the code it is supposed to govern.

The five patches below are anchored on `c3-201`'s current Contract, Derived Materials and
Parent-Fit sections (cited via `read c3-201 --section <name> --cite` in the same session). Rule 5
itself, its brief template, its checker, and eval case 4 (`write-ahead-log-explained-and-blind-read`)
were already built and committed across this card's tasks 1-9; this change-unit only re-grounds
the doc, adding no new code.

## Decision

Land exactly the five patches enumerated below as one change-unit, all-or-nothing through
`change apply` — never a hand-edit of the frozen fact:

1. `01-contract-skillmd-row.patch.md` — `scope: block` on the Contract row for `SKILL.md`: the
body now names five rules including Rule 5 (blind-reader review before delivery), and cites the
review log plus eval case `write-ahead-log-explained-and-blind-read` as its evidence.
2. `02-derived-skillmd-row.patch.md` — `scope: block` on Derived Materials row 1: the Evidence
cell additionally cites `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review.md`.
3. `03-derived-scripts-row.patch.md` — `scope: block` on the Derived Materials scripts row: add
`check-review-log.ts` and its exit-code contract (`0` sound, `1` unsound, `2` could not run). Ruling R2 (2026-09-03) notes the leak-detection sub-check is word-based, so scripts with no whitespace word boundaries (e.g. Japanese, Chinese) are out of contract and the checker prints a `WARN: prompt-leak detection not applicable` line rather than passing silently.
4. `04-derived-brief-template-row.patch.md` — `scope: insert`, based on the row it follows: a new
Derived Materials row for `plugins/explaining/skills/explaining/references/blind-reader-brief.md`,
deriving from the Contract row for `SKILL.md` (Rule 5's dispatch paragraph), allowed variance
wording only, invariant the three slots and the absence of any other input, evidenced by
`bun test` in the skill's `scripts/` directory.
5. `05-parent-fit-boundary.patch.md` — `scope: block` on the Parent-Fit Boundary cell: widen it to
name the review-log checker and the brief template alongside the illustration
validator/renderer, keeping the standing "no hooks, no agents" boundary — Rule 5 dispatches a
subagent but adds no agent definition file (`D106-6`).

This is a doc-sync decision, not a design decision: `D106-1` (reader is the judge, hard cap 3
rounds), `D106-2` (threshold is an on-disk artifact or 600 words or more), `D106-3` (reader model
`sonnet` by default, documented as a knob), `D106-4` (degrade to the self-check only when no
dispatch tool exists), `D106-5` (the ending line is always visible) and `D106-6` (the brief
template ships inside the skill directory, no new agent file) are the bounds this ADR records —
they were made by the planning Warchief in the approved plan, not re-opened here.

**Evidence bound.** `c3-201`'s Derived Materials row 1 carries the frozen fact "never a rule
addition without new eval evidence"; that is exactly what this ADR must satisfy, and it is
satisfied by `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review.md`:

- G1 (mechanism runs end to end), gate ≥2/3, executor `sonnet`: **3/3 PASS** (round counts 1, 2,
2; the shipped checker exits 0 on all three preserved logs).
- G2 (the reader is blind — brief matches the template, no 12-word overlap with the eval prompt):
**3/3** of passing runs, asserted inside the same check.
- G3 (the review actually catches something, via `--require-catch`): **2/3** — run 1's first
blind read came back clean.
- G4 (bounded cost): rounds ≤3 in **3/3**; cost ~**16×** the pre-change skill on this prompt
(45 897 tokens pre-change vs 744 395 mean with Rule 5 on haiku; 930 358 mean on sonnet).
Reported, never gated.
- Model transfer, reported not gating: executor `claude-haiku-4-5-20251001` passes **1/3**; the
two failures are log-fidelity failures (a corrupt log line with a broken round sequence; a brief
paraphrased away from the template in all three rounds), not skipped reviews and not a fourth
round.
- G5 (no regression on case 3, executor `sonnet`): `with_skill` **3/3** against a recorded baseline
of 2/3; `without_skill` **0/3**, unchanged.
- Total measured cost **$8.87**; `ungraded` = 0 and `setup_errors` = 0 in all four cells.

**Parent Delta: none.** `c3-2`'s membership is unchanged — `explaining` stays the 9th plugin, a
skill-only member, and no member's Goal Contribution framing moves. Evidence: `c3-2`'s Components
table already lists `explaining` with the same category/status/goal-contribution text this change
does not touch.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-201 | component | Contract row for SKILL.md, Derived Materials rows 1-3 and a new row 4, and the Parent-Fit Boundary cell all currently describe a four-rule/two-script/no-references/ skill; the shipped code carries Rule 5, check-review-log.ts and references/blind-reader-brief.md | c3-201#n1241@v1:sha256:d074fc4d382baa542b0efebb1e1523e22f7f074c861615ee34746c4fcc8fca32 "Ship the explaining skill: two explanation-writing rules (term discipline + grounding) whose retention is gated on A/B eval numbers, installable as a skill-on" | The five patches below (this change-unit); each anchored on a read c3-201 --section <name> --cite handle |
| c3-2 | container | Parent of c3-201; no membership, boundary, or responsibility change — explaining stays the 9th plugin, skill-only, at the same directory | c3-2#n1219@v1:sha256:f92a1cfb53ada54dba5f5c1154ccef3423fe08276ff6ec199cc745be16f8d3d0 "Claude Code runtime content: the 9 installable plugins — agents and skills that, once symlinked into ~/.claude, extend every Claude Code session with delive" | Parent Delta: none — no membership row or Goal Contribution framing moves |

## Compliance Refs

| Ref | Why required | Evidence | Action |
| --- | --- | --- | --- |
| ref-docs-lifecycle | Binding on c3-201 for the dated evidence-artifact lifecycle this ADR cites (docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review.md) | ref-docs-lifecycle#n1732@v1:sha256:4cb5f26226a36e1699655b10af9c6227d9e7a22deb8d4dacbdd8fd901062a90e "Dated documents under docs/superpowers/, split by kind: specs/YYYY-MM-DD-<slug>.md (design/what-why), plans/YYYY-MM-DD-<slug>.md (implementation plan), `e" | comply — the evidence doc already lands at the dated path the ref requires |
| ref-plugin-layout | Binding on c3-201 for directory shape; this change documents a references/ directory the skill now ships alongside skills/, scripts/, evals/ | ref-plugin-layout#n1750@v1:sha256:7308f9cf6c7b854b298ec94062198be5540c62222a8b3466b2796854039585c5 "Standardize the directory shape of every plugin so the installer, the marketplace manifest, and the eval harness can walk any plugin without per-plugin logic. T" | N.A - no new top-level plugin directory; references/ sits inside the already-registered skills/explaining/ tree, which ref-plugin-layout already permits as skill-internal content |

## Verification

| Check | Result |
| --- | --- |
| C3X_MODE=agent bash "$C3X" change apply adr-20260902-explaining-blind-reader-review | All 5 patches land atomically; c3-201's Contract and Derived Materials sections name Rule 5, the review log, check-review-log.ts and blind-reader-brief.md |
| C3X_MODE=agent bash "$C3X" check | Reports exactly the 2 pre-existing errors (c3-213, c3-216 — ungrounded derivation in Derived Materials row 1), no new ones |
