// Tests for github.ts (Task 4): deterministic docs-PR helper — commit, push, PR, poll
// checks (D6 retry + flake-waiver policy), merge, cleanup, ff-sync. Fixture values are
// deliberately neutral (no repo names, no absolute paths, no campaign values) — the
// stateless-capability wall.
import { describe, expect, mock, test } from 'bun:test';
import {
  D6_MAX_RETRIES,
  D6_RETRY_SPACING_MS,
  commitStateAndMerge,
  type CheckStatus,
  type ExecResult,
  type GithubConfig,
  type GithubIO,
} from './github.ts';

const config: GithubConfig = {
  repoRoot: '/sample-repo-root',
  card: 'C2',
  prBody: 'Testing performed: sample docs-only state update.',
  baseBranch: 'master',
};

const OK: ExecResult = { exitCode: 0, stdout: '', stderr: '' };

function ok(stdout = ''): ExecResult {
  return { exitCode: 0, stdout, stderr: '' };
}

function fail(stderr = 'command failed'): ExecResult {
  return { exitCode: 1, stdout: '', stderr };
}

function checksJson(checks: CheckStatus[]): string {
  return JSON.stringify(checks);
}

const PASS_CHECK: CheckStatus = { name: 'unit-tests', bucket: 'pass', description: '' };
const FAIL_UNIT_CHECK: CheckStatus = {
  name: 'unit-tests',
  bucket: 'fail',
  description: 'assertion error',
};
const SONAR_504_CHECK: CheckStatus = {
  name: 'SonarCloud Code Analysis',
  bucket: 'fail',
  description: 'Error: Bad Gateway (504) contacting SonarCloud during bootstrap',
};

/** Builds a mock io.exec that dispatches on the command's argv, with a per-call counter for
 * `gh pr checks` so tests can script successive polls (retry-then-green, exhausted retries). */
function makeIo(options: {
  createStdout?: string;
  checksSequence?: string[]; // stdout for each successive `gh pr checks` call
  overrides?: Partial<Record<string, ExecResult>>;
}): { io: GithubIO; calls: string[][]; sleeps: number[] } {
  const calls: string[][] = [];
  const sleeps: number[] = [];
  let checksCallIndex = 0;
  const checksSequence = options.checksSequence ?? [checksJson([PASS_CHECK])];
  const overrides = options.overrides ?? {};

  const exec = mock(async (args: string[]): Promise<ExecResult> => {
    calls.push(args);
    const key = args.join(' ');
    if (overrides[key]) return overrides[key] as ExecResult;

    if (args[0] === 'git' && args[1] === 'checkout' && args[2] === '-b') return OK;
    if (args[0] === 'git' && args[1] === 'add') return OK;
    if (args[0] === 'git' && args[1] === 'commit') return OK;
    if (args[0] === 'git' && args[1] === 'push') return OK;
    if (args[0] === 'gh' && args[1] === 'pr' && args[2] === 'create') {
      return ok(options.createStdout ?? 'https://example.invalid/o/r/pull/101\n');
    }
    if (args[0] === 'gh' && args[1] === 'pr' && args[2] === 'checks') {
      const stdout = checksSequence[Math.min(checksCallIndex, checksSequence.length - 1)];
      checksCallIndex += 1;
      return ok(stdout);
    }
    if (args[0] === 'gh' && args[1] === 'pr' && args[2] === 'edit') return OK;
    if (args[0] === 'gh' && args[1] === 'pr' && args[2] === 'merge') return OK;
    if (args[0] === 'git' && args[1] === 'checkout' && args[2] === 'master') return OK;
    if (args[0] === 'git' && args[1] === 'pull') return OK;
    throw new Error(`unexpected exec call: ${key}`);
  });

  const sleep = mock(async (ms: number) => {
    sleeps.push(ms);
  });

  return { io: { exec, sleep }, calls, sleeps };
}

describe('commitStateAndMerge', () => {
  test('green path: merges, branch cleaned, master ff-synced, never squash', async () => {
    const { io, calls, sleeps } = makeIo({ checksSequence: [checksJson([PASS_CHECK])] });

    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);

    expect(result).toEqual({
      outcome: 'merged',
      branch: 'campaign-state/C2',
      pr: 101,
      attempts: 1,
      waived: false,
    });
    expect(sleeps).toEqual([]);

    // The deterministic command sequence, in order.
    expect(calls[0]).toEqual(['git', 'checkout', '-b', 'campaign-state/C2']);
    expect(calls[1]).toEqual(['git', 'add', 'state.json']);
    expect(calls[2]).toEqual(['git', 'commit', '-m', 'chore: update state']);
    expect(calls[3]).toEqual(['git', 'push', '-u', 'origin', 'campaign-state/C2']);
    expect(calls[4]).toEqual([
      'gh',
      'pr',
      'create',
      '--title',
      'chore: update state',
      '--body',
      config.prBody,
      '--base',
      'master',
      '--head',
      'campaign-state/C2',
    ]);
    expect(calls[5]).toEqual(['gh', 'pr', 'checks', '101', '--json', 'name,bucket,description']);

    const mergeCall = calls.find((c) => c[0] === 'gh' && c[1] === 'pr' && c[2] === 'merge');
    expect(mergeCall).toEqual(['gh', 'pr', 'merge', '101', '--merge', '--delete-branch']);
    expect(mergeCall).not.toContain('--squash');

    // Master ff-sync ran.
    expect(calls.some((c) => c.join(' ') === 'git checkout master')).toBe(true);
    expect(calls.some((c) => c[0] === 'git' && c[1] === 'pull')).toBe(true);

    // Never a squash/rebase merge anywhere in the whole call log.
    expect(calls.some((c) => c.includes('--squash'))).toBe(false);
    expect(calls.some((c) => c.includes('--rebase'))).toBe(false);
  });

  test('retry-then-green: retries through the injected sleep seam at the D6 spacing, never a real wait', async () => {
    const { io, sleeps } = makeIo({
      checksSequence: [
        checksJson([FAIL_UNIT_CHECK]),
        checksJson([FAIL_UNIT_CHECK]),
        checksJson([PASS_CHECK]),
      ],
    });

    const start = Date.now();
    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);
    const elapsedMs = Date.now() - start;

    expect(result.outcome).toBe('merged');
    if (result.outcome === 'merged') {
      expect(result.attempts).toBe(3);
      expect(result.waived).toBe(false);
    }
    // Exactly 2 retries were needed to reach green; sleep called at the exact D6 spacing.
    expect(sleeps).toEqual([D6_RETRY_SPACING_MS, D6_RETRY_SPACING_MS]);
    expect(D6_RETRY_SPACING_MS).toBe(10 * 60 * 1000);
    // The test must never actually wait 10 minutes — the sleep seam is what made this fast.
    expect(elapsedMs).toBeLessThan(2000);
  });

  test('docs-only sonar-504 exception: exhausts retries, waives, records the exception, merges', async () => {
    const { io, calls, sleeps } = makeIo({
      checksSequence: [checksJson([SONAR_504_CHECK])], // stays red every poll
    });

    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);

    expect(result.outcome).toBe('merged');
    if (result.outcome === 'merged') {
      expect(result.waived).toBe(true);
      expect(result.attempts).toBe(D6_MAX_RETRIES + 1);
    }
    expect(sleeps.length).toBe(D6_MAX_RETRIES);
    expect(sleeps.every((ms) => ms === D6_RETRY_SPACING_MS)).toBe(true);

    const editCall = calls.find((c) => c[0] === 'gh' && c[1] === 'pr' && c[2] === 'edit');
    expect(editCall).toBeDefined();
    const editedBody = editCall?.[editCall.indexOf('--body') + 1] ?? '';
    expect(editedBody).toContain('exception');
    expect(editedBody.toLowerCase()).toContain('504');

    const mergeCall = calls.find((c) => c[0] === 'gh' && c[1] === 'pr' && c[2] === 'merge');
    expect(mergeCall).toBeDefined();
  });

  test('non-advisory red after retries: returns escalate and NEVER runs a merge command', async () => {
    const { io, calls, sleeps } = makeIo({
      checksSequence: [checksJson([FAIL_UNIT_CHECK])], // stays red every poll, not the sonar signature
    });

    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);

    expect(result.outcome).toBe('escalate');
    if (result.outcome === 'escalate') {
      expect(result.pr).toBe(101);
      expect(result.branch).toBe('campaign-state/C2');
      expect(result.failedChecks).toEqual([FAIL_UNIT_CHECK]);
    }
    expect(sleeps.length).toBe(D6_MAX_RETRIES);

    // The hard invariant: a non-advisory red NEVER merges.
    expect(calls.some((c) => c[0] === 'gh' && c[1] === 'pr' && c[2] === 'merge')).toBe(false);
    expect(calls.some((c) => c[0] === 'gh' && c[1] === 'pr' && c[2] === 'edit')).toBe(false);
  });

  test('mixed red (advisory + non-advisory) after retries still escalates, never waives', async () => {
    const { io, calls } = makeIo({
      checksSequence: [checksJson([FAIL_UNIT_CHECK, SONAR_504_CHECK])],
    });

    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);

    expect(result.outcome).toBe('escalate');
    expect(calls.some((c) => c[0] === 'gh' && c[1] === 'pr' && c[2] === 'merge')).toBe(false);
  });

  test('commit-failure path: git push fails -> returns commit_failed without throwing', async () => {
    const { io, calls } = makeIo({
      overrides: {
        'git push -u origin campaign-state/C2': fail('remote: network unreachable'),
      },
    });

    let thrown: unknown = null;
    let result;
    try {
      result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeNull();
    expect(result).toEqual({
      outcome: 'commit_failed',
      step: 'push',
      reason: 'remote: network unreachable',
    });
    // Never reached PR creation.
    expect(calls.some((c) => c[0] === 'gh')).toBe(false);
  });

  test('commit-failure path: branch create fails -> commit_failed, no further calls', async () => {
    const { io, calls } = makeIo({
      overrides: {
        'git checkout -b campaign-state/C2': fail('branch already exists'),
      },
    });

    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);

    expect(result).toEqual({
      outcome: 'commit_failed',
      step: 'branch',
      reason: 'branch already exists',
    });
    expect(calls.length).toBe(1);
  });

  test('commit-failure path: gh pr create fails -> commit_failed, no checks polled', async () => {
    const { io, calls } = makeIo({
      overrides: {
        'gh pr create --title chore: update state --body Testing performed: sample docs-only state update. --base master --head campaign-state/C2':
          fail('gh: authentication required'),
      },
    });

    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);

    expect(result).toEqual({
      outcome: 'commit_failed',
      step: 'pr_create',
      reason: 'gh: authentication required',
    });
    expect(calls.some((c) => c[0] === 'gh' && c[1] === 'pr' && c[2] === 'checks')).toBe(false);
  });

  test('a failed commit does not throw even when io.exec itself throws for an unrelated step (D5: escalation survives a failed commit)', async () => {
    const throwingIo: GithubIO = {
      exec: mock(async () => {
        throw new Error('unexpected environment failure');
      }),
      sleep: mock(async () => {}),
    };

    let thrown: unknown = null;
    let result;
    try {
      result = await commitStateAndMerge(['state.json'], 'chore: update state', config, throwingIo);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeNull();
    expect(result?.outcome).toBe('commit_failed');
  });
});
