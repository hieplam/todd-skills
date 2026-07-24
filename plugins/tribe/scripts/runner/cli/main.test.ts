// Tests for run.ts (Task 6): CLI argument parsing. Pure and testable without touching real
// gh/git/fs/the SDK — `main()`'s real-world wiring is not exercised here, matching
// session.ts's `sdkSpawnSession` precedent (option-building/parsing is fully covered without
// hitting the real dependency). Every value is a caller input — no defaults bake in a repo,
// model, or campaign (stateless-capability wall); `--session-timeout`/`--logs-dir` are the
// two protocol-level defaults spec §2 itself documents; `--home` (Task 2, spec §4) is the
// campaign's machine-local operational home — also a REQUIRED input, never derived here.
import { describe, expect, test } from 'bun:test';
import { parseArgs } from './main.ts';

const RUN_ID = '2026-07-24T00-00-00-000Z-beef';

/** Every REQUIRED flag, once, for a valid parse — the base every test below builds on. */
function validArgv(): string[] {
  return [
    '--repo', '/repo',
    '--state', 'state.json',
    '--model', 'sonnet',
    '--answers', 'answers.md',
    '--escalations-dir', 'escalations',
    '--home', '/th/campaigns/camp',
  ];
}

/** `validArgv()` with the given flag (and its value, if any) removed — for
 * missing-required-flag / default-behavior tests. */
function validArgvWithout(flag: string): string[] {
  const argv = validArgv();
  const idx = argv.indexOf(flag);
  if (idx === -1) return argv;
  const isBooleanFlag = flag === '--dry-run' || flag === '--include-escalated';
  return isBooleanFlag
    ? [...argv.slice(0, idx), ...argv.slice(idx + 1)]
    : [...argv.slice(0, idx), ...argv.slice(idx + 2)];
}

describe('parseArgs — required flags', () => {
  test('all required flags present -> parses successfully', () => {
    const result = parseArgs(validArgv(), RUN_ID);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.config.repoRoot).toBe('/repo');
      expect(result.config.statePath).toBe('state.json');
      expect(result.config.model).toBe('sonnet');
      expect(result.config.answersPath).toBe('answers.md');
      expect(result.config.escalationsDir).toBe('escalations');
      expect(result.config.homeDir).toBe('/th/campaigns/camp');
    }
  });

  for (const missing of ['--repo', '--state', '--model', '--answers', '--escalations-dir', '--home']) {
    test(`missing ${missing} -> error naming it`, () => {
      const result = parseArgs(validArgvWithout(missing), RUN_ID);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain(missing);
      }
    });
  }
});

describe('parseArgs — --home / runId (Task 2, spec §4)', () => {
  test('--home is required: missing flag is a usage error', () => {
    const result = parseArgs(validArgvWithout('--home'), RUN_ID);
    expect(result).toEqual({ error: 'missing required flag: --home' });
  });

  test('--home and runId land on the config; argv is echoed verbatim', () => {
    const argv = validArgv(); // includes --home /th/campaigns/camp
    const result = parseArgs(argv, RUN_ID);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.homeDir).toBe('/th/campaigns/camp');
    expect(result.config.runId).toBe(RUN_ID);
    expect(result.config.argv).toEqual(argv);
  });

  test('logs default moves under the run dir (spec §5.4)', () => {
    const result = parseArgs(validArgvWithout('--logs-dir'), RUN_ID);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.logsDir).toBe(`/th/campaigns/camp/runs/${RUN_ID}/logs`);
  });

  test('explicit --logs-dir still overrides the default', () => {
    const result = parseArgs([...validArgvWithout('--logs-dir'), '--logs-dir', '/custom/logs'], RUN_ID);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.logsDir).toBe('/custom/logs');
  });
});

describe('parseArgs — defaults (spec §2 protocol defaults, never campaign values)', () => {
  test('--session-timeout defaults to 3h in ms', () => {
    const result = parseArgs(validArgv(), RUN_ID);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.sessionTimeoutMs).toBe(3 * 60 * 60 * 1000);
  });

  test('--dry-run / --include-escalated default to false', () => {
    const result = parseArgs(validArgv(), RUN_ID);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.dryRun).toBe(false);
    expect(result.config.includeEscalated).toBe(false);
  });

  test('--cards / --max-cards default to undefined (no filtering, no card limit)', () => {
    const result = parseArgs(validArgv(), RUN_ID);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.cardsFilter).toBeUndefined();
    expect(result.config.maxCards).toBeUndefined();
  });
});

describe('parseArgs — explicit overrides', () => {
  test('--session-timeout accepts "30m"/"90s"/"5000ms"/plain ms', () => {
    expect(parseSessionTimeout(validArgv(), '30m')).toBe(30 * 60 * 1000);
    expect(parseSessionTimeout(validArgv(), '90s')).toBe(90 * 1000);
    expect(parseSessionTimeout(validArgv(), '5000ms')).toBe(5000);
    expect(parseSessionTimeout(validArgv(), '5000')).toBe(5000);
  });

  function parseSessionTimeout(base: string[], value: string): number {
    const result = parseArgs([...base, '--session-timeout', value], RUN_ID);
    if ('error' in result) throw new Error(result.error);
    return result.config.sessionTimeoutMs as number;
  }

  test('an invalid --session-timeout -> error', () => {
    const result = parseArgs([...validArgv(), '--session-timeout', 'not-a-duration'], RUN_ID);
    expect('error' in result).toBe(true);
  });

  test('--logs-dir overrides the default', () => {
    const result = parseArgs([...validArgv(), '--logs-dir', '/somewhere/else/logs'], RUN_ID);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.logsDir).toBe('/somewhere/else/logs');
  });

  test('--dry-run and --include-escalated are boolean presence flags', () => {
    const result = parseArgs([...validArgv(), '--dry-run', '--include-escalated'], RUN_ID);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.dryRun).toBe(true);
    expect(result.config.includeEscalated).toBe(true);
  });

  test('--cards splits a comma-separated list, preserving order', () => {
    const result = parseArgs([...validArgv(), '--cards', 'B3,B4,A6'], RUN_ID);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.cardsFilter).toEqual(['B3', 'B4', 'A6']);
  });

  test('--max-cards parses to an integer', () => {
    const result = parseArgs([...validArgv(), '--max-cards', '5'], RUN_ID);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.maxCards).toBe(5);
  });

  test('a non-numeric --max-cards -> error', () => {
    const result = parseArgs([...validArgv(), '--max-cards', 'not-a-number'], RUN_ID);
    expect('error' in result).toBe(true);
  });
});

describe('parseArgs — stateless-capability wall', () => {
  test('no ai-dict (or any other repo name) is baked into any default', () => {
    const result = parseArgs(validArgv(), RUN_ID);
    if ('error' in result) throw new Error(result.error);
    expect(JSON.stringify(result.config)).not.toContain('ai-dict');
  });
});
