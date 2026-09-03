import { describe, expect, test } from 'bun:test';
import { parseWatchdogArgs } from './args.ts';

const REQUIRED = ['--repo', '/repo', '--model', 'opus', '--home', '/h/.tribe/k/campaigns/c'];

describe('parseWatchdogArgs', () => {
  test('defaults: follow mode and every protocol default', () => {
    const got = parseWatchdogArgs(REQUIRED);
    if ('error' in got) throw new Error(got.error);
    expect(got.config.mode).toBe('follow');
    expect(got.config.stallMinutes).toBe(30);
    expect(got.config.maxQuotaWaits).toBe(6);
    expect(got.config.maxOverloadBackoffs).toBe(5);
    expect(got.config.maxCrashRelaunches).toBe(1);
    expect(got.config.quotaGraceSeconds).toBe(30);
    expect(got.config.pollSeconds).toBe(30);
    expect(got.config.fallbackModel).toBe(null);
    expect(got.config.rawHome).toBe('/h/.tribe/k/campaigns/c');
    expect(got.config.passthrough).toEqual([]);
  });

  test('every required flag is required, by name', () => {
    for (const flag of ['--repo', '--model', '--home']) {
      const argv = REQUIRED.filter((_, i) => REQUIRED[i - (i % 2)] !== flag || i % 2 === 1);
      const stripped = REQUIRED.slice();
      const at = stripped.indexOf(flag);
      stripped.splice(at, 2);
      const got = parseWatchdogArgs(stripped);
      expect('error' in got && got.error).toBe(`missing required flag: ${flag}`);
      expect(argv.length).toBeGreaterThan(0);
    }
  });

  test('an unknown flag is rejected by name, never ignored', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--dry-run']);
    expect('error' in got && got.error).toBe('unknown flag: --dry-run');
  });

  test('--once and --follow are exclusive, last one is not silently accepted', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--once', '--follow']);
    expect('error' in got && got.error).toBe('--once and --follow are mutually exclusive');
  });

  test('--once selects tick mode', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--once']);
    if ('error' in got) throw new Error(got.error);
    expect(got.config.mode).toBe('once');
  });

  test('runner flags are forwarded verbatim, in argv order', () => {
    const got = parseWatchdogArgs([
      ...REQUIRED, '--cards', 'c1,c2', '--max-cards', '1',
      '--session-timeout', '480m', '--include-escalated', '--max-concurrent', '2',
      '--logs-dir', '/logs', '--remote', 'upstream',
    ]);
    if ('error' in got) throw new Error(got.error);
    expect(got.config.passthrough).toEqual([
      '--cards', 'c1,c2', '--max-cards', '1', '--session-timeout', '480m',
      '--include-escalated', '--max-concurrent', '2', '--logs-dir', '/logs',
      '--remote', 'upstream',
    ]);
  });

  test('numeric flags reject non-positive and non-integer values by name', () => {
    for (const [flag, bad] of [
      ['--stall-minutes', '0'], ['--max-quota-waits', '-1'],
      ['--max-crash-relaunches', 'x'], ['--poll-seconds', '1.5'],
    ] as const) {
      const got = parseWatchdogArgs([...REQUIRED, flag, bad]);
      expect('error' in got && got.error.startsWith(`${flag}:`)).toBe(true);
    }
  });

  test('--poll-seconds is capped at 60 (spec section 7: wake-up loop, never a long sleep)', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--poll-seconds', '61']);
    expect('error' in got && got.error).toBe('--poll-seconds: must be between 1 and 60, got "61"');
  });

  test('--max-crash-relaunches accepts 0 (never relaunch a crash)', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--max-crash-relaunches', '0']);
    if ('error' in got) throw new Error(got.error);
    expect(got.config.maxCrashRelaunches).toBe(0);
  });

  test('--fallback-model is carried, off by default', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--fallback-model', 'sonnet']);
    if ('error' in got) throw new Error(got.error);
    expect(got.config.fallbackModel).toBe('sonnet');
  });

  test('a flag with no value is rejected', () => {
    const got = parseWatchdogArgs(['--repo', '/repo', '--model', 'opus', '--home']);
    expect('error' in got && got.error).toBe('--home requires a value');
  });
});

import { containHome, resolveHomeArg } from './args.ts';

describe('resolveHomeArg (pure, no fs)', () => {
  test('an absolute home is normalized and returned', () => {
    expect(resolveHomeArg('/h/.tribe/k/campaigns/c/', '/anywhere')).toBe('/h/.tribe/k/campaigns/c');
  });
  test('a relative home resolves against cwd — the shape a person actually types', () => {
    expect(resolveHomeArg('campaigns/c', '/h/.tribe/k')).toBe('/h/.tribe/k/campaigns/c');
  });
  test('dot segments collapse', () => {
    expect(resolveHomeArg('./a/../b', '/h/.tribe/k')).toBe('/h/.tribe/k/b');
  });
});

describe('containHome (pure, root supplied by the edge)', () => {
  const ROOT = '/private/var/folders/xy/T/home/.tribe';

  test('a home inside the root is accepted', () => {
    expect(containHome(`${ROOT}/k/campaigns/c`, ROOT)).toEqual({ ok: true });
  });
  test('the root itself is refused — a campaign home is never the root', () => {
    const got = containHome(ROOT, ROOT);
    expect(got.ok).toBe(false);
    expect(!got.ok && got.error).toContain('is the tribe root itself');
  });
  test('a path outside the root is refused with a typed message naming both paths', () => {
    const got = containHome('/tmp/elsewhere/campaigns/c', ROOT);
    expect(got.ok).toBe(false);
    expect(!got.ok && got.error).toBe(
      'watchdog: --home "/tmp/elsewhere/campaigns/c" is outside the tribe root ' +
        `"${ROOT}" — a campaign home always lives under it (see tribe-home.sh)`,
    );
  });
  test('a sibling directory sharing a name prefix is refused (segment compare, not string)', () => {
    expect(containHome(`${ROOT}-old/k/campaigns/c`, ROOT).ok).toBe(false);
  });
  test('a traversal escape is refused after normalization', () => {
    expect(containHome(resolveHomeArg('../../../etc', `${ROOT}/k/campaigns`), ROOT).ok).toBe(false);
  });
});
