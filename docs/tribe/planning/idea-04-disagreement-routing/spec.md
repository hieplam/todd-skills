# Spec — Idea 04: disagreement routing ("two reviewers disagreeing is a measurement, not a malfunction")

**Card:** `idea-04-disagreement-routing`
**Status:** planning-only. This spec + its plan are the deliverable; a *future* implementation
campaign applies the prompt edits described here.
**Source:** `bun-rust-migrate-ideas.md` §"Idea 4" (lines 86-106); handoff analysis
`bun-rust-migration-analysis-handoff.md` §4.3 ("Khi 2 reviewer mâu thuẫn" — disagreement as a routing
signal; "agreement between independent samples = a cheap confidence measure").

**Hard dependency, stated up front:** this card assumes **idea 01's baseline (2 parallel Skinners)
has shipped.** With one reviewer there is nothing to disagree about, every finding is `single` by
definition, and this card is inert. See §7 for the full sequencing (`05 → 01/03 → 04` — this card
lands **last** in the step-6 cluster).

---

## 1. Problem (grounded in the tribe's own prompt files)

### 1.1 What exists today

Warchief step 6 (`plugins/tribe/agents/warchief.md:441-454`) audits with **one** Skinner and knows
exactly one shape of outcome: *"Feed Critical/Important findings back to a fixer Hunter and
re-audit — **cap fix-rounds at 3**"* (`:445-446`). One reviewer produces one verdict; a finding is
either raised or it is not. There is no notion of two reviewers, therefore no notion of them
agreeing or disagreeing, therefore no rule for what to do about it. The word "confidence" does not
appear in step 6 at all.

### 1.2 What idea 01 changes — and the seam it deliberately leaves open

Idea 01 (verified spec at `docs/tribe/planning/idea-01-dual-skinner-cell/spec.md`) replaces the
single Skinner with two independent ones and merges their reports at the Warchief layer. Its **Law
3** (spec `:95-108`) is the merge:

> **Union, then dedupe.** The merged finding list is the union of both reports' Critical and
> Important findings. Two findings that name the same location and make the same claim collapse into
> one entry. **Every merged finding carries an agreement tag:** `[both]` if both Skinners flagged it,
> `[one]` if only one did. The tag is *recorded and passed into the fixer Hunter's brief*; **the
> baseline does not yet route differently on it.** Emitting this signal without acting on it is
> deliberate — it is the seam card 04 plugs into.

So after idea 01 ships, the tribe **measures** confidence and then **throws the measurement away**:
a `[both]` finding and a `[one]` finding are handed to the fixer identically. Idea 01's Law 4
(spec `:121-124`) is equally explicit that it takes no position on conflicts: *"Head-on conflict …
the baseline adds no new routing policy here — card 04 owns that table."*

### 1.3 The actual defect: union-then-dedupe **cannot see a conflict at all**

This is the part that is easy to miss, and it is why this card is not merely cosmetic.

Idea 01's merge is a *set union with deduplication*. Deduplication collapses findings that make **the
same claim at the same location**. Now consider the case the handoff calls out as the interesting one
— two reviewers flagging the same line in **opposite directions**:

- Skinner A: *"`:88` — this must not be lazily evaluated; force the value here."*
- Skinner B: *"`:88` — this must not be eagerly evaluated; defer the value here."*

These are **different claims**, so dedupe does not collapse them. They therefore survive the union as
**two independent findings, each tagged `[one]`** — and are handed to the fixer as two ordinary,
unrelated hypotheses. The fixer, which sees one finding at a time and is required to fix what it can
reproduce (idea 05), can reproduce *both* — each is a true statement about a different desideratum —
and will happily satisfy one, then the other, oscillating or landing wherever the last edit fell.
**The single most informative signal in the whole cell — two independent samples pointing in
opposite directions, which is the system telling you the contract is underdetermined — is silently
flattened into "two routine findings."**

Idea 05's finding record (`docs/tribe/planning/idea-05-fixer-adjudication/spec.md:88-100`) already
reserves a field for the answer:

> **Confidence class:** `agreed` / `single` / `conflicting`. Today, with one Skinner, every finding is
> `single` by definition… **Idea 04 is the component that *computes* this field when 2+ reviewers
> exist.**

So the tribe post-01/05 has a **three-valued field that only two of whose values can ever be
produced**. `conflicting` is unreachable: nothing in idea 01's dedupe detects direction, and nothing
in idea 05 computes classes. This card supplies the missing function.

### 1.4 What happens if this card never lands

The Warchief is a language model handed two reports and no law. It will merge them *some* way every
time — and a different way each time, since nothing constrains it. That is the ideas file's own
diagnosis (`bun-rust-migrate-ideas.md:95-98`): *"If Ideas 1+3 land without a law for merging
findings, the Warchief will improvise a different merge every time."* Non-determinism at the tribe's
most authoritative gate is exactly the class of defect the tribe pushes into scripts and tables
everywhere else.

---

## 2. Proposed design

One sentence: **agreement between independent reviewers is a cheap confidence measurement, so
compute it explicitly (three classes), route on it with a fixed table, and — when the two reviewers
point in opposite directions — never let the Warchief pick a winner by taste; resolve it by citing
the contract, by one cold third sample, or by escalating.**

### 2.1 The three confidence classes (computing idea 05's field)

The Warchief classifies each merged finding at merge time, **before any fixer is dispatched**. The
input is idea 01's union list plus idea 05's **finding key** (`severity | location | one-line claim`
— idea-05 spec `:93-95`), which is what makes "the same location" a mechanical string comparison
rather than a judgment call.

| Class | Definition | Meaning |
| --- | --- | --- |
| **`agreed`** | Both reviewers flagged **the same location** with **the same claim direction** — i.e. idea 01's dedupe collapsed them into one entry (`[both]`). | Two independent samples converged. The cheapest confidence signal the system has. |
| **`single`** | Exactly one reviewer flagged the location; the other **said nothing about it**. | A hypothesis. Nothing more, nothing less. |
| **`conflicting`** | Both reviewers flagged **the same location**, and their demanded remedies are **mutually unsatisfiable** — no single edit can satisfy both. | The system is telling you something the reviewers cannot: the contract is probably underdetermined at this spot. |

**Two rules keep this from degenerating, and both must be prompt text, because both are the natural
mistake:**

**Rule A — silence is not dissent.** A reviewer that did not flag a location has **not** certified it
as correct. Skinners emit *findings*, not per-location clearances; a Skinner may simply not have
looked there, and its `AUDIT: PASS` verdict (`skinner.md:223`) is a statement about the contract as a
whole, not a line-by-line acquittal. Therefore **one-flags-one-silent is `single`, never
`conflicting`.** Getting this wrong inverts the whole card: every solo finding would become a
"disagreement", and the escalation path — the most expensive one — would become the default path.

**Rule B — two findings at one location are not automatically a conflict.** Two reviewers can flag
the same line for two *unrelated* defects (a null check *and* a wrong variable name). Both are true;
both are fixable in one edit. `conflicting` requires **mutual unsatisfiability**, not co-location.
The Warchief's test is a single yes/no question it can answer without deciding who is right:

> *Can one edit satisfy both remedies?* If yes → they are two ordinary findings (classed
> independently). If no → `conflicting`.

That question is deliberately narrow. It asks the Warchief to check *compatibility*, never *merit* —
so the classification step cannot smuggle in the winner-picking that §2.3 forbids.

### 2.2 The routing table

| Class | Routing | Rationale |
| --- | --- | --- |
| **`agreed`** | **Severity is raised to Critical by default**, and the finding goes **straight into the fixer's brief** with its class label. | Two independent samples converged; the prior that this is real is the highest the system can cheaply produce (handoff §4.3). Raising severity is the *only* place agreement changes the finding's treatment. |
| **`single`** | Goes into the fixer's brief with its class label. **The fixer adjudicates it** — per idea 05's reproduce-first mandate, which already governs what "adjudicate" means. | False positives are cheap **and are meant to be filtered by the layer below** (handoff §4.4 principle 3: "don't make the reviewer right — make its wrongness cheap"). The Warchief does not pre-filter what it has no evidence about. |
| **`conflicting`** | **Never routed to the fixer as-is, and never self-reconciled by the Warchief.** Resolved by the ladder in §2.3. | A fixer handed two mutually unsatisfiable orders either oscillates or silently picks one. The conflict must be *resolved*, not *delegated downward*. |

**The one additive line idea 05 asked for** (idea-05 spec `:311-319`, verbatim: *"That is the one
line idea 04's implementer should add — additively, without touching anything specified here"*):

> **Reproduce-first applies to every finding, including an `agreed` one.** Two reviewers
> hallucinating in the same direction is still a hallucination, and fixing blind is the harm.
> What the class changes is only the **escalation path on non-reproduction**: if the fixer reports
> `NOT_REPRODUCED` for an **`agreed`** finding, that is a strong signal the *fixer's reproduction* is
> at fault (two independent samples flagged it) — so it escalates to the Warchief **immediately**,
> rather than waiting for the next audit round to settle it as a `single` finding would.

This is the entire extent of this card's reach into fixer territory. It adds a class label to the
brief and one escalation rule keyed on that label. **It does not re-specify the fixer's duties** —
reproduce-first, the disposition vocabulary (`FIXED` / `NOT_REPRODUCED` / `ESCALATED`), the RED-rule
carve-out, and the standoff rule all belong to idea 05 and are consumed here unchanged.

### 2.3 The conflict ladder — three rungs, strictly ordered, bounded

When a finding is classed `conflicting`, the Warchief walks these rungs **in order** and stops at the
first that applies. The ladder exists to answer the card's own open question — *"a third review
round, or `NEEDS_DIRECTION` if the conflict exposes a spec ambiguity"* — with a **decidable test**
rather than a vibe.

#### Rung 1 — Does the contract already settle it? → resolve by **citation**, not judgment

If the spec or the plan, read literally, **mandates or forbids** one of the two directions, the
conflict is not a real disagreement — one reviewer simply did not read the contract as carefully.
The Warchief resolves it, but **only by citation**:

> The Warchief must quote the deciding sentence **verbatim, with its `file:line`**, from the spec or
> plan. The surviving finding proceeds to the fixer with its class rewritten to `agreed` (the
> contract is the second vote). The losing finding is **dropped**, and the ledger records
> `DROPPED (contract: path:line)`.
> **No citation → this rung does not apply.** A Warchief that cannot point at the sentence has not
> found one, and must fall through to rung 2. "The plan clearly intends…" is not a citation.

This rung is not new authority — step 6 already grants it (`warchief.md:451-453`: *"You have the
authoring context, so you adjudicate any finding that conflicts with what the plan mandated"*). The
card's ban on "self-reconciling" is a ban on **picking a winner by taste**, not a ban on **reading
the written law**. The verbatim-citation requirement is precisely what separates the two, and it is
why the requirement must be prompt text and grep-asserted (§4): without it, rung 1 becomes the
loophole that swallows the whole ladder.

#### Rung 2 — Is the question mechanically decidable? → **one cold tie-break round**

If no citation exists, ask: **is the disputed question one that running something could answer?**
(Does this leak? Is this off by one? Does this evaluation order fire early?) A technical-fact dispute
has a mechanical oracle. → Dispatch **one third Skinner (C)**, and take the **majority direction**
across the three independent samples.

**The tie-break Skinner is dispatched COLD. This is the load-bearing constraint of the whole rung:**

> Skinner C receives **exactly the same brief A and B received** — the contract, the diff, the repo's
> rules — and **never** A's or B's reports, findings, verdicts, or the fact that a disagreement
> exists. It is a **third independent sample**, not an arbiter reading two briefs.

The naive implementation of "run one more review round" is to hand reviewer C both reports and ask it
to referee. **That implementation is forbidden**, and it is forbidden by rules the tribe already
holds: idea 01's Law 2 (*"may not ask either Skinner to review, reconcile, or comment on the other's
findings"*) and idea 02's bias seal. An anchored arbiter is not a sample — it is a coin flip weighted
by whichever report it read more charitably, and its "agreement" with one side carries none of the
independence that made agreement meaningful in the first place. The whole value of `agreed` rests on
the samples being independent; an arbiter's vote is not.

**Reading the third sample:**

| Skinner C's finding at the disputed location | Outcome |
| --- | --- |
| Flags it in **A's direction** | Majority (2 of 3) → A's finding proceeds to the fixer as `agreed`; B's is dropped, ledger `DROPPED (tie-break, round N)`. |
| Flags it in **B's direction** | Symmetric. |
| Flags it in a **third direction**, or **says nothing about it** | **No majority.** The mechanical tie-break has failed → fall to rung 3. |

Silence from C is **not** a vote for either side (Rule A again) — it is an absence of a third sample,
which is exactly the "no majority" case.

**Bounds — this rung can never grind:**

- **At most ONE tie-break round per finding key, per campaign.** Not per round: per **key** (idea
  05's `severity | location | claim`). A conflict that resurfaces on the same key in a later audit
  round has already spent its tie-break and goes **straight to rung 3**.
- **A tie-break round is a review round, and it does NOT consume a fix round.** No code changes; no
  fixer is dispatched. The 3-round fix cap (`warchief.md:445-446`) counts *fix* rounds and is
  untouched. Were it otherwise, a single conflict would eat a third of the branch's entire fix budget
  without one line of code being fixed.

#### Rung 3 — Otherwise the conflict **is** the finding → `NEEDS_DIRECTION`, immediately

Reached when no citation settles it **and** no mechanical majority exists — either because the
question has no oracle (the two reviewers read the contract differently and *both readings are
defensible*), or because the tie-break failed to produce a majority.

**This is the "conflict exposes a spec ambiguity" branch, and the discriminator for it is sharp: a
question no experiment can settle is not a code question.** Two defensible readings of the contract
means the contract is underdetermined — and no number of reviewers can fix an underdetermined
contract, because each new reviewer just adds another opinion on a question the document never
answered. Running more rounds is not diligence here; it is burning tokens to avoid an escalation that
is already due.

The Warchief returns `NEEDS_DIRECTION` to the Shaman **at once** (not at round 3), carrying:

1. **Both reviewers' reports, verbatim** (idea 01's Law 3 already preserves them for exactly this).
2. The **finding key** and the two mutually unsatisfiable remedies, stated as the two options.
3. The tie-break Skinner's report, verbatim, if rung 2 ran.
4. **The Warchief's recommendation** — which reading it believes the card intends, and why.

This mirrors idea 05's standoff rule (idea-05 spec `:164-170`), which reaches the same conclusion
from the fixer's side: a deadlock over whether a defect exists *"is usually a contract ambiguity
wearing a bug costume"*, and it belongs back with the Shaman rather than in another round. The two
cards escalate the same class of thing, detected at two different layers — 04 catches it at the
merge, 05 catches it after a reproduction attempt. That is convergent, not redundant.

### 2.4 Recording the outcome — one ledger, two columns, two owners

The dispatch asks explicitly where the routing outcome is recorded, and how the 3-round cap stays
coherent. **Answer: extend idea 05's disposition ledger with two Warchief-owned columns. Do not
create a second ledger.**

Idea 05 puts a per-finding disposition ledger in the **Warchief's report file**. A finding's routing
(what the Warchief decided at merge) and its disposition (what the fixer did with it) are facts about
**the same finding at two stages of its life**, so they belong in one row. A second, parallel ledger
would fragment the audit trail and — fatally — make the round cap impossible to read off one
document.

| Column | Filled by | Values | Owner card |
| --- | --- | --- | --- |
| `ID` | Warchief | `F1`, `F2`, … (stable, never reused) | 05 |
| `finding key` | Warchief | `severity \| location \| one-line claim` | 05 |
| **`class`** | **Warchief, at merge** | **`agreed` / `single` / `conflicting`** | **04** |
| **`routed`** | **Warchief, at merge** | **`TO_FIXER` / `DROPPED (contract: path:line)` / `DROPPED (tie-break, round N)` / `TIEBREAK` / `ESCALATED (spec ambiguity)`** | **04** |
| `disposition` | The fixer Hunter | `FIXED` / `NOT_REPRODUCED` / `ESCALATED` — **empty when `routed` is not `TO_FIXER`** | 05 |
| `round` | Warchief | the audit round the row was written in | 05 |

That empty `disposition` cell is the producer/consumer boundary made visible: **a finding that never
reached the fixer has a routing outcome and no disposition.** This card fills the left columns and
never writes the right one.

**Why the report file, and how it survives a crash.** The report file is on disk and append-only, so
a re-dispatched Warchief resuming this card reads the ledger to learn **which finding keys have
already spent their one tie-break round** — the per-key cap of §2.3 is enforceable across a crash
precisely because the count lives in a file rather than in the dead Warchief's head. **No state-file
change is needed:** `docs/tribe/state/` tracks crash-resume *milestones* (`resume-check.sh`'s
contract), and an audit round is idempotent — the diff is unchanged, so a resumed Warchief simply
re-runs the round and re-derives the same classes from the same inputs.

---

## 3. Scope fence

**This planning card produces only:**
`docs/tribe/planning/idea-04-disagreement-routing/spec.md`, `.../plan.md`, and
`docs/tribe/state/idea-04-disagreement-routing.md`. **Zero changes under `plugins/`** — the prompt
edits are *described* in the plan for a future campaign, not applied. (Tripwire: any diff under
`plugins/` on this branch is an auto-fail.)

**The future implementation campaign this plan is written for touches exactly:**

- `plugins/tribe/agents/warchief.md` — **step 6 only**: the three class definitions (+ Rules A and
  B), the routing table, the conflict ladder, and the two new ledger columns.
- `plugins/tribe/scripts/tests/test-disagreement-routing.sh` — new mechanical conformance test.
- `plugins/tribe/evals/evals.json` — behavioral evals for the routing table and the cold tie-break.

**Explicitly out of scope** (state them so nobody "helpfully" adds them):

- **`plugins/tribe/agents/skinner.md` is not touched.** Reviewers do not learn about classes, do not
  emit them, and above all are never told another reviewer exists at the finding level. (Idea 01
  already adds the one invariant `skinner.md` needs; ideas 02/03 own the rest of that file.)
- **`plugins/tribe/agents/hunter.md` is not touched.** The fixer's mandate — reproduce-first, the
  disposition vocabulary, the RED-rule carve-out — is **idea 05's**, consumed here, never
  re-specified. This card adds a *label* to the brief and one escalation rule keyed on it; it does
  not tell the fixer how to fix.
- **No change to the number of reviewers, their briefs, their lenses, or their PASS/FAIL semantics.**
  That is 01 (count), 02 (isolation), 03 (lenses). This card is a pure function over their *outputs*.
- **No change to the 3-round fix cap's value.** The tie-break round is explicitly *not* a fix round.
- **No weighted/scored confidence** (no numeric scores, no "2.5 reviewers"). Three discrete classes,
  a fixed table. A scoring scheme is a research project and a Goodhart magnet.
- **No conflict-rate tripwire** ("the same location keeps producing conflicts → the spec template is
  ambiguous → write a rule"). That is idea 10; recorded in §7 as the natural follow-up.
- **No new agent, no new script beyond the test, no changes to `validate-plan.sh` /
  `resume-check.sh` / `heartbeat-check.sh`.**

---

## 4. Testing / verification strategy

Prompt files have no runtime, so the proof has two layers — the shape idea 05 established and this
card follows deliberately, so the two cards' tests compose rather than collide.

**Layer 1 — mechanical conformance (the TDD gate; every plan task is red→green on its own slice).**
A new `plugins/tribe/scripts/tests/test-disagreement-routing.sh`, in the harness style the repo
already uses (`plugins/tribe/scripts/tests/test-validate-plan.sh` — bash, `ok`/`not ok` lines,
non-zero exit on failure). It greps the prompt text for the invariants a careless future edit would
silently delete:

- Step 6 defines all three class tokens — `agreed`, `single`, `conflicting` — and the routing table
  gives each one a row.
- **Rule A (silence is not dissent)** is present: one-flags-one-silent classes as `single`.
- **Rule B (mutual unsatisfiability)**: co-location alone is not a conflict.
- The `agreed` row raises severity to **Critical** and states that reproduce-first still applies
  (the idea-05 additive line, including the immediate-escalation-on-`NOT_REPRODUCED` rule).
- The conflict ladder's three rungs are present and ordered, including: the **verbatim-citation**
  requirement on rung 1, the **cold-dispatch** requirement on rung 2, the **one-tie-break-per-key**
  cap, the **"a tie-break is not a fix round"** accounting rule, and rung 3's immediate
  `NEEDS_DIRECTION` with both reports verbatim.
- The ledger carries the `class` and `routed` columns.

**Negative assertions (the regression guards that matter most — each one is a specific way the card
can be silently un-done by a later edit):**

- **No text anywhere permits the Warchief to resolve a conflict by choosing a winner without a
  contract citation** (the rung-1 loophole).
- **No text passes reviewer A's or B's findings, reports, or the existence of a disagreement into the
  tie-break Skinner's brief** (the rung-2 leak that would break idea 01's Law 2 and idea 02's seal).
- **No text routes a `conflicting` finding to the fixer as-is** (delegating an unresolvable conflict
  downward).

**Layer 2 — behavioral proof (a scripted dry-run, executed once at the end of the future campaign).**
Five synthetic Skinner report-pairs as fixtures, one per branch of the table, each asserting the
resulting ledger row:

| Fixture | Two reports say | Expected ledger |
| --- | --- | --- |
| **a** | Both flag `:88`, same direction | `class=agreed`, severity Critical, `routed=TO_FIXER` |
| **b** | A flags `:88`; B silent | `class=single`, `routed=TO_FIXER` (**not** `conflicting` — Rule A) |
| **c** | Both flag `:88`, opposite remedies; the plan contains a sentence mandating one | `routed=DROPPED (contract: path:line)` for the loser, `class=agreed` for the winner — **no tie-break round dispatched** |
| **d** | Both flag `:88`, opposite remedies; contract silent; question is mechanically decidable | one **cold** Skinner C dispatched (assert its brief contains **neither** A's nor B's report), majority resolves, ledger records `DROPPED (tie-break, round N)` |
| **e** | Same conflicting key resurfaces after its one tie-break | **straight to `NEEDS_DIRECTION`** — no second tie-break (the per-key cap) |

Fixture **b** is the single most important test in the suite: it is the assertion that the card did
not turn every solo finding into an escalation.

---

## 5. Evidence plan

Captured by the future implementation campaign and embedded in its PR. Terminal transcripts —
this is a prompt-and-shell repo with no UI.

1. **BEFORE — the non-determinism this card removes.** On the post-01, pre-04 prompts, hand a
   Warchief fixture **d** (the head-on conflict) **twice, in two fresh contexts**. Capture both
   transcripts. The expected result — and the whole reason this card exists — is **two different
   merges from identical input**: no table exists, so the Warchief improvises, exactly as
   `bun-rust-migrate-ideas.md:95-98` predicts. Two divergent transcripts side by side is stronger
   evidence than any argument in this spec.
2. **AFTER.** The same fixture on the branch, twice: **identical routing both times**, with the
   ledger rows to prove it.
3. **The conflict-blindness proof (the §1.3 defect, shown concretely).** On the pre-04 prompts,
   fixture **d** produces **two `[one]` findings** in the merged list — the conflict is invisible.
   On the branch, the same input produces **one `conflicting` row**. Show the two merged lists
   side by side.
4. **The cold-dispatch proof.** For fixture **d**, dump the tie-break Skinner's actual brief and show
   it contains neither A's nor B's report — the mechanical evidence that rung 2 did not become an
   arbiter round.
5. **Mechanical gate.** `bash plugins/tribe/scripts/tests/test-disagreement-routing.sh` → all `ok`,
   exit 0; plus the existing suites (`test-validate-plan.sh`, `test-resume-check.sh`, and idea 01's
   and idea 05's suites) still green — proving no collateral damage to the neighbouring cards in the
   same section of step 6.

---

## 6. Risks & rollback

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | **Escalation storm** — the Warchief classes everything `conflicting` and the Shaman drowns. This is the card's main hazard: the escalation path is the most expensive one, and a mis-drawn conflict boundary makes it the default. | Three locks: **Rule A** (silence is never dissent — the single largest source of false conflicts); **Rule B** (co-location is not conflict; only *mutually unsatisfiable* remedies are); and **rung 1**, which resolves by citation, so an ordinary "reviewer B didn't read the spec" never reaches the Shaman. Fixture **b** in the test suite is the permanent regression guard. |
| 2 | **Rung 1 becomes a loophole** — the Warchief rationalizes a winner ("the plan clearly intends…") and calls it a citation, i.e. self-reconciliation with extra steps. | The citation must be a **verbatim quote with `file:line`**; no citation → the rung does not apply, fall through. Guarded by a **negative** grep assertion, and it is the reason that requirement is prompt text rather than a footnote in this spec. |
| 3 | **The tie-break round becomes an arbiter round** — reviewer C is handed A's and B's reports "so it can decide", silently destroying the independence that gives `agreed` its meaning and breaching idea 01 Law 2 + idea 02. | Explicit cold-dispatch rule in prompt text, a negative grep assertion, and an evidence item (§5.4) that dumps C's actual brief. Three independent guards, because this is the mistake a reasonable implementer is *most* likely to make — it is what "run one more review round" sounds like it means. |
| 4 | **Round-cap incoherence** — tie-break rounds silently eat the 3-round fix budget, so a conflict starves the branch of the fix rounds it needs. | The tie-break is defined as a **review** round, explicitly non-consuming, and separately capped at **one per finding key per campaign**. Both facts are asserted mechanically. |
| 5 | **Classification is LLM judgment, not a script** — "same location" and "opposite direction" are read out of prose reports, so the class could be flaky. **This is the softest part of the card and worth stating plainly.** | The judgment surface is deliberately narrowed to its minimum: "same location" is a string comparison on idea 05's finding key (already the Warchief's job to assign), and the only real judgment is the single yes/no *"can one edit satisfy both remedies?"* — a compatibility question, never a merit question. The Warchief is never asked who is right; only whether both can be true at once. Residual flakiness routes to rung 2 or 3, both of which are safe (a cold sample, or a human-backed ruling) — the failure mode is *over*-escalation, not a wrong silent merge. |
| 6 | **Lands before idea 01** and is a no-op. | Sequencing is stated in §7 and in the plan's Global Constraints. Degradation is graceful, not broken: with one reviewer every finding classes `single`, the table's `single` row routes it to the fixer exactly as today. |
| 7 | **Prompt bloat in step 6** — this card, 01, and 05 all add text to one section. | This card's additions are two compact tables plus the ladder (~45 lines). The section stays a table-and-rules structure rather than prose, which is what keeps it readable — and the mechanical test means a future editor who trims it gets a red build rather than a silent regression. |

**Rollback:** prompt text plus one test file and one evals entry, landed as separate commits with no
runtime state and no data migration. `git revert` of the commits restores post-01/05 behavior exactly
(findings tagged `[both]`/`[one]`, routed uniformly to the fixer). Nothing persists between campaigns
that would need cleaning up. Blast radius of a bad version: the Warchief over-escalates conflicts to
the Shaman — noisy, never silently wrong.

---

## 7. Interactions with other ideas

### Sequencing — this card lands LAST in the step-6 cluster

**Implementation order: `05 → 01/03 → 04`.** Verified against both sister specs, which independently
agree:

- **Idea 01's spec** (`:227`): *"04 must land **after** 01."*
- **Idea 05's spec** (`:320-326`): 04 and 05 both edit `warchief.md` step 6 — the same ~15 lines — so
  their `owns_files` are **not disjoint** and the Warchief's own wave rules
  (`warchief.md:332-333, 376-380`) forbid running them in the same concurrent wave. *"Recommended
  order: 05 before 04"*, so 04 lands against a fixer role that already exists rather than a forward
  reference to one that does not.

**Every one of this card's edits therefore lands on a step 6 that already contains idea 05's fixer
brief template + disposition ledger + standoff rule, and idea 01's four laws.** The plan's prompt
text is written against that post-05, post-01 step 6 — not against today's `:441-454`. **The
implementing Hunter must re-read step 6 before editing and reconcile against what is actually there**
(the plan says so in its Global Constraints); if 01 or 05 shipped with different wording than their
specs promised, that is a reconciliation the Hunter reports as `NEEDS_CONTEXT`, not one it papers
over.

### Idea 01 — 2 parallel Skinners (**hard dependency**)

**This card is the consumer of idea 01's deliberate seam.** Law 3 tags every merged finding `[both]`
or `[one]` *"and takes no action on the tag"* — 04 is the action. The mapping is:

- 01's `[both]` → 04's **`agreed`** (severity raised to Critical).
- 01's `[one]` → 04's **`single`** *or*, when it collides head-on with another `[one]` at the same
  location, **`conflicting`**.

**And this is where 04 goes beyond a relabelling:** as §1.3 shows, idea 01's union-then-dedupe
**structurally cannot produce `conflicting`** — dedupe collapses *same* claims and lets *opposite*
claims through as two unrelated `[one]` entries. So 04 does not merely route on 01's tag; it **adds
the directional-conflict detection that 01's merge lacks**, upgrading a 2-valued tag into idea 05's
3-valued class. Without 04, `conflicting` is a field that can never be set.

**Without 01, this card is inert but harmless** (§6 risk 6): one reviewer → every finding `single` →
routed to the fixer exactly as today. It is not *broken* without 01; it is *pointless* without 01.

### Idea 05 — fixer adjudication (**hard dependency; the producer/consumer boundary**)

Verified spec read in full. The boundary, restated in the terms that spec fixed:

- **04 is a function over the REVIEWERS' outputs.** Given N reviewers' findings it computes each
  finding's **confidence class** and decides **which findings reach the fixer at all, and with what
  label**.
- **05 is a function over findings ALREADY routed to the fixer.** Given a finding, it defines what
  the fixer must and may do with it (reproduce → fix, or falsify → `NOT_REPRODUCED`, or `ESCALATED`).
- **The interface is idea 05's finding record** (its `:88-100`): 04 **fills** the `confidence class`
  field; 05 **consumes** it. 04 also depends on 05's **finding key** as its identity mechanism —
  without a stable key there is no "same location" comparison to classify on and no way to enforce
  the one-tie-break-per-key cap across rounds.
- **04 writes the `class` + `routed` ledger columns; 05 writes `disposition`** (§2.4). One table, two
  owners, no overlap.

**This card honors idea 05's explicit request** (`:311-319`) and adds exactly the one line it asked
for — reproduce-first applies to `agreed` findings too, and `NOT_REPRODUCED` on an `agreed` finding
escalates immediately — **additively, touching nothing else in the fixer's contract** (§2.2). This
card does **not** re-specify the reproduce-first mandate, the disposition vocabulary, or the
RED-rule carve-out; it never edits `hunter.md`.

**Convergent escalation, not redundant escalation.** 05's standoff rule and 04's rung 3 both end in
`NEEDS_DIRECTION` on "a contract ambiguity wearing a bug costume" — but they detect it at different
layers: **04 catches it at the merge** (two reviewers pointing opposite ways, *before* any code is
touched — the cheapest possible detection) and **05 catches it after a reproduction attempt** (a
reviewer and the fixer deadlocked). 04's rung 3 is strictly the cheaper of the two, and it fires
first, so it *reduces* the load on 05's standoff path rather than duplicating it.

### Idea 03 — input asymmetry (contract lens A / cold lens B) — **compatible unmodified; one trap**

Idea 03 makes the two reviewers non-interchangeable: A holds the contract, B is contract-blind. The
routing table survives **unchanged**, and here is why, class by class:

- **`agreed` gets *stronger*.** Two *different* input distributions converging on the same finding
  cannot have converged through a shared reading of the contract — so agreement under 03 is better
  evidence than agreement between two identical samples, not worse.
- **`single` is unchanged in routing, but shifts in population.** Cold-lens B will produce more solo
  findings, and with a higher false-positive prior (it cannot distinguish an intentional design
  decision from a defect). That is **exactly the population idea 05's reproduce-first filter was
  built to absorb** — and it is why 05 must ship before 03, which 05's own spec (`:347-352`) already
  says. Routing does not change: `single` → fixer adjudicates.
- **`conflicting` — THE TRAP, and it must be prompt text.** Under 03 it is tempting to read *"A (with
  the contract) passed; B (cold) flagged this line"* as a disagreement between the reviewers. **It is
  not.** A did not flag the location — A was *silent* about it — and Rule A (§2.1) says silence is not
  dissent. That case is **`single`**, routed to the fixer. If an implementer gets this wrong, then
  under 03 — where B is *designed* to find things A structurally cannot see — **the majority of B's
  findings become "conflicts" and the routing table collapses into a permanent escalation machine.**
  Rule A is what prevents that, and it is why the mechanical test asserts fixture **b** by name.

**One open seam this card explicitly does NOT resolve:** idea 03 proposes that only reviewer A (the
contract lens) holds the authoritative PASS/FAIL, with B's findings as pure hypotheses
(`bun-rust-migrate-ideas.md:82`), whereas idea 01's Law 4 requires **both** Skinners to PASS. That is
a genuine 01-versus-03 question about **verdict** policy. **This card is verdict-agnostic** — it
routes *findings*, and every rung of the ladder operates on findings alone — so it composes with
whichever policy wins. Flagged here for the Shaman because it is a real seam between two sister
cards; it is not 04's to settle.

### Idea 02 — the Skinner never reads the code-writer's reasoning — **this card is designed against it**

02 seals the implementer→reviewer bias channel. This card's rung 2 is where that seal would most
plausibly be broken — the obvious way to run "one more review round" is to show reviewer C what A and
B said. §2.3 forbids exactly that: **C gets the same cold brief A and B got.** So 04 extends 02's
principle from the implementer→reviewer channel to the reviewer→reviewer channel (where idea 01's Law
2 already put it) and adds a negative test assertion to keep it sealed. If 02 ships, no line of this
card changes; if it never ships, this card behaves as if it had.

### Idea 06 — frozen campaign codex — **no conflict**

If 06 lands, the ledger (§2.4) is a natural section of the campaign artifact rather than living only
in the Warchief's report file. A one-line relocation, not a redesign — the same note idea 05 makes
about the same ledger.

### Idea 10 — mechanical tripwires — **the natural follow-up**

The `class` column is a measurable stream. A campaign producing `conflicting` findings at a high rate
is not telling you the reviewers are broken — it is telling you **the spec template is ambiguous**,
which is a process bug, visible only because classes are now recorded. A tripwire on that rate
("≥2 conflicts in one campaign → the spec's testing-strategy section needs a rule") is the
prototypical idea-10 loop: pattern → rule → every subsequent campaign enforces it. **Explicitly out
of scope here**, recommended as a follow-up card.

---

## 8. Definition of done (for the future implementation campaign)

1. `warchief.md` step 6 carries the three class definitions, **Rule A** (silence is not dissent) and
   **Rule B** (co-location is not conflict), and the routing table with all three rows.
2. Step 6 carries the conflict ladder: rung 1 (verbatim contract citation), rung 2 (one **cold**
   tie-break Skinner, one per finding key, not a fix round), rung 3 (immediate `NEEDS_DIRECTION` with
   both reports verbatim + a recommendation).
3. The `agreed` row states that reproduce-first still applies and that `NOT_REPRODUCED` on an
   `agreed` finding escalates to the Warchief immediately (idea 05's requested additive line).
4. The disposition ledger carries the `class` and `routed` columns; `hunter.md` and `skinner.md` are
   **untouched**.
5. `bash plugins/tribe/scripts/tests/test-disagreement-routing.sh` → all `ok`, exit 0 — including the
   three **negative** assertions; the existing suites (01's, 05's, `test-validate-plan.sh`,
   `test-resume-check.sh`) still green.
6. The §5 evidence is embedded in the PR: the two divergent BEFORE transcripts vs. identical AFTER
   routing, the conflict-blindness before/after, and the tie-break Skinner's cold brief.
