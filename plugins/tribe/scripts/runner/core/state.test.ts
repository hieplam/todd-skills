// Tests for state.ts (Task 2): schema, load/serialize round-trip, version rejection,
// nextCard selection. Fixture values are deliberately neutral (no repo names, no
// campaign-specific values) — the stateless-capability wall.
import { describe, expect, test } from 'bun:test';
import {
  CURRENT_STATE_VERSION,
  CircularDependencyError,
  UndefinedDependencyCardError,
  UndefinedSequenceCardError,
  UnsupportedStateVersionError,
  loadState,
  parseState,
  serializeState,
  nextCard,
} from './state.ts';
import type { Card, CampaignState, StateIO } from './types.ts';

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

/** A minimal, fully-formed card (all D2 fields present) for tests that only care about
 * `status`/`dependsOn` — avoids repeating every nullable field at every call site. */
function cardFixture(overrides: Partial<Card> = {}): Card {
  return {
    status: 'staged',
    spec: 'docs/superpowers/specs/2026-01-01-x-spec.md',
    plan: 'docs/superpowers/plans/2026-01-01-x-plan.md',
    branch: null,
    baseSha: null,
    pr: null,
    mergeSha: null,
    sessionId: null,
    updatedAt: null,
    ...overrides,
  };
}

/** An `io` that reports every card's recorded spec/plan as present on disk, so `nextCard`
 * tests below exercise only the dependsOn/blocked logic, never the PLANNING_NEEDED path. */
function allFilesExistIo(repoRoot = '/repo'): StateIO {
  return { repoRoot, fileExists: () => true };
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

describe('dependsOn / blocked / autoAnswerRounds — schema (Task 1)', () => {
  test('accepts an optional dependsOn array and autoAnswerRounds on a card, and the new `blocked` status', () => {
    const raw = fixtureState({
      cards: {
        ...(fixtureState().cards as Record<string, unknown>),
        C2: { ...cardFixture({ status: 'blocked' }), dependsOn: ['C1'], autoAnswerRounds: 1 },
      },
    });
    const state = parseState(raw) as CampaignState;
    expect(state.cards.C2?.status).toBe('blocked');
    expect(state.cards.C2?.dependsOn).toEqual(['C1']);
    expect(state.cards.C2?.autoAnswerRounds).toBe(1);
  });

  test('rejects a dependsOn entry naming a card id absent from cards', () => {
    const raw = fixtureState({
      cards: {
        ...(fixtureState().cards as Record<string, unknown>),
        C2: { ...cardFixture(), dependsOn: ['does-not-exist'] },
      },
    });
    expect(() => parseState(raw)).toThrow(UndefinedDependencyCardError);
  });

  test('rejects a direct self-dependency as a circular dependency', () => {
    const raw = fixtureState({
      cards: {
        ...(fixtureState().cards as Record<string, unknown>),
        C2: { ...cardFixture(), dependsOn: ['C2'] },
      },
    });
    expect(() => parseState(raw)).toThrow(CircularDependencyError);
  });

  test('rejects a transitive cycle (A -> B -> A), naming the cycle path', () => {
    const raw = fixtureState({
      cards: {
        C1: { ...cardFixture(), dependsOn: ['C2'] },
        C2: { ...cardFixture(), dependsOn: ['C1'] },
        C3: cardFixture(),
      },
    });
    let caught: unknown;
    try {
      parseState(raw);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(CircularDependencyError);
    expect((caught as CircularDependencyError).path).toEqual(['C1', 'C2', 'C1']);
  });

  test('a pre-existing v1 state file with none of the new fields round-trips byte-identical', async () => {
    // No card anywhere declares dependsOn/autoAnswerRounds, and no status is "blocked" — this
    // is exactly what an old (pre-Task-1) campaign-state.json looks like on disk.
    const raw = fixtureState();
    const originalBytes = `${JSON.stringify(raw, null, 2)}\n`;

    const loaded = await loadState(() => originalBytes);
    expect(loaded.cards.C2?.dependsOn).toBeUndefined();
    expect(loaded.cards.C2?.autoAnswerRounds).toBeUndefined();

    const serialized = serializeState(loaded);
    expect(serialized).toBe(originalBytes);
  });
});

describe('nextCard — progressable rule (dependsOn / blocked, spec §O4/W6, Task 1)', () => {
  test('no dependsOn on a card ⇒ independent, unchanged behavior', () => {
    const raw = fixtureState({
      sequence: ['A'],
      cards: { A: cardFixture() },
    });
    const state = parseState(raw) as CampaignState;
    expect(nextCard(state, allFilesExistIo())).toEqual({ kind: 'card', cardId: 'A', card: state.cards.A });
  });

  test('an empty dependsOn array behaves the same as no dependsOn ⇒ independent', () => {
    const raw = fixtureState({
      sequence: ['A'],
      cards: { A: { ...cardFixture(), dependsOn: [] } },
    });
    const state = parseState(raw) as CampaignState;
    expect(nextCard(state, allFilesExistIo())).toEqual({ kind: 'card', cardId: 'A', card: state.cards.A });
  });

  test('a merely-unshipped-but-healthy dependency (staged) skips the dependent WITHOUT marking it blocked', () => {
    const raw = fixtureState({
      sequence: ['B', 'A'],
      cards: {
        A: cardFixture({ status: 'staged' }),
        B: { ...cardFixture(), dependsOn: ['A'] },
      },
    });
    const state = parseState(raw) as CampaignState;
    // B is skipped (A hasn't shipped yet); A is the progressable card. B's own status must be
    // left completely alone — it may still ship later THIS SAME pass once A ships.
    const result = nextCard(state, allFilesExistIo());
    expect(result).toEqual({ kind: 'card', cardId: 'A', card: state.cards.A });
    expect(state.cards.B?.status).toBe('staged');
  });

  test('a running (not yet shipped) dependency also merely skips the dependent, not blocks it', () => {
    // A is deliberately NOT in `sequence` (it's mid-flight, being resumed elsewhere) — this
    // isolates "B's only unmet dependency is running" from "A itself is also a candidate".
    const raw = fixtureState({
      sequence: ['B'],
      cards: {
        A: cardFixture({ status: 'running' }),
        B: { ...cardFixture(), dependsOn: ['A'] },
      },
    });
    const state = parseState(raw) as CampaignState;
    const result = nextCard(state, allFilesExistIo());
    expect(result).toEqual({ kind: 'done' });
    expect(state.cards.B?.status).toBe('staged');
  });

  test('an escalated dependency marks the dependent blocked (W6) — the dependent never starts', () => {
    const raw = fixtureState({
      sequence: ['B', 'A'],
      cards: {
        A: cardFixture({ status: 'escalated' }),
        B: { ...cardFixture(), dependsOn: ['A'] },
      },
    });
    const state = parseState(raw) as CampaignState;
    const result = nextCard(state, allFilesExistIo());
    expect(result).toEqual({ kind: 'done' }); // A is escalated+excluded, B is blocked: nothing progressable
    expect(state.cards.B?.status).toBe('blocked');
  });

  test('an already-blocked dependency also blocks its dependent (direct block propagation)', () => {
    const raw = fixtureState({
      sequence: ['C', 'B', 'A'],
      cards: {
        A: cardFixture({ status: 'escalated' }),
        B: { ...cardFixture({ status: 'blocked' }), dependsOn: ['A'] },
        C: { ...cardFixture(), dependsOn: ['B'] },
      },
    });
    const state = parseState(raw) as CampaignState;
    const result = nextCard(state, allFilesExistIo());
    expect(result).toEqual({ kind: 'done' });
    expect(state.cards.B?.status).toBe('blocked');
    expect(state.cards.C?.status).toBe('blocked');
  });

  test('unblocks when re-evaluated after the dependency has since shipped (blocked is recomputed, never trusted from disk)', () => {
    const raw = fixtureState({
      sequence: ['B', 'A'],
      cards: {
        A: cardFixture({ status: 'shipped' }),
        // B's status is stale 'blocked' from a previous run, but A has since shipped.
        B: { ...cardFixture({ status: 'blocked' }), dependsOn: ['A'] },
      },
    });
    const state = parseState(raw) as CampaignState;
    const result = nextCard(state, allFilesExistIo());
    expect(result).toEqual({ kind: 'card', cardId: 'B', card: state.cards.B });
  });

  // Warchief audit fix (task-1 reopened): `nextCard` was SETTING `blocked` but never
  // CLEARING a stale one for a card the sequence walk's early return never reaches — the
  // stored status disagreed with the derived truth, and that wrong status is exactly what
  // gets persisted and what Task 3's report would render. These two tests assert the
  // `.status` field directly (not merely object-reference equality via `state.cards.X`,
  // which the test above doesn't actually prove anything about the VALUE of `.status`).
  test('reconciles a stale blocked status back to staged once its dependency has shipped, even when an earlier card in sequence makes nextCard return before ever visiting it (Warchief audit probe)', () => {
    const raw = fixtureState({
      sequence: ['C', 'B'],
      cards: {
        A: cardFixture({ status: 'shipped' }),
        B: { ...cardFixture({ status: 'blocked' }), dependsOn: ['A'] },
        C: cardFixture({ status: 'staged' }), // independent; nextCard returns C immediately
      },
    });
    const state = parseState(raw) as CampaignState;
    const result = nextCard(state, allFilesExistIo());

    expect(result).toEqual({ kind: 'card', cardId: 'C', card: state.cards.C });
    // The defect: B is never visited by the sequence walk (C is returned first), but its
    // dependency A has shipped — B must no longer read `blocked` once reality has moved on.
    expect(state.cards.B?.status).toBe('staged');

    // And the corrected status must actually be what gets persisted, not just what's held
    // in memory — the report (Task 3) reads the state file, not this in-memory object.
    const serialized = serializeState(state);
    expect(JSON.parse(serialized).cards.B.status).toBe('staged');
  });

  test('reconciliation is TOTAL, not walk-order dependent: a card that newly becomes blocked is marked even when an earlier independent card makes nextCard return before the walk ever reaches it', () => {
    const raw = fixtureState({
      sequence: ['D', 'X', 'Y'],
      cards: {
        D: cardFixture({ status: 'staged' }), // independent; nextCard returns D immediately
        X: { ...cardFixture({ status: 'staged' }), dependsOn: ['Y'] },
        Y: cardFixture({ status: 'escalated' }),
      },
    });
    const state = parseState(raw) as CampaignState;
    const result = nextCard(state, allFilesExistIo());

    expect(result).toEqual({ kind: 'card', cardId: 'D', card: state.cards.D });
    // X is never visited by the sequence walk (D is returned first), but its dependency Y is
    // escalated — X must be marked blocked regardless, so Task 3's report is coherent.
    expect(state.cards.X?.status).toBe('blocked');
  });

  test('a dependency with two deps, one shipped one merely staged, still only skips (not blocks)', () => {
    const raw = fixtureState({
      sequence: ['C', 'A', 'B'],
      cards: {
        A: cardFixture({ status: 'shipped' }),
        B: cardFixture({ status: 'staged' }),
        C: { ...cardFixture(), dependsOn: ['A', 'B'] },
      },
    });
    const state = parseState(raw) as CampaignState;
    const result = nextCard(state, allFilesExistIo());
    expect(result).toEqual({ kind: 'card', cardId: 'B', card: state.cards.B });
    expect(state.cards.C?.status).toBe('staged');
  });

  test('a dependency with two deps, one shipped one escalated, gets blocked', () => {
    const raw = fixtureState({
      sequence: ['C', 'A', 'B'],
      cards: {
        A: cardFixture({ status: 'shipped' }),
        B: cardFixture({ status: 'escalated' }),
        C: { ...cardFixture(), dependsOn: ['A', 'B'] },
      },
    });
    const state = parseState(raw) as CampaignState;
    const result = nextCard(state, allFilesExistIo());
    expect(result).toEqual({ kind: 'done' });
    expect(state.cards.C?.status).toBe('blocked');
  });

  test('transitive blocked cascade computes to a fixpoint REGARDLESS of sequence order: A escalated -> B blocked -> C blocked, sequence deliberately worst-case [C, B, A]', () => {
    const raw = fixtureState({
      sequence: ['C', 'B', 'A'],
      cards: {
        A: cardFixture({ status: 'escalated' }),
        B: { ...cardFixture(), dependsOn: ['A'] },
        C: { ...cardFixture(), dependsOn: ['B'] },
      },
    });
    const state = parseState(raw) as CampaignState;
    const result = nextCard(state, allFilesExistIo());
    expect(result).toEqual({ kind: 'done' });
    expect(state.cards.B?.status).toBe('blocked');
    expect(state.cards.C?.status).toBe('blocked');
  });

  test('an independent card (no dependsOn) still ships amid an unrelated blocked cascade', () => {
    const raw = fixtureState({
      sequence: ['C', 'B', 'A', 'D'],
      cards: {
        A: cardFixture({ status: 'escalated' }),
        B: { ...cardFixture(), dependsOn: ['A'] },
        C: { ...cardFixture(), dependsOn: ['B'] },
        D: cardFixture(), // no dependsOn: independent, unaffected by the A/B/C chain
      },
    });
    const state = parseState(raw) as CampaignState;
    const result = nextCard(state, allFilesExistIo());
    expect(result).toEqual({ kind: 'card', cardId: 'D', card: state.cards.D });
  });
});
