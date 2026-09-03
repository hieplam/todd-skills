import { describe, expect, test } from 'bun:test';
import { isRunRecord, isStateFile, latestRunRecord, selectLiveCard, type StateFile } from './campaign.ts';

describe('isRunRecord', () => {
  test('accepts a well-shaped run.json', () => {
    expect(isRunRecord({ repo: '/r', statePath: '/r/state.json', startedAt: '2026-01-01T00:00:00.000Z' })).toBe(true);
  });

  test('rejects null, non-objects, and missing/mistyped fields', () => {
    expect(isRunRecord(null)).toBe(false);
    expect(isRunRecord('nope')).toBe(false);
    expect(isRunRecord({})).toBe(false);
    expect(isRunRecord({ repo: '/r', statePath: '/r/state.json' })).toBe(false);
    expect(isRunRecord({ repo: 1, statePath: '/r/state.json', startedAt: 'x' })).toBe(false);
  });
});

describe('latestRunRecord', () => {
  test('picks the record with the max startedAt, ignoring malformed entries', () => {
    const runs = [
      { repo: '/r', statePath: '/r/a/state.json', startedAt: '2026-01-01T00:00:00.000Z' },
      null,
      { repo: '/r', statePath: '/r/b/state.json', startedAt: '2026-06-01T00:00:00.000Z' },
      { repo: '/r', statePath: '/r/c/state.json' }, // missing startedAt — malformed
      'garbage',
    ];
    expect(latestRunRecord(runs)).toEqual({ repo: '/r', statePath: '/r/b/state.json', startedAt: '2026-06-01T00:00:00.000Z' });
  });

  test('empty or entirely malformed input yields null', () => {
    expect(latestRunRecord([])).toBeNull();
    expect(latestRunRecord([null, 'x', 1])).toBeNull();
  });
});

describe('isStateFile', () => {
  test('accepts a state file with sequence + cards', () => {
    expect(isStateFile({ sequence: ['T1'], cards: { T1: { status: 'running' } } })).toBe(true);
  });

  test('rejects null and missing/mistyped fields', () => {
    expect(isStateFile(null)).toBe(false);
    expect(isStateFile({ sequence: ['T1'] })).toBe(false);
    expect(isStateFile({ sequence: 'not-an-array', cards: {} })).toBe(false);
    expect(isStateFile({ sequence: [], cards: null })).toBe(false);
  });
});

describe('selectLiveCard', () => {
  function state(sequence: string[], cards: StateFile['cards']): StateFile {
    return { sequence, cards };
  }

  test('picks the newest-in-sequence card whose status is running', () => {
    const s = state(['T1', 'T2', 'T3'], {
      T1: { status: 'merged', sessionId: 's1' },
      T2: { status: 'running', sessionId: 's2' },
      T3: { status: 'staged', sessionId: 's3' },
    });
    expect(selectLiveCard(s)).toEqual({ cardId: 'T2', sessionId: 's2', cardStatus: 'running' });
  });

  test('when multiple cards are running, picks the newest (last) one in sequence order', () => {
    const s = state(['T1', 'T2', 'T3'], {
      T1: { status: 'running', sessionId: 's1' },
      T2: { status: 'running', sessionId: 's2' },
      T3: { status: 'staged', sessionId: 's3' },
    });
    expect(selectLiveCard(s)?.cardId).toBe('T2');
  });

  test('falls back to the LAST card in sequence when none is running — a finished campaign still resolves (Warchief-approved)', () => {
    const s = state(['T1', 'T2', 'T3'], {
      T1: { status: 'merged', sessionId: 's1' },
      T2: { status: 'merged', sessionId: 's2' },
      T3: { status: 'merged', sessionId: 's3' },
    });
    expect(selectLiveCard(s)).toEqual({ cardId: 'T3', sessionId: 's3', cardStatus: 'merged' });
  });

  test('an empty sequence yields null', () => {
    expect(selectLiveCard(state([], {}))).toBeNull();
  });

  test('a selected card with no recorded sessionId yields null (never a throw)', () => {
    const s = state(['T1'], { T1: { status: 'running' } });
    expect(selectLiveCard(s)).toBeNull();
  });

  test('a missing card entry yields null rather than throwing', () => {
    const s = state(['T1'], {});
    expect(selectLiveCard(s)).toBeNull();
  });

  test('cardStatus degrades to "unknown" when the card omits status', () => {
    const s = state(['T1'], { T1: { sessionId: 's1' } });
    expect(selectLiveCard(s)).toEqual({ cardId: 'T1', sessionId: 's1', cardStatus: 'unknown' });
  });
});
