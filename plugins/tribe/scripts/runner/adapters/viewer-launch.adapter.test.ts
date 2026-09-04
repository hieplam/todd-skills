// adapters/viewer-launch.adapter.test.ts — the production ViewerPort's two world-touching
// facts, tested against real (but local, bounded) I/O: a real detached spawn of a
// nonexistent binary (F38 regression: an unlistened spawn 'error' must never take down the
// parent; F49 regression: that same spawn error must now be REPORTED, not swallowed), and a
// real local Bun.serve fake for the reuse probe (F39 regression: the probe must require the
// viewer's own identity marker, not accept any 2xx from any process).
import { expect, test } from 'bun:test';
import { buildViewerPort } from './viewer-launch.adapter.ts';

// F38 — the most important test in this file. Before the fix, a detached spawn of a
// nonexistent binary emits an unlistened 'error' event on a later tick; Node/Bun treat an
// unlistened 'error' as an uncaught exception and kill the whole process. This spawns a
// real child (subprocess, not `bun -e` — spawnDetached itself must be exercised) and proves
// THIS process is still alive well after the async 'error' would have fired.
test('spawnDetached against a nonexistent binary does not kill the parent process (F38)', async () => {
  const port = buildViewerPort();

  expect(() => {
    port.spawnDetached(['/nonexistent/binary/for/sure/f38', '--port', '4321']);
  }).not.toThrow();

  // The spawn 'error' (ENOENT) fires asynchronously, on a later tick than the synchronous
  // call above — give it room to fire and (pre-fix) crash the process before this test's
  // assertion below ever runs.
  await new Promise((resolve) => setTimeout(resolve, 300));

  // Reaching this line at all is the proof: an unhandled 'error' event would have thrown
  // an uncaught exception and torn down the whole bun test process before this point.
  expect(true).toBe(true);
});

// F49 — before the fix, the spawn 'error' handler was `() => {}`: a silent no-op. A viewer
// start failure (bun unresolvable, ENOENT, EACCES, fd exhaustion) was therefore never
// reported anywhere, contradicting the README/C3 docs' own claim that it "is logged to
// stderr". This proves the handler now emits exactly one stderr line for a real spawn
// error, and still never throws (the F38 guarantee must hold together with the new report).
test('spawnDetached against a nonexistent binary reports exactly one stderr line and does not throw (F49)', async () => {
  const port = buildViewerPort();
  const calls: unknown[][] = [];
  const originalConsoleError = console.error;
  console.error = (...args: unknown[]) => {
    calls.push(args);
  };

  try {
    expect(() => {
      port.spawnDetached(['/definitely-not-a-real-binary-xyz', '--port', '4321']);
    }).not.toThrow();

    // The spawn 'error' (ENOENT) fires asynchronously — give it room to fire before
    // asserting on what it produced.
    await new Promise((resolve) => setTimeout(resolve, 300));
  } finally {
    console.error = originalConsoleError;
  }

  expect(calls.length).toBe(1);
  expect(String(calls[0]?.[0])).toMatch(/^campaign viewer: failed to start/);
});

test('probeViewer against a fake serving the correct identity marker returns true (F39)', async () => {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === '/healthz') {
        return Response.json({ ok: true, viewer: 'tribe-live-viewer', v: 1 });
      }
      return new Response('not found', { status: 404 });
    },
  });
  try {
    const port = buildViewerPort();
    expect(await port.probeViewer(server.port!)).toBe(true);
  } finally {
    server.stop(true);
  }
});

test('probeViewer against a 200 with a wrong/absent identity marker returns false (F39)', async () => {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === '/healthz') {
        return Response.json({ ok: true, someOtherService: true });
      }
      return new Response('not found', { status: 404 });
    },
  });
  try {
    const port = buildViewerPort();
    expect(await port.probeViewer(server.port!)).toBe(false);
  } finally {
    server.stop(true);
  }
});

test('probeViewer against a 200 with a non-JSON body returns false, never throws (F39)', async () => {
  const server = Bun.serve({
    port: 0,
    fetch(req) {
      if (new URL(req.url).pathname === '/healthz') {
        return new Response('plain text, not json', { status: 200 });
      }
      return new Response('not found', { status: 404 });
    },
  });
  try {
    const port = buildViewerPort();
    await expect(port.probeViewer(server.port!)).resolves.toBe(false);
  } finally {
    server.stop(true);
  }
});

test('probeViewer against an unreachable port returns false, never throws', async () => {
  const port = buildViewerPort();
  // Port 1 is a privileged, essentially-never-listening port on any dev machine — a stable
  // "nothing here" target without needing to pre-bind-then-close a port ourselves.
  await expect(port.probeViewer(1)).resolves.toBe(false);
});
