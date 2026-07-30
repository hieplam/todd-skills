---
id: adr-20260730-global-rules-snippet
c3-seal: 41a4634daa9b120ccfbe41632d2d254cf8dddadca62d39f4d91544320c399f88
title: global-rules-snippet
type: adr
goal: 'Repurpose the tribe plugin''s global-CLAUDE.md snippet: rename `plugins/tribe/claude-md/review-agents.md` to `plugins/tribe/claude-md/global-rules.md` and replace its body with the owner''s consolidated global standing rules (non-negotiables, explanation voicing, definition of work done), making the repo file the single authored source of the owner''s `~/.claude/CLAUDE.md` content. The "Review agents — when to use which" section is dropped from the global-CLAUDE.md surface entirely: agent selection guidance moves to its native discovery channel — the agent definitions'' frontmatter descriptions — with a one-sentence timing cue added to `tracker.md` (skinner already carries "BEFORE claiming done"). The install-hook append mechanics are unchanged.'
status: accepted
date: "2026-07-30"
---

## Goal

Repurpose the tribe plugin's global-CLAUDE.md snippet: rename `plugins/tribe/claude-md/review-agents.md` to `plugins/tribe/claude-md/global-rules.md` and replace its body with the owner's consolidated global standing rules (non-negotiables, explanation voicing, definition of work done), making the repo file the single authored source of the owner's `~/.claude/CLAUDE.md` content. The "Review agents — when to use which" section is dropped from the global-CLAUDE.md surface entirely: agent selection guidance moves to its native discovery channel — the agent definitions' frontmatter descriptions — with a one-sentence timing cue added to `tracker.md` (skinner already carries "BEFORE claiming done"). The install-hook append mechanics are unchanged.

## Context

The owner's `~/.claude/CLAUDE.md` and the tribe snippet drifted into three-way semantic duplication: the same voicing rules lived in the owner's CLAUDE.md (under a typoed heading `# Explainations and voicing`), in the snippet (`# Explanations and voicing` plus an internally duplicated Overview restating Rule 1/Rule 2), and in the `explaining` skill (the eval-backed original). The typo defeats the hook's heading-overlap guard (`plugins/tribe/install.sh:70-82` compares headings with `grep -qxF`), so a hook run appends a second near-identical section — exactly the divergence the guard exists to prevent. Meanwhile the snippet lacked five sections the owner's CLAUDE.md carries (dev-cost preference, E2E bug reproduction, no co-author, knowledge baseline, definition of done), so the snippet could not serve as the source of the owner's global config. The review-agents lifecycle section duplicated content that already lives in the agent definitions: tracker/skinner mutual boundaries (`plugins/tribe/agents/tracker.md:10-12`, `skinner.md:331`), harness-gap doctrine (`tracker.md:64-142`), and the Warchief disposition adjudication (`warchief.md` Law 3). Affected topology: component c3-215 (tribe) only; its Governance, Contract, and Derived Materials rows name the old file, and ref-plugin-layout's golden tree names it too.

## Decision

Keep the append-based install hook exactly as is (owner's explicit choice over a CLAUDE.md symlink) and make the snippet a complete, consolidated statement of the owner's global rules under the marker heading `# NON-NEGOTIABLE RULES`. Rename the file to `global-rules.md` so the name matches the new purpose; the hook globs `claude-md/*.md`, so no hook change is needed. Delete the review-agents section from the global surface and rely on frontmatter descriptions for agent discovery — Claude Code loads every installed agent's description into each session's system prompt, which is the mechanism that lets the model choose the right reviewer situationally instead of following a globally fixed workflow; enforcement of done-gating stays where it already lives (warchief's dual-skinner audit, tracker/skinner cross-references). `test-fixer-mandate.sh` drops its two assertions against the snippet because the doctrine's asserted homes remain `README.md`, `warchief.md`, and `hunter.md` (same suite, groups A–D). Owner migration is a documented one-shot: back up `~/.claude/CLAUDE.md`, truncate it, re-run `./install.sh tribe` so the hook appends the consolidated snippet fresh.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | Its Governance row (ref-plugin-layout note), Contract row (Global CLAUDE.md append surface), and Derived Materials row (CLAUDE.md snippet) all name claude-md/review-agents.md and describe review-agent guidance; the file is renamed and repurposed | c3-215#n1165@v1:sha256:f467fd1ec102c55b693524d1b29fda35cba5ac48b31be638a9f6a38cc5b3aef8 "Deliver features through a 5-agent chain of command — Shaman (What/Why) → Warchief (How) → Hunter (TDD execution), gated by Tracker (rules review) and Ski" | Three block patches in this unit (Governance, Contract, Derived Materials rows) |
| c3-2 | container | Parent of c3-215; no membership, boundary, or responsibility change — the plugin keeps the same component directories and install path | c3-2#n871@v1:sha256:f92a1cfb53ada54dba5f5c1154ccef3423fe08276ff6ec199cc745be16f8d3d0 "Claude Code runtime content: the 9 installable plugins — agents and skills that, once symlinked into ~/.claude, extend every Claude Code session" | Parent Delta: none — snippet rename stays inside c3-215's existing claude-md/ surface |

## Compliance Refs

| Ref | Why required | Evidence | Action |
| --- | --- | --- | --- |
| ref-plugin-layout | Its golden layout tree names claude-md/review-agents.md as the example snippet; after the rename the tree would document a nonexistent file | ref-plugin-layout#n1404@v1:sha256:cf0b084703da153ee02f7441a78a84fd5cc115c8c0003177012bacbd84ab51cf "plugins/tribe/" | update-ref — block patch in this unit renames the tree entry to claude-md/global-rules.md |
| ref-docs-lifecycle | Governs specs/plans/evidence for tribe feature work; this change ships evidence via test runs and the ADR itself, no doc-lifecycle shape change | ref-docs-lifecycle#n1378@v1:sha256:a163534e4fbc98d69ae8cd12167eedff5b0840b29f305b2a4d73a5784501ec2c "Give feature work a durable, ordered paper trail — designs, implementation plans, and proof artifacts must outlive the chat session that produced them" | comply |

## Compliance Rules

| Rule | Why required | Evidence | Action |
| --- | --- | --- | --- |
| rule-bash-strict-mode | test-fixer-mandate.sh is edited (drops the REVIEW_DOC assertions); the script must keep set -euo pipefail fail-fast behavior | rule-bash-strict-mode#n1409@v1:sha256:7a8c286269da63a2ba7b7362b72631a2491addb28a1a4266304605106dbaba9a "All shell scripts start with #!/usr/bin/env bash followed by set -euo pipefail." | comply — edit removes assertions only, strict-mode preamble untouched |
| rule-stack-agnostic-agent-prompts | tracker.md's description gains a timing sentence; agent-prompt edits must stay language/stack-neutral | rule-stack-agnostic-agent-prompts#n1463@v1:sha256:a1a20b05de21d6ac887a4e6fcc020b0fde876fc17aed7fabaad35e79ece9cb2e "Agent prompt files (plugins//agents/.md) never hardcode a language name, toolchain command," | comply — added sentence ("Run it while developing — before every commit or PR") names no language, framework, or toolchain |

## Work Breakdown

| Area | Detail | Evidence |
| --- | --- | --- |
| Snippet rename + rewrite | git mv plugins/tribe/claude-md/review-agents.md plugins/tribe/claude-md/global-rules.md; body replaced with consolidated owner global rules (non-negotiables, voicing with pointer to the explaining skill, definition of done); review-agents section deleted | git diff on the branch |
| Agent description | plugins/tribe/agents/tracker.md description gains the timing cue sentence | git diff on tracker.md |
| Test repoint | plugins/tribe/scripts/tests/test-fixer-mandate.sh drops REVIEW_DOC variable, its two group-D assertions, and its slot in the negative-assertion loop | git diff on the test; suite passes 25/25 |
| C3 fact patches | Three block patches on c3-215 (Governance, Contract, Derived Materials rows) + one on ref-plugin-layout (golden tree) in .c3/changes/<this-adr>/ | c3 change status output |
| Owner machine migration | Back up ~/.claude/CLAUDE.md to .bak.<epoch>, truncate, run ./install.sh tribe to append the consolidated snippet fresh | shell transcript in the PR/session |

## Underlay C3 Changes

| Underlay area | Exact C3 change | Verification evidence |
| --- | --- | --- |
| N.A - no C3 CLI, validator, schema, template, or hint changes | N.A - this ADR edits repo content and C3 facts only | N.A - c3 check green after apply is the only C3-side proof needed |

## Enforcement Surfaces

| Surface | Behavior | Evidence |
| --- | --- | --- |
| plugins/tribe/scripts/tests/test-fixer-mandate.sh | Asserts the reproduce-first doctrine stays in hunter.md, warchief.md, README.md — loud failure if a future edit deletes it | 25 passed, 0 failed after the repoint |
| plugins/tribe/scripts/tests/test-install-hook.sh | Asserts hook idempotency: marker skip, heading-overlap guard, empty-marker warning | 8 passed, 0 failed |
| plugins/tribe/scripts/tests/test-install-rules.sh | Asserts rules symlinking + snippet append end-to-end | 10 passed, 0 failed |
| Install hook marker | Re-running ./install.sh tribe after migration prints "already present" — no duplicate append | second-run transcript |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| Symlink ~/.claude/CLAUDE.md to the repo snippet (true auto-propagating source of truth, like rules/pure-core.md) | Owner explicitly chose to keep the append model in this session; symlink also changes hook semantics and risks foreign tools writing through the link into the repo |
| Keep the review-agents section in the global snippet | Global CLAUDE.md applies to every repo on the machine, forcing a fixed review workflow everywhere; the content already lives in the agent definitions (tracker.md:10-12, skinner.md:331, warchief.md Law 3), and frontmatter descriptions are Claude Code's native agent-discovery channel |
| Keep the filename review-agents.md | The file no longer documents review agents; a name that contradicts content misleads both the installer's readers and ref-plugin-layout's golden tree |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| Append model cannot propagate future snippet edits (marker present → hook skips forever) | Documented owner workflow: edit the snippet, back up + truncate ~/.claude/CLAUDE.md, re-run ./install.sh tribe; recorded in this ADR's Work Breakdown | Re-run ./install.sh tribe twice and diff the global CLAUDE.md — second run is a no-op |
| Machines still carrying the old review-agents append get duplicate/contradicting sections | The hook's heading-overlap guard refuses the append and names the conflicting heading, leaving reconciliation to the owner | bash plugins/tribe/scripts/tests/test-install-hook.sh (overlap-guard cases) |
| Dropping the lifecycle section weakens proactive reviewer use outside tribe orchestration | Timing cue added to tracker's description; done-gating enforcement already lives in warchief's dual-skinner audit and the tracker/skinner cross-references | bash plugins/tribe/scripts/tests/test-fixer-mandate.sh keeps the doctrine asserted in its remaining homes |

## Verification

| Check | Result |
| --- | --- |
| bash plugins/tribe/scripts/tests/test-fixer-mandate.sh | 25 passed, 0 failed |
| bash plugins/tribe/scripts/tests/test-install-hook.sh | 8 passed, 0 failed |
| bash plugins/tribe/scripts/tests/test-install-rules.sh | 10 passed, 0 failed |
| CLAUDE_DIR=<tmp> bash plugins/tribe/install.sh run twice against a copy of the owner CLAUDE.md | first run appends global-rules.md, second prints "already present"; no duplicate sections |
| c3 change apply + c3 check | unit lands atomically; check green |
