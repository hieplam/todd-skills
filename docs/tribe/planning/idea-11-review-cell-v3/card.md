# Idea 11 — Review-cell v3: method asymmetry, a mechanical pre-gate, and measured
# reviewers — rescoped against the advisory-Skinner law change

> Rescoped card (supersedes the pre-advisory-rewrite original, preserved as
> `card-v1-original.md`). See `RESCOPE.md` (this directory) for the full
> per-piece verdict table and reasoning — this file states only the buildable outcome. Origin
> and evidence base are unchanged from `card.md` (owner-directed forensics of the idea-03
> implementation session, read against bun.com/blog/bun-in-rust) — not restated here.
>
> **What changed since card.md:** the tribe's review protocol moved from an authoritative
> `AUDIT: PASS|FAIL` contract-lens verdict to an ADVISORY model — no lens holds a verdict, the
> Warchief adjudicates every finding (CONFIRMED/REFUTED/DEBT), and per-round re-discovery is
> replaced by the Warchief's own targeted verification. This landed on master as an uncommitted
> (at rescope time) rewrite of `plugins/tribe/agents/skinner.md` and `plugins/tribe/agents/warchief.md`,
> independent of this card. Task 1 of the original plan (the two cold sub-lenses + path-scope
> contamination rule) shipped and survived the rewrite unchanged. Tasks 2-5 never shipped and are
> rescoped below.

**Status of this card:** Task 1 (skinner.md sub-lenses + path-scope contamination) is SHIPPED —
unchanged, do not rebuild. Tasks 2, 3a, 3b, 4, and eval-1/2/3 of Task 5 are READY TO BUILD, gated
only on each other (see Sequencing). Task 3c (three-lens dispatch expansion) and Task 5's eval 4
are RATIFIED but DEFERRED (see Owner ruling below): build them only in a later wave, after the
cheap wins have shipped and one data campaign has run.

## Owner ruling (landed 2026-07-15)

- **Decision 1 — build Task 3c, sequenced last.** The three-lens expansion (wire in the
  already-built `cold-reader` as a second cold reviewer, `agreed` = two-of-three) is ratified —
  but it is NOT part of this campaign. Ship the unconditional cheap wins first (Tasks 2, 3a, 3b,
  4, evals 1-3), run one campaign to collect Reviewer-yield data, THEN build 3c. Rationale: the
  advisory rewrite already captured most of the original Gap-4 urgency, so the cheap wins must not
  be gated on 3c; but the Gap-3 evidence (each real defect caught by only 1 of 2 reviewers) is
  real data and Task 1's sub-lens build is a sunk cost earning nothing until 3c lands.
- **Decision 2 — the two-of-three `agreed` supersession is ratified**, conditional on and
  scoped to Task 3c's eventual build. It does not apply while the cell is two-lens.
- **Decision 3 — F16 stays open debt, to be paid as the first act of Task 3c** (per Task 3c's own
  precondition below). It is NOT retired: the singular "other reviewer" language becomes a live
  isolation defect the moment the third lens is dispatched, and 3c is now a ratified future build.

## Measurable goal (supersedes card.md's goal paragraph)

**(a)** Zero cold-lens contamination incidents on the next implementation campaign — no contract
document (spec/plan/idea card/state file) reachable from any cold dispatch's diff range.

**(b)** At least one finding per campaign originates from the cold lens's run artifacts (command
output cited in the finding). **Already achievable today, unblocked, zero further build**: the
live cell's bare `lens: cold` dispatch already resolves to `cold-executor`
(`skinner.md:182-184`), which already carries the run-evidence mandate. Prove this on the next
campaign that dispatches a discovery-round Skinner B; no code change required to attempt it.

**(c)** Reviewer briefs stop mandating full-suite re-runs; the pre-gate report carries that fact
instead. Tripwire-suite executions **by an LLM reviewer, per DISCOVERY round** (first audit of a
task, the final whole-branch audit, or the "fix rewrote beyond named locations" exception — NOT
per fix round; fix rounds already run zero fresh Skinner-side suite executions under the
advisory model's targeted verification) drop from a full sweep to zero, replaced by the
pre-gate's one script run.

**(d)** The disposition ledger's `## Reviewer yield` table is filled for every round. `lens`
values are `contract` / `cold-exec` (and `cold-read`, legitimately showing zero dispatches,
unless/until Task 3c ships).

## Scope fence

Same file surface as `card.md`: `plugins/tribe/agents/warchief.md` step 6 (now: the step-6.0
preamble and the enumerated consistency edits below — NOT a Law-1 rewrite unless Task 3c is
ratified), `plugins/tribe/agents/skinner.md` (already-shipped lens-mode section; no further edits
expected unless Task 3c's F16 fix is triggered), one new script under `plugins/tribe/scripts/`
(the pre-gate), the disposition-ledger template, and their tripwire suites + evals. Nothing under
step 5, no hunter.md changes, no eval-runner changes. **Additionally out of scope for this v2
card:** `warchief.md` step 7's squash-merge mandate and the `verify-shipped` skill's squash check
— both still say squash (`warchief.md:1083`), both contradict D-owner-3, both are filed follow-ups
for the Shaman, not this card.

## The tasks (rescoped)

### Task 1 — SHIPPED, unchanged
skinner.md's two cold sub-lenses (`cold-executor`/`cold-reader`) and the path-scope contamination
rule. Do not touch.

### Task 2 — `pre-gate.sh` (unchanged from card.md's T3 / plan.md task 2)
Build exactly as spec'd (spec.md Delta-C, plan.md task 2): stateless mechanical gate — sweeps
every `test-*.sh`, checks commit-trailer hygiene, optionally checks a scope-fence file list,
writes a Markdown report + JSON summary. Self-tests itself (pass case, fence-violation case). No
change needed against the advisory law — see `RESCOPE.md` "Task 2" for why.

### Task 3a — path-scoped cold diff, warchief half (was: part of card.md's T1/T2, plan.md task 3)
New law in `warchief.md` step 6: the diff handed to any cold lens is path-scoped to operative
code, with an explicit exclusion list covering at minimum `docs/tribe/planning/`,
`docs/tribe/state/`, and any committed contract document for the card under audit. Add the
forbidden-channel table row: "an un-scoped full-range diff | the tribe's contract documents live
in-repo, so the full range hands the cold lens the contract." The contract lens's diff stays
full-range (unchanged rationale from spec.md Delta-A). Build regardless of Task 3c's fate —
closes goal (a) on its own.

### Task 3b — the pre-gate law (was: part of card.md's T3, plan.md task 3)
A new step-6.0 preamble in `warchief.md`: run `pre-gate.sh` against the range under audit before
dispatching any Skinner. A red pre-gate is the Hunter's unfinished work, not an audit round —
route the script report to a fixer Hunter as an ordinary incomplete-deliverable follow-up; no
Skinner dispatched, no fix round consumed. On green, the contract lens's brief carries the
pre-gate report as settled mechanical fact (same D9 contract-class admissibility argument as
spec.md Delta-C); the cold lens's brief does not. Reviewer briefs stop mandating full-suite
re-runs; the contract lens may still re-run a specific suite to falsify a specific hypothesis,
and the cold-executor still runs targeted experiments by its own method mandate (unchanged from
skinner.md). Build after Task 2, regardless of Task 3c's fate — closes goal (c).

### Task 3c — three-lens dispatch expansion — RATIFIED, DEFERRED to a later wave
Ratified by Decision 1 (above), but **explicitly out of the current cheap-wins campaign**: build
only after Tasks 2/3a/3b/4 have shipped and one data campaign has filled the Reviewer-yield table.
Wire `warchief.md` Law 1 to dispatch **three** `skinner` instances per discovery round
(`contract` / `cold-executor` / `cold-reader`), re-derive `agreed` as "at least two of the three
lenses," add the rung-2 free-majority check (before dispatching a tie-break Skinner C, check
whether the third cell member already voted). This is a fresh design against the CURRENT advisory
step-6 text — see `RESCOPE.md` "Task 3c" — not a reapplication of the original plan.md task-3
diff, which targeted text that no longer exists. **Precondition: F16 (skinner.md's "two
independent reviewers" / "the other reviewer" singular language) must be fixed as the first act
of this task**, or the three-lens cell ships with a hole in its own isolation invariant. **Do not
start this task until the cheap-wins campaign has shipped and one data campaign has run (Decision 1).**

### Task 4 — ledger `lens` column + `## Reviewer yield` table (was: card.md's T4, plan.md task 4)
Add a `lens` column to the disposition ledger (already carrying `class`/`routed` independently of
this card, `warchief.md:885-888`), values `contract` / `cold-exec` / `cold-read`, comma-joined
when more than one lens raised a finding, filled by the Warchief when the row is first written.
Append the `## Reviewer yield` table per round: one row per lens, columns
`raised / unique / confirmed / refuted / out-of-scope`, derived entirely from the ledger,
non-authoritative, never used for resume. Can ship right after Task 3b (with `cold-read`
legitimately idle) or after Task 3c if ratified — Warchief's sequencing call, not a fence issue.

### Task 5 — behavioral evals (was: card.md's implicit plan task 5)
Author and append to `plugins/tribe/evals/evals.json`, ids `21`-`24` (current max id: 20,
confirmed by direct count):

1. `cold-executor-cites-the-run-that-manifests-the-defect` — **unchanged from the original plan**,
   runnable now, no dependency on Tasks 2-4.
2. `cold-reader-finds-the-contradiction-without-running-suites` — **unchanged from the original
   plan**, runnable now, no dependency on Tasks 2-4.
3. `warchief-refuses-the-contract-bearing-cold-range` — **unchanged content**, blocked on Task 3a
   shipping first (tests the warchief-side law Task 3a adds).
4. **Conditional on Decision 1:**
   - If Task 3c ships: `warchief-classes-a-cold-cold-convergence-as-agreed`, as originally
     designed (spec.md's eval 4).
   - If Task 3c does not ship: replace with
     `warchief-classes-a-lone-cold-finding-as-single-not-silence`  — contract lens silent, cold
     lens (executor) flags location X; expected class `single`, given an explicit disposition
     (CONFIRMED-or-REFUTED-with-evidence) per Law 3, never silently dropped. Preserves the
     original eval's teaching point (silence isn't dissent) without requiring a lens that may
     never be dispatched.

Per D-owner-2 (unchanged): all four evals are authored and committed; **only evals 1 and 2 are
executed this campaign** (they guard the card's method asymmetry, its heart). Evals 3 and 4 stay
authored-not-run, same rationale as before, now for an updated reason (gated on Task 3a / the
Decision-1 ruling rather than on plan sequencing alone).

## Dependencies & interactions (unchanged from card.md, still true)

- Layered on shipped 01/02/03/04/05, PLUS now the (uncommitted-at-rescope-time) advisory-Skinner
  rewrite of skinner.md/warchief.md — treat that rewrite as a new, additional baseline this card
  is a delta on.
- Textual collision with idea 06 (D9's CODEX admissibility clause lands in the same step-6
  brief-contents region) — never the same wave; this card still goes first (D23).
- Idea 10's findings-ledger/tripwire sink should build on Task 4's ledger columns.
- Task 3c, if ratified, amends idea-04's `agreed` definition (two-of-three) — must be named as a
  deliberate supersession in the spec, per the D12/D18 doctrine, exactly as the original card
  required.
- D14 applies: every new/changed assertion ships under the per-clause mutation bar.

## Decision authority

**Warchief decides:** script name/location, report format, exact path-scope glob list, brief
wording, whether Task 4 ships before or after Task 3c.

**Shaman decides:** nothing further beyond what's already ruled here — the two-of-three `agreed`
supersession, any change to Law 4, and any change to the 3-round cap are explicitly
**owner-ratification-required**, not Shaman's to decide alone, per the team lead's rescoping
brief. See `RESCOPE.md`'s "Owner-only decisions" section for the three numbered decisions and
their recommendations.

**Owner (already ruled, D23):** this card is funded and jumps the parked queue — unaffected by
the rescope. **Owner (ruled 2026-07-15):** Decision 1 (build Task 3c, sequenced last — not this
campaign), Decision 2 (two-of-three `agreed` supersession ratified, scoped to 3c), Decision 3 (F16
stays open debt, paid as 3c's first act). See "Owner ruling" section above.

**Status:** Task 1 shipped. Tasks 2, 3a, 3b, 4, and eval-1/2/3 of Task 5 are spec'd here and
buildable by a fresh Warchief without further Shaman input — this is the current campaign. Task 3c
and Task 5's eval 4 are RATIFIED but DEFERRED to a later wave (after the cheap wins ship and one
data campaign runs). A fresh Warchief on the current campaign builds in the order:
2 → 3a → 3b → 4 → Task-5 evals 1/2/3, then STOPS — it does not touch Task 3c or eval 4, which are
a separate future wave.
