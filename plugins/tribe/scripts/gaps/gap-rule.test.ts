// gap-rule.test.ts — the eleven spec §10a / plan Task 2 gap-rule scenarios. Each test builds a
// real temp-dir git repo fixture (`git init` + committed `.c3/rules/<ref>.md` + source files the
// check greps) and, where a debt disposition needs one, a real executable stub `c3` script passed
// via `--c3-bin` — because the ordered steps genuinely fold a registry, stat a real file, execute
// a real `git grep`, and spawn a real (stubbed) `c3` binary; nothing here is mocked in-process.
import { describe, expect, test } from 'bun:test';
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseLedger, type Disposition, type RuledEvent } from './ledger.ts';
import { rule } from './gap-rule.ts';

/** Creates a fresh temp dir, runs `fn` against it, then always removes it. */
async function withTmpDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), 'gap-rule-'));
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

/** Initializes a real git repo with a committer identity local to the fixture (never the real
 * repo's global config). Uses a non-default branch name — this sandbox's git wrapper blocks
 * commits on branches named `main`/`master` even inside throwaway temp-dir fixtures, so every
 * fixture repo lives on `fixture-branch` instead. */
function initFixtureRepo(dir: string): void {
  runGit(dir, ['init', '-q', '-b', 'fixture-branch']);
  runGit(dir, ['config', 'user.email', 'hunter@example.com']);
  runGit(dir, ['config', 'user.name', 'Hunter Fixture']);
}

function writeFixtureFile(dir: string, relPath: string, content: string): string {
  const full = join(dir, relPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
  return full;
}

function commitAll(dir: string, message: string): void {
  runGit(dir, ['add', '-A']);
  runGit(dir, ['commit', '-q', '-m', message]);
}

function seedRegistry(dir: string, lines: object[]): string {
  const registryPath = join(dir, '.tribe', 'harness-gaps.jsonl');
  mkdirSync(dirname(registryPath), { recursive: true });
  writeFileSync(registryPath, lines.map((l) => `${JSON.stringify(l)}\n`).join(''));
  return registryPath;
}

function readRegistryText(registryPath: string): string {
  return readFileSync(registryPath, 'utf8');
}

/** Writes an executable stub `c3` script (outside the git repo, in the same temp dir tree) and
 * returns its path for `--c3-bin`. */
function writeStubC3(dir: string, scriptBody: string): string {
  const full = join(dir, 'stub-c3.sh');
  writeFileSync(full, scriptBody);
  chmodSync(full, 0o755);
  return full;
}

const OPENED_EVENT = {
  id: 'G-007',
  event: 'opened',
  category: 'error-handling',
  paths: ['src/handlers/'],
  fingerprint: "grep -rn 'catch {}' src/handlers/",
  hits_at_detection: 2,
  first_seen_pr: 61,
};

/** Sets up the shared fixture tree every scenario needs: a committed `.c3/rules/<ref>.md` (the
 * ruling's referenced artifact) and two matching lines in `src/handlers/payment.ts` (baseline 2,
 * so the happy-path baseline assertion proves it's the REAL executed count, not a stub number). */
function setupFixtureTree(dir: string): void {
  initFixtureRepo(dir);
  writeFixtureFile(
    dir,
    'src/handlers/payment.ts',
    'function a() { try {} catch {} }\nfunction b() { try {} catch {} }\n',
  );
  writeFixtureFile(dir, '.c3/rules/rule-no-bare-catch.md', '# rule-no-bare-catch\n\nNo bare catch handlers.\n');
  commitAll(dir, 'init fixture tree');
}

const HAPPY_STUB = `#!/bin/sh
set -e
cmd="$1"
if [ "$cmd" = "add" ]; then
  slug="$3"
  file=""
  shift 3
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--file" ]; then
      file="$2"
    fi
    shift
  done
  mkdir -p .c3/documents/debt
  {
    echo "---"
    echo "id: debt-$slug"
    echo "---"
    echo ""
    cat "$file"
  } > ".c3/documents/debt/debt-$slug.md"
elif [ "$cmd" = "set" ]; then
  echo "set $2 $3 $4" > set-invoked.log
fi
`;

const CORRUPTING_STUB = `#!/bin/sh
set -e
cmd="$1"
if [ "$cmd" = "add" ]; then
  slug="$3"
  file=""
  shift 3
  while [ "$#" -gt 0 ]; do
    if [ "$1" = "--file" ]; then
      file="$2"
    fi
    shift
  done
  mkdir -p .c3/documents/debt
  {
    echo "---"
    echo "id: debt-$slug"
    echo "---"
    echo ""
    cat "$file"
  } > ".c3/documents/debt/debt-$slug.md"
  echo "corrupted" >> .c3/rules/rule-no-bare-catch.md
elif [ "$cmd" = "set" ]; then
  :
fi
`;

const FAILING_STUB = `#!/bin/sh
exit 1
`;

describe('gap-rule — spec §10a scenario 1', () => {
  test('unknown gap is refused', async () => {
    await withTmpDir(async (dir) => {
      setupFixtureTree(dir);
      const registryPath = seedRegistry(dir, []);

      await expect(
        rule({ registryPath, gap: 'G-999', disposition: 'dismissed', ratifiedBy: 'owner', repo: dir }),
      ).rejects.toThrow(/G-999/);
      expect(readRegistryText(registryPath)).toBe('');
    });
  });
});

describe('gap-rule — spec §10a scenario 2', () => {
  test('gap whose latest event is already ruled is refused', async () => {
    await withTmpDir(async (dir) => {
      setupFixtureTree(dir);
      const registryPath = seedRegistry(dir, [
        OPENED_EVENT,
        { id: 'G-007', event: 'ruled', disposition: 'dismissed', ref: '' } satisfies RuledEvent,
      ]);
      const originalBytes = readRegistryText(registryPath);

      await expect(
        rule({ registryPath, gap: 'G-007', disposition: 'dismissed', ratifiedBy: 'owner', repo: dir }),
      ).rejects.toThrow(/already ruled/i);
      expect(readRegistryText(registryPath)).toBe(originalBytes);
    });
  });
});

describe('gap-rule — spec §10a scenario 3', () => {
  const refRequiringDispositions: Disposition[] = ['rule', 'anti-rule'];

  for (const disposition of refRequiringDispositions) {
    test(`disposition '${disposition}' without --ref is refused`, async () => {
      await withTmpDir(async (dir) => {
        setupFixtureTree(dir);
        const registryPath = seedRegistry(dir, [OPENED_EVENT]);
        const originalBytes = readRegistryText(registryPath);

        await expect(
          rule({ registryPath, gap: 'G-007', disposition, ratifiedBy: 'owner', repo: dir }),
        ).rejects.toThrow(/--ref/);
        expect(readRegistryText(registryPath)).toBe(originalBytes);
      });
    });
  }
});

describe('gap-rule — spec §10a scenario 4', () => {
  test('--ref naming a rule with no file at .c3/rules/<ref>.md is refused', async () => {
    await withTmpDir(async (dir) => {
      setupFixtureTree(dir);
      const registryPath = seedRegistry(dir, [OPENED_EVENT]);
      const originalBytes = readRegistryText(registryPath);

      await expect(
        rule({
          registryPath,
          gap: 'G-007',
          disposition: 'anti-rule',
          ref: 'rule-does-not-exist',
          ratifiedBy: 'owner',
          repo: dir,
        }),
      ).rejects.toThrow(/rule-does-not-exist/);
      expect(readRegistryText(registryPath)).toBe(originalBytes);
    });
  });
});

describe('gap-rule — spec §10a scenario 5', () => {
  test('--check containing shell metacharacters is refused before any execution', async () => {
    await withTmpDir(async (dir) => {
      setupFixtureTree(dir);
      const registryPath = seedRegistry(dir, [OPENED_EVENT]);
      const originalBytes = readRegistryText(registryPath);

      await expect(
        rule({
          registryPath,
          gap: 'G-007',
          disposition: 'debt',
          ref: 'rule-no-bare-catch',
          debtSlug: 'bare-catch-handlers',
          description: 'Handlers swallow errors.',
          check: "grep -rn 'catch {}' src/handlers/; rm -rf /tmp/should-never-run",
          ratifiedBy: 'owner',
          repo: dir,
        }),
      ).rejects.toThrow(/shell metacharacters/);

      expect(readRegistryText(registryPath)).toBe(originalBytes);
      expect(existsSync(join(dir, '.c3/documents/debt/debt-bare-catch-handlers.md'))).toBe(false);
    });
  });
});

describe('gap-rule — spec §10a scenario 6', () => {
  test('a check that fires zero hits is refused; no entity, no event', async () => {
    await withTmpDir(async (dir) => {
      setupFixtureTree(dir);
      const registryPath = seedRegistry(dir, [OPENED_EVENT]);
      const originalBytes = readRegistryText(registryPath);

      await expect(
        rule({
          registryPath,
          gap: 'G-007',
          disposition: 'debt',
          ref: 'rule-no-bare-catch',
          debtSlug: 'bare-catch-handlers',
          description: 'Handlers swallow errors.',
          check: "grep -rn 'never-appears-in-fixture' src/handlers/",
          ratifiedBy: 'owner',
          repo: dir,
        }),
      ).rejects.toThrow(/zero hits/i);

      expect(readRegistryText(registryPath)).toBe(originalBytes);
      expect(existsSync(join(dir, '.c3/documents/debt/debt-bare-catch-handlers.md'))).toBe(false);
    });
  });
});

describe('gap-rule — spec §10a scenario 7', () => {
  test('a check whose grep errors is refused likewise', async () => {
    await withTmpDir(async (dir) => {
      setupFixtureTree(dir);
      const registryPath = seedRegistry(dir, [OPENED_EVENT]);
      const originalBytes = readRegistryText(registryPath);

      await expect(
        rule({
          registryPath,
          gap: 'G-007',
          disposition: 'debt',
          ref: 'rule-no-bare-catch',
          debtSlug: 'bare-catch-handlers',
          description: 'Handlers swallow errors.',
          // an unbalanced bracket is a syntactically valid `grep` argv (no banned shell
          // metacharacters, still a single `grep` invocation) but an INVALID regex — git grep
          // fails to compile it and exits with a real error (exit 128), distinct from "no
          // matches" (exit 1, scenario 6).
          check: "grep -rn '[' src/handlers/",
          ratifiedBy: 'owner',
          repo: dir,
        }),
      ).rejects.toThrow(/errored/i);

      expect(readRegistryText(registryPath)).toBe(originalBytes);
      expect(existsSync(join(dir, '.c3/documents/debt/debt-bare-catch-handlers.md'))).toBe(false);
    });
  });
});

describe('gap-rule — spec §10a scenario 8', () => {
  test('happy debt path: entity exists, ruled event appended with ratified_by, baseline is the real hit count, c3 set was invoked', async () => {
    await withTmpDir(async (dir) => {
      setupFixtureTree(dir);
      const registryPath = seedRegistry(dir, [OPENED_EVENT]);
      const c3Bin = writeStubC3(dir, HAPPY_STUB);

      const result = await rule({
        registryPath,
        gap: 'G-007',
        disposition: 'debt',
        ref: 'rule-no-bare-catch',
        debtSlug: 'bare-catch-handlers',
        description: 'Handlers swallow errors.',
        check: "grep -rn 'catch {}' src/handlers/",
        ratifiedBy: 'shaman',
        c3Bin,
        repo: dir,
      });

      expect(result).toEqual({
        ruled: 'G-007',
        disposition: 'debt',
        ref: 'rule-no-bare-catch',
        debt_entity: 'debt-bare-catch-handlers',
        baseline: 2, // real executed hit count of the fixture's two `catch {}` lines
      });

      expect(existsSync(join(dir, '.c3/documents/debt/debt-bare-catch-handlers.md'))).toBe(true);
      expect(existsSync(join(dir, 'set-invoked.log'))).toBe(true); // proves `c3 set ... status open` ran

      const events = parseLedger(readRegistryText(registryPath));
      expect(events).toHaveLength(2);
      expect(events[1]).toEqual({
        id: 'G-007',
        event: 'ruled',
        disposition: 'debt',
        ref: 'rule-no-bare-catch',
        ratified_by: 'shaman',
      });
    });
  });
});

describe('gap-rule — spec §10a scenario 9', () => {
  test('stub corrupts an unrelated .c3/ file: loud non-zero failure naming the stray path, no ruled event', async () => {
    await withTmpDir(async (dir) => {
      setupFixtureTree(dir);
      const registryPath = seedRegistry(dir, [OPENED_EVENT]);
      const originalBytes = readRegistryText(registryPath);
      const c3Bin = writeStubC3(dir, CORRUPTING_STUB);

      await expect(
        rule({
          registryPath,
          gap: 'G-007',
          disposition: 'debt',
          ref: 'rule-no-bare-catch',
          debtSlug: 'bare-catch-handlers',
          description: 'Handlers swallow errors.',
          check: "grep -rn 'catch {}' src/handlers/",
          ratifiedBy: 'owner',
          c3Bin,
          repo: dir,
        }),
      ).rejects.toThrow(/rule-no-bare-catch\.md/);

      expect(readRegistryText(registryPath)).toBe(originalBytes); // no ruled event appended
    });
  });
});

describe('gap-rule — spec §10a scenario 10', () => {
  test('stub c3 exits non-zero: no ruled event exists afterward (ordering crash-safety)', async () => {
    await withTmpDir(async (dir) => {
      setupFixtureTree(dir);
      const registryPath = seedRegistry(dir, [OPENED_EVENT]);
      const originalBytes = readRegistryText(registryPath);
      const c3Bin = writeStubC3(dir, FAILING_STUB);

      await expect(
        rule({
          registryPath,
          gap: 'G-007',
          disposition: 'debt',
          ref: 'rule-no-bare-catch',
          debtSlug: 'bare-catch-handlers',
          description: 'Handlers swallow errors.',
          check: "grep -rn 'catch {}' src/handlers/",
          ratifiedBy: 'owner',
          c3Bin,
          repo: dir,
        }),
      ).rejects.toThrow();

      expect(readRegistryText(registryPath)).toBe(originalBytes);
      expect(existsSync(join(dir, '.c3/documents/debt/debt-bare-catch-handlers.md'))).toBe(false);
    });
  });
});

describe('gap-rule — spec §10a scenario 11', () => {
  test('dismissed path appends the event and touches nothing else', async () => {
    await withTmpDir(async (dir) => {
      setupFixtureTree(dir);
      const registryPath = seedRegistry(dir, [OPENED_EVENT]);

      const result = await rule({
        registryPath,
        gap: 'G-007',
        disposition: 'dismissed',
        ratifiedBy: 'owner',
        repo: dir,
      });

      expect(result).toEqual({ ruled: 'G-007', disposition: 'dismissed' });

      const events = parseLedger(readRegistryText(registryPath));
      expect(events).toHaveLength(2);
      expect(events[1]).toEqual({
        id: 'G-007',
        event: 'ruled',
        disposition: 'dismissed',
        ref: '',
        ratified_by: 'owner',
      });
      expect(existsSync(join(dir, '.c3/documents/debt'))).toBe(false);
    });
  });
});
