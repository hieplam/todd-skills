---
id: adr-20260716-fix-derived-materials-grounding
c3-seal: 3f8f6a13ba5bbfaa0f5e463ed48efc56a022754f83a57a3603c6e381837e1f6c
title: fix-derived-materials-grounding
type: adr
goal: |-
    Repair one pre-existing canvas violation in `c3-215`: Derived Materials row 3 ("Script tests")
    grounds its derivation in the **Change Safety** section, which the component canvas does not
    accept as a derivation source. Re-ground it in the Contract section and the Governance row it
    actually derives from, matching rows 1 and 2.
status: accepted
date: "2026-07-16"
---

## Goal

Repair one pre-existing canvas violation in `c3-215`: Derived Materials row 3 ("Script tests")
grounds its derivation in the **Change Safety** section, which the component canvas does not
accept as a derivation source. Re-ground it in the Contract section and the Governance row it
actually derives from, matching rows 1 and 2.

## Context

The component canvas requires every Derived Materials row's "Must derive from" column to cite
strict component sections — Goal, Parent Fit, Purpose, Governance, Contract, Derived Materials.
Row 3 cites "Change Safety section (crash-resume and plan-validation risks)", which is not in
that set, so `c3-215` fails its own canvas today:

```
error: ungrounded derivation in Derived Materials row 3 column Must derive from:
       cite strict component sections
```

This is latent drift, not new: rows 1 and 2 already use the correct
"Contract section (…) and Governance row …" form. It was found because the canvas gate
validates the **merged** body of every patch to a fact, so this violation blocks *any* edit to
`c3-215` — including the campaign-runner unit (`adr-20260716-add-campaign-runner`), whose
patches all reject with this same error even though none of them touch Derived Materials.

It is repaired in its own unit rather than inside the runner unit because the gate validates
each patch against the fact's current body: a single unit cannot both fix this row and rely on
it being fixed. Keeping the repair separate also keeps the runner ADR's diff honest — a latent
drift fix is not part of that decision.

## Decision

Re-ground row 3 on the Contract section (the `scripts/validate-plan.sh` and report-file
surfaces the script tests actually exercise) plus the `rule-bash-strict-mode` Governance row
that binds those shell scripts. This preserves the row's true meaning — the tests verify those
contract surfaces, and the Change Safety section merely lists the risks they mitigate — while
citing a derivation source the canvas accepts. No other row, section, or fact changes.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | Its Derived Materials row 3 ("Script tests") grounds its derivation in the Change Safety section, which the component canvas does not accept as a derivation source; this unit re-grounds that single row so the fact is valid against its own canvas again. Cited on the Goal node because the offending row's own cite snippet contains pipe characters and cannot be embedded in this table | c3-215#n445@v1:sha256:89122979aba82506a2dce8209891c33dc92b09437db4dffbc56347159fe052e3 "Deliver features through a 5-agent chain of command — Shaman (What/Why) → Warchief (How) → Hunter (TDD execution), gated by Tracker (rules review) and Ski" | Component canvas — the derivation-grounding contract this row violates |

## Verification

| Check | Result |
| --- | --- |
| c3x check --only c3-215 before | error: ungrounded derivation in Derived Materials row 3 column Must derive from |
| c3x change apply adr-20260716-fix-derived-materials-grounding | applies clean; row 3 cites Contract + Governance like rows 1 and 2 |
| c3x check --only c3-215 after | no ungrounded-derivation error |
| c3x change apply adr-20260716-add-campaign-runner --dry-run after | the runner unit's 4 patches no longer reject with "merged c3-215 violates its canvas" |
