// Shared data shapes for the viewer's pure core (spec §7).
//
// The adapter (Task 5) is the ONLY place that touches the filesystem/process table; it fills
// a `CampaignSnapshot` with plain, already-read data. `deriveStatus` (core/derive.ts) and
// `renderPage` (core/render.ts) are pure functions over these shapes — no fs, no clock, no
// process access here. This file is deliberately independent of the runner's `core/types.ts`:
// the viewer must never import the runner's throwing state parser (spec §7 "tolerant reader").

/** One `runs/<run-id>/run.json` record, as read (never the runner's validated `RunRecord`). */
export interface RunView {
  runId: string;
  startedAt: string;
  pid: number | null;
  endedAt: string | null;
  exitCode: number | null;
  reason: string | null;
  /** Adapter probes `process.kill(pid, 0)` only when `endedAt === null`; else always `false`. */
  pidAlive: boolean;
  /** Set when `run.json` was unreadable/unparsable — the run is still listed (spec §7/§9). */
  parseError: string | null;
}

/** Everything the adapter read for one campaign, before any interpretation. */
export interface CampaignSnapshot {
  repoKey: string;
  campaignSlug: string;
  homeDir: string;
  runs: RunView[];
  /** Contents of `statePath` from the LATEST run, or `null` if unreadable/no runs. */
  stateRaw: string | null;
  stopExists: boolean;
  /** Contents of `campaign-report.json` next to the state file, or `null`. */
  reportRaw: string | null;
  escalations: Array<{ file: string; raw: string }>;
  reports: Array<{ cardId: string; sizeBytes: number }>;
  newestLog: { file: string; mtimeIso: string; sizeBytes: number; tailLines: string[] } | null;
  nowIso: string;
  /** Per-campaign read failures, already fault-isolated (spec §9) — the rest still derives. */
  scanErrors: string[];
}

export type Liveness =
  | { kind: 'running'; pid: number; startedAt: string; runId: string }
  | { kind: 'crashed'; pid: number; startedAt: string; runId: string }
  | { kind: 'exited'; reason: string; exitCode: number; endedAt: string; runId: string }
  | { kind: 'never_run' };

export interface CardRow {
  id: string;
  status: string;
  pr: number | null;
  updatedAt: string | null;
  dependsOn: string[];
  blockedOn: string | null;
}

/** The derived, render-ready status for one campaign (`deriveStatus`'s output). */
export interface CampaignStatus {
  repoKey: string;
  campaignSlug: string;
  homeDir: string;
  liveness: Liveness;
  stopRequested: boolean;
  cards: CardRow[] | { error: string };
  pendingEscalations: Array<{ cardId: string; reason: string; raw: string }>;
  reports: Array<{ cardId: string; sizeBytes: number }>;
  sessionTail: { file: string; ageSeconds: number; sizeBytes: number; lines: string[] } | null;
  errors: string[];
}
