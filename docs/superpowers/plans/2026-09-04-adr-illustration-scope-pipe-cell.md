# Plan — reword the ADR cell `c3x repair` drops

**Card:** `adr-illustration-scope-pipe-cell` · **Spec:** `docs/superpowers/specs/2026-09-04-adr-illustration-scope-pipe-cell-design.md`
**Branch:** `docs/adr-illustration-scope-pipe-cell` · **Base:** latest `origin/master` · **Worktree:** `/Users/hip/repo/todd-skills-wt/adr-illustration-scope-pipe-cell`

One task, one commit.

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **Purity:** core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see `~/.claude/rules/pure-core.md`).
- **Worktree-first:** work in `/Users/hip/repo/todd-skills-wt/adr-illustration-scope-pipe-cell` on branch `docs/adr-illustration-scope-pipe-cell`, created from
  the latest `origin/master` at dispatch time. Never work in `/Users/hip/repo/todd-skills` itself.
- **Commit rules:** each task ends in exactly ONE commit (an audit fix round adds its own single
  commit). Tick this plan's checkboxes for the task in the SAME commit as the code. The commit
  message's final paragraph carries, one per line: `Tribe-Card: adr-illustration-scope-pipe-cell`, `Tribe-Task: N/1`,
  `Campaign: followups-2026-09-04`. **Never add a `Co-Authored-By` trailer of any kind** —
  `pre-gate.sh` blocks on it. Push after every commit.
- **Toolchain:** the system `bash` 3.2.57 is the bash that must parse and run every shell file
  (verify with `bash -n`); C3 commands run only as `bunx @c3x/cli@11.6.3 <op>`; never stage
  `c3.db`, `c3.db-shm` or `c3.db-wal`. Every command stays under 600 s; nothing is backgrounded.
- **Do not touch** `plugins/tribe/scripts/runner/`, `plugins/tribe/scripts/viewer/`, or any
  file the live `feat/i74-mechanical-heartbeat` branch changes (`plugins/tribe/README.md`,
  `plugins/tribe/skills/orchestrate-campaign/SKILL.md`, `plugins/tribe/scripts/tests/test-watchdog-*.sh`,
  `.c3/c3-2-plugins/c3-215-tribe.md`, `.c3/adr/adr-20260904-mechanical-heartbeat-supersedes-p14.md`).
- **Only `.c3/adr/adr-20260821-explaining-illustration-scope.md` changes**, by exactly two lines: the
  reworded cell and the `c3-seal` line that `c3x repair` regenerates. The seal is never hand-edited.
- **Every `repair` experiment runs on a throwaway `git archive` copy**; `repair` runs in the card
  worktree exactly once, in Step 3, to produce the seal that gets committed.
- **Delivery chain (Warchief):** pre-gate over `origin/master..HEAD` green → tracker → two
  independent skinners (contract lens + cold lens, dispatched concurrently) → scout survey →
  before/after evidence per the spec's Evidence plan in the PR body → `gh pr merge <n> --merge`
  (regular merge only) → local master fast-forwarded → worktree removed → `SHIPPED`. A What/Why
  question is `NEEDS_DIRECTION` to the Shaman, never a guess.
- Hunters report to the Warchief at the report-file path given in their dispatch; they do not open
  PRs, merge, or dispatch agents.

---

### Task 1: reword the cell and reseal

**Contract:** spec sections "C1", "C2". **File:** `.c3/adr/adr-20260821-explaining-illustration-scope.md`.

- [ ] **Step 1: RED on a throwaway copy of the base**

```bash
cd /Users/hip/repo/todd-skills-wt/adr-illustration-scope-pipe-cell
F=.c3/adr/adr-20260821-explaining-illustration-scope.md
rm -rf /tmp/adr-before && mkdir -p /tmp/adr-before && git archive HEAD | tar -x -C /tmp/adr-before
(cd /tmp/adr-before && grep -c "This unit's three patches are the review" $F && awk -F'|' 'NR==87{print NF}' $F \
  && bunx @c3x/cli@11.6.3 repair; echo "repair rc=$?"; grep -c "This unit's three patches are the review" $F)
```

Expected: `1`, `8`, repair rc 0 with "all clear", then `0` — the cell is gone. Paste it.

- [ ] **Step 2: Reword**

On line 87 of `$F` replace the substring `a raw | inside` with `a raw pipe character inside`
(one occurrence). Verify: `awk -F'|' 'NR==87{print NF}' $F` → `7`;
`grep -c 'raw pipe character' $F` → `1`; `git diff --stat` → one file, one line.

- [ ] **Step 3: Reseal in the worktree, once**

```bash
bunx @c3x/cli@11.6.3 repair; echo "rc=$?"
git status --porcelain
git diff | grep '^[-+]' | grep -v '^[-+][-+]'
```

Expected: rc 0; porcelain lists only `$F` (no `c3.db*`, nothing else — if anything else is listed,
stop and report `NEEDS_DIRECTION` with the list); the diff shows four changed lines total: the old
and new cell line, the old and new `c3-seal`. Then `grep -c "This unit's three patches are the review" $F` → `1`.

- [ ] **Step 4: GREEN on a throwaway copy of the branch (idempotent round-trip)**

```bash
rm -rf /tmp/adr-after && mkdir -p /tmp/adr-after && git archive HEAD | tar -x -C /tmp/adr-after
cp $F /tmp/adr-after/$F
(cd /tmp/adr-after && git init -q . && git add -A && git -c user.name=t -c user.email=t@t.com commit -qm base \
  && bunx @c3x/cli@11.6.3 repair >/dev/null; bunx @c3x/cli@11.6.3 repair >/dev/null; echo "rc=$?"; git status --porcelain -- .c3; \
  grep -c "This unit's three patches are the review" $F; bunx @c3x/cli@11.6.3 check; echo "check rc=$?")
```

Expected: rc 0, empty porcelain under `.c3` after the second repair, `1`, check "all clear" rc 0.

- [ ] **Step 5: Commit**

Stage only `$F` and this plan. Subject
`docs(c3): reword the illustration-scope ADR cell so c3x repair round-trips it`,
`Tribe-Task: 1/1`, plan checkboxes ticked.

## Definition of done for this plan

- [ ] Task committed and pushed; pre-gate green over `origin/master..HEAD` (all suites unchanged).
- [ ] Evidence per spec "Evidence plan" in the PR body (Step 1 RED transcript, Step 4 GREEN transcript, `git diff --stat`).
- [ ] Two independent skinner audits PASS, tracker + scout recorded, PR merged with a regular merge,
      master fast-forwarded, worktree removed, `SHIPPED` returned.
