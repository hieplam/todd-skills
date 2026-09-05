# Spec — `pre-gate.sh` must not let the host's git config decide the gate's verdict

**Card:** `pregate-host-config-isolation` · **Campaign:** `followups-2026-09-04` · **Shaman spec, 2026-09-04** · base: latest `origin/master` (≥ `a9a6e7b`)
**Card file:** `~/.tribe/-Users-hip-repo-todd-skills/campaigns/followups-2026-09-04/cards/pregate-host-config-isolation.md`
**Owner sign-off:** given 2026-09-04. This card changes what the audit gate blocks on (a host git setting can no longer red the trailer check); no further change to the gate's blocking behaviour is in scope.

## Problem, grounded

`plugins/tribe/scripts/pre-gate.sh` is the mechanical gate every audit round runs before any
Skinner is dispatched (`plugins/tribe/agents/warchief.md`, step 6.0). Its trailer check at
`pre-gate.sh:70` is

```bash
body="$(git -C "$REPO" log -1 --format='%(trailers)' "$sha")"
```

and lines 34 and 80 (`git rev-list`) and 119 (`git diff --name-only`) also shell out to git.
None of them neutralises the machine's global or system git config, so `%(trailers)` renders
according to whatever `~/.gitconfig` says. Reproduced 2026-09-04 on `a9a6e7b`:

```
$ printf '[trailer]\n\tseparators = "#"\n' > hostile.gitconfig
$ git log -1 --format='%(trailers)' 6f82d6e
Tribe-Card: repair-inherited-c3-drift
Tribe-Milestone: audit-corrections
$ GIT_CONFIG_GLOBAL=hostile.gitconfig git log -1 --format='%(trailers)' 6f82d6e
                                          # empty
```

PR #114's Scout ran the whole gate under that config over a trailer-clean 1-commit range:
`exit 1`, `"trailers":"fail"`, `"verdict":"fail"`. Every commit is recorded as a trailer
violation, and step 6.0 reads that as "unfinished work, not an audit round" — the review cell
blocks on a host setting. `test-review-cell-v3.sh` cannot catch this because, since PR #114
(Task 2b), it exports `GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null` for its own
children — the suite is green while the production path is red.

## Governing documents, quoted

`plugins/tribe/rules/fail-closed-edges.md`, obligation 2, verbatim:

> **Isolate every subprocess the tool spawns.** A tool that shells out to `git` must neutralise
> the host's configuration — `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` set to `os.devnull` —
> so an unusual-but-legal host setting (`commit.gpgsign=true` with no usable key, a global
> hooks path, a template dir) cannot change the tool's behaviour or a test's verdict.

`docs/tribe/planning/idea-11-review-cell-v3/spec.md`, Delta-C, verbatim (the contract the
trailer check implements — unchanged by this card):

> checks every commit in the range carries a `Tribe-Card:` trailer and no `Co-Authored-By`
> trailer

## Oracle

The spec in this document is the contract. The trailer check's *predicate* (Delta-C above) does
not change. What changes is the environment the predicate is evaluated in: after this card, the
verdict is a function of the repo's commits alone, never of the host's global or system git
config. Under-isolation (a host setting still able to change any check's verdict) is a bug.
A sibling suite turning red only because it depended on host config is that suite's defect,
handled per D2 below, not a reason to weaken the isolation.

## The change

### C1 — `plugins/tribe/scripts/pre-gate.sh`: isolate host git config process-wide

Insert, immediately after line 9 (`set -euo pipefail`) and before any command that runs git:

```bash
# fail-closed-edges obligation 2: this gate's verdict must be a function of the repo's commits,
# never of the machine's global/system git config (a legal `[trailer] separators = "#"` empties
# %(trailers) for every commit and turns a clean range into all-violations). Exported once, so
# every git subprocess below AND every test-*.sh suite swept by this gate inherit the isolation.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
```

Nothing else in the file changes. Decision D1 (card): isolation is process-wide and inherited
by the swept suites, so the whole gate — suites included — becomes host-config-independent.
Decision D3: the repository's own `.git/config` is not neutralised; it is the repo's business.

### C2 — `plugins/tribe/scripts/tests/test-review-cell-v3.sh`: one additive regression assertion

Inside the `if [ "${PREGATE_INNER:-0}" != "1" ]; then` block, after self-test 1 (the pass case,
which computes `PASSRANGE`) and before self-test 2, add **Self-test 6 (host-config isolation)**:

- write `$TMPD/hostile.gitconfig` containing `[trailer]` / `separators = "#"`;
- create a stub tests dir `$TMPD/stub-tests/` holding one executable `test-stub.sh` that prints
  `1 passed, 0 failed` and exits 0 (so this self-test does not re-sweep the real suites);
- run `GIT_CONFIG_GLOBAL="$TMPD/hostile.gitconfig" PREGATE_INNER=1 "$GATE" --repo <repo>
  --range "$PASSRANGE" --tests-dir "$TMPD/stub-tests" --report "$TMPD/hostile.md"`, capturing
  stdout; the per-command `GIT_CONFIG_GLOBAL=` overrides the suite's own `/dev/null` export for
  that one child, which is the point: the gate must isolate itself regardless of its caller;
- assert the JSON contains `"trailers":"pass"` (tally line
  `ok: c6: gate isolates itself from a hostile global git config`, or the `FAIL:` twin).

This assertion is RED on the unfixed `pre-gate.sh` (`"trailers":"fail"`) and GREEN after C1.
No existing assertion's expectation changes; the suite's tally rises by exactly one
(`50 passed, 0 failed` → `51 passed, 0 failed` when run without `PREGATE_INNER`).

### D2 — sibling suites that red only under isolation

When the gate sweeps the suites with the isolation exported, a suite whose own `git commit` relied
on the host's `user.name`/`user.email` fails with git's "Please tell me who you are". That suite
depended on host config, which is its defect: add `-c user.name=t -c user.email=t@t.com` to that
suite's own commit call(s) in this card, change no assertion, and name the suite in the PR body.
Anything larger than that idiom is `NEEDS_DIRECTION`. Expected: none (the sweep on `a9a6e7b` was
run under `PREGATE_INNER=1` with every suite green, and the suites that commit already pass
`-c user.*`), but the Warchief verifies by running the gate, not by reading.

## Scope fence

**IN:** `plugins/tribe/scripts/pre-gate.sh` (C1 only), `plugins/tribe/scripts/tests/test-review-cell-v3.sh`
(C2 only), this spec, its plan, and under D2 only a sibling suite's own `git commit` flags.
**OUT and untouched:** any other line of `pre-gate.sh`; the gate's predicates, exit codes, report
format or JSON shape; `runner/`, `viewer/`, `.c3/` (`c3-215-tribe.md` does not name `pre-gate.sh`,
so no contract row's claim changes and no change-unit is needed); every file the live
`feat/i74-mechanical-heartbeat` branch touches (`plugins/tribe/README.md`,
`plugins/tribe/scripts/runner/**`, `plugins/tribe/skills/orchestrate-campaign/SKILL.md`,
`plugins/tribe/scripts/tests/test-watchdog-*.sh`, `.c3/c3-2-plugins/c3-215-tribe.md`).

## Pure core, impure edges

`pre-gate.sh` is an impure edge by construction (it runs suites and reads git). C1 is the
edge doing its one job — fail closed against hostile input — and moves no decision anywhere.

## Testing strategy

TDD over a shell script: the failing test is C2's assertion against the unfixed gate.

- RED: with only C2 applied, `bash plugins/tribe/scripts/tests/test-review-cell-v3.sh` prints
  `FAIL: c6: gate isolates itself from a hostile global git config` and `50 passed, 1 failed`.
- GREEN: with C1 applied, `51 passed, 0 failed`.
- Gate-level: `GIT_CONFIG_GLOBAL=<hostile> bash plugins/tribe/scripts/pre-gate.sh --repo . --range
  <PASSRANGE> --tests-dir <stub> --report <tmp>` prints `"trailers":"fail"` before and
  `"trailers":"pass"` after; the same command with no `GIT_CONFIG_GLOBAL` prints
  `"trailers":"pass"` both before and after (G2: clean-environment verdict unchanged).
- Whole directory: every `plugins/tribe/scripts/tests/test-*.sh` exits 0 on the branch.

## Evidence plan

No CI workflows exist (`.github/` is absent; GitGuardian is the only PR check). The Warchief
captures, and pastes into the PR body:

1. The gate's JSON line under the hostile config, before (`"trailers":"fail"`) and after
   (`"trailers":"pass"`), over the same trailer-clean 1-commit range, plus the clean-environment
   line for both.
2. The suite tally before (`50 passed, 0 failed`), RED with C2 alone (`50 passed, 1 failed`),
   and after (`51 passed, 0 failed`).
3. The before/after table of every `test-*.sh` (suite → exit → tally); any D2 fix named.

## Risks and rollback

`GIT_CONFIG_GLOBAL=/dev/null` also hides the host's `credential.helper`, `safe.directory`,
`core.hooksPath` and `commit.gpgsign` from every git the gate spawns. The gate only reads
(`rev-list`, `log`, `diff`), and the suites it sweeps commit only into throwaway repos with
explicit `-c user.*`, so none of those settings is needed; hiding them is the desired effect.
Rollback is reverting the single exported line.

## Adjudication rule (for the auditors)

REFUTED in advance: a finding that the gate "changed behaviour" because a host-config-dependent
verdict changed — that is the goal (owner-signed); a finding that C2 "re-sweeps the suites" — it
uses the stub tests dir by design; a finding about the pre-existing `set -u` at
`test-review-cell-v3.sh:8` — owned by card `review-cell-v3-strict-mode`, next in sequence.
