# Spec — Idea 03: input asymmetry between the two Skinners (contract lens / cold lens)

> Card: `idea-03-input-asymmetry` · Branch: `planning/idea-03-input-asymmetry`
> Status: PLANNING-ONLY — this spec plus `plan.md` are the deliverable. No `plugins/` file is
> touched by this campaign; the plan's tasks are executed by a future implementation campaign.

## Dependency declaration — this spec is a DELTA, not a standalone design

**This card is meaningless on its own and must never be implemented before idea 01.**
(Owner ruling D3, settled law.)

It layers on **idea 01 — the dual-Skinner audit cell**
(`docs/tribe/planning/idea-01-dual-skinner-cell/spec.md`, authored concurrently, read at
commit `6024112` on `planning/idea-01-dual-skinner-cell`), whose baseline this spec **assumes as
already-built** and does **not** re-design:

| Idea 01 law (the baseline) | Assumed by this spec |
|---|---|
| **Law 1 — concurrent dispatch** | Warchief step 6 dispatches **two `skinner` instances in one assistant message** (two tool uses ⇒ concurrent), both `model: sonnet`, **both on an identical brief**. |
| **Law 2 — context isolation** | Neither Skinner sees the other's brief, findings, verdict, report path, or existence as a source of claims; every fix-round re-dispatches two **fresh** instances; `skinner.md` carries the reciprocal "never seek or accept a peer's findings" invariant. |
| **Law 3 — the merge** | The Warchief unions + dedupes both reports' Critical/Important findings, tags each `[both]` / `[one]`, and preserves both reports verbatim in its report file. |
| **Law 4 — the verdict** | **PASS requires BOTH Skinners to return PASS**; either `AUDIT: FAIL` or `UN-AUDITABLE` fails the round; 3-round fix cap unchanged. |

**What THIS card changes, and nothing else:** idea 01's Law 1 sentence "both receive the
**identical brief**" and the parts of Laws 3–4 that assume two verdict-bearing reviewers.
Everything else in the baseline — same-message concurrency, isolation, fresh instances per round,
union+dedupe merge, both reports preserved verbatim, the 3-round cap, the `sonnet` tier — is
**inherited untouched**. This spec re-designs neither the cell nor the dual-reviewer mechanism.

Idea 01 itself anticipated exactly this delta (its Interactions table, row 03): *"03 replaces
'identical brief' with 'brief A = contract + diff, brief B = bare diff', and demotes B's output to
hypotheses… Handled by keeping Law 1 and Law 4 as separately-labelled, self-contained clauses
rather than one blended paragraph, so 03 can swap them cleanly."* This spec is written to that
seam.

## Problem

Idea 01 buys a second reviewer. **It does not buy a second set of blind spots** — and the second
set of blind spots is the entire thing you were paying for.

### The recall arithmetic idea 01 leans on holds only under independence

Idea 01's justification is the pair-recall estimate: a reviewer that misses a bug with probability
`p`, joined by an independent reviewer that also misses with `p`, misses jointly with ~`p²` (each
catching ~70% ⇒ the pair catches ~91%). That multiplication is valid **only if the two miss-events
are independent**. Idea 01 protects independence on exactly one axis — *context isolation*: neither
reviewer may read the other (its Law 2). That closes the **anchoring / social-conformity** channel
(handoff §4.1: "two clamp jaws welded together are just a stick").

It leaves the other axis wide open. After idea 01, the two Skinners are:

- the **same model** (`skinner.md:16` — `model: sonnet`), running
- the **same prompt** (`skinner.md` is one file; both instances get it verbatim), against
- the **same input** (idea 01, Law 1: *"Both receive the **identical brief**"*).

Same model + same prompt + same input ⇒ **the two error distributions are the model's own error
distribution, sampled twice.** The only decorrelating force left is sampling stochasticity. Where
`sonnet` is systematically blind — a bug class it does not think to look for when handed a spec and
a diff — it is blind in *both* windows, and running ten instances would miss it ten times. Handoff
§4.2 names this precisely: *"cùng model, cùng prompt, cùng diff → chia sẻ điểm mù của chính model;
p² là cận trên lạc quan"* ("same model, same prompt, same diff → they share the model's own blind
spots; p² is an optimistic upper bound"). Idea 01 knows this and says so in its own scope fence —
it dispatches identical briefs *deliberately*, and points at this card.

### The tribe's Skinner has one specific, structural blind spot: it reads the contract first

This is not a hypothetical. It is written into the agent:

- `skinner.md:19-24` — *"The contract is the Source of Truth — the codework is not."* The
  Skinner's whole frame is **conformance**: does the code match the contract?
- `skinner.md:63-98` (Method step 1) — before anything else, it hunts for a requirement contract,
  walking a strict chain (caller-given → spec/plan → Jira → PR description). **If it finds none it
  must STOP and return `FAIL` with `UN-AUDITABLE:`** (`skinner.md:96-98`). A Skinner without a
  contract is, today, structurally incapable of reviewing at all.
- `skinner.md:117` (Method step 3) — *"Read the contract **fully, first** — before looking at the
  code."*
- `skinner.md:199-202` — its central artifact is a **conformance matrix**: one row per requirement,
  each row asking "is this requirement evidenced?"

Read the code *through* the contract and you find the bugs the contract lets you see. The contract
supplies the questions; the questions steer the eye. That is exactly what you want for
"is the requirement met?" — and exactly what makes the reviewer walk past a bug the requirement
never thought to mention.

**The empirical shape of the bugs this misses** is the strongest available evidence, from the
source this whole card set is drawn from. The three real bugs adversarial review caught in the Bun
Zig→Rust port were: a **use-after-free** in `Box<uv::Pipe>`, `trunc()` on **negative mtimes**, and
**eager evaluation** inside `unwrap_or`. Every one of them *compiled cleanly and looked plausible*.
Not one of them is a conformance failure — the port plan never said "do not hold a raw pointer past
a move"; there was no requirement row for "`unwrap_or`'s argument is evaluated eagerly". They are
**correctness** failures, visible only to an eye that is reading the code *as code*, with no
contract to pull its attention along. Handoff §4.2's proposed remedy is the design this card
implements: *"bất đối xứng hóa input thay vì prompt"* — asymmetrize the **input**, not the prompt.

### Why not just assign the two reviewers different lenses ("you check memory, you check logic")?

Because that trades a random blind spot for a **systematic** one, which is the worse deal. Handoff
§4.2 dissects it as **taxonomy risk**: whoever writes the lens list must guess the bug taxonomy in
advance, and a bug in the dimension nobody thought of (the `unwrap_or` eager-evaluation bug is
neither "memory" nor "port fidelity") lands in a hole *by construction* — specialization makes each
reviewer actively ignore what is outside its lens. **This card therefore does not partition the bug
space at all.** It changes *what each reviewer is allowed to know*, and lets each one look for
anything it likes with the eyes that input gives it. Two input distributions ⇒ two error
distributions, with nobody having to predict the taxonomy.

### The gap, stated once

After idea 01, the tribe has two reviewers with one pair of eyes. Nothing in `warchief.md` or
`skinner.md` can express "review this diff **without** a contract" — and `skinner.md:96-98` actively
forbids it (`UN-AUDITABLE` ⇒ instant FAIL). The cold, contract-free review that catches
use-after-free-class bugs is not merely absent from the tribe: **it is currently illegal.**

## Proposed design

Keep idea 01's cell exactly as it is. Make the **two briefs different**, and make the second
reviewer's output a different *kind of thing*.

```
                  ┌─ Skinner A · CONTRACT LENS ─────────────────────────────┐
   diff  ────────►│ spec + plan + diff + repo rules; runs the proof         │──► AUDIT: PASS|FAIL
                  │ asks: "does this meet the contract?"                    │    (authoritative)
                  └─────────────────────────────────────────────────────────┘
        (same message,                                                              ▼
         concurrent,                                                        ┌───────────────┐
         never see                                                          │   WARCHIEF    │
         each other)                                                        │  adjudicates  │──► round PASS/FAIL
                  ┌─ Skinner B · COLD LENS ─────────────────────────────────┐└───────────────┘
   diff  ────────►│ the bare diff ONLY. No spec. No plan. No card.          │──► COLD-LENS: N hypotheses
                  │ primed: "assume the code is wrong"                      │    (NOT a verdict)
                  │ asks: "why doesn't this code work?"                     │
                  └─────────────────────────────────────────────────────────┘
```

Four laws, each a **delta** on the correspondingly-numbered law of idea 01. They are prompt text in
`warchief.md` (step 6) plus a mode switch in `skinner.md`.

### Delta-Law 1 — Two lenses, two briefs (replaces idea 01's "identical brief")

Both dispatches stay in **one assistant message**, both stay `subagent_type: skinner`, both stay
`model: sonnet`, both stay isolated from each other (idea 01, Laws 1–2, unchanged). What changes is
what goes in each brief. The dispatch must state its lens explicitly — `lens: contract` or
`lens: cold` — as the first line of the brief.

**Skinner A — the contract lens.** Exactly today's Skinner, unchanged in every respect. Its brief
carries: the contract (this Warchief's spec + plan), the diff under audit, the repo's rules, and its
own report path. It runs the proof (`skinner.md:141-150`). It returns the conformance matrix and the
authoritative `AUDIT: PASS | FAIL` verdict line (`skinner.md:234-245`).

**Skinner B — the cold lens.** Its brief carries **only**:

1. the diff under audit (the same unified diff A gets — the *same code*, that is the point);
2. the instruction to assume the code is wrong and find the reasons it does not work;
3. its own report path.

and **explicitly must not carry** — this is an exhaustive, enforceable list, not a vibe:

| Forbidden in the cold brief | Why |
|---|---|
| the spec, the plan, the idea card, or any path to them | they are the contract; supplying them collapses B into A |
| the Hunter's report, its reasoning, its RED proof, its self-assessment | *"the Claude that wrote the code wants the code to get accepted"* (`skinner.md:19-22`) — this is idea 02's channel, and the cold lens is its strictest possible form |
| the Warchief's narrative ("this task was straightforward", "the Hunter was careful") | same bias channel, different mouth |
| commit messages, branch name, PR body, task titles | each is a compressed restatement of the contract |
| the other Skinner's findings, verdict, or report path | idea 01's Law 2, inherited verbatim |

The cold lens is **not blind to the codebase** — the distinction matters and must be written
plainly. It may read any source file, run read-only commands, and explore the repo to *understand
the code it is reviewing*. What it is denied is **the statement of what the code was supposed to
do**. It reviews the code as code. And it must be told, in `skinner.md`, that if it stumbles on a
spec/plan file on disk it must **not** read it — the same shape as idea 01's "never seek out a
sibling report file you happen to find".

### Delta-Law 2 — Verdict authority is asymmetric (replaces idea 01's "both must PASS")

**Only the contract lens holds a verdict.** The reason is not hierarchy, it is logic: a verdict is a
statement about the *contract*, and B has never seen the contract. Asking B to PASS/FAIL would be
asking it to rule on a question it was deliberately denied the inputs to answer.

Therefore, in `skinner.md`:

- **Cold mode suspends the contract hunt.** Method step 1's contract chain and its
  `UN-AUDITABLE` stop (`skinner.md:63-98`) **do not apply in cold mode** — "no contract" is the
  assignment, not a failure. Without this single change the cold lens instantly returns
  `AUDIT: FAIL — UN-AUDITABLE`, and this card is dead on arrival. Likewise step 3's *"Read the
  contract fully, first"* (`skinner.md:117`) and the conformance matrix (`skinner.md:199-202`) are
  suspended: there is no contract to inventory and no conformance to matrix.
- **Cold mode emits no `AUDIT:` line — ever.** Its report ends with a machine-judgeable line of a
  *different shape*:

  ```
  COLD-LENS: 3 hypotheses — 1 critical, 2 important (0 refuted during self-audit)
  ```

  `COLD-LENS: 0 hypotheses` is a valid, honorable, expected outcome. This is deliberate and
  load-bearing: handoff §4.4's second principle is that the Skinner **must have an honorable PASS
  path**, because an adversarial prior that *requires* a catch will Goodhart — it will invent
  nitpicks to meet its suspicion quota, and the tribe ends up with alarm fatigue, where a reviewer
  that cries wolf devalues every review after it. "Assume the code is wrong" is a prior that makes
  the reviewer *more suspicious*, **not** a duty to be right and **not** a quota to fill.
- **Everything else about the Skinner is unchanged in cold mode** — and one item especially:
  **step 7's self-refutation pass (`skinner.md:167-182`) still applies, fully.** Each hypothesis
  must survive a genuine attempt to refute it, must name a `file:line`, and must be falsifiable
  (`skinner.md:38-40`: prose is never evidence). A hypothesis the cold lens itself refuted goes in
  its "Refuted during self-audit" section and is not emitted. This is what keeps the union list
  from filling with noise.

### Delta-Law 3 — Cold findings are hypotheses, and hypotheses get **dispositioned**, never dropped

This is the delta on idea 01's Law 3 merge, and it is where the safety property that idea 01's
"both must PASS" was protecting gets **preserved by other means**. It must, or this card is a
regression: idea 01 chose both-must-PASS on the cost-asymmetry argument (handoff §4.3 — a false
positive costs a cheap fix round; a false negative ships a bug into a million lines nobody will
re-read). Stripping B's verdict without a replacement would hand the Warchief a silent licence to
wave away exactly the use-after-free-class finding this card exists to obtain.

The replacement rule:

- **Tag vocabulary refines, and stays mappable onto idea 01's.** Every merged finding carries
  exactly one of:

  | Tag | Meaning | Maps onto idea 01's tag |
  |---|---|---|
  | `[both]` | flagged by the contract lens **and** the cold lens | `[both]` |
  | `[contract-only]` | flagged only by A | `[one]` |
  | `[cold-only]` | flagged only by B — a **hypothesis** | `[one]` |

  `[both]` is now strictly stronger evidence than it was under idea 01: two *different input
  distributions* converged on the same location, rather than one distribution sampled twice.
  The tag is recorded and passed into the fixer Hunter's brief. **This card does not route on the
  tag** — the routing table is idea 04, and this card must not preempt it (see Interactions).

- **Every `[cold-only]` Critical/Important hypothesis must be given an explicit, recorded
  disposition by the Warchief.** Exactly one of three, written into the report file:

  1. **Confirmed** → it enters the fixer Hunter's brief. The round FAILs; a fix round opens.
  2. **Refuted** → the Warchief records **positive evidence that the code is correct** —
     a `file:line` or command output showing the hypothesis does not hold. The round is not blocked
     by it.
  3. **Valid but out of scope** → the hypothesis is real but concerns code outside this change's
     fence (e.g. a pre-existing bug the diff merely sits next to). It is recorded as a **follow-up
     for the Shaman** in the final report and does not block the round.

- **The one refutation that is forbidden:** *"the contract does not require it."* A cold hypothesis
  is a claim about **correctness**, not conformance; "the spec never mentioned use-after-free" is
  not evidence that there is no use-after-free. A hypothesis may only be refuted by evidence about
  **the code**. Writing this prohibition down is the whole point — it is the exact rationalisation a
  contract-holding Warchief will reach for.

- **An undispositioned `[cold-only]` hypothesis fails the round.** Silence is not a disposition.
  This is `skinner.md:56-57` and `:232` ("Bias toward FAIL… uncertainty is never PASS") applied one
  layer up, and it is what makes the round-PASS rule below safe.

### Delta-Law 4 — The round-PASS rule (replaces idea 01's Law 4 unanimity)

A round PASSes **iff both** hold:

1. the **contract lens** returned `AUDIT: PASS` (an `AUDIT: FAIL` or `UN-AUDITABLE` from A still
   fails the round — inherited unchanged from idea 01), **and**
2. **every** Critical/Important cold-lens hypothesis has a recorded disposition, and none is
   *Confirmed*.

Note what this preserves: under idea 01, a genuine bug seen only by reviewer B failed the round
(B returned FAIL, and PASS required both). Under this card it *still* fails the round — via
disposition (1), Confirmed. What changed is only **who adjudicates a B-finding that is wrong**: a
false positive from B no longer mechanically forces a fix round; the Warchief may refute it with
evidence about the code (and, once idea 05 lands, the fixer Hunter may drop what it cannot
reproduce). That is precisely the trade handoff §4.3 argues for — *"don't make the reviewer right;
make its wrongness cheap"* — and it is what lets B be aggressive without the system dying of noise.

Unchanged from idea 01: the 3-round fix cap; each round re-dispatches **two fresh** instances (one
per lens); on a round-3 FAIL the Warchief stops and returns `NEEDS_DIRECTION` with **both** round-3
reports attached verbatim; both reports (and now the disposition record) are preserved verbatim in
the Warchief's report file — never summarized away.

### What changes, file by file (for the FUTURE implementation campaign)

| File | Change |
|---|---|
| `plugins/tribe/agents/warchief.md` | Step 6: the identical-brief clause (idea 01 Law 1) becomes the two-lens brief spec incl. the cold brief's forbidden-contents list; the merge clause gains the 3-tag vocabulary + the disposition rule + the forbidden refutation; the verdict clause becomes the round-PASS rule above |
| `plugins/tribe/agents/skinner.md` | A **lens mode switch**: `lens: contract` (default — today's behavior verbatim) vs `lens: cold`. Cold mode: contract hunt + `UN-AUDITABLE` suspended; never read a spec/plan/card found on disk; no conformance matrix; **no `AUDIT:` line** — a `COLD-LENS: N hypotheses` line instead; `0 hypotheses` is an honorable outcome; self-refutation still mandatory |
| `plugins/tribe/evals/evals.json` | Four behavioral evals: asymmetric briefs actually dispatched; the cold Skinner does not go read the spec sitting on disk and does not emit `AUDIT:`; the Warchief does not PASS a round holding an undispositioned cold hypothesis, and does not refute one with "the contract doesn't require it"; a clean diff yields `COLD-LENS: 0 hypotheses` rather than invented nitpicks |
| `plugins/tribe/scripts/tests/test-input-asymmetry.sh` | New mechanical tripwire asserting each of the four delta-laws is present in the prompt text |

## Scope fence

**In scope:** what each of the two lenses receives; how the cold-lens dispatch prompt differs; how
`skinner.md` supports a contract-free mode without self-destructing on `UN-AUDITABLE`; how cold-lens
hypotheses feed the Warchief's adjudication **without carrying verdict authority**; the tag
vocabulary and disposition record that carry that.

**Explicitly out of scope:**

- **The dual-reviewer mechanism itself** — concurrent same-message dispatch, context isolation,
  fresh-instance-per-round, union+dedupe, both-reports-verbatim, the 3-round cap, the `sonnet` tier.
  All inherited from idea 01 (Owner ruling D3: do not re-design it).
- **The disagreement-routing table** (idea 04). This card *emits* `[both]` / `[contract-only]` /
  `[cold-only]` and defines a *disposition* for cold hypotheses. It must **not** add a routing
  table, confidence weighting, a third review round, or "`[both]` ⇒ Critical by default".
- **Fixer adjudication authority / reproduce-before-fixing** (idea 05). This card's disposition rule
  is performed by the **Warchief**; it must not edit `hunter.md` or the fixer's mandate.
- **Banning the Hunter's reasoning from the *contract* lens's brief** (idea 02). This card bans it
  from the **cold** brief only, as a consequence of the cold brief's contents list. Lens A's brief
  contents remain idea 02's business.
- **Two different *models*** as a further decorrelation step (handoff §4.2's "heavier" variant).
  Both lenses stay `sonnet`. Recorded as a possible future card; not this one.
- **Assigning bug-class lenses** ("A checks memory, B checks logic") — rejected in Problem above as
  taxonomy risk; this card must not introduce one.
- Any change to the contract lens's behavior, report format, or verdict; to the Tracker, the Shaman,
  or the plan/spec conventions.

**Fence for THIS (planning) campaign:** only `docs/tribe/planning/idea-03-input-asymmetry/` and
`docs/tribe/state/` are created or changed. **Zero changes under `plugins/`** — the prompt text
lives inside `plan.md` as the content a future Hunter will apply.

## Testing / verification strategy

The repo has **no CI workflows** (`.github/` does not exist) and no unit-test framework. Its two
real proof mechanisms — both used by the atomic-resume PR (#22) — are:

1. **Bash fixture tests** — `plugins/tribe/scripts/tests/test-*.sh`, run directly, printing `ok -` /
   `not ok -` lines, exiting non-zero on failure (`test-validate-plan.sh`, `test-resume-check.sh`).
2. **Behavioral evals** — `plugins/tribe/evals/evals.json`
   (schema `{skill_name, kind, evals:[{id, name, agent, prompt, expected_output, files?}]}`, 9 evals
   today, ids 1–9), graded by `scripts/evals/run_evals.py`.

So the future implementation campaign proves this card on two levels:

- **Mechanical (red→green, per task):** a new `test-input-asymmetry.sh` asserts the four delta-laws
  are written into the prompts — the two-lens brief split, the cold brief's forbidden-contents list,
  the `skinner.md` cold-mode switch (contract hunt suspended, `COLD-LENS:` line, no `AUDIT:` line,
  honorable zero), the 3-tag vocabulary, the disposition rule incl. the forbidden refutation, and
  the round-PASS rule. It is a **tripwire, not a behavior test**: it proves the law is *written* and
  screams if a later edit deletes it.
  **It additionally asserts the idea-01 baseline is present** — the tripwire doubles as this card's
  dependency check, so a campaign that runs this plan before idea 01 has landed fails on line one
  with a clear message instead of silently editing text that isn't there.
- **Behavioral (end of branch):** four evals that separate a real input-asymmetric cell from a fake
  one. Notably an eval where **the spec is sitting right there on disk** and the cold Skinner must
  not read it, and one where a clean diff must yield `COLD-LENS: 0 hypotheses` instead of invented
  nitpicks (the anti-Goodhart guard).
- **Regression:** `test-validate-plan.sh` and `test-resume-check.sh` must stay green (this card
  touches neither script — a cheap guard against collateral edits), and idea 01's own
  `test-dual-skinner-cell.sh` must **still pass after this card's edits**. That last one is the
  load-bearing regression: this card rewrites clauses idea 01's tripwire asserts. Where a
  delta-law genuinely supersedes an idea-01 assertion (the identical-brief clause; both-must-PASS),
  the plan updates that specific assertion in `test-dual-skinner-cell.sh` **in the same task**, and
  states why — a superseded assertion is edited deliberately, never deleted silently.

## Evidence plan

The change is prompt text; "before/after" is textual and behavioral, not visual.

- **Before:** `git show HEAD:plugins/tribe/agents/warchief.md` step 6 (the post-idea-01, identical-brief
  two-Skinner cell) and `skinner.md:63-98` (the contract hunt with its `UN-AUDITABLE` stop) — quoted
  verbatim in the PR body.
- **After:** the rewritten step 6 and the new cold-mode section, side by side.
- **Mechanical proof:** terminal output of `bash plugins/tribe/scripts/tests/test-input-asymmetry.sh`
  going red → green across the tasks, with its `N passed, 0 failed` tail; plus
  `test-dual-skinner-cell.sh`, `test-validate-plan.sh`, `test-resume-check.sh` all green at the end.
- **Behavioral proof:** `python3 scripts/evals/run_evals.py` output for the four new evals — in
  particular the transcript showing a cold Skinner **declining to read the spec** it could see on
  disk, and a Warchief **refusing to PASS** a round with an undispositioned cold hypothesis.
- **No CI:** the future campaign's delivery step must record "no CI registered" explicitly rather
  than reading an empty run list as green (Warchief step 7's `exit 2` path).

## Risks & rollback

| Risk | Mitigation |
|---|---|
| **The cold lens self-destructs on `UN-AUDITABLE`.** `skinner.md:96-98` orders a Skinner with no contract to STOP and FAIL. Ship the Warchief-side change without the `skinner.md` mode switch and every cold dispatch returns an instant, meaningless FAIL. | This is the single highest-risk item and it is why the plan puts the `skinner.md` cold-mode switch in **Task 1, before** any Warchief-side dispatch change. The tripwire asserts the suspension explicitly. |
| **A cold `AUDIT: FAIL` line is mistaken for a verdict** by an automated caller (`skinner.md:234-245` promises that line is machine-judgeable). | Cold mode is forbidden from emitting an `AUDIT:` line at all; its terminator is `COLD-LENS: N hypotheses`. Asserted by the tripwire (`hasnt AUDIT:` inside the cold-mode section) and by an eval. |
| **Goodharted noise.** "Assume the code is wrong" + no contract to bound scope ⇒ the cold lens invents nitpicks to justify itself, and the fixer thrashes. Alarm fatigue devalues every later review. | Three guards: the honorable `COLD-LENS: 0 hypotheses` path is written into the prompt *and* eval'd; `skinner.md`'s self-refutation pass (`:167-182`) still applies in full, so every hypothesis must survive a genuine refutation attempt and name a `file:line`; and only **Critical/Important** hypotheses can block a round. Idea 05 (fixer may drop unreproducible claims) is the structural relief and lands **before** this card. |
| **The Warchief becomes the weak link** — it holds the contract, so it will be tempted to wave away cold hypotheses ("the spec doesn't ask for that") and hand back the very false-negative idea 01's both-must-PASS was buying. | The forbidden refutation is written as an explicit prohibition, an undispositioned hypothesis mechanically fails the round, and the disposition record is preserved verbatim in the report file where the Shaman reads it on escalation. This is also the sharpest thing for the future campaign's own Skinner audit to check. |
| **The cold lens flags real bugs outside the diff's scope**, dragging fix rounds into unrelated code. | Disposition 3 ("valid but out of scope") exists exactly for this: it is recorded as a follow-up for the Shaman and does not block the round. Scope fences stay intact. |
| **Merge conflict with sibling cards** — 01, 02, 04 all rewrite the same region of step 6, and 01/02 also edit `skinner.md`. | Sequenced, never parallelized: **05 → 01/03 → 04** (verified order; see Interactions). This card's tripwire asserts idea 01's text exists before editing it. |
| **The tripwire is grep-level and could pass on text that is present but incoherent.** | Acknowledged (inherited from idea 01's identical risk): the evals are the behavioral backstop, and the branch-level Skinner audit reads the actual prose. The tripwire's job is regression protection, not comprehension. |

**Rollback:** confined to prompt text, one new test file, four eval entries. `git revert` of the
implementation PR restores idea 01's symmetric two-Skinner cell exactly — the tribe resumes
identical-brief dual audits on the next dispatch, with no state, no migration, no cleanup. If idea
01 itself is reverted, this card must be reverted first (it is a strict superset of 01's text).

## Interactions with other ideas

**Verified sequencing fact for the step-6 cluster (from the sister specs):
implementation order is `05 → 01/03 → 04`.** Idea 05 lands first (it gives the fixer Hunter the
authority to drop unreproducible claims — the relief valve that makes an aggressive cold lens safe
to add); ideas 01 and 03 land as a pair, 01 first, since 03 is a delta on 01's exact text; idea 04
lands last, consuming the tags the pair emits. Idea 02 is adjacent and must not run concurrently
with 03 (they edit the same brief-contents clause).

| Idea | Relationship | Conflict / overlap and how it is handled |
|---|---|---|
| **01 — dual-Skinner cell** | **HARD DEPENDENCY — this card is a delta on it and is meaningless alone.** | 03 cannot exist without two reviewers to asymmetrize. It rewrites 01's Law 1 identical-brief clause and 01's Law 4 unanimity rule, and refines 01's `[both]`/`[one]` tags into `[both]`/`[contract-only]`/`[cold-only]` (mapping preserved, so 04 still plugs in). 01 anticipated this and kept those laws as separate, self-contained clauses precisely so 03 can swap them cleanly. **03 must land after 01**, and its tripwire test asserts 01's baseline text is present before touching it. 01's `test-dual-skinner-cell.sh` assertions that 03 supersedes (identical-brief, both-must-PASS) are edited **deliberately, in the same task, with a stated reason** — never deleted silently. |
| **02 — the Skinner never sees the Hunter's reasoning** | **Same channel, different reviewer — complementary, textually overlapping.** | 02 bans the implementer's reasoning from *the Skinner's* brief in general. 03's cold brief bans it too, as one line in a longer forbidden-contents list — the cold lens is 02's rule taken to its strictest form (it bans the contract as well). **They agree, so the risk is purely textual:** both rewrite the brief-contents clause of step 6, and both edit `skinner.md`'s Operating rules. **Do not run 02 and 03 concurrently.** If 02 lands first, 03 extends the list it wrote (and must keep 02's ban applying to lens A, which 03 does not otherwise touch); if 03 lands first, 02 tightens lens A's brief only, since lens B's is already stricter. |
| **04 — disagreement is a routing signal** | **Consumes this card's output; must land after it.** | 04's routing table keys on the agreement tags. This card *sharpens the input to that table*: after 03, `[both]` means two **different input distributions** converged — materially stronger evidence than 01's "one distribution sampled twice" — and `[cold-only]` is explicitly a hypothesis, which is exactly 04's "one flags, one is silent → let the lower layer adjudicate" row. **This card must not build that table** (scope fence). One genuine seam to respect: 03's disposition rule and 04's routing table both govern what happens to a `[cold-only]` finding — **04 must layer its routing on top of the disposition rule, not replace it**, or the "never silently drop a cold hypothesis" safety property is lost. Flagged here so 04's spec inherits it. |
| **05 — the fixer may DROP claims (reproduce-first)** | **Lands BEFORE this card (verified order); it is the structural relief valve.** | An aggressive, contract-free reviewer *will* produce false positives — that is the accepted price (handoff §4.3: buy cheap false positives to avoid expensive false negatives). 05 is what makes them cheap: the fixer reproduces before fixing and records "not reproduced + evidence" instead of fixing blind. Because 05 lands first, **03's disposition rule delegates to it rather than duplicating it**: a *Confirmed* cold hypothesis enters the fixer's brief tagged `[cold-only]` — a hypothesis, to be reproduced first. 03 therefore edits **no** part of `hunter.md`. Without 05, 03 is still correct but noisier; with it, the pair is exactly Bun's 4-role cell. |
| **06 — frozen campaign codex (`CODEX.md`)** | **Independent, but ONE sharp constraint falls out — flag it into 06's spec.** | 06 adds the campaign codex to every Skinner's brief as an extra rule source. **The codex is contract-shaped intelligence.** Feeding it to the cold lens would re-contaminate exactly the input this card isolates and silently undo the whole card. **If 06 lands, its "add the codex to the Skinner brief" rule must be scoped to the contract lens only** — the codex belongs on 03's cold-brief forbidden-contents list. No textual conflict; a semantic one, recorded here. |
| **07 — mechanical work queue** | **Independent.** | Changes where tasks come from, not how audits run. Every queue line still becomes one task and thus one two-lens audit. No shared text. |
| **08 — `integrate-wave.sh`** | **Independent, adjacent text.** | 08 rewrites step 5; 03 rewrites step 6. Neighbouring sections of `warchief.md`, no shared clause. 01 already notes a trivial two-line consistency edit around `warchief.md:397`/`:438`; 03 adds none of its own. Sequence if convenient; not dangerous. |
| **09 — ephemeral Warchief per wave** | **Independent; one invariant to respect.** | 09 kills and re-dispatches the Warchief between waves. This card puts new state in the Warchief's head — **the disposition record for every cold hypothesis**. That record is written into the **report file** (not held in context), so a re-dispatched Warchief inherits it. 09 must not drop that rule, exactly as it must not drop 01's "both reports preserved verbatim". Compatible by construction, provided the report file stays the medium. |
| **10 — meta-loop: recurring failures become Tracker rules** | **Independent; synergistic, and sharpened by this card.** | 10 promotes a failure pattern into a Tracker rule once it recurs. Input asymmetry makes that trigger sharper in two ways: a `[both]` finding is now agreement across two *different* input distributions (strong evidence for promotion), and a **recurring `[cold-only]` class** — e.g. evaluation-order bugs that the contract lens structurally never sees — is the single best candidate for a mechanical Tracker rule, because it names a blind spot the contract-driven gate cannot close on its own. No textual conflict. |
| **Bonus — trial run before fanning out** | **Synergistic.** | Running one representative task through the full cell before a wide wave is a cheap way to measure the cold lens's false-positive rate before it costs a whole wave of fix rounds. Presumes the cell; lands after 01/03. |
