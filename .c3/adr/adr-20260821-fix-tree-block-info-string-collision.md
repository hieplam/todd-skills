---
id: adr-20260821-fix-tree-block-info-string-collision
c3-seal: 6dee2204e2ef478bdeb4f0ab892525ec368a8fbf28a224103f6b407585380679
title: fix-tree-block-info-string-collision
type: adr
goal: |-
    Fix content loss introduced by `adr-20260821-relocate-skill-local-scripts-note`'s
    first patch: replacing `ref-plugin-layout#n1646` with body text beginning directly
    with `plugins/tribe/` (no leading blank line before the tree diagram) let the c3x
    tool's markdown serializer read that first line as the code fence's info string
    rather than as fenced content, so the literal root-directory line `plugins/tribe/`
    of the tree diagram silently disappeared from both the raw file and the block's own
    semantic content (confirmed: `c3x read ref-plugin-layout --section How --cite` now
    quotes n1646 as starting at `├── .claude-plugin/plugin.json...`, not
    `plugins/tribe/`).
status: accepted
date: "2026-08-21"
---

## Goal

Fix content loss introduced by `adr-20260821-relocate-skill-local-scripts-note`'s
first patch: replacing `ref-plugin-layout#n1646` with body text beginning directly
with `plugins/tribe/` (no leading blank line before the tree diagram) let the c3x
tool's markdown serializer read that first line as the code fence's info string
rather than as fenced content, so the literal root-directory line `plugins/tribe/`
of the tree diagram silently disappeared from both the raw file and the block's own
semantic content (confirmed: `c3x read ref-plugin-layout --section How --cite` now
quotes n1646 as starting at `├── .claude-plugin/plugin.json...`, not
`plugins/tribe/`).

## Context

CommonMark fenced code blocks accept an optional "info string" directly after the
opening fence marker on the same line (e.g. ` ```bash `); a fence marker immediately
followed by non-whitespace text on that same line is parsed as an info string, not as
the first line of code content. The c3x tool's serializer, given raw block content
whose first character is not preceded by a blank line, apparently concatenates the
fence marker and the first content line onto one physical line, reproducing exactly
this CommonMark ambiguity. The fix is mechanical: the replacement content must not
place literal text abutting where the fence marker will be written; a blank leading
line resolves it.

## Decision

One more `block`-scope replace of `ref-plugin-layout#n1646`, identical to the prior
correction's content, but with an explicit blank line before `plugins/tribe/` so the
tool's serializer cannot fold the fence marker onto the same physical line as the
diagram's root label.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | N.A - ref (governance doc, not topology; the fact this unit amends) | Its How-section tree diagram is missing its root plugins/tribe/ line after the immediately prior correction unit | ref-plugin-layout#n1645@v1:sha256:f64118a76107b84c7097cded8fab1b4b4b3872a3a28fe51cbb5a151715f06e1d "Golden layout, from the richest real plugin" | This unit's one patch is the review |

## Verification

| Check | Result |
| --- | --- |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 change apply adr-20260821-fix-tree-block-info-string-collision | Reports the patch applied |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 check | Exactly the 2 pre-existing errors, no new error |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 read ref-plugin-layout --section How --cite | n1646's content again starts with plugins/tribe/ |
