# Plan — flip shipped ADRs from `proposed` to `accepted`

**Card:** `adr-status-flip-shipped` · **Spec:** `docs/superpowers/specs/2026-09-04-adr-status-flip-shipped-design.md`
**Branch:** `docs/adr-status-flip-shipped` · **Base:** latest `origin/master` (after `adr-illustration-scope-pipe-cell` merged) · **Worktree:** `/Users/hip/repo/todd-skills-wt/adr-status-flip-shipped`

Two tasks, one commit each: Task 1 is verification only (a table, no file changes besides this
plan); Task 2 flips what Task 1 proved.

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **Purity:** core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see `~/.claude/rules/pure-core.md`).
- **Worktree-first:** work in `/Users/hip/repo/todd-skills-wt/adr-status-flip-shipped` on branch `docs/adr-status-flip-shipped`, created from
  the latest `origin/master` at dispatch time. Never work in `/Users/hip/repo/todd-skills` itself.
- **Commit rules:** each task ends in exactly ONE commit (an audit fix round adds its own single
  commit). Tick this plan's checkboxes for the task in the SAME commit as the code. The commit
  message's final paragraph carries, one per line: `Tribe-Card: adr-status-flip-shipped`, `Tribe-Task: N/2`,
  `Campaign: followups-2026-09-04`. **Never add a `Co-Authored-By` trailer of any kind** —
  `pre-gate.sh` blocks on it. Push after every commit.
- **Toolchain:** the system `bash` 3.2.57 is the bash that must parse and run every shell file
  (verify with `bash -n`); C3 commands run only as `bunx @c3x/cli@11.6.3 <op>`; never stage
  `c3.db`, `c3.db-shm` or `c3.db-wal`. Every command stays under 600 s; nothing is backgrounded.
- **Do not touch** `plugins/tribe/scripts/runner/`, `plugins/tribe/scripts/viewer/`, or any
  file the live `feat/i74-mechanical-heartbeat` branch changes (`plugins/tribe/README.md`,
  `plugins/tribe/skills/orchestrate-campaign/SKILL.md`, `plugins/tribe/scripts/tests/test-watchdog-*.sh`,
  `.c3/c3-2-plugins/c3-215-tribe.md`, `.c3/adr/adr-20260904-mechanical-heartbeat-supersedes-p14.md`).
- **Only the six ADR files named in the spec change**, each by exactly two lines (status and seal).
  No fact, no `.c3/changes/` folder, no other ADR. Never `change apply`, never `rebase`.
- **Delivery chain (Warchief):** pre-gate over `origin/master..HEAD` green → tracker → two
  independent skinners (contract lens + cold lens, dispatched concurrently) → scout survey →
  before/after evidence per the spec's Evidence plan in the PR body → `gh pr merge <n> --merge`
  (regular merge only) → local master fast-forwarded → worktree removed → `SHIPPED`. A What/Why
  question is `NEEDS_DIRECTION` to the Shaman, never a guess.
- Hunters report to the Warchief at the report-file path given in their dispatch; they do not open
  PRs, merge, or dispatch agents.

---

### Task 1: prove each ADR's decision is realised

**Contract:** spec section "C1". **Files:** none changed except this plan (the table goes into the
Hunter report and the PR body).

- [x] **Step 1: Ancestry (oracle part a)**

```bash
cd /Users/hip/repo/todd-skills-wt/adr-status-flip-shipped
for s in 3f52f03 67cc16b a1aa6ed 1edfba4 43a9b16 c43dce4 2eb2372 d1ec881; do git merge-base --is-ancestor $s HEAD && echo "$s ancestor" || echo "$s NOT ancestor"; done
```

Expected: all eight `ancestor`.

- [x] **Step 2: Content presence (oracle part b)**

For each of the six ADR ids, for each `.c3/changes/<adr-id>/*.patch.md`: read the patch, identify
its target fact (the `→ c3-215` / `→ ref-plugin-layout` shown by
`bunx @c3x/cli@11.6.3 change status <adr-id>`) and its intended after-state (a block to insert or
replace, a frontmatter edge to add, or a row to delete); grep the target fact for a distinctive
phrase of that after-state (for a delete, confirm the phrase is absent). Record one row per patch:
`adr · patch · target · phrase · present/absent · verdict`. An ADR is `realised` only when every
one of its patches gets the verdict its kind expects.

- [x] **Step 3: Report the table**

Put the 14-row patch table and the 6-row ADR summary (ADR · evidence sha · patches · realised
yes/no) in your report.

- [x] **Step 4: Commit**

Tick this task's checkboxes and commit the plan file only. Subject
`docs(c3): record realisation check for the six proposed ADRs`, `Tribe-Task: 1/2`.

---

### Task 2: flip the realised ADRs

**Contract:** spec sections "C2", "C3".

- [ ] **Step 1: Try the tool's own command first (card D1)**

For the first realised ADR: `bunx @c3x/cli@11.6.3 change accept <adr-id>; echo "rc=$?"` then
`git status --porcelain` and `git diff`. Accept the mechanism only if the diff is exactly the
ADR's `status:` line and `c3-seal` line and nothing else changed. If `accept` refuses or changes
more, `git checkout -- .` and use the fallback for all six: edit `status: proposed` →
`status: accepted` in the ADR's frontmatter, then `bunx @c3x/cli@11.6.3 repair`.

- [ ] **Step 2: Apply to every realised ADR, check the shape**

```bash
git status --porcelain            # only the flipped ADRs (never c3.db*, never anything else)
git diff --stat                   # N files, 2 insertions, 2 deletions each
git diff | grep '^[-+]' | grep -v '^[-+][-+]' | grep -v 'c3-seal\|^[-+]status:' ; echo "other-lines rc=$?"
grep -l '^status: proposed' .c3/adr/*.md ; echo "still-proposed rc=$?"
bunx @c3x/cli@11.6.3 check; echo "check rc=$?"
```

Expected: `other-lines rc=1` (no line other than status/seal), `still-proposed rc=1` (none) unless
Task 1 justified leaving one, check "all clear" rc 0. If porcelain lists any file outside the six,
`git checkout -- <that file>` and note it in the report.

- [ ] **Step 3: Commit**

Stage the flipped ADRs and this plan. Subject `docs(c3): flip six shipped ADRs to accepted`,
`Tribe-Task: 2/2`, plan checkboxes ticked, and the per-ADR mechanism named in the body.

## Definition of done for this plan

- [ ] Both tasks committed and pushed; pre-gate green over `origin/master..HEAD`.
- [ ] Evidence per spec "Evidence plan" in the PR body (realisation table; mechanism per ADR;
      `grep -l` before/after; check transcript; `git diff --stat`).
- [ ] Two independent skinner audits PASS, tracker + scout recorded, PR merged with a regular merge,
      master fast-forwarded, worktree removed, `SHIPPED` returned.
