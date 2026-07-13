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

## ESCALATION — awaiting Shaman ruling (2026-07-13T08:56Z)
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
