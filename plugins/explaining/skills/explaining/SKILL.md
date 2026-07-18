---
name: explaining
description: Use when producing any prose whose main job is to make a reader understand something — explaining a concept, answering a "why/how does X work" question, writing research notes, design docs, architecture or code documentation, teaching-style answers, PR descriptions of non-trivial changes, or blog drafts — even when the user doesn't say "explain". Applies in any output language. Not for terse operational output (command results, status lines, checklists).
---

# Explaining

## Overview

Default LLM technical prose imitates expert-to-expert register: terms appear without introduction and claims stay abstract. These two rules replace that default. They are the pair that won an isolated A/B eval against baseline and against each rule alone — apply **both** to any explanatory prose you produce.

## Rule 1 — Term discipline: define before use

Any new concept, technology, or technical term must be briefly defined or contextualized the first time it is introduced. Never drop a new term mid-explanation without an introductory lead-in. If a term needs a whole paragraph to define, define it *before* the section that depends on it, not inside.

## Rule 2 — Grounding: anchor every abstract claim

Ground every claim with truth, code or fact. Pair each abstract or general statement with at least one of:

- a code snippet that demonstrates it,
- a concrete worked example, or
- a verifiable fact/source.

If you cannot ground a claim, mark it explicitly as unverified/opinion or delete it. Prefer showing the artifact first, then explaining it — the artifact carries its own context.

## Self-check before finishing

Scan the draft once and fix:

1. Any technical term at first use without a lead-in or definition? (Rule 1)
2. Any abstract claim with no code/example/fact anchor and no "unverified" marker? (Rule 2)

## Evidence — why exactly these two rules

A/B eval, 2026-07-18: 5 arms × isolated `claude -p` runs (`--setting-sources project`, no CLAUDE.md leakage), blind-graded by a separate model on countable metrics. On clean runs, baseline scored **12.18 undefined terms per 1k words**; this rule pair scored **4.06 (−67%)**. Each rule alone lost to the pair: term discipline alone doubled over-explanation (M3 1.25 vs the pair's 0.75); the grounding line alone did not move the undefined-term rate (11.17 ≈ baseline) though it directionally helped grounding ratio. An added reader-model line ("Reader: senior .NET dev…") *regressed* undefined terms to 10.04 and grew output +18% — excluded. Persona framing ("act as a meticulous instructor") is excluded per Zheng et al. 2024 (arXiv 2311.10054): personas in system prompts don't improve task performance.

Model transfer (measured, not assumed): the −67% effect was measured on Opus 4.8. A same-design transfer grid on Fable 5 found its *baseline* already near the rules' level (M1 8.92 baseline vs 8.20 with rules — within noise); there the pair mainly narrowed variance (±3.49 → ±1.34) with no measured harm. Expect the largest gains on models/subagents with jargon-heavy defaults, and consistency gains elsewhere.

Known limits: n=4 clean runs/arm (directional, not statistical); the pair still over-explains slightly vs no-rules baseline (M3 0.75 vs 0.25). Regression fixtures: `../../evals/evals.json` — re-run with the repo eval harness before editing these rules, and keep a rule only if the numbers still back it.
