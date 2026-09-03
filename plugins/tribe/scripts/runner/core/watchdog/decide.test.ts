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
