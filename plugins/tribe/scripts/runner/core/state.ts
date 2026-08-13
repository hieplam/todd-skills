// Campaign state schema, load/serialize, next-card selection (Task 2, spec §D2/§D5).
//
// Pure module: every world-touching operation (reading the state file, checking whether a
// path exists on disk) is injected by the caller — this file never imports `fs`,
// `child_process`, or performs network I/O.
import { join } from 'node:path';
import { z } from 'zod';
import type { Card, CampaignState, NextCardOptions, NextCardResult } from './types.ts';
import type { StateIO } from '../ports/ports.ts';
import { escalationPathOf } from './paths.ts';

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

/** Task 1 (spec §O4): thrown by `parseState` when a card's `dependsOn` names a card id that
 * has no matching entry under `cards` — mirrors `UndefinedSequenceCardError` exactly, one
 * level down (per-card dependency references instead of the top-level sequence). Same
 * rationale: `dependsOn` is `string[]` at the schema level, so zod's structural validation
 * can't catch a dangling id; refuse it loudly at load, never let `nextCard`'s dependency walk
 * silently treat a typo'd id as "not shipped" forever. */
export class UndefinedDependencyCardError extends Error {
  readonly cardId: string;
  readonly dependencyId: string;

  constructor(cardId: string, dependencyId: string) {
    super(
      `Campaign state's card ${JSON.stringify(cardId)} declares dependsOn card id ` +
        `${JSON.stringify(dependencyId)}, which has no entry under cards.`,
    );
    this.name = 'UndefinedDependencyCardError';
    this.cardId = cardId;
    this.dependencyId = dependencyId;
  }
}

/** Task 1 (Warchief ruling): `dependsOn` can express a cycle (`A -> B -> A`, or a direct
 * self-dependency `A -> A`). Left undetected, `nextCard`'s per-card fixpoint walk would never
 * see any member of the cycle as satisfied (none of them ever ships), silently parking every
 * card in the cycle forever with no diagnostic. Detected ONCE at the same load-time boundary
 * as `UndefinedSequenceCardError`/`UndefinedDependencyCardError` — malformed state is refused
 * loudly at load, never discovered card-by-card mid-campaign. */
export class CircularDependencyError extends Error {
  /** The cycle, in visit order, with the repeated id at both ends (e.g. `['A', 'B', 'A']`). */
  readonly path: string[];

  constructor(path: string[]) {
    super(`Campaign state's dependsOn graph contains a cycle: ${path.join(' -> ')}.`);
    this.name = 'CircularDependencyError';
    this.path = path;
  }
}

const CardStatusSchema = z.enum(['staged', 'running', 'shipped', 'escalated', 'blocked']);

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
  // Task 1: both OPTIONAL with no `.default(...)` — a schema-injected default would appear
  // in a re-serialized state file even when the source JSON never had the key, breaking the
  // v1 byte-identical round-trip contract. Callers apply the conceptual default
  // (`autoAnswerRounds ?? 0`, "no dependsOn" == independent) themselves.
  dependsOn: z.array(z.string()).optional(),
  autoAnswerRounds: z.number().optional(),
  // P4 fix-list item: same optional-with-no-default reasoning as `dependsOn`/`autoAnswerRounds`
  // above — only ever present when `shipCard` actually recorded a heal.
  healedResidue: z.array(z.string()).optional(),
});

export const CampaignStateSchema = z.looseObject({
  v: z.number().int(),
  campaign: z.string(),
  mergePolicy: z.string(),
  sequence: z.array(z.string()),
  schemaLockPaths: z.array(z.string()),
  docsOnlyPaths: z.array(z.string()),
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

/** Task 1: extends the same undefined-card validation to `dependsOn` — every id a card
 * declares must resolve to a real entry under `cards`, exactly like `sequence` entries must. */
function assertDependsOnReferentialIntegrity(state: CampaignState): void {
  for (const [cardId, card] of Object.entries(state.cards)) {
    for (const dependencyId of card.dependsOn ?? []) {
      if (!(dependencyId in state.cards)) {
        throw new UndefinedDependencyCardError(cardId, dependencyId);
      }
    }
  }
}

/** Task 1: DFS cycle detection over the `dependsOn` graph, run only after referential
 * integrity has already confirmed every `dependsOn` id resolves to a real card (so this
 * never has to guard against an undefined lookup). Standard "gray/white" DFS: `onStack`
 * tracks the current recursion path; hitting an id already `onStack` means every id from
 * that point in `path` back to the repeat forms the cycle. */
function assertNoDependsOnCycles(state: CampaignState): void {
  const visited = new Set<string>();
  const onStack = new Set<string>();
  const path: string[] = [];

  function visit(cardId: string): void {
    if (onStack.has(cardId)) {
      const cycleStart = path.indexOf(cardId);
      throw new CircularDependencyError([...path.slice(cycleStart), cardId]);
    }
    if (visited.has(cardId)) return;

    visited.add(cardId);
    onStack.add(cardId);
    path.push(cardId);
    for (const dependencyId of state.cards[cardId]?.dependsOn ?? []) {
      visit(dependencyId);
    }
    path.pop();
    onStack.delete(cardId);
  }

  for (const cardId of Object.keys(state.cards)) {
    visit(cardId);
  }
}

/** Validates `raw` (already-parsed JSON) against the D2 schema. Checks the version FIRST,
 * with a dedicated typed error, rather than letting an unknown major version fall through
 * to (or be silently coerced by) the structural zod validation. Then checks that `sequence`
 * and every card's `dependsOn` only name ids `cards` actually defines, and finally that the
 * `dependsOn` graph is acyclic — all at the same load-time boundary, for the same reason. */
export function parseState(raw: unknown): CampaignState {
  assertKnownVersion(raw);
  const state = CampaignStateSchema.parse(raw) as CampaignState;
  assertSequenceReferentialIntegrity(state);
  assertDependsOnReferentialIntegrity(state);
  assertNoDependsOnCycles(state);
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

/** Task 1 (spec §O4, Warchief ruling): computes, to a FIXPOINT over every card in the state
 * (never a single pass, and never limited to `sequence` order), the set of card ids that are
 * currently parked-by-dependency: not `shipped` themselves, but declaring a `dependsOn` on a
 * card that is itself `escalated` or (transitively) blocked this same way.
 *
 * A single pass is wrong: for `A escalated`, `B dependsOn A`, `C dependsOn B`, a card-by-card
 * walk in sequence order `[C, B, A]` would see B as merely "not shipped yet" (not yet marked
 * blocked) when evaluating C, and silently leave C unmarked. Iterating to a fixpoint (repeat
 * until a full pass adds nothing new) makes the result independent of both `cards` object key
 * order and `sequence` order.
 *
 * `blocked` is DERIVED, recomputed fresh on every call — a card's stored `status: 'blocked'`
 * from a previous run is never trusted as an input here; only `escalated` (a real, durable
 * status) and this same function's own growing result set count as "parked". */
function computeBlockedCardIds(cards: CampaignState['cards']): Set<string> {
  const blocked = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;
    for (const [cardId, card] of Object.entries(cards)) {
      if (blocked.has(cardId) || card.status === 'shipped' || card.status === 'escalated') {
        continue;
      }
      const isParkedByDependency = (card.dependsOn ?? []).some((dependencyId) => {
        const dependency = cards[dependencyId];
        return dependency?.status === 'escalated' || blocked.has(dependencyId);
      });
      if (isParkedByDependency) {
        blocked.add(cardId);
        changed = true;
      }
    }
  }

  return blocked;
}

/** Task 1 fix (Warchief audit of the initial `nextCard`): `blocked` is DERIVED, so it must be
 * trued up as an OUTPUT on every call, not merely never trusted as an INPUT. The original
 * implementation only ever SET `card.status = 'blocked'` from inside the sequence walk — a
 * card the walk never reaches (because an earlier, independent card made `nextCard` return
 * first) keeps whatever `status` it already had, stale `blocked` included, even after its
 * parking dependency has since shipped. That stale status is exactly what
 * `persistLocalState`/`serializeState` write to disk, and exactly what Task 3's report reads
 * — an incoherent "blocked, blockedOn: X" report line for a card whose blocker X has shipped.
 *
 * Reconciling the WHOLE state against `blockedCardIds` up front, before the sequence walk
 * even starts, makes the invariant total instead of incidental: every card not currently
 * `shipped`/`escalated` ends this call with `status === 'blocked'` if and only if it is in
 * `blockedCardIds`. Only cards whose status actually needs to change are touched (a v1 state
 * file with no `dependsOn`/`blocked` anywhere computes an empty `blockedCardIds` and finds no
 * card already `status: 'blocked'`, so it reconciles zero cards — the byte-identical
 * round-trip contract is unaffected).
 *
 * Reset target is `staged`, never `running`: only `staged`/`running` cards can ever become
 * blocked (§O4), and `running` is re-derived from gh/git by D4 (`deriveCardPhase`) rather
 * than trusted from the file, so resetting to `staged` is the safe, lossless choice — D4 will
 * re-derive `running` itself if that's still true on the next pass. */
function reconcileBlockedStatuses(
  cards: CampaignState['cards'],
  blockedCardIds: ReadonlySet<string>,
): void {
  for (const [cardId, card] of Object.entries(cards)) {
    const shouldBeBlocked = blockedCardIds.has(cardId);
    if (shouldBeBlocked && card.status !== 'blocked') {
      card.status = 'blocked';
    } else if (!shouldBeBlocked && card.status === 'blocked') {
      card.status = 'staged';
    }
  }
}

/** D5/D2/Task-1 §O4: the first PROGRESSABLE card in `sequence` — not `shipped`, not
 * `escalated` (unless `includeEscalated`, OR — P6 fix-list — its escalation has since been
 * ANSWERED: see below), and (new, Task 1) not `blocked` (a status that is now always
 * up-to-date: `reconcileBlockedStatuses` trues up every card in `state.cards` against
 * `computeBlockedCardIds`'s fixpoint before this walk ever starts — see that function's doc
 * comment for why "set on the way in, but never cleared on the way out" was a bug, not merely
 * an unfinished feature). A card whose `dependsOn` includes a card that is merely
 * unshipped-but-healthy (`staged`/`running`) is skipped with its own status left untouched —
 * it is not `blocked` (its dependency isn't parked), and it may still ship later this same
 * pass, once that dependency ships.
 *
 * P6 fix-list (blocker fix): `card.status === 'escalated'` alone is NOT enough to keep
 * excluding a card once `--include-escalated` is absent. `card.status` is durable — nothing
 * ever resets it away from `'escalated'` except the card itself shipping or re-escalating —
 * while the escalation-answered SIGNAL is the escalation file's presence, exactly the same
 * fact `deriveCardPhase`'s own short-circuit (`core/loop/phase.ts`) already keys on. Before
 * this fix, gating on `card.status` alone meant the orchestrate-campaign skill's ruling
 * ritual (append the ruling to answers.md, archive the escalation file) had ZERO effect on
 * whether a flag-less re-trigger could ever reach this card again — it stayed silently
 * skipped forever, the exact B14 "every re-trigger needs --include-escalated" trap this
 * fix-list entry exists to close. Consulting the file here, the same way `deriveCardPhase`
 * does, makes "answered" (file archived) behave identically to "shipped" for selection
 * purposes without ever needing `includeEscalated` — while a genuinely UNANSWERED escalation
 * (file still present) keeps parking exactly as before.
 *
 * A card with no `dependsOn` (or an empty one) is independent, exactly today's behavior. If
 * the next progressable card's `spec`/`plan` are missing or don't exist on disk (checked via
 * the injected `io.fileExists`, resolved against `io.repoRoot`), returns a `PLANNING_NEEDED`
 * marker instead of the card. */
export function nextCard(
  state: CampaignState,
  io: StateIO,
  options: NextCardOptions = {},
): NextCardResult {
  const includeEscalated = options.includeEscalated ?? false;
  const blockedCardIds = computeBlockedCardIds(state.cards);
  reconcileBlockedStatuses(state.cards, blockedCardIds);

  for (const cardId of state.sequence) {
    const card = state.cards[cardId];
    if (!card) continue;
    if (card.status === 'shipped') continue;
    if (card.status === 'escalated' && !includeEscalated) {
      const escalationPath = escalationPathOf(io.homeDir, cardId);
      if (io.fileExists(escalationPath)) continue; // still unanswered — keep parking.
      // The escalation file is gone (archived by the skill's ruling ritual, or by
      // `shipCard`) — the escalation has been answered; fall through and treat this card as
      // progressable, exactly as `deriveCardPhase` already would for a flag-less re-trigger.
    }
    if (card.status === 'blocked') continue;

    const dependsOn = card.dependsOn ?? [];
    const hasUnmetDependency = dependsOn.some((id) => state.cards[id]?.status !== 'shipped');
    if (hasUnmetDependency) continue;

    const missing = resolveMissing(card, io.repoRoot, io);
    if (missing.length > 0) {
      return { kind: 'planning_needed', cardId, missing };
    }
    return { kind: 'card', cardId, card };
  }

  return { kind: 'done' };
}
