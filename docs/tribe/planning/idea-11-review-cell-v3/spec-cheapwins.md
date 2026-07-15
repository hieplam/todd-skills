# Spec addendum — idea-11 cheap-wins wave (Tasks 2, 3a, 3b, 4, evals 1-3)

> This is a WAVE-SCOPED spec, not a replacement for `spec.md`. `spec.md` (Deltas A-D) and
> `RESCOPE.md` (per-piece verdict table) are settled law and are not re-litigated here — this
> document narrows them to exactly what this wave builds, grounds each delta in the CURRENT
> (2-lens, advisory-adjudication) text of `warchief.md`/`skinner.md` at base commit `f6a591d`, and
> states the wave's own evidence plan for a TRUNCATED delivery (no PR/CI/merge this dispatch —
> Warchief dispatch constraint 2). Task 3c (three-lens expansion) and eval 4 are explicitly OUT for
> this wave (owner Decision 1) — nothing below builds them.

## What this wave builds (exactly)

| Task | Delta | Grounded against |
|---|---|---|
| 2 | Delta-C, script half only | N/A — new stateless script, lens-count independent |
| 3a | Delta-A, warchief half | `warchief.md:461-499` (Law 1, Skinner B / cold-brief rules, forbidden-channel table) |
| 3b | Delta-C, law half | `warchief.md:446-460` (step 6 preamble, before Law 1) + Law 3's DEBT rule (`warchief.md:537-540`) |
| 4 | Delta-D | `warchief.md:879-888` ("Recording it" ledger subsection, `class`/`routed` columns already shipped by idea 04) |
| 5 (evals 1-3) | spec.md's 4 evals, minus #4 | `plugins/tribe/evals/evals.json` (currently 20 cases, max id 20) |

Explicitly **not** built this wave: Delta-B (the three-lens Law 1 rewrite, two-of-three `agreed`,
rung-2 free majority), F16's fix, eval 4. All four remain exactly as `RESCOPE.md` describes them:
ratified, deferred, sequenced after this wave ships and one data campaign runs.

## Why the old plan.md's Task 3 cannot be applied as-is

`plan.md`'s Task 3 (lines 407-582, as committed) targets warchief.md step-6 text that assumed the
three-lens rewrite happens in the SAME task as the path-scope and pre-gate laws. The text it diffs
against (`two tool uses in the same message`, `Skinner B — lens: cold` as a single seat) is exactly
what Delta-B would rewrite — but Delta-B is deferred. Applying that task's Step-2 edit verbatim
would build the forbidden three-lens cell. This wave instead makes two independent, narrower edits
to the SAME warchief.md region: 3a adds path-scoping to the EXISTING two-lens Law 1 (Skinner B
stays a single cold seat, `lens: cold`, per the CURRENT shipped text); 3b adds a step-6.0 preamble
before Law 1. Neither touches the "two lenses, two briefs, one message" sentence itself.

## Task 2 — `pre-gate.sh` (unchanged from `plan.md` Task 2)

No design changes. `plan.md:211-406` (script body, self-test suite section) is reused verbatim —
it is orthogonal to lens count, per `RESCOPE.md`'s own verdict ("Script mechanics are orthogonal to
lens count and to verdict-vs-advisory"). Appended as a new section of the ALREADY-EXISTING
`plugins/tribe/scripts/tests/test-review-cell-v3.sh` (20 assertions currently, from shipped Task 1).

## Task 3a — path-scoped cold diff (warchief half only)

Add to `warchief.md`'s Skinner B paragraph (`warchief.md:478-499`) and its forbidden-channel table:
the diff handed to the cold lens is path-scoped to operative code, exclusion list at minimum
`docs/tribe/planning/`, `docs/tribe/state/`, and any committed contract document for the card under
audit; new forbidden-channel table row for an un-scoped full-range diff; the contract lens's diff
stays full-range (state this explicitly — it is already true in practice but not yet said).
Reuses skinner.md's existing `AUDIT: FAIL — CONTAMINATED` mechanism (already shipped, Task 1) — no
skinner.md edit needed this task (skinner.md's path-scope contamination rule already exists at
`skinner.md`'s cold-lens section, shipped by Task 1; this task is the WARCHIEF-side law that
actually builds the path-scoped diff before dispatch, per `RESCOPE.md`'s Task 3a reasoning: "that
refusal only fires if the Warchief actually hands the cold lens a contaminated diff/range in the
first place").

## Task 3b — the pre-gate step-6.0 law

New preamble in `warchief.md` step 6, before Law 1 (after the "final whole-branch audit is the
bias check" paragraph, `warchief.md:453-459`): run `pre-gate.sh` against the range under audit
before dispatching any Skinner; a red pre-gate is the Hunter's unfinished work, not an audit round
— route to a fixer, no Skinner dispatched, no fix round consumed; on green, the contract lens's
brief carries the pre-gate report as settled mechanical fact, the cold lens's brief does not;
reviewer briefs stop mandating full-suite re-runs (the contract lens may still re-run a specific
suite to falsify a hypothesis; unchanged for the cold lens, which already runs no suite of its own
initiative under the shipped law).

**Reconciliation with Law 3's DEBT rule (`warchief.md:537-540`, "DEBT is FORBIDDEN for: any
Critical finding... any failing-proof finding"):** these are compatible, not in tension —
`RESCOPE.md`'s Task 3b section already worked this out. A red pre-gate is caught and routed to a
fixer **before any Skinner is dispatched, so it never becomes a Skinner finding at all** — there is
no Critical/DEBT question to resolve because no audit round (and no disposition ledger row) exists
yet for it. The DEBT-forbidden rule governs findings a Skinner actually raises; the pre-gate
preempts that path entirely for the mechanical, deterministic subset (suite tallies, trailer
hygiene) it checks. Nothing in Law 3 needs to change.

## Task 4 — ledger `lens` column + `## Reviewer yield` table

Add a `lens` column to the EXISTING ledger table at `warchief.md:884-888` (which already carries
`class`/`routed`, shipped independently by idea 04) — third column, values `contract` / `cold-exec`
/ `cold-read`, comma-joined when more than one lens raised a finding, filled by the Warchief when
the row is first written. Append the `## Reviewer yield` table description to the "Recording it"
subsection: one row per lens, columns `raised / unique / confirmed / refuted / out-of-scope`,
derived entirely from the ledger, non-authoritative, never used for resume.

**`cold-read` is expected to show zero dispatches in the yield table until/unless Task 3c ships**
(only `contract` and `cold-exec` are actually dispatched by the current 2-lens Law 1) — this is
disclosed as the correct, honest state of the data, not a bug (`RESCOPE.md` Task 4 verdict).

## Task 5 — evals 1, 2, 3 (eval 4 explicitly not built this wave)

Ids 21 (`cold-executor-cites-the-run-that-manifests-the-defect`), 22
(`cold-reader-finds-the-contradiction-without-running-suites`) — unchanged content from `spec.md`,
runnable now (pure `skinner.md` behavior, already shipped by Task 1). Id 23
(`warchief-refuses-the-contract-bearing-cold-range`) — unchanged content, now runnable because
Task 3a (this wave) ships the warchief-side law it tests. All three are authored AND executed this
wave (D-owner-2). Eval 4 (cold+cold convergence) is not authored this wave — it depends on Task 3c
ever shipping a second cold lens dispatch, which is out of scope.

## Evidence plan (truncated delivery — no PR this dispatch)

BEFORE: fresh baseline captured at `f6a591d` (recorded in the report file) — all 8 suites green,
20 evals. AFTER: all suites green at their (task-2/3a/3b/4-extended) counts, evals 21/22/23
executed and passing, D14 per-clause mutation transcript for every new assertion, all task commits
on `feat/advisory-skinner-review-cell` with `Tribe-Card`/`Tribe-Task` trailers. No PR is opened;
the owner reviews this branch as one unit with the advisory-law rewrite (dispatch constraint 2).

## Scope fence (unchanged from `card.md`)

Exactly: `plugins/tribe/agents/warchief.md` (step 6 preamble + the enumerated edits above —
NOT a Law-1 rewrite), `plugins/tribe/scripts/pre-gate.sh` (new), the ledger template inside
warchief.md, `plugins/tribe/scripts/tests/test-review-cell-v3.sh`, `plugins/tribe/evals/evals.json`.
No `skinner.md` edits this wave (its path-scope rule and sub-lenses already shipped by Task 1). No
`hunter.md`, no step 5, no eval-runner changes, no touching F16 or the "other reviewer" singular
language (that is Task 3c's precondition, out of scope here).
