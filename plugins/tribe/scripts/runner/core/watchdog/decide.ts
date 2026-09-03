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

/** Spec §8, verbatim: 30 s, 60 s, 120 s, 240 s, 480 s, then clamped. */
const OVERLOAD_BACKOFF_SECONDS = [30, 60, 120, 240, 480];

export function overloadBackoffSeconds(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), OVERLOAD_BACKOFF_SECONDS.length - 1);
  return OVERLOAD_BACKOFF_SECONDS[index] as number;
}

const STOP: WatchdogAction = { kind: 'exit', status: 'done', reason: 'stop_requested' };

export function decide(o: WatchdogObservation): WatchdogAction {
  // --- 1. A live runner: never launch a second one (D74-7). Task 5 refines with stall/once.
  if (o.run?.alive) {
    return { kind: 'attach', runnerPid: o.run.runnerPid ?? 0 };
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
