# Escalation: cu3

**Reason:** needs_direction

## Context
CU-3 is delivered end-to-end. PR **#65** is open and green; per the campaign's `OWNER-ONLY-MERGE` wall I did not merge, and the terminal contract's only "done" signal (`SHIPPED`) requires a merge commit sha I am forbidden to produce.

## Summary — CU-3 Scout Ruling Loop

**PR:** https://github.com/hieplam/todd-skills/pull/65 — OPEN, base `master`, head `2cc4492`, 10 commits.

**What shipped** (all 9 plan tasks, TDD, one Hunter per task):
- `gap-rule.ts` — sole ruling writer, 5 ordered crash-safe steps, `--ratified-by` audit trail
- `debt-count.ts` + `debt-tree.ts` — tree-named burn-down + STRONG delta gate (positive delta → non-zero exit)
- `debt-backfill.ts` — idempotent post-merge issues, `gh`-absent no-op
- `debt` C3 canvas + install wiring; shared pure `debt-entity.ts` / `fingerprint.ts`
- Scout / Warchief / Tracker prompt duties (adjudication, gate+backfill+planning read, grandfathering)
- 6 adversarial eval cases 38–43 + case 21 stack-neutral rewrite
- ADR + change-unit work order against `c3-215` (`apply` deferred per c3x defect)

**Verification (all green, evidence in PR body):**
- `bun test` 76 pass · `tsc --noEmit` clean
- `test-install-canvases.sh` 10/10 · `test-install-rules.sh` 10/10 (no regression)
- Scoped evals 12/12 PASS (ids 5, 21, 29, 35–43; `with_skill`, sonnet exec+grader)
- Skinner audit of the script layer: **0 critical / 0 important**; crash-safety and the exact `delta > 0` gate condition mutation-tested
- `.c3/` footprint independently verified clean — the c3x `add`-corruption defect was caught and fully reverted; only the 3 intended files landed

No CI checks are configured on the repo (`statusCheckRollup` empty), so "all checks green" is satisfied by the local battery above.

The pre-existing unrelated working-tree files (campaign runner `state.json`, `.runner.lock`, `bun.lock`, `node_modules/`, prior `campaign-report*`/`kanna-tribe-port.md`) were left untouched and kept out of every commit.

NEEDS_DIRECTION: PR #65 is open with every card gate green (bun test + tsc, both install tests, all 12 scoped evals) and the branch is mergeable. Per the `OWNER-ONLY-MERGE` wall the card's done-state is "PR open + checks green" and only the owner may perform the regular 2-parent merge — I am forbidden to merge and cannot produce a merge sha. Please perform the owner merge of PR #65 (or direct me if anything else is needed before it).

## Options
- Append a ruling to `docs/tribe/campaigns/cu3-scout-ruling-loop/answers.md` and re-run with `--include-escalated`.
- Fix the underlying issue (plan, code, CI) directly and re-run.
