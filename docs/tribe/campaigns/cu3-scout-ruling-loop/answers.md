# Campaign answers — cu3-scout-ruling-loop

Rulings appended by the orchestrating session (Shaman authority) or the owner. The runner never
writes here.

## Standing rulings (Shaman, 2026-07-30 — carrying the owner's ratifications from the CU-3 design session)

- **Merge is owner-only.** The card completes at PR open + all checks green. Any escalation
  asking to merge the card PR: the answer is DO NOT MERGE — leave the PR open, report, stop.
- **Ratified thresholds are frozen** (prevalence ≥ 3 files; ≤ 3 gaps per review; precision
  ≥ 50% over trailing 20 ruled gaps). Changing one is an owner-only escalation.
- **The debt schema is frozen** (spec §1: Meter table = Check / Anti Rule / Origin Gap /
  Baseline; `anti_rule` required; `baseline` write-once; no `issue:` field). Changing it is an
  owner-only escalation (`change-debt-schema`).
- **Registry and debt entities are script-written only.** `gap-reconcile.ts` writes detections,
  `gap-rule.ts` writes rulings and creates debt entities, `debt-backfill.ts` creates issues.
  If a task seems to require hand-editing `.tribe/harness-gaps.jsonl` or
  `.c3/documents/debt/*.md`, the task is being misread — re-read spec §2/AG-2.
- **GitHub issues are created post-merge only** (spec §7 backfill) — never at ruling time. A
  task that wants to `gh issue create` during the build is misreading the spec.
- **The strong gate stands:** a positive `debt-count --diff` delta blocks PR assembly; no
  session may waive it (spec §4).
- **C3 `change apply` stays deferred** (known c3x v11.0.0 defect). Commit ADR + patches as a
  work order; run `git diff -- .c3/` after every `c3 add` and revert strays.
- **Debt slugs are passed WITHOUT the `debt-` prefix** to `c3 add debt` (the CLI prepends the
  type — probed against c3x 11.0.0; see plan Global Constraints).
