---
id: c3-2
c3-seal: 2605ae1568ac3adb2af02d37805964912a8fc6250f927ec5e3c4f8aceb819558
title: plugins
type: container
boundary: service
parent: c3-0
goal: 'Claude Code runtime content: the 8 installable plugins — agents and skills that, once symlinked into `~/.claude`, extend every Claude Code session with delivery orchestration (tribe), quality gates (check-diff-coverage, refactor-for-testability, verify-shipped), planning (splitting-plans), publishing (research-to-blog), observability (workflow-journal), and media production (simple-image-video).'
---

## Goal

Claude Code runtime content: the 8 installable plugins — agents and skills that, once symlinked into `~/.claude`, extend every Claude Code session with delivery orchestration (tribe), quality gates (check-diff-coverage, refactor-for-testability, verify-shipped), planning (splitting-plans), publishing (research-to-blog), observability (workflow-journal), and media production (simple-image-video).

## Components

| ID | Name | Category | Status | Goal Contribution |
| --- | --- | --- | --- | --- |
| c3-210 | splitting-plans | Feature | active | Splits >500-line monolithic plans into dependency-aware sub-plans parallel subagents can execute |
| c3-211 | check-diff-coverage | Feature | active | Measures the uncovered diff vs main (.NET/Go) and drives a remediation loop under 20% |
| c3-212 | refactor-for-testability | Feature | active | Reshapes untestable code (no seams, ambient state) into testable form before behavior changes |
| c3-213 | research-to-blog | Feature | active | Agent that turns session insights or bare topics into bilingual EN+VI research notes and published blog posts |
| c3-214 | workflow-journal | Feature | active | Exports Workflow runs to readable Markdown and auto-captures each run via a Stop hook |
| c3-215 | tribe | Feature | active | 5-agent chain of command (Shaman/Warchief/Hunter + Tracker/Skinner gates) delivering squash-merged PRs with evidence |
| c3-216 | simple-image-video | Feature | active | Animates one still image into a seamlessly-looping music video via sine-driven Remotion effects |
| c3-217 | verify-shipped | Feature | active | Mechanically verifies the Definition of Done: PR merged via squash, master synced, worktree removed |

## Responsibilities

- Each plugin conforms to the shared layout contract (`.claude-plugin/plugin.json` + `agents/` and/or `skills/<name>/SKILL.md`, optional `install.sh` hook, `claude-md/`, `scripts/`, `evals/`) so the installer can walk it without per-plugin logic.
- Plugins own their business logic and runtime assets end-to-end (skill references, helper scripts, templates); nothing here runs at install time except declared `install.sh` hooks.
- Plugins that ship `evals/evals.json` fixtures (splitting-plans, check-diff-coverage, refactor-for-testability, tribe) keep them in the shared fixture shape so the eval-harness container can benchmark them unmodified.
- Cross-plugin contracts stay file-based: tribe writes roadmap/spec/plan/report files; verify-shipped checks git/GitHub state produced by tribe's Warchief — no plugin imports another's code.

## Complexity Assessment

tribe is the complex member: 5 agent definitions with strict role boundaries, heartbeat/resume/plan-validation scripts with their own shell tests, agent-flavored evals, and a CLAUDE.md-appending install hook. simple-image-video carries a full Remotion TypeScript template. The rest are single-skill plugins of trivial-to-moderate complexity.
