# Skinner B audit — feat/runner-purity-wall (CU1 Tasks 1–6)

## Source of truth
- Contract level: caller-given plan + Amendments (highest priority), cross-checked against owner-directive state file and Hunter task reports.
- Plan: `docs/superpowers/plans/2026-07-23-runner-structure-purity.md` (+ Amendments A1–A3)
- State: `.claude/state/runner-structure-purity.md`
- Hunter reports: `.claude/state/runner-structure-purity/reports/task-{1..6}.md`
- Scope audited: commits `2436f69..90dddb9` (CU1 Tasks 1–6 only; Task 7/CU2 explicitly out of scope per dispatch).

## Emphasis (Skinner B lens): runtime correctness of the three refactored data paths + EXIT_* move

## Conformance matrix

| # | Requirement | Source | Satisfied? | Evidence |
|---|---|---|---|---|
| 1 | Task 1: `structure.test.ts` created, 4 live + 4 todo, `bun test` 176p/4todo/0f | Plan Task 1 | ✅ | commit `2436f69`; re-ran `bun test` at that SHA → 176 pass/4 todo/0 fail |
| 2 | Task 2: EXIT_* homed in types.ts; `report.ts`/`loop.ts` import from `./types.ts`, not `./loop.ts` | Plan Task 2 | ✅ | `types.ts:88-98`; `report.ts:20` imports from `./types.ts`; `diff` of `report.ts`/`types.ts`/`loop.ts` vs pre-branch shows only the intended move, values 0/1/2/3/4 unchanged |
| 3 | A1: every `test.todo` carries `() => {}` callback (tsc TS2554 workaround) | Amendment A1 | ✅ | `structure.test.ts` todos all carry callback by Task 2; commit `464f449` tsc-clean |
| 4 | Task 3: `session.adapter.ts` created, only file importing SDK besides tests; `session.ts` SDK-free; `run.ts` imports `sdkSpawnSession` from adapter | Plan Task 3 | ✅ | `session.adapter.ts` body byte-identical to pre-branch `sdkSpawnSession` (diffed); `session.ts` diff shows only import/decl removal + header rewrite; `run.ts:18` imports from `./session.adapter.ts` |
| 5 | §D1 pinned session options unchanged (byte-identical) | Plan Task 3 interface note | ✅ | `session.ts` `buildSessionOptions`/`PinnedSessionOptions`/`SessionIO` diffed line-for-line vs pre-branch — zero change beyond the SDK import/function removal |
| 6 | Task 4: `brief.ts` pure (no `node:fs`), `executorBrief` takes injected `template`, `BRIEF_TEMPLATE_PATH` exported, `ResolvedConfig.briefTemplate` added, template read once in `runLoop` | Plan Task 4 | ✅ | `brief.ts` diff vs pre-branch shows `readFileSync`/`loadTemplate` deleted, `BRIEF_TEMPLATE_PATH` exported; `loop.ts:884` reads it once via `io.readFile`, stored in `resolved.briefTemplate`; both real call sites (740, 756) pass it — confirms A2's "2 real call sites, not 3" |
| 7 | A2: `report.test.ts`'s two inline `LoopIO` fixtures get the `BRIEF_TEMPLATE_PATH` branch | Amendment A2 | ✅ | `report.test.ts:541-542` and `636-637` (grep-confirmed), plus `import { BRIEF_TEMPLATE_PATH } from './brief.ts'` at line 26 |
| 8 | Fixture template subset is valid (any subset of real placeholders) | Plan Task 4 note | ✅ | Fixtures use `{{CARD_ID}}`/`{{ANSWERS_CONTENT}}` only; `renderTemplate` only throws on a placeholder present in the template but absent from `vars` — verified by reading `brief.ts:30-37`; `brief.test.ts` against the REAL template (`brief-template.md`) passes (4/4) |
| 9 | Task 5: `run-io.adapter.ts` extracted, `buildRealIo` byte-identical (lock paths, pending-commit paths, `appendLog` flag `'a'`, EPERM liveness) | Plan Task 5 | ✅ | Full-body diff of `run-io.adapter.ts` vs pre-branch `run.ts:153-223` — identical except header + `sdkSpawnSession` now imported from `./session.adapter.ts` instead of `./session.ts` (same function) |
| 10 | `run.ts` post-Task-5: no world-touching imports, `main()`/`tryWriteReport`/`parseArgs` logic unchanged | Plan Task 5 | ✅ | `diff` of full `run.ts` vs pre-branch shows only import/decl deletions matching the plan's exact line list; `main()` body untouched |
| 11 | CLI smoke test: `bun run.ts --dry-run` → `missing required flag: --repo` | Plan Task 5 Step 6 | ✅ | Re-ran myself: `campaign runner: missing required flag: --repo` |
| 12 | Task 6 (A3-superseded): ambient-state seal as script tests, `check` = `tsc --noEmit && bun test`, no ESLint/typescript-eslint deps | Amendment A3 | ✅ | `structure.test.ts:74-88` (`codeOf`, 2 new tests); `package.json` scripts = exactly `test`/`check`, no `lint`; `eslint.config.js` absent; `bun.lock` diff empty across CU1 |
| 13 | Global: `bun test` green at every commit | Plan Global Constraints | ✅ (as literally scoped) | Re-ran `bun test` at each of the 6 SHAs: 176p/4todo, 177p/3todo, 178p/2todo, 179p/1todo, 180p/0todo, 182p/0todo — 0 fail every time |
| 14 | Global: behavior-preserving (only maxTurns deletion excepted) | Plan Global Constraints | ✅ | `maxTurns` fully untouched in CU1 (`loop.ts:355,680`, `session.ts:42,88,108`, `session.test.ts:70,82` all present, unmodified) — that's CU2 Task 11, correctly deferred |
| 15 | Commit format `[runner-purity-wall] <type>: <subject>`, no Co-Authored-By, no Claude footer | Plan Global Constraints | ✅ | All 6 commit messages checked; `grep -i "co-authored\|claude"` over the 6 messages → no hits |
| 16 | Never commit plan/.claude/state/.c3/.okra artifacts | Plan Global Constraints + owner rule | ✅ | `git show --name-only` on all 6 commits — none touch those paths; they remain untracked in `git status` |
| 17 | Zero-LLM wall: `session.adapter.ts` is the only file importing the SDK (besides tests) | Plan Global Constraints | ✅ | `grep -rn "@anthropic-ai/claude-agent-sdk" *.ts` (non-test) → only `session.adapter.ts` |
| 18 | EXIT_* values + consumers unchanged | My emphasis | ✅ | 0/1/2/3/4 identical; `report.ts`'s `deriveExitReason`/`shouldWriteReport` logic byte-identical (diffed) |

## Proof run
- `bun test` (HEAD, 90dddb9) → PASS — 182 pass, 0 fail, 493 expect() calls, 9 files
- `bunx tsc --noEmit` (HEAD) → PASS — silent, exit 0
- `bun run check` (HEAD) → PASS — tsc clean, then 182 pass/0 fail
- `bun test` bisected at each of the 6 commits → PASS at every commit (counts in matrix row 13); `bunx tsc --noEmit` at `2436f69` alone → FAIL (TS2554 ×4, the known/disclosed A1 issue, fixed same-campaign at the very next commit `464f449`)
- `bun run.ts --dry-run` → PASS — `campaign runner: missing required flag: --repo`
- `bun test brief.test.ts` (real template, not fixture) → PASS — 4 pass, 0 fail
- Commit message / staged-file audit (all 6 commits) → PASS — correct prefix, no trailers, no forbidden paths staged

## Findings

### Critical — breaks conformance
(none)

### Important
(none)

### Minor / nits
- **Stale doc comments claim an ESLint enforcement surface that Amendment A3 killed.** `session.adapter.ts:4` ("Enforced by structure.test.ts + eslint.config.js, not by this comment.") and `run-io.adapter.ts:4` ("purity wall — enforced by structure.test.ts + eslint.config.js") both still name `eslint.config.js` as a co-enforcer, but that file was never created — Amendment A3 explicitly deferred the whole ESLint layer and replaced it with `structure.test.ts`-only enforcement (confirmed: `ls eslint.config.js` → no such file; `package.json` has no `lint` script). These two comments were written in Tasks 3/5 (before A3's Task-6 ruling existed) and never updated afterward. Doc/comment mismatch only — the actual enforcement (`structure.test.ts`) is real and passing; no behavior or gate is affected. Would satisfy: strike `+ eslint.config.js` from both comments (or note it as "deferred, see plan Amendment A3").
- **Task 1's own commit (`2436f69`) does not typecheck in isolation.** `bunx tsc --noEmit` at that SHA fails with 4× TS2554 (label-only `test.todo(...)` needs a callback under `@types/bun@1.3.14`) even though `bun test` at that SHA is green (176p/4todo/0f). This is the exact defect Amendment A1 documents and the state file's own Learnings bank (L-2) already discloses ("Task 1 ran only `bun test`, not `tsc --noEmit`, so the defect surfaced one task late"). Not a hidden gap — self-reported and fixed one commit later (`464f449`) — and the plan's own Global Constraint text defines "the suite must be green" against `bun test`, not `tsc`, so this does not break the letter of the plan's per-commit gate. Flagging only because a bisect that runs `tsc` (not just `bun test`) at `2436f69` will see red.

## Unverified claims
(none — every conformance-matrix row above was independently re-derived from source or re-run, not taken from the Hunter reports' prose)

## Scope creep
(none found — every changed line in the 6-commit diff traces to a specific plan Task/Amendment step; diffed each modified production file against its pre-branch (`28e5fb9`) version and found only the moves/changes the plan specifies)

## Refuted during self-audit
- **Initial hypothesis: Task 4's eager, once-per-run read of `BRIEF_TEMPLATE_PATH` is an undisclosed behavior change (previously `loadTemplate()` re-read the file lazily on every `executorBrief` call; a missing/unreadable template now fails earlier — during `resolveRunContext`, even on a run with zero cards — instead of only when a card is actually processed).** Refuted: this is not a *new* risk pattern. `answersContent` (`config.answersPath`) was ALREADY read exactly the same way — once, eagerly, unconditionally, via `io.readFile`, inside the same `try` block, before the pass loop — in the pre-branch `loop.ts` (confirmed: `git show 28e5fb9:.../loop.ts` lines 882-885 show the identical `String(await io.readFile(...))` pattern for `answersContent`). Task 4 simply extends an existing, already-accepted eager-read precedent to a second committed asset; the plan's own Task 4 preamble explicitly directs this ("the template is loaded the same way, once, into `ResolvedConfig`"). Not a fresh defect — dropped.
- **Initial hypothesis: `codeOf()`'s comment-stripping regex in `structure.test.ts` (strips `//...` to end of line) could mask a real `process.env`/`process.exit` violation if it appeared after a `://` substring earlier on the same line (e.g. a URL in a string literal).** Refuted as inapplicable to the shipped code: `grep -n "://" *.ts` (excluding tests) across every current production file returns zero hits, so no line in the actual codebase can trigger this false-negative today. This would be a valid latent-fragility observation for a cold-lens read of the test's own robustness, but it identifies no requirement violation and no live defect in this codework — out of scope for a contract-lens finding. Dropped (not even to Minor, since nothing about the audited requirement is unmet).

CONTRACT-LENS: 0 findings — 0 critical, 0 important (2 refuted during self-audit; 2 Minor/nits recorded for the record, not counted in the tally)
