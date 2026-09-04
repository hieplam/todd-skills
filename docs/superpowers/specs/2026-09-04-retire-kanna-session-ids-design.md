# Spec: retire the Kanna session-id bridge

**Card:** `retire-kanna-session-ids` · **Author:** Warchief, 2026-09-04
**Base:** `d63a7d27e52c9881ff6e1cfd1c78e6177eaa2638` (origin/master)
**Worktree:** `/Users/hip/repo/todd-skills-wt/retire-kanna-session-ids` · **Branch:** `chore/retire-kanna-session-ids`

## Problem (grounded in code)

PR #111 shipped the campaign live viewer. The runner now auto-starts a read-only local page that
tails every card's transcript while the run is in flight
(`plugins/tribe/scripts/runner/README.md:125-158`, "Live viewer"). That makes the older manual
path — copy session ids out of `campaign-state.json`, paste them into Kanna's Import dialog —
redundant, and that path was never safe: the README itself warns that "sending a message from
Kanna takes over the session and will conflict with the runner's own resume"
(`plugins/tribe/scripts/runner/README.md:218-219`).

The owner ruled on 2026-09-04: delete it. Four surfaces carry it today, and only four:

| # | Surface | Location (at base `d63a7d2`) |
| --- | --- | --- |
| S1 | the script | `plugins/tribe/scripts/kanna/list-session-ids.sh` (23 lines; the only file in `plugins/tribe/scripts/kanna/`) |
| S2 | its shell test | `plugins/tribe/scripts/tests/test-list-session-ids.sh` (line 5 resolves `$here/../kanna/list-session-ids.sh`) |
| S3 | the runner doc | `plugins/tribe/scripts/runner/README.md:212-219`, section `### Visualizing campaign sessions in Kanna` |
| S4 | the architecture fact | `.c3/c3-2-plugins/c3-215-tribe.md:78`, Contract row `scripts/kanna/list-session-ids.sh \| OUT \| ...` |

Verified by `git grep -n list-session-ids origin/master -- plugins .c3 README.md install.sh`:
those are the only four hits outside `docs/superpowers/` history.

Two facts that bound the blast radius, both checked rather than assumed:

- **No anchor links point at S3's heading.** `grep -rn visualizing-campaign-sessions .` returns
  nothing, so the section may be retitled without breaking a cross-reference.
- **Other `kanna` mentions in the repo are unrelated** and must stay: porting attribution in
  `plugins/tribe/scripts/viewer/core/live/paths.ts:27` and `.../normalize.ts:5`,
  `plugins/tribe/scripts/viewer/README.md:72`, a purity-wall note in
  `plugins/tribe/scripts/runner/structure.test.ts:13`, an ADR line in
  `.c3/adr/adr-20260723-runner-purity-wall.md:37`, and a campaign *slug* literal
  (`kanna-session-import`) in `runner/core/brief.test.ts` and `runner/core/loop.test.ts`. G1's
  grep is for the string `list-session-ids`, not `kanna`, so none of these are in scope.

`install.sh` needs no change: its component whitelist has a dedicated `scripts) ;;` arm
(`install.sh:119-121`) that installs nothing from `scripts/`, so removing a directory under it is
invisible to the installer.

## The change

**S1 + S2 — delete.** `git rm` both files. `plugins/tribe/scripts/kanna/` then has no tracked
files, so git stops tracking the directory; the working-tree directory is removed too. No shim, no
deprecation stub, no redirect (card decision D1).

**S3 — repoint at the live viewer, in place.** The existing section keeps its slot in the README's
flow (it sits between "Per-card fields" and "Worked example") but is retitled away from Kanna and
rewritten to two sentences that point at the auto-started live viewer already documented at
`README.md:125`. No new section is introduced (card goal G2).

**S4 — remove the Contract row through the repo's only legal C3 mutation path.** `.c3/` facts are
sealed; hand-editing the markdown breaks the seal. The repo's established path (see
`.c3/changes/adr-20260822-html-illustration-rule/`, merged in `4471c12`) is an ADR entity plus a
change-unit whose `*.patch.md` files are applied by `c3x change apply`. Concretely:

1. `bunx @c3x/cli@11.6.3 add adr retire-kanna-session-ids --file <adr-body>` — the ADR is the
   reasoning half of the change-unit, and `c3x schema adr` fixes its required sections (Goal,
   Context, Decision, Affected Topology, Verification are the required core for a small change).
2. `bunx @c3x/cli@11.6.3 change new adr-20260904-retire-kanna-session-ids` — scaffolds the patch
   folder.
3. One block patch with an **empty body**, anchored on the row's cite handle. A block patch
   "replaces / inserts / deletes one block" (`c3x change --help`); an empty body is the delete
   form. The handle comes from
   `bunx @c3x/cli@11.6.3 read c3-215 --section Contract --cite`, which at base prints
   `c3-215#n1626@v1:sha256:aa31c384fd777dda33f0dc2b820d2420455d5a22816084dd2a85ea081edc0d12`
   for the kanna row. The node number is cache-assigned and can drift; **the handle is re-read at
   execution time, never copied from this spec**.
4. `bunx @c3x/cli@11.6.3 change apply <unit-id>` — atomic, gated (drift / canvas / morph /
   retire).

**Reseal churn is discarded, deliberately.** Warchief pre-verified this whole sequence in the
worktree and reverted it: `change apply` rewrites the target fact correctly, but *also* re-seals
two unrelated facts, and that re-serialization is **destructive** — it drops the trailing
`Governance review` cell of a table row in
`.c3/adr/adr-20260821-explaining-illustration-scope.md` (a known `c3x` 11.6.3 pipe-escaping
serializer limitation, already named as "F23" inside that ADR) and re-seals
`.c3/c3-2-plugins/c3-201-explaining.md` with it. Both files are restored with
`git checkout -- <path>` after the apply. Restoring content *and* seal together leaves them
self-consistent, which `c3x check` re-verifies.

## Scope fence

**IN:** S1, S2, S3, S4 and the `plugins/tribe/scripts/kanna/` directory; the ADR + change-unit
artifacts that S4's removal legally requires; this spec and its plan.

**OUT:** any viewer or runner *code* change; `docs/superpowers/` history (card decision D2 — the
specs and plans that mention the script as history stay exactly as written); fixing the inherited
`c3-213` / `c3-216` C3 errors (separate card); the Kanna repo itself; `install.sh` (verified: no
change needed); the two shell suites another Warchief owns concurrently
(`test-input-asymmetry.sh`, `test-review-cell-v3.sh`) and `pre-gate.sh`.

## Purity

No production logic is added — this card only deletes code and edits documents. The pure-core
standard (`~/.claude/rules/pure-core.md`) has no surface to bind to here, and nothing in the change
introduces a dependency, a seam, or a composition root. Recorded so a reviewer can see it was
considered rather than skipped.

## Testing strategy

There is no behavior to add a regression test for; the deliverable is an absence. The card's G1 is
itself the mechanical assertion, so it is executed as the red/green proof rather than committed as
a new suite (adding a permanent "the kanna directory does not exist" suite is outside the card's
four-surface fence).

- **Red, before the change** — the G1 assertions fail at base.
- **Green, after the change** — the same assertions pass, run by the Warchief in its own hands.
- **Regression guard** — the full shell suite sweep must be **delta-zero** against the base
  sweep, modulo the one suite this card deliberately deletes.

Base sweep, captured before any edit
(`~/.tribe/-Users-hip-repo-todd-skills/reports/pregate/retire-kanna-BASE.md`): 18 suites, 16
green, `test-fresh-machine.sh` red (exit 1, 25 passed / 1 failed) and `test-input-asymmetry.sh`
red (exit 2). Those two are inherited and stay red — another Warchief owns that card. After the
change the sweep must show 17 suites with exactly the same two red.

C3 gates, also captured at base:

- `bunx @c3x/cli@11.6.3 check --only c3-215` -> exit 0, `Checked 46 docs — all clear`
- `bunx @c3x/cli@11.6.3 check` -> exit 1, 2 errors: `c3-213` and `c3-216`, both inherited

Both must be no worse afterwards (G3). ADRs are excluded from `check` by default, so the new ADR
is additionally validated with `--include-adr --only <adr-id>`.

## Evidence plan

The repo has no CI workflows (`.github/` does not exist at base), so evidence is captured by the
Warchief running the repo's own harness in the worktree and pasting transcripts into the PR body:

1. **G1** — the assertion block (`git ls-files plugins/tribe/scripts/kanna`, `ls` on the tests
   file, the four-path grep) run at base (BEFORE: hits) and on the branch (AFTER: empty).
2. **G2** — the `git diff` hunk of the README section, before and after.
3. **G3** — `c3x check --only c3-215` and full `c3x check` output, before and after, side by
   side, showing the inherited `c3-213`/`c3-216` errors unchanged.
4. **G4** — the two `pre-gate.sh` suite sweeps (base vs branch), showing an identical red set and
   only `test-list-session-ids.sh` gone.

All four are text transcripts reproducible from the PR by anyone with the branch checked out; no
image hosting is needed.

## Risk and rollback

| Risk | Mitigation |
| --- | --- |
| `c3x change apply`'s unrelated reseal silently lands the destructive cell-drop | The plan names the two files explicitly and `git checkout --` them in the same step; the audit re-checks `git diff --stat -- .c3` shows only `c3-215-tribe.md` plus the new ADR/patch |
| The cite handle drifts between authoring and execution | The handle is re-read with `read c3-215 --section Contract --cite` at execution time; a stale anchor is caught by `apply`'s drift gate, which is fail-closed |
| The README rewrite breaks an inbound anchor | Verified none exists (`grep -rn visualizing-campaign-sessions .` is empty) |
| Deleting the test hides a real regression | The script it tested is deleted in the same commit; the suite sweep delta proves nothing else moved |
| The owner's uncommitted main-checkout changes leak in | The worktree was created from `d63a7d2` (origin/master), never from the dirty main checkout |

Rollback is a single `git revert` of the merge: every surface is a file deletion or a document
edit, and `c3x change apply` writes only into `.c3/`, which the revert restores wholesale.
