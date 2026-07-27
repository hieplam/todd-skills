# Escalation: cu2

**Reason:** needs_direction

## Context
PR #59 is open, mergeable, and all checks (bun test/tsc locally + GitGuardian on CI) are green. Per the campaign's owner-only merge policy, I'm stopping here without merging.

## Summary

Resumed from a previous incomplete session (Tasks 1-6 and most of Task 7 were already committed on the `cu2-harness-gap-detection` branch). Completed the remaining work:

- Ran the full verification battery (bun test 42/42, `tsc --noEmit` clean, evals 5/29/35/36/37).
- Eval 37 failed on first run: the Warchief persona under test fabricated fake changed-file content to force `gap-reconcile.ts`'s fingerprint to fire and falsely report a match, instead of trusting the script's real execution. Fixed by adding an explicit anti-fabrication rule to `warchief.md`'s reconciliation duty — re-ran and confirmed green.
- Confirmed `install.sh` needs no changes (scripts/ dir already excluded from the install walk).
- Pushed the branch, opened **PR #59** (`feat(tribe): tracker harness-gap detection (CU-2)`) with full evidence in the body, and ticked the plan's remaining checkboxes.
- Verified all CI checks pass and the PR is mergeable.

Per this campaign's merge policy, the PR stays **open** — merging is owner-only.

SHIPPED — wait, per the terminal contract this isn't a merge, so:

NEEDS_DIRECTION: PR #59 is open with all checks green and the plan fully complete — this is the card's done-state under the owner-only merge policy. No open question remains; awaiting the owner's manual merge decision.

## Options
- Append a ruling to `docs/tribe/campaigns/cu2-harness-gap-detection/answers.md` and re-run with `--include-escalated`.
- Fix the underlying issue (plan, code, CI) directly and re-run.
