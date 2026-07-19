# Design: `~/.tribe/` — local, per-repo home for the tribe's operational progress

- **Date:** 2026-07-19
- **Status:** design, awaiting owner review (brainstormed with owner, all forks ratified)
- **Supersedes:** `docs/tribe/ideas/dot-tribe-home.md` on the *location* question — that card
  proposed an **in-repo** `.tribe/`; the owner ratified a **home-dir, per-repo** layout instead
  (the Claude Code transcript model). The card's other reasoning (locality of reports, who
  creates the dir, idea-09/idea-10 interactions) still informs this design.

## Frame (reverse-tornado)

- **Objective:** the tribe's operational progress state stops being committed to the consuming
  repo and lives at `~/.tribe/<repo-key>/`, while `resume-check` still reconciles in-flight cards
  with parity to today. *Measure:* after rollout, `git ls-files docs/tribe/state` is empty AND a
  crash-resume of an in-flight campaign produces the same `next_action` verdicts as the pre-move
  baseline.
- **Anti-goals (walls that must hold):**
  1. **No cross-project bleed** — two different repos never share a state dir.
     *Measure:* distinct repo paths ⇒ distinct `~/.tribe/<key>/`.
  2. **No cross-task bleed** — concurrent cards in one repo never overwrite each other's state.
     *Measure:* N concurrent cards ⇒ N distinct slug-named files, 0 overwrites.
  3. **No lost in-flight state during migration** — migrating a live campaign preserves every
     card's resume verdict. *Measure:* `resume-check` output identical pre- and post-migration.
  4. **Resume parity** — the new read path yields the same cards/verdicts as the old scan.
- **Human-only frame:** location, key derivation, migration semantics, and ship lifecycle are
  ratified above; implementation may not change them without owner sign-off.

## Problem

Two different things live under `docs/tribe/` today and only one is a durable contract:

- **Contracts (reviewable history, belong in git):** `docs/tribe/planning/` (specs, plans),
  `docs/tribe/ideas/`, Decision Log, findings ledger, `ROADMAP.md`.
- **Operational runtime events (do NOT belong in git):**
  - `docs/tribe/state/*.md` — the per-card crash-safe **resume record** that
    `resume-check.sh` reads and `warchief.md` writes at intake. Today it is **committed**, so
    campaign events (milestone ticks, audit notes) land in PRs and persist in `master` forever.
  - heartbeat/report files — already transient, today in `/tmp` or `~/.claude/tribe-reports/`.

Committing event data violates "the repo stores source of truth, not events." The fix: move the
operational state out of the working tree entirely, into a per-repo home on the local machine,
mirroring how Claude Code stores transcripts at `~/.claude/projects/<encoded-cwd>/`.

## Ratified decisions

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | **Location** | `~/.tribe/<repo-key>/` (home dir, dedicated top-level, not under `~/.claude`) | Never touches any repo's working tree ⇒ zero accidental commits; dedicated dir keeps tribe state out of Claude's config tree. |
| 2 | **Project key** | Canonical **main-worktree** path, encoded slash→dash | One home per repo; all of a campaign's worktrees collapse to it (see key derivation). |
| 3 | **Migration** | One-shot `migrate-state.sh` **+** read-time fallback in `resume-check` | Explicit rollout that also de-tracks the files; fallback means an un-migrated repo still resumes. |
| 4 | **Ship lifecycle** | On `VERIFY_SHIPPED`, archive `state/<slug>.md` → `archive/<slug>.md` | Keeps a local audit trail of finished campaigns; `resume-check` scans only `state/`, so shipped cards stop showing as in-flight. |
| 5 | **Encoding** | Plain slash→dash (Claude Code style) | Faithful to the "like Claude Code transcripts" anti-goal. Collision caveat documented below. |

## Design

### Home path + key derivation — `plugins/tribe/scripts/tribe-home.sh`

Single source of truth for the path, sourced by every consumer. The key is the **canonical
main-worktree root**, derived so it is identical whether called from the main checkout or any
linked worktree:

```bash
# main root, even from a linked worktree: --git-common-dir → <main>/.git ; parent = main root
common=$(git rev-parse --path-format=absolute --git-common-dir) || die "not a git repo"
main_root=$(cd "$(dirname "$common")" && pwd -P)
key=$(printf '%s' "$main_root" | sed 's#/#-#g')   # /Users/home/repos/todd-skills → -Users-home-repos-todd-skills
home="$HOME/.tribe/$key"
```

Verified: from both the main checkout and a freshly-added linked worktree of this repo,
`git rev-parse --path-format=absolute --git-common-dir` returns
`/Users/home/repos/todd-skills/.git`, so both resolve to the same `main_root` and therefore the
same `home`.

### Directory layout

```
~/.tribe/<repo-key>/
├── state/      # in-flight per-card resume records (moved from docs/tribe/state/)
│   └── <card-slug>.md
├── archive/    # shipped cards, moved here on VERIFY_SHIPPED
│   └── <card-slug>.md
└── reports/    # heartbeat/report files (moved from /tmp | ~/.claude/tribe-reports)
    └── <card-slug>.md
```

### `resume-check.sh` rework

- Compute `home` via `tribe-home.sh`; read state from `<home>/state/*.md` (one dir, all cards)
  instead of scanning each worktree's `docs/tribe/state/`.
- Each state file already carries `worktree:` and `branch:` fields, so the git-trailer,
  plan-checkbox, dirty, mid-merge, pushed, and delivery checks use those fields to locate the
  worktree — the script no longer needs `git worktree list` to *find* state.
- **Orphan recovery simplifies:** the home survives worktree deletion, so a missing/invalid
  `worktree:` dir is recovered from the state file's own `branch:` field (replacing today's
  `git cat-file <branch>:docs/tribe/state/<slug>.md` object scan, which no longer exists once
  state is uncommitted).
- **Read-time fallback:** if `<home>/state/` is absent or empty, fall back to the current
  in-repo worktree scan, so a repo that has not run `migrate-state.sh` still resumes.

### Migration — `plugins/tribe/scripts/migrate-state.sh` (idempotent, one-shot)

1. Compute `home`; `mkdir -p "$home/state"`.
2. Copy every `docs/tribe/state/*.md` (across all worktrees) into `$home/state/` (skip if the
   destination already exists and is newer — safe to re-run).
3. Append `docs/tribe/state/` to the repo `.gitignore` (skip if already present).
4. `git rm -r --cached docs/tribe/state/` — untrack from the index ("remove its cache") while
   leaving the on-disk/home copies intact.
5. Print a summary and the exact de-tracking commit for the operator to make.

### Ship lifecycle

When `resume-check` (or the Warchief at delivery close) determines `delivery: merged` /
`VERIFY_SHIPPED`, move `state/<slug>.md` → `archive/<slug>.md`. `resume-check` scans only
`state/`, so archived cards drop out of the in-flight list while remaining locally inspectable.

### Agent-text changes (conventions only, no behavior beyond path)

- `warchief.md`: state file created at intake now lives at `<home>/state/<CARD-SLUG>.md`
  (was `docs/tribe/state/…` in the worktree); update the "one sanctioned resume artifact"
  passages and the report-path convention (`<home>/reports/<card>.md`).
- `shaman.md`: Channels & liveness report paths become `<home>/reports/…`.
- `hunter.md`: report path continues to come from the brief (the brief now carries the home path).

## Worked example: 3 parallel cards in `todd-skills`

```
main checkout:  /Users/home/repos/todd-skills            ← .git lives here
                        │  key = -Users-home-repos-todd-skills
   ┌────────────────────┼────────────────────┐
worktree A            worktree B            worktree C
…/impl-idea-01        …/impl-idea-02        …/impl-idea-03
branch feat/idea-01   branch feat/idea-02   branch feat/idea-03
   │ Warchief A          │ Warchief B          │ Warchief C
   └──────────┬──────────┴──────────┬──────────┘
         all three --git-common-dir → /Users/home/repos/todd-skills/.git
                          │
        ~/.tribe/-Users-home-repos-todd-skills/state/
            ├── idea-01-dual-skinner-cell.md   worktree: …/impl-idea-01
            ├── idea-02-context-isolation.md   worktree: …/impl-idea-02
            └── idea-03-input-asymmetry.md      worktree: …/impl-idea-03
```

- **3 states coexist** as 3 slug-named files in one shared `state/`; the filename *is* the card
  identity, so no collision. Each file's `worktree:`/`branch:` fields map it back to its checkout.
- **Sub-plan fan-out** (e.g. idea-02 splits into 2 disjoint sub-plans) adds transient worktrees
  that share the same `.git` → same key → same home, and write **no** new state file — the card's
  single file is the resume artifact. Sub-plan parallelism never multiplies state files.

## Edge cases & boundaries

1. **Assumption — linked worktrees, not separate clones.** The per-repo key assumes the tribe's
   shared-`.git` linked-worktree model. Three independent `git clone`s at different paths would
   have three `.git` dirs → three keys → fragmented state; `resume-check` from one clone would not
   see another's cards. The tribe never uses separate clones, so this is documented as the
   operating assumption, not handled.
2. **Encoding collision.** Slash→dash maps `/a/b-c` and `/a/b/c` to the same key — the same rare
   caveat Claude Code carries. Documented limitation; a `sha256(main_root)[:8]` suffix is the
   noted future hardening if it ever bites.
3. **Post-ship residue** is handled by the archive lifecycle (Decision 4).

## Touchpoints

- **New:** `plugins/tribe/scripts/tribe-home.sh`, `plugins/tribe/scripts/migrate-state.sh`.
- **Edit:** `plugins/tribe/scripts/resume-check.sh`; `plugins/tribe/agents/warchief.md`,
  `shaman.md`, `hunter.md`; `plugins/tribe/README.md` (document `~/.tribe/`); repo `.gitignore`.
- **Tests:** `test-resume-check.sh` (home model + fallback), `test-disagreement-routing.sh`,
  `test-review-cell-v3.sh` (state-path phrasing); new `test-tribe-home.sh` (main vs linked
  worktree ⇒ same key) and `test-migrate-state.sh`.
- **Rollout in this repo doubles as dogfood:** migrate `todd-skills`' own historical
  `docs/tribe/state/*.md` to `~/.tribe/<key>/state/`, then `git rm --cached` + gitignore.

## C3 / architecture note

This shifts the boundary of ref `ref-docs-lifecycle`, which currently frames the tribe's memory
as "living in files" under `docs/tribe/`. Operational memory (resume state, reports) now leaves
the repo for `~/.tribe/`; only contracts stay in `docs/tribe/`. Implementation therefore runs
through C3's **ADR-first change flow**, updating `ref-docs-lifecycle` and component `c3-215-tribe`
accordingly.

## Out of scope

- Committing reports for auditability (the idea card's alt proposal) — superseded; audit trail is
  the archive dir + merged PRs.
- Any change to heartbeat/resume *logic* beyond path resolution and the archive step.
- Syncing `~/.tribe/` across machines.

## Success criteria (Definition of Done)

1. `git ls-files docs/tribe/state` is empty in a migrated repo; `docs/tribe/state/` is gitignored.
2. `tribe-home.sh` yields the identical key from the main checkout and any linked worktree.
3. `resume-check.sh` reads from `~/.tribe/<key>/state/`, falls back to the in-repo scan when the
   home is empty, and returns the same `next_action` verdicts as the pre-move baseline.
4. `migrate-state.sh` is idempotent and preserves every in-flight card's resume verdict.
5. Shipped cards archive to `~/.tribe/<key>/archive/` and drop out of the in-flight list.
6. All tribe evals + the touched scripts' tests pass; C3 `check` is clean after the ref/ADR update.
