---
id: adr-20260821-fix-ref-plugin-layout-note-fence
c3-seal: 431929ccacbd7cd3220f9db253bfeb374737f8d1cbba34041a90e520a328f7e8
title: fix-ref-plugin-layout-note-fence
type: adr
goal: |-
    Fix a formatting defect this task introduced in `ref-plugin-layout`'s How section:
    applying `adr-20260821-eval-arm-axis-and-machine-checks`'s patch
    `05-ref-plugin-layout-skill-local-scripts.patch.md` (an `insert` scope patch anchored
    right after the section's deeply nested (5/4/3-backtick) fenced tree-diagram block) had
    the C3 tool auto-wrap the inserted prose note in a literal triple-backtick fence in the
    committed `.c3/refs/ref-plugin-layout.md`, so the note now renders as a code block
    (losing its `**bold**`/backtick styling) instead of as prose, on GitHub or any markdown
    viewer. Move the same note text into the pre-existing, unfenced tree-diagram block
    instead (a `block`-scope replace, not another `insert`), and blank the erroneous
    fenced sibling block the first patch left behind.
status: accepted
date: "2026-08-21"
---

## Goal

Fix a formatting defect this task introduced in `ref-plugin-layout`'s How section:
applying `adr-20260821-eval-arm-axis-and-machine-checks`'s patch
`05-ref-plugin-layout-skill-local-scripts.patch.md` (an `insert` scope patch anchored
right after the section's deeply nested (5/4/3-backtick) fenced tree-diagram block) had
the C3 tool auto-wrap the inserted prose note in a literal triple-backtick fence in the
committed `.c3/refs/ref-plugin-layout.md`, so the note now renders as a code block
(losing its `**bold**`/backtick styling) instead of as prose, on GitHub or any markdown
viewer. Move the same note text into the pre-existing, unfenced tree-diagram block
instead (a `block`-scope replace, not another `insert`), and blank the erroneous
fenced sibling block the first patch left behind.

## Context

`c3-301`/`ref-evals-fixture`/`ref-plugin-layout`'s How section were amended by
`adr-20260821-eval-arm-axis-and-machine-checks` to record the `explaining-illustration`
card's task 1-9 changes (the `--arm` axis, `checks`/`artifacts`, and the skill-local
`scripts/` installability distinction). That unit is fully applied and, per the
`change apply` primitive's own design, its `block`-scope patches are one-shot — once
consumed, their `base` cite handle is permanently stale, so the SAME change-unit folder
can never be re-applied to fix a mistake inside it (`c3x change apply
adr-20260821-eval-arm-axis-and-machine-checks --dry-run` now REJECTs on drift for every
already-applied `block`-scope patch, by design). The one `insert`-scope patch in that
unit (`05-...`), by contrast, left its own anchor block (`ref-plugin-layout#n1646`,
the tree-diagram block) untouched and unconsumed — confirmed via
`c3x read ref-plugin-layout --section How --cite`, which still reports `n1646` sealed
to the SAME hash as before that unit applied — so `n1646` remains a valid `block`-scope
target for this follow-up unit. The bad insert itself is now its own citable block
(`ref-plugin-layout#n1748`).

## Decision

Two patches in a new change-unit: (1) `block`-replace `n1646` (the tree-diagram +
"Skill-flavored plugins..." block) with its EXACT original content plus the
skill-local-`scripts/` note appended as trailing plain prose inside the SAME block
(mirroring how that block already mixes a fenced example with a following plain
sentence) — this keeps the note un-fenced because it becomes part of a block whose
existing content already renders correctly, rather than a freshly `insert`-ed block.
(2) `block`-replace `n1748` (the leftover erroneously-fenced duplicate) with an empty
body, removing it — the note now lives exactly once, correctly formatted, inside
`n1646`. This wins over leaving the fenced duplicate in place because a reader (human
or the c3x tool's own consumers) would otherwise see the same fact stated twice, once
correctly and once as an unstyled code block, which is confusing and looks like
copy-paste drift rather than a single authored fact. It wins over trying to fix
`n1748` in place via another `insert`/`block` patch because `insert`-scope's
auto-fencing after a code-heavy block is the exact defect being corrected, and
re-inserting would risk reproducing it; folding the text into the already-plain-text
tail of `n1646` sidesteps the mechanism entirely.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | N.A - ref (governance doc, not topology; the fact this unit amends) | Its How section carries a fenced-code-wrapped duplicate of the skill-local scripts/ installability note, introduced as a formatting defect by the immediately prior change-unit | ref-plugin-layout#n1646@v1:sha256:2c8167e4166c7f6ec55c64a44665ca722696501fc93bf0c24f7ebb5e172c650c "plugins/tribe/" | This unit's two patches are the review |

## Verification

| Check | Result |
| --- | --- |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 change apply adr-20260821-fix-ref-plugin-layout-note-fence | Reports both patches applied |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 check | Exactly the 2 pre-existing errors (c3-213, c3-216), no new error |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 read ref-plugin-layout --section How | The skill-local scripts/ note appears exactly once, as plain prose (no surrounding triple-backtick fence) |
