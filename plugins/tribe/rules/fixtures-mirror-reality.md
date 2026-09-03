# Fixtures mirror how a real user invokes the thing

## Rule

A test fixture must reproduce the *shape a real caller produces*, not the shape most convenient
to write. Two applications, both earned:

1. **Vary the input shape the caller controls.** When an interface accepts a value that users
   can spell more than one way — a relative *or* absolute path, a trailing slash, a symlink, a
   name with a space — at least one test exercises each shape that reaches different code. A
   suite that only ever passes one spelling proves the interface works for that spelling.
2. **Before writing lifecycle code, run it against an empty fixture.** Any tool that assembles,
   vendors, or migrates a tree must be exercised on a *bare directory* — the layout it claims
   to produce, built from nothing — during plan verification, before the implementation is
   designed. Defects of the "only visible on a real or empty target" class do not surface in
   unit tests of the parts.

## Why

The convenient fixture and the real caller differ in exactly the ways that hide bugs, because
convenience and realism pull in opposite directions. `TemporaryDirectory()` hands you an
absolute path; a user types a relative one. A test builds the tree it needs; a user starts from
nothing.

Two measured cases, both from the same library:

- **The absolute-path blind spot.** Every test of a scaffolding tool passed an absolute
  `TemporaryDirectory` path. The tool executed a child process with a target-relative program
  path *and* `cwd=target`, so a relative target doubled the directory name and crashed. **248
  tests passed over it.** It was found by the first end-to-end run that typed the command the
  way a person would, and it had already shipped in a tagged release.
- **The empty-tree blind spot.** Four separate plan defects — a module the vendoring step never
  copied, a lint run ordered before the file it needed, documentation links inside code blocks
  treated as real links, a precondition unenforced on one flag — shared a signature: each was
  invisible in unit tests and obvious the first time the tool ran against a bare directory. All
  four surfaced late, after multiple implementation rounds had been built on the flawed plan.

A green suite is evidence about the shapes it exercised. Nothing more.

## Golden pattern

```python
# The tool is invoked BOTH ways a user can invoke it.
def test_init_with_absolute_target(self):
    with tempfile.TemporaryDirectory() as tmp:
        assert init(Path(tmp) / "wiki", ...) == 0

def test_init_with_relative_target(self):
    """The shape a person actually types: cd somewhere, name the directory."""
    with tempfile.TemporaryDirectory() as tmp:
        prev = os.getcwd()
        os.chdir(tmp)
        try:
            assert init("wiki", ...) == 0          # relative — the one that broke
        finally:
            os.chdir(prev)

# And the plan-verification step, before the implementation is designed:
#   copy exactly the files the plan says get vendored into an empty dir,
#   then run the linter / hooks / entry point there.
def test_lint_runs_from_vendored_scripts_dir_alone(self): ...
```

## Not this

- A suite where every path is an absolute `TemporaryDirectory` and no test types a bare name.
- Verifying a vendoring or migration plan only by reading it.
- Treating an end-to-end smoke test as redundant because "the units already cover it" — the
  units cover the units.
- Deleting or weakening the awkward fixture because the convenient one is greener.

## Pragmatism — how reviewers grade it

- An entry point that takes a user-supplied path with no test exercising a relative one →
  **Should-fix**, and **Blocker** once the tool spawns a subprocess or changes directory with
  that path.
- A vendoring, scaffolding, or migration plan with no empty-fixture verification step →
  **Should-fix** before implementation begins; cheap then, expensive after.
- Missing coverage of an exotic shape (a space, a symlink, a trailing slash) with no mechanism
  that could plausibly care → **Optional**.
- Note the asymmetry when triaging: an untested input *shape* is a far more common defect
  source than an untested input *value*. Prefer one more shape over one more value.
