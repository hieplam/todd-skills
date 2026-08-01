# Campaign orchestration state moves to `~/.tribe`; specs/plans adopt the host repo's convention — design

- **Date:** 2026-08-01
- **Status:** approved (Shaman authority, brainstormed with owner 2026-08-01)
- **Completes:** [`2026-07-19-tribe-local-progress-home-design.md`](2026-07-19-tribe-local-progress-home-design.md)
  — that design ratified the principle and moved `docs/tribe/state/`, but the campaign runner
  (built 2026-07-16, three days earlier) kept its own operational state in the consuming repo and
  was never brought under the ruling. This is the unfinished half of that rollout.
- **Owner rulings (2026-08-01):** (1) specs/plans stay committed but adopt the host repo's existing
  convention — `docs/tribe/*` is killed; (2) no GitHub epic issue and no campaign label — "specs
  should describe that, not github pr"; (3) already-merged `docs/tribe/` trees get a cleanup PR
  after the fix lands.
- **Shaman ruling (2026-08-01, owner may veto):** a `Campaign: <slug>` commit trailer is IN — see §6.

## 1. Problem

The campaign runner writes its operational state into the **consuming repo's working tree** and
git-commits it. Observed live on the `kanna-session-import` campaign (kanna PRs #582–#588,
merged 2026-07-30):

**Symptom A — orchestration exhaust is committed to the product repo forever.**
`git ls-files docs/tribe/` in `cuongtranba/kanna` returns 16 files. Five of them are escalation
records whose entire content is runner plumbing:

```
# Escalation: foundation
**Reason:** verify_failed_twice
## Context
- mergeShaAncestorOfMaster: 79b9460d7fcd46ea9f3ed978ee92b602830ec5f7 is NOT an ancestor of
  origin/master (git merge-base --is-ancestor exit 128)
```

That is a `--remote` misresolution in the tribe's own runner (diagnosed and fixed separately in
[`2026-07-31-runner-remote-resolution-design.md`](2026-07-31-runner-remote-resolution-design.md)).
It has no bearing on Kanna's product, yet it is in Kanna's `main` permanently. `answers.md` is in
there too, containing **zero rulings** — a scaffold that was committed and never used.

**Symptom B — two of seven PRs carried no product code.**
The campaign shipped as 7 PRs: #582 (Stage-A docs staging), #583–#587 (5 feature cards), #588
(final state record). #582 and #588 exist **only** to carry orchestration state into git — 29% of
the campaign's PR count, zero product value, and the specific thing the owner flagged as making
the feature hard to trace and revert.

**Symptom C — the split of "instance data" is already incoherent.**
`plugins/tribe/scripts/runner/README.md:17` states the rule:

> The campaign **instance** data (the state JSON, specs, plans, `answers.md`, escalation files)
> lives in the **target repo**, never in this plugin. That's the split: the loop belongs to the
> tribe, the memory belongs to the project.

But the runner *already* writes per-card worker reports to `<home>/reports/<cardId>.md` and run
records to `<home>/runs/<run-id>/run.json` — machine-local, under `~/.tribe`. So two artifacts of
identical character (a per-card report, a per-campaign report) have different homes, and no
principle distinguishes them. The word "instance data" conflates two classes that the
2026-07-19 design had already separated:

| Class | Examples | Belongs in |
| --- | --- | --- |
| **Contracts** — reviewable history, durable, useful to a human reader | SPEC, plans, ADRs, decision log | git |
| **Operational events** — machine bookkeeping, per-run, useful to the runner | state JSON, reports, escalations, lock, STOP, run records | `~/.tribe` |

**Symptom D — the runner's state auto-commit has never worked.**
`2026-07-31-runner-remote-resolution-design.md` §1 records: *"The runner's own state-auto-commit
(`core/github.ts`'s `commitStateAndMerge`) never once succeeded across 6 runs."* The entire
commit path — plus the D6 SonarCloud waiver that exists only to let its docs-only PRs merge red —
is dead weight that has never delivered its function even once.

**Symptom E — Tribe squatted a doc namespace the host repo didn't ask for.**
Kanna already has `docs/specs/`, `docs/plans/` (superpowers convention) and `.c3/adr/`. Tribe
invented a third: `docs/tribe/planning/<slug>/`. Worse, `answers.md` in that tree admits
*"Ground truth for the project lives in `~/Downloads/kanna-session-import/`"* — so the committed
specs were a stale copy of documents that lived outside the repo entirely.

## 2. Frame (reverse-tornado)

- **Objective:** a completed campaign leaves **zero orchestration-state files** in the target
  repo's working tree, while every card remains traceable from the repo alone.
  *Measure:* after a campaign closes, `git ls-files` in the target repo matching
  `campaign-state.json|campaign-report.*|escalations/|answers.md` returns **0 paths**, AND
  `git log --grep="Campaign: <slug>"` returns **one commit per shipped card**.

- **Anti-goals (walls, with metrics and types):**

  | # | Wall | Metric | Type | Activation |
  | - | --- | --- | --- | --- |
  | AG-1 | **No traceability regression.** The repo must not end up knowing *less* about a campaign than it does today. | `git log --grep="Campaign: <slug>"` returns ≥1 commit per shipped card; SPEC lists every card | tripwire | always |
  | AG-2 | **No design-rationale loss.** SPEC and plans stay in git, readable by a teammate with no `~/.tribe`. | `git ls-files docs/specs docs/plans` contains the campaign's SPEC + every plan | tripwire | always |
  | AG-3 | **Resume parity.** A crash-resume of an in-flight campaign yields the same phase verdicts as before the move. | `--dry-run` next-action output identical pre/post-migration on a fixture campaign | tripwire | on runner change |
  | AG-4 | **No silent state loss on repo move.** `~/.tribe` keys on the main-worktree absolute path; a moved/renamed repo orphans its campaign. | runner exits non-zero with a named diagnostic when `--home` exists but holds no state for a campaign it is asked to resume | drift gauge | on runner change |
  | AG-5 | **Suite + purity green.** `structure.test.ts` import-layering and `bun run check` stay green; no new world-touching code outside `adapters/*.adapter.ts`. | `bun run check` exit 0 | tripwire | on code touched |
  | AG-6 | **Integrity.** No bypassing, weakening, or faking the walls above. | `anti_goal_bypass_or_dishonesty_count == 0` | tripwire | always |

- **Human-only frame:** the three owner rulings in the header, plus every wall above. The
  implementer may not relax a wall; hitting the objective by deleting traceability (e.g. dropping
  the trailer and calling AG-1 satisfied because nothing references the campaign) is a failed run,
  not a win.

## 3. Ratified decisions

| # | Decision | Choice | Rationale |
| - | --- | --- | --- |
| 1 | **State location** | `<home>/` — i.e. `~/.tribe/<repo-key>/campaigns/<slug>/` | Already exists, already holds `runs/` + `reports/`. Removes Symptom C's incoherence by making it the single home for *all* operational events. |
| 2 | **CLI shape** | **Delete** `--state`, `--answers`, `--escalations-dir`. Fixed names under `--home`. Required flags drop 6 → 3 (`--repo`, `--model`, `--home`). | Once these live under `--home` at fixed names they are no longer environment-specific, so the stateless-capability wall ("no defaults for environment-specific values") does not apply — `--home` carries the only variable part. Removes a whole class of misconfiguration. |
| 3 | **State auto-commit** | **Deleted entirely**, along with the D6 SonarCloud docs-only waiver that depends on it. | Never succeeded once in 6 runs (Symptom D). With state out of the repo there is nothing left to commit. |
| 4 | **Specs/plans** | Stay in git, in the **host repo's discovered convention** (`docs/specs/` + `docs/plans/` where present). `docs/tribe/planning/` is killed. | Owner ruling. Preserves AG-2 while ending the namespace squat (Symptom E). |
| 5 | **Card→commit traceability** | `Campaign: <slug>` git trailer on every card commit. No epic issue, no label. | Owner rejected GitHub objects. Without *something*, decisions 1+4 drop repo traceability to zero — see §6. |
| 6 | **Existing `docs/tribe/` trees** | Separate cleanup PR per affected repo, after this lands. | Owner ruling. Out of scope for this design. |

## 4. Design — the new path contract

```
~/.tribe/<repo-key>/campaigns/<slug>/          ← --home, unchanged derivation (tribe-home.sh)
  campaign-state.json                          ← MOVED from <repo>/<--state>
  answers.md                                   ← MOVED from <repo>/<--answers>
  escalations/<card-id>.md                     ← MOVED from <repo>/<--escalations-dir>/
  campaign-report.json                         ← MOVED from "next to the state file"
  campaign-report.md                           ← MOVED from "next to the state file"
  .runner.lock                                 ← MOVED (was next to the state file)
  STOP                                         ← MOVED (was next to the state file)
  reports/<card-id>.md                         ← unchanged, already here
  runs/<run-id>/run.json                       ← unchanged, already here
  runs/<run-id>/logs/                          ← unchanged, already here

<target-repo>/
  docs/specs/YYYY-MM-DD-<slug>-design.md       ← host convention, committed
  docs/plans/YYYY-MM-DD-<slug>-<card>.md       ← host convention, committed
```

`tribe-home.sh`'s key derivation is **unchanged** — this design adds no new path math. Every
worktree of one repo still collapses to one home.

`run.json`'s `statePath`/`answersPath`/`escalationsDir` fields keep their names and stay absolute;
only the directory they resolve under changes.

**The viewer should need no change — prove it, don't assume it.** `scripts/viewer/adapters/scan.adapter.ts`
reads each campaign's `runs/*/run.json` and reaches every other artifact **through that run's
recorded absolute paths**, deriving `campaign-report.json`/`STOP` as siblings of `statePath`
(`core/model.ts:32` — *"Contents of `campaign-report.json` next to the state file"*). Because
state, report, STOP, and escalations all move to `<home>` **together**, both the recorded
absolutes and the sibling derivation stay valid. The viewer is therefore a **regression target,
not a work item**: its existing suite must stay green untouched, and if any viewer source change
turns out to be required, that is a signal the move broke the indirection and must be reported,
not patched around.

Two other consumers take the state path as an explicit argument and need only doc updates, not
code changes: `scripts/kanna/list-session-ids.sh` and the `orchestrate-campaign` skill.

## 5. What gets deleted

Deleting the commit path is the bulk of the diff. The implementer must confirm each of these is
dead before removing it, and must not remove anything still reachable:

- `core/loop.ts`'s `commitState` and its call sites in `core/loop/card-actions.ts`.
- `core/loop/commit-guard.ts` (the D6/D5 commit wall) — exists only to restrict `commitState`'s
  file list to `.json`/`.md`.
- `core/github.ts`'s `commitStateAndMerge` and the **D6 SonarCloud docs-only waiver**. The waiver
  is documented in the runner README's "Known limitations" as *"assumes its diff is docs-only by
  construction, not by inspection"* — with its only call site gone, the waiver is not just dead but
  actively unsafe to leave reachable.
- `StateCommitFiles` in `core/types.ts` and every reference.
- Every test asserting commit/PR behaviour for state files.

**Wall:** `github.ts`'s *card-PR* handling (`gh pr create`/`merge` for actual feature cards) is
NOT in scope and must remain untouched. Only the *state-commit* path goes.

## 6. The commit trailer (Shaman ruling — §3 decision 5)

The owner ruled "specs should describe that, not github pr." Taken alone with decisions 1 and 4,
that produces a traceability regression, because today's SPEC does **not** describe it:
`kanna/docs/tribe/planning/kanna-session-import/SPEC.md:55-64` names the cards *"PR A / PR B /
PR C / PR D"* and was never backfilled with `#583`/`#584`. The card→PR→sha mapping existed
**only** in `campaign-state.json` and `campaign-report.json` — the two files this design moves to
`~/.tribe`. Move them with no replacement and the repo retains no record of which commits belong to
the campaign, which trips AG-1.

**Ruling:** every commit a card's executor session makes carries a git trailer:

```
Campaign: kanna-session-import
```

Recovery is then `git log --grep="Campaign: kanna-session-import"` — in-repo, permanent, no GitHub
API, no epic issue, no label, and no docs PR. It satisfies the owner's constraint (git metadata is
not a "github pr") while holding AG-1.

The trailer is injected via the executor brief (`core/brief.ts`), which already receives the
campaign slug — **not** by the runner rewriting commits after the fact.

**Owner may veto.** If vetoed, AG-1 must be satisfied another way *within the repo*, or the
objective is unreachable and this design should not ship as written.

## 7. Migration

`plugins/tribe/scripts/migrate-campaign-home.sh` is the closest precedent: it already moves a
repo's `<repo>/.claude/state/<campaign>/reports/*.md` into
`$(tribe-home.sh <repo>)/campaigns/<campaign>/reports/`, is idempotent, supports `--dry-run` and
`--campaign <slug>`, refuses to overwrite an existing destination (prints `CONFLICT`, non-zero
exit, continues other campaigns), and refuses to touch a campaign whose `.runner.lock` is held by
a live pid. **Extend that script** — do not write a third migrator (`migrate-state.sh` is the
2026-07-19 one for `docs/tribe/state/` and is a separate concern).

The extension moves a repo's campaign operational files (`campaign-state.json`, `answers.md`,
`escalations/`, `campaign-report.*`) into `<home>/`, leaving specs/plans in place for the human to
relocate into the host convention. Every existing guarantee above (idempotent, `--dry-run`,
CONFLICT-refusal, live-lock refusal) must extend to the new file set — they are the reason to
reuse this script rather than start fresh.

Read-time fallback is **not** required here: unlike the 2026-07-19 case there is no live campaign
to preserve (`kanna-session-import` closed 2026-07-30, every card `shipped`). A runner asked to
resume a campaign whose `<home>/campaign-state.json` is absent must **fail loudly with a named
diagnostic** naming the expected path (AG-4), never silently start a fresh campaign.

## 8. C3 documentation impact (required, not optional)

`.c3/c3-2-plugins/c3-215-tribe.md` currently asserts the behaviour this design removes, and will
be factually wrong the moment the code lands. At minimum these rows drift:

| Line | Current claim | After |
| --- | --- | --- |
| `:72` | `--repo, --state, --model, --answers, --escalations-dir, --home, ...` | required flags are `--repo`, `--model`, `--home`; the three path flags are gone |
| `:72` | *"script-verified SHIPPED, **state committed to the target repo**"* | no state is committed; the runner makes no commits of its own |
| `:72` | *"campaign-report.json plus its .md twin are written **next to the state file**"* | written under `<home>` |
| `:72` | *"the campaign instance lives in the target repo, never here"* | operational state lives in `<home>`; only specs/plans stay in the repo |
| `:51` | *"Stage A authors the specs, plans and campaign state, **landing them as a docs PR**"* | Stage A lands specs/plans only, in the host repo's convention; campaign state is written to `<home>`, never PR'd |
| `:88` | risk row names `github.ts (D6 retry/waiver)` as an edit trigger | the D6 *waiver* is deleted; the retry/poll path stays |

This must go through the C3 change-unit flow (`/c3` → ADR + change units + `c3 check`), not a
hand-edit of the component file. Per the project's C3 rule, **never hand-write a registry line or
a `.c3/documents/debt/` file.**

Known hazard, carried from the kanna campaign's PR #587 evidence: `c3 change apply` can fail on
pre-existing block-anchor drift, and `c3 repair` has been observed to **silently delete unrelated
pending change-unit patch files repo-wide**. If `apply` blocks, hand-apply the patch text and
verify with `c3 check --only c3-215`; do **not** reach for `c3 repair`.

## 9. Out of scope

- The Kanna cleanup PR (decision 6) — separate work, separate repo.
- Any change to card-PR creation, merging, or the D3 verify checks.
- `tribe-home.sh`'s key derivation, and the repo-move fragility it implies (AG-4 only requires a
  loud failure, not a fix).
- The `<repo-key>` collision caveat documented in the 2026-07-19 design.
