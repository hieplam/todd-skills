import { describe, expect, test } from 'bun:test';
import { decide, overloadBackoffSeconds } from './decide.ts';
import type { WatchdogObservation } from './model.ts';

const NOW = 1_800_000_000_000; // fixed clock, ms
const FUTURE_RESET_S = Math.floor(NOW / 1000) + 600;

const LIMITS = {
  stallMinutes: 30, maxQuotaWaits: 6, maxOverloadBackoffs: 5,
  maxCrashRelaunches: 1, quotaGraceSeconds: 30,
};
const ZERO = {
  quotaWaits: 0, overloadBackoffs: 0, crashRelaunches: 0, lockRelaunches: 0, fallbackUsed: false,
};

function obs(over: Partial<WatchdogObservation> = {}): WatchdogObservation {
  return {
    nowMs: NOW,
    mode: 'follow',
    stopFilePresent: false,
    lockHolder: null,
    run: {
      runId: '2026-09-03T00-00-00-000Z-aaaa',
      runnerPid: 4242,
      alive: false,
      endedAt: '2026-09-03T00:10:00.000Z',
      newestLogPath: '/h/.tribe/k/campaigns/c/runs/r/logs/card-sid.log',
      newestLogMtimeMs: NOW - 1000,
    },
    lastExitCode: 3,
    crashSuspected: false,
    quota: null,
    overload: null,
    counters: { ...ZERO },
    limits: { ...LIMITS },
    fallbackModel: null,
    ...over,
  };
}

/** One-line encoding of an action, so 48 expectations stay readable. */
function encode(a: ReturnType<typeof decide>): string {
  switch (a.kind) {
    case 'exit': return `exit:${a.status}:${a.reason}`;
    case 'relaunch': return `relaunch:${a.cause}${a.model ? `:${a.model}` : ''}`;
    case 'wait_until': return `wait_until:${a.cause}:${a.untilMs}`;
    case 'attach': return `attach:${a.runnerPid}`;
    case 'stall': return `stall:${a.exit.status}:${a.exit.reason}`;
    case 'launch': return 'launch';
  }
}

const QUOTA_WAIT = `wait_until:quota:${(FUTURE_RESET_S + 30) * 1000}`;
const OVERLOAD_WAIT = `wait_until:overload:${NOW + 30_000}`;

// The oracle, transcribed: every exit code x quota x 529 x STOP. `q`/`o`/`s` present = 1.
const TABLE: Array<[code: number, q: 0 | 1, o: 0 | 1, s: 0 | 1, want: string]> = [
  [0, 0, 0, 0, 'exit:done:runner_done'],
  [0, 0, 0, 1, 'exit:done:runner_done'],
  [0, 0, 1, 0, 'exit:done:runner_done'],
  [0, 0, 1, 1, 'exit:done:runner_done'],
  [0, 1, 0, 0, 'exit:done:runner_done'],
  [0, 1, 0, 1, 'exit:done:runner_done'],
  [0, 1, 1, 0, 'exit:done:runner_done'],
  [0, 1, 1, 1, 'exit:done:runner_done'],

  [1, 0, 0, 0, 'relaunch:lock_free'],
  [1, 0, 0, 1, 'exit:done:stop_requested'],
  [1, 0, 1, 0, 'relaunch:lock_free'],
  [1, 0, 1, 1, 'exit:done:stop_requested'],
  [1, 1, 0, 0, 'relaunch:lock_free'],
  [1, 1, 0, 1, 'exit:done:stop_requested'],
  [1, 1, 1, 0, 'relaunch:lock_free'],
  [1, 1, 1, 1, 'exit:done:stop_requested'],

  [2, 0, 0, 0, 'exit:needs_human:escalations_pending'],
  [2, 0, 0, 1, 'exit:needs_human:escalations_pending'],
  [2, 0, 1, 0, 'exit:needs_human:escalations_pending'],
  [2, 0, 1, 1, 'exit:needs_human:escalations_pending'],
  [2, 1, 0, 0, 'exit:needs_human:escalations_pending'],
  [2, 1, 0, 1, 'exit:needs_human:escalations_pending'],
  [2, 1, 1, 0, 'exit:needs_human:escalations_pending'],
  [2, 1, 1, 1, 'exit:needs_human:escalations_pending'],

  [3, 0, 0, 0, 'relaunch:crash'],
  [3, 0, 0, 1, 'exit:done:stop_requested'],
  [3, 0, 1, 0, OVERLOAD_WAIT],
  [3, 0, 1, 1, 'exit:done:stop_requested'],
  [3, 1, 0, 0, QUOTA_WAIT],
  [3, 1, 0, 1, 'exit:done:stop_requested'],
  [3, 1, 1, 0, QUOTA_WAIT],
  [3, 1, 1, 1, 'exit:done:stop_requested'],

  [4, 0, 0, 0, 'exit:needs_human:error'],
  [4, 0, 0, 1, 'exit:needs_human:error'],
  [4, 0, 1, 0, 'exit:needs_human:error'],
  [4, 0, 1, 1, 'exit:needs_human:error'],
  [4, 1, 0, 0, 'exit:needs_human:error'],
  [4, 1, 0, 1, 'exit:needs_human:error'],
  [4, 1, 1, 0, 'exit:needs_human:error'],
  [4, 1, 1, 1, 'exit:needs_human:error'],

  [5, 0, 0, 0, 'exit:needs_human:rulings_unratified'],
  [5, 0, 0, 1, 'exit:needs_human:rulings_unratified'],
  [5, 0, 1, 0, 'exit:needs_human:rulings_unratified'],
  [5, 0, 1, 1, 'exit:needs_human:rulings_unratified'],
  [5, 1, 0, 0, 'exit:needs_human:rulings_unratified'],
  [5, 1, 0, 1, 'exit:needs_human:rulings_unratified'],
  [5, 1, 1, 0, 'exit:needs_human:rulings_unratified'],
  [5, 1, 1, 1, 'exit:needs_human:rulings_unratified'],
];

describe('decide — the frozen action table, every row', () => {
  test('the table covers 6 exit codes x quota x overload x STOP', () => {
    expect(TABLE.length).toBe(48);
  });

  for (const [code, q, o, s, want] of TABLE) {
    test(`exit ${code} quota=${q} overload=${o} stop=${s} -> ${want}`, () => {
      const action = decide(
        obs({
          lastExitCode: code,
          quota: q ? { resetsAtEpochS: FUTURE_RESET_S } : null,
          overload: o ? { apiErrorStatus: 529 } : null,
          stopFilePresent: s === 1,
        }),
      );
      expect(encode(action)).toBe(want);
    });
  }
});

describe('decide — quota reset validity (W-P2, spec section 7)', () => {
  test('a reset already in the past is no signal: the crash path takes it', () => {
    const action = decide(
      obs({ lastExitCode: 3, quota: { resetsAtEpochS: Math.floor(NOW / 1000) - 10 } }),
    );
    expect(encode(action)).toBe('relaunch:crash');
  });
  test('the grace period is applied to the reset instant', () => {
    const action = decide(
      obs({
        lastExitCode: 3,
        quota: { resetsAtEpochS: FUTURE_RESET_S },
        limits: { ...LIMITS, quotaGraceSeconds: 90 },
      }),
    );
    expect(encode(action)).toBe(`wait_until:quota:${(FUTURE_RESET_S + 90) * 1000}`);
  });
});

describe('decide — a crash with no exit code to read (W-P6)', () => {
  test('dead pid plus unfinalized run.json takes the exit-3 branch', () => {
    const action = decide(obs({ lastExitCode: null, crashSuspected: true }));
    expect(encode(action)).toBe('relaunch:crash');
  });
  test('and honours a quota signal the same way', () => {
    const action = decide(
      obs({ lastExitCode: null, crashSuspected: true, quota: { resetsAtEpochS: FUTURE_RESET_S } }),
    );
    expect(encode(action)).toBe(QUOTA_WAIT);
  });
});

describe('overloadBackoffSeconds — the frozen schedule (spec section 8)', () => {
  test('30, 60, 120, 240, 480 and then clamped at 480', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(overloadBackoffSeconds)).toEqual([
      30, 60, 120, 240, 480, 480, 480,
    ]);
  });
});

const STALE_MS = NOW - 31 * 60 * 1000;

describe('decide — a live runner (follow mode)', () => {
  const alive = (over: Partial<WatchdogObservation> = {}) =>
    obs({
      lastExitCode: null,
      run: {
        runId: 'r', runnerPid: 4242, alive: true, endedAt: null,
        newestLogPath: '/h/logs/card-sid.log', newestLogMtimeMs: NOW - 1000,
      },
      ...over,
    });

  test('a fresh live runner is attached to, never relaunched', () => {
    expect(encode(decide(alive()))).toBe('attach:4242');
  });

  test('a stalled live runner reports the log and exits needs_human in follow mode', () => {
    const action = decide(
      alive({
        run: {
          runId: 'r', runnerPid: 4242, alive: true, endedAt: null,
          newestLogPath: '/h/logs/card-sid.log', newestLogMtimeMs: STALE_MS,
        },
      }),
    );
    expect(encode(action)).toBe('stall:needs_human:stalled');
    expect(action.kind === 'stall' && action.logPath).toBe('/h/logs/card-sid.log');
    expect(action.kind === 'stall' && action.lastMtimeMs).toBe(STALE_MS);
  });

  test('a live runner with no log yet is starting, not stalled', () => {
    const action = decide(
      alive({
        run: {
          runId: 'r', runnerPid: 4242, alive: true, endedAt: null,
          newestLogPath: null, newestLogMtimeMs: null,
        },
      }),
    );
    expect(encode(action)).toBe('attach:4242');
  });

  test('a STOP file never terminates a live runner (G4: never kills)', () => {
    expect(encode(decide(alive({ stopFilePresent: true })))).toBe('attach:4242');
  });
});

describe('decide — caps', () => {
  test('quota waits over cap park for a human', () => {
    const action = decide(
      obs({
        lastExitCode: 3,
        quota: { resetsAtEpochS: FUTURE_RESET_S },
        counters: { ...ZERO, quotaWaits: 6 },
      }),
    );
    expect(encode(action)).toBe('exit:needs_human:quota_cap');
  });

  test('overload backoffs over cap park for a human when no fallback model is configured', () => {
    const action = decide(
      obs({
        lastExitCode: 3, overload: { apiErrorStatus: 529 },
        counters: { ...ZERO, overloadBackoffs: 5 },
      }),
    );
    expect(encode(action)).toBe('exit:needs_human:overloaded');
  });

  test('over cap with --fallback-model, it relaunches once on that tier', () => {
    const action = decide(
      obs({
        lastExitCode: 3, overload: { apiErrorStatus: 529 },
        counters: { ...ZERO, overloadBackoffs: 5 }, fallbackModel: 'sonnet',
      }),
    );
    expect(encode(action)).toBe('relaunch:overload:sonnet');
  });

  test('the fallback is used at most once', () => {
    const action = decide(
      obs({
        lastExitCode: 3, overload: { apiErrorStatus: 529 },
        counters: { ...ZERO, overloadBackoffs: 5, fallbackUsed: true }, fallbackModel: 'sonnet',
      }),
    );
    expect(encode(action)).toBe('exit:needs_human:overloaded');
  });

  test('a second crash relaunch is refused (max 1, D74-5)', () => {
    const action = decide(obs({ lastExitCode: 3, counters: { ...ZERO, crashRelaunches: 1 } }));
    expect(encode(action)).toBe('exit:needs_human:session_incomplete');
  });

  test('a repeated lock conflict parks rather than looping', () => {
    const action = decide(obs({ lastExitCode: 1, counters: { ...ZERO, lockRelaunches: 1 } }));
    expect(encode(action)).toBe('exit:needs_human:lock_conflict');
  });
});

describe('decide — adopt, never duplicate (D74-7)', () => {
  test('a live lock holder is adopted instead of launching', () => {
    const action = decide(
      obs({ run: null, lastExitCode: null, lockHolder: { pid: 777, alive: true } }),
    );
    expect(encode(action)).toBe('attach:777');
  });
  test('a dead lock holder does not block a launch', () => {
    const action = decide(
      obs({ run: null, lastExitCode: null, lockHolder: { pid: 777, alive: false } }),
    );
    expect(encode(action)).toBe('launch');
  });
  test('STOP before anything started means done, with nothing launched', () => {
    const action = decide(obs({ run: null, lastExitCode: null, stopFilePresent: true }));
    expect(encode(action)).toBe('exit:done:stop_requested');
  });
});

// W-P5: a tick observes and acts AT MOST ONCE — it never sleeps.
const ONCE_TABLE: Array<[name: string, over: Partial<WatchdogObservation>, want: string]> = [
  ['exit 3 + quota', { lastExitCode: 3, quota: { resetsAtEpochS: FUTURE_RESET_S } },
    'exit:running:quota_wait_pending'],
  ['exit 3 + quota + STOP',
    { lastExitCode: 3, quota: { resetsAtEpochS: FUTURE_RESET_S }, stopFilePresent: true },
    'exit:done:stop_requested'],
  ['exit 3 + 529', { lastExitCode: 3, overload: { apiErrorStatus: 529 } },
    'exit:running:overload_backoff_pending'],
  ['exit 3 + 529 + STOP',
    { lastExitCode: 3, overload: { apiErrorStatus: 529 }, stopFilePresent: true },
    'exit:done:stop_requested'],
  ['exit 3 + quota + 529',
    { lastExitCode: 3, quota: { resetsAtEpochS: FUTURE_RESET_S }, overload: { apiErrorStatus: 529 } },
    'exit:running:quota_wait_pending'],
  ['exit 3, no signal', { lastExitCode: 3 }, 'relaunch:crash'],
  ['exit 3, no signal + STOP', { lastExitCode: 3, stopFilePresent: true },
    'exit:done:stop_requested'],
  ['exit 0', { lastExitCode: 0 }, 'exit:done:runner_done'],
  ['exit 2', { lastExitCode: 2 }, 'exit:needs_human:escalations_pending'],
  ['alive, fresh log', {
    lastExitCode: null,
    run: { runId: 'r', runnerPid: 42, alive: true, endedAt: null,
           newestLogPath: '/h/l.log', newestLogMtimeMs: NOW - 1000 },
  }, 'exit:running:runner_alive'],
  ['alive, stale log', {
    lastExitCode: null,
    run: { runId: 'r', runnerPid: 42, alive: true, endedAt: null,
           newestLogPath: '/h/l.log', newestLogMtimeMs: STALE_MS },
  }, 'stall:running:stalled'],
  ['nothing running', { run: null, lastExitCode: null }, 'launch'],
];

describe('decide — --once mode never sleeps (W-P5)', () => {
  for (const [name, over, want] of ONCE_TABLE) {
    test(`once: ${name} -> ${want}`, () => {
      expect(encode(decide(obs({ mode: 'once', ...over })))).toBe(want);
    });
  }
});
