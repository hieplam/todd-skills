// Main loop: lock, STOP-file, D4 resume matrix, verify, escalation, CLI wiring (Task 6).
//
// Pure TypeScript orchestrator: every world-touching call (gh/git, fs, the SDK spawn, the
// clock, the lock) goes through the injected `LoopIO` seam below — this module never
// imports `child_process`, `fs`, or the SDK package itself (that stays confined to
// session.ts, per spec §D1's "SDK drift" risk note). Tests drive a fully mocked `LoopIO` and
// never hit a real binary. Acceptance #5: this module makes zero model/LLM calls — the only
// "intelligence" it touches is the typed `SessionResult` a spawned session reports back.
import { dirname, join } from 'node:path';
import type { Card, CampaignState, NextCardResult, StateIO } from './types.ts';
import { loadState, nextCard, serializeState } from './state.ts';
import { verifyShipped } from './verify.ts';
import type { ExecResult, VerifyConfig, VerifyIO, VerifyResult } from './verify.ts';
import { commitStateAndMerge } from './github.ts';
import type { CommitStateAndMergeResult, GithubConfig, GithubIO } from './github.ts';
import { runSession } from './session.ts';
import type {
  RunSessionConfig,
  SessionIO,
  SessionMessage,
  SessionResult,
  SpawnSessionParams,
} from './session.ts';
import { executorBrief } from './brief.ts';
import type { BriefCard, BriefState } from './brief.ts';

export type { ExecResult };

// ---------------------------------------------------------------------------------------
// §D4 — the resume matrix, derived from reality, never from the state file.
// ---------------------------------------------------------------------------------------

/** The five §D4 outcomes, plus the escalation-file short-circuit. `deriveCardPhase` never
 * itself attempts a resume or spawns anything — it only classifies reality; the loop's own
 * "act" step does the attempting (so a resume-probe failure can fall back to fresh, per the
 * spec note "resumability is probed by attempting the resume ... there is no session-listing
 * API — never list"). */
export type CardPhase =
  | { kind: 'verify_only'; pr: number }
  | { kind: 'resume'; sessionId: string; reason: 'pr_open' | 'branch_no_pr'; pr?: number }
  | { kind: 'revert_and_redo' }
  // F8: `digest` is present exactly when there IS a trace worth telling the executor about
  // (an open PR with no recorded sessionId) but nothing is resumable — the genuine
  // "no trace at all" case (see `card.branch === null` below) leaves it undefined, so a
  // fresh session there stays a plain blind fresh, unchanged.
  | { kind: 'fresh'; digest?: string }
  | { kind: 'escalation_pending'; escalationPath: string };

export interface DerivePhaseConfig {
  /** Target repo root; cwd for every gh/git call (an input, per spec §2). */
  repoRoot: string;
  /** `--escalations-dir` input, relative to repoRoot. */
  escalationsDir: string;
  /** `--include-escalated`: bypasses the escalation-file short-circuit — the human has
   * already ruled and is deliberately forcing a retry of a previously escalated card. */
  includeEscalated: boolean;
}

export interface DerivePhaseIO {
  exec(cmd: string[], opts?: { cwd?: string }): Promise<ExecResult>;
  fileExists(resolvedPath: string): boolean;
}

interface PrLookup {
  kind: 'found' | 'not_found';
  number?: number;
  state?: string;
}

/** `gh pr view <branch> --json number,state` (verified against the real CLI: exit 0 + JSON
 * when a PR exists for the branch; exit 1 + a stderr message, empty stdout, when none does —
 * see the task-6 report's transcript). A non-zero exit (including a genuine gh/network
 * failure) is folded into `not_found` — the safe direction for this capability's v1 scope,
 * matching verify.ts's own precedent of folding a rejected/failed call into a reportable
 * "did not find what we were checking for" outcome rather than throwing. */
async function queryPrForBranch(
  branch: string,
  repoRoot: string,
  io: DerivePhaseIO,
): Promise<PrLookup> {
  const result = await io.exec(['gh', 'pr', 'view', branch, '--json', 'number,state'], {
    cwd: repoRoot,
  });
  if (result.exitCode !== 0) {
    return { kind: 'not_found' };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { number?: unknown; state?: unknown };
    return {
      kind: 'found',
      number: typeof parsed.number === 'number' ? parsed.number : undefined,
      state: typeof parsed.state === 'string' ? parsed.state : undefined,
    };
  } catch {
    return { kind: 'not_found' };
  }
}

/** Reused, verified real commands (`git worktree list --porcelain`, `git ls-remote --heads`)
 * — same detection verify.ts's own `checkWorktreeAndBranchGone` uses, duplicated locally
 * (verify.ts's helper is not exported and this module must not rewrite verify.ts's logic). */
async function branchOrWorktreeExists(
  branch: string,
  repoRoot: string,
  io: DerivePhaseIO,
): Promise<boolean> {
  const worktreeResult = await io.exec(['git', 'worktree', 'list', '--porcelain'], {
    cwd: repoRoot,
  });
  const worktreeExists = worktreeResult.stdout
    .split('\n')
    .some((line) => line.trim() === `branch refs/heads/${branch}`);

  const remoteResult = await io.exec(['git', 'ls-remote', '--heads', 'origin', branch], {
    cwd: repoRoot,
  });
  const remoteExists = remoteResult.stdout.trim().length > 0;

  return worktreeExists || remoteExists;
}

/** Finds the worktree path for `branch` from `git worktree list --porcelain` output — used by
 * REVERT_AND_REDO to know what to `git worktree remove`. Porcelain output is a blank-line
 * separated sequence of blocks, each starting `worktree <path>`. */
function findWorktreePathForBranch(porcelain: string, branch: string): string | null {
  const blocks = porcelain.split(/\n\n+/);
  for (const block of blocks) {
    const lines = block.split('\n');
    const worktreeLine = lines.find((l) => l.startsWith('worktree '));
    const hasBranch = lines.some((l) => l.trim() === `branch refs/heads/${branch}`);
    if (worktreeLine && hasBranch) {
      return worktreeLine.slice('worktree '.length).trim();
    }
  }
  return null;
}

/** The §D4 reality table, implemented exactly: escalation file (unless `--include-escalated`)
 * short-circuits everything; otherwise PR state (merged/open/absent) plus branch/worktree
 * presence plus a recorded `sessionId` determine the phase. Never trusts `card.status` — every
 * branch here is driven by a gh/git query or an fs check, per the design's iron rule ("the
 * file is data, gh/git is authority"). */
export async function deriveCardPhase(
  cardId: string,
  card: Card,
  config: DerivePhaseConfig,
  io: DerivePhaseIO,
): Promise<CardPhase> {
  if (!config.includeEscalated) {
    const escalationPath = join(config.repoRoot, config.escalationsDir, `${cardId}.md`);
    if (io.fileExists(escalationPath)) {
      return { kind: 'escalation_pending', escalationPath };
    }
  }

  if (!card.branch) {
    return { kind: 'fresh' };
  }

  const pr = await queryPrForBranch(card.branch, config.repoRoot, io);

  if (pr.kind === 'found' && pr.state === 'MERGED' && pr.number !== undefined) {
    return { kind: 'verify_only', pr: pr.number };
  }

  if (pr.kind === 'found' && pr.state === 'OPEN') {
    if (card.sessionId) {
      return { kind: 'resume', sessionId: card.sessionId, reason: 'pr_open', pr: pr.number };
    }
    // F8: an open PR with no recorded sessionId has nothing to resume — but there IS a trace
    // (an open PR on GitHub), so this is NOT "same as no trace". A blind `{ kind: 'fresh' }`
    // here spawns an executor with no idea the PR exists; it rebuilds the card and opens a
    // SECOND PR (violates acceptance #3: no duplicate PRs on resume). Reuse the same
    // `buildStateDigest` the resume-failure fallback already uses, so the fresh session is
    // told the PR number and instructed to continue it, not duplicate it.
    const reason =
      pr.number !== undefined
        ? `no sessionId was ever recorded for this card, but PR #${pr.number} is already OPEN ` +
          `on GitHub for branch "${card.branch}" — do not open a second PR; inspect and ` +
          'continue the existing one.'
        : `no sessionId was ever recorded for this card, and an OPEN PR was found for branch ` +
          `"${card.branch}" (its number could not be read) — do not open a second PR; inspect ` +
          'and continue the existing one.';
    return { kind: 'fresh', digest: buildStateDigest(cardId, card, reason) };
  }

  const exists = await branchOrWorktreeExists(card.branch, config.repoRoot, io);
  if (exists) {
    if (card.sessionId) {
      return { kind: 'resume', sessionId: card.sessionId, reason: 'branch_no_pr' };
    }
    return { kind: 'revert_and_redo' };
  }

  return { kind: 'fresh' };
}

// ---------------------------------------------------------------------------------------
// §D2 — single-instance lock. pid + start time; a LIVE holder refuses the new start; a DEAD
// holder is a stale crash artifact and must not wedge the runner forever.
// ---------------------------------------------------------------------------------------

export interface LockInfo {
  pid: number;
  startedAt: string;
}

export interface LockIO {
  readLock(): LockInfo | null;
  writeLock(info: LockInfo): void;
  removeLock(): void;
  /** OS-level liveness probe (production: `process.kill(pid, 0)`, catching ESRCH). Chosen
   * over a time-based staleness guess (see the task-6 report): a TTL either wedges a
   * legitimately long-running session (TTL too short) or leaves a truly dead lock stuck for
   * an arbitrary window (TTL too long); a liveness probe is exact in both directions and
   * costs one syscall. */
  isProcessAlive(pid: number): boolean;
  currentPid(): number;
  now(): string;
}

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

// ---------------------------------------------------------------------------------------
// STOP file (owner's soft-stop): finish the in-flight step, exit cleanly.
// ---------------------------------------------------------------------------------------

export function isStopRequested(stopFilePath: string, io: { fileExists(p: string): boolean }): boolean {
  return io.fileExists(stopFilePath);
}

// ---------------------------------------------------------------------------------------
// §D6/§D5 — the ONLY path this capability may use to commit files via `commitStateAndMerge`.
// `github.ts`'s D6 sonar waiver assumes its diff is docs-only BY CONSTRUCTION (it only ever
// commits campaign state files) — so this module must never be able to hand it a code file.
// `StateCommitFiles` has exactly two named, single-purpose fields (never a bare `string[]`
// the rest of this module could smuggle an arbitrary path into), and `toCommitFileList`
// additionally asserts every path ends in `.json`/`.md` at runtime. `commitState` is the
// ONLY call site of `commitStateAndMerge` in this module — there is no second path in.
// ---------------------------------------------------------------------------------------

export interface StateCommitFiles {
  /** The campaign state JSON path (relative to repoRoot) — always included. */
  statePath: string;
  /** An escalation markdown path (relative to repoRoot) — only present when this commit
   * records an escalation. */
  escalationPath?: string;
}

const ALLOWED_COMMIT_EXTENSIONS = ['.json', '.md'];

function assertStateOrEscalationPath(path: string): void {
  if (!ALLOWED_COMMIT_EXTENSIONS.some((ext) => path.endsWith(ext))) {
    throw new Error(
      `refusing to commit "${path}" via commitStateAndMerge: only campaign state (.json) and ` +
        `escalation (.md) files may ever be committed this way — commitStateAndMerge's D6 ` +
        `sonar waiver assumes a docs-only diff by construction, and a code file would break that.`,
    );
  }
}

export function toCommitFileList(files: StateCommitFiles): string[] {
  assertStateOrEscalationPath(files.statePath);
  const list = [files.statePath];
  if (files.escalationPath) {
    assertStateOrEscalationPath(files.escalationPath);
    list.push(files.escalationPath);
  }
  return list;
}

/** The ONLY call site of `commitStateAndMerge` in this module. */
export async function commitState(
  files: StateCommitFiles,
  title: string,
  config: GithubConfig,
  io: GithubIO,
): Promise<CommitStateAndMergeResult> {
  return commitStateAndMerge(toCommitFileList(files), title, config, io);
}

export interface PendingCommit {
  card: string;
  files: StateCommitFiles;
  title: string;
}

// ---------------------------------------------------------------------------------------
// The full seam this module needs. Every field is injected; production wiring (run.ts)
// supplies the real gh/git/fs/SDK/clock/lock implementations.
// ---------------------------------------------------------------------------------------

export interface LoopIO {
  exec(cmd: string[], opts?: { cwd?: string }): Promise<ExecResult>;
  sleep(ms: number): Promise<void>;

  fileExists(resolvedPath: string): boolean;
  readFile(resolvedPath: string): Promise<string> | string;
  writeFile(resolvedPath: string, content: string): void;

  readLock(): LockInfo | null;
  writeLock(info: LockInfo): void;
  removeLock(): void;
  isProcessAlive(pid: number): boolean;
  currentPid(): number;
  now(): string;

  readPendingCommit(): PendingCommit | null;
  writePendingCommit(pc: PendingCommit): void;
  clearPendingCommit(): void;

  spawnSession(params: SpawnSessionParams): AsyncIterable<SessionMessage>;
  appendLog(logPath: string, line: string): void;
}

export interface RunLoopConfig {
  /** `--repo` */
  repoRoot: string;
  /** `--state`, relative to repoRoot */
  statePath: string;
  /** `--escalations-dir`, relative to repoRoot */
  escalationsDir: string;
  /** `--answers`, relative to repoRoot */
  answersPath: string;
  /** `--logs-dir` */
  logsDir: string;
  /** `--model` */
  model: string;
  /** `--session-timeout`, in ms */
  sessionTimeoutMs?: number;
  maxTurns?: number;
  /** `--cards` */
  cardsFilter?: string[];
  /** `--max-cards` */
  maxCards?: number;
  /** `--include-escalated` */
  includeEscalated: boolean;
  /** `--dry-run` */
  dryRun: boolean;
}

interface ResolvedConfig extends RunLoopConfig {
  baseBranch: string;
  answersContent: string;
}

export const EXIT_OK = 0;
export const EXIT_LOCKED = 1;
export const EXIT_ESCALATED = 2;
export const EXIT_SESSION_INCOMPLETE = 3;

export type CardOutcome =
  | { kind: 'shipped'; cardId: string; commitResult: CommitStateAndMergeResult }
  | {
      kind: 'escalated';
      cardId: string;
      escalationPath: string;
      reason: string;
      commitResult: CommitStateAndMergeResult;
    }
  | { kind: 'stopped'; cardId: string; reason: string };

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
}

function stateDirOf(config: RunLoopConfig): string {
  return dirname(join(config.repoRoot, config.statePath));
}

function lockFilePath(config: RunLoopConfig): string {
  return join(stateDirOf(config), '.runner.lock');
}

function stopFilePathOf(config: RunLoopConfig): string {
  return join(stateDirOf(config), 'STOP');
}

/** Derives the target repo's base branch from `origin/HEAD` rather than hardcoding
 * `master`/`main` (stateless-capability wall: no campaign/repo value baked in). Verified
 * against the real CLI: `git symbolic-ref --short refs/remotes/origin/HEAD` -> `origin/master`
 * (see the task-6 report's transcript). Falls back to `master` only if the query itself
 * fails (e.g. `origin/HEAD` was never set) — a protocol-level default, not a campaign value. */
export async function resolveBaseBranch(
  io: { exec: LoopIO['exec'] },
  repoRoot: string,
): Promise<string> {
  const result = await io.exec(['git', 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
    cwd: repoRoot,
  });
  if (result.exitCode !== 0) {
    return 'master';
  }
  const trimmed = result.stdout.trim();
  return trimmed.startsWith('origin/') ? trimmed.slice('origin/'.length) : trimmed || 'master';
}

function filteredNextCard(state: CampaignState, config: RunLoopConfig, io: LoopIO): NextCardResult {
  const sequence =
    config.cardsFilter && config.cardsFilter.length > 0
      ? state.sequence.filter((id) => config.cardsFilter?.includes(id))
      : state.sequence;
  const view: CampaignState = { ...state, sequence };
  const stateIO: StateIO = { repoRoot: config.repoRoot, fileExists: (p) => io.fileExists(p) };
  return nextCard(view, stateIO, { includeEscalated: config.includeEscalated });
}

function persistLocalState(state: CampaignState, resolved: ResolvedConfig, io: LoopIO): void {
  io.writeFile(join(resolved.repoRoot, resolved.statePath), serializeState(state));
}

function buildStatePrBody(cardId: string): string {
  return (
    `Automated campaign-state update for ${cardId} by the tribe campaign runner ` +
    '(docs-only: campaign state + escalation files, never code).'
  );
}

function githubConfigFor(resolved: ResolvedConfig, cardId: string): GithubConfig {
  return {
    repoRoot: resolved.repoRoot,
    card: cardId,
    prBody: buildStatePrBody(cardId),
    baseBranch: resolved.baseBranch,
  };
}

/** D5/D3: verifyShipped fails once, then is given exactly one more attempt before the caller
 * escalates ("D3 verification fails twice for a card") — the second attempt is what tells a
 * transient exec/network blip apart from a real, stable finding on an already-merged PR. */
async function verifyWithRetry(
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

function formatVerifyFailure(result: VerifyResult): string {
  return result.points
    .filter((p) => !p.passed)
    .map((p) => `- ${p.id}: ${p.detail}`)
    .join('\n');
}

function buildEscalationMarkdown(
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
    `- Append a ruling to \`${resolved.answersPath}\` and re-run with \`--include-escalated\`.`,
    '- Fix the underlying issue (plan, code, CI) directly and re-run.',
    '',
  ].join('\n');
}

async function escalateCard(
  cardId: string,
  reason: string,
  detail: string,
  state: CampaignState,
  resolved: ResolvedConfig,
  io: LoopIO,
): Promise<CardOutcome> {
  const escalationRelPath = `${resolved.escalationsDir}/${cardId}.md`;
  const markdown = buildEscalationMarkdown(cardId, reason, detail, resolved);
  // D5: the local escalation file + exit code stand alone even if the commit below fails —
  // write it FIRST, unconditionally.
  io.writeFile(join(resolved.repoRoot, escalationRelPath), markdown);

  const card = state.cards[cardId];
  if (card) {
    card.status = 'escalated';
    card.updatedAt = io.now();
  }
  persistLocalState(state, resolved, io);

  const files: StateCommitFiles = { statePath: resolved.statePath, escalationPath: escalationRelPath };
  const title = `chore: escalate ${cardId} (${reason})`;
  const commitResult = await commitState(files, title, githubConfigFor(resolved, cardId), io);
  if (commitResult.outcome === 'merged') {
    io.clearPendingCommit();
  } else {
    io.writePendingCommit({ card: cardId, files, title });
  }

  return { kind: 'escalated', cardId, escalationPath: escalationRelPath, reason, commitResult };
}

async function shipCard(
  cardId: string,
  card: Card,
  verifyResult: VerifyResult,
  state: CampaignState,
  resolved: ResolvedConfig,
  io: LoopIO,
): Promise<CardOutcome> {
  card.status = 'shipped';
  card.mergeSha = extractMergeSha(verifyResult) ?? card.mergeSha;
  card.updatedAt = io.now();
  persistLocalState(state, resolved, io);

  const files: StateCommitFiles = { statePath: resolved.statePath };
  const title = `chore: mark ${cardId} shipped`;
  const commitResult = await commitState(files, title, githubConfigFor(resolved, cardId), io);
  if (commitResult.outcome === 'merged') {
    io.clearPendingCommit();
  } else {
    io.writePendingCommit({ card: cardId, files, title });
  }

  return { kind: 'shipped', cardId, commitResult };
}

function toBriefCard(cardId: string, card: Card): BriefCard {
  return { id: cardId, spec: card.spec, plan: card.plan };
}

function toBriefState(state: CampaignState): BriefState {
  return {
    campaign: state.campaign,
    mergePolicy: state.mergePolicy,
    ownerOnlyEscalations: state.ownerOnlyEscalations,
  };
}

const CONTINUE_PR_OPEN_PROMPT =
  "Resume this card: check the open PR's CI status and complete the merge sequence if green " +
  '(a regular merge, never squash), then report the terminal SHIPPED/NEEDS_DIRECTION line.';
const CONTINUE_BRANCH_PROMPT =
  'Resume this card from your existing branch/worktree: continue implementing the plan, then ' +
  'report the terminal SHIPPED/NEEDS_DIRECTION line.';

/** Built ONLY for the D4 "resume attempt failed" fallback: a fresh session has no prior
 * context, so it needs a digest of what's known instead of starting blind. Composed into the
 * existing `executorBrief(card, state, answersContent)` API's `answersContent` param — never
 * a rewrite of brief.ts. */
function buildStateDigest(cardId: string, card: Card, resumeFailureReason: string): string {
  return [
    `## Crash-recovery digest for ${cardId}`,
    `A previous session (session id: ${card.sessionId ?? '(unknown)'}) could not be resumed:`,
    `> ${resumeFailureReason}`,
    '',
    'Known state before this fresh session started:',
    `- status: ${card.status}`,
    `- branch: ${card.branch ?? '(none recorded)'}`,
    `- pr: ${card.pr ?? '(none recorded)'}`,
    `- baseSha: ${card.baseSha ?? '(none recorded)'}`,
    '',
    `Inspect the branch/worktree/PR state for ${cardId} before starting fresh work — do not ` +
      'assume a clean slate.',
  ].join('\n');
}

function buildSessionIOForCard(
  card: Card,
  state: CampaignState,
  resolved: ResolvedConfig,
  io: LoopIO,
): SessionIO {
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

function sessionConfigFor(cardId: string, resolved: ResolvedConfig): RunSessionConfig {
  return {
    repoRoot: resolved.repoRoot,
    model: resolved.model,
    maxTurns: resolved.maxTurns,
    sessionTimeoutMs: resolved.sessionTimeoutMs,
    logsDir: resolved.logsDir,
    card: cardId,
  };
}

/** REVERT_AND_REDO: delete the stale worktree + branch (local and remote) so a fresh session
 * starts from a clean slate — the doctrine B5's executor proved (spec §D4). */
async function performRevertAndRedo(card: Card, resolved: ResolvedConfig, io: LoopIO): Promise<void> {
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

  const remote = await io.exec(['git', 'ls-remote', '--heads', 'origin', branch], {
    cwd: resolved.repoRoot,
  });
  if (remote.stdout.trim().length > 0) {
    await io.exec(['git', 'push', 'origin', '--delete', branch], { cwd: resolved.repoRoot });
  }
}

/** Runs the executor session for one card's phase, implementing the D4 resume-with-fallback:
 * a `resume` phase attempts `runSession({resume: sessionId})`; if (and only if) that surfaces
 * a typed `error` outcome (a failed resume attempt: no transcript, SDK error — never on
 * `timeout`, which means the prior session may still be running), it falls back to a fresh
 * session carrying a state digest. `revert_and_redo` and a blind `fresh` (no digest) just spawn
 * fresh with the plain brief; a `fresh` phase carrying a digest (F8: open PR, no sessionId)
 * spawns fresh too, but with that digest prepended — never blind. */
async function runCardSession(
  cardId: string,
  phase: CardPhase,
  card: Card,
  state: CampaignState,
  resolved: ResolvedConfig,
  io: LoopIO,
): Promise<SessionResult> {
  const sessionConfig = sessionConfigFor(cardId, resolved);

  if (phase.kind === 'resume') {
    const prompt = phase.reason === 'pr_open' ? CONTINUE_PR_OPEN_PROMPT : CONTINUE_BRANCH_PROMPT;
    const resumeIO = buildSessionIOForCard(card, state, resolved, io);
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
    );
    const freshIO = buildSessionIOForCard(card, state, resolved, io);
    return runSession({ brief }, sessionConfig, freshIO);
  }

  // F8: a `fresh` phase carrying a digest (open PR, no sessionId — see `deriveCardPhase`) must
  // not spawn blind either; compose it the same way the resume-failure fallback above does.
  const answersContent =
    phase.kind === 'fresh' && phase.digest
      ? `${phase.digest}\n\n---\n\n${resolved.answersContent}`
      : resolved.answersContent;
  const brief = executorBrief(toBriefCard(cardId, card), toBriefState(state), answersContent);
  const freshIO = buildSessionIOForCard(card, state, resolved, io);
  return runSession({ brief }, sessionConfig, freshIO);
}

async function actOnCard(
  cardId: string,
  phase: CardPhase,
  state: CampaignState,
  resolved: ResolvedConfig,
  io: LoopIO,
): Promise<CardOutcome> {
  const card = state.cards[cardId];

  if (phase.kind === 'verify_only') {
    card.pr = phase.pr;
    const verifyConfig: VerifyConfig = {
      repoRoot: resolved.repoRoot,
      schemaLockPaths: state.schemaLockPaths,
      docsOnlyPaths: state.docsOnlyPaths,
    };
    const result = await verifyWithRetry(card, verifyConfig, io);
    if (result.shipped) {
      return shipCard(cardId, card, result, state, resolved, io);
    }
    return escalateCard(cardId, 'verify_failed_twice', formatVerifyFailure(result), state, resolved, io);
  }

  if (phase.kind === 'revert_and_redo') {
    await performRevertAndRedo(card, resolved, io);
  }

  const sessionResult = await runCardSession(cardId, phase, card, state, resolved, io);

  if (sessionResult.outcome === 'shipped') {
    card.pr = sessionResult.pr ?? card.pr;
    const verifyConfig: VerifyConfig = {
      repoRoot: resolved.repoRoot,
      schemaLockPaths: state.schemaLockPaths,
      docsOnlyPaths: state.docsOnlyPaths,
    };
    const result = await verifyWithRetry(card, verifyConfig, io);
    if (result.shipped) {
      return shipCard(cardId, card, result, state, resolved, io);
    }
    return escalateCard(cardId, 'verify_failed_twice', formatVerifyFailure(result), state, resolved, io);
  }

  if (sessionResult.outcome === 'needs_direction') {
    return escalateCard(cardId, 'needs_direction', sessionResult.finalText, state, resolved, io);
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

async function runDryRun(config: RunLoopConfig, io: LoopIO): Promise<LoopResult> {
  const state = await loadState(() => io.readFile(join(config.repoRoot, config.statePath)));
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

  const phase = await deriveCardPhase(
    nc.cardId,
    nc.card,
    {
      repoRoot: config.repoRoot,
      escalationsDir: config.escalationsDir,
      includeEscalated: config.includeEscalated,
    },
    io,
  );
  return { exitCode: EXIT_OK, processed: [], dryRunPlan: { cardId: nc.cardId, phase } };
}

/** The main loop, spec §D2/§D4/§D5 tied together: acquire the single-instance lock → STOP-file
 * check → retry any pending state commit → repeatedly derive-and-act on the next card, up to
 * `--max-cards`, stopping on `done`, an escalation, an unresumed session error/timeout, or a
 * STOP request. `--dry-run` short-circuits to `runDryRun` before any of this (no lock, no
 * writes, no session — see `runDryRun`'s own doc comment for why that is zero side effects
 * BY CONSTRUCTION, not merely by intent). */
export async function runLoop(config: RunLoopConfig, io: LoopIO): Promise<LoopResult> {
  if (config.dryRun) {
    return runDryRun(config, io);
  }

  const lockResult = acquireLock(io);
  if (!lockResult.ok) {
    return { exitCode: EXIT_LOCKED, processed: [], message: lockResult.reason };
  }

  try {
    if (isStopRequested(stopFilePathOf(config), io)) {
      return {
        exitCode: EXIT_OK,
        processed: [],
        message: 'STOP file present; exiting cleanly before processing any card.',
      };
    }

    const baseBranch = await resolveBaseBranch(io, config.repoRoot);
    const answersContent = String(await io.readFile(join(config.repoRoot, config.answersPath)));
    const resolved: ResolvedConfig = { ...config, baseBranch, answersContent };

    const pending = io.readPendingCommit();
    if (pending) {
      const retryResult = await commitState(
        pending.files,
        pending.title,
        githubConfigFor(resolved, pending.card),
        io,
      );
      if (retryResult.outcome === 'merged') {
        io.clearPendingCommit();
      }
    }

    const state = await loadState(() => io.readFile(join(config.repoRoot, config.statePath)));
    const processed: CardOutcome[] = [];
    let exitCode = EXIT_OK;
    const limit = config.maxCards ?? Infinity;

    for (let count = 0; count < limit; count++) {
      if (isStopRequested(stopFilePathOf(config), io)) {
        break;
      }

      const nc = filteredNextCard(state, config, io);
      if (nc.kind === 'done') break;

      if (nc.kind === 'planning_needed') {
        const outcome = await escalateCard(
          nc.cardId,
          'planning_needed',
          `Missing on disk: ${nc.missing.join(', ')}`,
          state,
          resolved,
          io,
        );
        processed.push(outcome);
        exitCode = EXIT_ESCALATED;
        break;
      }

      const phase = await deriveCardPhase(
        nc.cardId,
        nc.card,
        {
          repoRoot: resolved.repoRoot,
          escalationsDir: resolved.escalationsDir,
          includeEscalated: resolved.includeEscalated,
        },
        io,
      );

      if (phase.kind === 'escalation_pending') {
        return {
          exitCode: EXIT_ESCALATED,
          processed,
          message: `card ${nc.cardId}: answer pending at ${phase.escalationPath}`,
        };
      }

      const outcome = await actOnCard(nc.cardId, phase, state, resolved, io);
      processed.push(outcome);

      if (outcome.kind === 'escalated') {
        exitCode = EXIT_ESCALATED;
        break;
      }
      if (outcome.kind === 'stopped') {
        exitCode = EXIT_SESSION_INCOMPLETE;
        break;
      }
    }

    return { exitCode, processed };
  } finally {
    releaseLock(io);
  }
}

export { lockFilePath, stopFilePathOf, stateDirOf };
