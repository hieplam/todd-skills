# Evidence — mechanical heartbeat: before and after

**Card:** `i74-mechanical-heartbeat` (GitHub issue #74) · **Campaign:** `gh-issues-2026-09`
**Captured by:** the delivering Warchief, on this branch, 2026-09-04. Every number below was
produced by running the commands shown — none is quoted from an implementer's report.

---

## BEFORE — what a quota death cost, measured from the campaign's own wreckage

The owner's complaint (issue #74) is that a 15-minute LLM `/loop` heartbeat was paying tokens to
watch facts that are all mechanical. The fixlist ruled that dead time acceptable:

> | P14 | Quota pause kills the running session | **27 min dead time** | … the 15-minute cron heartbeat resumed the run … |

That is not a hypothetical. The artifacts of one such death are still on this machine, and they
are exactly the three facts an LLM tick had to read and reason about by hand:

**1. The run record — the runner died mid-campaign.**
`~/.tribe/…/campaigns/gh-issues-2026-09/runs/2026-09-02T19-06-46-423Z-7bb7/run.json`
```json
"runId":   "2026-09-02T19-06-46-423Z-7bb7",
"endedAt": "2026-09-02T23:27:44.198Z",
"exitCode": 3,
"reason":  "session_incomplete"
```

**2. The session log's quota signal** (this exact log is vendored as the test fixture
`plugins/tribe/scripts/runner/fixtures/watchdog/quota-real-429.log`, byte-identical to source):
```json
{"type":"rate_limit_event","rate_limit_info":{"status":"rejected","resetsAt":1788392400,
 "rateLimitType":"five_hour","overageStatus":"rejected",…}}
```
```json
"api_error_status":429,…,"result":"You've hit your session limit · resets 6:40am (Asia/Saigon)"
```

**3. The arithmetic nobody should be paying an LLM to do:**
```
runner died   2026-09-02T23:27:44Z
resetsAt      1788392400  =  2026-09-02T23:40:00Z
true wait     12 min 16 s
```
The work was ready to resume at **23:40:00**. With a 15-minute LLM tick the resumption lands on
whenever the next tick happens to fire — which is how a 12-minute wall becomes the **27 minutes**
P14 recorded, plus one full LLM turn every 15 minutes for the entire life of the campaign.

---

## AFTER — the same facts, read by a script, at zero token cost

**G1 — quota recovery with no LLM in the loop.** Against a runner double that exits 3 after
writing the real-shaped `rate_limit_event`, driving the REAL loop and REAL adapter with REAL child
processes (`plugins/tribe/scripts/runner/watchdog-integration.test.ts`):

```
events.jsonl:  start → launch → attach → wait_until → relaunch → attach → exit
outcome:       [0, runner_done]
```
Dead time after the reset instant is asserted, not asserted-ish —
`watchdog-integration.test.ts:82`:
```ts
expect(finished - (resetAt + 1) * 1000).toBeLessThan(60_000);
```
so the card's "≤ 60 s after `resetsAt`" is a gate the suite fails without. The `attach` steps are
the watchdog waiting on the child it just spawned rather than launching a second one.

**G3 — every terminal state surfaces**, same harness:
```
exit 0            → start → launch → attach → exit                                  ⇒ [0,  runner_done]
exit 3 ×2 (no signal) → start → launch → attach → relaunch → attach → exit          ⇒ [10, session_incomplete]
overload + fallback   → start → launch → attach → wait_until → wait_until → relaunch → attach → exit
                                                                                    ⇒ [0,  runner_done], fallbackUsed: true
```

**G5 — the real runner, no double.** Home built from nothing (exactly `campaign-state.json` + an
empty `answers.md`), card with no spec/plan on disk:

```
$ bun run.ts watchdog --repo <repo> --model claude-haiku-4-5-20251001 --home <throwaway> --follow --poll-seconds 1
launch: starting the campaign runner
attach: runner pid 40180 is already live — waiting on it
exit: needs_human:escalations_pending
```
```
runner's own run.json : "exitCode": 2, "reason": "escalations_pending"
watchdog status.json  : {"status":"needs_human","reason":"escalations_pending","exitCode":10}
zero-session proof    : find runs -maxdepth 2 -name logs -type d | wc -l   →   0
```
**No `logs/` directory was ever created — zero sessions spawned, therefore zero tokens spent.**
The runner wrote its escalation `E1.md` and stopped. Full transcript:
`docs/superpowers/evidence/2026-09-03-mechanical-heartbeat-g5.md`.

**Both `--home` forms** work (absolute and relative), which is what W-P10's realpathing of *both*
sides buys on macOS, where a throwaway `/var/folders/…` path resolves to `/private/var/folders/…`.

**`status.json` is written promptly** so a Monitor loop has something to poll — measured on the G5
run: `startedAt 07:28:25.347Z` → `updatedAt 07:28:25.421Z` = **74 ms**, against spec §8's 5 s
budget.

---

## The delta, stated plainly

| | before | after |
| --- | --- | --- |
| who reads the quota signal | an LLM turn, every 15 min, all campaign long | a script, at a bounded poll interval |
| token cost of waiting | one full turn per tick | **zero** |
| dead time after a quota reset | up to 27 min (P14, measured) | **< 60 s**, asserted by the suite |
| what wakes the lead session | an LLM tick noticing | the harness's own "background command exited" |
| runner killed by the supervisor | — | **never** (the runner's `--session-timeout` still owns that) |
