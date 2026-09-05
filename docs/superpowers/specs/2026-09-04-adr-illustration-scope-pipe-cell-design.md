# Spec — stop `c3x repair` from silently destroying an ADR table cell

**Card:** `adr-illustration-scope-pipe-cell` · **Campaign:** `followups-2026-09-04` · **Shaman spec, 2026-09-04** · base: latest `origin/master`
**Card file:** `~/.tribe/-Users-hip-repo-todd-skills/campaigns/followups-2026-09-04/cards/adr-illustration-scope-pipe-cell.md`

## Problem, grounded

`.c3/adr/adr-20260821-explaining-illustration-scope.md:87` is the `c3-201` row of the ADR's
"Affected Topology" table. Its "Why affected" cell contains the literal text

> a table-row cite here would embed a raw | inside this ADR's own table cell

The raw `|` splits the row for `c3x` 11.6.3's table parser. Reproduced 2026-09-04 on a
`git archive` of `a9a6e7b`:

```
$ grep -c "This unit's three patches are the review" .c3/adr/adr-20260821-explaining-illustration-scope.md
1
$ bunx @c3x/cli@11.6.3 repair
Rebuilt local C3 cache from canonical .c3/
Resealed canonical .c3/ tree
Checked 49 docs — all clear
OK: canonical markdown is in sync
$ grep -c "This unit's three patches are the review" .c3/adr/adr-20260821-explaining-illustration-scope.md
0
```

`repair` exits 0, reports all clear, and the only file it changed is this ADR — with the row's
final cell (`This unit's three patches are the review`) gone. `awk -F'|' 'NR==87{print NF}'`
prints `8` where a 5-cell row prints `7`. PR #115 made `repair` runnable repo-wide again, so
this loss is now one routine command away for anyone.

## Oracle

This spec is the contract. Correct means: the ADR's row parses to five cells, `c3x repair` is
idempotent on the file (a second run changes nothing) and preserves every cell, and the only
committed changes are the one reworded cell and the regenerated `c3-seal`. Any additional churn
from `repair` is a finding to report, not to commit.

## The change — `.c3/adr/adr-20260821-explaining-illustration-scope.md` only

### C1 — reword the cell

On line 87 replace the exact substring `a raw | inside` with `a raw pipe character inside`.
Nothing else in the prose changes. (Card decision D1: reword rather than escape; the ADR's own
text says the parser cannot round-trip a pipe in a cell, so the text must not depend on an
escaping rule.)

### C2 — regenerate the seal with the tool

Run `bunx @c3x/cli@11.6.3 repair` in the card worktree. It rewrites the frontmatter `c3-seal`
line of this ADR (card decision D2: never hand-edit a seal). Confirm with `git status --porcelain`
that this ADR is the only modified tracked file and that no `c3.db*` is staged; if any other file
changed, do not commit — report `NEEDS_DIRECTION` with the file list (card D3).

## Scope fence

**IN:** `.c3/adr/adr-20260821-explaining-illustration-scope.md`, this spec, its plan.
**OUT:** every other `.c3/` file; the change-unit folders; `c3.db*`; any fact (no fact's claim
changes, so no change-unit); every file the live `feat/i74-mechanical-heartbeat` branch touches.

## Testing strategy

There is no test file for an ADR; the proof is the toolchain's round-trip, run on throwaway
copies (never in the card worktree until the final commit):

- RED (before): on a `git archive` of the base, `repair` → the final cell's grep count drops to 0.
- GREEN (after): on a `git archive` of the branch, `repair` twice; after the second run
  `git status --porcelain` is empty (idempotent), the cell grep count is 1, `awk -F'|'` on line 87
  prints 7, and `bunx @c3x/cli@11.6.3 check` exits 0 "all clear".

## Evidence plan

PR body: the before transcript (grep 1 → repair → grep 0), the after transcript (grep 1 → repair
×2 → grep 1, empty porcelain, check exit 0), and `git diff --stat` for the branch showing one
ADR file with exactly two changed lines (the cell and the seal).

## Risks and rollback

None beyond the seal: if `repair` also reseals other files because the campaign's earlier cards
changed facts, that is the D3 stop. Rollback is one commit.

## Adjudication rule (for the auditors)

REFUTED in advance: a finding that an accepted ADR "must not be edited" — this repairs the ADR's
own wording so the tool can round-trip it, and changes no decision; a finding that the seal was
"hand-changed" — the seal diff is the tool's output, verified by re-running `repair` to an empty
porcelain.
