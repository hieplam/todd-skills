---
id: c3-201
c3-seal: 67f17d2c3115052fd6aef111cf4a8a3affbdd406bc5b529af6e937ef1e3c43bd
title: explaining
type: component
category: feature
parent: c3-2
goal: 'Ship the `explaining` skill: two explanation-writing rules (term discipline + grounding) whose retention is gated on A/B eval numbers, installable as a skill-only plugin so every Claude Code session writes explanatory prose a context-less reader can follow.'
uses:
    - ref-docs-lifecycle
    - ref-evals-fixture
    - ref-plugin-layout
    - rule-marketplace-registration
---

## Goal

Ship the `explaining` skill: two explanation-writing rules (term discipline + grounding) whose retention is gated on A/B eval numbers, installable as a skill-only plugin so every Claude Code session writes explanatory prose a context-less reader can follow.

## Parent Fit

| Field | Value |
| --- | --- |
| Parent container | c3-2 (plugins) |
| Membership | 9th plugin; skill-only member like splitting-plans/verify-shipped |
| Goal contribution | Adds a quality-of-output capability: explanation prose style, evidence-gated |
| Boundary | Runtime content, plus an embedded illustration validator/renderer and review-log checker under skills/explaining/scripts/ (bun + mermaid/jsdom, installed on demand, node_modules/ gitignored) and a blind-reader brief template under skills/explaining/references/; still no hooks, no agents — Rule 5 dispatches a subagent per round but adds no agent definition file |

## Purpose

Owns the `explaining` skill definition (`skills/explaining/SKILL.md`) and its regression eval fixtures (`evals/evals.json`). The skill encodes exactly the rule set that beat baseline in the 2026-07-18 isolated A/B eval (arm A3: term discipline + grounding, −67% undefined-terms/1k words on clean runs) and documents why refuted candidates (reader-model line, persona framing) are excluded. Non-goals: it does not own general writing style for non-explanatory output (status lines, command output), does not carry a reader-model parameter (refuted by arm A4), and does not duplicate the owner's global CLAUDE.md voicing rules — it is the versioned, eval-fixtured replacement for that hand-pasted bundle.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Preconditions | Installed via symlink (./install.sh explaining) or marketplace; Claude Code loads frontmatter description for triggering | install.sh, ref-plugin-layout |
| Inputs | A task producing explanatory prose (explain/document/teach/research write-up) | N.A - trigger surface is the skill frontmatter description, no doc entity |
| State | None — stateless style rules applied per response | N.A - stateless skill, no persisted state |
| Shared dependencies | Repo eval harness executes its fixtures | c3-3 |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | Explanatory output where every new term gets a lead-in and every abstract claim carries an anchor (code/example/fact) | adr-20260718-explaining-skill |
| Primary path | Session hits an explanation-shaped task → skill triggers → both rules + self-check applied to the draft | adr-20260718-explaining-skill |
| Alternates | Terse operational output (command results, checklists) — out of scope by description | N.A - excluded by the skill description frontmatter |
| Failure behavior | Unverifiable claim → must be marked unverified or deleted, never asserted | adr-20260718-explaining-skill |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | ref | Directory shape (.claude-plugin/plugin.json, skills/, evals/) | container ref | complied |
| ref-evals-fixture | ref | evals/evals.json shared fixture shape (skill_name/kind/evals[].id/name/prompt/expected_output/files, prose rubric) | container ref | complied |
| ref-docs-lifecycle | ref | Dated eval-evidence artifact docs/superpowers/evidence/2026-07-18-explaining-skill-ab-eval.json | repo ref | complied |
| rule-marketplace-registration | rule | Marketplace entry, same commit as plugin dir | repo rule | complied |
| adr-20260718-explaining-skill | adr | Which rules ship and why; eval evidence bounds | work order | source of the rule-selection decision |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| skills/explaining/SKILL.md | OUT | Frontmatter description triggers only on explanation-shaped tasks; body carries five eval-backed rules — term discipline (Rule 1), grounding (Rule 2), name a concept instead of the behaviour (Rule 3), illustrate a flow instead of narrating it (Rule 4, evidence eval case tribe-overall-flow-illustrated), and blind-reader review before delivery (Rule 5: dispatch a fresh subagent per round against references/blind-reader-brief.md, logged to <draft>.review.jsonl, gated by scripts/check-review-log.ts) — + self-check + evidence note | Claude Code skill loader | SKILL.md content; eval case tribe-overall-flow-illustrated and eval case write-ahead-log-explained-and-blind-read in skills/explaining/evals/evals.json |
| evals/evals.json | OUT | Shared fixture shape (skill_name/kind/evals[].prompt/expected_output) executable by the harness unmodified | c3-3 eval harness | python3 scripts/evals/run_evals.py --evals plugins/explaining/evals/evals.json |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Rule edits drift from evidence (rules kept on vibes) | Any SKILL.md rule change | Evidence note in SKILL.md names the numbers; ADR records bounds | Re-run evals/evals.json via harness; keep a rule only if numbers still back it |
| Over-triggering on non-explanation tasks | Description broadened | Skill fires on operational output | Re-read plugins/explaining/skills/explaining/SKILL.md description against sample operational tasks after any description edit |
| Registry drift | Plugin renamed/moved | install.sh --list vs marketplace.json disagree | rule-marketplace-registration check |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| plugins/explaining/skills/explaining/SKILL.md | This component's Purpose section (A3 rule pair only) and Governance row adr-20260718-explaining-skill | Wording/formatting; never rule additions without new eval evidence | Evidence section inside plugins/explaining/skills/explaining/SKILL.md cites the eval numbers; docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review.md |
| plugins/explaining/evals/evals.json | This component's Contract row evals/evals.json and Change Safety row 1 (evidence-gated rule edits) | Additional cases may be added; existing two stay | python3 scripts/evals/run_evals.py --evals plugins/explaining/evals/evals.json |
| plugins/explaining/skills/explaining/references/blind-reader-brief.md | This component's Contract row skills/explaining/SKILL.md (Rule 5's dispatch paragraph) | Wording; the three slots (file path, audience, language) and the absence of any other input are invariant | bun test in plugins/explaining/skills/explaining/scripts |
| plugins/explaining/skills/explaining/scripts/{validate-mermaid.ts,render-illustration.ts,check-review-log.ts} | This component's Contract row skills/explaining/SKILL.md (Rule 4's How paragraph: build with render-illustration.ts, validate with validate-mermaid.ts; Rule 5's log-check paragraph: check with check-review-log.ts) | Implementation details; validate-mermaid.ts's exit codes (0 valid, 1 invalid, 2 could-not-validate), render-illustration.ts's class="mermaid" output contract, and check-review-log.ts's exit codes (0 sound, 1 unsound, 2 could not run) must hold | bun test in plugins/explaining/skills/explaining/scripts; runtime dependency (bun + mermaid/jsdom) installed on demand via bun install, node_modules/ gitignored |
