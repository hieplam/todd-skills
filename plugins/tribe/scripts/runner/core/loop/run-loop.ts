// The pass + entry: derive-and-act until `done`, honoring STOP and the `--max-cards` budget,
// tied together with the §D2 lock.
import type { CampaignState, NextCardResult, ResolvedConfig, RunLoopConfig } from '../types.ts';
import { EXIT_ESCALATED, EXIT_LOCKED, EXIT_OK, EXIT_RULINGS_UNRATIFIED, EXIT_SESSION_INCOMPLETE } from '../types.ts';
import { loadState, nextCard } from '../state.ts';
import { BRIEF_TEMPLATE_PATH } from '../brief.ts';
import { campaignStatePathOf, answersPathOf } from '../paths.ts';
import { buildRunRecord, reportsDirOf, runDirOf, runRecordPathOf, serializeRunRecord } from '../run-record.ts';
import { unratifiedRulingIds } from '../rulings.ts';
import type { LoopIO, StateIO } from '../../ports/ports.ts';
import { acquireLock, isStopRequested, releaseLock, stopFilePathOf } from './lock.ts';
import { deriveCardPhase, derivePhaseConfigOf, type CardPhase } from './phase.ts';
import { persistLocalState } from './commit-guard.ts';
import { actOnCard, escalateCard, type CardCtx, type CardOutcome } from './card-actions.ts';

export interface DryRunPlan {
  cardId: string | null;
  phase: CardPhase | null;
  done?: boolean;
  planningNeeded?: { cardId: string; missing: Array<'spec' | 'plan'> };
}

export interface LoopResult {
  exitCode: number;
  processed: CardOutcome[];
  message?: string;
  dryRunPlan?: DryRunPlan;
  /** Harness-gap-wiring PR C: set only when the pass would otherwise have concluded `done` but
   * `answers.md` still carries ≥1 unratified ruling (`core/rulings.ts`) — see `runLoop`'s
   * post-`runPass` check, below. */
  unratifiedRulings?: string[];
}

/** D5′ park-and-continue (spec §O4/§2 wall reads): a single pass can now end with a MIX of
 * outcomes — some cards shipped, some escalated (new this pass or still pending from a prior
 * one), some merely `stopped` (a session error/timeout with no further D4 fallback). This
 * precedence turns that mix into the ONE exit code the caller (Stage C, or a human running the
 * CLI by hand) reads. An escalation always needs a human ruling, so it outranks a `stopped`
 * card — which is "safe to retry, no judgment needed" — even when other cards in the same pass
 * shipped cleanly (design note: an escalation is the thing needing a human; session-incomplete
 * merely resumes next run). `EXIT_OK` only when every attempted card shipped, or none were
 * attempted at all (e.g. the campaign was already fully `done`). */
function computeExitCode(processed: CardOutcome[]): number {
  if (processed.some((o) => o.kind === 'escalated' || o.kind === 'escalation_pending')) {
    return EXIT_ESCALATED;
  }
  if (processed.some((o) => o.kind === 'stopped')) {
    return EXIT_SESSION_INCOMPLETE;
  }
  return EXIT_OK;
}

/** Derives the target repo's base branch from `<remote>/HEAD` rather than hardcoding
 * `master`/`main` (stateless-capability wall: no campaign/repo value baked in). Verified
 * against the real CLI: `git symbolic-ref --short refs/remotes/<remote>/HEAD` -> `<remote>/master`
 * (see the task-6 report's transcript). Falls back to `master` only if the query itself
 * fails (e.g. `<remote>/HEAD` was never set) — a protocol-level default, not a campaign value. */
export async function resolveBaseBranch(
  io: { exec: LoopIO['exec'] },
  repoRoot: string,
  remote: string,
): Promise<string> {
  const result = await io.exec(['git', 'symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`], {
    cwd: repoRoot,
  });
  if (result.exitCode !== 0) {
    return 'master';
  }
  const trimmed = result.stdout.trim();
  const prefix = `${remote}/`;
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed || 'master';
}

/** D5′ park-and-continue (Warchief ruling W-F2): `attempted` excludes any card id already
 * attempted THIS pass from the candidate sequence, independent of `card.status`. This is what
 * makes the park-and-continue loop's termination argument STRUCTURAL rather than incidental —
 * every pass attempts each card at most once (the sequence handed to `nextCard` strictly
 * shrinks every iteration, bounded by `state.sequence.length`), so a pass is guaranteed to
 * reach `done` without ever depending on a status mutation "eventually" excluding a card.
 *
 * Without this, two real triggers loop forever once `break` becomes `continue`: (1) an already
 * `escalated` card is excluded by `nextCard` ONLY when `includeEscalated` is false — Stage C's
 * own re-trigger shape (`--cards <answered> --include-escalated`, spec §O6) sets it true, so a
 * card that escalates AGAIN this pass would be re-selected every tick; (2) a card with a
 * pending PRIOR-run escalation file is never excluded by `card.status` at all — the file, not
 * the status, is what `deriveCardPhase` keys on (see `CardOutcome`'s `escalation_pending`
 * doc). Both cases are exercised in loop.test.ts's "W-F2" and "escalation_pending" suites. */
function filteredNextCard(
  state: CampaignState,
  config: RunLoopConfig,
  io: LoopIO,
  attempted: ReadonlySet<string> = new Set(),
): NextCardResult {
  const sequence = (
    config.cardsFilter && config.cardsFilter.length > 0
      ? state.sequence.filter((id) => config.cardsFilter?.includes(id))
      : state.sequence
  ).filter((id) => !attempted.has(id));
  const view: CampaignState = { ...state, sequence };
  const stateIO: StateIO = {
    repoRoot: config.repoRoot,
    homeDir: config.homeDir,
    fileExists: (p) => io.fileExists(p),
  };
  return nextCard(view, stateIO, { includeEscalated: config.includeEscalated });
}

async function runDryRun(config: RunLoopConfig, io: LoopIO): Promise<LoopResult> {
  // P11 audit fix: `--dry-run` is a diagnostic tool (see this function's zero-side-effects
  // doc comment on `runLoop`) — exactly what an operator reaches for to inspect a suspected
  // R3 stale-baseSha incident (the B13 shape) WITHOUT touching state. It must still surface
  // the warning, same as the two other `loadState` call sites (run-loop.ts's runLoop,
  // cli/main.ts) — state.ts stays pure; this is still just the edge printing it.
  const state = await loadState(
    () => io.readFile(campaignStatePathOf(config.homeDir)),
    (warning) => console.error(`[tribe-runner] ${warning}`),
  );
  const nc = filteredNextCard(state, config, io);

  if (nc.kind === 'done') {
    return { exitCode: EXIT_OK, processed: [], dryRunPlan: { cardId: null, phase: null, done: true } };
  }
  if (nc.kind === 'planning_needed') {
    return {
      exitCode: EXIT_OK,
      processed: [],
      dryRunPlan: {
        cardId: nc.cardId,
        phase: null,
        planningNeeded: { cardId: nc.cardId, missing: nc.missing },
      },
    };
  }

  const phase = await deriveCardPhase(nc.cardId, nc.card, derivePhaseConfigOf(config), io);
  return { exitCode: EXIT_OK, processed: [], dryRunPlan: { cardId: nc.cardId, phase } };
}

/** STOP honored before any work: a present STOP file ends the run cleanly, before the lock's
 * critical section does anything. */
function startupStopResult(config: RunLoopConfig, io: LoopIO): LoopResult | null {
  if (!isStopRequested(stopFilePathOf(config), io)) return null;
  return {
    exitCode: EXIT_OK,
    processed: [],
    message: 'STOP file present; exiting cleanly before processing any card.',
  };
}

/** Loads everything `RunLoopConfig` doesn't carry: the base branch (from origin/HEAD), the
 * committed --answers rulings, and the committed brief template — all through the io seam. */
async function resolveRunContext(config: RunLoopConfig, io: LoopIO): Promise<ResolvedConfig> {
  const baseBranch = await resolveBaseBranch(io, config.repoRoot, config.remote);
  const answersContent = String(await io.readFile(answersPathOf(config.homeDir)));
  const briefTemplate = String(await io.readFile(BRIEF_TEMPLATE_PATH));
  return { ...config, baseBranch, answersContent, briefTemplate };
}

/** One D5′ park-and-continue pass over the campaign: derive-and-act until `done`, STOP, or
 * the --max-cards budget is spent. `reachedDone` records WHICH of the three ended the pass:
 * true only when `filteredNextCard` itself returned `{ kind: 'done' }` (no progressable card
 * remains) — a mid-pass STOP and a spent budget both leave it false, because cards may remain
 * genuinely unattempted on those paths. `computeExitCode` cannot tell these apart (all three
 * can be `EXIT_OK`), and the rulings gate below must fire only on genuine done. */
async function runPass(
  state: CampaignState,
  resolved: ResolvedConfig,
  io: LoopIO,
): Promise<LoopResult & { reachedDone: boolean }> {
  const processed: CardOutcome[] = [];
  // Warchief audit fix (Task 2): `attempted` and the `--max-cards` BUDGET are two different
  // questions, and conflating them was a bug. `attempted` answers ONLY "have I already
  // selected this card id this pass?" — every selected card, unconditionally, is what keeps
  // `filteredNextCard`'s termination argument structural (see that function's own doc
  // comment). `worked` answers "how much of the operator's requested budget have I actually
  // spent?" — plan: "--max-cards counts attempted cards (shipped + escalated)", i.e. cards
  // where something was actually DONE this pass. A card parked on a PRIOR run's escalation
  // file (`escalation_pending`) writes nothing and decides nothing this pass — exactly like
  // a `blocked` card `nextCard` itself skips — so it must not consume budget either; only
  // `planning_needed` (a genuine new escalation is written) and the generic `actOnCard`
  // outcomes (`shipped`/`escalated`/`stopped` — real work happened) increment `worked`.
  const attempted = new Set<string>();
  let worked = 0;
  const limit = resolved.maxCards ?? Infinity;

  // D5′ park-and-continue: loop until either no progressable card remains (`done`) or the
  // `--max-cards` budget (`worked`, above) is spent. `attempted` alone bounds how many times
  // the loop can tick even when `worked` never reaches `limit` (e.g. every remaining card is
  // `escalation_pending`) — see `filteredNextCard`'s doc comment (Warchief ruling W-F2) for
  // why that must be structural, not incidental.
  let reachedDone = false;
  while (worked < limit) {
    if (isStopRequested(stopFilePathOf(resolved), io)) {
      break;
    }

    const nc = filteredNextCard(state, resolved, io, attempted);
    if (nc.kind === 'done') {
      reachedDone = true;
      break;
    }

    const ctx: CardCtx = { cardId: nc.cardId, state, resolved, io };

    if (nc.kind === 'planning_needed') {
      attempted.add(nc.cardId);
      const outcome = await escalateCard(ctx, 'planning_needed', `Missing on disk: ${nc.missing.join(', ')}`);
      processed.push(outcome);
      worked += 1;
      continue;
    }

    const phase = await deriveCardPhase(nc.cardId, nc.card, derivePhaseConfigOf(resolved), io);

    if (phase.kind === 'escalation_pending') {
      // D5′: an unanswered escalation from a PRIOR run — nothing to do this pass but park
      // it (see the `CardOutcome.escalation_pending` doc) and move to the next card. Marks
      // `attempted` (never re-select it this pass) but NOT `worked` (no budget spent — see
      // the audit-fix comment above `attempted`'s declaration).
      attempted.add(nc.cardId);
      processed.push({ kind: 'escalation_pending', cardId: nc.cardId, escalationPath: phase.escalationPath });
      continue;
    }

    // P1 fix-list "wait-aware liveness" (containment layer): a `stopped` outcome whose
    // session ended with `error` (never `timeout`) is exactly what a human re-trigger fixed
    // on 08-08 — the card's sessionId is already recorded locally (written by `onSessionStart`
    // the instant the SDK assigns it, before the session can even reach a PR/branch), so
    // re-deriving the phase naturally takes the D4 resume path: `pr_open`/`branch_no_pr` when
    // a branch was already known, or the P1 audit fix-round's `session_only` reason
    // (`phase.ts`) when it wasn't — never a blind second `fresh` spawn on top of possibly-
    // still-open work. Bounded to 2 retries per card per pass so a persistently-erroring card
    // still surfaces as `stopped` rather than looping forever.
    let outcome = await actOnCard(ctx, phase);
    let retries = 0;
    while (outcome.kind === 'stopped' && outcome.retryable && retries < 2) {
      retries += 1;
      const retryPhase = await deriveCardPhase(nc.cardId, nc.card, derivePhaseConfigOf(resolved), io);
      if (retryPhase.kind === 'escalation_pending') break;
      outcome = await actOnCard(ctx, retryPhase);
    }
    attempted.add(nc.cardId);
    processed.push(outcome);
    worked += 1;
    // D5′: `escalated`/`stopped` no longer `break` the pass — the next tick naturally
    // re-derives the next progressable card (excluding this one, now `attempted`) via
    // `filteredNextCard`/`nextCard`'s own blocked-cascade reconciliation (W6).
  }

  return { exitCode: computeExitCode(processed), processed, reachedDone };
}

/** Harness-gap-wiring PR C (spec: outstanding-17 postmortem — a ruling that captured a durable
 * convention was never ratified into the target repo's governance files because nothing gated
 * on it): the mechanical gate. Pure — takes the pass's own result and the `answers.md` content
 * `resolveRunContext` already read once through the injected `io` seam (`resolved.answersContent`
 * — no second read here) and decides whether to override an `EXIT_OK` ("done") into
 * `EXIT_RULINGS_UNRATIFIED`. `reachedDone` (runPass) must be true as well as `EXIT_OK`:
 * `computeExitCode` returns `EXIT_OK` equally for genuine done, a mid-pass STOP, and a spent
 * `--max-cards` budget, and gating the latter two would flip "partial progress, come back
 * later" into a rulings failure while cards remain genuinely unattempted (3-lens review,
 * contract lens). Every other exit code (an escalation, a stopped session) passes
 * through UNCHANGED — the brief is explicit that this gate fires only on the path that would
 * otherwise conclude `done`. Mirrors `debt-count.ts`'s own framing of its diff-mode gate: "exit
 * code is a gate, not a report." */
function applyRulingsGate(
  result: LoopResult,
  answersContent: string,
  reachedDone: boolean,
): LoopResult {
  if (!reachedDone || result.exitCode !== EXIT_OK) return result;

  const unratified = unratifiedRulingIds(answersContent);
  if (unratified.length === 0) return result;

  return {
    ...result,
    exitCode: EXIT_RULINGS_UNRATIFIED,
    unratifiedRulings: unratified,
    message:
      `${unratified.length} ruling(s) in answers.md are not yet ratified: ${unratified.join(', ')}. ` +
      'Add a `ratified-as:` line to each block (see the runner README), then re-run.',
  };
}

/** The main loop, spec §D2/§D4/§D5′ tied together: acquire the single-instance lock → STOP-file
 * check → repeatedly derive-and-act on the next card, PARKING
 * (never exiting) on an escalation or a `stopped` session — D5′'s amendment of the original
 * exit-on-escalation D5. The pass stops only when no progressable card remains (`done`) or the
 * `--max-cards` budget is spent — counted by cards actually WORKED this pass (`shipped` /
 * `escalated` / `stopped`), never by a card merely PARKED on a prior run's escalation file
 * (Warchief audit fix: dedup/termination and the operator's work budget are different
 * questions — see the `attempted`/`worked` split at this function's loop, below). A STOP file
 * is still honored between cards (finishes the in-flight card only, never aborts one mid-flight).
 * `--dry-run` short-circuits to `runDryRun` before any of this (no lock, no writes, no session —
 * see `runDryRun`'s own doc comment for why that is zero side effects BY CONSTRUCTION, not
 * merely by intent). */
export async function runLoop(config: RunLoopConfig, io: LoopIO): Promise<LoopResult> {
  if (config.dryRun) {
    return runDryRun(config, io);
  }

  const lockResult = acquireLock(io);
  if (!lockResult.ok) {
    return { exitCode: EXIT_LOCKED, processed: [], message: lockResult.reason };
  }

  try {
    // Spec §4/§5.2: the run record is written the moment the lock is held — never on a
    // refused start, never on --dry-run (which returned above, before the lock). Failures
    // are swallowed: observability exhaust must never kill a campaign run (spec §9); the
    // record's absence is itself the viewer-visible signal.
    try {
      io.ensureDir(runDirOf(config.homeDir, config.runId));
      io.ensureDir(reportsDirOf(config.homeDir));
      io.writeFileAtomic(
        runRecordPathOf(config.homeDir, config.runId),
        serializeRunRecord(buildRunRecord(config, io)),
      );
    } catch {
      // See comment above.
    }

    const stopped = startupStopResult(config, io);
    if (stopped) return stopped;

    const resolved = await resolveRunContext(config, io);

    // P11 fix-list: surfaces `loadState`'s R3-invariant normalization warnings at the edge —
    // state.ts stays pure (it only computes the warning strings; it never imports `console`
    // itself), this is the one place a real run actually prints them.
    const state = await loadState(
      () => io.readFile(campaignStatePathOf(config.homeDir)),
      (warning) => console.error(`[tribe-runner] ${warning}`),
    );
    const result = await runPass(state, resolved, io);
    // W-F5 (Warchief fix): `nextCard`'s `reconcileBlockedStatuses` (state.ts) can mark a card
    // `blocked` IN MEMORY on the very tick that also discovers `done` (no further progressable
    // card) — that tick never reaches `actOnCard`/`escalateCard`/`shipCard`, so the mutation
    // would otherwise never be flushed via `persistLocalState`, and the file on disk would keep
    // reporting that card's stale pre-reconciliation status (e.g. `staged`) forever, even though
    // it is genuinely blocked behind an unanswered escalation. One `persistLocalState` call
    // here, on every normal (non-dry-run, non-locked) return, closes that gap for good — state
    // was definitely loaded and may have been mutated by this point, and `serializeState`'s
    // byte-identical round-trip means a pass with no reconciliation to flush just rewrites the
    // same bytes (harmless, no spurious diff).
    persistLocalState(state, resolved, io);
    // Harness-gap-wiring PR C: gate the genuinely-done exit on `answers.md`'s unratified
    // rulings — see `applyRulingsGate`'s own doc comment. A no-op for every other exit code
    // and for EXIT_OK passes that ended on STOP or a spent --max-cards budget.
    const { reachedDone, ...loopResult } = result;
    return applyRulingsGate(loopResult, resolved.answersContent, reachedDone);
  } finally {
    releaseLock(io);
  }
}
