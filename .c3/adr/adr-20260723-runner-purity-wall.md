---
id: adr-20260723-runner-purity-wall
c3-seal: 44aca630394c7d1625867564aa854318e4a2e6dd45a982bdbf325e86c46bfadb
title: runner-purity-wall
type: adr
goal: Give the campaign runner an explicit, mechanically enforced structural contract (import purity + import direction + ambient-state seal) so the zero-LLM wall and the seam architecture cannot silently erode.
status: accepted
date: "2026-07-23"
---

# ADR: Runner purity wall & lightweight hexagon (CU1)

## Goal

Give the campaign runner an explicit, mechanically enforced structural contract (import purity + import direction + ambient-state seal) so the zero-LLM wall and the seam architecture cannot silently erode.

## Context

The runner grew as 9 flat modules with no written structural contract: `report.ts` imported `EXIT_*` from the orchestrator (backwards edge), `loop.ts` transitively loaded the Agent SDK through `session.ts` (the ADR grep only checks direct imports), `brief.ts`/`run.ts` touched `node:fs`/`child_process` directly, and every invariant lived in comments. Owner ruled: adopt a lightweight hexagon (kanna's evolved practice — flat + `*.adapter.ts` filename convention, no folders, ports declared in their consuming module) with kanna's purity hard rule enforced mechanically.

## Decision

`types.ts` = shared kernel (home of ALL shared vocabulary incl. every `EXIT_*` code); `*.adapter.ts` leaves = the only files importing world-touching modules — `session.adapter.ts` is now the sole `@anthropic-ai/claude-agent-sdk` importer (supersedes the "session.ts is the only SDK importer" wording in adr-20260716-add-campaign-runner / adr-20260717-add-campaign-orchestration; the wall itself is unchanged and stronger: no transitive SDK load from `loop.ts`); `run.ts` = composition root, the only value-importer of adapters and `loop.ts`; everything else = pure core over injected `*IO` seams. ESLint layer DEFERRED: every published typescript-eslint hard-rejects typescript >= 7 (repo pins 7.0.2 native) — revisit at typescript-eslint#10940; until then the wall is enforced by `structure.test.ts` alone (import purity in any quote/import form incl. dynamic import()/require()/side-effect, import direction, `process.env` banned outside adapters, `process.exit` only in `run.ts`).

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | The campaign runner under plugins/tribe/scripts/runner gains kernel/adapter/composition-root roles, a new enforcement test, and two new adapter files — internal restructure, no external contract change. | c3-215#n868@v1:sha256:f467fd1ec102c55b693524d1b29fda35cba5ac48b31be638a9f6a38cc5b3aef8 "Deliver features through a 5-agent chain of command — Shaman (What/Why) → Warchief (How) → Hunter (TDD execution), gated by Tracker (rules review) and Ski" | This ADR + two independent skinner audits + tracker rules review (reports under .claude/state/runner-structure-purity/reports/, local). |

## Enforcement Surfaces

| Surface | Behavior | Evidence |
| --- | --- | --- |
| structure.test.ts | Executable structural contract: bans world-touching module specifiers in any quote/import form (incl. dynamic import()/require()/side-effect) outside *.adapter.ts; restricts adapter/loop imports to run.ts (type-imports exempt); ambient seal — process.env outside adapters and process.exit outside run.ts fail the suite. | plugins/tribe/scripts/runner/structure.test.ts (185-test suite incl. 13 contract tests) |
| bun run check | Pre-PR gate: bunx tsc --noEmit && bun test (repo has no CI). | plugins/tribe/scripts/runner/package.json scripts |
| DEFERRED: ESLint layer | kanna's no-restricted-imports/-syntax rules — blocked: every published typescript-eslint hard-rejects typescript >= 7 (repo pins 7.0.2 native). Revisit at typescript-eslint#10940 (TS >= 7.1). | .claude/state/runner-structure-purity/reports/task-6.md (root-cause transcript) |

## Verification

| Check | Result |
| --- | --- |
| cd plugins/tribe/scripts/runner && bun run check | tsc silent; 185 pass / 0 fail (includes the structural-contract tests) |
| grep -rln '@anthropic-ai/claude-agent-sdk' plugins/tribe/scripts/runner/*.ts | grep -v test | exactly session.adapter.ts |
| Audit gate CU1 | 2 independent skinners + tracker; 1 Important finding (guard import-form bypasses) CONFIRMED, fixed in 6c87d4e with reproduce-first proof; merged as PR #46 = 5b2b595 (regular, parents 28e5fb9 69aaac1) |
| CU2 readability pass | runLoop → flat named steps; CardCtx bundling (card derived, never threaded); derivePhaseConfigOf dedup; maxTurns deleted (runtime-neutral, zero setters). Audit: skinner-D 0C/0I + tracker APPROVE + skinner-C 0C/0I/1minor (report recovered post-limit; SDK-bundle grep proves maxTurns absent==undefined to query()). Merged as PR #47 = 39c3b1d (regular, parents 5b2b595 9a0bf7d); master gate green 185p/0f |
