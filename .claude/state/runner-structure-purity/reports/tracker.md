## Review: feat/runner-purity-wall (2436f69..90dddb9) — 13 files, 1 finding
Verdict: APPROVE-WITH-COMMENTS

Scope: `plugins/tribe/scripts/runner`, commits 464f449, 2586764, 24167d8, 5406a00, 90dddb9
(Tasks 2–6 of `docs/superpowers/plans/2026-07-23-runner-structure-purity.md`; Task 1's commit
`2436f69` is the diff base, not reviewed here). Project is TypeScript/Bun — `csharp-convention.md`
and `dry-composition.md` are scoped `paths: ["**/*.cs"]` and are N/A. `.c3/` exists in the repo but
has no rules bound to this diff's files (`c3 lookup` scope is Partners-repo-flavoured C3 content
unrelated to the runner; `pr-review.md`'s C3 clause is explicitly scoped to `prospa-group/Partners`)
— skipped as genuinely inapplicable, not un-consulted.

### Blockers
None.

### Should-fix
- `plugins/tribe/scripts/runner/run.ts:3-8` — stale file-header comment describes wiring this file no longer does
  - Rule: correctness/documentation-accuracy (Tracker mandate: "flag plain correctness bugs the diff introduces" — the plan itself frames the whole branch as making these boundaries *executable and legible*, and Global Constraint "Behavior-preserving throughout" implies docs of behavior shouldn't drift false)
  - Problem: after Task 3 (`2586764`) moved `sdkSpawnSession` out of `session.ts` into `session.adapter.ts`, and Task 5 (`5406a00`) moved all `node:fs`/`node:child_process` wiring out of `run.ts` into `run-io.adapter.ts`, this header comment was never updated. It still reads "`main()` below it is the real-world wiring — gh/git via `child_process`, the filesystem, the real SDK spawn (`sdkSpawnSession` from session.ts)... same precedent as session.ts's `sdkSpawnSession`" (lines 3-6). Both claims are now false: `run.ts` imports neither `node:fs` nor `node:child_process` (confirmed — `grep -n "child_process\|node:fs" run.ts` matches only this comment line), and `sdkSpawnSession` lives in `session.adapter.ts`, not `session.ts`. `structure.test.ts`'s own new guard ("run.ts is pure wiring: no node:fs / node:child_process import") passes precisely because the file no longer does what its own header says it does — the comment now contradicts the code next to it, on the exact axis (purity boundary) this whole change-unit exists to make legible.
  - Fix: reword lines 3-8 to describe `run.ts` as the composition root that wires `buildRealIo` (from `run-io.adapter.ts`) into `runLoop`, and drop the now-false `sdkSpawnSession`/`session.ts` reference (or point it at `session.adapter.ts`).

### Optional
- Comment discipline (team-lead's ask item "comments state constraints, not PR-narration"): no bound rule file encodes this for the runner today — the only matching artifact is `docs/tribe/planning/idea-10-meta-loop-tripwires/plan.md`'s "workaround-justification-comment" tripwire, which is unshipped planning (`plugins/tribe/scripts/tripwire-check.sh` does not exist; confirmed via `find`). Treating this as informal guidance rather than a citable rule: spot-checked every new/changed comment in the diff (`types.ts`, `brief.ts`, `session.ts`, `session.adapter.ts`, `run-io.adapter.ts`, `structure.test.ts`) — all state a constraint/rationale ("why", "enforced by X"), none narrate the PR itself ("this change adds…"). Clean, but noting it's an unenforced convention, not a rule violation either way.

### Checklist
| Rule | Result |
|------|--------|
| Commit format `[runner-purity-wall] <type>: <imperative subject>` (git-conventions.md + plan Global Constraints) | ✅ all 5 commits (464f449, 2586764, 24167d8, 5406a00, 90dddb9) |
| No Co-Authored-By / Claude attribution trailer (git-conventions.md; CLAUDE.md non-negotiable) | ✅ `git log --format=%b` empty for all 5 commits |
| Never commit plan file / `.claude/state/**` / `.c3/**` / `.okra/**` (CLAUDE.md; plan Global Constraints) | ✅ `git status` shows all three only as untracked, never staged in any of the 5 commits (confirmed via `git show --stat` per commit) |
| csharp-convention.md (`paths: **/*.cs`) | N/A — no `.cs` files changed |
| dry-composition.md (`paths: **/*.cs`) | N/A — no `.cs` files changed; informally confirmed no duplication anyway: `session.adapter.ts`/`run-io.adapter.ts` are pure *moves* of existing logic (old sites deleted in the same commit), not copies |
| `verbatimModuleSyntax` (tsconfig.json) — type-only imports use `import type` | ✅ every new/changed import inspected (`run-io.adapter.ts`, `session.adapter.ts`, `loop.ts`, `run.ts`) correctly separates/marks type imports |
| Test-first: red→green evidence per task (test-first.md) | ✅ Tasks 2,3,5: hunter reports show the guard test explicitly FAILing first (`bun test structure.test.ts` → 1 fail, with the exact expected file/reason), then passing after the fix. Task 6 (Amendment A3 path): shows explicit violation-injection proofs (`process.env` leak in `state.ts`, `process.exit` in `report.ts`) failing the right assertion, then reverting to green |
| Amendment A1 (test.todo needs `() => {}` 2nd arg for `@types/bun`) applied | ✅ `464f449`'s `structure.test.ts` diff shows all three remaining `test.todo(...)` calls carry `() => {}` |
| Amendment A2 (`report.ts` third fallout) applied | ✅ `24167d8` includes `report.test.ts` with the `BRIEF_TEMPLATE_PATH` branch on both inline `LoopIO` fixtures (lines ~542, ~637) |
| Amendment A3 (no eslint/typescript-eslint added; `check` = `tsc --noEmit && bun test`; ambient-state seal as script tests) | ✅ `package.json` diff adds only `check`, no `lint`/eslint deps; `bun.lock` untouched; `90dddb9` adds the two ambient-state-seal tests to `structure.test.ts` instead |
| Suite green at every commit / overall (plan Global Constraint) | ✅ `bun run check` on HEAD: `bunx tsc --noEmit` clean, `bun test` → **182 pass, 0 fail, 493 expect() calls** (matches 180 baseline-after-Task-1 + 2 new Task-6 tests, exactly as `90dddb9`'s own report claims) |
| Correctness (no bugs introduced) | ❌ `run.ts:3-8` stale header comment (see Should-fix) — no runtime/test-breaking bug found otherwise |
| Writing-voice.md | N/A — no PR description/Jira/comment prose produced in this diff to review |
