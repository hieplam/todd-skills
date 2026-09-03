// core/viewer-launch.ts — pure launch decision for the runner's read-only live viewer
// (spec D11/D12, plan Task 13). No fs, no clock, no spawn, no network: every world-touching
// fact (whether the entry file exists, whether a viewer already answers /healthz) arrives as
// an input; the adapter (`adapters/viewer-launch.adapter.ts`) is the only thing that gathers
// those facts and acts on the decision this module returns.
//
// Card D5 (no new persisted format): the campaign key and URL are derived from `--home`
// ALONE — nothing is read from or written to `run.json`/`campaign-state.json`.
import { basename, dirname } from 'node:path';

/** `--home` is `~/.tribe/<repoKey>/campaigns/<slug>/` — `repoKey` and `slug` are read
 * straight off that path, never persisted anywhere (card D5). */
export interface CampaignKey {
  repoKey: string;
  slug: string;
}

export function campaignKeyOf(homeDir: string): CampaignKey {
  const repoKey = basename(dirname(dirname(homeDir)));
  const slug = basename(homeDir);
  return { repoKey, slug };
}

/** The URL the runner prints (G3) and the adapter probes/reuses (D12). `--home` is
 * free-form input (spec §2), so `repoKey`/`slug` are percent-encoded before interpolation:
 * an unencoded `&`, space, or unicode character in a slug would otherwise either split into
 * extra query params or reach the owner's terminal/browser un-escaped. Ordinary kebab-case
 * slugs (the expected shape) encode to themselves, so this is behavior-preserving for the
 * common case. */
export function viewerUrlFor(homeDir: string, port: number): string {
  const { repoKey, slug } = campaignKeyOf(homeDir);
  return `http://127.0.0.1:${port}/live?repo=${encodeURIComponent(repoKey)}&slug=${encodeURIComponent(slug)}`;
}

export interface ViewerLaunchInput {
  /** `--dry-run`: the whole launch is zero side effects by construction (spec D11). */
  dryRun: boolean;
  /** `--no-viewer`. */
  disabled: boolean;
  port: number;
  homeDir: string;
  /** The viewer's `serve.ts`, resolved by the adapter from its own `import.meta.dir` as a
   * plugin-internal sibling (`../../viewer/serve.ts`) — never an environment value. */
  entryPath: string;
  entryExists: boolean;
  /** Result of the adapter's `GET /healthz` probe against `port` (D12 — reuse first). */
  probeOk: boolean;
}

export interface ViewerLaunchDecision {
  kind: 'skip' | 'reuse' | 'spawn';
  url: string | null;
  argv: string[] | null;
  note: string | null;
}

/** Pure decision: dry-run and `--no-viewer` both degrade to `skip` before anything else is
 * even considered; a missing entry file also degrades to `skip` (never a thrown error); an
 * already-answering viewer is reused (D12); otherwise the decision is to spawn `bun
 * <entryPath> --port <port>` (the adapter performs the actual detached spawn). */
export function decideViewerLaunch(input: ViewerLaunchInput): ViewerLaunchDecision {
  if (input.dryRun) {
    return { kind: 'skip', url: null, argv: null, note: 'skipped: --dry-run' };
  }
  if (input.disabled) {
    return { kind: 'skip', url: null, argv: null, note: 'skipped: --no-viewer' };
  }
  if (!input.entryExists) {
    return {
      kind: 'skip',
      url: null,
      argv: null,
      note: `skipped: viewer entry not found at ${input.entryPath} (expected serve.ts)`,
    };
  }

  const url = viewerUrlFor(input.homeDir, input.port);
  if (input.probeOk) {
    return { kind: 'reuse', url, argv: null, note: null };
  }
  return { kind: 'spawn', url, argv: ['bun', input.entryPath, '--port', String(input.port)], note: null };
}
