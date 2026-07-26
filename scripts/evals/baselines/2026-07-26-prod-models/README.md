# Baseline v2 — 2026-07-26, production models, 3 runs/case

The first baseline that can actually feed `compare.py`'s CONFIRMED tripwire: every case has
≥2 baseline runs (`compare.py` refuses CONFIRMED below that), executors run on each agent's
production model (frontmatter-resolved, PR #55), and grader failures are `UNGRADED`, never
fake FAILs.

## How it was produced

```
ANTHROPIC_MODEL=opus scripts/evals/run_evals.py \
  --evals plugins/tribe/evals/evals.json \
  --mode with_skill --runs 3 --jobs 5 --timeout 600 \
  --grader-model sonnet --label baseline-v2-prod-models
```

No `--exec-model`: models resolve from agent frontmatter — warchief **opus**, scout **opus**,
shaman `inherit` → session default (pinned to opus via `ANTHROPIC_MODEL` for this run),
hunter/skinner/tracker **sonnet**. The resolved model is recorded per run (`result.model`).
Two invocations merged with `merge_benchmarks.py` (cases 27–34 re-run after a subscription
session-limit reset — see Incidents).

## Headline numbers

**86/100 graded runs PASS** (+1 ungraded). **24/34 cases are stable-pass (3/3)**.

| agent | model | graded pass |
|---|---|---|
| shaman | opus (inherit) | 15/15 |
| scout | opus | 6/6 |
| tracker | sonnet | 5/5 (+1 UNGRADED run, grader truncation) |
| hunter | sonnet | 9/11 |
| skinner | sonnet | 10/15 |
| warchief | opus | 41/48 |

## Noise floor — flips at UNCHANGED prompts (do not read these as regressions)

Seven cases flipped across 3 identical-prompt runs. A future A/B that flips one of these has
NOT demonstrated a regression unless the flip is total (CONFIRMED) — this list is the
suite's intrinsic variance:

| eval | agent | pattern | rule under test |
|---|---|---|---|
| 6 | skinner | FPP | over-claim catch + CONTRACT-LENS terminator |
| 11 | warchief | PFP | quiet cold lens must not dilute a contract Critical |
| 14 | skinner | FPP | cold lens refuses the contract on disk |
| 15 | skinner | FPP | COLD-LENS: 0 hypotheses is honorable |
| 18 | warchief | PFF | Rule A — silence is not dissent (`single`, never `conflicting`) |
| 27 | skinner | FPF | missing tests are Minor, never Critical |
| 31 | warchief | PFP | spent tie-break goes straight to rung 3 |

Signal worth keeping: **eval 18 was already 2/3 on sonnet in the v1 measurements and still
flips on opus** — the Rule A weakness is not a small-model artifact; it lives in the prompt.
Skinner's severity-band discipline (6/14/15/27) is the noisiest cluster in the suite.

## Known-invalid cases — do not count these against the agents

- **eval 2 (hunter, FF):** the scratch environment has no .NET toolchain/git, so the rubric's
  core clause ("build GetByEmail under TDD and commit") is unachievable; the agent correctly
  reports BLOCKED and correctly refuses scope creep. v1 graded this leniently as PASS; the
  stricter v2 grading exposes the case as environment-broken. Needs a runnable fixture (or a
  rubric scoped to what the environment supports).
- **eval 19 (warchief, FFF):** the rewritten case fixed the context starvation (the agent now
  correctly sequences the `## Tie-breaks spent` write before dispatch and writes a properly
  cold, disagreement-blind brief — both firsts), but the rubric still demands a majority
  verdict from three real samples while the eval environment has no `skinner` subagent type
  to dispatch. Two runs fail on that impossible action; run 2/3 also shows a real violation
  worth keeping an eye on (the agent substituted its own judgment for the majority). Needs
  one more revision: grade the procedure and the stop, not the impossible execution.

## Incidents

- Runs 89–102 of the first invocation hit the subscription session limit ("You've hit your
  session limit") — all became `UNGRADED` (zero fake FAILs; in the v1 harness these would
  have been 8 phantom hard-fails) and were re-run cleanly after the reset and merged.
- eval 5 run 1: grader reply truncated mid-JSON → `UNGRADED` (the exact fail-closed defect
  the v2 harness fixed; 2/3 runs remain graded).
- eval 2 (hunter) run 1: no result was ever recorded by the source invocation (absent from
  `runs[]`, not in `setup_errors`, not `UNGRADED`) — the case has 2/3 runs, reflected as the
  two-letter `FF` pattern above; total run records are therefore 101, not 34×3=102.

## v1 → v2 is NOT an A/B

Do not diff this against `2026-07-25-sonnet/`: executor models changed (warchief sonnet→opus),
4 cases were rewritten (19/26/27/32), and grading semantics changed (UNGRADED). This baseline
**replaces** v1 as the comparison root for all future prompt tuning:

```
scripts/evals/compare.py \
  --baseline scripts/evals/baselines/2026-07-26-prod-models/benchmark.json \
  --candidate scripts/evals/runs/<your-candidate>/benchmark.json
```
