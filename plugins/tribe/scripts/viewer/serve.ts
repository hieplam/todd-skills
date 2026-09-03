// Composition root (spec §7): wires the adapters (I/O) to the pure core (derive/render/live) and
// serves the result over HTTP. Zero business logic lives here beyond the campaign-context lookup
// spelled out below — every GET `/` still re-scans from scratch (refresh IS the poll for the
// status page, spec D3/non-goals); `/events` opens one SSE stream per connection, backed by the
// only clock owner in this package (`adapters/poller.adapter.ts`).
import { deriveStatus } from './core/derive.ts';
import { renderPage } from './core/render.ts';
import { renderLivePage } from './core/live/page.ts';
import { encodeSseFrame, parseLiveRoute } from './core/live/routes.ts';
import { sanitizeProjectDirName, projectDirOf, transcriptPathOf, subagentsDirOf } from './core/live/paths.ts';
import { MAX_LIVE_STREAMS, POLL_INTERVAL_MS, type ProcessNode } from './core/live/model.ts';
import { isStateFile, latestRunRecord, selectLiveCard } from './core/live/campaign.ts';
import { scanTribeRoot, processKillProbe } from './adapters/scan.adapter.ts';
import { createTranscriptIo, type TranscriptIo } from './adapters/transcript.adapter.ts';
import { createLivePoller, type LiveCampaignContext } from './adapters/poller.adapter.ts';
import { join } from 'node:path';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const tribeRoot = arg('--tribe-root') ?? join(process.env.HOME ?? '', '.tribe');
const port = Number(arg('--port') ?? '4321');
const probe = processKillProbe;

const io = createTranscriptIo();
const ASSETS: Record<'app.js' | 'app.css', string> = {
  'app.js': io.readAsset('app.js'),
  'app.css': io.readAsset('app.css'),
};
const ASSET_CONTENT_TYPE: Record<'app.js' | 'app.css', string> = {
  'app.js': 'text/javascript; charset=utf-8',
  'app.css': 'text/css; charset=utf-8',
};

/** Resolves everything the poller needs to locate a campaign's transcripts, from nothing but
 * `repo`+`slug` (card D5 — no new persisted field, nothing cached across requests). Every
 * decision — which run is latest, whether the state file is well-shaped, which card/session it
 * selects — is `core/live/campaign.ts` (F46): this function does I/O and path-joining only. Any
 * missing piece (no run, unreadable state, no cards, no recorded session id) degrades to `null`
 * — the caller turns that into an empty process list / 404, never a throw. */
function resolveCampaignContext(
  tio: TranscriptIo,
  root: string,
  repoKey: string,
  slug: string,
): LiveCampaignContext | null {
  const homeDir = join(root, repoKey, 'campaigns', slug);
  const runsDir = join(homeDir, 'runs');
  const rawRuns = tio.listDirOrEmpty(runsDir).map((runId) => tio.readJsonOrNull(join(runsDir, runId, 'run.json')));
  const run = latestRunRecord(rawRuns);
  if (run === null) return null;

  const rawState = tio.readJsonOrNull(run.statePath);
  if (!isStateFile(rawState)) return null;
  const selected = selectLiveCard(rawState);
  if (selected === null) return null;

  const homeUserDir = process.env.HOME ?? '';
  const realCwd = tio.realpathOrNull(run.repo) ?? run.repo;
  const projectDir = projectDirOf(homeUserDir, sanitizeProjectDirName(realCwd));

  return {
    cardId: selected.cardId,
    sessionId: selected.sessionId,
    transcriptPath: transcriptPathOf(projectDir, selected.sessionId),
    subagentsDir: subagentsDirOf(projectDir, selected.sessionId),
    cardStatus: selected.cardStatus,
  };
}

/** Reuses the poller for a single one-shot read (`GET /api/processes`, spec §4.2's
 * machine-readable surface): construction alone runs one full tick and emits the `processes`
 * frame synchronously (before any interval is scheduled), so capturing that first frame and
 * immediately stopping needs no real timer at all. */
function computeProcessesOnce(tio: TranscriptIo, campaign: LiveCampaignContext): ProcessNode[] {
  let processes: ProcessNode[] = [];
  const poller = createLivePoller({
    io: tio,
    intervalMs: POLL_INTERVAL_MS,
    campaign,
    processId: `card:${campaign.cardId}`,
    emit: (frame) => {
      if (frame.event === 'processes') processes = (frame.data as { processes: ProcessNode[] }).processes;
    },
  });
  poller.stop();
  return processes;
}

let activeStreams = 0;

Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch(req) {
    const route = parseLiveRoute(req.url);

    switch (route.kind) {
      case 'status': {
        const nowIso = new Date().toISOString();
        const statuses = scanTribeRoot(tribeRoot, probe, nowIso).map(deriveStatus);
        return new Response(renderPage(statuses, { tribeRoot, nowIso }), {
          headers: { 'content-type': 'text/html; charset=utf-8' },
        });
      }

      case 'health':
        return Response.json({ ok: true, viewer: 'tribe-live-viewer', v: 1 });

      case 'asset':
        return new Response(ASSETS[route.name], {
          headers: { 'content-type': ASSET_CONTENT_TYPE[route.name] },
        });

      case 'live':
        return new Response(
          renderLivePage({ repoKey: route.repoKey, slug: route.slug, processId: route.processId }),
          { headers: { 'content-type': 'text/html; charset=utf-8' } },
        );

      case 'processes': {
        const context = resolveCampaignContext(io, tribeRoot, route.repoKey, route.slug);
        const processes = context === null ? [] : computeProcessesOnce(io, context);
        return Response.json({ processes });
      }

      case 'events': {
        const context = resolveCampaignContext(io, tribeRoot, route.repoKey, route.slug);
        if (context === null) {
          return new Response('campaign not found', { status: 404 });
        }
        if (activeStreams >= MAX_LIVE_STREAMS) {
          return new Response('too many live streams', { status: 503 });
        }
        activeStreams += 1;

        let poller: { stop: () => void } | null = null;
        const stream = new ReadableStream({
          start(controller) {
            const encoder = new TextEncoder();
            poller = createLivePoller({
              io,
              intervalMs: POLL_INTERVAL_MS,
              campaign: context,
              processId: route.processId,
              emit: (frame) => {
                try {
                  controller.enqueue(encoder.encode(encodeSseFrame(frame)));
                } catch {
                  // The client already disconnected and closed the controller — `cancel()`
                  // below has already (or is about to) stop the poller; nothing to do here.
                }
              },
            });
          },
          cancel() {
            poller?.stop();
            activeStreams -= 1;
          },
        });

        return new Response(stream, {
          headers: {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
          },
        });
      }

      case 'bad_request':
        return new Response(route.reason, { status: 400 });

      case 'not_found':
      default:
        return new Response('not found', { status: 404 });
    }
  },
});
console.log(`tribe viewer: http://127.0.0.1:${port} (root: ${tribeRoot}) — read-only, refresh to update`);
