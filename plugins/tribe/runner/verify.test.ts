// Tests for verify.ts (Task 3): the D3 six-point SHIPPED replay. Every gh/git call is
// mocked through the injected `io.exec`/`io.readFile` seams — these tests never invoke a
// real binary. Fixture values are deliberately neutral (no repo names, no campaign-specific
// values) — the stateless-capability wall.
import { describe, expect, test } from 'bun:test';
import { readAllowsSchemaChange, verifyShipped } from './verify.ts';
import type { ExecResult, VerifyConfig, VerifyIO } from './verify.ts';
import type { Card } from './types.ts';

function fixtureCard(overrides: Partial<Card> = {}): Card {
  return {
    status: 'running',
    spec: 'docs/superpowers/specs/2026-01-01-c1-spec.md',
    plan: 'docs/superpowers/plans/2026-01-01-c1-plan.md',
    branch: 'feat/c1-widget',
    baseSha: 'base0001',
    pr: 42,
    mergeSha: null,
    sessionId: 'sess-c1',
    updatedAt: null,
    ...overrides,
  };
}

function fixtureConfig(overrides: Partial<VerifyConfig> = {}): VerifyConfig {
  return {
    repoRoot: '/repo',
    schemaLockPaths: ['packages/app/src/domain/sample-types.ts'],
    ...overrides,
  };
}

interface MockOptions {
  merged?: boolean;
  mergeSha?: string | null;
  /** stdout for `git rev-list --parents -n 1 <mergeSha>`; defaults to a 2-parent line. */
  revListStdout?: string;
  ancestorExitCode?: number;
  checks?: Array<{ name: string; bucket: string; description?: string }>;
  docsOnlyDiffFiles?: string[];
  worktreeStillExists?: boolean;
  remoteStillExists?: boolean;
  schemaDiffStdout?: string;
  planContent?: string;
}

function ok(stdout: string): ExecResult {
  return { stdout, stderr: '', exitCode: 0 };
}

function buildIo(opts: MockOptions = {}): VerifyIO {
  const merged = opts.merged ?? true;
  const mergeSha = opts.mergeSha === undefined ? 'mergesha1' : opts.mergeSha;
  const revListStdout = opts.revListStdout ?? `${mergeSha} parent1 parent2`;
  const ancestorExitCode = opts.ancestorExitCode ?? 0;
  const checks = opts.checks ?? [{ name: 'ci', bucket: 'pass' }];
  const docsOnlyDiffFiles = opts.docsOnlyDiffFiles ?? ['docs/note.md'];
  const worktreeStillExists = opts.worktreeStillExists ?? false;
  const remoteStillExists = opts.remoteStillExists ?? false;
  const schemaDiffStdout = opts.schemaDiffStdout ?? '';
  const planContent = opts.planContent ?? '# plan\n\nno front matter here.\n';

  return {
    async exec(cmd: string[]): Promise<ExecResult> {
      const [bin, ...rest] = cmd;
      if (bin === 'gh' && rest[0] === 'api') {
        return ok(JSON.stringify({ merged, merge_commit_sha: mergeSha }));
      }
      if (bin === 'git' && rest[0] === 'rev-list') {
        return ok(revListStdout);
      }
      if (bin === 'git' && rest[0] === 'merge-base') {
        return { stdout: '', stderr: '', exitCode: ancestorExitCode };
      }
      if (bin === 'gh' && rest[0] === 'pr' && rest[1] === 'checks') {
        return ok(JSON.stringify(checks));
      }
      if (bin === 'git' && rest[0] === 'worktree') {
        return ok(
          worktreeStillExists
            ? `worktree /repo\nHEAD abc\nbranch refs/heads/${fixtureCard().branch}\n`
            : `worktree /repo\nHEAD abc\nbranch refs/heads/master\n`,
        );
      }
      if (bin === 'git' && rest[0] === 'ls-remote') {
        return ok(remoteStillExists ? `abc123\trefs/heads/${rest[rest.length - 1]}\n` : '');
      }
      if (bin === 'git' && rest[0] === 'diff' && rest.includes('--name-only')) {
        return ok(docsOnlyDiffFiles.map((f) => `${f}\n`).join(''));
      }
      if (bin === 'git' && rest[0] === 'diff') {
        return ok(schemaDiffStdout);
      }
      throw new Error(`unmocked exec call: ${cmd.join(' ')}`);
    },
    readFile(): string {
      return planContent;
    },
  };
}

describe('verifyShipped — happy path', () => {
  test('all six points pass', async () => {
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), buildIo());
    expect(result.shipped).toBe(true);
    expect(result.failedPoints).toEqual([]);
    expect(result.points).toHaveLength(6);
    expect(result.points.every((p) => p.passed)).toBe(true);
  });
});

describe('verifyShipped — point 2: squash/rebase detection', () => {
  test('a 1-parent merge commit fails mergeCommitTwoParents', async () => {
    const io = buildIo({ revListStdout: 'mergesha1 parent1' });
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), io);
    expect(result.shipped).toBe(false);
    expect(result.failedPoints).toContain('mergeCommitTwoParents');
    const point = result.points.find((p) => p.id === 'mergeCommitTwoParents');
    expect(point?.passed).toBe(false);
  });
});

describe('verifyShipped — point 4: checks green + D6 flake classification', () => {
  test('a real red check (non-sonar) fails checksGreen', async () => {
    const io = buildIo({ checks: [{ name: 'unit-tests', bucket: 'fail' }] });
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), io);
    expect(result.shipped).toBe(false);
    expect(result.failedPoints).toContain('checksGreen');
  });

  test('sonar-504 signature + docs-only diff is classified as a waivable flake (passes)', async () => {
    const io = buildIo({
      checks: [{ name: 'SonarCloud Code Analysis', bucket: 'fail', description: 'bootstrap failed: HTTP 504' }],
      docsOnlyDiffFiles: ['docs/superpowers/plans/2026-01-01-c1-plan.md'],
    });
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), io);
    const point = result.points.find((p) => p.id === 'checksGreen');
    expect(point?.passed).toBe(true);
    expect(point?.detail).toMatch(/waived/i);
  });

  test('sonar-504 signature on a CODE diff is NOT waivable (D6: code PRs never auto-waive)', async () => {
    const io = buildIo({
      checks: [{ name: 'SonarCloud Code Analysis', bucket: 'fail', description: 'bootstrap failed: HTTP 504' }],
      docsOnlyDiffFiles: ['packages/app/src/domain/sample-types.ts'],
    });
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), io);
    expect(result.shipped).toBe(false);
    expect(result.failedPoints).toContain('checksGreen');
  });
});

describe('verifyShipped — point 5: worktree/branch cleanup', () => {
  test('a still-present worktree fails worktreeAndBranchGone', async () => {
    const io = buildIo({ worktreeStillExists: true });
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), io);
    expect(result.failedPoints).toContain('worktreeAndBranchGone');
  });

  test('a still-present remote branch fails worktreeAndBranchGone', async () => {
    const io = buildIo({ remoteStillExists: true });
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), io);
    expect(result.failedPoints).toContain('worktreeAndBranchGone');
  });
});

describe('verifyShipped — point 6: schema guard', () => {
  test('a non-empty schema-lock diff with no allow flag fails schemaGuard', async () => {
    const io = buildIo({ schemaDiffStdout: 'diff --git a/packages/app/src/domain/sample-types.ts ...\n' });
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), io);
    expect(result.shipped).toBe(false);
    expect(result.failedPoints).toContain('schemaGuard');
  });

  test('missing front-matter defaults allowsSchemaChange to false (guard stays enforced)', async () => {
    const io = buildIo({
      schemaDiffStdout: 'diff --git a/packages/app/src/domain/sample-types.ts ...\n',
      planContent: '# c1 plan\n\nNo YAML front matter block at all.\n',
    });
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), io);
    expect(result.failedPoints).toContain('schemaGuard');
  });

  test('front-matter allowsSchemaChange: true waives a non-empty schema-lock diff', async () => {
    const io = buildIo({
      schemaDiffStdout: 'diff --git a/packages/app/src/domain/sample-types.ts ...\n',
      planContent: '---\nallowsSchemaChange: true\n---\n\n# c1 plan\n',
    });
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), io);
    const point = result.points.find((p) => p.id === 'schemaGuard');
    expect(point?.passed).toBe(true);
  });
});

describe('readAllowsSchemaChange', () => {
  test('returns false when there is no front-matter block', () => {
    expect(readAllowsSchemaChange('# just a plan\n')).toBe(false);
  });

  test('returns false when front-matter exists but the key is absent', () => {
    expect(readAllowsSchemaChange('---\nsomeOtherKey: true\n---\n# plan\n')).toBe(false);
  });

  test('returns true only when the key is explicitly true', () => {
    expect(readAllowsSchemaChange('---\nallowsSchemaChange: true\n---\n# plan\n')).toBe(true);
    expect(readAllowsSchemaChange('---\nallowsSchemaChange: false\n---\n# plan\n')).toBe(false);
  });
});

describe('verifyShipped — multi-failure reporting', () => {
  test('every failed point is named, not just the first', async () => {
    const io = buildIo({
      revListStdout: 'mergesha1 parent1', // squash merge -> point 2 fails
      checks: [{ name: 'unit-tests', bucket: 'fail' }], // real red check -> point 4 fails
      schemaDiffStdout: 'diff --git a/packages/app/src/domain/sample-types.ts ...\n', // point 6 fails
    });
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), io);
    expect(result.shipped).toBe(false);
    expect(result.failedPoints).toEqual(
      expect.arrayContaining(['mergeCommitTwoParents', 'checksGreen', 'schemaGuard']),
    );
    // points 1, 3, 5 are untouched by these mocks and should still pass.
    expect(result.points.find((p) => p.id === 'merged')?.passed).toBe(true);
    expect(result.points.find((p) => p.id === 'mergeShaAncestorOfMaster')?.passed).toBe(true);
    expect(result.points.find((p) => p.id === 'worktreeAndBranchGone')?.passed).toBe(true);
  });
});

describe('verifyShipped — never throws', () => {
  test('an exec rejection is reported as a failed point, not a thrown error', async () => {
    const io = buildIo();
    const failingIo: VerifyIO = {
      ...io,
      async exec(cmd: string[]) {
        if (cmd[0] === 'gh' && cmd[1] === 'api') {
          throw new Error('network blip');
        }
        return io.exec(cmd);
      },
    };
    const result = await verifyShipped(fixtureCard(), fixtureConfig(), failingIo);
    expect(result.shipped).toBe(false);
    expect(result.failedPoints).toContain('merged');
  });
});
