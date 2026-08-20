// module: core/scoring.test
import { describe, expect, test } from 'bun:test';
import { score } from './scoring';

describe('score', () => {
  test('all caught, no noise => recall 1, precision 1', () => {
    const result = score({
      verdicts: [{ id: 'C1', verdict: 'caught', evidence: '' }, { id: 'C2', verdict: 'caught', evidence: '' }],
      seeded: [{ id: 'C1' }, { id: 'C2' }],
      decoysFlagged: [], invented: [],
    });
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(1);
  });

  test('partial credit is 0.5', () => {
    const result = score({
      verdicts: [
        { id: 'C1', verdict: 'caught', evidence: '' }, { id: 'C2', verdict: 'caught', evidence: '' },
        { id: 'C3', verdict: 'partial', evidence: '' }, { id: 'C4', verdict: 'partial', evidence: '' },
      ],
      seeded: Array.from({ length: 10 }, (_, i) => ({ id: `C${i + 1}` })),
      decoysFlagged: [], invented: [],
    });
    expect(result.recall).toBeCloseTo(0.3, 5);
  });

  test('decoys and invented findings lower precision', () => {
    const result = score({
      verdicts: [{ id: 'C1', verdict: 'caught', evidence: '' }],
      seeded: [{ id: 'C1' }],
      decoysFlagged: ['D1'], invented: ['made-up'],
    });
    expect(result.precision).toBeCloseTo(1 / 3, 5);
  });

  test('zero caught and zero false positives => precision defined as 1', () => {
    const result = score({ verdicts: [], seeded: [{ id: 'C1' }], decoysFlagged: [], invented: [] });
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(0);
  });

  test('empty seeded set never divides by zero', () => {
    const result = score({ verdicts: [], seeded: [], decoysFlagged: [], invented: [] });
    expect(result.recall).toBe(0);
  });

  test('easy tier recall counts only tier === easy entries', () => {
    const result = score({
      verdicts: [{ id: 'C1', verdict: 'caught', evidence: '' }, { id: 'C4', verdict: 'missed', evidence: '' }],
      seeded: [{ id: 'C1', tier: 'easy' }, { id: 'C4', tier: 'medium' }],
      decoysFlagged: [], invented: [],
    });
    expect(result.easyTierRecall).toBe(1);
  });

  test('easy tier recall is null when no easy-tier ids are seeded', () => {
    const result = score({
      verdicts: [], seeded: [{ id: 'C4', tier: 'medium' }], decoysFlagged: [], invented: [],
    });
    expect(result.easyTierRecall).toBeNull();
  });

  test('a single easy-tier partial verdict gives easyTierRecall 0.5, matching the top-level recall weighting', () => {
    const result = score({
      verdicts: [{ id: 'C1', verdict: 'partial', evidence: '' }],
      seeded: [{ id: 'C1', tier: 'easy' }],
      decoysFlagged: [], invented: [],
    });
    expect(result.easyTierRecall).toBe(0.5);
  });

  test('duplicate verdict ids for the same seeded id do not silently drop a caught result (defense in depth)', () => {
    // parseGraderVerdict rejects duplicate ids at the parsing boundary; this test only
    // guards score() itself against silently losing data if it were ever handed duplicates.
    const result = score({
      verdicts: [
        { id: 'C1', verdict: 'caught', evidence: '' },
        { id: 'C1', verdict: 'missed', evidence: '' },
      ],
      seeded: [{ id: 'C1' }],
      decoysFlagged: [], invented: [],
    });
    // caught + partial + missed must always sum to seeded — no verdict is silently lost or double counted.
    expect(result.caught + result.partial + result.missed).toBe(result.seeded);
  });
});
