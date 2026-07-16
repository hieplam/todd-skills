// Shared types for the campaign runner (Task 2).

/** D2: a card's lifecycle. `staged` (spec+plan on master, not started) -> `running`
 * (executor session in flight) -> `shipped` | `escalated` (terminal). `blocked` (Task 1,
 * spec §O4/W6) is DERIVED state — never written by a session, only computed fresh by
 * `nextCard` on every call from a card's `dependsOn` and its dependencies' current
 * statuses. A stored `blocked` on disk is a hint from a prior run, never trusted as-is. */
export type CardStatus = 'staged' | 'running' | 'shipped' | 'escalated' | 'blocked';

/** D2 per-card record. Nullable fields are unset until the loop (Task 6) fills them in;
 * `baseSha` is REQUIRED (present, but nullable) because D3's schema guard diffs from it. */
export interface Card {
  status: CardStatus;
  spec: string | null;
  plan: string | null;
  branch: string | null;
  baseSha: string | null;
  pr: number | null;
  mergeSha: string | null;
  sessionId: string | null;
  updatedAt: string | null;
  /** Task 1 (spec §O4): card ids (must all resolve under `cards`) this card must not start
   * before. OPTIONAL and absent by default — no `dependsOn` means independent, exactly
   * today's sequential behavior. Never defaulted to `[]` at the schema layer (see state.ts's
   * `CardSchema`) so an old v1 state file round-trips byte-identical. */
  dependsOn?: string[];
  /** Task 1 (spec §O6/W7): how many auto-answer round-trips this card has been through.
   * OPTIONAL, conceptually defaults to 0 when absent — callers read `card.autoAnswerRounds
   * ?? 0`, never relying on a schema-injected default (same byte-identical reasoning as
   * `dependsOn`). */
  autoAnswerRounds?: number;
}

/** D2 campaign state root. `schemaLockPaths` (D3 point 6) and `ownerOnlyEscalations` (D5)
 * are campaign config carried IN the state file — never hardcoded in this capability. */
export interface CampaignState {
  v: number;
  campaign: string;
  mergePolicy: string;
  sequence: string[];
  /** Paths whose diff from a card's baseSha must stay empty unless that card's plan
   * front-matter declares `allowsSchemaChange: true` (D3 point 6). */
  schemaLockPaths: string[];
  /** Path prefixes that count as "docs-only" for the D6 flake waiver (D3 point 4's
   * `checksGreen` check) — campaign config, never hardcoded (stateless-capability wall). An
   * EMPTY list fails closed: nothing counts as docs-only, so a code diff never auto-waives. */
  docsOnlyPaths: string[];
  /** Trigger names that always escalate to the human owner, regardless of what an
   * executor session claims (D5). */
  ownerOnlyEscalations: string[];
  cards: Record<string, Card>;
}

/** io seam for nextCard's disk checks (D5 PLANNING_NEEDED detection). state.ts never calls
 * `fs` directly — every world-touching check is injected through this. */
export interface StateIO {
  /** The target repo root that `spec`/`plan` paths are resolved against (an input, per
   * spec §2 — never hardcoded). */
  repoRoot: string;
  /** Returns true if the given (already-resolved) path exists on disk. */
  fileExists(resolvedPath: string): boolean;
}

export interface NextCardOptions {
  /** Include `escalated` cards as eligible "next" candidates (`--include-escalated`). */
  includeEscalated?: boolean;
}

/** Every remaining card is shipped (or escalated and excluded). */
export interface NoCardResult {
  kind: 'done';
}

/** D5 trigger: the next eligible card is missing its spec and/or plan on disk. */
export interface PlanningNeededResult {
  kind: 'planning_needed';
  cardId: string;
  missing: Array<'spec' | 'plan'>;
}

export interface CardResult {
  kind: 'card';
  cardId: string;
  card: Card;
}

export type NextCardResult = NoCardResult | PlanningNeededResult | CardResult;
