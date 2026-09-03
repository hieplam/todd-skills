# The brief is the contract (dispatch standard)

## Rule

A brief handed to an implementer or an auditor must settle four things **before** dispatch.
Every one of them is cheap to write and expensive to omit — each has cost a real relaunch
cycle.

1. **Name the oracle.** For any parser, heuristic, matcher, or format-handling task, the brief
   states *what decides correctness*: the spec in the brief is the contract, and no external
   standard is. State which direction of error is a bug and which is by design — e.g.
   "under-checking is a bug, over-checking is by design; when in doubt, scan."
2. **Fence by intent, never by form.** Write the constraint that expresses the goal, not a
   proxy for it. "Every commit carries the trailers" — not "one commit". "The existing tests'
   assertions stay unchanged" — not "existing tests must not be modified".
3. **Quote the governing document verbatim, with its section number.** A standing constraint
   that paraphrases a plan is a *new* claim, and it will differ from the plan in some case the
   author did not foresee. Cite; do not restate.
4. **Carry the adjudication rule.** List, in the brief, which findings are REFUTED in advance
   and why — inherited defects, behaviour a scheduled task will reconcile, over-checks that
   the oracle declares by-design. An auditor applying "a single finding is CONFIRMED by
   default" is following the rules correctly; the brief is what tells it when not to.

A related sequencing rule follows from the same principle: **governance work belongs at the
end of each phase, not the end of the project.** Every code task leaves the architecture model
slightly stale; if reconciliation is deferred to the end, the *next* task's reviewer flags the
staleness as a finding and the cycle repeats. Schedule one reconciliation task per phase.

## Why

An implementer and an auditor who read the same brief must reach the same verdict, or the
delivery loop does not converge — it oscillates. Every one of the four omissions above
produces the same failure shape: a *correct* agent, following its instructions faithfully,
reports a finding the dispatcher then has to overturn by hand. That is not an agent defect. It
is an underspecified brief, and the cost lands as fix rounds, escalations, and relaunches.

Worked evidence, all from one extraction campaign:

- **Oracle unnamed** — a task stripping code spans before scanning for links was audited
  against CommonMark, which was never the contract. Three fix rounds, then a cap, then a
  ruling that should have been the brief's opening paragraph.
- **Fence by form** — "one commit" and "existing tests must remain unmodified" each produced
  a false finding against work that was correct; the plan had deliberately changed the
  behaviour those tests pinned.
- **Paraphrase** — a standing rule restating "byte-identical for the unmodified tree" inverted
  the plan's actual meaning (the oracle compares the *migrated* clone), so an auditor correctly
  flagged intended behaviour as a violation.
- **No adjudication rule** — findings for over-checks and for facts a scheduled task would
  reconcile were confirmed by default, and every one had to be escalated back out.

## Golden pattern

```markdown
## Oracle
The spec in this brief is the contract. CommonMark is NOT the oracle.
Under-check (misses a real case) = bug. Over-check (flags a safe case) = by design.

## Scope fence
- Every commit carries the three trailers.       # intent, not "one commit"
- The existing tests' ASSERTIONS stay unchanged.  # intent, not "don't touch tests"

## Governing constraints
plan-v3.md §6(e), quoted verbatim:
> "the oracle compares before (…) with after (the MIGRATED clone: …)"

## Adjudication rule
REFUTED in advance:
- an over-check permitted by the Oracle section above
- a stale architecture fact that card C3-2 is already scheduled to reconcile
- any defect inherited verbatim from the source repo (record as hardening, do not fix here)
```

## Not this

- A brief that names a task and a file and assumes the standard is obvious.
- A standing-constraints block written from memory of the plan rather than quoted from it.
- Leaving adjudication in the dispatcher's head, then overturning findings one at a time.
- Batching all governance reconciliation into a final task.

## Pragmatism — how reviewers grade it

- A brief for parser/heuristic/format work with no named oracle → **Blocker**. This is the one
  that reliably burns multiple rounds.
- A constraint written as form where intent was meant, when it demonstrably produced a false
  finding → **Should-fix**.
- A paraphrased governing rule → **Should-fix**; quoting costs one line.
- A missing adjudication section on a brief whose work touches inherited or scheduled-stale
  code → **Should-fix**. On genuinely greenfield work with no such surface → **Optional**.
- Phase-end governance sequencing → **Optional** on a single-phase effort; **Should-fix** on
  any plan with three or more phases.
