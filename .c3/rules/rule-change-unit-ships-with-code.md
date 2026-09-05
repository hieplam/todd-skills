---
id: rule-change-unit-ships-with-code
c3-seal: 0187f7b90766d65879963cfa84c3aeeb995a80da800ba28db12a8aba8dce37ef
title: change-unit-ships-with-code
type: rule
goal: 'A decided ADR''s change-unit patches reach their target facts in the same PR that ships the decision''s code, so the architecture record never lags the code it describes. The recurring need: on 2026-09-04, eight of the fourteen patches under `.c3/changes/` for four ADRs (`adr-20260726-stack-agnostic-agent-prompts`, `adr-20260727-harness-gap-detection`, `adr-20260728-purity-golden-standard`, `adr-20260730-scout-ruling-loop`) were found never applied to `c3-215-tribe.md` / `ref-plugin-layout.md`, weeks after their code merged (PRs #57, #59, #61, #65) — the facts and the ADR statuses were both stale, and nothing had flagged it (PR #120).'
---

## Goal

A decided ADR's change-unit patches reach their target facts in the same PR that ships the decision's code, so the architecture record never lags the code it describes. The recurring need: on 2026-09-04, eight of the fourteen patches under `.c3/changes/` for four ADRs (`adr-20260726-stack-agnostic-agent-prompts`, `adr-20260727-harness-gap-detection`, `adr-20260728-purity-golden-standard`, `adr-20260730-scout-ruling-loop`) were found never applied to `c3-215-tribe.md` / `ref-plugin-layout.md`, weeks after their code merged (PRs #57, #59, #61, #65) — the facts and the ADR statuses were both stale, and nothing had flagged it (PR #120).

## Rule

The PR that merges a decided ADR's code applies every patch under `.c3/changes/<adr-id>/` to its target fact in that same PR, or records the deferral as a debt entity in that same PR.

## Golden Example

Literal, from `.c3/changes/adr-20260801-campaign-state-home-migration/01-contract-runner-row.patch.md` (frontmatter, then the first line of the patch body) and the fact it targets — the one ADR of the six audited in PR #120 whose patches were all realised:

```markdown
---
target: c3-215
scope: block
base: c3-215#n1413@v1:sha256:6ff7c9c8a9a044a967bea7eaf904899c403a176c30f18c4d5ac24e5e1f849e2f
---
scripts/runner/run.ts (campaign runner) | IN | Stateless CLI capability: every environment value is an input (--repo, --model, --home, --logs-dir, --session-timeout, --dry-run, --cards, --max-cards, --include-escalated, --remote).
```

and `.c3/c3-2-plugins/c3-215-tribe.md:72`, the Contract row that now carries that patch's after-state (`--state, --answers and --escalations-dir were deleted as flags`). REQUIRED: the after-state phrase of every patch is present in (or, for a delete patch, absent from) the target fact at the merge commit. OPTIONAL: which mechanism applied it (`c3x change apply`, or the tool's reseal after a hand edit).

Compliance check (the oracle PR #120 used): for each `*.patch.md` under `.c3/changes/<adr-id>/`, grep the target fact for a distinctive phrase of the patch's after-state; every patch present (or absent, for deletes) is YES. `c3x change status` is NOT the check — it reports `drifted` for applied and unapplied patches alike once the fact has been resealed.

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| Merge the code, leave the change-unit "apply deferred" with no debt entity | Apply the patches in the same PR, or record a debt entity in the same PR | The deferral has no owner and no meter; four ADRs sat unapplied for five to six weeks with green audits throughout |
| Flip an ADR to status: accepted because its code shipped | Flip only when every patch's after-state is present in the target fact | The status would then claim a fact update that never happened (PR #120's oracle, spec section "Oracle") |
| Trust c3x change status as proof of application | Grep the after-state phrase in the fact | It reads drifted for all fourteen audited patches, applied and unapplied alike |

## Scope

Every PR in this repo that is the shipped evidence for an ADR under `.c3/adr/` with a patch folder under `.c3/changes/`. Does not govern ADRs with no change-unit (pure records), and does not govern which patches an ADR should have — only that the ones it has are applied or explicitly deferred as debt when the code lands.

## Override

A PR may defer the patches only by recording a debt entity under `.c3/documents/debt/` in that same PR via the ruling CLI (`plugins/tribe/scripts/gaps/gap-rule.ts`), never by prose in the PR body.
