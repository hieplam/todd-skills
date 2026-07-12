---
id: c3-211
c3-seal: 2f2075cdaf10dfdd6fe2320a5a15b2f1edc58433e0e0af5b9c3c6c0ba79785c8
title: check-diff-coverage
type: component
category: feature
parent: c3-2
goal: Measure the percentage of changed lines vs master/main that no test exercises, and drive a remediation loop until the uncovered diff is under 20%.
uses:
    - ref-evals-fixture
    - ref-plugin-layout
    - rule-bash-strict-mode
---

## Goal

Measure the percentage of changed lines vs master/main that no test exercises, and drive a remediation loop until the uncovered diff is under 20%.

## Parent Fit

| Field | Value |
| --- | --- |
| Container | c3-2 plugins — Claude Code runtime content |
| Category | Feature — quality gate |
| Role in parent | Skill-flavored plugin: skill + measure.sh + prioritization/refactor-bridge references + evals |
| Depends on siblings | Bridges to refactor-for-testability when code has no seams (references/refactor-bridge.md) |

## Purpose

Owns the "is my diff tested?" question for .NET (csproj/sln) and Go (go.mod) repos: measurement, prioritization of what to cover first, and the remediation loop. Non-goals: being a hard wall (escalates to the user when stuck) and repo-wide absolute coverage.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Precondition | A git repo with changes vs master/main; .NET or Go toolchain available | N.A - see SKILL.md description |
| Inputs | The working diff; the repo's test suite | N.A - see scripts/measure.sh |
| State | Coverage measurement artifacts per run | N.A - see scripts/measure.sh |
| Shared dependencies | Plugin layout; eval fixture shape | ref-plugin-layout |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | Uncovered-diff % ≤20% (target ≤10%) or an explicit escalation to the user | ref-evals-fixture |
| Primary path | Measure via measure.sh → prioritize uncovered lines → write tests → re-measure loop | N.A - see references/prioritization.md |
| Alternates | Untestable code discovered → hand off to refactor-for-testability first | N.A - see references/refactor-bridge.md |
| Failure behavior | Stuck loop → escalate rather than block; quality gate, not hard wall | N.A - see SKILL.md description |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | ref | Directory shape | binding | — |
| ref-evals-fixture | ref | evals/evals.json shape | binding | — |
| rule-bash-strict-mode | rule | measure.sh preamble | binding | — |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| Skill trigger | IN | Fires pre-PR / pre-done / on coverage doubt phrases | Claude Code skill system | SKILL.md frontmatter |
| scripts/measure.sh | IN/OUT | Takes the repo diff, emits uncovered-diff measurement for .NET/Go | shell script | plugins/check-diff-coverage/skills/check-diff-coverage/scripts/measure.sh |
| Remediation verdict | OUT | ≤20% pass, else loop or escalate — never silently blocks | conversation | SKILL.md |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| False "covered" verdicts | Changing measurement logic in measure.sh | Known-uncovered fixture reports 0% uncovered | Run plugins/check-diff-coverage/skills/check-diff-coverage/scripts/measure.sh against a fixture repo with a deliberate gap |
| Threshold drift | Editing the 20%/10% gates | Skill accepts poorly-tested diffs | Re-run plugins/check-diff-coverage/skills/check-diff-coverage/evals/evals.json via scripts/evals/run_evals.py |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Eval fixture cases | Contract section (remediation verdict surface) and Business Flow section (thresholds) | Additional cases allowed | plugins/check-diff-coverage/skills/check-diff-coverage/evals/evals.json |
