# Tribe fix-list — analysis of the `outstanding-17` campaign log (2026-08-08)

> **Working document across sessions.** Source: the campaign diary
> `ai-dict:docs/superpowers/campaign/2026-aug-08-log.md` (390 lines, 17 cards, ~29h
> wall-clock, 17/17 shipped). Every problem below was cross-checked against the tribe
> runner code on `todd-skills` master (`fd672cc`, 2026-08-12) to confirm it is still open —
> the July campaign reports (`runner-remote-fix`, `cu2`, `cu3`) all predate the 08-08 log
> and cover none of these.
>
> **Protocol:** the owner ratifies problems one at a time. When a problem is ratified, its
> full context + solution spec lands next to this README as `P<NN>-<slug>.md` and its row
> in the status table flips to RATIFIED with a link. This README alone must be enough for a
> fresh session (zero conversation context) to resume the work.

## The thesis (root cause common to most problems)

The campaign shipped 17/17 cards but needed ~12 Shaman interventions, and almost every
intervention traces to one root cause: **Tribe rules exist as prose (brief text, skill
docs, answers.md rulings, session memory) instead of as mechanical enforcement (hooks,
guards, invariants in code) — so executors can read a rule and still violate it.** The
runner codebase itself already proved which side works. The only wall ever converted from
prose to code is the backgrounding hook, and its own comment records the outcome:

```
// plugins/tribe/scripts/runner/core/session.ts:64-67
// The brief already forbids this in prose; prose failed
// six times, so the same rule is enforced here where the model
// cannot talk its way past it.
```

The same conversion (prose → mechanical) is the fix shape for P1, P2, P3, P10, P11 below.

**What to preserve:** the convention-capture loop itself works and is measurable —
interventions per card fell across the campaign (B6: 1, B9: 1, A1: 2, A3: 0, then a
4-card clean streak after ruling R4), and the B14 executor cited ruling R4 by name when it
refused to merge on a red check (log lines 285–292). The fixes below reduce the price of
that loop; they do not replace it.

## Status table

| #   | Problem (short)                                        | Observed cost (08-08)                | Status                                       |
| --- | ------------------------------------------------------ | ------------------------------------ | -------------------------------------------- |
| P1  | Executor waits look dead to the runner                 | ×4 incidents, ~5 min round-trip each | **SHIPPED** — PR #82, `5768e9a` → [spec](P1-wait-aware-liveness.md) |
| P2  | Merge gate verified only AFTER merge                   | 1 written-rule breach, 42 min red master | **SHIPPED** — PR #79, `f11c83d` → [spec](P2-pre-merge-check-gate.md) |
| P3  | Definition of Done (post-merge cleanup) not in brief   | First escalation of the campaign (B6) | **SHIPPED** — PR #80, `e226209` → [spec](P3-definition-of-done-brief.md) |
| P4  | Runner escalates instead of self-healing safe residue  | Same B6 escalation                   | **SHIPPED** — PR #81, `1865704` → [spec](P4-self-heal-safe-residue.md) |
| P5  | Escalations don't say answerable vs world-fixable      | 1 wasted round-trip (A1)             | **SHIPPED** — PR #84, `e367e9d` → [spec](P5-escalation-reason-kinds.md) |
| P6  | `--include-escalated` must be remembered by hand       | B14 parked 1 cycle                   | **SHIPPED** — PR #83, `2beb0a9` → [spec](P6-escalation-lifecycle.md) |
| P7  | Rulings can't reach a running session                  | A12 carried 5+ soon-invalid commits  | **SHIPPED** — PR #89, `eba7b41` → [spec](P7-mid-flight-rulings.md) |
| P8  | Batch-authored specs drop inherited obligations        | 2 escalation rounds (B13→B14)        | **SHIPPED** — PR #88, `57ad095` → [spec](P8-inherited-obligations-check.md) |
| P9  | schemaGuard front-matter patched post-hoc, not at authoring | 1 escalation + world-fix PR #185 | **SHIPPED** — PR #86, `0ecd207` → [spec](P9-schema-lock-at-authoring.md) |
| P10 | `ANTHROPIC_API_KEY` env trap kills all sessions        | 13 sessions dead in 36s              | **SHIPPED** — PR #78, `177ca3a` → [spec](P10-anthropic-api-key-guard.md) |
| P11 | Stale `baseSha` on hand-edited state resets            | 1 false-positive escalation (B13)    | **SHIPPED** — PR #85, `9d9b502` → [spec](P11-basesha-invariants.md) |
| P12 | Skill doc claims sequential default; runner is parallel | Hand-authoring a 17-link dependsOn chain | **SHIPPED** — PR #87, `d57feeb` → [spec](P12-concurrency-truth.md) |
| P13 | Harness externally kills background runner tasks       | ×2, ~2 min recovery each             | WON'T-FIX (ratified — mitigation works)      |
| P14 | Quota pause kills the running session                  | 27 min dead time                     | WON'T-FIX (ratified — cron heartbeat = design) |
| P15 | Repo-wide pre-commit cost + `bun install` worktree trap | ~40s per docs commit; 1 failed commit | RATIFIED — tribe clause folded into [P3](P3-definition-of-done-brief.md); rest is ai-dict's |

**Ratification note:** P10 (and an earlier P2 round) were ratified directly by the owner;
the rest were ratified 2026-08-12 under owner-delegated authority ("tự quyết, chỉ hỏi khi
không tìm được câu trả lời"). Every self-decided tradeoff is flagged inside its spec
file; the owner may veto any before implementation.

**Spec standard (owner directive):** every spec carries an "Implementation guide (fresh
session, smaller model)" section — exact files, line anchors, signatures, enumerated test
cases, and the run command — so a fresh session with a smaller model can implement one P
with no extra context and no particular workflow.

**Suggested implementation order:** P10 → P2 → P3 → P4 → P1 → P6 → P5 → P11 → P9 → P12 →
P8 → P7. The P's are independent except: P1+P2 both touch `core/session.ts` hooks;
P1+P3+P7 all touch `core/brief-template.md`; P4 reuses recipes P6 also touches in
`card-actions.ts` — implement those serially or rebase carefully.

---

## Group 1 — rules exist as prose but have no mechanical enforcement

### P1. Executor-waits-look-dead (×4: B9, A1, B10, B14)

- **Evidence:** log lines 135–144 (B9), 156–161 (A1), 331 (B10), 319 (B14). An executor
  opens its PR, arms a Monitor (an async-notification tool) to await CI or a background
  skinner, then ends its turn — the runner classifies the turn-end as
  `session_incomplete` and exits 3. Each occurrence costs a full external re-trigger
  (~5 min dead time).
- **Code state:** the brief forbids waiting in prose
  (`runner/core/brief-template.md:32-46`, "Session liveness" wall). The PreToolUse hook
  (`runner/core/session.ts:71-88`, `decideBackgroundingHook`) denies `run_in_background`
  on Bash/Agent/Task only — it does NOT block Monitor, and "ending a turn to wait" is not
  a tool call, so no hook can see it. Prose failed 4 times in this campaign.
- **Fix direction:** (a) extend the deny-hook to Monitor and any deferred-wait tool inside
  executor sessions; (b) make the runner auto-resume an exit-3-class outcome in-process
  with a bounded retry count (e.g. 2) instead of dying and waiting for an external
  re-trigger; (c) add the pattern late-campaign executors discovered themselves to the
  brief: watch CI in the foreground with `gh pr checks --watch` (log lines 327–331).

### P2. `checksGreen` verifies AFTER merge — the campaign's only written-rule breach

- **Evidence:** log lines 213–232. The A2 executor merged PR #188 while `format-check`
  was red on the PR head; master stayed red for ~42 minutes. The runner's `checksGreen`
  verify (`runner/core/verify.ts`) only runs post-merge, so it can detect the breach but
  never prevent it.
- **Code state:** the brief says only "land with `gh pr merge --merge`"
  (`brief-template.md:25`); there is no "every check green BEFORE merge, pending ≠ green"
  clause and no enforcement hook.
- **Ratified decision (owner, 2026-08-12):** a PreToolUse hook denies every `gh pr merge`
  while any check is red or pending — no exceptions in the hook; contamination/flaky-infra
  cases go through `NEEDS_DIRECTION` escalation (Shaman fixes the world, re-triggers).
  Full spec: [P2-pre-merge-check-gate.md](P2-pre-merge-check-gate.md).

### P3. Definition of Done (post-merge cleanup) is not in the brief

- **Evidence:** log lines 113–126. The B6 executor merged, removed its worktree, but left
  the remote branch → ship-verify failed twice → escalation. Ruling R1/UC-2 defined the
  convention: "merged ≠ done" — done = remote branch deleted, worktree removed, local
  master fast-forwarded, THEN report SHIPPED.
- **Code state:** `brief-template.md` has no cleanup section at all. The ruling lives only
  in that campaign's answers.md — the next campaign starts without it.
- **Fix direction:** add a "Definition of Done" section to `brief-template.md` (and the
  warchief agent definition) listing the three cleanup steps as preconditions for the
  `SHIPPED` terminal line.

### P4. Runner escalates instead of self-healing safe residue

- **Evidence:** same B6 incident. The only residue was the remote branch of an
  already-merged PR — deleting it is unconditionally safe, yet the runner escalated and a
  human performed the deletion.
- **Code state:** `runner/core/verify.ts:288` pushes `'remote branch still present'` as a
  problem → verify fails → escalation. No self-heal branch exists.
- **Fix direction:** in verify, when the PR state is `merged` and the only residue is the
  remote branch → `git push origin --delete <branch>` and re-verify; escalate only on
  unsafe residue (unmerged PR, worktree with uncommitted changes, …).

## Group 2 — escalation-loop friction

### P5. Escalation files don't distinguish answerable vs world-fixable

- **Evidence:** log lines 165–189. An answers.md ruling cannot clear a schemaGuard trip —
  the guard mechanically reads the PLAN FILE's front-matter, so only changing the world
  (a file) clears it. The Shaman burned one full re-trigger cycle learning this.
- **Fix direction:** the escalation markdown template labels each reason kind: every
  `verify_failed` family reason (schemaGuard, checksGreen, worktreeAndBranchGone) states
  "a ruling alone cannot clear this — change X in the world, then re-trigger"; only
  `needs_direction` lists the ruling path.

### P6. `--include-escalated` must be remembered by hand on every re-trigger

- **Evidence:** log lines 315–321: "once a card has ever escalated, every re-trigger needs
  `--include-escalated` until it ships" — one flag-less relaunch parked B14 for a wasted
  cycle.
- **Root cause:** the existence of the escalation file short-circuits the card to
  `escalation_pending` (`runner/core/loop/phase.ts:145`), and nothing removes the file
  when a ruling lands.
- **Fix direction:** standardize "archive the escalation file when the ruling is written"
  (the Shaman already did this by hand for A2: renamed to `A2.md.resolved-R4`) into the
  orchestrate-campaign skill — or better, have the runner compare answers.md mtime against
  the escalation file and treat a newer ruling as resolution.

### P7. Rulings cannot reach a session that is already running

- **Evidence:** log lines 267–279. The Conventional Commits gate landed on master while
  A12 was mid-flight with 5+ bracket-prefixed commits; the answers digest is injected only
  once, at spawn (`runner/core/brief.ts:58,77`).
- **Fix direction — two options, owner to choose:** (a) accept the limit and document
  "rulings apply from the next session onward"; (b) a hook-based delivery mechanism:
  a PreToolUse hook reads the answers.md version/mtime and, when it changed, denies
  exactly one tool call with a message carrying the new ruling — the executor receives the
  update mid-flight. (b) is powerful but adds real complexity.

## Group 3 — Stage-A (authoring) gaps

### P8. Batch-authored spec waves drop inherited obligations between specs

- **Evidence:** log lines 299–314. B13's design doc (lines 869–871) explicitly handed an
  obligation to "B14's own future spec" — but B14's spec, authored the same day, never
  received it. Skinner B caught it; cost 2 escalation rounds (rulings R6, R7) and spawned
  follow-up card B16.
- **Fix direction:** add an "inherited-obligations cross-check" step to Shaman/roadmap
  authoring: grep every handoff sentence ("deferred to", "handed to X's spec", "future
  spec") across the wave plus already-shipped specs, and require the receiving spec to
  acknowledge each one. Script or mandatory checklist.

### P9. schemaGuard front-matter is patched post-hoc instead of at authoring time

- **Evidence:** log lines 165–189. PR #185 had to add `allowsSchemaChange: true` to five
  plans after A1 tripped the guard — the plans were authored before the guard existed.
- **Fix direction:** extend `plugins/tribe/scripts/validate-plan.sh`: any plan with a
  `Modify:` task touching a `schemaLockPaths` file must carry
  `allowsSchemaChange: true` front-matter, or validation fails at Stage A.

## Group 4 — runner robustness

### P10. `ANTHROPIC_API_KEY` from the repo's `.env.local` killed all 13 sessions — RATIFIED

See [P10-anthropic-api-key-guard.md](P10-anthropic-api-key-guard.md) for the full spec.

- **Evidence:** log lines 82–92. Runner launched with shell cwd inside ai-dict → Bun
  auto-loaded `.env.local` → its no-credit `ANTHROPIC_API_KEY` entered the runner process
  → all 13 spawned sessions inherited it → `billing_error` → exit 3 in 36 seconds. The
  trap was already in session memory and was stepped on anyway.
- **Ratified decision (owner, 2026-08-12):** the tribe never uses this variable. (1) The
  runner always deletes `ANTHROPIC_API_KEY` from its own process env before spawning
  anything. (2) If `<repoRoot>/.env.local` contains an `ANTHROPIC_API_KEY` line, the
  runner deletes that line without asking.

### P11. Stale `baseSha` on hand-edited state resets → schemaGuard false positive

- **Evidence:** log lines 200–210. The Shaman reset cards to `staged` but preserved each
  card's campaign-start `baseSha`; the runner never overwrites an existing `baseSha`, so
  B13's verify diffed from before A1's designed ports change and tripped the guard on a PR
  that touched ports.ts zero times. Ruling R3: "when resetting never-started cards, null
  `baseSha` too."
- **Fix direction:** an invariant in `runner/core/state.ts`: a card in `staged` with
  `sessionId: null` MUST have `baseSha: null` — validated on state load. Consider a
  `reset-card` CLI subcommand so the Shaman never hand-edits state.json.

### P12. Skill doc claims undeclared deps run sequentially — the runner runs them in parallel

- **Evidence:** log lines 93–103 vs `plugins/tribe/skills/orchestrate-campaign/SKILL.md:127`
  (verified still present). The runner spawned all 13 dependency-free cards within 30
  seconds; the Shaman had to hand-author a 17-link dependsOn chain to honor the owner's
  "one by one".
- **Fix direction — owner to choose:** (a) fix the doc to tell the truth; (b) add
  `--max-concurrent N` to the runner; (c) have the orchestrate-campaign skill auto-author
  the sequential dependsOn chain when the owner's directive is "one by one". (a)+(c) need
  no runner change.

## Group 5 — recorded, proposed WON'T-FIX in tribe

- **P13. External kills of background runner tasks** (×2, log lines 233–240): the harness
  stopped the background task; the cron heartbeat + stale-lock takeover recovered in
  ~2 min. A detached launch would fix it at the cost of losing exit notifications.
- **P14. Quota pause** (log lines 262–266): the 15-minute cron heartbeat resumed the run
  after the account limit reset — working as designed; the 27 min dead time is an account
  limit, not a workflow defect.
- **P15. Repo-wide pre-commit cost (~40s on docs-only diffs) + fresh-worktree
  `bun install` trap (UC-1)**: both are ai-dict hook-design issues (lint is not
  diff-scoped). Tribe-side, at most one generic brief clause: "after creating a worktree,
  run the repo's dependency bootstrap before the first commit."

---

## Session context (for resuming without conversation history)

- Analysis session: 2026-08-12, working dir `todd-skills` master `fd672cc`.
- The source diary is in the **ai-dict** repo (also on GitHub:
  `hieplam/ai-dict/blob/master/docs/superpowers/campaign/2026-aug-08-log.md`).
- Owner's goal (verbatim intent): "làm cho tribe workflow chạy tốt hơn, đúng hơn, thay vì
  chỉ 1 mớ text và script nhưng nó không hề tuân thủ theo rule của Tribe" — make the
  workflow actually OBEY its rules, i.e. convert prose rules to mechanical enforcement.
- Owner's process directive: go through the P's one at a time; after each ratification,
  persist context + solution here before moving on.
- Current position (2026-08-12, implementation phase): playbook =
  [IMPLEMENTATION.md](IMPLEMENTATION.md) (serial dynamic loop, Tribe-style cell per item:
  hunter → two-lens skinners + scout → bounded fix rounds → merged PR). **P10 SHIPPED**
  (PR #78, merge `177ca3a`). **P2 SHIPPED** (PR #79, merge `f11c83d`). **P3 SHIPPED**
  (PR #80, merge `e226209`). **P4 SHIPPED** (PR #81, merge `1865704`). **P1 SHIPPED**
  (PR #82, merge `5768e9a`). **P6 SHIPPED** (PR #83, merge `2beb0a9`). **P5 SHIPPED** (PR #84, merge `e367e9d`).
  **P11 SHIPPED** (PR #85, merge `9d9b502`). **P9 SHIPPED** (PR #86, merge `0ecd207`).
  **P12 SHIPPED** (PR #87, merge `d57feeb`). **P8 SHIPPED** (PR #88, merge `57ad095`).
  **P7 SHIPPED** (PR #89, merge `eba7b41`).
- **CAMPAIGN COMPLETE (2026-08-13): 12/12 items shipped**, PRs #78–#89, serial order
  P10 → P2 → P3 → P4 → P1 → P6 → P5 → P11 → P9 → P12 → P8 → P7. Every item ran the full
  Tribe cell (hunter → two-lens skinners + scout in parallel → bounded fix rounds →
  gated merge) via a dynamic workflow; 85 audit findings were raised and adjudicated
  across the campaign, every item took exactly 1 fix round except P2 (2). Runner test
  suite grew 220 → 312 tests (0 fail throughout); `tsc --noEmit` clean after every
  merge. Recorded follow-ups for the owner (deliberately NOT built): a `reset-card` CLI
  subcommand (P11 out-of-scope note), a `--max-concurrent N` runner flag (P12
  not-chosen option), and the deferred hook design for mid-flight ruling delivery (P7
  spec). A separate peer-session analysis (harness-gap loop unwired, breaks B1–B7) was
  received near campaign end — flagged to the owner as its own follow-up stack,
  pending owner approval, orthogonal to this fixlist.
- Owner's rewind protocol is active (see memory `tribe-fixlist-rewind-protocol`): each
  round = read this README → brainstorm one P → ratify → persist spec + flip table →
  owner rewinds the conversation.
