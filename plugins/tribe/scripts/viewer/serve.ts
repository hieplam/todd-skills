// Composition root (spec §7): wires the adapter (I/O) to the pure core (derive/render) and
// serves the result over HTTP. Zero business logic lives here — every GET `/` re-scans from
// scratch (refresh IS the poll, spec D3/non-goals: no realtime push, nothing cached).
import { deriveStatus } from './core/derive.ts';
import { renderPage } from './core/render.ts';
import { scanTribeRoot, processKillProbe } from './adapters/scan.adapter.ts';
import { join } from 'node:path';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const tribeRoot = arg('--tribe-root') ?? join(process.env.HOME ?? '', '.tribe');
const port = Number(arg('--port') ?? '4321');
const probe = processKillProbe;

Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch() {
    const nowIso = new Date().toISOString();
    const statuses = scanTribeRoot(tribeRoot, probe, nowIso).map(deriveStatus);
    return new Response(renderPage(statuses, { tribeRoot, nowIso }), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
});
console.log(`tribe viewer: http://127.0.0.1:${port} (root: ${tribeRoot}) — read-only, refresh to update`);
