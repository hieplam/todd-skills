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
- No with/without-agent baseline comparison in v1 (the clean/mem **arms** below compare memory
  bias, not agent presence).
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

### Arms — memory bias is part of the measurement

Instructions and memory bias a detector: a CLAUDE.md that says "inject the clock" hands it C4 for
free. Every leg therefore runs in two sandbox **arms**:

- **`clean`** — a completely clean sandbox: no CLAUDE.md, no `.claude/` project memory, no user
  settings, no MCP. This is the unbiased measurement and the only arm that gates.
- **`mem`** — the scratch additionally carries a realistic `CLAUDE.md` + `.claude/` project memory
  (build commands, generic style guidance, fictional project notes) that **never mentions any
  seeded convention or decoy** — a meta-test enforces zero lexical overlap between the memory
  fixture and the manifest's convention descriptions. This arm measures how much ambient memory
  shifts detection; it is reported as a delta, never gated.

The mechanism is the one `run_evals.py` verified empirically: `--setting-sources project
--strict-mcp-config` loads only the scratch's own files — so the `mem` arm works by materializing
the memory fixture into scratch, and the `clean` arm by asserting scratch contains no CLAUDE.md and
no `.claude/` directory (hard check, same as the manifest-absence check).

### Run flow (per leg × arm × repetition)

1. **Assemble scratch**: copy `fixtures/orderly/` into a scratch dir (from `$SCRATCHPAD` or
   `--scratch`), `git init` + initial commit. Leg B: apply `orderly-pr1.patch` as a second commit so
   a real diff exists. `mem` arm: add the memory fixture. Hard checks before dispatch: manifest
   absent; `clean` arm carries no CLAUDE.md / `.claude/`.
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
   - `recall = (caught + 0.5·partial) / seeded` (Leg A: seeded = 10; Leg B: seeded = the patch's
     violated subset, 4)
   - `precision = caught / (caught + decoys_flagged + invented)` (partials count neither way)
   - token/duration/cost from the stream-json usage block.

### Pass definition — numbers, not prose

A benchmark invocation runs **2 legs × 2 arms × 3 repetitions** (12 detector runs, 12 grader
runs). Gates apply to the `clean` arm only; the `mem` arm reports `Δrecall`/`Δprecision` vs clean.

| Gate | Cell | Threshold |
|------|------|-----------|
| G1 | Leg A · clean | recall ≥ **0.70** |
| G2 | Leg A · clean | precision ≥ **0.70** |
| G3 | Leg A · clean | easy-tier (C1–C3) recall = **1.00** (all three, every counted rep) |
| G4 | Leg B · clean | gap-recall ≥ **0.75** (≥3 of C1/C4/C6/C10) |
| G5 | Leg B · clean | invented-rule violations = **0** — Tracker citing a non-existent rule as a violation hard-fails that repetition |

A **repetition passes** its cell when every gate for that cell holds. A **cell passes** when at
least **2 of 3** repetitions pass. The **eval PASSES** when both clean cells pass. `benchmark.json`
rolls up: per-rep grading refs, per-cell pass counts (`n/3`), the two mem-arm deltas, and a single
top-level `"pass": true|false`. Exit code mirrors it.

Thresholds are CLI-overridable (`--min-recall`, `--min-precision`, `--reps`) with these defaults
recorded in README; the defaults above are the contract.

### CLI

```
bun run.ts --leg scout|tracker|both --arm clean|mem|both [--fixture orderly] [--model <id>]
           [--reps 3] [--dry-run] [--min-recall 0.70] [--min-precision 0.70] [--scratch <dir>]
```

`--dry-run` prints the full plan (files to copy per arm, prompts, commands, gate table) with zero
API calls — the harness's own smoke test.

## Testing the harness itself

- `core/` is TDD'd with `bun test`: scoring math (recall/precision edge cases, empty sets, the
  0.5-partial credit), gate evaluation (each of G1–G5, the 2-of-3 cell rule, the top-level pass),
  manifest schema rejection, scratch-plan excludes the manifest, clean-arm plan carries no
  CLAUDE.md/`.claude/`, mem-arm plan carries exactly the memory fixture, verdict parsing rejects
  malformed grader output, Leg B scoring restricted to the patch's subset.
- Fixture self-checks (also plain `bun test`, no LLM): fixture's own tests green; a meta-test
  asserts each manifest exemplar/deviation path exists in the fixture and each deviation line
  matches the manifest's recorded snippet — so fixture edits can't silently rot the answer key;
  a meta-test asserts zero lexical overlap between the mem-arm memory fixture and the manifest's
  convention/decoy descriptions.
- One `--dry-run` execution and one real run (owner-triggered) validate the edge.

## Success criteria

- `bun test` over `detection/core` and fixture meta-tests: green, no network.
- `--dry-run` on both legs × both arms prints a correct plan with zero API calls.
- One real benchmark invocation (2 legs × 2 arms × 3 reps) completes end-to-end and produces
  `benchmark.json` with per-cell pass counts, mem-arm deltas, and a top-level numeric `pass`
  verdict per the gate table — never a prose-only claim.
- The C3 change-unit recording the `ref-evals-fixture` deviation is authored and applied.
