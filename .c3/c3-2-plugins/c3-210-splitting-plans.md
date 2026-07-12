---
id: c3-210
c3-seal: 6a745709918feafebb8c5f386aac4d5474dc0d3b6d67668c7b4a890ea4b96f38
title: splitting-plans
type: component
category: feature
parent: c3-2
goal: Split large monolithic implementation plans into isolated, dependency-aware sub-plans that parallel subagents can pick up.
uses:
    - ref-evals-fixture
    - ref-plugin-layout
    - rule-bash-strict-mode
---

## Goal

Split large monolithic implementation plans into isolated, dependency-aware sub-plans that parallel subagents can pick up.

## Parent Fit

| Field | Value |
| --- | --- |
| Container | c3-2 plugins — Claude Code runtime content |
| Category | Feature — planning capability |
| Role in parent | Skill-flavored plugin: one skill + a lock-validation script + eval fixtures |
| Depends on siblings | None at runtime; complements tribe's Warchief planning stage conceptually |

## Purpose

Owns the plan-decomposition method: when a plan exceeds ~500 lines, produce sub-plans with clear definitions-of-done, verify/validate steps, and non-overlapping file locks. Non-goals: executing the sub-plans (callers/subagents do) and authoring the original plan.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Precondition | A written monolithic plan exists in the session or on disk | N.A - see skills/splitting-plans/SKILL.md description |
| Inputs | The plan text; the target parallelism (how many subagents) | N.A - see SKILL.md |
| State | Generated sub-plan files with lock declarations | N.A - see scripts/validate-locks.sh |
| Shared dependencies | Plugin layout (skill dir + scripts + evals) | ref-plugin-layout |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | N sub-plans, each independently executable with its own definition-of-done | ref-evals-fixture |
| Primary path | Analyze dependencies → partition tasks → declare per-sub-plan file locks → validate locks don't overlap | N.A - see scripts/validate-locks.sh |
| Alternates | Plans under the size threshold: skill advises not splitting | N.A - see SKILL.md trigger ("exceeds ~500 lines") |
| Failure behavior | Overlapping locks fail validate-locks.sh, blocking the split from being handed to parallel agents | N.A - see scripts/validate-locks.sh |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | ref | Directory shape (skills/, scripts/, evals/) | binding | Installable via installer |
| ref-evals-fixture | ref | evals/evals.json shape | binding | Benchmarked by eval-runner |
| rule-bash-strict-mode | rule | validate-locks.sh preamble | binding | Verified repo-wide |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| Skill trigger (SKILL.md description) | IN | Fires on large-plan/divide-and-conquer requests | Claude Code skill system | SKILL.md frontmatter |
| Sub-plan files + lock declarations | OUT | Non-overlapping locks, per-sub-plan definition-of-done | files handed to subagents | scripts/validate-locks.sh |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Two sub-plans editing the same file concurrently | Weakening lock validation | Merge conflicts / lost writes in parallel execution | Run plugins/splitting-plans/skills/splitting-plans/scripts/validate-locks.sh on generated output |
| Skill stops triggering | Rewording the SKILL.md description | Eval regression | scripts/evals/run_evals.py --evals plugins/splitting-plans/skills/splitting-plans/evals/evals.json |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Eval fixture cases | Contract section (skill trigger + sub-plan output surfaces) | New cases may be added | plugins/splitting-plans/skills/splitting-plans/evals/evals.json |
