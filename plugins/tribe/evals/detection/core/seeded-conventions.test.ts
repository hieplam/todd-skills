// module: core/seeded-conventions.test
import { describe, expect, test } from 'bun:test';
import { selectSeededConventions } from './seeded-conventions';
import type { Manifest } from './types';

const MANIFEST: Manifest = {
  fixture: 'orderly',
  conventions: [
    {
      id: 'C1', tier: 'easy', description: 'services return Result objects, never throw',
      exemplars: ['a.ts', 'b.ts', 'c.ts'],
      deviation: { file: 'src/services/notificationService.ts', line: 12, note: 'throws' },
      expected_detection: 'names the throwing site',
    },
    {
      id: 'C2', tier: 'medium', description: 'decorators over manual wiring',
      exemplars: ['a.ts', 'b.ts', 'c.ts'],
      deviation: { file: 'src/services/orderService.ts', line: 20, note: 'manual wiring' },
      expected_detection: 'names the manual wiring site',
    },
    {
      id: 'C4', tier: 'medium', description: 'clock is injected everywhere',
      exemplars: ['a.ts', 'b.ts', 'c.ts'],
      deviation: { file: 'src/services/customerService.ts', line: 9, note: 'calls Date.now() inline' },
      expected_detection: 'names the inline call',
    },
  ],
  decoys: [],
  legB: { patch: 'diffs/orderly-pr1.patch', violates: ['C4', 'C1'] },
};

describe('selectSeededConventions', () => {
  test('scout leg returns every convention in manifest order', () => {
    const result = selectSeededConventions(MANIFEST, 'scout');
    expect(result.map((r) => r.id)).toEqual(['C1', 'C2', 'C4']);
  });

  test('tracker leg returns only legB.violates subset, in the manifest\'s own order', () => {
    const result = selectSeededConventions(MANIFEST, 'tracker');
    // manifest.conventions order is C1, C2, C4 — legB.violates lists C4 before C1, but the
    // filter walks manifest.conventions, so the manifest's own order must win.
    expect(result.map((r) => r.id)).toEqual(['C1', 'C4']);
  });

  test('returned objects carry the right id/tier pairs', () => {
    const result = selectSeededConventions(MANIFEST, 'tracker');
    expect(result).toEqual([
      { id: 'C1', tier: 'easy' },
      { id: 'C4', tier: 'medium' },
    ]);
  });
});
