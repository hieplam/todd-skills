---
id: ref-docs-lifecycle
c3-seal: 36efff7a6eecf40104c8c1bd04290d82c89105aac1eb428fe233d44b84e94e39
title: docs-lifecycle
type: ref
goal: 'Give feature work a durable, ordered paper trail — designs, implementation plans, and proof artifacts must outlive the chat session that produced them. The recurring need: the tribe workflow''s memory "lives in files", and multiple features have already left such files.'
---

## Goal

Give feature work a durable, ordered paper trail — designs, implementation plans, and proof artifacts must outlive the chat session that produced them. The recurring need: the tribe workflow's memory "lives in files", and multiple features have already left such files.

## Choice

Dated documents under `docs/superpowers/`, split by kind: `specs/YYYY-MM-DD-<slug>.md` (design/what-why), `plans/YYYY-MM-DD-<slug>.md` (implementation plan), `evidence/YYYY-MM-DD-<slug>.json` (mechanical proof, e.g. smoke-test output). Date prefix in the filename, not just git history.

## Why

The tribe plugin's contract requires memory in files (roadmap, Decision Log, spec, plan, report files) so agents can resume after crashes and owners can audit decisions — chat history is not recoverable state. The date-prefix convention orders history with zero tooling (plain `ls` sorts chronologically) and survives file moves, unlike relying on git timestamps. Five real documents already follow it (e.g. `docs/superpowers/specs/2026-07-11-tribe-atomic-resume-design.md`, `docs/superpowers/plans/2026-07-11-tribe-atomic-resume.md`, `docs/superpowers/evidence/2026-07-08-nesting-smoke-test.json`) — this ref records the practiced pattern rather than proposing a new one.

## How

Real examples from the tree:

```
docs/superpowers/
├── specs/2026-07-05-tribe-role-contracts-design.md    # REQUIRED: YYYY-MM-DD-<slug>.md
├── specs/2026-07-11-tribe-atomic-resume-design.md
├── plans/2026-07-11-tribe-atomic-resume.md            # plan pairs with its spec by slug
└── evidence/2026-07-08-nesting-smoke-test.json        # machine-readable proof artifacts
```

A feature's spec and plan SHOULD share a slug stem (`tribe-atomic-resume`) so the pair is discoverable; evidence files are OPTIONAL and appear when a claim needed mechanical proof.
