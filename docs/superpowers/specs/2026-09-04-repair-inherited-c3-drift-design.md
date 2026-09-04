# Design: repair the inherited C3 drift (c3-213, c3-216)

**Card:** `repair-inherited-c3-drift` · **Warchief spec, 2026-09-04**
**Base:** `origin/master` @ `d1ec881` · **Worktree:** `/Users/hip/repo/todd-skills-wt/repair-c3-drift`

## Problem (grounded in code)

`bunx @c3x/cli@11.6.3 check` exits 1 on `d1ec881` with exactly two errors:

```
Checked 47 docs — 2 errors
  x c3-213: ungrounded derivation in Derived Materials row 1 column Must derive from: cite strict component sections
  x c3-216: ungrounded derivation in Derived Materials row 1 column Must derive from: cite strict component sections
```

Because `c3x repair` runs a full validation before it will realign the cache, these two cells
block `repair` for the entire repo — the live-viewer Warchief had to hand-fix `c3-215`'s
canonical form for exactly this reason.

### Why the two cells are ungrounded

The component canvas is embedded in the c3x runtime binary
(`~/.cache/c3x/11.6.3/c3x-11.6.3-darwin-arm64`, the YAML canvas `id: component`). It marks
`Goal`, `Parent Fit`, `Purpose`, `Governance`, `Contract`, `Derived Materials` as
`required: true`, and `Foundational Flow`, `Business Flow`, `Change Safety` as
`required: false`. The `Derived Materials` validator (`deriveStrictRules` /
`validateStrictTableSemantics`) requires the `Must derive from` cell to cite at least one
**strict** (required) section. This is not inference — the repo already has a precedent ADR
that states the set verbatim:

> `.c3/adr/adr-20260716-fix-derived-materials-grounding.md`: "The component canvas requires
> every Derived Materials row's 'Must derive from' column to cite strict component
> sections — Goal, Parent Fit, Purpose, Governance, Contract, Derived Materials."

The two offending cells:

| File:line | Current `Must derive from` | Cites a strict section? |
| --- | --- | --- |
| `.c3/c3-2-plugins/c3-213-research-to-blog.md:72` | `Business Flow section (primary path: the note precedes and sources the posts)` | no — `Business Flow` is `required: false` |
| `.c3/c3-2-plugins/c3-216-simple-image-video.md:75` | `Change Safety section (loop-seam and template-drift risks it records)` | no — `Change Safety` is `required: false` |

Every one of the repo's other 13 `Derived Materials` rows cites `Purpose`, `Contract`, or
`Governance`. Two of them (`c3-211`, `c3-212`) additionally cite `Business Flow` alongside
`Contract` and pass — proving a non-strict section is legal as a **secondary** clause, so the
fix does not have to discard the existing grounding prose.

## The change

Two independent, one-row repairs. Each is a `block`-scope patch replacing exactly one
`table_row` node, authored and applied through the c3x change-unit machinery (card D2: tool
only, never hand-edit seals), each carried by its own ADR (card G3, repo convention).

### c3-213 — `.c3/c3-2-plugins/c3-213-research-to-blog.md`

New row body (single line, no pipes and no backticks anywhere inside the cells — see Risks):

```
| Published blog posts | Contract section (the research-repo + blog-repo commits OUT surface: bilingual note + posts published to GitHub Pages) and Business Flow section (primary path: the note precedes and sources the posts) | Presentation/formatting per blog conventions | plugins/research-to-blog/agents/research-to-blog.md |
```

The added strict citation is true of the fact as written: `c3-213`'s Contract section already
carries the row `Research repo + blog repo commits | OUT | Bilingual note + posts
pushed/published to GitHub Pages` (`c3-213-research-to-blog.md:59`) — the published blog posts
are precisely that OUT surface's output.

### c3-216 — `.c3/c3-2-plugins/c3-216-simple-image-video.md`

```
| Effects-and-lessons reference doc | Contract section (the final-video OUT surface: a mathematically seamless loop at requested duration) and Change Safety section (loop-seam and template-drift risks it records) | Grows with experience | plugins/simple-image-video/skills/simple-image-video/references/effects-and-lessons.md |
```

The added strict citation is true: `c3-216`'s Contract section carries
`Final video file | OUT | Mathematically seamless loop at requested duration with audio`
(`c3-216-simple-image-video.md:63`), and the effects-and-lessons doc is the record of how to
hold that contract.

### Anchors (re-derive before authoring; ids proved stable across two cache rebuilds)

| Entity | Target node | Base anchor |
| --- | --- | --- |
| c3-213 | `Published blog posts` row | `c3-213#n1549@v1:sha256:4f01d1d297944c8cf361efbe0f840ec25642f36bf853712c7ac20071907ec589` |
| c3-216 | `Effects-and-lessons reference doc` row | `c3-216#n1703@v1:sha256:6f9b7e76f1761734c2fb69ac28422f5585a39d28a8e80e14f662a7d047373213` |
| c3-213 | Purpose paragraph (ADR evidence cite) | `c3-213#n1517@v1:sha256:fe28589932594c03b9e0f1d509d6d8f1ad3eaf99a0d2710c004e0dce16cae7fc` |
| c3-216 | Purpose paragraph (ADR evidence cite) | `c3-216#n1669@v1:sha256:e52fbad15feccad90faa628273a6fb75255a7dcf5b134e296a2a38f657cb2d0f` |

Anchors are read out of the tool's own cache (`sqlite3 .c3/c3.db "select id, hash from nodes
…"`) — a read of tool-generated state, never a hand edit of it.

### Two ADRs (card G3)

`.c3/adr/adr-20260904-fix-c3-213-derived-materials-grounding.md` and
`.c3/adr/adr-20260904-fix-c3-216-derived-materials-grounding.md`, created via
`c3x add adr <slug> --file <draft>`, shaped after
`.c3/adr/adr-20260716-fix-derived-materials-grounding.md` (the closest precedent — same bug
class) and `.c3/adr/adr-20260821-fix-c3-301-inputs-row-pipe-escaping.md`. Required core
sections only (`c3x schema adr` workorder: "a small change needs only these"): Goal, Context,
Decision, Affected Topology, Verification.

**Affected Topology Evidence cites the Purpose *paragraph*, not the table row.** The offending
row's own text contains pipe delimiters, and c3x 11.6.3's serializer cannot round-trip a pipe
inside a table cell — the same limitation `adr-20260821-explaining-illustration-scope.md`
records as F23, and the same workaround both precedent ADRs used.

## Pure core / impure edges

No source code changes, so `~/.claude/rules/pure-core.md` binds only in its documentary sense:
all mutation of `.c3/` state goes through the c3x CLI (the single impure edge / composition
root for C3 facts); nothing in this card hand-computes or hand-writes a seal, a hash, or a
cache row. The "core" here — deciding *which* strict section each row must cite — is a pure
function of the canvas definition and the fact's own Contract section, decided in this spec
before any tool runs.

## Scope fence

**IN:** the two `Must derive from` cells; the reseals c3x performs on those two files; the two
new ADRs and their change-unit patch folders under `.c3/changes/`; `.c3/c3.db` as the tool
regenerates it; this spec and its plan.

**OUT:** rewording anything else in `c3-213` / `c3-216`; the 47-doc warning set; any source
code; `plugins/tribe/scripts/tests/test-input-asymmetry.sh`, `test-review-cell-v3.sh`,
`pre-gate.sh` (owned by the concurrent `fix-red-shell-suites` card — never touched); anything
in the `i74-mechanical-heartbeat` worktree or the owner's dirty main checkout.

## Testing strategy (TDD — the failing test is the tool)

The oracle is `bunx @c3x/cli@11.6.3 check` itself, plus its per-entity form.

| Stage | Command | Expected |
| --- | --- | --- |
| RED (both tasks) | `bunx @c3x/cli@11.6.3 check; echo $?` | exit `1`, two errors naming `c3-213` and `c3-216` |
| Task 1 GREEN | `bunx @c3x/cli@11.6.3 check --only c3-213; echo $?` | exit `0`, no ungrounded-derivation error |
| Task 1 GREEN (repo) | `bunx @c3x/cli@11.6.3 check; echo $?` | exit `1`, exactly **one** error, naming `c3-216` only |
| Task 2 GREEN (G1) | `bunx @c3x/cli@11.6.3 check; echo $?` | exit `0`, `0 errors` |
| Task 2 GREEN (G2) | `bunx @c3x/cli@11.6.3 repair --only c3-213 --only c3-216; echo $?` | exit `0`, does not abort on a pre-check error |

Exit codes must be captured **without a pipe** (`cmd > file 2>&1; echo $?`) — piping to `tail`
reports the pipeline's exit status, not c3x's, and will silently read `0` on a red run.

`bunx` version pinning is mandatory: there is no `c3`/`c3x` on `PATH` in this environment.

## Evidence plan

The repo's own harness is the c3x CLI; the artifact is its transcript.

1. **BEFORE**: full `c3x check` output + exit code captured on `d1ec881` **before** any patch,
   saved to the report file and pasted inline in the PR body.
2. **AFTER**: full `c3x check` output + exit code on the final branch head, likewise.
3. **G2 proof**: `c3x repair` output + exit code on the final branch head, showing it completes
   instead of aborting on the pre-check errors — command and output recorded verbatim.
4. **G4 proof**: `git diff --stat d1ec881..HEAD` in the PR body, showing the only `.c3/`
   content files touched are the two components plus the two new ADRs and their patch folders.

All four are text transcripts captured by me (the Warchief) by running the commands myself, not
quoted from any Hunter's report.

## Risks and rollback

| Risk | Mitigation |
| --- | --- |
| Pipe/backtick in a cite snippet breaks the table or the hash (campaign-runner.md:181-184; adr-20260821-fix-c3-301) | No backticks and no literal `\|` anywhere inside a new cell or an ADR table cell. ADR Evidence cites the Purpose paragraph node, never the offending table row. |
| c3x re-serializes unrelated `.c3/` files | After every `change apply`, `git status`; `git checkout --` any file outside the fence. `git diff --stat` in the PR proves it. |
| `.c3/c3.db-shm` / `-wal` appear | Never staged; `git status` must be clean of them before every commit. |
| Node ids shift on cache rebuild | Anchors are re-derived immediately before authoring each patch; a stale anchor fails c3x's own drift gate loudly (no silent bad write). |
| The added Contract citation is factually wrong | Each ADR's Context quotes the exact Contract row (`file:line`) the derivation now claims. |

**Rollback:** the whole change is two `.c3/` content rows plus additive ADR files.
`git revert` of the merge commit restores `d1ec881`'s `.c3/` state exactly; the only side
effect is that `c3x repair` is blocked again, i.e. the status quo.
