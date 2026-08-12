// Tests for run.ts (Task 6): CLI argument parsing. Pure and testable without touching real
// gh/git/fs/the SDK — `main()`'s real-world wiring is not exercised here, matching
// session.ts's `sdkSpawnSession` precedent (option-building/parsing is fully covered without
// hitting the real dependency). Every value is a caller input — no defaults bake in a repo,
// model, or campaign (stateless-capability wall); `--session-timeout`/`--logs-dir` are the
// two protocol-level defaults spec §2 itself documents; `--home` (Task 2, spec §4) is the
// campaign's machine-local operational home — also a REQUIRED input, never derived here.
import { describe, expect, test } from 'bun:test';
import { parseArgs, scrubTargetEnvLocal } from './main.ts';

const RUN_ID = '2026-07-24T00-00-00-000Z-beef';

/** Every REQUIRED flag, once, for a valid parse — the base every test below builds on. */
function validArgv(): string[] {
  return [
    '--repo', '/repo',
    '--model', 'sonnet',
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
      expect(result.config.model).toBe('sonnet');
      expect(result.config.homeDir).toBe('/th/campaigns/camp');
    }
  });

  for (const missing of ['--repo', '--model', '--home']) {
    test(`missing ${missing} -> error naming it`, () => {
      const result = parseArgs(validArgvWithout(missing), RUN_ID);
      expect('error' in result).toBe(true);
      if ('error' in result) {
        expect(result.error).toContain(missing);
      }
    });
  }
});

// Task 3 (spec §3 decision 2): --state/--answers/--escalations-dir are DELETED flags — every
// campaign artifact now resolves to a fixed name under --home (core/paths.ts), so passing any
// of the three former path flags is a usage error naming the offending flag, not a silent
// no-op. Required flags drop 6 -> 3.
describe('parseArgs — the three deleted path flags (--state/--answers/--escalations-dir)', () => {
  for (const deleted of ['--state', '--answers', '--escalations-dir']) {
    test(`${deleted} is rejected as an unknown flag`, () => {
      const result = parseArgs([...validArgv(), deleted, 'whatever'], RUN_ID);
      expect(result).toEqual({ error: `unknown flag: ${deleted}` });
    });
  }
});

describe('parseArgs — --remote', () => {
  test('defaults to "origin" when omitted', () => {
    const result = parseArgs(validArgv(), RUN_ID);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.config.remote).toBe('origin');
    }
  });

  test('--remote overrides the default', () => {
    const result = parseArgs([...validArgv(), '--remote', 'upstream'], RUN_ID);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.config.remote).toBe('upstream');
    }
  });
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

// Skinner audit (P10 fix round): the .env.local scrub used to be an unguarded fs read inlined
// directly in main() — a transient fs error (EACCES, a mid-flight delete, a read-only mount)
// threw an uncaught exception that bypassed the file's own report-writing seam entirely.
// Reproduced live before this fix: `bun run.ts --repo <fixture-with-chmod-000-.env.local>
// --model x --home <home>` crashed with an unhandled EACCES stack trace, exit 1, no report,
// no "campaign runner: unexpected error" message — none of the documented EXIT_* paths.
// scrubTargetEnvLocal is the extracted, directly-testable seam that closes that gap.
describe('scrubTargetEnvLocal — best-effort, never throws (P10 fix round)', () => {
  test('an io.readFile that throws does not propagate — it degrades to a console warning', async () => {
    const errors: string[] = [];
    const originalConsoleError = console.error;
    console.error = (...args: unknown[]) => { errors.push(args.join(' ')); };
    try {
      const io = {
        fileExists: () => true,
        readFile: () => { throw new Error('EACCES: permission denied'); },
        writeFile: () => { throw new Error('writeFile should not be called'); },
      };
      // The assertion IS that this resolves at all — before the fix, the throw inside
      // io.readFile propagated out of scrubTargetEnvLocal (and, in main(), out of main()
      // itself, as an unhandled promise rejection with no .catch() anywhere in the call chain).
      await expect(scrubTargetEnvLocal('/some/repo', false, io)).resolves.toBeUndefined();
      expect(errors.some((line) => line.includes('could not scrub') && line.includes('EACCES'))).toBe(true);
    } finally {
      console.error = originalConsoleError;
    }
  });

  test('no .env.local present -> no-op, io.readFile/writeFile never called', async () => {
    const io = {
      fileExists: () => false,
      readFile: () => { throw new Error('should not be called'); },
      writeFile: () => { throw new Error('should not be called'); },
    };
    await expect(scrubTargetEnvLocal('/some/repo', false, io)).resolves.toBeUndefined();
  });

  test('a real run with a key present writes the cleaned content back', async () => {
    const written: Array<{ path: string; content: string }> = [];
    const io = {
      fileExists: () => true,
      readFile: () => 'ANTHROPIC_API_KEY=sk-ant-x\nFOO=bar\n',
      writeFile: (path: string, content: string) => { written.push({ path, content }); },
    };
    await scrubTargetEnvLocal('/some/repo', false, io);
    expect(written).toEqual([{ path: '/some/repo/.env.local', content: 'FOO=bar\n' }]);
  });

  test('--dry-run warns but never calls io.writeFile', async () => {
    const io = {
      fileExists: () => true,
      readFile: () => 'ANTHROPIC_API_KEY=sk-ant-x\nFOO=bar\n',
      writeFile: () => { throw new Error('writeFile must not be called in dry-run'); },
    };
    await expect(scrubTargetEnvLocal('/some/repo', true, io)).resolves.toBeUndefined();
  });
});
