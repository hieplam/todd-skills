// Per-card work: escalate/ship a card, run its executor session (with the D4 resume-with-
// fallback matrix), and REVERT_AND_REDO. Every world-touching effect goes through the
// injected `LoopIO`/`SessionIO` seams — this module never imports a world-touching module
// itself.
import type { Card, CampaignState, ResolvedConfig } from '../types.ts';
import type { LoopIO } from '../../ports/ports.ts';
import { verifyShipped } from '../verify.ts';
import type { VerifyConfig, VerifyIO, VerifyResult } from '../verify.ts';
import { runSession } from '../session.ts';
import type { RunSessionConfig, SessionIO, SessionResult } from '../session.ts';
import { executorBrief, reportPathFor } from '../brief.ts';
import type { BriefCard, BriefState } from '../brief.ts';
import type { CardPhase } from './phase.ts';
import { buildStateDigest, findWorktreePathForBranch } from './phase.ts';
import { persistLocalState } from './commit-guard.ts';
import { answersPathOf, escalationPathOf } from '../paths.ts';

export type CardOutcome =
  | { kind: 'shipped'; cardId: string }
  | {
      kind: 'escalated';
      cardId: string;
      escalationPath: string;
      reason: string;
    }
  | {
      /** D5′ park-and-continue (spec §O4): the card already carries an UNANSWERED escalation
       * file from a PRIOR run (`deriveCardPhase`'s `escalation_pending` short-circuit) — no
       * new work happens for it this pass; it is simply parked and the loop moves on. Kept as
       * its own `CardOutcome` kind rather than folded into `escalated` because, unlike
       * `escalated`, nothing is written this pass: the escalation file and `card.status`
       * already carry the escalation from whenever it first fired, possibly runs ago. */
      kind: 'escalation_pending';
      cardId: string;
      escalationPath: string;
    }
  | { kind: 'stopped'; cardId: string; reason: string };

/** The per-card working set threaded through every card-scoped function. `card` is
 * deliberately NOT a member: it is always derived as `ctx.state.cards[ctx.cardId]` at point
 * of use, so the invariant "card IS the state entry" holds by construction (a separately
 * threaded `card` invites a `{...card}` copy that silently never persists). */
export interface CardCtx {
  cardId: string;
  state: CampaignState;
  resolved: ResolvedConfig;
  io: LoopIO;
}

/** D5/D3: verifyShipped fails once, then is given exactly one more attempt before the caller
 * escalates ("D3 verification fails twice for a card") — the second attempt is what tells a
 * transient exec/network blip apart from a real, stable finding on an already-merged PR. */
export async function verifyWithRetry(
  card: Card,
  verifyConfig: VerifyConfig,
  io: VerifyIO,
): Promise<VerifyResult> {
  const first = await verifyShipped(card, verifyConfig, io);
  if (first.shipped) return first;
  return verifyShipped(card, verifyConfig, io);
}

/** Extracts the merge sha `checkMerged`'s point recorded in its `detail` string —
 * `VerifyResult` doesn't surface it as its own field, and verify.ts must not be rewritten to
 * add one. */
export function extractMergeSha(result: VerifyResult): string | null {
  const mergedPoint = result.points.find((p) => p.id === 'merged');
  if (!mergedPoint) return null;
  const match = /merge_commit_sha=([0-9a-f]+)/.exec(mergedPoint.detail);
  return match ? (match[1] as string) : null;
}

export function formatVerifyFailure(result: VerifyResult): string {
  return result.points
    .filter((p) => !p.passed)
    .map((p) => `- ${p.id}: ${p.detail}`)
    .join('\n');
}

export function buildEscalationMarkdown(
  cardId: string,
  reason: string,
  detail: string,
  resolved: ResolvedConfig,
): string {
  return [
    `# Escalation: ${cardId}`,
    '',
    `**Reason:** ${reason}`,
    '',
    '## Context',
    detail,
    '',
    '## Options',
    `- Append a ruling to \`${answersPathOf(resolved.homeDir)}\` and re-run with \`--include-escalated\`.`,
    '- Fix the underlying issue (plan, code, CI) directly and re-run.',
    '',
  ].join('\n');
}

export async function escalateCard(ctx: CardCtx, reason: string, detail: string): Promise<CardOutcome> {
  const { cardId, state, resolved, io } = ctx;
  const escalationPath = escalationPathOf(resolved.homeDir, cardId);
  const markdown = buildEscalationMarkdown(cardId, reason, detail, resolved);
  // D5: the local escalation file + exit code stand alone — write it FIRST, unconditionally.
  io.writeFile(escalationPath, markdown);

  const card = state.cards[cardId];
  if (card) {
    card.status = 'escalated';
    card.updatedAt = io.now();
  }
  persistLocalState(state, resolved, io);

  return { kind: 'escalated', cardId, escalationPath, reason };
}

export async function shipCard(ctx: CardCtx, verifyResult: VerifyResult): Promise<CardOutcome> {
  const { cardId, state, resolved, io } = ctx;
  const card = state.cards[cardId];
  card.status = 'shipped';
  card.mergeSha = extractMergeSha(verifyResult) ?? card.mergeSha;
  card.updatedAt = io.now();
  persistLocalState(state, resolved, io);

  return { kind: 'shipped', cardId };
}

export function toBriefCard(cardId: string, card: Card): BriefCard {
  return { id: cardId, spec: card.spec, plan: card.plan };
}

export function toBriefState(state: CampaignState): BriefState {
  return {
    campaign: state.campaign,
    mergePolicy: state.mergePolicy,
    ownerOnlyEscalations: state.ownerOnlyEscalations,
  };
}

export const CONTINUE_PR_OPEN_PROMPT =
  "Resume this card: check the open PR's CI status and complete the merge sequence if green, " +
  'then report the terminal SHIPPED/NEEDS_DIRECTION line.';
export const CONTINUE_BRANCH_PROMPT =
  'Resume this card from your existing branch/worktree: continue implementing the plan, then ' +
  'report the terminal SHIPPED/NEEDS_DIRECTION line.';

export function buildSessionIOForCard(ctx: CardCtx): SessionIO {
  const { cardId, state, resolved, io } = ctx;
  const card = state.cards[cardId];
  return {
    spawnSession: (params) => io.spawnSession(params),
    appendLog: (path, line) => io.appendLog(path, line),
    onSessionStart: (sessionId) => {
      // Crash-safe: written the instant the SDK assigns the id, before anything else (§D1/§D4).
      card.sessionId = sessionId;
      card.status = 'running';
      card.updatedAt = io.now();
      persistLocalState(state, resolved, io);
    },
  };
}

export function sessionConfigFor(cardId: string, resolved: ResolvedConfig): RunSessionConfig {
  return {
    repoRoot: resolved.repoRoot,
    model: resolved.model,
    sessionTimeoutMs: resolved.sessionTimeoutMs,
    logsDir: resolved.logsDir,
    card: cardId,
  };
}

/** REVERT_AND_REDO: delete the stale worktree + branch (local and remote) so a fresh session
 * starts from a clean slate — the doctrine B5's executor proved (spec §D4). */
export async function performRevertAndRedo(ctx: CardCtx): Promise<void> {
  const { cardId, state, resolved, io } = ctx;
  const card = state.cards[cardId];
  const branch = card.branch;
  if (!branch) return;

  const worktreeList = await io.exec(['git', 'worktree', 'list', '--porcelain'], {
    cwd: resolved.repoRoot,
  });
  const worktreePath = findWorktreePathForBranch(worktreeList.stdout, branch);
  if (worktreePath) {
    await io.exec(['git', 'worktree', 'remove', '--force', worktreePath], { cwd: resolved.repoRoot });
  }
  await io.exec(['git', 'branch', '-D', branch], { cwd: resolved.repoRoot });

  const remote = await io.exec(['git', 'ls-remote', '--heads', resolved.remote, branch], {
    cwd: resolved.repoRoot,
  });
  if (remote.stdout.trim().length > 0) {
    await io.exec(['git', 'push', resolved.remote, '--delete', branch], { cwd: resolved.repoRoot });
  }
}

/** Runs the executor session for one card's phase, implementing the D4 resume-with-fallback:
 * a `resume` phase attempts `runSession({resume: sessionId})`; if (and only if) that surfaces
 * a typed `error` outcome (a failed resume attempt: no transcript, SDK error — never on
 * `timeout`, which means the prior session may still be running), it falls back to a fresh
 * session carrying a state digest. `revert_and_redo` and a blind `fresh` (no digest) just spawn
 * fresh with the plain brief; a `fresh` phase carrying a digest (F8: open PR, no sessionId)
 * spawns fresh too, but with that digest prepended — never blind. */
export async function runCardSession(ctx: CardCtx, phase: CardPhase): Promise<SessionResult> {
  const { cardId, state, resolved } = ctx;
  const card = state.cards[cardId];
  const sessionConfig = sessionConfigFor(cardId, resolved);

  if (phase.kind === 'resume') {
    const prompt = phase.reason === 'pr_open' ? CONTINUE_PR_OPEN_PROMPT : CONTINUE_BRANCH_PROMPT;
    const resumeIO = buildSessionIOForCard(ctx);
    const resumeResult = await runSession(
      { brief: prompt, resume: phase.sessionId },
      sessionConfig,
      resumeIO,
    );
    if (resumeResult.outcome !== 'error') {
      return resumeResult;
    }

    const digest = buildStateDigest(cardId, card, resumeResult.finalText);
    const brief = executorBrief(
      toBriefCard(cardId, card),
      toBriefState(state),
      `${digest}\n\n---\n\n${resolved.answersContent}`,
      resolved.briefTemplate,
      reportPathFor(resolved.homeDir, cardId),
    );
    const freshIO = buildSessionIOForCard(ctx);
    return runSession({ brief }, sessionConfig, freshIO);
  }

  // F8: a `fresh` phase carrying a digest (open PR, no sessionId — see `deriveCardPhase`) must
  // not spawn blind either; compose it the same way the resume-failure fallback above does.
  const answersContent =
    phase.kind === 'fresh' && phase.digest
      ? `${phase.digest}\n\n---\n\n${resolved.answersContent}`
      : resolved.answersContent;
  const brief = executorBrief(
    toBriefCard(cardId, card),
    toBriefState(state),
    answersContent,
    resolved.briefTemplate,
    reportPathFor(resolved.homeDir, cardId),
  );
  const freshIO = buildSessionIOForCard(ctx);
  return runSession({ brief }, sessionConfig, freshIO);
}

/** Records the commit the card's work is being cut from, BEFORE its session spawns — the
 * schemaGuard check diffs `baseSha..<remote>/<baseBranch>`, so a card that never recorded one
 * can never be verified. Crash-safe (persisted immediately) and idempotent: a resumed card
 * keeps the base it originally started from rather than silently re-basing onto a moved
 * master. */
export async function recordBaseSha(ctx: CardCtx): Promise<void> {
  const { cardId, state, resolved, io } = ctx;
  const card = state.cards[cardId];
  if (card.baseSha) return;

  const result = await io.exec(['git', 'rev-parse', `${resolved.remote}/${resolved.baseBranch}`], {
    cwd: resolved.repoRoot,
  });
  const sha = result.stdout.trim();
  if (result.exitCode !== 0 || sha.length === 0) return;

  card.baseSha = sha;
  card.updatedAt = io.now();
  persistLocalState(state, resolved, io);
}

/** Records the card's branch by asking its PR what it was — the only authority on the name,
 * since the executor session picks the branch itself and never reports it back.
 *
 * Without this, `verifyShipped`'s worktreeAndBranchGone check has nothing to check and the
 * card escalates `verify_failed_twice` even though its PR merged cleanly (observed for real on
 * campaign least-effort-5's C1, PR #144). Best-effort by design: a failed lookup leaves
 * `branch` null exactly as before, so this can only ever add information, never break a card
 * that would otherwise have shipped. */
export async function recordBranchFromPr(ctx: CardCtx): Promise<void> {
  const { cardId, state, resolved, io } = ctx;
  const card = state.cards[cardId];
  if (card.branch || card.pr == null) return;

  const result = await io.exec(['gh', 'pr', 'view', String(card.pr), '--json', 'headRefName'], {
    cwd: resolved.repoRoot,
  });
  if (result.exitCode !== 0) return;

  let headRefName: unknown;
  try {
    headRefName = (JSON.parse(result.stdout) as { headRefName?: unknown }).headRefName;
  } catch {
    return;
  }
  if (typeof headRefName !== 'string' || headRefName.length === 0) return;

  card.branch = headRefName;
  card.updatedAt = io.now();
  persistLocalState(state, resolved, io);
}

export async function actOnCard(ctx: CardCtx, phase: CardPhase): Promise<CardOutcome> {
  const { cardId, state, resolved, io } = ctx;
  const card = state.cards[cardId];

  if (phase.kind === 'verify_only') {
    card.pr = phase.pr;
    await recordBranchFromPr(ctx);
    const verifyConfig: VerifyConfig = {
      repoRoot: resolved.repoRoot,
      remote: resolved.remote,
      baseBranch: resolved.baseBranch,
      schemaLockPaths: state.schemaLockPaths,
      docsOnlyPaths: state.docsOnlyPaths,
    };
    const result = await verifyWithRetry(card, verifyConfig, io);
    if (result.shipped) {
      return shipCard(ctx, result);
    }
    return escalateCard(ctx, 'verify_failed_twice', formatVerifyFailure(result));
  }

  if (phase.kind === 'revert_and_redo') {
    await performRevertAndRedo(ctx);
  }

  await recordBaseSha(ctx);
  const sessionResult = await runCardSession(ctx, phase);

  if (sessionResult.outcome === 'shipped') {
    card.pr = sessionResult.pr ?? card.pr;
    await recordBranchFromPr(ctx);
    const verifyConfig: VerifyConfig = {
      repoRoot: resolved.repoRoot,
      remote: resolved.remote,
      baseBranch: resolved.baseBranch,
      schemaLockPaths: state.schemaLockPaths,
      docsOnlyPaths: state.docsOnlyPaths,
    };
    const result = await verifyWithRetry(card, verifyConfig, io);
    if (result.shipped) {
      return shipCard(ctx, result);
    }
    return escalateCard(ctx, 'verify_failed_twice', formatVerifyFailure(result));
  }

  if (sessionResult.outcome === 'needs_direction') {
    return escalateCard(ctx, 'needs_direction', sessionResult.finalText);
  }

  // 'error' or 'timeout' with no further D4 fallback available (a fresh/revert_and_redo
  // session, or a resume's own fresh-with-digest fallback, itself errored/timed out): not a
  // human-decision escalation — the card's branch/sessionId are already recorded locally
  // (write locality), so simply stop this run; the next start's D4 derivation resumes it.
  return {
    kind: 'stopped',
    cardId,
    reason: `session ended with outcome "${sessionResult.outcome}": ${sessionResult.finalText}`,
  };
}
