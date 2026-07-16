// Campaign state schema, load/serialize, next-card selection (Task 2, spec §D2/§D5).
//
// Pure module: every world-touching operation (reading the state file, checking whether a
// path exists on disk) is injected by the caller — this file never imports `fs`,
// `child_process`, or performs network I/O.
import { join } from 'node:path';
import { z } from 'zod';
import type { Card, CampaignState, NextCardOptions, NextCardResult, StateIO } from './types.ts';

/** The only major version this runner understands today (D2). */
export const CURRENT_STATE_VERSION = 1;

/** Thrown by `parseState`/`loadState` when the state file's `v` field is not a version this
 * runner knows how to read. Never silently parsed as a lower/best-effort version. */
export class UnsupportedStateVersionError extends Error {
  readonly version: unknown;

  constructor(version: unknown) {
    super(
      `Unsupported campaign state version ${JSON.stringify(version)}; this runner supports v${CURRENT_STATE_VERSION}.`,
    );
    this.name = 'UnsupportedStateVersionError';
    this.version = version;
  }
}

/** Thrown by `parseState`/`loadState` when `sequence` names a card id that has no matching
 * entry in `cards` (e.g. a typo in a hand-edited state file). The schema alone can't catch
 * this (`sequence` is `string[]`, `cards` is an open record), so `parseState` checks it
 * explicitly after structural validation. Left unchecked, `nextCard`'s per-card loop would
 * silently skip the dangling id — and report the campaign `done` if it were the last
 * unshipped one, even though that card was never built. */
export class UndefinedSequenceCardError extends Error {
  readonly cardId: string;

  constructor(cardId: string) {
    super(
      `Campaign state's sequence names card id ${JSON.stringify(cardId)}, which has no entry under cards.`,
    );
    this.name = 'UndefinedSequenceCardError';
    this.cardId = cardId;
  }
}

const CardStatusSchema = z.enum(['staged', 'running', 'shipped', 'escalated']);

// `looseObject` (zod v4) keeps unknown keys on the parsed object instead of stripping them
// (the default `z.object()` behavior) — required so a load -> serialize round-trip preserves
// fields this runner doesn't itself know about.
const CardSchema = z.looseObject({
  status: CardStatusSchema,
  spec: z.string().nullable(),
  plan: z.string().nullable(),
  branch: z.string().nullable(),
  baseSha: z.string().nullable(),
  pr: z.number().nullable(),
  mergeSha: z.string().nullable(),
  sessionId: z.string().nullable(),
  updatedAt: z.string().nullable(),
});

export const CampaignStateSchema = z.looseObject({
  v: z.number().int(),
  campaign: z.string(),
  mergePolicy: z.string(),
  sequence: z.array(z.string()),
  schemaLockPaths: z.array(z.string()),
  ownerOnlyEscalations: z.array(z.string()),
  cards: z.record(z.string(), CardSchema),
});

function assertKnownVersion(raw: unknown): void {
  const v = (raw as { v?: unknown } | null | undefined)?.v;
  if (v !== CURRENT_STATE_VERSION) {
    throw new UnsupportedStateVersionError(v);
  }
}

/** D2 requires every `sequence` entry to resolve to a `cards` entry. zod's structural schema
 * can't express that cross-field constraint, so it's checked here, once, at the same load-time
 * boundary as the version check — refusing the malformed state loudly rather than letting
 * `nextCard` discover (or silently skip) it card-by-card mid-campaign. */
function assertSequenceReferentialIntegrity(state: CampaignState): void {
  for (const cardId of state.sequence) {
    if (!(cardId in state.cards)) {
      throw new UndefinedSequenceCardError(cardId);
    }
  }
}

/** Validates `raw` (already-parsed JSON) against the D2 schema. Checks the version FIRST,
 * with a dedicated typed error, rather than letting an unknown major version fall through
 * to (or be silently coerced by) the structural zod validation. Then checks that `sequence`
 * only names ids `cards` actually defines, for the same reason. */
export function parseState(raw: unknown): CampaignState {
  assertKnownVersion(raw);
  const state = CampaignStateSchema.parse(raw) as CampaignState;
  assertSequenceReferentialIntegrity(state);
  return state;
}

/** Loads and validates campaign state through an injected `readFile` seam — this module
 * never touches `fs` itself. `readFile` returns the raw file contents (sync or async). */
export async function loadState(
  readFile: () => string | Promise<string>,
): Promise<CampaignState> {
  const text = await readFile();
  const raw = JSON.parse(text);
  return parseState(raw);
}

/** Serializes state back to the exact JSON shape `loadState` reads, including any unknown
 * fields carried through `parseState`'s loose schemas. */
export function serializeState(state: CampaignState): string {
  return `${JSON.stringify(state, null, 2)}\n`;
}

function resolveMissing(card: Card, repoRoot: string, io: StateIO): Array<'spec' | 'plan'> {
  const missing: Array<'spec' | 'plan'> = [];
  if (!card.spec || !io.fileExists(join(repoRoot, card.spec))) {
    missing.push('spec');
  }
  if (!card.plan || !io.fileExists(join(repoRoot, card.plan))) {
    missing.push('plan');
  }
  return missing;
}

/** D5/D2: the first card in `sequence` whose status is not `shipped` (skipping `escalated`
 * unless `includeEscalated` is set). If that card's `spec`/`plan` are missing or don't
 * exist on disk (checked via the injected `io.fileExists`, resolved against `io.repoRoot`),
 * returns a `PLANNING_NEEDED` marker instead of the card. */
export function nextCard(
  state: CampaignState,
  io: StateIO,
  options: NextCardOptions = {},
): NextCardResult {
  const includeEscalated = options.includeEscalated ?? false;

  for (const cardId of state.sequence) {
    const card = state.cards[cardId];
    if (!card) continue;
    if (card.status === 'shipped') continue;
    if (card.status === 'escalated' && !includeEscalated) continue;

    const missing = resolveMissing(card, io.repoRoot, io);
    if (missing.length > 0) {
      return { kind: 'planning_needed', cardId, missing };
    }
    return { kind: 'card', cardId, card };
  }

  return { kind: 'done' };
}
