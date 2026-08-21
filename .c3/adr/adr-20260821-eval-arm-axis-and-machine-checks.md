---
id: adr-20260821-eval-arm-axis-and-machine-checks
c3-seal: fc68e1eb68e8566e66b99dbac8163fffb2defcea8f953cde0a72c4452ea56ece
title: eval-arm-axis-and-machine-checks
type: adr
goal: |-
    Record, in `.c3/`, the eval-fixture and eval-runner architecture that the
    `explaining-illustration` card's tasks 1-9 already shipped: `evals.json` fixtures gain
    an optional top-level `memory_fixture`, a per-`files[]`-entry `source` (a repo file
    instead of an inlined copy), per-case `checks` (a machine command that decides pass/fail
    instead of an LLM grader opinion), and per-case `artifacts` (glob patterns preserved
    before the scratch dir is deleted); `run_evals.py` gains the global `--arm
    clean|mem|both` ambient-memory axis, whose output path carries an arm segment and whose
    `mem` result is reported as `arm_delta` but never gates. `ref-evals-fixture` and
    `c3-301-eval-runner` currently describe none of this — this unit brings the facts back
    in sync with the code so the next `c3x check` / audit reads shipped behavior instead of
    stale documentation.
status: accepted
date: "2026-08-21"
---

## Goal

Record, in `.c3/`, the eval-fixture and eval-runner architecture that the
`explaining-illustration` card's tasks 1-9 already shipped: `evals.json` fixtures gain
an optional top-level `memory_fixture`, a per-`files[]`-entry `source` (a repo file
instead of an inlined copy), per-case `checks` (a machine command that decides pass/fail
instead of an LLM grader opinion), and per-case `artifacts` (glob patterns preserved
before the scratch dir is deleted); `run_evals.py` gains the global `--arm
clean|mem|both` ambient-memory axis, whose output path carries an arm segment and whose
`mem` result is reported as `arm_delta` but never gates. `ref-evals-fixture` and
`c3-301-eval-runner` currently describe none of this — this unit brings the facts back
in sync with the code so the next `c3x check` / audit reads shipped behavior instead of
stale documentation.

## Context

`plugins/explaining/skills/explaining/evals/evals.json`'s new case
(`tribe-overall-flow-illustrated`) needed three things the fixture format and the
runner did not support before this card: (1) a large fixture document
(`plugins/tribe/README.md`, 21087 bytes) referenced by path instead of inlined as a
single-line JSON blob that would rot away from the file it claims to measure — added as
`files[].source`, resolved and confined to the repo root by
`resolve_fixture_source()`; (2) a way to establish mermaid validity by a real parser
exit code rather than an LLM grader's opinion (card guardrail G3) — added as per-case
`checks`, planned by `plan_checks()` and executed by `run_checks()`, whose exit code is
classified by `classify_check_outcome()` into the harness's three-outcome vocabulary
(`0` pass, `1` a behavioral FAIL that skips the grader entirely, anything else
UNGRADED, same treatment as an ungraded LLM grader call); the executor's rendered HTML
is preserved via per-case `artifacts` glob patterns and `collect_artifacts()`, because
`run_case`'s `finally` block deletes the scratch dir and would otherwise destroy the
only evidence a check or a human reviewer could inspect. (3) A way to measure whether
realistic ambient project memory (`CLAUDE.md`) suppresses the illustration behavior
(card guardrail G4) — added as the global `--arm clean|mem|both` axis: `clean` (the
existing, unchanged default) asserts scratch has no `CLAUDE.md`; `mem` writes the
fixture's declared `memory_fixture` to `scratch/CLAUDE.md` (loaded via
`--setting-sources project`) and runs the `with_skill` leg only, because the
`without_skill` baseline is `claude -p --safe-mode`, which disables `CLAUDE.md`
entirely — a "mem baseline" leg would silently be a clean baseline wearing a mem label.
A fixture that declares no `memory_fixture` gets an honest skip note (`plan_jobs()`),
never a clean cell mislabelled `mem`. The mem-vs-clean delta (`arm_delta()`) is recorded
in `benchmark.json` but influences no exit code, per G4. Separately, task 5 added a
skill-local `scripts/` directory
(`plugins/explaining/skills/explaining/scripts/`) carrying `validate-mermaid.ts` and
`render-illustration.ts` plus a `bun install`-managed `node_modules/` — `install.sh`
already symlinks a skill's directory whole (`ln -s "$src" "$CLAUDE_DIR/skills/$name"`),
so this scripts directory installs automatically with no installer change, unlike a
*plugin-level* `scripts/` (a materially different, non-installed case). That
distinction is documented in `plugins/explaining/README.md` rather than in
`ref-plugin-layout`: c3x 11.6.3's block-patch serializer welds an `insert`/`block`
patch's first content line onto the code-fence marker that opens `ref-plugin-layout`'s
How-section tree diagram, so CommonMark reads the welded text as the fence's info
string and it silently vanishes from every render — an upstream c3x defect (filed as a
follow-up) that makes it unsafe to land this note inside that fact's fenced block via
the sanctioned patch mechanism.

## Decision

Two block patches, one per affected fact, landing atomically as one change-unit:

1. `ref-evals-fixture` Choice — the fixture shape gains `memory_fixture` (optional,
top-level), `files[].source` (optional, mutually exclusive with `content`),
`checks` (optional, per-case machine-check list), and `artifacts` (optional,
per-case glob-pattern list), documented next to the existing required fields so the
ref stays the one place the whole shape is legible.
2. `c3-301-eval-runner` Foundational Flow (Inputs row) and Contract (output-path row) —
both gain `--arm clean|mem|both` and the output path's new arm segment
(`<skill_name>/eval-<id>-<name>/<arm>/<configuration>/run-<N>/`); Change Safety
gains an inserted row for the mem-arm honesty risk (a mem cell that silently runs
clean — mitigated by `plan_jobs()`'s explicit skip-note path, never a silent
relabel).

The skill-local-vs-plugin-level `scripts/` installability distinction was documented in
`plugins/explaining/README.md` instead of `ref-plugin-layout`, because c3x 11.6.3's
block-patch serializer welds a code-fence marker onto that fact's tree-diagram block's
first content line and cannot safely edit it (filed as a c3x follow-up).

This wins over leaving the facts stale because `c3x check`, `c3x lookup`, and any
future audit read `.c3/` as the source of truth for "what does this component actually
do" — a `ref`/`component` that describes a `--mode` flag but not the `--arm` flag next
to it, or a fixture shape missing four of its eight top-level keys, silently
mis-teaches the next reader (human or agent) that the newer behavior does not exist.
Extending the existing facts (rather than a new component/ref) is correct here because
neither of the two targets' Goal or ownership boundary changed — `ref-evals-fixture`
still governs the fixture *shape*, `c3-301-eval-runner` still governs the *runner*'s
methodology — only their internal detail grew.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| ref-evals-fixture | N.A - ref (governance doc, not topology; the fact this unit amends) | Its Choice section names the fixture's full field list; four new optional fields (memory_fixture, files[].source, checks, artifacts) are undocumented there | ref-evals-fixture#n1632@v1:sha256:fb8e9cf86e0bd6e6c4a7a8ad5dac6401d24087de7026be640a2f54a0d73c2683 "evals/evals.json next to the skill (or at plugins/tribe/evals/evals.json for agents)" | This unit's Choice patch is the review |
| c3-301 | component | Its Foundational Flow (Inputs) and Contract (output path) rows describe only --mode, not the sibling --arm axis or the arm-segmented output path run_case now writes, and Change Safety has no row for the mem-arm honesty risk | c3-301#n1586@v1:sha256:1394e2e7281d09e086db76e4f443b477f9a561f813154593369562932ccaeedd "--evals <path> or --all; flags --mode, --runs, --timeout, --exec-model, --grader-model, --eval-id, --out-dir, --dry-run" | This unit's Foundational Flow, Contract, and Change Safety patches are the review |

## Verification

| Check | Result |
| --- | --- |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 change apply adr-20260820-eval-arm-axis-and-machine-checks | Reports all patches applied |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 check | Exactly the 2 pre-existing errors (c3-213, c3-216), no new error |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 read ref-evals-fixture | Choice section names memory_fixture, files[].source, checks, artifacts |
| C3X_MODE=agent bunx @c3x/cli@11.6.3 read c3-301 | Foundational Flow/Contract show --arm clean |
