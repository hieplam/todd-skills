---
id: c3-217
c3-seal: b116c2339fa3cd58f741b938a5db62071f2ef40f1441a8b866a6e6e7b3f75d0b
title: verify-shipped
type: component
category: feature
parent: c3-2
goal: 'Mechanically verify a SHIPPED claim against the owner''s Definition of Done: PR merged, squash strategy, local master in sync with origin, worktree removed.'
uses:
    - ref-plugin-layout
    - rule-bash-strict-mode
---

## Goal

Mechanically verify a SHIPPED claim against the owner's Definition of Done: PR merged, squash strategy, local master in sync with origin, worktree removed.

## Parent Fit

| Field | Value |
| --- | --- |
| Container | c3-2 plugins — Claude Code runtime content |
| Category | Feature — done-ness verification |
| Role in parent | Skill + one script (verify-shipped.sh) running four git/GitHub checks |
| Depends on siblings | Consumes the state tribe's Warchief produces; complements the Skinner's audit with pure mechanics |

## Purpose

Owns the executable form of "PR squash-merged and ready to work on new feature with LATEST CHANGES": four pass/fail checks instead of trusting a prose report. Non-goals: judging whether the work itself is correct (Skinner's question) — only whether it truly landed.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Precondition | git + gh authenticated; a PR number or branch identifying the claimed-shipped work | N.A - see SKILL.md description |
| Inputs | The SHIPPED claim (PR reference, worktree path) | N.A - see scripts/verify-shipped.sh |
| State | None persisted — read-only checks, printed verdict | N.A - see script |
| Shared dependencies | Plugin layout | ref-plugin-layout |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | Per-check pass/fail verdict — merged, squash, master synced, worktree gone — on the delivery state the tribe's Warchief produced | c3-215 |
| Primary path | Query GitHub for PR state + merge strategy → compare local master to origin/master → check worktree removal → print verdict table | N.A - see scripts/verify-shipped.sh |
| Alternates | Any single check failing still runs the rest, so the report is complete | N.A - see script design |
| Failure behavior | A failing check means the claim is not trusted; caller must fix and re-verify, not argue | N.A - see SKILL.md description |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | ref | Directory shape | binding | — |
| rule-bash-strict-mode | rule | verify-shipped.sh preamble | binding | — |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| Skill trigger | IN | Fires on "is this actually shipped? / verify SHIPPED / confirm done" | Claude Code skill system | SKILL.md frontmatter |
| scripts/verify-shipped.sh | IN/OUT | Read-only against git/GitHub; prints 4 pass/fail lines + verdict | shell CLI | plugins/verify-shipped/skills/verify-shipped/scripts/verify-shipped.sh |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| False PASS (claim trusted when not landed) | Weakening any of the 4 checks | Roadmap cards marked shipped while master lacks the commit | Run plugins/verify-shipped/skills/verify-shipped/scripts/verify-shipped.sh against a known-unmerged PR and confirm FAIL |
| Definition-of-Done drift | Owner's DoD changes without updating the script | Script verdict disagrees with owner expectations | Diff the 4 checks against the DoD wording in plugins/verify-shipped/skills/verify-shipped/SKILL.md |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| The 4 checks in the script | Purpose section (the executable DoD) and Contract section (script surface) | The script IS the DoD — no variance | plugins/verify-shipped/skills/verify-shipped/scripts/verify-shipped.sh |
