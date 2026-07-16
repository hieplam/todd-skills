# Campaign Runner — implementation effort STATE

**Status:** running
**Role in force:** Claude = **Warchief** (owner ruling, 2026-07-16). Dispatches one Hunter per
plan task; never writes feature source itself; audits with skinners; opens PR; **regular merge**.
**Branch:** `feat/campaign-runner` (base: `master` @ 48d691e)
**Plan:** `docs/superpowers/plans/2026-07-16-campaign-runner.md`
**Design (frozen — do not re-open):** `docs/superpowers/specs/2026-07-16-campaign-runner-design.md`
**Why/lessons:** `docs/superpowers/specs/2026-07-16-campaign-runner-context.md`

## Owner directives in force

3. **"Move to `plugins/tribe/scripts/runner/`"** (2026-07-16, in response to the Warchief's
   install.sh finding). The spec's `plugins/tribe/runner/` is NOT in install.sh's component
   whitelist (`agents|skills|claude-md|hooks|.claude-plugin|scripts|evals`, lines ~106-118) →
   every `./install.sh tribe` would warn *"unsupported component type — not installed"*,
   conflicting with `ref-plugin-layout` (a BINDING ref on c3-215). `scripts/` is the ref's
   documented home for "repo-invoked, NOT installed" code = exactly what the runner is.
   ⇒ spec + plan docs get updated to the new path; `TRIBE_PLUGIN_DIR` must still resolve to
   `plugins/tribe`.
4. **"Fix the squash drift in this change-unit"** — `c3-215`'s Goal + Business Flow say the
   tribe ends in **"squash-merged"** PRs, contradicting the owner's standing no-squash rule AND
   the runner's own D3 point 2 (fails any merge lacking 2 parents). Correct it via block
   patches in the SAME change-unit that adds the runner.

1. **"this should be implemented in todd-skills, tribe plugin, and mention in ai-dict was a
   mistake"** — the entire effort lands in `plugins/tribe/runner/`. **No ai-dict repo work, no
   ai-dict seed PR, no ai-dict smoke.** Task 7's ai-dict smoke is struck from the plan; its
   docs + C3 change-unit survive. Campaign *instance* data (state JSON, specs, answers) still
   belongs to a target repo at run time via CLI inputs — it is simply not this repo's job to
   author ai-dict's copy.
2. **"you are a warchief, drive your tribe to implement this task by task"** — Hunter per task,
   TDD, audit each deliverable before accepting.
3. Global: **no squash merge**; no Co-Authored-By / attribution footer.

## Commit convention (plan §, matches repo history)

`feat(tribe): campaign runner — <task summary>` — conventional commits, no `[Branch]` prefix.
(The plan explicitly pins this as the repo's style; repo history at 2db41f8/5b16e19 confirms.)

## Task status

| # | Task | Status | Report |
|---|------|--------|--------|
| 1 | Scaffold + dependency (`package.json`, tsconfig, empty modules) | ✅ shipped `b264495` (audited: gates re-run green, stateless grep clean) | `reports/task-1.md` |
| 2 | `state.ts` — schema, load, next-card | ✅ shipped `78d2591` (audited: unknown-field preservation + version rejection probed directly, both hold) | `reports/task-2.md` |
| 2b | `state.ts` — reject sequence naming an undefined card (audit finding) | ✅ shipped `cf5a859` (audited: probed — now throws `UndefinedSequenceCardError`) | `reports/task-2b.md` |
| 3 | `verify.ts` — D3 six-point replay | ✅ merged + **F1/F2/F4 fixed** (`89c8e6b`) — audited: `gh api repos/{owner}/{repo}/pulls/<pr>` verified live; empty `docsOnlyPaths` fails closed | `reports/task-3.md`, `task-3-fix.md` |
| 4 | `github.ts` — deterministic docs-PR helper | ✅ merged + **F3 fixed** (`87ce1e0`) — audited: `checkout -B` from fresh `origin/<base>`, base restored on EVERY exit path, outcome survives cleanup failure | `reports/task-4.md`, `task-4-fix.md` |
| 5 | `brief.ts` + `session.ts` | ✅ merged `2bbfe92` — **accepted**; all §D1 SDK facts verified against installed `sdk.d.ts` | `reports/task-5.md` |
| 6 | `loop.ts` + `run.ts` — loop, resume matrix, escalation | ✅ merged `097d36b` — **113 tests**; audited: acceptance #5 verified (no SDK/model import in loop/run) | `reports/task-6.md` |
| 6b | Relocate runner → `plugins/tribe/scripts/runner/` (owner directive 3) | ✅ merged `c1a9ad5` — audited: TRIBE_PLUGIN_DIR probed live (resolves to `plugins/tribe`; plugin.json + agents/warchief.md reachable); installer walk simulated = zero warnings; `git mv` preserved history | `reports/task-6b.md` |
| 7a | C3 change-units (Warchief-authored) | ✅ committed `e087cb7` — both units applied; `c3-215` `ok: true`; zero surviving "squash-merged" claims | — |
| 7b | Docs — runner README + tribe README section | 🔄 in flight (hunter-task7) | `reports/task-7.md` |

## Anti-goals / walls

- **Stateless capability (non-negotiable, owner's skill-authoring rule + acceptance #6):** no
  repo name, path, model, or campaign value hardcoded in `plugins/tribe/runner/`. Everything is
  a CLI input. Final gate: grep the source clean of `ai-dict`.
- **No LLM calls from the loop itself** (acceptance #5) — model usage only inside spawned sessions.
- SDK options pinned in exactly ONE module (`session.ts`), the spec §D1 block verbatim.
- Every world-touching call (`gh`, `git`, SDK) behind an injected `exec`/`spawnSession` seam.
- Hunters build **only** their brief — no adjacent improvements.

## Next action

Tasks 1-5 + 2b are all merged into `feat/campaign-runner` @ `2bbfe92` (**50 tests green, tsc
clean**). Two fix Hunters in flight in worktrees (F1/F2/F4 on verify.ts; F3 on github.ts) —
NOTE both worktrees started at `48d691e` (pre-runner); briefs instruct `merge --ff-only
feat/campaign-runner` first, so **verify their merge-base on report**.

Then, in order:
1. Audit + merge both fix branches; re-run the full suite.
2. **Real-CLI sweep (Warchief, NOT in the plan — added because of F4).** `verify.ts` portion
   ✅ DONE — every command executed against this real repo, all confirmed correct as written:
   - `git rev-list --parents -n 1 48d691e` → 3 tokens (sha + 2 parents) ⇒ `tokens.length - 1
     == 2` is right; a squash yields 2 tokens ⇒ 1 parent ⇒ fail. **No-squash detection works.**
   - `git merge-base --is-ancestor` → exit 0 as assumed.
   - `git worktree list --porcelain` → emits `branch refs/heads/<name>` verbatim; matches the
     module's exact string compare.
   - `git ls-remote --heads origin <branch>` → sha+ref when present, EMPTY when absent;
     matches `stdout.trim().length > 0`.
   ⇒ `gh api` was the ONLY bad invocation in verify.ts. **Still TODO: the same sweep over
   `github.ts`'s commands after the F3 fix merges** (`gh pr create/merge/edit`, `git push`,
   `git checkout -B`, `git pull --ff-only`) — note the mutating ones cannot be safely run
   against a real repo, so bound the sweep to read-only probes + `--dry-run`/`--help` shape
   checks and SAY SO rather than claiming coverage the sweep didn't reach.
3. Task 6 (`loop.ts` + `run.ts`) — depends on all of 2-5. Brief MUST constrain
   `commitStateAndMerge` callers to state/escalation files only (else github.ts's
   by-construction docs-only assumption breaks D6's "code never auto-waives").
4. Task 7 — docs + C3 change-unit for `c3-215-tribe` (CLI-only). **Surface the live-smoke
   acceptance gap to the owner here** — do not report the effort done without it.
5. PR + **regular merge** (no squash).

## Open audit findings (Warchief — must clear before PR)

- **F1 — hardcoded `docs/` prefix (stateless-wall violation).** `verify.ts`'s `isDocsOnlyDiff`
  decides "docs-only" via `files.every(f => f.startsWith('docs/'))`. That bakes the TARGET
  repo's directory layout into the capability — owner anti-goal #1 bans hardcoded file paths.
  It gates the D6 waiver, so it is load-bearing, not cosmetic. Fix: make the docs-only path
  set **campaign config** (state file → `VerifyConfig`), same as `schemaLockPaths` already is.
  **Check `github.ts` (Task 4) for the same repeat before fixing — batch both.**
  - Judged ACCEPTABLE by contrast: `isSonar504Signature`'s `/sonarcloud/i` + `/504/` literals.
    Spec §D6 codifies that exact signature as policy, so it is design-mandated, not invented.
  - `github.ts` does NOT repeat F1 — it treats docs-only as satisfied *by construction* (it
    only ever commits campaign state files). Defensible, but it means the precondition is
    ASSUMED, not verified: if Task 6's loop ever passes a non-state file, it would waive a
    sonar red on a code diff — the one thing D6 forbids absolutely. → **Task 6 brief must
    constrain `commitStateAndMerge` callers to state/escalation files only.**

- **F2 — the two modules disagree on gh's `skipping` bucket.** `github.ts`: `bucket !== 'pass'
  && bucket !== 'skipping'` (skipped = non-blocking). `verify.ts`: `bucket !== 'pass'` (skipped
  = FAILURE). Same concept, two behaviors, in one capability. A path-filtered workflow
  reporting `skipping` is routine, so verify.ts would escalate healthy cards.
  **Warchief ruling (How, mine to make): skipped is NON-BLOCKING — unify verify.ts to
  github.ts's behavior.** A skipped check is not a red check; D3's "concluded success" targets
  failures, not path-filter skips. Surface the ruling to the owner (it is CI policy adjacent to
  their B5 flake ruling) but do not block on it.

- **F3 — `github.ts` is not idempotent across runs; breaks D5's mandated retry.** Line 185 does
  `git checkout -b campaign-state/<card>`, but the only `git checkout <base>` (line 295) is on
  the SUCCESS path. On `escalate` and on EVERY `commit_failed` return, the target repo is left
  ON the campaign-state branch with that branch still existing locally. D5 says "the next run
  retries the commit first" — that retry re-runs `checkout -b` against an existing branch,
  which fails → `commit_failed` **forever**. The escalation path is exactly where this fires,
  since the usual cause of escalation is broken CI. Fix: make branch creation idempotent
  (recreate/reset the state branch) and restore the base branch on every exit path.
  Tests cover "checkout -b fails → commit_failed" (the symptom) but not the stale-branch retry.

- **F4 — 🔴 CAMPAIGN-STOPPING: `gh api pulls/<pr>` 404s.** `verify.ts` point 1 copied spec §D3's
  shorthand literally. **Verified against the real CLI** (gh 2.92.0, this repo):
  - `gh api pulls/36` → `{"message":"Not Found","status":"404"}`
  - `gh api repos/{owner}/{repo}/pulls/36` → `{"merged":true,"merge_commit_sha":"48d691e..."}`
  `gh api` resolves paths against the API root, not the current repo; `{owner}/{repo}` are gh's
  own placeholders. Impact: point 1 fails for EVERY card → every card fails verify twice →
  escalates → the campaign wedges on card 1, unattended, forever. **All 25 mocked tests pass
  over it** — the mock returns the shape the Hunter imagined. Fix: use
  `repos/{owner}/{repo}/pulls/<pr>`. (Spec §D3's wording is fine as shorthand; it is wrong as
  literal code. Correcting the invocation is How = Warchief authority, not a design re-open.)
  - Verified OK by contrast: `gh pr checks --json name,bucket,description` — all three are real
    fields (`gh pr checks --json` lists: bucket, completedAt, description, event, link, name,
    startedAt, state, workflow). `gh pr create/merge/edit/checks` are repo-aware; only `gh api`
    needs the explicit path.

## Accepted-with-caveat (Task 6 — NOT blocking, but do not lose)

- **`verifyWithRetry` retries with ZERO delay.** `loop.ts:449` calls `verifyShipped` twice
  back-to-back. That DOES catch a transient `gh`/network blip (the retry re-hits the API), but
  it CANNOT catch the likelier transient — CI still settling — because nothing changes in
  microseconds. Satisfies D5's literal "fails twice" without fully serving its intent. If
  spurious escalations ever appear in practice, route the retry through a sleep seam (github.ts
  already has one) rather than removing the second attempt.
- **`baseBranch` falls back to the literal `'master'`** (`loop.ts:410,413`) when
  `git symbolic-ref --short refs/remotes/origin/HEAD` fails. Mild stateless smell: a repo on
  `main` whose symbolic-ref query fails would get a wrong branch and fail at `git fetch`. Fails
  loudly (not silently wrong), so accepted. Deriving it dynamically was the right call — spec §2
  has no `--base-branch` flag.
- **Session `error`/`timeout` with no D4 fallback ⇒ exit 3 soft-stop, NOT a D5 escalation.**
  Defensible: §D5's trigger list is exhaustive and does not name it, and there is nothing for a
  human to rule on. Flagged because it is an invented exit path not in the spec.

## C3 outcome (Task 7a — landed `e087cb7`)

Two units against `c3-215`, both applied, `c3-215` now `ok: true`:

1. `adr-20260716-fix-derived-materials-grounding` — repaired **pre-existing** drift (Derived
   Materials row 3 grounded on the Change Safety section, which the component canvas rejects).
   **Had to be its own unit:** the canvas gate validates each patch against the fact's CURRENT
   body, so one unit cannot both fix a violation and rely on it being fixed. Its rejection
   blocked all 4 runner patches even though none touched Derived Materials.
2. `adr-20260716-add-campaign-runner` — runner recorded as a Contract surface + a Change Safety
   row; **squash drift corrected** (Goal + Business Flow). Verified: zero surviving
   "squash-merged"; all 3 remaining "squashed" are "never squashed".

**Left alone deliberately — NOT this effort's scope, each needs its own ADR:** `c3-213` and
`c3-216` carry the SAME ungrounded-derivation drift (`c3x check` → 2 errors). They are
pre-existing and unrelated to the runner; fixing them here would smuggle unrelated changes into
a feature branch. **Surface to the owner.**

**C3 workflow gotchas (cost real time — remember):**
- A cite snippet containing **pipe characters** cannot be embedded in an ADR markdown table —
  it shatters the columns. Anchor on a pipe-free node instead.
- A cite snippet containing **backticks** loses them on write → "stale node hash or snippet".
  Same fix: pick a backtick-free node.
- `Evidence:cite` columns need **block** cites (`<id>#nNNN@vN:sha256:… "snippet"`), NOT entity
  anchors (`<id>@vN:sha256:…`).
- ADRs warn on **top-down incompleteness**: naming a component obliges naming its container +
  system, and every ref/rule the component cites.

## Smoke findings (live run against REAL GitHub — the harness the owner authorized)

Ran `run.ts --dry-run` against this repo's real PRs (#36 merged, #37 open). **Acceptance #1 is
PROVEN**: phases derive correctly from live GitHub with zero side effects —
C1(PR#36 merged, state `running`) → `verify_only`; C3(missing spec/plan) → `PLANNING_NEEDED`.

### PROVEN AGAINST REALITY (was: "never driven a real session")

- **D3 six-point replay vs REAL merged PR #36 → `shipped: true`, all 6 points PASS** with live
  `gh`/`git`: real `gh api repos/{owner}/{repo}/pulls/36`, real `gh pr checks`, and the real
  merge commit confirmed to have **2 parents** ⇒ the no-squash enforcement is real, not
  theoretical. The F4 fix works against reality.
- **Negative case vs OPEN PR #37 → `shipped: false`, EVERY failed point named** (no
  short-circuit) incl. correctly detecting the worktree + remote branch still present.
- **REAL Agent-SDK session spawned** (9s, scratch target repo): pinned §D1 options ACCEPTED by
  the real SDK; `onSessionStart` fired with a real SDK-assigned id
  (`684b5756-7299-4414-9208-65f70c583fdc`) ⇒ crash-safety handle is real; result parsed from
  the typed `result` message → `shipped`, pr `99`, sha `deadbee`.
- **`settingSources: ['project']` VERIFIED LIVE** — the session read the target repo's
  CLAUDE.md ("I read the project's CLAUDE.md"). This was one of the THREE SDK facts the PR#107
  spec got wrong; now proven against reality, not just against `sdk.d.ts`.
- **RESUME WORKS** — resuming the real session id, the session recalled its own prior context
  verbatim. **Bogus session id → typed `error` (`error_during_execution`), NOT a crash** ⇒
  D4's "resume fails → fresh" fallback is genuinely triggerable ("probe by attempting; never
  list" is sound).
- **D7 logging works** — log line 1 is the real `system/init` message carrying `session_id`.

### STILL UNPROVEN (honest)

- **`github.ts`'s `gh pr create` / `gh pr merge` / `git push` path.** Mutating; needs a real
  GitHub repo. **My token has `repo` but NOT `delete_repo`** — any throwaway repo I create is
  permanent litter in the owner's account, so I did not create one. This is the last
  significant untested surface.
- A full end-to-end card ship (session → verify → state PR → next card).
- The `.runner.lock` contention path and STOP file under a real run.

- **F8 — 🔴 open PR + no sessionId ⇒ blind `fresh` ⇒ DUPLICATE PR.** Violates acceptance #3
  ("restart resumes without duplicate PRs"). `deriveCardPhase` (`loop.ts:~166`) returns
  `{kind:'fresh'}` for an OPEN PR when `card.sessionId` is null, reasoning in-comment that it
  is "same as no trace". **It is not** — there IS a trace: an open PR on GitHub. A blind fresh
  session doesn't know PR #37 exists and would open a SECOND PR for the same card.
  **Realistically reachable, not exotic:** §D2 makes mid-card `sessionId` writes LOCAL and
  uncommitted until the post-verify docs PR, so a fresh clone / new machine / lost local state
  yields exactly `sessionId: null` + open PR. Fix: spawn fresh **with a state digest** naming
  the open PR (D4's intent — `buildStateDigest` already exists and is used on the
  resume-failure path at `loop.ts:675`). Found by the smoke; **all 114 mocked tests pass over
  it** (nobody mocked OPEN + null sessionId).
- **F9 — absolute `--state` path silently mangled.** `--state` is repo-relative by design
  (spec §2), but an absolute path is joined onto repoRoot producing a nonsense path. Should be
  honored or rejected with a clear message.
- **F10 — missing state file ⇒ raw ENOENT stack trace**, not a clean "state file not found at
  X". Poor first-run UX for an unattended tool.

## Learnings bank

- **`bun test` hard-errors (exit 1) on zero test files** — not a soft pass. Hence Task 1's
  `placeholder.test.ts`; each task that adds a real test should delete it (Task 2 does).
- **Repo commit trailers are real convention:** `Tribe-Card:` / `Tribe-Task: N/M` appear in
  history (`idea-11-review-cell-v3`). Keep them; they are not over-building.
- **`bunx tsc --noEmit` needs `@types/bun` + `typescript` as devDeps** to pass deterministically
  offline. `typescript` resolved to the `^7.0.2` native line; gate passes.
- **🔑 THE BIG ONE — mocked seams cannot validate the commands themselves.** F4 (`gh api
  pulls/<pr>` → 404) passed 25 green tests and would have wedged the campaign on card 1. A mock
  returns the shape its author imagined, so a mocked suite proves the LOGIC and says NOTHING
  about whether the invocation is real. **Every `gh`/`git` command string in this runner must be
  executed once against the real CLI before it is trusted.** This is the concrete, already-paid-
  for argument for the live-smoke gap below — treat it as evidence, not theory.
- **SDK facts (Task 5) verified against the installed `sdk.d.ts`, not memory** — all hold:
  `session_id: string` IS on `SDKSystemMessage` (init); `SettingSource = 'user'|'project'|
  'local'`; `executable?: 'bun'|'deno'|'node'`; `bypassPermissions` requires
  `allowDangerouslySkipPermissions`; `SDKResultSuccess` carries `result: string` + `subtype:
  'success'`. Note other `type:'system'` messages exist (`task_notification`, `task_progress`)
  — narrowing on `subtype === 'init'` is REQUIRED, not incidental.
- **Acceptance gap to surface at Task 7 (owner decision):** plan acceptance #1-#4 (dry-run
  against live GitHub, card ships end-to-end, kill-9 resume, forced escalation) were all written
  against the live ai-dict campaign, which directive 1 strikes. Tasks 1-6 are unit-tested behind
  mocked seams only — **"the runner actually drives a real session" will be unproven** by
  anything in this repo. Do NOT silently report the effort as done without flagging this.
