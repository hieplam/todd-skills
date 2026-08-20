// module: core/manifest.test
import { describe, expect, test } from 'bun:test';
import { validateManifest } from './manifest';

function validManifest() {
  return {
    fixture: 'orderly',
    conventions: [
      {
        id: 'C1', tier: 'easy', description: 'services return Result',
        exemplars: ['src/services/orderService.ts', 'src/services/customerService.ts', 'src/services/productService.ts'],
        deviation: { file: 'src/services/notificationService.ts', line: 12, note: 'throws instead of Result' },
        expected_detection: 'names the pattern and the throwing site',
      },
    ],
    decoys: [
      { id: 'D1', description: 'alphabetical imports', exemplars: ['a.ts', 'b.ts', 'c.ts'] },
    ],
    legB: { patch: 'diffs/orderly-pr1.patch', violates: ['C1'] },
  };
}

describe('validateManifest', () => {
  test('accepts a well-formed manifest', () => {
    const result = validateManifest(validManifest());
    expect(result.ok).toBe(true);
  });

  test('rejects a convention missing tier', () => {
    const m = validManifest();
    // @ts-expect-error deliberately malformed for the test
    delete m.conventions[0].tier;
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('tier'))).toBe(true);
  });

  test('rejects a convention with fewer than 3 exemplars', () => {
    const m = validManifest();
    m.conventions[0].exemplars = ['only-one.ts'];
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
  });

  test('rejects legB.violates referencing an unknown convention id', () => {
    const m = validManifest();
    m.legB.violates = ['C99'];
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('C99'))).toBe(true);
  });

  test('rejects a non-object payload', () => {
    const result = validateManifest('not an object');
    expect(result.ok).toBe(false);
  });

  test('a decoy needs no deviation field', () => {
    const m = validManifest();
    const result = validateManifest(m);
    expect(result.ok).toBe(true);
  });

  test('returns {ok: false} instead of throwing when a convention entry is null', () => {
    const m = validManifest();
    // @ts-expect-error deliberately malformed for the test
    m.conventions = [null];
    let result: ReturnType<typeof validateManifest> | undefined;
    expect(() => {
      result = validateManifest(m);
    }).not.toThrow();
    expect(result?.ok).toBe(false);
  });

  test('rejects a convention with a NaN deviation.line', () => {
    const m = validManifest();
    m.conventions[0].deviation.line = NaN;
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('deviation'))).toBe(true);
  });

  test('rejects a convention with a negative deviation.line', () => {
    const m = validManifest();
    m.conventions[0].deviation.line = -5;
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('deviation'))).toBe(true);
  });
});
