# tribe-state: idea-04-disagreement-routing
roadmap: bun-rust-migrate-ideas.md
worktree: /Users/todd.lam/WORK/_TestScripts/todd-skills-worktrees/impl-idea-04
branch: feat/idea-04-disagreement-routing
report: /private/tmp/claude-503/-Users-todd-lam-WORK--TestScripts-todd-skills/84a1f98b-a3c1-4a06-a79a-4db91db65822/scratchpad/campaign/reports/impl-idea-04.md
base-sha: d21724cc0c032cb7fb8ef3bc9e48c269e5a7bc4c
plan: docs/tribe/planning/idea-04-disagreement-routing/plan.md

## Milestones
- [x] spec committed (on master, planning campaign)
- [x] plan committed (on master, planning campaign — validate-plan.sh PASS, 5 tasks)
- [ ] wave 1 integrated (tasks 1-5; single wave, single worktree)

## Campaign type

IMPLEMENTATION. The spec and plan are settled law, already on master. This campaign applies the
prompt edits the plan describes: Warchief step 6 gains the confidence classes, the routing table,
the conflict ladder and the two ledger columns; a new mechanical conformance suite; four evals.

## Rulings in force (D12a — recorded BEFORE the work they authorize)

- **D12a** (standing): a ruling is an ARTIFACT, not a claim — it lands here before dispatch.
- **D14** (standing): per-clause mutation is the acceptance bar for every tripwire assertion.
  Task 5's negative guards are each proven to bite by injecting the forbidden clause (the plan
  scripts exactly that), never by a whole-file revert. Tasks 1-4's positive assertions are proven
  red→green by the TDD order the plan mandates: assertions written and RUN before the prompt edit
  exists.
- **AG-3** (informational): the card's "run a third review round" rung is bounded by the plan's own
  one-tie-break-per-finding-key cap and its "a tie-break is not a fix round" accounting rule.

## Warchief composition rulings (this campaign)

The plan was authored against a step 6 that idea 03 has since superseded. Per the Shaman's dispatch
("compose with the CURRENT law the way 03 composed with 01 — deliberate supersession, never silent
deletion"), these are ruled BEFORE task 1 dispatches, so no Hunter guesses and no NEEDS_CONTEXT
round is spent on them:

- **W1 — Insertion anchor.** The plan says "immediately after idea 01's merge law … and before idea
  05's fixer-brief template". On current master that range resolves unambiguously: the new blocks go
  **immediately before the paragraph beginning `**The fixer brief — a finding is a hypothesis, not an
  order.**`** — i.e. after Law 3 / Law 4 / the round-pass criteria / the 3-round cap / the
  adjudication paragraph, and after idea 02's dispatch-content checklist, which stays contiguous.
  Both plan anchors are satisfied; nothing existing is deleted, reworded or reordered.
- **W2 — Tag supersession is bridged, not assumed.** The plan's prose assumes idea 01's two-valued
  tag (`[both]` / `[one]`). Idea 03 superseded it with a three-valued tag (`[both]` /
  `[contract-only]` / `[cold-only]`), whose table already carries a "Maps onto idea 01's tag"
  column. The plan's class definitions hold verbatim and land verbatim — plus **one added mapping
  sentence** in the class block, the deliberate-supersession bridge the spec's §7 idea-03 section
  itself mandates (spec:439-450, 498-503):

  > **Mapping from Law 3's tags.** `[both]` → `agreed`. `[contract-only]` and `[cold-only]` →
  > `single` — *including* the case where the contract lens PASSed and the cold lens flagged a line:
  > A was **silent** there, and silence is not dissent (Rule A). A pair becomes `conflicting` only
  > when both lenses flagged the **same location** with **mutually unsatisfiable** remedies (Rule B).

  Additive prompt text, inside the plan's own file fence (`warchief.md`, step 6 only). It changes no
  plan assertion and is what lets the card compose with shipped law instead of the law the plan was
  written against.
- **W3 — Law 4's escalation wording (follow-up F12) is NOT this campaign's to fix.** Out of fence.
- **W4 — D14 mutation sweep over EVERY assertion in the new suite (authorizes task 5).** Task 1's
  RED run surfaced that the plan's `class token: single` assertion (regex `` `?single`? ``) was
  ALREADY green before the prompt edit existed: idea 05's shipped fixer-brief text uses the word
  `single` for its confidence-class field. The assertion therefore passes even if the `single` class
  row is deleted — which is precisely the failure D14 exists to catch ("delete only the guarded
  clause, prove that assertion goes red"). A tripwire that cannot go red is decoration.
  **Ruling:** task 5 runs a per-clause mutation sweep over EVERY assertion in
  `test-disagreement-routing.sh` (positive and negative), and any assertion that does not go red
  when its own guarded clause alone is deleted is TIGHTENED until it does — anchoring to the table
  row rather than the bare token. This is a strengthening of the plan's tests in service of the
  plan's own stated intent (spec §4: "greps the prompt text for the invariants a careless future
  edit would silently delete"); it weakens no assertion and adds no scope beyond the plan's own
  test file.

- **W5 — the assertion-quality bar, applied at birth to every task (supersedes the plan's literal
  regex strings, never its assertions).** Three audit rounds on task 1 established that the plan's
  grep regexes are illustrative, not load-bearing: they are line-based phrase greps, and the repo's
  own sibling suite (`test-dual-skinner-cell.sh:15-17`) already documents why that is wrong —
  *"Agent prompts are hard-wrapped prose, so a sentence routinely straddles a newline. grep is
  line-based and would miss it. Flatten every haystack."* **What is settled law is each assertion's
  NAME and the invariant it guards; the regex is the How, and the How is mine.** Every assertion in
  `test-disagreement-routing.sh`, in every task, must meet all three bars:
  1. **Flattened haystack.** Match against a whitespace-flattened region (the sibling suite's `flat()`
     convention), so a benign markdown reflow cannot produce a false failure.
  2. **Per-clause anchoring (D14/W4).** Deleting ONLY the clause the assertion names must turn that
     assertion — and only that assertion — red. A phrase restated elsewhere in step 6 must not hold
     it green.
  3. **Conjunct completeness.** If the assertion's name makes a compound claim ("is `single`, never
     `conflicting`"), the regex must check every conjunct. An alternation that passes on either half
     alone does not guard the claim its name makes.
  Both mutation classes (clause-deletion AND benign reflow) are run for every assertion before a task
  is called done. This is why tasks 2-5's briefs carry the bar up front instead of discovering it in
  an audit loop.

## D15 (2026-07-13 · Shaman ruling — RESOLVES the escalation below)

**Option (a) GRANTED — one bounded extension round.** The cap's *rationale* governs its
interpretation, but the cap's *text* governs the Warchief's authority — stopping to ask was correct.
The loop is convergent (strictly-decreasing severity, contract lens PASS twice running, zero
re-raised findings), not grinding. Authorized, in order:

1. Apply the pre-designed **F7** fix (word-order anchors, `Rule A .{1,3} silence is not dissent`
   class). **D14's per-clause mutation bar still applies.**
2. A fresh **round-5** audit pair.
3. If round 5 fails: escalate immediately. No second ask, no improvisation.

**(b) REJECTED on the record** — a Warchief waiving a Confirmed cold-only Important is the exact hole
Law 4 exists to close. Not precedent, not even under time pressure.

**(c) ACCEPTED as a follow-up card candidate**, bundled with F12: redefine the cap to count
*re-raised* findings (a grinding detector, not a round counter) and make Law 4's escalation wording
verdict-neutral. A law change gets its own spec, plan and audit. **Do not touch `warchief.md`'s cap
text in this card.**

W1/W2/W4/W5 approved as sound How-level calls. **W5 is to be baked into tasks 2-5's Hunter briefs.**

## RESOLVED by D15 — the escalation that prompted it (2026-07-13)

**Task 1 is code-complete and green; its audit loop hit the 3-round fix cap with one Confirmed
`[cold-only]` Important (F7) outstanding.** State for a resuming Warchief:

- Branch `feat/idea-04-disagreement-routing` @ `e1b55e6`, tree clean. Suite 8/8 green; all 6 neighbour
  suites green (175 assertions). `skinner.md` / `hunter.md` untouched.
- Fix rounds spent: **3 of 3**. F1-F6 all routed, all FIXED, none ever re-raised (the loop converged:
  Critical → Critical → Important → Important; the contract lens has PASSed in rounds 3 and 4).
- **F7** (cold-only, Important, Confirmed): the Rule A / Rule B assertions anchor on the whole sentence
  being wrapped in ONE bold span, so a meaning-preserving re-bolding (`**Rule A** — silence is not
  dissent.`) would redden them. Pre-designed fix, one line each: drop the `\*\*…\*\*` requirement and
  anchor on word order (`Rule A .{1,3} silence is not dissent`), which stays unique to the clause — W2's
  restatement puts "(Rule A)" *after* the phrase — so D14 per-clause anchoring survives while bold
  relocation no longer breaks it.
- Tasks 2-5 are NOT started. Their briefs must carry **W5** up front so assertions are born at the bar
  rather than discovered at it.

## W6 — the `agreed` / `NOT_REPRODUCED` supersession must be EXPLICIT (authorizes task 2's fix round)

Task 2's audit surfaced a genuine composition seam, found by the cold lens alone (the contract lens's
neighbour-consistency check was a `grep` for "reproduce-first" and passed it):

- The plan's mandated text (spec §2.2, quoted verbatim from idea-05's own request) says: a fixer's
  `NOT_REPRODUCED` on an **`agreed`** finding *"escalates to you **immediately** for adjudication,
  rather than waiting for the next audit round to settle it."*
- Idea 05's **shipped** neighbouring rule ("Adjudicate the ledger after each re-audit") says the
  opposite sequence for the same trigger: a `NOT_REPRODUCED` is settled by the NEXT re-audit — the
  finding either **falls** (not re-raised), **stands** (re-raised with new evidence), or **standoff**
  (re-raised unchanged → `NEEDS_DIRECTION`).

Both are law. As written, a Warchief holding a `NOT_REPRODUCED` on an `agreed` finding meets two rules
and must improvise — **which is the exact defect this entire card exists to abolish.** Shipping the
card with that seam open would be self-refuting.

**Ruling:** the plan's text stays **verbatim** (it is spec-quoted, settled law, and its intent is a
deliberate *specialization*, not an accident). What is missing is the supersession being **said out
loud**, per the Shaman's dispatch — *"deliberate supersession, never silent deletion."* Task 2's fix
round adds ONE additive clause making the specialization explicit and its boundary sharp: for an
`agreed` finding the immediate-adjudication path governs and the ledger-adjudication rule below does
not wait for a re-audit; for `single` findings the ledger-adjudication rule governs **unchanged**.
A mechanical assertion guards the disambiguation, so a later editor cannot silently reopen the seam.

Additive only, inside the card's own file fence (`warchief.md` step 6). D15 holds: the 3-round-cap
text is not touched.

## W7 — "do not pre-filter" vs Law 3's dispositions: the boundary must be explicit (authorizes task 2's 2nd fix round)

Second composition seam, again found by the cold lens alone (F9):

- The routing table's **`single`** row says the finding *"goes into the fixer's brief… **do not
  pre-filter** what you have no evidence about."* Under idea 03's tags, `[cold-only]` → `single`.
- Idea 03's **shipped Law 3** says every `[cold-only]` Critical/Important gets a Warchief disposition
  BEFORE any fixer is dispatched: **Confirmed** (→ fixer), **Refuted** (→ does not block, never
  reaches the fixer), **Valid but out of scope** (→ Shaman follow-up, never reaches the fixer).

Read literally, Law 3 tells the Warchief to filter and the routing table tells it not to. **They are in
fact compatible — but only under a reading the text never states**, and an unstated reconciliation is
exactly the improvised merge this card abolishes.

**Ruling:** the two rules are complementary and the text must say so. The operative words in the plan's
own sentence are *"what you have **no evidence** about"* — Law 3's dispositions are **evidence-backed**
(a *Refuted* requires positive evidence the code is correct; *out of scope* requires the defect to lie
outside the fence). So: **Law 3's three dispositions are the ONLY permitted pre-filter, and each is an
evidence-bearing act. What "do not pre-filter" forbids is the evidence-FREE drop** — discarding a
finding because you doubt it, with nothing to show. Anything you can neither Refute with evidence nor
place outside the fence goes to the fixer. Task 2's fix round adds this boundary additively, with a
mechanical guard. The plan's own sentence stays verbatim.

## F10 — the `conflicting` row's forward reference (dispositioned: valid, out of THIS task's scope)

The cold lens correctly observed that at commit `fc5f933` the `conflicting` row says *"Walk the conflict
ladder below"* and **no ladder exists in the file**. True at that commit — and it is the plan's own
sequencing: **task 3 builds the ladder.** Dispositioned **valid but out of scope for task 2**; it is not
a defect of the branch, only of a mid-plan commit. **Carried forward as a REQUIREMENT of the final
whole-branch audit: no dangling forward references may survive to the PR.**

## W8 — W7's own clause over-reached; scope it to `[cold-only]` (authorizes task 2's 3rd fix round)

W7's fix introduced a defect of its own — caught, and this is the card eating its own cooking, by BOTH
lenses at the same location: the contract lens filed it as a **Minor nit** ("phrased more broadly than
Law 3 itself"), the cold lens filed it as **Critical**. Two independent samples, one spot, same claim
direction → class **`agreed`** → **severity raised to Critical by default**, exactly as this card's own
routing table prescribes. The table adjudicated its own author.

**The defect (F11):** W7's clause says Law 3's three dispositions are the ONLY permitted pre-filter on a
**`single`** finding. But `single` = `[contract-only]` ∪ `[cold-only]` (the mapping paragraph), while
Law 3's dispositions are scoped **only to `[cold-only]`**. Read literally, the clause licenses the
Warchief to *Refute* or out-of-scope a **`[contract-only]` Critical** finding — one that is *"carried by
the authoritative verdict"* — which collides head-on with Law 4 (*"only the contract lens holds a
verdict"*). And `[contract-only]` singles are the ORDINARY case, not an edge case.

**Ruling:** scope the clause to the findings Law 3 actually governs. A `[cold-only]` finding is a
hypothesis and gets one of Law 3's three evidence-bearing dispositions. A **`[contract-only]` finding is
not a hypothesis at all** — it is carried by the contract lens's authoritative verdict, is **never
pre-filtered by the Warchief**, and goes to the fixer. Additive; the plan's row and Law 3 stay verbatim.

**F12b (Important, cold-only):** the W7 guard assertion bridges two phrases with a `.{0,250}` span that
is already 200/250 consumed — a legal, meaning-preserving rewording of the prose *between* them reddens
it (proven by mutation). That is a W5 bar-1 violation (a test that fails when it should not). Fix: split
into short assertions anchored on phrases unique to the clause, with no long bridging spans.

## D16 (2026-07-13 · Shaman ruling — RESOLVES the escalation below)

**F13 — option (a) RATIFIED. This is now law for this card.** "The Warchief adjudicates an `agreed`
finding's `NOT_REPRODUCED`, immediately" means: **weigh the fixer's falsification artifact against the two
reviewers' reports and record exactly ONE of:**

- **UPHELD** — the artifact defeats the finding → `DROPPED (falsified)`, **no fixer round**;
- **REJECTED** — the artifact does not cover the reviewers' stated condition → back to the fixer with that
  condition **named**; an ordinary fix round;
- **ESCALATED** — cannot tell from the artifact → `NEEDS_DIRECTION` to the Shaman.

**It is a REVIEW act: it consumes NO fix round.** Rationale on record: mirrors the shipped ledger
trichotomy; faithful to idea-05's "don't wait for the next audit round"; (b) would flood the most expensive
path with the system's highest-confidence class; (c) would silently discard a sister card's stated
requirement.

**CROSS-CARD EDIT: APPROVED.** The one-clause carve-out pointer inside idea-05's shipped
ledger-adjudication rule is granted under D12's logic — *an unnoticed interaction is a spec gap; a pointer
that changes no duties is composition, not scope creep.* **Quote D16 in that commit message.** This is the
ONLY non-additive edit authorized in this campaign; everything else stays additive.

**F14: approved as ordinary work** (rung-1-settled; the W5/D14 bars still apply).

**EXTENSION:** one bounded round to land F13's definition + F14 + the carve-out pointer, then a fresh
round-5 pair. If that fails, escalate — no second ask.

**BUDGET:** continuation approved; no de-scope (owner's directive is all cards shipped).

## RESOLVED by D16 — the escalation that prompted it (task 2, 2026-07-13)

Task 2's audit spent its 3 fix rounds (F8 → F9 → F11+F12b) and round 4 does not pass. **The two lenses
conflicted head-on** — the `conflicting` case this very card exists to route:

- **Contract lens A: FAIL.** Three assertions are *fragile*: a legal, meaning-preserving reword overflows
  their `.{0,N}` bridges and reddens them (proven by mutation — e.g. inserting ", with no exceptions,"
  overflows a 20-char bridge).
- **Cold lens B:** explicitly **refuted** that same hypothesis ("measured actual gap consumption vs budget
  … all have comfortable headroom … Refuted") — and raised a different Critical instead.

**Rung 1 of this card's own ladder resolves the conflict by CITATION, not taste.** W5 bar 1 (this state
file) says an assertion must not break on a legal rewording. A demonstrated a legal rewording that breaks
one. B measured only *current* consumption (2/20 chars), which is not the same question. **A's finding
stands; B's refutation is off-target.** No tie-break Skinner needed — the contract settled it. Recorded as
a live demonstration of rung 1 working exactly as specced.

### The genuine spec ambiguity (F13) — this is what the cap caught, and it is NOT mine to settle

Cold lens B, Critical: the `agreed`/`NOT_REPRODUCED` clause says the finding *"escalates to you immediately
for adjudication"* — and **nothing anywhere defines what that adjudication DOES.** Every sibling escalation
in step 6 names a concrete action (standoff → `NEEDS_DIRECTION` carrying the report verbatim + the
falsification artifact; plan-vs-card conflict → `NEEDS_DIRECTION` immediately; CONTAMINATED → fix the
dispatch, re-dispatch, does not consume a fix round). This one names none: no output, no evidence bar, no
stated effect on the fix-round cap. B found at least three readings that survive, and could not refute any.

**Neither idea-04's spec nor idea-05's defines it.** The contract is underdetermined at exactly the spot
this card's own rung 3 describes: *"a question no experiment can settle is not a code question."*

Secondary, and fixable as ordinary work: idea-05's ledger-adjudication rule's own body still says *"For each
finding the fixer returned as `NOT_REPRODUCED`, exactly one of these three applies"* with **no exclusion for
`agreed`** — the carve-out lives only in a paragraph 30 lines earlier that the rule never acknowledges. A
reader arriving at the rule has no signal it does not apply to them.

## D17 (2026-07-13 · Shaman ruling — RESOLVES the escalation below). W5 BAR 1 IS NOW BOUNDED.

**RATIFIED. W5 bar 1 is replaced by this bounded form — it supersedes the old absolute wording everywhere
it appears, and it is the bar every Skinner brief from here on must be given:**

> An assertion must survive **(i)** whitespace reflow, **(ii)** bold-marker relocation, and **(iii)**
> insertion of **up to 30 characters** of clarifying text at any single bridge point — i.e. every `.{0,N}`
> bridge keeps **≥30 characters of headroom** over the text's current consumption, and no invariant is
> matched as one contiguous literal spanning more than a single clause.
> **Unbounded paraphrase is explicitly OUT OF SCOPE for a grep-based conformance suite.**

Rationale on record: an unbounded robustness bar is **unsatisfiable by construction** — reviewer A can
always escalate verbosity, reviewer B can always call it implausible, and both are right forever. Rounds 4
and 5 of task 2 were one single fault: the ratified bar, not the fixes. Refusing to quietly self-amend a
ratified bar mid-cap was correct and is this card's own thesis — **the goalpost move had to happen in the
open, at the layer that owns the goalposts.**

**PROCEED:** one fix round applying the bound to the 5 flagged assertions → a fresh pair audits **against
the BOUNDED bar** (D17 goes verbatim into both briefs' contract context) → on PASS, tasks 3-5 → PR.

**FOLLOW-UP FILED** (bundled with D15's (c)+F12 card): a cap that fires on **two consecutive head-on lens
conflicts on the same axis** — an unmeetable-bar detector — instead of counting rounds. Both cap-hits in
this campaign were non-terminating bars, not grinding fixers.

## RESOLVED by D17 — the escalation that prompted it (task 2, round 5)

Round 5 produced the **same head-on lens conflict as round 4, on the same axis** — and that repetition is
the diagnosis:

- **A (contract lens): FAIL** — 5 assertions redden under a "legal, meaning-preserving reword" (it inserted
  `, with no exceptions,`, `meaning, still, that…`, and restated sentences at greater length).
- **B (cold lens): 0 hypotheses** — it *formed the identical fragility hypothesis and refuted it*: the breaks
  "required an artificially verbose rewrite well beyond what a plausible documentation edit would
  introduce"; realistic insertions all matched with 3-8x headroom.

**Both are right, because W5 bar 1 — MY OWN RULING — is unbounded and therefore unsatisfiable.** "An
assertion must not break on a legal rewording" admits no upper bound on the reword. **No grep over prose
survives arbitrary paraphrase.** So A can always escalate the verbosity and find a new break, and B can
always call that break implausible. The loop cannot terminate. Task 2 has now burned 4 fix rounds on an
acceptance bar that no artifact can ever satisfy.

This is exactly what this card says a `conflicting` finding MEANS: two independent samples pointing in
opposite directions is *the system reporting that the contract is underdetermined.* The contract at fault is
W5 bar 1. Walking the ladder: **rung 1** — no citation settles it, because the ambiguity IS in the cited
text. **Rung 2** — no mechanical oracle exists for "is this reword plausible?" **Rung 3** — escalate.

**Note what is NOT in dispute:** the card's actual deliverable — the prompt text — is clean under both
lenses. B traced four concrete inputs (`[cold-only]`+`single`, `[contract-only]`+`single`, `agreed`,
`conflicting`) end-to-end and found *exactly one procedure with a concrete named output at every step*. A
passed the prompt text on all 21 substantive rows. The dispute is **only** about the acceptance bar for the
test regexes.

**Proposed replacement for W5 bar 1 (bounded, mechanical, terminating):** an assertion must survive
(i) whitespace reflow, (ii) bold-marker relocation, and (iii) **insertion of up to 30 characters of
clarifying text at any single bridge point** — i.e. every `.{0,N}` bridge must retain **≥30 characters of
headroom** over the text's current consumption, and no guarded invariant may be matched as one contiguous
literal spanning more than a single clause. Mechanically checkable, and it terminates.

## W9 — rung 2's tie-break Skinner: "cold" collides with idea-03's reserved term (authorizes task 3's fix round)

The cold lens caught a genuine composition seam in task 3 (F15, Critical) that the contract lens passed:

- The plan's rung-2 text (authored **before** idea 03 shipped, when A and B were symmetric) says the
  tie-break Skinner "is dispatched **COLD**" and "receives *exactly* the brief A and B received — **the
  contract**, the diff, the repo's rules."
- But idea 03 made **"cold" a reserved term in this very file**: the cold lens gets **only the bare diff**,
  and the contract is explicitly on its *forbidden* list. And A and B never received the same brief — Law 1
  says their briefs are "deliberately **not identical**."

So rung 2, read literally, tells the Warchief to hand a **cold**-labelled reviewer exactly what the cold
brief forbids, and the itemization it gives is the **contract lens's** brief. An agent executing it cannot
satisfy both clauses. The plan's word "cold" meant *"not told a disagreement exists"*; idea 03 took that word
for something else.

**Ruling — supersede deliberately, and derive the right answer rather than patching the label:**

1. **Rung 2's question is never a conformance question.** Rung 2 is reached ONLY when rung 1 found no
   citation — i.e. the contract does not settle it. What remains is a pure correctness question ("does this
   leak? is it off by one? does this evaluation order fire early?"), which is **exactly the cold lens's job**.
   **Therefore the tie-break Skinner C is a genuine cold-lens sample: the bare diff, no contract.** The word
   "cold" now means what the file says it means, and it is *correct*, not merely relabelled.
2. **The property the plan actually cared about gets its own name: `disagreement-blind`.** C is never shown
   A's or B's reports, findings or verdicts, and is **never told a disagreement exists**. That is the
   invariant that makes C a third independent *sample* rather than an *arbiter*, and it must be prompt text
   and grep-guarded, separately from the lens question.
3. The rung-2 itemization ("the contract, the diff, the repo's rules") is **corrected** to the cold brief.
   This is a supersession of plan text by shipped law — stated out loud, never silent.

**F16 (Important, also cold-lens): the rung-2 branch set has a hole.** C is disagreement-blind, so nothing
stops C from raising findings in **both** disputed directions at the same location (it never knows the two
are mutually unsatisfiable — that recognition is Rule B's job, and C is never asked to make it). Then
"C flags it in A's direction" and "C flags it in B's direction" both fire and the ladder names no winner.
**Ruling:** a C report supporting **both** directions is **no majority** → **rung 3**, exactly like a third
direction or silence. Additive; makes the branch set exhaustive and mutually exclusive.

## W10 — the `routed` enum must be able to record every outcome the section can produce (authorizes task 4's fix round)

**Both lenses flagged the same location with the same claim → class `agreed` → Critical by default** (the
card's own routing table, applied to the card again). The `routed` column claims to be *the* enumerated set
of legal values, but the section's own rules produce outcomes it cannot express:

| Reachable outcome | Produced by | Value in the enum? |
| --- | --- | --- |
| `agreed` finding, fixer says `NOT_REPRODUCED`, Warchief adjudicates **UPHELD** → `DROPPED (falsified)` | **D16** (already landed) | **missing** |
| `single` finding falsified, Skinner does not re-raise → `DROPPED (falsified, round N)` | idea 05's shipped ledger rule | **missing** |
| **standoff** — reviewer re-raises unchanged against the fixer's artifact → `NEEDS_DIRECTION` | idea 05's shipped standoff rule | **missing** (and it is NOT `ESCALATED (spec ambiguity)` — a standoff is an *evidence* deadlock, not an ambiguous contract; mislabelling it would falsify the record) |
| `TIEBREAK` | **nothing** — the token appears exactly ONCE in the whole file, in the enum itself | listed but **undefined** |

**Rulings:**

1. **Extend the enum** (additively; the plan's five values stay verbatim) with: **`DROPPED (falsified)`**,
   **`DROPPED (falsified, round N)`**, and **`ESCALATED (standoff)`** — the last named distinctly from
   `ESCALATED (spec ambiguity)` precisely because the two escalations mean different things.
2. **Define `TIEBREAK` rather than delete it** (the plan put it there deliberately): it marks a finding whose
   **rung-2 tie-break is in flight** — a transient state that resolves to `TO_FIXER` (C sided with it),
   `DROPPED (tie-break, round N)` (C sided against it), or a rung-3 escalation (no majority). A listed value
   with no trigger is a trap; a named transient state is a ledger doing its job.
3. **Fix the timing claim (F19, Important).** "Filled by: you, **at merge**" is false for the falsified/standoff
   outcomes, which are written *after* the fixer returns — and the ledger is **append-only**, so a cell cannot
   be rewritten. **Resolution: the ledger already has a `round` column — so a row is per finding PER ROUND.**
   The Warchief fills `class` + `routed` when it writes that round's row; a later adjudication **appends a new
   row** for the same finding ID with the later round and the new `routed` value. It never overwrites, and the
   finding's history stays readable off the one document — which is the whole point spec §2.4 makes.

## W11 — the third ESCALATED outcome (a gap W10 itself created; authorizes task 4's 2nd fix round)

W10 extended the `routed` enum with **two** distinctly-triggered `ESCALATED` values — and the cold lens
promptly found that **D16 defines a THIRD escalation path with no home**:

- `ESCALATED (spec ambiguity)` — rung 3's outcome: no citation, no majority; the contract is underdetermined.
- `ESCALATED (standoff)` — idea 05's outcome: the Skinner **re-raises** a `NOT_REPRODUCED` finding unchanged.
- **D16's third outcome** — an `agreed` finding's `NOT_REPRODUCED`, adjudicated by the Warchief, where *"the
  artifact does not let you tell"* → `NEEDS_DIRECTION`. **No enum value fits**: no Skinner ever re-raised it
  (the `agreed` path resolves *before* the next re-audit, by D16's own design), so `ESCALATED (standoff)` is
  factually wrong; and no contract is ambiguous, so `ESCALATED (spec ambiguity)` is factually wrong too. W10's
  own disambiguation prose — *"conflating them would misstate the record"* — makes both workarounds illegal.

**This is W10's defect, not the Hunter's.** I sharpened two triggers and left a third outcome homeless. The
sharper the labels, the more visible the hole — which is the system working.

**Ruling:** add **`ESCALATED (inconclusive artifact)`** — D16's third outcome, triggered when the Warchief
adjudicates an `agreed` finding's `NOT_REPRODUCED` and the falsification artifact does not settle it either
way. Extend the disambiguation prose to name **all three** escalation triggers, and guard the three-way
distinction mechanically so a later editor cannot collapse them.

## W12 — `TIEBREAK` gets a WRITE-TIME, which is what makes the per-key cap crash-safe (task 4, fix round 3)

Both lenses landed on `TIEBREAK` again → class **`agreed`** → Critical. Two complementary claims:

- **A (contract lens):** `TIEBREAK`'s membership in the enum row has **no mechanical guard** — delete it from
  the row and the 87-assertion suite stays green. Every one of its 8 sibling values has a row-anchored
  assertion; this one's assertions point at the *prose* instead.
- **B (cold lens):** deeper — **no rule anywhere ever tells the Warchief to WRITE `TIEBREAK`.** Rung 2 reads
  as synchronous (dispatch C → apply majority → record the *final* outcome), so the in-flight state never
  gets persisted. A legal value that no rule produces is a trap.

W10 defined what `TIEBREAK` *means* and never said **when it is written**. B is right that as it stands the
value is unreachable.

**But deleting it is the wrong fix, and the spec says why.** Spec §2.3 requires the one-tie-break-per-finding-key
cap to survive a crash *"precisely because the count lives in a file rather than in the dead Warchief's head."*
**`TIEBREAK` IS that record** — it is the only thing that can tell a re-dispatched Warchief "this key already
spent its tie-break." Without a write, the cap is unenforceable across a crash and a resumed Warchief will
happily dispatch a second tie-break on the same key.

**Ruling — give `TIEBREAK` its write-time, in rung 2:**

1. **Before dispatching the tie-break Skinner C, the Warchief WRITES the finding's row with
   `routed: TIEBREAK`.** That write is what spends the key's one tie-break, and it lands *before* C is
   dispatched precisely so a crash mid-tie-break cannot lose the fact.
2. **When C returns, the outcome is APPENDED as a new row** (per W10's per-round append rule): `TO_FIXER`,
   `DROPPED (tie-break, round N)`, or a rung-3 escalation.
3. **A resumed Warchief that finds a `TIEBREAK` row for a finding key treats that key's tie-break as SPENT** —
   it goes straight to rung 3, never dispatching a second one. This is the per-key cap made crash-safe, which
   is what spec §2.3 asked for and never got.
4. Guard `TIEBREAK`'s presence **in the enum row** with a row-anchored assertion, like its 8 siblings (A's
   finding), and guard the write-time rule and the resume rule mechanically.

The idempotence sentence in the ledger prose ("a resumed Warchief re-runs the round and re-derives the same
classes") stays true and is not in conflict: **classes** are re-derivable from the diff; **how many tie-breaks
a key has already spent** is not — that is history, and history must be written down.

## D18 (2026-07-13 · Shaman ruling — RESOLVES F22 below)

**Option (a) RATIFIED.** The **authoritative** crash-safe record of *"this finding key has spent its
tie-break"* lives in the card's **STATE FILE** (`docs/tribe/state/CARD-SLUG.md`) — git-committed, and already
the tribe's one sanctioned resume artifact. The report-file ledger keeps its `TIEBREAK` row as the
**human-readable audit trail, explicitly non-authoritative**.

**This overrides spec §2.4's "No state-file change is needed"** — on the Shaman's authority and on the
record: that sentence was written before anyone noticed the shipped resume doctrine defines uncommitted state
as *never having happened* and forbids re-deriving progress from the report file. **Spec §2.3's actual
requirement — the cap survives a crash — is PRESERVED, and better served** than by §2.4's own mechanism,
which the traced failure shows granting rung-3 escalations for retries that never happened.

(b) rejected: narrowing another card's shipped doctrine widens the blast radius outside the fence for no gain
(a) doesn't already deliver. (c) rejected: silently discarding a spec requirement is never on the menu.

**The one binding requirement from the Shaman:** the state-file line must be **written and committed BEFORE
the tie-break Skinner is dispatched** — the same commit-before-act discipline as D12a, for the same reason.
Implementation detail is the Warchief's How.

## RESOLVED by D18 — the escalation that prompted it (task 4, round 4)

**F22 (Critical, cold-only, Confirmed).** The cold lens read the WHOLE file — not just step 6 — and found that
**W12's crash-safe tie-break cap is built on the one artifact the file forbids using for resume truth.**

- **W12 / spec §2.4** put the ledger (and so the `TIEBREAK`-spent record) in the **report file**, and spec §2.4
  says explicitly *"No state-file change is needed."* Spec §2.3 leans on it: the per-key cap survives a crash
  *"precisely because the count lives in a file rather than in the dead Warchief's head."*
- **`warchief.md`'s own shipped "Crash-safe state & resume" doctrine** (a section ~500 lines ABOVE step 6,
  from an earlier card, untouched by this campaign) says the opposite, twice:
  - *"anything uncommitted is **defined** as never having happened"* — and the report file lives in scratch
    (`/private/tmp/...`), is **not in the repo**, and is never git-committed mid-round;
  - *"**Never re-derive progress from prose, memory, or the report file** — the report file stays what it is:
    a liveness heartbeat."*

Concretely reachable failure the cold lens traced: a Warchief writes the `TIEBREAK` row, dispatches C, dies;
`resume-check.sh` returns `REVERT_AND_REDO`, the round's uncommitted work is discarded and by doctrine "never
happened" — **but the ledger still says the key's one tie-break is spent**, so the resumed Warchief must go
straight to rung 3 (escalate to a human) instead of ever retrying the mechanical oracle. Two in-force rules in
one file disagree about whether that state happened.

**Both readings are defensible and the contract is underdetermined → this card's own rung 3.** Cap for task 4
is spent (3 fix rounds: F18/F19 → F20 → F21). Escalating.

**Note:** the contract lens PASSed this round and explicitly traced the crash-safety as holding — because its
brief scoped it to step 6. Only the lens with no contract, reading the document as its actual reader would,
walked 500 lines up and found the collision. That is the input-asymmetry design (idea 03) paying for itself.

## D19 (2026-07-13 · Shaman ruling — RESOLVES F23; ship the honest law)

**Option (a) RATIFIED.** In-fence, the law states **only what is true**:

- the state-file record is **durable and authoritative**;
- **any Warchief ENTERING an audit round consults it first** — and the final whole-branch audit always runs,
  so a stranded `TIEBREAK` is resolved **before any merge**;
- **the claim that the resume protocol automatically returns a Warchief to a mid-flight rung 2 is DROPPED** —
  it is not true, and `resume-check.sh` is out of this card's fence (spec §3);
- the pre-dispatch commit carries **`Tribe-Milestone:`** (the trailer loose end the cold lens also caught).

**Safety analysis accepted and on the record:** the degraded failure mode is **one wasted REVIEW round, never a
wrong merge**. That asymmetry is why (a) is shippable.

(b) rejected: a card's worth of resume-machinery work, with its own blast radius on the tribe's single source of
resume truth, does not ride in on another card's PR. (c) rejected: law that lies is what this cluster exists to
prevent.

**FOLLOW-UP FILED:** *"teach `resume-check.sh` mid-audit state"* — pre-existing and cross-cutting (**no audit
round in the tribe is resumable today**), benefits every card. Bundled with the D15(c) + F12 + D17 family: the
resume/round-accounting machinery does not yet model the audit loop. Now the campaign's clearest next-roadmap
candidate.

## W13 — the "final whole-branch audit" backstop is ALSO false under crash. Say the whole truth. (task 4, last fix)

D19 ordered: *state only what is true.* The fix that landed swapped one false claim for another, and the cold
lens caught it (F25, Critical):

- The shipped text names the **final whole-branch audit** as the backstop that resolves a stranded `TIEBREAK`
  "before any merge".
- **But after all Hunter tasks are committed, `resume-check.sh`'s `next_action()` returns `RESUME_DELIVERY` (or
  `DISCARD_AND_RESUME_DELIVERY`) — and `warchief.md` defines BOTH as "re-enter step 7" (push / PR / CI / merge).
  There is no branch that re-enters step 6.** So a Warchief that dies *during the final whole-branch audit*
  resumes straight into delivery and **opens and merges the PR without ever finishing that audit.**

**This is not a tie-break problem. It is the same pre-existing hole as F23, and it is worse than we thought:
today, a crash mid-audit can produce an UNAUDITED MERGE.** Idea-04 did not create it and cannot fix it in-fence
(`resume-check.sh` is out of fence, spec §3 — already a filed follow-up card).

**Ruling — the law states the whole truth, and claims NO crash backstop:**

1. In the ordinary (no-crash) case the final whole-branch audit always runs, and a `TIEBREAK` row is resolved
   there. **Say that, and say it is the ordinary case only.**
2. **After a crash there is NO backstop.** The resume protocol does not route a Warchief back into any audit
   round — not rung 2, not the final whole-branch audit. **Do not claim otherwise. Do not hedge.** State the
   hazard plainly and point at the follow-up (`resume-check.sh` has no mid-audit state).
3. **Retire the "never a wrong merge" safety claim**, which the F25 trace disproves for the crash path. What
   survives is narrower and true: *in the absence of a crash*, the routing law is sound; *under a crash*, the
   tribe's resume machinery — not this card — is what fails.

**F26 (Important, cold-only): a crash-forced rung-3 trip has no distinct `routed` value.** Filing it under
`ESCALATED (spec ambiguity)` would misstate the record (no contract is ambiguous — the oracle simply never
ran), and W11's own rule says conflating escalation triggers is forbidden. **Ruling:** add
**`ESCALATED (oracle unavailable)`** — the tie-break was spent but its result never landed — and extend the
disambiguation prose to name all **four** triggers.

**This is the LAST fix round for task 4.** If the next pair still returns a Critical, escalate — do not grind.

## D20 (2026-07-14 · Shaman ruling — W14 RATIFIED; ends the escalation-enum whack-a-mole)

**`ESCALATED (<trigger>)` goes PARAMETRIC.** Two audit rounds each surfaced one more homeless escalation
trigger (W11's *inconclusive artifact*, W13's *oracle unavailable*, now *tie-break spent*) — that is the design
talking, and a fifth fixed enum value would only buy a sixth.

1. The `routed` escalation value is **`ESCALATED (<trigger>)`**, parametric — not a closed list.
2. **The recorded trigger must be the ACTUAL cause. Never substitute a near-miss** (the "conflating them
   misstates the record" rule, generalized).
3. The **currently known** triggers are named and the list is **explicitly OPEN**: *spec ambiguity*,
   *standoff*, *inconclusive artifact*, *oracle unavailable*, ***tie-break spent*** (the non-crash case: a
   conflict resurfaces on a key whose one tie-break is already spent). **Every new escalation rule must name
   its own trigger.**
4. **The suite guards the RULE mechanically, not the list** — so no new assertion is needed per value.

Plus, same round: the 4 zero-bridge regexes go to **D17's bar** (a bridge at the `because`/`means` joint,
≥30 chars headroom), per the convention already used a few lines above them in the same file.

## W15 — the state file must record the OUTCOME, not just the key (task 4, closing fix)

The cold lens found the flaw in D20's landing (F29, Critical), and it is exact:

- The **Bounds rule** says any Warchief — *fresh or resumed* — that finds a key under `## Tie-breaks spent`
  treats it as spent, goes to rung 3, and records **`ESCALATED (tie-break spent)`** — *"never a crash"*.
- The **crash paragraph** says a Warchief that died after the spend-commit, its oracle never having run,
  records **`ESCALATED (oracle unavailable)`**.

**Both fire on the same observable event.** The state file stores *"one finding key per line"* — **no outcome,
no status**. So the agent literally cannot tell "the tie-break ran and resolved" from "the tie-break was spent
but C's answer never landed." The Bounds rule hard-wires the first label, which makes `oracle unavailable`
**unreachable by any rule the document defines** — while D20's own law says *"the recorded trigger must be the
ACTUAL cause; never substitute a near-miss."* The document breaks its own rule two paragraphs after stating it.

**Ruling — make the record carry what the decision needs:**

1. The `## Tie-breaks spent` heading records **key + status**, not a bare key:
   - **`dispatched`** — written and committed **BEFORE** C is dispatched (D18's discipline, unchanged);
   - **`resolved`** — **appended and committed when C's outcome lands** (never overwriting; the ledger is
     append-only, so the later line supersedes by round).
2. **The two triggers become decidable from committed state alone:**
   - key present, latest status **`resolved`** → the oracle genuinely ran → **`ESCALATED (tie-break spent)`**;
   - key present, latest status **`dispatched`** (no `resolved` ever landed) → the Warchief died mid-oracle →
     **`ESCALATED (oracle unavailable)`**.
3. Both triggers are now reachable, mutually exclusive, and each is the **actual** cause — which is all D20
   ever asked for. State the exclusion **from both sides**, not just one.

In-fence: step-6 prose + the state-file format (which is this card's own). No spec override needed — this is
D20 implemented correctly.

## W16 — the finding-key match is a JUDGMENT, not a grep. Say so, and make the safe error the default. (task 4, final)

F30 (Critical, cold-only) — the last overstatement, and it is D19's principle again:

- The new text calls the `## Tie-breaks spent` lookup **"concrete, greppable"**, and the pre-existing finding-key
  definition claims the key is what makes termination *"mechanical instead of a judgment call"*.
- **But the finding key is free-text, LLM-authored prose** (`severity | location | one-line claim`), with no
  normalization, no hash, no canonical form, and **no script anywhere implements the lookup**. Two independent
  Skinner runs will not reproduce a one-line claim byte-for-byte across a commit boundary or a crash.
- So the cap's enforcement is a **Warchief judgment**, and the text promises a mechanism it does not have.
  Consequences: a paraphrase-drifted key → the cap silently fails and a **second tie-break is dispatched**
  (the "can never grind" claim broken); a coincidental match → a genuinely new finding is **wrongly forced to
  rung 3** without ever getting its own tie-break.

**Note what this is NOT:** the finding key and the per-key cap are **pre-existing** (idea 05 / spec §2.3), and
the key was never byte-stable. This card added the *persistence*, and with it the false claim of mechanism.

**Ruling — tell the truth and make the safe error the default:**

1. **Drop "greppable"/"mechanical" for this lookup.** State plainly: **matching a finding key across rounds is
   the Warchief's judgment** — the same recognition Law 3's merge already relies on — **not a string compare.**
2. **On doubt, treat the key as NOT spent.** The two errors are not symmetric: wrongly re-dispatching costs
   **one review round**; wrongly forcing rung 3 **burns a human ruling and denies the finding the mechanical
   oracle the ladder exists to give it.** The cheaper error is the default. Say so, with the reason.
3. Keep the cap as written for a key the Warchief **does** recognize — the bound still holds in the ordinary
   case, which is what it was for.
4. **Guard the honesty mechanically** (no "greppable"/"mechanical" claim for this lookup; the judgment
   statement; the on-doubt-not-spent default) so no future editor re-inflates the guarantee.

## W17 — bump idea-03's hardcoded eval count (task 5 collateral; minimal fence extension)

Task 5 adds this card's 4 evals (16 → 20), and `test-input-asymmetry.sh` (idea 03's suite) asserts a
**hardcoded `len(evals) == 16`**. It now fails — not because anything is wrong, but because **any card that
ever adds an eval must bump that number.**

The plan's DoD requires the neighbouring suites stay green, and the plan could not foresee this. **Ruling:**
bump the count `16 → 20` in `test-input-asymmetry.sh`. This is **arithmetic, not law** — no assertion's meaning
changes, no invariant is weakened, and the exact-count design that card chose is preserved. Minimal fence
extension, recorded here and disclosed in the PR.

**Follow-up noted (not fixed here):** an exact-count eval assertion is a tripwire that fires on every future
card. A `>=` bound, or an assertion on the *presence of specific eval ids*, would guard the same invariant
without breaking every neighbour. Bundle with the campaign's other follow-ups.

## W18 — rung 1 adjudicates the third A/B conflict, by citation (final branch audit)

The final branch pair conflicted head-on for the **third time**, on the same axis (assertion robustness):

- **A (contract lens): FAIL** — 8/9 sampled assertions redden under ≤30-char insertions.
- **B (cold lens): 0 hypotheses** — it formed the identical hypothesis, tested the bridges at 20/26/28/29/30
  chars, found them all surviving, and **refuted it**: the break required **34 chars**, past D17's bound.

**Rung 1 — the contract settles it. Citing D17 verbatim** (`docs/tribe/state/...`, ratified by the Shaman):

> "…insertion of up to 30 characters of clarifying text **at any single bridge point** — i.e. every `.{0,N}`
> bridge keeps ≥30 characters of headroom…, and no invariant is matched as one contiguous literal spanning
> **more than a single clause**."

Two things follow, and they split A's findings:

1. **Mid-clause insertion is NOT the D17 test.** A's mutations mostly inserted *inside* a single-clause literal
   ("raised to Critical **automatically** by default"). D17 bounds requirement (iii) to a **bridge point**, and
   explicitly permits a bare literal **within one clause**. Those findings **fall** — A over-applied the bar.
   (Two earlier contract lenses independently reached the same conclusion and refuted this same mutation as
   invalid; B refuted it this round too.)
2. **A bare literal spanning MORE THAN ONE clause is a genuine violation, and A found some.** Clearest:
   the ~119-char run *"Before dispatching C, … WRITE AND COMMIT …"* — two clauses, no joint bridge. **Those
   stand and get fixed.**

**Ruling:** fix ONLY the literals that genuinely span more than one clause — bridge at the clause joint,
≥30 chars headroom. Do not "fix" single-clause literals; doing so would chase the unbounded-paraphrase
standard D17 was ratified (D17/NEEDS_DIRECTION #3) to abolish, and would restart the non-terminating loop.

**No new Shaman ruling needed: rung 1 resolves by citing law the Shaman already ratified.** The ladder this
card ships has now settled all three lens conflicts in this campaign — every one by citation, never by taste,
and never by spending a tie-break round.

## Scope fence (from the plan's Global Constraints)

Touch only: `plugins/tribe/agents/warchief.md` (step 6 only),
`plugins/tribe/scripts/tests/test-disagreement-routing.sh` (new),
`plugins/tribe/evals/evals.json`, this state file, and this card's own plan checkboxes.
**Auto-fail:** any edit to `plugins/tribe/agents/skinner.md` or `plugins/tribe/agents/hunter.md`.
