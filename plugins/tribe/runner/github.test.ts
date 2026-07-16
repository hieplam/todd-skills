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

    if (args[0] === 'git' && args[1] === 'fetch') return OK;
    if (args[0] === 'git' && args[1] === 'checkout' && args[2] === '-B') return OK;
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

    // The deterministic command sequence, in order. Branch setup is idempotent (F3): fetch
    // the base branch fresh, then `checkout -B` (create-or-reset) from the up-to-date
    // `origin/<base>` ref — never from whatever HEAD happens to be, and never a plain
    // `checkout -b` that fails against a branch a previous run left behind.
    expect(calls[0]).toEqual(['git', 'fetch', 'origin', 'master']);
    expect(calls[1]).toEqual(['git', 'checkout', '-B', 'campaign-state/C2', 'origin/master']);
    expect(calls[2]).toEqual(['git', 'add', 'state.json']);
    expect(calls[3]).toEqual(['git', 'commit', '-m', 'chore: update state']);
    // Force-push: on a retry, the remote branch may already carry a previous attempt's
    // commit (F3) — a plain push would reject as non-fast-forward, blocking recovery.
    expect(calls[4]).toEqual(['git', 'push', '-u', 'origin', 'campaign-state/C2', '--force']);
    expect(calls[5]).toEqual([
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
    expect(calls[6]).toEqual(['gh', 'pr', 'checks', '101', '--json', 'name,bucket,description']);

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
        'git push -u origin campaign-state/C2 --force': fail('remote: network unreachable'),
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

  test('commit-failure path: branch setup fails -> commit_failed, no add/commit/push', async () => {
    const { io, calls } = makeIo({
      overrides: {
        'git checkout -B campaign-state/C2 origin/master': fail('unable to create/reset branch'),
      },
    });

    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);

    expect(result).toEqual({
      outcome: 'commit_failed',
      step: 'branch',
      reason: 'unable to create/reset branch',
    });
    // Only the fetch + failed checkout -B ran before bailing; base-branch restore cleanup
    // (checked separately below) may add one more call, but never add/commit/push/gh.
    expect(calls.some((c) => c[0] === 'git' && c[1] === 'add')).toBe(false);
    expect(calls.some((c) => c[0] === 'git' && c[1] === 'commit')).toBe(false);
    expect(calls.some((c) => c[0] === 'git' && c[1] === 'push')).toBe(false);
    expect(calls.some((c) => c[0] === 'gh')).toBe(false);
  });

  test('commit-failure path: fetching the base branch fails -> commit_failed at "fetch", never attempts checkout', async () => {
    const { io, calls } = makeIo({
      overrides: {
        'git fetch origin master': fail('remote: could not resolve host'),
      },
    });

    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);

    expect(result).toEqual({
      outcome: 'commit_failed',
      step: 'fetch',
      reason: 'remote: could not resolve host',
    });
    expect(calls.some((c) => c[0] === 'git' && c[1] === 'checkout' && c[2] === '-B')).toBe(false);
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

// F3 fix: `commitStateAndMerge` left the target repo sitting on `campaign-state/<card>`
// (branch still existing locally) on every non-success return, which broke D5's mandated
// retry — the next run's `git checkout -b` fails against the branch the previous run
// created, forever. These tests prove: (1) a second call recovers from state the first call
// left dirty, (2) the base branch is restored on every exit path, (3) a cleanup failure never
// masks the original outcome.
describe('commitStateAndMerge — F3: idempotent state branch + base-branch restore on every exit', () => {
  const FAIL_JSON = checksJson([FAIL_UNIT_CHECK]);
  const PASS_JSON = checksJson([PASS_CHECK]);

  /** A tiny stateful git/gh fake mirroring the exact real-git semantics verified against the
   * actual CLI (see the task-4-fix report's transcript): a plain `checkout -b <name>` fails
   * once `<name>` already exists locally; `checkout -B <name> <start>` always succeeds
   * (create-or-reset — real git's own documented behavior, verified live); a plain `push`
   * is rejected non-fast-forward once the remote branch already carries a previous attempt's
   * commit, while `--force` always succeeds. Both calls in the regression test below share
   * this one fake so state genuinely carries over between them, exactly like two runs of the
   * real script against the same worktree/remote. */
  function makeStatefulRepoIo(checksQueue: string[]): { io: GithubIO; calls: string[][] } {
    const calls: string[][] = [];
    const localBranches = new Set(['master']);
    const remoteHasBranch = new Set<string>();
    const queue = [...checksQueue];

    const exec = mock(async (args: string[]): Promise<ExecResult> => {
      calls.push(args);
      const [cmd, sub, a, b] = args;

      if (cmd === 'git' && sub === 'fetch') return ok();
      if (cmd === 'git' && sub === 'checkout' && a === '-b') {
        if (localBranches.has(b)) return fail(`fatal: a branch named '${b}' already exists`);
        localBranches.add(b);
        return ok();
      }
      if (cmd === 'git' && sub === 'checkout' && a === '-B') {
        localBranches.add(b); // create-or-reset: always succeeds, matches real `-B`
        return ok();
      }
      if (cmd === 'git' && sub === 'checkout') return ok(); // plain checkout <base branch>
      if (cmd === 'git' && sub === 'add') return ok();
      if (cmd === 'git' && sub === 'commit') return ok();
      if (cmd === 'git' && sub === 'push') {
        const name = a === '-u' ? b : a;
        const force = args.includes('--force');
        if (remoteHasBranch.has(name) && !force) return fail('! [rejected] (non-fast-forward)');
        remoteHasBranch.add(name);
        return ok();
      }
      if (cmd === 'gh' && sub === 'pr' && a === 'create') {
        return ok('https://example.invalid/o/r/pull/101\n');
      }
      if (cmd === 'gh' && sub === 'pr' && a === 'checks') {
        return ok(queue.shift() ?? PASS_JSON);
      }
      if (cmd === 'gh' && sub === 'pr' && a === 'edit') return ok();
      if (cmd === 'gh' && sub === 'pr' && a === 'merge') return ok();
      if (cmd === 'git' && sub === 'pull') return ok();
      throw new Error(`unexpected exec call: ${args.join(' ')}`);
    });

    return { io: { exec, sleep: mock(async () => {}) }, calls };
  }

  test('THE REGRESSION: a second call recovers from state the first (escalating) call left dirty — never commit_failed on a pre-existing branch', async () => {
    // First call: checks stay red for every one of its D6_MAX_RETRIES+1 polls -> escalate.
    // Second call: checks pass on the first poll -> merged. Both share ONE stateful fake, so
    // the branch/remote state the first call created is exactly what the second call faces.
    const checksQueue = [
      ...Array(D6_MAX_RETRIES + 1).fill(FAIL_JSON),
      PASS_JSON,
    ];
    const { io, calls } = makeStatefulRepoIo(checksQueue);

    const first = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);
    expect(first.outcome).toBe('escalate');

    const second = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);

    // The actual regression: before the fix, this returned `commit_failed` at step `branch`
    // ("a branch named 'campaign-state/C2' already exists") — the retry could never recover.
    expect(second.outcome).not.toBe('commit_failed');
    expect(second.outcome).toBe('merged');

    // The buggy command form (`checkout -b`) must never be used at all — idempotent setup
    // uses `checkout -B` exclusively.
    expect(calls.some((c) => c[1] === 'checkout' && c[2] === '-b')).toBe(false);
  });

  test('base branch is restored on the success exit path', async () => {
    const { io, calls } = makeIo({ checksSequence: [checksJson([PASS_CHECK])] });
    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);
    expect(result.outcome).toBe('merged');
    expect(calls.some((c) => c.join(' ') === 'git checkout master')).toBe(true);
  });

  test('base branch is restored on the escalate exit path', async () => {
    const { io, calls } = makeIo({ checksSequence: [checksJson([FAIL_UNIT_CHECK])] });
    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);
    expect(result.outcome).toBe('escalate');
    expect(calls.some((c) => c.join(' ') === 'git checkout master')).toBe(true);
  });

  test('base branch is restored on a commit_failed exit path', async () => {
    const { io, calls } = makeIo({
      overrides: { 'gh pr create --title chore: update state --body Testing performed: sample docs-only state update. --base master --head campaign-state/C2': fail('gh: authentication required') },
    });
    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);
    expect(result.outcome).toBe('commit_failed');
    expect(calls.some((c) => c.join(' ') === 'git checkout master')).toBe(true);
  });

  test('base branch is restored even after an unhandled exception from the very first git call', async () => {
    const calls: string[][] = [];
    let callCount = 0;
    const exec = mock(async (args: string[]): Promise<ExecResult> => {
      calls.push(args);
      callCount += 1;
      if (callCount === 1) throw new Error('unexpected environment failure');
      return OK; // the cleanup's restore checkout, after the catch
    });
    const io: GithubIO = { exec, sleep: mock(async () => {}) };

    const result = await commitStateAndMerge(['state.json'], 'chore: update state', config, io);

    expect(result.outcome).toBe('commit_failed');
    expect(calls.some((c) => c.join(' ') === 'git checkout master')).toBe(true);
  });

  test('a cleanup failure (restore checkout itself fails) does not change the returned outcome or reason', async () => {
    const { io } = makeIo({
      checksSequence: [checksJson([FAIL_UNIT_CHECK])],
      overrides: { 'git checkout master': fail('worktree is locked') },
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
      outcome: 'escalate',
      branch: 'campaign-state/C2',
      pr: 101,
      reason: 'non-advisory check(s) red after D6 retries exhausted',
      failedChecks: [FAIL_UNIT_CHECK],
    });
  });
});
