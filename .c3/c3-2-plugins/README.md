---
id: c3-2
c3-seal: 295ae7a62dc56f51640a5a51c77b244ea72b6841949bdc13b53401f706f0eba6
title: plugins
type: container
boundary: service
parent: c3-0
goal: 'Claude Code runtime content: the 2 installable plugins — agents and skills that, once symlinked into `~/.claude`, extend every Claude Code session with delivery orchestration (tribe) and mechanical verification that a delivery really shipped (verify-shipped).'
---

## Goal

Claude Code runtime content: the 2 installable plugins — agents and skills that, once symlinked into `~/.claude`, extend every Claude Code session with delivery orchestration (tribe) and mechanical verification that a delivery really shipped (verify-shipped).

## Components

| ID | Name | Category | Status | Goal Contribution |
| --- | --- | --- | --- | --- |
| c3-215 | tribe | feature | active | 5-agent chain of command (Shaman/Warchief/Hunter + Tracker/Skinner gates) delivering squash-merged PRs with evidence |
| c3-217 | verify-shipped | feature | active | Mechanically verifies the Definition of Done: PR merged via squash, master synced, worktree removed |

## Responsibilities

- Each plugin conforms to the shared layout contract (`.claude-plugin/plugin.json` + `agents/` and/or `skills/<name>/SKILL.md`, optional `install.sh` hook, `claude-md/`, `scripts/`, `evals/`) so the installer can walk it without per-plugin logic.
- Plugins own their business logic and runtime assets end-to-end (skill references, helper scripts, templates); nothing here runs at install time except declared `install.sh` hooks.
- Plugins that ship `evals/evals.json` fixtures (tribe, and the mammoth-hunt skill inside it) keep them in the shared fixture shape so the eval-harness container can benchmark them unmodified.
- Cross-plugin contracts stay file-based: tribe writes roadmap/spec/plan/report files; verify-shipped checks git/GitHub state produced by tribe's Warchief — no plugin imports another's code.

## Complexity Assessment

tribe is the complex member: 6 agent definitions with strict role boundaries, heartbeat/resume/plan-validation scripts with their own shell tests, a campaign runner and live viewer in TypeScript, agent-flavored evals, and a CLAUDE.md-appending install hook. verify-shipped is a single-skill plugin wrapping one shell script.
