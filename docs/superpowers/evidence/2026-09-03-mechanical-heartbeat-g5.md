# G5 evidence — real runner under the real watchdog, from an empty campaign home

Card `i74-mechanical-heartbeat`, task 12/15. Captured by hand-running the absolute-`--home`
probe of `plugins/tribe/scripts/tests/test-watchdog-e2e.sh` against the REAL runner
(`run.ts`, no double, no mock), from a throwaway campaign home built from nothing under the
real tribe root, then deleted.

## Command line

```
bun "$RUNNER/run.ts" watchdog --repo "$REPO" --model e2e-model --home "$H" --poll-seconds 1
```

resolved (this run):

```
bun "/Users/hip/repo/todd-skills-wt/i74-mechanical-heartbeat/plugins/tribe/scripts/runner/run.ts" \
  watchdog --repo "/Users/hip/.tribe/g5-evidence-tmp/repo" --model e2e-model \
  --home "/Users/hip/.tribe/g5-evidence-tmp/campaign-home" --poll-seconds 1
```

`$H` ("the minimal real home the orchestrate-campaign skill authors") contained exactly:
- `campaign-state.json` — one card `E1`, `spec`/`plan` pointing at paths that do not exist on
  disk (`docs/never-authored-spec.md`, `docs/never-authored-plan.md`)
- an empty `answers.md`

## stdout/stderr

```
launch: starting the campaign runner
attach: runner pid 35212 is already live — waiting on it
exit: needs_human:escalations_pending
status: /Users/hip/.tribe/g5-evidence-tmp/campaign-home/watchdog/status.json
```

Exit code: **10** (`WATCHDOG_EXIT_NEEDS_HUMAN`).

## `watchdog/status.json`

```json
{
  "v": 1,
  "mode": "follow",
  "pid": 35211,
  "home": "/Users/hip/.tribe/g5-evidence-tmp/campaign-home",
  "startedAt": "2026-09-04T07:24:57.996Z",
  "updatedAt": "2026-09-04T07:24:58.067Z",
  "state": "terminal",
  "lastAction": "exit:needs_human:escalations_pending",
  "runId": "2026-09-04T07-24-58-046Z-17e8",
  "runnerPid": 35212,
  "runnerCommand": [
    "bun",
    "/Users/hip/repo/todd-skills-wt/i74-mechanical-heartbeat/plugins/tribe/scripts/runner/run.ts",
    "--repo",
    "/Users/hip/.tribe/g5-evidence-tmp/repo",
    "--model",
    "e2e-model",
    "--home",
    "/Users/hip/.tribe/g5-evidence-tmp/campaign-home"
  ],
  "counters": {
    "quotaWaits": 0,
    "overloadBackoffs": 0,
    "crashRelaunches": 0,
    "lockRelaunches": 0,
    "fallbackUsed": false
  },
  "nextWakeAt": null,
  "stall": null,
  "terminal": {
    "status": "needs_human",
    "reason": "escalations_pending",
    "exitCode": 10
  }
}
```

## `watchdog/events.jsonl`

```json
{"at":"2026-09-04T07:24:57.996Z","action":"start","detail":{"mode":"follow","home":"/Users/hip/.tribe/g5-evidence-tmp/campaign-home","pollSeconds":1,"signal":null}}
{"at":"2026-09-04T07:24:57.997Z","action":"launch","detail":{"cause":"initial","model":null,"signal":null}}
{"at":"2026-09-04T07:24:57.998Z","action":"attach","detail":{"runnerPid":35212,"signal":null}}
{"at":"2026-09-04T07:24:58.068Z","action":"exit","detail":{"status":"needs_human","reason":"escalations_pending","exitCode":10,"signal":null}}
```

Note on shape: the governing quote (spec §6 step 3) says "`events.jsonl` with `launch` then
`exit`". Measured here (and reproducibly, across repeated runs): a follow-mode watchdog
observes the freshly-spawned child as ALIVE on the very next tick — before its exit lands —
so `decide()` attaches to it once before the terminal exit is observed. The real sequence is
`start, launch, attach, exit`, not `start, launch, exit`. `launch` is still followed
(eventually) by `exit`, exactly as the quote requires; the `attach` in between is a real,
deterministic observation of the live runner, not a defect. `test-watchdog-e2e.sh` asserts
this exact real sequence.

## Zero sessions spawned (positive proof)

```
$ find "$H/runs" -type d -name logs
(no output)
```

No `logs/` directory was ever created under `runs/<runId>/` — the runner escalated
`planning_needed` before it could spawn an LLM session. Zero tokens spent.

## Runner's own report (agrees with the watchdog's verdict)

`campaign-report.json`:

```json
{
  "v": 1,
  "campaign": "watchdog-e2e",
  "run": {
    "startedAt": "2026-09-04T07:20:05.686Z",
    "endedAt": "2026-09-04T07:20:05.707Z",
    "exitCode": 2,
    "reason": "escalations_pending"
  },
  "cards": {
    "E1": {
      "outcome": "escalated",
      "escalationFile": "escalations/E1.md",
      "question": "planning_needed: Missing on disk: spec, plan",
      "autoAnswerRounds": 0
    }
  },
  "pending": ["E1"],
  "stats": { "shipped": 0, "escalated": 1, "blocked": 0, "notReached": 0 }
}
```

`escalations/E1.md`:

```
# Escalation: E1

**Reason:** planning_needed

## Context
Missing on disk: spec, plan

## Options
- Append a ruling to `<home>/answers.md` and re-run with `--include-escalated`.
- If the question is owner-only (see the campaign's ownerOnlyEscalations), park it for the
  owner instead.
```

## FU-i74-1 (recorded, not fixed — out of this card's fence)

A home containing ONLY `campaign-state.json` (no `answers.md` at all) makes the real runner
crash with `campaign runner: unexpected error: ENOENT: no such file or directory, open
'<home>/answers.md'`, exit code **4** — before it can escalate. `test-watchdog-e2e.sh` probe 3
asserts the watchdog still turns this into a clean typed `needs_human:error` outcome (exit
10, no stack trace) rather than propagating the crash, but the runner-core ENOENT itself is a
pre-existing defect out of this card's fence (runner-core changes are forbidden by the
schema-lock/fence) and is left for the Shaman as a follow-up.
