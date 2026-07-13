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

## Scope fence (from the plan's Global Constraints)

Touch only: `plugins/tribe/agents/warchief.md` (step 6 only),
`plugins/tribe/scripts/tests/test-disagreement-routing.sh` (new),
`plugins/tribe/evals/evals.json`, this state file, and this card's own plan checkboxes.
**Auto-fail:** any edit to `plugins/tribe/agents/skinner.md` or `plugins/tribe/agents/hunter.md`.
