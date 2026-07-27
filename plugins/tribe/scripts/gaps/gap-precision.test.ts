// gap-precision.test.ts — spec §4 measurement + §6a coverage list: open/seen ids never enter the
// ratio, all five dispositions handled correctly, `dismissed-duplicate` excluded from both sides,
// trailing-window cut, per-category output.
//
// `computePrecision` is tested directly against typed `GapEvent[]` fixtures (pure function, no
// file IO) — the same convention `gap-reconcile.test.ts` uses for `reconcile()`: file/CLI
// plumbing (`parseArgs`, `main`) is a thin, untested wrapper around the tested core function.
import { describe, expect, test } from 'bun:test';
import { computePrecision } from './gap-precision.ts';
import type { Disposition, GapEvent, OpenedEvent, RuledEvent, SeenEvent } from './ledger.ts';

function opened(id: string, category: string): OpenedEvent {
  return {
    id,
    event: 'opened',
    category,
    paths: [`src/${category}/`],
    fingerprint: `grep -rn 'x' src/${category}/`,
    hits_at_detection: 3,
    first_seen_pr: 1,
  };
}

function ruled(id: string, disposition: Disposition): RuledEvent {
  return { id, event: 'ruled', disposition, ref: `ref-${id}` };
}

function seen(id: string, pr: number): SeenEvent {
  return { id, event: 'seen', pr, hits_now: 5 };
}

describe('computePrecision — open/seen ids never enter the ratio', () => {
  test('an id whose latest event is `opened` is excluded entirely', () => {
    const events: GapEvent[] = [opened('G-001', 'error-handling')];
    const result = computePrecision(events, 20);
    expect(result.ruled_considered).toBe(0);
    expect(result.precision).toBeNull();
    expect(result.per_category).toEqual({});
  });

  test('an id whose latest event is `seen` is excluded entirely (pending, not yet ruled)', () => {
    const events: GapEvent[] = [opened('G-001', 'error-handling'), seen('G-001', 2)];
    const result = computePrecision(events, 20);
    expect(result.ruled_considered).toBe(0);
    expect(result.precision).toBeNull();
  });

  test('open/seen ids are excluded even alongside ruled ids that DO enter the ratio', () => {
    const events: GapEvent[] = [
      opened('G-001', 'error-handling'),
      seen('G-001', 2), // still pending — never counted
      opened('G-002', 'error-handling'),
      ruled('G-002', 'rule'),
    ];
    const result = computePrecision(events, 20);
    expect(result.ruled_considered).toBe(1); // only G-002
    expect(result.precision).toBe(1);
  });
});

describe('computePrecision — all five dispositions', () => {
  test('rule/anti-rule/debt count toward numerator+denominator; dismissed counts denominator only; dismissed-duplicate is excluded from both', () => {
    const events: GapEvent[] = [
      opened('G-001', 'error-handling'),
      ruled('G-001', 'rule'),
      opened('G-002', 'error-handling'),
      ruled('G-002', 'anti-rule'),
      opened('G-003', 'error-handling'),
      ruled('G-003', 'debt'),
      opened('G-004', 'error-handling'),
      ruled('G-004', 'dismissed'),
      opened('G-005', 'error-handling'),
      ruled('G-005', 'dismissed-duplicate'),
    ];

    const result = computePrecision(events, 20);

    // dismissed-duplicate (G-005) never enters the ratio at all: denominator is 4, not 5.
    expect(result.ruled_considered).toBe(4);
    // numerator: rule + anti-rule + debt = 3; dismissed is a "miss" (denominator only).
    expect(result.precision).toBe(3 / 4);
  });
});

describe('computePrecision — trailing window cut', () => {
  test('window smaller than total ruled ids only considers the last N ruled events, in ledger (file) order — not sorted by id', () => {
    // Deliberately out-of-numeric-order file positions: G-003's ruled event is written BEFORE
    // G-001's and G-002's, so "trailing" must mean "last by file position", not "highest id".
    const events: GapEvent[] = [
      opened('G-003', 'error-handling'),
      ruled('G-003', 'dismissed'), // oldest by file position — must be dropped by window=2
      opened('G-001', 'error-handling'),
      ruled('G-001', 'rule'),
      opened('G-002', 'error-handling'),
      ruled('G-002', 'anti-rule'),
    ];

    const result = computePrecision(events, 2);

    // Only the last 2 ruled events (G-001, G-002) are considered; G-003's dismissal is dropped.
    expect(result.ruled_considered).toBe(2);
    expect(result.precision).toBe(1); // both counted entries are rule/anti-rule
  });

  test('window is applied to ALL ruled dispositions first, then dismissed-duplicate is excluded from within that window (spec §4 step order)', () => {
    // Three ruled events in file order: rule, dismissed-duplicate, debt. window=2 takes the
    // trailing 2 ruled events (dismissed-duplicate, debt) BEFORE excluding dismissed-duplicate —
    // so only the debt entry survives into `considered`, giving ruled_considered=1, not 2.
    const events: GapEvent[] = [
      opened('G-001', 'error-handling'),
      ruled('G-001', 'rule'),
      opened('G-002', 'error-handling'),
      ruled('G-002', 'dismissed-duplicate'),
      opened('G-003', 'error-handling'),
      ruled('G-003', 'debt'),
    ];

    const result = computePrecision(events, 2);

    expect(result.ruled_considered).toBe(1); // window(2) = [G-002, G-003] minus dismissed-duplicate = [G-003]
    expect(result.precision).toBe(1);
  });

  test('window larger than the number of ruled gaps considers all of them', () => {
    const events: GapEvent[] = [
      opened('G-001', 'error-handling'),
      ruled('G-001', 'rule'),
      opened('G-002', 'error-handling'),
      ruled('G-002', 'dismissed'),
    ];

    const result = computePrecision(events, 20);

    expect(result.ruled_considered).toBe(2);
    expect(result.precision).toBe(0.5);
  });
});

describe('computePrecision — per-category output', () => {
  test('breaks down the same ratio grouped by each ruled id\'s original `opened` category', () => {
    const events: GapEvent[] = [
      opened('G-001', 'error-handling'),
      ruled('G-001', 'rule'),
      opened('G-002', 'error-handling'),
      ruled('G-002', 'dismissed'),
      opened('G-003', 'concurrency'),
      ruled('G-003', 'anti-rule'),
    ];

    const result = computePrecision(events, 20);

    expect(result.ruled_considered).toBe(3);
    expect(result.precision).toBe(2 / 3);
    expect(result.per_category).toEqual({
      'error-handling': 0.5, // 1 hit (rule) / 2 considered (rule, dismissed)
      concurrency: 1, // 1 hit (anti-rule) / 1 considered
    });
  });

  test('a category with only dismissed-duplicate rulings never appears in per_category (excluded from both sides)', () => {
    const events: GapEvent[] = [
      opened('G-001', 'error-handling'),
      ruled('G-001', 'dismissed-duplicate'),
      opened('G-002', 'concurrency'),
      ruled('G-002', 'rule'),
    ];

    const result = computePrecision(events, 20);

    expect(result.per_category).toEqual({ concurrency: 1 });
    expect(Object.keys(result.per_category)).not.toContain('error-handling');
  });
});

describe('computePrecision — edge case: no considered ruled ids', () => {
  test('empty registry (no events at all) -> ruled_considered 0, precision null, empty per_category', () => {
    const result = computePrecision([], 20);
    expect(result).toEqual({ window: 20, ruled_considered: 0, precision: null, per_category: {} });
  });

  test('all ruled ids are dismissed-duplicate -> same defined-empty output, not NaN/undefined', () => {
    const events: GapEvent[] = [
      opened('G-001', 'error-handling'),
      ruled('G-001', 'dismissed-duplicate'),
    ];

    const result = computePrecision(events, 20);

    expect(result.ruled_considered).toBe(0);
    expect(result.precision).toBeNull();
    expect(result.per_category).toEqual({});
  });
});

describe('computePrecision — window field echoes the input', () => {
  test('output carries the window value used (default 20 passed explicitly here, and a custom value)', () => {
    expect(computePrecision([], 20).window).toBe(20);
    expect(computePrecision([], 5).window).toBe(5);
  });
});
