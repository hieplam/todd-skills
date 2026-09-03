import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = import.meta.dir;
const WORLD = ['fs', 'node:fs', 'node:fs/promises', 'child_process', 'node:child_process', 'http', 'node:http', 'https', 'node:https'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === 'node_modules') continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) { out.push(...walk(rel)); continue; }
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
    out.push(rel);
  }
  return out;
}
const codeOf = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const valueImportsOf = (f: string) => [...codeOf(f).replace(/import\s+type\s[^;]+;/gs, '').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] as string);

describe('viewer structural contract', () => {
  test('core/** never names a world-touching module, in any quote form', () => {
    for (const f of walk('core')) {
      const src = codeOf(f);
      expect({ file: f, bad: WORLD.filter((m) => src.includes(`'${m}'`) || src.includes(`"${m}"`)) }).toEqual({ file: f, bad: [] });
    }
  });

  test('adapters are value-imported only by serve.ts or other adapters', () => {
    for (const f of walk('core')) {
      expect({ file: f, bad: valueImportsOf(f).filter((s) => s.includes('.adapter')) }).toEqual({ file: f, bad: [] });
    }
  });

  test('no ambient process.env read outside adapters/ and serve.ts', () => {
    for (const f of walk('core')) {
      expect({ file: f, bad: /process\.env\b/.test(codeOf(f)) }).toEqual({ file: f, bad: false });
    }
  });

  test('the browser client imports nothing at all', () => {
    const src = readFileSync(join(ROOT, 'client/app.js'), 'utf8');
    expect([...src.matchAll(/^\s*import\s/gm)]).toEqual([]);
  });
});
