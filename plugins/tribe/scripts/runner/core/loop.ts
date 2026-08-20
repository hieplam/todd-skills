// Main loop: lock, STOP-file, D4 resume matrix, verify, escalation — barrel (Task 6).
//
// This module is a PURE re-export surface: the orchestrator's actual logic lives in
// `core/loop/` (phase.ts's §D4 resume matrix, lock.ts's §D2 single-instance lock + STOP file,
// commit-guard.ts (now holds only `persistLocalState`, the local state write — the D6/D5
// GitHub commit wall it once guarded was deleted entirely, see README's Known limitations),
// card-actions.ts's per-card work, run-loop.ts's pass + entry point). This file exists so
// every external importer (cli/main.ts, adapters/, tests)
// keeps importing from `./loop.ts`/`../core/loop.ts` unchanged — the directory split under it
// is an implementation detail. Every export below is exactly what this module exported before
// the split, plus `liveLockHolder` (P11 fix-list follow-up: the `reset-card` CLI subcommand's
// read-only lock check, extracted out of `acquireLock` in `./loop/lock.ts` — genuinely new
// surface, added here rather than duplicated in a second import path).
export type { RunLoopConfig } from './types.ts';
export type { DerivePhaseIO, ExecResult, LockIO, LockInfo, LoopIO } from '../ports/ports.ts';

export {
  acquireLock,
  isStopRequested,
  liveLockHolder,
  lockFilePath,
  releaseLock,
  stateDirOf,
  stopFilePathOf,
  type LockResult,
} from './loop/lock.ts';

export { deriveCardPhase, type CardPhase, type DerivePhaseConfig } from './loop/phase.ts';

export { extractMergeSha, type CardOutcome } from './loop/card-actions.ts';

export { resolveBaseBranch, runLoop, type DryRunPlan, type LoopResult } from './loop/run-loop.ts';
