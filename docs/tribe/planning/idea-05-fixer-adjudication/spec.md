# Spec — Idea 05: fixer adjudication ("a finding is a hypothesis, not an order")

**Card:** `idea-05-fixer-adjudication`
**Status:** planning-only. This spec + its plan are the deliverable; a *future* implementation
campaign applies the prompt edits described here.
**Source:** `bun-rust-migrate-ideas.md` §"Idea 5" (lines 110-129); handoff analysis
`bun-rust-migration-analysis-handoff.md` §4.3 (the reviewer's output is a *hypothesis* that walks a
chain of arbiters) and §4.4 principle 3 ("don't make the reviewer right — make its wrongness cheap").

---

## 1. Problem (grounded in the tribe's own prompt files)

The tribe already runs an adversarial reviewer whose prior is "assume the code is wrong"
(`plugins/tribe/agents/skinner.md:19-40`) and whose bias rule is "when in doubt, FAIL"
(`skinner.md:232`). That prior is correct and deliberate: a false positive (a bug reported that
does not exist) is cheap, a false negative (a real bug shipped) is expensive. Buying many cheap
false positives to avoid one expensive false negative only works, however, if the layer *below* the
reviewer can discard a false positive cheaply. Today the tribe has no such layer.

**What happens today, exactly:**

1. The Warchief audits each task with one Skinner and then: *"Feed Critical/Important findings back
   to a fixer Hunter and re-audit — cap fix-rounds at 3"* (`plugins/tribe/agents/warchief.md:445-446`).
   That is the entire specification of the fixer loop. There is **no fixer brief template**, no
   per-finding identity, and no vocabulary for any outcome other than "fixed".
2. The fixer is a Hunter, and the Hunter's charter tells it that a brief is a set of orders to
   execute: *"Build **only** what the brief specifies"* (`hunter.md:47`), *"Build nothing beyond the
   brief… Over-building is a failure, not initiative"* (`hunter.md:49-50`), and *"The Warchief grades
   your work, not you"* (`hunter.md:59-61`). A Hunter handed the line "fix Critical finding 3" has no
   sanctioned way to answer "finding 3 describes a defect that does not exist." Its only escape
   hatches are `NEEDS_CONTEXT` / `BLOCKED` (`hunter.md:52-56`), which are framed for *ambiguity in
   the brief*, not for *a false claim inside an otherwise clear brief*.
3. Worse, the Hunter's TDD rule actively punishes the honest reproduction attempt. `hunter.md:70-73`:
   *"RED — write the failing test first… **If it passes immediately, the test is wrong; fix it.**"*
   A fixer that does the right thing — write the test that manifests the claimed bug, run it, and
   watch it **pass** (i.e. the bug is not there) — is told by its own charter that *its test* is
   broken, and is nudged to keep bending the test until something goes red. That is a machine for
   manufacturing confirmations of false findings.
4. The doctrine reinforces the same collapse: the Skinner's ruling is described as
   **"authoritative — a `FAIL` must be fixed, never argued away"** (`plugins/tribe/README.md:90`, and
   verbatim in `plugins/tribe/claude-md/review-agents.md:5`). That sentence is *true at the verdict
   level* and is the tribe's spine — but nothing anywhere distinguishes the **verdict** (PASS/FAIL,
   authoritative, gates done-ness) from an **individual finding** (a claim, falsifiable, may be
   wrong). A fixer Hunter reading the repo's own docs concludes that every bullet under
   `## Findings` (`skinner.md:208-212`) is equally unarguable.

**The failure mode this produces.** The fixer fixes blind. It edits working code to satisfy a claim
nobody ever reproduced, and — because it must not leave the suite red (`hunter.md:103-104`) — it
often adjusts the *tests* to match the reviewer's imagined behavior. The Skinner then re-audits, sees
its demand satisfied, and PASSes. A false positive that should have cost one cheap round trip has
instead been **laundered into the codebase as a real change**, with a green suite vouching for it.
The reviewer's wrongness, which the whole design assumed was cheap, is in fact the most expensive
thing in the loop.

The second-order damage is the loop itself. With no way to say "not reproduced", a phantom finding
can only be discharged by *changing something*, so a fixer that refuses to fabricate a change simply
fails the round, gets re-audited, fails again, and burns the 3-round cap
(`warchief.md:445-454`) before escalating to the Shaman — the most expensive possible resolution for
the cheapest possible error.

**What Bun did instead** (blog + handoff §4.3): the reviewer's output is *not* a ruling; it is a
hypothesis entering a chain of arbiters — `reviewer claim → fixer (is this worth fixing?) →
compiler → 1.39M-assertion test suite → CI`. The fixer is a **separate role with the authority to
drop a claim**, and if it drops a true one, the mechanical oracle downstream catches it. That
authority is exactly what lets the reviewer be aggressive without the system dying of false
positives.

---

## 2. Proposed design

One sentence: **a Skinner *verdict* stays authoritative; a Skinner *finding* becomes a hypothesis the
fixer must reproduce before it is allowed to fix it — and the reproduction attempt itself becomes a
committed artifact that lets the mechanical oracle, not an argument, settle the disagreement.**

### 2.1 Where the mandate lives — and why (the design note the card asks for)

**Decision: both files, split by what each one structurally can and cannot know.**

| Concern | File | Why it must be there |
| --- | --- | --- |
| The *authority* to not fix, the reproduction procedure, the disposition vocabulary, and the carve-out to the RED rule | `plugins/tribe/agents/hunter.md` (new "Fixer mode" section) | Permission to decline an instruction cannot be granted solely by the instruction itself. A brief-only mandate sits inside a document whose own charter says "build only what the brief specifies" and "over-building is a failure" (`hunter.md:47-50`) — when a brief and the charter appear to conflict, the charter wins, and the fixer reverts to obeying. The RED-rule carve-out (`hunter.md:70-73`) *cannot* live anywhere else: it is an exception to a rule stated in `hunter.md`, and a rule can only be excepted where it is written. Placing it here also means any future orchestrator that dispatches a fixer Hunter inherits the mandate for free. |
| The *per-round dispatch contract* (finding IDs, verbatim mandate line in the brief, the required disposition ledger) and the *adjudication of what comes back* (the standoff rule, the escalation payload, the round accounting) | `plugins/tribe/agents/warchief.md` step 6 | Only the Warchief holds **cross-round state**. Each fixer Hunter is fresh and stateless per round (`warchief.md:445` dispatches a new one); it cannot possibly detect "this is the same finding I falsified last round, re-asserted with no new evidence". Loop termination is therefore structurally the Warchief's job, and it needs a finding identity it assigns itself. |
| The verdict-vs-finding distinction in doctrine | `plugins/tribe/README.md:90`, `plugins/tribe/claude-md/review-agents.md:5` | These are the sentences a fixer Hunter will read as governance. Left unqualified, they contradict the new hunter.md section. A prompt system with two documents disagreeing about whether a finding is arguable is a coin flip at runtime. |
| Nothing | `plugins/tribe/agents/skinner.md` | **Deliberately untouched.** Everything the referee role needs already exists there: it runs the proof rather than reading claims (`skinner.md:141-150`), it treats prose as non-evidence (`skinner.md:38-40`), it self-refutes each finding by hunting for satisfying code it may have missed (`skinner.md:167-182`), and it gap-hunts hollow tests (`skinner.md:135-136`). Leaving skinner.md alone also keeps this card off the file that ideas 01/02/03 all need to edit (see §7). |

### 2.2 The finding record (the interface)

The Warchief, when it builds the fixer brief, assigns each routed Critical/Important finding a
**stable ID** and a **finding key**:

- **ID:** `F1`, `F2`, … within the campaign (not per-round — an ID, once assigned, is never reused).
- **Finding key:** `severity | location (file:line or rule name) | one-line claim`. The key is how
  the Warchief recognises the *same* finding re-raised in a later round, since the Skinner emits
  bullets without identity (`skinner.md:208-212`) and its per-round bullet order is not stable.
- **Confidence class:** `agreed` / `single` / `conflicting`. **Today, with one Skinner, every finding
  is `single` by definition** — so this field is well-defined without idea 04 and this card ships
  standalone. Idea 04 (reviewer-disagreement routing) is the component that *computes* this field
  when 2+ reviewers exist. See §7 for the boundary.

### 2.3 The fixer's mandate (goes into hunter.md, and verbatim into every fix brief)

> **Every finding is a hypothesis, not an order.** Before you change a single line for a finding,
> **reproduce it**: make the defect it claims manifest, mechanically. Only a reproduced finding may
> be fixed. If you cannot make it manifest, you do **not** fix it — you record `NOT_REPRODUCED` with
> the evidence. Fixing blind is a failure, exactly like skipping the failing test.

**Reproduction, by finding class** (the class is decided by what the finding claims, and the fixer
states which class it used):

| Finding class | The claim looks like | Reproduction is | `NOT_REPRODUCED` requires |
| --- | --- | --- | --- |
| **Behavioral** | "this returns the wrong value / leaks / is off by one / breaks on empty input" | a test that manifests the defect and **fails RED** on the current code | a *falsification test* — a real test asserting the behavior the finding says is broken — that **passes green** on the current code, committed to the branch |
| **Static / governance** | "violates rule X", "commit lacks the `Tribe-Card` trailer", "a `Co-authored-by` trailer is present" | a deterministic command (grep, lint, typecheck, `git log`) whose output **shows** the violation | the same command, run and transcribed in the report, showing the violation **absent** |
| **Absence / coverage** | "requirement 4 has no test", "this Definition-of-Done item is unmet", "unverified" | running the named check and finding the artifact missing — **the absence is itself the reproduction** | **citing the artifact the Skinner missed, at `file:line`.** If you cannot cite it, the finding is TRUE and you must fix it. `NOT_REPRODUCED` is **never** available for an absence finding on the grounds that "I could not write a failing test" — this is the gaming hole and it is closed. |

**Disposition vocabulary** — the fixer reports exactly one per finding ID:

- **`FIXED`** — reproduced (RED test, or command showing the violation), then fixed; the artifact is
  now green. The repro artifact **and** the fix land in the same commit.
- **`NOT_REPRODUCED`** — the reproduction attempt was built and the claimed defect did not manifest.
  **A committed artifact or a transcribed command is mandatory**; a bare "I read it and it looks
  fine" is not a disposition and the Warchief rejects the report.
- **`ESCALATED`** — the finding is not a code defect at all: it exposes a spec/plan ambiguity, or it
  demands the opposite of what the brief mandates. The fixer stops and reports (this is the existing
  `NEEDS_CONTEXT` path, `hunter.md:52-56`), it does not adjudicate product questions.

The falsification test is **not throwaway**: it stays in the suite as a regression test asserting the
behavior the reviewer doubted. A false positive thereby leaves the codebase *better* tested rather
than *wrongly* modified — this is what "make its wrongness cheap" buys, concretely.

### 2.4 How "not reproduced" gets refereed — without leaking the fixer's reasoning to the reviewer

This is the load-bearing mechanism, and it is what keeps this card compatible with idea 02 (the
Skinner must never read the implementer's reasoning).

**The fixer's report never reaches the Skinner. Its artifact does — as code, in the diff.**

The falsification test is committed to the branch. The next Skinner runs **cold** (contract + diff +
repo rules, as today), encounters that test as an ordinary part of the diff, and — because it always
runs the proof rather than reading claims (`skinner.md:141-150`) — *executes* it. Its own
self-refutation step then has a mechanical reason to drop the finding: it was hunting for "satisfying
code you may have missed" (`skinner.md:172-177`), and a green test asserting the exact behavior it
doubted is precisely that. No prose, no persuasion, no narrative from the party that wrote the code
— only "the diff, the code, and command output", which is the only evidence the Skinner accepts
anyway (`skinner.md:38-40`). The referee is not an argument between two agents; it is the oracle.

And a *rigged* falsification (a hollow test that asserts something adjacent to the finding rather
than the finding) is already in the Skinner's crosshairs: "Is a 'test' hollow — would it actually
fail if the behavior broke?" (`skinner.md:135-136`).

### 2.5 Loop termination — the phantom finding cannot grind the 3-round cap

Added to Warchief step 6. After each fix round, the Warchief re-audits and then adjudicates the
ledger, per finding:

1. **The Skinner does not re-raise a `NOT_REPRODUCED` finding** → the finding **falls**. Ledger:
   `F3 — DROPPED (falsified, round 2)`. Cost of that false positive: one test, one round. Done.
2. **The Skinner re-raises it, *with new evidence* that defeats the falsification** (it names the
   input, path, or condition the falsification test failed to cover) → **the reviewer won the
   exchange**: the finding stands, goes back to the fixer with the refutation attached, and must now
   be reproduced *using the Skinner's stated condition*. This is an ordinary fix round.
3. **The Skinner re-raises it *unchanged*, with no new evidence, leaving the falsification artifact
   unaddressed** → **standoff**. The Warchief does **not** spend another round. It returns
   `NEEDS_DIRECTION` to the Shaman **immediately**, carrying (a) the Skinner's report verbatim and
   (b) the fixer's falsification artifact and command output. A reviewer and a fixer deadlocked over
   whether a defect exists is not a code bug — it is usually a contract ambiguity wearing a bug
   costume, which is exactly the class `warchief.md:448-450` already says belongs back with the
   Shaman.

**Round accounting:** the 3-round cap (`warchief.md:446`) is unchanged as the outer bound; the
standoff rule can only *shorten* the loop, never extend it. A phantom finding therefore costs **at
most one fix round plus one re-audit** — and if the two agents deadlock, it escalates on the spot
instead of burning rounds 2 and 3 to reach the same escalation. A round in which every routed finding
came back `NOT_REPRODUCED` and the next Skinner re-raises none ends in PASS, with the branch's code
**unchanged** and two new regression tests — the correct outcome, and one the tribe cannot currently
reach.

**"FAIL must be fixed" survives intact, at the verdict level.** The branch cannot ship while the
Skinner says FAIL; nothing about that changes. What changes is *how* a FAIL may be discharged: by
fixing a reproduced defect, or by falsifying the claim and letting the next Skinner round drop it, or
by escalating a deadlock. A `NOT_REPRODUCED` disposition is never itself a pass — it is a move in the
exchange, and the Skinner remains the referee that ends it.

---

## 3. Scope fence

**This planning card produces only:** `docs/tribe/planning/idea-05-fixer-adjudication/spec.md`,
`.../plan.md`, and `docs/tribe/state/idea-05-fixer-adjudication.md`. **Zero changes under
`plugins/`** — the prompt edits below are *described* in the plan for a future campaign, not applied.

**The future implementation campaign this plan is written for touches exactly:**

- `plugins/tribe/agents/hunter.md` — add the "Fixer mode" section + the RED-rule carve-out + one
  anti-goal.
- `plugins/tribe/agents/warchief.md` — step 6 only: the fixer brief template, the disposition ledger,
  the standoff/escalation rule.
- `plugins/tribe/README.md` + `plugins/tribe/claude-md/review-agents.md` — one clarifying clause each,
  verdict vs. finding.
- `plugins/tribe/scripts/tests/test-fixer-mandate.sh` — new mechanical conformance test.

**Explicitly out of scope** (state them so nobody "helpfully" adds them):

- **`plugins/tribe/agents/skinner.md` is not touched.** No finding IDs emitted by the Skinner, no
  second reviewer, no changed verdict semantics. (Ideas 01/02/03 own that file.)
- **No routing logic between multiple reviewers** — that is idea 04. This card consumes a
  `confidence class` field; it does not compute one.
- **No change to the 3-round cap's value**, no new agent, no new script beyond the test, no changes to
  `validate-plan.sh` / `resume-check.sh` / `heartbeat-check.sh`.
- **No campaign-wide "phantom rate" tripwire** — a natural follow-up (idea 10), recorded in §7, not
  built here.

---

## 4. Testing / verification strategy

Prompt files have no runtime, so the proof has two layers.

**Layer 1 — mechanical conformance (the TDD gate, runs in the plan's every task).** A new
`plugins/tribe/scripts/tests/test-fixer-mandate.sh`, in the style the repo already uses for its
scripts (`plugins/tribe/scripts/tests/test-validate-plan.sh:1-13` — a bash harness with `ok`/`not ok`
lines and a failing exit code). It asserts, by grep over the prompt files, the invariants that make
the mandate real and that a careless future edit would silently delete:

- `hunter.md` contains a **Fixer mode** section, and within it: the words `hypothesis`, `reproduce`,
  and all three disposition tokens `FIXED`, `NOT_REPRODUCED`, `ESCALATED`.
- `hunter.md`'s RED rule carries the falsification carve-out (a green falsification test is a result,
  not a broken test) — asserted by requiring the carve-out cross-reference near the RED step.
- `warchief.md` step 6 contains the fixer-brief template with a stable finding ID, the verbatim
  mandate line, and the required **disposition ledger**.
- `warchief.md` step 6 contains the **standoff** rule and its immediate-`NEEDS_DIRECTION` escalation.
- `README.md` and `claude-md/review-agents.md` each distinguish the authoritative **verdict** from a
  falsifiable **finding**.
- **Negative assertion:** no prompt/doc file states that an individual *finding* is authoritative or
  must never be argued (only the *verdict* may carry that phrasing). This is the regression guard for
  the exact contradiction §1 describes.

Each plan task is red→green on its own slice of this test: the assertions are written first, watched
fail, then the prompt edit makes them pass.

**Layer 2 — behavioral proof (a scripted dry-run, executed once at the end of the future campaign).**
A synthetic Skinner FAIL report containing **two** Critical findings against a scratch fixture: one
*true* (a real off-by-one) and one *phantom* (a claimed null-deref on a path that cannot be null). A
fixer Hunter is dispatched with the new brief. The proof is the resulting disposition ledger:
`F1 = FIXED` with a genuine RED→GREEN transcript, and `F2 = NOT_REPRODUCED` with a green falsification
test — and, critically, **the phantom's target code is byte-identical before and after**. That last
check is the whole card in one assertion.

---

## 5. Evidence plan

Captured by the future implementation campaign, embedded in its PR:

1. **BEFORE (the failure this card removes).** Run the layer-2 dry-run on `master`'s prompts: dispatch
   today's fixer Hunter with the same two-finding Skinner report and today's brief shape
   (`warchief.md:445-446`, which has no template — so: "fix these Critical findings"). Capture the
   transcript + `git diff` of the fixture. Expected: the phantom finding produces a code change to
   working code, and/or a mangled test — a diff that should not exist. This transcript is the
   evidence that the problem is real and not theoretical.
2. **AFTER.** Same dry-run on the branch. Capture the fixer's disposition ledger and
   `git diff --stat` of the fixture: the phantom's target file is untouched; a falsification test was
   added; the true finding was fixed with a RED proof.
3. **Mechanical gate.** `bash plugins/tribe/scripts/tests/test-fixer-mandate.sh` output, all `ok`,
   exit 0 — plus the existing suites (`test-validate-plan.sh`, `test-resume-check.sh`) still green,
   proving no collateral damage.
4. **Loop-termination proof.** A third dry-run in which the synthetic Skinner re-raises the phantom
   unchanged on re-audit: show the Warchief escalating `NEEDS_DIRECTION` at round 2 instead of
   grinding to round 3 — the transcript is the evidence for §2.5.

Terminal transcripts (this is a prompt-and-shell repo; there is no UI), pasted into the PR body as
fenced blocks with the `git diff --stat` numbers.

---

## 6. Risks & rollback

| # | Risk | Mitigation |
| --- | --- | --- |
| 1 | **The fixer Goodharts the escape hatch** — declares everything `NOT_REPRODUCED` to avoid work. This is the mirror image of the Skinner's alarm-fatigue risk (handoff §4.4 principle 2), and it is the main hazard of this card. | Four independent locks: (a) `NOT_REPRODUCED` requires a **committed artifact or transcribed command** — asserting non-reproduction costs real work, so it is never the lazy path; (b) **absence-class findings are ineligible** for it unless the fixer cites the artifact at `file:line` (§2.3) — closing the "I couldn't write a failing test" dodge; (c) the Skinner re-audits **cold** and re-raises anything genuinely unfixed — the fixer cannot talk its way past the oracle; (d) the ledger makes the phantom rate visible to the Warchief round by round. |
| 2 | **Hollow / rigged falsification test** — a test that asserts something adjacent to the finding and passes trivially. | Already the Skinner's job: `skinner.md:135-136` explicitly hunts hollow tests ("would it actually fail if the behavior broke?"). The referee is unchanged; we are only handing it a new artifact to run. |
| 3 | **Prompt bloat in `hunter.md`** — every build-mode Hunter now reads a fixer section it will never use. | The section is gated by its first line ("If your brief is a FIX brief — it carries Skinner findings instead of a plan task"), and capped at ~35 lines. A build-mode Hunter reads one sentence and skips. |
| 4 | **Doctrine contradiction at runtime** — README/claude-md still imply every finding is unarguable, so the fixer flips a coin between two documents. | Task 4 of the plan exists solely to close this, and the test's negative assertion is a permanent regression guard against it re-opening. |
| 5 | **Extra cost per phantom** — one test + one round. | This is the price being *bought down*, not up: today the same phantom costs either a wrong change to working code (unbounded downstream cost) or all three rounds plus a Shaman escalation. |
| 6 | **The standoff rule fires too eagerly**, escalating a finding the Skinner would have refined on its own next round. | The rule requires "re-raised **unchanged, with no new evidence**" — any new evidence routes to case 2 (ordinary fix round). And an escalation is cheap: the Shaman rules and the campaign resumes from saved state. |

**Rollback:** every change is prompt text and one test file, landed as four separate commits with no
runtime state and no data migration. `git revert` of the four commits restores the prior behavior
exactly; nothing persists between campaigns that would need cleaning up. The blast radius of a bad
version of this card is "the fixer behaves as it does today".

---

## 7. Interactions with other ideas

**Idea 04 (reviewer-disagreement routing) — the boundary, stated precisely.** The two cards compose
as *producer and consumer* of one field, and neither depends on the other:

- **Idea 04 is a function over the reviewers' outputs.** Given N reviewers' findings, it decides each
  finding's **confidence class** — both flagged it (`agreed`), one flagged it (`single`), they flagged
  in opposite directions (`conflicting`) — and therefore **which findings reach the fixer at all, and
  with what label**.
- **Idea 05 (this card) is a function over the findings already routed to the fixer.** Given a
  finding, it defines **what the fixer is required and permitted to do with it** (reproduce → fix, or
  falsify → `NOT_REPRODUCED`, or `ESCALATED`), and how a non-reproduction is refereed and terminated.
- **The interface is the finding record** (§2.2). Idea 04 fills `confidence class`; idea 05 consumes
  it. With one Skinner — today — every finding is `single` by definition, so **idea 05 is complete and
  correct standing alone.** If idea 04 never ships, nothing here breaks.
- **Reproduce-first applies to *every* finding, regardless of class** — including a 2-reviewer
  `agreed` finding. Fixing blind is the harm, and it is no less harmful because two reviewers
  hallucinated in the same direction. What the class legitimately changes is only the **escalation
  path on non-reproduction**: an `agreed` finding the fixer cannot reproduce is a strong signal that
  the *fixer's reproduction* is at fault (two independent samples flagged it), so it escalates to the
  Warchief immediately rather than waiting for a single Skinner's re-audit to settle it. That is the
  one line idea 04's implementer should add — additively, without touching anything specified here.
  (Note this refines idea 04's own sketch, which says an `agreed` finding "goes straight into the
  fixer's brief" — it still does; it simply is not exempt from being reproduced first.)
- **File collision — the Shaman must not schedule 04 and 05 in the same concurrent wave.** Both edit
  `plugins/tribe/agents/warchief.md` **step 6**, the same ~15 lines. Their `owns_files` are not
  disjoint, so under the Warchief's own wave rules (`warchief.md:332-333, 376-380`) they must be
  sequenced, not parallelised. **Recommended order: 05 before 04** — 05 defines the fixer's contract that 04's
  routing table points at ("only one flags → the fixer is allowed to adjudicate (see Idea 5)",
  `bun-rust-migrate-ideas.md:102-103`), so 04 lands against a fixer role that already exists rather
  than a forward reference to a role that does not.

**Idea 01 (2 independent Skinners) — compatible, and it makes this card *more* valuable.** Idea 01
edits `skinner.md` + `warchief.md` step 6 (dispatch count); this card touches only step 6's *fixer*
half and never `skinner.md`, so the textual overlap is small — but it is still the same section, so
again: **sequence, do not parallelise.** Semantically the composition is clean: doubling the reviewers
doubles the false-positive volume (that is the accepted price of the recall gain — ~p² miss rate),
which is precisely why the cheap-discard layer this card builds should land **before or with** idea 01.
Shipping 01 without 05 doubles the phantom findings while leaving the fixer with no way to discard
one. In §2.5's referee, "the Skinner re-raises it" simply becomes "either Skinner re-raises it".

**Idea 02 (context asymmetry — the Skinner never sees the implementer's reasoning) — this card is
*designed against* that constraint and strengthens it.** The obvious naive design ("pass the fixer's
'not reproduced' explanation to the Skinner so it can reconsider") would punch a hole straight through
idea 02's bias seal: it hands the reviewer a persuasive narrative written by the party that wrote the
code — the exact channel idea 02 exists to close. §2.4 refuses that: **the fixer's counter-evidence
travels only as an artifact in the diff** (a committed test, a re-runnable command), never as its
report or its prose. The Skinner keeps reading only contract + diff + rules, and settles the question
by *running* the artifact. If idea 02 ships, no line of this card needs to change; if it never ships,
this card still behaves as if it had.

**Idea 03 (input asymmetry — a "cold lens" Skinner B with no contract) — synergistic, and it needs
this card.** Idea 03 itself says reviewer B's findings "are **hypotheses** feeding the Warchief's
adjudication, not a verdict" (`bun-rust-migrate-ideas.md:82`) — but idea 03 defines no adjudication
machinery, because *this* card is it. A contract-blind reviewer will naturally produce more false
positives (it cannot tell an intentional design decision from a defect), so the reproduce-first
discipline is the thing that makes a cold lens affordable at all. Ship 05 first.

**Idea 06 (frozen campaign artifact / PORTING.md) — no conflict.** If it lands, the disposition ledger
(§2.2) is a natural section of that artifact rather than living only in the Warchief's report file;
that is a one-line relocation, not a redesign.

**Idea 10 (mechanical tripwires / fix the process, not the code) — the natural follow-up.** The ledger
this card produces is a measurable stream: a campaign whose Critical findings come back
`NOT_REPRODUCED` at a high rate is telling you the *Skinner's prompt* is Goodharting into
nitpick-manufacture (handoff §4.4 principle 2's alarm-fatigue failure), and one whose falsification
tests keep getting refuted by the next round is telling you the *fixer* is Goodharting (risk 1 above).
Both are process bugs, visible only because dispositions are now recorded. A tripwire on that rate is
explicitly **out of scope here** and recommended as a follow-up card.

---

## 8. Definition of done (for the future implementation campaign)

1. `hunter.md` carries the Fixer-mode charter, the disposition vocabulary, the RED-rule carve-out, and
   the "no blind fixing" anti-goal.
2. `warchief.md` step 6 carries the fixer-brief template (with finding IDs + the verbatim mandate),
   the disposition ledger, and the standoff → immediate-`NEEDS_DIRECTION` rule.
3. `README.md` + `claude-md/review-agents.md` distinguish verdict from finding; no doc claims a
   *finding* is authoritative.
4. `bash plugins/tribe/scripts/tests/test-fixer-mandate.sh` → all `ok`, exit 0; the two existing test
   suites still green.
5. The layer-2 dry-run evidence (§5) is embedded in the PR: phantom finding → `NOT_REPRODUCED`, target
   code byte-identical; true finding → `FIXED` with a RED proof.
