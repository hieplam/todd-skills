---
id: adr-20260821-relocate-skill-local-scripts-note
c3-seal: d3b14e7d5930094ae5a330868d2389f4780829f0fa2c9e4eb7f1ec26b5926d73
title: relocate-skill-local-scripts-note
type: adr
goal: |-
    Finish correcting the formatting defect from `adr-20260821-eval-arm-axis-and-machine-checks`:
    its first follow-up, `adr-20260821-fix-ref-plugin-layout-note-fence`, moved the
    skill-local-`scripts/`-is-installed note out of a stray fenced duplicate block and into
    `ref-plugin-layout`'s How-section tree-diagram block — but that block already carries
    deeply nested (5/4/3-backtick) fences from its own prior authoring, and the C3 tool's
    own outer-fence escalation (needed so the block's content, once it includes yet another
    literal `\`\`\`\`\`` run, still round-trips through a single well-formed fence) left the
    committed file with an unbalanced 11-backtick opening fence and no backtick run long
    enough to close it, plus an orphaned trailing fence line — confirmed by reading
    `.c3/refs/ref-plugin-layout.md` directly (open fence line has 11 backticks; no
    subsequent line in the block reaches 11). Relocate the note into the Why section's
    single, fence-free prose paragraph instead, and restore the How-section tree-diagram
    block to its pre-existing, byte-for-byte original content.
status: accepted
date: "2026-08-21"
---

## Goal

Finish correcting the formatting defect from `adr-20260821-eval-arm-axis-and-machine-checks`:
its first follow-up, `adr-20260821-fix-ref-plugin-layout-note-fence`, moved the
skill-local-`scripts/`-is-installed note out of a stray fenced duplicate block and into
`ref-plugin-layout`'s How-section tree-diagram block — but that block already carries
deeply nested (5/4/3-backtick) fences from its own prior authoring, and the C3 tool's
own outer-fence escalation (needed so the block's content, once it includes yet another
literal `\`\`\`\`\`` run, still round-trips through a single well-formed fence) left the
committed file with an unbalanced 11-backtick opening fence and no backtick run long
enough to close it, plus an orphaned trailing fence line — confirmed by reading
`.c3/refs/ref-plugin-layout.md` directly (open fence line has 11 backticks; no
subsequent line in the block reaches 11). Relocate the note into the Why section's
single, fence-free prose paragraph instead, and restore the How-section tree-diagram
block to its pre-existing, byte-for-byte original content.

## Context

`ref-plugin-layout`'s How section mixes a deeply nested example fence (opening at 5
backticks, with an inner 4-backtick and 3-backtick fence representing the literal
example text) with a short trailing sentence, all as one C3 block
(`ref-plugin-layout#n1646`). Appending more plain text to that block is legal C3-wise
(`block`-scope replace, one block, siblings frozen) but pushes the block's own maximum
internal backtick run higher every time literal fence markers are echoed back as part
of the replacement body, and the c3x tool's own outer-fence escalation logic has to
grow the wrapping fence to stay unambiguous — in this repo's currently installed c3x
11.6.3, that escalation left a fence whose closing run is shorter than its opening run,
which is invalid per CommonMark (a fence's closing run must be at least as long as its
opening run) and would render everything from the opening fence to end-of-file as one
giant, uninterrupted code block. `c3x check` does not catch this (it validates C3
structure, not CommonMark fence balance), so it is a Hunter-caught, not tool-caught,
defect. The Why section's paragraph (`ref-plugin-layout#n1643`) is unfenced, single-
paragraph prose with no nested code content at all — the safe place for one more
sentence.

## Decision

Two patches: (1) `block`-replace `ref-plugin-layout#n1646` back to its exact original
content (the tree diagram plus the "Skill-flavored plugins..." sentence, nothing
added), undoing the previous unit's mistake of growing that specific block. (2)
`block`-replace `ref-plugin-layout#n1643` (the Why paragraph) to append one more
sentence stating the skill-local-vs-plugin-level `scripts/` installability
distinction. This wins over trying a third time to grow the How-section block because
the Why section has no nested fences to escalate against — appending plain prose to
plain prose cannot reproduce this defect — and it wins over leaving the malformed
fence in place because an unclosed/mismatched fence corrupts the rendering of
everything after it in the file, not merely the one paragraph.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | N.A - ref (governance doc, not topology; the fact this unit amends) | Its How-section tree-diagram block currently serializes with an unbalanced (11-backtick open, no matching close) fence after two prior correction attempts; the note itself still needs to land somewhere | ref-plugin-layout#n1643@v1:sha256:4c9c6168ffd43f892f75bb64728dfdec86c0c4a20db56b3224322cf897a9a706 "install.sh's install_plugin() is written against exactly these names — its case statement whitelists `agents" | This unit's two patches are the review |

## Verification

| Check | Result |
| --- | --- |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 change apply adr-20260821-relocate-skill-local-scripts-note | Reports both patches applied |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 check | Exactly the 2 pre-existing errors (c3-213, c3-216), no new error |
| Read .c3/refs/ref-plugin-layout.md directly | The How-section fence is balanced (opening and closing backtick runs match, matching the file's state before this whole card's changes); the skill-local scripts/ note appears once, as plain prose in the Why section |
