// gap-precision.ts — precision metric CLI (Task 3, spec §4 "Measurement").
//
// CLI contract:
//   bun gap-precision.ts --registry <path> [--window 20]
//
// Computes the trailing-window precision (and a per-category breakdown of the same ratio) by
// counting registry events — "verify-shipped style: mechanical, zero trust in agent claims"
// (spec §4). Reuses `ledger.ts` (parseLedger/foldToLatestStatus) rather than re-deriving fold
// logic. IO (reading the registry file) lives here, never in ledger.ts.
import { existsSync, readFileSync } from 'node:fs';
import {
  foldToLatestStatus,
  parseLedger,
  type Disposition,
  type GapEvent,
  type OpenedEvent,
  type RuledEvent,
} from './ledger.ts';

/** Spec §4: these three dispositions "thicken the harness" — they count toward BOTH the
 * numerator and the denominator. `dismissed` is a miss (denominator only, via the general
 * `considered` set); `dismissed-duplicate` is excluded from the ratio entirely (spec §4 /
 * §6a: "excluded from both sides"). */
const CREDIT_DISPOSITIONS: ReadonlySet<Disposition> = new Set(['rule', 'anti-rule', 'debt']);

/** Spec §4 output shape: `{window, ruled_considered, precision, per_category}`. `precision` and
 * each `per_category` entry are fractions (e.g. `0.75`), never a claim — a computed metric.
 * `precision` is `null` when `ruled_considered` is 0 (no ruled gaps in scope): a defined,
 * JSON-serializable "no data yet" value, distinct from a misleading `0` (which would read as
 * "0% precision" rather than "nothing measured"). */
export interface PrecisionResult {
  window: number;
  ruled_considered: number;
  precision: number | null;
  per_category: Record<string, number>;
}

/** Computes the trailing-window precision metric from an already-parsed, ledger-ordered event
 * list (spec §4 algorithm, applied in this exact order):
 *
 * 1. Fold to latest status per id; only ids whose latest event is `ruled` (any disposition) are
 *    ever in scope — still-`open`/`seen` ids are pending and never enter the ratio.
 * 2. Take the trailing `window` of those `ruled` events, ordered by their position in the
 *    ledger (the order their `ruled` line appears in the file) — NOT sorted by id, and this
 *    window is taken over ALL dispositions, including `dismissed-duplicate`.
 * 3. Only THEN is `dismissed-duplicate` excluded from the windowed set, on both sides of the
 *    ratio — it does not count as `ruled` at all for this metric, but it does occupy a
 *    trailing-window slot the same as any other `ruled` event, since the window's job is to
 *    track "the last N rulings", not "the last N credit-worthy rulings".
 * 4. Of what remains (`considered`): precision = count(rule ∪ anti-rule ∪ debt) ÷ count(all
 *    considered). `dismissed` counts the denominator only (a "miss").
 * 5. The same ratio, grouped by each considered id's `category` (looked up from its original
 *    `opened` event — categories are frozen there, never on later events).
 */
export function computePrecision(events: readonly GapEvent[], window: number): PrecisionResult {
  const openedById = new Map<string, OpenedEvent>();
  for (const event of events) {
    if (event.event === 'opened') {
      openedById.set(event.id, event);
    }
  }

  const latestById = foldToLatestStatus(events);

  // Every `ruled` line whose id's CURRENT status is that very line, in ledger (file) order.
  // Reference equality is safe here: `foldToLatestStatus` stores the last-seen object per id
  // from this same `events` array, so `latestById.get(event.id) === event` is true for exactly
  // one line per id — the one that is both a `ruled` event AND still the latest for that id.
  const ruledInOrder: RuledEvent[] = [];
  for (const event of events) {
    if (event.event === 'ruled' && latestById.get(event.id) === event) {
      ruledInOrder.push(event);
    }
  }

  const windowed = window > 0 ? ruledInOrder.slice(-window) : [];
  const considered = windowed.filter((e) => e.disposition !== 'dismissed-duplicate');

  const ruledConsidered = considered.length;
  const hits = considered.filter((e) => CREDIT_DISPOSITIONS.has(e.disposition)).length;
  const precision = ruledConsidered === 0 ? null : hits / ruledConsidered;

  const perCategoryTotal = new Map<string, number>();
  const perCategoryHits = new Map<string, number>();
  for (const event of considered) {
    const category = openedById.get(event.id)?.category ?? 'unknown';
    perCategoryTotal.set(category, (perCategoryTotal.get(category) ?? 0) + 1);
    if (CREDIT_DISPOSITIONS.has(event.disposition)) {
      perCategoryHits.set(category, (perCategoryHits.get(category) ?? 0) + 1);
    }
  }
  const perCategory: Record<string, number> = {};
  for (const [category, total] of perCategoryTotal) {
    perCategory[category] = (perCategoryHits.get(category) ?? 0) / total;
  }

  return { window, ruled_considered: ruledConsidered, precision, per_category: perCategory };
}

function parseArgs(argv: readonly string[]): { registry: string; window: number } {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const registry = get('--registry');
  if (!registry) {
    throw new Error('Usage: gap-precision.ts --registry <path> [--window 20]');
  }
  const windowArg = get('--window');
  const window = windowArg !== undefined ? Number(windowArg) : 20;
  return { registry, window };
}

/** CLI entrypoint: parses argv, reads the registry file (missing file = empty registry, same
 * convention as `gap-reconcile.ts`), and prints the spec §4 output object as a single JSON line
 * on stdout. */
export function main(argv: readonly string[] = Bun.argv.slice(2)): void {
  const { registry, window } = parseArgs(argv);
  const registryText = existsSync(registry) ? readFileSync(registry, 'utf8') : '';
  const events = parseLedger(registryText);
  const result = computePrecision(events, window);
  console.log(JSON.stringify(result));
}

if (import.meta.main) {
  main();
}
