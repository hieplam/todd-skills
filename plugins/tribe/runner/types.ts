// Shared types for the campaign runner (Task 2).

/** D2: a card's lifecycle. `staged` (spec+plan on master, not started) -> `running`
 * (executor session in flight) -> `shipped` | `escalated` (terminal). */
export type CardStatus = 'staged' | 'running' | 'shipped' | 'escalated';

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
