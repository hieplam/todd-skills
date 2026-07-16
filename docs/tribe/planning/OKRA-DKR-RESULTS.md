# DKR-0 + DKR-1 — probe results

> The discovery probe defined in `OKRA-FRAME.md`. It answers two questions **before** any of the
> 01/03/04 cluster gets built: *what is the tribe's audit recall today?* and *does a second reviewer
> actually add anything?*
>
> **Verdict: veto idea 01. Re-scope idea 03. Re-scope idea 04.** Reasoning below; raw findings and
> the benchmark are reproducible from the artifacts named at the end.

## Method

10 diffs in the tribe's own bash idiom (`set -euo pipefail`, `LOG`/`DIE`, JSON on stdout, exit 0/2),
against plausible tribe scripts — `build-queue.sh`, `integrate-wave.sh`, `validate-plan.sh`,
`wave-timeout.sh`, `resolve-base.sh`, `cleanup-worktrees.sh`. Eight carried exactly one planted
defect; two were clean controls. The answer key was quarantined outside the case directories.

Three reviewer arms, all on `sonnet` (the Skinner's real tier), one fresh context per diff:

| Arm | Sees | Represents |
|---|---|---|
| **A1** | contract + diff + runnable code | **the tribe today** — the DKR-0 baseline |
| **A2** | identical to A1 | **idea 01** — two Skinners, diversity from sampling alone |
| **B** | the bare diff only, "assume the code is wrong" | **idea 03** — the cold lens |

## Result 1 — the baseline is already at ceiling

**Today's single Skinner caught 7 of 7 valid planted defects. `audit_recall = 1.00`.**

| # | Planted defect | A1 | A2 | B |
|---|---|:--:|:--:|:--:|
| 01 | `((rows++))` returns 1 when `rows=0` → `set -e` kills the script | ✅ | ✅ | ✅ |
| 02 | `local sha=$(git …)` masks the exit status → empty base-sha written | ✅ | ✅ | ✅ |
| 03 | `while read` on the RHS of a pipe → counter lost in the subshell | ✅ | ✅ | ✅ |
| 04 | `grep -c` exits 1 on zero matches → aborts on the very case it must reject | ✅ | ✅ | ✅ |
| 05 | negative age from clock skew → a hung Warchief is never reported hung | ⚠️ | ❌ | ❌ |
| 06 | no test for the exit-3 conflict path (an **absence**) | ✅ | ✅ | ❌ |
| 07 | eager `merge-base` before the override is read → dies where the override exists to save it | ✅ | ✅ | ✅ |
| **Recall** | | **7/7** | **6/7** | **5/7** |

⚠️ = A1 flagged the negative-age condition but rated it `Minor` and framed it as a cosmetic JSON
oddity, missing the consequence (the watchdog silently stops watching). It found it; it under-graded it.

**Case 08 is excluded — my planted defect was not reachable.** I planted an empty-`$name` blast radius
(`rm -rf "$ROOT/"`), but `git worktree list --porcelain` never emits a trailing slash, so `$name` is
never empty. **All three reviewers were right to ignore it and my ground truth was wrong.** Verified by
running it. This is the reproduce-first rule (idea 05, shipped) working on the person holding the
answer key.

## Result 2 — the second reviewer adds nothing

This is the number the whole 01/03/04 cluster rests on:

| Design | Recall | Marginal gain over one Skinner |
|---|:--:|:--:|
| One Skinner (today) | **1.00** | — |
| **union(A1, A2)** — idea 01 | **1.00** | **+0.00** |
| **union(A1, B)** — idea 01+03 | **1.00** | **+0.00** |

Both second reviewers caught a **strict subset** of what the first one caught. Neither found a single
planted defect that A1 missed.

**False positives on the clean controls: 0 across all three arms.** Nobody invented a bug. The
adversarial priming did not make reviewers paranoid — that risk was real, and it did not materialise.

## Why the `p²` math didn't transfer

`70% → ~91%` requires the two reviewers' errors to be *independent*. Two runs of the same model, on the
same prompt, over the same input are not independent — which is exactly what idea 03's own spec argued
against idea 01 (§4.2: *"same model + same prompt + same input → they share the model's own blind
spots"*). **The experiment confirms idea 03's critique of idea 01, and then refutes idea 03's own remedy
on recall grounds.**

But the deeper reason is a difference nobody noticed when importing the idea:

> **Bun's reviewers *read* a diff. Tribe's Skinner *runs the code*.**

Every planted defect here is runtime-reproducible, and the arm that could execute found all of them.
Recall is at ceiling because the tribe's reviewer has a proof mechanism Bun's reviewers didn't. You
cannot buy a second 70% when the first reviewer is already at 100%.

## Result 3 — the cold lens is not a recall booster, but it is not worthless

It missed contract-defined defects (case 06's missing test is invisible if you were never shown the
requirement), yet it found **three real bugs that both contract-holding reviewers missed** — all
verified by running them:

| Real bug found only by the cold lens | Verified |
|---|---|
| `while read` silently drops a file's **last line when it has no trailing newline** — the queue loses an entry and the count hides it | ✅ reproduced: 2-line file → `rows=1` |
| `git worktree list` called **without `-C "$ROOT"`** — enumerates whatever repo the ambient CWD is in | ✅ |
| On a wave of N branches, a conflict at branch *k* leaves branches 1..k-1 **already merged and not rolled back** — "leaving the tree clean" is false | ✅ |

And it produced **one verified false positive**: it claimed `exit 3` inside the pipe-subshell would not
abort the script, so a failed merge would print success-shaped JSON. **It does abort** — `set -e` sees
the pipeline return 3 and the script exits 3. Reproduced; the claim is dead.

That profile — *finds genuine idiom/runtime bugs the contract steers you past, at the cost of some false
claims* — is precisely what idea 03 predicted. Its value is real. Its value is **not** recall, and it
must not be sold as recall.

## What this means for the cards

| Card | Ruling | Why |
|---|---|---|
| **01 — two identical Skinners** | **VETO** | +0.00 recall for ~2× reviewer cost. The `p²` premise requires independence that two identical prompts do not produce. |
| **03 — input asymmetry (cold lens)** | **RE-SCOPE, don't veto** | Zero recall gain, but 3 real unique bugs. Fund it as a *second error distribution*, measured by **unique real findings**, never by recall. Its false positives land on idea 05's reproduce-first fixer — already shipped, already absorbing them. |
| **04 — disagreement routing** | **RE-SCOPE** | Its `[both]`/`[one]` classes are near-degenerate on contract defects (overlap was total). The `[one]` class is real but consists almost entirely of the cold lens's unique findings. Build it *only* if 03 lands, and size it to that traffic. |
| **02, 06, 07, 08, 09, 10** | **Unaffected** | The probe says nothing about them. They remain known work. |

**And the frame's objective has no headroom.** `audit_recall` reads **1.00** against a candidate target
of **≥ 0.90**. A campaign whose stated goal is already met cannot be justified by that goal — this is the
`pointless` flag firing *before* a single task was spent, which is the entire point of running the probe
first.

## Honest limits of this probe

The reasons a reasonable person could reject the verdict, stated before anyone has to dig for them:

1. **n = 7 planted defects, one sample per arm.** This is a probe, not a study. A 7/7 could be 6/7 on a
   re-run.
2. **I authored both the defects and the answer key — and I got one wrong** (case 08). A benchmark
   written by the same model family that reviews it may be systematically easy for it.
3. **Bash only.** Much of the tribe's real work is prompt-file (markdown) edits, where "run the proof" is
   grep-shaped. Recall there could look nothing like this.
4. **The cold lens was denied the code tree, not just the spec.** Idea 03 specifies exactly that ("ONLY
   the diff"), so the arm is faithful to the card — but it conflates *no contract* with *cannot execute*,
   and A1's edge may be execution rather than context. **A follow-up probe (cold lens **with** the code
   tree, without the spec) would separate them, and could rescue idea 03's recall case.** Cheap; worth
   running before 03 is finally ruled on.

## Artifacts

- Benchmark, answer key, and all 30 raw reviewer outputs: `scratchpad/okra-dkr/`
  (`cases/`, `truth/`, `results/{A1,A2,B}/`) — not yet landed in the repo.
- Regenerate the benchmark: `python3 gen.py`.
- Every claim marked "verified" above was reproduced by running it, not by trusting the reviewer.
