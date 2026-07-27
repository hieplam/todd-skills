# Campaign answers — cu2-harness-gap-detection

Rulings appended by the orchestrating session (Shaman authority) or the owner. The runner never
writes here.

## Standing rulings (Shaman, 2026-07-27)

- **Merge is owner-only.** The card completes at PR open + all checks green. Any escalation
  asking to merge the card PR: the answer is DO NOT MERGE — leave the PR open, report, stop.
- **Ratified thresholds are frozen** (prevalence ≥ 3 files; ≤ 3 gaps per review; precision
  ≥ 50% over trailing 20 ruled gaps). No session may adjust them; changing one is an owner-only
  escalation.
- **Registry is script-written only.** If a task seems to require hand-editing
  `.tribe/harness-gaps.jsonl`, the task is being misread — re-read spec §3.
- **C3 `change apply` stays deferred** (known c3x v11.0.0 defect). Commit ADR + patches as a
  work order; run `git diff -- .c3/` after every `c3 add` and revert strays.
