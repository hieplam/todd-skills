---
id: adr-20260820-add-mammoth-hunt-skill
c3-seal: aaab4fe010b3f62cafb530526dc08cb9ff6be86ebbbc945b024f930df17597de
title: add-mammoth-hunt-skill
type: adr
goal: |-
    Give the tribe's full single-work delivery chain a deterministic, named invocation — the
    `mammoth-hunt` skill — so any phrasing of "run the tribe on this one task" dispatches the
    complete 5-role hunt (warchief, hunters, 2 skinners, scout, tracker) without per-repo memory
    or global-CLAUDE.md additions.
status: accepted
date: "2026-08-20"
---

## Goal

Give the tribe's full single-work delivery chain a deterministic, named invocation — the
`mammoth-hunt` skill — so any phrasing of "run the tribe on this one task" dispatches the
complete 5-role hunt (warchief, hunters, 2 skinners, scout, tracker) without per-repo memory
or global-CLAUDE.md additions.

## Context

Owner invocations of the full chain were phrase-dependent and flaky: bare phrases ("Tribe
workflow") and undefined codenames routed to the warchief/hunter/dual-skinner chain but
dropped the scout and tracker legs in 8/8 unbound eval runs, and the word "workflow" collides
with the built-in Workflow tool's explicit opt-in trigger ("use a workflow"). Root cause is
structural: the warchief's own definition dispatches the scout only conditionally (harness-gap
adjudication), so no prompt phrasing could reliably produce the owner's intended 5-role hunt.
The owner rejected a global-CLAUDE.md binding; the binding must live in the plugin.

## Decision

Bind the invocation to a skill: `plugins/tribe/skills/mammoth-hunt/SKILL.md`. A skill
description is always in the model's context, so the phrase-to-procedure binding survives
every session with zero per-repo memory. The skill assumes Shaman-delegate authority (the
orchestrate-campaign precedent, scoped to ONE piece of work), dispatches the real warchief
with the idea card, and carries the scout survey + tracker diff review as standing constraints
in the warchief brief — mandatory per hunt, closing the conditional-scout gap. Trigger evals
(11 real `claude -p` sessions, clean toy repo, no CLAUDE.md binding): 4 phrasings x2 all
triggered with the full 6-agent roster; 3 near-miss negatives ("use a workflow", bare task,
"orchestration: run N cards") all routed away correctly. Merged to master at cb320ce.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | tribe gains a second named skill entry point (single-work) beside orchestrate-campaign (batch); Purpose must name the skill-bound invocation surface | c3-215#n877@v1:sha256:251862af8e4a1e85ac79f1a2b86176842fce93c3f1b9e52758445fa817d64757 | ref-plugin-layout conformance for the new skill directory; no agent contract changed |

## Verification

| Check | Result |
| --- | --- |
| Trigger evals: 8/8 should-trigger runs invoke mammoth-hunt with full roster (warchief, hunter, skinner x2, scout, tracker) | PASS — plugins/tribe/skills/mammoth-hunt/evals/trigger-evals.json, 2026-08-20 |
| Negative evals: "use a workflow" routes to Workflow tool, bare task implements directly, "orchestration: run N cards" routes to orchestrate-campaign | PASS — same eval file, 3/3 |
| Installer links the skill without script changes (root install.sh auto-discovers plugins//skills//) | PASS — ~/.claude/skills/mammoth-hunt symlink resolves post-merge |
