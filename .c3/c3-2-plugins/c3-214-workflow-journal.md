---
id: c3-214
c3-seal: f7b4c6c6a7838d76f241df5d425387a3376f37a73d1f2200bc59a32b78fbd394
title: workflow-journal
type: component
category: feature
parent: c3-2
goal: Render each Claude Code Workflow run to one readable Markdown file (every agent's full prompt, result, and token cost) and auto-capture runs via a Stop hook.
uses:
    - ref-plugin-layout
    - rule-bash-strict-mode
---

## Goal

Render each Claude Code Workflow run to one readable Markdown file (every agent's full prompt, result, and token cost) and auto-capture runs via a Stop hook.

## Parent Fit

| Field | Value |
| --- | --- |
| Container | c3-2 plugins — Claude Code runtime content |
| Category | Feature — observability |
| Role in parent | Skill + exporter script + hook config + post-install hook (hooks/hooks.json, install.sh) |
| Depends on siblings | None; journals Workflow runs from any source |

## Purpose

Owns the durable record of Workflow runs: export format, run discovery on disk, and the Stop-hook wiring that captures every run automatically. Non-goals: altering runs, or journaling non-Workflow activity.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Precondition | Workflow runs exist in session transcript dirs; hook installed for auto-capture | N.A - see SKILL.md description |
| Inputs | Run IDs (wf_…), or the Stop hook firing at run completion | N.A - see hooks/hooks.json |
| State | Exported Markdown files per run on disk | N.A - see scripts/wf-export.py |
| Shared dependencies | Plugin layout (skills/, hooks/, install.sh hook) | ref-plugin-layout |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | One Markdown file per run: each agent's full prompt paired with full result + token cost | N.A - see SKILL.md description |
| Primary path | Stop hook fires → wf-export.py renders the completed run → file lands in the journal dir | ref-plugin-layout |
| Alternates | Manual: list runs on disk, re-export a named wf_… run, query past runs | N.A - see SKILL.md description |
| Failure behavior | Export failures surface in hook output; source transcripts are never modified | N.A - see exporter is read-only over transcripts |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | ref | Directory shape incl. hooks/ and install.sh hook | binding | install.sh hook wires the Stop hook |
| rule-bash-strict-mode | rule | install.sh preamble | binding | — |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| Stop hook registration | IN | Fires on session stop, captures completed Workflow runs | Claude Code hook system | plugins/workflow-journal/hooks/hooks.json |
| scripts/wf-export.py | IN/OUT | Reads run transcripts, writes one Markdown file per run; never edits sources | Python CLI | plugins/workflow-journal/skills/workflow-journal/scripts/wf-export.py |
| Journal Markdown files | OUT | Full prompt + full result + cost per agent, human-readable | filesystem | SKILL.md description |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Silent capture loss | Hook config or install hook edits | New runs stop appearing in the journal | Complete a Workflow run and confirm plugins/workflow-journal/skills/workflow-journal/scripts/wf-export.py produced the journal file |
| Truncated exports | Changing the render logic in wf-export.py | Prompts/results cut short in output | Re-export a known run via plugins/workflow-journal/skills/workflow-journal/scripts/wf-export.py and diff against the previous export |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Journal Markdown files | Contract section (the wf-export.py surface reads transcripts verbatim) | Layout/formatting only — content verbatim | plugins/workflow-journal/skills/workflow-journal/scripts/wf-export.py |
