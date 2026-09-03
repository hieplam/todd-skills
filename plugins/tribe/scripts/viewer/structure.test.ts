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

/** Raw source of `file`, byte for byte — no comment-stripping. Used ONLY for the `process.env`
 * ban below: two prior rounds each hardened a hand-rolled comment stripper against one
 * adversarial input and left an adjacent one open (a glob string masquerading as a block
 * comment, F27; a quote inside a regex literal desynchronizing the scanner for the rest of the
 * file, F26). Scanning raw source instead fails in the SAFE direction: a `process.env` mention
 * inside a comment becomes a loud false POSITIVE — trivially resolved by rewording the comment
 * — rather than a silent false negative, which is what a comment-stripping scanner risks every
 * time it meets a new adversarial input it wasn't hardened against. */
function rawSourceOf(file: string): string {
  return readFileSync(join(ROOT, file), 'utf8');
}

/** Every module specifier `file` actually depends on at runtime, found by asking Bun's own
 * transpiler to parse the file (`Bun.Transpiler#scanImports`) instead of re-deriving JS/TS
 * grammar by hand. A hand-rolled scanner is a partial JS lexer forever one step behind the next
 * adversarial input (comment-in-string, F27; quote-in-regex-literal, F26) — a real parser has
 * none of those blind spots: static `import`, side-effect `import '…'`, dynamic `import(…)`,
 * and `require(…)` are all reported, in any quote form (single/double/backtick), regardless of
 * what other syntax (a regex literal, a comment, a nested string) surrounds them elsewhere in
 * the file. `import type { … } from '…'` is erased at compile time and is never a runtime
 * dependency — `scanImports` does not report it, which matches this wall's existing semantics. */
function importsOf(file: string, loader: 'ts' | 'js'): string[] {
  return new Bun.Transpiler({ loader }).scanImports(rawSourceOf(file)).map((i) => i.path);
}

describe('viewer structural contract', () => {
  test('core/** never names a world-touching module, in any quote form or import form', () => {
    for (const f of walk('core')) {
      const imports = importsOf(f, 'ts');
      const bad = WORLD.filter((m) => imports.includes(m));
      expect({ file: f, bad }).toEqual({ file: f, bad: [] });
    }
  });

  test('adapters are value-imported only by serve.ts or other adapters, in any import form', () => {
    for (const f of walk('core')) {
      expect({ file: f, bad: importsOf(f, 'ts').filter((s) => s.includes('.adapter')) }).toEqual({ file: f, bad: [] });
    }
  });

  test('no ambient process.env read outside adapters/ and serve.ts', () => {
    for (const f of walk('core')) {
      expect({ file: f, bad: /process\.env\b/.test(rawSourceOf(f)) }).toEqual({ file: f, bad: false });
    }
  });

  test('the browser client imports nothing at all, in any import form', () => {
    expect(importsOf('client/app.js', 'js')).toEqual([]);
  });
});
