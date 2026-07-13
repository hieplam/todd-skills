# tribe-state: idea-03-input-asymmetry
roadmap: bun-rust-migrate-ideas.md
worktree: /Users/todd.lam/WORK/_TestScripts/todd-skills-worktrees/impl-idea-03
branch: feat/idea-03-input-asymmetry
report: /private/tmp/claude-503/-Users-todd-lam-WORK--TestScripts-todd-skills/84a1f98b-a3c1-4a06-a79a-4db91db65822/scratchpad/campaign/reports/impl-idea-03.md
base-sha: b1f508a4d1357c5010a313bc3efe5d81f5c929de
plan: docs/tribe/planning/idea-03-input-asymmetry/plan.md

## Milestones
- [x] spec committed (settled law on master, PR #25)
- [x] plan committed (settled law on master, PR #25; validate-plan.sh passes)
- [x] wave 1 integrated (tasks 1-4 committed: 648e42d, 49b8b64, a03bbe5, a3c70b6; fixes f8822c3, f718262)
- [ ] branch audit PASS (round 3 of 3 FAILED — escalated NEEDS_DIRECTION)
- [ ] PR squash-merged

## RULING D11 — RECEIVED 2026-07-13T09:00Z (authorizes the round-4 fix below)
The Shaman ruled Option A on the round-3 escalation: exactly ONE amended 4th fix round, GRANTED.
Amendment to settled law (this card only): "a plan's test code is a MEANS to the contract, never the
contract itself. A tripwire that stays green when the feature is deleted satisfies nothing — so
replacing the plan's literal grep text with feature-unique anchors is CONFORMANCE with the plan's
intent, not deviation." Scope: H1 (cold-mode carve-out; precedence ruling: the CONTAMINATED refusal
WINS — a cold Skinner that detects contamination refuses, never audits; emission format delegated to
the Warchief as How), H2 (re-anchor 4 greps), H3 (fix the vacuous hasnt), H4 (pulled into scope:
content assertions guarding evals 10-12). Acceptance bar: the delete-the-feature mutation must leave
ONLY the 3 by-design-green assertions passing. Then ONE fresh dual audit; FAIL -> escalate, no 5th
round. This entry is the artifact of that authorization — the round-4 commit (b9e33a7) is lawful.

## FINAL DUAL AUDIT (post-round-4, range b1f508a..b9e33a7) — FAILED 2026-07-13T09:26Z
Skinner A (lens: contract): AUDIT: FAIL. Skinner B (lens: cold): COLD-LENS: 2 hypotheses.
Round 4's four fixes all VERIFIED GOOD (suite 34 -> 45, every new assertion mutation-proved to trip;
H3's formerly-vacuous check now trips on reintroduction; H4 substance guards now trip). But the audit
surfaced FOUR new findings, all confirmed:
- F5 [cold-only] CRITICAL — test-input-asymmetry.sh:98 is a FIFTH instance of the hollow-assertion
  defect class, missed by round 4. Deleting the ENTIRE cold-brief prohibition + forbidden-contents
  table from warchief.md leaves it GREEN (43 passed, 2 failed): it coincidentally matches Law 4's
  "the cold lens has never seen the contract". It guards the single most safety-critical line of the
  card — the rule that stops the cold lens being handed the contract — and guards nothing.
  WHY THE ROUND-4 BAR MISSED IT: my acceptance bar was a WHOLE-FILE revert, which also deletes the
  coincidentally-matching Law 4 text, so the assertion went red for the WRONG reason and looked
  healthy. LESSON: mutation bars must be PER-CLAUSE, not whole-file. A whole-file revert cannot
  distinguish "this assertion guards its clause" from "it guards some other clause also deleted".
- F6 [cold-only] Important — test-dual-skinner-cell.sh:52's `[one]` assertion now matches only the
  vestigial "Maps onto idea 01's tag" doc column, not any operative tag (live vocabulary:
  [both]/[contract-only]/[cold-only]). Mitigated: real coverage is test-input-asymmetry.sh:108.
- F7 [contract-only] BLOCKING — SPEC CONFLICT, escalated. See below.
- F8 [contract-only] Important — this very ruling was never recorded. FIXED by this entry.

## F7 — THE SPEC COLLISION (awaiting Shaman ruling)
The round-4 H1 fix has a contaminated `lens: cold` dispatch emit `AUDIT: FAIL — CONTAMINATED`
(skinner.md:153-161, with a precedence rationale: the contamination check runs BEFORE lens-specific
review, so a refused dispatch never "ran" a review and never triggers the no-AUDIT rule).
But spec.md:186 locks: "Cold mode emits no `AUDIT:` line — **ever**", and spec.md:370 Risk-row-2
mandates "Cold mode is forbidden from emitting an `AUDIT:` line at all." The spec is settled law.
The format is NOT free: warchief.md:606 (idea-02's seal, pre-existing and deliberately fenced off)
recognizes exactly ONE refusal token — `AUDIT: FAIL — CONTAMINATED: <what leaked>` — and already
treats it as "a verdict on YOUR dispatch, not on the code... does NOT consume one of the 3
fix-rounds." The spec-literal alternative (`COLD-LENS: CONTAMINATED`) would require ALSO teaching
warchief.md a second token, widening scope into the verified-correct law file and fracturing one
concept across two tokens.
Options put to the Shaman: (a) RATIFY — amend spec Delta-Law 2 + Risk-row-2 to carve out the
contamination case; implementation stands. (b) REWORK — new COLD-LENS-shaped refusal token, plus a
warchief.md edit to recognize it. Warchief's recommendation: (a).

## ESCALATION — round 3 (SUPERSEDED by D11 above; retained for the record) (2026-07-13T08:56Z)
Branch audit round 3 (last of the 3-round cap) FAILED. Contract lens: AUDIT: PASS (17/17 rows).
Cold lens: COLD-LENS: 4 hypotheses. Three are CONFIRMED by the Warchief's own re-run, so under
this branch's own Law 4 the round cannot pass. Cap exhausted -> no 4th fix round without a ruling.

CONFIRMED (blocking):
- H1 Important — skinner.md self-contradiction: cold mode forbids emitting any `AUDIT:` line, but
  the Operating-rules contamination clause orders `AUDIT: FAIL — CONTAMINATED: <leak>`. The
  cold-mode replace-list covers only Method steps 1/3/7; the file's sole carve-out is at :222.
  A contaminated COLD dispatch therefore receives two contradictory orders.
- H2 Important — 4 of the 34 assertions in test-input-asymmetry.sh do not discriminate: they match
  pre-existing unrelated text and stay green with the feature fully deleted. These greps came
  VERBATIM from the settled plan (Task 1-3 test code).
- H3 Important — the `hasnt "law4: the both-must-PASS rule is gone"` check greps phrases that never
  existed in the old text; it can never fail, so it cannot catch reintroduction of the old rule.
Mutation-test evidence: with both agent files reverted to b1f508a, the unmodified new suite reports
`8 passed, 26 failed`. 3 of those 8 are legitimate by design (baseline + 2 idea-01-preservation
checks); the other 5 are hollow (H2's 4 + H3's vacuous check).

DISPOSITIONED NON-BLOCKING:
- H4 Minor — VALID BUT OUT OF SCOPE: evals 10-12's rewrite (necessary, Warchief-authorized) is
  guarded by no content assertion. Follow-up card for the Shaman.

The LAWS are correct and independently verified present verbatim (contract lens, 17/17). What is
defective is the PROOF: 5 of this card's own tripwire assertions do not discriminate. Fixing H2/H3
requires deviating from the settled plan's literal test text — which is why this went up, not
sideways.

Full evidence: reports audit-r3-a.md (contract lens, verbatim) and audit-r3-b.md (cold lens,
verbatim), alongside impl-idea-03.md.

## Notes
IMPLEMENTATION campaign. Spec + plan are SETTLED LAW — do not re-author.
One wave, one worktree, four strictly-sequential tasks (Task 2 and 3 edit the same step-6
region of warchief.md; Task 1 must land first or every cold dispatch returns UN-AUDITABLE).
Dependency check passed at intake: idea 01 baseline present in warchief.md,
test-dual-skinner-cell.sh exists.
Composition since the plan was authored: idea 05 (PR #27), idea 02 (PR #28), idea 01 (PR #29)
are all merged. Regression suites that must stay green: test-context-isolation.sh (35),
test-dual-skinner-cell.sh (28), test-fixer-mandate.sh (28), test-resume-check.sh (32),
test-validate-plan.sh (7). Evals 12/12 before this card.
No CI in this repo — step 7 records the exit-2 path explicitly.
