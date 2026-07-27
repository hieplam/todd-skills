# NON-NEGOTIABLE RULES

- Always User C3 skill and reverse-tornado-okr skill, no exceptions.
- When explaining to user, always explain with surrounding context, start with current state, what question, then why (if possible). Every claim MUST BE GROUNDED with codes or facts or evidences

# Explanations and voicing

## Overview
Default LLM technical prose imitates expert-to-expert register: terms appear without introduction and claims stay abstract. These two rules replace that default. They are the pair that won an isolated A/B eval against baseline and against each rule alone — apply **both** to any explanatory prose you produce.
When communicate with user, apply this voicing rule:
- Context-First: Any new concept, technology, or technical term must be briefly defined or contextualized the very first time it is introduced.
- Grounded Explanations: Always pair abstract explanations with code snippets, diagrams, or real-world examples to anchor the context for the reader.

## Rule 1 — Term discipline: define before use

Any new concept, technology, or technical term must be briefly defined or contextualized the first time it is introduced. Never drop a new term mid-explanation without an introductory lead-in. If a term needs a whole paragraph to define, define it *before* the section that depends on it, not inside.

## Rule 2 — Grounding: anchor every abstract claim

Ground every claim with truth, code or fact. Pair each abstract or general statement with at least one of:

- a code snippet that demonstrates it,
- a concrete worked example, or
- a verifiable fact/source.

If you cannot ground a claim, mark it explicitly as unverified/opinion or delete it. Prefer showing the artifact first, then explaining it — the artifact carries its own context.

## Review agents — when to use which (development lifecycle)

Two separate review agents, two separate questions. Never merge their roles; orchestrators call both.

- **While developing / before every commit or PR** → `tracker` agent (rules reviewer, formerly code-reviewer). Question: "does this diff follow our written rules?" It reads every rule source fresh (global rules, CLAUDE.md, .editorconfig, C3), checks the diff, and flags correctness bugs with a concrete fix per finding. Its verdict is advisory (BLOCK / APPROVE-WITH-COMMENTS / APPROVE) — run it often as the cheap recurring gate.
- **Before claiming work done / before merging a PR** → `skinner` agent (adversarial reviewer, formerly adversarial-reviewer). Question: "is the work that claims to be done actually done?" It derives the requirement contract (spec/plan files → Jira ticket via ask-copilot → PR description), verifies the implementation against it by RUNNING the proof, and self-refutes its own findings before reporting them — no Skinner lens holds a verdict. The `warchief` agent (its caller) **holds the adjudication, at the disposition level**: every Critical/Important finding gets exactly one recorded disposition — CONFIRMED (routes to a fixer), REFUTED (only with evidence), or DEBT (forbidden for Critical findings). A finding is a _falsifiable hypothesis_ even once CONFIRMED — a fixer must reproduce it before fixing, and records `NOT_REPRODUCED` with evidence if it cannot.
- Boundary: `tracker` owns rule/style conformance (single source of truth for that capability); `skinner` owns done-ness and enforces only done-gating governance. A change should normally pass `tracker` during development and `skinner` once, at the end, before "done" is spoken.
