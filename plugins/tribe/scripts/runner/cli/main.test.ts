// Tests for run.ts (Task 6): CLI argument parsing. Pure and testable without touching real
// gh/git/fs/the SDK — `main()`'s real-world wiring is not exercised here, matching
// session.ts's `sdkSpawnSession` precedent (option-building/parsing is fully covered without
// hitting the real dependency). Every value is a caller input — no defaults bake in a repo,
// model, or campaign (stateless-capability wall); `--session-timeout`/`--logs-dir` are the
// two protocol-level defaults spec §2 itself documents.
import { describe, expect, test } from 'bun:test';
import { parseArgs } from './main.ts';

describe('parseArgs — required flags', () => {
  const REQUIRED = ['--repo', '/repo', '--state', 'state.json', '--model', 'sonnet', '--answers', 'answers.md', '--escalations-dir', 'escalations'];

  test('all required flags present -> parses successfully', () => {
    const result = parseArgs(REQUIRED);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.config.repoRoot).toBe('/repo');
      expect(result.config.statePath).toBe('state.json');
      expect(result.config.model).toBe('sonnet');
      expect(result.config.answersPath).toBe('answers.md');
      expect(result.config.escalationsDir).toBe('escalations');
    }
  });

  for (const missing of ['--repo', '--state', '--model', '--answers', '--escalations-dir']) {
    test(`missing ${missing} -> error naming it`, () => {
      const idx = REQUIRED.indexOf(missing);
      const args = [...REQUIRED.slice(0, idx), ...REQUIRED.slice(idx + 2)];
      const result = parseArgs(args);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain(missing);
      }
    });
  }
});

describe('parseArgs — defaults (spec §2 protocol defaults, never campaign values)', () => {
  const REQUIRED = ['--repo', '/repo', '--state', 'docs/campaign/state.json', '--model', 'sonnet', '--answers', 'answers.md', '--escalations-dir', 'escalations'];

  test('--session-timeout defaults to 3h in ms', () => {
    const result = parseArgs(REQUIRED);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.sessionTimeoutMs).toBe(3 * 60 * 60 * 1000);
  });

  test('--logs-dir defaults to "<state dir>/logs"', () => {
    const result = parseArgs(REQUIRED);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.logsDir).toBe('/repo/docs/campaign/logs');
  });

  test('--dry-run / --include-escalated default to false', () => {
    const result = parseArgs(REQUIRED);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.dryRun).toBe(false);
    expect(result.config.includeEscalated).toBe(false);
  });

  test('--cards / --max-cards default to undefined (no filtering, no card limit)', () => {
    const result = parseArgs(REQUIRED);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.cardsFilter).toBeUndefined();
    expect(result.config.maxCards).toBeUndefined();
  });
});

describe('parseArgs — explicit overrides', () => {
  const REQUIRED = ['--repo', '/repo', '--state', 'state.json', '--model', 'sonnet', '--answers', 'answers.md', '--escalations-dir', 'escalations'];

  test('--session-timeout accepts "30m"/"90s"/"5000ms"/plain ms', () => {
    expect(parseSessionTimeout(REQUIRED, '30m')).toBe(30 * 60 * 1000);
    expect(parseSessionTimeout(REQUIRED, '90s')).toBe(90 * 1000);
    expect(parseSessionTimeout(REQUIRED, '5000ms')).toBe(5000);
    expect(parseSessionTimeout(REQUIRED, '5000')).toBe(5000);
  });

  function parseSessionTimeout(base: string[], value: string): number {
    const result = parseArgs([...base, '--session-timeout', value]);
    if ('error' in result) throw new Error(result.error);
    return result.config.sessionTimeoutMs as number;
  }

  test('an invalid --session-timeout -> error', () => {
    const result = parseArgs([...REQUIRED, '--session-timeout', 'not-a-duration']);
    expect('error' in result).toBe(true);
  });

  test('--logs-dir overrides the default', () => {
    const result = parseArgs([...REQUIRED, '--logs-dir', '/somewhere/else/logs']);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.logsDir).toBe('/somewhere/else/logs');
  });

  test('--dry-run and --include-escalated are boolean presence flags', () => {
    const result = parseArgs([...REQUIRED, '--dry-run', '--include-escalated']);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.dryRun).toBe(true);
    expect(result.config.includeEscalated).toBe(true);
  });

  test('--cards splits a comma-separated list, preserving order', () => {
    const result = parseArgs([...REQUIRED, '--cards', 'B3,B4,A6']);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.cardsFilter).toEqual(['B3', 'B4', 'A6']);
  });

  test('--max-cards parses to an integer', () => {
    const result = parseArgs([...REQUIRED, '--max-cards', '5']);
    if ('error' in result) throw new Error(result.error);
    expect(result.config.maxCards).toBe(5);
  });

  test('a non-numeric --max-cards -> error', () => {
    const result = parseArgs([...REQUIRED, '--max-cards', 'not-a-number']);
    expect('error' in result).toBe(true);
  });
});

describe('parseArgs — stateless-capability wall', () => {
  test('no ai-dict (or any other repo name) is baked into any default', () => {
    const result = parseArgs([
      '--repo', '/repo',
      '--state', 'state.json',
      '--model', 'sonnet',
      '--answers', 'answers.md',
      '--escalations-dir', 'escalations',
    ]);
    if ('error' in result) throw new Error(result.error);
    expect(JSON.stringify(result.config)).not.toContain('ai-dict');
  });
});
