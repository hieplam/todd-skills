// module: core/gates.test
import { describe, expect, test } from 'bun:test';
import { cellPasses, evaluateLegAClean, evaluateLegBClean, memDelta, repetitionPasses, topLevelPass } from './gates';
import type { ScoreResult } from './types';

const SCORE: ScoreResult = { recall: 0.7, precision: 0.7, easyTierRecall: 1, caught: 7, partial: 0, missed: 3, decoysFlagged: 0, invented: 0, seeded: 10 };

describe('evaluateLegAClean', () => {
  test('recall exactly at threshold passes (>=)', () => {
    const gates = evaluateLegAClean(SCORE, 0.7, 0.7);
    expect(gates.find((g) => g.id === 'G1')!.pass).toBe(true);
    expect(gates.find((g) => g.id === 'G2')!.pass).toBe(true);
  });

  test('G3 requires easy tier recall exactly 1.0', () => {
    const score = { ...SCORE, easyTierRecall: 0.67 };
    const gates = evaluateLegAClean(score, 0.7, 0.7);
    expect(gates.find((g) => g.id === 'G3')!.pass).toBe(false);
  });

  test('below-threshold recall fails G1', () => {
    const score = { ...SCORE, recall: 0.5 };
    const gates = evaluateLegAClean(score, 0.7, 0.7);
    expect(gates.find((g) => g.id === 'G1')!.pass).toBe(false);
  });
});

describe('evaluateLegBClean', () => {
  test('G4 passes at 0.75 gap recall, G5 requires zero invented violations', () => {
    const gates = evaluateLegBClean(0.75, 0);
    expect(gates.every((g) => g.pass)).toBe(true);
  });

  test('G5 fails on any invented violation', () => {
    const gates = evaluateLegBClean(1.0, 1);
    expect(gates.find((g) => g.id === 'G5')!.pass).toBe(false);
  });
});

describe('repetitionPasses / cellPasses', () => {
  test('a repetition passes only when every gate in it passes', () => {
    expect(repetitionPasses(evaluateLegAClean(SCORE, 0.7, 0.7))).toBe(true);
    expect(repetitionPasses(evaluateLegAClean({ ...SCORE, recall: 0.1 }, 0.7, 0.7))).toBe(false);
  });

  test('2 of 3 repetitions passing passes the cell', () => {
    expect(cellPasses([true, true, false])).toBe(true);
    expect(cellPasses([true, false, false])).toBe(false);
  });
});

describe('topLevelPass', () => {
  test('passes only when both clean cells pass', () => {
    expect(topLevelPass({ legAClean: true, legBClean: true })).toBe(true);
    expect(topLevelPass({ legAClean: true, legBClean: false })).toBe(false);
  });
});

describe('memDelta', () => {
  test('reports signed deltas, mem minus clean', () => {
    const mem = { ...SCORE, recall: 0.9, precision: 0.6 };
    const clean = { ...SCORE, recall: 0.7, precision: 0.7 };
    const delta = memDelta(mem, clean);
    expect(delta.deltaRecall).toBeCloseTo(0.2, 5);
    expect(delta.deltaPrecision).toBeCloseTo(-0.1, 5);
  });
});
