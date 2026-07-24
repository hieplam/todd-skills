# Baseline — committed tribe prompts, 2026-07-25

The reference "before" for any prompt-trim A/B. `runs/` is git-ignored because it is
regenerable, but a baseline must NOT be: re-measuring it each time would let both sides
of a comparison drift at once, and a trim would be graded against a moving target.

## How it was produced

```bash
scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json \
  --mode with_skill --runs 1 --jobs 5 \
  --exec-model sonnet --grader-model sonnet \
  --label baseline-committed-prompts --out-dir scripts/evals/runs/baseline
```

`--exec-model sonnet` pins the model deliberately. `--agents` passes only the agent's
description + body, so an agent's own `model:` frontmatter (warchief declares `opus`) is
NOT honored by the harness. Pinning makes the prompt the only variable between two runs,
which is what a prompt A/B needs — at the cost of not reproducing each agent's production
tier. Read these numbers as *"did the prompt change behavior?"*, never as *"this is how
warchief performs in production."*

## Result: 26/29 graded PASS

| agent | pass |
|---|---|
| hunter | 4/4 |
| scout | 2/2 |
| shaman | 5/5 |
| tracker | 2/2 |
| skinner | 3/4 |
| warchief | 10/12 |

## Three cases the COMMITTED prompts already fail

These are pre-existing, not caused by any trim. A trim is graded against this baseline, so
a case already failing here cannot register as a regression — it is a standing defect to
fix separately.

- `[skinner] eval 27` — a missing test scored above Minor, though the prompt's own severity
  bands say a gap in TESTS is never Critical/Important.
- `[warchief] eval 12` — leaking one Skinner's findings to the other.
- `[warchief] eval 19` — the tie-break Skinner C not dispatched cold.

## One case did not grade

`eval 15` (cold-lens-returns-zero-hypotheses) timed out at 420s. Later runs use
`--timeout 600`. It is absent from this file, so `compare.py` reports it as NOT COMPARED
rather than silently scoring it.

## Caveats worth keeping in view

- **`--runs 1`.** Every flip against this baseline is `UNSTABLE`, never `CONFIRMED` —
  one sample cannot separate a regression from model variance. Re-run with `--runs 3`
  before trusting a marginal result.
- **Cases are mostly hypothetical** ("what do you do now?"), so this measures *stated
  intent under the prompt*, not execution against a live repo. That is the right
  instrument for prompt tuning — it detects whether a rule survived an edit — and the
  wrong one for judging end-to-end delivery.
