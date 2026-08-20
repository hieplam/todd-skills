# P1 — wait-aware liveness: stop losing sessions that end their turn to wait

- **Status:** SHIPPED — PR #82, merge `5768e9a` (2026-08-13).
- **Incident:** ×4 (B9, A1, B10, B14 — log lines 135–144, 156–161, 319, 331). An executor
  opens its PR, arms a Monitor (async-notification tool) or waits for a background task,
  then ends its turn — the SDK returns a result with no `SHIPPED`/`NEEDS_DIRECTION` line,
  the runner classifies it `session_incomplete`, exits 3, and a human must re-trigger
  (~5 min dead each time). The prose wall in the brief failed 4 times; the existing
  backgrounding hook (`core/session.ts:71-88`) cannot see this because "ending a turn" is
  not a tool call and Monitor is not Bash/Agent/Task.

## Decision — three layers

1. **Deny wait-tools by hook** (prevention): extend the PreToolUse hook to deny
   `Monitor` and `ScheduleWakeup` tool calls, with a steering message.
2. **In-run bounded auto-retry** (containment): when a session ends with outcome `error`
   (never `timeout`), the loop re-derives the card's phase and re-acts, up to 2 retries
   per card per pass — automating exactly what the human re-trigger did ("pure resume").
3. **Brief teaches the correct wait** (guidance): foreground `gh pr checks --watch`
   — the pattern late-08-08 executors discovered themselves (log lines 327–331).

## Implementation guide (fresh session, smaller model — no extra context needed)

Repo: `todd-skills`. All paths below are under `plugins/tribe/scripts/runner/`.
Run tests with: `cd plugins/tribe/scripts/runner && bun test`.

### Step 1 — hook: deny wait-tools (`core/session.ts`)

- Add next to `BACKGROUNDING_DENIED_REASON` (line ~54):

  ```ts
  export const WAIT_TOOL_DENIED_REASON =
    'Wait-tools are disabled for campaign executor sessions: this session ends the moment ' +
    'it stops calling tools, so an armed Monitor/ScheduleWakeup notification can never ' +
    'reach you — ending your turn to wait kills the session. To wait on CI, run ' +
    '`gh pr checks <pr> --watch` in the FOREGROUND (Bash, timeout: 600000) and proceed ' +
    'when it concludes.';
  ```

- In `decideBackgroundingHook` (line 71), before the Bash/Agent/Task logic, add:

  ```ts
  if (toolName === 'Monitor' || toolName === 'ScheduleWakeup') {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse',
      permissionDecision: 'deny', permissionDecisionReason: WAIT_TOOL_DENIED_REASON } };
  }
  ```

- Tests in `core/session.test.ts` (copy the existing backgrounding-hook test shape):
  Monitor → denied with WAIT_TOOL_DENIED_REASON; ScheduleWakeup → denied; Read/Grep/plain
  Bash → still empty decision; Bash with `run_in_background: true` → still the
  backgrounding denial (unchanged).

### Step 2 — bounded auto-retry (`core/loop/card-actions.ts` + `core/loop/run-loop.ts`)

- In `card-actions.ts`, the `stopped` outcome (line ~359) gains a field:
  `retryable: boolean` — `true` when `sessionResult.outcome === 'error'`, `false` for
  `'timeout'` (a timed-out session was aborted deliberately; an `error` outcome here means
  "ended without a terminal line", which is exactly the wait trap). Update the
  `CardOutcome` type (line ~37).
- In `run-loop.ts` `runPass`, replace lines 196-198 with a bounded retry loop:

  ```ts
  let outcome = await actOnCard(ctx, phase);
  let retries = 0;
  while (outcome.kind === 'stopped' && outcome.retryable && retries < 2) {
    retries += 1;
    const retryPhase = await deriveCardPhase(nc.cardId, nc.card, derivePhaseConfigOf(resolved), io);
    if (retryPhase.kind === 'escalation_pending') break;
    outcome = await actOnCard(ctx, retryPhase);
  }
  ```

  Note: `deriveCardPhase` re-reads world state — the card now has a recorded `sessionId`
  and possibly an open PR, so the retry naturally takes the D4 resume path
  (`CONTINUE_PR_OPEN_PROMPT` / fresh-with-digest), the same recovery the human re-trigger
  performed on 08-08.
- Tests in `core/loop.test.ts`: (a) session ends `error` once then ships on retry → pass
  outcome `shipped`, 2 sessions spawned; (b) session ends `error` 3 times → outcome
  `stopped` after exactly 3 attempts (1 + 2 retries), exit `EXIT_SESSION_INCOMPLETE`;
  (c) `timeout` → no retry, 1 attempt.

### Step 3 — brief guidance (`core/brief-template.md`)

In the "Session liveness" section, after the split-by-file bullet, add:

> - To wait for CI: `gh pr checks <pr> --watch` in the foreground (timeout: 600000),
>   re-run it if 10 minutes is not enough. Monitor/ScheduleWakeup are blocked — a
>   notification can never wake you.

### Acceptance

Unit suites above green. Behavior change vs 08-08: the four `session_incomplete` exits
would have been absorbed in-run (retry resumes the card) with zero human re-triggers.
