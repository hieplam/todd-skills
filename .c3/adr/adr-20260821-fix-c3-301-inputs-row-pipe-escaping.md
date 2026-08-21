---
id: adr-20260821-fix-c3-301-inputs-row-pipe-escaping
c3-seal: c87c325907a0d7dba819243fb376c4fc47eb3146f1283744349bbb26a052a6eb
title: fix-c3-301-inputs-row-pipe-escaping
type: adr
goal: |-
    Fix a table-breaking escaping defect in `c3-301`'s Foundational Flow row introduced by
    `adr-20260821-eval-arm-axis-and-machine-checks`: the Inputs row's replacement body used
    a backslash-escaped pipe (`clean\|mem\|both`) to represent the `--arm` flag's three
    literal choices inside a markdown table cell, but the c3x tool's table serializer does
    not honor that escape — the committed `.c3/c3-3-eval-harness/c3-301-eval-runner.md` now
    has a literal, un-escaped `|` character inside the Inputs row's Detail cell
    (`--arm clean\ | mem\ | both`), which any standard GFM table renderer parses as two
    extra column separators, breaking the row from 3 cells (matching the header) into 5.
status: accepted
date: "2026-08-21"
---

## Goal

Fix a table-breaking escaping defect in `c3-301`'s Foundational Flow row introduced by
`adr-20260821-eval-arm-axis-and-machine-checks`: the Inputs row's replacement body used
a backslash-escaped pipe (`clean\|mem\|both`) to represent the `--arm` flag's three
literal choices inside a markdown table cell, but the c3x tool's table serializer does
not honor that escape — the committed `.c3/c3-3-eval-harness/c3-301-eval-runner.md` now
has a literal, un-escaped `|` character inside the Inputs row's Detail cell
(`--arm clean\ | mem\ | both`), which any standard GFM table renderer parses as two
extra column separators, breaking the row from 3 cells (matching the header) into 5.

## Context

`c3-301`'s Foundational Flow table has exactly 3 columns (Aspect, Detail, Reference).
The Inputs row's Detail cell needed to name the `--arm` flag's three choices; writing
them with the flag's own real separator (`|`, as `run_evals.py --arm
{clean,mem,both}` accepts) requires escaping inside a table cell. `\|` is the
CommonMark-documented escape, but grepping the committed row
(`.c3/c3-3-eval-harness/c3-301-eval-runner.md:36`) shows it was not preserved as an
escape — it round-tripped through the c3x tool's own block-patch apply as a literal
backslash followed by a real, unescaped pipe. The safe fix used successfully elsewhere
in this same card (`ref-evals-fixture`'s Choice section, a prose paragraph not a table
cell, states `"kind": "skill"|"agent"` unescaped because it is outside any table) does
not apply here since this IS inside a table cell. The mechanical fix: name the three
choices without the pipe glyph at all (`clean/mem/both`), which reads identically to a
human and cannot be misparsed as a column boundary.

## Decision

One `block`-scope replace of the Inputs row (`c3-301#n1586`), identical to the prior
patch's intent, but naming the `--arm` choices as `clean/mem/both` instead of
`clean\|mem\|both`. This wins over re-attempting the backslash escape because the
prior attempt already proved the c3x 11.6.3 table serializer does not honor it in this
code path; a slash-separated list carries the same information with zero escaping risk.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-301 | component | Its Foundational Flow Inputs row currently contains an unescaped vertical-bar character that breaks the row's column count against the table's 3-column header | c3-301#n1584@v1:sha256:71d79fde36cbf7bcc9817aa7cf43132d25148a9b3239c271377b7c228160d50e "Aspect" | This unit's one patch is the review |

## Verification

| Check | Result |
| --- | --- |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 change apply adr-20260821-fix-c3-301-inputs-row-pipe-escaping | Reports the patch applied |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 check | Exactly the 2 pre-existing errors, no new error |
| grep -n "Inputs" .c3/c3-3-eval-harness/c3-301-eval-runner.md | The Inputs row has exactly 3 markdown-table cells, matching the header row's column count |
