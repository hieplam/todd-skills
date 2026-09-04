// F55 regression proof: a real `Bun.serve` process (spawned separately, not in-process — the
// in-process case does not reproduce the defect: Bun's loopback fast path between two `fetch()`
// calls in the SAME event loop never hits the idle-timeout close, only a genuinely separate
// client socket does, which is what a browser's `EventSource` and this repo's `curl -N` repro
// both are) configured with `idleTimeout: SSE_IDLE_TIMEOUT_SECONDS` — the exact same option
// `serve.ts` passes to `Bun.serve` — must keep an idle SSE-shaped connection alive past Bun's
// own ~10s default, so a quiet `/events` stream survives long enough for the poller's 15s
// keepalive ping to refresh it. This needs no live campaign: it spawns a standalone script that
// imports the real `SSE_IDLE_TIMEOUT_SECONDS` from `core/live/model.ts` and reconstructs only
// the one `Bun.serve` call shape (idleTimeout + text/event-stream response) `serve.ts` uses for
// `/events`, then holds it open with a real `curl -N`, exactly as F55's reproduction steps
// describe.
import { expect, test } from 'bun:test';
import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const SERVER_SCRIPT = `
import { SSE_IDLE_TIMEOUT_SECONDS } from '${join(import.meta.dir, 'core', 'live', 'model.ts')}';
const server = Bun.serve({
  hostname: '127.0.0.1',
  port: 0,
  idleTimeout: SSE_IDLE_TIMEOUT_SECONDS,
  fetch() {
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(': connected\\n\\n'));
          // Deliberately writes nothing else until well past Bun's old ~10s default, then sends
          // one marker frame and closes. 15s (not e.g. 11s) is deliberate: near the 10s
          // boundary Bun's own idle check is racy against the scheduling of this very timer, so
          // this margin is what makes the RED case (no idleTimeout) reliably fail every run
          // instead of only sometimes.
          setTimeout(() => {
            controller.enqueue(new TextEncoder().encode('data: still-alive\\n\\n'));
            controller.close();
          }, 15_000);
        },
      }),
      { headers: { 'content-type': 'text/event-stream' } },
    );
  },
});
process.stdout.write(\`PORT \${server.port}\\n\`);
`;

function waitForPort(child: ChildProcess, timeoutMs: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server never printed its port')), timeoutMs);
    let buffer = '';
    child.stdout?.on('data', (chunk) => {
      buffer += chunk.toString();
      const match = /^PORT (\d+)$/m.exec(buffer);
      if (match) {
        clearTimeout(timer);
        resolve(Number(match[1]));
      }
    });
  });
}

test(
  'a real Bun.serve process with the real SSE_IDLE_TIMEOUT_SECONDS keeps an idle SSE connection ' +
    "alive past Bun's ~10s default, observed by a genuinely separate curl client (F55)",
  async () => {
    const dir = mkdtempSync(join(tmpdir(), 'tribe-idle-timeout-'));
    const scriptPath = join(dir, 'server.ts');
    writeFileSync(scriptPath, SERVER_SCRIPT);

    const child = spawn('bun', ['run', scriptPath], { stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      const port = await waitForPort(child, 5000);
      const out = execFileSync('curl', ['-s', '-N', '--max-time', '20', `http://127.0.0.1:${port}/`], {
        encoding: 'utf8',
      });
      // If Bun's own ~10s idle-timeout default had fired (as it does with no idleTimeout set —
      // this repo's own F55 finding reproduced that by hand with this exact curl invocation
      // shape), `out` would end at ": connected\n\n" and never reach the marker written at t=15s.
      expect(out).toContain('still-alive');
    } finally {
      child.kill('SIGKILL');
      rmSync(dir, { recursive: true, force: true });
    }
  },
  25_000,
);
