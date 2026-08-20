# Plan — Illustration capability for the `explaining` skill

Spec: `docs/tribe/planning/explaining-illustration/spec.md`
Worktree: `/Users/hip/repo/todd-skills-explaining-illustration` · Branch: `warchief/explaining-illustration`

10 tasks, strictly sequential, one commit each.

---

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **Purity: core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see `~/.claude/rules/pure-core.md`).**
- **Host toolchain traps — every task obeys these:**
  - Python is `python3` **3.9.6**. No 3.10+ syntax at runtime. `run_evals.py` already has
    `from __future__ import annotations`, so annotations may use `X | None`; anything evaluated at
    runtime may not. New test files must carry the same future import if they use that syntax.
  - There is **no `c3` and no `c3x` on PATH**, no `go`, no `node`, no `npm`. The packaged binary
    the C3 skill wrapper wants does not exist on this machine. The only working invocation is
    `bunx @c3x/cli@11.6.3 <cmd>`.
  - There is **no GNU `timeout`** on this machine.
  - `bun` is 1.3.14, `bunx` works.
- **Never `bun add` into the repo root.** Dependencies for the skill validator install only into
  `plugins/explaining/skills/explaining/scripts/`, whose `node_modules/` is git-ignored by that
  directory's own `.gitignore` (task 5 creates it).
- **`plugins/tribe/evals/detection/**` is read-only.** Read it for shape; never edit it.
- **Do not run `scripts/evals/run_evals.py` against the live `claude` CLI.** Every task is proven
  with unit tests and `--dry-run`; the Warchief runs the paid measurements.
- **Commit discipline:** tick this plan's checkboxes in the SAME commit as the code, and stamp
  every commit with `Tribe-Card: explaining-illustration` and `Tribe-Task: N/10` as two lines of
  the commit message's single final paragraph. Never add an agent name as a co-author.
- **Governance gate:** `bunx @c3x/cli@11.6.3 check` has **2 pre-existing errors on the base
  commit** (`c3-213` and `c3-216`, both "ungrounded derivation in Derived Materials row 1"). Those
  are not yours to fix. The gate is: still exactly those two, no new ones.

---

### Task 1: Move the explaining evals fixture next to its skill, with a regression test

**Why:** `derive_kind_and_dirs` resolves a skill-kind fixture's skill dir as
`evals_path.parent.parent`. `plugins/explaining/evals/evals.json` therefore resolves to
`plugins/explaining`, which has no `SKILL.md`, so the `with_skill` leg has never loaded the skill.
`.c3/refs/ref-evals-fixture.md:20` already mandates "`evals/evals.json` next to the skill".

- Move: `plugins/explaining/evals/evals.json` to `plugins/explaining/skills/explaining/evals/evals.json`
- Modify: `plugins/explaining/skills/explaining/SKILL.md`
- Create: `scripts/evals/tests/test_run_evals.py`

**Steps**

- [x] **Step 1: Write the failing test.** Create `scripts/evals/tests/test_run_evals.py`:

```python
"""Unit tests for scripts/evals/run_evals.py.

Stdlib `unittest` only (host python3 is 3.9.6) and no `claude -p` calls: every
function under test is pure, which is the point of the pure-core split.

    python3 -m unittest discover -s scripts/evals/tests -t .
"""
from __future__ import annotations

import importlib.util
import json
import unittest
from pathlib import Path

EVALS_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = EVALS_DIR.parents[1]

_spec = importlib.util.spec_from_file_location("run_evals", EVALS_DIR / "run_evals.py")
run_evals = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(run_evals)


class SubjectResolution(unittest.TestCase):
    """Every fixture in the repo must resolve to a subject that actually exists.

    The `explaining` fixture used to resolve to `plugins/explaining` (the plugin
    root, no SKILL.md there), so its with_skill leg silently compared baseline to
    baseline. Discovery goes through the runner's own discover_evals_json() so a
    future fixture placed wrongly fails here without anyone updating a list.
    """

    def test_every_evals_json_resolves_to_a_real_subject(self):
        paths = run_evals.discover_evals_json()
        self.assertGreaterEqual(len(paths), 5, "fixture discovery found suspiciously few files")
        for evals_path in paths:
            with self.subTest(evals=str(evals_path.relative_to(REPO_ROOT))):
                data = json.loads(evals_path.read_text())
                kind, skill_dir, agents_dir = run_evals.derive_kind_and_dirs(
                    evals_path, data.get("kind"))
                if kind == "skill":
                    self.assertTrue(
                        (skill_dir / "SKILL.md").is_file(),
                        f"{data['skill_name']}: resolved skill_dir {skill_dir} has no SKILL.md",
                    )
                else:
                    self.assertTrue(
                        agents_dir.is_dir(),
                        f"{data['skill_name']}: resolved agents_dir {agents_dir} does not exist",
                    )


if __name__ == "__main__":
    unittest.main()
```

  Run it and watch it fail:

```bash
cd /Users/hip/repo/todd-skills-explaining-illustration
python3 -m unittest discover -s scripts/evals/tests -t . -v
```

  Expected: one failure reading
  `explaining: resolved skill_dir .../plugins/explaining has no SKILL.md`.

- [x] **Step 2: Move the fixture.**

```bash
cd /Users/hip/repo/todd-skills-explaining-illustration
mkdir -p plugins/explaining/skills/explaining/evals
git mv plugins/explaining/evals/evals.json plugins/explaining/skills/explaining/evals/evals.json
rmdir plugins/explaining/evals
```

- [x] **Step 3: Fix the pointer in SKILL.md.** Its last line reads
  ``Regression fixtures: `../../evals/evals.json` ``. `SKILL.md` lives at
  `plugins/explaining/skills/explaining/SKILL.md` and the fixture now lives at
  `plugins/explaining/skills/explaining/evals/evals.json` — a subdirectory of `SKILL.md`'s own
  directory, so the correct text is ``Regression fixtures: `evals/evals.json` `` with no `../`
  hops at all. Change only that path.

  *(Correction, 2026-08-20: this step originally said "one level up" and prescribed
  `../evals/evals.json`, which resolves to the nonexistent
  `plugins/explaining/skills/evals/evals.json`. The Tracker and the cold-lens reviewer both caught
  it on the task-1 diff; the fix landed in the task-1 follow-up commit.)*

- [x] **Step 4: Prove it green.**

```bash
python3 -m unittest discover -s scripts/evals/tests -t . -v
```

  Expected: `OK`, with the `explaining` subTest passing and no other test regressing.

- [x] **Step 5: Commit** with `Tribe-Card: explaining-illustration` and `Tribe-Task: 1/10`.

---

### Task 2: Runner — `files[].source` reads a fixture from a repo file

**Why:** the new eval case's fixture is `plugins/tribe/README.md` (21 087 bytes). Inlining it makes
`evals.json` an unreviewable single-line blob and freezes a copy that rots away from the document
the report names.

- Modify: `scripts/evals/run_evals.py`
- Modify: `scripts/evals/tests/test_run_evals.py`

**Steps**

- [x] **Step 1: Write the failing tests.** Append to `scripts/evals/tests/test_run_evals.py`:

```python
class FixtureSourceResolution(unittest.TestCase):
    def test_resolves_repo_relative_path(self):
        resolved = run_evals.resolve_fixture_source("plugins/tribe/README.md", REPO_ROOT)
        self.assertTrue(resolved.is_file())
        self.assertTrue(str(resolved).startswith(str(REPO_ROOT)))

    def test_rejects_absolute_path(self):
        with self.assertRaises(ValueError):
            run_evals.resolve_fixture_source("/etc/passwd", REPO_ROOT)

    def test_rejects_escape_above_repo_root(self):
        with self.assertRaises(ValueError):
            run_evals.resolve_fixture_source("../../../etc/passwd", REPO_ROOT)


class MaterializeFilesWithSource(unittest.TestCase):
    def test_writes_repo_file_contents_into_scratch(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            scratch = Path(tmp)
            written = run_evals.materialize_files(
                scratch, [{"path": "tribe-README.md", "source": "plugins/tribe/README.md"}])
            self.assertEqual(written, ["tribe-README.md"])
            self.assertEqual(
                (scratch / "tribe-README.md").read_text(),
                (REPO_ROOT / "plugins/tribe/README.md").read_text(),
            )

    def test_source_and_content_are_mutually_exclusive(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                run_evals.materialize_files(
                    Path(tmp),
                    [{"path": "a.md", "source": "plugins/tribe/README.md", "content": "x"}])

    def test_missing_source_file_raises(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(FileNotFoundError):
                run_evals.materialize_files(
                    Path(tmp), [{"path": "a.md", "source": "plugins/nope/nothing.md"}])
```

  Expected: all five fail with `AttributeError` / no such behavior.

- [x] **Step 2: Implement.** In `scripts/evals/run_evals.py`, add the pure resolver above
  `materialize_files`:

```python
def resolve_fixture_source(rel: str, repo_root: Path) -> Path:
    """Pure: resolve a fixture `source` against the repo root, confined to it.

    A fixture may name a real repo file instead of inlining its bytes, so a large
    document (e.g. plugins/tribe/README.md) stays reviewable in the diff and cannot
    silently rot away from the file the eval claims to measure. Absolute paths and
    paths escaping the repo root are refused, mirroring the scratch-escape guard
    materialize_files already applies to `path`.
    """
    if os.path.isabs(rel):
        raise ValueError(f"fixture source must be repo-relative, got: {rel}")
    root = repo_root.resolve()
    dest = (root / rel).resolve()
    if dest != root and not str(dest).startswith(str(root) + os.sep):
        raise ValueError(f"fixture source escapes repo root: {rel}")
    return dest
```

  and, inside `materialize_files`, replace the first branch of the entry loop with:

```python
        if isinstance(entry, dict) and "path" in entry:
            if "source" in entry and "content" in entry:
                raise ValueError(
                    f"fixture {entry['path']}: 'source' and 'content' are mutually exclusive")
            if "source" in entry:
                src = resolve_fixture_source(entry["source"], REPO_ROOT)
                if not src.is_file():
                    raise FileNotFoundError(f"fixture source not found: {entry['source']}")
                pairs = [(entry["path"], src.read_text())]
            else:
                pairs = [(entry["path"], entry.get("content", ""))]
```

- [x] **Step 3: Make a bad fixture a setup error, not a crash.** `materialize_files` is called at
  the top of `run_case`; an exception there currently escapes through `pool.map` and kills the
  whole invocation. Wrap that one call so it becomes the harness-failure signal the runner already
  has:

```python
        try:
            fixtures = materialize_files(scratch, case.get("files"))
        except (ValueError, FileNotFoundError, OSError) as e:
            return {"error": f"fixture setup failed: {e}", "configuration": configuration}
```

- [x] **Step 4: Prove it green.**

```bash
python3 -m unittest discover -s scripts/evals/tests -t . -v
```

  Expected: `OK`, all tests from task 1 still passing.

- [x] **Step 5: Commit** with `Tribe-Card: explaining-illustration` and `Tribe-Task: 2/10`.

---

### Task 3: Runner — the global `--arm clean|mem|both` axis

**Why:** card item 5 and G4. The clean/mem axis is orthogonal to `--mode`: both existing legs are
memory-free today, so ambient-memory suppression is currently unmeasurable.

**Design constraints that are not negotiable in this task:**
- Default is `clean`, so the other four fixtures are untouched (scope fence OUT).
- The `mem` arm runs the **`with_skill` leg only**. The `without_skill` leg is
  `claude -p --safe-mode`, and `--safe-mode` disables `CLAUDE.md`; a mem baseline under it would
  be a clean baseline wearing a mem label.
- The mem result is a **reported delta, never a gate** (G4).

- Modify: `scripts/evals/run_evals.py`
- Modify: `scripts/evals/tests/test_run_evals.py`

**Steps**

- [x] **Step 1: Write the failing tests.** Append:

```python
class ArmPlanning(unittest.TestCase):
    def test_mem_arm_runs_with_skill_leg_only(self):
        self.assertEqual(
            run_evals.plan_arm_configurations("mem", ("with_skill", "without_skill")),
            ("with_skill",))

    def test_clean_arm_runs_both_legs(self):
        self.assertEqual(
            run_evals.plan_arm_configurations("clean", ("with_skill", "without_skill")),
            ("with_skill", "without_skill"))

    def test_clean_arm_asserts_no_memory_and_writes_none(self):
        plan = run_evals.plan_memory_files("clean", Path("/x/CLAUDE.md"))
        self.assertEqual(plan["memory_files"], [])
        self.assertTrue(plan["assert_no_memory"])

    def test_mem_arm_writes_the_fixture_as_claude_md(self):
        plan = run_evals.plan_memory_files("mem", Path("/x/CLAUDE.md"))
        self.assertEqual(plan["memory_files"], [("CLAUDE.md", Path("/x/CLAUDE.md"))])
        self.assertFalse(plan["assert_no_memory"])

    def test_mem_arm_without_a_fixture_is_skipped_with_a_note(self):
        jobs, notes = run_evals.plan_jobs(
            cases=[{"id": 1}], configurations=("with_skill", "without_skill"),
            arms=("clean", "mem"), runs=1, has_memory_fixture=False)
        self.assertEqual([j["arm"] for j in jobs], ["clean", "clean"])
        self.assertEqual(len(notes), 1)
        self.assertIn("memory_fixture", notes[0])

    def test_both_arms_produce_three_cells_when_a_fixture_exists(self):
        jobs, notes = run_evals.plan_jobs(
            cases=[{"id": 1}], configurations=("with_skill", "without_skill"),
            arms=("clean", "mem"), runs=1, has_memory_fixture=True)
        self.assertEqual(
            sorted((j["arm"], j["configuration"]) for j in jobs),
            [("clean", "with_skill"), ("clean", "without_skill"), ("mem", "with_skill")])
        self.assertEqual(notes, [])

    def test_runs_multiplies_every_cell(self):
        jobs, _ = run_evals.plan_jobs(
            cases=[{"id": 1}], configurations=("with_skill",),
            arms=("clean",), runs=3, has_memory_fixture=False)
        self.assertEqual([j["run_idx"] for j in jobs], [0, 1, 2])


class ArmRollup(unittest.TestCase):
    @staticmethod
    def _run(arm, pass_rate, configuration="with_skill"):
        return {"arm": arm, "configuration": configuration,
                "result": {"pass_rate": pass_rate, "passed": int(pass_rate), "ungraded": 0,
                            "total": 1, "time_seconds": 1.0, "tokens": 10}}

    def test_delta_is_mem_minus_clean_on_the_with_skill_leg(self):
        by_arm = run_evals.summarize_with_skill_by_arm(
            [self._run("clean", 1.0), self._run("mem", 0.0),
             self._run("clean", 0.0, "without_skill")])
        self.assertEqual(by_arm["clean"]["pass_rate"]["mean"], 1.0)
        self.assertEqual(by_arm["mem"]["pass_rate"]["mean"], 0.0)
        delta = run_evals.arm_delta(by_arm)
        self.assertEqual(delta["pass_rate"], "-1.00")

    def test_delta_is_none_when_one_arm_is_missing(self):
        by_arm = run_evals.summarize_with_skill_by_arm([self._run("clean", 1.0)])
        self.assertIsNone(run_evals.arm_delta(by_arm))
```

  Expected: every test in both classes fails with `AttributeError`.

- [x] **Step 2: Implement the pure planners** in `run_evals.py`, next to `CONFIGURATIONS`:

```python
ARMS = ("clean", "mem")


def plan_arm_configurations(arm: str, configurations: tuple) -> tuple:
    """Pure: which legs this arm runs.

    The without_skill baseline is `claude -p --safe-mode`, and --safe-mode disables
    CLAUDE.md — so a "mem baseline" would silently be a clean baseline wearing a mem
    label. Rather than weaken the baseline's isolation (c3-301 records that as the
    "Baseline contamination" risk), the mem arm runs the with_skill leg only and the
    clean arm's baseline is shared.
    """
    if arm == "mem":
        return tuple(c for c in configurations if c == "with_skill")
    return tuple(configurations)


def plan_memory_files(arm: str, memory_fixture: Path | None) -> dict:
    """Pure: what ambient memory the scratch dir must (not) contain for this arm.

    Mirrors the detection harness's planScratch(): the clean arm does not merely
    skip writing memory, it ASSERTS none is present, so a leak is caught rather
    than quietly measured.
    """
    if arm == "mem":
        return {"memory_files": [("CLAUDE.md", memory_fixture)] if memory_fixture else [],
                "assert_no_memory": False}
    return {"memory_files": [], "assert_no_memory": True}


def plan_jobs(cases: list, configurations: tuple, arms: tuple, runs: int,
               has_memory_fixture: bool) -> tuple:
    """Pure: the (case, configuration, arm, run) grid plus honest skip notes.

    A mem arm requested for a fixture that declares no memory_fixture is SKIPPED
    with a note — never run as a clean cell labelled `mem`, which would report a
    number nobody measured.
    """
    jobs: list = []
    notes: list = []
    for arm in arms:
        if arm == "mem" and not has_memory_fixture:
            notes.append("mem arm skipped: fixture declares no memory_fixture")
            continue
        for case in cases:
            for configuration in plan_arm_configurations(arm, configurations):
                for run_idx in range(runs):
                    jobs.append({"case": case, "configuration": configuration,
                                  "arm": arm, "run_idx": run_idx})
    return jobs, notes
```

- [x] **Step 3: Implement the rollup** next to `summarize_configuration`:

```python
def summarize_with_skill_by_arm(runs: list) -> dict:
    """Pure-ish: per-arm rollup of the with_skill leg only.

    The baseline leg exists only in the clean arm, so including it would compare a
    two-leg average against a one-leg average.
    """
    out: dict = {}
    for arm in ARMS:
        arm_runs = [r for r in runs
                    if r.get("arm") == arm and r["configuration"] == "with_skill"]
        if arm_runs:
            out[arm] = summarize_configuration(arm_runs)
    return out


def arm_delta(by_arm: dict) -> dict | None:
    """Pure: mem minus clean, with_skill leg. REPORTED, NEVER GATED (card G4).

    Realistic ambient memory can suppress a behavior as easily as it can seed it,
    so a negative delta is a real finding to publish, not a failure to hide.
    """
    clean, mem = by_arm.get("clean"), by_arm.get("mem")
    if not clean or not mem or "pass_rate" not in clean or "pass_rate" not in mem:
        return None
    return {
        "pass_rate": fmt_delta(mem["pass_rate"]["mean"], clean["pass_rate"]["mean"]),
        "note": "mem minus clean, with_skill leg; reported, never gated",
    }
```

- [x] **Step 4: Wire it into `main()` and `run_case()`.**
  - Add the flag:
    `ap.add_argument("--arm", choices=["clean", "mem", "both"], default="clean", help="Ambient-memory axis: clean (no CLAUDE.md in scratch, the default), mem (the fixture's memory_fixture written to scratch/CLAUDE.md), or both. The mem arm runs the with_skill leg only.")`
  - `arms = ARMS if args.arm == "both" else (args.arm,)`, and record `"arms": list(arms)` in
    `metadata`.
  - Read the fixture's optional `memory_fixture` key relative to the evals.json's own directory:
    `memory_fixture = (evals_path.parent / data["memory_fixture"]).resolve() if data.get("memory_fixture") else None`.
    If it is declared but does not exist, append a setup error.
  - Replace the hand-rolled `for case / for configuration / for run_idx` loop with `plan_jobs(...)`,
    carrying `arm` into each job dict and extending each job's `notes` into `benchmark["notes"]`.
  - `run_case` takes `arm` and `memory_fixture`, and after `materialize_files` applies the plan:

```python
        mem_plan = plan_memory_files(arm, memory_fixture)
        for rel, src in mem_plan["memory_files"]:
            shutil.copyfile(src, scratch / rel)
        if mem_plan["assert_no_memory"] and (scratch / "CLAUDE.md").exists():
            return {"error": "clean arm: scratch dir unexpectedly contains CLAUDE.md",
                    "configuration": configuration}
```

  - The per-run output path gains an arm segment so mem and clean never overwrite each other:
    `run_dir = out_dir / f"eval-{case['id']}-{case['name']}" / arm / configuration / f"run-{run_idx + 1}"`.
  - Each result dict carries `"arm": arm`.
  - After the existing `run_summary` is built, add:

```python
    by_arm = summarize_with_skill_by_arm(all_runs)
    if by_arm:
        run_summary["by_arm"] = by_arm
    delta = arm_delta(by_arm)
    if delta:
        run_summary["arm_delta"] = delta
```

- [x] **Step 5: Keep `compare.py` from blending the two arms.** `index_runs`
  (`scripts/evals/compare.py:59-78`) keys each run on
  `(skill_name, eval_id, eval_name, agent)` and filters only on `configuration`. Once a single
  `benchmark.json` can hold both arms, that key silently averages a case's clean and mem
  `with_skill` runs together, so a mem-arm suppression would show up as a fake regression in a
  prompt A/B that never involved the mem arm at all. Add an `--arm` option (default `clean`,
  mirroring the runner's default) and filter on it, treating a run with **no** `arm` key as
  `clean` so every benchmark recorded before this change still compares. Record the arm in the
  report dict next to `configuration`, and cover it with these tests appended to the Python suite:

```python
class CompareArmFiltering(unittest.TestCase):
    def setUp(self):
        _cspec = importlib.util.spec_from_file_location(
            "compare", EVALS_DIR / "compare.py")
        self.compare = importlib.util.module_from_spec(_cspec)
        _cspec.loader.exec_module(self.compare)

    @staticmethod
    def _bench(runs):
        return {"runs": runs}

    @staticmethod
    def _run(arm, passed):
        entry = {"skill_name": "s", "eval_id": 1, "eval_name": "n", "agent": None,
                  "configuration": "with_skill", "result": {"passed": passed}}
        if arm is not None:
            entry["arm"] = arm
        return entry

    def test_filters_to_the_requested_arm(self):
        bench = self._bench([self._run("clean", True), self._run("mem", False)])
        clean = self.compare.index_runs(bench, "with_skill", "clean")
        self.assertEqual(list(clean.values()), [[True]])
        mem = self.compare.index_runs(bench, "with_skill", "mem")
        self.assertEqual(list(mem.values()), [[False]])

    def test_a_run_with_no_arm_key_counts_as_clean(self):
        bench = self._bench([self._run(None, True)])
        self.assertEqual(
            list(self.compare.index_runs(bench, "with_skill", "clean").values()), [[True]])
```

  Expected: both tests fail first (`index_runs` takes two arguments), then pass.

- [x] **Step 6: Prove it green.**

```bash
python3 -m unittest discover -s scripts/evals/tests -t . -v
scripts/evals/run_evals.py --all --dry-run
scripts/evals/run_evals.py --all --arm both --dry-run
```

  Expected: unittest `OK`; both dry runs exit 0 and list the same cases (no fixture declares a
  `memory_fixture` yet, so `--arm both` prints the skip note and plans no mem cell).

- [x] **Step 7: Commit** with `Tribe-Card: explaining-illustration` and `Tribe-Task: 3/10`.

---

### Task 4: Runner — machine `checks`, durable `artifacts`, and the `node_modules` copy guard

**Why:** G3 forbids establishing mermaid validity by grader opinion, and the grader is a tool-less
`claude -p` that sees only text. A machine check must decide it. Separately, `run_case` deletes the
scratch dir in its `finally`, so the produced HTML currently cannot be evidence at all.

- Modify: `scripts/evals/run_evals.py`
- Modify: `scripts/evals/tests/test_run_evals.py`

**Steps**

- [x] **Step 1: Write the failing tests.** Append:

```python
class CheckOutcomes(unittest.TestCase):
    def test_zero_is_pass(self):
        self.assertEqual(run_evals.classify_check_outcome(0), run_evals.CHECK_PASS)

    def test_one_is_a_behavioral_fail(self):
        self.assertEqual(run_evals.classify_check_outcome(1), run_evals.CHECK_FAIL)

    def test_two_is_could_not_check_not_a_fail(self):
        self.assertEqual(run_evals.classify_check_outcome(2), run_evals.CHECK_UNGRADED)

    def test_any_other_code_is_could_not_check(self):
        for rc in (3, 127, -9):
            self.assertEqual(run_evals.classify_check_outcome(rc), run_evals.CHECK_UNGRADED)


class CheckPlanning(unittest.TestCase):
    def test_substitutes_skill_dir_and_scratch(self):
        planned = run_evals.plan_checks(
            {"checks": [{"name": "c", "command": "bun {skill_dir}/v.ts --out {scratch}/x"}]},
            Path("/s/kill"), Path("/tmp/scr"))
        self.assertEqual(planned, [{"name": "c",
                                     "argv": ["bun", "/s/kill/v.ts", "--out", "/tmp/scr/x"]}])

    def test_no_checks_declared_plans_nothing(self):
        self.assertEqual(run_evals.plan_checks({}, Path("/s"), Path("/t")), [])

    def test_glob_token_is_left_literal_for_the_check_to_expand(self):
        planned = run_evals.plan_checks(
            {"checks": [{"name": "c", "command": "bun v.ts --html-glob *.html"}]},
            Path("/s"), Path("/t"))
        self.assertEqual(planned[0]["argv"][-1], "*.html")


class ArtifactCollection(unittest.TestCase):
    def test_copies_matching_files_and_ignores_the_rest(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            scratch, dest = Path(tmp) / "s", Path(tmp) / "d"
            (scratch / "sub").mkdir(parents=True)
            (scratch / "a.html").write_text("A")
            (scratch / "b.txt").write_text("B")
            collected = run_evals.collect_artifacts(scratch, ["*.html"], dest)
            self.assertEqual(collected, ["a.html"])
            self.assertEqual((dest / "a.html").read_text(), "A")
            self.assertFalse((dest / "b.txt").exists())

    def test_no_patterns_collects_nothing_and_creates_nothing(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            scratch, dest = Path(tmp) / "s", Path(tmp) / "d"
            scratch.mkdir()
            self.assertEqual(run_evals.collect_artifacts(scratch, [], dest), [])
            self.assertFalse(dest.exists())
```

  Expected: every test fails with `AttributeError`.

- [x] **Step 2: Implement.** Add `import shlex` to the imports, then:

```python
CHECK_PASS, CHECK_FAIL, CHECK_UNGRADED = "pass", "fail", "ungraded"


def classify_check_outcome(returncode: int) -> str:
    """Pure: a check's exit code, in the harness's own three-outcome vocabulary.

    0 = the artifact is right. 1 = the artifact is wrong, which is a BEHAVIORAL
    failure the agent owns. Anything else = the check could not run (missing
    dependency, no network, crashed) — a HARNESS failure, routed to UNGRADED and
    excluded from the pass/total denominator, never scored as an agent failure.
    """
    if returncode == 0:
        return CHECK_PASS
    if returncode == 1:
        return CHECK_FAIL
    return CHECK_UNGRADED


def plan_checks(case: dict, skill_dir: Path | None, scratch: Path) -> list:
    """Pure: resolve each declared check into an argv list.

    Placeholder substitution is literal replacement (not str.format) so a command
    containing other braces is never mangled, and the argv is split with shlex so
    no shell is involved.
    """
    planned = []
    for spec in case.get("checks") or []:
        command = (spec["command"]
                    .replace("{skill_dir}", str(skill_dir) if skill_dir else "")
                    .replace("{scratch}", str(scratch)))
        planned.append({"name": spec["name"], "argv": shlex.split(command)})
    return planned


def run_checks(planned: list, scratch: Path, timeout: int) -> dict:
    """Impure edge: run each planned check in the scratch dir, first non-pass wins."""
    for check in planned:
        try:
            proc = subprocess.run(check["argv"], cwd=str(scratch), capture_output=True,
                                   text=True, timeout=timeout)
        except (subprocess.TimeoutExpired, FileNotFoundError, OSError) as e:
            return {"outcome": CHECK_UNGRADED, "name": check["name"],
                    "evidence": f"check could not run: {e}"}
        outcome = classify_check_outcome(proc.returncode)
        if outcome != CHECK_PASS:
            tail = (proc.stdout + proc.stderr).strip()[-1000:]
            return {"outcome": outcome, "name": check["name"],
                    "evidence": f"exit {proc.returncode}: {tail}"}
    return {"outcome": CHECK_PASS, "name": None, "evidence": ""}


def collect_artifacts(scratch: Path, patterns: list, dest: Path) -> list:
    """Impure edge: preserve the executor's output files before the scratch dir dies.

    run_case deletes the scratch dir in its finally block, so without this an
    artifact the case is graded on can never be linked as evidence.
    """
    collected = []
    for pattern in patterns or []:
        for src in sorted(scratch.glob(pattern)):
            if not src.is_file():
                continue
            target = dest / src.relative_to(scratch)
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, target)
            collected.append(str(src.relative_to(scratch)))
    return collected
```

- [x] **Step 3: Wire into `run_case`,** replacing the single `verdict = grade(...)` call:

```python
        check_result = run_checks(plan_checks(case, skill_dir, scratch), scratch, timeout)
        if check_result["outcome"] == CHECK_FAIL:
            verdict = {"passed": False,
                        "evidence": f"machine check '{check_result['name']}' failed — "
                                    f"{check_result['evidence']}"}
        elif check_result["outcome"] == CHECK_UNGRADED:
            verdict = {"ungraded": True,
                        "evidence": f"machine check '{check_result['name']}' could not run — "
                                    f"{check_result['evidence']}"}
        else:
            verdict = grade(
                case["prompt"], case["expected_output"], parsed["transcript"],
                parsed["final_result"], cwd=scratch, timeout=timeout, model=grader_model,
            )
```

  Keep the `grader_seconds` timing around the whole block. After `run_dir` is created, collect the
  artifacts and record them in `grading_json`:

```python
        artifacts = collect_artifacts(scratch, case.get("artifacts"), run_dir / "artifacts")
```

  Add `"artifacts": artifacts` and `"check": check_result["name"]` to `grading_json`.

- [x] **Step 4: Stop copying a 200 MB dependency tree into every scratch dir.** In
  `install_skill`, change `shutil.ignore_patterns("evals")` to
  `shutil.ignore_patterns("evals", "node_modules")`. The skill gains a validator in task 5 whose
  `bun install` produces ~207 MB under `scripts/node_modules/`, and `copytree` would otherwise
  duplicate it per case, per leg, per run.

- [x] **Step 5: Prove it green.**

```bash
python3 -m unittest discover -s scripts/evals/tests -t . -v
scripts/evals/run_evals.py --all --dry-run
```

  Expected: unittest `OK`; dry run exits 0.

- [x] **Step 6: Commit** with `Tribe-Card: explaining-illustration` and `Tribe-Task: 4/10`.

---

### Task 5: The embedded mermaid validator

**Why:** owner decision 2 — the validator behaves like Kanna's (a real `mermaid.parse()` plus a
hint layer), is embedded in the skill, and may install its dependency on demand. G3 depends on it.

**Proven facts — do not re-derive them, build to them.** On this machine (`bun` 1.3.14,
`mermaid` 11.17.0, `jsdom` 30.0.1) the Warchief ran these probes:

| Probe | Under the jsdom shim | Bare `bun`, no shim |
|---|---|---|
| `flowchart TD` with `A[do (this)]` | INVALID (`got 'PS'`) | n.a. |
| `flowchart TD` with `A["do (this)"]` | VALID | **INVALID — `DOMPurify.sanitize is not a function`** |
| `sequenceDiagram` with `loop` and `--x` | VALID | VALID |
| `sparklegraph LR` (invented type) | INVALID (`No diagram type detected`) | n.a. |
| `stateDiagram-v2`, `classDiagram` | VALID | **INVALID — `DOMPurify.sanitize is not a function`** |

The shim is load-bearing: without it the very quoted-label form the skill mandates is rejected.
Real error strings to build the hint layer from: `got 'PS'` (paren in label), `got 'PIPE'` (pipe in
label), `Lexical error on line N. Unrecognized text.` (label starting with a slash),
`No diagram type detected` (invented type), `Expecting 'LINK', 'UNICODE_TEXT', 'EDGE_TEXT'`
(abbreviated dotted link end).

- Create: `plugins/explaining/skills/explaining/scripts/package.json`
- Create: `plugins/explaining/skills/explaining/scripts/.gitignore`
- Create: `plugins/explaining/skills/explaining/scripts/validate-mermaid.ts`
- Create: `plugins/explaining/skills/explaining/scripts/validate-mermaid.test.ts`

**Steps**

- [x] **Step 1: Set up the package.** `package.json`:

```json
{
  "name": "explaining-illustration-scripts",
  "private": true,
  "type": "module",
  "scripts": { "test": "bun test" },
  "dependencies": { "jsdom": "^30.0.1", "mermaid": "^11.17.0" }
}
```

  `.gitignore`:

```gitignore
# `bun install` here pulls ~207 MB (mermaid + jsdom). The lockfile is committed so the
# install is reproducible; the tree itself never is.
node_modules/
```

  Then `cd plugins/explaining/skills/explaining/scripts && bun install` and **commit
  `bun.lock`** alongside `package.json`.

- [x] **Step 2: Write the failing tests** in `validate-mermaid.test.ts`, covering the pure core
  and — separately — the real parser:

```ts
import { describe, expect, test } from 'bun:test';
import {
  classifyOutcome,
  decodeHtmlEntities,
  EXIT_CODE,
  extractMermaidSources,
  hintFor,
  validateSources,
} from './validate-mermaid';

describe('extractMermaidSources', () => {
  test('pulls the diagram out of a div.mermaid and decodes entities', () => {
    const html = '<html><body><div class="mermaid">flowchart TD\n  A[&quot;a &amp; b&quot;] --&gt; B</div></body></html>';
    expect(extractMermaidSources(html)).toEqual(['flowchart TD\n  A["a & b"] --> B']);
  });

  test('accepts pre.mermaid and extra classes', () => {
    expect(extractMermaidSources('<pre class="diagram mermaid">graph LR\n A-->B</pre>'))
      .toEqual(['graph LR\n A-->B']);
  });

  test('returns nothing when the page carries no mermaid container', () => {
    expect(extractMermaidSources('<html><body><p>just prose</p></body></html>')).toEqual([]);
  });

  test('decodes &amp; last so &amp;lt; does not become a tag', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
  });
});

describe('hintFor', () => {
  test('maps an unquoted paren label to the quoting rule', () => {
    expect(hintFor("Parse error on line 2:\nExpecting 'SQE', got 'PS'")).toMatch(/wrap .* in double quotes/i);
  });

  test('maps a pipe in a label to the quoting rule', () => {
    expect(hintFor("Expecting 'SQE', got 'PIPE'")).toMatch(/wrap .* in double quotes/i);
  });

  test('maps an unrecognized leading slash to the quoting rule', () => {
    expect(hintFor('Lexical error on line 2. Unrecognized text.')).toMatch(/double quotes/i);
  });

  test('maps an invented diagram type to the diagram-type rule', () => {
    expect(hintFor('No diagram type detected matching given configuration for text: sparklegraph LR'))
      .toMatch(/diagram type/i);
  });

  test('maps an abbreviated dotted link to the full-form rule', () => {
    expect(hintFor("Expecting 'LINK', 'UNICODE_TEXT', 'EDGE_TEXT', got '1'")).toMatch(/-\.-x/);
  });

  test('always returns actionable advice, even for an unknown error', () => {
    expect(hintFor('something nobody has seen before').length).toBeGreaterThan(20);
  });
});

describe('classifyOutcome and its exit codes', () => {
  test('no artifact found is INVALID, not COULD_NOT_VALIDATE', () => {
    expect(classifyOutcome({ artifacts: 0, sources: 0, parser: 'ready', errors: [] }))
      .toBe('INVALID');
  });

  test('artifact without a mermaid container is INVALID', () => {
    expect(classifyOutcome({ artifacts: 1, sources: 0, parser: 'ready', errors: [] }))
      .toBe('INVALID');
  });

  test('an unavailable parser is COULD_NOT_VALIDATE, never INVALID', () => {
    expect(classifyOutcome({ artifacts: 1, sources: 1, parser: 'unavailable', errors: [] }))
      .toBe('COULD_NOT_VALIDATE');
  });

  test('a parse error is INVALID', () => {
    expect(classifyOutcome({ artifacts: 1, sources: 1, parser: 'ready', errors: ['boom'] }))
      .toBe('INVALID');
  });

  test('everything parsed is VALID', () => {
    expect(classifyOutcome({ artifacts: 1, sources: 1, parser: 'ready', errors: [] }))
      .toBe('VALID');
  });

  test('exit codes are 0 valid, 1 invalid, 2 could-not-validate', () => {
    expect(EXIT_CODE).toEqual({ VALID: 0, INVALID: 1, COULD_NOT_VALIDATE: 2 });
  });
});

describe('validateSources against the real parser', () => {
  test('the safe-syntax forms the skill mandates all parse', async () => {
    const errors = await validateSources([
      'flowchart TD\n  A["do (this)"] --> B[end]',
      'flowchart TD\n  A -.-x B\n  A -.-o C',
      'flowchart TD\n  A["say #quot;hi#quot;"] --> B',
      'sequenceDiagram\n  participant A\n  participant B\n  loop every minute\n    A--xB: ping\n  end',
    ]);
    expect(errors).toEqual([]);
  });

  test('the unsafe counterparts are rejected by a real parse', async () => {
    const errors = await validateSources([
      'flowchart TD\n  A[do (this)] --> B[end]',
      'sparklegraph LR\n  A --> B',
    ]);
    expect(errors.length).toBe(2);
  });
});
```

  Run `bun test` in that directory. Expected: the file fails to resolve
  `./validate-mermaid` — nothing implemented yet.

- [x] **Step 3: Implement `validate-mermaid.ts`.** Pure core exported for tests; the impure edge
  behind `loadParser()`. Required behaviors:
  - `decodeHtmlEntities(text)` decodes `&lt; &gt; &quot; &#39;` and decodes `&amp;` **last**.
  - `extractMermaidSources(html)` matches any `div` or `pre` whose `class` attribute contains the
    word `mermaid`, decodes the body, trims, and drops empties.
  - `hintFor(errorText)` maps the five real error signatures listed above to remediation advice,
    with an always-useful fallback naming the safe-syntax rules.
  - `classifyOutcome({artifacts, sources, parser, errors})` returns
    `COULD_NOT_VALIDATE` when `parser` is `unavailable`, else `INVALID` when there are no
    artifacts, no sources, or any error, else `VALID`. Order matters: parser availability is
    checked before errors, and the no-artifact case is `INVALID` because an absent deliverable is
    the agent's failure, not the harness's.
  - `EXIT_CODE` is exactly `{ VALID: 0, INVALID: 1, COULD_NOT_VALIDATE: 2 }`.
  - `loadParser()` builds the jsdom shim then dynamic-imports mermaid, and on any failure
    (including a failed on-demand `bun install`) resolves to `unavailable` rather than throwing.
    The shim that is proven to work assigns these globals from a
    `new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true })`: `window`,
    `document`, `navigator`, `Element`, `SVGElement`, `HTMLElement`, `Node`, `DOMParser`,
    `NodeFilter`, `getComputedStyle`; then `mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' })`.
  - `validateSources(sources)` returns the list of `{source, message, hint}` for the ones that
    failed, and resolves `[]` when all parse.
  - CLI `main()`: flags `--html-glob <glob>` (default `*.html`, globbed relative to `cwd`) and
    `--file <path>` (a raw mermaid file). Prints a one-line verdict plus each error and its hint,
    then exits with `EXIT_CODE[outcome]`.
  - On-demand install: if the mermaid import fails, run
    `bun install --cwd <this script's directory>` once and retry the import; if that fails too,
    the parser is `unavailable`. Never let the install failure surface as a parse failure.

```bash
cd plugins/explaining/skills/explaining/scripts && bun test
```

  Expected: all tests pass, including both `validateSources` tests against the real parser.

- [x] **Step 4: Prove the CLI's three outcomes by hand.**

```bash
cd /tmp && rm -rf vm-check && mkdir vm-check && cd vm-check
S=/Users/hip/repo/todd-skills-explaining-illustration/plugins/explaining/skills/explaining/scripts
bun "$S/validate-mermaid.ts" --html-glob '*.html'; echo "no-artifact exit=$?"
printf '<html><body><div class="mermaid">flowchart TD\n  A["ok (x)"] --&gt; B</div></body></html>' > good.html
bun "$S/validate-mermaid.ts" --html-glob '*.html'; echo "good exit=$?"
rm good.html
printf '<html><body><div class="mermaid">flowchart TD\n  A[bad (x)] --&gt; B</div></body></html>' > bad.html
bun "$S/validate-mermaid.ts" --html-glob '*.html'; echo "bad exit=$?"
```

  Expected: `no-artifact exit=1`, `good exit=0`, `bad exit=1` with a printed hint about wrapping
  the label in double quotes.

- [x] **Step 5: Commit** with `Tribe-Card: explaining-illustration` and `Tribe-Task: 5/10`.

---

### Task 6: The self-contained HTML renderer

**Why:** owner decision 3 — one self-contained file, mermaid via CDN, light/dark. The card's second
consequence is that the illustration must be consumable by a human, not only a fenced code block.

- Create: `plugins/explaining/skills/explaining/scripts/render-illustration.ts`
- Create: `plugins/explaining/skills/explaining/scripts/render-illustration.test.ts`

**Steps**

- [x] **Step 1: Write the failing tests:**

```ts
import { describe, expect, test } from 'bun:test';
import { escapeHtml, renderIllustrationHtml } from './render-illustration';
import { extractMermaidSources } from './validate-mermaid';

const DIAGRAM = 'flowchart TD\n  A["shaman (what & why)"] --> B["warchief"]\n  B -.-x C';

describe('renderIllustrationHtml', () => {
  const html = renderIllustrationHtml({
    title: 'Tribe flow', diagram: DIAGRAM, caption: 'Who dispatches whom.',
  });

  test('is one self-contained document', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  test('loads mermaid from the CDN and nothing else remote', () => {
    expect(html).toContain('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
  });

  test('supports light and dark', () => {
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('matchMedia');
  });

  test('escapes the title and caption', () => {
    const evil = renderIllustrationHtml({
      title: '<script>x</script>', diagram: DIAGRAM, caption: 'a & b',
    });
    expect(evil).not.toContain('<script>x</script>');
    expect(evil).toContain('a &amp; b');
  });

  test('round-trips the diagram back out through the validator extractor', () => {
    expect(extractMermaidSources(html)).toEqual([DIAGRAM]);
  });

  test('escapeHtml handles the five characters that matter', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });
});
```

  Run `bun test`. Expected: the new file fails to resolve `./render-illustration`.

- [x] **Step 2: Implement `render-illustration.ts`,** dependency-free so it works offline:
  - `escapeHtml(text)` escapes `&` first, then `<`, `>`, `"`, `'`.
  - `renderIllustrationHtml({title, diagram, caption})` returns one document containing: a
    `<div class="mermaid">` holding the HTML-escaped diagram; CSS using CSS custom properties with
    a `@media (prefers-color-scheme: dark)` override; and a module script that imports mermaid from
    `https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs` and calls
    `mermaid.initialize({ startOnLoad: true, theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default' })`.
    Version `11` is deliberate: it is the major the validator parses with, so what validates is
    what renders. (The repo's existing `plugins/tribe/scripts/runner/RUNNER_EXPLAINED.html:827`
    pins `@10`; that file is not touched here.)
  - CLI `main()`: `--title`, `--caption`, `--diagram <file>` (or stdin), `--out <path>`; writes the
    file and prints its absolute path.
- [x] **Step 3: Prove it green and eyeball a real artifact.**

```bash
cd /Users/hip/repo/todd-skills-explaining-illustration/plugins/explaining/skills/explaining/scripts
bun test
printf 'flowchart TD\n  A["shaman"] --> B["warchief"]\n  B -.-x C["hunter"]\n' > /tmp/d.mmd
bun render-illustration.ts --title "Probe" --diagram /tmp/d.mmd --out /tmp/probe.html
bun validate-mermaid.ts --html-glob /tmp/probe.html; echo "validator exit=$?"
```

  Expected: `bun test` passes; the renderer prints `/tmp/probe.html`; `validator exit=0` — the
  renderer's output validates through the task-5 validator, which is the round trip that matters.

- [x] **Step 4: Commit** with `Tribe-Card: explaining-illustration` and `Tribe-Task: 6/10`.

---

### Task 7: The Illustration section in `SKILL.md`

**Why:** card items 2 and 4, and hard requirement 4. A capability that fires by luck is not a
capability — the skill must decide to illustrate on its own merit, and must treat the file as the
deliverable.

- Modify: `plugins/explaining/skills/explaining/SKILL.md`

**Steps**

- [x] **Step 1: Add a `## Rule 4 — Illustrate a flow instead of narrating it` section** after
  Rule 3 and before `## Self-check before finishing`. It must state, in the existing file's voice
  (imperative, grounded, no persona framing):
  - **When.** A flow with **multiple actors** or **conditional paths** gets a diagram. Linear
    prose, a single-actor sequence, or a list of facts does not — a diagram there is noise.
  - **What.** A mermaid diagram, rendered into **one self-contained HTML file written to disk**.
    A fenced code block alone is not the deliverable: it renders in some clients and not others.
  - **How.** Build the file with
    `scripts/render-illustration.ts --title T --diagram D.mmd --out out.html`, then validate it
    with `scripts/validate-mermaid.ts --html-glob out.html`. The diagram must sit in an element
    with `class="mermaid"` (the renderer does this).
  - **The three validator outcomes.** Exit `0`: ship it. Exit `1`: fix the diagram using the
    printed hint and re-validate. Exit `2`: the validator could not run (no dependency, no
    network) — **ship the file anyway and say the diagram is unvalidated**. A validator that
    cannot run is not a failing diagram.
  - **Offer it.** The file on disk is the deliverable; offering it is a best-effort second step.
    Use an MCP preview or download tool when one exists, otherwise state the path.
  - **Mermaid safe syntax**, verbatim as rules:
    - Write dotted link ends in full: `-.-x` and `-.-o`, never an abbreviated form.
    - Wrap a label in double quotes when it contains `(` `)` `[` `]` `{` `}` `|` or `"`, or when
      it starts with `/` or `\`.
    - Write a literal double quote inside a quoted label as `#quot;`.
- [x] **Step 2: Add one line to `## Self-check before finishing`:** a third numbered item asking
  whether the explanation describes a multi-actor or conditional flow that was narrated instead of
  drawn (Rule 4).
- [x] **Step 3: Do not touch Rules 1-3, the Overview, or the Evidence section** beyond the
  `../evals/evals.json` path already fixed in task 1 — the scope fence forbids changing the two
  existing rules.
- [x] **Step 4: Verify the skill still parses as a skill.**

```bash
cd /Users/hip/repo/todd-skills-explaining-illustration
python3 -c "
import importlib.util, pathlib
s = importlib.util.spec_from_file_location('re_', 'scripts/evals/run_evals.py')
m = importlib.util.module_from_spec(s); s.loader.exec_module(m)
f, _ = m.parse_frontmatter(pathlib.Path('plugins/explaining/skills/explaining/SKILL.md'))
print('name =', f['name']); print('description chars =', len(f['description']))
"
python3 -m unittest discover -s scripts/evals/tests -t .
```

  Expected: `name = explaining`, a non-zero description length, and unittest `OK`.

- [x] **Step 5: Commit** with `Tribe-Card: explaining-illustration` and `Tribe-Task: 7/10`.

---

### Task 8: The mem-arm memory fixture and its vocabulary-ban test

**Why:** card item 6 and the hard requirement "the memory fixture must not hand over the answer" —
enforced by a test, because a promise in a comment is not enforcement. The fixture's purpose is
**suppression**: realistic, terse-leaning ambient memory of the kind that might kill a diagram in
production.

- Create: `plugins/explaining/skills/explaining/evals/memory-fixture/CLAUDE.md`
- Modify: `scripts/evals/tests/test_run_evals.py`

**Steps**

- [x] **Step 1: Write the failing test.** Append:

```python
MEMORY_FIXTURE = (REPO_ROOT
                  / "plugins/explaining/skills/explaining/evals/memory-fixture/CLAUDE.md")

# The mem arm measures whether realistic ambient memory SUPPRESSES the behavior. If the
# fixture names the vocabulary of the behavior it would seed it instead, and the arm
# would measure the fixture rather than the skill. Following the zero-lexical-overlap
# meta-test at plugins/tribe/evals/detection/core/memory-overlap.test.ts.
BANNED_VOCABULARY = ("mermaid", "diagram", "illustration", "illustrate", "chart",
                     "graph", "visual", "html", "render", "draw", "picture", "image")


class MemoryFixture(unittest.TestCase):
    def test_exists(self):
        self.assertTrue(MEMORY_FIXTURE.is_file(), f"missing fixture: {MEMORY_FIXTURE}")

    def test_never_mentions_the_illustration_vocabulary(self):
        import re as _re
        text = MEMORY_FIXTURE.read_text().lower()
        hits = [w for w in BANNED_VOCABULARY if _re.search(rf"\b{w}\w*", text)]
        self.assertEqual(hits, [], f"memory fixture leaks the answer: {hits}")

    def test_is_substantial_enough_to_be_realistic_ambient_memory(self):
        self.assertGreater(len(MEMORY_FIXTURE.read_text().split()), 80)
```

  Expected: all three fail — the fixture does not exist.

- [x] **Step 2: Author the fixture.** Realistic project memory for a plausible service, leaning on
  terseness and directness, containing none of the banned words nor any word starting with them
  (the test uses a `\bword\w*` prefix match, so `graphs`, `rendering`, `drawing` all count as
  leaks). Cover the shapes the card names: build/test commands, an answer-length preference,
  release notes, and review habits. Keep it over 80 words.
- [x] **Step 3: Prove it green.**

```bash
cd /Users/hip/repo/todd-skills-explaining-illustration
python3 -m unittest discover -s scripts/evals/tests -t . -v
```

  Expected: `OK`, with the three `MemoryFixture` tests passing.

- [x] **Step 4: Commit** with `Tribe-Card: explaining-illustration` and `Tribe-Task: 8/10`.

---

### Task 9: The new eval case

**Why:** card item 7 and G1/G2. The case is the measurement.

**The prompt must not ask for a diagram, a picture, an image, or an HTML file.** G2's entire
meaning is attribution: if the prompt requests the artifact, both legs produce it and the skill has
added nothing. The prompt asks for an explanation; deciding to illustrate is the behavior under
test.

- Modify: `plugins/explaining/skills/explaining/evals/evals.json`
- Modify: `scripts/evals/tests/test_run_evals.py`

**Steps**

- [x] **Step 1: Write the failing test.** Append:

```python
EXPLAINING_EVALS = (REPO_ROOT
                    / "plugins/explaining/skills/explaining/evals/evals.json")


class ExplainingIllustrationCase(unittest.TestCase):
    def setUp(self):
        self.data = json.loads(EXPLAINING_EVALS.read_text())
        self.case = next(c for c in self.data["evals"]
                          if c["name"] == "tribe-overall-flow-illustrated")

    def test_fixture_declares_its_memory_fixture(self):
        self.assertEqual(self.data["memory_fixture"], "memory-fixture/CLAUDE.md")
        self.assertTrue(
            (EXPLAINING_EVALS.parent / self.data["memory_fixture"]).is_file())

    def test_uses_the_real_tribe_readme_by_source_not_an_inlined_copy(self):
        self.assertEqual(self.case["files"],
                          [{"path": "tribe-README.md",
                            "source": "plugins/tribe/README.md"}])

    def test_prompt_never_asks_for_the_artifact(self):
        prompt = self.case["prompt"].lower()
        for word in ("diagram", "mermaid", "html", "chart", "picture", "image",
                      "illustrate", "illustration", "draw", "visual", "render"):
            self.assertNotIn(word, prompt,
                              f"prompt leaks the behavior under test: {word!r}")

    def test_declares_a_machine_check_and_collects_the_artifact(self):
        self.assertEqual(len(self.case["checks"]), 1)
        command = self.case["checks"][0]["command"]
        self.assertIn("{skill_dir}", command)
        self.assertIn("validate-mermaid.ts", command)
        self.assertEqual(self.case["artifacts"], ["*.html"])

    def test_the_planned_check_argv_points_at_a_real_script(self):
        _, skill_dir, _ = run_evals.derive_kind_and_dirs(
            EXPLAINING_EVALS, self.data.get("kind"))
        planned = run_evals.plan_checks(self.case, skill_dir, Path("/tmp/scratch"))
        self.assertTrue(Path(planned[0]["argv"][1]).is_file(),
                         f"check points at a missing script: {planned[0]['argv']}")

    def test_existing_cases_are_untouched(self):
        self.assertEqual([c["id"] for c in self.data["evals"]], [1, 2, 3])
```

  Expected: every test fails — no case 3, no `memory_fixture` key.

- [x] **Step 2: Add the case.** Add the top-level `"memory_fixture": "memory-fixture/CLAUDE.md"`
  key and append case id 3, leaving cases 1 and 2 byte-identical:

```json
    {
      "id": 3,
      "name": "tribe-overall-flow-illustrated",
      "prompt": "Read tribe-README.md in this directory. Explain, for a developer who has never seen this system, how work actually moves through the tribe end to end: who hands work to whom, what each role returns to its caller, which paths are conditional, and where the boundary between the two reviewer roles falls. Make the whole flow understandable.",
      "expected_output": "The response makes the multi-actor flow understandable AND leaves behind a rendered illustration the reader can open: a self-contained .html file written into the working directory whose mermaid source sits in an element with class=\"mermaid\" and parses. The diagram covers the dispatch chain across the roles and at least one conditional path. The accompanying prose obeys the skill's existing rules — every role name and piece of jargon is defined or contextualized at first use, and claims about the flow are anchored in what tribe-README.md actually says rather than asserted. Producing only a fenced code block, or only prose with no file on disk, does not satisfy this.",
      "files": [
        { "path": "tribe-README.md", "source": "plugins/tribe/README.md" }
      ],
      "checks": [
        {
          "name": "html-mermaid-parses",
          "command": "bun {skill_dir}/scripts/validate-mermaid.ts --html-glob *.html"
        }
      ],
      "artifacts": ["*.html"]
    }
```

- [x] **Step 3: Prove it green, including the plan the runner would execute.**

```bash
cd /Users/hip/repo/todd-skills-explaining-illustration
python3 -m unittest discover -s scripts/evals/tests -t . -v
scripts/evals/run_evals.py --evals plugins/explaining/skills/explaining/evals/evals.json \
  --eval-id 3 --arm both --dry-run
```

  Expected: unittest `OK`; the dry run exits 0, names eval 3, and prints no mem-skip note (the
  fixture now declares a `memory_fixture`).

- [x] **Step 4: Commit** with `Tribe-Card: explaining-illustration` and `Tribe-Task: 9/10`.

---

### Task 10: Docs, installer verification, and the C3 change-unit

**Why:** project rule (docs updated in the same PR; `install.sh` updated if newly-installed content
appears) and card item 8.

- Modify: `scripts/evals/README.md`
- Modify: `plugins/explaining/README.md` (create it if absent)
- Create: `.c3/adr/adr-20260820-eval-arm-axis-and-machine-checks.md`
- Create: `.c3/changes/adr-20260820-eval-arm-axis-and-machine-checks/` patches
- Modify: `install.sh` only if step 3 proves it must change

**Steps**

- [ ] **Step 1: Update `scripts/evals/README.md`.** In the `evals.json shape` block add
  `memory_fixture`, `files[].source`, `checks`, and `artifacts` with one comment line each; in
  `Usage` add `--arm`; and add a short subsection under `What it does` titled
  `### Arms: clean vs mem` stating that the default is `clean`, that the mem arm writes the
  fixture to `scratch/CLAUDE.md` which `--setting-sources project` loads, that **the mem arm runs
  the `with_skill` leg only because `--safe-mode` disables `CLAUDE.md`**, that a fixture with no
  `memory_fixture` is skipped with a note rather than run as a mislabelled clean cell, and that
  `arm_delta` is reported and never gated. Add a second subsection
  `### Machine checks` giving the exit-code contract (`0` pass, `1` behavioral FAIL and the grader
  is skipped, anything else UNGRADED through the existing machinery) and noting that the run
  output path now carries an arm segment,
  `<skill_name>/eval-<id>-<name>/<arm>/<configuration>/run-<N>/`. Add the test command
  `python3 -m unittest discover -s scripts/evals/tests -t .` where the other commands live.
  Finally, correct the stale sentence at lines 45-48 claiming skill cases "register a throwaway
  `.claude/commands/` entry carrying the real `SKILL.md` description" — `install_skill()` copies
  the whole skill directory into the scratch project scope; say that instead.
- [ ] **Step 2: Document the skill.** In `plugins/explaining/README.md`, describe the skill's four
  rules, the two scripts and what each is for, the on-demand dependency install, and where the
  eval fixture now lives.
- [ ] **Step 3: Verify the installer, and record the verdict either way.** `install.sh` symlinks
  each `skills/<name>/` as a whole directory, so a skill-local `scripts/` ships with the skill and
  no installer change should be needed. Prove it rather than assume it:

```bash
cd /Users/hip/repo/todd-skills-explaining-illustration
rm -rf /tmp/claude-install-probe && mkdir -p /tmp/claude-install-probe
CLAUDE_DIR=/tmp/claude-install-probe ./install.sh explaining
ls -l /tmp/claude-install-probe/skills/
ls /tmp/claude-install-probe/skills/explaining/scripts/
ls /tmp/claude-install-probe/skills/explaining/evals/ 2>&1
```

  Expected: `skills/explaining` is a symlink into this worktree; `scripts/` lists
  `validate-mermaid.ts` and `render-illustration.ts`; the `evals/` listing shows the fixture is
  reachable through the symlink (it is dev content that travels with the directory, which is the
  same situation the other four skills are already in). No `unsupported component type` warning is
  printed. If and only if a warning appears or a component fails to install, change `install.sh`
  and say so in the commit message.
- [ ] **Step 4: Author the C3 change-unit.** Use `bunx @c3x/cli@11.6.3` for every C3 command — there
  is no `c3`/`c3x` binary on this machine. Never hand-edit a `.c3/` fact; author an ADR plus
  patches and apply them through the tool, following the shape of
  `.c3/changes/adr-20260820-detection-eval-standalone-harness/`. The unit covers three targets:
  - `ref-evals-fixture` — the fixture shape gains optional `memory_fixture` (top level),
    `files[].source`, `checks`, and `artifacts`.
  - `c3-301-eval-runner` — Inputs and Contract gain `--arm clean|mem|both`; the output path gains
    its arm segment; Change Safety gains a row for the mem-arm honesty risk (a mem cell that
    silently runs clean).
  - `ref-plugin-layout` — a note that a **skill-local** `skills/<name>/scripts/` IS installed
    (the skill directory is symlinked whole), unlike a plugin-level `scripts/`, which is not.

```bash
cd /Users/hip/repo/todd-skills-explaining-illustration
C3X_MODE=agent bunx @c3x/cli@11.6.3 check
```

  Expected, and this is the gate: exactly the 2 pre-existing errors (`c3-213`, `c3-216`,
  "ungrounded derivation in Derived Materials row 1"). Any third error is yours to fix before
  committing.

- [ ] **Step 5: Prove the whole suite green one more time.**

```bash
cd /Users/hip/repo/todd-skills-explaining-illustration
python3 -m unittest discover -s scripts/evals/tests -t . -v
cd plugins/explaining/skills/explaining/scripts && bun test
cd /Users/hip/repo/todd-skills-explaining-illustration && scripts/evals/run_evals.py --all --dry-run
```

  Expected: unittest `OK`; `bun test` all pass; the dry run exits 0.

- [ ] **Step 6: Commit** with `Tribe-Card: explaining-illustration` and `Tribe-Task: 10/10`.

---

## What the Warchief does after task 10

Not a Hunter task — recorded here so the plan is complete: capture the before/after evidence per
the spec's evidence plan (the `derive_kind_and_dirs` sweep on base vs branch; G1 three clean
`with_skill` runs; G2 three clean `without_skill` runs; G3 the check's real parse verdict plus a
negative control; G4 three mem `with_skill` runs and the reported `arm_delta`; G5 the test run),
publish the produced artifact, open the PR, and merge.
