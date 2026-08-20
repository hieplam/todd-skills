// module: core/orchestrate.test
import { describe, expect, test } from 'bun:test';
import { runCell } from './orchestrate';
import type { Manifest } from './types';

const MANIFEST: Manifest = {
  fixture: 'orderly',
  conventions: [{
    id: 'C1', tier: 'easy', description: 'x',
    exemplars: ['a.ts', 'b.ts', 'c.ts'],
    deviation: { file: 'a.ts', line: 1, note: 'x' },
    expected_detection: 'x',
  }],
  decoys: [],
  legB: { patch: 'diffs/orderly-pr1.patch', violates: ['C1'] },
};

const VALID_VERDICT = '{"conventions":[{"id":"C1","verdict":"caught","evidence":"x"}],"decoys_flagged":[],"invented":[]}';

describe('runCell', () => {
  test('scores on the first well-formed grader reply', async () => {
    let graderCalls = 0;
    const result = await runCell({
      leg: 'scout', arm: 'clean', scratchDir: '/tmp/x', agentPath: 'agents/scout.md', manifest: MANIFEST,
      detector: { run: async () => ({ report: 'detector report' }) },
      grader: { run: async () => { graderCalls++; return { text: VALID_VERDICT }; } },
    });
    expect(result.ungraded).toBe(false);
    expect(graderCalls).toBe(1);
  });

  test('retries once on a malformed grader reply, then succeeds', async () => {
    let graderCalls = 0;
    const result = await runCell({
      leg: 'scout', arm: 'clean', scratchDir: '/tmp/x', agentPath: 'agents/scout.md', manifest: MANIFEST,
      detector: { run: async () => ({ report: 'detector report' }) },
      grader: { run: async () => { graderCalls++; return graderCalls === 1 ? { text: 'not json' } : { text: VALID_VERDICT }; } },
    });
    expect(graderCalls).toBe(2);
    expect(result.ungraded).toBe(false);
  });

  test('reports ungraded (loudly) after two consecutive malformed replies', async () => {
    let graderCalls = 0;
    const result = await runCell({
      leg: 'scout', arm: 'clean', scratchDir: '/tmp/x', agentPath: 'agents/scout.md', manifest: MANIFEST,
      detector: { run: async () => ({ report: 'detector report' }) },
      grader: { run: async () => { graderCalls++; return { text: 'still not json' }; } },
    });
    expect(graderCalls).toBe(2);
    expect(result.ungraded).toBe(true);
    expect(result.error).toBeTruthy();
  });

  test('the grader prompt is built from the real manifest and the detector report', async () => {
    let capturedPrompt = '';
    await runCell({
      leg: 'scout', arm: 'clean', scratchDir: '/tmp/x', agentPath: 'agents/scout.md', manifest: MANIFEST,
      detector: { run: async () => ({ report: 'UNIQUE_REPORT_MARKER' }) },
      grader: { run: async (input) => { capturedPrompt = input.prompt; return { text: VALID_VERDICT }; } },
    });
    expect(capturedPrompt).toContain('UNIQUE_REPORT_MARKER');
    expect(capturedPrompt).toContain('C1');
  });
});
