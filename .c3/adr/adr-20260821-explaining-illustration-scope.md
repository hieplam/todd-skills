---
id: adr-20260821-explaining-illustration-scope
c3-seal: 5d6c4763a7a4ef5543624e9aa8a5697bd9b3334b61c6b74af80a7ccb525f1100
title: explaining-illustration-scope
type: adr
goal: |-
    Bring `c3-201`'s Parent-Fit Boundary cell, Contract row for `skills/explaining/SKILL.md`,
    and Derived Materials back in sync with what the `explaining-illustration` card actually
    shipped: a skill-local `skills/explaining/scripts/` directory (`validate-mermaid.ts` +
    `render-illustration.ts`, an on-demand-installed `bun`/`mermaid`/`jsdom` runtime
    dependency, `node_modules/` gitignored) and a fourth skill rule (Rule 4 — illustrate a
    flow instead of narrating it), backed by the new eval case
    `tribe-overall-flow-illustrated`. `c3-201`'s frozen fact currently says none of this
    happened.
status: accepted
date: "2026-08-21"
---

## Goal

Bring `c3-201`'s Parent-Fit Boundary cell, Contract row for `skills/explaining/SKILL.md`,
and Derived Materials back in sync with what the `explaining-illustration` card actually
shipped: a skill-local `skills/explaining/scripts/` directory (`validate-mermaid.ts` +
`render-illustration.ts`, an on-demand-installed `bun`/`mermaid`/`jsdom` runtime
dependency, `node_modules/` gitignored) and a fourth skill rule (Rule 4 — illustrate a
flow instead of narrating it), backed by the new eval case
`tribe-overall-flow-illustrated`. `c3-201`'s frozen fact currently says none of this
happened.

## Context

`c3-201`'s Parent-Fit Boundary cell reads "Runtime content only; no scripts, no hooks,
no agents" — true when this fact was last sealed, false now: the branch
`warchief/explaining-illustration` added
`plugins/explaining/skills/explaining/scripts/validate-mermaid.ts` and
`render-illustration.ts` (tasks 5-6 of the card's plan), each with its own `bun test`
suite, plus a `package.json`/`bun.lock`/`.gitignore` for the on-demand-installed
`mermaid`/`jsdom` dependency. The Contract row for `skills/explaining/SKILL.md` names
only the original two-rule pair ("the eval-backed rule pair"), but the skill now ships a
third rule — Rule 4, "Illustrate a flow instead of narrating it" (task 7) — added on the
evidence of a new eval case, `tribe-overall-flow-illustrated`
(`plugins/explaining/skills/explaining/evals/evals.json`, id 3), whose machine `checks`
entry runs `validate-mermaid.ts` against the rendered artifact (task 9). Derived
Materials names only `SKILL.md` and `evals.json` as derived surfaces; the `scripts/`
directory is itself a derived-material surface (it implements exactly what Rule 4's How
paragraph in `SKILL.md` prescribes) with no row of its own. Left uncorrected, `c3x
check`/`c3x lookup` and any future audit read `c3-201` as still boundary-fenced to
"runtime content only", contradicting the shipped, tested, installed scripts directory
sitting right next to `SKILL.md`.

## Decision

Three block/insert patches on `c3-201`, landing atomically as one change-unit, each a
TABLE-CELL/TABLE-ROW block patch (the shape proven safe by this card's own
`adr-20260821-eval-arm-axis-and-machine-checks` patches 02-04 and its follow-up
`adr-20260821-fix-c3-301-inputs-row-pipe-escaping` — never a patch whose content opens a
fenced code block welded to a fence marker, the serializer defect recorded as F23):

1. Parent-Fit Boundary cell (`c3-201#n1179`) — widen "Runtime content only; no scripts,
no hooks, no agents" to acknowledge the embedded illustration validator/renderer
under `skills/explaining/scripts/`, while still recording no hooks and no agents
(those remain true).
2. Contract row for `skills/explaining/SKILL.md` (`c3-201#n1207`) — record Rule 4 as an
eval-backed addition alongside the original pair, citing the new eval case
`tribe-overall-flow-illustrated` as evidence.
3. Derived Materials (insert after `c3-201#n1219`) — a new row naming
`skills/explaining/scripts/{validate-mermaid.ts,render-illustration.ts}` as derived
material, deriving from the Contract row's Rule 4 How paragraph, and naming its
runtime dependency (`bun` + `mermaid`/`jsdom`, installed on demand via `bun install`,
`node_modules/` gitignored) plus its own `bun test` suite as evidence.

This wins over leaving the fact stale for the same reason the sibling
`eval-arm-axis-and-machine-checks` unit gave for `ref-evals-fixture`/`c3-301`: `c3x
check`, `c3x lookup`, and any future audit read `.c3/` as the source of truth for "what
does this component actually do", and a component fact that still claims "no scripts"
next to a shipped, tested `scripts/` directory silently mis-teaches the next reader that
the newer capability does not exist. Extending the existing fact (rather than a new
component) is correct because `c3-201`'s Goal and ownership boundary (the `explaining`
skill) did not change — only its internal detail (one more rule, one more derived
surface) grew, exactly the "extend, don't replace" precedent task 10's own change-unit
already established for `ref-evals-fixture`/`c3-301`.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-201 | component | Its Parent-Fit Boundary cell claims "no scripts"; its Contract row for SKILL.md names only the original two-rule pair; its Derived Materials table has no row for the shipped scripts/ directory — all three are now stale against the shipped illustration capability (a table-row cite here would embed a raw pipe character inside this ADR's own table cell, which c3x 11.6.3's table parser cannot round-trip — same class of serializer limitation as F23 — so this cites the fact's prose Purpose section instead as proof of the entity, with the exact stale cells named in this column) | c3-201#n1181@v1:sha256:57c71c2e4b981617989f16a57bc6a0ada08e1cc187f27cdcdb3fc3249cb18793 "Owns the explaining skill definition (skills/explaining/SKILL.md) and its regression eval fixtures (evals/evals.json). The skill encodes exactly the rule " | This unit's three patches are the review |

## Verification

| Check | Result |
| --- | --- |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 change apply adr-20260821-explaining-illustration-scope | Reports all patches applied |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 check | Exactly the 2 pre-existing errors (c3-213, c3-216), no third |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 read c3-201 --section "Parent Fit" | Boundary cell names the embedded scripts/ validator/renderer, still no hooks/agents |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 read c3-201 --section "Derived Materials" | A new row names skills/explaining/scripts/ as derived material |
