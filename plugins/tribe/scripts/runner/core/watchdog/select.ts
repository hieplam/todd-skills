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

export function isStale(nowMs: number, mtimeMs: number | null, stallMinutes: number): boolean {
  if (mtimeMs === null) return false; // a pass that has not written its first log is starting
  return nowMs - mtimeMs > stallMinutes * 60_000;
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
