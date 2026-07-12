# Spec — `integrate-wave.sh`: push wave orchestration from prose down into code

**Card:** idea-08-integrate-wave-script
**Status:** planning-only (this spec + its plan are the brief for a future implementation campaign)
**Author:** Warchief
**Base:** `6a46391` (`origin/master`)

---

## 1. Problem (grounded in code)

The tribe's Warchief prompt today contains a **deterministic algorithm written as English prose**,
which an LLM must then execute by hand, one `git` command at a time.

Concretely, `plugins/tribe/agents/warchief.md:382-433` — the "between wave N and wave N+1" block of
Method step 5 — spells out a four-step chain:

- `warchief.md:388-401` — wait for every Hunter in the wave, audit each, and handle the
  mixed-outcome case (**judgment**, correctly an agent's job).
- `warchief.md:402-409` — merge each sub-plan branch into the Warchief's own worktree, one at a
  time, in a fixed declared order: `git -C <worktree> merge --no-ff <branch>` (**mechanical**).
- `warchief.md:411-419` — immediately after each merge lands, clean up that sub-plan's worktree and
  branch: `git worktree remove <path> --force` then `git branch -D <branch>` (**mechanical**).
- `warchief.md:420-427` — re-record the base commit as the worktree's new HEAD via
  `git -C <worktree> rev-parse HEAD`, which becomes wave N+1's base SHA (**mechanical**).

Plus the failure rule at `warchief.md:407-409`: a merge conflict means `owns_files` was wrong — do
not guess a resolution, save state and return `NEEDS_DIRECTION` (**judgment**, triggered by a
mechanical detection).

Three of those four steps, and the conflict *detection*, contain **zero judgment**. They are pure
git plumbing whose correct execution is fully determined by the inputs (the worktree path and the
wave's branch list in declared order). Yet the tribe currently pays an LLM to re-derive and re-type
them on every wave.

The handoff analysis (`bun-rust-migration-analysis-handoff.md` §2.3) names the four costs of
keeping deterministic coordination inside an agent's context, and each one lands squarely on this
block:

1. **The orchestrator's context is the bottleneck → agentic laziness.** The Warchief that just
   absorbed N Hunter reports and N Skinner audits is the same instance asked to type an exact,
   order-sensitive, seven-command merge/cleanup chain. A `for` loop in a script never forgets the
   third branch; a context-loaded model does.
2. **Token cost is linear in routing decisions.** Every merge, every `worktree remove`, every
   `rev-parse` is a paid model turn producing an output that was knowable in advance.
3. **Non-determinism where no judgment is needed.** "Merge these branches in this order, then
   delete their worktrees" is 100% deterministic; handing it to an LLM buys drift risk and buys no
   value. Silent failure modes observed in this exact shape: merging in the wrong order, forgetting
   the per-branch cleanup (which then **blocks a resumed Warchief from reusing the path/branch
   names** — `warchief.md:411-414` explicitly warns about this), or forgetting to re-record the
   base SHA (which makes wave N+1 branch off **stale pre-wave-1 code** — `warchief.md:425-427`).
4. **No reproducibility / resume.** An agent's "plan" is a chat transcript. A script is re-runnable,
   and re-runnability is exactly what `resume-check.sh`'s `REDO_MERGE` verdict
   (`plugins/tribe/scripts/resume-check.sh:15,200-202`) already assumes exists: it tells a resuming
   Warchief to `git merge --abort` and *redo the wave merge* — but there is nothing to "redo" it
   *with* except the same 70 lines of prose, re-read by a fresh model.

The tribe is already half-converted to the right philosophy: `heartbeat-check.sh`,
`resume-check.sh`, and `validate-plan.sh` exist precisely because "whatever is deterministic goes
into code, and the agents keep only the judgment". Wave integration is the largest remaining
deterministic chain still living in prose.

**Additional grounding — the state-file rule this must honor.** `warchief.md:150-152` requires the
base SHA to be re-recorded in the state file with each wave integration, and `warchief.md:153-156`
requires every commit to carry `Tribe-Card` plus a `Tribe-Task` / `Tribe-Milestone` trailer, with
**git history as ground truth** whenever a file disagrees. A merge commit produced by the wave
chain is a commit like any other and must obey both rules — today, nothing enforces that.

---

## 2. Proposed design

Add **`plugins/tribe/scripts/integrate-wave.sh`**, a mutating sibling of the existing tribe
scripts, and shrink `warchief.md` step 5 to *invoke it and interpret its exit code*.

### 2.1 Interface

```
integrate-wave.sh <worktree-path> <branch> [<branch>...]
                  [--card SLUG] [--state-file PATH] [--wave N]
```

- **Positional:** the Warchief's own integration worktree, then the wave's sub-plan branches **in
  declared order** (sub-plan order in the plan). Order is the caller's contract; the script never
  reorders.
- `--card SLUG` (optional): stamps `Tribe-Card: SLUG` on every commit the script creates.
- `--state-file PATH` + `--wave N` (optional, used together): after the wave's last merge lands,
  re-record `base-sha:` in that state file and tick its `- [x] wave N integrated` milestone, in one
  small commit trailered `Tribe-Milestone: wave N integrated`. Omit them and the script only
  *prints* the new SHA, leaving the state write to the caller.
- **Output:** a JSON summary on **stdout only**; human logs on **stderr** — matching
  `resume-check.sh:20` and `validate-plan.sh:37`.

### 2.2 Exit-code contract (precise)

| Code | Meaning | Worktree state on exit | Caller's move |
|---|---|---|---|
| `0` | **Wave integrated.** Every listed branch is merged into the worktree (or was already), every merged sub-plan worktree+branch is cleaned up, and `new_base_sha` is printed. | Clean, HEAD = the new base | Proceed to wave N+1 (or step 7) using `new_base_sha` |
| `2` | **Usage / setup error.** Fewer than 2 args, unknown flag, worktree missing or not a git worktree, a named branch that neither exists nor is already integrated, a dirty worktree, `python3` missing. | Untouched | Fix the invocation. Never a product question |
| `3` | **Merge conflict.** A listed branch conflicted; the script aborted that merge. JSON names the conflicting branch, the conflicted paths, the branches already integrated, and those still pending. | Clean (merge aborted); earlier branches in the wave stay merged | **`NEEDS_DIRECTION` to the Shaman** — a conflict means `owns_files` was wrong (`warchief.md:407-409`). Never guess a resolution |
| `4` | **Post-merge cleanup failure.** A merge landed and is durable, but removing that sub-plan's worktree or deleting its branch failed (or the safety assertion below refused). JSON names what could not be cleaned. | Clean; the landed merges are committed | Investigate the leftover worktree/branch by hand, then **re-run the same command** (it is idempotent — see 2.4) |

`1` is never returned deliberately (it stays bash's generic-failure code). This is a **deliberate
divergence** from the compute-only scripts, whose contract is "0 = ran, regardless of findings; 2 =
setup error" (`heartbeat-check.sh:14`, `resume-check.sh:21`, `validate-plan.sh:38`): those scripts
only *compute*, so their findings live in JSON. This one *mutates the repo*, so its outcome must be
branchable from the shell without parsing JSON. The header comment will say so explicitly.

### 2.3 Algorithm

**Preflight (before mutating anything):**

1. Arg/flag parse; `LOG`/`DIE` helpers identical in shape to the sibling scripts.
2. Worktree exists and is a git work tree; `python3` on PATH (used *only* to serialize JSON — every
   git mutation stays in auditable bash).
3. **Mid-merge recovery (the `REDO_MERGE` path).** If `MERGE_HEAD` exists in the worktree, the
   previous run died mid-merge. The script runs `git merge --abort` itself, logs it, and continues
   from the top of the wave. This *is* the `REDO_MERGE` action `resume-check.sh:200-202` prescribes
   — a resuming Warchief simply re-runs the same command line.
4. Worktree must now be clean (`git status --porcelain` empty), else exit `2`. A dirty tree would
   make `git merge` refuse anyway; failing fast with a clear message beats a cryptic git error.
5. Every named branch must either **exist** or be **already integrated** (2.4); otherwise exit `2`.

**Per branch, in the given order:**

1. **Already integrated?** (see 2.4) → skip the merge, still run cleanup idempotently.
2. Else merge:
   ```
   git -C <worktree> merge --no-ff -m "merge(wave): integrate <branch>" \
       -m "Tribe-Card: <slug>
   Tribe-Wave-Branch: <branch>" <branch>
   ```
   Both trailer keys sit in the commit's single final paragraph, per `warchief.md:157-160`.
3. **Conflict** → collect `git diff --name-only --diff-filter=U`, run `git merge --abort` (restoring
   a clean tree so `resume-check.sh` will not later report a phantom `REDO_MERGE`), emit the JSON,
   exit `3`. Branches merged earlier in this wave stay merged — rolling them back would mean
   re-creating worktrees the script already destroyed, and the re-run path (2.4) makes keeping them
   safe.
4. **Success → clean up immediately** (`warchief.md:411-419`, "before moving to the next sub-plan's
   merge"):
   - Derive the sub-plan's worktree path from `git worktree list --porcelain` by matching the
     branch — the caller passes branch names only, never paths.
   - **Safety assertion before destruction:** `git merge-base --is-ancestor <branch> HEAD` must
     hold. The script deletes a branch **only** once its tip is provably contained in the
     integration branch. If it does not hold, do not delete; exit `4`.
   - `git worktree remove <path> --force`, then `git branch -D <branch>`. A worktree that is already
     gone is not an error (idempotence); a *failing* removal is → exit `4`.

**After the last branch:** `git -C <worktree> rev-parse HEAD` → `new_base_sha`; optionally write it
into the state file (`--state-file`/`--wave`); print JSON; exit `0`.

### 2.4 Resume-safety (the property that earns the script its keep)

A re-dispatched Warchief re-runs **the identical command line** and converges. Three mechanisms:

- **Mid-merge → auto-abort** (preflight 3), which is exactly `REDO_MERGE`.
- **Already-integrated detection via git trailers.** After cleanup, a merged branch's *ref is
  deleted* — so on a re-run its name resolves to nothing, and a naive "branch must exist" check
  would hard-fail (the same deadlock `warchief.md:343-353` had to patch for `worktree add`). The
  script instead asks git history, which is ground truth (`warchief.md:153-156`): a branch is
  already integrated iff `Tribe-Wave-Branch: <branch>` appears in a merge-commit trailer in
  `<base>..HEAD`. Missing branch **+** trailer present ⇒ skip, idempotent. Missing branch **+** no
  trailer ⇒ genuine bad argument ⇒ exit `2`.
- **Idempotent cleanup:** removing an absent worktree or deleting an absent branch is a no-op, not
  a failure.

So a crash **anywhere** in the chain — between two merges, between a merge and its cleanup, before
the SHA re-record — is recovered by re-running the same line. The script never leaves a partially
merged, un-restorable tree.

### 2.5 The prose that survives in `warchief.md`

Step 5's ~52-line mechanical block (`warchief.md:402-433`) collapses to: run the script (path
resolved by the two-mechanism dance already used for `heartbeat-check.sh`/`validate-plan.sh`), then
branch on the exit code — `0` proceed with the printed `new_base_sha`, `3` → `NEEDS_DIRECTION`
(conflict = `owns_files` was wrong), `2`/`4` → fix and re-run. **Every judgment paragraph stays
verbatim**: the mixed-outcome-wave rule (`warchief.md:390-401`), the "audit each sub-plan
independently / do not merge any of the wave's branches on a capped FAIL" ruling, and the
`NEEDS_DIRECTION`-on-conflict rule. Judgment stays with the agent; plumbing moves to code.

---

## 3. Scope fence

**In scope (implementation campaign):**
- New `plugins/tribe/scripts/integrate-wave.sh`.
- New `plugins/tribe/scripts/tests/test-integrate-wave.sh`, in the existing fixture style
  (`test-resume-check.sh`: synthetic git repos under `mktemp -d`, `ok`/`bad`/`check` helpers,
  `N passed, M failed` footer, offline, no network).
- Edits to `plugins/tribe/agents/warchief.md` step 5 (and only step 5's mechanical block).

**Out of scope — explicitly:**
- Changing `resume-check.sh`, `heartbeat-check.sh`, or `validate-plan.sh` behavior. `REDO_MERGE`
  keeps its current meaning; the script *implements* it rather than redefining it.
- Changing the mixed-outcome-wave rule, the 3-round audit cap, or any other judgment rule.
- Changing worktree *creation* (step 4) — creation is already resume-safe; only integration moves.
- Idea 09's per-wave re-dispatch (see §7), idea 07's `build-queue.sh`, or any other card.
- The Shaman's prompt, the Hunter's prompt, install.sh, README.
- Generalizing to non-tribe repos, adding a `--dry-run`, or adding a config file.

**This planning branch's own fence (already binding):** only
`docs/tribe/planning/idea-08-integrate-wave-script/` and `docs/tribe/state/` are touched. **Zero
changes under `plugins/`** — the plan carries the intended script and prose diffs as *content*, not
as applied edits.

---

## 4. Testing / verification strategy

TDD, one scenario group per task, all in `plugins/tribe/scripts/tests/test-integrate-wave.sh`,
mirroring `test-resume-check.sh`'s harness exactly (same `git_c`, `new_repo`, `check` helpers, same
`--template=` + `wtguard.protected ""` fixture hygiene so a host-installed branch guard cannot
break the tests).

Scenario coverage, each an executable proof of one contract clause:

| # | Scenario | Asserts |
|---|---|---|
| 1 | No args / one arg / unknown flag | exit `2`, usage message on stderr |
| 2 | Worktree path is not a git worktree | exit `2` |
| 3 | Named branch does not exist and was never integrated | exit `2` |
| 4 | Dirty integration worktree | exit `2`, no merge attempted |
| 5 | Two-branch wave, disjoint files | exit `0`; both merges present; **merge order matches argv order** (assert on `git log --format=%s`); each merge is a real merge commit (two parents, `--no-ff`) |
| 6 | Trailers on merge commits | `Tribe-Card` and `Tribe-Wave-Branch` readable via `git log --format=%(trailers:key=...)` |
| 7 | Happy path JSON | stdout parses as JSON; `new_base_sha` equals `git rev-parse HEAD`; `integrated` lists both branches |
| 8 | Cleanup | after exit `0`, neither sub-plan worktree nor branch exists (`git worktree list`, `git branch --list`) |
| 9 | Cleanup happens per branch, not at the end | with 2 branches, the first branch's worktree is already gone when the second merge runs (probe via a pre-created conflict on branch 2 → assert branch 1 is cleaned even though the run exits `3`) |
| 10 | Conflicting branch | exit `3`; JSON names the branch + conflicted paths; **worktree is clean afterwards** (`MERGE_HEAD` gone, `git status --porcelain` empty) |
| 11 | Conflict leaves earlier merges intact | the pre-conflict branch is still merged and cleaned |
| 12 | Re-run after conflict is deterministic | second identical invocation exits `3` again with the same branch named (no crash on the already-deleted first branch) |
| 13 | Crash mid-merge (fixture leaves `MERGE_HEAD` on a *non*-conflicting merge) | re-run auto-aborts, redoes, exits `0` — the `REDO_MERGE` path |
| 14 | Partial-wave re-run (branch 1 merged+deleted, branch 2 pending) | same command line exits `0`; branch 1 skipped via trailer detection, not re-merged (assert only one merge commit for it) |
| 15 | Fully-integrated re-run (both branches merged+deleted) | exits `0`, no new commits (`git rev-parse HEAD` unchanged) |
| 16 | Safety assertion | branch whose tip is *not* an ancestor of HEAD is never deleted → exit `4`, branch survives |
| 17 | `--state-file`/`--wave` | `base-sha:` rewritten to the new HEAD, `- [x] wave N integrated` ticked, one commit with `Tribe-Milestone: wave N integrated`; re-running is a no-op (no second commit) |

**Gate for the implementation campaign:** `bash plugins/tribe/scripts/tests/test-integrate-wave.sh`
prints `N passed, 0 failed` and exits `0`; `bash plugins/tribe/scripts/tests/test-resume-check.sh`
and `test-validate-plan.sh` still pass unchanged (no regression); `bash -n` on the new script.
The repo has no CI workflows (`.github/workflows` absent), so these locally-run suites *are* the
gate — the PR body must paste their output.

---

## 5. Evidence plan (for the future implementation campaign)

The change is a CLI script + a prompt-prose diff: there is no UI, so evidence is **terminal
captures**, hosted per the repo's PR conventions.

- **BEFORE:** on `master`, `ls plugins/tribe/scripts/` (no `integrate-wave.sh`) and
  `sed -n '402,433p' plugins/tribe/agents/warchief.md | wc -l` → the ~52 prose lines an LLM must
  hand-execute today.
- **AFTER (unit proof):** the full run of `test-integrate-wave.sh` showing `N passed, 0 failed`,
  plus the two sibling suites still green.
- **AFTER (behavioral proof, the money shot):** a scripted live demo on a throwaway fixture repo,
  captured as a single terminal recording:
  1. two-branch wave → `integrate-wave.sh` → exit `0`, both merges in argv order, both worktrees
     gone, `new_base_sha` printed;
  2. `kill -9` mid-merge (simulated by leaving `MERGE_HEAD`) → re-run the identical line → exit `0`,
     converged (the resume story, which prose can never prove);
  3. conflicting wave → exit `3`, JSON names the branch, tree left clean.
- **AFTER (prose shrink):** the `warchief.md` diff with the removed-line count, showing the
  judgment paragraphs preserved verbatim.

---

## 6. Risks & rollback

| Risk | Severity | Mitigation |
|---|---|---|
| **The script destroys work** (it runs `worktree remove --force` and `branch -D`) | High | It only ever touches worktrees/branches **named in argv**; it deletes a branch only after the merge commit exists *and* `git merge-base --is-ancestor <branch> HEAD` proves the tip is contained; otherwise it refuses and exits `4`. Tested by scenario 16 |
| Conflict-abort loses information the Warchief needs to escalate | Medium | The conflicted paths are captured **before** the abort and emitted in the JSON, so the `NEEDS_DIRECTION` report carries them even though the tree is restored |
| Trailer-based "already integrated" detection misfires (e.g. a hand-written commit mentioning the branch) | Medium | Detection reads the structured trailer key `Tribe-Wave-Branch` via `git log --format=%(trailers:key=...)` — never a subject-line grep — and only within `<base>..HEAD` |
| `git worktree remove` fails because a Hunter process still holds the directory | Low | Exit `4` (distinct from conflict), leaving the merge durable; re-running after clearing the holder converges |
| The prose shrink accidentally removes a judgment rule | Medium | The plan's prose-diff task quotes the surviving paragraphs verbatim and the audit checks them line by line; the Skinner re-reads step 5 against this spec |
| Script drifts from the prompt that calls it | Low | The prompt's step 5 references the exit-code table by number; the script's `--help` prints the same table (single source in the header comment) |

**Rollback:** the script is purely additive (`git revert` of the prose commit restores the hand-run
prose; deleting the script file removes the capability). No data migration, no config, nothing
outside `plugins/tribe/`. A Warchief on the old prose and a Warchief on the new script produce the
same git history shape, so a half-rolled-back tribe still works.

---

## 7. Interactions with other ideas

### Idea 09 — "persistent policy, ephemeral instance" (per-wave Warchief re-dispatch)

**This card is idea 09's precondition, and idea 09 is this card's biggest payoff.** Idea 09 proposes
that a multi-wave Warchief *ends itself after integrating each wave* and the Shaman re-dispatches a
fresh instance to run wave N+1, so coordination noise never accumulates. That only works if the
wave-integration algorithm survives the death of the instance that started it — i.e. if it lives in
a re-runnable script rather than in the dying context. Every resume property in §2.4 (auto-abort of
a half-merge, trailer-based already-integrated skip, idempotent cleanup, the printed/persisted
`new_base_sha`) is exactly the handoff datum the *next* Warchief needs.

Concretely, if idea 09 lands after this one:
- The fresh Warchief's first act stays `resume-check.sh`; a `REDO_MERGE` verdict becomes "re-run
  `integrate-wave.sh` with the same arguments" — a one-line instruction instead of a prose replay.
- `--state-file`/`--wave` become **load-bearing rather than optional**: the tick + base-SHA rewrite
  is how the dying Warchief tells its successor which wave is done. Idea 09 should mandate the
  flags; the idempotent no-op re-run (scenario 17) guarantees a double-dispatch cannot double-tick.
- **Sequencing recommendation: land idea 08 first.** Both cards edit the same region of
  `warchief.md` step 5 — idea 09 rewrites the "then dispatch wave N+1" ending, idea 08 rewrites the
  mechanical middle. Running them as concurrent sub-plans would violate disjoint `owns_files` and
  produce exactly the merge conflict this script is designed to report. If the Shaman wants them in
  one wave, they must be one sub-plan.

### Idea 07 — `build-queue.sh` (mechanical work queue)

Same family, same conventions, **one deliberate divergence to coordinate**:
- **Shared conventions this card follows** (and idea 07 should too): bash entrypoint + a `python3`
  heredoc used *only* for JSON serialization; `LOG`/`DIE` helpers; JSON on stdout, logs on stderr;
  a header comment that doubles as `--help` (`sed -n` on itself); fixture tests under
  `plugins/tribe/scripts/tests/` with the `ok`/`bad`/`check` harness; discovery by the caller via
  the `$CLAUDE_PLUGIN_ROOT` → `readlink -f` two-mechanism path dance, with
  `NEEDS_DIRECTION` if neither resolves.
- **Divergence:** `build-queue.sh` is *compute-only*, so it keeps the family's `0 = ran / 2 = setup
  error` contract. `integrate-wave.sh` *mutates git*, so it adds semantic codes `3` (conflict) and
  `4` (cleanup failure). Whichever of the two lands second should record the split in the family's
  conventions note: **compute-only scripts return 0/2; mutating scripts return 0/2 plus semantic
  codes.** No file overlap otherwise (`build-queue.sh` + its test vs `integrate-wave.sh` + its
  test), so the two are safely concurrent sub-plans — *provided only one of them also edits
  `warchief.md`*. Idea 07 adds a plan-sourcing rule to the Warchief prompt; idea 08 rewrites step 5.
  Those are different sections but the same file, so `owns_files` cannot list `warchief.md` twice:
  **they must not run in the same wave.**

### Idea 10 — meta-loop / mechanical tripwires

This card is a direct instance of idea 10's thesis ("fix the process, don't hand-fix the code"):
instead of writing *more* prose telling the Warchief to be careful about merge order, it removes the
opportunity for the mistake. The exit-code contract also gives idea 10 a ready-made tripwire — a
non-zero `integrate-wave.sh` exit is a machine-checkable campaign event, not a narrative one.

### No interaction

Ideas that fan out stateless implementer cells do not touch this chain: they change *who builds a
sub-plan*, not *how the finished branches fold together*. `integrate-wave.sh`'s contract is
"branches in, integrated base SHA out" regardless of what produced the branches.
