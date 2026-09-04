# Spec — `test-fresh-machine.sh` builds the provisioned state it asserts on

**Card:** `fresh-machine-doctor-fixture` · **Campaign:** `followups-2026-09-04` · **Shaman spec, 2026-09-04** · base: latest `origin/master`
**Card file:** `~/.tribe/-Users-hip-repo-todd-skills/campaigns/followups-2026-09-04/cards/fresh-machine-doctor-fixture.md`

## Problem, grounded (and re-diagnosed)

The handoff recorded this suite as "fails from any non-canonical checkout path". Reproduction on
2026-09-04 (`a9a6e7b`) shows the path is irrelevant and the cause is the fixture:

```
canonical checkout (runner deps installed)              26 passed, 0 failed
git archive HEAD | tar -x into a temp dir, no bun install
  not ok - doctor passes on a fully-provisioned machine (got: 1, want: 0)
                                                        25 passed, 1 failed
same temp dir after (cd plugins/tribe/scripts/runner && bun install)
                                                        26 passed, 0 failed
```

`plugins/tribe/scripts/tests/test-fresh-machine.sh:180-184`:

```bash
  # On this machine, with a full PATH, the doctor should pass.
  set +e
  dout="$(cd "$FOREIGN" && bash "$DOCTOR" 2>&1)"; drc=$?
  set -e
  check "doctor passes on a fully-provisioned machine" "$drc" "0"
```

`$DOCTOR` (`:14`) is the checkout's own `plugins/tribe/scripts/doctor.sh`, and
`doctor.sh:78-88` reports `MISSING runner dependencies` whenever `$HERE/runner/node_modules` is
absent, with `HERE` resolved via `pwd -P` from the script's real location. The assertion names a
fixture — "a fully-provisioned machine" — that the test never builds; it borrows the state of
whichever checkout it runs in. `plugins/tribe/rules/fixtures-mirror-reality.md` names this
exactly: a fixture that is convenient (the host checkout) instead of the shape a real caller
produces (a fresh clone, which has no `node_modules`). The suite's own header says it is
"offline" and "simulates a second machine"; this one assertion is neither.

There is also no assertion for the empty shape — doctor run beside a runner directory with **no**
`node_modules` — which is the case a fresh machine actually hits.

## Oracle

This spec is the contract. The suite must pass from a fresh git-archive copy at any path with no
`bun install` ever run there (that is "how a real user invokes the thing"), and from the
canonical checkout. An assertion that reads the host checkout's install state, mutates the host
checkout, or needs the network to pass is a bug. `doctor.sh`'s behaviour is not under test for
change here; a test that needs a new knob in `doctor.sh` is a bug.

## The change — `plugins/tribe/scripts/tests/test-fresh-machine.sh` only

### C1 — a helper that builds a doctor fixture by copy

Add a helper `doctor_fixture DIR provisioned|unprovisioned` that creates `DIR/`, copies (`cp`,
never a symlink — `cp` keeps the fixture self-contained and independent of the checkout;
`doctor.sh` resolves `HERE` from its own path with `pwd -P`, and a symlink would leave the
fixture's identity tied to the real file. Wording corrected at the campaign's closing pass, ruling R6)
`$DOCTOR` to `DIR/doctor.sh`, creates `DIR/runner/`, and for
`provisioned` also creates `DIR/runner/node_modules/` (an empty directory satisfies
`doctor.sh:80`'s `[ -d "$RUNNER/node_modules" ]`; doctor inspects nothing inside it). No network,
no writes outside `$TMP`.

### C2 — the existing assertion reads the built fixture

Lines 180-184: run `bash "$TMP/doctor-provisioned/doctor.sh"` (from `$FOREIGN`, as today) instead
of `$DOCTOR`; the assertion keeps its expectation `0` and is renamed
`doctor passes on a fully-provisioned fixture`. bun, gh and a Claude Code login on this machine
remain the suite's pre-existing precondition (card D3) — the same three prerequisites the
surrounding assertions already exercise.

### C3 — the empty-fixture assertion (additive)

Immediately after C2: run `bash "$TMP/doctor-unprovisioned/doctor.sh"` from `$FOREIGN`; assert
rc `1` (`doctor exits non-zero when runner dependencies are absent`) and that its output contains
`runner dependencies` and `bun install` (two `contains` checks, one assertion line each — or fold
them per the file's existing style; the tally rises by the number of new `ok` lines, expected
`26` → `28`, and the plan records the exact final number the Hunter measures).

## Scope fence

**IN:** `plugins/tribe/scripts/tests/test-fresh-machine.sh`, this spec, its plan.
**OUT and untouched:** `plugins/tribe/scripts/doctor.sh` (zero lines);
`plugins/tribe/skills/orchestrate-campaign/resolve-runner.sh`; every other suite; `runner/`,
`viewer/`; `.c3/` (`c3-215-tribe.md` row 74 describes doctor's behaviour, which does not change;
`adr-20260717-harden-fresh-machine-resolution.md` is a historical record and stays as is); every
file the live `feat/i74-mechanical-heartbeat` branch touches.

## Pure core, impure edges

Test harness — edge code. The fixture builder is the one new piece and it is a pure function of
its two arguments plus `$TMP`.

## Testing strategy

- RED: the suite, unchanged, run from a git-archive copy with no `bun install`:
  `25 passed, 1 failed`, the failing line quoted above. This RED is captured from the copy, never
  by uninstalling anything in a real checkout.
- GREEN: the suite on the branch, from the same copy: all assertions pass, `0 failed`, and from
  the canonical checkout: same tally.
- Empty shape: C3's assertion is RED if C3 is pointed at the provisioned fixture by mistake (rc 0)
  — the Hunter shows both outputs once to prove the two fixtures differ.

## Evidence plan

PR body carries: the RED transcript from the archive copy; the GREEN tally from the archive copy
and from the canonical checkout; the `test-*.sh` before/after table; `git diff --stat` showing
`doctor.sh` untouched.

## Risks and rollback

If bun, gh or the Claude login is absent on the machine, the provisioned-fixture assertion still
fails — as it did before; that precondition is unchanged and documented in the suite header.
Rollback is one commit.

## Adjudication rule (for the auditors)

REFUTED in advance: a finding that the fixture "does not really install dependencies" — doctor
checks directory presence only, and installing would need the network the suite forbids; a
finding that `doctor.sh` should gain an override for testability — rejected by card decision D1;
a finding about the handoff's "path sensitivity" wording — superseded by the reproduction above.
