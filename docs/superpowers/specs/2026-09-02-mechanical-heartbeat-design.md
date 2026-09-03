# Spec — Mechanical heartbeat: the campaign watchdog

**Card:** `i74-mechanical-heartbeat` · **Source:** GitHub issue #74 · **Date:** 2026-09-02
**Author:** Shaman (What/Why). The plan (How) is authored separately by a planning Warchief.
**Status:** contract for the implementation card in campaign `gh-issues-2026-09`.
**Supersedes:** fixlist ruling P14 (`docs/tribe/fixlists/2026-08-08-outstanding-17/README.md`).

---

## 1. Problem, grounded

### 1.1 What the LLM heartbeat does today, and what it costs

The orchestrate-campaign skill tells the lead session to launch the runner in the
background and wait for the harness's exit notification (`SKILL.md` Stage B, step 2). In
practice the owner additionally ran `/loop 15m`: an LLM turn every 15 minutes that read the
report, checked whether the runner was alive, and relaunched it after an account-limit pause.
Recorded outcome (fixlist README, P13/P14 narrative):

- P14 — quota pause killed the executor session; runner exit 3; the 15-minute tick relaunched
  after the reset; **27 minutes dead time**.
- P13 — the harness externally killed the background runner task twice; the tick plus the
  stale-lock takeover recovered in ~2 minutes each.

Both were ruled WON'T-FIX with "cron heartbeat = design". Issue #74 (owner, 2026-08-09)
reverses that: the heartbeat's *facts* are mechanical, so its *cost* should be zero tokens.

### 1.2 The facts the heartbeat reacts to are all on disk

| Fact | Where it is, verified |
| --- | --- |
| Runner exit code semantics `0/1/2/3/4/5` | runner `README.md` "Exit codes"; `core/types.ts` |
| Quota death shape: `{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1787754600,"rateLimitType":"five_hour",…}}` then `{"type":"result","is_error":true,"api_error_status":429,"result":"You've hit your session limit · resets 9:30pm (Asia/Saigon)",…}` | real session log, campaign `wiki-harness-extraction`, run `2026-08-26T10-49-46-625Z-03af`, log `T16-8912c7b1-….log` |
| The runner already retries an `error` outcome twice in-pass (P1), so a quota death exits 3 within seconds and stays dead | fixlist P1; `core/loop/run-loop.ts` retry loop |
| Runner liveness: `<home>/runs/<run-id>/run.json` with `pid`, `endedAt: null` while in flight; lock file `<home>/.runner.lock` `{pid, startedAt}`; a dead pid is reclaimed automatically | runner README "Run record", "STOP file and the lock file" |
| Session activity: `<home>/runs/<run-id>/logs/<card>-<sessionId>.log` grows as the SDK streams | runner README "Run record" |
| Staleness threshold used everywhere in the tribe: 30 minutes | `plugins/tribe/scripts/heartbeat-check.sh`, `shaman.md` "Channels & liveness" |
| The harness wakes the lead session when a background Bash command exits; foreground sleeping is blocked | orchestrate-campaign `SKILL.md` Stage B; harness contract |

### 1.3 Why not "just cron"

A cron/launchd job can call a tick, but the lead session still needs to *learn* the outcome
without polling. The harness gives exactly one free wake-up: the exit of a background
command it launched. So the watchdog's contract is: **stay alive while it can handle things
itself; exit precisely when a human (or the Shaman) must act.** A `--once` tick mode is kept
so cron/launchd can drive it later without a redesign.

---

## 2. The change (What)

### 2.1 The watchdog

A script in the runner's toolchain (bun + TypeScript, pure core / thin edges) reachable from
the resolved `$runner_dir` (sibling directory or runner subcommand — Warchief's choice, D74-3)
with these observable behaviours:

**Inputs.** The same three required flags as the runner (`--repo`, `--model`, `--home`) plus
pass-through of the runner's optional flags (`--cards`, `--max-cards`, `--include-escalated`,
`--session-timeout`, `--logs-dir`, `--max-concurrent`), and its own: `--follow` | `--once`
(default `--follow`), `--stall-minutes` (default 30), `--max-quota-waits` (default 6),
`--max-crash-relaunches` (default 1). No defaults for the three required flags (W1).

**Observation (each tick).** Pure function over: the latest `run.json` under `<home>/runs/`
(pid liveness, `endedAt`, `exitCode`, `reason`), the newest session log's tail (quota
signal, `resetsAt`), the max mtime under that run's `logs/`, the clock, the watchdog's own
counters. Output: one action from
`launch | attach | wait_until(resetsAt) | relaunch | stall | exit(done) | exit(needs_human:<reason>) | exit(running)`.

**Action mapping (frozen).**

| Observation | Action |
| --- | --- |
| No live runner, no prior run this invocation | `launch` (spawn the runner with the pass-through flags) |
| Live runner (lock/pid alive) at start | `attach` (wait on it; never a second launch) |
| Runner exited 0 | `exit(done)` — watchdog exit 0 |
| Runner exited 2 | `exit(needs_human:escalations_pending)` |
| Runner exited 5 | `exit(needs_human:rulings_unratified)` |
| Runner exited 4 | `exit(needs_human:error)` |
| Runner exited 3, newest log carries `rate_limit_event.status == rejected` with `resetsAt` | `wait_until(resetsAt + 30 s)` then `relaunch`; count a quota wait; over cap → `exit(needs_human:quota_cap)` |
| Runner exited 3, no quota signal | `relaunch` once; second time → `exit(needs_human:session_incomplete)` |
| Runner exited 1 (lock held by a live process) | `attach` if the holder is alive, else `relaunch` |
| Runner alive, no log mtime change > `--stall-minutes` | record `stall`; `--follow` → `exit(needs_human:stalled)`; `--once` → exit `running` with the stall noted |
| `--once` and runner alive, not stalled | `exit(running)` |
| `STOP` file present | do not launch/relaunch; `exit(done)` with reason `stop_requested` |

**Outputs.** `<home>/watchdog/status.json` (current state: mode, runner pid, last action,
counters, `nextWakeAt` during a quota wait, terminal reason) rewritten atomically on every
change, and `<home>/watchdog/events.jsonl` append-only (one line per action with ISO
timestamp). Watchdog exit codes: `0` done · `10` needs_human (reason in status.json) ·
`11` running (`--once` only) · `1` usage error. Stdout: one human line per action; the
last line names the status file.

**Never.** Never kills the runner or a session; never writes to `campaign-state.json`,
`answers.md`, or escalations (W3); never spawns an LLM itself; never sleeps past
`resetsAt` + 30 s without re-checking (a wake-up loop, not a single long sleep, so a `STOP`
file or a manual relaunch is noticed within a minute).

### 2.2 Integration

- `plugins/tribe/skills/orchestrate-campaign/SKILL.md` Stage B step 2: launch the watchdog
  in `--follow` mode (background) with the same flags; step 3 reads `status.json` first,
  then `campaign-report.json`; add one sentence: no `/loop` heartbeat is needed while a
  watchdog is attached. Stage C re-triggers go through the watchdog too.
- `plugins/tribe/scripts/runner/README.md`: a "Watchdog" section (flags, exit codes,
  files, the action table). `plugins/tribe/README.md`: one paragraph + quick-reference row.
- `plugins/tribe/scripts/doctor.sh`: unchanged unless a new prerequisite exists.
- `docs/tribe/fixlists/2026-08-08-outstanding-17/README.md`: P14 row → "SUPERSEDED by #74
  (watchdog)"; P13 row gains a note that the adopt-on-start behaviour covers the harness-kill
  case without a detached launch.
- `install.sh` `--list` output must still be correct (scripts are repo-invoked, not
  installed); `plugins/tribe/scripts/tests/test-fresh-machine.sh` still passes.
- C3: change-unit naming c3-215 (tribe), ADR "mechanical heartbeat supersedes P14",
  c3-215 doc updated (scripts list, business flow row for unattended waits).

---

## 3. Decisions (frozen — see the card's D74-1..7)

D74-1 supersedes P14 · D74-2 notification = process exit · D74-3 bun/TS, pure core,
reached from `$runner_dir` · D74-4 quota signal from the log · D74-5 bounded waits (6 quota,
1 crash) · D74-6 `--once`/`--follow` · D74-7 adopt, never duplicate.

---

## 4. Non-goals

OS/Slack notifications; killing sessions; changing runner exit codes/state schema; the status
viewer; a cron/launchd installer (the `--once` mode makes it possible later); upstream-drift
detection (that is #75, which extends this tick).

---

## 5. Acceptance — measurable goals (from the card)

| Goal | Evidence the PR must carry | Gate |
| --- | --- | --- |
| G1 quota recovery | unit + integration test with a runner double and the real-shaped fixture; events show `quota_wait → relaunch → done`; dead time after reset ≤ 60 s | green |
| G2 skip when alive | test: live double → `running`, one process only | green |
| G3 terminal mapping | table-driven test over exit codes 0/1/2/3/4/5 × quota-signal present/absent | green, every row |
| G4 stall | test with frozen clock: no mtime change > threshold → `stall` then `needs_human:stalled` in follow mode | green |
| G5 real runner | one e2e against a throwaway home with a spec-less card: runner exit 2, zero sessions, watchdog `needs_human:escalations_pending`; command + `status.json` + `events.jsonl` pasted in the PR | present, reproducible |
| G6 integrated | SKILL.md Stage B, runner README, tribe README, P14 row, `test-fresh-machine.sh`, C3 change-unit + ADR | present in the diff |

---

## 6. Verification steps (what the Shaman runs before merging)

1. `cd plugins/tribe/scripts/runner && bun test` (or the watchdog's own dir) — all green,
   including the pure decision function's table test.
2. `bash plugins/tribe/scripts/tests/test-fresh-machine.sh` and every other
   `scripts/tests/*.sh` the plan names — green.
3. Replay G5 myself: create a throwaway home with a one-card state whose spec/plan paths do
   not exist; run the watchdog `--follow` with the real runner; expect exit 10, status
   reason `escalations_pending`, `events.jsonl` with `launch` then `exit`, no session log.
4. Replay G1 with the fixture and a `resetsAt` 20 s in the future: expect a wait of ~50 s
   then `relaunch` then `done`.
5. `grep -n "watchdog" plugins/tribe/skills/orchestrate-campaign/SKILL.md` — Stage B names
   it; the bare-runner launch is no longer the primary path.
6. Diff ⊆ scope fence; two independent skinner reports `AUDIT: PASS`; tracker + scout
   present; C3 change-unit + ADR; P14 row updated.

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| `resetsAt` missing or in the past (clock skew, different limit type) | Treat as "no signal": crash path (one relaunch); log the raw line in events |
| The harness kills the background watchdog (P13) | Adopt-on-start (D74-7): relaunching the watchdog attaches to the live runner; document in Stage B |
| Long sleeps blocked by the harness | The watchdog is a child process of Bash, not the LLM; it sleeps in small wake-up loops (≤60 s) |
| Watchdog and runner both write under `<home>` | Watchdog writes ONLY under `<home>/watchdog/`; test asserts no other path is touched |

---

## 8. Amendments from campaign evidence (Shaman, 2026-09-03, after card #106 shipped)

Everything below was observed live in this campaign and is binding on the plan.

| Observation (dated, in `SHAMAN-STATE.md` diary) | Consequence for this spec |
| --- | --- |
| Five account-limit kills in 24 h (planning Warchief 15:05Z; executor 23:27Z; evidence lanes 00:50Z; direct Warchief ~06:00Z; the Shaman session itself, paused 00:52→04:41Z and 06:00→15:08Z). `rate_limit_event.resetsAt` was present every time. | The quota path (§2.1 table) is the primary path, not an edge case. The watchdog's own status file must expose `nextWakeAt` so a resuming Shaman (or the owner) sees at a glance when work resumes. |
| Three consecutive HTTP 529 Overloaded kills on `claude-opus-5` within 15 min (15:19–15:35Z), unrelated to quota. The session log's `result` line carries `api_error_status: 529`. | New row in the action table: **exit 3 with a 5xx/overload signal in the newest log → backoff-and-relaunch** (30 s, 60 s, 120 s, 240 s, 480 s; cap 5, then `needs_human:overloaded`). Distinct counter from quota waits and from the crash relaunch. Optional flag `--fallback-model <tier>`: after the cap, relaunch once with that tier instead of parking (off by default; the Shaman used a sonnet closer by hand). |
| macOS has no `setsid`; a plain harness background Bash dies at the 10-minute tool timeout; `( nohup … & )` double-fork survived. | §2.2 integration: the orchestrate-campaign skill launches the watchdog **detached** via a documented one-liner (double-fork, `nohup`, stdin from `/dev/null`) and then arms a Monitor/`until` loop on `status.json` for the wake-up. The watchdog must write `status.json` within 5 s of start so the Monitor has something to read. G6 gains: the detached launch is exercised in `test-fresh-machine.sh` (or a sibling shell test) on macOS and Linux shells. |
| The executor's worker report is not a timestamped heartbeat; the only liveness signal during a pass is the session log mtime. | G4 stays log-mtime-based (already specced). Add: the stall event names the log file and its last mtime. |
| New rules landed on master 2026-09-03 (PR #109): `plugins/tribe/rules/brief-contracts.md`, `fail-closed-edges.md`, `fixtures-mirror-reality.md`. | Binding on the plan and every brief: **name the oracle** (this spec's action table is the oracle; over-relaunching within caps is by design, silent non-relaunch is a bug); **fail-closed edges** (every spawn has a timeout; narrow catches; the watchdog refuses a `--home` outside `$HOME/.tribe` or missing `campaign-state.json` with a typed message, never a stack trace); **fixtures mirror reality** (the quota fixture is a real log verbatim; the 529 fixture is the real `result` line; G5's real-runner e2e runs against an EMPTY throwaway home built from nothing, and the watchdog is invoked with both a relative and an absolute `--home`). |
| The runner cannot deliver a ruling to a resumed session and cannot reconcile a Shaman-merged card to `shipped` (R1b, D2). | Out of scope here (recorded as FU-7 for a runner card); the watchdog must not paper over it — a `needs_human:escalations_pending` exit is the correct outcome for both. |
| The `verify-shipped` skill is not symlinked into `~/.claude/skills` on this machine (only 3 skills are); the repo copy works. | Not this card. Noted in the diary as an install gap. |

Scope fence unchanged except: `plugins/tribe/scripts/tests/` gains the detached-launch test; `plugins/tribe/skills/orchestrate-campaign/SKILL.md` Stage B gets the detached launch + Monitor wording.

## 9. Amendments accepted from planning (Shaman ruling R3, 2026-09-03)

The planning Warchief proposed nine How-level clarifications; all are accepted and are now part
of this contract. Where §2.1 and this section differ, this section wins.

1. **Empty home = `campaign-state.json` + an empty `answers.md`.** Measured: the real runner
   exits 4 (`ENOENT … answers.md`) on a home with only the state file, and exits 2
   (`planning_needed`, zero sessions, no `logs/`) once an empty `answers.md` exists. G5 and §6
   step 3 use that shape. (Runner follow-up FU-i74-1: treat a missing `answers.md` as "no
   rulings" — out of fence.)
2. **Precedence:** a terminal runner exit (0/2/4/5) beats `STOP`; within exit 3, a quota signal
   beats an overload signal.
3. **Quota signal = the last `rate_limit_event` with `status: "rejected"` and a future
   `resetsAt`;** the 429 `result` line corroborates but is not required; a 429 with no rejected
   event falls to the crash path. Under-detecting quota is the defect; over-waiting is bounded
   and visible as `nextWakeAt`.
4. **Last line wins** when parsing the log tail (real logs carry `allowed`/`allowed_warning`
   events before the final `rejected`).
5. **`--once` never sleeps:** it records `nextWakeAt` and exits `11` with reason
   `quota_wait_pending` / `overload_backoff_pending`.
6. **Flags added:** `--poll-seconds` (default 30), `--quota-grace-seconds` (default 30),
   pass-through `--remote`; `--dry-run` is rejected.
7. **New terminal reason `lock_conflict`** for a lock held by a live process that is not this
   watchdog's own runner and cannot be adopted.
8. **Documented exception to `fail-closed-edges` obligation 3:** the supervised runner's
   lifetime is unbounded by design (G4: the watchdog never kills), recorded as a comment at the
   spawn seam; every individual wait is bounded by `--poll-seconds`.
9. **Landing path of the plan:** `docs/superpowers/plans/2026-09-03-mechanical-heartbeat.md`;
   the campaign state file's `plan` value is updated to match.

Also accepted: the watchdog is a **subcommand of the runner CLI** (`run.ts watchdog`), with
its vocabulary in `core/watchdog/model.ts` so no schema-lock path is touched; `doctor.sh`,
`install.sh`, `resolve-runner.sh` and `test-fresh-machine.sh` need no functional change (the
latter measured green, 26/26 — the "1 failing check" noted earlier did not reproduce).
