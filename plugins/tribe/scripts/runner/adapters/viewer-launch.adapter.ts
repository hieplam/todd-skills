// adapters/viewer-launch.adapter.ts — the only file naming `node:child_process` for the
// live-viewer auto-start (Task 13, spec D11/D12). Owns the two world-touching facts
// `core/viewer-launch.ts` needs (whether `serve.ts` exists, whether a viewer already answers
// `/healthz`) and the one world-touching action its decision can produce (a detached spawn).
// `core/viewer-launch.ts` itself is never called with real I/O baked in — every fact arrives
// as a plain input, exactly like every other adapter in this package (purity wall,
// structure.test.ts).
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { decideViewerLaunch, type ViewerLaunchDecision } from '../core/viewer-launch.ts';
import type { ViewerPort } from '../ports/ports.ts';

/** The viewer's entry point, resolved from THIS adapter's own `import.meta.dir` as a
 * plugin-internal sibling — never an environment value, so the stateless-capability wall is
 * untouched (spec §6). `plugins/tribe/scripts/runner/adapters/` -> `../../viewer/serve.ts` ->
 * `plugins/tribe/scripts/viewer/serve.ts`. */
export const VIEWER_ENTRY_PATH = join(import.meta.dir, '../../viewer/serve.ts');

const PROBE_TIMEOUT_MS = 500;

/** The `/healthz` identity marker THIS viewer answers with (`serve.ts`'s route, added by a
 * concurrently-built task). A bare 2xx is not enough to prove reuse-safety (F39): any
 * unrelated process holding the target port would otherwise pass the probe and get silently
 * "reused". Requiring this exact field makes the probe an identity check, not a liveness
 * check. */
const VIEWER_IDENTITY_MARKER = 'tribe-live-viewer';

/** Production `ViewerPort`: a plain read-only `fetch` probe (card D6) and a detached spawn
 * that cannot hold the runner open (D12: `detached: true`, `stdio: 'ignore'`, then
 * `unref()`). A probe failure (connection refused, timeout, non-JSON body, wrong/absent
 * identity marker, any thrown error) degrades to `false` — never thrown — so anything other
 * than THIS viewer reads exactly like "nothing is listening" (F39). */
export function buildViewerPort(): ViewerPort {
  return {
    async probeViewer(port) {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/healthz`, {
          signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
        });
        if (!res.ok) return false;
        const body = (await res.json()) as unknown;
        return (
          typeof body === 'object' &&
          body !== null &&
          (body as { viewer?: unknown }).viewer === VIEWER_IDENTITY_MARKER
        );
      } catch {
        return false;
      }
    },
    spawnDetached(argv) {
      const child = spawn(argv[0] as string, argv.slice(1), {
        detached: true,
        stdio: 'ignore',
      });
      // F38: an unlistened spawn 'error' (e.g. ENOENT — `bun` not resolvable on the child's
      // PATH under cron/launchd/CI, EACCES, fd exhaustion) fires asynchronously and is an
      // uncaught exception that kills the whole campaign runner — the enclosing try/catch in
      // `cli/main.ts` has already exited its scope by the time it fires, so it cannot help.
      // Same convention as `run-io.adapter.ts`'s `realExec`: degrade to a no-op, never throw
      // — a failed spawn must read exactly like a failed probe (D12: "observability exhaust
      // never kills a run"). Nothing to relay it to here (`spawnDetached` returns void by
      // design — the caller has already returned the 'spawn' decision and printed its URL);
      // production diagnosis of a failed detached spawn is out of band (the viewer never
      // answers `/healthz` on a later run).
      child.on('error', () => {});
      child.unref();
    },
  };
}

/** The edge `cli/main.ts` calls: gathers the two facts `decideViewerLaunch` needs, hands
 * them to the pure core, and performs the spawn if (and only if) the decision says `spawn`.
 * Under `dryRun`/`disabled`/a missing entry file, the probe is never issued — no network call
 * happens at all, matching spec D11's "`--dry-run` never reaches this code path" (zero side
 * effects stays a hard contract). `port`/`entryPath` are injectable for tests; production
 * callers (`cli/main.ts`) use the defaults. */
export async function launchViewer(
  input: { dryRun: boolean; disabled: boolean; port: number; homeDir: string },
  viewerPort: ViewerPort = buildViewerPort(),
  entryPath: string = VIEWER_ENTRY_PATH,
): Promise<ViewerLaunchDecision> {
  const entryExists = existsSync(entryPath);
  const skipProbe = input.dryRun || input.disabled || !entryExists;
  const probeOk = skipProbe ? false : await viewerPort.probeViewer(input.port);

  const decision = decideViewerLaunch({
    dryRun: input.dryRun,
    disabled: input.disabled,
    port: input.port,
    homeDir: input.homeDir,
    entryPath,
    entryExists,
    probeOk,
  });

  if (decision.kind === 'spawn') {
    viewerPort.spawnDetached(decision.argv as string[]);
  }

  return decision;
}
