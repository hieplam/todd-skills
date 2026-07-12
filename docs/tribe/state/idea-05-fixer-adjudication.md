# tribe-state: idea-05-fixer-adjudication
roadmap: bun-rust-migrate-ideas.md
worktree: /Users/home/repos/todd-skills-worktrees/impl-idea-05
branch: feat/idea-05-fixer-adjudication
report: /Users/home/.claude/tribe-reports/impl/idea-05.md
base-sha: 8bd8d8681a23f834c7de5ef1ea96d1b96ae03617
plan: docs/tribe/planning/idea-05-fixer-adjudication/plan.md

## Milestones
- [x] spec committed (planning campaign, master 8bd8d86)
- [x] plan committed (planning campaign, master 8bd8d86 — validate-plan.sh verdict: pass)
- [ ] wave 1 integrated (tasks 1-4, serial, single worktree)

## Campaign type
IMPLEMENTATION. Spec + plan are settled law (do not re-brainstorm/rewrite). Warchief Method
steps 1, 4, 5, 6, 7, 8 apply: ground -> isolate -> Hunters -> skinner audits -> PR -> report.
Tasks are strictly sequential (2 and 3 both edit warchief.md; all 4 edit the test file).

## Warchief adjudications (How-level, recorded at intake)
1. **Plan checkboxes ARE ticked in each task commit**, in `docs/tribe/planning/idea-05-.../plan.md`,
   exactly as the plan's Step 4 `git add` mandates. The dispatch's fence says "do not touch
   docs/tribe/planning/** (settled contracts)" — read as: do not alter the *contract prose*
   (no re-brainstorming, no rewriting scope). It cannot mean "disobey the plan's own Step 4",
   because (a) the same fence says the scope is "exactly what the plan's tasks name", and every
   task's Step 4 names plan.md; (b) `hunter.md` anti-goal 6 makes an unticked task commit an audit
   failure ("No recordless done"); and (c) `resume-check.sh:226-231` mechanically reconciles plan
   checkboxes against git trailers and warns on disagreement. Ticking a `- [ ]` -> `- [x]` changes
   no contract prose. NOTHING else under planning/** is touched.
2. **This repo has NO CI** — no `.github/workflows/` exists at 8bd8d86. Step 7's watch block will
   hit its exit-2 path (empty RUN_IDS). Per the dispatch: confirm via `gh pr checks`, record the
   absence in the PR body + report, and proceed to squash-merge. The gates are therefore the
   repo's bash suites, run and transcribed into the PR: test-fixer-mandate.sh (new),
   test-validate-plan.sh, test-resume-check.sh.
