# Spec — Blind-reader review for the `explaining` skill (Rule 5)

**Card:** `i106-blind-reader-review` · **Source:** GitHub issue #106 · **Date:** 2026-09-02
**Author:** Shaman (What/Why). The plan (How) is authored separately by a planning Warchief.
**Status:** contract for the implementation card in campaign `gh-issues-2026-09`.
**Base:** `master` @ `5e8c095`.

---

## 1. Problem, grounded

### 1.1 The skill grades its own homework

`plugins/explaining/skills/explaining/SKILL.md` ends with a "Self-check before finishing"
(three questions the author asks itself). Every rule and the check run inside the same
context window that wrote the draft. The owner's observation (issue #106, translated):

> even with all rules prompted, long explanations and HTML artifacts still come out with
> context jumps, prose that hurts to read, explanations that do not flow.

These are reader-side defects: the author has the context that makes a jump feel smooth;
the reader does not. A self-check cannot detect what only the absence of context reveals.

### 1.2 The tribe already knows the cure, for code

The tribe's review cell for code is built on exactly this asymmetry:

- `plugins/tribe/agents/skinner.md:19-24` — "Do not believe anything the codework (or the
  verifier) claims"; the reviewer re-derives from the contract.
- `docs/tribe/planning/idea-02-context-isolation/spec.md` §1.1 — "Telling an LLM 'don't be
  persuaded by the argument I am about to show you' is not the same as not showing it the
  argument." The seal: the reviewer's dispatch carries an allowlist of inputs, nothing else.

Nothing equivalent exists for prose. This spec ports the seal to the explaining skill.

### 1.3 What exists to build on (verified on disk)

| Fact | Where |
| --- | --- |
| Skill body: Rules 1–4 + self-check + evidence note | `plugins/explaining/skills/explaining/SKILL.md` |
| Skill-local scripts dir, installed whole by symlink | `plugins/explaining/skills/explaining/scripts/` (`render-illustration.ts`, `validate-mermaid.ts`) |
| Eval fixture with `checks[]` (machine, exit-code) and `artifacts[]` (globs preserved as evidence) | `plugins/explaining/skills/explaining/evals/evals.json` case 3 |
| Harness: isolated `claude -p` per run, `with_skill` copies the whole skill dir; `--exec-model`, `--runs`, `--arm`, skill-dir override | `scripts/evals/README.md`, `scripts/evals/run_evals.py` |
| Evidence convention: dated JSON/MD under `docs/superpowers/evidence/`; prior card kept `EVIDENCE.md` + `benchmark.json` + artifacts | `docs/tribe/planning/explaining-illustration/evidence/` |
| C3 frozen fact: "never rule additions without new eval evidence" | `.c3/c3-2-plugins/c3-201-explaining.md` Derived Materials |
| Subagents start with a fresh context unless dispatched as `fork` | Claude Code Agent tool contract (host) |

---

## 2. The change (What)

### 2.1 Rule 5 — Blind-reader review before delivery

Add a fifth rule to `SKILL.md`, after Rule 4, with this contract (wording is the Warchief's;
the contract is not):

1. **When.** The deliverable is an on-disk artifact (HTML or markdown file) **or** the
   explanatory prose is ≥600 words. Otherwise the existing self-check alone applies.
2. **Draft to disk.** The author writes the complete draft to a file (for an artifact, the
   artifact itself; for prose, a scratch file). Reviewing happens on the file, never on
   pasted text — this is what makes the reader's input an allowlist.
3. **Dispatch a blind reader.** One fresh subagent (never `fork`; never the current session)
   with a brief rendered from a fixed template that carries ONLY: the file path, the intended
   audience (one phrase), the artifact's language, and the reader's instructions. The
   template lives in the skill directory (e.g. `references/blind-reader-brief.md`) so the
   eval harness installs it with the skill. Reader model tier: `sonnet` by default (D106-3).
4. **The reader's job.** Read the file as a first-time reader with no other context. Report
   every place it could not follow: a term used before it is introduced, a jump between ideas
   with no bridge, a claim with no anchor, a sentence it had to read twice, a section whose
   purpose is unstated. Each finding: location (quoted phrase or heading), what broke, and a
   severity — `BLOCK` (could not understand) or `NIT` (understood, but rough). Terminal line:
   `READER: PASS` (zero BLOCK) or `READER: FAIL <n> BLOCK`.
5. **Fix and loop.** The author fixes every BLOCK (NITs optional, each dismissal needs a
   one-clause reason in the log), rewrites the file, re-dispatches a **new** reader (fresh
   context again). Termination: `READER: PASS`, or round 3 completed. Never a 4th round.
6. **Review log.** A machine-readable log next to the draft (e.g. `<file>.review.jsonl`),
   one record per round: round number, the rendered brief (verbatim), findings with
   severity, block count, verdict, and what the author changed. This log is the evidence
   the eval check reads; it is also what the owner reads to audit a review after the fact.
7. **Visible ending.** The final answer carries exactly one line about the review:
   `Blind-reader review: PASS after N round(s)` or
   `Blind-reader review: ended at cap with K open BLOCK finding(s)` (list them). Never silent.
8. **Degrade, never block.** If the session has no subagent dispatch tool, skip the review,
   keep the self-check, and say so in one line.

> **Amended by ruling R1 (2026-09-03):** items 5, 6 and 8 are tightened so a cheap executor
> cannot skip, mis-log or over-run the review. Degrade (item 8) is permitted only after an
> actual dispatch attempt has failed, and that failure is recorded as round 0 in the log —
> believing no dispatch tool exists is not a permitted reason. Each round's log record (item 6)
> is OPENED with its round number and rendered brief *before* the reader is dispatched and
> COMPLETED when it returns, which makes a missing log impossible without skipping the dispatch.
> Item 5's cap is stated as one sentence the check script quotes back: "Round 3 is the last
> round. After its verdict, stop — even on FAIL." The reader is dispatched with
> `run_in_background: false` (the skill runs in headless sessions), stated in both the rule text
> and the brief template's rendering notes.

### 2.2 The self-check gains item 4

"Did the blind-reader review run (or was its absence stated)?"

### 2.3 Eval case 4 (new) + evidence

- A new case in `evals.json` with a prompt that reliably produces ≥600 words of explanation
  (a topic with several interacting concepts). `checks[]` runs a script that parses the review
  log and exits 0 only when: the log exists; 1 ≤ rounds ≤ 3; every rendered brief matches
  the template shape and contains no 12-word-or-longer substring of the eval prompt; the
  final verdict is PASS or the round count is 3. `artifacts[]` preserves the draft and the log.
- The check script is skill-local (`scripts/check-review-log.ts` or similar), with its own
  `bun test` suite, so it installs with the skill like the two existing scripts.
- Evidence: run the harness for case 4 with `--exec-model claude-haiku-4-5-20251001`
  (owner's cheap-model e2e rule), `--runs 3`, with-skill; plus one with-skill run of the
  PRE-change skill dir on the same prompt (skill-dir override) for the cost/quality delta.
  Record in `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review.md` +
  `benchmark.json`, and preserve at least one review log and draft per cell.

> **Amended by ruling R1 (2026-09-03):** case 4 runs in **two** executor cells of 3 runs each —
> `claude-haiku-4-5-20251001` and `sonnet` — plus the pre-change cost cell. **G1's ≥2/3 gate
> applies to the `sonnet` cell.** The Haiku cell is reported in full (pass rate and the failure
> shapes) as the model-transfer measurement, the way the skill's Evidence section already reports
> its Opus→Fable transfer grid; it does not gate. If the `sonnet` cell also misses ≥2/3, the rule
> does not ship — escalate with the numbers (§7 risk 1 stands). The paid runs are executed by the
> Shaman in its own session (a conformant run over-runs the Warchief session's 600-second command
> cap); the Warchief incorporates the results into the evidence document.

> **Amended by ruling R2 (2026-09-03):** the prompt-leak check's contract is **word-based** — a
> shared run of 12 whitespace-normalized words — so any prompt that normalizes to fewer than 12
> word tokens is **out of contract** (scripts with no whitespace word boundaries, such as Japanese
> or Chinese, are the motivating case, but a short prompt in any language hits the same condition):
> `check-review-log.ts` prints `WARN: prompt-leak detection not applicable (prompt has <12 word
> tokens)` and continues, announcing the gap rather than passing silently, and character-n-gram
> leak detection for those scripts is a separate follow-up, not part of this card.

### 2.4 Governance

- `/c3` change-unit naming c3-201; ADR recording Rule 5, its evidence bounds, and the
  decisions D106-1..5; c3-201's Contract row for `SKILL.md` and Derived Materials updated to
  name Rule 5 and the review-log artifact.
- `plugins/explaining/README.md`: "The four rules" becomes five; the check script joins "The
  two scripts".

---

## 3. Decisions (frozen — the plan must not re-open)

| Id | Decision | Why |
| --- | --- | --- |
| D106-1 | Reader is the judge; hard cap 3 rounds | Author-as-judge re-opens the blind spot; cap bounds cost |
| D106-2 | Threshold: on-disk artifact OR ≥600 words | Short answers are cheap to read and the review would cost more than it saves |
| D106-3 | Reader model `sonnet` by default, documented knob | Same tier as the skinner reviewer; not the cheapest, not the dearest |
| D106-4 | Degrade to self-check when dispatch is unavailable | The skill runs in subagents too; a hard dependency would break them |
| D106-5 | Visible ending line, always | Silence is what the issue complains about |
| D106-6 | Brief template ships inside the skill dir, no new agent file | Keeps c3-201 "skill-only"; harness installs the skill dir whole |

---

## 4. Non-goals

- Reviewing code, diffs, or operational output (the skill's description already excludes them).
- A cross-vendor reviewer (issue's future note) — a later card.
- Changing Rules 1–4 text or their evidence.
- Making the review mandatory for short answers.

---

## 5. Acceptance — measurable goals (from the card; the Shaman verifies each from evidence)

| Goal | Evidence the PR must carry | Gate |
| --- | --- | --- |
| G1 mechanism | harness run, case 4, 3 runs per executor cell, artifacts + check output | ≥2/3 runs pass `checks[]` in the `sonnet` cell (amended by ruling R1; the `claude-haiku-4-5-20251001` cell is reported, not gating) |
| G2 blind | check asserts brief == template shape and no prompt leakage | 3/3 of passing runs |
| G3 catches | round-1 BLOCK ≥1 and round-2 BLOCK < round-1 | ≥2/3 runs |
| G4 cost | rounds ≤3 (gate); cost/wall-clock delta vs pre-change skill (report) | rounds ≤3 in 3/3 |
| G5 regression | case 3 re-run: with-skill ≥2/3 artifact valid, baseline 0/3 | as recorded before |
| G6 governed | change-unit, ADR, c3-201 sync, README, self-check item 4 | present in the diff |

---

## 6. Verification steps (what the Shaman runs before merging — the executor must make each one runnable)

1. `cd plugins/explaining/skills/explaining/scripts && bun test` — all green, includes the
   check script's own suite.
2. From repo root: `python3 scripts/evals/run_evals.py --evals plugins/explaining/skills/explaining/evals/evals.json --eval-id 4 --mode with_skill --runs 3 --exec-model claude-haiku-4-5-20251001 --grader-model sonnet` — ≥2/3 pass; inspect one preserved `*.review.jsonl`: rounds ≤3, brief matches template, findings present.
   **Amended by ruling R1 (2026-09-03):** run this twice, once per executor cell — the command
   above (`--exec-model claude-haiku-4-5-20251001`, reported only) and the same command with
   `--exec-model sonnet`, which is the cell the ≥2/3 gate is read from. Both cells are run by the
   Shaman and reported in the evidence document.
3. `--eval-id 3 --mode both --runs 3` — with-skill ≥2/3, baseline 0/3 artifacts (G5).
4. `grep -c "Rule 5" plugins/explaining/skills/explaining/SKILL.md` ≥1; the self-check lists 4 items.
5. Diff file list ⊆ scope fence (card §Scope fence).
6. Two independent skinner reports, both `AUDIT: PASS`; tracker and scout reports present.
7. `.c3/changes/` has a change-unit naming c3-201; ADR present; `c3-201` doc updated.
8. Evidence document exists under `docs/superpowers/evidence/` with command lines, model ids,
   cost, and per-cell results.

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| The reader is too lenient on a model tier and never finds anything (G3 fails) | Brief instructs "report at least the one hardest passage even when PASS"; if G3 still fails, the Warchief escalates with the numbers — the rule does not ship on a theater result |
| Prompt leakage through the file itself (the draft quotes the user's question) | The leakage check looks at the BRIEF, not the file; quoting the question inside the artifact is legitimate content |
| Harness cannot run a skill that dispatches subagents (`claude -p` tool availability) | De-risk first: one manual `claude -p` run proving the Agent tool is callable in the harness's leg; if not, escalate NEEDS_DIRECTION with the transcript |
| Cost blow-up on huge artifacts | Cap 3 rounds; the brief asks for findings, not a rewrite |
