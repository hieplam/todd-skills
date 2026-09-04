/**
 * Integration: the REAL edge (real fs, real processes, real sleeps, real pid probes) with only
 * the runner's IDENTITY swapped for the double. The pure core is already covered by table
 * tests; this proves the WIRING — the class of defect the runner README calls out ("Mocked
 * tests validate logic, not invocations").
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWatchdog } from './core/watchdog/watch-loop.ts';
import { buildWatchdogIo, withHome } from './adapters/watchdog-io.adapter.ts';
import type { WatchdogConfig } from './core/watchdog/model.ts';
import type { WatchdogIO } from './ports/ports.ts';

const DOUBLE = join(import.meta.dir, 'fixtures', 'watchdog', 'runner-double.sh');

interface Harness { home: string; statePath: string; io: WatchdogIO; lines: string[] }

function harness(plan: string, extraEnv: Record<string, string> = {}): Harness {
  const root = mkdtempSync(join(tmpdir(), 'wd-int-'));
  const home = join(root, '.tribe', 'k', 'campaigns', 'c');
  mkdirSync(home, { recursive: true });
  // A VALID minimal state (runner README "State file schema" — every required top-level key
  // present), even though only `fileExists` is consulted on this path: a fixture that could
  // not survive the real loader is a fixture that lies (fixtures-mirror-reality).
  writeFileSync(join(home, 'campaign-state.json'), JSON.stringify({
    v: 1, campaign: 'watchdog-int', mergePolicy: 'regular-merge-only', sequence: [],
    schemaLockPaths: [], docsOnlyPaths: [], ownerOnlyEscalations: [], cards: {},
  }));
  writeFileSync(join(home, 'answers.md'), '');
  const statePath = join(root, 'double-attempts');
  const lines: string[] = [];
  const base = buildWatchdogIo();
  const io: WatchdogIO = {
    ...withHome(base, home),
    printLine: (line) => { lines.push(line); },
    runnerCommand: () => ['bash', DOUBLE],
    spawnRunner: (argv, opts) => base.spawnRunner(argv, {
      ...opts,
      // The double is scripted by env; nothing about the watchdog's own argv changes.
      env: { ...process.env, DOUBLE_PLAN: plan, DOUBLE_STATE: statePath, ...extraEnv },
    } as Parameters<WatchdogIO['spawnRunner']>[1]),
  };
  return { home, statePath, io, lines };
}

const config = (over: Partial<WatchdogConfig> = {}): WatchdogConfig => ({
  repoRoot: process.cwd(), model: 'test-model', rawHome: 'x', mode: 'follow',
  stallMinutes: 30, maxQuotaWaits: 6, maxOverloadBackoffs: 5, maxCrashRelaunches: 1,
  quotaGraceSeconds: 1, pollSeconds: 1, fallbackModel: null, passthrough: [],
  ...over,
});

const events = (home: string) =>
  readFileSync(join(home, 'watchdog', 'events.jsonl'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line) as { action: string; detail: Record<string, unknown> });
const status = (home: string) =>
  JSON.parse(readFileSync(join(home, 'watchdog', 'status.json'), 'utf8'));

describe('G1 — quota recovery without an LLM', () => {
  test('waits for the real reset instant, relaunches, and reaches done', async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 3;
    const h = harness('3:quota 0:none', { DOUBLE_RESET_S: String(resetAt) });
    const started = Date.now();
    const outcome = await runWatchdog(config(), h.home, h.io);
    const finished = Date.now();

    expect([outcome.exitCode, outcome.reason]).toEqual([0, 'runner_done']);
    // Audit round 2 (C7, commit 99dfa5f): the sequence gained two `attach` steps once the
    // fake/real adapter stopped fabricating run.json synchronously inside spawnRunner and the
    // loop was fixed to recognise the child it just launched instead of re-spawning it. Per
    // spec §2.1's frozen row — "Live runner (lock/pid alive) at start -> attach (wait on it;
    // never a second launch)" — the watchdog attaches to that just-launched child both after
    // `launch` and after `relaunch`. The brief's original expectation
    // (`['start','launch','wait_until','relaunch','exit']`) predates that fix; this is the
    // observed-correct sequence against the REAL adapter and a REAL child process.
    expect(events(h.home).map((e) => e.action).filter((a) => a !== 'wait_slice'))
      .toEqual(['start', 'launch', 'attach', 'wait_until', 'relaunch', 'attach', 'exit']);

    // Dead time after the reset is under the card's 60 s bar (grace 1 s + one 1 s slice here).
    expect(finished - (resetAt + 1) * 1000).toBeLessThan(60_000);
    expect(finished - started).toBeGreaterThanOrEqual(2_000);

    // No claude process is spawned by the watchdog itself: the double is the ONLY program it
    // ran, and status.json records exactly what that was.
    expect(status(h.home).runnerCommand.slice(0, 2)).toEqual(['bash', DOUBLE]);
    expect(readFileSync(h.statePath, 'utf8')).toBe('2');
  }, 60_000);

  test('the quota wait publishes nextWakeAt while it waits', async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 3;
    const h = harness('3:quota 0:none', { DOUBLE_RESET_S: String(resetAt) });
    const seen: Array<string | null> = [];
    const spy: WatchdogIO = {
      ...h.io,
      writeFileAtomic: (p, c) => {
        h.io.writeFileAtomic(p, c);
        if (p.endsWith('status.json')) seen.push(JSON.parse(c).nextWakeAt);
      },
    };
    await runWatchdog(config(), h.home, spy);
    expect(seen.filter((v) => v !== null).length).toBeGreaterThan(0);
    expect(seen.filter((v) => v !== null)[0]).toBe(new Date((resetAt + 1) * 1000).toISOString());
  }, 60_000);
});

describe('G3 — every terminal state surfaces to the lead', () => {
  const cases: Array<[plan: string, exitCode: number, reason: string]> = [
    ['0:none', 0, 'runner_done'],
    ['2:none', 10, 'escalations_pending'],
    ['5:none', 10, 'rulings_unratified'],
    ['4:none', 10, 'error'],
    ['3:none 3:none', 10, 'session_incomplete'],
    ['3:overload 3:overload 3:overload 3:overload 3:overload 3:overload', 10, 'overloaded'],
  ];
  for (const [plan, exitCode, reason] of cases) {
    test(`plan "${plan}" ends ${exitCode}:${reason}`, async () => {
      const h = harness(plan);
      const outcome = await runWatchdog(
        config({ maxOverloadBackoffs: 2, quotaGraceSeconds: 1 }), h.home, h.io,
      );
      expect([outcome.exitCode, outcome.reason]).toEqual([exitCode, reason]);
      expect(status(h.home).terminal).toEqual({ status: outcome.status, reason, exitCode });
    }, 120_000);
  }

  test('--fallback-model relaunches once on the cheaper tier instead of parking', async () => {
    // Deviation from the brief's original plan (`'3:overload 3:overload 3:overload 0:none'`,
    // 4 entries): decide.ts's frozen, unit-tested behaviour (decide.test.ts "the fallback is
    // used at most once") never resets `overloadBackoffs` on a relaunch, and the two
    // `wait_until` cycles that exhaust `maxOverloadBackoffs: 2` both read the SAME still-
    // overloaded run.json from the FIRST double process — they spawn no new process. So the
    // fallback relaunch is only the SECOND double invocation; a plan with a third `3:overload`
    // entry would never be reached (the second attempt's overload alone parks needs_human,
    // since the fallback is exhausted). Confirmed against the real double: see report.
    const h = harness('3:overload 0:none');
    const outcome = await runWatchdog(
      config({ maxOverloadBackoffs: 2, fallbackModel: 'test-fallback' }), h.home, h.io,
    );
    expect([outcome.exitCode, outcome.reason]).toEqual([0, 'runner_done']);
    expect(status(h.home).counters.fallbackUsed).toBe(true);
    expect(status(h.home).runnerCommand).toContain('test-fallback');
  }, 120_000);
});
