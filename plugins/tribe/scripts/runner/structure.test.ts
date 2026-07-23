// structure.test.ts — the runner's structural contract, executable (lesson L2: an
// architectural invariant is a lint/test in CI, or it is a wish).
//
// Roles (flat directory + filename convention — no folders):
//   types.ts                 shared kernel: imports nothing local; home of ALL shared vocabulary
//   *.adapter.ts             the ONLY files that may import world-touching modules (fs,
//                            child_process, http, the Agent SDK)
//   run.ts                   composition root: the only file that may VALUE-import adapters
//                            and loop.ts
//   everything else          pure core
// Tests are exempt everywhere (they need real IO or mocks freely) — kanna's own exemption.
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = import.meta.dir;
const SOURCE_FILES = readdirSync(DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .sort();
const CORE_FILES = SOURCE_FILES.filter((f) => !f.endsWith('.adapter.ts'));

/** Module specifiers of every import in the file, including `import type`. */
function allImportsOf(file: string): string[] {
  const src = readFileSync(join(DIR, file), 'utf8');
  return [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] as string);
}

/** Module specifiers of value imports only (`import type` statements stripped first). */
function valueImportsOf(file: string): string[] {
  const src = readFileSync(join(DIR, file), 'utf8').replace(/import\s+type\s[^;]+;/gs, '');
  return [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] as string);
}

const WORLD = ['fs', 'node:fs', 'node:fs/promises', 'child_process', 'node:child_process', 'http', 'node:http', 'https', 'node:https', '@anthropic-ai/claude-agent-sdk'];

describe('structural contract', () => {
  // --- true today: locked in immediately ---
  test('types.ts is a leaf: no local imports at all', () => {
    expect(allImportsOf('types.ts').filter((s) => s.startsWith('./'))).toEqual([]);
  });
  test('loop/state/verify/github/report never import world-touching modules', () => {
    for (const f of ['loop.ts', 'state.ts', 'verify.ts', 'github.ts', 'report.ts']) {
      expect({ file: f, bad: allImportsOf(f).filter((s) => WORLD.includes(s)) }).toEqual({ file: f, bad: [] });
    }
  });
  test('only session-owned files import the Agent SDK', () => {
    const importers = SOURCE_FILES.filter((f) => allImportsOf(f).includes('@anthropic-ai/claude-agent-sdk'));
    expect(importers.every((f) => f.startsWith('session'))).toBe(true);
  });
  test('adapters are value-imported only by run.ts or other adapters', () => {
    for (const f of CORE_FILES.filter((f) => f !== 'run.ts')) {
      expect({ file: f, bad: valueImportsOf(f).filter((s) => s.includes('.adapter')) }).toEqual({ file: f, bad: [] });
    }
  });

  // --- false today: flipped live by CU1 tasks ---
  test('leaf modules never import the orchestrator (only run.ts + tests may)', () => {
    for (const f of CORE_FILES.filter((f) => f !== 'run.ts')) {
      expect({ file: f, bad: allImportsOf(f).filter((s) => s === './loop.ts' || s === './loop') }).toEqual({ file: f, bad: [] });
    }
  });
  test('session.ts is pure: no SDK import outside session.adapter.ts', () => {
    expect(allImportsOf('session.ts').includes('@anthropic-ai/claude-agent-sdk')).toBe(false);
  });
  test('brief.ts is pure: no node:fs import', () => {
    expect(allImportsOf('brief.ts').filter((s) => WORLD.includes(s))).toEqual([]);
  });
  test.todo('run.ts is pure wiring: no node:fs / node:child_process import', () => {}); // Task 5
});
