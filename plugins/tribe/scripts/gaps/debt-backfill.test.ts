// debt-backfill.test.ts — the four spec §10a / plan Task 4 backfill scenarios (spec §7:
// post-merge issue backfill). `selectMissing`/`issueBody` are pure core (plugins/tribe/rules/
// pure-core.md) and are tested directly with in-memory fixtures — no IO. The `gh`-absent edge
// (scenario 4) is tested against a real temp-dir git repo fixture (mirrors `debt-count.test.ts`'s
// fixture discipline) so `listDebtEntities` genuinely reads a committed tree, and a real,
// deliberately nonexistent path stands in for a missing `gh` executable — nothing here is mocked
// in-process.
import { describe, expect, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { type DebtEntity } from './debt-entity.ts';
import { backfill, issueBody, selectMissing } from './debt-backfill.ts';

const CLI_PATH = join(import.meta.dir, 'debt-backfill.ts');

const OPEN_ENTITY: DebtEntity = {
  id: 'debt-bare-catch-handlers',
  slug: 'bare-catch-handlers',
  check: "grep -rn 'catch {}' src/handlers/",
  antiRule: 'rule-no-bare-catch',
  originGap: 'G-007',
  baseline: 9,
  status: 'open',
  path: '.c3/documents/debt/debt-bare-catch-handlers.md',
  description: 'Tracker found bare catch handlers swallowing errors in the handlers directory.',
};

describe('debt-backfill — spec §10a scenario 1', () => {
  test('selectMissing returns exactly the open entities not mentioned in any issue text; issueBody carries every required field', () => {
    const otherOpenEntity: DebtEntity = {
      ...OPEN_ENTITY,
      id: 'debt-other-thing',
      slug: 'other-thing',
      description: 'Some other pattern already has an issue.',
    };
    const issueTexts = [
      'Unrelated issue title\nUnrelated issue body mentioning nothing relevant.',
      `Tech debt: ${otherOpenEntity.description}\nBody mentioning debt-other-thing and c3 read debt-other-thing`,
    ];

    const missing = selectMissing([OPEN_ENTITY, otherOpenEntity], issueTexts);

    expect(missing.map((e) => e.id)).toEqual(['debt-bare-catch-handlers']);

    const { title, body } = issueBody(OPEN_ENTITY);
    expect(title).toBe(`Tech debt: ${OPEN_ENTITY.description}`);
    expect(body).toContain(OPEN_ENTITY.id);
    expect(body).toContain(OPEN_ENTITY.check);
    expect(body).toContain(String(OPEN_ENTITY.baseline));
    expect(body).toContain(OPEN_ENTITY.antiRule);
    expect(body).toContain(OPEN_ENTITY.originGap);
    expect(body).toContain(
      'Fix protocol: run the debt-fix workflow; investigate in that session, not here.',
    );
  });
});

describe('debt-backfill — spec §10a scenario 2', () => {
  test('idempotent: after run 1\'s created issue text is appended, a second selectMissing returns []', () => {
    const { title, body } = issueBody(OPEN_ENTITY);
    const issueTextsAfterRun1 = [`${title}\n${body}`];

    const missing = selectMissing([OPEN_ENTITY], issueTextsAfterRun1);

    expect(missing).toEqual([]);
  });
});

describe('debt-backfill — spec §10a scenario 3', () => {
  test('a status: closed entity is never selected, even with no matching issue at all', () => {
    const closedEntity: DebtEntity = { ...OPEN_ENTITY, status: 'closed' };

    const missing = selectMissing([closedEntity], []);

    expect(missing).toEqual([]);
  });
});

describe('debt-backfill — spec §10a scenario 4', () => {
  /** Creates a fresh temp dir, runs `fn` against it, then always removes it. */
  async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
    const dir = mkdtempSync(join(tmpdir(), 'debt-backfill-'));
    try {
      await fn(dir);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  function runGit(dir: string, args: string[]): void {
    const proc = Bun.spawnSync(['git', ...args], { cwd: dir, stdout: 'pipe', stderr: 'pipe' });
    if (proc.exitCode !== 0) {
      throw new Error(`git ${args.join(' ')} failed: ${proc.stderr.toString()}`);
    }
  }

  /** Non-default branch name — this sandbox's git wrapper blocks commits on branches named
   * `main`/`master` even inside throwaway temp-dir fixtures (`gap-rule.test.ts`/`debt-count.test.ts`
   * precedent). */
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

  function commitAll(dir: string, message: string): void {
    runGit(dir, ['add', '-A']);
    runGit(dir, ['commit', '-q', '-m', message]);
  }

  function writeDebtEntity(dir: string): void {
    const body = `---
id: debt-bare-catch-handlers
---

## Meter

| Check | Anti Rule | Origin Gap | Baseline |
| --- | --- | --- | --- |
| grep -rn 'catch {}' src/handlers/ | rule-no-bare-catch | G-007 | 1 |

## Description

Tracker found bare catch handlers swallowing errors in the handlers directory.
`;
    writeFixtureFile(dir, '.c3/documents/debt/debt-bare-catch-handlers.md', body);
  }

  function runBackfillCli(args: string[]): { exitCode: number; stdout: string; stderr: string } {
    const proc = Bun.spawnSync(['bun', CLI_PATH, ...args], { stdout: 'pipe', stderr: 'pipe' });
    return { exitCode: proc.exitCode ?? -1, stdout: proc.stdout.toString(), stderr: proc.stderr.toString() };
  }

  test('a --gh-bin pointing at a missing executable is a clean no-op, exit 0', async () => {
    await withTmpDir(async (dir) => {
      initFixtureRepo(dir);
      writeFixtureFile(dir, 'src/handlers/payment.ts', 'function a() { try {} catch {} }\n');
      writeDebtEntity(dir);
      commitAll(dir, 'init fixture tree');

      const missingGhBin = join(dir, 'definitely-not-a-real-gh-binary');

      const result = await backfill({ repo: dir, ref: 'fixture-branch', ghBin: missingGhBin });
      expect(result).toEqual({ created: [], skipped: 'gh-unavailable' });

      const cli = runBackfillCli([
        '--repo', dir,
        '--ref', 'fixture-branch',
        '--gh-bin', missingGhBin,
      ]);
      expect(cli.exitCode).toBe(0);
      expect(JSON.parse(cli.stdout)).toEqual({ created: [], skipped: 'gh-unavailable' });
    });
  });
});
