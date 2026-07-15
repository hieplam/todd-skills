# tribe-state: idea-11-review-cell-v3
roadmap: bun-rust-migrate-ideas.md
worktree: /Users/todd.lam/WORK/_TestScripts/todd-skills-idea-11
branch: feat/idea-11-review-cell-v3
report: /private/tmp/claude-503/-Users-todd-lam-WORK--TestScripts-todd-skills/65033311-dbff-4781-b902-7a87cb36f0d0/scratchpad/reports/impl-idea-11.md
base-sha: db87488aca2013ee8ae18d6f0b44319bc4d3d5b8
plan: docs/tribe/planning/idea-11-review-cell-v3/plan.md

## Milestones
- [x] spec committed (on master, planning campaign — db87488)
- [x] plan committed (on master, planning campaign — validate-plan.sh verdict: pass, 5 tasks, 7/7 checks)
- [x] task 1 shipped (skinner.md sub-lenses + path-scope rule; 3 fix rounds, 6 Skinner reports)
- [x] RESCOPED against the advisory-Skinner law (2026-07-15): see RESCOPE.md; card.md is now the
      rescoped v2 (original preserved as card-v1-original.md)
- [ ] cheap-wins wave: task 2 (pre-gate.sh), 3a (path-scoped cold diff, warchief half),
      3b (pre-gate step-6.0 law), 4 (ledger lens/yield columns), evals 1-3 — READY TO BUILD
- [ ] deferred wave: task 3c (three-lens expansion), eval 4 — RATIFIED but sequenced last
      (after the cheap wins ship + one data campaign — Decision 1)

## Predecessor law change (new baseline)

The advisory-Skinner rewrite of skinner.md + warchief.md landed on branch
`feat/advisory-skinner-review-cell` (commit db87c57): no lens holds a verdict, the Warchief
adjudicates every finding (CONFIRMED/REFUTED/DEBT), targeted verification replaces per-fix-round
re-discovery. This card is now a delta on THAT baseline, not the verdict-model one the original
plan.md targeted. Original plan.md tasks 2-5 were written against the old law — see RESCOPE.md for
per-piece deltas before re-planning.

## Owner ruling (2026-07-15)

- **D1 — build task 3c, sequenced last** (not this campaign). Cheap wins first, one data campaign,
  then the three-lens expansion.
- **D2 — two-of-three `agreed` supersession ratified**, scoped to task 3c's eventual build.
- **D3 — F16 stays open debt**, paid as task 3c's first act (not retired).

## Campaign type

IMPLEMENTATION. The spec and plan are settled law, already on master (db87488). This campaign
applies the prompt/script edits the plan describes: skinner.md gains two cold sub-lenses
(`cold-executor` / `cold-reader`) and the path-scope contamination rule; a new `pre-gate.sh`
runs the mechanical sweep before any Skinner exists; warchief.md step 6 becomes a three-lens
cell with two-of-three `agreed` and a rung-2 free majority; the ledger gains a `lens` column and
a `## Reviewer yield` table; four behavioral evals.

Card says an implementation Warchief starts at Method **step 4** — steps 2-3 are done.

## Rulings in force (D12a — recorded BEFORE the work they authorize)

### D-owner-1 — dogfood the new law on the final audit
The owner ruled this campaign audits ITSELF under both laws, split by phase:

- **Tasks 1-5, per-task audits:** the currently SHIPPED 2-lens cell (Skinner A `lens: contract`
  + Skinner B `lens: cold`), because at that point the 3-lens law is not yet merged and a
  Warchief may not run law that does not exist.
- **The FINAL whole-branch audit:** the NEW 3-lens law this card ships — `pre-gate.sh` first,
  then Skinner A `lens: contract` (full-range diff + the gate report as settled mechanical fact),
  Skinner B `lens: cold-executor` and Skinner C `lens: cold-reader` (both on a PATH-SCOPED diff
  excluding `docs/tribe/planning/**` and `docs/tribe/state/**`), merged with `agreed` = two-of-three.

Rationale: this is the only proof the card actually works, and it is what produces the card's own
measurable-goal (b) evidence — "at least one finding per campaign originates from the cold
executor's run artifacts (command output cited in the finding)". A card that ships having never
been run is a card whose laws are written but unexercised.

### D-owner-2 — eval subset, disclosed
All FOUR evals of task 5 are AUTHORED and committed. **Exactly two are EXECUTED this campaign** —
the two that guard the card's method asymmetry, which is its heart:

- **RUN:** eval #1 (`cold-executor` must cite the command output it ran) and eval #2
  (`cold-reader` must produce static findings and must NOT execute the suites).
- **AUTHORED, NOT RUN:** eval #3 (Warchief refuses the contract-bearing cold range) and eval #4
  (Warchief classes a cold+cold convergence as `agreed`).

The PR body must DISCLOSE this split plainly — never imply four green evals. A reproducible FAIL
on either executed eval is a finding and a stop condition (plan, task 5): report it, do not weaken
any `expected_output`.

### D-owner-3 — merge strategy is REBASE & MERGE, always
The owner ruled, mid-campaign and standing: **always use Rebase & merge**, never squash.

This **overrides** `warchief.md` step 7 ("Squash-merge into the default branch once green") and the
`verify-shipped` skill, which mechanically checks `merge strategy == squash` as the owner's own
encoded Definition of Done. The owner outranks the playbook, so this campaign merges with
`gh pr merge --rebase`.

**Follow-up for the Shaman (do not fix here — out of this card's fence):** two shipped artifacts
now encode a merge strategy the owner has superseded — `warchief.md` step 7's squash mandate and
`verify-shipped`'s squash check. They must be amended to match D-owner-3, or every future campaign
re-derives this conflict by hand. Filed, not fixed.

## Warchief adjudications (How-level, recorded at intake)

1. **Plan checkboxes ARE ticked in each task commit** (`docs/tribe/planning/idea-11-review-cell-v3/plan.md`),
   exactly as every task's Step 4 `git add` mandates — the shipped idea-05 precedent. Ticking
   `- [ ]` -> `- [x]` alters no contract prose. Nothing else under `planning/**` is touched.
2. **This repo has NO CI** — no `.github/workflows/` exists at db87488. Step 7's watch block will
   hit its exit-2 path (empty RUN_IDS). Per warchief.md step 7: confirm via `gh pr checks`, record
   the absence in the PR body + report, and proceed to squash-merge. The real gates are the repo's
   bash tripwire suites, run and transcribed into the PR.
3. **Baseline captured at db87488** (the BEFORE half of the evidence plan):
   `test-context-isolation.sh` 35/0, `test-disagreement-routing.sh` 183/0,
   `test-dual-skinner-cell.sh` 27/0, `test-fixer-mandate.sh` 28/0, `test-input-asymmetry.sh` 46/0,
   `test-resume-check.sh` 32/0, `test-validate-plan.sh` 7/0; `evals.json` = 20 evals, max id 20.
   New eval ids are therefore **21, 22, 23, 24**.

## Tie-breaks spent

(none yet)

## Open debt — must be paid BEFORE task 3 lands

**F16 (Important, unfixed):** `skinner.md` still says "two independent reviewers" / "the other
reviewer" (singular) in 4 places, including the anti-collusion rule. This is TRUE today — the
shipped cell is still two Skinners, because warchief.md's three-lens dispatch is task 3 and task 3
is not built. It becomes a **seal defect the moment task 3 lands**: a Skinner reading "you will
never be told what THE OTHER reviewer found" has textual grounds to treat a THIRD report as not the
forbidden peer. Found by the contract lens, round 3. Fix it in task 1's file as the first act of
task 3, or the three-lens cell ships with a hole in its isolation invariant.

## Follow-ups filed for the Shaman (out of this card's fence)

1. **D14 is still too weak** (owner-ruled: file, do not fix here). D14 was itself minted to close a
   hollow-assertion hole (whole-file revert → per-clause delete). Its delete-only bar let 7 more
   vacuous assertions through this campaign, caught only by RELOCATION and DECOY mutations. Every
   assertion in the repo's 7 shipped suites (358 total) was certified under the weaker bar and has
   never been tested at the stronger strengths. Nobody knows how many are dead.
2. **warchief.md step 7 + verify-shipped mandate squash-merge**, which D-owner-3 supersedes.
3. **A Skinner can finish without writing its report file.** Happened twice (round-2 cold, round-3
   contract). The Warchief has no mechanical way to tell "no findings" from "never reported". The
   Skinner brief must make the report file a precondition of finishing, and a missing report must
   be treated as `un-auditable` (already a round failure under Law 4), never as silence.
