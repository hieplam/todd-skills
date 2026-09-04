import { describe, expect, test } from 'bun:test';
import { actionLine, buildStatus, exitCodeOf, serializeEvent, serializeStatus } from './status.ts';
import type { WatchdogAction, WatchdogCounters } from './model.ts';

const COUNTERS: WatchdogCounters = {
  quotaWaits: 1, overloadBackoffs: 0, crashRelaunches: 0, lockRelaunches: 0, fallbackUsed: false,
};

describe('exitCodeOf — the frozen exit codes', () => {
  test('done 0, needs_human 10, running 11', () => {
    const codes = (['done', 'needs_human', 'running'] as const).map((status) =>
      exitCodeOf({ kind: 'exit', status, reason: 'r' }));
    expect(codes).toEqual([0, 10, 11]);
  });
});

describe('buildStatus / serializeStatus', () => {
  test('a quota wait publishes nextWakeAt (spec section 8)', () => {
    const status = buildStatus({
      config: { mode: 'follow' },
      pid: 99, home: '/h/.tribe/k/campaigns/c',
      startedAt: '2026-09-03T10:00:00.000Z', updatedAt: '2026-09-03T10:00:05.000Z',
      state: 'quota_wait', lastAction: 'wait_until:quota',
      runId: 'r1', runnerPid: null, runnerCommand: ['bun', '/abs/run.ts', 'watchdog'],
      counters: COUNTERS, nextWakeAtMs: Date.parse('2026-09-03T15:30:30.000Z'),
      stall: null, terminal: null,
    });
    expect(status.nextWakeAt).toBe('2026-09-03T15:30:30.000Z');
    expect(status.v).toBe(1);
    expect(status.counters.quotaWaits).toBe(1);
    expect(serializeStatus(status).endsWith('\n')).toBe(true);
    expect(JSON.parse(serializeStatus(status)).state).toBe('quota_wait');
  });

  test('a stall record names the log file and its last mtime (spec section 8)', () => {
    const status = buildStatus({
      config: { mode: 'follow' },
      pid: 99, home: '/h', startedAt: 'a', updatedAt: 'b', state: 'stalled',
      lastAction: 'stall', runId: 'r1', runnerPid: 42, runnerCommand: null,
      counters: COUNTERS, nextWakeAtMs: null,
      stall: { logPath: '/h/logs/card-sid.log', lastMtimeMs: Date.parse('2026-09-03T09:00:00.000Z') },
      terminal: { status: 'needs_human', reason: 'stalled', exitCode: 10 },
    });
    expect(status.stall).toEqual({
      logPath: '/h/logs/card-sid.log', lastMtime: '2026-09-03T09:00:00.000Z',
    });
    expect(status.terminal).toEqual({ status: 'needs_human', reason: 'stalled', exitCode: 10 });
  });
});

describe('serializeEvent — append-only jsonl', () => {
  test('one line, ISO timestamp, no embedded newline', () => {
    const line = serializeEvent({
      at: '2026-09-03T10:00:00.000Z', action: 'launch', detail: { pid: 4242 },
    });
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trimEnd().includes('\n')).toBe(false);
    expect(JSON.parse(line)).toEqual({
      at: '2026-09-03T10:00:00.000Z', action: 'launch', detail: { pid: 4242 },
    });
  });
});

describe('actionLine — one human stdout line per action', () => {
  test('each action kind renders one line naming its cause', () => {
    const cases: Array<[WatchdogAction, string]> = [
      [{ kind: 'launch' }, 'launch: starting the campaign runner'],
      [{ kind: 'attach', runnerPid: 42 }, 'attach: runner pid 42 is already live — waiting on it'],
      [{ kind: 'wait_until', untilMs: Date.parse('2026-09-03T15:30:30.000Z'), cause: 'quota' },
        'quota_wait: account limit — waiting until 2026-09-03T15:30:30.000Z'],
      [{ kind: 'relaunch', cause: 'crash', model: null }, 'relaunch: cause crash'],
      [{ kind: 'relaunch', cause: 'overload', model: 'sonnet' },
        'relaunch: cause overload on fallback model sonnet'],
      [{ kind: 'stall', logPath: '/h/l.log', lastMtimeMs: 0,
         exit: { status: 'needs_human', reason: 'stalled' } },
        'stall: no log activity in /h/l.log since 1970-01-01T00:00:00.000Z'],
      [{ kind: 'exit', status: 'needs_human', reason: 'escalations_pending' },
        'exit: needs_human:escalations_pending'],
    ];
    for (const [action, want] of cases) expect(actionLine(action)).toBe(want);
  });

  // G1 (group-B audit round 1): a non-finite millisecond value is a legally constructible
  // `WatchdogAction` field — must never throw `new Date(NaN).toISOString()`'s uncaught
  // RangeError. Surface it as a clearly invalid marker instead.
  test('a non-finite wait_until.untilMs renders as invalid, not a thrown RangeError', () => {
    const line = actionLine({ kind: 'wait_until', untilMs: Number.NaN, cause: 'overload' });
    expect(line).toBe('overload_backoff: upstream overloaded — waiting until (invalid-timestamp)');
  });

  test('a non-finite stall.lastMtimeMs renders as invalid, not a thrown RangeError', () => {
    const line = actionLine({
      kind: 'stall', logPath: '/h/l.log', lastMtimeMs: Number.NaN,
      exit: { status: 'needs_human', reason: 'stalled' },
    });
    expect(line).toBe('stall: no log activity in /h/l.log since (invalid-timestamp)');
  });

  // G5 (group-B audit round 1): the stall case's null-coalescing branches
  // (`logPath ?? …`, `lastMtimeMs ?? …`) were never exercised by the test table.
  test('a stall with no log path or mtime yet renders the fallback text', () => {
    const line = actionLine({
      kind: 'stall', logPath: null, lastMtimeMs: null,
      exit: { status: 'needs_human', reason: 'stalled' },
    });
    expect(line).toBe('stall: no log activity in (no log yet) since 1970-01-01T00:00:00.000Z');
  });
});
