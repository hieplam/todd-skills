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
- [x] task 1 — dual dispatch, isolation, merge, verdict (warchief.md step 6) — 493ee3c
- [x] task 2 — reciprocal independence invariant (skinner.md) — 5f74685
- [x] task 3 — consistency sweep (7 singular-Skinner passages) — d847827
- [x] task 4 — three behavioral evals — 876e3f8, amended faa9819
- [x] wave 1 integrated (single wave, single worktree, one Hunter at a time)
- [x] branch audit — TWO Skinners, concurrent + isolated: BOTH PASS (Law 4 unanimity)

## Branch audit result (dogfooded the cell this card ships)
Two Skinners dispatched as two tool uses in ONE message, each cold per idea 02's allowlist
(contract + diff + repo rules + mechanical scope), neither told the other existed. Both returned
`AUDIT: PASS`. Merged findings, union + agreement-tagged:

- **F1 `[one]` Important** — the campaign had not run the 9 pre-existing evals, which plan DoD #4
  and C3's Change-Safety row for `c3-215-tribe` (agent-definition edit → full `run_evals.py`) both
  require. **CLOSED by the Warchief:** full 12-eval suite re-run on the branch with harness defaults
  → **12 PASS / 0 FAIL**. (Skinner B saw eval 2 fail under `--exec-model haiku`; it passes at the
  default tier, so that was a model-tier flake, not a regression — `hunter.md` is byte-identical
  base↔HEAD.)
- **F2 `[one]` Minor** — this state file's milestone checklist was stale. **CLOSED** (this commit).
- **F3 `[one]` Minor** — idea 02's singular Skinner phrasing inside step 6. Out of fence, already
  disclosed below as a follow-up. No action.
- **F4 `[one]` Minor** — dispatch said "5 commits", actual 6 (the state-file commit). Immaterial.

No Critical or Important finding survives. No fixer round was needed: F1 was an evidence gap the
Warchief closes by running the proof, not a code defect.

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
