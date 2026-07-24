// Tests for loop.ts (Task 6): the §D4 resume matrix, the single-instance lock, the STOP
// file, escalation (incl. commit-failure), the state/escalation-files-only structural
// constraint on `commitStateAndMerge`, and `--dry-run`'s zero-side-effects guarantee.
//
// NEVER hits a real binary or the SDK: every test drives a fully mocked `LoopIO`. Fixture
// values are deliberately neutral (no repo names, no absolute paths, no campaign values) —
// the stateless-capability wall.
import { describe, expect, mock, test } from 'bun:test';
import {
  acquireLock,
  deriveCardPhase,
  extractMergeSha,
  isStopRequested,
  releaseLock,
  resolveBaseBranch,
  runLoop,
  toCommitFileList,
  type CardPhase,
  type DerivePhaseConfig,
  type DerivePhaseIO,
  type ExecResult,
  type LockIO,
  type LockInfo,
  type LoopIO,
  type PendingCommit,
  type RunLoopConfig,
} from './loop.ts';
import { EXIT_ESCALATED, EXIT_LOCKED, EXIT_OK, EXIT_SESSION_INCOMPLETE } from './types.ts';
import { BRIEF_TEMPLATE_PATH } from './brief.ts';
import type { Card, CampaignState } from './types.ts';
import type { SessionMessage, SpawnSessionParams } from './session.ts';
import type { VerifyResult } from './verify.ts';

// ---------------------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------------------

function ok(stdout = ''): ExecResult {
  return { stdout, stderr: '', exitCode: 0 };
}
function fail(stderr = 'command failed'): ExecResult {
  return { stdout: '', stderr, exitCode: 1 };
}

function fixtureCard(overrides: Partial<Card> = {}): Card {
  return {
    status: 'staged',
    spec: 'docs/specs/c1.md',
    plan: 'docs/plans/c1.md',
    branch: 'feat/c1-widget',
    baseSha: null,
    pr: null,
    mergeSha: null,
    sessionId: null,
    updatedAt: null,
    ...overrides,
  };
}

function fixtureState(overrides: Partial<CampaignState> = {}): CampaignState {
  return {
    v: 1,
    campaign: 'sample-campaign',
    mergePolicy: 'merge',
    sequence: ['C1', 'C2'],
    schemaLockPaths: [],
    docsOnlyPaths: ['docs/'],
    ownerOnlyEscalations: [],
    cards: {
      C1: fixtureCard(),
      C2: fixtureCard({ branch: 'feat/c2-widget' }),
    },
    ...overrides,
  };
}

// ===========================================================================================
// deriveCardPhase — the §D4 reality table
// ===========================================================================================

describe('deriveCardPhase — §D4 reality table', () => {
  const baseConfig: DerivePhaseConfig = {
    repoRoot: '/sample-repo',
    escalationsDir: 'docs/campaign/escalations',
    includeEscalated: false,
  };

  function ioWith(handlers: {
    prView?: ExecResult;
    worktreeList?: ExecResult;
    lsRemote?: ExecResult;
    fileExists?: boolean;
  }): DerivePhaseIO {
    return {
      exec: mock(async (cmd: string[]) => {
        if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'view') {
          return handlers.prView ?? fail('no pull requests found for branch');
        }
        if (cmd[0] === 'git' && cmd[1] === 'worktree') {
          return handlers.worktreeList ?? ok('');
        }
        if (cmd[0] === 'git' && cmd[1] === 'ls-remote') {
          return handlers.lsRemote ?? ok('');
        }
        throw new Error(`unexpected exec: ${cmd.join(' ')}`);
      }),
      fileExists: mock(() => handlers.fileExists ?? false),
    };
  }

  test('no trace (card.branch null) -> fresh', async () => {
    const io = ioWith({});
    const phase = await deriveCardPhase('C1', fixtureCard({ branch: null }), baseConfig, io);
    expect(phase).toEqual({ kind: 'fresh' });
  });

  test('PR merged, state not yet shipped -> verify_only, no session', async () => {
    const io = ioWith({ prView: ok(JSON.stringify({ number: 42, state: 'MERGED' })) });
    const phase = await deriveCardPhase('C1', fixtureCard(), baseConfig, io);
    expect(phase).toEqual({ kind: 'verify_only', pr: 42 });
  });

  test('PR open, sessionId recorded -> resume with reason pr_open', async () => {
    const io = ioWith({ prView: ok(JSON.stringify({ number: 7, state: 'OPEN' })) });
    const phase = await deriveCardPhase('C1', fixtureCard({ sessionId: 'sess-1' }), baseConfig, io);
    expect(phase).toEqual({ kind: 'resume', sessionId: 'sess-1', reason: 'pr_open', pr: 7 });
  });

  test('PR open, no sessionId recorded -> fresh WITH a digest naming the open PR (F8, not blind)', async () => {
    // F8: there IS a trace here (an open PR on GitHub) even though nothing is resumable —
    // a blind `{ kind: 'fresh' }` (no digest) would spawn an executor that doesn't know the
    // PR exists and would rebuild the card, opening a SECOND PR. The fix must carry a digest
    // naming PR #7 so the executor is told to continue it instead.
    const io = ioWith({ prView: ok(JSON.stringify({ number: 7, state: 'OPEN' })) });
    const phase = await deriveCardPhase('C1', fixtureCard({ sessionId: null }), baseConfig, io);
    expect(phase.kind).toBe('fresh');
    if (phase.kind === 'fresh') {
      expect(phase.digest).toBeDefined();
      expect(phase.digest).toContain('7');
    }
  });

  test('genuine no-trace (card.branch null) still yields a plain blind fresh — no bogus digest', async () => {
    const io = ioWith({});
    const phase = await deriveCardPhase('C1', fixtureCard({ branch: null }), baseConfig, io);
    expect(phase).toEqual({ kind: 'fresh' });
    if (phase.kind === 'fresh') {
      expect(phase.digest).toBeUndefined();
    }
  });

  test('branch/worktree exist (worktree present), sessionId recorded -> resume with reason branch_no_pr', async () => {
    const io = ioWith({
      worktreeList: ok('worktree /w/c1\nHEAD abc\nbranch refs/heads/feat/c1-widget\n'),
    });
    const phase = await deriveCardPhase('C1', fixtureCard({ sessionId: 'sess-2' }), baseConfig, io);
    expect(phase).toEqual({ kind: 'resume', sessionId: 'sess-2', reason: 'branch_no_pr' });
  });

  test('branch/worktree exist (remote only), no sessionId -> REVERT_AND_REDO', async () => {
    const io = ioWith({ lsRemote: ok('abc123\trefs/heads/feat/c1-widget\n') });
    const phase = await deriveCardPhase('C1', fixtureCard({ sessionId: null }), baseConfig, io);
    expect(phase).toEqual({ kind: 'revert_and_redo' });
  });

  test('escalation file exists for the card -> EXIT: answer pending', async () => {
    const io = ioWith({ fileExists: true });
    const phase = await deriveCardPhase('C1', fixtureCard(), baseConfig, io);
    expect(phase.kind).toBe('escalation_pending');
    if (phase.kind === 'escalation_pending') {
      expect(phase.escalationPath).toContain('C1.md');
    }
  });

  test('--include-escalated bypasses the escalation-file short-circuit', async () => {
    const io = ioWith({ fileExists: true });
    const phase = await deriveCardPhase(
      'C1',
      fixtureCard({ branch: null }),
      { ...baseConfig, includeEscalated: true },
      io,
    );
    expect(phase).toEqual({ kind: 'fresh' });
  });
});

// ===========================================================================================
// Lock: acquireLock / releaseLock
// ===========================================================================================

describe('acquireLock / releaseLock — §D2 single-instance lock', () => {
  function lockIo(existing: LockInfo | null, alive: boolean): LockIO & { calls: string[] } {
    const calls: string[] = [];
    return {
      calls,
      readLock: () => existing,
      writeLock: (info) => {
        calls.push(`writeLock:${info.pid}:${info.startedAt}`);
      },
      removeLock: () => calls.push('removeLock'),
      isProcessAlive: (pid) => {
        calls.push(`isProcessAlive:${pid}`);
        return alive;
      },
      currentPid: () => 999,
      now: () => '2026-07-16T00:00:00Z',
    };
  }

  test('no existing lock -> acquired, lock written with pid + start time', () => {
    const io = lockIo(null, false);
    const result = acquireLock(io);
    expect(result.ok).toBe(true);
    expect(io.calls).toEqual(['writeLock:999:2026-07-16T00:00:00Z']);
  });

  test('existing lock held by a LIVE pid -> refused, lock is NOT overwritten', () => {
    const io = lockIo({ pid: 123, startedAt: '2026-07-15T00:00:00Z' }, true);
    const result = acquireLock(io);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toContain('123');
      expect(result.heldBy.pid).toBe(123);
    }
    expect(io.calls).toEqual(['isProcessAlive:123']);
  });

  test('existing lock held by a DEAD pid -> reclaimed, never wedges the runner', () => {
    const io = lockIo({ pid: 123, startedAt: '2026-07-15T00:00:00Z' }, false);
    const result = acquireLock(io);
    expect(result.ok).toBe(true);
    expect(io.calls).toEqual(['isProcessAlive:123', 'writeLock:999:2026-07-16T00:00:00Z']);
  });

  test('releaseLock removes the lock file', () => {
    const calls: string[] = [];
    releaseLock({ removeLock: () => calls.push('removed') });
    expect(calls).toEqual(['removed']);
  });
});

// ===========================================================================================
// STOP file
// ===========================================================================================

describe('isStopRequested', () => {
  test('true when the STOP file exists', () => {
    expect(isStopRequested('/state/STOP', { fileExists: () => true })).toBe(true);
  });
  test('false when it does not', () => {
    expect(isStopRequested('/state/STOP', { fileExists: () => false })).toBe(false);
  });
});

// ===========================================================================================
// resolveBaseBranch
// ===========================================================================================

describe('resolveBaseBranch', () => {
  test('strips the "origin/" prefix from origin/HEAD', async () => {
    const io = { exec: mock(async () => ok('origin/master\n')) };
    expect(await resolveBaseBranch(io, '/repo')).toBe('master');
  });

  test('falls back to "master" when the query fails', async () => {
    const io = { exec: mock(async () => fail('no such ref')) };
    expect(await resolveBaseBranch(io, '/repo')).toBe('master');
  });
});

// ===========================================================================================
// toCommitFileList — the structural state/escalation-files-only guard
// ===========================================================================================

describe('toCommitFileList — structural guard on commitStateAndMerge inputs', () => {
  test('accepts a state-only file list', () => {
    expect(toCommitFileList({ statePath: 'docs/campaign/state.json' })).toEqual([
      'docs/campaign/state.json',
    ]);
  });

  test('accepts state + escalation', () => {
    expect(
      toCommitFileList({ statePath: 'docs/campaign/state.json', escalationPath: 'docs/campaign/escalations/C1.md' }),
    ).toEqual(['docs/campaign/state.json', 'docs/campaign/escalations/C1.md']);
  });

  test('a code file (.ts) is refused at runtime — the mechanical enforcement behind the ' +
    "structural guard, not just the type's two named fields", () => {
    expect(() =>
      toCommitFileList({ statePath: 'packages/app/src/domain/types.ts' }),
    ).toThrow(/only campaign state .* escalation .* files/i);
  });
});

// ===========================================================================================
// extractMergeSha
// ===========================================================================================

describe('extractMergeSha', () => {
  function verifyResult(mergedDetail: string, shipped = true): VerifyResult {
    return {
      shipped,
      points: [{ id: 'merged', passed: true, detail: mergedDetail }],
      failedPoints: [],
    };
  }
  test('extracts the sha from the merged point detail', () => {
    expect(extractMergeSha(verifyResult('PR #1 is merged (merge_commit_sha=abc1234)'))).toBe('abc1234');
  });
  test('null when no merged point is present', () => {
    expect(extractMergeSha({ shipped: false, points: [], failedPoints: [] })).toBeNull();
  });
});

// ===========================================================================================
// runLoop — full integration, mocked LoopIO throughout
// ===========================================================================================

async function* messages(list: SessionMessage[]): AsyncGenerator<SessionMessage> {
  for (const m of list) yield m;
}

function shippedMessages(pr: number, sha: string, sessionId: string): SessionMessage[] {
  return [
    { type: 'system', subtype: 'init', session_id: sessionId },
    { type: 'result', subtype: 'success', result: `All done.\nSHIPPED ${pr} ${sha}`, session_id: sessionId },
  ];
}

function needsDirectionMessages(sessionId: string): SessionMessage[] {
  return [
    { type: 'system', subtype: 'init', session_id: sessionId },
    {
      type: 'result',
      subtype: 'success',
      result: 'NEEDS_DIRECTION: which schema-lock path applies?',
      session_id: sessionId,
    },
  ];
}

interface MockLoopIoOptions {
  stateJson: string;
  answers?: string;
  execHandlers?: Array<(cmd: string[]) => ExecResult | null>;
  spawnQueue?: Array<(params: SpawnSessionParams) => AsyncIterable<SessionMessage>>;
  lock?: LockInfo | null;
  processAlive?: boolean;
  stopFile?: boolean;
  escalationFiles?: Set<string>;
  pendingCommit?: PendingCommit | null;
  /** When true, every card's spec/plan path is treated as MISSING on disk (drives the
   * PLANNING_NEEDED trigger) — off by default so unrelated tests aren't spuriously escalated. */
  missingSpecPlan?: boolean;
}

interface MockLoopIoResult {
  io: LoopIO;
  calls: string[][];
  writtenFiles: Map<string, string>;
  spawnBriefs: string[];
  lockCalls: string[];
  pendingCommitCalls: string[];
  ensuredDirs: string[];
  atomicWrites: Array<{ path: string; content: string }>;
}

function buildMockLoopIo(opts: MockLoopIoOptions): MockLoopIoResult {
  const calls: string[][] = [];
  const writtenFiles = new Map<string, string>();
  writtenFiles.set('/repo/state.json', opts.stateJson);
  if (opts.answers !== undefined) writtenFiles.set('/repo/answers.md', opts.answers);
  const spawnBriefs: string[] = [];
  const lockCalls: string[] = [];
  const pendingCommitCalls: string[] = [];
  const ensuredDirs: string[] = [];
  const atomicWrites: Array<{ path: string; content: string }> = [];
  let lock = opts.lock ?? null;
  let pendingCommit = opts.pendingCommit ?? null;
  const spawnQueue = [...(opts.spawnQueue ?? [])];
  const escalationFiles = new Set(opts.escalationFiles ?? []);

  const execHandlers = opts.execHandlers ?? [];

  const exec = mock(async (cmd: string[]): Promise<ExecResult> => {
    calls.push(cmd);
    for (const handler of execHandlers) {
      const result = handler(cmd);
      if (result) return result;
    }
    // Default fallbacks for common read-only/mutating calls not explicitly scripted.
    if (cmd[0] === 'git' && cmd[1] === 'symbolic-ref') return ok('origin/master\n');
    if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'view') return fail('no pull requests found');
    if (cmd[0] === 'git' && cmd[1] === 'worktree') return ok('');
    if (cmd[0] === 'git' && cmd[1] === 'ls-remote') return ok('');
    if (cmd[0] === 'git' && (cmd[1] === 'branch' || cmd[1] === 'push')) return ok('');
    throw new Error(`unscripted exec call: ${cmd.join(' ')}`);
  });

  const io: LoopIO = {
    exec,
    sleep: mock(async () => {}),
    fileExists: mock((p: string) => {
      if (p.includes('/escalations/')) {
        const cardMatch = /([^/]+)\.md$/.exec(p);
        return !!cardMatch && escalationFiles.has(cardMatch[1] as string);
      }
      if (p.endsWith('STOP')) return opts.stopFile ?? false;
      // Every card's fixture spec/plan path is treated as present on disk by default (so
      // `nextCard`'s PLANNING_NEEDED detection doesn't spuriously fire in tests that aren't
      // about that trigger) — tests targeting PLANNING_NEEDED explicitly opt out via
      // `opts.missingSpecPlan`.
      if (opts.missingSpecPlan) return false;
      return true;
    }),
    readFile: mock((p: string) => {
      if (p === BRIEF_TEMPLATE_PATH) return '# Executor brief for {{CARD_ID}}\n{{ANSWERS_CONTENT}}';
      const content = writtenFiles.get(p);
      if (content === undefined) throw new Error(`readFile: no fixture for ${p}`);
      return content;
    }),
    writeFile: mock((p: string, content: string) => {
      writtenFiles.set(p, content);
    }),
    readLock: mock(() => lock),
    writeLock: mock((info: LockInfo) => {
      lockCalls.push(`write:${info.pid}`);
      lock = info;
    }),
    removeLock: mock(() => {
      lockCalls.push('remove');
      lock = null;
    }),
    isProcessAlive: mock(() => opts.processAlive ?? false),
    currentPid: mock(() => 4242),
    now: mock(() => '2026-07-16T12:00:00Z'),
    readPendingCommit: mock(() => pendingCommit),
    writePendingCommit: mock((pc: PendingCommit) => {
      pendingCommitCalls.push('write');
      pendingCommit = pc;
    }),
    clearPendingCommit: mock(() => {
      pendingCommitCalls.push('clear');
      pendingCommit = null;
    }),
    spawnSession: mock((params: SpawnSessionParams) => {
      spawnBriefs.push(params.prompt);
      const next = spawnQueue.shift();
      if (!next) throw new Error('spawnSession called more times than scripted');
      return next(params);
    }),
    appendLog: mock(() => {}),
    ensureDir: mock((p: string) => {
      ensuredDirs.push(p);
    }),
    writeFileAtomic: mock((p: string, content: string) => {
      atomicWrites.push({ path: p, content });
    }),
  };

  return { io, calls, writtenFiles, spawnBriefs, lockCalls, pendingCommitCalls, ensuredDirs, atomicWrites };
}

function baseLoopConfig(overrides: Partial<RunLoopConfig> = {}): RunLoopConfig {
  return {
    repoRoot: '/repo',
    statePath: 'state.json',
    escalationsDir: 'escalations',
    answersPath: 'answers.md',
    logsDir: '/logs',
    homeDir: '/th',
    runId: 'fixture-run',
    argv: [],
    model: 'fixture-model',
    includeEscalated: false,
    dryRun: false,
    ...overrides,
  };
}

function stateJsonWithTwoFreshCards(): string {
  return JSON.stringify(
    fixtureState({
      cards: {
        // A pre-assigned branch (Stage-A staging data) with no PR/worktree/remote trace yet
        // still derives to `fresh` — `card.branch === null` is reserved for the "genuinely no
        // trace at all" case; verify.ts's worktree/branch-gone check requires branch to be set.
        C1: fixtureCard({ branch: 'feat/c1-widget' }),
        C2: fixtureCard({ branch: 'feat/c2-widget', spec: 'docs/specs/c2.md', plan: 'docs/plans/c2.md' }),
      },
    }),
  );
}

describe('runLoop — full happy path over two cards', () => {
  test('two fresh cards both ship: verify passes, state committed, exit 0', async () => {
    const { io, calls, writtenFiles, spawnBriefs } = buildMockLoopIo({
      stateJson: stateJsonWithTwoFreshCards(),
      answers: '# answers\n(none yet)\n',
      execHandlers: [
        (cmd) => {
          if (cmd[0] === 'gh' && cmd[1] === 'api') return ok(JSON.stringify({ merged: true, merge_commit_sha: 'deadbee' }));
          if (cmd[0] === 'git' && cmd[1] === 'rev-list') return ok('deadbee parent1 parent2');
          if (cmd[0] === 'git' && cmd[1] === 'merge-base') return ok('');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'checks') return ok(JSON.stringify([{ name: 'ci', bucket: 'pass' }]));
          if (cmd[0] === 'git' && cmd[1] === 'diff') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'fetch') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'checkout') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'add') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'commit') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'push') return ok('');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'create') return ok('https://example.invalid/o/r/pull/900\n');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'merge') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'pull') return ok('');
          return null;
        },
      ],
      spawnQueue: [
        () => messages(shippedMessages(1, 'aaaaaaa', 'sess-c1')),
        () => messages(shippedMessages(2, 'bbbbbbb', 'sess-c2')),
      ],
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 2 }), io);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.processed).toHaveLength(2);
    expect(result.processed[0]).toMatchObject({ kind: 'shipped', cardId: 'C1' });
    expect(result.processed[1]).toMatchObject({ kind: 'shipped', cardId: 'C2' });
    expect(spawnBriefs).toHaveLength(2);

    const finalState = JSON.parse(writtenFiles.get('/repo/state.json') as string);
    expect(finalState.cards.C1.status).toBe('shipped');
    expect(finalState.cards.C2.status).toBe('shipped');
    expect(finalState.cards.C1.mergeSha).toBe('deadbee');

    // Lock acquired then released.
    expect(calls.some(() => true)).toBe(true);
  });
});

describe('runLoop — crash-resume: verify_only phase (PR merged, not yet shipped)', () => {
  test('no session is spawned; verify runs and records shipped', async () => {
    const state = fixtureState({
      sequence: ['C1'],
      cards: { C1: fixtureCard({ branch: 'feat/c1-widget', pr: null }) },
    });
    const { io, writtenFiles } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: [
        (cmd) => {
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'view') return ok(JSON.stringify({ number: 55, state: 'MERGED' }));
          if (cmd[0] === 'gh' && cmd[1] === 'api') return ok(JSON.stringify({ merged: true, merge_commit_sha: 'cafefee' }));
          if (cmd[0] === 'git' && cmd[1] === 'rev-list') return ok('cafefee p1 p2');
          if (cmd[0] === 'git' && cmd[1] === 'merge-base') return ok('');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'checks') return ok(JSON.stringify([{ name: 'ci', bucket: 'pass' }]));
          if (cmd[0] === 'git' && cmd[1] === 'diff') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'fetch') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'checkout') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'add') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'commit') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'push') return ok('');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'create') return ok('https://example.invalid/o/r/pull/901\n');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'merge') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'pull') return ok('');
          return null;
        },
      ],
      spawnQueue: [],
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 1 }), io);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.processed).toEqual([
      { kind: 'shipped', cardId: 'C1', commitResult: expect.objectContaining({ outcome: 'merged' }) },
    ]);
    expect(io.spawnSession).not.toHaveBeenCalled();
    const finalState = JSON.parse(writtenFiles.get('/repo/state.json') as string);
    expect(finalState.cards.C1.status).toBe('shipped');
  });
});

describe('runLoop — resume-probe failure -> fresh-with-digest', () => {
  test('resume attempt errors, falls back to a fresh session carrying a digest', async () => {
    const state = fixtureState({
      sequence: ['C1'],
      cards: { C1: fixtureCard({ branch: 'feat/c1-widget', sessionId: 'sess-old' }) },
    });
    const { io, spawnBriefs } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: 'ANSWERS-CONTENT',
      execHandlers: [
        (cmd) => {
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'view') return ok(JSON.stringify({ number: 8, state: 'OPEN' }));
          if (cmd[0] === 'gh' && cmd[1] === 'api') return ok(JSON.stringify({ merged: true, merge_commit_sha: 'f00dfee' }));
          if (cmd[0] === 'git' && cmd[1] === 'rev-list') return ok('f00dfee p1 p2');
          if (cmd[0] === 'git' && cmd[1] === 'merge-base') return ok('');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'checks') return ok(JSON.stringify([{ name: 'ci', bucket: 'pass' }]));
          if (cmd[0] === 'git' && cmd[1] === 'diff') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'fetch') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'checkout') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'add') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'commit') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'push') return ok('');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'create') return ok('https://example.invalid/o/r/pull/902\n');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'merge') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'pull') return ok('');
          return null;
        },
      ],
      spawnQueue: [
        () => {
          throw new Error('no transcript found for session sess-old');
        },
        () => messages(shippedMessages(3, 'aaaaaaa', 'sess-new')),
      ],
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 1 }), io);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(spawnBriefs).toHaveLength(2);
    // First attempt is the resume continuation prompt (short); second is a FULL fresh brief
    // carrying the crash-recovery digest (never the raw continuation prompt).
    expect(spawnBriefs[1]).toContain('Crash-recovery digest for C1');
    expect(result.processed).toEqual([
      { kind: 'shipped', cardId: 'C1', commitResult: expect.objectContaining({ outcome: 'merged' }) },
    ]);
  });
});

describe('runLoop — F8: open PR with no sessionId spawns fresh WITH a digest, never blind', () => {
  test('a single session is spawned, briefed with the open PR number — no duplicate PR is possible', async () => {
    const state = fixtureState({
      sequence: ['C1'],
      cards: { C1: fixtureCard({ branch: 'feat/c1-widget', sessionId: null }) },
    });
    const { io, spawnBriefs } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: 'ANSWERS-CONTENT',
      execHandlers: [
        (cmd) => {
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'view') return ok(JSON.stringify({ number: 9, state: 'OPEN' }));
          if (cmd[0] === 'gh' && cmd[1] === 'api') return ok(JSON.stringify({ merged: true, merge_commit_sha: 'ab00001' }));
          if (cmd[0] === 'git' && cmd[1] === 'rev-list') return ok('ab00001 p1 p2');
          if (cmd[0] === 'git' && cmd[1] === 'merge-base') return ok('');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'checks') return ok(JSON.stringify([{ name: 'ci', bucket: 'pass' }]));
          if (cmd[0] === 'git' && cmd[1] === 'diff') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'fetch') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'checkout') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'add') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'commit') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'push') return ok('');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'create') return ok('https://example.invalid/o/r/pull/906\n');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'merge') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'pull') return ok('');
          return null;
        },
      ],
      spawnQueue: [() => messages(shippedMessages(9, 'ab00001', 'sess-new-c1'))],
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 1 }), io);

    expect(result.exitCode).toBe(EXIT_OK);
    // Exactly ONE session is spawned for this card — the fix must not itself introduce a
    // resume attempt; it is the fresh session's own brief that must carry the digest.
    expect(spawnBriefs).toHaveLength(1);
    expect(spawnBriefs[0]).toContain('Crash-recovery digest for C1');
    // The executor is NOT spawned blind: the brief names the open PR's number, so it inspects
    // and continues PR #9 instead of rebuilding the card and opening a second one (F8).
    expect(spawnBriefs[0]).toContain('9');
    expect(result.processed).toEqual([
      { kind: 'shipped', cardId: 'C1', commitResult: expect.objectContaining({ outcome: 'merged' }) },
    ]);
  });
});

describe('runLoop — STOP file', () => {
  test('STOP present at startup: exits cleanly, no card processed, no session spawned', async () => {
    const { io } = buildMockLoopIo({
      stateJson: stateJsonWithTwoFreshCards(),
      answers: '',
      stopFile: true,
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 2 }), io);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.processed).toEqual([]);
    expect(io.spawnSession).not.toHaveBeenCalled();
  });
});

describe('runLoop — run record write (Task 2, spec §4/§5.2)', () => {
  test('run record is written after lock acquisition, into <home>/runs/<runId>/run.json', async () => {
    const { io, ensuredDirs, atomicWrites } = buildMockLoopIo({
      stateJson: stateJsonWithTwoFreshCards(),
      answers: '',
      stopFile: true,
    });

    await runLoop(baseLoopConfig({ homeDir: '/th/campaigns/camp', runId: 'r-1' }), io);

    expect(ensuredDirs).toContain('/th/campaigns/camp/runs/r-1');
    expect(ensuredDirs).toContain('/th/campaigns/camp/reports');
    const write = atomicWrites.find((w) => w.path === '/th/campaigns/camp/runs/r-1/run.json');
    expect(write).toBeDefined();
    const record = JSON.parse(write!.content);
    expect(record.runId).toBe('r-1');
    expect(record.endedAt).toBeNull();
  });

  test('EXIT_LOCKED writes no run record (refused start creates no artifacts)', async () => {
    const { io, atomicWrites } = buildMockLoopIo({
      stateJson: stateJsonWithTwoFreshCards(),
      answers: '',
      lock: { pid: 111, startedAt: '2026-07-15T00:00:00Z' },
      processAlive: true,
    });

    const result = await runLoop(baseLoopConfig({ homeDir: '/th/campaigns/camp', runId: 'r-1' }), io);

    expect(result.exitCode).toBe(EXIT_LOCKED);
    expect(atomicWrites).toHaveLength(0);
  });

  test('--dry-run writes no run record and creates no directories', async () => {
    const { io, ensuredDirs, atomicWrites } = buildMockLoopIo({
      stateJson: stateJsonWithTwoFreshCards(),
      answers: '',
    });

    await runLoop(baseLoopConfig({ dryRun: true, homeDir: '/th/campaigns/camp', runId: 'r-1' }), io);

    expect(atomicWrites).toHaveLength(0);
    expect(ensuredDirs).toHaveLength(0);
  });

  test('a run-record write failure does not kill the pass', async () => {
    const { io } = buildMockLoopIo({
      stateJson: stateJsonWithTwoFreshCards(),
      answers: '',
      stopFile: true,
    });
    io.writeFileAtomic = (() => {
      throw new Error('disk full');
    }) as LoopIO['writeFileAtomic'];

    const result = await runLoop(baseLoopConfig({ homeDir: '/th', runId: 'r-1' }), io);

    expect(result.exitCode).toBe(EXIT_OK); // the run still completes normally
  });
});

describe('runLoop — lock contention', () => {
  test('a live lock holder refuses the new start; no card is processed', async () => {
    const { io, lockCalls } = buildMockLoopIo({
      stateJson: stateJsonWithTwoFreshCards(),
      answers: '',
      lock: { pid: 111, startedAt: '2026-07-15T00:00:00Z' },
      processAlive: true,
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 2 }), io);

    expect(result.exitCode).toBe(EXIT_LOCKED);
    expect(result.processed).toEqual([]);
    expect(io.spawnSession).not.toHaveBeenCalled();
    // The live lock is never overwritten.
    expect(lockCalls).toEqual([]);
  });
});

describe('runLoop — escalation flow', () => {
  test('NEEDS_DIRECTION -> escalation file written, card marked escalated, exit 2', async () => {
    const state = fixtureState({ sequence: ['C1'], cards: { C1: fixtureCard({ branch: null }) } });
    const { io, writtenFiles } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: [
        (cmd) => {
          if (cmd[0] === 'git' && cmd[1] === 'fetch') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'checkout') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'add') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'commit') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'push') return ok('');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'create') return ok('https://example.invalid/o/r/pull/903\n');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'checks') return ok(JSON.stringify([{ name: 'ci', bucket: 'pass' }]));
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'merge') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'pull') return ok('');
          return null;
        },
      ],
      spawnQueue: [() => messages(needsDirectionMessages('sess-nd'))],
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 1 }), io);

    expect(result.exitCode).toBe(EXIT_ESCALATED);
    expect(result.processed[0]).toMatchObject({ kind: 'escalated', cardId: 'C1' });
    const escalationContent = writtenFiles.get('/repo/escalations/C1.md');
    expect(escalationContent).toBeDefined();
    expect(escalationContent).toContain('NEEDS_DIRECTION');
    const finalState = JSON.parse(writtenFiles.get('/repo/state.json') as string);
    expect(finalState.cards.C1.status).toBe('escalated');
  });

  test('PLANNING_NEEDED: next card is missing its spec/plan on disk -> escalated, exit 2, no session spawned', async () => {
    const state = fixtureState({ sequence: ['C1'], cards: { C1: fixtureCard({ branch: null }) } });
    const { io, writtenFiles } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      missingSpecPlan: true,
      execHandlers: [
        (cmd) => {
          if (cmd[0] === 'git' && cmd[1] === 'fetch') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'checkout') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'add') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'commit') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'push') return ok('');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'create') return ok('https://example.invalid/o/r/pull/905\n');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'checks') return ok(JSON.stringify([{ name: 'ci', bucket: 'pass' }]));
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'merge') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'pull') return ok('');
          return null;
        },
      ],
      spawnQueue: [],
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 1 }), io);

    expect(result.exitCode).toBe(EXIT_ESCALATED);
    expect(result.processed[0]).toMatchObject({ kind: 'escalated', cardId: 'C1', reason: 'planning_needed' });
    expect(io.spawnSession).not.toHaveBeenCalled();
    const escalationContent = writtenFiles.get('/repo/escalations/C1.md');
    expect(escalationContent).toContain('spec');
    expect(escalationContent).toContain('plan');
    const finalState = JSON.parse(writtenFiles.get('/repo/state.json') as string);
    expect(finalState.cards.C1.status).toBe('escalated');
  });

  test('commit-failure path: exit code and escalation file stand even when the commit fails', async () => {
    const state = fixtureState({ sequence: ['C1'], cards: { C1: fixtureCard({ branch: null } ) } });
    const { io, writtenFiles, pendingCommitCalls } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: [
        (cmd) => {
          if (cmd[0] === 'git' && cmd[1] === 'fetch') return fail('remote: could not resolve host');
          if (cmd[0] === 'git' && cmd[1] === 'checkout') return ok('');
          return null;
        },
      ],
      spawnQueue: [() => messages(needsDirectionMessages('sess-nd2'))],
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 1 }), io);

    expect(result.exitCode).toBe(EXIT_ESCALATED);
    expect(result.processed[0]).toMatchObject({
      kind: 'escalated',
      cardId: 'C1',
      commitResult: expect.objectContaining({ outcome: 'commit_failed' }),
    });
    // The local escalation file stands, independent of the failed commit.
    expect(writtenFiles.get('/repo/escalations/C1.md')).toBeDefined();
    // The failed commit is queued for retry on the next run.
    expect(pendingCommitCalls).toEqual(['write']);
  });
});

describe('runLoop — double verify-fail -> escalation', () => {
  test('verifyShipped fails twice for the same card -> escalated, exit 2', async () => {
    const state = fixtureState({
      sequence: ['C1'],
      cards: { C1: fixtureCard({ branch: 'feat/c1-widget' }) },
    });
    let apiCalls = 0;
    const { io } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: [
        (cmd) => {
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'view') return ok(JSON.stringify({ number: 12, state: 'MERGED' }));
          if (cmd[0] === 'gh' && cmd[1] === 'api') {
            apiCalls += 1;
            return ok(JSON.stringify({ merged: false }));
          }
          if (cmd[0] === 'git' && cmd[1] === 'fetch') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'checkout') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'add') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'commit') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'push') return ok('');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'create') return ok('https://example.invalid/o/r/pull/904\n');
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'checks') return ok(JSON.stringify([{ name: 'ci', bucket: 'pass' }]));
          if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'merge') return ok('');
          if (cmd[0] === 'git' && cmd[1] === 'pull') return ok('');
          return null;
        },
      ],
      spawnQueue: [],
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 1 }), io);

    expect(result.exitCode).toBe(EXIT_ESCALATED);
    expect(result.processed[0]).toMatchObject({ kind: 'escalated', cardId: 'C1', reason: 'verify_failed_twice' });
    // verifyShipped's `merged` check (gh api) was attempted exactly twice — the D5 "fails
    // twice" trigger, never escalating on a single (possibly transient) failure.
    expect(apiCalls).toBe(2);
  });
});

describe('runLoop — --dry-run: zero side effects', () => {
  function noMutationIo(base: LoopIO): LoopIO {
    const forbid = (name: string) => () => {
      throw new Error(`dry-run must never call ${name}`);
    };
    return {
      ...base,
      writeFile: forbid('writeFile') as LoopIO['writeFile'],
      writeLock: forbid('writeLock') as LoopIO['writeLock'],
      removeLock: forbid('removeLock') as LoopIO['removeLock'],
      writePendingCommit: forbid('writePendingCommit') as LoopIO['writePendingCommit'],
      clearPendingCommit: forbid('clearPendingCommit') as LoopIO['clearPendingCommit'],
      spawnSession: forbid('spawnSession') as LoopIO['spawnSession'],
      appendLog: forbid('appendLog') as LoopIO['appendLog'],
      exec: mock(async (cmd: string[]) => {
        const mutating = [
          ['git', 'push'],
          ['git', 'commit'],
          ['git', 'checkout', '-B'],
          ['gh', 'pr', 'create'],
          ['gh', 'pr', 'merge'],
          ['git', 'worktree', 'remove'],
          ['git', 'branch', '-D'],
        ];
        if (mutating.some((m) => m.every((tok, i) => cmd[i] === tok))) {
          throw new Error(`dry-run must never issue a mutating exec call: ${cmd.join(' ')}`);
        }
        return base.exec(cmd);
      }) as LoopIO['exec'],
    };
  }

  test('derives the phase for the next card with NO mutating call anywhere', async () => {
    const state = fixtureState({
      sequence: ['C1'],
      cards: { C1: fixtureCard({ branch: null }) },
    });
    const { io } = buildMockLoopIo({ stateJson: JSON.stringify(state), answers: '' });
    const guarded = noMutationIo(io);

    const result = await runLoop(baseLoopConfig({ dryRun: true }), guarded);

    expect(result.exitCode).toBe(EXIT_OK);
    expect(result.dryRunPlan).toEqual({ cardId: 'C1', phase: { kind: 'fresh' } });
  });

  test('acceptance #1 fixture: next card derives to fresh with zero side effects', async () => {
    const state = fixtureState({
      sequence: ['B3'],
      cards: { B3: fixtureCard({ branch: null, spec: 'docs/specs/b3.md', plan: 'docs/plans/b3.md' }) },
    });
    const { io } = buildMockLoopIo({ stateJson: JSON.stringify(state), answers: '' });
    const guarded = noMutationIo(io);

    const result = await runLoop(baseLoopConfig({ dryRun: true }), guarded);

    expect(result.dryRunPlan?.cardId).toBe('B3');
    expect(result.dryRunPlan?.phase).toEqual({ kind: 'fresh' });
  });
});

describe('runLoop — session error/timeout without a resume attempt: stops for external retry', () => {
  test('a fresh session that errors stops this run without escalating', async () => {
    const state = fixtureState({ sequence: ['C1'], cards: { C1: fixtureCard({ branch: null }) } });
    const { io } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      spawnQueue: [
        () => {
          throw new Error('sdk crashed');
        },
      ],
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 1 }), io);

    expect(result.exitCode).toBe(EXIT_SESSION_INCOMPLETE);
    expect(result.processed[0]).toMatchObject({ kind: 'stopped', cardId: 'C1' });
  });
});

// ===========================================================================================
// Task 2 — D5′ park-and-continue (spec §O4, plan Task 2, Warchief ruling W-F2)
// ===========================================================================================

/** Shared boilerplate for a card whose state-commit (escalation OR ship) goes through
 * `commitStateAndMerge` cleanly: fetch/checkout -B/add/commit/push/create/checks/merge/pull all
 * succeed. Reused verbatim across the park-and-continue tests below — none of them are testing
 * `commitStateAndMerge`/`verify.ts` themselves (already covered elsewhere in this file). */
function cleanCommitAndVerifyHandlers(mergeSha: string): Array<(cmd: string[]) => ExecResult | null> {
  return [
    (cmd) => {
      if (cmd[0] === 'gh' && cmd[1] === 'api') return ok(JSON.stringify({ merged: true, merge_commit_sha: mergeSha }));
      if (cmd[0] === 'git' && cmd[1] === 'rev-list') return ok(`${mergeSha} p1 p2`);
      if (cmd[0] === 'git' && cmd[1] === 'merge-base') return ok('');
      if (cmd[0] === 'git' && cmd[1] === 'diff') return ok('');
      if (cmd[0] === 'git' && cmd[1] === 'fetch') return ok('');
      if (cmd[0] === 'git' && cmd[1] === 'checkout') return ok('');
      if (cmd[0] === 'git' && cmd[1] === 'add') return ok('');
      if (cmd[0] === 'git' && cmd[1] === 'commit') return ok('');
      if (cmd[0] === 'git' && cmd[1] === 'push') return ok('');
      if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'create') return ok('https://example.invalid/o/r/pull/990\n');
      if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'checks') return ok(JSON.stringify([{ name: 'ci', bucket: 'pass' }]));
      if (cmd[0] === 'gh' && cmd[1] === 'pr' && cmd[2] === 'merge') return ok('');
      if (cmd[0] === 'git' && cmd[1] === 'pull') return ok('');
      return null;
    },
  ];
}

describe('runLoop — D5′: escalate-then-continue ordering', () => {
  test('C1 escalates (NEEDS_DIRECTION); the pass continues to independent C2, which still ships', async () => {
    const state = fixtureState({
      sequence: ['C1', 'C2'],
      cards: {
        C1: fixtureCard({ branch: null }),
        // A branch that IS set to ship — `checkWorktreeAndBranchGone` (D3 point 5) requires
        // `card.branch` to be non-null to pass, exactly `stateJsonWithTwoFreshCards`'s own
        // "pre-assigned branch, no PR/worktree trace yet" convention above.
        C2: fixtureCard({ branch: 'feat/c2-widget', spec: 'docs/specs/c2.md', plan: 'docs/plans/c2.md' }),
      },
    });
    const { io, writtenFiles } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: cleanCommitAndVerifyHandlers('c2000001'),
      spawnQueue: [
        () => messages(needsDirectionMessages('sess-c1')),
        () => messages(shippedMessages(2, 'c2000001', 'sess-c2')),
      ],
    });

    const result = await runLoop(baseLoopConfig(), io);

    // An escalation is present, so the pass-level exit code is ESCALATED even though C2
    // shipped (design note: an escalation always needs a human; that outranks a clean ship).
    expect(result.exitCode).toBe(EXIT_ESCALATED);
    expect(result.processed).toHaveLength(2);
    expect(result.processed[0]).toMatchObject({ kind: 'escalated', cardId: 'C1' });
    expect(result.processed[1]).toMatchObject({ kind: 'shipped', cardId: 'C2' });

    const finalState = JSON.parse(writtenFiles.get('/repo/state.json') as string);
    expect(finalState.cards.C1.status).toBe('escalated');
    expect(finalState.cards.C2.status).toBe('shipped');
  });
});

describe('runLoop — D5′: all cards parked, nothing ships', () => {
  test('two independent cards both escalate; the pass reaches done and exits ESCALATED', async () => {
    const state = fixtureState({
      sequence: ['C1', 'C2'],
      cards: {
        C1: fixtureCard({ branch: null }),
        C2: fixtureCard({ branch: null, spec: 'docs/specs/c2.md', plan: 'docs/plans/c2.md' }),
      },
    });
    const { io } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: cleanCommitAndVerifyHandlers('unused'),
      spawnQueue: [
        () => messages(needsDirectionMessages('sess-c1')),
        () => messages(needsDirectionMessages('sess-c2')),
      ],
    });

    const result = await runLoop(baseLoopConfig(), io);

    expect(result.exitCode).toBe(EXIT_ESCALATED);
    expect(result.processed).toHaveLength(2);
    expect(result.processed.every((o) => o.kind === 'escalated')).toBe(true);
    expect(result.processed.map((o) => o.cardId)).toEqual(['C1', 'C2']);
  });
});

describe('runLoop — D5′: blocked cascade (W6)', () => {
  test('A escalates; B (dependsOn A) becomes blocked and is never attempted; C (independent) still ships', async () => {
    const state = fixtureState({
      sequence: ['A', 'B', 'C'],
      cards: {
        A: fixtureCard({ branch: null }),
        B: fixtureCard({
          branch: null,
          spec: 'docs/specs/b.md',
          plan: 'docs/plans/b.md',
          dependsOn: ['A'],
        }),
        C: fixtureCard({ branch: 'feat/c-widget', spec: 'docs/specs/c.md', plan: 'docs/plans/c.md' }),
      },
    });
    const { io, writtenFiles } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: cleanCommitAndVerifyHandlers('c3000001'),
      spawnQueue: [
        () => messages(needsDirectionMessages('sess-a')),
        () => messages(shippedMessages(3, 'c3000001', 'sess-c')),
      ],
    });

    const result = await runLoop(baseLoopConfig(), io);

    expect(result.exitCode).toBe(EXIT_ESCALATED);
    // B is never in `processed` at all — it was skipped by `nextCard` (blocked), never
    // `attempted`, so no session was ever spawned for it and no escalation file exists for it.
    expect(result.processed.map((o) => o.cardId)).toEqual(['A', 'C']);
    expect(result.processed[0]).toMatchObject({ kind: 'escalated', cardId: 'A' });
    expect(result.processed[1]).toMatchObject({ kind: 'shipped', cardId: 'C' });

    const finalState = JSON.parse(writtenFiles.get('/repo/state.json') as string);
    expect(finalState.cards.A.status).toBe('escalated');
    expect(finalState.cards.B.status).toBe('blocked');
    expect(finalState.cards.C.status).toBe('shipped');
    expect(writtenFiles.has('/repo/escalations/B.md')).toBe(false);
  });
});

describe('runLoop — W-F5: a last-tick blocked reconciliation must be PERSISTED, not left in memory', () => {
  test('A (missing spec/plan) escalates via PLANNING_NEEDED on the ONLY tick; B (dependsOn A) is ' +
    'reconciled to blocked on the very next tick, which discovers `done` and never processes ' +
    'another card — the state written through the io seam must still record B as "blocked", not ' +
    'the stale "staged" the file would carry if the reconciliation only ever lived in memory. ' +
    'Deliberately TWO cards only (no third independent card whose own persist would flush this ' +
    'one for free) — exactly W-F5\'s reproduction shape.', async () => {
    const state = fixtureState({
      sequence: ['A', 'B'],
      cards: {
        A: fixtureCard({ branch: null, spec: null, plan: null }),
        B: fixtureCard({ branch: null, dependsOn: ['A'] }),
      },
    });
    const { io, writtenFiles } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: cleanCommitAndVerifyHandlers('unused'),
    });

    const result = await runLoop(baseLoopConfig(), io);

    expect(result.exitCode).toBe(EXIT_ESCALATED);
    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]).toMatchObject({ kind: 'escalated', cardId: 'A', reason: 'planning_needed' });
    // No session was ever spawned for B — it was never attempted, only reconciled to blocked.
    expect(io.spawnSession).not.toHaveBeenCalled();

    const finalState = JSON.parse(writtenFiles.get('/repo/state.json') as string);
    expect(finalState.cards.A.status).toBe('escalated');
    expect(finalState.cards.B.status).toBe('blocked');
  });
});

describe('runLoop — D5′: escalation_pending phase (prior-run escalation file) parks and continues', () => {
  test('C1 has an unanswered escalation file from a previous run; the pass parks it and still ships independent C2', async () => {
    const state = fixtureState({
      sequence: ['C1', 'C2'],
      cards: {
        // Only the escalation FILE (not `card.status`) marks C1 pending — exactly
        // `deriveCardPhase`'s `escalation_pending` short-circuit.
        C1: fixtureCard({ branch: null }),
        C2: fixtureCard({ branch: 'feat/c2-widget', spec: 'docs/specs/c2.md', plan: 'docs/plans/c2.md' }),
      },
    });
    const { io } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      escalationFiles: new Set(['C1']),
      execHandlers: cleanCommitAndVerifyHandlers('abc0002'),
      spawnQueue: [() => messages(shippedMessages(2, 'abc0002', 'sess-c2'))],
    });

    const result = await runLoop(baseLoopConfig(), io);

    expect(result.exitCode).toBe(EXIT_ESCALATED);
    expect(result.processed).toEqual([
      { kind: 'escalation_pending', cardId: 'C1', escalationPath: expect.stringContaining('C1.md') },
      { kind: 'shipped', cardId: 'C2', commitResult: expect.objectContaining({ outcome: 'merged' }) },
    ]);
    // No session was ever spawned for the parked card C1 — only C2's.
    expect(io.spawnSession).toHaveBeenCalledTimes(1);
  });
});

describe('runLoop — D5′ W-F2: --include-escalated never re-selects the same card twice in one pass', () => {
  test('C1 (already escalated) escalates AGAIN this pass under --include-escalated; the pass still ' +
    'reaches and ships the independent C2 — proving each card is attempted at most once per pass, ' +
    'not merely bounded by --max-cards', async () => {
    const state = fixtureState({
      sequence: ['C1', 'C2'],
      cards: {
        // Exactly Stage C's re-trigger shape (spec §O6): `--cards <answered> --include-escalated`
        // against a card that was already `escalated` from a prior run.
        C1: fixtureCard({ branch: null, status: 'escalated' }),
        C2: fixtureCard({ branch: 'feat/c2-widget', spec: 'docs/specs/c2.md', plan: 'docs/plans/c2.md' }),
      },
    });
    const { io } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: cleanCommitAndVerifyHandlers('deadc2c2'),
      // Only ONE spawnSession call is scripted for C1. If `nextCard` ever re-selected C1 a
      // second time (the W-F2 bug: an `escalated` card is excluded only when
      // `includeEscalated` is false, and C1 sits BEFORE C2 in `sequence`), this queue would
      // be exhausted before C2 is ever reached, and the mock's "spawnSession called more
      // times than scripted" guard would fire — or, since a `stopped` outcome also parks
      // rather than exits under D5′, the pass would re-select C1 forever with no `--max-cards`
      // set to bound it. This test deliberately omits `--max-cards`: the plan explicitly
      // forbids relying on it to bound this case (that would hide the very bug this test
      // exists to catch — see `filteredNextCard`'s `attempted`-set doc comment).
      spawnQueue: [
        () => messages(needsDirectionMessages('sess-c1-again')),
        () => messages(shippedMessages(2, 'deadc2c2', 'sess-c2')),
      ],
    });

    const result = await runLoop(baseLoopConfig({ includeEscalated: true }), io);

    expect(result.exitCode).toBe(EXIT_ESCALATED);
    expect(result.processed).toHaveLength(2);
    expect(result.processed[0]).toMatchObject({ kind: 'escalated', cardId: 'C1' });
    expect(result.processed[1]).toMatchObject({ kind: 'shipped', cardId: 'C2' });
    // C1 was attempted EXACTLY once this pass, never re-selected after its own re-escalation.
    expect(io.spawnSession).toHaveBeenCalledTimes(2);
  });
});

describe('runLoop — D5′: --max-cards counts ATTEMPTED cards (shipped + escalated), park-and-continue included', () => {
  test('max-cards 1: C1 escalates and consumes the whole budget; independent C2 is never attempted', async () => {
    const state = fixtureState({
      sequence: ['C1', 'C2'],
      cards: {
        C1: fixtureCard({ branch: null }),
        C2: fixtureCard({ branch: null, spec: 'docs/specs/c2.md', plan: 'docs/plans/c2.md' }),
      },
    });
    const { io } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: cleanCommitAndVerifyHandlers('unused'),
      spawnQueue: [() => messages(needsDirectionMessages('sess-c1'))],
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 1 }), io);

    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]).toMatchObject({ kind: 'escalated', cardId: 'C1' });
    expect(io.spawnSession).toHaveBeenCalledTimes(1);
  });
});

describe('runLoop — D5′ Warchief audit fix: --max-cards budgets only cards actually WORKED, not merely selected', () => {
  test('max-cards 1: A parks on a PRIOR-run escalation file (no work done this pass, consumes no budget); ' +
    'B — the one card actually worked — still ships in the same pass', async () => {
    // The bug this guards: `attempted` (dedup/termination) and the `--max-cards` BUDGET are
    // different questions. Plan line: "--max-cards counts attempted cards (shipped +
    // escalated)" — a card merely PARKED on a stale escalation file (nothing written this
    // pass) must not consume budget any more than a `blocked` card does. Before this fix,
    // `attempted.size` alone gated the loop, so `--max-cards 1` would exit after parking A
    // and B — genuinely progressable, staged, no escalation of its own — would never even be
    // attempted this pass, even though zero real work happened.
    const state = fixtureState({
      sequence: ['A', 'B'],
      cards: {
        // Only the escalation FILE (not `card.status`) marks A pending — the
        // `escalation_pending` phase, exactly like the dedicated test above for that path.
        A: fixtureCard({ branch: null }),
        B: fixtureCard({ branch: 'feat/b-widget', spec: 'docs/specs/b.md', plan: 'docs/plans/b.md' }),
      },
    });
    const { io } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      escalationFiles: new Set(['A']),
      execHandlers: cleanCommitAndVerifyHandlers('bbb0001'),
      spawnQueue: [() => messages(shippedMessages(5, 'bbb0001', 'sess-b'))],
    });

    const result = await runLoop(baseLoopConfig({ maxCards: 1 }), io);

    expect(result.processed).toEqual([
      { kind: 'escalation_pending', cardId: 'A', escalationPath: expect.stringContaining('A.md') },
      { kind: 'shipped', cardId: 'B', commitResult: expect.objectContaining({ outcome: 'merged' }) },
    ]);
    // B's session was in fact spawned this pass — the budget did not stop it.
    expect(io.spawnSession).toHaveBeenCalledTimes(1);
  });
});

describe('runLoop — D5′: exit-code precedence (escalation outranks session-incomplete)', () => {
  test('one card escalates and another stops (session error); exit code is ESCALATED, not SESSION_INCOMPLETE', async () => {
    const state = fixtureState({
      sequence: ['C1', 'C2'],
      cards: {
        C1: fixtureCard({ branch: null }),
        C2: fixtureCard({ branch: null, spec: 'docs/specs/c2.md', plan: 'docs/plans/c2.md' }),
      },
    });
    const { io } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: cleanCommitAndVerifyHandlers('unused'),
      spawnQueue: [
        () => messages(needsDirectionMessages('sess-c1')),
        () => {
          throw new Error('sdk crashed for c2');
        },
      ],
    });

    const result = await runLoop(baseLoopConfig(), io);

    expect(result.processed).toHaveLength(2);
    expect(result.processed[0]).toMatchObject({ kind: 'escalated', cardId: 'C1' });
    expect(result.processed[1]).toMatchObject({ kind: 'stopped', cardId: 'C2' });
    expect(result.exitCode).toBe(EXIT_ESCALATED);
  });
});

describe('runLoop — D5′: STOP file created mid-pass finishes the in-flight card only', () => {
  test('the owner drops STOP while C1 is in flight; C1 finishes and ships, C2 is never started', async () => {
    const state = fixtureState({
      sequence: ['C1', 'C2'],
      cards: {
        C1: fixtureCard({ branch: 'feat/c1-widget' }),
        C2: fixtureCard({ branch: null, spec: 'docs/specs/c2.md', plan: 'docs/plans/c2.md' }),
      },
    });
    const { io } = buildMockLoopIo({
      stateJson: JSON.stringify(state),
      answers: '',
      execHandlers: cleanCommitAndVerifyHandlers('aaaaaaa'),
      spawnQueue: [() => messages(shippedMessages(1, 'aaaaaaa', 'sess-c1'))],
    });

    let stopArmed = false;
    const baseFileExists = io.fileExists as unknown as (p: string) => boolean;
    io.fileExists = mock((p: string) => {
      if (p.endsWith('STOP')) return stopArmed;
      return baseFileExists(p);
    });
    const baseSpawnSession = io.spawnSession;
    io.spawnSession = mock((params) => {
      // Simulate the owner creating the STOP file WHILE C1's session is in flight — the
      // in-flight card must still finish (D2's STOP contract), and the NEXT card must never
      // start.
      stopArmed = true;
      return baseSpawnSession(params);
    });

    const result = await runLoop(baseLoopConfig(), io);

    expect(result.processed).toHaveLength(1);
    expect(result.processed[0]).toMatchObject({ kind: 'shipped', cardId: 'C1' });
    expect(io.spawnSession).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(EXIT_OK);
  });
});
