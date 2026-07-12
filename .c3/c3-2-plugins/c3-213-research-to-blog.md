---
id: c3-213
c3-seal: bbbe6208cb70141d597d4b63d9378b7ea5b3082962aecd40313ac6c68d075ef8
title: research-to-blog
type: component
category: feature
parent: c3-2
goal: Turn a session insight or bare topic into a bilingual EN+VI research note in the user's research repo, then published GitHub Pages blog posts.
uses:
    - ref-plugin-layout
---

## Goal

Turn a session insight or bare topic into a bilingual EN+VI research note in the user's research repo, then published GitHub Pages blog posts.

## Parent Fit

| Field | Value |
| --- | --- |
| Container | c3-2 plugins — Claude Code runtime content |
| Category | Feature — publishing pipeline |
| Role in parent | Agent-flavored plugin: a single agent definition, no skills or scripts |
| Depends on siblings | None |

## Purpose

Owns the insight→published-post pipeline in two modes: (a) format-and-publish finished research substance, or (b) run its own deep web research from a thin brief first, then publish. Non-goals: editing existing posts, and research that must stay unpublished.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Precondition | User's research repo and GitHub Pages blog exist and are writable | N.A - see agents/research-to-blog.md |
| Inputs | Finished findings (mode a) or a topic/thin brief (mode b); EN/VI trigger phrases | N.A - see agent frontmatter description |
| State | Notes committed to the research repo; posts committed to the blog repo | N.A - see agent definition |
| Shared dependencies | Tools: Read, Write, Edit, Bash, Grep, WebSearch, WebFetch; model inherit | ref-plugin-layout |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | Bilingual research note + bilingual blog posts live on GitHub Pages | N.A - see agent description |
| Primary path | Detect mode → (research if mode b) → write EN+VI note → derive blog posts → publish | ref-plugin-layout |
| Alternates | Mode a skips research and goes straight to formatting/publishing | N.A - see agent description ("works TWO ways") |
| Failure behavior | Out-of-scope requests (edit existing posts, unpublishable research) are declined by trigger design | N.A - see agent description ("Not for") |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | ref | Agent-flavored plugin shape (agents/*.md only) | binding | Installed as a single symlinked agent file |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| Agent trigger (EN/VI phrases) | IN | Bilingual trigger set in frontmatter description | Claude Code agent system | plugins/research-to-blog/agents/research-to-blog.md |
| Research repo + blog repo commits | OUT | Bilingual note + posts pushed/published to GitHub Pages | external git repos | plugins/research-to-blog/agents/research-to-blog.md |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Publishing content meant to stay private | Weakening the "Not for" scope | Unwanted public posts | Re-read the scope wording in plugins/research-to-blog/agents/research-to-blog.md on every description change |
| Wrong-repo writes | Changing repo-discovery logic in the agent body | Commits landing in unexpected repos | Dry-run plugins/research-to-blog/agents/research-to-blog.md against scratch repos after edits |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| Published blog posts | Business Flow section (primary path: the note precedes and sources the posts) | Presentation/formatting per blog conventions | plugins/research-to-blog/agents/research-to-blog.md |
