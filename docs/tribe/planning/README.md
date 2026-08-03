# Planning campaign: Bun-rewrite ideas → tribe specs + plans

10 idea cards from `docs/tribe/ideas/bun-rust-migrate-ideas.md`, each turned into a spec + a
validate-plan.sh-passing plan by a dedicated Warchief in its own worktree (planning-only:
nothing under `plugins/` changed). Every spec carries an "Interactions with other ideas"
section; the constraints below are the union of those sections, verified pairwise-consistent.

| # | Card | Plan tasks | Spec/plan |
|---|------|-----------|-----------|
| 01 | dual-skinner-cell — step-6 audit becomes a 2-Skinner cell (4 laws) | 4 | `idea-01-dual-skinner-cell/` |
| 02 | context-isolation — allowlist seal on Skinner dispatch, CONTAMINATED refusal | 3 | `idea-02-context-isolation/` |
| 03 | input-asymmetry — contract lens vs cold lens (delta on 01, ruling D3) | 4 | `idea-03-input-asymmetry/` |
| 04 | disagreement-routing — adjudication table over 2 reviewers' findings | 5 | `idea-04-disagreement-routing/` |
| 05 | fixer-adjudication — findings are hypotheses; reproduce-first fixer | 4 | `idea-05-fixer-adjudication/` |
| 06 | campaign-codex — frozen greppable CODEX.md forged per campaign | 7 | `idea-06-campaign-codex/` |
| 07 | mechanical-queue — build-queue.sh, queue.tsv as plan task source | 6 | `idea-07-mechanical-queue/` |
| 08 | integrate-wave-script — integrate-wave.sh replaces step-5 prose | 8 | `idea-08-integrate-wave-script/` |
| 09 | ephemeral-warchief — intentional HANDOFF exit per wave | 9 | `idea-09-ephemeral-warchief/` |
| 10 | meta-loop-tripwires — findings ledger + self-minted tripwire rules | 8 | `idea-10-meta-loop-tripwires/` |
| 11 | review-cell-v3 — path-scoped cold diff, cold executor + cold reader, mechanical pre-gate, measured reviewers | 5 | `idea-11-review-cell-v3/` |

## Implementation-campaign sequencing constraints (binding, from the specs)

- **step-6 cluster:** `05 → 01/03 → 04`. 05 first (cheap-discard layer before reviewer volume
  doubles); 04 last. 01's plan carries a mandatory anchor check so its step-6 rewrite composes
  with (never overwrites) 05's fixer template/ledger/standoff rule.
- **02 ⊥ 03:** textual collision on the step-6 brief-contents clause + skinner.md Operating
  rules — never the same wave; either order works.
- **step-5 cluster:** 07, 08, 09 pairwise overlap warchief.md step 5 — each in its own wave.
  **08 before 09** (08 is 09's precondition). Whichever of 08/09 lands first MUST carry the
  `base-sha`/`wave-base-sha` split fix (latent resume bug found by 09's grounding).
- **06 before 10:** the codex is 10's tripwire-rule sink (`Category: tripwire` reserved).
- **11 (step-6 cluster, delta on shipped 01/02/03/04/05):** textual collision with 06's CODEX
  admissibility clause (D9) in the step-6 brief-contents region — never the same wave, and 11
  goes first per D23. **11 before 10** (10's ledger sink builds on 11-T4's per-reviewer
  columns). 11-T2 deliberately supersedes idea-04's `agreed` definition (two-of-three) — named
  in the spec per the D12/D18 doctrine.

## Owner rulings encoded (Decision Log)

- **D3:** card 03 is a delta layered on card 01's baseline.
- **D4:** tripwire ratification = Shaman-only, under 4 machine-checkable conditions
  (recurred in ≥2 cards; backtest fires ≤25% of last 20 merged commits; Decision Log entry;
  blocker budget cap 12), owner veto + auto-escalation for repo-wide high-blast rules;
  the Warchief never ratifies. Grep-guarded in idea-10's plan.

## Implementation campaign (started 2026-07-13, Shaman-run)

Owner directive: implement ALL remaining bun-rewrite cards; no owner escalation; OKRA frame
set aside for now ("ignore okra at the moment"). Build strictly per the committed specs/plans
(settled law, PR #25). 05 shipped in #27.

Build order (satisfies every binding constraint above):
**02 → 01 → 03 → 04 → 06 → 10 → 07 → 08 → 09** — serial, one Warchief per card, one wave at
a time, each in its own worktree branched from current master.

| Card | Status |
|---|---|
| 05 | SHIPPED — PR #27 |
| 02 | SHIPPED — PR #28 (cc45990), verify-shipped PASS, 35/35 isolation assertions green on master |
| 01 | SHIPPED — PR #29 (b1f508a), verify-shipped PASS, 130/130 assertions + 12/12 evals green |
| 03 | SHIPPED — PR #30 (d21724c), verify-shipped PASS, 175/175 assertions + 16 evals green; suite hardened 34→46 per-clause-mutation-proved |
| 04 | SHIPPED — PR #31 (1c0af4c), verify-shipped PASS, 358/358 assertions across 7 suites + 20 evals green on master |
| 11 | FUNDED — next up per D23 (owner); card + spec + plan committed (plan validate-plan.sh-passing, 5 tasks); implementation Warchief starts at step 4 |
| 06, 10, 07, 08, 09 | PARKED per D21 (owner); resume order re-set by D23: **11 → 06 → 10 → 07 → 08 → 09** |

### Decision Log (implementation campaign)

- **D5** (2026-07-13 · owner): implement all remaining cards, no escalation to owner; OKRA
  frame/DKR results set aside per owner instruction — advisory only, not gates.
- **D6** (2026-07-13 · Shaman): build order 02 → 01 → 03 → 04 → 06 → 10 → 07 → 08 → 09
  (roadmap's suggested order corrected for the binding `06 before 10` constraint; step-5
  cluster last, 08 before 09).
- **D7** (2026-07-13 · Shaman): resume-check's `REVERT_AND_REDO task 1` on all 10 cards is the
  known planning-only false positive (follow-up candidate #1 below); no work is in flight —
  campaign starts fresh from master 75b9a92.
- **D8** (2026-07-13 · Shaman): commit convention for this repo = the repo's established style
  (`type(scope): subject`, imperative), **no Co-Authored-By / attribution trailers** (global
  non-negotiable). Idea-05's intake adjudications (plan-checkbox ticking is in scope; no-CI →
  step-7 exit-2 path with `gh pr checks` recorded) carry forward as precedent for all cards.

- **D9** (2026-07-13 · Shaman, from idea-02's ship report): idea-06's CODEX is admissible to a
  Skinner dispatch only if **contract-class** (decisions frozen before/independently of the
  code), never narrative-class — this goes into idea-06's dispatch as a standing constraint so
  the codex never becomes a bias channel that re-opens the idea-02 seal.

- **D10** (2026-07-13 · Shaman, idea-01 ship): the Warchief's eval-10 repair is ACCEPTED as
  legitimate — the eval as planned ordered an audit of an empty sandbox (unreachable behavior);
  `expected_output` stayed byte-identical, only the prompt became reachable, so the pass bar
  did not move. Not the "fix the test until it passes" failure mode.
- **Follow-up candidates from idea-01** (not funded yet): (a) pluralize #28's singular
  fix-round clauses in step 6; (b) eval-2 fails under `--exec-model haiku` but passes at
  default tier — harness model-tier sensitivity may deserve a card.

- **D11** (2026-07-13 · Shaman, idea-03 NEEDS_DIRECTION): **Option A granted** — one
  amended 4th fix round. Ruling: a plan's test code is a MEANS to the contract, never the
  contract itself — a tripwire that stays green when the feature is deleted satisfies nothing,
  so deviating from the plan's literal grep text to feature-unique anchors is conformance, not
  deviation. Scope of the round: H1 (cold-mode carve-out; the CONTAMINATED refusal takes
  precedence — a contaminated cold dispatch must have exactly one order), H2 (tighten the 4
  non-discriminating greps), H3 (replace the vacuous `hasnt` with the real superseded phrase),
  H4 (content assertion guarding evals 10-12's rewrite — pulled into scope, same defect class).
  Acceptance bar: the delete-the-feature mutation test must leave only the 3 by-design-green
  assertions passing; then one fresh dual audit. If that round FAILs → back to me, no 5th.

- **D12** (2026-07-13 · Shaman, idea-03 final-audit NEEDS_DIRECTION): **F7 ruled (a) RATIFY** —
  idea-03's spec is amended (Delta-Law 2 + Risk-row-2) to carve out the contamination case: the
  spec's "no `AUDIT:` line — ever" exists to stop the cold lens returning a CODE verdict; a
  `CONTAMINATED` refusal is a verdict on the DISPATCH, not the code, and idea-02's seal already
  defines exactly one refusal token that consumes no fix-round. Splitting refusal into two
  tokens would fracture one concept across every future caller. The spec's "ever" predates the
  noticed interaction — a spec gap, not an implementation defect. One surgical round granted:
  re-anchor F5 per-clause ('the spec, the plan, the idea card, a ticket, or any path to them'),
  settle F6, adopt the PER-CLAUSE mutation bar (whole-file reverts proven too coarse), amend the
  spec text. Then one fresh dual audit; FAIL → back to me.
- **D12a** (standing, all future cards): an authorization/ruling is an ARTIFACT, not a claim —
  every Shaman ruling a Warchief acts on must land in the card's state file BEFORE the work it
  authorizes proceeds (lesson from idea-03 F8).

- **Follow-up candidate from idea-03 (Shaman-accepted — FUNDED by D23 as idea-11 T1):**
  path-scope the cold lens's diff. Step 6 forbids the contract in the cold BRIEF but not in the diff RANGE — and the
  tribe's spec/plan/state files live in the repo, so every tribe card's full-range diff hands
  the cold reviewer the contract. Law needed: "path-scope the cold lens's diff to operative
  code, excluding contract documents." Found by dogfooding idea-03's own audit (R6 cold lens
  self-disclosed contamination via `git diff b1f508a..6070bca` containing spec/plan/state).

- **D13** (2026-07-13 · Shaman, idea-03 F10): **Option (a) granted — the FINAL round, with a
  hard stop.** F10 is not a new defect class; it is the unfinished half of H1 (already ruled
  real in D11): the H1 precedence fix covered the Method but not the file's pre-Lens-mode
  opening. Scope: ONE precedence sentence in the Lens-mode section declaring all text before it
  contract-lens-only + ONE tripwire anchored on it (per-clause mutation bar applies) + nothing
  else. Then one fresh dual audit. HARD STOP: after that audit, any remaining Minor findings
  ship as follow-up candidates — no further rounds unless the fresh audit surfaces a NEW
  Critical. Convergence evidence on record: R3 Critical class → R6 Critical → R6b 0 Critical /
  1 Important. F11 (Minor, double-anchored assertion) ships as a follow-up note.

- **D14** (2026-07-13 · Shaman, standing from idea-03's ship): **per-clause mutation is the
  standing acceptance bar** for any tripwire/assertion suite a card ships — delete ONLY the
  clause an assertion guards and prove that assertion goes red; whole-file reverts no longer
  satisfy the bar (they let a Critical hollow assertion survive certification this campaign).
- **Follow-up candidates from idea-03** (unfunded): (a) F12 — Law 4's escalation wording
  assumes two FAIL reports, but a round can fail with the contract lens at PASS (occurred,
  audit R6b); make it verdict-neutral. (b) `gh pr merge` from a repo with worktrees prints a
  false-alarm "'master' is already used by worktree" error AFTER the merge lands — future
  Warchiefs must verify merge state rather than trust that error string (now in dispatch
  briefs).

- **D15** (2026-07-13 · Shaman, idea-04 task-1 cap): **Option (a) granted** — one bounded
  extension round for F7 (pre-designed word-order anchor fix, strictly dominant), then a fresh
  audit pair; a second failure escalates and doesn't ask twice. Rationale: the 3-round cap's
  stated purpose is catching GRINDING (a finding surviving repeated fixes → spec ambiguity);
  idea-04's task-1 loop shows strictly-decreasing severity, contract lens PASS twice running,
  and zero re-raised findings — convergence, not grinding. Option (b) REJECTED on the record:
  a Warchief waiving a Confirmed cold-only Important is exactly the hole Law 4 closes.
  **Option (c) accepted as a follow-up card candidate** (with F12): re-define the cap to count
  rounds where a previously-routed finding is RE-RAISED, and make Law 4's escalation wording
  verdict-neutral — a law change deserving its own spec/plan/audit, not an improvisation here.
  W5 (assertion-quality bar) is baked into tasks 2-5 briefs.

- **D16** (2026-07-13 · Shaman, idea-04 F13): **Option (a) ratified — the spec gap is filled
  with the Warchief-decides bounded trichotomy.** "Adjudicate an `agreed` `NOT_REPRODUCED`
  immediately" means: the Warchief weighs the fixer's falsification artifact against the two
  reviewers' reports and records exactly one of UPHELD (artifact defeats the finding →
  `DROPPED (falsified)`, no fixer round) / REJECTED (artifact doesn't cover the reviewers'
  stated condition → back to the fixer with that condition named; ordinary fix round) /
  ESCALATED (can't tell from the artifact → `NEEDS_DIRECTION`). It is a review act and
  consumes NO fix round. Rationale: mirrors the shipped ledger trichotomy, faithful to
  idea-05's "don't wait for the next audit round"; (b) would make the costliest path the
  default for the highest-confidence finding class; (c) silently drops a sister card's stated
  requirement. ALSO GRANTED: one-clause carve-out pointer edit to idea-05's shipped ledger
  rule (a pointer, not a duty change — same D12 logic: unnoticed interaction, spec gap);
  F14 bridge-widening as ordinary work; one bounded extension round then a fresh pair;
  a second failure escalates without asking twice. Budget continuation approved — owner
  directive is ship all cards; no de-scope.

- **D17** (2026-07-13 · Shaman, idea-04 W5-bar): **Option (a) ratified — W5 bar 1 is bounded.**
  An assertion must survive (i) whitespace reflow, (ii) bold-marker relocation, (iii) insertion
  of ≤30 chars of clarifying text at any single bridge point (every `.{0,N}` bridge keeps ≥30
  chars headroom over current consumption; no invariant matched as one contiguous literal
  spanning more than a single clause). Unbounded paraphrase is OUT OF SCOPE for a grep-based
  conformance suite — an unbounded bar is unsatisfiable by construction, and both round-4 and
  round-5 head-on lens conflicts were this one fault. Amending a Shaman-ratified bar mid-cap is
  a Shaman act — the Warchief was right to surface rather than self-amend; that discipline IS
  this card's thesis. One fix round to apply the bound to the 5 flagged assertions, then a
  fresh pair audits against the BOUNDED bar. **Follow-up accepted** (bundle with D15's (c)+F12
  card): a cap that detects unmeetable bars — two consecutive head-on conflicts on the same
  axis — beats a round counter; both cap-hits this campaign were non-terminating bars, not
  grinding fixers.

- **D18** (2026-07-13 · Shaman, idea-04 F22): **Option (a) ratified — the authoritative
  "tie-break spent" record lives in the card's STATE FILE** (git-committed, the sanctioned
  resume artifact); the report-file ledger keeps its `TIEBREAK` row as the human-readable
  audit trail only. This OVERRIDES idea-04 spec §2.4's "no state-file change is needed" —
  written in good faith before noticing that the shipped resume doctrine defines uncommitted
  state as never having happened and forbids re-deriving progress from the report file. §2.3's
  crash-survival intent is preserved by (a); (b) would widen this card's blast radius into
  another card's shipped doctrine; (c) silently discards a spec requirement. Same class as
  D12: an unnoticed cross-card interaction is a spec gap, fixed at the spec, in the open.

- **D19** (2026-07-13 · Shaman, idea-04 F23): **Option (a) ratified — ship the honest
  version.** In-fence: the law claims only what is true — the tie-break-spent record is
  durable/authoritative and every Warchief ENTERING an audit round consults it first (the
  final whole-branch audit always does, so a stranded TIEBREAK resolves there); the claim of
  automatic mid-rung resume is dropped; the pre-dispatch commit's trailer is fixed
  (`Tribe-Milestone`). The degradation is safe by construction: a crash can at worst grant one
  wasted REVIEW round, never a wrong merge. (b) rejected — a card's worth of resume-machinery
  work riding in on another card's PR; (c) rejected — law that lies. **Follow-up card
  accepted: teach `resume-check.sh` mid-audit state** — pre-existing, cross-cutting gap (NO
  audit round in the tribe is resumable today); bundle with the D15(c)+F12+D17 cap/escalation
  family: the tribe's resume/round-accounting machinery does not yet model the audit loop.

- **D20** (2026-07-14 · Shaman, idea-04 W14): **RATIFIED — escalation values go parametric.**
  `ESCALATED (<trigger>)` replaces the fixed enum; the recorded trigger must be the ACTUAL
  cause, never a near-miss substitute; known triggers named (spec ambiguity, standoff,
  inconclusive artifact, oracle unavailable, tie-break spent) with the list explicitly OPEN —
  any new escalation rule names its own trigger; the suite guards the RULE mechanically, not
  the list. Rationale: two consecutive rounds each found one more trigger with no legal home —
  an enum that grows by one per reader is the design being wrong, not the reviewers being
  pedantic. Same round fixes the 4 zero-bridge literals to D17's bar.

- **D21** (2026-07-14 · owner): batch re-set — finish idea-04, then PAUSE the campaign.
  Cards 06, 10, 07, 08, 09 are PARKED (queued, unblocked, order unchanged: 06 → 10 → 07 →
  08 → 09). Next session resumes with idea-06 per this log; resume-check false-positive
  caveat (D7) still applies to the parked planning-only state files.
- **D22** (2026-07-14 · Shaman, idea-04 F38): **W17 RATIFIED as a one-line fence extension** —
  the `len(evals) == 16` → `== 20` bump in idea-03's suite is authorized. The bind is jointly
  unsatisfiable in-fence (spec REQUIRES 4 new evals; sibling suite hardcodes 16; leaving it
  ships the neighbour red against this plan's own DoD). Arithmetic, not law: no assertion's
  meaning changes, no invariant weakens. Disclosed in the PR. The Warchief's refusal to
  self-ratify the fence move — while accepting W17's merits — is the correct division of
  authority. **Follow-up card accepted:** option (d) — exact-count eval assertions are a
  tripwire that fires on EVERY future card that adds an eval; replace with `>=`/id-presence
  in its own card, bundled with the resume/round-accounting family.
- **D19 addendum** (2026-07-14): the predicted hazard FIRED LIVE — after the idea-04 Warchief
  died mid-final-audit, `resume-check.sh` returned `DISCARD_AND_RESUME_DELIVERY` on a branch
  carrying a known un-fixed Critical (F36); obeying it would have squash-merged an unaudited
  branch. The resumed Warchief refused the delivery half per D18/D19 (W20), redid the fix from
  the ruling (never from the dead agent's diff), and re-entered the audit loop. The
  "teach resume-check.sh mid-audit state" follow-up card is hereby priority #1 of the
  follow-up family.

- **D23** (2026-07-14 · owner): **idea-11 (review-cell-v3) is minted and funded to the front of
  the parked queue** — unpark order becomes **11 → 06 → 10 → 07 → 08 → 09**, superseding D21's
  "resume with 06" (parked set otherwise unchanged). The card packages four owner-approved
  review-quality changes evidenced by the idea-03 session forensics read against the Bun
  source article: (T1) path-scope the cold lens's diff — this FUNDS and absorbs the idea-03
  Shaman-accepted follow-up above; (T2) split the cold lens by method into a cold **executor**
  (must run; findings cite command output) and a cold **reader** (static pass; may not re-run
  suites) — the cell becomes one contract lens + two cold reviewers, hypotheses-only, Law 4
  and the routing absorb the third reporter with `agreed` = any two of three; (T3) a mechanical
  pre-gate script runs the tripwire sweep + trailer/fence checks BEFORE any Skinner is
  dispatched, and reviewer briefs stop mandating full-suite re-runs; (T4) per-reviewer yield
  columns in the disposition ledger so cell-size decisions become empirical. Card:
  `idea-11-review-cell-v3/card.md`. Spec + plan to be forged per the standard flow; the
  resume/round-accounting follow-up family (D15c/F12/D17/D19/D22) stays separate and unfunded.

## Follow-up card candidates surfaced during planning (not in this PR)

1. `resume-check.sh` misreads planning-only campaigns — `REVERT_AND_REDO` would have destroyed
   a staged 429-line deliverable (idea-02 resume). Candidate: `mode: planning` state-file field.
2. Latent bug: `base-sha` re-record vs resume-check trailer-scan floor → post-wave-merge resume
   collapses to task 1 (fix designed inside idea-09's plan; extract if 09 is deferred).
3. Skinner worktree footgun: `cp -r` of a linked worktree points at the shared gitdir — two
   Skinners' simulation commits landed on a real branch (both self-recovered, branch verified
   intact). Candidate rule: simulate in `git clone`/`git archive`, never `cp -r` a worktree.
4. idea-03's branch commits are unsigned (ssh-sign hung in that sandbox) — irrelevant after
   squash-merge, noted for the record.
