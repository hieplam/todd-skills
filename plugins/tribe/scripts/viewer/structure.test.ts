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

/** Comment-stripped source, STRING-AWARE (Skinner audit, 2026-09-02, F27): the old
 * regex pair (block-comment strip, then line-comment strip) treats a string literal's
 * CONTENTS as real syntax — so a glob string like "star-slash-dot-ts" (an ordinary glob)
 * opens a fake block comment that swallows everything up to the next real closing
 * block-comment marker, and a double-slash inside a string (e.g. an "https://" URL) eats
 * the rest of its own line, deleting genuine code before any assertion below ever sees
 * it. This walks the source once, character by character: string literals
 * (single/double/backtick, with their escapes) are copied through UNCHANGED, and only a
 * real block or line comment OUTSIDE a string is ever dropped. */
function codeOf(file: string): string {
  const src = readFileSync(join(ROOT, file), 'utf8');
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i] as string;
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      let j = i + 1;
      while (j < src.length && src[j] !== quote) {
        j += src[j] === '\\' ? 2 : 1;
      }
      j = Math.min(j + 1, src.length);
      out += src.slice(i, j);
      i = j;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (ch === '/' && src[i + 1] === '/') {
      const end = src.indexOf('\n', i + 2);
      i = end === -1 ? src.length : end;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/** Every quoted string literal in `file`'s (string-aware) comment-stripped source, in ANY
 * quote form — single, double, or backtick. This is how the WORLD ban and the import bans
 * below catch a specifier regardless of which import FORM carries it: static
 * `import … from '…'`, a side-effect `import '…'`, a dynamic `import(…)`, or `require(…)` —
 * none of those forms is special-cased; the specifier STRING itself is banned, in any form
 * that can hold one (Skinner audit, 2026-09-02, F26). */
function quotedLiteralsOf(file: string): string[] {
  const src = codeOf(file);
  return [...src.matchAll(/(['"`])((?:(?!\1)[^\\]|\\.)*)\1/g)].map((m) => m[2] as string);
}

/** Every quoted RELATIVE string literal (starts with `.`) in `file`'s comment-stripped
 * source, with `import type ...;` statements stripped first — the same shape as the
 * runner's `relativeStringLiteralsOf` (`plugins/tribe/scripts/runner/structure.test.ts`),
 * extended to backtick specifiers so a dynamic `import(`./x`)` is no more invisible than a
 * quoted one. Only literals starting with `.` are candidates (a relative path), which keeps
 * ordinary string literals out without needing to distinguish import syntax at all. */
function relativeStringLiteralsOf(file: string): string[] {
  const src = codeOf(file).replace(/import\s+type\s[^;]+;/gs, '');
  return [...src.matchAll(/['"`](\.[^'"`]*)['"`]/g)].map((m) => m[1] as string);
}

describe('viewer structural contract', () => {
  test('core/** never names a world-touching module, in any quote form or import form', () => {
    for (const f of walk('core')) {
      const literals = quotedLiteralsOf(f);
      const bad = WORLD.filter((m) => literals.includes(m));
      expect({ file: f, bad }).toEqual({ file: f, bad: [] });
    }
  });

  test('adapters are value-imported only by serve.ts or other adapters, in any import form', () => {
    for (const f of walk('core')) {
      expect({ file: f, bad: relativeStringLiteralsOf(f).filter((s) => s.includes('.adapter')) }).toEqual({ file: f, bad: [] });
    }
  });

  test('no ambient process.env read outside adapters/ and serve.ts', () => {
    for (const f of walk('core')) {
      expect({ file: f, bad: /process\.env\b/.test(codeOf(f)) }).toEqual({ file: f, bad: false });
    }
  });

  test('the browser client imports nothing at all, in any import form', () => {
    const src = codeOf('client/app.js');
    const bad = {
      staticOrSideEffect: [...src.matchAll(/^\s*import\s/gm)].length,
      dynamic: [...src.matchAll(/\bimport\s*\(/g)].length,
      require: [...src.matchAll(/\brequire\s*\(/g)].length,
    };
    expect(bad).toEqual({ staticOrSideEffect: 0, dynamic: 0, require: 0 });
  });
});
