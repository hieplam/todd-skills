// ---------------------------------------------------------------------------------------
// Campaign watchdog (card i74, spec docs/superpowers/specs/2026-09-02-mechanical-heartbeat-design.md).
// The watchdog's own vocabulary. It deliberately does NOT live in core/types.ts: that file is
// one of this campaign's schemaLockPaths, and nothing in ports/ports.ts needs these types
// (every WatchdogIO member is primitive-typed, or uses LockInfo/RunnerHandle, both declared in
// ports/ports.ts itself). Like core/types.ts, this module imports nothing local.
// ---------------------------------------------------------------------------------------

export const WATCHDOG_EXIT_DONE = 0;
export const WATCHDOG_EXIT_USAGE = 1;
export const WATCHDOG_EXIT_NEEDS_HUMAN = 10;
export const WATCHDOG_EXIT_RUNNING = 11;

export type WatchdogMode = 'once' | 'follow';

export interface WatchdogConfig {
  repoRoot: string;
  model: string;
  /** Exactly as typed on the command line — relative or absolute. Resolved and contained by
   * `core/watchdog/args.ts`'s `resolveHomeArg`/`containHome` at the edge (Task 2). */
  rawHome: string;
  mode: WatchdogMode;
  stallMinutes: number;
  maxQuotaWaits: number;
  maxOverloadBackoffs: number;
  maxCrashRelaunches: number;
  quotaGraceSeconds: number;
  pollSeconds: number;
  fallbackModel: string | null;
  /** The runner's own optional flags, forwarded verbatim in argv order. */
  passthrough: string[];
}

export interface WatchdogCounters {
  quotaWaits: number;
  overloadBackoffs: number;
  crashRelaunches: number;
  lockRelaunches: number;
  fallbackUsed: boolean;
}

export interface WatchdogLimits {
  stallMinutes: number;
  maxQuotaWaits: number;
  maxOverloadBackoffs: number;
  maxCrashRelaunches: number;
  quotaGraceSeconds: number;
}

/** One observed runner pass — from a child the watchdog owns, or from an adopted run.json. */
export interface WatchdogRunObservation {
  runId: string;
  runnerPid: number | null;
  alive: boolean;
  endedAt: string | null;
  newestLogPath: string | null;
  newestLogMtimeMs: number | null;
}

export interface WatchdogObservation {
  nowMs: number;
  mode: WatchdogMode;
  stopFilePresent: boolean;
  lockHolder: { pid: number; alive: boolean } | null;
  run: WatchdogRunObservation | null;
  /** W-P6: the child's real status when owned, else the finalized run.json exitCode. */
  lastExitCode: number | null;
  /** Run present, not alive, run.json never finalized — a crash with no code to read. */
  crashSuspected: boolean;
  /** W-P2: already validated as a FUTURE reset by the edge's clock-free parser + decide(). */
  quota: { resetsAtEpochS: number } | null;
  overload: { apiErrorStatus: number } | null;
  counters: WatchdogCounters;
  limits: WatchdogLimits;
  fallbackModel: string | null;
}

export type WatchdogAction =
  | { kind: 'launch' }
  /** G2 (group-B audit round 1): `number | null` because a live run's own pid is legally
   * unknown (`WatchdogRunObservation.runnerPid: number | null`) — never fabricate a pid 0. */
  | { kind: 'attach'; runnerPid: number | null }
  | { kind: 'wait_until'; untilMs: number; cause: 'quota' | 'overload' }
  | { kind: 'relaunch'; cause: 'quota' | 'overload' | 'crash' | 'lock_free'; model: string | null }
  | {
      kind: 'stall';
      logPath: string | null;
      lastMtimeMs: number | null;
      exit: { status: 'needs_human' | 'running'; reason: 'stalled' };
    }
  | { kind: 'exit'; status: 'done' | 'needs_human' | 'running'; reason: string };

export interface WatchdogStatus {
  v: 1;
  mode: WatchdogMode;
  pid: number;
  home: string;
  startedAt: string;
  updatedAt: string;
  state: string;
  lastAction: string;
  runId: string | null;
  runnerPid: number | null;
  runnerCommand: string[] | null;
  counters: WatchdogCounters;
  nextWakeAt: string | null;
  stall: { logPath: string; lastMtime: string } | null;
  terminal: { status: string; reason: string; exitCode: number } | null;
}

export interface WatchdogEvent {
  at: string;
  action: string;
  detail: Record<string, unknown>;
}
