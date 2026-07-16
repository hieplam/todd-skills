// Tests for state.ts (Task 2): schema, load/serialize round-trip, version rejection,
// nextCard selection. Fixture values are deliberately neutral (no repo names, no
// campaign-specific values) — the stateless-capability wall.
import { describe, expect, test } from 'bun:test';
import {
  CURRENT_STATE_VERSION,
  UndefinedSequenceCardError,
  UnsupportedStateVersionError,
  loadState,
  parseState,
  serializeState,
  nextCard,
} from './state.ts';
import type { CampaignState, StateIO } from './types.ts';

function fixtureState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    v: 1,
    campaign: 'sample-campaign',
    mergePolicy: 'merge',
    sequence: ['C1', 'C2', 'C3'],
    schemaLockPaths: ['packages/app/src/domain/sample-types.ts'],
    docsOnlyPaths: ['docs/'],
    ownerOnlyEscalations: ['breaking-change'],
    cards: {
      C1: {
        status: 'shipped',
        spec: 'docs/superpowers/specs/2026-01-01-c1-spec.md',
        plan: 'docs/superpowers/plans/2026-01-01-c1-plan.md',
        branch: 'feat/c1-widget',
        baseSha: 'aaaaaaa',
        pr: 10,
        mergeSha: 'bbbbbbb',
        sessionId: 'sess-c1',
        updatedAt: '2026-01-02T00:00:00Z',
      },
      C2: {
        status: 'staged',
        spec: 'docs/superpowers/specs/2026-01-01-c2-spec.md',
        plan: 'docs/superpowers/plans/2026-01-01-c2-plan.md',
        branch: null,
        baseSha: null,
        pr: null,
        mergeSha: null,
        sessionId: null,
        updatedAt: null,
      },
      C3: {
        status: 'staged',
        spec: null,
        plan: null,
        branch: null,
        baseSha: null,
        pr: null,
        mergeSha: null,
        sessionId: null,
        updatedAt: null,
      },
    },
    ...overrides,
  };
}

function io(existingPaths: string[], repoRoot = '/repo'): StateIO {
  const existing = new Set(existingPaths);
  return {
    repoRoot,
    fileExists: (resolvedPath: string) => existing.has(resolvedPath),
  };
}

describe('parseState / serializeState round-trip', () => {
  test('parses a well-formed state and round-trips it byte-for-byte reparseable', () => {
    const raw = fixtureState();
    const state = parseState(raw);
    expect(state.v).toBe(CURRENT_STATE_VERSION);
    expect(state.campaign).toBe('sample-campaign');
    expect(state.sequence).toEqual(['C1', 'C2', 'C3']);
    expect(state.schemaLockPaths).toEqual(['packages/app/src/domain/sample-types.ts']);
    expect(state.docsOnlyPaths).toEqual(['docs/']);
    expect(state.ownerOnlyEscalations).toEqual(['breaking-change']);
    expect(state.cards.C1?.status).toBe('shipped');

    const serialized = serializeState(state);
    const reparsed = parseState(JSON.parse(serialized));
    expect(reparsed).toEqual(state);
  });

  test('preserves unknown top-level and per-card fields across a load -> serialize cycle', async () => {
    const raw = fixtureState({ note: 'unknown-top-level-field' });
    (raw.cards as Record<string, Record<string, unknown>>).C2.reviewer = 'unknown-per-card-field';

    const loaded = await loadState(() => JSON.stringify(raw));
    // Unknown fields must survive parsing, not be stripped by the schema.
    expect((loaded as unknown as Record<string, unknown>).note).toBe('unknown-top-level-field');
    expect((loaded.cards.C2 as unknown as Record<string, unknown>).reviewer).toBe(
      'unknown-per-card-field',
    );

    const serialized = serializeState(loaded);
    const reparsed = JSON.parse(serialized);
    expect(reparsed.note).toBe('unknown-top-level-field');
    expect(reparsed.cards.C2.reviewer).toBe('unknown-per-card-field');
  });

  test('loadState reads through the injected readFile seam only (no fs)', async () => {
    const raw = fixtureState();
    let calls = 0;
    const state = await loadState(() => {
      calls += 1;
      return JSON.stringify(raw);
    });
    expect(calls).toBe(1);
    expect(state.campaign).toBe('sample-campaign');
  });
});

describe('version rejection', () => {
  test('rejects an unknown major version with a typed error, not a silent parse', () => {
    const raw = fixtureState({ v: 2 });
    expect(() => parseState(raw)).toThrow(UnsupportedStateVersionError);
  });

  test('rejects a missing version field', () => {
    const raw = fixtureState();
    delete (raw as Record<string, unknown>).v;
    expect(() => parseState(raw)).toThrow(UnsupportedStateVersionError);
  });
});

describe('sequence/cards referential integrity', () => {
  test('rejects a sequence entry naming a card id absent from cards, instead of letting it be silently skipped as done', () => {
    // A hand-edited state file with a typo'd sequence id ('C4' has no entry under `cards`).
    // Before this check existed, parseState accepted this, and nextCard's `if (!card)
    // continue;` silently skipped C4 — if C4 were the only unshipped id, the campaign loop
    // would report `{ kind: 'done' }` even though C4 was never built.
    const raw = fixtureState({ sequence: ['C1', 'C2', 'C4'] });
    expect(() => parseState(raw)).toThrow(UndefinedSequenceCardError);
  });
});

describe('nextCard', () => {
  test('returns the first non-shipped card in sequence order when spec/plan exist on disk', () => {
    const state = parseState(fixtureState()) as CampaignState;
    const result = nextCard(
      state,
      io([
        '/repo/docs/superpowers/specs/2026-01-01-c2-spec.md',
        '/repo/docs/superpowers/plans/2026-01-01-c2-plan.md',
      ]),
    );
    expect(result).toEqual({ kind: 'card', cardId: 'C2', card: state.cards.C2 });
  });

  test('skips escalated cards by default', () => {
    const state = parseState(
      fixtureState({
        cards: {
          ...fixtureState().cards as Record<string, unknown>,
          C2: {
            status: 'escalated',
            spec: 'docs/superpowers/specs/2026-01-01-c2-spec.md',
            plan: 'docs/superpowers/plans/2026-01-01-c2-plan.md',
            branch: null,
            baseSha: null,
            pr: null,
            mergeSha: null,
            sessionId: null,
            updatedAt: null,
          },
        },
      }),
    ) as CampaignState;

    const fakeIo = io([
      '/repo/docs/superpowers/specs/2026-01-01-c2-spec.md',
      '/repo/docs/superpowers/plans/2026-01-01-c2-plan.md',
    ]);

    const skipped = nextCard(state, fakeIo);
    expect(skipped.kind).toBe('planning_needed'); // C3 has no spec/plan on disk
    expect((skipped as { cardId: string }).cardId).toBe('C3');

    const included = nextCard(state, fakeIo, { includeEscalated: true });
    expect(included).toEqual({ kind: 'card', cardId: 'C2', card: state.cards.C2 });
  });

  test('returns PLANNING_NEEDED when the next card has no spec/plan recorded', () => {
    const state = parseState(fixtureState()) as CampaignState;
    // C2's spec/plan exist on disk in this io, but skip it to reach C3 by marking it shipped.
    const shippedC2 = {
      ...(fixtureState().cards as Record<string, Record<string, unknown>>).C2,
      status: 'shipped',
    };
    const withC2Shipped = parseState(
      fixtureState({
        cards: { ...(fixtureState().cards as Record<string, unknown>), C2: shippedC2 },
      }),
    ) as CampaignState;

    const result = nextCard(withC2Shipped, io([]));
    expect(result).toEqual({ kind: 'planning_needed', cardId: 'C3', missing: ['spec', 'plan'] });
  });

  test('returns PLANNING_NEEDED when spec/plan are recorded but missing on disk', () => {
    const state = parseState(fixtureState()) as CampaignState;
    const result = nextCard(state, io([])); // nothing exists on disk
    expect(result).toEqual({ kind: 'planning_needed', cardId: 'C2', missing: ['spec', 'plan'] });
  });

  test('returns done when every card is shipped or escalated-and-excluded', () => {
    const allShipped = parseState(
      fixtureState({
        cards: Object.fromEntries(
          Object.entries(fixtureState().cards as Record<string, Record<string, unknown>>).map(
            ([id, card]) => [id, { ...card, status: 'shipped' }],
          ),
        ),
      }),
    ) as CampaignState;

    expect(nextCard(allShipped, io([]))).toEqual({ kind: 'done' });
  });
});
