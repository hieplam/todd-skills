# tribe-state: idea-01-dual-skinner-cell
roadmap: bun-rust-migrate-ideas.md
worktree: /Users/todd.lam/WORK/_TestScripts/todd-skills-worktrees/impl-idea-01
branch: feat/idea-01-dual-skinner-cell
report: /private/tmp/claude-503/-Users-todd-lam-WORK--TestScripts-todd-skills/84a1f98b-a3c1-4a06-a79a-4db91db65822/scratchpad/campaign/reports/impl-idea-01.md
base-sha: cc459909fa905058bbaf4d96bfa681966523eee9
plan: docs/tribe/planning/idea-01-dual-skinner-cell/plan.md

## Campaign type
IMPLEMENTATION. The spec + plan are settled law (landed in PR #25). This campaign executes the
plan's 4 tasks: Warchief Method steps 1, 4, 5, 6, 7, 8.

## Milestones
- [x] spec committed (settled law — PR #25)
- [x] plan committed (settled law — PR #25, validate-plan.sh verdict pass)
- [ ] task 1 — dual dispatch, isolation, merge, verdict (warchief.md step 6)
- [ ] task 2 — reciprocal independence invariant (skinner.md)
- [ ] task 3 — consistency sweep (7 singular-Skinner passages)
- [ ] task 4 — three behavioral evals
- [ ] wave 1 integrated (single wave, single worktree, one Hunter at a time)

## Anchor check (Warchief, at ground step — BINDING for every task)
Base `cc45990` carries BOTH idea 05 (PR #27, fixer adjudication) and idea 02 (PR #28, context
isolation). Both **appended** their clauses below step 6's opening paragraph rather than rewriting
it.

Verdict: the plan's Task 1 `old:` block (step 6 heading + opening paragraph) still matches
**byte-for-byte**, and all seven Task 3 `old:` anchors match verbatim — only line numbers drifted
(now 9, 29, 216, 240-244, 397, 438, 643-646). The plan's "matches byte-for-byte" anchor branch
therefore applies: replace the heading + opening paragraph ONLY. Every clause below it survives
**VERBATIM** — 05's fixer-brief template / disposition ledger / standoff rule, and 02's allowlist
ceiling / CONTAMINATED refusal / fresh-Skinner-per-fix-round.

## Warchief adjudication — one plan defect corrected (How-level, within authority)
The plan's Task 1 test asserts Law 2 with the regex `never reuse`. That regex ALREADY matches idea
05's finding-ID bullet ("never reused within the campaign"), so the assertion would pass even if
Law 2 were never written — a broken tripwire. Corrected to bind to Law 2: `never reuse.{0,40}across
rounds`. The assertion's name and intent are unchanged, and this restores the plan's predicted RED
tally (`1 passed, 14 failed`) exactly. Recorded here and in the PR body.

## Known follow-up (NOT in this card's fence — for the Shaman)
Idea 02's clauses inside step 6 use the singular ("Each fix-round gets a FRESH Skinner", "re-dispatch
a fresh Skinner" on CONTAMINATED). These compose correctly with Law 2 ("two fresh ... never reuse one
across rounds") — a reader applies freshness to each member of the pair — but a future card could
pluralize them for prose consistency. Out of fence here; the plan does not name those lines.
