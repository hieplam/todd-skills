// debt-count.test.ts — the eight spec §10a / plan Task 3 debt-count scenarios. Each test builds a
// real temp-dir git repo fixture (real `git init`, real commits, real debt entity files under
// `.c3/documents/debt/`) so the snapshot/diff functions genuinely fold real git-tree state —
// nothing here is mocked in-process, matching `gap-rule.test.ts`'s fixture discipline.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { diffDebt, snapshotDebt } from './debt-count.ts';

const CLI_PATH = join(import.meta.dir, 'debt-count.ts');

/** Creates a fresh temp dir, runs `fn` against it, then always removes it. */
async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'debt-count-'));
  try {
    await fn(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function runGit(dir: string, args: string[]): string {
  const proc = Bun.spawnSync(['git', ...args], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
  if (proc.exitCode !== 0) {
    throw new Error(`git ${args.join(' ')} failed: ${proc.stderr.toString()}`);
  }
  return proc.stdout.toString().trim();
}

/** Non-default branch name — this sandbox's git wrapper blocks commits on branches named
 * `main`/`master` even inside throwaway temp-dir fixtures (`gap-rule.test.ts` precedent). */
function initFixtureRepo(dir: string): void {
  runGit(dir, ['init', '-q', '-b', 'fixture-branch']);
  runGit(dir, ['config', 'user.email', 'hunter@example.com']);
  runGit(dir, ['config', 'user.name', 'Hunter Fixture']);
}

function writeFixtureFile(dir: string, relPath: string, content: string): void {
  const full = join(dir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

function commitAll(dir: string, message: string): string {
  runGit(dir, ['add', '-A']);
  runGit(dir, ['commit', '-q', '-m', message]);
  return runGit(dir, ['rev-parse', 'HEAD']);
}

/** Writes a debt entity in the probed instance shape (plan Global Constraints / Task 1 fixture):
 * frontmatter `id` (+ optional `status`), a `## Meter` table header + separator + one data row,
 * `## Description`. */
function writeDebtEntity(
  dir: string,
  slug: string,
  opts: { check: string; antiRule?: string; originGap?: string; baseline: number; status?: string },
): void {
  const statusLine = opts.status ? `status: ${opts.status}\n` : '';
  const body = `---
id: debt-${slug}
${statusLine}---

## Meter

| Check | Anti Rule | Origin Gap | Baseline |
| --- | --- | --- | --- |
| ${opts.check} | ${opts.antiRule ?? 'rule-no-bare-catch'} | ${opts.originGap ?? 'G-007'} | ${opts.baseline} |

## Description

Tracker found instances of the anti-ruled pattern.
`;
  writeFixtureFile(dir, `.c3/documents/debt/debt-${slug}.md`, body);
}

function runDebtCountCli(args: string[]): { exitCode: number; stdout: string; stderr: string } {
  const proc = Bun.spawnSync(['bun', CLI_PATH, ...args], { stdout: 'pipe', stderr: 'pipe' });
  return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
}

describe('debt-count — spec §10a scenario 1', () => {
  test('snapshot output carries ref + resolved sha', async () => {
    await withTmpDir(async (dir) => {
      initFixtureRepo(dir);
      writeFixtureFile(dir, 'src/handlers/payment.ts', 'function a() { try {} catch {} }\n');
      writeDebtEntity(dir, 'bare-catch-handlers', {
        check: "grep -rn 'catch {}' src/handlers/",
        baseline: 1,
      });
      commitAll(dir, 'init fixture tree');
      const expectedSha = runGit(dir, ['rev-parse', 'fixture-branch']);

      const result = await snapshotDebt(dir, 'fixture-branch');

      expect(result.ref).toBe('fixture-branch');
      expect(result.sha).toBe(expectedSha);
    });
  });
});

describe('debt-count — spec §10a scenario 2', () => {
  test('per-entry now vs baseline; a closed entity never appears', async () => {
    await withTmpDir(async (dir) => {
      initFixtureRepo(dir);
      writeFixtureFile(
        dir,
        'src/handlers/payment.ts',
        'function a() { try {} catch {} }\nfunction b() { try {} catch {} }\n',
      );
      writeFixtureFile(dir, 'src/handlers/other.ts', 'function c() { try {} catch {} }\n');
      writeDebtEntity(dir, 'bare-catch-handlers', {
        check: "grep -rn 'catch {}' src/handlers/payment.ts",
        baseline: 5,
      });
      writeDebtEntity(dir, 'retired-thing', {
        check: "grep -rn 'catch {}' src/handlers/other.ts",
        baseline: 3,
        status: 'closed',
      });
      commitAll(dir, 'init fixture tree');

      const result = await snapshotDebt(dir, 'fixture-branch');

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]).toEqual({
        id: 'debt-bare-catch-handlers',
        baseline: 5,
        now: 2, // real executed hit count of payment.ts's two `catch {}` lines
        flags: [],
      });
      expect(result.entries.some((e) => e.id === 'debt-retired-thing')).toBe(false);
    });
  });
});

describe('debt-count — spec §10a scenario 3', () => {
  test('now > baseline flags harness-leak', async () => {
    await withTmpDir(async (dir) => {
      initFixtureRepo(dir);
      writeFixtureFile(
        dir,
        'src/handlers/payment.ts',
        'function a() { try {} catch {} }\nfunction b() { try {} catch {} }\nfunction c() { try {} catch {} }\n',
      );
      writeDebtEntity(dir, 'bare-catch-handlers', {
        check: "grep -rn 'catch {}' src/handlers/payment.ts",
        baseline: 1, // fixture actually has 3 — a harness leak grew this past its recorded baseline
      });
      commitAll(dir, 'init fixture tree');

      const result = await snapshotDebt(dir, 'fixture-branch');

      expect(result.entries[0]!.now).toBe(3);
      expect(result.entries[0]!.flags).toContain('harness-leak');
      expect(result.entries[0]!.flags).not.toContain('closable');
    });
  });
});

describe('debt-count — spec §10a scenario 4', () => {
  test('now == 0 flags closable', async () => {
    await withTmpDir(async (dir) => {
      initFixtureRepo(dir);
      writeFixtureFile(dir, 'src/handlers/payment.ts', 'function a() { return 1; }\n'); // no bare catches left
      writeDebtEntity(dir, 'bare-catch-handlers', {
        check: "grep -rn 'catch {}' src/handlers/payment.ts",
        baseline: 5,
      });
      commitAll(dir, 'init fixture tree');

      const result = await snapshotDebt(dir, 'fixture-branch');

      expect(result.entries[0]!.now).toBe(0);
      expect(result.entries[0]!.flags).toContain('closable');
      expect(result.entries[0]!.flags).not.toContain('harness-leak');
    });
  });
});

describe('debt-count — spec §10a scenario 5', () => {
  test('--diff with a head that adds hits: entry present, positive delta, new_hits names the added file:line, exit 1', async () => {
    await withTmpDir(async (dir) => {
      initFixtureRepo(dir);
      writeFixtureFile(dir, 'src/handlers/payment.ts', 'function a() { try {} catch {} }\n');
      writeDebtEntity(dir, 'bare-catch-handlers', {
        check: "grep -rn 'catch {}' src/handlers/payment.ts",
        baseline: 1,
      });
      commitAll(dir, 'base commit');
      runGit(dir, ['tag', 'base-ref']);

      writeFixtureFile(
        dir,
        'src/handlers/payment.ts',
        'function a() { try {} catch {} }\nfunction b() { try {} catch {} }\n',
      );
      commitAll(dir, 'head commit adds a new bare catch');

      const result = await diffDebt(dir, 'base-ref', 'fixture-branch');

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.id).toBe('debt-bare-catch-handlers');
      expect(result.entries[0]!.base_hits).toBe(1);
      expect(result.entries[0]!.head_hits).toBe(2);
      expect(result.entries[0]!.delta).toBe(1);
      expect(result.entries[0]!.new_hits).toEqual(['src/handlers/payment.ts:2']);

      const cli = runDebtCountCli(['--repo', dir, '--diff', 'base-ref', '--ref', 'fixture-branch']);
      expect(cli.exitCode).toBe(1);
    });
  });
});

describe('debt-count — spec §10a scenario 6', () => {
  test('--diff with a head that removes hits: negative delta entry, exit 0', async () => {
    await withTmpDir(async (dir) => {
      initFixtureRepo(dir);
      writeFixtureFile(
        dir,
        'src/handlers/payment.ts',
        'function a() { try {} catch {} }\nfunction b() { try {} catch {} }\n',
      );
      writeDebtEntity(dir, 'bare-catch-handlers', {
        check: "grep -rn 'catch {}' src/handlers/payment.ts",
        baseline: 2,
      });
      commitAll(dir, 'base commit');
      runGit(dir, ['tag', 'base-ref']);

      writeFixtureFile(dir, 'src/handlers/payment.ts', 'function a() { try {} catch {} }\n');
      commitAll(dir, 'head commit fixes one bare catch');

      const result = await diffDebt(dir, 'base-ref', 'fixture-branch');

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0]!.delta).toBe(-1);
      expect(result.entries[0]!.new_hits).toEqual([]);

      const cli = runDebtCountCli(['--repo', dir, '--diff', 'base-ref', '--ref', 'fixture-branch']);
      expect(cli.exitCode).toBe(0);
    });
  });
});

describe('debt-count — spec §10a scenario 7', () => {
  test('zero delta: empty entries, exit 0', async () => {
    await withTmpDir(async (dir) => {
      initFixtureRepo(dir);
      writeFixtureFile(dir, 'src/handlers/payment.ts', 'function a() { try {} catch {} }\n');
      writeDebtEntity(dir, 'bare-catch-handlers', {
        check: "grep -rn 'catch {}' src/handlers/payment.ts",
        baseline: 1,
      });
      commitAll(dir, 'base commit');
      runGit(dir, ['tag', 'base-ref']);

      writeFixtureFile(dir, 'README.md', 'unrelated change, same catch count\n');
      commitAll(dir, 'head commit changes something unrelated');

      const result = await diffDebt(dir, 'base-ref', 'fixture-branch');

      expect(result.entries).toEqual([]);

      const cli = runDebtCountCli(['--repo', dir, '--diff', 'base-ref', '--ref', 'fixture-branch']);
      expect(cli.exitCode).toBe(0);
    });
  });
});

describe('debt-count — spec §10a scenario 8', () => {
  test('an entity whose check fails validateFingerprint is never executed and surfaces in flagged', async () => {
    await withTmpDir(async (dir) => {
      initFixtureRepo(dir);
      writeFixtureFile(dir, 'src/handlers/payment.ts', 'function a() { try {} catch {} }\n');
      writeDebtEntity(dir, 'bare-catch-handlers', {
        check: "grep -rn 'catch {}' src/handlers/; rm -rf /tmp/should-never-run",
        baseline: 1,
      });
      commitAll(dir, 'init fixture tree');

      const result = await snapshotDebt(dir, 'fixture-branch');

      expect(result.entries).toEqual([]);
      expect(result.flagged).toHaveLength(1);
      expect(result.flagged[0]!.id).toBe('debt-bare-catch-handlers');
      expect(result.flagged[0]!.reason).toMatch(/shell metacharacters/);
    });
  });
});
