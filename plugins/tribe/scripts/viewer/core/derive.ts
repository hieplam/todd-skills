// Pure derivation: CampaignSnapshot -> CampaignStatus (spec §7).
//
// Deliberately does NOT import the runner's `core/state.ts`/`core/report.ts` — those throw on
// malformed input (correct for a writer). The viewer is an observer: it must render *around*
// damage, never crash rendering one campaign because another campaign's state.json is
// half-written. Every JSON.parse here is defensive; a state parse failure degrades to
// `cards: { error }` while everything else on the status still derives (spec §7 rule 2).
import type { CampaignSnapshot, CampaignStatus, CardRow, Liveness } from './model.ts';

/** Picks the item with the latest `startedAt` (ISO8601 strings sort lexicographically in the
 * same timezone representation the runner always writes — `Date.toISOString()`). Generic so
 * this one "latest by startedAt" decision has a single identity shared by every caller that
 * needs it — `latestRunOf` below, and `core/live/campaign.ts`'s live-view campaign resolution
 * (F46) — rather than each re-deriving the same reduce independently. */
export function pickLatestByStartedAt<T extends { startedAt: string }>(items: readonly T[]): T | null {
  return items.reduce<T | null>((best, item) => {
    if (best === null || item.startedAt > best.startedAt) return item;
    return best;
  }, null);
}

/** Picks the run with the latest `startedAt` — the identity `core/live/campaign.ts` (F46)
 * reuses via `pickLatestByStartedAt` for the live view's own "which run is latest" decision. */
function latestRunOf(snapshot: CampaignSnapshot) {
  return pickLatestByStartedAt(snapshot.runs);
}

function deriveLiveness(snapshot: CampaignSnapshot): Liveness {
  const latest = latestRunOf(snapshot);
  if (latest === null) return { kind: 'never_run' };

  if (latest.endedAt === null) {
    // A run.json parse failure could leave `pid` null even with `endedAt === null` — fall
    // back to 0 so this stays a valid (if degenerate) `Liveness` value; the untested edge is
    // covered by `parseError` staying visible via the run list a future task may surface.
    const pid = latest.pid ?? 0;
    return latest.pidAlive
      ? { kind: 'running', pid, startedAt: latest.startedAt, runId: latest.runId }
      : { kind: 'crashed', pid, startedAt: latest.startedAt, runId: latest.runId };
  }

  return {
    kind: 'exited',
    reason: latest.reason ?? 'unknown',
    exitCode: latest.exitCode ?? -1,
    endedAt: latest.endedAt,
    runId: latest.runId,
  };
}

/** Reads `reportRaw`'s per-card `blockedOn` (spec §7 rule 2) — mirrors the runner's
 * `CardReportEntry` shape (`{ outcome: 'blocked'; blockedOn: string }`) by field-checking,
 * never by importing `core/report.ts`'s types. Any parse failure or shape mismatch yields
 * `null` — a report-parse problem never escalates into the `cards: { error }` path (that path
 * is reserved for the state file itself). */
function blockedOnFor(cardId: string, reportRaw: string | null): string | null {
  if (reportRaw === null) return null;
  try {
    const parsed = JSON.parse(reportRaw) as { cards?: Record<string, unknown> };
    const entry = parsed.cards?.[cardId] as { outcome?: unknown; blockedOn?: unknown } | undefined;
    if (entry && entry.outcome === 'blocked' && typeof entry.blockedOn === 'string') {
      return entry.blockedOn;
    }
    return null;
  } catch {
    return null;
  }
}

function deriveCards(snapshot: CampaignSnapshot): CardRow[] | { error: string } {
  if (snapshot.stateRaw === null) return [];

  let parsed: { sequence?: unknown; cards?: unknown };
  try {
    parsed = JSON.parse(snapshot.stateRaw) as { sequence?: unknown; cards?: unknown };
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) };
  }

  const sequence = Array.isArray(parsed.sequence) ? (parsed.sequence as unknown[]) : [];
  const cardsById = (typeof parsed.cards === 'object' && parsed.cards !== null ? parsed.cards : {}) as Record<
    string,
    Record<string, unknown> | undefined
  >;

  return sequence
    .filter((id): id is string => typeof id === 'string')
    .map((id) => {
      const card = cardsById[id] ?? {};
      return {
        id,
        status: typeof card.status === 'string' ? card.status : 'unknown',
        pr: typeof card.pr === 'number' ? card.pr : null,
        updatedAt: typeof card.updatedAt === 'string' ? card.updatedAt : null,
        dependsOn: Array.isArray(card.dependsOn) ? (card.dependsOn.filter((d) => typeof d === 'string') as string[]) : [],
        blockedOn: blockedOnFor(id, snapshot.reportRaw),
      };
    });
}

/** First `**Reason:** ...` match on the escalation markdown's own line (spec §7 rule 3);
 * `.` doesn't cross newlines, so this never swallows the `## Context` section below it. */
function escalationReasonOf(raw: string): string {
  const match = /\*\*Reason:\*\*\s*(.+)/.exec(raw);
  return match ? match[1]!.trim() : '(unparsed)';
}

function derivePendingEscalations(snapshot: CampaignSnapshot): CampaignStatus['pendingEscalations'] {
  return snapshot.escalations.map((e) => ({
    cardId: e.file.replace(/\.md$/, ''),
    reason: escalationReasonOf(e.raw),
    raw: e.raw.slice(0, 2000),
  }));
}

function deriveSessionTail(snapshot: CampaignSnapshot): CampaignStatus['sessionTail'] {
  if (snapshot.newestLog === null) return null;
  const ageSeconds = Math.floor(
    (Date.parse(snapshot.nowIso) - Date.parse(snapshot.newestLog.mtimeIso)) / 1000,
  );
  return {
    file: snapshot.newestLog.file,
    ageSeconds,
    sizeBytes: snapshot.newestLog.sizeBytes,
    lines: snapshot.newestLog.tailLines,
  };
}

export function deriveStatus(snapshot: CampaignSnapshot): CampaignStatus {
  return {
    repoKey: snapshot.repoKey,
    campaignSlug: snapshot.campaignSlug,
    homeDir: snapshot.homeDir,
    liveness: deriveLiveness(snapshot),
    stopRequested: snapshot.stopExists,
    cards: deriveCards(snapshot),
    pendingEscalations: derivePendingEscalations(snapshot),
    reports: snapshot.reports,
    sessionTail: deriveSessionTail(snapshot),
    errors: snapshot.scanErrors,
  };
}

/** Rank for the primary sort key (spec §7 rule 5): running -> crashed -> exited/never_run. */
function livenessRank(liveness: Liveness): number {
  switch (liveness.kind) {
    case 'running':
      return 0;
    case 'crashed':
      return 1;
    default:
      return 2;
  }
}

/** The timestamp used to break ties within a rank ("most recent activity"). `never_run` has
 * none, so it sorts to the lexicographic minimum — always last among its rank-2 peers. */
function recencyOf(status: CampaignStatus): string {
  switch (status.liveness.kind) {
    case 'running':
    case 'crashed':
      return status.liveness.startedAt;
    case 'exited':
      return status.liveness.endedAt;
    default:
      return '';
  }
}

/** Sort comparator for `renderPage` (spec §7 rule 5): running first, then crashed, then
 * exited/never_run — ties within a rank broken by most recent activity (descending). */
export function compareForRender(a: CampaignStatus, b: CampaignStatus): number {
  const rankDelta = livenessRank(a.liveness) - livenessRank(b.liveness);
  if (rankDelta !== 0) return rankDelta;
  return recencyOf(b).localeCompare(recencyOf(a));
}
