// module: core/scratch-plan.test
import { describe, expect, test } from 'bun:test';
import { planScratch } from './scratch-plan';

const FILES = ['src/index.ts', 'src/services/orderService.ts', '../manifest/orderly.json'];

describe('planScratch', () => {
  test('clean arm carries no memory files and asserts none', () => {
    const plan = planScratch({ fixtureFiles: FILES, leg: 'scout', arm: 'clean' });
    expect(plan.memoryFiles).toEqual([]);
    expect(plan.assertNoMemory).toBe(true);
  });

  test('mem arm carries the injected memory files', () => {
    const mem = [{ path: 'CLAUDE.md', content: 'x' }];
    const plan = planScratch({ fixtureFiles: FILES, leg: 'scout', arm: 'mem', memoryFixtureFiles: mem });
    expect(plan.memoryFiles).toEqual(mem);
    expect(plan.assertNoMemory).toBe(false);
  });

  test('tracker leg applies the default patch', () => {
    const plan = planScratch({ fixtureFiles: FILES, leg: 'tracker', arm: 'clean' });
    expect(plan.applyPatch).toBe('diffs/orderly-pr1.patch');
  });

  test('scout leg never applies a patch', () => {
    const plan = planScratch({ fixtureFiles: FILES, leg: 'scout', arm: 'clean' });
    expect(plan.applyPatch).toBeNull();
  });

  test('the manifest is never in copyFiles, always in excludePaths', () => {
    const plan = planScratch({ fixtureFiles: FILES, leg: 'scout', arm: 'clean' });
    expect(plan.copyFiles.some((f) => f.includes('manifest'))).toBe(false);
    expect(plan.excludePaths).toEqual(['../manifest/orderly.json']);
  });

  test('a fixture file whose path merely contains the substring "manifest" (no manifest path segment) stays in copyFiles', () => {
    const files = [
      'src/index.ts',
      'src/services/manifestValidator.ts',
      'src/domain/shippingManifest.ts',
      '../manifest/orderly.json',
    ];
    const plan = planScratch({ fixtureFiles: files, leg: 'scout', arm: 'clean' });
    expect(plan.copyFiles).toContain('src/services/manifestValidator.ts');
    expect(plan.copyFiles).toContain('src/domain/shippingManifest.ts');
    expect(plan.excludePaths).toEqual(['../manifest/orderly.json']);
  });
});
