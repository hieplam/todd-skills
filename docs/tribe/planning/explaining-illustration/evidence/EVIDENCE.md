# Eval evidence — explaining illustration capability

**Run by:** Shaman (main session), 2026-08-21 · **Branch:** `warchief/explaining-illustration` @ `e0cad75`
**Command:**

```bash
python3 scripts/evals/run_evals.py \
  --evals plugins/explaining/skills/explaining/evals/evals.json \
  --eval-id 3 --mode both --arm both --runs 3 --jobs 3 \
  --exec-model sonnet --grader-model sonnet
```

**Executor + grader model:** `sonnet` (recorded per-run as `result.model` in `benchmark.json`).
**Cost:** $2.16 across 9 executor + 9 grader calls. **Ungraded:** 0. **Setup errors:** 0.

## Result per cell

| Cell | Passed | Gate | Verdict |
|---|---|---|---|
| `clean` · `with_skill` | **2/3** | G1: ≥2 of 3 | **PASS** |
| `clean` · `without_skill` | **0/3** | G2: baseline must NOT produce the artifact in ≥2 of 3 | **PASS** (0 of 3 produced any HTML) |
| `mem` · `with_skill` | **2/3** | G4: report delta, never gate | **Δ = 0.00** |

`mem` · `without_skill` was correctly **not run** — `--safe-mode` already suppresses `CLAUDE.md`,
so an ambient-memory arm there would measure nothing. The runner omits the cell rather than
fabricating it.

## G1 — the skill produces a valid rendered illustration

2 of 3 clean `with_skill` runs wrote a self-contained `.html` whose mermaid **parses**.
Independent re-verification of one artifact, run by hand outside the harness:

```
$ bun .../scripts/validate-mermaid.ts --html-glob 'tribe-flow.html'
VALID: 1 diagram(s) found, 0 error(s)
exit=0
$ grep -oE 'src="[^"]*"|href="[^"]*"' tribe-flow.html | sort -u
(no output — no external src/href)
```

The produced diagram covers the full dispatch chain **and** conditional paths (Tracker
`BLOCK` → fixer loop; `CONFIRMED` → fixer; a dotted conditional Scout dispatch), and applies the
ported Kanna syntax rules — parens inside quoted labels are escaped `#40;` / `#41;`.

## G2 — the capability is attributable to the skill

**0 of 3** `without_skill` baseline runs produced any HTML artifact. Every failure carried the
identical machine-check evidence:

```
machine check 'html-mermaid-parses' failed — exit 1: INVALID: 0 diagram(s) found, 0 error(s)
```

This is the causal attribution the card demanded: the base model does not do this unprompted, so
the 2/3 in G1 is the skill's contribution and not the model's default.

Secondary signal in the same direction — baseline runs are far cheaper and shorter because they
simply answer in prose: **88k tokens / 24.0 s mean** versus **322k tokens / 54.5 s mean** with the
skill. The skill is really doing extra work (reading, rendering, validating), not just rephrasing.

## G3 — validity is a real parse, with a working negative control

Verified by hand before spending anything on the paid run:

| Input | Output | Exit |
|---|---|---|
| valid mermaid | `VALID: 1 diagram(s) found, 0 error(s)` | 0 |
| `A[fetch (no header)]` (unquoted paren) | `INVALID` + mermaid `Parse error on line 2` + caret + hint | 1 |
| parser unavailable (no `node_modules`, registry → `127.0.0.1:1`) | `COULD_NOT_VALIDATE — ship the file anyway, unvalidated` | 2 |

The third row is the card's hard requirement: a dependency/network failure degrades to
`COULD_NOT_VALIDATE` (exit 2) and is **never** scored as a behavioral FAIL.

## G4 — ambient memory neither helped nor suppressed

`clean` mean pass rate 0.667, `mem` mean pass rate 0.667 → **Δ = 0.00**. Reported, not gated,
exactly as specified.

## G5 — the test suites

```
$ python3 -m unittest discover -s scripts/evals/tests -t .
Ran 48 tests — OK
$ (cd plugins/explaining/skills/explaining/scripts && bun test)
52 pass, 0 fail — 52 tests across 2 files
```

## Honest limits on these numbers

1. **Measured on `sonnet` only.** G2 is *easier* to pass on a smaller model, which is less prone to
   volunteering a diagram unprompted. This run establishes the capability on sonnet; it does **not**
   establish that the baseline stays silent on opus. Re-run with `--exec-model opus` before claiming
   the attribution holds there.
2. **n = 3 per cell — directional, not statistical.** `clean · with_skill` pass-rate stddev is
   **0.577** (the samples are literally 0, 1, 1). At this sample size Δ = 0.00 between arms cannot
   distinguish "no effect" from "an effect smaller than the noise floor".
3. **The skill fires about 2 times in 3, not always.** Both `with_skill` failures (one clean, one
   mem) are the *same* mode: no HTML written at all — not a broken diagram. The gate passes as
   specified, but a 1-in-3 miss rate is a real reliability observation and should be recorded rather
   than smoothed over. Recommended as a follow-up idea card (tighten the Rule 4 trigger), not as a
   blocker for this PR.

## Findings raised by the Shaman during verification

| id | severity | location | claim |
|---|---|---|---|
| S1 | Minor | `plugins/explaining/skills/explaining/scripts/validate-mermaid.ts` | `--help` is not handled — it falls through to the default glob and scans the cwd's HTML files, printing e.g. `INVALID: 2 diagram(s) found` instead of usage. No `help` string exists in the file. Not a correctness defect; a UX gap in a script the SKILL.md tells the model to invoke. |

## Addendum — what changed after these numbers were measured

The run above was executed at `e0cad75`. Two commits landed after it, so the numbers are **not**
from the branch head. Both are audit fixes confined to `validate-mermaid.ts`; neither can move
G1, G2 or G4, and G3 was re-verified at the new head.

| Commit | Finding | Change |
|---|---|---|
| `735c403` | FA1 (Critical) | Stalled `bun install` now gets a direct synchronous `SIGKILL`; the dead async `ensureTerminated`/`KILL_GRACE_MS` escalation is deleted. |
| `735c403` | S1 (Minor) | `--help`/`-h` now print usage and exit 0 instead of falling through to the default `*.html` glob. |

Why the measured numbers still stand, each checked by command:

```
$ git diff --name-only e0cad75..735c403
plugins/explaining/skills/explaining/scripts/validate-mermaid.test.ts
plugins/explaining/skills/explaining/scripts/validate-mermaid.ts
```

`SKILL.md`, `render-illustration.ts` and `evals/evals.json` — the three surfaces G1/G2/G4 actually
measure — are byte-identical between `e0cad75` and the head (`git diff --quiet` returns 0 for each).

G3's classification logic is untouched, and was re-run against the real exported function at the
new head:

```
"unavailable" artifacts=1 errors=0 -> COULD_NOT_VALIDATE (exit 2)
"ready"       artifacts=1 errors=0 -> VALID              (exit 0)
"ready"       artifacts=1 errors=1 -> INVALID            (exit 1)
"unavailable" artifacts=0 errors=0 -> INVALID            (exit 1)
```

G5 re-run at the head: `48` python tests OK, `53` bun tests pass / 0 fail (was 52 — the FA1 fix
removed 2 dead `ensureTerminated` tests and added 3 for the new synchronous-kill seam and `--help`).

**S1 is fixed in this PR**, not deferred — see `735c403`.
