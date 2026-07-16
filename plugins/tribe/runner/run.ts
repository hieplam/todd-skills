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
  runLoop,
  type ExecResult,
  type LockInfo,
  type LoopIO,
  type PendingCommit,
  type RunLoopConfig,
} from './loop.ts';
import { sdkSpawnSession } from './session.ts';
import type { SessionMessage, SpawnSessionParams } from './session.ts';

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

async function main(): Promise<void> {
  const parsed = parseArgs(process.argv.slice(2));
  if ('error' in parsed) {
    console.error(`campaign runner: ${parsed.error}`);
    process.exit(1); // argument errors always exit 1
    return;
  }

  const io = buildRealIo(parsed.config);
  const result = await runLoop(parsed.config, io);

  if (parsed.config.dryRun) {
    console.log(JSON.stringify(result.dryRunPlan, null, 2));
  } else {
    for (const outcome of result.processed) {
      console.log(`[${outcome.cardId}] ${outcome.kind}`);
    }
    if (result.message) {
      console.log(result.message);
    }
  }

  process.exit(result.exitCode);
}

if (import.meta.main) {
  main();
}
