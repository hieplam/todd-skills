/**
 * The watchdog's PURE decision core (D74-3): `(observation) -> action`. No clock, no fs, no
 * spawn, no throw — every world fact arrives on the observation, so the whole action table is
 * exercised as data (`decide.test.ts`, 48 rows).
 *
 * Precedence (W-P1): a terminal runner exit (0/2/4/5) answers first — it is more informative
 * than `stop_requested`. STOP then suppresses everything that would START work (launch,
 * relaunch, wait). Within exit 3, a rejected quota signal outranks an overload signal: a quota
 * wall has a known reset instant, a 529 is transient.
 */
import type { WatchdogAction, WatchdogObservation } from './model.ts';
// G3 (group-B audit round 1, class `agreed`): delegate to select.ts's isStale rather than
// duplicate its `>` inline — a sibling module inside core/watchdog/, so this keeps the core
// pure and breaks no layering rule.
import { isStale } from './select.ts';

/** Spec §8, verbatim: 30 s, 60 s, 120 s, 240 s, 480 s, then clamped. */
const OVERLOAD_BACKOFF_SECONDS = [30, 60, 120, 240, 480];

/** Total over every `number` (G1, group-B audit round 1): a fractional, `NaN`, negative or
 * out-of-range attempt must still land on a defined entry, never `undefined` — a non-finite
 * attempt saturates to the first entry, everything else rounds to its nearest index and clamps
 * into range (the table's last entry is the natural saturation point). */
export function overloadBackoffSeconds(attempt: number): number {
  const safeAttempt = Number.isFinite(attempt) ? attempt : 0;
  const index = Math.min(Math.max(Math.round(safeAttempt), 0), OVERLOAD_BACKOFF_SECONDS.length - 1);
  return OVERLOAD_BACKOFF_SECONDS[index] as number;
}

const STOP: WatchdogAction = { kind: 'exit', status: 'done', reason: 'stop_requested' };

export function decide(o: WatchdogObservation): WatchdogAction {
  // --- 1. A live runner: never launch a second one (D74-7). Stall is the only thing that can
  // end the wait, and it NEVER kills the runner (card G4: the runner's own --session-timeout
  // owns that) — it reports, and in follow mode hands the decision to a human.
  if (o.run?.alive) {
    const mtime = o.run.newestLogMtimeMs;
    const stalled = isStale(o.nowMs, mtime, o.limits.stallMinutes);
    if (stalled) {
      return {
        kind: 'stall',
        logPath: o.run.newestLogPath,
        lastMtimeMs: mtime,
        exit: { status: o.mode === 'once' ? 'running' : 'needs_human', reason: 'stalled' },
      };
    }
    if (o.mode === 'once') return { kind: 'exit', status: 'running', reason: 'runner_alive' };
    return { kind: 'attach', runnerPid: o.run.runnerPid };
  }

  // --- 2. Terminal runner outcomes (W-P1: these outrank a STOP file).
  switch (o.lastExitCode) {
    case 0: return { kind: 'exit', status: 'done', reason: 'runner_done' };
    case 2: return { kind: 'exit', status: 'needs_human', reason: 'escalations_pending' };
    case 4: return { kind: 'exit', status: 'needs_human', reason: 'error' };
    case 5: return { kind: 'exit', status: 'needs_human', reason: 'rulings_unratified' };
    default: break;
  }

  // --- 3. Exit 1: the single-instance lock refused the start.
  if (o.lastExitCode === 1) {
    if (o.lockHolder?.alive) return { kind: 'attach', runnerPid: o.lockHolder.pid };
    if (o.stopFilePresent) return STOP;
    if (o.counters.lockRelaunches >= 1) {
      return { kind: 'exit', status: 'needs_human', reason: 'lock_conflict' };
    }
    return { kind: 'relaunch', cause: 'lock_free', model: null };
  }

  // --- 4. Exit 3, or a crash with no code to read (W-P6): the recoverable deaths.
  if (o.lastExitCode === 3 || (o.lastExitCode === null && o.crashSuspected)) {
    // W-P2: a missing or already-elapsed reset is NOT a quota signal (spec §7).
    const quotaUntilMs =
      o.quota === null ? null : (o.quota.resetsAtEpochS + o.limits.quotaGraceSeconds) * 1000;
    const quotaIsFuture = quotaUntilMs !== null && o.quota !== null
      && o.quota.resetsAtEpochS * 1000 > o.nowMs;

    if (quotaIsFuture) {
      if (o.stopFilePresent) return STOP;
      if (o.counters.quotaWaits >= o.limits.maxQuotaWaits) {
        return { kind: 'exit', status: 'needs_human', reason: 'quota_cap' };
      }
      if (o.mode === 'once') {
        return { kind: 'exit', status: 'running', reason: 'quota_wait_pending' };
      }
      return { kind: 'wait_until', untilMs: quotaUntilMs as number, cause: 'quota' };
    }

    if (o.overload !== null) {
      if (o.stopFilePresent) return STOP;
      if (o.counters.overloadBackoffs >= o.limits.maxOverloadBackoffs) {
        if (o.fallbackModel !== null && !o.counters.fallbackUsed) {
          return { kind: 'relaunch', cause: 'overload', model: o.fallbackModel };
        }
        return { kind: 'exit', status: 'needs_human', reason: 'overloaded' };
      }
      if (o.mode === 'once') {
        return { kind: 'exit', status: 'running', reason: 'overload_backoff_pending' };
      }
      const seconds = overloadBackoffSeconds(o.counters.overloadBackoffs);
      return { kind: 'wait_until', untilMs: o.nowMs + seconds * 1000, cause: 'overload' };
    }

    if (o.stopFilePresent) return STOP;
    if (o.counters.crashRelaunches >= o.limits.maxCrashRelaunches) {
      return { kind: 'exit', status: 'needs_human', reason: 'session_incomplete' };
    }
    return { kind: 'relaunch', cause: 'crash', model: null };
  }

  // --- 5. Nothing has run yet this invocation.
  if (o.lockHolder?.alive) return { kind: 'attach', runnerPid: o.lockHolder.pid };
  if (o.stopFilePresent) return STOP;
  return { kind: 'launch' };
}
