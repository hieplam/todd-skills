---
id: adr-20260717-business-flow-unattended
c3-seal: 41b6e40fa2c8337528a88ae6bff69e117a172677be88ee8d376810f84069c531
title: business-flow-unattended
type: adr
goal: |-
    Add the **unattended path** to `c3-215`'s Business Flow: one owner directive → Stage A planning
    → a park-and-continue runner pass → a bounded answer round-trip → ONE consolidated owner report.
    The component's Contract already carries the orchestration surfaces (ADR
    `adr-20260717-add-campaign-orchestration`); its Business Flow still describes only the attended,
    one-card-at-a-time path and cannot express the campaign the component now supports.
status: accepted
date: "2026-07-17"
---

## Goal

Add the **unattended path** to `c3-215`'s Business Flow: one owner directive → Stage A planning
→ a park-and-continue runner pass → a bounded answer round-trip → ONE consolidated owner report.
The component's Contract already carries the orchestration surfaces (ADR
`adr-20260717-add-campaign-orchestration`); its Business Flow still describes only the attended,
one-card-at-a-time path and cannot express the campaign the component now supports.

## Context

`adr-20260717-add-campaign-orchestration` landed the two Contract-surface changes — the runner's
D5′ park-and-continue plus report contract, and the orchestrate-campaign skill as the trigger.
Its third patch, an `insert` adding this Business Flow row, would not apply alongside them, and
isolating the real cause took four experiments and two wrong hypotheses.

**The finding, stated correctly: `insert` after a table's LAST row applies; `insert` after a
MIDDLE row fails** with `insert-after: shift siblings: constraint failed: UNIQUE constraint
failed: index 'idx_nodes_order' (2067)`. The sibling-shift step collides when any row follows
the anchor. The Contract insert succeeded on the first try only because its anchor happened to be
the last row of that table; this row was anchored to the middle of Business Flow, so it failed —
and kept failing after it was moved into a unit of its own, which is what disproved the first
hypothesis. Re-anchoring to the last row of the Business Flow table applied it instantly.

**Two hypotheses were wrong and are recorded so nobody re-runs them:**

- *"Two `insert` patches on one entity cannot share a unit."* Disproved: the lone insert in its
own unit still failed with the identical constraint error. Unit composition was never the
variable — the anchor's position was.
- *"A stale order index from the earlier failed applies is the cause, so `repair` will clear
it."* Disproved twice over: `repair` refused to run (it gates on `check`, which fails on two
pre-existing errors in unrelated components), and re-anchoring fixed the insert with the index
untouched.

One order of the three-patch unit also **hung the apply indefinitely** (killed after >4 minutes,
every patch still `pending`) rather than failing — the same defect surfacing as a hang instead of
a constraint error, which is worth knowing before someone waits on it.

Throughout, the atomic apply held: `c3-215` was verified intact (`ok: true`) after every one of
the failures, so no half-applied state was ever observable. The gate stack behaved exactly as
documented; only the insert primitive is defective.

## Decision

**Anchor the insert to the last row of the Business Flow table**, which is what actually makes it
apply. The row is authored exactly as it would have been in the sibling unit; only its anchor
changed.

This unit exists as a **separate ADR for an honest reason that is not the technical one**: it was
split off while the first hypothesis (two inserts cannot share a unit) was still believed. That
hypothesis was wrong, so the split was not strictly necessary — the three patches could have
ridden together had all anchors been last-row. It is kept rather than folded back because both
units are already applied, each is independently coherent and independently checked, and they
land in the same commit and PR — so no reviewed state ever ships half-applied. Reverting two
clean applies to prove a tidier history would risk the one thing that has held throughout: an
always-intact `c3-215`.

Anchoring to the table's last row is a real constraint on future authors of this component, not a
one-off workaround, so it is recorded here rather than in a session transcript.

The row states the unattended path end to end, names park-and-continue and the blocked-dependent
rule explicitly (they are what make an overnight campaign survive an ambiguous card), and records
the one designed interruption: an irreversible decision, which parks for the owner by campaign
config rather than being auto-answered.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | Its Business Flow gains the unattended path row. The attended per-card path (Shaman picks card → Warchief specs and plans → Hunters implement → merge) is unchanged and still primary; this row records the campaign path the orchestration layer added, which the existing rows cannot express | c3-215#n454@v1:sha256:251862af8e4a1e85ac79f1a2b86176842fce93c3f1b9e52758445fa817d64757 "Owns the delivery role contracts: who may talk to whom (Owner ⇄ Shaman ⇄ Warchief ⇄ Hunter, adjacent ranks only), which question each role answers, how qu" | ref-docs-lifecycle (the flow's spec and plan), rule-no-squash-merge (every merge in the unattended path stays 2-parent) |
| c3-2 | container | Top-down completeness only: parent of c3-215. This unit adds no surface, no member, and no install-time behavior — it records an existing flow in prose. The container's file-based cross-plugin contract is unchanged | c3-2#n942@v2:sha256:fd983e54cededf8ac09a8f391d405e63adfc3a40bfd1e7d560a0a82c175ec7a1 "Plugins own their business logic and runtime assets end-to-end (skill references, helper scripts, templates); nothing here runs at install time except declared" | None — no container contract changes |
| c3-0 | system | Top-down completeness only: c3-215's system ancestor. No container, component, or install-time surface changes | c3-0#n1258@v2:sha256:d21dc72fe385cb42ca0b79273dbc1b309b5d308a10754974395b20c7fd30fcc0 "Package Todd Lam's personal Claude Code agents and skills as installable plugins, keep the repo the single source of truth via symlink installs, and benchmark e" | None — no system-level contract changes |

## Compliance Refs

| Ref | Why required | Evidence | Action |
| --- | --- | --- | --- |
| ref-docs-lifecycle | Binding on c3-215 and governs the paper trail for its feature work; the flow this row records has a frozen design spec and an implementation plan under docs/superpowers/ | ref-docs-lifecycle#n647@v1:sha256:a163534e4fbc98d69ae8cd12167eedff5b0840b29f305b2a4d73a5784501ec2c "Give feature work a durable, ordered paper trail — designs, implementation plans, and proof artifacts must outlive the chat session that produced them. The re" | comply — spec and plan already on master; this ADR adds the tool-behavior finding that forced the split |
| ref-plugin-layout | Binding on c3-215; this unit is prose-only, so the ref's position must be stated rather than assumed | ref-plugin-layout#n666@v1:sha256:7308f9cf6c7b854b298ec94062198be5540c62222a8b3466b2796854039585c5 "Standardize the directory shape of every plugin so the installer, the marketplace manifest, and the eval harness can walk any plugin without per-plugin logic. T" | N.A - this unit adds no file and moves nothing; the directory shape is untouched |
| ref-evals-fixture | Cited by c3-215, so this ADR must state its position rather than pass over it silently | ref-evals-fixture#n657@v1:sha256:f721836fe1202e2368d7d811c32d640cfc55f26882336819d9735bc3a9dbfd04 "One eval fixture format for every skill and agent in the repo, so a single runner can benchmark all of them and results are comparable across plugins. The recur" | N.A - this unit adds no eval fixture; it records an existing flow in the component's own Business Flow |

## Compliance Rules

| Rule | Why required | Evidence | Action |
| --- | --- | --- | --- |
| rule-no-squash-merge | Listed in c3-215's uses and binding on the flow this row describes: the unattended path merges card PRs and campaign-state PRs without a human watching each one, so the 2-parent requirement matters more here, not less | rule-no-squash-merge#n950@v1:sha256:2f5ff61964fe9551d508719ff31ed7514dbdbd8d296ff884a7e952a5334fab6a "Every capability in this repo that merges a pull request, or that verifies one was merged," | comply — the row's merges are regular 2-parent merges, mechanically enforced by the runner's own verification, which rejects any merge commit lacking 2 parents |
| rule-bash-strict-mode | Listed in c3-215's uses and binding on its scripts; this unit is prose-only, so the rule's scope must be checked explicitly rather than assumed | rule-bash-strict-mode#n676@v1:sha256:cf218a707a61ba5ad906d29dec31f9f4eef92e5faeb9db74e3a75451c41c3c1d "Every shell script in the repo fails fast and loud: unset variables, failed commands, and broken pipelines abort the script instead of silently producing half-d" | N.A - this unit adds no shell script; the existing scripts remain bound by it |
| rule-marketplace-registration | Cited by c3-101 (the installer); this ADR must state its position rather than pass over it, since the sibling unit added an installed skill | rule-marketplace-registration#n693@v1:sha256:458830564c7ac131ef95420a16dfb572ec4fbd5c9a24cb1395d641667e5a5a16 "Every plugin that exists in the tree is discoverable and installable: the marketplace manifest is the authoritative registry" | N.A - no new plugin and no new installed surface; this unit is prose inside an already-registered plugin's component doc |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| Keep all three patches in one unit, unchanged, and retry until it lands | It does not land while any insert is anchored mid-table. Two orders were tried: one fails the UNIQUE constraint on idx_nodes_order, the other hangs the apply past 4 minutes. Retrying a deterministic tool bug is not a strategy. (With every insert re-anchored to its table's last row, one unit would in fact have worked — the split is historical, not required; see Decision) |
| Fold the unattended path into the existing Primary path row as a block edit, avoiding a second insert | Would misrepresent the architecture. The attended path (a human Shaman picks a card) and the unattended path (one directive, then a report) are different flows with different failure modes; collapsing them into one row to dodge a tool bug would make the doc lie for the tool's convenience |
| Hand-edit the .c3 node order to work around the constraint | .c3 is CLI-only by contract — raw edits bypass the seal and go stale. The skill's own instruction on a blocked operation is to stop, not to reach for file tools |
| Drop the Business Flow row entirely and leave it in the Contract table only | The Contract records surfaces; Business Flow records how the component actually delivers. An unattended campaign that never appears in the flow is exactly the drift this component has already been burned by — a fixed map with an unfixed territory |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| The split leaves the component briefly describing the orchestration surfaces without the flow that uses them | Both units land in the same commit and the same PR, so no reviewed state ever ships with one half applied; each unit is independently atomic and independently checked | c3x check on c3-215 after both units apply |
| The mid-table insert bug recurs silently in a future unit and is misdiagnosed as drift or a bad cite | Recorded here, in the component's own decision record, with the exact error strings and the experiment that isolated it — so the next author reads the cause rather than rediscovering it over an hour | This ADR's Context and Verification sections carry the failing invocation and the passing one |

## Verification

| Check | Result |
| --- | --- |
| c3x change apply adr-20260717-business-flow-unattended | applies the single insert cleanly |
| c3x check --only c3-215 | ok: true |
| c3x check --include-adr --only adr-20260717-business-flow-unattended | ok: true |
| The real bug, isolated by experiment | insert anchored to a MIDDLE table row fails with UNIQUE constraint failed: index idx_nodes_order (2067); the SAME patch re-anchored to that table's LAST row applies instantly. The Contract insert in the sibling unit succeeded first time only because its anchor already was a last row |
| Hypothesis 1 disproved — two inserts cannot share a unit | The lone insert, alone in its own unit, still failed with the identical constraint error. Unit composition was never the variable; the anchor's position was |
| Hypothesis 2 disproved — stale order index, repair will clear it | c3x repair refuses to run at all: it gates on c3x check, which fails on the 2 pre-existing errors in c3-213/c3-216. Re-anchoring then fixed the insert with the index untouched |
| The defect can present as a HANG, not only an error | One patch order left change apply non-terminating past 4 minutes with every patch still pending; it had to be killed |
| Atomicity held through every failure | c3x check --only c3-215 returns ok: true after each rejected apply and after the killed hang — no half-applied state was ever observable |
| Business Flow reads the unattended path after apply | The row names the directive, Stage A, park-and-continue, the blocked-dependent rule, the bounded round-trip, and the one owner report |
