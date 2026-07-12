---
id: c3-212
c3-seal: 653b489948d9eb70451529ed6e3852a98f6d111fe2fd4782ff1299d83710fbf2
title: refactor-for-testability
type: component
category: feature
parent: c3-2
goal: Reshape code that cannot be tested — tight coupling, hidden side effects, ambient state, no seams — into a testable shape before its behavior is changed.
uses:
    - ref-evals-fixture
    - ref-plugin-layout
---

## Goal

Reshape code that cannot be tested — tight coupling, hidden side effects, ambient state, no seams — into a testable shape before its behavior is changed.

## Parent Fit

| Field | Value |
| --- | --- |
| Container | c3-2 plugins — Claude Code runtime content |
| Category | Feature — quality gate / refactoring method |
| Role in parent | Skill-only plugin: one SKILL.md + eval fixtures (the fixtures predate the eval runner and defined its shape) |
| Depends on siblings | Invoked from check-diff-coverage's refactor-bridge when coverage work hits untestable code |

## Purpose

Owns the decision "this code needs a seam before a test": recognizing untestable shapes (DateTime.Now, global config, concrete coupling) and applying behavior-preserving refactors. Non-goals: code that already has tests, or code where adding a test is straightforward.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Precondition | Target code has no tests AND cannot easily get one | N.A - see SKILL.md description |
| Inputs | The code to change and the intended behavior change | N.A - see SKILL.md |
| State | None persisted — guidance-only skill | N.A - see plugin tree (no scripts/) |
| Shared dependencies | Plugin layout; eval fixture shape | ref-plugin-layout |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | Code with substitution seams that a test can exercise, behavior unchanged | ref-evals-fixture |
| Primary path | Detect untestable shape → introduce seam (extract dependency, inject ambient state) → add the first test → then make the requested change | N.A - see SKILL.md |
| Alternates | Code turns out easily testable → skill declines (out of scope by design) | N.A - see SKILL.md "Not for" |
| Failure behavior | If a behavior-preserving refactor isn't possible safely, surface that instead of refactoring blind | N.A - see SKILL.md intent |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | ref | Directory shape | binding | — |
| ref-evals-fixture | ref | Its 3 eval cases pioneered the fixture shape | binding | README credits this plugin as the shape's origin |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| Skill trigger | IN | Fires when change-requested code has no tests and no seams | Claude Code skill system | SKILL.md frontmatter |
| Refactored code + first test | OUT | Behavior-preserving; test demonstrates the new seam | user's repo | SKILL.md |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Skill fires on already-testable code | Broadening the trigger description | Noise complaints / eval regression | scripts/evals/run_evals.py --evals plugins/refactor-for-testability/skills/refactor-for-testability/evals/evals.json |
| Refactor changes behavior | Weakening the behavior-preservation guidance | Downstream test failures after "safe" refactor | Rubrics in plugins/refactor-for-testability/skills/refactor-for-testability/evals/evals.json check refactor-first-then-change ordering |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Eval fixture (3 cases) | Contract section (skill trigger surface) and Business Flow section (refactor-first method) | New cases allowed | plugins/refactor-for-testability/skills/refactor-for-testability/evals/evals.json |
