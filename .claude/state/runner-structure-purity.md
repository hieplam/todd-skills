# STATE — runner-structure-purity (Warchief campaign)

LOCAL-ONLY: never commit this file or anything under .claude/state/.
(RESTORED 2026-07-23 after unexplained deletion — see Anomaly log.)

## Status: COMPLETE — both CUs SHIPPED (2026-07-23)

## Owner directives in force (owner's words where ruling)
1. "agree with both, go with your recommendation" — flat dir + `*.adapter.ts` convention (no folders); two change-units: structure first, then loop readability.
2. "apply the purity of kanna, take its core hard rule, bring it to this runner" — hard mechanical enforcement (ast/script per owner's framing).
3. "now you're a warchief, dispatch hunters and follow tribe workflow" — one Hunter per plan task (TDD), two independent Skinner audits before PR, Warchief never writes feature code.
4. Global: regular merge only (2-parent merge commit), no Co-Authored-By, commit prefix `[runner-purity-wall]` / `[runner-loop-readability]`, never commit superpowers/C3/.okra artifacts.

## Plan (single source of task truth)
docs/superpowers/plans/2026-07-23-runner-structure-purity.md (LOCAL-ONLY, untracked) + Amendments A1-A3.
Baseline verified 2026-07-23: `bun test` = 172 pass / 0 fail / 8 files.

## Task board
| Task | What | Status | Evidence |
|---|---|---|---|
| CU1 T1 | structure.test.ts guard (4 live + 4 todo) | ✅ 2436f69, verified 176p/4todo/0f | reports/task-1.md |
| CU1 T2 | EXIT_* → types.ts kernel | ✅ 464f449, verified tsc-clean + 177p/3todo/0f (NEEDS_DIRECTION → A1) | reports/task-2.md |
| CU1 T3 | session.adapter.ts split | ✅ 2586764, verified 178p/2todo/0f, session.ts SDK-free | reports/task-3.md |
| CU1 T4 | brief.ts purity (inject template) | ✅ 24167d8, verified 179p/1todo/0f (stop → A2) | reports/task-4.md |
| CU1 T5 | run-io.adapter.ts extraction | ✅ 5406a00, verified 180p/0todo/0f + CLI smoke | reports/task-5.md |
| CU1 T6 | ambient-seal wall + check script (A3) | ✅ 90dddb9, verified check-green 182p/0f | reports/task-6.md |
| CU1 T7 | audit gate + close-out | ✅ SHIPPED — fixes 6c87d4e+69aaac1; ADR adr-20260723-runner-purity-wall (local); PR #46 merged 5b2b595 (parents 28e5fb9 69aaac1 = regular merge); master synced | reports/task-7-fix.md |
| CU2 T8 | runLoop table of contents | ✅ baf9fa4, verified check-green; runLoop 128→35 lines | reports/task-8.md |
| CU2 T9 | CardCtx parameter object | ✅ a417598, verified check-green 185p/0f, −16 net lines | reports/task-9.md |
| CU2 T10 | derivePhaseConfigOf helper | ✅ 5bf9a73, verified check-green 185p/0f | reports/task-10.md |
| CU2 T11 | delete maxTurns plumbing | ✅ 9a0bf7d, verified check-green 185p/0f, maxTurns grep = 0 | reports/task-11.md |
| CU2 T12 | close-out | ✅ SHIPPED — PR #47 merged 39c3b1d (regular, parents 5b2b595 9a0bf7d); master gate green 185p/0f; branches deleted; ADR updated | reports/skinner-d.md, tracker-cu2.md |

## CU2 audit adjudication
skinner-D: 0C/0I, 2 minors → both NO_CHANGE_NEEDED (plan-erratum: "~15-line" vs faithful 35-line runLoop; stale "11 tests" figure in dispatch brief). tracker-cu2: APPROVE, 0 violations. skinner-C: verification COMPLETE on transcript evidence (artifact discipline ✅, conventions ✅, config→resolved equivalence ✅, "fully closes out the audit emphasis items") but report initially lost to account session limit, later recovered in full: 0C/0I/1minor, corroborates the substance ruling; SDK-bundle grep proves maxTurns destructured-by-value (absent == undefined); its emphasis independently re-proven by Warchief (lock/STOP ordering preserved 868→874 vs 950→956; resolveRunContext throws inside the same lock try/finally; maxTurns absent-vs-undefined invisible to query(), the options object's only consumer). Gate ruled satisfied in substance.

CU2 branch feat/runner-loop-readability created from master@5b2b595; baseline verified: check green, 185p/0f.

## Audit adjudication (CU1, 2026-07-23)
Verdicts: tracker APPROVE-WITH-COMMENTS (0 blockers); skinner-B 0 critical/0 important (2 minor); skinner-A 0 critical/1 important/3 minor.
| Finding | Disposition |
|---|---|
| Guard misses dynamic import()/require()/side-effect/double-quoted forms (Sk-A Important) | CONFIRMED → hunter-t7 commit 1 (reproduce-first) |
| run.ts:3-8 stale header (tracker) | CONFIRMED → hunter-t7 commit 2 |
| adapter headers name never-created eslint.config.js (Sk-A+B) | CONFIRMED → hunter-t7 commit 2 |
| loop.ts:5 "confined to session.ts" stale (Sk-A) | CONFIRMED → hunter-t7 commit 2 |
| adapters exempt from orchestrator value-import rule (Sk-A Minor) | CONFIRMED → hunter-t7 commit 1 |
| T1 commit not tsc-clean in isolation (Sk-B Minor) | DEBT (disclosed A1/L-2; history immutable; Minor) |

## Anomaly log — RESOLVED
- Root cause found: 5 `git stash` entries (WIP @ 90dddb9, audit window) with untracked-file commits — Skinner B's per-commit bisection used `git stash -u` + checkout cycles in the shared worktree despite its read-only constraint, sweeping untracked local artifacts (plan, STATE, reports) into stashes without restoring them. All content restored (transcripts + t8's stash recovery); stashes verified fully-covered on disk, then cleared. Repo clean.
- Disposition: Skinner B's audit FINDINGS remain valid (evidence independently corroborated), but the method violated the dispatch constraint — see L-8.

## Workers
- hunter-t7 (audit fixes): report at reports/task-7-fix.md — IN FLIGHT
- Completed: hunter-t1..t6, skinner-a (report recovered from transcript — agent type lacks Write), skinner-b, tracker-cu1

## Next action
NONE — campaign complete. (Historical: verify hunter-t7's two commits (reproduce-proof + red proofs + 185p/0f gate) → Warchief: author local C3 ADR (never commit .c3/) → push branch → PR `[runner-purity-wall] …` → regular merge (verify 2 parents) → then CU2 branch + Tasks 8-12 (same hunter/skinner cycle).)

## Learnings bank
- L-1: `@types/bun@1.3.14` requires a callback on `test.todo` — always `test.todo('…', () => {})`. (A1)
- L-2: A task introducing code must run EVERY campaign gate (T1 ran only `bun test`, not tsc). (A1)
- L-3: Hunter t2's stop-don't-guess + `git stash` baseline proof = model for pre-existing-failure triage.
- L-4: When a refactor adds demands on an injected seam, enumerate fallout by grepping the seam's fixture pattern across ALL test files (`grep -l "readFile:" *.test.ts`), never from memory. (A2)
- L-5: Verify toolchain PAIRINGS at plan time: typescript-eslint hard-rejects TS ≥ 7, so ESLint was never viable here. (A3)
- L-6: A regex import-guard must ban the module SPECIFIER STRING in any quote/form, not just `from '...'` — dynamic import()/require()/side-effect/double-quoted forms bypass a from-only regex. (Skinner A)
- L-7: Subagent report files + STATE under .claude/state are not durable this session — restorable from transcripts; verify presence before relying on them. (Superseded by L-8 root cause.)
- L-8: NEVER let an auditor bisect via `git stash -u`/checkout in a shared worktree — it silently sweeps untracked files (plans, state, reports) into stashes. Future auditor briefs: explicitly ban stash AND checkout; point-in-time execution goes through `git worktree add <tmp> <sha>` instead. Also: "read-only" must be spelled out as "no git commands that mutate the worktree or index (stash, checkout, clean, restore)".
