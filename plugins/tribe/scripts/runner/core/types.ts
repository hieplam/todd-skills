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

/** §D6/§D5 — the shape of the files a state commit is allowed to touch. Homed in the
 * kernel (not `ports/ports.ts`) because it is used by 2+ modules (`core/loop/commit-guard.ts`'s
 * `toCommitFileList`/`commitState`, and `ports.ts`'s own `PendingCommit`) — lesson L5:
 * anything used by 2+ modules lives in the kernel. Exactly two named, single-purpose fields
 * (never a bare `string[]` a caller could smuggle an arbitrary path into);
 * `core/loop/commit-guard.ts`'s `assertStateOrEscalationPath` additionally asserts every path
 * ends in `.json`/`.md` at runtime. */
export interface StateCommitFiles {
  /** The campaign state JSON path (relative to repoRoot) — always included. */
  statePath: string;
  /** An escalation markdown path (relative to repoRoot) — only present when this commit
   * records an escalation. */
  escalationPath?: string;
}

/** The orchestrator's (`core/loop/`) full config, assembled by `cli/main.ts`'s `parseArgs`
 * from CLI flags. Homed in the kernel (not `core/loop/run-loop.ts`) because every
 * `core/loop/*` module needs it — `phase.ts`, `lock.ts`, and `commit-guard.ts` would
 * otherwise have to import it from the orchestrator's own entry module, a type-only cycle. */
export interface RunLoopConfig {
  /** `--repo` */
  repoRoot: string;
  /** `--state`, relative to repoRoot */
  statePath: string;
  /** `--escalations-dir`, relative to repoRoot */
  escalationsDir: string;
  /** `--answers`, relative to repoRoot */
  answersPath: string;
  /** `--logs-dir` */
  logsDir: string;
  /** `--home` — the campaign's machine-local operational home (spec §4). REQUIRED input;
   * the runner never derives `~/.tribe` itself (wall W1) — its caller injects it. */
  homeDir: string;
  /** Unique per invocation (sessionId-style), generated by the composition root. */
  runId: string;
  /** Raw argv echo, recorded in run.json for the viewer/audit trail. */
  argv: string[];
  /** `--model` */
  model: string;
  /** `--session-timeout`, in ms */
  sessionTimeoutMs?: number;
  /** `--cards` */
  cardsFilter?: string[];
  /** `--max-cards` */
  maxCards?: number;
  /** `--include-escalated` */
  includeEscalated: boolean;
  /** `--dry-run` */
  dryRun: boolean;
  /** `--remote` — the git remote name this repo's PR-target/canonical-upstream actually is.
   * Default `'origin'` (a protocol-level default, spec §2 shape — not a campaign value).
   * Threaded everywhere the runner previously hardcoded the literal string `'origin'`. */
  remote: string;
}

/** `RunLoopConfig` plus everything `core/loop/run-loop.ts`'s `resolveRunContext` loads
 * through the io seam before a pass starts (the base branch, the committed --answers
 * rulings, the committed brief template) — threaded through `core/loop/card-actions.ts` and
 * `core/loop/commit-guard.ts` too, so it lives in the kernel alongside `RunLoopConfig`
 * rather than in any one of those sibling modules. */
export interface ResolvedConfig extends RunLoopConfig {
  baseBranch: string;
  answersContent: string;
  briefTemplate: string;
}

/** Process exit codes — the runner's shared vocabulary, homed in the kernel so leaf modules
 * (report.ts) import them from here, never from the orchestrator (lesson L5: anything used
 * by 2+ modules lives in the kernel). */
export const EXIT_OK = 0;
export const EXIT_LOCKED = 1;
export const EXIT_ESCALATED = 2;
export const EXIT_SESSION_INCOMPLETE = 3;
/** "An unhandled exception surfaced after `runLoop` was entered" — consumed only by run.ts's
 * `main()`; the exit code is a hint, the report is the truth (§O3). */
export const EXIT_ERROR = 4;
