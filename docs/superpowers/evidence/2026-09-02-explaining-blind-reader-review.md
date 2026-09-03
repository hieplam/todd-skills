# Evidence — Rule 5, the blind-reader review (`explaining` skill)

**Card:** `i106-blind-reader-review` (issue #106, campaign `gh-issues-2026-09`)
**Spec:** `docs/superpowers/specs/2026-09-02-explaining-blind-reader-review-design.md`
**Plan:** `docs/superpowers/plans/2026-09-02-explaining-blind-reader-review.md` (tasks 8 and 9)
**Run by:** Shaman (main session), 2026-09-03 04:42Z → 05:13Z. The Warchief session is capped at
600 s per foreground command and a conformant case-4 run exceeds it, so ruling R1 item 3 moved the
paid runs to the Shaman; the Warchief verified every number below by re-running the check over the
preserved artifacts in its own session (see "Independent re-verification").
**Skill under test:** `plugins/explaining/skills/explaining/SKILL.md` at commit `92caafb`
(sha256 prefix `df18cb701a17f258`, 10 363 chars, 140 lines — recorded by the harness in each
`benchmark.json` under `metadata.evals_run[].subjects.explaining`).

## Validity of this run

- **Zero quota kills.** `grep -rl "hit your session limit"` over every transcript in the results
  directory returns **0 files** outside the invalid attempt named below.
- **One earlier attempt is invalid and is NOT used for any number here.** A run started at
  2026-09-03 00:49Z was killed by the account limit mid-flight; it is preserved at
  `quota-killed-0049Z/` in the results directory purely as a record. Its transcripts *do* contain
  "hit your session limit". Nothing in this document is derived from it.
- `ungraded` = **0** and `setup_errors` = **0** in all four cells.
- **Total measured cost: $8.87** (case4-sonnet $1.97, case4-haiku $1.80, case4-pre $0.04,
  case3 $5.07).

## Exact command lines

All four cells were run from the card worktree via
`.../campaigns/gh-issues-2026-09/evidence/i106/lane.sh` (lane C), which wraps each plan command
with `--out-dir <cell>` and `--timeout 1500`. The plan's commands, as run:

```bash
cd /Users/hip/repo/todd-skills-wt/i106-blind-reader-review
EVALS=plugins/explaining/skills/explaining/evals/evals.json

# Cell 1 — case 4, the G1 gating cell
python3 scripts/evals/run_evals.py --evals "$EVALS" --eval-id 4 --mode with_skill \
  --runs 3 --jobs 3 --exec-model sonnet --grader-model sonnet --timeout 1500 \
  --out-dir <results>/case4-sonnet

# Cell 2 — case 4, the cheap-model transfer cell (reported, does not gate)
python3 scripts/evals/run_evals.py --evals "$EVALS" --eval-id 4 --mode with_skill \
  --runs 3 --jobs 3 --exec-model claude-haiku-4-5-20251001 --grader-model sonnet --timeout 1500 \
  --out-dir <results>/case4-haiku

# Cell 3 — the pre-change cost cell (the 4-rule skill, same prompt)
python3 scripts/evals/run_evals.py --evals "$EVALS" --eval-id 4 --mode with_skill \
  --runs 1 --skill-dir <results>/preskill/plugins/explaining/skills/explaining \
  --exec-model claude-haiku-4-5-20251001 --grader-model sonnet --timeout 1500 \
  --out-dir <results>/case4-pre

# Cell 4 — case 3 regression (task 9)
python3 scripts/evals/run_evals.py --evals "$EVALS" --eval-id 3 --mode both \
  --runs 3 --jobs 3 --exec-model sonnet --grader-model sonnet --timeout 1500 \
  --out-dir <results>/case3
```

Wall-clock boundaries, from `lane-C.log`:

```
[2026-09-03T04:42:33Z] START case4-sonnet   [2026-09-03T04:48:53Z] END exit=0
[2026-09-03T04:48:53Z] START case4-haiku    [2026-09-03T04:58:51Z] END exit=0
[2026-09-03T04:58:51Z] START case4-pre      [2026-09-03T04:59:26Z] END exit=0
[2026-09-03T04:59:26Z] START case3          [2026-09-03T05:13:06Z] END exit=0
```

**Model ids, verbatim:** executor `sonnet` (cells 1 and 4), executor
`claude-haiku-4-5-20251001` (cells 2 and 3), grader `sonnet` (all cells),
`permission_mode: bypassPermissions`, arm `clean`.

## Per-cell results

| Cell | Executor | Runs | Passed | Mean wall-clock | Mean tokens | Cost | Role |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `case4-sonnet` | `sonnet` | 3 | **3/3** | 328.5 s (263.6 / 375.3 / 346.6) | 930 358 | $1.97 | **G1 gate** |
| `case4-haiku` | `claude-haiku-4-5-20251001` | 3 | **1/3** | 524.7 s (491.6 / 488.5 / 594.0) | 744 395 | $1.80 | model transfer, reported |
| `case4-pre` | `claude-haiku-4-5-20251001` | 1 | 0/1 | 34.7 s | 45 897 | $0.04 | cost baseline, reported |
| `case3` `with_skill` | `sonnet` | 3 | **3/3** | 710.1 s | 3 079 343 | $5.07 (both modes) | G5 regression |
| `case3` `without_skill` | `sonnet` | 3 | **0/3** | 19.8 s | 74 753 | — | G5 baseline |

## Independent re-verification (Warchief, own session)

The Warchief re-ran the shipped checker over every preserved case-4 artifact directory, with the
eval prompt passed verbatim, and with `--require-catch` for G3. This is the output it obtained —
every `REVIEW-LOG:` line quoted in the per-goal sections below comes from this re-run, not from
the runner's summary:

```
== case4-sonnet run-1
REVIEW-LOG: file=explanation.md.review.jsonl rounds=1 blocks=0 verdict=PASS
VALID: 1 review log(s) checked, 0 error(s)
exit=0 | require-catch exit=1
== case4-sonnet run-2
REVIEW-LOG: file=explanation.md.review.jsonl rounds=2 blocks=1,0 verdict=PASS
VALID: 1 review log(s) checked, 0 error(s)
exit=0 | require-catch exit=0
== case4-sonnet run-3
REVIEW-LOG: file=explanation.md.review.jsonl rounds=2 blocks=1,0 verdict=PASS
VALID: 1 review log(s) checked, 0 error(s)
exit=0 | require-catch exit=0
```

## G1 — the mechanism runs, end to end · gate ≥2/3 · **3/3 PASS**

Gate cell `case4-sonnet`: `pass_rate` 1.0 in all three runs (`stddev` 0.0). Every run left a
draft and a `*.review.jsonl` on disk, and the shipped checker exits `0` on all three (quoted
above). Per ruling R1 the gate is read from this cell.

## G2 — the reader is genuinely blind · **3/3 of passing runs**

`G2` is asserted *inside* the check that G1 reads: for every round of every log, the rendered
brief must reproduce the template's invariant lines and must share no 12-word run with the eval
prompt. All three sonnet runs return `VALID: 1 review log(s) checked, 0 error(s)` — no
`brief does not match the template` and no `brief leaks` reason appears in any of them. The
cheap-model cell shows the check has teeth on exactly this axis: `case4-haiku` run-2 was failed
for template drift (below).

## G3 — the review actually catches something · gate ≥2/3 · **2/3**

With `--require-catch` (round 1 must find ≥1 `BLOCK`, and round 2's block count must fall below
round 1's), `case4-sonnet` run-2 and run-3 exit `0`; run-1 exits `1` because its very first
blind read came back clean (`rounds=1 blocks=0 verdict=PASS`) — the reader had nothing to catch,
which is a legitimate outcome, not a malfunction. **2 of 3, gate met.**

## G4 — bounded cost · rounds ≤3 in 3/3 · cost reported, never gated

Round counts in the gate cell: **1, 2, 2** — the 3-round cap was never approached, let alone
exceeded. Cost delta on this prompt, reported only:

| Configuration | Executor | Tokens | Wall-clock | Result |
| --- | --- | --- | --- | --- |
| Pre-change skill (4 rules) | `claude-haiku-4-5-20251001` | 45 897 | 34.7 s | FAIL (see caveat) |
| With Rule 5 | `claude-haiku-4-5-20251001` | 744 395 (mean) | 524.7 s (mean) | 1/3 pass |
| With Rule 5 | `sonnet` | 930 358 (mean) | 328.5 s (mean) | 3/3 pass |

Rule 5 costs roughly **16×** the tokens of the pre-change skill on this prompt. That is the honest
price of a multi-round review with a fresh subagent per round, and it is reported, not gated.

**Caveat on the pre-change cell, stated plainly.** Its single run is recorded as `FAIL`, not as
"ungraded", and that `FAIL` says nothing about the pre-change skill's quality. Case 4's `checks[]`
invokes `check-review-log.ts` from `{skill_dir}`, and the pre-change export at `5e8c095` contains
no such script — the check could not run, so the run could not pass. Its **cost and wall-clock
numbers are valid** (one executor call, 1 tool call, 45 897 tokens, 34.7 s); its **pass/fail is
not a quality signal** and must not be read as one.

## A full review log, quoted inline (`case4-sonnet` run-2)

Both rounds, verbatim from `explanation.md.review.jsonl`, with the rendered brief exactly as it
crossed into the reader. Note what the mechanism actually did here: round 1's reader hit a
`BLOCK` — the draft promised a diagram and shipped only an HTML comment — the author fixed it and
re-dispatched a fresh reader, and round 2 came back `PASS`. Round 2's reader also flagged a real
correctness gap as a NIT (log truncation vs. undo), which the author fixed rather than dismissed.

### Round 1 — `block_count` 1, `verdict` FAIL

The rendered brief that crossed into the reader (the log records it verbatim):

```text
Read the file at /private/var/folders/t2/s0b8z5m947l7kdcvwtrtrt480000gn/T/todd-skills-eval-cokanq67/explanation.md. It was written for a backend developer who has never implemented a database, in English.

You are a first-time reader. You have no other context, and you must not go looking for any:
do not read other files, do not search anywhere, do not guess at what was intended. Judge
only what is on the page.

Report every place you could not follow, in the order they appear. Give each one as three
labelled lines:

LOCATION: a short quoted phrase, or the heading it sits under
WHAT BROKE: one sentence, in your own words
SEVERITY: BLOCK if you could not understand it, NIT if you understood it but it read rough

Look especially for: a term used before it is introduced, a jump between two ideas with no
bridge, a claim with nothing concrete to anchor it, a sentence you had to read twice, and a
section whose purpose is never stated.

Report the single hardest passage even when nothing blocked you, as a NIT.

End your reply with exactly one terminal line, and nothing after it: READER: PASS when you
found zero BLOCK findings, or READER: FAIL n BLOCK when you found n of them.
```

The reader's findings, and what the author did with them:

```json
{
  "round": 1,
  "findings": [
    {
      "severity": "BLOCK",
      "location": "diagram intro / <!-- diagram: wal-flow.html -->",
      "issue": "text promised a diagram \"below\" but only an HTML comment appeared, so the promised anchor never materialized"
    },
    {
      "severity": "NIT",
      "location": "LSN used before defined in log excerpt",
      "issue": "LSN labeled every line of the example before being defined"
    },
    {
      "severity": "NIT",
      "location": "records before the commit phrasing",
      "issue": "ambiguous phrase needed re-parsing"
    },
    {
      "severity": "NIT",
      "location": "buffer pool undefined",
      "issue": "term used with no definition"
    },
    {
      "severity": "NIT",
      "location": "fsync guarantee double-negative sentence",
      "issue": "hardest passage, needed two reads"
    },
    {
      "severity": "NIT",
      "location": "cheaper to verify than to skip",
      "issue": "unsupported comparison claim"
    }
  ],
  "block_count": 1,
  "verdict": "FAIL",
  "author_action": "fixed diagram reference wording to point to companion HTML file instead of claiming it renders inline; defined LSN before use; clarified buffer pool, fsync guarantee sentence, undo-timing phrase, and redo justification"
}
```

### Round 2 — `block_count` 0, `verdict` PASS

The rendered brief that crossed into the reader (the log records it verbatim):

```text
Read the file at /private/var/folders/t2/s0b8z5m947l7kdcvwtrtrt480000gn/T/todd-skills-eval-cokanq67/explanation.md. It was written for a backend developer who has never implemented a database, in English.

You are a first-time reader. You have no other context, and you must not go looking for any:
do not read other files, do not search anywhere, do not guess at what was intended. Judge
only what is on the page.

Report every place you could not follow, in the order they appear. Give each one as three
labelled lines:

LOCATION: a short quoted phrase, or the heading it sits under
WHAT BROKE: one sentence, in your own words
SEVERITY: BLOCK if you could not understand it, NIT if you understood it but it read rough

Look especially for: a term used before it is introduced, a jump between two ideas with no
bridge, a claim with nothing concrete to anchor it, a sentence you had to read twice, and a
section whose purpose is never stated.

Report the single hardest passage even when nothing blocked you, as a NIT.

End your reply with exactly one terminal line, and nothing after it: READER: PASS when you
found zero BLOCK findings, or READER: FAIL n BLOCK when you found n of them.
```

The reader's findings, and what the author did with them:

```json
{
  "round": 2,
  "findings": [
    {
      "severity": "NIT",
      "location": "companion diagram reference lacks description of contents",
      "issue": "diagram pointer gives no on-page summary of what it shows"
    },
    {
      "severity": "NIT",
      "location": "log segments plural vs single-file framing",
      "issue": "segments introduced without reconciling with earlier single-file description"
    },
    {
      "severity": "NIT",
      "location": "fsync guarantee two-consequence sentence",
      "issue": "hardest passage, packs two consequences into one sentence"
    },
    {
      "severity": "NIT",
      "location": "undo needing records older than checkpoint truncation floor",
      "issue": "truncation section and undo section not reconciled \u2014 real correctness gap"
    }
  ],
  "block_count": 0,
  "verdict": "PASS",
  "author_action": "kept diagram/segment NITs as-is (stylistic, not blocking); fixed the truncation-vs-undo gap by adding a paragraph noting the truncation floor is the older of the checkpoint LSN and the earliest LSN of any still-active transaction"
}
```

## Model transfer — the `claude-haiku-4-5-20251001` cell (reported, does not gate)

Ruling R1 fixed this cell's role: it is the model-transfer measurement, reported in full the way
the skill's own Evidence section reports its Opus→Fable transfer grid. **1 of 3 passed.** The
three failure shapes, from the Warchief's own re-run of the checker over the preserved logs:

```
== case4-haiku run-1  (FAIL)
REVIEW-LOG: file=wal_explanation.md.review.jsonl rounds=2 blocks=4,2 verdict=FAIL
INVALID: line 1: not valid JSON
INVALID: round numbers are not consecutive from 1 (saw 2 at position 1)
INVALID: round numbers are not consecutive from 1 (saw 3 at position 2)
INVALID: review stopped at round 2 still failing, before the cap of 3
exit=1

== case4-haiku run-2  (FAIL)
REVIEW-LOG: file=wal-explanation.md.review.jsonl rounds=3 blocks=1,2,0 verdict=PASS
INVALID: round 1: brief does not match the template, missing: You are a first-time reader. You have no other context, and you must not go looking for any:
INVALID: round 2: brief does not match the template, missing: (same line)
INVALID: round 3: brief does not match the template, missing: (same line)
exit=1

== case4-haiku run-3  (PASS)
REVIEW-LOG: file=wal-explanation.md.review.jsonl rounds=3 blocks=1,1,1 verdict=FAIL
VALID: 1 review log(s) checked, 0 error(s)
exit=0
```

Read them as three distinct defect classes:

1. **Run 1 — a corrupt first log line and a broken round sequence.** The first line is not valid
   JSON at all, and the surviving records start at round 2, so the round-1 record was mangled
   rather than merely missing. The run then stopped at round 2 while still failing, short of the
   cap the rule requires it to reach.
2. **Run 2 — brief drift.** The reader was dispatched with a paraphrased brief in all three
   rounds: the invariant line "You are a first-time reader. You have no other context, and you
   must not go looking for any:" never survived rendering. This is precisely the blindness
   guarantee G2 exists to protect, and the check caught it in every round even though the review
   itself ran to a `PASS` verdict. A cheap model rewriting the brief in its own words is the
   failure mode to watch.
3. **Run 3 — the honest cap (this one PASSED).** Three rounds, one `BLOCK` each, final verdict
   `FAIL` at the cap. The rule's contract is "stop at round 3 even on FAIL", so a log that
   records exactly that is **well-formed**: the checker exits `0`, and the run passes. This is the
   behaviour ruling R1's hardening was written to produce, and it is the one Haiku run that
   produced it.

Note what is *absent* from all three: none of them skipped the review by declaring dispatch
unavailable, and none of them ran a fourth round — the two failure shapes that blocked the first
evidence attempt and prompted ruling R1. What remains on the cheap model is log fidelity (runs 1
and 2), not procedure avoidance.

## Preserved artifacts

Under `2026-09-02-explaining-blind-reader-review-artifacts/`:

| Path | What it is |
| --- | --- |
| `case4-sonnet-benchmark.json` | the gate cell's full `benchmark.json` (also copied to `...-benchmark.json` beside this document) |
| `case4-haiku-benchmark.json`, `case4-pre-benchmark.json`, `case3-benchmark.json` | the other three cells' raw results |
| `case4-sonnet-run-2-explanation.md` | the draft that the quoted 2-round review was run against |
| `case4-sonnet-run-2-explanation.md.review.jsonl` | that review's raw log |
| `case4-haiku-run-3-draft.md`, `case4-haiku-run-3.review.jsonl` | the one passing cheap-model run: three rounds, honest cap |
| `case4-haiku-run-2.review.jsonl` | the brief-drift failure, kept because it is the log that proves the check has teeth |

The complete results tree — every transcript, `grading.json`, `metrics.json` and artifacts
directory, plus `lane.sh`, `lane-C.log` and the invalid `quota-killed-0049Z/` attempt — lives
outside the repo at
`~/.tribe/-Users-hip-repo-todd-skills/campaigns/gh-issues-2026-09/evidence/i106/`.
