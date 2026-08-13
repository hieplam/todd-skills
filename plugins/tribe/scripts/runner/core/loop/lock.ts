// §D2 — single-instance lock (pid + start time; a LIVE holder refuses the new start; a DEAD
// holder is a stale crash artifact and must not wedge the runner forever), the STOP file
// (owner's soft-stop: finish the in-flight step, exit cleanly), and the state-dir paths both
// derive from.
import { join } from 'node:path';
import type { RunLoopConfig } from '../types.ts';
import type { LockIO, LockInfo } from '../../ports/ports.ts';
import { reportDirOf } from '../paths.ts';

export type LockResult =
  | { ok: true }
  | { ok: false; reason: string; heldBy: LockInfo };

/** The live lock holder, if any — `readLock()` alone isn't enough, since a lock file can be
 * dead-process debris (see the module doc comment); this applies the same liveness check
 * `acquireLock` uses, WITHOUT claiming the lock (no `writeLock` call). Extracted (P11 fix-list
 * follow-up) so the `reset-card` CLI subcommand can ask "is a pass currently mid-flight on
 * this campaign?" using the exact same check `acquireLock` refuses on — never a second,
 * independently-drifting copy of the liveness logic. */
export function liveLockHolder(io: Pick<LockIO, 'readLock' | 'isProcessAlive'>): LockInfo | null {
  const existing = io.readLock();
  if (existing && io.isProcessAlive(existing.pid)) {
    return existing;
  }
  return null;
}

/** Refuses to start if a LIVE process holds `.runner.lock` (two loops would double-spawn
 * sessions and PRs). A lock left behind by a process that is no longer running (a crash, a
 * `kill -9`) is reclaimed automatically — it is dead-process debris, not a live claim, and
 * must never wedge every future start. */
export function acquireLock(io: LockIO): LockResult {
  const heldBy = liveLockHolder(io);
  if (heldBy) {
    return {
      ok: false,
      reason: `refusing to start: .runner.lock is held by live pid ${heldBy.pid} (started ${heldBy.startedAt})`,
      heldBy,
    };
  }
  io.writeLock({ pid: io.currentPid(), startedAt: io.now() });
  return { ok: true };
}

export function releaseLock(io: Pick<LockIO, 'removeLock'>): void {
  io.removeLock();
}

export function isStopRequested(stopFilePath: string, io: { fileExists(p: string): boolean }): boolean {
  return io.fileExists(stopFilePath);
}

/** The directory campaign-state.json (and .runner.lock/STOP alongside it) lives in — the
 * campaign's home itself (Task 3, spec §4: everything under `--home` moved to fixed names). */
export function stateDirOf(config: RunLoopConfig): string {
  return reportDirOf(config.homeDir);
}

export function lockFilePath(config: RunLoopConfig): string {
  return join(stateDirOf(config), '.runner.lock');
}

export function stopFilePathOf(config: RunLoopConfig): string {
  return join(stateDirOf(config), 'STOP');
}
