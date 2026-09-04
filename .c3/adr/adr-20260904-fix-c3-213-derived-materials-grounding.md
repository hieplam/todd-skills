---
id: adr-20260904-fix-c3-213-derived-materials-grounding
c3-seal: b5de7777d4dca3ac10b8126f5abc19f09f38bd2f03233ba506474d7295816fd4
title: fix-c3-213-derived-materials-grounding
type: adr
goal: |-
    Re-ground `c3-213`'s single Derived Materials row ("Published blog posts") on the Contract
    section it actually derives from, so the fact stops failing its own component canvas. The row
    today cites only the Business Flow section, which the canvas does not accept as a derivation
    source, and that one cell has blocked `c3x repair` for the whole repository for weeks.
status: proposed
date: "2026-09-04"
---

## Goal

Re-ground `c3-213`'s single Derived Materials row ("Published blog posts") on the Contract
section it actually derives from, so the fact stops failing its own component canvas. The row
today cites only the Business Flow section, which the canvas does not accept as a derivation
source, and that one cell has blocked `c3x repair` for the whole repository for weeks.

## Context

The component canvas requires every Derived Materials row's "Must derive from" column to cite
strict component sections — Goal, Parent Fit, Purpose, Governance, Contract, Derived Materials.
Row 1 of `c3-213` cites "Business Flow section (primary path: the note precedes and sources the
posts)", and Business Flow is an optional section, so `c3-213` fails its own canvas today:

```
error: ungrounded derivation in Derived Materials row 1 column Must derive from:
       cite strict component sections
```

This is inherited drift, not new: `.claude/state/campaign-runner.md` recorded it as out of
scope weeks ago, and `.c3/adr/adr-20260716-fix-derived-materials-grounding.md` repaired the
identical defect in `c3-215` row 3 in July. It matters beyond this one fact because `c3x repair`
runs the full check and refuses to succeed while any error stands, so these cells deny the
repair path to every component in the repo.

The derivation itself was never wrong, only under-cited. `c3-213`'s Contract section already
carries the row "Research repo + blog repo commits / OUT / Bilingual note + posts
pushed/published to GitHub Pages" at `.c3/c3-2-plugins/c3-213-research-to-blog.md:59` — the
published blog posts are exactly that OUT surface's output.

## Decision

Append the Contract-section citation to the row's "Must derive from" cell and keep the existing
Business Flow clause as the secondary, path-level grounding. This wins over the alternative of
replacing the Business Flow clause outright (what the July precedent did for `c3-215`) because
the Business Flow clause is true and load-bearing — it records that the note precedes and
sources the posts — and the canvas accepts a non-strict section alongside a strict one, as
`c3-211` and `c3-212` already demonstrate with passing "Contract section ... and Business Flow
section ..." cells. Deleting the row was rejected outright: the derived material exists.

No other row, section, or fact changes.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-213 | component | Its Derived Materials row 1 grounds its derivation only in the Business Flow section, which the component canvas does not accept as a derivation source; this unit re-grounds that single row on the Contract section so the fact is valid against its own canvas again. Cited on the Purpose paragraph because the offending row's own text contains pipe delimiters that c3x 11.6.3 cannot round-trip inside this table cell | c3-213#n1517@v1:sha256:fe28589932594c03b9e0f1d509d6d8f1ad3eaf99a0d2710c004e0dce16cae7fc "Owns the insight→published-post pipeline in two modes: (a) format-and-publish finished research substance, or (b) run its own deep web research from a" | Component canvas — the derivation-grounding contract this row violates |

## Verification

| Check | Result |
| --- | --- |
| bunx @c3x/cli@11.6.3 check --only c3-213 before | exit 1, error: ungrounded derivation in Derived Materials row 1 column Must derive from |
| bunx @c3x/cli@11.6.3 change apply adr-20260904-fix-c3-213-derived-materials-grounding | applies clean; row 1 cites the Contract section like c3-211 and c3-212 do |
| bunx @c3x/cli@11.6.3 check --only c3-213 after | exit 0, no ungrounded-derivation error |
| bunx @c3x/cli@11.6.3 check after | exit 1 with exactly one remaining error, naming only c3-216 |
