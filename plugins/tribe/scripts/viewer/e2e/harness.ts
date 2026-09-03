// e2e/harness.ts — opt-in Haiku end-to-end fixture (Task 15, card D4/G5).
//
// EDGE code, not core: this file does real filesystem writes, spawns real processes (git,
// bun, the campaign runner, Chrome) and makes real network calls. It lives entirely under
// `e2e/`, which `structure.test.ts`'s purity wall never walks (that wall inspects `core/`
// only) — see that file's `walk('core')` calls. Nothing here is imported by `core/**` or
// `serve.ts`, so it can never leak an outside-world dependency into the pure layer.
//
// Every wait below is a bounded deadline loop or an explicit `timeout`/`AbortSignal.timeout`
// value — this machine has no `timeout` binary (task brief constraint).
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ProcessNode } from '../core/live/model.ts';

const PORT = 4399; // never the viewer's default 4321 — task brief constraint.
const VIEWER_DIR = import.meta.dir.replace(/\/e2e$/, ''); // plugins/tribe/scripts/viewer
const RUN_TS_PATH = join(VIEWER_DIR, '..', 'runner', 'run.ts');
const TRIBE_HOME_SH = join(VIEWER_DIR, '..', 'tribe-home.sh');
const EVIDENCE_DIR = join(VIEWER_DIR, '..', '..', '..', '..', 'docs', 'superpowers', 'evidence', '2026-09-02-campaign-live-viewer');
const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const FIXTURE_LINE = 'Added by the tribe live-viewer e2e fixture.';
const GIT_AUTHOR = ['-c', 'user.email=tribe-e2e@example.com', '-c', 'user.name=Tribe E2E Fixture'];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// F54: every /events and /live URL this harness logs (`?repo=...&slug=...&process=...`)
// contains a bare `&`, which the OLD pattern here (`/[\s"]/`) never quoted — pasted into a real
// shell, the unquoted `&` backgrounds the command mid-URL and silently drops everything after
// it. Quoting on whitespace/`"` alone is never enough for a `commands.md` a reader is meant to
// copy-paste; this now quotes on any shell metacharacter, matching the full class this repo's
// F54 finding named. Exported so `e2e/harness.test.ts` can prove a URL containing `&`
// round-trips through a real shell unchanged.
const SHELL_METACHARACTERS = /[\s"&|;<>$`()*?~!#]/;
export function quote(arg: string): string {
  return SHELL_METACHARACTERS.test(arg) ? `"${arg.replace(/"/g, '\\"')}"` : arg;
}

export interface LatencySample {
  valueMs: number;
  /** Which signal produced this sample — `timestamp` (the event's own `TranscriptEvent.timestamp`,
   * the honest per-line number) or `mtime-fallback` (the transcript file's mtime at arrival,
   * used ONLY when an event's `timestamp` is null — F51). */
  method: 'timestamp' | 'mtime-fallback';
}

/** Pure (F51): parses one already-received `append` SSE frame's `data:` JSON and returns ONE
 * latency sample per event in `data.events`, never one sample for the whole (possibly batched)
 * frame. The production poller (`adapters/poller.adapter.ts`) batches every line written since
 * the last 400ms tick into a single `append` frame, so measuring "how stale is the file's mtime
 * right now" silently discards every event's true delay except the last one in the batch. Each
 * `TranscriptEvent` on the wire carries its own `timestamp` (`core/live/model.ts`), which is the
 * honest per-line signal: `arrivalMs - Date.parse(event.timestamp)` can only ever OVER-state the
 * true delay (the write necessarily happened at or before its own timestamp is later read as
 * elapsed), never under-state it. An event with a null `timestamp` has no better signal over the
 * wire and falls back to `arrivalMs - mtimeFallbackMs` — the caller passes the transcript file's
 * mtime read at the instant the frame arrived. No sample is ever clamped, floored, or discarded:
 * a negative value (clock skew) is returned exactly as measured. Takes `rawFrame` (the frame
 * text with its `event:`/`data:` lines, no trailing blank-line terminator), `arrivalMs`, and the
 * pre-read `mtimeFallbackMs` as plain arguments — no filesystem or clock access of its own — so
 * it is fully testable without a live server (`e2e/harness.test.ts`). */
export function sampleAppendFrameLatencies(rawFrame: string, arrivalMs: number, mtimeFallbackMs: number): LatencySample[] {
  const dataMatch = /^data: (.+)$/m.exec(rawFrame);
  if (!dataMatch) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(dataMatch[1]!);
  } catch {
    return [];
  }
  const events = (parsed as { events?: unknown }).events;
  if (!Array.isArray(events)) return [];
  return events.map((event): LatencySample => {
    const timestamp = (event as { timestamp?: unknown }).timestamp;
    return typeof timestamp === 'string'
      ? { valueMs: arrivalMs - Date.parse(timestamp), method: 'timestamp' }
      : { valueMs: arrivalMs - mtimeFallbackMs, method: 'mtime-fallback' };
  });
}

export interface WriteEvidenceInput {
  processes: ProcessNode[];
  samples: LatencySample[];
  worst: number;
}

export interface RunHandle {
  repoDir: string;
  home: string;
  repoKey: string;
  slug: string;
  cardId: string;
  port: number;
  waitForProcesses(pred: (nodes: ProcessNode[]) => boolean, timeoutMs: number): Promise<ProcessNode[]>;
  measureAppendLatencies(n: number, timeoutMs: number): Promise<LatencySample[]>;
  writeEvidence(input: WriteEvidenceInput): Promise<void>;
  stop(): Promise<void>;
}

function pidsOnPort(port: number): number[] {
  try {
    const out = execFileSync('lsof', ['-ti', `tcp:${port}`], { encoding: 'utf8' }).trim();
    return out === '' ? [] : out.split('\n').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
  } catch {
    return []; // lsof exits non-zero when nothing is listening — that's not an error here.
  }
}

async function killListenersOnPort(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const pids = pidsOnPort(port);
    if (pids.length === 0) return;
    for (const pid of pids) {
      try {
        process.kill(pid, 'SIGTERM');
      } catch {
        // already gone
      }
    }
    await sleep(300);
  }
  for (const pid of pidsOnPort(port)) {
    try {
      process.kill(pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

async function waitForDeadGroup(pgid: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      process.kill(-pgid, 0); // still alive if this doesn't throw
    } catch {
      return; // ESRCH: the whole group is gone
    }
    await sleep(200);
  }
}

/** Builds and stages the throwaway campaign fixture, spawns the real runner, and returns a
 * handle for driving/observing/tearing down the run. THE RUN IS REAL: a real `git init` repo
 * with no remote, a real `campaign-state.json`, a real `bun run.ts` process, a real Agent SDK
 * session. Nothing here fabricates a result. */
export async function runCampaignFixture(opts: { model: string; sessionTimeout: string }): Promise<RunHandle> {
  const commandLog: string[] = [];
  const log = (line: string) => commandLog.push(line);

  function sh(cwd: string, cmd: string, args: string[]): string {
    log(`$ ${cmd} ${args.map(quote).join(' ')}  (cwd: ${cwd})`);
    return execFileSync(cmd, args, { cwd, encoding: 'utf8' });
  }

  // Step 1: throwaway target repo, no remote at all (card D4 — makes a real PR impossible).
  const tmpDir = mkdtempSync(join(tmpdir(), 'tribe-e2e-'));
  const repoDir = join(tmpDir, 'repo');
  mkdirSync(repoDir);

  sh(repoDir, 'git', ['init', '-q']);
  sh(repoDir, 'git', [...GIT_AUTHOR, 'commit', '--allow-empty', '-q', '-m', 'initial commit']);

  writeFileSync(
    join(repoDir, 'README.md'),
    '# Tribe e2e fixture repo\n\nThrowaway repo created by the campaign live viewer opt-in e2e test.\n',
  );
  mkdirSync(join(repoDir, 'docs', 'specs'), { recursive: true });
  mkdirSync(join(repoDir, 'docs', 'plans'), { recursive: true });

  const specRelPath = 'docs/specs/e2e-card-spec.md';
  const planRelPath = 'docs/plans/e2e-card-plan.md';

  writeFileSync(
    join(repoDir, specRelPath),
    [
      '# Spec: e2e-card (throwaway fixture)',
      '',
      '## Goal',
      '',
      'Add one line to README.md. **This implementation MUST be dispatched to the `hunter`',
      'subagent (Task tool, `subagent_type: hunter`) and never performed inline in this',
      'session** — the tribe live-viewer e2e test needs a real subagent transcript to render.',
      '',
      '## Requirements',
      '',
      `- \`README.md\` must contain the exact line: \`${FIXTURE_LINE}\``,
      '',
      '## Non-goals',
      '',
      '- No other file changes.',
      '',
    ].join('\n'),
  );
  writeFileSync(
    join(repoDir, planRelPath),
    [
      '# Plan: e2e-card (throwaway fixture)',
      '',
      '## Global Constraints',
      '',
      '- **Implementer:** dispatch the ONE implementation task below to the `hunter` subagent',
      '  via the Task tool (`subagent_type: hunter`) — never write the file inline in this',
      '  session. This is non-negotiable for this campaign; it exists solely so the tribe',
      '  live-viewer e2e test can observe a real subagent transcript.',
      '- Keep the change to exactly one line in `README.md`. No scope creep.',
      '',
      '## Task 1: Add the fixture line to README.md',
      '',
      `- [ ] Step 1: Write the failing check: \`grep -qF "${FIXTURE_LINE}" README.md\` (expected:`,
      '  exit 1, line not present yet).',
      `- [ ] Step 2: Implement: append the line \`${FIXTURE_LINE}\` to \`README.md\`.`,
      `- [ ] Step 3: Verify: \`grep -qF "${FIXTURE_LINE}" README.md\` (expected: exit 0).`,
      '- [ ] Step 4: Commit: `git add README.md && git commit -m "docs: add e2e fixture line"`.',
      '',
    ].join('\n'),
  );

  sh(repoDir, 'git', ['add', '-A']);
  sh(repoDir, 'git', [...GIT_AUTHOR, 'commit', '-q', '-m', 'seed fixture card']);

  const remotes = sh(repoDir, 'git', ['remote', '-v']).trim();
  if (remotes !== '') {
    throw new Error(`fixture repo must have NO git remote (card D4); found: ${remotes}`);
  }

  // Step 2: campaign home under the DEFAULT tribe root ($HOME/.tribe), using the real
  // tribe-home.sh script — the runner auto-starts the viewer with only --port, so the viewer
  // resolves campaigns under $HOME/.tribe, never a --tribe-root this harness might invent.
  const home = process.env.HOME;
  if (!home) throw new Error('HOME is not set');
  const fullHomeLine = sh(repoDir, 'bash', [TRIBE_HOME_SH, repoDir]).trim();
  const tribeRootPrefix = join(home, '.tribe') + '/';
  if (!fullHomeLine.startsWith(tribeRootPrefix)) {
    throw new Error(`tribe-home.sh printed an unexpected path: ${fullHomeLine}`);
  }
  const repoKey = fullHomeLine.slice(tribeRootPrefix.length);
  const slug = `e2e-${Date.now()}`;
  const campaignHome = join(home, '.tribe', repoKey, 'campaigns', slug);
  mkdirSync(campaignHome, { recursive: true });
  writeFileSync(join(campaignHome, 'answers.md'), '');

  const cardId = 'C1';
  const state = {
    v: 1,
    campaign: 'e2e-fixture',
    mergePolicy: 'regular-merge-only',
    sequence: [cardId],
    schemaLockPaths: [],
    docsOnlyPaths: [],
    ownerOnlyEscalations: [],
    cards: {
      [cardId]: {
        status: 'staged',
        spec: specRelPath,
        plan: planRelPath,
        branch: null,
        baseSha: null,
        pr: null,
        mergeSha: null,
        sessionId: null,
        updatedAt: null,
      },
    },
  };
  writeFileSync(join(campaignHome, 'campaign-state.json'), `${JSON.stringify(state, null, 2)}\n`);

  // Step 3: validate the state file parses cleanly before spending a single token.
  log(`$ bun ${RUN_TS_PATH} --repo ${repoDir} --model ${opts.model} --home ${campaignHome} --dry-run`);
  const dryRunOut = execFileSync(
    'bun',
    [RUN_TS_PATH, '--repo', repoDir, '--model', opts.model, '--home', campaignHome, '--dry-run'],
    { encoding: 'utf8' },
  );
  const dryRunPlan = JSON.parse(dryRunOut) as { cardId?: string; phase?: { kind?: string } };
  if (dryRunPlan.cardId !== cardId || dryRunPlan.phase?.kind !== 'fresh') {
    throw new Error(`--dry-run did not report a clean fresh parse of ${cardId}: ${dryRunOut}`);
  }

  // Step 4: run the real runner, detached, capturing its stdout/stderr to a log file.
  const runnerLogPath = join(tmpDir, 'runner.log');
  const runnerLogFd = openSync(runnerLogPath, 'a');
  const runnerArgs = [
    RUN_TS_PATH,
    '--repo', repoDir,
    '--model', opts.model,
    '--home', campaignHome,
    '--session-timeout', opts.sessionTimeout,
    '--viewer-port', String(PORT),
  ];
  log(`$ bun ${runnerArgs.map(quote).join(' ')}  (detached, cwd: ${repoDir})`);
  let runnerChild: ChildProcess;
  try {
    runnerChild = spawn('bun', runnerArgs, {
      cwd: repoDir,
      detached: true,
      stdio: ['ignore', runnerLogFd, runnerLogFd],
    });
  } finally {
    // F52: `spawn`'s numeric-fd stdio dup()s into the child (not a transfer) — the parent's
    // own copy of `runnerLogFd` is never used again after this call, whether it succeeded or
    // threw, and must be closed explicitly or it leaks for the whole process lifetime (one
    // leaked fd per `runCampaignFixture` call).
    closeSync(runnerLogFd);
  }
  runnerChild.unref();
  if (runnerChild.pid === undefined) throw new Error('failed to spawn the campaign runner');
  const runnerPid: number = runnerChild.pid;

  // Step 5: wait for the viewer's identity healthcheck (bounded deadline loop, no `timeout`
  // binary available on this machine).
  const healthDeadline = Date.now() + 60_000;
  let healthy = false;
  while (Date.now() < healthDeadline) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/healthz`, { signal: AbortSignal.timeout(2000) });
      if (res.ok) {
        const body = (await res.json()) as { ok?: boolean; viewer?: string; v?: number };
        if (body.ok === true && body.viewer === 'tribe-live-viewer' && body.v === 1) {
          healthy = true;
          break;
        }
      }
    } catch {
      // not up yet
    }
    await sleep(500);
  }
  if (!healthy) {
    const tail = existsSync(runnerLogPath) ? readFileSync(runnerLogPath, 'utf8').slice(-4000) : '(no log)';
    throw new Error(`viewer never answered a healthy /healthz on port ${PORT} within 60s; runner log tail:\n${tail}`);
  }

  async function waitForProcesses(
    pred: (nodes: ProcessNode[]) => boolean,
    timeoutMs: number,
  ): Promise<ProcessNode[]> {
    const deadline = Date.now() + timeoutMs;
    let last: ProcessNode[] = [];
    while (Date.now() < deadline) {
      try {
        const res = await fetch(
          `http://127.0.0.1:${PORT}/api/processes?repo=${repoKey}&slug=${slug}`,
          { signal: AbortSignal.timeout(5000) },
        );
        if (res.ok) {
          const body = (await res.json()) as { processes?: ProcessNode[] };
          last = body.processes ?? [];
          if (pred(last)) return last;
        }
      } catch {
        // transient — keep polling
      }
      await sleep(1000);
    }
    throw new Error(
      `waitForProcesses: predicate never held within ${timeoutMs}ms; last payload: ${JSON.stringify(last)}`,
    );
  }

  async function fetchTranscriptPathForCard(): Promise<string> {
    const res = await fetch(`http://127.0.0.1:${PORT}/api/processes?repo=${repoKey}&slug=${slug}`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`GET /api/processes failed: ${res.status}`);
    const body = (await res.json()) as { processes?: ProcessNode[] };
    const sessionNode = (body.processes ?? []).find((n) => n.id === `card:${cardId}`);
    if (!sessionNode) throw new Error(`no session node card:${cardId} in /api/processes payload`);
    return sessionNode.transcriptPath;
  }

  /** `serve.ts`'s `Bun.serve()` now sets an explicit `idleTimeout` (`SSE_IDLE_TIMEOUT_SECONDS`,
   * `core/live/model.ts`) comfortably above the poller's 15s keepalive `ping`
   * (`PING_INTERVAL_MS`, `poller.adapter.ts`) — F55. A real browser's native `EventSource`
   * still reconnects transparently on any transport hiccup regardless, so this harness — which
   * the task brief requires to use raw `fetch()` instead of `EventSource` (Bun has no
   * `EventSource`) — keeps mirroring that same reconnect behavior itself as ordinary defensive
   * robustness, not as a workaround for a still-open bug. */
  async function measureAppendLatencies(n: number, timeoutMs: number): Promise<LatencySample[]> {
    const transcriptPath = await fetchTranscriptPathForCard();
    const url = `http://127.0.0.1:${PORT}/events?repo=${repoKey}&slug=${slug}&process=card:${cardId}`;
    log(`$ curl -N ${quote(url)}  (SSE, watched via fetch()/ReadableStream, not EventSource; ` +
      'reconnects transparently on any transport hiccup — see the doc comment above ' +
      'measureAppendLatencies in harness.ts)');

    const deadline = Date.now() + timeoutMs;
    const samples: LatencySample[] = [];
    let reconnects = 0;

    while (samples.length < n) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        throw new Error(
          `measureAppendLatencies: timed out after ${timeoutMs}ms with only ${samples.length}/${n} ` +
            `append frames (${reconnects} reconnect(s))`,
        );
      }

      const controller = new AbortController();
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok || !res.body) throw new Error(`SSE connect to /events failed: ${res.status}`);
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        readLoop: while (samples.length < n) {
          const remainingInner = deadline - Date.now();
          if (remainingInner <= 0) break;
          // F53: the losing side of this race (whichever one does NOT settle first) must have
          // its timer cleared — otherwise every loop iteration where `reader.read()` wins (the
          // normal case) leaks one more `setTimeout` scheduled up to `remainingInner` ms ahead.
          // Same pattern as `runner/core/session.ts`'s identical race.
          let stallTimer: ReturnType<typeof setTimeout>;
          const readResult = await Promise.race([
            reader.read(),
            new Promise<never>((_resolve, reject) => {
              stallTimer = setTimeout(() => reject(new Error('measureAppendLatencies: read stalled')), remainingInner);
            }),
          ]).finally(() => clearTimeout(stallTimer!));
          if (readResult.done) {
            // Graceful EOF (e.g. a transport hiccup). Reconnect, do not fail.
            reconnects += 1;
            break readLoop;
          }
          buffer += decoder.decode(readResult.value, { stream: true });
          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) !== -1) {
            const rawFrame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const arrivalMs = Date.now();
            const eventMatch = /^event: (.+)$/m.exec(rawFrame);
            if (eventMatch?.[1] === 'append') {
              // F51: the file's mtime is read ONLY as the fallback for an event with a null
              // `timestamp` — never as the primary signal, which silently discarded every
              // event's true delay in a batched frame except the last one written.
              const mtimeFallbackMs = statSync(transcriptPath).mtimeMs;
              for (const sample of sampleAppendFrameLatencies(rawFrame, arrivalMs, mtimeFallbackMs)) {
                samples.push(sample);
                if (samples.length >= n) break;
              }
            }
          }
        }
      } catch (err) {
        if (samples.length >= n) break;
        const remainingAfterError = deadline - Date.now();
        if (remainingAfterError <= 0) {
          throw new Error(
            `measureAppendLatencies: SSE connection failed with no time left to reconnect ` +
              `(${reconnects} reconnect(s) so far): ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        reconnects += 1;
        await sleep(Math.min(500, remainingAfterError));
      } finally {
        controller.abort();
      }
    }

    if (reconnects > 0) {
      log(
        `# measureAppendLatencies reconnected ${reconnects} time(s) mid-measurement — see the ` +
          'doc comment above measureAppendLatencies in harness.ts',
      );
    }
    return samples;
  }

  /** execFileSync's own `timeout` option does not reliably bound a headless Chrome child under
   * Bun on this machine (observed hanging well past its stated deadline) — every Chrome spawn
   * below is therefore driven with `spawn` plus an explicit `setTimeout`/`SIGKILL`, never a
   * library-level timeout alone. Kill is always attempted, whether or not the caller already
   * got what it needed. */
  function killTree(child: ChildProcess): void {
    try {
      if (child.pid !== undefined) process.kill(child.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }

  /** The task brief's literal command: `--screenshot=<path>` CLI mode, optionally with
   * `--user-data-dir`/`--no-sandbox`. Bounded by polling for the output file to appear (never
   * execFileSync's `timeout`, per the note above) rather than trusting Chrome to exit on its
   * own. */
  function attemptCliScreenshot(
    url: string,
    outPath: string,
    extraArgs: string[],
    boundMs: number,
  ): Promise<{ ok: boolean; stderr: string }> {
    return new Promise((resolve) => {
      if (existsSync(outPath)) rmSync(outPath, { force: true });
      const args = [
        '--headless=new',
        '--disable-gpu',
        `--screenshot=${outPath}`,
        '--window-size=1600,1200',
        '--virtual-time-budget=8000',
        ...extraArgs,
        url,
      ];
      log(`$ "${CHROME_PATH}" ${args.map(quote).join(' ')}`);
      const child = spawn(CHROME_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      child.stdout?.on('data', (c) => (output += c.toString()));
      child.stderr?.on('data', (c) => (output += c.toString()));

      const deadline = Date.now() + boundMs;
      const poll = setInterval(() => {
        if (existsSync(outPath) && statSync(outPath).size > 0) {
          clearInterval(poll);
          setTimeout(() => {
            killTree(child);
            resolve({ ok: true, stderr: output });
          }, 300); // let a just-finished write flush before reading it back
          return;
        }
        if (Date.now() >= deadline) {
          clearInterval(poll);
          killTree(child);
          resolve({ ok: false, stderr: output || `(no output; hard-killed after ${boundMs}ms)` });
        }
      }, 250);
    });
  }

  /** Minimal Chrome DevTools Protocol client over Bun's native `WebSocket` — request/response
   * matched by the CDP `id` field, exactly the protocol's own contract. */
  function connectCdp(wsUrl: string): { ws: WebSocket; send: (method: string, params?: Record<string, unknown>, timeoutMs?: number) => Promise<any> } {
    const ws = new WebSocket(wsUrl);
    let nextId = 1;
    const pending = new Map<number, (msg: unknown) => void>();
    ws.addEventListener('message', (ev: MessageEvent) => {
      try {
        const msg = JSON.parse(String(ev.data)) as { id?: number };
        if (typeof msg.id === 'number' && pending.has(msg.id)) {
          const resolve = pending.get(msg.id) as (m: unknown) => void;
          pending.delete(msg.id);
          resolve(msg);
        }
      } catch {
        // not a JSON frame we care about
      }
    });
    function send(method: string, params: Record<string, unknown> = {}, timeoutMs = 8000): Promise<any> {
      return new Promise((resolve, reject) => {
        const id = nextId++;
        const timer = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`CDP ${method} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
        pending.set(id, (msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
        ws.send(JSON.stringify({ id, method, params }));
      });
    }
    return { ws, send };
  }

  function waitForOpen(ws: WebSocket, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('CDP websocket open timed out')), timeoutMs);
      ws.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('CDP websocket error')); }, { once: true });
    });
  }

  /** The live page holds an open `EventSource` to `/events` for as long as it is on screen (by
   * design — that is the whole live-tailing feature). Verified by hand against this exact page
   * (see the harness's e2e report): Chrome's `--screenshot` CLI mode never resolves against a
   * page with a persistently open connection — `--virtual-time-budget` does not force it past
   * real, non-virtual socket I/O, on this Chrome build, with or without `--no-sandbox`/
   * `--user-data-dir`/`--run-all-compositor-stages-before-draw`. Driving Chrome's own DevTools
   * Protocol directly (`Page.captureScreenshot`) captures the frame as it stands, independent of
   * whatever the page's own network connections are doing — this is the ONLY method that
   * actually returns a screenshot of this page, and it is still 100% Chrome's own real render,
   * never a fabricated image. */
  async function attemptCdpScreenshot(url: string, outPath: string, boundMs: number): Promise<{ ok: boolean; stderr: string }> {
    const userDataDir = mkdtempSync(join(tmpdir(), 'tribe-e2e-chrome-cdp-'));
    const debugPort = 9422;
    const args = [
      '--headless=new',
      '--disable-gpu',
      `--user-data-dir=${userDataDir}`,
      '--no-sandbox',
      `--remote-debugging-port=${debugPort}`,
      '--remote-allow-origins=*',
      '--window-size=1600,1200',
    ];
    log(`$ "${CHROME_PATH}" ${args.map(quote).join(' ')}  (CDP-driven: Page.navigate via /json/new, then Page.captureScreenshot, for ${url})`);
    const child = spawn(CHROME_PATH, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderrBuf = '';
    child.stderr?.on('data', (c) => (stderrBuf += c.toString()));

    try {
      const readyDeadline = Date.now() + Math.min(10_000, boundMs);
      let ready = false;
      while (Date.now() < readyDeadline) {
        try {
          const res = await fetch(`http://127.0.0.1:${debugPort}/json/version`, { signal: AbortSignal.timeout(1000) });
          if (res.ok) {
            ready = true;
            break;
          }
        } catch {
          // not up yet
        }
        await sleep(300);
      }
      if (!ready) return { ok: false, stderr: `CDP endpoint never answered within ${boundMs}ms; chrome stderr: ${stderrBuf}` };

      const newTabRes = await fetch(`http://127.0.0.1:${debugPort}/json/new?${encodeURIComponent(url)}`, {
        method: 'PUT',
        signal: AbortSignal.timeout(5000),
      });
      if (!newTabRes.ok) return { ok: false, stderr: `/json/new failed: HTTP ${newTabRes.status}` };
      const tab = (await newTabRes.json()) as { webSocketDebuggerUrl?: string };
      if (!tab.webSocketDebuggerUrl) return { ok: false, stderr: `/json/new returned no webSocketDebuggerUrl: ${JSON.stringify(tab)}` };

      const { ws, send } = connectCdp(tab.webSocketDebuggerUrl);
      await waitForOpen(ws, 5000);
      await send('Page.enable');
      // Bounded settle so the page's own client JS has time to receive and render its first
      // live frame before the frame is captured — the real reason the CLI mode above cannot be
      // used, per the doc comment.
      await sleep(Math.min(4000, Math.max(1000, boundMs - 6000)));
      const shot = await send('Page.captureScreenshot', { format: 'png' }, 8000);
      ws.close();
      const data = (shot as { result?: { data?: string } }).result?.data;
      if (!data) return { ok: false, stderr: `captureScreenshot returned no data: ${JSON.stringify(shot)}` };
      writeFileSync(outPath, Buffer.from(data, 'base64'));
      return { ok: true, stderr: '' };
    } catch (err) {
      return { ok: false, stderr: err instanceof Error ? err.message : String(err) };
    } finally {
      killTree(child);
      rmSync(userDataDir, { recursive: true, force: true });
    }
  }

  function verifyPng(outPath: string): boolean {
    if (!existsSync(outPath)) return false;
    if (statSync(outPath).size <= 20 * 1024) return false;
    try {
      const fileOut = execFileSync('file', [outPath], { encoding: 'utf8' });
      return /PNG image data/.test(fileOut);
    } catch {
      return false;
    }
  }

  const screenshotFailures: string[] = [];

  async function captureScreenshot(name: string, url: string, outPath: string): Promise<void> {
    const attempts: Array<{ label: string; run: () => Promise<{ ok: boolean; stderr: string }> }> = [
      { label: 'attempt 1: base command, no extra flags', run: () => attemptCliScreenshot(url, outPath, [], 10_000) },
      {
        label: 'attempt 2: --user-data-dir + --no-sandbox',
        run: () => {
          const userDataDir = mkdtempSync(join(tmpdir(), 'tribe-e2e-chrome-'));
          return attemptCliScreenshot(url, outPath, [`--user-data-dir=${userDataDir}`, '--no-sandbox'], 12_000);
        },
      },
      {
        label: 'attempt 3: CDP Page.captureScreenshot (the live page keeps an SSE connection ' +
          'open, which the CLI --screenshot mode never resolves past on this Chrome build — see ' +
          'attemptCdpScreenshot\'s doc comment in harness.ts)',
        run: () => attemptCdpScreenshot(url, outPath, 15_000),
      },
    ];

    const transcript: string[] = [];
    for (const attempt of attempts) {
      const result = await attempt.run();
      transcript.push(`${attempt.label}\nresult: ${result.ok ? 'reported success' : 'failed'}\noutput: ${result.stderr || '(empty)'}`);
      if (result.ok && verifyPng(outPath)) return;
      if (existsSync(outPath)) rmSync(outPath, { force: true }); // never leave a placeholder/bad file
    }

    screenshotFailures.push([`## Screenshot failure: ${name}`, '', ...transcript, ''].join('\n\n'));
  }

  async function writeEvidence(input: WriteEvidenceInput): Promise<void> {
    mkdirSync(EVIDENCE_DIR, { recursive: true });

    const latencyPayload = {
      measuredAt: new Date().toISOString(),
      budgetMs: 2000,
      latenciesMs: input.samples.map((s) => s.valueMs),
      worstMs: input.worst,
      sampleCount: input.samples.length,
      // F51: which signal produced each `latenciesMs` entry, same index order — 'timestamp'
      // (the honest per-event number) or 'mtime-fallback' (only for an event with a null
      // `timestamp`). Evidence-file-only field; never a persisted product format.
      sampleMethods: input.samples.map((s) => s.method),
    };
    writeFileSync(join(EVIDENCE_DIR, 'latency.json'), `${JSON.stringify(latencyPayload, null, 2)}\n`);
    writeFileSync(
      join(EVIDENCE_DIR, 'processes.json'),
      `${JSON.stringify({ processes: input.processes }, null, 2)}\n`,
    );

    const parentUrl = `http://127.0.0.1:${PORT}/live?repo=${repoKey}&slug=${slug}&process=card:${cardId}`;
    await captureScreenshot('after-live-parent.png', parentUrl, join(EVIDENCE_DIR, 'after-live-parent.png'));

    const subagent = input.processes.find((n) => n.kind === 'subagent');
    if (subagent) {
      const subUrl = `http://127.0.0.1:${PORT}/live?repo=${repoKey}&slug=${slug}&process=${subagent.id}`;
      await captureScreenshot('after-live-subagent.png', subUrl, join(EVIDENCE_DIR, 'after-live-subagent.png'));
    } else {
      screenshotFailures.push(
        '## Screenshot failure: after-live-subagent.png\n\nno subagent node was present in the processes ' +
          'payload handed to writeEvidence — cannot build its /live URL.\n',
      );
    }

    const runnerLogTail = existsSync(runnerLogPath) ? readFileSync(runnerLogPath, 'utf8') : '';
    const viewerLine = runnerLogTail
      .split('\n')
      .find((l) => l.startsWith('campaign viewer:')) ?? '(not found in runner log)';

    const commandsDoc = [
      '# Commands used — campaign live viewer opt-in e2e run',
      '',
      'Reproduces the run this evidence directory documents. Every command below actually ran',
      '(this file is generated by `plugins/tribe/scripts/viewer/e2e/harness.ts`, never',
      'hand-authored).',
      '',
      '## Fixed identifiers for this run',
      '',
      `- Throwaway target repo (deleted by \`stop()\` after this run — the path existed at run`,
      `  time): \`${repoDir}\``,
      `- Campaign home (kept — the Warchief re-inspects it): \`${campaignHome}\``,
      `- Repo key (from \`tribe-home.sh\`): \`${repoKey}\``,
      `- Campaign slug: \`${slug}\``,
      `- Card id: \`${cardId}\``,
      `- Viewer port: \`${PORT}\` (never the default 4321)`,
      '',
      '## Runner\'s printed viewer URL line (G3 evidence)',
      '',
      '```',
      viewerLine,
      '```',
      '',
      '## Commands',
      '',
      '```sh',
      ...commandLog,
      '```',
      '',
      screenshotFailures.length > 0 ? screenshotFailures.join('\n') : '',
      '## Screenshots not captured by this harness',
      '',
      '`before-status-page.png` is the Warchief\'s to capture (the status page, before this run',
      'started) — this harness never creates it.',
      '',
    ].join('\n');
    writeFileSync(join(EVIDENCE_DIR, 'commands.md'), commandsDoc);
  }

  async function stop(): Promise<void> {
    try {
      process.kill(-runnerPid, 'SIGTERM');
    } catch {
      // already gone
    }
    await waitForDeadGroup(runnerPid, 5000);
    try {
      process.kill(-runnerPid, 'SIGKILL');
    } catch {
      // already gone
    }

    // The viewer is spawned detached (its own process group) by the runner — find it by port.
    await killListenersOnPort(PORT, 10_000);

    rmSync(tmpDir, { recursive: true, force: true }); // temp repo only — campaign home stays.
  }

  return {
    repoDir,
    home: campaignHome,
    repoKey,
    slug,
    cardId,
    port: PORT,
    waitForProcesses,
    measureAppendLatencies,
    writeEvidence,
    stop,
  };
}
