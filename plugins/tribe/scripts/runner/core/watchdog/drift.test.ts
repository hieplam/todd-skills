import { describe, expect, test } from 'bun:test';
import { parseBaseBranch, remoteFromPassthrough, selectDriftCards } from './drift.ts';

function stateJson(cards: Record<string, unknown>): string {
  return JSON.stringify({
    v: 1, campaign: 'c', mergePolicy: 'm', sequence: Object.keys(cards),
    schemaLockPaths: [], docsOnlyPaths: [], ownerOnlyEscalations: [], cards,
  });
}

describe('selectDriftCards — spec 2.1: running AND baseSha set', () => {
  test('selects only running cards that carry a baseSha, sorted by id', () => {
    const raw = stateJson({
      b: { status: 'running', baseSha: 'bbb', branch: 'feat/b' },
      a: { status: 'running', baseSha: 'aaa', branch: null },
      staged: { status: 'staged', baseSha: 'ccc', branch: 'feat/c' },
      shipped: { status: 'shipped', baseSha: 'ddd', branch: 'feat/d' },
      noBase: { status: 'running', baseSha: null, branch: 'feat/e' },
      blankBase: { status: 'running', baseSha: '   ', branch: 'feat/f' },
    });
    expect(selectDriftCards(raw)).toEqual({
      cards: [
        { cardId: 'a', baseSha: 'aaa', branch: null },
        { cardId: 'b', baseSha: 'bbb', branch: 'feat/b' },
      ],
      warn: null,
    });
  });

  test('an empty branch string is the same as no branch (overlap unknown)', () => {
    expect(selectDriftCards(stateJson({ a: { status: 'running', baseSha: 'aaa', branch: '' } })).cards)
      .toEqual([{ cardId: 'a', baseSha: 'aaa', branch: null }]);
  });

  test('a missing or unreadable state file selects nothing and warns (W75-10 fail closed)', () => {
    expect(selectDriftCards('')).toEqual({ cards: [], warn: 'campaign-state.json is missing or unreadable' });
  });

  test('invalid JSON selects nothing and warns, never throws', () => {
    expect(selectDriftCards('{ not json')).toEqual({
      cards: [], warn: 'campaign-state.json is not valid JSON',
    });
  });

  test('a state file with no cards object selects nothing and warns', () => {
    expect(selectDriftCards('{"v":1}')).toEqual({
      cards: [], warn: 'campaign-state.json has no cards object',
    });
  });

  test('a valid state with zero running cards is silence, not a warning (G5)', () => {
    expect(selectDriftCards(stateJson({ a: { status: 'staged', baseSha: 'aaa', branch: null } })))
      .toEqual({ cards: [], warn: null });
  });
});

describe('remoteFromPassthrough — W75-9: no new flag, read the runner pass-through', () => {
  test('reads --remote when present, defaults to origin otherwise', () => {
    expect(remoteFromPassthrough(['--cards', 'x', '--remote', 'upstream'])).toBe('upstream');
    expect(remoteFromPassthrough(['--cards', 'x'])).toBe('origin');
    expect(remoteFromPassthrough(['--remote'])).toBe('origin');
  });
});

describe('parseBaseBranch — the remote HEAD parse (duplicated on purpose, see drift.ts)', () => {
  test('strips the remote prefix, falls back to master on any failure', () => {
    expect(parseBaseBranch('origin/master\n', 0, 'origin')).toBe('master');
    expect(parseBaseBranch('upstream/main\n', 0, 'upstream')).toBe('main');
    expect(parseBaseBranch('trunk\n', 0, 'origin')).toBe('trunk');
    expect(parseBaseBranch('', 128, 'origin')).toBe('master');
    expect(parseBaseBranch('   \n', 0, 'origin')).toBe('master');
  });
});
