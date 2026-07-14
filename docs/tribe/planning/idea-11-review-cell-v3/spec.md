# Spec — Idea 11: review-cell v3 — method asymmetry, a mechanical pre-gate, and measured reviewers

The audit cell becomes **one contract lens + two cold lenses that differ by METHOD** (an executor
that must run things and a reader that may not), auditing a **path-scoped** diff, dispatched only
after a **mechanical pre-gate script** has already proven the branch mechanically sound, and
recorded in a ledger that finally **measures each reviewer's yield**. Idea 03 decorrelated what the
two reviewers *see*; this card decorrelates what they *do* — and stops paying LLM prices for
script work.

## Dependency declaration — this spec is a DELTA, not a standalone design

This card layers on the shipped baselines of ideas 05 (PR #27), 02 (PR #28), 01 (PR #29),
03 (PR #30) and 04 (PR #31) — the fixer mandate, the dispatch seal, the dual-Skinner cell, the
contract/cold input asymmetry, and the disagreement routing. Nothing here re-litigates those laws;
every change below is stated as a delta against the exact shipped text. Owner ruling **D23** minted
and funded this card to the front of the queue; standing rulings **D14** (per-clause mutation bar)
and the **D22** precedent (a sibling suite's eval-count bump is an authorized one-line fence
extension when the spec requires new evals) apply throughout.

Authority note (D23): this spec deliberately **supersedes idea 04's `agreed` definition**
(two-of-three, §Delta-B4 below). Per the D12/D18 doctrine — an unnoticed cross-card interaction is
a spec gap, fixed at the spec, in the open — the supersession is named here, in the spec, before
any code exists.

## Problem

Owner-directed forensics of the idea-03 implementation session (session `9f0c7618`, $35.85), read
against the source article (bun.com/blog/bun-in-rust: "1 implementer, 2 **or more** adversarial
reviewers per implementer", reviewers get **only the diff**), proved four gaps in the shipped cell.
All four are evidence, not inference:

### Gap 1 — the cold lens leaks: the contract rides in on the diff range

Step 6 bans the contract from the cold **brief**, but says nothing about the diff **range** — and
the tribe's spec/plan/state files live in the repo, so every card's full-range diff hands the cold
reviewer the contract anyway. This fired live: idea-03's own audit R6 cold lens self-disclosed
contamination via a full-range diff containing spec, plan and state files. The Shaman accepted the
follow-up; D23 funds it here. Until this is fixed, lens B silently collapses into a second contract
lens and every other cold-lens property is theater.

### Gap 2 — input asymmetry decorrelated the seeing; the DOING is still correlated

Every finding of the idea-03 campaign that earned its cost came from a reviewer that **executed**
something: the reviewer that ran eval 16 live and walked the historical run artifacts (found the
flaky gate), and the reviewer that built a differential tree and ran current tests against old
files (found the vacuous assertions — the only unique per-task finding of the campaign). Read-only
reviewers converged on the same trivial nit six times out of seven. The article's three showcase
bugs (use-after-free, negative-timespec truncation, eager evaluation) are all runtime bugs. Nothing
in the shipped law makes any reviewer run anything beyond the mandated suite sweep.

### Gap 3 — one cold sample is a thin sample, and both real defects had a 1-in-2 detection rate

Both real branch-audit findings of that campaign (stale evals 10-12 encoding superseded laws; the
flaky eval 16) were each caught by **exactly one** reviewer of the pair while the other returned
PASS. The article says "2 **or more**" adversarial reviewers. The cell currently draws exactly one
sample from the "assume the code is wrong" distribution — and it is the cheap kind of reviewer (no
80KB contract read), so a second sample is the cheapest recall the cell can buy.

### Gap 4 — LLM reviewers doing script work

Skinner pairs executed the six tripwire suites **50 times** that campaign, on top of 28 hunter runs
— in the three branch-audit rounds alone, 37 suite executions returned byte-identical green results
every time. Four of the six suites were untouched by any task and still ran about 12 times each.
That is deterministic script work billed at reviewer prices (~48% of session cost was audit), and
it crowds the judgment out of the context window.

## Proposed design

Four deltas. A = path scope, B = the three-lens cell, C = the pre-gate, D = the yield ledger.

### Delta-A — the cold diff is path-scoped, and a contract-bearing range is contamination

**New law (warchief.md step 6, cold-brief rules):** the diff handed to any cold lens is
**path-scoped to operative code**. The Warchief builds it with an explicit exclusion list covering,
at minimum: `docs/tribe/planning/`, `docs/tribe/state/`, and any file that is a committed contract
document for the card under audit. Commit messages stay banned (already law). The forbidden-channel
table in step 6 gains the row: "an un-scoped full-range diff | the tribe's contract documents live
in-repo, so the full range hands the cold lens the contract".

**skinner.md cold-lens delta:** if the diff a cold dispatch carries contains a spec, plan, idea
card, or campaign state file, that is a **contaminated dispatch** — refuse with the existing
`AUDIT: FAIL — CONTAMINATED` mechanism from idea 02 (which already runs before lens-specific review
in every lens, and already consumes no fix round; the CONTAMINATED refusal stays the one `AUDIT:`
line a cold dispatch may emit). This extends the seal's *brief* checklist to the *range*; it does
not create a second refusal mechanism.

The contract lens's diff stays full-range: it holds the contract already, so there is nothing to
protect it from; narrowing it would only blind the conformance check.

### Delta-B — the cell becomes one contract lens + two cold lenses split by METHOD

#### Delta-B1 — Law 1 (three lenses, three briefs, one message)

Law 1's dispatch clause is rewritten: every audit round dispatches **three `skinner` instances as
three tool uses in the same message**, all `model: sonnet`. Skinner A keeps the **contract lens**
exactly as shipped. The cold seat splits into two:

- **`lens: cold-executor`** — the bare path-scoped diff; inherits every shipped cold-lens rule
  (contract suspended, never seeks it, hypotheses only, self-refutation in full), **plus a method
  mandate: it must RUN things.** Execute changed scripts and evals, mutate a guarded clause and
  confirm its tripwire actually trips, feed edge inputs to changed code paths. **Every
  Critical/Important hypothesis it emits must cite command output it ran** (the command and the
  observed output, in the finding) — a reading with no run behind it is not an executor finding
  and goes under Minor/nits at most.
- **`lens: cold-reader`** — the bare path-scoped diff; inherits the same shipped cold-lens rules,
  **plus a method restriction: it must NOT execute the repo's test/eval suites** (the pre-gate
  already ran them; Delta-C). Its job is the static adversarial pass: internal contradictions, two
  rules that cannot both be true, evaluation order, idiom errors, silently swallowed failures. It
  may still read any source file. Running a shell one-liner to *inspect* state (a `grep`, a
  `git show`) is reading, not executing, and stays allowed; the line it may not cross is running
  the suites and evals whose results the pre-gate already carries.

**The two cold lenses never see each other, or the contract lens** — Law 2 (fresh instances,
never sequential, never each other's findings) applies pairwise across all three, unchanged.

**Bare `lens: cold` is deprecated but defined:** a dispatch naming `lens: cold` (idea 03's
original value) is read as `lens: cold-executor`. This keeps every shipped law that references
"the cold lens's brief" (notably idea 04's rung-2 tie-break dispatch) valid without editing it:
the tie-break Skinner C is by construction answering a mechanically decidable question, which is
exactly the executor's method.

#### Delta-B2 — Law 3's tags keep their names; their semantics widen

The merge is still the union, deduped, at the Warchief's layer, no reconciliation round. The three
shipped tags survive with three-lens semantics:

| Tag | New meaning |
|---|---|
| `[both]` | flagged by the contract lens AND at least one cold lens |
| `[contract-only]` | flagged by the contract lens only |
| `[cold-only]` | flagged by one or both cold lenses; the contract lens is silent |

Every `[cold-only]` Critical/Important hypothesis still gets exactly one of the three shipped
dispositions (Confirmed / Refuted-with-evidence / valid-but-out-of-scope), the
"the contract does not require it" refutation stays forbidden, and silence still fails the round.

#### Delta-B3 — Law 4 is unchanged in substance

Only the contract lens holds a verdict; both cold lenses end with their `COLD-LENS: N hypotheses`
line and never an `AUDIT:` line (contamination refusal excepted, as shipped). The round-PASS rule
is reworded only to quantify over both cold reports: the round passes iff the contract lens
returned `AUDIT: PASS` **and** every Critical/Important `[cold-only]` hypothesis **from either
cold lens** has a recorded disposition, none Confirmed. The 3-round fix cap is untouched.

#### Delta-B4 — confidence classes: `agreed` becomes two-of-three (supersedes idea 04's wording)

Idea 04 defined `agreed` as "both reviewers flagged the same location with the same claim
direction". With three reviewers this becomes: **`agreed` = at least two of the three lenses
flagged the same location with the same claim direction** — including the case where both cold
lenses converge and the contract lens is silent: two independent samples from two different
methods converging on one spot is exactly the signal the class exists to reward, with or without
the contract's vote. `single` = exactly one lens flagged it (silence of the other two is not
dissent — Rule A unchanged). `conflicting` keeps idea 04's definition verbatim: same location,
mutually unsatisfiable remedies (Rule B unchanged); with three reviewers a conflict is between the
two lenses that flagged it, whoever they are.

**The routing table is unchanged** (`agreed` → severity raised to Critical, straight to fixer;
`single` → fixer adjudicates, reproduce-first; `conflicting` → the ladder).

#### Delta-B5 — the conflict ladder gains a free majority at rung 2

Rung 1 (citation) is unchanged. Rung 2 changes in one way: **before dispatching a tie-break
Skinner C, check whether the third cell member already voted.** If the lens that is party to
neither side of the conflict flagged the same location in one of the two disputed directions in
its own report, that is already a 2-of-3 majority across independent samples — resolve exactly as
if C had returned that direction (`agreed` for the winner, `DROPPED (tie-break, round N)` for the
loser — recorded with the round's own number and the notation that the majority came from the
cell, not a dispatched C), **spend no tie-break key, dispatch nothing**. Only when the third lens
is silent on the location does rung 2 dispatch C — with `lens: cold-executor` per Delta-B1's
deprecation rule, `disagreement-blind` exactly as shipped, one tie-break per key per campaign,
state-file spend record and all W15 status machinery unchanged. Rung 3 is unchanged.

### Delta-C — a mechanical pre-gate runs before any Skinner exists

**New script: `plugins/tribe/scripts/pre-gate.sh`.** Stateless, parameterized, no repo-specific
values baked in (repo-wide skill-authoring rule):

- Inputs (CLI args): the repo/worktree path, the git range under audit, the tests directory to
  sweep, the report-file path to write, and optionally a scope-fence file of allowed path globs.
- Behavior: runs every `test-*.sh` in the tests directory and captures each suite's pass/fail
  tallies and exit code; checks every commit in the range carries a `Tribe-Card:` trailer and no
  `Co-Authored-By` trailer; if a fence file is given, verifies every file changed in the range
  matches an allowed glob; writes a single Markdown report (the range audited, per-suite tallies,
  trailer results, fence results, timestamp) to the report path and a JSON summary to stdout
  (repo script convention, same as `validate-plan.sh`).
- Exit codes: 0 = all checks green; 1 = at least one check red; 2 = setup error.

**New law (warchief.md step 6, a step-6.0 preamble):**

1. **Run the pre-gate before dispatching any Skinner.** A red pre-gate means the deliverable under
   audit is mechanically incomplete — that is the Hunter's unfinished work, **not an audit round**:
   route the script report back to a fixer Hunter as an ordinary incomplete-deliverable follow-up.
   No Skinner is dispatched against a mechanically broken branch, and no fix round is consumed by a
   red pre-gate (an audit round begins only on a green pre-gate).
2. **The contract lens's brief carries the pre-gate's report** (path or content) **as settled
   mechanical fact.** Admissibility: the report is the machine output of committed scripts run
   against the committed diff — contract-class by the D9 test (produced independently of anyone's
   narrative about the code), not the code side's prose; the idea-02 seal is not breached. The
   cold lenses' briefs do NOT carry it (it names suites and counts, which is contract-shaped
   context they have no business holding).
3. **Reviewer briefs stop mandating full-suite re-runs.** The shipped "RUN all six suites" brief
   clause is retired. The contract lens still runs whatever proof the CONTRACT requires (targeted
   suites, evals, commands) and may re-run any suite to falsify a specific hypothesis; the
   cold-executor runs targeted experiments by mandate; the cold-reader runs none (Delta-B1).
   What no reviewer does any more is re-execute the full sweep whose result is already in the
   pre-gate report.

### Delta-D — the ledger measures the reviewers

The disposition ledger (idea 05, extended by idea 04) gains one column, filled by the Warchief
when a finding's row is first written:

| Column | Values |
|---|---|
| `lens` | `contract` / `cold-exec` / `cold-read`, comma-joined when more than one lens raised it |

And the Warchief's report file gains one small per-round table, **`## Reviewer yield`**, appended
when the round's merge completes — one row per lens, columns: findings raised, unique (no other
lens raised the location), confirmed, refuted, out-of-scope. It is derived entirely from the
ledger's rows for that round (no new bookkeeping source), it is the human-readable rollup, and it
is what lets the Shaman decide **from data, after two campaigns**, whether the cold-reader earns
its seat, whether the contract lens needs a partner, or whether the cell should shrink — instead
of by feel. Like the report file itself it is non-authoritative and never used for resume.

## What changes, file by file (for the implementation campaign)

| File | Change |
|---|---|
| `plugins/tribe/agents/skinner.md` | Lens-mode section: `cold` splits into `cold-executor` / `cold-reader` (shared cold base rules stated once; two method subsections); bare `cold` deprecation ruling; path-scope contamination rule (Delta-A) |
| `plugins/tribe/agents/warchief.md` | Step 6: step-6.0 pre-gate law; Law 1 three-lens dispatch + path-scoped cold diffs; forbidden-channel table row; Law 3 tag semantics; Law 4 quantifier wording; confidence classes two-of-three; rung-2 free majority; ledger `lens` column + `## Reviewer yield` table; every "two Skinners"/"pair" consistency site (frontmatter, header, anti-goal 4, step-5 model note, dispatch contract, wave-failure text, final-report template) updated to the three-lens cell |
| `plugins/tribe/scripts/pre-gate.sh` | New script (Delta-C) |
| `plugins/tribe/scripts/tests/test-review-cell-v3.sh` | New tripwire suite guarding every delta above |
| `plugins/tribe/scripts/tests/test-dual-skinner-cell.sh` | Deliberate supersession of the two-Skinner assertions (enumerated in Testing strategy below) |
| `plugins/tribe/scripts/tests/test-input-asymmetry.sh` | Deliberate supersession of the assertions that pin idea 03's exact Law-1/Law-4 wording where this card rewrites it |
| `plugins/tribe/scripts/tests/test-disagreement-routing.sh` | Deliberate supersession of the assertions pinning idea 04's `agreed` two-reviewer wording and the rung-2 always-dispatch wording |
| `plugins/tribe/evals/evals.json` | Four new behavioral evals (ids from max existing + 1); the idea-03 suite's total-eval-count assertion bumps by four (pre-authorized here per the D22 precedent — arithmetic, not law) |

## Scope fence

**In scope:** the files in the table above, and nothing else.

**Out of scope, explicitly:**

- `plugins/tribe/agents/hunter.md` and `plugins/tribe/agents/shaman.md` — no role changes.
- Warchief step 5 (wave orchestration) beyond the named consistency sites; ideas 07/08/09 territory.
- `resume-check.sh` and all resume/round-accounting machinery — the D15c/F12/D17/D19/D22
  follow-up family stays separate and unfunded; this card neither fixes nor worsens the known
  mid-audit resume gap.
- The eval runner (`scripts/evals/run_evals.py`) — evals are added as data only.
- Idea 04's tie-break state-file machinery (W15 statuses, spend records) — rung 2's free-majority
  check happens before any of it engages and touches none of its records.
- Replacing exact-count eval assertions with presence checks — that is the accepted D22 follow-up
  card, not this one; this card takes the same one-line bump idea 04 took, with disclosure.

## Testing / verification strategy

**The new suite `test-review-cell-v3.sh`** is the card's tripwire (offline, no network, same
`has`/`hasnt` flattened-haystack pattern as its siblings, each assertion scoped to the section it
guards, never whole-file). It must assert, at minimum: the three-lens Law 1 (three tool uses, one
message); the `cold-executor` run-evidence mandate; the `cold-reader` suite-execution ban; the
bare-`cold` deprecation ruling; the path-scope law and its contamination extension; the pre-gate
step-6.0 law (red pre-gate is not an audit round; contract brief carries the report; cold briefs
do not); the two-of-three `agreed` definition; the rung-2 free-majority clause; the `lens` ledger
column and the `## Reviewer yield` table; and the retirement of the mandatory full-sweep brief
clause (a `hasnt` on the retired wording at its old site).

**Pre-gate script self-test:** the suite also executes `pre-gate.sh` twice against the repo
itself — once with a range and fence chosen to pass (expected exit 0 and a report file whose
tallies match the suites' own output) and once with a deliberately violated fence (expected
exit 1 and the violation named in the report). The script is code, so it is tested by running it,
never by grepping its source.

**Deliberate supersessions (edited, never silently deleted; each edit justified in the commit):**

- `test-dual-skinner-cell.sh`: `law1: both dispatched in the same message` (needle
  `two tool uses in the same message`) → three; `law1: step 6 audits with two Skinners` and the
  seven `consistency:` sites (frontmatter, header, anti-goal 4 twice, dispatch contract,
  wave-failure, step-5 model note, final report) → three-lens wording. The suite's own header
  comment gains the supersession note, same as idea 03's precedent inside this very file.
- `test-input-asymmetry.sh`: only the assertions that pin Law 1's "two lenses, two briefs" and
  Law 4's round-PASS quantifier wording; the lens-content assertions (cold never sees the
  contract, COLD-LENS terminator, dispositions) survive unchanged.
- `test-disagreement-routing.sh`: only the assertions pinning "both reviewers flagged" in the
  `agreed` definition and the unconditional "dispatch one third Skinner" wording at rung 2; all
  tie-break bookkeeping assertions survive unchanged.

**D14 bar:** every NEW or EDITED assertion ships under the per-clause mutation bar — delete only
the clause the assertion guards, prove that assertion (and only the intended set) goes red,
restore. Whole-file reverts do not satisfy the bar.

**Behavioral evals (4 new):**

1. A `cold-executor` dispatch whose diff contains a subtle runtime defect: the graded expectation
   is a Critical/Important hypothesis that cites the command it ran and the output that manifests
   the defect.
2. A `cold-reader` dispatch: the graded expectation is that it produces its static findings and
   does not execute the test suites (the transcript shows no suite invocation).
3. A Warchief handed a cold dispatch whose diff range includes a planning/spec file: the graded
   expectation is the CONTAMINATED refusal path — re-dispatch with a scoped range, no fix round
   consumed, never routed to a fixer.
4. A Warchief handed three reports where both cold lenses flag the same location and the contract
   lens is silent: the graded expectation is class `agreed`, severity raised to Critical, routed
   straight to the fixer.

Eval grading bars follow the shipped convention: `expected_output` states the observable behavior;
prompts must close their world (the eval-16 deflake lesson — hand the agent everything it needs so
it never stalls asking for missing files).

## Evidence plan (before/after for the PR)

- BEFORE: current suite tallies (all suites green at their shipped counts); the shipped step-6
  text quoted at the sites each delta rewrites; 20 evals.
- AFTER: all prior suites green at their (deliberately superseded) counts; `test-review-cell-v3.sh`
  green; pre-gate self-test green both ways; 24/24 evals including the four new ones; per-clause
  mutation transcript for every new/edited assertion.

## Risks & rollback

- **Risk: the three-lens rewrite ripples wider than the enumerated consistency sites.** Mitigation:
  the existing suites ARE the enumeration — every site that matters is pinned by an assertion, and
  the supersession list above was derived by reading those assertions' needles. Anything unpinned
  and missed is caught by the final whole-branch audit's coherence mandate ("a prompt that states
  two conflicting rules is a defect even when every tripwire is green").
- **Risk: the cold-reader's suite-execution ban is read as banning all shell.** Mitigation: the
  law draws the line explicitly (inspecting state is reading; running suites/evals is executing),
  and an assertion pins the distinction.
- **Risk: pre-gate false greens (a suite the diff should have added is absent, so the sweep
  passes vacuously).** Mitigation: the pre-gate reports what it RAN, per suite, and the contract
  lens holds the contract that says what should exist — the gate replaces re-execution, never the
  conformance check.
- **Risk: rung-2 free majority mistakes co-location for a vote.** Mitigation: the clause reuses
  Rule B's own test verbatim (same location AND same claim direction), and rung 2's fallback
  (dispatch C) is unchanged whenever the third lens is silent or flagged a different direction.
- **Rollback:** every delta is prompt/script text guarded by its own suite; reverting the card is
  reverting its commits — no data migration, no persistent state format changes (the ledger
  column and yield table are additive to an append-only report file).

## Interactions with other ideas

- **Idea 06 (campaign codex):** textual collision in the step-6 brief-contents region (D9's
  admissibility clause lands where Delta-C edits) — never the same wave; this card goes first
  (D23 order). Delta-C's admissibility argument deliberately reuses D9's contract-class test so
  the two clauses compose when 06 lands.
- **Idea 10 (meta-loop tripwires):** builds on Delta-D's ledger column and yield table (11 before
  10 per D23); 10's findings-ledger sink should treat `lens` as an existing column, not invent it.
- **Idea 04 (shipped):** Delta-B4 supersedes its `agreed` wording, named above; Delta-B5 narrows
  when its rung 2 dispatches C; everything else (W15, spend records, triggers, rung 1/3) is
  untouched and its suite assertions outside the enumerated supersessions must stay green.
- **Idea 03 (shipped):** the lens split refines, never contradicts: everything the shipped cold
  lens was forbidden (contract, peer reports, verdicts) remains forbidden for both sub-lenses.
- **Idea 02 (shipped):** Delta-A extends the seal from brief to range using the same CONTAMINATED
  mechanism; Delta-C threads the pre-gate report through the seal's own admissibility logic.
- **The D15c/F12/D17/D19/D22 follow-up family:** untouched (out of scope, above).
