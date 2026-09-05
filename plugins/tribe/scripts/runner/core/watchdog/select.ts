/** Pure selection and path math for the watchdog. No fs: the edge lists directories and hands
 * the entries in (structure.test.ts bans `node:fs` anywhere in core/**). */
import { join } from 'node:path';

/** Run ids are `<iso-with-separators-mapped>-<hex>` (`core/run-record.ts`'s generateRunId), so
 * lexicographic max is chronological max — no per-candidate file read. */
export function newestRunId(runIds: string[]): string | null {
  let newest: string | null = null;
  for (const id of runIds) if (newest === null || id > newest) newest = id;
  return newest;
}

export interface LogEntry { name: string; mtimeMs: number }

/** Greatest mtime; ties broken by name so the choice is deterministic under a coarse clock. */
export function newestLog(entries: LogEntry[]): LogEntry | null {
  let newest: LogEntry | null = null;
  for (const entry of entries) {
    if (newest === null || entry.mtimeMs > newest.mtimeMs
      || (entry.mtimeMs === newest.mtimeMs && entry.name > newest.name)) newest = entry;
  }
  return newest;
}

/**
 * FIX F-C5 (audit round 2): `mtimeMs === null` used to mean "never stale" UNCONDITIONALLY — a
 * run that dies before writing its first log line had no bound at all, only the false comfort
 * of a `--stall-minutes` timeout measured against a signal that never existed (a reviewer
 * reproduced the runaway: it ran until `RangeError: Out of memory`). `sinceMs` is an optional
 * fallback silence-clock, used ONLY when no finer-grained `mtimeMs` signal exists yet — the
 * caller (`decide.ts`) feeds it `WatchdogRunObservation.noLogSinceMs`: THIS invocation's own
 * "first observed alive with no log" instant, never the run record's own `startedAt` (see that
 * field's doc comment in `model.ts` for why an external, unvalidated timestamp is the wrong
 * clock here). `sinceMs === null` (every 3-arg call site, including this file's own "never
 * stale" test) preserves the old behaviour exactly.
 */
export function isStale(
  nowMs: number,
  mtimeMs: number | null,
  stallMinutes: number,
  sinceMs: number | null = null,
): boolean {
  if (mtimeMs !== null) return nowMs - mtimeMs > stallMinutes * 60_000;
  if (sinceMs === null) return false; // a pass that has not written its first log is starting
  return nowMs - sinceMs > stallMinutes * 60_000;
}

export interface WatchdogPaths {
  dir: string;
  status: string;
  events: string;
  runnerStdout(attempt: number): string;
}

/** W-P9 / spec §7: every path the watchdog writes is under `<home>/watchdog/`. Nothing else in
 * the campaign home is ever written by this process. */
export function watchdogPathsOf(homeDir: string): WatchdogPaths {
  const dir = join(homeDir, 'watchdog');
  return {
    dir,
    status: join(dir, 'status.json'),
    events: join(dir, 'events.jsonl'),
    runnerStdout: (attempt: number) => join(dir, 'runner-stdout', `attempt-${attempt}.log`),
  };
}
