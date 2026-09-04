# Spec — `test-review-cell-v3.sh` under bash strict mode, with a bounded pass-range walk

**Card:** `review-cell-v3-strict-mode` · **Campaign:** `followups-2026-09-04` · **Shaman spec, 2026-09-04** · base: latest `origin/master` after `pregate-host-config-isolation` merges
**Card file:** `~/.tribe/-Users-hip-repo-todd-skills/campaigns/followups-2026-09-04/cards/review-cell-v3-strict-mode.md`

## Problem, grounded

Two defects in one file, both found by PR #114's Scout survey.

### R1 — the sole strict-mode violator in the repo

`.c3/rules/rule-bash-strict-mode.md`, Rule, verbatim:

> All shell scripts start with `#!/usr/bin/env bash` followed by `set -euo pipefail`.

`plugins/tribe/scripts/tests/test-review-cell-v3.sh:8` reads `set -u`. Grounded 2026-09-04 on
`a9a6e7b`: `grep -L 'set -euo pipefail'` over every tracked `.sh` under `plugins/` returns exactly
this file. Under `set -u` alone a failing command mid-suite continues silently, which is the
"bogus verdict" the rule's Goal names.

### R2 — the pass-range walk forks a git process per commit

`test-review-cell-v3.sh:201-207` (added by PR #114 so the pass case audits a computed, not
hardcoded, range):

```bash
for _sha in $(git -C "$HERE/../../../.." rev-list --no-merges -n 200 HEAD); do
  _tr="$(git -C "$HERE/../../../.." log -1 --format='%(trailers)' "$_sha")"
  printf '%s' "$_tr" | grep -q 'Tribe-Card:' || continue
  printf '%s' "$_tr" | grep -qi 'co-authored-by' && continue
  git -C "$HERE/../../../.." rev-parse -q --verify "$_sha^" >/dev/null || continue
  PASSRANGE="$_sha^..$_sha"; break
done
```

Two to three `git` processes per candidate, up to 200 candidates. On this repo the newest
non-merge commit usually qualifies, so the walk is short today; on a history where the newest
commits lack the trailer it is hundreds of forks to pick one sha.

## Oracle

This spec is the contract. For R1: the suite must carry `set -euo pipefail` and still exit 0 with
a tally equal to the branch base's tally (same passed count, zero failed) — a suite that "passes"
by disabling strict mode around a block, or by `|| true` on an assertion, is a bug. For R2: the
new walk must select the same commit as the old one under the same predicate (newest, non-merge,
has a `Tribe-Card:` trailer, has no `co-authored-by` trailer, has a parent) while issuing a
bounded number of git invocations; a walk that changes the predicate is a bug even if faster.

## The change

### C1 — strict mode (`set -u` → `set -euo pipefail`)

Line 8 becomes `set -euo pipefail`. Then every site where a command is *expected* to fail and its
status is read afterwards is restructured so `set -e` does not abort the script. Grounded on
`a9a6e7b`, the sites reading `$?` are lines 231, 249, 256, 278, 304 (self-tests 2, 3, F1, F2,
F3); the Hunter re-derives the list on the branch with `grep -n '\$?'` and also audits every
non-conditional command that can legitimately fail (a `grep -q` used for its side effect, a
`$GATE` run outside an `if`). Idiom (card D2): `rc=0; cmd || rc=$?` then test `rc`; or move the
command into an `if`/`&&` condition. Never `set +e`/`set -e` toggles, never `|| true` on an
assertion. With `pipefail`, a pipeline used as a condition (`echo "$OUT" | grep -q`) is fine; a
pipeline in a plain statement whose left side may fail must become a condition or use the same
`rc` idiom.

### C2 — bounded pass-range walk

Replace lines 201-207 with a walk that issues a bounded number of git invocations regardless of
history length, applying the identical predicate. Design (the Hunter may refine the flags, not
the predicate):

1. `git log --no-merges -n 200 --format='%H %P' --grep='^Tribe-Card:'` — one call: candidate
   shas with parent lists, newest first, restricted to messages containing a `Tribe-Card:` line.
2. `git log --no-merges -n 200 --format='%H' -i --grep='co-authored-by'` — one call: shas to
   exclude.
3. Iterate the candidates in order; skip any with an empty parent list or present in the exclude
   set; for the first survivor, confirm the exact original predicate with a single
   `git log -1 --format='%(trailers)'` (the `--grep` calls match the raw message, `%(trailers)` the
   parsed trailer block; the confirmation keeps the semantics byte-for-byte). On confirmation set
   `PASSRANGE="$sha^..$sha"` and stop; on a miss continue (cap the confirmations at 20).

The block stays one named region whose only output is `PASSRANGE` (pure-core: the git lookups are
the edge; the rest of the suite consumes a string). Bash 3.2.57 is the bash that must run it —
no associative arrays, no `mapfile`.

## Scope fence

**IN:** `plugins/tribe/scripts/tests/test-review-cell-v3.sh`, this spec, its plan.
**OUT and untouched:** `plugins/tribe/scripts/pre-gate.sh` (zero lines); every other suite;
`runner/`, `viewer/`, `.c3/`; every file the live `feat/i74-mechanical-heartbeat` branch touches.

## Pure core, impure edges

The suite is edge code. The one purity-relevant rule: the walk stays a single block whose only
output is the range string; no assertion logic moves into git commands.

## Testing strategy

The deliverable is a test suite, so RED/GREEN is observed on the suite itself and on measurements:

- C1 RED: with line 8 changed and nothing else, the suite aborts (exit non-zero, tally missing or
  short) at the first failure-expected command. GREEN: full tally, `51 passed, 0 failed`, exit 0.
- C2 measurement: run the suite with a counting `git` shim first on `PATH` (a script that
  appends one line to a counter file and then execs the real git) and count the lines produced
  while the walk block runs (delimit with a marker before and after the block, or count the
  whole suite's git calls before/after — both numbers in the PR). Before: the walk's count is at
  least 2 per candidate visited; after: at most 3 + the confirmations, and independent of `-n 200`.
- C2 equivalence: print the old walk's `PASSRANGE` and the new walk's `PASSRANGE` on the same
  commit; they are identical. Also run the suite on a throwaway repo shaped so the two newest
  non-merge commits fail the predicate (one missing the trailer, one carrying `Co-Authored-By`)
  and the third qualifies: the new walk selects the third.

## Evidence plan

Pasted into the PR body by the Warchief: the before/after suite tally; the git-invocation counts
before/after; the two `PASSRANGE` values; the throwaway-repo selection transcript; the full
`test-*.sh` before/after table.

## Risks and rollback

`set -e` interacts with `$( )` capture in assignments and with `&&`/`||` chains in ways bash 3.2
handles slightly differently from bash 5; the plan pins verification to the system bash. Rollback
is per commit (two commits, C1 then C2).

## Adjudication rule (for the auditors)

REFUTED in advance: a finding that the tally "should" be 50 — the base after
`pregate-host-config-isolation` is 51; a finding that the `--grep` candidate filter differs from
`%(trailers)` — the confirmation step restores exact semantics by design; a finding against
`pre-gate.sh` itself — out of fence.
