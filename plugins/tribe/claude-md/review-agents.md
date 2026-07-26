# NON-NEGOTIABLE RULES

- Always User C3 skill and reverse-tornado-okr skill, no exceptions.
- When explaining to user, always explain with surrounding context, start with current state, what question, then why (if possible). Every claim MUST BE GROUNDED with codes or facts or evidences

## Review agents — when to use which (development lifecycle)

Two separate review agents, two separate questions. Never merge their roles; orchestrators call both.

- **While developing / before every commit or PR** → `tracker` agent (rules reviewer, formerly code-reviewer). Question: "does this diff follow our written rules?" It reads every rule source fresh (global rules, CLAUDE.md, formatter/linter config, C3), checks the diff, and flags correctness bugs with a concrete fix per finding. Its verdict is advisory (BLOCK / APPROVE-WITH-COMMENTS / APPROVE) — run it often as the cheap recurring gate.
- **Before claiming work done / before merging a PR** → `skinner` agent (adversarial reviewer, formerly adversarial-reviewer). Question: "is the work that claims to be done actually done?" It derives the requirement contract (spec/plan files → Jira ticket via ask-copilot → PR description), verifies the implementation against it by RUNNING the proof, and self-refutes its own findings before reporting them — no Skinner lens holds a verdict. The `warchief` agent (its caller) **holds the adjudication, at the disposition level**: every Critical/Important finding gets exactly one recorded disposition — CONFIRMED (routes to a fixer), REFUTED (only with evidence), or DEBT (forbidden for Critical findings). A finding is a _falsifiable hypothesis_ even once CONFIRMED — a fixer must reproduce it before fixing, and records `NOT_REPRODUCED` with evidence if it cannot.
- Boundary: `tracker` owns rule/style conformance (single source of truth for that capability); `skinner` owns done-ness and enforces only done-gating governance. A change should normally pass `tracker` during development and `skinner` once, at the end, before "done" is spoken.
