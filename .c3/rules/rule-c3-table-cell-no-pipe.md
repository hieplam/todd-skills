---
id: rule-c3-table-cell-no-pipe
c3-seal: 88bab5b198bb792260652211844c324c3ac3ef2fc5d4519f473f8d0e456db350
title: c3-table-cell-no-pipe
type: rule
goal: 'Every Markdown table under `.c3/` round-trips through the C3 toolchain without losing content. The recurring need: a raw `|` inside a table cell splits the row for `c3x` 11.6.3''s table parser, and `c3x repair` then rewrites the row without its trailing cell — exit 0, "all clear", content gone. This class has been hit and hand-worked-around three times in `.c3/adr/` (the repo''s own name for it is "F23"): `adr-20260821-explaining-illustration-scope.md`, `adr-20260821-fix-c3-301-inputs-row-pipe-escaping.md`, `adr-20260904-retire-kanna-session-ids.md`.'
---

## Goal

Every Markdown table under `.c3/` round-trips through the C3 toolchain without losing content. The recurring need: a raw `|` inside a table cell splits the row for `c3x` 11.6.3's table parser, and `c3x repair` then rewrites the row without its trailing cell — exit 0, "all clear", content gone. This class has been hit and hand-worked-around three times in `.c3/adr/` (the repo's own name for it is "F23"): `adr-20260821-explaining-illustration-scope.md`, `adr-20260821-fix-c3-301-inputs-row-pipe-escaping.md`, `adr-20260904-retire-kanna-session-ids.md`.

## Rule

A table cell in any `.c3/**/*.md` file never contains a `|` character; write the word "pipe" instead.

## Golden Example

Literal, from `.c3/adr/adr-20260821-explaining-illustration-scope.md:87` (the `c3-201` row of "Affected Topology", after PR #119's reword):

```markdown
(a table-row cite here would embed a raw pipe character inside this ADR's own table cell, which c3x 11.6.3's table parser cannot round-trip — same class of serializer limitation as F23 — so this cites the fact's prose Purpose section instead as proof of the entity, with the exact stale cells named in this column)
```

`pipe character` is REQUIRED where the prose means the `|` symbol; the surrounding sentence is OPTIONAL wording. Compliance check, run on any `.c3` table row: an escape-unaware field count must equal the header's — `awk -F'|' 'NR==87{print NF}'` prints `7` for this 5-cell row (it printed `8` before the reword, and `c3x repair` dropped the last cell).

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| a raw pipe symbol written literally inside a cell | the word "pipe" | Splits the row; c3x repair silently drops the trailing cell and exits 0 (reproduced 2026-09-04, PR #119) |
| a backslash-escaped pipe inside a cell | the word "pipe" | Escape handling is not uniform across c3x 11.6.3's own code paths (repair vs change apply); the text then depends on which path touches it next |
| citing a fact's table row from inside a table cell | cite the fact's prose section instead | The cite handle itself carries the symbol, so the citation can never sit in a cell safely |

## Scope

Every Markdown table in every file under `.c3/` (facts, refs, rules, ADRs, change-unit patches, canvases). Prose outside tables and fenced code blocks may contain the symbol freely; only table cells are governed.

## Override

None expected. If a cell must show the symbol itself (a rule about shell pipelines, say), put the example in a fenced code block below the table and reference it from the cell.
