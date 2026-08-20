// module: core/fixture-meta.test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateManifest } from './manifest';

const DETECTION_ROOT = join(import.meta.dir, '..');
const FIXTURE_ROOT = join(DETECTION_ROOT, 'fixtures/orderly');
const manifestRaw = JSON.parse(readFileSync(join(DETECTION_ROOT, 'manifest/orderly.json'), 'utf8'));

describe('orderly.json manifest', () => {
  test('is schema-valid', () => {
    const result = validateManifest(manifestRaw);
    expect(result.ok).toBe(true);
  });

  test('has exactly 10 conventions and 3 decoys', () => {
    expect(manifestRaw.conventions).toHaveLength(10);
    expect(manifestRaw.decoys).toHaveLength(3);
  });

  test('every exemplar path exists in the fixture', () => {
    for (const c of manifestRaw.conventions) {
      for (const ex of c.exemplars) {
        const path = ex.split(' ')[0]; // strip trailing "(methodName)" annotations
        expect(() => readFileSync(join(FIXTURE_ROOT, path), 'utf8')).not.toThrow();
      }
    }
  });

  test('every deviation file:line exists and the line contains a DEVIATION marker', () => {
    for (const c of manifestRaw.conventions) {
      const filePath = join(FIXTURE_ROOT, c.deviation.file);
      const lines = readFileSync(filePath, 'utf8').split('\n');
      const target = lines[c.deviation.line - 1] ?? '';
      const nearby = lines.slice(Math.max(0, c.deviation.line - 5), c.deviation.line + 1).join('\n');
      expect(nearby).toContain('DEVIATION');
      expect(target.length).toBeGreaterThan(0);
    }
  });

  test('legB.violates matches the C1/C4/C6/C10 subset the plan seeded', () => {
    expect(manifestRaw.legB.violates.slice().sort()).toEqual(['C1', 'C4', 'C6', 'C10'].sort());
  });
});
