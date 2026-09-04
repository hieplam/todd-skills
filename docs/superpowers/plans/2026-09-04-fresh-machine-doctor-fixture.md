# Plan — `test-fresh-machine.sh` builds its own doctor fixtures

**Card:** `fresh-machine-doctor-fixture` · **Spec:** `docs/superpowers/specs/2026-09-04-fresh-machine-doctor-fixture-design.md`
**Branch:** `fix/fresh-machine-doctor-fixture` · **Base:** latest `origin/master` · **Worktree:** `/Users/hip/repo/todd-skills-wt/fresh-machine-doctor-fixture`

One task, one commit. The RED is captured from a git-archive copy, never by touching a real checkout's dependencies.

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **Purity:** core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see `~/.claude/rules/pure-core.md`).
- **Worktree-first:** work in `/Users/hip/repo/todd-skills-wt/fresh-machine-doctor-fixture` on branch `fix/fresh-machine-doctor-fixture`, created from
  the latest `origin/master` at dispatch time. Never work in `/Users/hip/repo/todd-skills` itself.
- **Commit rules:** each task ends in exactly ONE commit (an audit fix round adds its own single
  commit). Tick this plan's checkboxes for the task in the SAME commit as the code. The commit
  message's final paragraph carries, one per line: `Tribe-Card: fresh-machine-doctor-fixture`, `Tribe-Task: N/1`,
  `Campaign: followups-2026-09-04`. **Never add a `Co-Authored-By` trailer of any kind** —
  `pre-gate.sh` blocks on it. Push after every commit.
- **Toolchain:** the system `bash` 3.2.57 is the bash that must parse and run every shell file
  (verify with `bash -n`); C3 commands run only as `bunx @c3x/cli@11.6.3 <op>`; never stage
  `c3.db`, `c3.db-shm` or `c3.db-wal`. Every command stays under 600 s; nothing is backgrounded.
- **Do not touch** `plugins/tribe/scripts/runner/`, `plugins/tribe/scripts/viewer/`, or any
  file the live `feat/i74-mechanical-heartbeat` branch changes (`plugins/tribe/README.md`,
  `plugins/tribe/skills/orchestrate-campaign/SKILL.md`, `plugins/tribe/scripts/tests/test-watchdog-*.sh`,
  `.c3/c3-2-plugins/c3-215-tribe.md`, `.c3/adr/adr-20260904-mechanical-heartbeat-supersedes-p14.md`).
- **`doctor.sh` is NOT edited. Zero lines.** Only `plugins/tribe/scripts/tests/test-fresh-machine.sh` changes.
- **Never run `bun install`, `rm -rf node_modules`, or any network command** as part of this task; the
  RED comes from an archive copy that simply has no `node_modules`.
- **Delivery chain (Warchief):** pre-gate over `origin/master..HEAD` green → tracker → two
  independent skinners (contract lens + cold lens, dispatched concurrently) → scout survey →
  before/after evidence per the spec's Evidence plan in the PR body → `gh pr merge <n> --merge`
  (regular merge only) → local master fast-forwarded → worktree removed → `SHIPPED`. A What/Why
  question is `NEEDS_DIRECTION` to the Shaman, never a guess.
- Hunters report to the Warchief at the report-file path given in their dispatch; they do not open
  PRs, merge, or dispatch agents.

---

### Task 1: doctor fixtures by copy

**Contract:** spec sections "C1", "C2", "C3". **File:** `plugins/tribe/scripts/tests/test-fresh-machine.sh`.

- [ ] **Step 1: Reproduce the RED from an archive copy**

```bash
cd /Users/hip/repo/todd-skills-wt/fresh-machine-doctor-fixture
rm -rf /tmp/fm-copy && mkdir -p /tmp/fm-copy && git archive HEAD | tar -x -C /tmp/fm-copy
(cd /tmp/fm-copy && bash plugins/tribe/scripts/tests/test-fresh-machine.sh 2>&1 | grep -v '^ok')
```

Expected: `not ok - doctor passes on a fully-provisioned machine (got: 1, want: 0)` and
`25 passed, 1 failed`. Also run the suite in the worktree itself and record its tally (`26 passed,
0 failed` if the worktree's runner deps are installed, otherwise the same 25/1).

- [ ] **Step 2: Add the fixture builder (spec C1)**

Next to the existing `fresh_home` helper add:

```bash
# doctor_fixture — a throwaway scripts/ tree for doctor.sh: $1 is the dir, $2 is
# "provisioned" (runner/node_modules/ present) or "unprovisioned" (absent). doctor.sh is COPIED,
# not symlinked, because it resolves its own directory with `pwd -P`; a symlink would point it
# back at this checkout and the fixture would silently become the host's install state again.
doctor_fixture() { # doctor_fixture DIR provisioned|unprovisioned
  mkdir -p "$1/runner"
  cp "$DOCTOR" "$1/doctor.sh"
  [[ "$2" == provisioned ]] && mkdir -p "$1/runner/node_modules"
  return 0
}
```

- [ ] **Step 3: Point the existing assertion at the built fixture (spec C2)**

Replace the block at "On this machine, with a full PATH, the doctor should pass." so it builds
`"$TMP/doctor-provisioned"` with `doctor_fixture "$TMP/doctor-provisioned" provisioned` and runs
`bash "$TMP/doctor-provisioned/doctor.sh"` from `$FOREIGN`; keep `set +e`/`set -e` around the
capture as the file does today; the assertion becomes
`check "doctor passes on a fully-provisioned fixture" "$drc" "0"`.

- [ ] **Step 4: Add the empty-fixture assertion (spec C3)**

Immediately after Step 3's block: build `"$TMP/doctor-unprovisioned"` with `unprovisioned`, run its
`doctor.sh` the same way, then:

```bash
  check "doctor exits non-zero when runner dependencies are absent" "$drc" "1"
  contains "doctor names runner dependencies as the gap" "$dout" "runner dependencies"
  contains "doctor says how to install them" "$dout" "bun install"
```

- [ ] **Step 5: GREEN from the archive copy and from the worktree**

```bash
bash -n plugins/tribe/scripts/tests/test-fresh-machine.sh; echo "parse rc=$?"
rm -rf /tmp/fm-copy && mkdir -p /tmp/fm-copy && git archive HEAD | tar -x -C /tmp/fm-copy
cp plugins/tribe/scripts/tests/test-fresh-machine.sh /tmp/fm-copy/plugins/tribe/scripts/tests/
(cd /tmp/fm-copy && bash plugins/tribe/scripts/tests/test-fresh-machine.sh 2>&1 | tail -1)
bash plugins/tribe/scripts/tests/test-fresh-machine.sh 2>&1 | tail -1
git diff --stat
```

Expected: `parse rc=0`; both tallies `29 passed, 0 failed` (26 existing, one of them renamed, plus
3 new; record the actual number if the arithmetic differs and explain why); `git diff --stat`
names only the test file.

- [ ] **Step 6: Commit**

Subject `test(tribe): fresh-machine suite builds its own doctor fixtures instead of borrowing the checkout's install state`,
`Tribe-Task: 1/1`, plan checkboxes ticked in the same commit.

## Definition of done for this plan

- [ ] Task committed and pushed; pre-gate green over `origin/master..HEAD`; `doctor.sh` untouched.
- [ ] Evidence per spec "Evidence plan" in the PR body (archive-copy RED transcript; GREEN from the
      copy and the worktree; full suite table; `git diff --stat`).
- [ ] Two independent skinner audits PASS, tracker + scout recorded, PR merged with a regular merge,
      master fast-forwarded, worktree removed, `SHIPPED` returned.
