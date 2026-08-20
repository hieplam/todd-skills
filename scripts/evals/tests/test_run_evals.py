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

    def test_rejects_non_string_source(self):
        """A plausible authoring typo (e.g. "source": 123) must raise the ValueError
        run_case's guard already names, not a bare TypeError from os.path.isabs()."""
        with self.assertRaises(ValueError):
            run_evals.resolve_fixture_source(123, REPO_ROOT)

    def test_rejects_symlink_loop(self):
        """A symlink loop reachable from `source` must raise, not hang/crash uncaught
        with a Python-version-specific exception type (RuntimeError on 3.9, OSError
        with errno ELOOP on 3.10+)."""
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a, b = root / "a", root / "b"
            try:
                a.symlink_to(b)
                b.symlink_to(a)
            except (OSError, NotImplementedError):
                self.skipTest("platform cannot create symlinks")
            with self.assertRaises((RuntimeError, OSError)):
                run_evals.resolve_fixture_source("a/x", root)


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


class RunCaseFixtureSetupGuard(unittest.TestCase):
    """run_case's fixture-setup guard must swallow ANY fixture-setup exception into
    the {"error": ...} signal, never let one escape.

    run_case is driven by pool.map(execute, jobs) inside a ThreadPoolExecutor with no
    enclosing handler up to main(), and benchmark.json is only written after that loop
    completes — an exception escaping run_case discards every already-completed case's
    results, each backed by a real, paid `claude -p` subprocess call. A narrow except
    clause that misses a plausible fixture-authoring mistake (a non-string `source`, a
    symlink loop reachable from `source`) turns one bad case into a total-loss batch.
    """

    def test_non_string_source_becomes_setup_error_not_a_raised_exception(self):
        case = {"id": 1, "name": "x", "prompt": "p", "expected_output": "e",
                "files": [{"path": "a.md", "source": 123}]}
        result = run_evals.run_case(
            case, "skill", None, None, "with_skill", timeout=1, exec_model=None,
            grader_model=None, out_dir=Path("/tmp/unused-run-case-guard-test"), verbose=False)
        self.assertIn("error", result)
        self.assertIn("fixture setup failed", result["error"])

    def test_symlink_loop_source_becomes_setup_error_not_a_raised_exception(self):
        import tempfile
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            a, b = root / "a", root / "b"
            try:
                a.symlink_to(b)
                b.symlink_to(a)
            except (OSError, NotImplementedError):
                self.skipTest("platform cannot create symlinks")

            original_repo_root = run_evals.REPO_ROOT
            run_evals.REPO_ROOT = root
            try:
                case = {"id": 2, "name": "y", "prompt": "p", "expected_output": "e",
                        "files": [{"path": "a.md", "source": "a/x"}]}
                result = run_evals.run_case(
                    case, "skill", None, None, "with_skill", timeout=1, exec_model=None,
                    grader_model=None, out_dir=Path("/tmp/unused-run-case-guard-test"),
                    verbose=False)
            finally:
                run_evals.REPO_ROOT = original_repo_root

            self.assertIn("error", result)
            self.assertIn("fixture setup failed", result["error"])


if __name__ == "__main__":
    unittest.main()
