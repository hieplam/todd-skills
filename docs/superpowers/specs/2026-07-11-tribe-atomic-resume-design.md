# Tribe: atomic checkpointing & self-healing resume

**Date:** 2026-07-11
**Status:** Approved by owner (design), pending spec review
**Scope:** `plugins/tribe` — agent contracts, `validate-plan.sh`, new `resume-check.sh`

## Problem

The tribe survives the death of a *single agent* while its dispatcher is alive — the
report-file heartbeat plus `heartbeat-check.sh` lets the Shaman detect a stale Warchief and
re-dispatch it (`agents/warchief.md:97-126`). It does **not** survive the failure mode the
owner actually hit: the whole machine crashes, killing Shaman, Warchief, and Hunters
simultaneously. A fresh session afterwards has no reliable way to find in-flight work,
tell which tasks are truly done, or decide what to do with half-finished changes — so it
either duplicates work or builds on broken state.

### What already persists (and is kept as-is)

- Report-file heartbeat + `heartbeat-check.sh` (liveness detection) — `agents/warchief.md:97-126`.
- Spec and plan committed before any Hunter dispatch — `agents/warchief.md:217,224`.
- One commit per Hunter task (TDD red→green→commit) — `agents/hunter.md:83`.
- Resume-safe worktree creation (force-remove stale worktree/branch before add) —
  `agents/warchief.md:271-288`.
- Roadmap + Decision Log as the Shaman's file-based memory — `agents/shaman.md:147-149`.

### The gaps this design closes

1. **Progress is prose, not data.** Done-ness lives in heartbeat sentences that a resumed
   agent must interpret and reconcile against `git log`. Inference is where duplicated
   work comes from.
2. **The heartbeat is not atomic with the work.** A milestone can complete and the agent
   die before appending the line; the successor redoes the milestone.
3. **The in-flight dispatch is unrecoverable at the top.** Report-file and worktree paths
   are chosen ad hoc at dispatch time and live only in the (dead) dispatcher's context;
   the report file is committed only at `NEEDS_DIRECTION` (`agents/warchief.md:66-69`).
   Nothing on disk maps "card X → worktree Y → report Z".
4. **Dirty-worktree protocol is undefined.** A Hunter dying mid-TDD-cycle leaves
   uncommitted changes with no rule for the successor: continue or reset?
5. **No resume entry point.** Nothing documents how a fresh session discovers and
   continues in-flight campaigns.

## Owner rulings (settled — do not reopen)

1. **Dirty state policy: always revert & redo.** `git reset --hard` to the last commit and
   re-dispatch the task from its brief. Uncommitted = never happened. To bound redo cost,
   **every plan task must be a single unit of work** (one red→green→refactor→commit
   cycle); more, smaller commits are an accepted cost.
2. **State lives in three layers**, each owned by the role that writes it: a per-card
   state file (Warchief), plan checkboxes (Hunter, existing superpowers `- [ ]` syntax),
   and git commit trailers (consolidation/cross-check).
3. **Resume entry point is a deterministic script plus contract updates** — a sibling of
   `heartbeat-check.sh`, not a prose protocol and not a new user-facing skill.

## Design

### Principle

Work and its "done" record land in the **same git commit**, so a crash can never separate
them. Anything uncommitted is *defined* as never having happened. Resume is then pure
reading — no judgment, no inference.

### Layer 1 — per-card state file (Warchief-owned)

Path: `docs/tribe/state/<card-slug>.md`, committed on the work branch.

Fixed, script-parseable format:

```markdown
# tribe-state: <card-slug>
roadmap: docs/ROADMAP.md
worktree: /abs/path/to/worktree
branch: <branch-name>
report: /abs/path/to/report-file.md
base-sha: <sha>          # re-recorded after every wave integration
plan: docs/superpowers/plans/<plan-file>.md

## Milestones
- [x] spec committed — docs/superpowers/specs/<spec>.md
- [x] plan committed — docs/superpowers/plans/<plan>.md
- [ ] wave 1 integrated
- [ ] wave 2 integrated
```

Note there is no `pushed` checkbox: ticking it would itself create a new unpushed commit
(chicken-and-egg). Push status is derived from git directly (`git rev-parse @{u}` /
comparing the branch against its upstream), consistent with "git is the ledger".

Rules:

- Each milestone tick lands **in the same commit as the milestone's artifact** (the spec
  commit also ticks "spec committed"; a wave-integration merge commit ticks its wave).
  Milestones with no natural artifact commit get a tiny state-only commit — accepted per
  ruling 1.
- **Post-push milestones (PR opened, CI green, merged) are deliberately NOT written to
  the state file.** Committing to the branch after the PR opens would retrigger CI, and
  GitHub is already the durable store for that phase. Resume derives delivery status live
  via `gh pr list --head <branch>` / `gh pr view`. Local files persist what only exists
  locally; GitHub persists what GitHub owns.
- The Shaman's roadmap gains an in-flight marker at dispatch time
  (`in-flight: <card-slug> → <worktree-path>`), so discovery works from the master
  checkout even if a worktree was destroyed.

### Layer 2 — plan checkboxes (Hunter-owned)

The existing superpowers plan format already puts `- [ ]` on every step of every task
(`writing-plans/SKILL.md:95-120`). No format change. New rules:

- The Hunter ticks its task's checkboxes **in the same commit as the task's code**.
- The Warchief's audit (skinner dispatch) rejects a task whose boxes are not ticked
  in-commit.

### Layer 3 — git trailers (consolidation)

Every tribe commit carries trailers:

- `Tribe-Card: <card-slug>`
- `Tribe-Task: <n>/<total>` (Hunter task commits)
- `Tribe-Milestone: <name>` (Warchief state-only / artifact commits)

**Git history is ground truth.** When any file disagrees with the trailers, the trailers
win and the file is corrected by the resumed agent before proceeding. The files are fast
indexes; git is the ledger.

### Reconciler — `plugins/tribe/scripts/resume-check.sh`

A deterministic sibling of `heartbeat-check.sh` (same conventions: JSON to stdout, logs
to stderr, exit 0 = ran, 2 = setup error; path resolved via `$CLAUDE_PLUGIN_ROOT` then
the `readlink -f` fallback, exactly as `agents/warchief.md:106-118` resolves
`heartbeat-check.sh`).

Given a repo root (default: cwd), it:

1. **Discovers** in-flight work: `git worktree list --porcelain` → each worktree's branch
   → `docs/tribe/state/*.md`; plus the roadmap's in-flight markers (catches destroyed
   worktrees).
2. **Reconciles** per card, precedence: trailers (`git log`) > plan checkboxes > state
   file. The report file is consulted only for liveness (delegating to
   `heartbeat-check.sh`). Also reads `git status --porcelain` (dirt), `MERGE_HEAD`
   (crashed mid-merge), and `gh` (delivery phase) when available.
3. **Prints JSON** per card: `card`, `worktree`, `branch`, `plan`, `last_completed_task`,
   `dirty`, `mid_merge`, `pushed` (derived from upstream comparison, not from the state
   file), `delivery` (none/pr-open/ci-green/merged), and one computed
   `next_action`:
   - `REVERT_AND_REDO <task n>` — dirty worktree: `git reset --hard`, re-dispatch task n.
   - `DISCARD_AND_RESUME_DELIVERY` — dirty worktree but every task already committed:
     `git reset --hard` + `git clean -fd`, then re-enter delivery — never redo a task.
   - `CONTINUE <task n+1>` — clean, mid-plan.
   - `REDO_MERGE <wave n>` — `MERGE_HEAD` present: `git merge --abort`, redo the wave merge.
   - `RESUME_DELIVERY` — pushed/PR open: re-enter the CI-watch block.
   - `VERIFY_SHIPPED` — PR merged: run verify-shipped, close out the card.
4. Reports any layer disagreement explicitly (`inconsistencies: [...]`) with the
   git-derived correction.

The script computes and prints; the **agents** perform the actions. No state mutation
from the script.

### Contract updates

- **`agents/shaman.md`** — Mode 2 gains step 0: run `resume-check.sh`; any in-flight card
  resumes (re-dispatch a Warchief with the script's JSON for that card) before a new card
  is picked. Dispatch step records the in-flight marker in the roadmap; verified-SHIPPED
  clears it.
- **`agents/warchief.md`** — intake creates the state file (or reads it on re-dispatch and
  honors `next_action`); every milestone ticks the state file atomically with its
  artifact; dirty worktree → `git reset --hard`, always — inspect-and-continue is
  forbidden; Hunter briefs carry the tick-in-same-commit rule and the trailers.
- **`agents/hunter.md`** — contract addition: tick your task's plan checkboxes in the same
  commit as the code; include `Tribe-Card` / `Tribe-Task` trailers; a commit without them
  fails audit.
- **`scripts/validate-plan.sh`** — new mechanical check enforcing ruling 1: every task is
  one unit of work ending in exactly one commit step; a task with multiple commit steps
  (or none) fails validation before any Hunter is dispatched.

## Edge cases

| Situation on resume | Verdict | Action |
| --- | --- | --- |
| State file says task N done, no `Tribe-Task: N` commit | git wins | task N not done → redo; fix state file |
| Commit for task N exists, checkbox unticked | git wins (rule was violated) | tick box in a state-only commit; continue at N+1 |
| Dirty worktree | ruling 1 | `git reset --hard`; redo current task |
| Dirty worktree, all tasks already committed | ruling 1, but the dirt belongs to no task | reset --hard + clean; resume delivery — never redo a committed task |
| `MERGE_HEAD` present (died mid-wave-merge) | deterministic | `git merge --abort`; redo the merge |
| Worktree destroyed, branch exists | existing procedure | recreate worktree (`agents/warchief.md:271-288`), continue |
| Roadmap marks card in-flight, no branch/worktree/state file anywhere | nothing committed ever happened | restart card from dispatch |
| `gh` unavailable/offline | degrade loudly | `delivery: "unknown"` in JSON; agent decides via contract |

## Testing

- **`resume-check.sh`**: fixture-based shell tests (synthetic git repos), one per scenario:
  clean mid-plan, dirty worktree, mid-merge, post-push with PR, state-vs-git conflict,
  destroyed worktree, no in-flight work. Assert on the JSON verdict.
- **`validate-plan.sh` additions**: fixture plans — single-commit task (pass),
  multi-commit task (fail), no-commit task (fail).
- **Agent-contract evals** (`plugins/tribe/evals/evals.json`): a Hunter scenario asserting
  the checkbox tick + trailers land in the task commit.

## Out of scope (YAGNI)

- No watchdog daemon or auto-restarting sessions — resume triggers when a session starts
  (owner, or the existing opt-in scheduled campaign mode in `agents/shaman.md`).
- No lock files or leases — the 30-minute heartbeat staleness rule remains the liveness
  mechanism, unchanged.
- No changes to the report-file heartbeat format or `heartbeat-check.sh`.
- No migration tooling for campaigns started before this design.
