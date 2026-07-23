// Main loop: lock, STOP-file, D4 resume matrix, verify, escalation — barrel (Task 6).
//
// This module is a PURE re-export surface: the orchestrator's actual logic lives in
// `core/loop/` (phase.ts's §D4 resume matrix, lock.ts's §D2 single-instance lock + STOP file,
// commit-guard.ts's D6/D5 commit wall, card-actions.ts's per-card work, run-loop.ts's pass +
// entry point). This file exists so every external importer (cli/main.ts, adapters/, tests)
// keeps importing from `./loop.ts`/`../core/loop.ts` unchanged — the directory split under it
// is an implementation detail. Every export below is exactly what this module exported before
// the split; nothing here is new surface.
export type { RunLoopConfig, StateCommitFiles } from './types.ts';
export type { DerivePhaseIO, ExecResult, LockIO, LockInfo, LoopIO, PendingCommit } from '../ports/ports.ts';

export {
  acquireLock,
  isStopRequested,
  lockFilePath,
  releaseLock,
  stateDirOf,
  stopFilePathOf,
  type LockResult,
} from './loop/lock.ts';

export { deriveCardPhase, type CardPhase, type DerivePhaseConfig } from './loop/phase.ts';

export { commitState, toCommitFileList } from './loop/commit-guard.ts';

export { extractMergeSha, type CardOutcome } from './loop/card-actions.ts';

export { resolveBaseBranch, runLoop, type DryRunPlan, type LoopResult } from './loop/run-loop.ts';
