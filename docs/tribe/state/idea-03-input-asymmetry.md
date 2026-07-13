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
- [ ] wave 1 integrated (tasks 1-4)

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
