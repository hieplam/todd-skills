---
id: adr-20260904-mechanical-heartbeat-supersedes-p14
c3-seal: 57d4edba0cb50a47f991b1c057c39ed705f4949a78dfcf9291cc5d4b3013a8ca
title: mechanical-heartbeat-supersedes-p14
type: adr
goal: |-
    Replace the token-costing LLM `/loop 15m` heartbeat that supervised unattended `orchestrate-campaign`
    runner passes with a zero-token **mechanical watchdog**: `bun run.ts watchdog` — a subcommand of
    the existing runner CLI (`plugins/tribe/scripts/runner/cli/main.ts`), not a sibling script. The
    watchdog observes the runner's own on-disk facts (run record, lock file, session-log tail) each
    tick, absorbs an account-limit (quota) death by waiting until the log's own `resetsAt`, absorbs an
    HTTP 529 overload death with a bounded backoff, relaunches a crash once, detects a stall from log
    mtime, and exits only when a human decision is required — so the harness's own "background command
    exited" notification becomes the entire heartbeat, at zero LLM cost per tick.
status: accepted
date: "2026-09-04"
---

## Goal

Replace the token-costing LLM `/loop 15m` heartbeat that supervised unattended `orchestrate-campaign`
runner passes with a zero-token **mechanical watchdog**: `bun run.ts watchdog` — a subcommand of
the existing runner CLI (`plugins/tribe/scripts/runner/cli/main.ts`), not a sibling script. The
watchdog observes the runner's own on-disk facts (run record, lock file, session-log tail) each
tick, absorbs an account-limit (quota) death by waiting until the log's own `resetsAt`, absorbs an
HTTP 529 overload death with a bounded backoff, relaunches a crash once, detects a stall from log
mtime, and exits only when a human decision is required — so the harness's own "background command
exited" notification becomes the entire heartbeat, at zero LLM cost per tick.

## Context

`orchestrate-campaign` `SKILL.md` Stage B launches the runner in the background and waits for the
harness's exit notification. In practice the owner additionally ran an LLM `/loop 15m` tick that
read the report, checked liveness, and relaunched after an account-limit pause — paying tokens on
every tick to re-derive facts that were already sitting on disk (run.json, the lock file, the
session log tail). Fixlist `docs/tribe/fixlists/2026-08-08-outstanding-17/README.md` recorded the
cost of that design directly:

- **P14** — a quota pause killed the executor session (runner exit 3); the 15-minute LLM tick only
relaunched after the reset, producing **27 minutes of dead time**. Ruled WON'T-FIX, "cron
heartbeat = design".
- **P13** — the harness externally killed the background runner task twice; the tick plus the
stale-lock takeover recovered in ~2 minutes each. Ruled WON'T-FIX (mitigation works).

Issue #74 (owner, 2026-08-09) reversed the P14 ruling: because the heartbeat's facts are all
mechanical (exit codes, `run.json`, log-tail regex), its cost should be zero tokens, not an LLM
turn. Campaign evidence gathered while planning this card (spec §8, Shaman diary,
`SHAMAN-STATE.md`, dated 2026-09-03) sharpened the problem further: **five account-limit kills**
in the 24 h before the card, and **three consecutive HTTP 529 (overload) kills** on
`claude-opus-5` within 15 minutes, neither of which the original P14 narrative separated. The
watchdog therefore needs a distinct backoff path for 5xx/overload deaths, separate from the quota
wait.

Constraint carried into this decision: `plugins/tribe/scripts/runner/core/types.ts` and
`core/state.ts` are this campaign's `schemaLockPaths` — neither may be touched. The runner's
`structure.test.ts` already enforces pure-core / thin-edge layout for everything under
`core/`, `ports/`, `adapters/`, `cli/`.

## Decision

The watchdog lands as **`run.ts watchdog`, a subcommand of the existing runner CLI**, not a
sibling `scripts/watchdog/` directory — reached via the already-resolved `$runner_dir` that
`skills/orchestrate-campaign/resolve-runner.sh` and `tests/test-fresh-machine.sh` already prove,
so it needs zero new resolution, zero new installable, and zero `install.sh` change. Its own
vocabulary (the observation/action types) lives in `core/watchdog/model.ts` — deliberately not
`core/types.ts` — precisely because `core/types.ts` is one of this campaign's schema-lock paths;
every `WatchdogIO` port member is primitive-typed or reuses `LockInfo`/`RunnerHandle` already in
`ports/ports.ts`, so nothing in the locked kernel needs to move. Landing inside the runner's
existing directory tree means `structure.test.ts` mechanically enforces the watchdog's own purity:
`core/**` may not name `fs`/`child_process`/the SDK in any quote form, `process.exit` may appear
only in `cli/main.ts`, `process.env` only in `adapters/`.

Frozen decisions (card `i74-mechanical-heartbeat`, D74-1..7) and this plan's How-level
clarifications (W-P1..W-P10, `docs/superpowers/plans/2026-09-03-mechanical-heartbeat.md` §0.1):

- **D74-1** — supersedes fixlist P14 ("cron heartbeat = design" is retired).
- **D74-2** — notification model = process exit (the harness's own background-exit wake-up).
- **D74-3** — bun/TypeScript, pure decision core / thin effect edges, reached from the already
resolved `$runner_dir` (no second resolver); the runner's core is not modified beyond additive
exports.
- **D74-4** — the quota signal is read from the session log tail (the last `rate_limit_event`
with `status: "rejected"` and a future `resetsAt`; a `429` result line corroborates but is not
required — W-P3/W-P4).
- **D74-5** — bounded waits: 6 quota waits, 1 crash relaunch, and (spec §8 amendment) 5 overload
backoffs (30/60/120/240/480 s) before `needs_human:overloaded`.
- **D74-6** — two modes, `--follow` (the primary supervised mode) and `--once` (never sleeps;
records `nextWakeAt` and exits `11`, leaving a cron/launchd path open without a redesign).
- **D74-7** — adopt, never duplicate: a live runner at start is attached, never double-launched;
relaunching the watchdog itself is therefore safe and is the documented recovery from a harness
kill of the watchdog process (P13's mitigation, strengthened).
- **W-P1..W-P10** — precedence (terminal beats STOP, quota beats overload within exit 3),
under-detecting quota is the defect this card removes (over-waiting is bounded and visible via
`nextWakeAt`), last-log-line-wins parsing, `--once` never sleeps, exit-code observation fused
from either the owned child's real exit or an adopted run's finalized `run.json`, every
individual wait bounded by `--poll-seconds` while the supervised runner's total lifetime is
deliberately unbounded (the runner's own `--session-timeout` owns that — the watchdog never
kills it), the three additional flags (`--poll-seconds`, `--quota-grace-seconds`,
`--max-overload-backoffs`), writes confined to `<home>/watchdog/` only, and `--home` containment
by realpathed segment-prefix.

The frozen action table (spec §2.1, amended by spec §9) is a pure function
`decide(observation) -> action` over a static table — `launch | attach | wait_until(resetsAt) |
relaunch | stall | exit(done) | exit(needs_human:<reason>) | exit(running)` — driven entirely by
inputs the caller supplies (run record, log tail, clock, counters); every side effect (spawn,
file read, clock read, sleep) lives at the CLI/adapter edge, never inside the decision core
(`plugins/tribe/rules/pure-core.md`).

**Consequences.** Fixlist P14 is retired (SUPERSEDED by #74); P13's WON'T-FIX mitigation is
strengthened by adopt-on-start plus the double-forked detached Stage B launch. `--once` leaves a
future cron/launchd driver possible without redesign. The runner's core (`core/types.ts`,
`core/state.ts`) is unchanged — every edit across this card is additive, and this ADR's own C3
sync is likewise the minimum patch set that makes c3-215's facts true again: one Contract row,
one re-authored Business Flow row, one Change Safety row.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | Gains the run.ts watchdog surface in Contract, the unattended-path amendment in Business Flow, and a new Change Safety row for core/watchdog/* | c3-215#n1620@v1:sha256:c7d5c995814dbd21dad3d87ad85addb61fcfd6ff31a9e0ef78f22a688e2dc457 | binding — landed via this change-unit only, the sealed doc is never hand-edited |
| plugins/tribe/scripts/runner/cli/main.ts | N.A - not a tracked C3 entity | Gains one dispatch block (argv[0] === 'watchdog') mirroring the existing reset-card subcommand; no existing symbol's shape changes | N.A - c3x lookup plugins/tribe/scripts/runner/cli/main.ts returned zero matches (no eval binding yet) | reviewed for additivity only — code review, not a C3 fact |
| plugins/tribe/skills/orchestrate-campaign/SKILL.md | N.A - not a tracked C3 entity | Stage B now launches the watchdog detached instead of the bare runner; Stage C re-triggers route through it too | N.A - c3x lookup plugins/tribe/skills/orchestrate-campaign/SKILL.md returned zero matches (no eval binding yet) | reviewed for additivity only — code review, not a C3 fact |

## Compliance Refs

| Ref | Why required | Evidence | Action |
| --- | --- | --- | --- |
| ref-docs-lifecycle | The watchdog's spec/plan/evidence live under docs/superpowers/**, the path this ref governs for tribe's own feature work | ref-docs-lifecycle#n1795@v1:sha256:a163534e4fbc98d69ae8cd12167eedff5b0840b29f305b2a4d73a5784501ec2c "Give feature work a durable, ordered paper trail — designs, implementation plans, and proof artifacts must outlive the chat session that produced them. The re" | comply |
| ref-evals-fixture | Cited by c3-215's Governance section; this ADR adds no new agent-kind eval case, so it applies unchanged | ref-evals-fixture#n1805@v1:sha256:813517fa60d2f2b54b826ca8f96afc6d5756cf36963113cd294b205564805d59 "One eval fixture format for every role-behavior and skill-trigger eval in the repo — cases shaped as a prompt plus a prose grading rubric — so a single runn" | N.A - unaffected, no eval fixture change in this card |
| ref-plugin-layout | Cited by c3-215's Governance section; the watchdog adds no new installable and no directory-layout change (D74-3), so it applies unchanged | ref-plugin-layout#n1815@v1:sha256:7308f9cf6c7b854b298ec94062198be5540c62222a8b3466b2796854039585c5 "Standardize the directory shape of every plugin so the installer, the marketplace manifest, and the eval harness can walk any plugin without per-plugin logic. T" | N.A - unaffected, no layout change in this card |

## Compliance Rules

| Rule | Why required | Evidence | Action |
| --- | --- | --- | --- |
| rule-bash-strict-mode | The watchdog's shell test suites (test-watchdog-e2e.sh, test-watchdog-detached.sh) and the detached Stage B one-liner are bash scripts under this rule's scope | rule-bash-strict-mode#n1824@v1:sha256:cf218a707a61ba5ad906d29dec31f9f4eef92e5faeb9db74e3a75451c41c3c1d "Every shell script in the repo fails fast and loud: unset variables, failed commands, and broken pipelines abort the script instead of silently producing half-d" | comply |
| rule-no-squash-merge | Cited by c3-215's Governance section; this ADR changes no merge behaviour — the Warchief still regular-merges the card's PR | rule-no-squash-merge#n1856@v1:sha256:2f5ff61964fe9551d508719ff31ed7514dbdbd8d296ff884a7e952a5334fab6a "Every capability in this repo that merges a pull request, or that verifies one was merged," | N.A - unaffected, no merge-flow change in this card |

## Work Breakdown

| Area | Detail | Evidence |
| --- | --- | --- |
| Runner core | core/watchdog/model.ts (vocabulary), core/watchdog/decide.ts (pure action table), one new adapter, additive ports/ports.ts exports | plugins/tribe/scripts/runner/core/watchdog/*, plugins/tribe/scripts/runner/ports/ports.ts |
| CLI | One additive dispatch block in cli/main.ts mirroring reset-card | plugins/tribe/scripts/runner/cli/main.ts |
| Integration | SKILL.md Stage B/C detached launch; runner README + tribe README "Watchdog" sections; fixlist P13/P14 rows updated | plugins/tribe/skills/orchestrate-campaign/SKILL.md, plugins/tribe/scripts/runner/README.md, plugins/tribe/README.md, docs/tribe/fixlists/2026-08-08-outstanding-17/README.md |
| C3 governance (this ADR) | c3-215 Contract row (watchdog surface), Business Flow "Unattended path" row (mechanical quota/overload absorption), Change Safety row (core/watchdog/* risk) | .c3/changes/mechanical-heartbeat-supersedes-p14/*.patch.md |

## Enforcement Surfaces

| Surface | Behavior | Evidence |
| --- | --- | --- |
| bun test (48-row action-table test + integration tests against a runner double and the real runner) | Catches a wrong decision-table row or a broken adopt/relaunch/stall path before merge | plugins/tribe/scripts/runner/core/watchdog/*.test.ts |
| bunx tsc --noEmit | Catches a type-level break in the additive ports/ports.ts/cli/main.ts edits | plugins/tribe/scripts/runner (tsconfig) |
| test-watchdog-e2e.sh | Real runner under the real watchdog from an empty home; proves G5 (exit 10, escalations_pending) | plugins/tribe/scripts/tests/test-watchdog-e2e.sh |
| test-watchdog-detached.sh | The documented double-fork one-liner survives a harness-style tool-timeout kill and the watchdog is discoverable via status.json | plugins/tribe/scripts/tests/test-watchdog-detached.sh |
| c3x check | Catches a regression in c3-215's fact count or a new check error beyond the 2 pre-existing ones (c3-213, c3-216) | this change-unit's check gate |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| Sibling scripts/watchdog/ directory with its own package.json | Needs a second dependency tree, a second install.sh/resolve-runner.sh resolution path, and re-implements the pure-core/thin-edge discipline structure.test.ts already enforces for free inside the runner tree |
| Keep the LLM /loop 15m tick but shorten the interval | Still pays tokens per tick to re-derive facts that are already on disk; does not remove the dead-time floor, only shrinks it — the issue #74 owner directive rejects this framing outright |
| A cron/launchd job driving the tick directly, no --follow mode | The harness gives exactly one free wake-up (a background command's exit); a cron tick still needs the lead session to learn the outcome without polling. --once keeps this path open for later without redesign (spec §1.3) |
| Kill and restart the runner on any exit 3, no quota/overload distinction | Conflates a bounded, known-reset-time quota wall with a transient overload signal; a 529 needs backoff, not a resetsAt-timed wait — collapsing them would either over-wait on overload or under-wait on quota |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| The watchdog waits forever, relaunches forever, or kills a healthy runner | Every wait is capped (--max-quota-waits, --max-overload-backoffs, --max-crash-relaunches); the watchdog never calls a kill syscall on the runner at all — only the runner's own --session-timeout ends a session | 48-row action-table test plus the double-driven integration tests; cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit; bash plugins/tribe/scripts/tests/test-watchdog-e2e.sh |
| A quota/overload signal is under-detected, reproducing P14's dead time | Quota/overload parsing takes the LAST log-tail line (W-P4), matching the real killed-session log verbatim in the fixture | plugins/tribe/scripts/runner/core/watchdog/*.test.ts (real-shaped fixtures) |
| The harness kills the background watchdog itself (P13-shaped failure) | Adopt-on-start (D74-7): relaunching the watchdog attaches to the live runner rather than double-spawning; Stage B launches it double-forked so a harness tool-timeout no longer reaches it | plugins/tribe/scripts/tests/test-watchdog-detached.sh |

## Verification

| Check | Result |
| --- | --- |
| cd plugins/tribe/scripts/runner && bun test | 607 pass, 0 fail, 1529 expect() calls, 25 files (measured 2026-09-04, this worktree) |
| cd plugins/tribe/scripts/runner && bunx tsc --noEmit | exit 0, no output (measured 2026-09-04, this worktree) |
| bash plugins/tribe/scripts/tests/test-watchdog-e2e.sh | 19 passed, 0 failed (measured 2026-09-04, this worktree) |
| bash plugins/tribe/scripts/tests/test-fresh-machine.sh | 26 passed, 0 failed (measured 2026-09-04, this worktree) |
