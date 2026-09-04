/**
 * The watchdog's production IO. The ONLY watchdog file allowed to touch the world
 * (structure.test.ts). Every method is an effect with no decision in it (pure-core.md);
 * every catch is the narrowest one the call can raise and degrades to a documented empty
 * value rather than a throw (fail-closed-edges obligation 1) — a watchdog that dies with a
 * stack trace because a directory vanished mid-scan would be strictly worse than the LLM
 * heartbeat it replaces.
 */
import { dirname, join } from 'node:path';
import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync,
  readdirSync, realpathSync, renameSync, statSync, writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import type { DirScanPort, LockInfo, RunnerHandle, WatchdogIO } from '../ports/ports.ts';

/** The real runner entrypoint, resolved from THIS file's location — never from cwd. This
 * adapter lives at `<runner>/adapters/`, so `run.ts` is one level up: the exact path
 * `resolve-runner.sh` and `test-fresh-machine.sh` already prove. */
const RUNNER_ENTRYPOINT = join(import.meta.dir, '..', 'run.ts');

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // ESRCH (gone) is dead; EPERM reached a real process we just lack permission to signal —
    // that is alive but foreign, never dead. Mirrors adapters/run-io.adapter.ts's isProcessAlive.
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function buildWatchdogIo(): WatchdogIO {
  return {
    fileExists: (p) => existsSync(p),
    readFile: (p) => {
      try {
        return readFileSync(p, 'utf8');
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'ENOENT' || code === 'EACCES' || code === 'EISDIR') return '';
        throw err;
      }
    },
    appendFile: (p, content) => {
      mkdirSync(dirname(p), { recursive: true });
      appendFileSync(p, content);
    },
    ensureDir: (p) => {
      mkdirSync(p, { recursive: true });
    },
    writeFileAtomic: (p, content) => {
      mkdirSync(dirname(p), { recursive: true });
      const tmp = `${p}.tmp-${process.pid}`;
      writeFileSync(tmp, content);
      renameSync(tmp, p);
    },

    listEntries: (dirPath) => {
      let names: string[];
      try {
        names = readdirSync(dirPath);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EACCES') return [];
        throw err;
      }
      const out: Array<{ name: string; mtimeMs: number; isDir: boolean }> = [];
      for (const name of names) {
        try {
          const stat = statSync(join(dirPath, name));
          out.push({ name, mtimeMs: stat.mtimeMs, isDir: stat.isDirectory() });
        } catch (err) {
          // Raced with a delete between readdir and stat: not an entry, not a crash.
          if ((err as { code?: string }).code === 'ENOENT') continue;
          throw err;
        }
      }
      return out;
    },

    readTail: (filePath, maxBytes) => {
      let fd: number | null = null;
      try {
        const size = statSync(filePath).size;
        const start = Math.max(0, size - maxBytes);
        const length = size - start;
        if (length === 0) return '';
        fd = openSync(filePath, 'r');
        const buffer = Buffer.alloc(length);
        readSync(fd, buffer, 0, length, start);
        return buffer.toString('utf8');
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'ENOENT' || code === 'EACCES' || code === 'EISDIR') return '';
        throw err;
      } finally {
        if (fd !== null) closeSync(fd);
      }
    },

    realpath: (p) => {
      try {
        return realpathSync(p);
      } catch (err) {
        if ((err as { code?: string }).code === 'ENOENT') return p;
        throw err;
      }
    },

    readLock: () => {
      // Only the runner's own lock path (`reportDirOf(home)/.runner.lock`) is ever read, and
      // the home is supplied by the caller through the closure below in `watch-loop.ts`; this
      // method is bound per-home by `withHome` there.
      return null as LockInfo | null;
    },

    isProcessAlive,
    currentPid: () => process.pid,
    now: () => new Date().toISOString(),
    nowMs: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

    runnerCommand: () => ['bun', RUNNER_ENTRYPOINT],

    /** No wall-clock kill, on purpose (W-P7, card G4): a campaign pass legitimately runs for
     * hours, and killing it is the runner's own --session-timeout's job. Every WAIT on this
     * handle is bounded (`waitFor(waitMs)`), so the watchdog itself never blocks unbounded and
     * still notices a STOP file within one poll slice. */
    spawnRunner: (argv, opts): RunnerHandle => {
      mkdirSync(dirname(opts.stdoutPath), { recursive: true });
      const out = openSync(opts.stdoutPath, 'a');
      const child = spawn(argv[0] as string, argv.slice(1), {
        cwd: opts.cwd,
        stdio: ['ignore', out, out],
      });
      let exited: number | null = null;
      const done = new Promise<number>((resolve) => {
        child.on('exit', (code, signal) => {
          exited = code ?? (signal ? 128 : 0);
          closeSync(out);
          resolve(exited);
        });
        child.on('error', () => {
          exited = 127; // spawn failed (ENOENT on the program) — a runner that never ran
          resolve(127);
        });
      });
      return {
        pid: child.pid ?? -1,
        waitFor: async (waitMs) => {
          if (exited !== null) return exited;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const elapsed = new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), waitMs);
          });
          const result = await Promise.race([done, elapsed]);
          if (timer !== undefined) clearTimeout(timer);
          return result;
        },
      };
    },

    userHome: () => process.env['HOME'] ?? '',
    cwd: () => process.cwd(),
    printLine: (line) => {
      console.log(line);
    },
  };
}

/** Binds the per-home methods the seam cannot know at construction time: the runner's lock
 * path lives under the campaign home. Called once by `cli/main.ts` after containment. */
export function withHome(io: WatchdogIO, homeDir: string): WatchdogIO {
  const lockPath = join(homeDir, '.runner.lock');
  return {
    ...io,
    readLock: () => {
      try {
        if (!existsSync(lockPath)) return null;
        return JSON.parse(readFileSync(lockPath, 'utf8')) as LockInfo;
      } catch (err) {
        // A half-written or corrupt lock is "no readable holder", never a crash.
        if (err instanceof SyntaxError) return null;
        const code = (err as { code?: string }).code;
        if (code === 'ENOENT' || code === 'EACCES') return null;
        throw err;
      }
    },
  };
}

/**
 * Carried-forward audit constraint F3/F3b: `readTail` above is a raw, byte-bounded primitive
 * on purpose (the 1.9 MB real killed log makes an unbounded read a real cost, and its own
 * tests depend on exact byte slicing). But a byte window whose START falls mid-file routinely
 * cuts the FIRST line of that window in half — handing that half-line straight to
 * `parseSessionSignals` risks exactly the failure this card exists to remove if a future
 * change to the parser ever stops tolerating it. `readTailLines` is the composed seam
 * `watch-loop.ts` calls instead when it wants signal-parser input: it discards a leading
 * partial line (content before the window's first `\n`) and returns only what remains.
 *
 * It deliberately never touches the TRAILING content. The window always ends at the file's
 * true end-of-file, never at some earlier point this adapter chose — so a genuinely
 * incomplete final write (the process died mid-JSON) is not this function's business to hide
 * OR to trim; that is `parseSessionSignals`'s own `finalLineUnparseable` judgment to make.
 * Discarding the trailing line here would silently drop the newest, most authoritative event
 * — the exact quota-hiding defect (audit F3) this card exists to remove.
 */
export function readTailLines(
  readTail: DirScanPort['readTail'],
  filePath: string,
  maxBytes: number,
): string {
  const raw = readTail(filePath, maxBytes);
  if (raw.length < maxBytes) return raw; // shorter than the window: this IS the file from byte 0
  const firstNewline = raw.indexOf('\n');
  if (firstNewline === -1) return ''; // the whole window is one partial line — nothing complete
  return raw.slice(firstNewline + 1);
}
