# Spec — Illustration capability for the `explaining` skill

**Card:** `reports/idea-card-explaining-illustration.md` · **Warchief:** How-level design
**Worktree:** `/Users/hip/repo/todd-skills-explaining-illustration` · **Branch:** `warchief/explaining-illustration`
**Base:** `72bceba85e3fd357a07a510e80f02fc75e0dd5e1`

---

## 1. The problem, grounded in code

### 1.1 The `explaining` skill governs prose only

`plugins/explaining/skills/explaining/SKILL.md` carries three rules (term discipline,
grounding, name-the-behaviour) — all of them about *sentences*. Nothing in it tells the model
to draw anything, ever. When an explanation of a multi-actor flow lands only because the
assistant happened to draw a diagram, that is the base model's ad-hoc choice, not a capability
the skill owns.

### 1.2 The eval-path bug — the `with_skill` leg never loaded the skill

`scripts/evals/run_evals.py:733` resolves a skill-kind fixture's skill directory as:

```python
return kind, skill_dir_override or evals_path.parent.parent, None
```

For four of the five skill-kind fixtures the evals.json lives at
`<plugin>/skills/<skill>/evals/evals.json`, so `parent.parent` is the skill directory. For
`explaining` the evals.json lives at `plugins/explaining/evals/evals.json`, so `parent.parent`
is `plugins/explaining` — the **plugin** root, which has no `SKILL.md`.

Reproduced against the base commit (`72bceba`), command and output verbatim:

```
$ python3 -c "<import run_evals; call derive_kind_and_dirs over every plugins/**/evals/evals.json>"
check-diff-coverage          kind=skill  skill_dir=plugins/check-diff-coverage/skills/check-diff-coverage  SKILL.md=OK
explaining                   kind=skill  skill_dir=plugins/explaining  SKILL.md=BROKEN
refactor-for-testability     kind=skill  skill_dir=plugins/refactor-for-testability/skills/refactor-for-testability  SKILL.md=OK
splitting-plans              kind=skill  skill_dir=plugins/splitting-plans/skills/splitting-plans  SKILL.md=OK
tribe                        kind=agent  agents_dir=plugins/tribe/agents  exists=OK
mammoth-hunt                 kind=skill  skill_dir=plugins/tribe/skills/mammoth-hunt  SKILL.md=OK
```

`install_skill()` (`run_evals.py:328-346`) then `copytree`s that whole plugin directory into the
scratch `.claude/skills/explaining/`, burying the real `SKILL.md` two levels down at
`.claude/skills/explaining/skills/explaining/SKILL.md` — a depth Claude Code's project-skill
discovery does not look at. The `with_skill` leg has therefore been comparing baseline to
baseline for every `explaining` eval ever run.

`.c3/refs/ref-evals-fixture.md:20` already mandates "`evals/evals.json` next to the skill", so
the fix is enforcing an existing rule, not making a new decision.

### 1.3 What the harness cannot express today

Three gaps block the measurable goal:

| Gap | Consequence for the goal |
|---|---|
| No arm axis. `--mode` picks `with_skill`/`without_skill`, and both legs are memory-free (`--setting-sources project` with an empty scratch; `--safe-mode`). | G4 (mem-arm delta) is unmeasurable. |
| No machine check. `expected_output` is graded by a tool-less `claude -p` (`run_evals.py:375-417`) that sees only text. | G3 ("mermaid validity by a real parse, never grader opinion") is unmeasurable. |
| Scratch dirs are destroyed in `run_case`'s `finally` (`run_evals.py:616-617`), so an artifact the executor writes never survives the run. | No before/after artifact evidence is possible at all. |

---

## 2. The change

### 2.1 Task-1 path fix

`git mv plugins/explaining/evals → plugins/explaining/skills/explaining/evals`, matching the
other four skill fixtures and `ref-evals-fixture`'s "next to the skill". `SKILL.md:46` points at
`../../evals/evals.json` today; after the move the correct relative path is `../evals/evals.json`.

Regression test asserts, over **every** `plugins/**/evals/evals.json`, that
`derive_kind_and_dirs` returns a `skill_dir` containing `SKILL.md` (kind `skill`) or an existing
`agents_dir` (kind `agent`). Discovery is via the runner's own `discover_evals_json()`, so a
future fixture added in the wrong place fails the test without anyone remembering to list it.

### 2.2 Runner extension A — `files[].source`

`materialize_files` (`run_evals.py:458-489`) accepts only inline `content`. The new case's
fixture is `plugins/tribe/README.md` (279 lines / 21 087 bytes). Inlining it would put a
21 KB single-line escaped JSON string into `evals.json` — unreviewable in a diff, and a
snapshot that silently rots away from the document the report claims it measured.

Add an optional `source` key, resolved against `REPO_ROOT`:

```json
{"path": "tribe-README.md", "source": "plugins/tribe/README.md"}
```

Rules: `source` and `content` are mutually exclusive; `source` must be repo-relative and must
resolve inside `REPO_ROOT` (same confinement discipline the existing scratch-escape guard
applies to `path`); a missing `source` file is a **setup error** (harness failure), never a
graded FAIL.

This does not change the card's fixture choice — the fixture is still `plugins/tribe/README.md`.
It changes only how the bytes get there.

### 2.3 Runner extension B — the `--arm clean|mem|both` axis

Global flag, default `clean`, so the other four fixtures' cost and behavior are unchanged
(scope fence OUT).

- **Fixture declaration.** Optional top-level `"memory_fixture": "<path relative to the
  evals.json's own directory>"` in evals.json. For `explaining` that is
  `memory-fixture/CLAUDE.md`, mirroring `plugins/tribe/evals/detection/memory-fixture/CLAUDE.md`.
- **`clean` arm.** Exactly today's behavior, plus an explicit assertion that the scratch dir
  contains no `CLAUDE.md` — the direct port of the detection harness's
  `assertNoMemory: input.arm === 'clean'` (`plugins/tribe/evals/detection/core/scratch-plan.ts:20`).
- **`mem` arm.** The fixture is written to `<scratch>/CLAUDE.md` before the executor runs.
  `--setting-sources project` (already passed on the `with_skill` leg) loads it.
- **The `mem` arm runs the `with_skill` leg only.** The `without_skill` leg is
  `claude -p --safe-mode` (`run_evals.py:192-202`), and `--safe-mode` *disables CLAUDE.md*.
  A "mem baseline" under `--safe-mode` would be a clean baseline wearing a mem label — the exact
  class of harness lie the UNGRADED principle exists to prevent. Swapping the baseline off
  `--safe-mode` instead would trip c3-301's own recorded risk ("Baseline contamination —
  Weakening --safe-mode / isolation flags"). So the clean-arm `without_skill` baseline is run
  once and shared, and `mem × without_skill` is not a cell.
- **A fixture with no `memory_fixture` under `--arm mem|both`** is skipped for the mem arm with
  an explicit note recorded in `benchmark.json` — never a silently-clean run labelled `mem`.
- **Reporting, never gating (G4).** `benchmark.json` gains `run_summary.by_arm.{clean,mem}` and
  `run_summary.arm_delta` = mem − clean on the `with_skill` leg. No threshold, no exit-code
  effect — the direct analogue of the detection harness's `memDelta()`
  (`plugins/tribe/evals/detection/core/gates.ts`), which reports a delta while only
  `legA-clean`/`legB-clean` cells carry gates.

### 2.4 Runner extension C — machine `checks` and durable `artifacts`

**`checks`** — optional per-case list of `{"name", "command"}`. The command string may contain
`{skill_dir}` and `{scratch}` placeholders, is split with `shlex.split` (no shell), and runs with
`cwd = scratch` after the executor and before the grader. Exit-code contract:

| Exit | Meaning | Harness behavior |
|---|---|---|
| `0` | check passed | proceed to LLM grading of the prose rubric |
| `1` | check failed | run is **FAIL**, grader skipped; `grading.json` evidence is the check's own stderr/stdout tail |
| anything else (`2` by convention) | check **could not run** | run is **UNGRADED** through the existing machinery — excluded from the pass/total denominator |

The UNGRADED path reuses `grade()`'s existing third outcome and
`summarize_configuration`'s existing exclusion (`run_evals.py:635-659`) rather than inventing a
parallel one, exactly as the card's hard requirement demands. Skipping the grader on a hard FAIL
is deliberate: mermaid validity is machine-decidable, so paying a grader to opine on it would
reintroduce the opinion G3 forbids.

**`artifacts`** — optional per-case list of globs, relative to scratch, copied into
`<run-dir>/artifacts/` before the scratch dir is destroyed. Without this the produced HTML
cannot be linked from the PR at all.

**One-line fix to `install_skill`.** Its `ignore_patterns("evals")` must also ignore
`node_modules`: the skill now ships a validator whose dependency tree is ~152 MB, and a developer
who has installed it locally would otherwise have that tree copied into every scratch dir of
every run.

### 2.5 The skill's illustration capability

New directory `plugins/explaining/skills/explaining/scripts/`. `install.sh` symlinks a skill as a
whole directory (`install.sh:90-98`), so these ship with the skill with **no installer change**;
this is verified rather than assumed in task 10.

**`validate-mermaid.ts`** — behaves like Kanna's (owner decision 2): a real `mermaid.parse()`
plus a hint layer.

- Pure core (unit-tested, no I/O): `extractMermaidSources(html)` (elements carrying
  `class="mermaid"`, HTML entities decoded), `hintFor(errorText)` (grammar error → remediation
  advice), `classifyOutcome(...)` → `VALID | INVALID | COULD_NOT_VALIDATE`.
- Impure edge: `loadMermaid()` — install the dependency on demand, build the `jsdom` shim,
  dynamic-import `mermaid`. **The jsdom shim is mandatory**: bare `bun` fails every *valid*
  diagram with `DOMPurify.addHook is not a function`, which would make the checker reject
  everything (card, "Feasibility is already proven" — not to be re-derived).
- Three outcomes, three exit codes: `0` VALID, `1` INVALID (including "no artifact" and "no
  mermaid block in the artifact" — an absent deliverable is a behavioral failure, not a harness
  failure), `2` COULD_NOT_VALIDATE (dependency unavailable / no network). A validator that
  cannot run is never a failing diagram.

**`render-illustration.ts`** — dependency-free, so it works offline and in the sandbox. Pure
`renderIllustrationHtml({title, diagram, caption})` returns one self-contained HTML file
(owner decision 3): mermaid ESM from `https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.esm.min.mjs`
— the exact CDN import this repo already uses at
`plugins/tribe/scripts/runner/RUNNER_EXPLAINED.html:827` — with `prefers-color-scheme` light/dark
CSS and a matching mermaid theme chosen from `matchMedia`. The diagram is HTML-escaped on the way
in and the extractor decodes it on the way out; that round-trip is unit-tested.

**`SKILL.md` gains an Illustration section** stating: when to illustrate (a flow with multiple
actors or conditional paths — not linear prose); the mermaid safe-syntax rules (dotted link ends
written in full `-.-x` / `-.-o`; labels containing `( ) [ ] { } |` or `"` or starting with `/`
`\` wrapped in double quotes; a literal `"` written `#quot;`); that the **deliverable is the
`.html` file on disk** and offering it is a best-effort second step (use an MCP preview/download
tool when one exists, otherwise state the path — `--strict-mcp-config` means no such tool exists
in the sandbox); that the diagram must live in an element with `class="mermaid"`; and that the
validator is run before shipping, with could-not-validate meaning "ship it and say so", never
"drop the diagram".

### 2.6 The memory fixture

`plugins/explaining/skills/explaining/evals/memory-fixture/CLAUDE.md` — realistic ambient project
memory, terseness-leaning (the card's point: what might *kill* a diagram in production), and
containing none of `mermaid`, `diagram`, `illustration`, `chart`, `graph`, `visual`, `html`. A
test enforces the ban case-insensitively over word-ish boundaries, following the
zero-lexical-overlap meta-test at
`plugins/tribe/evals/detection/core/memory-overlap.test.ts`. It lives under `evals/`, which both
`install_skill`'s ignore list and `install.sh`'s whitelist already exclude, so it can never leak
into the with_skill scratch or a user's `~/.claude`.

### 2.7 The eval case

Case id 3, `tribe-overall-flow-illustrated`, in the moved
`plugins/explaining/skills/explaining/evals/evals.json`.

**The prompt must not ask for a diagram, a picture, or an HTML file.** G2's whole meaning is
attribution: if the prompt requests the artifact, both legs produce it and the skill has added
nothing. The prompt is a plain "explain this flow" request over the fixture; deciding to
illustrate is the behavior under test.

- `files`: `[{"path": "tribe-README.md", "source": "plugins/tribe/README.md"}]`
- `checks`: one — `bun {skill_dir}/scripts/validate-mermaid.ts --html-glob *.html`
- `artifacts`: `["*.html"]`
- `expected_output`: rubric covering the artifact plus the existing two prose rules.

### 2.8 Docs and governance

- `scripts/evals/README.md`: `--arm`, `memory_fixture`, `files[].source`, `checks`, `artifacts`,
  the mem-arm-is-with_skill-only rationale, and how to run the Python tests. While editing the
  fixture-shape section, correct the stale claim at `README.md:45-48` that skill cases "register
  a throwaway `.claude/commands/` entry" — the code has copied the whole skill directory since
  `install_skill` was written.
- `plugins/explaining/` docs: the skill's new capability and its scripts.
- C3 change-unit (one ADR + patches): `ref-evals-fixture` (fixture shape gains `memory_fixture`,
  `files[].source`, `checks`, `artifacts`), `c3-301-eval-runner` (Inputs/Contract gain `--arm`;
  Change Safety gains the mem-arm honesty risk), and `ref-plugin-layout` (a note that
  `skills/<name>/scripts/` — unlike a plugin-level `scripts/` — *is* installed, because the skill
  directory is symlinked whole).
- `install.sh`: verified-and-recorded, changed only if verification shows it must be.

---

## 3. Scope fence

**IN** — exactly card items 1-9, as designed above.

**OUT** — everything the card lists OUT, plus these How-level exclusions:
- `plugins/tribe/evals/detection/**` is **read-only** for this hunt. Not one byte changes.
- No default-arm change for the other four fixtures (default stays `clean`).
- No new gate, threshold, or exit-code meaning for the mem arm.
- No PNG/image rendering, no MCP server, no change to explaining Rules 1-3.
- The two pre-existing `c3x check` errors (`c3-213`, `c3-216`, both "ungrounded derivation in
  Derived Materials") are **not** this hunt's to fix; the gate is "no *new* errors".

---

## 4. Purity design (`~/.claude/rules/pure-core.md`)

| Pure core (deterministic, injected inputs) | Impure edge (thin) |
|---|---|
| `resolve_fixture_source(rel, repo_root)` → confined path or raises | `materialize_files` writing bytes |
| `plan_memory_files(arm, memory_fixture_path)` → files to write + `assert_no_memory` flag | writing `<scratch>/CLAUDE.md` |
| `plan_jobs(cases, configurations, arms, runs, has_memory_fixture)` → job list | the `ThreadPoolExecutor` that runs them |
| `plan_checks(case, skill_dir, scratch)` → argv lists | `subprocess.run` of each check |
| `classify_check_outcome(returncode)` → `PASS`/`FAIL`/`UNGRADED` | reading the return code |
| `summarize_by_arm(runs)`, `arm_delta(mem, clean)` | writing `benchmark.json` |
| `extractMermaidSources(html)`, `hintFor(err)`, `classifyOutcome(...)` | `loadMermaid()`, `bun install`, file reads |
| `renderIllustrationHtml(input)` | writing the `.html` |

Every one of these pure functions is what the tests exercise; not a single test needs a live
`claude -p`, a network, or a rendered browser.

---

## 5. Testing strategy

| Suite | Runner | Covers |
|---|---|---|
| `scripts/evals/tests/test_run_evals.py` | `python3 -m unittest discover -s scripts/evals/tests -t .` (stdlib only; host Python is **3.9.6**, so no 3.10+ syntax outside `from __future__ import annotations`) | G5 regression over all evals.json; `source` resolution + confinement; arm planning incl. mem-skips-without_skill and no-fixture skip; check-outcome classification; placeholder substitution; per-arm rollup + delta; memory-fixture vocabulary ban |
| `plugins/explaining/skills/explaining/scripts/*.test.ts` | `bun test` in that directory | extractor/renderer round-trip; hint layer mapping; three-outcome classification; safe-syntax examples from the card parse VALID and their unquoted counterparts parse INVALID |

`bunx @c3x/cli@11.6.3 check` is the governance gate. **Baseline on `72bceba`: 2 pre-existing
errors** (`c3-213`, `c3-216`). The gate is "still exactly those 2, no new ones".

> **Toolchain trap, must be in every brief:** there is no `c3` or `c3x` on PATH, no `go`, no
> `node`, and no `npm` on this machine; the packaged binary the skill wrapper wants
> (`c3x-11.6.3-darwin-arm64`) does not exist. The only working invocation is
> `bunx @c3x/cli@11.6.3 <cmd>`. Likewise there is no GNU `timeout`. Python is `python3` 3.9.6.

---

## 6. Evidence plan

Captured by **me**, from the repo's own harness, never from a Hunter's claim.

1. **Path bug, before/after** — the `derive_kind_and_dirs` sweep above, run on the base commit
   (BROKEN) and on the branch (all OK). Terminal transcript, quoted in the PR body.
2. **G1** — `run_evals.py --evals <moved path> --eval-id 3 --arm clean --mode with_skill --runs 3`;
   pass count read from `benchmark.json`. Quoted verbatim.
3. **G2** — the same case, `--mode without_skill --runs 3`. Quoted verbatim.
4. **G3** — the check's own output on the produced artifact: a real `mermaid.parse()` verdict,
   plus a negative control (a deliberately malformed diagram parsing INVALID).
5. **G4** — `--arm mem --mode with_skill --runs 3`, and the `arm_delta` the runner reports.
   Reported honestly including if negative.
6. **G5** — the new Python test, run output quoted.
7. **The artifact itself** — one produced `.html`, collected via the new `artifacts` glob, pushed
   to a throwaway evidence branch and linked by same-origin `raw` URL (private repo), so a reader
   can open the rendered page.

Every number in the report and PR body is a quoted command output. There is **no CI configured in
this repo** (`.github/` does not exist) — that fact gets recorded in the PR rather than merged
around silently.

---

## 7. Risks and rollback

| Risk | Mitigation |
|---|---|
| G2 fails — baseline also draws the diagram | Escalate `NEEDS_DIRECTION` per the card's Decision authority. Do **not** tune the rubric until it passes. |
| G1 flaky — with_skill answers in prose without writing a file | SKILL.md states the file *is* the deliverable. If it still fails at ≥2/3, that is an honest capability result to report, not a rubric to loosen. |
| Check exit-code semantics conflated | `1` vs `2` is unit-tested; "no artifact" is deliberately `1`. |
| Eval spend | Smoke each stage with `--dry-run` and a single `--runs 1` pass before the 3-run measurements. |
| `mermaid`/`jsdom` install fails at measurement time | Then the check exits `2` and runs are UNGRADED, not FAIL — visible, not silent. I would report that as a blocked measurement rather than a G1 number. |

**Rollback:** every task is one commit on a branch; the runner changes are additive and default to
today's behavior (`--arm clean`, no `checks`, no `source`), so reverting the branch restores exact
prior behavior. The only non-additive change is the evals.json move, which is a `git mv`.
