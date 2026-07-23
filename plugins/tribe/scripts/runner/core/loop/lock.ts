// §D2 — single-instance lock (pid + start time; a LIVE holder refuses the new start; a DEAD
// holder is a stale crash artifact and must not wedge the runner forever), the STOP file
// (owner's soft-stop: finish the in-flight step, exit cleanly), and the state-dir paths both
// derive from.
import { dirname, join } from 'node:path';
import type { RunLoopConfig } from '../types.ts';
import type { LockIO, LockInfo } from '../../ports/ports.ts';

export type LockResult =
  | { ok: true }
  | { ok: false; reason: string; heldBy: LockInfo };

/** Refuses to start if a LIVE process holds `.runner.lock` (two loops would double-spawn
 * sessions and PRs). A lock left behind by a process that is no longer running (a crash, a
 * `kill -9`) is reclaimed automatically — it is dead-process debris, not a live claim, and
 * must never wedge every future start. */
export function acquireLock(io: LockIO): LockResult {
  const existing = io.readLock();
  if (existing && io.isProcessAlive(existing.pid)) {
    return {
      ok: false,
      reason: `refusing to start: .runner.lock is held by live pid ${existing.pid} (started ${existing.startedAt})`,
      heldBy: existing,
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

export function stateDirOf(config: RunLoopConfig): string {
  return dirname(join(config.repoRoot, config.statePath));
}

export function lockFilePath(config: RunLoopConfig): string {
  return join(stateDirOf(config), '.runner.lock');
}

export function stopFilePathOf(config: RunLoopConfig): string {
  return join(stateDirOf(config), 'STOP');
}
