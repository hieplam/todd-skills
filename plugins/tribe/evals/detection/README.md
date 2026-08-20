# Detection Eval

Answers, with numbers: given a codebase whose conventions are written nowhere, what fraction
does the tribe's detection (Scout + Tracker) catch (recall), and how much noise does it add
(precision)? See `docs/superpowers/specs/2026-08-20-detection-eval-design.md` for the full design.

## Run

```bash
cd plugins/tribe/evals/detection
bun test core                                   # pure core + fixture meta-tests, no network
(cd fixtures/orderly && bun test && bunx tsc --noEmit)   # the fixture's own suite + typecheck
bun run.ts --dry-run --leg both --arm both       # print the full plan, zero API calls
bun run.ts --leg both --arm both --reps 3        # the real benchmark (24 claude -p calls)
```

## CLI

```
bun run.ts --leg scout|tracker|both --arm clean|mem|both [--fixture orderly] [--model <id>]
           [--reps 3] [--dry-run] [--min-recall 0.70] [--min-precision 0.70] [--scratch <dir>]
```

Defaults: `--reps 3`, `--min-recall 0.70`, `--min-precision 0.70` — these match the gate table in
the design spec; override for a cheaper smoke pass.

## Adding a fixture

1. Add `fixtures/<name>/` — a small, green (`bun test` + `bunx tsc --noEmit`) codebase whose
   conventions are written nowhere (no CLAUDE.md, no rules file).
2. Add `manifest/<name>.json` — the answer key (never copied into the scratch workspace):
   conventions with `id`/`tier`/`description`/`exemplars`/`deviation`/`expected_detection`,
   decoys, and (for a Leg B diff) `legB.patch` + `legB.violates`.
3. Add `diffs/<name>-pr1.patch` if the fixture supports a Tracker (diff) leg.
4. Add a `core/fixture-meta.test.ts`-style test asserting every manifest exemplar/deviation path
   exists in the fixture and the deviation line matches.
5. `bun run.ts --fixture <name> --dry-run` to sanity-check the plan before a real run.

## Output

Each invocation writes `results/<timestamp>/` (gitignored): one `grading.json` per
leg×arm×repetition plus a rollup `benchmark.json` with per-cell pass counts (`n/3`), the two
mem-arm deltas (`Δrecall`, `Δprecision` vs. the clean arm), and a top-level `"pass": true|false`
mirrored by the process exit code.

## Governance

This harness is a deliberate, owner-approved deviation from `ref-evals-fixture` (which declares
one shared eval fixture format via `scripts/evals/run_evals.py`) — see the design spec's
"Governance note" section. The C3 change-unit recording this deviation is authored separately by
the Shaman after this harness merges.
