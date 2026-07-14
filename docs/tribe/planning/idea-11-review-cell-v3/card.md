# Idea 11 — Review-cell v3: method asymmetry, a mechanical pre-gate, and measured reviewers

> Origin: owner-directed forensics of the idea-03 implementation session (9f0c7618, $35.85) read
> against the source article https://bun.com/blog/bun-in-rust. The Bun cell is
> "1 implementer, 2 **or more** adversarial reviewers per implementer" where reviewers get **only
> the diff** and are told to assume the code is wrong. Ideas 01/02/03/04 shipped the cell, the
> seal, the input asymmetry, and the routing; this card closes the four gaps the forensics proved
> are still open. Evidence base (from the audited transcripts, not inference):
>
> - Both real branch-audit findings of the idea-03 campaign (stale evals 10–12; flaky eval 16)
>   were each caught by **exactly one** reviewer of the pair; 6 of 7 per-task reviewers converged
>   on the same trivial nit — a 1-in-2 detection rate per defect under correlated review.
> - Every finding that earned its cost came from a reviewer that **executed** something (ran
>   eval 16 live and walked run artifacts; built a differential tree). Read-only reviewers
>   converged on nits. The blog's three showcase bugs are all runtime bugs.
> - The cold lens self-disclosed contamination: the tribe's spec/plan/state files ride inside
>   every full-range diff, handing the cold reviewer the contract (idea-03 audit R6, on record
>   as a Shaman-accepted unfunded follow-up).
> - Skinner pairs executed the 6 tripwire suites 50 times for identical green results — script
>   work billed at reviewer prices, crowding out judgment (~48% of session cost was audit).

**Measurable goal:** on the next implementation campaign, (a) zero cold-lens contamination
incidents (no contract document reachable from the cold brief's diff range); (b) at least one
finding per campaign originates from the cold **executor**'s run artifacts (command output cited
in the finding); (c) reviewer briefs no longer mandate full-suite re-runs — the pre-gate report
carries them, and total tripwire executions per audit round drop from ~2 full sweeps to ≤1
script-run; (d) the disposition ledger shows per-reviewer yield columns filled for every round.

**Scope fence:** `plugins/tribe/agents/warchief.md` step 6 (Laws 1–4, dispatch-content
checklist, routing), `plugins/tribe/agents/skinner.md` lens-mode section, one new script under
`plugins/tribe/scripts/` (the pre-gate), the disposition-ledger template, and their tripwire
suites + evals. Nothing under step 5, no hunter.md changes, no eval-runner changes.

## The four tasks

### T1 — Path-scope the cold lens's diff (funds the accepted idea-03 follow-up)
Step 6 forbids the contract in the cold BRIEF but not in the diff RANGE. New law: the cold
lens's diff is path-scoped to **operative code**, excluding `docs/tribe/planning/**`,
`docs/tribe/state/**`, and any committed contract document; commit messages stay banned. The
CONTAMINATED refusal extends to a cold dispatch whose diff range violates the path scope.
Without this, every other cold-lens property is theater — lens B silently collapses into a
second contract lens.

### T2 — Split the cold lens by METHOD: a cold executor and a cold reader
Input asymmetry (idea 03) decorrelated what reviewers *see*; this decorrelates what they *do*.
The cell becomes **one contract lens + two cold reviewers** (the blog's "2 or more"):

- **B1 `lens: cold-executor`** — bare path-scoped diff; MUST run things: execute changed
  scripts/evals, mutate a guarded clause and confirm its tripwire trips, feed edge inputs.
  Findings must cite command output; a reading with no run behind it is not a B1 finding.
- **B2 `lens: cold-reader`** — bare path-scoped diff; static adversarial pass: internal
  contradictions, two-rules-that-cannot-both-be-true, evaluation order, idiom errors. Forbidden
  from running the suites (the pre-gate already did; see T3).

Both remain hypothesis-only (no `AUDIT:` line — Law 4 unchanged); Law 3's dispositions and
idea-04's confidence classes/routing absorb a third reporter without a new verdict holder:
`agreed` now means any two of the three lenses converged. Cold reviewers are the cheap seats
(no 80KB contract read), so the added cost is roughly one cheap agent per round for a second
independent sample of the distribution that actually finds defects.

### T3 — A mechanical pre-gate script runs BEFORE the cell
One bash script (`pre-gate.sh`, sibling of the tripwire suites) runs the full tripwire sweep,
trailer/convention checks, and the scope-fence file-list check, and writes a single report
(suite tallies + exit codes + the audited range). The contract lens's brief carries that report
as settled mechanical fact; reviewer briefs STOP mandating full-suite re-runs (a reviewer may
still re-run a specific suite to falsify a specific hypothesis). A red pre-gate short-circuits
the round: no Skinner is dispatched against a mechanically broken branch. LLM reviewers spend
tokens on judgment, not on re-proving green suites.

### T4 — Measure the reviewers: per-reviewer yield columns in the disposition ledger
The ledger (idea 05, extended by idea 04) gains per-round, per-reviewer columns: findings
raised, unique-to-this-reviewer, confirmed, refuted, out-of-scope. After two campaigns the
Shaman decides from data — not feel — whether B2 earns its seat, whether the contract lens
needs a partner, or whether 1+1 suffices. The next review-cell redesign is empirical.

## Dependencies & interactions

- Layered on shipped 01/02/03/04/05 — a delta, same shape as D3 ruled for idea 03.
- **Textual collision with idea 06** (CODEX admissibility clause lands in the same step-6
  brief-contents region per D9): never the same wave; this card goes FIRST (D23).
- **Before idea 10:** 10's findings-ledger/tripwire sink should build on T4's ledger columns,
  not race them.
- T2 amends idea-04's `agreed` definition (two-of-three) — the spec must name this as a
  deliberate supersession, per the D12/D18 "unnoticed interaction is a spec gap, fixed at the
  spec, in the open" doctrine.
- D14 applies: every new/changed assertion ships under the per-clause mutation bar.

## Decision authority

Warchief decides: script name/location, report format, exact path-scope glob list, brief
wording. Shaman decides: the two-of-three `agreed` supersession, any change to Law 4, any
change to the 3-round cap. Owner (already ruled, D23): this card is funded and jumps the
parked queue.

**Status:** spec + plan forged and committed (`spec.md`, `plan.md` in this directory; plan is
validate-plan.sh-passing, 5 tasks). An implementation Warchief starts at Method step 4
(isolate) — steps 2–3 are done; the spec and plan are settled law.
