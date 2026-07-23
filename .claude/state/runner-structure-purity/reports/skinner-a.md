## Source of truth
- Contract level: caller-given (spec/plan explicitly named) — plan + Amendments A1-A3.
- Spec: n/a (no separate spec doc for this effort) / Plan: `docs/superpowers/plans/2026-07-23-runner-structure-purity.md` / Jira: n/a.
- Governance loaded: root `CLAUDE.md`, `.claude/rules/*.md` (writing-voice, test-first, git-conventions, pr-review), owner directives in `.claude/state/runner-structure-purity.md`, Hunter evidence `reports/task-{1..6}.md` (task-6.md captured in full before it disappeared from disk mid-audit — see Unverified claims), `.c3/` not consulted (repo has no `.c3/` dir surfaced here; pr-review rule says absence of `.c3/` is not itself a gate).

## Conformance matrix
| # | Requirement (quote) | Source | Satisfied? | Evidence |
|---|---|---|---|---|
| 1 | Baseline `bun test` = 172 pass, 0 fail, 8 files; suite green at **every** commit | Plan Global Constraints | ✅ | `bun test` now → 182 pass/0 fail/9 files; per-commit progressions (176→177→178→179→180→182) consistent across `git show <sha>:structure.test.ts` diffs and task-N reports' embedded transcripts |
| 2 | Behavior-preserving; only `maxTurns` deletion permitted (and that's CU2) | Plan Global Constraints | ✅ | `grep maxTurns session.ts loop.ts` shows plumbing still present, untouched (CU2 Task 11 not started) |
| 3 | Commit format `[runner-purity-wall] <type>: <subject>`, no Co-Authored-By | Plan Global Constraints | ✅ | `git show -s --format='%B'` on all 6 commits — clean, no trailer |
| 4 | Regular merge only / never squash — n/a yet (no merge in CU1 audit window) | Plan Global Constraints | ⚠️ n/a | Task 7 (merge) explicitly out of scope per dispatch |
| 5 | Never commit plan, `.c3/`, `.okra/` | Plan Global Constraints | ✅ | `git log --name-only 2436f69..90dddb9 -- docs/superpowers .claude .c3 .okra` → empty; `git status --short` shows these only as untracked |
| 6 | `session.adapter.ts` is the ONLY file importing the SDK after CU1 | Plan Global Constraints / zero-LLM wall | ✅ | `grep -rln claude-agent-sdk *.ts` (excl. tests) → `session.adapter.ts` only; `loop.ts` type-only imports from `session.ts`, `session.ts` SDK-free (diff `28e5fb9..2586764`) — no transitive load |
| 7 | Task 1: `structure.test.ts` created, 4 live + 4 todo, 176 pass | Plan Task 1 | ✅ | commit `2436f69`; file content matches plan verbatim |
| 8 | Task 2: EXIT_* homed in `types.ts`; `loop.ts` no longer exports them; report.ts imports from types.ts | Plan Task 2 | ✅ | `grep EXIT_ types.ts loop.ts run.ts report.ts`; `git diff 28e5fb9 464f449 -- report.ts` |
| 9 | Task 2 A1: every `test.todo` carries `() => {}` | Amendment A1 | ✅ | `grep test.todo *.ts` → none remain (all flipped by Task 5); `bunx tsc --noEmit` clean throughout |
| 10 | Task 3: `session.adapter.ts` created, `sdkSpawnSession` moved, `session.ts` SDK-free | Plan Task 3 | ✅ | file read + diff confirms byte-identical move, `buildSessionOptions` untouched (session pinning preserved) |
| 11 | Task 4: `executorBrief` gains 4th `template` param; `BRIEF_TEMPLATE_PATH` exported; `brief.ts` drops `node:fs` | Plan Task 4 | ✅ | `brief.ts` read — signature matches exactly, no fs import |
| 12 | Task 4 A2: `report.test.ts`'s two inline `LoopIO` fixtures also get the `BRIEF_TEMPLATE_PATH` branch | Amendment A2 | ✅ | `grep -n BRIEF_TEMPLATE_PATH report.test.ts` → lines 541, 636 present |
| 13 | Task 5: `run-io.adapter.ts` extracted, byte-identical to old `run.ts:153-223`; `run.ts` left with no fs/child_process imports | Plan Task 5 | ✅ | `git diff 28e5fb9 5406a00 -- run.ts run-io.adapter.ts` — clean move; `run.ts` read confirms no world-touching imports |
| 14 | Task 6 / A3: ESLint deferred; ambient-state seal (`process.env` ban non-adapter, `process.exit` only run.ts) lands as `structure.test.ts` assertions; `check` = `tsc --noEmit && bun test` | Amendment A3 | ✅ | `structure.test.ts` lines 72-88; `package.json` scripts; `eslint.config.js` correctly absent from tree |
| 15 | Task 6: violation-injection proofs run against `bun test structure.test.ts` (both fire, both revert) | Amendment A3 | ⚠️ evidenced only via Hunter transcript, not independently re-run (dispatch bars me from injecting) | `reports/task-6.md` §"Step 4" — embedded command transcripts (admissible per dispatch: "assess injection proofs ... by reading the guard code instead") + independently re-derived via my own `bun -e` regex probe (see Findings) |
| 16 | Task 7 (C3/README/PR/merge) intentionally NOT done in CU1 | Dispatch scope note | ✅ | `README.md` untouched in diff; no `.c3/` writes; no PR/merge state |
| 17 | Guard test itself catches every import form (multi-line, `import x = require`, dynamic `import()`, side-effect `import './x'`, re-export `export...from`, double-quoted) | Dispatch adversarial ask | ❌ (see Findings — Important) | `bun -e` probe below |

## Proof run
- `bunx tsc --noEmit && bun test` (i.e. `bun run check`) → **PASS** — silent typecheck, `182 pass, 0 fail, 493 expect() calls, 9 files`
- `bun test` (standalone rerun) → PASS — same 182/0
- `git log 2436f69..90dddb9 --oneline` → PASS — 6 commits, matches claimed range
- `git show -s --format='%B'/'%an <%ae> / %cn <%ce>' <sha>` (×6) → PASS — no Co-Authored-By, correct author
- `git diff --stat 28e5fb9..90dddb9 -- plugins/tribe/scripts/runner` → PASS — file set matches plan's declared Files-touched lists per task, no unexpected files
- `git diff 28e5fb9 2586764 -- session.ts` → PASS — confirms byte-identical `sdkSpawnSession` move, `buildSessionOptions` untouched
- `git diff 28e5fb9 5406a00 -- run.ts run-io.adapter.ts` → PASS — confirms byte-identical `buildRealIo`/`realExec`/`isProcessAlive` move
- `bun -e` regex probe of `allImportsOf`'s pattern against 6 import forms → **dynamic `import()`, side-effect `import '...'`, `import x = require(...)`, double-quoted `from "..."` all bypass** (see Findings); multi-line and re-export forms are correctly caught
- `grep -rn "eslint" *.ts README.md` → found 2 stale references (`run-io.adapter.ts:4`, `session.adapter.ts:4`) to a file (`eslint.config.js`) that A3 confirms will never exist under this TS version
- `grep -c eslint bun.lock` → 0 (confirms Task-6 dependency churn was fully reverted, matching task-6.md's own claim)

## Findings

### Critical — breaks conformance
(none found)

### Important
- **[structure.test.ts:23-32, entire guard mechanism] The regex-based import guard — now the SOLE mechanical enforcement of the purity wall per Amendment A3 (no ESLint layer exists) — has real, demonstrated bypass vectors.** Ran `allImportsOf`'s exact regex (`/from\s+'([^']+)'/g`) against 6 import forms via `bun -e`: dynamic `await import('node:fs')` → `[]` (undetected), side-effect `import './session.adapter.ts';` → `[]` (undetected), `import fs = require('node:fs');` → `[]` (undetected), and double-quoted `from "node:fs"` → `[]` (undetected) all silently pass every guard test (world-touching-module check, adapter-direction check, orchestrator-import check). Re-exports (`export ... from '...'`) and multi-line imports are correctly caught (verified same probe). **Current code does not exploit any of these forms** (grepped `import(`, `^import '`, `= require(`, `from "` across all non-test `.ts` — zero hits), so nothing is violated today; but because A3 made this test the *only* backstop (deferring ESLint's AST-based `no-restricted-imports` indefinitely), a future contributor writing any of these four forms would silently break the zero-LLM wall / purity wall with the guard reporting green. Self-refutation: checked whether the plan/A3 explicitly accepted this risk — A3 only discusses the ESLint-vs-TS7 incompatibility and names the script-test as the interim mechanism; it does not discuss or sanction import-form coverage gaps, so this survives as a real, unaddressed gap in the delivered contract (dispatch explicitly asked to hunt for exactly this class of gap — "A guard with a bypass is a finding").

### Minor / nits
- **[session.adapter.ts:4, run-io.adapter.ts:4] Stale comments claim enforcement by `eslint.config.js`**, which per Amendment A3 will never exist under TS 7 until typescript-eslint#10940 lands. These files were written during Tasks 3/5 (before the A3 ruling superseded Task 6), and nobody revisited their header comments after A3 dropped ESLint. Doc/comment mismatch only — no behavioral effect.
- **[loop.ts:5] Header comment says the SDK "stays confined to session.ts"** — stale since Task 3 (commit `2586764`) moved the SDK import to `session.adapter.ts`; confirmed via `git diff 464f449 2586764 -- loop.ts` (no diff touched this line). Doc/comment mismatch only.
- **[structure.test.ts:20,50-54] Adapters (`*.adapter.ts`) are fully exempt from the "leaf modules never import the orchestrator" test** (`CORE_FILES` excludes them by construction), so an adapter value-importing `loop.ts` directly would go undetected. Not exploited today — `run-io.adapter.ts` only `import type`s from `loop.ts` (compile-time only, erased under `verbatimModuleSyntax`). This is a gap in test coverage, not a current code defect — Minor per severity rules.
- Task 6/A3's `structure.test.ts` step ticked the plan's own checkboxes as `[x]` for Tasks 4/5 (visible in the plan file itself, lines 235-306, 317-422) even though the plan is explicitly local-only/untracked — not a conformance issue since the plan file was never committed (confirmed), just noting the checkbox state was mutated locally, which the plan's own Task-6 report explains is intentional/expected local bookkeeping.

## Unverified claims
- **Per-commit `bun test` pass counts at each of the 5 intermediate SHAs** (176/177/178/179/180) were not independently re-run by me — the dispatch explicitly bars checkout/branch-switch, and there is no worktree set up for point-in-time execution. I corroborated them via `git show <sha>:file` diffs showing the test/source file pairs are self-consistent at each commit (e.g., Task 2's `types.ts` additions land in the same commit as `structure.test.ts`'s flipped guard and `report.ts`'s import-source change), which is strong circumstantial evidence, but the actual pass/fail transcripts at those SHAs are sourced from the Hunter reports' embedded command output, not from my own execution.
- **Hunter task-1.md through task-5.md report files disappeared from disk mid-audit** (`ls` at session start showed all 6 files including timestamps; a later `ls`/`find` showed only `tracker.md` remains in that directory). I had already read `task-6.md` in full before this happened and used it as evidence above; I could not re-verify the other five directly, though my independent diff/grep evidence above stands on its own regardless of report-file content. This is an environmental anomaly (likely another process in the shared worktree), not a code-correctness finding, and I flag it only for the record.
- Task 6's violation-injection proofs (both `process.env` and `process.exit` firing then reverting cleanly) are evidenced only via the Hunter's embedded transcript in `task-6.md`, per dispatch instruction not to re-inject on this shared worktree — I independently corroborated the *mechanism* (via my own `bun -e` regex test of the actual guard logic) rather than re-running the exact injection.

## Scope creep
None found — every file touched in the 6 commits maps to a Files-touched entry in its corresponding plan task (or its Amendment), verified via `git show --stat` per commit against the plan's per-task Files lists.

## Refuted during self-audit
- Initially suspected the "adapters are value-imported only by run.ts or other adapters" test wording implied adapters must also be blocked from importing `loop.ts`, and that `run-io.adapter.ts`'s `import type {...} from './loop.ts'` was a violation. Refuted: the test only restricts `.adapter` module-specifier value-imports, not `loop.ts`; and the plan's own Task 5 code block explicitly authors this exact type-only import in `run-io.adapter.ts`. Not a finding — downgraded the adjacent test-coverage gap to Minor instead (see above).
- Considered escalating the guard-bypass finding to Critical (given it's the sole enforcement mechanism). Refuted to Important: nothing in the current tree exploits any bypass form (verified by grep across all non-test source), so conformance is not currently broken — only latent risk exists, which is Important-severity by the rubric ("a real defect... under some input/condition you can name" — here the condition is hypothetical future code, not present code).

CONTRACT-LENS: 4 findings — 1 important, 3 minor (2 findings considered and downgraded/refuted during self-audit)