# Spec — Idea 01: the dual-Skinner audit cell

> Card: `idea-01-dual-skinner-cell` · Branch: `planning/idea-01-dual-skinner-cell`
> Status: PLANNING-ONLY — this spec plus `plan.md` are the deliverable. No `plugins/` file is
> touched by this campaign; the plan's tasks are executed by a future implementation campaign.

## Problem

Tribe's most authoritative gate is a **single sampling run**.

Warchief Method step 6 (`plugins/tribe/agents/warchief.md:441-454`) reads, in full:

> After each task (and once more across the whole branch at the end), dispatch the **skinner**
> against the diff, pointed at YOUR spec + plan and the repo's rules. It runs the proof. Feed
> Critical/Important findings back to a fixer Hunter and re-audit — **cap fix-rounds at 3.**

One Skinner is dispatched. It produces one verdict, in one context window, from one sampling
trajectory (`skinner.md:1-16` — `model: sonnet`, tools `Read, Grep, Glob, Bash, Skill`, returning
a `RESULT: PASS | FAIL` report whose final line is the machine-judgeable `AUDIT:` verdict,
`skinner.md:229-245`). Everything downstream of that verdict trusts it completely: anti-goal #4
"Never trust 'done'" (`warchief.md:240-244`) makes the Skinner the thing that *is* trusted, the
loop in step 6 fixes until it says PASS, and the Warchief's final report to the Shaman states
"audited PASS against the spec by the skinner" (`warchief.md:535`) as the tribe's whole claim to
correctness.

**The gap:** one reviewer means one set of blind spots, and the blind spots of a single LLM
sampling run are not random noise — they are systematic. If a bug sits where that trajectory does
not look, nothing else in the tribe is looking either. The Hunter cannot catch it (it wrote the
code, and `skinner.md:19-22` exists precisely because "the Claude that wrote the code wants the
code to get accepted"). The Warchief does not re-derive the proof. There is no second gate.

**What Bun did instead** (the source this card is drawn from — blog pseudocode reproduced verbatim
in the handoff, appendix B.1):

```js
let task;
while ((task = todoList.pop())) {
  const result = task();
  const feedback = await Promise.all([review(result), review(result)]);
  await apply(feedback, result);
}
```

`Promise.all([review(result), review(result)])` — the same review function called **twice, in
parallel, in two isolated context windows that never see each other**. The stated architecture is
"1 implementer, 2 or more adversarial reviewers per implementer" (handoff §2.2), and the
recall arithmetic is the whole point: a reviewer that misses a bug with probability `p` is joined
by a second, independent reviewer that also misses it with probability `p`; the pair misses with
roughly `p²`. Concretely, two reviewers that each catch ~70% catch ~91% together. That estimate
holds **only while the two runs are independent** (handoff §4.1) — the moment reviewer B can read
reviewer A's findings, correlation goes to 1 and the second reviewer is worth nearly nothing: it
anchors on A's locations, and LLM social-conformity does the rest ("two clamp jaws welded together
are just a stick").

Tribe today has no rule that would even *permit* a second reviewer, let alone protect its
independence or say what to do with two verdicts. That is what this card fixes, and nothing more.

## Proposed design

Replace the single Skinner dispatch in step 6 with a **two-Skinner cell**: two independent
adversarial reviewers, dispatched concurrently, merged by the Warchief one layer above. Four laws,
all of them prompt text in `warchief.md` plus one invariant in `skinner.md`.

### Law 1 — Concurrent dispatch, in ONE message

Every Skinner dispatch in step 6 becomes **two `skinner` dispatches issued in the same assistant
message** (two tool uses in one message, which is what makes them run concurrently — the tribe
already relies on this mechanism, and the Agent tool's own guidance states it). Both instances are
`subagent_type: skinner`, `model: sonnet` (unchanged tier — the cost of the whole upgrade is one
extra sonnet run per audit round).

Both receive the **identical brief**: the contract (this Warchief's spec + plan), the diff under
audit, the repo's rules, and their own distinct report path. Deliberately identical — diversity
comes from sampling stochasticity, exactly as in Bun's `review(result), review(result)`. Assigning
the two reviewers different *lenses* is explicitly **not** part of this baseline (see Interactions:
that is card 03, and doing it naively trades random blind spots for systematic ones).

Same-message dispatch is not merely an optimization: it is what makes Law 2 structurally true.
A Warchief that dispatches sequentially has, by construction, read A's findings before briefing B.

### Law 2 — Context isolation (the invariant that makes the second reviewer worth anything)

- Neither Skinner's brief may contain the other's findings, verdict, report path, or existence as
  a source of claims.
- The Warchief may not dispatch the second Skinner after reading the first's report, may not ask
  either Skinner to review, reconcile, or comment on the other's findings, and may not resolve a
  disagreement by re-dispatching one Skinner with the other's report attached.
- Each fix-round re-dispatches **two fresh** Skinner instances. A Skinner is never reused across
  rounds — a reused instance carries its own prior findings and anchors on itself.
- `skinner.md` gains the reciprocal invariant: the Skinner is told it is one of two independent
  reviewers, that it must build its own understanding from the contract and the proof alone, and
  that it must never seek out or accept a peer reviewer's findings (including by reading a sibling
  report file it happens to find on disk). It reports only what it independently derived.

### Law 3 — The merge (the Warchief's new job)

The Warchief merges at the layer above, mechanically, without a reconciliation round:

- **Union, then dedupe.** The merged finding list is the union of both reports' Critical and
  Important findings. Two findings that name the same location and make the same claim collapse
  into one entry.
- **Every merged finding carries an agreement tag:** `[both]` if both Skinners flagged it,
  `[one]` if only one did. The tag is *recorded and passed into the fixer Hunter's brief*; the
  baseline does not yet route differently on it. Emitting this signal without acting on it is
  deliberate — it is the seam card 04 (disagreement routing) plugs into, and card 04 is a separate
  card.
- **Both reports are preserved verbatim** in the Warchief's report file (never summarized away):
  they are the evidence trail, and on escalation they are what the Shaman reads.

### Law 4 — The verdict from two verdicts

- **PASS requires BOTH Skinners to return PASS.** Any `AUDIT: FAIL` from either instance fails the
  round and opens a fix round. There is no majority with two reviewers, so unanimity-to-PASS is the
  only coherent rule — and it is the one the cost asymmetry demands (handoff §4.3: a false positive
  costs a cheap fix round; a false negative ships a bug nobody will ever re-read). It also preserves
  `skinner.md:224` verbatim: "When in doubt, FAIL."
- An `UN-AUDITABLE` result from either instance is a FAIL, as today.
- **The 3-round fix cap is unchanged.** A round is now "both Skinners re-dispatched in parallel".
  If round 3 still fails, the Warchief stops and returns `NEEDS_DIRECTION` with **both** round-3
  reports attached verbatim.
- **Head-on conflict** (A demands a change in one direction, B demands the opposite) is handled by
  the adjudication sentence step 6 already carries: the Warchief, which holds the authoring context,
  adjudicates, and a genuine plan-versus-card conflict goes up as `NEEDS_DIRECTION` immediately. The
  baseline adds no new routing policy here — card 04 owns that table.

### What changes, file by file

| File | Change |
|---|---|
| `plugins/tribe/agents/warchief.md` | Step 6 rewritten into the 4 laws above; the five other places that speak of "the skinner" singular (anti-goal #4 at :240-244, step 5's model note at :438, the wave-failure text at :397, the final-report line at :535, and the header at :29) made consistent with a two-Skinner cell |
| `plugins/tribe/agents/skinner.md` | One new Operating-rules invariant: you are one of two independent reviewers; never seek or accept a peer's findings |
| `plugins/tribe/evals/evals.json` | Three new behavioral evals: concurrent dual dispatch; no-PASS-when-one-FAILs; no cross-Skinner leakage |
| `plugins/tribe/scripts/tests/test-dual-skinner-cell.sh` | New mechanical contract test (grep-level tripwire) asserting the prompt text carries the four laws |

## Scope fence

**In scope (the baseline, and only the baseline):** how two Skinners are dispatched concurrently;
the isolation invariant between them; how the Warchief merges their findings; how PASS/FAIL is
decided from two verdicts.

**Explicitly out of scope — each is a separate card that LAYERS on this baseline:**

- **Input asymmetry / differentiated lenses** (card 03). This baseline dispatches two *identical*
  briefs. It must not introduce a "contract lens" and a "cold lens".
- **Disagreement routing policy** (card 04). This baseline *tags* agreement and stops there. It must
  not add a routing table, a third review round, or confidence-weighted handling.
- **Fixer adjudication authority / reproduce-before-fixing** (card 05). The fixer Hunter's mandate is
  untouched here.
- **Banning the Hunter's reasoning from the Skinner's brief** (card 02). Related and adjacent, but a
  different rule about a different leakage channel; this card does not implement it.
- Any change to the Skinner's report format, its PASS/FAIL criteria, its model tier, or the 3-round
  cap.
- Any change to the Tracker, the Hunter, or the Shaman.

**Fence for THIS (planning) campaign:** only `docs/tribe/planning/idea-01-dual-skinner-cell/` and
`docs/tribe/state/` are created or changed. **Zero changes under `plugins/`** — the actual prompt
text lives inside the plan as the content a future Hunter will apply.

## Testing / verification strategy

The repo has no unit-test framework and no CI workflows (`.github/` does not exist); its two real
proof mechanisms, both used by the atomic-resume PR (#22), are:

1. **Bash fixture tests** — `plugins/tribe/scripts/tests/test-*.sh`, run directly, printing
   `ok -` / `not ok -` lines and exiting non-zero on failure.
2. **Behavioral evals** — `plugins/tribe/evals/evals.json` (schema: `id`, `name`, `agent`, `prompt`,
   `expected_output`, `files`), run by `scripts/evals/run_evals.py`, which grades an agent's actual
   behavior against `expected_output`.

So the future implementation campaign proves this change on two levels:

- **Mechanical (red→green per task):** a new `test-dual-skinner-cell.sh` asserts that the prompt
  text carries each of the four laws — dual same-message dispatch, the isolation invariant in both
  `warchief.md` and `skinner.md`, the union-plus-agreement-tag merge, and the both-must-PASS verdict
  rule. This is a **tripwire test, not a behavior test**: it proves the law is written, and it
  fails loudly if a later edit deletes one. Each plan task writes its assertion first, watches it
  fail against the unmodified prompt, then edits the prompt to green.
- **Behavioral (end of the branch):** three new evals put a Warchief in situations that separate a
  real dual-Skinner cell from a fake one — one where it must dispatch both reviewers in a single
  message, one where Skinner A says PASS and Skinner B says FAIL (it must not ship), and one where
  it is tempted to hand A's findings to B (it must not). Run with
  `python3 scripts/evals/run_evals.py` per that harness's README.
- **Regression:** the existing `test-validate-plan.sh` and `test-resume-check.sh` must still pass —
  this change touches neither script, so they are a cheap guard against collateral edits.

## Evidence plan

The change is prompt text, so "before/after" is textual and behavioral, not visual:

- **Before:** `git show HEAD:plugins/tribe/agents/warchief.md | sed -n '441,454p'` — the single
  Skinner dispatch, captured verbatim in the PR body.
- **After:** the rewritten step 6, side by side with it in the PR body.
- **Mechanical proof:** terminal output of `bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh`
  going from red (before the prompt edits) to green (after), pasted into the PR with its
  `N passed, 0 failed` tail; plus the two existing test scripts still green.
- **Behavioral proof:** `run_evals.py` output for the three new evals, showing a Warchief actually
  dispatching two Skinners concurrently and refusing to PASS on a split verdict.
- Because the repo has no CI, the future campaign's delivery step must record "no CI registered"
  explicitly rather than treating an empty run list as green (the Warchief's own step 7 `exit 2`
  path).

## Risks & rollback

| Risk | Mitigation |
|---|---|
| **Cost/latency doubling on every audit round.** Two sonnet runs per round, up to 3 rounds, per task. | Accepted and bounded: the Skinner is the cheap tier (`sonnet`), the two runs are concurrent so wall-clock is roughly unchanged, and the cost asymmetry (handoff §4.3) is the entire argument for the card. No change to model tier. |
| **False-positive inflation.** Two adversarial reviewers produce more findings, and the union rule keeps all of them — the fixer Hunter could thrash on noise. | Bounded by the 3-round cap (unchanged), and by the agreement tag telling the fixer which findings only one reviewer saw. The real remedy is card 05 (fixer may drop unreproducible claims); this card must not preempt it, but the tag is what makes that later card cheap. |
| **Independence quietly decays.** A future Warchief edit reintroduces sequential dispatch, or someone "helpfully" passes A's report to B. | The isolation invariant is asserted by `test-dual-skinner-cell.sh` and by an eval; both fail loudly. This is exactly why the tripwire test exists. |
| **The tripwire test is grep-level and could pass on prompt text that is present but incoherent.** | Acknowledged: the evals are the behavioral backstop, and the branch-level Skinner audit reads the actual prose. The test's job is regression protection, not comprehension. |
| **Merge conflict with sibling planning cards** (02 and 03 edit the same region of `warchief.md` step 6 and of `skinner.md`). | Flagged in Interactions below with a recommended landing order; the future implementation campaigns must sequence, not parallelize, these three. |

**Rollback:** the change is confined to prompt text plus one new test file and three eval entries.
`git revert` of the implementation PR restores the single-Skinner step 6 exactly; nothing persists
in state files, no data migration, no dependency. The tribe would resume single-Skinner audits on
the next dispatch with no cleanup.

## Interactions with other ideas

This card is the **baseline of the adversarial-review cluster** (ideas 01–05 in
`bun-rust-migrate-ideas.md`). Four of the other nine ideas layer directly on it; the rest are
independent but touch adjacent text.

| Idea | Relationship | Conflict / overlap and how it is handled |
|---|---|---|
| **02 — ban leaking the Hunter's reasoning into the Skinner** | **Adjacent, same files, different rule.** 02 seals the *implementer→reviewer* channel; 01 seals the *reviewer↔reviewer* channel. | **Real merge-conflict risk:** both edit step 6 of `warchief.md` and the Operating rules of `skinner.md`. They are complementary, not contradictory — 01's brief-contents list ("contract + diff + repo rules + own report path") is *already* the shape 02 wants to make explicit, so 02 lands as a tightening of a list 01 introduced. **Recommended order: land 01 first, then 02 rewrites the brief-contents clause once, in one place, for both reviewers.** The ideas file's suggested order (2 → 1) also works but forces 02 to be re-applied to a second dispatch site when 01 arrives; landing 01 first avoids that. Either way: **sequence them, never run both implementation campaigns concurrently.** |
| **03 — decorrelate via INPUT asymmetry (contract lens / cold lens)** | **Layers directly on 01.** 03 is meaningless without two reviewers to asymmetrize. | 01 deliberately dispatches two *identical* briefs and says so in its scope fence; 03 replaces "identical brief" with "brief A = contract + diff, brief B = bare diff", and demotes B's output to hypotheses. That means **03 edits the exact clause 01 writes (Law 1) and modifies Law 4** (only the contract-lens reviewer holds the authoritative verdict). Handled by keeping Law 1 and Law 4 as separately-labelled, self-contained clauses rather than one blended paragraph, so 03 can swap them cleanly. 03 must land **after** 01. |
| **04 — disagreement is a routing signal** | **Layers directly on 01.** 04 consumes exactly the signal 01 emits. | 01's Law 3 tags every merged finding `[both]` or `[one]` but takes no action on the tag. 04 turns that tag into a routing table (`[both]` → Critical by default; `[one]` → fixer adjudicates; head-on conflict → extra round or escalate). **This is a deliberate seam, not a conflict:** 01 was designed to produce the tag precisely so 04 is a small additive edit rather than a rewrite. 04 must land **after** 01. |
| **05 — the fixer may DROP claims (reproduce-first)** | **Layers on 01; strongly complementary.** | 01 doubles the finding volume (union rule), which raises exactly the false-positive pressure 05 relieves by letting the fixer Hunter drop unreproducible claims. 05 edits `hunter.md` and the fixer-brief clause in step 6 — a *different* clause than 01's Law 3 merge, so the textual conflict is small. 01 does not change the fixer's mandate. **Recommended: 05 lands soon after 01** (the ideas file's build order 2 → 1 → 5 → 4 agrees). |
| **06 — frozen CODEX.md per campaign** | **Independent; mildly synergistic.** | 06 gives every Skinner one more rule source to read. It changes what goes *into* a Skinner brief, which is 01's Law 1 territory — but as an addition to the shared, identical brief, so both Skinners get it and independence is unaffected. No conflict; if 06 lands first, 01's brief-contents clause simply names the codex too. |
| **07 — mechanical work queue (`build-queue.sh`)** | **Independent.** | Changes where *tasks* come from, not how audits run. Each queue line still becomes one task and thus one dual-Skinner audit — 01 makes 07's cells 4-role cells. No shared text. |
| **08 — `integrate-wave.sh` (wave orchestration into code)** | **Independent, adjacent text.** | 08 rewrites step 5 (wave merging) into a script; 01 rewrites step 6. They touch neighbouring sections of `warchief.md` but not the same clauses. One caveat: 01 makes a small consistency edit to step 5's model-tier note (`warchief.md:438`, which currently says the step-6 judgment call "stays on the skinner", singular) and to the wave-failure text at `:397` — if 08 lands concurrently, that is a trivial two-line conflict. Sequence if convenient; not dangerous. |
| **09 — ephemeral Warchief per wave** | **Independent; one interaction to respect.** | 09 kills and re-dispatches the Warchief between waves. Since 01 keeps *no* Skinner state across waves (fresh instances every round, both reports written verbatim into the report file), a re-dispatched Warchief loses nothing. 01 is compatible by construction — but it is 01's "both reports preserved verbatim in the report file" rule that makes it so, and 09 must not drop it. |
| **10 — meta-loop: repeated failure pattern → new Tracker rule** | **Independent; synergistic.** | 10 triggers on "the same failure pattern appears ≥2 times". With two reviewers, 01's `[both]` agreement tag is a *sharper* input to that trigger — a pattern flagged by two independent reviewers across two cards is stronger evidence for promoting it into a rule. No textual conflict; 10 edits step 6's tail and the Tracker's rule sources. |
| **Bonus — trial run before fanning out** | **Synergistic.** | The bonus proposes running one representative task through the full cell before dispatching a wide wave. It presumes the cell that this card builds; it can only land after 01. |

**The one hard rule that falls out of this table:** ideas 01, 02, 03 and 04 all rewrite step 6 of
`warchief.md`. Their implementation campaigns must be **sequenced, not parallelized**, with 01
first (it is the only one that creates the structure the others edit). 05, 06, 07, 08, 09 and 10
can proceed independently of that chain.
