// module: core/memory-overlap.test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DETECTION_ROOT = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(DETECTION_ROOT, 'manifest/orderly.json'), 'utf8'));
const memoryText = readFileSync(join(DETECTION_ROOT, 'memory-fixture/CLAUDE.md'), 'utf8');

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'never', 'always', 'every', 'each', 'file',
  'files', 'code', 'test', 'tests', 'project', 'convention', 'conventions', 'field',
  'fields', 'named', 'across', 'instead', 'exactly',
  'shape', 'pattern', 'used', 'uses',
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[`*_#\-().,:;{}[\]|'"]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );
}

describe('mem-arm memory fixture', () => {
  test('shares zero significant words with the manifest convention/decoy descriptions', () => {
    const manifestWords = new Set<string>();
    for (const c of manifest.conventions) for (const w of significantWords(c.description)) manifestWords.add(w);
    for (const d of manifest.decoys) for (const w of significantWords(d.description)) manifestWords.add(w);
    const memoryWords = significantWords(memoryText);
    const overlap = [...memoryWords].filter((w) => manifestWords.has(w));
    expect(overlap).toEqual([]);
  });
});
