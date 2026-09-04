# Plan — `pre-gate.sh` isolates host git config

**Card:** `pregate-host-config-isolation` · **Spec:** `docs/superpowers/specs/2026-09-04-pregate-host-config-isolation-design.md`
**Branch:** `fix/pregate-host-config-isolation` · **Base:** latest `origin/master` · **Worktree:** `/Users/hip/repo/todd-skills-wt/pregate-host-config-isolation`

Two tasks, one commit each, sequential: Task 1 lands the failing assertion (RED), Task 2 lands the
one-line isolation (GREEN). Both files are in `plugins/tribe/scripts/`.

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **Purity:** core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see `~/.claude/rules/pure-core.md`).
- **Worktree-first:** work in `/Users/hip/repo/todd-skills-wt/pregate-host-config-isolation` on branch `fix/pregate-host-config-isolation`, created from
  the latest `origin/master` at dispatch time. Never work in `/Users/hip/repo/todd-skills` itself.
- **Commit rules:** each task ends in exactly ONE commit (an audit fix round adds its own single
  commit). Tick this plan's checkboxes for the task in the SAME commit as the code. The commit
  message's final paragraph carries, one per line: `Tribe-Card: pregate-host-config-isolation`, `Tribe-Task: N/2`,
  `Campaign: followups-2026-09-04`. **Never add a `Co-Authored-By` trailer of any kind** —
  `pre-gate.sh` blocks on it. Push after every commit.
- **Toolchain:** the system `bash` 3.2.57 is the bash that must parse and run every shell file
  (verify with `bash -n`); C3 commands run only as `bunx @c3x/cli@11.6.3 <op>`; never stage
  `c3.db`, `c3.db-shm` or `c3.db-wal`. Every command stays under 600 s; nothing is backgrounded.
- **Do not touch** `plugins/tribe/scripts/runner/`, `plugins/tribe/scripts/viewer/`, or any
  file the live `feat/i74-mechanical-heartbeat` branch changes (`plugins/tribe/README.md`,
  `plugins/tribe/skills/orchestrate-campaign/SKILL.md`, `plugins/tribe/scripts/tests/test-watchdog-*.sh`,
  `.c3/c3-2-plugins/c3-215-tribe.md`, `.c3/adr/adr-20260904-mechanical-heartbeat-supersedes-p14.md`).
- **`pre-gate.sh` changes by exactly the five lines spec C1 quotes** (four comment lines and one
  `export`), inserted right after `set -euo pipefail`. No other line of that file changes.
- **No existing assertion's expectation changes** in `test-review-cell-v3.sh`; its `set -u` line stays
  as it is (card `review-cell-v3-strict-mode` owns it).
- **Delivery chain (Warchief):** pre-gate over `origin/master..HEAD` green → tracker → two
  independent skinners (contract lens + cold lens, dispatched concurrently) → scout survey →
  before/after evidence per the spec's Evidence plan in the PR body → `gh pr merge <n> --merge`
  (regular merge only) → local master fast-forwarded → worktree removed → `SHIPPED`. A What/Why
  question is `NEEDS_DIRECTION` to the Shaman, never a guess.
- Hunters report to the Warchief at the report-file path given in their dispatch; they do not open
  PRs, merge, or dispatch agents.

---

### Task 1: `test-review-cell-v3.sh` — the hostile-config assertion (RED)

**Contract:** spec section "C2". **File:** `plugins/tribe/scripts/tests/test-review-cell-v3.sh`
(modify: insert one self-test block between self-test 1 and self-test 2, inside the
`PREGATE_INNER != 1` block).

- [x] **Step 1: Record the baseline**

```bash
cd /Users/hip/repo/todd-skills-wt/pregate-host-config-isolation
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh 2>&1 | tail -1
```

Expected: `50 passed, 0 failed`. Paste the line into your report. If the number differs, record
the actual number as the baseline and carry on — the goal is baseline + 1.

- [x] **Step 2: Add self-test 6**

Immediately before the line `# Self-test 2 (red case): a fence that allows nothing must flag every changed file, exit 1.`
insert:

```bash
  # Self-test 6 (host-config isolation): the gate's verdict must not depend on the machine's
  # global git config. A legal `[trailer] separators = "#"` empties %(trailers) for every commit;
  # the gate must neutralise it itself, whatever its caller's environment says. The per-command
  # GIT_CONFIG_GLOBAL below deliberately overrides this suite's own /dev/null export for that one
  # child. A stub tests dir keeps this self-test from re-sweeping the real suites.
  printf '[trailer]\n\tseparators = "#"\n' > "$TMPD/hostile.gitconfig"
  mkdir -p "$TMPD/stub-tests"
  printf '#!/usr/bin/env bash\necho "1 passed, 0 failed"\n' > "$TMPD/stub-tests/test-stub.sh"
  chmod +x "$TMPD/stub-tests/test-stub.sh"
  if [ -x "$GATE" ] && [ -n "$PASSRANGE" ] && HOSTILE_OUT="$(GIT_CONFIG_GLOBAL="$TMPD/hostile.gitconfig" \
        PREGATE_INNER=1 "$GATE" --repo "$HERE/../../../.." --range "$PASSRANGE" \
        --tests-dir "$TMPD/stub-tests" --report "$TMPD/hostile.md" 2>/dev/null)" \
     && echo "$HOSTILE_OUT" | grep -q '"trailers": *"pass"'; then
    echo "ok: c6: gate isolates itself from a hostile global git config"; pass=$((pass+1))
  else
    echo "FAIL: c6: gate isolates itself from a hostile global git config"; fail=$((fail+1))
  fi

```

- [x] **Step 3: Watch it fail (RED)**

```bash
bash -n plugins/tribe/scripts/tests/test-review-cell-v3.sh; echo "parse rc=$?"
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh 2>&1 | grep -E 'c6:|passed, '
```

Expected: `parse rc=0`, then `FAIL: c6: gate isolates itself from a hostile global git config`
and `50 passed, 1 failed`. If `c6` passes here, the gate is already isolated by something else —
stop and report `NEEDS_CONTEXT` with the output.

- [x] **Step 4: Commit**

One commit: the file plus this plan's Task 1 checkboxes ticked. Message subject
`test(tribe): assert pre-gate isolates itself from a hostile global git config`, trailers per
Global Constraints, `Tribe-Task: 1/2`.

---

### Task 2: `pre-gate.sh` — export the isolation (GREEN)

**Contract:** spec section "C1". **File:** `plugins/tribe/scripts/pre-gate.sh` (modify: insert five
lines after line 9).

- [ ] **Step 1: Reproduce at gate level (before)**

```bash
cd /Users/hip/repo/todd-skills-wt/pregate-host-config-isolation
printf '[trailer]\n\tseparators = "#"\n' > /tmp/hostile.gitconfig
mkdir -p /tmp/stub-tests && printf '#!/usr/bin/env bash\necho "1 passed, 0 failed"\n' > /tmp/stub-tests/test-stub.sh && chmod +x /tmp/stub-tests/test-stub.sh
R="$(git log --no-merges -n 1 --format=%H --grep='^Tribe-Card:')"; echo "range=$R^..$R"
GIT_CONFIG_GLOBAL=/tmp/hostile.gitconfig bash plugins/tribe/scripts/pre-gate.sh --repo . --range "$R^..$R" --tests-dir /tmp/stub-tests --report /tmp/before-hostile.md; echo "rc=$?"
bash plugins/tribe/scripts/pre-gate.sh --repo . --range "$R^..$R" --tests-dir /tmp/stub-tests --report /tmp/before-clean.md; echo "rc=$?"
```

Expected: the hostile run prints `"trailers":"fail"` and `rc=1`; the clean run prints
`"trailers":"pass"` and `rc=0`. Paste both JSON lines.

- [ ] **Step 2: Insert the isolation**

After the line `set -euo pipefail` (line 9) and before `LOG() {` insert exactly:

```bash
# fail-closed-edges obligation 2: this gate's verdict must be a function of the repo's commits,
# never of the machine's global/system git config (a legal `[trailer] separators = "#"` empties
# %(trailers) for every commit and turns a clean range into all-violations). Exported once, so
# every git subprocess below AND every test-*.sh suite swept by this gate inherit the isolation.
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
```

- [ ] **Step 3: Watch it pass (GREEN)**

Re-run the two Step 1 gate commands: both now print `"trailers":"pass"`, `rc=0`. Then:

```bash
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh 2>&1 | grep -E 'c6:|passed, '
```

Expected: the `ok: c6:` line and `51 passed, 0 failed`.

- [ ] **Step 4: Sweep every suite under the isolated gate (spec D2)**

```bash
bash plugins/tribe/scripts/pre-gate.sh --repo . --range "origin/master..HEAD" --tests-dir plugins/tribe/scripts/tests --report /tmp/sweep.md; echo "rc=$?"; cat /tmp/sweep.md
```

Expected: every suite `pass`, `"verdict":"pass"`. If a suite is red, run it directly with
`GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null bash <suite>`; if it is green without
those variables and red with them, it depends on host config: add `-c user.name=t -c user.email=t@t.com`
to that suite's own `git commit` call(s) only, re-run, and name the suite in your report. Any
other cause: stop, report `NEEDS_CONTEXT` with the suite's output.

- [ ] **Step 5: Commit**

One commit: `pre-gate.sh` (plus any D2 suite edit) and this plan's Task 2 checkboxes. Subject
`fix(tribe): pre-gate isolates itself from host git config (fail-closed-edges obl. 2)`,
`Tribe-Task: 2/2`.

## Definition of done for this plan

- [ ] Both tasks committed and pushed; pre-gate green over `origin/master..HEAD`.
- [ ] Evidence per spec "Evidence plan" pasted in the PR body (hostile/clean JSON before and after;
      tallies 50 → 50/1 RED → 51; full suite table).
- [ ] Two independent skinner audits PASS, tracker + scout recorded, PR merged with a regular merge,
      master fast-forwarded, worktree removed, `SHIPPED` returned.
