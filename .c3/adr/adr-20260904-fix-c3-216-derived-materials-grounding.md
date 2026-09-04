---
id: adr-20260904-fix-c3-216-derived-materials-grounding
c3-seal: 0fd1320c96bc16493da7babe67b0373a394ff1bb18d2695783d2b430c48b1786
title: fix-c3-216-derived-materials-grounding
type: adr
goal: |-
    Re-ground `c3-216`'s single Derived Materials row ("Effects-and-lessons reference doc") on the
    Contract section it actually derives from, so the fact stops failing its own component canvas.
    The row today cites only the Change Safety section, which the canvas does not accept as a
    derivation source, and that one cell is the second of the two that have blocked `c3x repair`
    for the whole repository for weeks.
status: proposed
date: "2026-09-04"
---

## Goal

Re-ground `c3-216`'s single Derived Materials row ("Effects-and-lessons reference doc") on the
Contract section it actually derives from, so the fact stops failing its own component canvas.
The row today cites only the Change Safety section, which the canvas does not accept as a
derivation source, and that one cell is the second of the two that have blocked `c3x repair`
for the whole repository for weeks.

## Context

The component canvas requires every Derived Materials row's "Must derive from" column to cite
strict component sections — Goal, Parent Fit, Purpose, Governance, Contract, Derived Materials.
Row 1 of `c3-216` cites "Change Safety section (loop-seam and template-drift risks it records)",
and Change Safety is an optional section, so `c3-216` fails its own canvas today:

```
error: ungrounded derivation in Derived Materials row 1 column Must derive from:
       cite strict component sections
```

This is the exact defect `.c3/adr/adr-20260716-fix-derived-materials-grounding.md` repaired in
`c3-215` row 3 in July — that row, too, cited Change Safety and nothing strict. It matters
beyond this one fact because `c3x repair` runs the full check and refuses to succeed while any
error stands, so this cell denies the repair path to every component in the repo.

The derivation itself was never wrong, only under-cited. `c3-216`'s Contract section already
carries the row "Final video file / OUT / Mathematically seamless loop at requested duration
with audio" at `.c3/c3-2-plugins/c3-216-simple-image-video.md:62`, and the effects-and-lessons
reference doc is the accumulated record of how to hold that contract.

## Decision

Append the Contract-section citation to the row's "Must derive from" cell and keep the existing
Change Safety clause as the secondary, risk-level grounding. This wins over replacing the
Change Safety clause outright (what the July precedent did for `c3-215`) because that clause is
true and load-bearing — the lessons doc really is organized around the loop-seam and
template-drift failure modes — and the canvas accepts a non-strict section alongside a strict
one, as `c3-211` and `c3-212` already demonstrate with passing cells that cite Contract and
Business Flow together. Deleting the row was rejected outright: the derived material exists.

No other row, section, or fact changes.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-216 | component | Its Derived Materials row 1 grounds its derivation only in the Change Safety section, which the component canvas does not accept as a derivation source; this unit re-grounds that single row on the Contract section so the fact is valid against its own canvas again. Cited on the Purpose paragraph because the offending row's own text contains pipe delimiters that c3x 11.6.3 cannot round-trip inside this table cell | c3-216#n1690@v1:sha256:e52fbad15feccad90faa628273a6fb75255a7dcf5b134e296a2a38f657cb2d0f "Owns the still-image→looping-video pipeline: effect vocabulary, mathematically seamless loop construction, and the render/assemble toolchain. Non-goal" | Component canvas — the derivation-grounding contract this row violates |

## Verification

| Check | Result |
| --- | --- |
| bunx @c3x/cli@11.6.3 check --only c3-216 before | exit 1, error: ungrounded derivation in Derived Materials row 1 column Must derive from |
| bunx @c3x/cli@11.6.3 change apply adr-20260904-fix-c3-216-derived-materials-grounding | applies clean; row 1 cites the Contract section like c3-211 and c3-212 do |
| bunx @c3x/cli@11.6.3 check --only c3-216 after | exit 0, no ungrounded-derivation error |
| bunx @c3x/cli@11.6.3 check after | exit 0, zero errors across the whole repository |
| bunx @c3x/cli@11.6.3 repair after | exit 0, rebuild plus reseal plus check all succeed, no queued-command error |
