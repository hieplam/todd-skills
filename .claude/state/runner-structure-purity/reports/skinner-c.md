## Source of truth
- Contract level: caller-given (dispatch message names the plan + amendments A1–A3 and the owner-directive STATE file directly)
- Spec: n/a / Plan: `docs/superpowers/plans/2026-07-23-runner-structure-purity.md` (+ Amendments A1–A3) / Jira: n/a
- Governance loaded: root `CLAUDE.md`/user rules (git-conventions, pr-review), `.c3/adr/adr-20260723-runner-purity-wall.md` (local, untracked), Hunter reports `reports/task-{8,9,10,11}.md`, `.claude/state/runner-structure-purity.md`. No `.claude/rules/*.md` specific to this repo found under `todd-skills`. `c3` CLI not installed — read `.c3/` markdown directly per pr-review.md's read-only-local-artifact convention.

## Conformance matrix
| # | Requirement | Source | Satisfied? | Evidence |
| - | ----------- | ------ | ---------- | -------- |
| 1 | Task 8: `runLoop` → table of contents; 4 named helpers extracted verbatim, same call order | Plan Task 8 | ✅ | `git diff 5b2b595..9a0bf7d -- loop.ts`: `startupStopResult`→`resolveRunContext`→`retryPendingCommit`→`loadState`→`runPass`→W-F5 `persistLocalState`→return, all still inside the same `try{}finally{releaseLock}` — order and error-propagation boundary unchanged |
| 2 | `config.`→`resolved.` swaps are value-identical (in-loop `stopFilePathOf`, `filteredNextCard`, `maxCards`) | Plan Task 8 note | ✅ | `loop.ts:340-369`: `ResolvedConfig extends RunLoopConfig` via `{...config, baseBranch, answersContent, briefTemplate}` — no field-name collision, so `resolved.repoRoot`/`maxCards`/etc. are byte-identical to `config`'s |
| 3 | Task 9: `CardCtx` interface exact shape, added above `escalateCard` | Plan Task 9 | ✅ | `loop.ts:558-566` matches plan's interface + doc comment verbatim |
| 4 | Task 9: `card` never threaded as param — derived as `ctx.state.cards[ctx.cardId]` at point of use in all 6 functions | Plan Task 9 | ✅ | `loop.ts:568(escalateCard),594(shipCard),653(buildSessionIOForCard),692(performRevertAndRedo),720(runCardSession),763(actOnCard)` — each derives from the same `state`/`cardId` passed through `ctx`, same object reference as before (verified: pre-refactor `card` params were always `state.cards[cardId]` at their call sites) |
| 5 | Task 9: `ctx` built once per tick in `runPass`, before `planning_needed` branch | Plan Task 9 Step 3 | ✅ | `loop.ts:912` `const ctx: CardCtx = { cardId: nc.cardId, state, resolved, io };` sits right after the `done` break, before both the `planning_needed` and phase branches |
| 6 | Task 10: single `derivePhaseConfigOf` helper, both call sites (`runDryRun` w/ `config`, `runPass` w/ `resolved`) | Plan Task 10 | ✅ | `loop.ts` — `grep -n "deriveCardPhase("` → 1 declaration + 2 call sites, both via `derivePhaseConfigOf(...)` |
| 7 | Task 11: `maxTurns` deleted from all 6 sites, runtime-neutral | Plan Task 11 + Global Constraints | ✅ | `grep -rn maxTurns *.ts` → 0 hits; SDK's `sdk.mjs` destructures `{...,maxTurns:d,...}` by value read (not `in`/`hasOwnProperty`), so an absent key and a `maxTurns: undefined` key are behaviorally identical — confirmed no `in options`/`hasOwnProperty` maxTurns check exists in the installed SDK |
| 8 | Suite green throughout / behavior-preserving (no semantic change beyond maxTurns) | Global Constraints | ✅ | `bun run check` reproduced: tsc silent, 185 pass/0 fail/511 expect() (512→511 matches the one assertion Task 11 removed) |
| 9 | Structural contract (structure.test.ts) still fully live | Claim under audit | ✅ (with a stale count) | `bun test structure.test.ts` → 13 pass, 0 fail, 0 todo (file untouched by CU2's diff: `git diff 5b2b595..9a0bf7d -- structure.test.ts` empty) — "fully live" is true; the "11 guard tests" figure quoted in the dispatch/ADR is stale (actual 13) |
| 10 | Commit conventions: `[runner-loop-readability] <type>: <subject>`, no Co-Authored-By | Global Constraints | ✅ | `git log 5b2b595..9a0bf7d --format` — all 4 subjects correctly prefixed, no trailers |
| 11 | No local-only artifacts committed in these 4 commits | Global Constraints | ✅ | `git diff --stat 5b2b595..9a0bf7d` → only `loop.ts`, `session.ts`, `session.test.ts`; no `.c3/`, `.claude/state/`, `docs/superpowers/` hits in `git log --stat` |
| 12 | Task 12 close-out (ADR update / PR / merge) intentionally NOT done yet | Dispatch note | ✅ | Confirmed no README/PR/ADR-commit changes in this diff — correctly deferred, not a gap |

## Proof run
- `bunx tsc --noEmit` → PASS — silent, exit 0
- `bun test` → PASS — 185 pass, 0 fail, 511 expect() calls, 9 files
- `bun run check` → PASS — same result (lint step is absent per Amendment A3's ruling to defer ESLint; `package.json` `check` script is `bunx tsc --noEmit && bun test`, matching the ADR/A3 ruling)
- `bun test structure.test.ts` → PASS — 13 pass, 0 fail, 0 todo
- `git diff 5b2b595..9a0bf7d -- loop.ts session.ts session.test.ts` → reviewed in full, no undiffed hunks missed
- `grep -rn maxTurns *.ts` → PASS (0 hits — confirms Task 11 completeness)
- `grep -n "maxTurns" node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs` → inspected — SDK destructures the option by value, no presence-check idiom that would make `undefined`-valued-key vs absent-key differ

## Findings
### Critical — breaks conformance
(none)

### Important
(none)

### Minor / nits
- [`.claude/state/runner-structure-purity.md:26` / `.c3/adr/adr-20260723-runner-purity-wall.md:35`] Both the STATE board and the local ADR record `structure.test.ts` as "11 guard tests"; the file actually contains 13 `test(...)` cases (0 todo) as of this HEAD. Not a CU2 defect — `structure.test.ts` is untouched by these 4 commits (`git diff 5b2b595..9a0bf7d -- structure.test.ts` is empty) — it's stale bookkeeping predating this branch. Fix: update the count in the local docs, no code change needed.

## Unverified claims
(none — every checked item was independently reproduced by command or `file:line` inspection)

## Scope creep
(none found — `git diff --stat 5b2b595..9a0bf7d` shows exactly the 3 files the plan's Tasks 8–11 name; Task 12's close-out artifacts are correctly absent)

## Refuted during self-audit
- Initial hypothesis: "the `resolved.maxCards` swap in `runPass`'s `limit` could read a different value than the original `config.maxCards` if `ResolvedConfig`'s spread ever shadowed a `RunLoopConfig` field." Refuted by reading `ResolvedConfig`'s 3 added fields (`baseBranch`, `answersContent`, `briefTemplate`) against `RunLoopConfig`'s field list (`loop.ts:340-369`) — no name collision exists, so the spread cannot shadow anything; the values are provably identical.
- Initial hypothesis (maxTurns runtime-neutrality per the audit-emphasis warning about "undefined field vs absent field"): suspected the SDK might use an `in`/`hasOwnProperty` presence check that would make deleting the key observable. Refuted by grepping the actual installed `@anthropic-ai/claude-agent-sdk/sdk.mjs` — it reads `maxTurns` via plain destructuring-by-value (`{...,maxTurns:d,...}`), which returns `undefined` identically whether the key is present-as-undefined or fully absent; no `'maxTurns' in options` or `hasOwnProperty` pattern found in the bundle.

CONTRACT-LENS: 0 findings — 0 critical, 0 important, 1 minor (stale test-count documentation, no self-audit refutations needed on it)