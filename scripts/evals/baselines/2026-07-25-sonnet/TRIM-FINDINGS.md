# Trim attempt #1 — REJECTED by the benchmark

Two trimmed variants of `warchief.md` were measured against the committed baseline. **Neither
shipped.** The prompts in `plugins/tribe/agents/` are unchanged. Both rejected variants are kept
here so the next attempt starts from evidence instead of repeating them.

## What was measured

| variant | warchief size | what was cut |
|---|---|---|
| baseline | 85,921 chars | — |
| A | 76,093 (−11.4%) | script-resolution dedup, `ESCALATED` trigger table, tie-break Bounds collapse, campaign artifacts, ledger-authority collapse, **plus** rationale prose (the "Why" persuasion paragraph, anti-goal 4 detail, scope-mechanically preamble) |
| B | 76,930 (−10.5%) | A, but with all **rationale prose restored** |

Only `warchief.md` changed; the other five agents were byte-identical, giving a control group.

## Result — 3 runs per side on the disputed cases

| case | baseline | A | B |
|---|---|---|---|
| 12 never-leaks-one-skinners-findings | **3/3** | 0/3 | 0/3 |
| 13 dispatches-asymmetric-skinner-briefs | 2/3 | 1/3 | 0/3 |
| 18 classes-one-flags-one-silent-as-single | 2/3 | 1/3 | 0/3 |
| **total** | **7/9** | **2/9** | **0/9** |

`compare.py` exit 1, `VERDICT: REGRESSION`, on a CONFIRMED 3/3 → 0/3 at eval 12.

## What this actually shows — and what it does not

**The trim regressed warchief materially.** Every warchief case that moved, moved down; none
improved. That direction is consistent enough not to be variance.

**The cause was NOT isolated, and the obvious hypothesis was refuted.** Eval 12 tests Skinner
isolation, and Law 2 — the rule it tests — is *verbatim identical* in both variants. The hypothesis
was that cutting the surrounding rationale ("the Claude that wrote the code wants the code to get
accepted") removed what made the model comply. Variant B restored exactly that prose and scored
**worse** (0/9 vs 2/9), so the hypothesis does not hold. The A-vs-B gap is itself within noise at
n=9; what is solid is that both sit far below baseline.

The remaining explanation is that **cuts to a prompt this size have non-local effects**: evals 13
and 18 test Law 1 and Rule A, neither of which either variant edited, and both regressed anyway.
Removing ~10% of an 86KB densely cross-referenced document appears to degrade instruction-following
in sections that were never touched. That is a claim about *this* prompt at *this* size, measured
once — not a general law.

## The baseline is itself unstable, which is the deeper finding

Evals 13 and 18 score **2/3 at baseline** — the committed prompt does not reliably hold its own
rules. Four cases fail outright at baseline (skinner 27, warchief 12/19/32). warchief spends
~46,000 chars (54% of the file) on audit machinery and still fails 3 of 16 warchief cases.

More prose is not buying more compliance. That argues for **restructuring** warchief rather than
shaving it — but every step has to be measured, because this attempt proves intuition is not
reliable here.

## For the next attempt

1. **Bisect: one cut per measurement.** This attempt bundled five structural cuts plus three prose
   cuts and could not attribute the damage. Land them one at a time.
2. **`--runs 3` minimum, always.** At `--runs 1` eval 12 read as an *improvement* (0/1 → 1/1). At
   3 runs it is the confirmed regression (3/3 → 0/3) — a complete reversal.
3. **Keep an unchanged agent as a control** and read `CONTROL FLIPS` before believing any result.
4. **Fix the 4 standing baseline failures first.** A prompt that fails its own rules is a worse
   problem than a prompt that is too long, and fixing them may itself remove text.
