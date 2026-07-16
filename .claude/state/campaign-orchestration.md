# Campaign Orchestration — implementation effort STATE

**Status:** running
**Role in force:** Claude = **Warchief** (owner ruling, 2026-07-16, re-confirmed for THIS effort).
Dispatches one Hunter per plan task; never writes feature source itself; audits every
deliverable; opens PR; **regular merge** (2 parents).
**Branch:** `feat/campaign-orchestration` (base: `master` @ `9a18103`)
**Plan:** `docs/superpowers/plans/2026-07-16-campaign-orchestration.md`
**Design (frozen — do not re-open):** `docs/superpowers/specs/2026-07-16-campaign-orchestration-design.md`
**Predecessor effort (its findings F11/F12 created this one):** `.claude/state/campaign-runner.md`

**Goal:** owner says "orchestration: do these N ideas" in any session and touches nothing
again until ONE consolidated report lists every card shipped (PR + sha, D3-verified) or
blocked (question + why). Closes F12 (the Shaman→runner handoff does not exist).

## Owner directives in force (this effort)

1. **"Build Tasks 1–6 now, park live smoke"** (2026-07-16). Implement all 6 tasks with TDD +
   mocked seams, PLUS the W5 real-CLI sweep on every new/changed `gh`/`git` string (read-only
   probes where mutation is unsafe). **Acceptance #1–#3 (live campaign, forced escalation,
   round-trip) are reported BLOCKED-pending-repo in the PR — never claimed, never silently
   skipped.** Rationale: my token has `repo` but NOT `delete_repo` (verified `gh auth status`),
   so any throwaway repo I create is permanent litter in the owner's account.
2. **"Warchief — dispatch a Hunter per task"** (2026-07-16). Hunter per task, TDD, audit each
   deliverable before accepting.
3. Global standing: **no squash merge**; no Co-Authored-By / attribution footer.

## Commit convention (plan §, matches repo history)

`feat(tribe): campaign orchestration — <task summary>` — conventional commits, no `[Branch]`
prefix. Repo trailers `Tribe-Card:` / `Tribe-Task: N/M` are real convention — keep them.

## Baseline (verified before any change, 2026-07-16)

`bun test` → **116 pass / 0 fail**, `bunx tsc --noEmit` → clean, in
`plugins/tribe/scripts/runner/`. Any Hunter that reports green must beat this bar, not match it.

## Task status

| # | Task | Status | Report |
|---|------|--------|--------|
| 1 | `state.ts` — `dependsOn`, `blocked`, `autoAnswerRounds` | ⬜ not started | `reports/orch-task-1.md` |
| 2 | `loop.ts` — D5′ park-and-continue | ⬜ not started (needs 1) | `reports/orch-task-2.md` |
| 3 | `report.ts` — report contract (§O5) | ⬜ not started (needs 1,2) | `reports/orch-task-3.md` |
| 4 | `orchestrate-campaign` skill (§O1/O3/O6) | ⬜ not started (needs 1–3 contract) | `reports/orch-task-4.md` |
| 5 | Docs — runner README schema + shaman/warchief awareness | ⬜ not started (needs 1–3) | `reports/orch-task-5.md` |
| 6 | C3 change-unit + final gates | ⬜ not started (last) | `reports/orch-task-6.md` |

Sequencing: 1 → 2 → 3 → (4 ∥ 5) → 6.

## Anti-goals / walls (spec §2 — each is a tripwire, W7 a drift gauge)

- **W1 stateless:** no repo/path/model/campaign value hardcoded in the skill or runner. Final
  gate greps source clean.
- **W2 zero-LLM loop:** no SDK/model import in `loop.ts`/`run.ts`/**`report.ts`** (new file —
  the wall extends to it).
- **W3 judgment stays in sessions:** the runner writes escalation files; it NEVER writes to
  `answers.md`.
- **W4 no squash:** `rule-no-squash-merge` governs every merge path.
- **W5 real-CLI proof:** any new/changed `gh`/`git` command string must be executed once
  against the real CLI before trust. **A green mocked suite is NOT that proof** (learning F4).
- **W6 dependency safety:** a card never starts while a `dependsOn` target is parked.
- **W7 bounded auto-answer:** `autoAnswerRounds` ≤ 2 per card.
- State schema stays `"v": 1` — Tasks 1–2 add only OPTIONAL fields (existing reader preserves
  unknown fields, so old states parse unchanged).
- Hunters build **only** their brief — no adjacent improvements.

## Next action

Dispatch Hunter for Task 1 (`state.ts` schema additions). Then 2 → 3 → (4 ∥ 5) → 6, auditing
each deliverable before accepting.

## Learnings bank (inherited — these BIND this effort)

- **🔑 Mocked seams cannot validate the commands themselves.** F4 (`gh api pulls/<pr>` → 404)
  passed 25 green tests and would have wedged the campaign on card 1. A mock returns the shape
  its author imagined. Hence wall W5.
- **A doc fix is not a fix (F11).** Fixing `c3-215`'s doc fixed the MAP; the agents + sibling
  skill — the TERRITORY — still said squash. Prose repeated in three places drifts in three
  places. Task 5 touches agents; Task 6 touches C3 — do BOTH, and prefer a checkable rule over
  repeated prose.
- **`bun test` hard-errors (exit 1) on zero test files** — not a soft pass.
- **The plan's original seeder was struck (F12 root cause).** The ai-dict docs PR was the ONLY
  thing that authored `campaign-state.json`; removing it left nothing. Tasks 4–5 replace it via
  the Shaman. Watch for the same class of gap: removing a step can silently orphan a contract.

## Known-carried gaps (surface in the PR — do NOT report the effort done without these)

- **Acceptance #1–#3 BLOCKED-pending-repo** (owner directive 1 above).
- The runner's mutating surface (`gh pr create`/`gh pr merge`/`git push`), `.runner.lock`
  contention, and STOP under a real run remain **UNVERIFIED** — carried over from the
  campaign-runner effort, and by design this effort's live smoke was where they would close.
- Pre-existing C3 drift in `c3-213` and `c3-216` (same ungrounded-derivation drift) is **out of
  scope** — each needs its own ADR; fixing here would smuggle unrelated changes into a feature
  branch.
