// structure.test.ts — the runner's structural contract, executable (lesson L2: an
// architectural invariant is a lint/test in CI, or it is a wish).
//
// Directory roles (visible hierarchy, not filename convention):
//   core/types.ts             shared kernel: imports nothing local; home of ALL shared vocabulary
//   ports/                    every IO seam interface's single home
//   adapters/*.adapter.ts     the ONLY files that may import world-touching modules (fs,
//                             child_process, http, the Agent SDK)
//   cli/main.ts               composition root: the only file that may VALUE-import adapters
//                             and the orchestrator (core/loop.ts's barrel + core/loop/** split)
//   run.ts (root shim)        proves the external CLI contract; imports only cli/main.ts
//   everything else in core/  pure core
// Tests are exempt everywhere (they need real IO or mocks freely) — kanna's own exemption.
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = import.meta.dir;

/** Recursively collects non-test `.ts` source files under `dir` (relative to ROOT), skipping
 * `node_modules`. Returned paths are ROOT-relative and always use `/` separators. */
function walk(dir: string): string[] {
  const abs = join(ROOT, dir);
  let entries: string[];
  try {
    entries = readdirSync(abs);
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const entry of entries) {
    if (entry === 'node_modules') continue;
    const absEntry = join(abs, entry);
    if (statSync(absEntry).isDirectory()) {
      out.push(...walk(`${dir}/${entry}`));
      continue;
    }
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
    out.push(`${dir}/${entry}`);
  }
  return out;
}

const ROOT_SHIM = readdirSync(ROOT).includes('run.ts') ? ['run.ts'] : [];
const SOURCE_FILES = [...walk('core'), ...walk('ports'), ...walk('adapters'), ...walk('cli'), ...ROOT_SHIM].sort();
const CORE_FILES = SOURCE_FILES.filter((f) => f.startsWith('core/'));
const PORTS_FILES = SOURCE_FILES.filter((f) => f.startsWith('ports/'));
const ADAPTER_FILES = SOURCE_FILES.filter((f) => f.startsWith('adapters/'));
const CLI_FILES = SOURCE_FILES.filter((f) => f.startsWith('cli/'));

/** Module specifiers of every import in the file, including `import type`. */
function allImportsOf(file: string): string[] {
  const src = readFileSync(join(ROOT, file), 'utf8');
  return [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
}

/** Module specifiers of value imports only (`import type` statements stripped first). */
function valueImportsOf(file: string): string[] {
  const src = readFileSync(join(ROOT, file), 'utf8').replace(/import\s+type\s[^;]+;/gs, '');
  return [...src.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] as string);
}

/** Comment-stripped source (Skinner audit, 2026-07-23): specifier-string bans and
 * ambient-state bans can't be dodged inside a comment. */
function codeOf(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/** Resolves a relative local specifier (e.g. `'../core/loop.ts'` imported from
 * `adapters/run-io.adapter.ts`) to a ROOT-relative path (e.g. `'core/loop.ts'`). Returns
 * `null` for non-relative (bare/world) specifiers. */
function resolveLocalImport(fromFile: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const fromDir = fromFile.includes('/') ? fromFile.slice(0, fromFile.lastIndexOf('/')) : '.';
  const parts = `${fromDir}/${specifier}`.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '' || part === '.') continue;
    if (part === '..') {
      resolved.pop();
      continue;
    }
    resolved.push(part);
  }
  return resolved.join('/');
}

/** True if a resolved local import path points at the orchestrator — `core/loop.ts` (the pure
 * re-export barrel) or any module under `core/loop/` (its actual split implementation). */
function isOrchestrator(resolved: string | null): boolean {
  return resolved === 'core/loop.ts' || resolved?.startsWith('core/loop/') === true;
}

const WORLD = ['fs', 'node:fs', 'node:fs/promises', 'child_process', 'node:child_process', 'http', 'node:http', 'https', 'node:https', '@anthropic-ai/claude-agent-sdk'];

describe('structural contract', () => {
  test('core/types.ts is a leaf: no local imports at all', () => {
    expect(allImportsOf('core/types.ts').filter((s) => s.startsWith('.'))).toEqual([]);
  });

  test('core/** never contains a world-touching module specifier, in any form', () => {
    for (const f of CORE_FILES) {
      const src = codeOf(f);
      const bad = WORLD.filter((m) => src.includes(`'${m}'`) || src.includes(`"${m}"`));
      expect({ file: f, bad }).toEqual({ file: f, bad: [] });
    }
  });

  test('only adapters/session.adapter.ts imports the Agent SDK', () => {
    const importers = SOURCE_FILES.filter((f) => allImportsOf(f).includes('@anthropic-ai/claude-agent-sdk'));
    expect(importers).toEqual(['adapters/session.adapter.ts']);
  });

  test('adapters are value-imported only by cli/ or other adapters (core/ports never value-import adapters)', () => {
    for (const f of SOURCE_FILES) {
      if (f.startsWith('cli/') || f.startsWith('adapters/')) continue;
      const bad = valueImportsOf(f).filter((s) => s.includes('.adapter'));
      expect({ file: f, bad }).toEqual({ file: f, bad: [] });
    }
  });

  test('leaf core modules never import the orchestrator (only core/loop itself, cli/, and tests may)', () => {
    for (const f of CORE_FILES) {
      if (isOrchestrator(f)) continue;
      const bad = allImportsOf(f)
        .filter((s) => s.startsWith('.'))
        .map((s) => resolveLocalImport(f, s))
        .filter(isOrchestrator);
      expect({ file: f, bad }).toEqual({ file: f, bad: [] });
    }
  });

  test('adapters never value-import the orchestrator', () => {
    for (const f of ADAPTER_FILES) {
      const bad = valueImportsOf(f)
        .filter((s) => s.startsWith('.'))
        .map((s) => resolveLocalImport(f, s))
        .filter(isOrchestrator);
      expect({ file: f, bad }).toEqual({ file: f, bad: [] });
    }
  });

  test('cli/main.ts contains no node:fs / node:child_process specifier', () => {
    const banned = ['fs', 'node:fs', 'node:fs/promises', 'child_process', 'node:child_process'];
    const src = codeOf('cli/main.ts');
    const bad = banned.filter((m) => src.includes(`'${m}'`) || src.includes(`"${m}"`));
    expect(bad).toEqual([]);
  });

  test('process.exit appears only in cli/main.ts', () => {
    for (const f of SOURCE_FILES) {
      if (f === 'cli/main.ts') continue;
      expect({ file: f, bad: /process\.exit\s*\(/.test(codeOf(f)) }).toEqual({ file: f, bad: false });
    }
  });

  test('no ambient process.env read outside adapters/', () => {
    for (const f of SOURCE_FILES) {
      if (f.startsWith('adapters/')) continue;
      expect({ file: f, bad: /process\.env\b/.test(codeOf(f)) }).toEqual({ file: f, bad: false });
    }
  });

  test('root run.ts shim imports only from ./cli/main.ts', () => {
    if (!ROOT_SHIM.length) return; // brand-new checkouts mid-migration; real repo always has it.
    const specifiers = allImportsOf('run.ts');
    expect(specifiers.length > 0 && specifiers.every((s) => s === './cli/main.ts')).toBe(true);
  });

  // --- ports/ (added once the IO-seam split lands: every seam interface's single home) ---
  test('ports/ files are type-only, and only import from core/types.ts', () => {
    for (const f of PORTS_FILES) {
      const valueSpecifiers = valueImportsOf(f).filter((s) => s.startsWith('.'));
      expect({ file: f, bad: valueSpecifiers }).toEqual({ file: f, bad: [] });
      const localSpecifiers = allImportsOf(f).filter((s) => s.startsWith('.'));
      const bad = localSpecifiers.filter((s) => resolveLocalImport(f, s) !== 'core/types.ts');
      expect({ file: f, bad }).toEqual({ file: f, bad: [] });
    }
  });

  test('no interface X...IO / ...Port DECLARATION outside ports/ (re-exports are exempt)', () => {
    for (const f of [...CORE_FILES, ...ADAPTER_FILES, ...CLI_FILES]) {
      const src = codeOf(f);
      const bad = [...src.matchAll(/\binterface\s+(\w*(?:IO|Port))\b/g)].map((m) => m[1] as string);
      expect({ file: f, bad }).toEqual({ file: f, bad: [] });
    }
  });
});
