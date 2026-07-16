// CLI entrypoint for the campaign runner (Task 6, spec §2).
//
// `parseArgs` is pure (no I/O) and fully unit-tested. `main()` below it is the real-world
// wiring — gh/git via `child_process`, the filesystem, the real SDK spawn (`sdkSpawnSession`
// from session.ts), the system clock, and the process's own pid/liveness — and is
// deliberately NOT unit-tested, same precedent as session.ts's `sdkSpawnSession`: the logic
// it depends on (`runLoop`, `deriveCardPhase`, ...) is fully covered without touching a real
// binary or the network.
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import {
  EXIT_LOCKED,
  runLoop,
  stateDirOf,
  type ExecResult,
  type LockInfo,
  type LoopIO,
  type LoopResult,
  type PendingCommit,
  type RunLoopConfig,
} from './loop.ts';
import { loadState } from './state.ts';
import { sdkSpawnSession } from './session.ts';
import type { SessionMessage, SpawnSessionParams } from './session.ts';
import { deriveExitReason, shouldWriteReport, writeReport, type ReportRunInfo } from './report.ts';

/** run.ts's own exit code for "an unhandled exception surfaced after `runLoop` was entered"
 * (Task 3 design note: "any error after the state was loadable" is a real, distinct exit path
 * from `EXIT_LOCKED`/`EXIT_ESCALATED`/`EXIT_SESSION_INCOMPLETE`, none of which fit it). Lives
 * here, not in loop.ts/report.ts, because it is purely a process-exit-code concern of this
 * file's own `main()` wiring — `report.ts`'s `run.reason` ('error') is the artifact that
 * actually carries the meaning; this numeric code is only ever a hint (§O3: "the exit code is
 * a hint, the report is the truth"). */
const EXIT_ERROR = 4;

const DEFAULT_SESSION_TIMEOUT_MS = 3 * 60 * 60 * 1000; // spec §2: 3h protocol default.

function parseDurationMs(value: string): number | null {
  const trimmed = value.trim();
  const match = /^(\d+)(ms|s|m|h)?$/.exec(trimmed);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] ?? 'ms';
  const multiplier = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 }[unit];
  return amount * (multiplier as number);
}

export interface ParseArgsResult {
  config: RunLoopConfig;
}
export interface ParseArgsError {
  error: string;
}

const REQUIRED_FLAGS: Array<{ flag: string; key: 'repoRoot' | 'statePath' | 'model' | 'answersPath' | 'escalationsDir' }> = [
  { flag: '--repo', key: 'repoRoot' },
  { flag: '--state', key: 'statePath' },
  { flag: '--model', key: 'model' },
  { flag: '--answers', key: 'answersPath' },
  { flag: '--escalations-dir', key: 'escalationsDir' },
];

/** Parses `argv` into a `RunLoopConfig`. Pure — no filesystem/network access. Every
 * environment-specific value (`--repo`, `--state`, `--model`, `--answers`,
 * `--escalations-dir`) is a REQUIRED input with no default (stateless-capability wall); only
 * `--session-timeout`/`--logs-dir` carry a protocol-level default (spec §2's own table). */
export function parseArgs(argv: string[]): ParseArgsResult | ParseArgsError {
  const raw = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (!token.startsWith('--')) continue;
    if (token === '--dry-run' || token === '--include-escalated') {
      raw.set(token, true);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) {
      return { error: `${token} requires a value` };
    }
    raw.set(token, value);
    i += 1;
  }

  for (const { flag } of REQUIRED_FLAGS) {
    if (!raw.has(flag)) {
      return { error: `missing required flag: ${flag}` };
    }
  }

  const repoRoot = raw.get('--repo') as string;
  const statePath = raw.get('--state') as string;
  const model = raw.get('--model') as string;
  const answersPath = raw.get('--answers') as string;
  const escalationsDir = raw.get('--escalations-dir') as string;

  let sessionTimeoutMs = DEFAULT_SESSION_TIMEOUT_MS;
  const sessionTimeoutRaw = raw.get('--session-timeout');
  if (typeof sessionTimeoutRaw === 'string') {
    const parsed = parseDurationMs(sessionTimeoutRaw);
    if (parsed === null) {
      return { error: `--session-timeout: invalid duration "${sessionTimeoutRaw}" (expected e.g. "3h", "30m", "90s", "5000ms", or plain milliseconds)` };
    }
    sessionTimeoutMs = parsed;
  }

  const defaultLogsDir = join(dirname(join(repoRoot, statePath)), 'logs');
  const logsDir = typeof raw.get('--logs-dir') === 'string' ? (raw.get('--logs-dir') as string) : defaultLogsDir;

  let maxCards: number | undefined;
  const maxCardsRaw = raw.get('--max-cards');
  if (typeof maxCardsRaw === 'string') {
    const parsed = Number(maxCardsRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { error: `--max-cards: expected a positive integer, got "${maxCardsRaw}"` };
    }
    maxCards = parsed;
  }

  let cardsFilter: string[] | undefined;
  const cardsRaw = raw.get('--cards');
  if (typeof cardsRaw === 'string') {
    cardsFilter = cardsRaw
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
  }

  const dryRun = raw.get('--dry-run') === true;
  const includeEscalated = raw.get('--include-escalated') === true;

  return {
    config: {
      repoRoot,
      statePath,
      escalationsDir,
      answersPath,
      logsDir,
      model,
      sessionTimeoutMs,
      maxCards,
      cardsFilter,
      includeEscalated,
      dryRun,
    },
  };
}

// ---------------------------------------------------------------------------------------
// Real-world wiring (not unit-tested; see the file-level doc comment for why).
// ---------------------------------------------------------------------------------------

function realExec(cmd: string[], opts?: { cwd?: string }): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd[0] as string, cmd.slice(1), { cwd: opts?.cwd });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr?.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
    child.on('error', (err) => resolve({ stdout, stderr: err.message, exitCode: 1 }));
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

function buildRealIo(config: RunLoopConfig): LoopIO {
  const stateDir = dirname(join(config.repoRoot, config.statePath));
  const lockPath = join(stateDir, '.runner.lock');
  const pendingCommitPath = join(stateDir, '.pending-commit.json');

  return {
    exec: realExec,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

    fileExists: (p) => existsSync(p),
    readFile: (p) => readFileSync(p, 'utf8'),
    writeFile: (p, content) => {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content);
    },

    readLock: () => {
      if (!existsSync(lockPath)) return null;
      return JSON.parse(readFileSync(lockPath, 'utf8')) as LockInfo;
    },
    writeLock: (info) => {
      mkdirSync(dirname(lockPath), { recursive: true });
      writeFileSync(lockPath, JSON.stringify(info));
    },
    removeLock: () => {
      if (existsSync(lockPath)) rmSync(lockPath);
    },
    isProcessAlive,
    currentPid: () => process.pid,
    now: () => new Date().toISOString(),

    readPendingCommit: () => {
      if (!existsSync(pendingCommitPath)) return null;
      return JSON.parse(readFileSync(pendingCommitPath, 'utf8')) as PendingCommit;
    },
    writePendingCommit: (pc) => {
      mkdirSync(dirname(pendingCommitPath), { recursive: true });
      writeFileSync(pendingCommitPath, JSON.stringify(pc));
    },
    clearPendingCommit: () => {
      if (existsSync(pendingCommitPath)) rmSync(pendingCommitPath);
    },

    spawnSession: (params: SpawnSessionParams): AsyncIterable<SessionMessage> => sdkSpawnSession(params),
    appendLog: (logPath, line) => {
      mkdirSync(dirname(logPath), { recursive: true });
      writeFileSync(logPath, `${line}\n`, { flag: 'a' });
    },
  };
}

/** Task 3 wiring: reloads whatever state is on disk right now and writes the report through
 * it — the ONLY call site of `writeReport` in this file (the "single finally-style seam" the
 * brief asks for; every exit path in `main()` below funnels through this one call before its
 * own `process.exit`). Swallows a `loadState` failure deliberately: per the brief's design note
 * 1, if state was never loadable at all (e.g. a fresh campaign whose state file doesn't exist
 * yet, or an argument error that never got this far), there is nothing truthful to report —
 * this is a best-effort artifact, never a reason to crash the process over. Every OTHER failure
 * inside `writeReport`/`buildCampaignReport` is already handled internally there (the
 * escalation-file digest read degrades to an honest fallback string); this catch is only the
 * outermost safety net for "state itself never loaded". */
async function tryWriteReport(config: RunLoopConfig, io: LoopIO, run: ReportRunInfo): Promise<void> {
  try {
    const state = await loadState(() => io.readFile(join(config.repoRoot, config.statePath)));
    await writeReport(
      state,
      run,
      stateDirOf(config),
      { repoRoot: config.repoRoot, escalationsDir: config.escalationsDir },
      io,
    );
  } catch {
    // See the doc comment above: no truthful report to write.
  }
}

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(`campaign runner: ${parsed.error}`);
    process.exit(1); // argument errors always exit 1 — state was never loadable, no report.
    return;
  }

  const io = buildRealIo(parsed.config);
  const startedAt = new Date().toISOString();

  let result: LoopResult | undefined;
  let thrown: unknown;
  try {
    result = await runLoop(parsed.config, io);
  } catch (err) {
    thrown = err;
  }

  const endedAt = new Date().toISOString();
  const exitCode = thrown ? EXIT_ERROR : (result as LoopResult).exitCode;

  // Task 3 (spec §O5): the single finally-style seam. `shouldWriteReport`/`deriveExitReason`
  // (report.ts, fully unit-tested there) hold the only two decisions made here — this file
  // never re-derives report-shaping logic (design note 3) — so every exit path below (done,
  // escalations pending, STOP, session-incomplete, or this unhandled-error path) writes a
  // report through the one call, except `--dry-run` (zero side effects by construction) and
  // `EXIT_LOCKED` (a refused process must never clobber the live one's report).
  if (shouldWriteReport({ dryRun: parsed.config.dryRun, exitCode })) {
    await tryWriteReport(parsed.config, io, {
      startedAt,
      endedAt,
      exitCode,
      reason: deriveExitReason({ threw: Boolean(thrown), exitCode, hasMessage: Boolean(result?.message) }),
    });
  }

  if (thrown) {
    console.error(
      `campaign runner: unexpected error: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    );
    process.exit(EXIT_ERROR);
    return;
  }

  const finalResult = result as LoopResult;
  if (parsed.config.dryRun) {
    console.log(JSON.stringify(finalResult.dryRunPlan, null, 2));
  } else {
    for (const outcome of finalResult.processed) {
      console.log(`[${outcome.cardId}] ${outcome.kind}`);
    }
    if (finalResult.message) {
      console.log(finalResult.message);
    }
  }

  process.exit(finalResult.exitCode);
}

if (import.meta.main) {
  main();
}
