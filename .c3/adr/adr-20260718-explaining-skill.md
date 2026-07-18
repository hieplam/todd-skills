---
id: adr-20260718-explaining-skill
c3-seal: ce76784d30fc2ad80ade2f0c000d00f6dfda8c470be5328032e3d9a0727e4551
title: explaining-skill
type: adr
goal: 'Add a new skill-only plugin `plugins/explaining/` whose `skills/explaining/SKILL.md` encodes explanation-writing rules for Claude sessions — but ship ONLY the rule components that won this session''s A/B eval (arm A3: term-discipline + grounding, −67% undefined-terms/1k words vs no-rules baseline on clean runs), explicitly excluding the two components the eval refuted or left unproven (reader-model line, standalone persona framing). Register it in `.claude-plugin/marketplace.json` and ship regression eval fixtures in `plugins/explaining/evals/evals.json` so the claim "these rules work" stays mechanically re-checkable.'
status: accepted
date: "2026-07-18"
---

## Goal

Add a new skill-only plugin `plugins/explaining/` whose `skills/explaining/SKILL.md` encodes explanation-writing rules for Claude sessions — but ship ONLY the rule components that won this session's A/B eval (arm A3: term-discipline + grounding, −67% undefined-terms/1k words vs no-rules baseline on clean runs), explicitly excluding the two components the eval refuted or left unproven (reader-model line, standalone persona framing). Register it in `.claude-plugin/marketplace.json` and ship regression eval fixtures in `plugins/explaining/evals/evals.json` so the claim "these rules work" stays mechanically re-checkable.

## Context

The owner's global `~/.claude/CLAUDE.md` currently carries an "Explainations and voicing" rule bundle pasted from a Gemini session (Context-First + Grounded Explanations + Anti-goals), and `memo/CLAUDE.md` carries the same session's persona variant ("meticulous technical instructor"). The owner added the bundle plus their own line ("ground claim with truth, code or fact") in one shot, observed clearer output, and could not attribute the improvement — the variables were never isolated. A Claude.AI handoff (`~/Downloads/files-handoff/`) designed an A/B kit (arms A0–A4, metrics M1 undefined-term rate / M2 grounding ratio / M3 over-explanation count) and left a skeleton SKILL.md with 4 candidate rules, 2 of them explicitly untested hypotheses. This session ran the eval: 30 isolated `claude -p` runs (Opus 4.8, `--setting-sources project` so no CLAUDE.md contaminates the baseline) + a Fable 5 transfer grid, graded blind by a Sonnet grader with ~13% hand spot-check. Clean-run results (P1+P2; P3 was contaminated — the prompt triggered the built-in claude-api skill in all 10 P3 runs): A0 M1=12.18, A1 (grounding only) M1=11.17 (≈no effect alone), A2 (term-discipline only) M1=5.41 but M3 worst at 1.25, A3 (both) M1=4.06 with M3 damped to 0.75, A4 (adding reader-model line) M1 regressed to 10.04 and output grew +18%. Independent web verification confirmed all 4 literature claims in the handoff (arXiv 2209.12711, 2311.10054, NeurIPS'23 LLM-judge biases) and found 2025–26 work (arXiv 2601.08070, 2503.22395) reinforcing affirmative-over-negated phrasing on modern models. The affected topology is the `c3-2` plugins container (new component) and `c3-101` installer surfaces (marketplace manifest).

## Decision

Ship `plugins/explaining/` as a skill-only plugin conforming to ref-plugin-layout: `.claude-plugin/plugin.json`, `skills/explaining/SKILL.md`, plugin-level `evals/evals.json`. The SKILL.md body contains exactly the eval-winning A3 rule pair — (1) term discipline: define/lead-in every new term at first use; (2) grounding: anchor abstract claims with code, example, or verifiable fact — plus a 2-item self-check derived from them, and a short evidence note linking the eval data bounds (n=4/arm clean, directional). The refuted reader-model rule and the unproven persona framing are NOT included; the known residual risk (A3 still over-explains slightly, M3 0.75 vs 0.25 baseline) is recorded as a documented limitation instead of an untested counter-rule. Frontmatter description states triggering conditions only (per skill-authoring best practice), so the skill auto-triggers on explanation/documentation/teaching tasks. This wins over editing the global CLAUDE.md bundle in place because a versioned, eval-fixtured plugin is re-testable and installable on any machine, while CLAUDE.md prose has already drifted into two divergent copies.

## Affected Topology

| Entity | Type | Why affected | Governance review |
| --- | --- | --- | --- |
| c3-2 | container | Gains a new member component (the 9th plugin); ## Components table and goal contribution must list it | Parent Delta: update ## Components in same change |
| c3-101 | component | Owns .claude-plugin/marketplace.json, which gets the new registry entry; install.sh itself needs no code change (generic walk) | rule-marketplace-registration compliance check |
| c3-3 | container | Eval harness discovers the new evals/evals.json fixture; no code change, fixture must be in the shared shape | Fixture-shape review against existing tribe/refactor-for-testability fixtures |

## Compliance Refs

| Ref | Why required | Action |
| --- | --- | --- |
| ref-plugin-layout | New plugin must match the exact directory contract install.sh walks (.claude-plugin/plugin.json + skills/<name>/ + evals/) | comply |
| ref-evals-fixture | plugins/explaining/evals/evals.json must use the shared fixture shape (skill_name/kind/evals[].id/name/prompt/expected_output/files, prose rubric) so the harness benchmarks it unmodified | comply |
| ref-docs-lifecycle | The A/B eval numbers are the proof artifact for this decision; they must outlive the session as a dated evidence doc (docs/superpowers/evidence/2026-07-18-explaining-skill-ab-eval.json) | comply |

## Compliance Rules

| Rule | Why required | Action |
| --- | --- | --- |
| rule-marketplace-registration | New plugins/explaining/ directory must get a marketplace entry with name == basename, source ./plugins/explaining, same commit | comply |
| rule-no-squash-merge | The PR landing this change must merge with a regular 2-parent merge commit | comply |
| rule-bash-strict-mode | Applies to any shipped .sh; this plugin ships none | N.A - plugin contains no shell scripts |

## Work Breakdown

| Area | Detail | Evidence |
| --- | --- | --- |
| plugins/explaining/.claude-plugin/plugin.json | name explaining, description, version 1.0.0 | file exists, name matches dir basename |
| plugins/explaining/skills/explaining/SKILL.md | Frontmatter (name, trigger-only description) + A3 rule pair + self-check + evidence note | wc + content review against this ADR's Decision |
| plugins/explaining/evals/evals.json | 2 regression cases in shared fixture shape (skill_name, kind: skill, evals[].prompt/expected_output) using the eval's clean prompts P1/P2 | scripts/evals/run_evals.py discovers it |
| .claude-plugin/marketplace.json | Append explaining entry | rule-marketplace-registration check |
| README.md plugin table | Add row for explaining | diff |
| .c3 docs | New component c3-218-explaining under c3-2; update c3-2 ## Components; wire component | c3 check clean |

## Underlay C3 Changes

| Underlay area | Exact C3 change | Verification evidence |
| --- | --- | --- |
| N.A - <no C3 CLI/validator/schema/template surface is touched; change adds content entities only> | N.A | N.A |

## Enforcement Surfaces

| Surface | Behavior | Evidence |
| --- | --- | --- |
| ./install.sh --list | Lists explaining (skills: 1); install links ~/.claude/skills/explaining → repo | command output after implementation |
| scripts/evals/run_evals.py | Discovers and can execute plugins/explaining/evals/evals.json in with/without-skill configurations | discovery run output |
| c3 check | Validates c3-218 component doc + c3-2 container membership stay in sync | clean check |
| GitHub PR merge | rule-no-squash-merge: merge commit has exactly 2 parents (git rev-list --parents -n 1 <sha>) | parent count check post-merge |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| Keep/expand the rule bundle in global ~/.claude/CLAUDE.md | Already drifted into 2 divergent copies (global + memo/CLAUDE.md); unversioned, no eval fixtures, and this repo's whole purpose is versioned installable capabilities |
| Ship all 4 skeleton rules from the Claude.AI handoff | Rules 1 (reader-model) and 4 (stopping condition) are not eval-backed; the A4 arm that tested the reader-model line regressed M1 to 10.04 (vs 4.06 A3) and grew output +18% — shipping them would violate the owner's "do not ship unverified rules" anti-goal |
| Ship A2 (term-discipline) alone as the single proven active ingredient | A2 alone doubled over-explanation (M3 1.25 vs 0.25 baseline); the A3 pair kept M1 within noise of A2's (4.06 vs 5.41) while damping M3 to 0.75 — the pair dominates on the metric set |
| Persona framing ("act as a meticulous instructor") per memo/CLAUDE.md | Zheng et al. 2024 (arXiv 2311.10054, EMNLP Findings): personas in system prompts do not improve task performance; verified independently this session |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| Eval is directional (n=4/arm clean runs, LLM grader over-counts fragments) — rules could be weaker than measured | Evidence bounds stated inside SKILL.md's status note; evals.json regression fixtures allow re-running with more reps | ~13% of grades hand-spot-checked this session; re-run path documented |
| Grader/generator both Claude models — family self-preference bias | Metrics are counts (undefined terms), not preference judgments; blind grading with randomized IDs | spot-check found over-counting noise but no arm-directional bias |
| Skill over-triggers on non-explanation tasks (description too broad) | Description written trigger-only per skill-authoring SDO guidance; scoped to explain/document/teach outputs | manual trigger review; adjustable post-install since symlink tracks repo |
| Residual over-explanation (A3 M3 0.75 vs 0.25 baseline) | Documented limitation; NOT countered with an untested stopping-condition rule | future eval arm if it bites in practice |

## Verification

| Check | Result |
| --- | --- |
| ./install.sh explaining && ls -la ~/.claude/skills/explaining | pending — symlink resolves into repo checkout |
| python3 scripts/evals/run_evals.py (discovery includes explaining) | pending |
| c3 check | pending — clean |
| gh pr view + git rev-list --parents -n 1 <merge-sha> | pending — merged with exactly 2 parents |
| Fable 5 transfer grid (A0 vs A3, P1+P2) | pending at ADR time — will be recorded in the research note before merge |
