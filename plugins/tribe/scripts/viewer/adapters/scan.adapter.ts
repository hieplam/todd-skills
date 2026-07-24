// Filesystem/process adapter for the viewer (spec §7). This is the ONLY viewer file — besides
// `serve.ts`, its composition-root caller — that imports `node:fs`/`node:path`/`node:os`.
// Every read here is a plain read: `readdirSync`/`statSync`/`readFileSync`/`openSync`+`readSync`,
// and the liveness "probe" injected by the caller is `process.kill(pid, 0)` — signal 0 sends no
// signal, it only asks the kernel "does this pid exist" (a read, never an actual kill). The
// viewer never writes, deletes, renames, or locks anything, anywhere (spec §2 non-goals).
//
// Read failures are individually fault-isolated (spec §9): a single unreadable/corrupt artifact
// must never take down the rest of one campaign's snapshot, nor any other campaign's. A missing
// *optional* artifact (no campaign-report.json yet, no STOP file, no escalations/reports/logs
// directory yet — all completely normal for a campaign that hasn't reached that stage) is not an
// error: it degrades to `null`/`false`/`[]` silently. Any OTHER failure (unreadable state.json,
// a log file that exists but can't be tailed, etc.) is pushed onto that campaign's `scanErrors`
// so it surfaces as an error panel (spec §9's "unreadable state / logs" row) while the rest of
// the snapshot still derives.
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import type { CampaignSnapshot, RunView } from '../core/model.ts';

const TAIL_BYTES = 65536;
const TAIL_LINE_COUNT = 40;

/** One parsed `run.json`, kept alongside the paths only the adapter needs (to locate the
 * latest run's sibling state/report/escalations) — these paths are deliberately NOT part of
 * `RunView` (core/model.ts), which is display data for every listed run, not adapter plumbing. */
interface ParsedRun {
  view: RunView;
  statePath: string | null;
  escalationsDir: string | null;
  logsDir: string | null;
}

function isErrnoException(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}

/** `true` only for "this artifact simply doesn't exist yet" — the normal, expected state for
 * plenty of not-yet-reached campaign artifacts (a running campaign has no report yet, a fresh
 * campaign has no escalations dir yet, etc.). Any other failure is a real problem. */
function isMissing(err: unknown): boolean {
  return isErrnoException(err) && err.code === 'ENOENT';
}

/** Lists only the directory entries of `dir` that are themselves directories — skips stray
 * files and swallows a missing/unreadable `dir` into an empty list (spec: "skip
 * non-directories"; an absent tribe-root/campaigns dir is the normal empty-page case, not an
 * error — spec §9). */
function listSubdirs(dir: string): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return [];
  }
  return entries.filter((name) => {
    try {
      return statSync(join(dir, name)).isDirectory();
    } catch {
      return false;
    }
  });
}

/** Lists files directly under `dir` whose name ends with `suffix`. Missing `dir` -> `[]`
 * (normal — reports/escalations directories don't exist until something writes into them). */
function listFilesWithSuffix(dir: string, suffix: string, scanErrors: string[]): string[] {
  try {
    return readdirSync(dir).filter((name) => {
      try {
        return name.endsWith(suffix) && statSync(join(dir, name)).isFile();
      } catch {
        return false;
      }
    });
  } catch (err) {
    if (!isMissing(err)) scanErrors.push(`reading ${dir}: ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
}

/** Reads one `runs/<run-id>/run.json`. A parse failure yields a `RunView` with `parseError`
 * set and every other field best-effort null/false — the run is still listed (spec §7/§9), it
 * just contributes no paths for `latestRunOf` to read. */
function readRunJson(runDir: string, probe: (pid: number) => boolean): ParsedRun {
  const runId = basename(runDir);
  const path = join(runDir, 'run.json');
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    return {
      view: {
        runId,
        startedAt: '',
        pid: null,
        endedAt: null,
        exitCode: null,
        reason: null,
        pidAlive: false,
        parseError: err instanceof Error ? err.message : String(err),
      },
      statePath: null,
      escalationsDir: null,
      logsDir: null,
    };
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    return {
      view: {
        runId,
        startedAt: '',
        pid: null,
        endedAt: null,
        exitCode: null,
        reason: null,
        pidAlive: false,
        parseError: err instanceof Error ? err.message : String(err),
      },
      statePath: null,
      escalationsDir: null,
      logsDir: null,
    };
  }

  const endedAt = typeof parsed.endedAt === 'string' ? parsed.endedAt : null;
  const pid = typeof parsed.pid === 'number' ? parsed.pid : null;
  // Probe pid ONLY for records with endedAt === null (spec §7) — a finalized run's pid may
  // long since have been recycled by the OS, so it is never live-checked.
  const pidAlive = endedAt === null && pid !== null ? probe(pid) : false;

  return {
    view: {
      runId: typeof parsed.runId === 'string' ? parsed.runId : runId,
      startedAt: typeof parsed.startedAt === 'string' ? parsed.startedAt : '',
      pid,
      endedAt,
      exitCode: typeof parsed.exitCode === 'number' ? parsed.exitCode : null,
      reason: typeof parsed.reason === 'string' ? parsed.reason : null,
      pidAlive,
      parseError: null,
    },
    statePath: typeof parsed.statePath === 'string' ? parsed.statePath : null,
    escalationsDir: typeof parsed.escalationsDir === 'string' ? parsed.escalationsDir : null,
    logsDir: typeof parsed.logsDir === 'string' ? parsed.logsDir : null,
  };
}

/** Picks the successfully-parsed run with the max `startedAt` (mirrors `core/derive.ts`'s own
 * `latestRunOf` tie-break); a run whose `run.json` failed to parse has no paths to contribute,
 * so it can never be "latest" for the purposes of reading sibling artifacts. */
function latestParsedRun(runs: ParsedRun[]): ParsedRun | null {
  return runs.reduce<ParsedRun | null>((best, run) => {
    if (run.statePath === null && run.escalationsDir === null && run.logsDir === null) return best;
    if (best === null || run.view.startedAt > best.view.startedAt) return run;
    return best;
  }, null);
}

/** Reads a file, treating "doesn't exist" as the normal `null` case and any other failure as a
 * `scanErrors` entry. */
function readOptionalFile(path: string, scanErrors: string[]): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (!isMissing(err)) scanErrors.push(`reading ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/** Reads the last `TAIL_BYTES` of `path` via `openSync`/`readSync` at `max(0, size - TAIL_BYTES)`
 * — never a whole-file read, so a multi-GB log costs one bounded read (spec §7). */
function tailFile(path: string, scanErrors: string[]): { sizeBytes: number; mtimeIso: string; tailLines: string[] } | null {
  let sizeBytes: number;
  let mtimeIso: string;
  try {
    const st = statSync(path);
    sizeBytes = st.size;
    mtimeIso = st.mtime.toISOString();
  } catch (err) {
    if (!isMissing(err)) scanErrors.push(`stat ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  const start = Math.max(0, sizeBytes - TAIL_BYTES);
  const length = sizeBytes - start;
  const buffer = Buffer.alloc(length);
  try {
    const fd = openSync(path, 'r');
    try {
      readSync(fd, buffer, 0, length, start);
    } finally {
      closeSync(fd);
    }
  } catch (err) {
    scanErrors.push(`reading tail of ${path}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  const lines = buffer.toString('utf8').split('\n');
  const tailLines = lines.slice(Math.max(0, lines.length - TAIL_LINE_COUNT));
  return { sizeBytes, mtimeIso, tailLines };
}

/** Newest-mtime file directly under `logsDir` (missing dir / no files -> `null`, the normal
 * "no session activity yet" case — not an error). */
function newestLogOf(
  logsDir: string,
  scanErrors: string[],
): CampaignSnapshot['newestLog'] {
  let entries: string[];
  try {
    entries = readdirSync(logsDir);
  } catch (err) {
    if (!isMissing(err)) scanErrors.push(`reading ${logsDir}: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }

  let newest: { file: string; mtimeMs: number } | null = null;
  for (const name of entries) {
    try {
      const st = statSync(join(logsDir, name));
      if (!st.isFile()) continue;
      if (newest === null || st.mtimeMs > newest.mtimeMs) newest = { file: name, mtimeMs: st.mtimeMs };
    } catch {
      // Transient stat failure on one log entry — skip it, others still considered.
      continue;
    }
  }
  if (newest === null) return null;

  const tail = tailFile(join(logsDir, newest.file), scanErrors);
  if (tail === null) return null;
  return { file: newest.file, mtimeIso: tail.mtimeIso, sizeBytes: tail.sizeBytes, tailLines: tail.tailLines };
}

function scanCampaign(
  repoKey: string,
  campaignSlug: string,
  homeDir: string,
  probe: (pid: number) => boolean,
  nowIso: string,
): CampaignSnapshot {
  const scanErrors: string[] = [];

  const runIds = listSubdirs(join(homeDir, 'runs'));
  const parsedRuns = runIds.map((runId) => readRunJson(join(homeDir, 'runs', runId), probe));
  const latest = latestParsedRun(parsedRuns);

  let stateRaw: string | null = null;
  let reportRaw: string | null = null;
  let stopExists = false;
  let escalations: CampaignSnapshot['escalations'] = [];
  let newestLog: CampaignSnapshot['newestLog'] = null;

  if (latest !== null && latest.statePath !== null) {
    stateRaw = readOptionalFile(latest.statePath, scanErrors);
    const siblingDir = dirname(latest.statePath);
    reportRaw = readOptionalFile(join(siblingDir, 'campaign-report.json'), scanErrors);
    stopExists = existsSync(join(siblingDir, 'STOP'));
  }

  if (latest !== null && latest.escalationsDir !== null) {
    const files = listFilesWithSuffix(latest.escalationsDir, '.md', scanErrors);
    escalations = files.map((file) => ({
      file,
      raw: readOptionalFile(join(latest.escalationsDir!, file), scanErrors) ?? '',
    }));
  }

  if (latest !== null && latest.logsDir !== null) {
    newestLog = newestLogOf(latest.logsDir, scanErrors);
  }

  const reportsDir = join(homeDir, 'reports');
  const reportFiles = listFilesWithSuffix(reportsDir, '.md', scanErrors);
  const reports: CampaignSnapshot['reports'] = reportFiles.map((file) => {
    let sizeBytes = 0;
    try {
      sizeBytes = statSync(join(reportsDir, file)).size;
    } catch (err) {
      if (!isMissing(err)) scanErrors.push(`stat ${join(reportsDir, file)}: ${err instanceof Error ? err.message : String(err)}`);
    }
    return { cardId: file.replace(/\.md$/, ''), sizeBytes };
  });

  return {
    repoKey,
    campaignSlug,
    homeDir,
    runs: parsedRuns.map((r) => r.view),
    stateRaw,
    stopExists,
    reportRaw,
    escalations,
    reports,
    newestLog,
    nowIso,
    scanErrors,
  };
}

/** Walks `<root>/<repoKey>/campaigns/<slug>/` two levels deep (spec §7) and returns one
 * `CampaignSnapshot` per campaign found. Non-directory entries at either level are skipped; a
 * missing/unreadable `root` yields an empty list (spec §9: "tribe-root absent/empty" ->
 * friendly empty page, never a thrown error). Each campaign is scanned independently — an
 * exception scanning one campaign (defensive; individual reads inside already fault-isolate)
 * never removes the others from the result. */
export function scanTribeRoot(root: string, probe: (pid: number) => boolean, nowIso: string): CampaignSnapshot[] {
  const snapshots: CampaignSnapshot[] = [];
  for (const repoKey of listSubdirs(root)) {
    const campaignsDir = join(root, repoKey, 'campaigns');
    for (const campaignSlug of listSubdirs(campaignsDir)) {
      try {
        snapshots.push(scanCampaign(repoKey, campaignSlug, join(campaignsDir, campaignSlug), probe, nowIso));
      } catch (err) {
        snapshots.push({
          repoKey,
          campaignSlug,
          homeDir: join(campaignsDir, campaignSlug),
          runs: [],
          stateRaw: null,
          stopExists: false,
          reportRaw: null,
          escalations: [],
          reports: [],
          newestLog: null,
          nowIso,
          scanErrors: [`scanning campaign: ${err instanceof Error ? err.message : String(err)}`],
        });
      }
    }
  }
  return snapshots;
}
