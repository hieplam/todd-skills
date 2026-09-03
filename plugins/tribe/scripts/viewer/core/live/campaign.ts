// core/live/campaign.ts — pure campaign-resolution decisions for the live view (F46).
//
// `serve.ts`'s `resolveCampaignContext` used to interleave three business decisions —
// "is this a run record", "is this a state file", "which card/session does repo+slug
// resolve to" — with the I/O calls that fetch the raw JSON, and none of them were tested. This
// module holds every one of those decisions as a pure function over already-read data; the
// composition root's only remaining job is to fetch bytes, call this, and join paths at the
// edge (`core/**` never imports `node:path` — see `structure.test.ts`).
import { pickLatestByStartedAt } from '../derive.ts';

/** One `runs/<run-id>/run.json` record, exactly as `resolveCampaignContext` needs it — never
 * the runner's validated `RunRecord`; the viewer stays a tolerant reader (spec §7). */
export interface RunRecord {
  repo: string;
  statePath: string;
  startedAt: string;
}

export function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.repo === 'string' && typeof v.statePath === 'string' && typeof v.startedAt === 'string';
}

/** The run with the max `startedAt` across every already-read `runs/<id>/run.json` — same
 * "latest run" identity `core/derive.ts`'s `latestRunOf` uses for the status page (reused via
 * `pickLatestByStartedAt`, not re-derived), so the live link on `/` and the live view it opens
 * always agree on which run they mean. Malformed entries (parse failure, wrong shape) are
 * dropped before picking — they can never win. */
export function latestRunRecord(rawRuns: readonly unknown[]): RunRecord | null {
  return pickLatestByStartedAt(rawRuns.filter(isRunRecord));
}

export interface StateFile {
  sequence: unknown[];
  cards: Record<string, { status?: unknown; sessionId?: unknown } | undefined>;
}

export function isStateFile(value: unknown): value is StateFile {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return Array.isArray(v.sequence) && typeof v.cards === 'object' && v.cards !== null;
}

export interface SelectedCard {
  cardId: string;
  sessionId: string;
  cardStatus: string;
}

/** Resolves which card/session a `state.json` selects for the live view. Picks the
 * newest-in-`sequence` card whose status is `running` (spec §5 step 2); falls back to the LAST
 * card in `sequence` when none is running (e.g. the run already ended) so a finished campaign's
 * live page still resolves to its most recent session rather than 404-ing — this fallback is
 * Warchief-approved and must not change. Any missing piece (empty sequence, no recorded session
 * id on the chosen card) degrades to `null` — the caller turns that into an empty process list
 * / 404, never a throw. */
export function selectLiveCard(state: StateFile): SelectedCard | null {
  const sequence = state.sequence.filter((id): id is string => typeof id === 'string');
  if (sequence.length === 0) return null;

  const runningId = [...sequence].reverse().find((id) => state.cards[id]?.status === 'running');
  const cardId = runningId ?? sequence[sequence.length - 1]!;
  const card = state.cards[cardId];
  const sessionId = card?.sessionId;
  if (typeof sessionId !== 'string') return null;

  return {
    cardId,
    sessionId,
    cardStatus: typeof card?.status === 'string' ? card.status : 'unknown',
  };
}
