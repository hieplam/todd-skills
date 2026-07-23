// run-io.adapter.ts — the production LoopIO: every real-world primitive the runner touches
// (filesystem, child processes, clock, own pid) lives behind this one adapter leaf. Pure
// modules receive it as the injected `io` parameter and never import these primitives
// themselves (purity wall — enforced by structure.test.ts; ESLint layer deferred per Amendment A3).
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import type { ExecResult, LockInfo, LoopIO, PendingCommit, RunLoopConfig } from '../core/loop.ts';
import type { SessionMessage, SpawnSessionParams } from '../core/session.ts';
import { sdkSpawnSession } from './session.adapter.ts';

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

export function buildRealIo(config: RunLoopConfig): LoopIO {
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
