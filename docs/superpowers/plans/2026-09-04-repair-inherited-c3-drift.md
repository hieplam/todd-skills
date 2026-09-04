# Plan: repair the inherited C3 drift (c3-213, c3-216)

**Card:** `repair-inherited-c3-drift` · **Spec:** `docs/superpowers/specs/2026-09-04-repair-inherited-c3-drift-design.md`
**Worktree:** `/Users/hip/repo/todd-skills-wt/repair-c3-drift` · **Branch:** `fix/repair-inherited-c3-drift` · **Base:** `1a4706ca644efa0a88f07856e93473eca9e515fd` (spec commit on top of `d1ec881`)

Two tasks, two commits, one wave. Task 2 depends on Task 1 only for commit order — the two
tasks touch disjoint `.c3/` facts (`c3-213` vs `c3-216`) and disjoint new files.

## Global Constraints

- Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.
- Purity: core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see `~/.claude/rules/pure-core.md`).
- Every command runs from the worktree root `/Users/hip/repo/todd-skills-wt/repair-c3-drift`.
  Never touch the main checkout at `/Users/hip/repo/todd-skills` (it carries the owner's
  uncommitted work) and never touch the sibling worktrees under `/Users/hip/repo/todd-skills-wt/`.
- **Never edit these files** — another Warchief owns them concurrently in its own worktree:
  `plugins/tribe/scripts/tests/test-input-asymmetry.sh`,
  `plugins/tribe/scripts/tests/test-review-cell-v3.sh`, `plugins/tribe/scripts/pre-gate.sh`.
- The C3 CLI is invoked as `bunx @c3x/cli@11.6.3` — there is no `c3` or `c3x` binary on PATH.
  Prefix with `C3X_MODE=agent` for structured output when reading; plain for the check runs
  whose human-readable transcript is the card's evidence.
- **Card decision D2: the c3x wrapper is the only writer of `.c3/` facts.** Never hand-edit any
  file under `.c3/c3-1-distribution/`, `.c3/c3-2-plugins/`, `.c3/c3-3-eval-harness/`, and never
  hand-edit a `c3-seal:` value anywhere. The only files you author by hand are the ADR **draft**
  under `/tmp` (which `c3x add adr` then imports) and the `*.patch.md` body inside the change
  unit folder that `c3x change new` scaffolds.
- **Card decision D1: fix by citing the correct strict section. Never delete a Derived Materials
  row**, and never drop the existing non-strict clause — it is appended to, not replaced.
- **Never stage `.c3/c3.db-shm` or `.c3/c3.db-wal`.** They appear whenever c3x runs.
  `.c3/c3.db` itself is gitignored (`.gitignore:2`), so it is never committed either. Before
  every commit, `git status --short` must show no `c3.db*` entry staged.
- **Discard unrelated reseal churn.** After every `c3x change apply`, run `git status --short`.
  Any modified file outside the task's own fence gets `git checkout -- <path>` before committing.
- Commit messages carry **no** `Co-Authored-By` trailer of any kind, and no agent name anywhere.
- Every commit's final paragraph carries both trailer lines, e.g.
  `git commit -m "subject" -m $'Tribe-Card: repair-inherited-c3-drift\nTribe-Task: 1/2'`.
- Tick this plan's task checkboxes in the same commit as the change for that task.
- **Never capture an exit code through a pipe.** `bunx ... check | tail` reports `tail`'s status.
  Always `bunx @c3x/cli@11.6.3 check > /tmp/out.txt 2>&1; echo "exit=$?"; cat /tmp/out.txt`.

## Shared background: why the two cells fail

The component canvas embedded in the c3x runtime marks `Goal`, `Parent Fit`, `Purpose`,
`Governance`, `Contract`, `Derived Materials` as `required: true` and `Foundational Flow`,
`Business Flow`, `Change Safety` as `required: false`. A `Derived Materials` row's
`Must derive from` cell must cite at least one **required (strict)** section. The repo's own
precedent ADR `.c3/adr/adr-20260716-fix-derived-materials-grounding.md` states that set
verbatim. `c3-213` cites only `Business Flow`; `c3-216` cites only `Change Safety`.

## Shared red/green oracle

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
bunx @c3x/cli@11.6.3 check > /tmp/c3-check.txt 2>&1; echo "exit=$?"; cat /tmp/c3-check.txt
```

Expected at base (RED): `exit=1`, `Checked 47 docs — 2 errors`, one `x c3-213:` line and one
`x c3-216:` line, both reading
`ungrounded derivation in Derived Materials row 1 column Must derive from: cite strict component sections`.

Expected after Task 1 (partial green): `exit=1`, `Checked 48 docs — 1 error`, only the
`x c3-216:` line — the `c3-213` line is gone and the doc count rose by one because Task 1 adds
an ADR entity.

Expected after Task 2 (full green, card G1): `exit=0` and `0 errors` in the summary line.

## How to derive a cite anchor (used by both tasks)

Node row ids in `.c3/c3.db` are cache-local and **do change** when the cache is rebuilt (the
committed `adr-20260904-retire-kanna-session-ids.md` cites `c3-215#n1588`, while the same node
reads `n1605` in a freshly rebuilt cache). The content hash is stable. So: always re-derive the
anchor immediately before you author the patch or the ADR, and never copy an id out of an older
document.

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
bunx @c3x/cli@11.6.3 check > /dev/null 2>&1   # refresh the cache from canonical markdown
python3 - <<'PY'
import sqlite3
db = sqlite3.connect("/Users/hip/repo/todd-skills-wt/repair-c3-drift/.c3/c3.db")
for eid, like in (("c3-213", "Published blog posts%"), ("c3-213", "Owns the insight%"),
                  ("c3-216", "Effects-and-lessons reference doc%"), ("c3-216", "Owns the still-image%")):
    ver = db.execute("select version from entities where id=?", (eid,)).fetchone()[0]
    for nid, h, c in db.execute(
            "select id, hash, content from nodes where entity_id=? and content like ?", (eid, like)):
        print(f'{eid}#n{nid}@v{ver}:sha256:{h} "{c[:150]}"')
PY
```

Expected: four lines, each an anchor of the form
`c3-213#n<number>@v1:sha256:<64 hex chars> "<opening text of that node>"`. The two
`Published blog posts` / `Effects-and-lessons` lines are the **patch base anchors** (use only
the part before the quoted snippet). The two `Owns the ...` lines are the **ADR Evidence
cites** (use the whole line, quoted snippet included).

`sqlite3`/`sqlite3` module reads here are reads of tool-generated state — permitted. Writing to
that database by hand is not, and is never needed.

## Pipe and backtick discipline (campaign-runner.md:181-184)

c3x 11.6.3 cannot round-trip a `|` inside a markdown table cell, and backticks in a cite
snippet break the hash. Therefore, in every cell you author in this card:

- no `|` character, escaped or not;
- no backtick;
- the ADR `Affected Topology` Evidence column cites the component's **Purpose paragraph**, never
  the offending table row (whose own text is full of pipes). This is the same workaround both
  precedent ADRs used and the reason `adr-20260904-retire-kanna-session-ids.md` says so out loud.

---

### Task 1: re-ground c3-213's Derived Materials row on the Contract section

- Create: `/tmp/adr-c3-213-draft.md` (scratch draft, not committed)
- Create: `.c3/adr/adr-20260904-fix-c3-213-derived-materials-grounding.md` (via `c3x add adr`)
- Create: `.c3/changes/adr-20260904-fix-c3-213-derived-materials-grounding/01-reground-published-blog-posts.patch.md`
- Modify: `.c3/c3-2-plugins/c3-213-research-to-blog.md` (row 1 of Derived Materials, via `c3x change apply`)

- [x] **Step 1: Watch it fail**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
bunx @c3x/cli@11.6.3 check > /tmp/red-task1.txt 2>&1; echo "exit=$?"
cat /tmp/red-task1.txt
bunx @c3x/cli@11.6.3 check --only c3-213 > /tmp/red-task1-only.txt 2>&1; echo "only-exit=$?"
cat /tmp/red-task1-only.txt
```

Expected: `exit=1` with `Checked 47 docs — 2 errors` and both the `x c3-213:` and `x c3-216:`
ungrounded-derivation lines; `only-exit=1` with the `x c3-213:` line present. Paste both
transcripts into the report file — they are this task's RED proof.

- [x] **Step 2: Derive the two anchors for c3-213**

Run the anchor script from "How to derive a cite anchor" above and keep the two `c3-213` lines.
Expected: one anchor whose snippet starts `Published blog posts | Business Flow section` (the
patch base) and one whose snippet starts `Owns the insight` (the ADR Evidence cite).

- [x] **Step 3: Author the ADR draft and import it with the tool**

Write `/tmp/adr-c3-213-draft.md` with exactly this body, substituting `PURPOSE_CITE_213` with
the `Owns the insight...` anchor line from Step 2 (whole line, including the quoted snippet):

```markdown
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

    error: ungrounded derivation in Derived Materials row 1 column Must derive from:
           cite strict component sections

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
| c3-213 | component | Its Derived Materials row 1 grounds its derivation only in the Business Flow section, which the component canvas does not accept as a derivation source; this unit re-grounds that single row on the Contract section so the fact is valid against its own canvas again. Cited on the Purpose paragraph because the offending row's own text contains pipe delimiters that c3x 11.6.3 cannot round-trip inside this table cell | PURPOSE_CITE_213 | Component canvas — the derivation-grounding contract this row violates |

## Verification

| Check | Result |
| --- | --- |
| bunx @c3x/cli@11.6.3 check --only c3-213 before | exit 1, error: ungrounded derivation in Derived Materials row 1 column Must derive from |
| bunx @c3x/cli@11.6.3 change apply adr-20260904-fix-c3-213-derived-materials-grounding | applies clean; row 1 cites the Contract section like c3-211 and c3-212 do |
| bunx @c3x/cli@11.6.3 check --only c3-213 after | exit 0, no ungrounded-derivation error |
| bunx @c3x/cli@11.6.3 check after | exit 1 with exactly one remaining error, naming only c3-216 |
```

Then import it, dry-run first:

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
C3X_MODE=agent bunx @c3x/cli@11.6.3 add adr 20260904-fix-c3-213-derived-materials-grounding \
  --dry-run --file /tmp/adr-c3-213-draft.md; echo "dryrun-exit=$?"
```

Expected: `dryrun-exit=0` and no validation error. If instead it rejects the Evidence cite,
re-run the Step 2 anchor script (the cache may have been rebuilt) and retry — never hand-edit a
seal or a `.c3/` file to make it pass. If the resulting entity id is not
`adr-20260904-fix-c3-213-derived-materials-grounding`, use whatever id `c3x` reports for every
later command in this task. Then create it for real:

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
C3X_MODE=agent bunx @c3x/cli@11.6.3 add adr 20260904-fix-c3-213-derived-materials-grounding \
  --file /tmp/adr-c3-213-draft.md; echo "add-exit=$?"
ls .c3/adr/adr-20260904-fix-c3-213-derived-materials-grounding.md
```

Expected: `add-exit=0` and the `ls` prints the new ADR path.

- [x] **Step 4: Scaffold the change unit and author the one block patch**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
C3X_MODE=agent bunx @c3x/cli@11.6.3 change new adr-20260904-fix-c3-213-derived-materials-grounding
ls .c3/changes/adr-20260904-fix-c3-213-derived-materials-grounding/
```

Expected: the folder exists. Now write
`.c3/changes/adr-20260904-fix-c3-213-derived-materials-grounding/01-reground-published-blog-posts.patch.md`
with exactly this content, substituting `BASE_ANCHOR_213` with the
`Published blog posts` anchor from Step 2 (the part **before** the quoted snippet, e.g.
`c3-213#n1549@v1:sha256:4f01d1d297944c8cf361efbe0f840ec25642f36bf853712c7ac20071907ec589`), and
deleting any scaffolded placeholder patch file `c3x change new` left behind:

```markdown
---
target: c3-213
scope: block
base: BASE_ANCHOR_213
---
| Published blog posts | Contract section (the research repo and blog repo commits OUT surface: bilingual note plus posts published to GitHub Pages) and Business Flow section (primary path: the note precedes and sources the posts) | Presentation/formatting per blog conventions | plugins/research-to-blog/agents/research-to-blog.md |
```

Note the replacement row deliberately writes "research repo and blog repo commits" rather than
copying the Contract row's own "Research repo + blog repo commits" wording, and says "posts
published to" rather than "pushed/published": both avoid characters that have bitten this repo
before, and neither changes the meaning.

- [x] **Step 5: Apply the change unit and watch it go green**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
C3X_MODE=agent bunx @c3x/cli@11.6.3 change apply adr-20260904-fix-c3-213-derived-materials-grounding --dry-run; echo "dry-exit=$?"
C3X_MODE=agent bunx @c3x/cli@11.6.3 change apply adr-20260904-fix-c3-213-derived-materials-grounding; echo "apply-exit=$?"
bunx @c3x/cli@11.6.3 check --only c3-213 > /tmp/green-task1-only.txt 2>&1; echo "only-exit=$?"; cat /tmp/green-task1-only.txt
bunx @c3x/cli@11.6.3 check > /tmp/green-task1.txt 2>&1; echo "exit=$?"; cat /tmp/green-task1.txt
git status --short
```

Expected: `dry-exit=0` and `apply-exit=0` (all four gates — drift, canvas, morph, retire — pass);
`only-exit=0` with no ungrounded-derivation error for `c3-213`; `exit=1` with exactly one
remaining error naming only `c3-216`; and `git status --short` shows the new ADR, the new change
folder, and a modified `.c3/c3-2-plugins/c3-213-research-to-blog.md` — plus possibly untracked
`.c3/c3.db-shm` / `.c3/c3.db-wal`, which are never staged. If any **other** tracked file under
`.c3/` shows as modified, that is unrelated reseal churn: `git checkout -- <that path>` and
re-run `check` to confirm it stays green.

- [x] **Step 6: Confirm the fence held**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
git diff -- .c3/c3-2-plugins/c3-213-research-to-blog.md
```

Expected: exactly two changed lines — the `c3-seal:` line in the frontmatter (rewritten by the
tool, never by hand) and the one Derived Materials row. Nothing else in the file moves. If more
lines changed, stop and report `BLOCKED` rather than committing.

- [x] **Step 7: Commit**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
git add .c3/adr/adr-20260904-fix-c3-213-derived-materials-grounding.md \
        .c3/changes/adr-20260904-fix-c3-213-derived-materials-grounding \
        .c3/c3-2-plugins/c3-213-research-to-blog.md \
        docs/superpowers/plans/2026-09-04-repair-inherited-c3-drift.md
git status --short
git commit -m "fix(c3): re-ground c3-213 derived materials on the Contract section" \
  -m $'Tribe-Card: repair-inherited-c3-drift\nTribe-Task: 1/2'
git log --format='%H%n%(trailers)' -1
```

Expected: `git status --short` before the commit lists only those four paths as staged and no
`c3.db` entry of any kind; the commit succeeds and `git log` prints both
`Tribe-Card: repair-inherited-c3-drift` and `Tribe-Task: 1/2`. Tick this task's Step checkboxes
in this same commit.

---

### Task 2: re-ground c3-216's Derived Materials row on the Contract section

- Create: `/tmp/adr-c3-216-draft.md` (scratch draft, not committed)
- Create: `.c3/adr/adr-20260904-fix-c3-216-derived-materials-grounding.md` (via `c3x add adr`)
- Create: `.c3/changes/adr-20260904-fix-c3-216-derived-materials-grounding/01-reground-effects-and-lessons.patch.md`
- Modify: `.c3/c3-2-plugins/c3-216-simple-image-video.md` (row 1 of Derived Materials, via `c3x change apply`)

- [x] **Step 1: Watch it fail**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
bunx @c3x/cli@11.6.3 check > /tmp/red-task2.txt 2>&1; echo "exit=$?"; cat /tmp/red-task2.txt
bunx @c3x/cli@11.6.3 check --only c3-216 > /tmp/red-task2-only.txt 2>&1; echo "only-exit=$?"; cat /tmp/red-task2-only.txt
```

Expected: `exit=1` with exactly one error, the `x c3-216:` ungrounded-derivation line (Task 1
already cleared `c3-213`); `only-exit=1` naming `c3-216`.

- [x] **Step 2: Derive the two anchors for c3-216**

Run the anchor script from "How to derive a cite anchor" above and keep the two `c3-216` lines.
Expected: one anchor whose snippet starts
`Effects-and-lessons reference doc | Change Safety section` (the patch base) and one whose
snippet starts `Owns the still-image` (the ADR Evidence cite).

- [x] **Step 3: Author the ADR draft and import it with the tool**

Write `/tmp/adr-c3-216-draft.md` with exactly this body, substituting `PURPOSE_CITE_216` with
the `Owns the still-image...` anchor line from Step 2 (whole line, quoted snippet included):

```markdown
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

    error: ungrounded derivation in Derived Materials row 1 column Must derive from:
           cite strict component sections

This is the exact defect `.c3/adr/adr-20260716-fix-derived-materials-grounding.md` repaired in
`c3-215` row 3 in July — that row, too, cited Change Safety and nothing strict. It matters
beyond this one fact because `c3x repair` runs the full check and refuses to succeed while any
error stands, so this cell denies the repair path to every component in the repo.

The derivation itself was never wrong, only under-cited. `c3-216`'s Contract section already
carries the row "Final video file / OUT / Mathematically seamless loop at requested duration
with audio" at `.c3/c3-2-plugins/c3-216-simple-image-video.md:63`, and the effects-and-lessons
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
| c3-216 | component | Its Derived Materials row 1 grounds its derivation only in the Change Safety section, which the component canvas does not accept as a derivation source; this unit re-grounds that single row on the Contract section so the fact is valid against its own canvas again. Cited on the Purpose paragraph because the offending row's own text contains pipe delimiters that c3x 11.6.3 cannot round-trip inside this table cell | PURPOSE_CITE_216 | Component canvas — the derivation-grounding contract this row violates |

## Verification

| Check | Result |
| --- | --- |
| bunx @c3x/cli@11.6.3 check --only c3-216 before | exit 1, error: ungrounded derivation in Derived Materials row 1 column Must derive from |
| bunx @c3x/cli@11.6.3 change apply adr-20260904-fix-c3-216-derived-materials-grounding | applies clean; row 1 cites the Contract section like c3-211 and c3-212 do |
| bunx @c3x/cli@11.6.3 check --only c3-216 after | exit 0, no ungrounded-derivation error |
| bunx @c3x/cli@11.6.3 check after | exit 0, zero errors across the whole repository |
| bunx @c3x/cli@11.6.3 repair after | exit 0, rebuild plus reseal plus check all succeed, no queued-command error |
```

Then import it, dry-run first:

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
C3X_MODE=agent bunx @c3x/cli@11.6.3 add adr 20260904-fix-c3-216-derived-materials-grounding \
  --dry-run --file /tmp/adr-c3-216-draft.md; echo "dryrun-exit=$?"
C3X_MODE=agent bunx @c3x/cli@11.6.3 add adr 20260904-fix-c3-216-derived-materials-grounding \
  --file /tmp/adr-c3-216-draft.md; echo "add-exit=$?"
ls .c3/adr/adr-20260904-fix-c3-216-derived-materials-grounding.md
```

Expected: `dryrun-exit=0`, then `add-exit=0`, and the `ls` prints the new ADR path. If the
dry-run rejects the Evidence cite, re-derive the anchor (Step 2) and retry — never hand-edit a
seal or a `.c3/` file to make it pass.

- [x] **Step 4: Scaffold the change unit and author the one block patch**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
C3X_MODE=agent bunx @c3x/cli@11.6.3 change new adr-20260904-fix-c3-216-derived-materials-grounding
ls .c3/changes/adr-20260904-fix-c3-216-derived-materials-grounding/
```

Expected: the folder exists. Now write
`.c3/changes/adr-20260904-fix-c3-216-derived-materials-grounding/01-reground-effects-and-lessons.patch.md`
with exactly this content, substituting `BASE_ANCHOR_216` with the `Effects-and-lessons` anchor
from Step 2 (the part **before** the quoted snippet), and deleting any scaffolded placeholder
patch file `c3x change new` left behind:

```markdown
---
target: c3-216
scope: block
base: BASE_ANCHOR_216
---
| Effects-and-lessons reference doc | Contract section (the final video file OUT surface: a mathematically seamless loop at the requested duration with audio) and Change Safety section (loop-seam and template-drift risks it records) | Grows with experience | plugins/simple-image-video/skills/simple-image-video/references/effects-and-lessons.md |
```

- [x] **Step 5: Apply the change unit and watch the whole repository go green**

> **Warchief amendment (2026-09-04).** This step's `c3-216` half is done and its
> checkbox is ticked accordingly: the canvas stage now reports `Checked 49 docs — all
> clear` with zero canvas errors. Its whole-repository half (`check` exit 0) is
> discharged by **Task 3** below, not by this task: clearing the last canvas error
> unmasked a later, previously unreachable check stage. The Hunter was right to leave
> this box unticked at commit time; the trailer `Tribe-Task: 2/2` is the ground truth
> that Task 2 itself is complete, so the file is corrected here to agree with it.

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
C3X_MODE=agent bunx @c3x/cli@11.6.3 change apply adr-20260904-fix-c3-216-derived-materials-grounding --dry-run; echo "dry-exit=$?"
C3X_MODE=agent bunx @c3x/cli@11.6.3 change apply adr-20260904-fix-c3-216-derived-materials-grounding; echo "apply-exit=$?"
bunx @c3x/cli@11.6.3 check > /tmp/green-final.txt 2>&1; echo "exit=$?"; cat /tmp/green-final.txt
bunx @c3x/cli@11.6.3 repair > /tmp/green-repair.txt 2>&1; echo "repair-exit=$?"; cat /tmp/green-repair.txt
git status --short
```

Expected: `dry-exit=0`, `apply-exit=0`, `exit=0` with `0 errors` in the summary (card G1), and
`repair-exit=0` with the run completing through "Rebuilt local C3 cache", "Resealed canonical
.c3/ tree" and a clean check, with no `hint: fix the queued command error above` line
(card G2 — at base this same command exits 1 with exactly that hint). `git status --short` must
show only this task's own new/modified `.c3/` paths, plus possibly untracked `.c3/c3.db-shm` /
`.c3/c3.db-wal`, which are never staged. Any other tracked file modified by the reseal is
unrelated churn: `git checkout -- <path>`, then re-run `check` to confirm it stays green.

- [x] **Step 6: Confirm the fence held**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
git diff -- .c3/c3-2-plugins/c3-216-simple-image-video.md
git diff --stat HEAD
```

Expected: for `c3-216`, exactly two changed lines — the `c3-seal:` frontmatter line and the one
Derived Materials row. The `--stat` shows only this task's ADR, change folder, and `c3-216`
file (plus this plan file). If any other component file appears, stop and report `BLOCKED`
rather than committing.

- [x] **Step 7: Commit**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
git add .c3/adr/adr-20260904-fix-c3-216-derived-materials-grounding.md \
        .c3/changes/adr-20260904-fix-c3-216-derived-materials-grounding \
        .c3/c3-2-plugins/c3-216-simple-image-video.md \
        docs/superpowers/plans/2026-09-04-repair-inherited-c3-drift.md
git status --short
git commit -m "fix(c3): re-ground c3-216 derived materials on the Contract section" \
  -m $'Tribe-Card: repair-inherited-c3-drift\nTribe-Task: 2/2'
git log --format='%H%n%(trailers)' -1
```

Expected: only those four paths staged, no `c3.db` entry of any kind, the commit succeeds, and
`git log` prints both `Tribe-Card: repair-inherited-c3-drift` and `Tribe-Task: 2/2`. Tick this
task's Step checkboxes in this same commit.

---

### Task 3: let the tool reseal `c3-201` so the whole-repo check reaches exit 0 (Warchief amendment, 2026-09-04)

- Modify: `.c3/c3-2-plugins/c3-201-explaining.md` (seal + one Contract cell, **written by `c3x repair`, never by hand**)
- Modify: `docs/superpowers/plans/2026-09-04-repair-inherited-c3-drift.md` (this task's checkboxes)

**Why this task exists.** `c3x check` runs its canvas stage first and aborts before its
canonical-sync stage while any canvas error stands. Tasks 1 and 2 cleared the last canvas error,
so the sync stage ran for the first time and reported drift that was always there but never
reachable:

```
Checked 49 docs — all clear
DIFFERS c3-2-plugins/c3-201-explaining.md
error: sync check failed: canonical markdown drift detected
```

`c3-201` is byte-identical to base here (`git diff d1ec881..HEAD -- .c3/c3-2-plugins/c3-201-explaining.md`
is empty), so this drift is inherited, not caused by this card.

**Why it is in fence.** Card G4 reads "No other component's content changes except **reseals the
tool requires**". This is exactly such a reseal — `c3x` refuses its own sync check without it —
and card G1 (`check` exits 0) cannot be met without it. Card D2 still holds: `c3x` writes it, you
never do.

**The one thing you must NOT commit.** `c3x repair` also rewrites
`.c3/adr/adr-20260821-explaining-illustration-scope.md`, and that rewrite is **lossy**: it
silently deletes the final cell of that ADR's Affected Topology row (`This unit's three patches
are the review`), because the cell text contains a raw `|` that the c3x 11.6.3 table serializer
cannot round-trip — the F23 bug that ADR itself documents. That is unrelated, destructive churn
and the standing constraint says discard it. Verified: discarding it still leaves `check` at
exit 0.

- [x] **Step 1: Watch it fail**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
bunx @c3x/cli@11.6.3 check > /tmp/red-task3.txt 2>&1; echo "exit=$?"; cat /tmp/red-task3.txt
```

Expected: `exit=1`, `Checked 49 docs — all clear`, then `DIFFERS c3-2-plugins/c3-201-explaining.md`
and `error: sync check failed: canonical markdown drift detected`. This is the RED proof.

- [x] **Step 2: Let the tool write the reseal**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
bunx @c3x/cli@11.6.3 repair > /tmp/repair-task3.txt 2>&1; echo "repair-exit=$?"; cat /tmp/repair-task3.txt
git status --short
```

Expected: `repair-exit=0`, the run completing through `Rebuilt local C3 cache`, `Resealed
canonical .c3/ tree`, `Checked 49 docs — all clear`, `OK: canonical markdown is in sync` — and
**no** `hint: fix the queued command error above` line (that hint is the card's G2 baseline
failure and must be gone). `git status --short` shows exactly two modified tracked files:
`.c3/c3-2-plugins/c3-201-explaining.md` and
`.c3/adr/adr-20260821-explaining-illustration-scope.md`, plus possibly untracked `.c3/c3.db-shm`
/ `.c3/c3.db-wal`, which are never staged.

- [x] **Step 3: Discard the lossy ADR churn**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
git diff --stat -- .c3/adr/adr-20260821-explaining-illustration-scope.md
git checkout -- .c3/adr/adr-20260821-explaining-illustration-scope.md
git status --short
```

Expected: the `git diff --stat` first shows that file modified; after the `checkout` it is gone
from `git status --short`, leaving `.c3/c3-2-plugins/c3-201-explaining.md` as the only modified
tracked file.

- [x] **Step 4: Confirm the fence held and the loss did not happen**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
git diff -- .c3/c3-2-plugins/c3-201-explaining.md
git diff --name-only
grep -c "This unit's three patches are the review" .c3/adr/adr-20260821-explaining-illustration-scope.md
```

Expected: the `c3-201` diff is exactly two changed lines — the `c3-seal:` frontmatter line and
the one Contract table row (whose only difference is that the tool stripped the backticks around
three paths; the paths themselves survive unchanged). `git diff --name-only` lists only that one
file. The `grep -c` prints `1`, proving the ADR cell the repair wanted to delete is still there.
If the `c3-201` diff shows more than those two lines, or the grep prints `0`, stop and report
`BLOCKED` rather than committing.

- [x] **Step 5: Prove the card's two goals**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
bunx @c3x/cli@11.6.3 check > /tmp/green-task3.txt 2>&1; echo "check-exit=$?"; cat /tmp/green-task3.txt
```

Expected: `check-exit=0` (card G1) with `Checked 49 docs — all clear` and `OK: canonical markdown
is in sync`. Paste this transcript into your report verbatim.

- [x] **Step 6: Commit**

```bash
cd /Users/hip/repo/todd-skills-wt/repair-c3-drift
git add .c3/c3-2-plugins/c3-201-explaining.md \
        docs/superpowers/plans/2026-09-04-repair-inherited-c3-drift.md
git status --short
git commit -m "fix(c3): reseal c3-201 canonical markdown so the repo check reaches exit 0" \
  -m $'Tribe-Card: repair-inherited-c3-drift\nTribe-Task: 3/3'
git log --format='%H%n%(trailers)' -1
```

Expected: only those two paths staged and no `c3.db` entry of any kind; the commit succeeds and
`git log` prints both `Tribe-Card: repair-inherited-c3-drift` and `Tribe-Task: 3/3`. Tick this
task's Step checkboxes in this same commit. No `Co-Authored-By` trailer of any kind.
