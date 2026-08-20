// module: core/prompts.test
import { describe, expect, test } from 'bun:test';
import { buildDetectorPrompt, buildGraderPrompt } from './prompts';
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
      id: 'C4', tier: 'medium', description: 'clock is injected everywhere',
      exemplars: ['a.ts', 'b.ts', 'c.ts'],
      deviation: { file: 'src/services/customerService.ts', line: 9, note: 'calls Date.now() inline' },
      expected_detection: 'names the inline call',
    },
  ],
  decoys: [],
  legB: { patch: 'diffs/orderly-pr1.patch', violates: ['C1'] },
};

describe('buildDetectorPrompt', () => {
  test('scout and tracker prompts differ and never mention manifest content', () => {
    const scout = buildDetectorPrompt('scout');
    const tracker = buildDetectorPrompt('tracker');
    expect(scout).not.toBe(tracker);
    for (const p of [scout, tracker]) {
      expect(p.toLowerCase()).not.toContain('notificationservice');
      expect(p.toLowerCase()).not.toContain('customerservice');
    }
  });
});

describe('buildGraderPrompt', () => {
  test('leg A grader prompt lists every seeded convention', () => {
    const prompt = buildGraderPrompt({ leg: 'scout', manifest: MANIFEST, detectorReport: 'report text' });
    expect(prompt).toContain('C1');
    expect(prompt).toContain('C4');
    expect(prompt).toContain('report text');
    expect(prompt).toContain('decoys_flagged');
    expect(prompt).toContain('invented');
  });

  test('leg B grader prompt is restricted to legB.violates', () => {
    const prompt = buildGraderPrompt({ leg: 'tracker', manifest: MANIFEST, detectorReport: 'diff report' });
    expect(prompt).toContain('C1');
    expect(prompt).not.toContain('C4');
  });
});
