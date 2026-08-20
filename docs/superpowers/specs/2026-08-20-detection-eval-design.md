# Detection Eval — do Scout/Tracker catch unwritten conventions?

**Date:** 2026-08-20
**Status:** approved design
**Owner decision trail:** detection-only scope · both detectors (Scout + Tracker) · TypeScript/bun fixture · manifest + LLM-judge grading · standalone harness (owner's explicit choice over extending `run_evals.py`)

## Problem

The repo's existing evals (`plugins/tribe/evals/evals.json`, 43 cases via `scripts/evals/run_evals.py`)
are **role-behavior** evals: a prompt describes a situation and a grader checks the agent stayed in
role. Almost every case ships `files: []` — none measures the capability the self-improvement loop
actually depends on: **inferring an unwritten convention from a real codebase and catching where it
breaks**. The loop (Tracker surfaces a harness gap → ledger → Scout adjudicates → rule authored →
Tracker enforces) is only as good as its two detection doors, and neither door has a real-LLM,
real-codebase eval today.

## Goal

A repeatable benchmark answering, with numbers: *given a codebase whose conventions are written
nowhere, what fraction does the tribe's detection catch (recall), and how much noise does it add
(precision)?*

Two legs on one fixture:

- **Leg A — Scout** (standing code): dispatch the real `agents/scout.md` definition against the
  fixture; expect its report to name each seeded convention, its deviation site, and a rule
  candidate.
- **Leg B — Tracker** (diff): apply a prepared patch that violates a subset of the conventions,
  dispatch the real `agents/tracker.md` against the diff; expect **harness gaps** surfaced
  (per `tracker.md` step 4: "the rule set is silent here" is a gap, never a violation, and never an
  invented rule).

## Non-goals (YAGNI)

- No eval of adjudication/ratification/rule-authoring (unit tests + role evals cover those stages).
- No with/without-agent baseline comparison in v1 (flag may come later).
- No second-language fixture (C#) in v1; the fixture format must not preclude adding one.
- No CI wiring of the LLM legs; only the harness's pure core runs in CI-style `bun test`.

## Governance note — deliberate deviation from `ref-evals-fixture`

`ref-evals-fixture` (binding on c3-215) declares one eval fixture format so a single runner
benchmarks everything. This harness is standalone by the owner's explicit choice: a detection
benchmark measures **capability recall/precision over a fixture codebase**, not role-behavior
pass/fail over a prompt, and its unit of grading is *per seeded convention*, not *per case*. Record
this as a C3 change-unit (ADR) amending or annotating `ref-evals-fixture` so future audits don't
report drift. The implementation plan must include this task.

## Fixture: `orderly` — a small TypeScript/bun order service

Located at `plugins/tribe/evals/detection/fixtures/orderly/`. ~20 files: routes/handlers, services,
repositories, mappers, migrations, an in-memory "db", and tests. Constraints:

- **Runs green**: `bun test` inside the fixture passes; `bunx tsc --noEmit` clean. Deviations are
  design smells in working code (Scout's stated territory), never failing tests.
- **Conventions are written nowhere**: the fixture README describes only what the app does. No
  CLAUDE.md, no rules file, no lint config encoding any seeded convention.
- Every convention has **≥3 exemplar sites** (enough repetition to infer) and **exactly one seeded
  deviation** (the thing Scout must catch).

### Seeded conventions (10)

| ID | Tier | Unwritten convention | Seeded deviation |
|----|------|----------------------|------------------|
| C1 | easy | Services return `Result` objects (`{ok: true, value} \| {ok: false, reason}`), never throw across the service boundary | one service throws |
| C2 | easy | Repositories never return `null`: `find*` returns an option shape, `get*` asserts | one repo method returns `null` |
| C3 | easy | Timestamps are UTC ISO strings in fields named `*AtUtc` | one file uses a local `Date` and names the field `createdAt` |
| C4 | medium | Clock is injected; no module calls `Date.now()` except `clock.ts` | one service calls `Date.now()` inline |
| C5 | medium | Entity ids carry a type prefix (`ord_`, `cus_`, …); validators check the prefix | one site mints a bare id |
| C6 | medium | Every failure `reason` is a member of `errorCodes.ts` | one file invents an ad-hoc string |
| C7 | medium | Handlers never touch the db directly — always via a repository | one handler inlines a query |
| C8 | hard | Migrations pair `NNN_up`/`NNN_down` AND both are listed in `migrations/index.ts` (cross-file invariant) | one migration missing from the registry |
| C9 | hard | `toDto()` in every mapper strips internal fields — same name, same meaning | one mapper's `toDto()` leaks an internal field (diverged semantics under one name — `scout.md` §4) |
| C10 | hard | Money is integer cents everywhere; no float arithmetic | one module computes `* 1.1` on a float dollar amount |

### Decoys (3)

Patterns that repeat but are style taste; flagging one as a rule-worthy convention/gap is a **false
positive** (the boundary eval case 36 `tracker-does-not-report-style-taste-as-gap` already draws):

- D1: imports alphabetically ordered in every file
- D2: `// module: <name>` banner comment atop every file
- D3: single-quote string style throughout

### Answer key

`plugins/tribe/evals/detection/manifest/orderly.json` — **outside the fixture directory, never
copied into the scratch workspace**. Per convention: `id`, `tier`, `description`, `exemplars`
(files), `deviation` (`file:line` + note), `expected_detection` (prose rubric). Plus `decoys[]`
with the same shape minus deviation.

### Leg B diff

`plugins/tribe/evals/detection/diffs/orderly-pr1.patch` — a plausible feature PR ("add refunds
endpoint") whose new code violates **C1, C4, C6, C10**. The manifest lists which conventions the
patch violates so the grader scores Leg B against exactly that subset.

## Harness: `plugins/tribe/evals/detection/`

```
detection/
  fixtures/orderly/          # the fixture codebase (green under bun test)
  manifest/orderly.json      # answer key — never enters the scratch dir
  diffs/orderly-pr1.patch    # Leg B violating diff
  run.ts                     # bun CLI — the only impure edge
  core/                      # pure: manifest validation, scratch plan, prompt
                             # assembly, grader-verdict parsing, scoring math
  core/*.test.ts             # bun test, no network, CI-safe
  results/                   # gitignored run outputs
  README.md                  # how to run, how to add a fixture
```

**Pure core, impure edges** (owner's golden rule): everything decidable is a pure function under
`core/` — validating a manifest, planning which files land in scratch, composing detector/grader
prompts, parsing the grader's verdict JSON, computing recall/precision. `run.ts` is the composition
root: filesystem copies, `git init`/`git apply`, and `claude -p` invocations enter core logic only
through injected ports, so every branch of the scoring pipeline is testable without an API key.

### Run flow (per leg)

1. **Assemble scratch**: copy `fixtures/orderly/` into a scratch dir (from `$SCRATCHPAD` or
   `--scratch`), `git init` + initial commit. Leg B: apply `orderly-pr1.patch` as a second commit so
   a real diff exists. Assert the manifest file is absent from scratch (hard check, not convention).
2. **Run detector**: `claude -p` with the real agent definition passed via `--agents`
   (`plugins/tribe/agents/scout.md` / `tracker.md`), using the isolation flags `run_evals.py`
   already verified empirically: `--setting-sources project --strict-mcp-config`, cwd = scratch.
   Leg A prompt: survey the codebase per the Scout role. Leg B prompt: review the diff of the top
   commit per the Tracker role. Capture the full report + `stream-json` usage numbers.
3. **Grade**: a second, tool-less `claude -p` receives the detector's report + the manifest and
   must emit strict JSON: for each convention `caught` (names the pattern AND its deviation — for
   Leg B: surfaces a gap covering it in the right category/files) / `partial` (one of the two) /
   `missed`, plus `decoys_flagged[]` and `invented[]` (asserted conventions matching nothing
   seeded). Parsing and validation of this JSON is pure core; a malformed grader reply retries once
   then fails the run loudly.
4. **Score & report**: write `results/<timestamp>/grading.json` — per-convention verdicts with the
   grader's quoted evidence, per-tier breakdown, and:
   - `recall = caught / seeded` (Leg A: /10; Leg B: /|patch subset|)
   - `precision = caught / (caught + decoys_flagged + invented)`
   - token/duration/cost from the stream-json usage block.
   Exit 0/1 against configurable thresholds (`--min-recall`, `--min-precision`; defaults land in
   README, not hard-coded folklore).

### CLI

```
bun run.ts --leg scout|tracker|both [--fixture orderly] [--model <id>]
           [--dry-run] [--min-recall 0.6] [--min-precision 0.7] [--scratch <dir>]
```

`--dry-run` prints the full plan (files to copy, prompts, commands) with zero API calls — the
harness's own smoke test.

## Testing the harness itself

- `core/` is TDD'd with `bun test`: scoring math (recall/precision edge cases, empty sets),
  manifest schema rejection, scratch-plan excludes the manifest, verdict parsing rejects malformed
  grader output, Leg B scoring restricted to the patch's subset.
- Fixture self-checks (also plain `bun test`, no LLM): fixture's own tests green; a meta-test
  asserts each manifest exemplar/deviation path exists in the fixture and each deviation line
  matches the manifest's recorded snippet — so fixture edits can't silently rot the answer key.
- One `--dry-run` execution and one real run (owner-triggered) validate the edge.

## Success criteria

- `bun test` over `detection/core` and fixture meta-tests: green, no network.
- `--dry-run` on both legs prints a correct plan with zero API calls.
- One real run per leg completes end-to-end and produces `grading.json` with per-convention
  verdicts, recall, precision, and cost — numbers the owner can compare across future agent-prompt
  or model changes.
- The C3 change-unit recording the `ref-evals-fixture` deviation is authored and applied.
