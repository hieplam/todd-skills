import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, statSync, truncateSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanTribeRoot, processKillProbe, readTailBytes } from './scan.adapter.ts';
import { deriveStatus } from '../core/derive.ts';

/** Always-false probe — only campaign B (below) supplies a real always-true probe via
 * `process.pid`; every other fixture's runs are either finalized (probe never called) or
 * intentionally dead. */
const deadProbe = (_pid: number) => false;

function writeRunJson(runDir: string, record: Record<string, unknown>): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, 'run.json'), JSON.stringify(record, null, 2));
}

/** Builds a real on-disk tribe-root fixture (spec §4 layout) with three campaigns:
 *  - `camp-finalized`: one finalized run, a readable state.json, a sibling
 *    campaign-report.json + STOP file, one escalation .md, one worker report .md, and an
 *    oversized log file (> 64 KiB) to exercise tail truncation.
 *  - `camp-running`: one unfinalized run whose `pid` is this test process's own pid, so the
 *    real `probe` (passed by the caller, mirroring serve.ts's `process.kill(pid, 0)`) reports
 *    it alive end-to-end through `deriveStatus`.
 *  - `camp-corrupt`: a `run.json` that is not valid JSON at all.
 * A stray non-directory file sits next to the repoKey dirs and inside `campaigns/` to prove
 * the two-level walk skips non-directories instead of throwing. */
function buildFixtureRoot(): { root: string; repoKey: string; targetRepo: string } {
  const root = mkdtempSync(join(tmpdir(), 'tribe-viewer-scan-'));
  writeFileSync(join(root, 'stray-file-at-root.txt'), 'not a repo key dir');

  const repoKey = 'repo-under-test';
  const campaignsDir = join(root, repoKey, 'campaigns');
  mkdirSync(campaignsDir, { recursive: true });
  writeFileSync(join(campaignsDir, 'stray-file.txt'), 'not a campaign dir');

  const targetRepo = mkdtempSync(join(tmpdir(), 'tribe-viewer-target-repo-'));

  // --- camp-finalized ---------------------------------------------------
  const homeFinalized = join(campaignsDir, 'camp-finalized');
  const runIdFinalized = '2026-07-18T00-00-00-000Z-fini';
  const runDirFinalized = join(homeFinalized, 'runs', runIdFinalized);
  const logsDirFinalized = join(runDirFinalized, 'logs');
  mkdirSync(logsDirFinalized, { recursive: true });

  const statePath = join(targetRepo, 'state.json');
  writeFileSync(
    statePath,
    JSON.stringify({
      v: 1,
      campaign: 'camp',
      mergePolicy: 'auto',
      sequence: ['C1'],
      schemaLockPaths: [],
      docsOnlyPaths: [],
      ownerOnlyEscalations: [],
      cards: { C1: { status: 'shipped', pr: 5, updatedAt: null, dependsOn: [] } },
    }),
  );
  writeFileSync(
    join(targetRepo, 'campaign-report.json'),
    JSON.stringify({ v: 1, campaign: 'camp', cards: { C1: { outcome: 'shipped', pr: 5 } } }),
  );
  writeFileSync(join(targetRepo, 'STOP'), '');

  const escalationsDir = join(targetRepo, 'escalations');
  mkdirSync(escalationsDir, { recursive: true });
  writeFileSync(join(escalationsDir, 'C2.md'), '**Reason:** Need clarification\n\n## Context\nmore text');
  writeFileSync(join(escalationsDir, 'not-an-escalation.txt'), 'ignore me — not .md');

  const reportsDirFinalized = join(homeFinalized, 'reports');
  mkdirSync(reportsDirFinalized, { recursive: true });
  writeFileSync(join(reportsDirFinalized, 'C1.md'), 'worker report body');

  // Oversized log: > 64 KiB of filler lines (never "xxxx" — distinct from the known tail so
  // its absence in the tail is provable) followed by 50 known lines with NO trailing newline,
  // so the read window's last-40 selection lands exactly on tail-line-10..tail-line-49 —
  // proof the adapter tailed the last 64 KiB rather than reading (or line-splitting) the
  // whole multi-hundred-KB file.
  const fillerLines = Array.from({ length: 10000 }, (_, i) => `filler-line-${i}`);
  const knownTailLines = Array.from({ length: 50 }, (_, i) => `tail-line-${i}`);
  const logContent = [...fillerLines, ...knownTailLines].join('\n');
  writeFileSync(join(logsDirFinalized, 'session.log'), logContent);

  writeRunJson(runDirFinalized, {
    v: 1,
    runId: runIdFinalized,
    pid: 123,
    startedAt: '2026-07-18T00:00:00.000Z',
    repo: targetRepo,
    statePath,
    answersPath: join(targetRepo, 'answers.md'),
    escalationsDir,
    logsDir: logsDirFinalized,
    argv: [],
    endedAt: '2026-07-18T00:10:00.000Z',
    exitCode: 2,
    reason: 'escalations_pending',
  });

  // --- camp-running -------------------------------------------------------
  const homeRunning = join(campaignsDir, 'camp-running');
  const runIdRunning = '2026-07-24T06-00-00-000Z-b2b2';
  const runDirRunning = join(homeRunning, 'runs', runIdRunning);
  const logsDirRunning = join(runDirRunning, 'logs');
  mkdirSync(logsDirRunning, { recursive: true });
  writeRunJson(runDirRunning, {
    v: 1,
    runId: runIdRunning,
    pid: process.pid,
    startedAt: '2026-07-24T06:00:00.000Z',
    repo: targetRepo,
    statePath: join(targetRepo, 'nonexistent-state.json'),
    answersPath: join(targetRepo, 'answers.md'),
    escalationsDir: join(targetRepo, 'nonexistent-escalations'),
    logsDir: logsDirRunning,
    argv: [],
    endedAt: null,
    exitCode: null,
    reason: null,
  });

  // --- camp-corrupt ---------------------------------------------------------
  const homeCorrupt = join(campaignsDir, 'camp-corrupt');
  const runIdCorrupt = '2026-07-01T00-00-00-000Z-dead';
  const runDirCorrupt = join(homeCorrupt, 'runs', runIdCorrupt);
  mkdirSync(runDirCorrupt, { recursive: true });
  writeFileSync(join(runDirCorrupt, 'run.json'), '{ this is not valid json !!!');

  return { root, repoKey, targetRepo };
}

describe('scanTribeRoot', () => {
  test('finalized campaign: run/state/report/STOP/escalation/report/log all read; log tailed to last 40 lines', () => {
    const { root, repoKey } = buildFixtureRoot();
    const snapshots = scanTribeRoot(root, deadProbe, '2026-07-24T06:13:59.000Z');

    const finalized = snapshots.find((s) => s.campaignSlug === 'camp-finalized');
    expect(finalized).toBeDefined();
    expect(finalized!.repoKey).toBe(repoKey);
    expect(finalized!.runs).toHaveLength(1);
    expect(finalized!.runs[0]!.endedAt).toBe('2026-07-18T00:10:00.000Z');
    expect(finalized!.runs[0]!.parseError).toBeNull();
    expect(finalized!.runs[0]!.pidAlive).toBe(false);

    expect(finalized!.stateRaw).not.toBeNull();
    expect(JSON.parse(finalized!.stateRaw!).cards.C1.status).toBe('shipped');
    expect(finalized!.reportRaw).not.toBeNull();
    expect(finalized!.stopExists).toBe(true);

    expect(finalized!.escalations).toHaveLength(1);
    expect(finalized!.escalations[0]!.file).toBe('C2.md');
    expect(finalized!.escalations[0]!.raw).toContain('Need clarification');

    expect(finalized!.reports).toEqual([{ cardId: 'C1', sizeBytes: 'worker report body'.length }]);

    expect(finalized!.newestLog).not.toBeNull();
    expect(finalized!.newestLog!.file).toBe('session.log');
    // Tail must be truncated: only the last 40 of the 50 known tail lines survive, and the
    // 70 KiB of leading padding must never appear (proves last-64-KiB read, not whole file).
    expect(finalized!.newestLog!.tailLines).toHaveLength(40);
    expect(finalized!.newestLog!.tailLines[0]).toBe('tail-line-10');
    expect(finalized!.newestLog!.tailLines[39]).toBe('tail-line-49');
    expect(finalized!.newestLog!.tailLines.some((l) => l.includes('filler-line'))).toBe(false);

    // Full pipeline sanity: deriveStatus renders this as exited with the report's blockedOn.
    const status = deriveStatus(finalized!);
    expect(status.liveness).toEqual({
      kind: 'exited',
      reason: 'escalations_pending',
      exitCode: 2,
      endedAt: '2026-07-18T00:10:00.000Z',
      runId: '2026-07-18T00-00-00-000Z-fini',
    });
    expect(status.stopRequested).toBe(true);
  });

  test('running campaign: unfinalized run + live pid probes running end-to-end through deriveStatus', () => {
    const { root } = buildFixtureRoot();
    const livePidProbe = (pid: number) => pid === process.pid;
    const snapshots = scanTribeRoot(root, livePidProbe, '2026-07-24T06:13:59.000Z');

    const running = snapshots.find((s) => s.campaignSlug === 'camp-running');
    expect(running).toBeDefined();
    expect(running!.runs[0]!.pid).toBe(process.pid);
    expect(running!.runs[0]!.pidAlive).toBe(true);

    const status = deriveStatus(running!);
    expect(status.liveness.kind).toBe('running');
    if (status.liveness.kind === 'running') {
      expect(status.liveness.pid).toBe(process.pid);
    }
  });

  test('corrupt run.json: parseError set, campaign still returned, OTHER campaigns unaffected', () => {
    const { root } = buildFixtureRoot();
    const snapshots = scanTribeRoot(root, deadProbe, '2026-07-24T06:13:59.000Z');

    expect(snapshots).toHaveLength(3);

    const corrupt = snapshots.find((s) => s.campaignSlug === 'camp-corrupt');
    expect(corrupt).toBeDefined();
    expect(corrupt!.runs).toHaveLength(1);
    expect(corrupt!.runs[0]!.parseError).not.toBeNull();
    expect(typeof corrupt!.runs[0]!.parseError).toBe('string');
    expect(corrupt!.runs[0]!.pid).toBeNull();
    expect(corrupt!.runs[0]!.endedAt).toBeNull();
    // No state to derive from since the corrupt run's paths were never parsed.
    expect(corrupt!.stateRaw).toBeNull();

    // The other two campaigns are unaffected by the corrupt one.
    const finalized = snapshots.find((s) => s.campaignSlug === 'camp-finalized');
    const running = snapshots.find((s) => s.campaignSlug === 'camp-running');
    expect(finalized).toBeDefined();
    expect(finalized!.stateRaw).not.toBeNull();
    expect(running).toBeDefined();
    expect(running!.runs[0]!.pid).toBe(process.pid);
  });

  test('empty tribe-root: no campaigns, no throw', () => {
    const root = mkdtempSync(join(tmpdir(), 'tribe-viewer-empty-'));
    const snapshots = scanTribeRoot(root, deadProbe, '2026-07-24T06:13:59.000Z');
    expect(snapshots).toEqual([]);
  });

  test('nonexistent tribe-root: no throw, empty result', () => {
    const snapshots = scanTribeRoot('/nonexistent/tribe/root/path', deadProbe, '2026-07-24T06:13:59.000Z');
    expect(snapshots).toEqual([]);
  });

  test('F2 regression: newer run with null sibling paths is "latest" — badge reflects it, body is NOT silently backfilled from an older run', () => {
    // An OLDER run with full sibling paths + real state data, and a NEWER run (later
    // `startedAt`) whose `run.json` parses fine but simply omits statePath/escalationsDir/
    // logsDir. Before the fix, `latestParsedRun`'s eligibility filter skipped the newer run
    // (no sibling paths) and picked the older one for body content, while `latestRunOf` in
    // `core/derive.ts` (unfiltered) picked the newer one for the liveness badge — a mismatch
    // between what the badge says and what the page body shows.
    const root = mkdtempSync(join(tmpdir(), 'tribe-viewer-f2-'));
    const repoKey = 'repo';
    const campaignsDir = join(root, repoKey, 'campaigns');
    const home = join(campaignsDir, 'camp');
    mkdirSync(home, { recursive: true });

    const targetRepo = mkdtempSync(join(tmpdir(), 'tribe-viewer-f2-target-'));
    const statePath = join(targetRepo, 'state.json');
    writeFileSync(
      statePath,
      JSON.stringify({ sequence: ['C1'], cards: { C1: { status: 'shipped', pr: null, updatedAt: null, dependsOn: [] } } }),
    );

    writeRunJson(join(home, 'runs', '2026-07-01T00-00-00-000Z-old'), {
      runId: '2026-07-01T00-00-00-000Z-old',
      startedAt: '2026-07-01T00:00:00.000Z',
      pid: 111,
      endedAt: '2026-07-01T00:10:00.000Z',
      exitCode: 0,
      reason: 'done',
      statePath,
      escalationsDir: null,
      logsDir: null,
    });
    writeRunJson(join(home, 'runs', '2026-07-24T00-00-00-000Z-new'), {
      runId: '2026-07-24T00-00-00-000Z-new',
      startedAt: '2026-07-24T00:00:00.000Z',
      pid: 222,
      endedAt: '2026-07-24T00:05:00.000Z',
      exitCode: 1,
      reason: 'escalations_pending',
      // No statePath/escalationsDir/logsDir at all — the mismatch trigger.
    });

    const snapshots = scanTribeRoot(root, deadProbe, '2026-07-24T06:00:00.000Z');
    const snap = snapshots.find((s) => s.campaignSlug === 'camp');
    expect(snap).toBeDefined();

    const status = deriveStatus(snap!);
    // Badge (liveness) must reflect the NEWER run.
    expect(status.liveness).toEqual({
      kind: 'exited',
      reason: 'escalations_pending',
      exitCode: 1,
      endedAt: '2026-07-24T00:05:00.000Z',
      runId: '2026-07-24T00-00-00-000Z-new',
    });
    // Body content must NOT be silently backfilled from the older run: the actual latest run
    // has no paths, so state/report/escalations/log all read as null/empty — never the older
    // run's 'shipped' state.
    expect(snap!.stateRaw).toBeNull();
    expect(status.cards).toEqual([]);
  });
});

describe('processKillProbe', () => {
  test('F4 regression: EPERM (pid exists, signalling forbidden) is reported ALIVE, not dead', () => {
    // On macOS/Linux, pid 1 (init/launchd) exists but a non-root caller cannot signal it —
    // process.kill(1, 0) throws EPERM, never ESRCH. A genuinely dead pid throws ESRCH instead.
    let sawEPERM = false;
    try {
      process.kill(1, 0);
    } catch (err) {
      const code: string = (err as NodeJS.ErrnoException).code ?? '';
      sawEPERM = code === 'EPERM';
      // If this sandbox doesn't reproduce EPERM on pid 1 (e.g. running as root), the whole
      // premise for this regression test doesn't hold here — surface that clearly.
      expect(['EPERM', 'ESRCH']).toContain(code);
    }
    expect(sawEPERM).toBe(true);

    // A pid that genuinely does not exist must still be reported dead.
    expect(processKillProbe(999999)).toBe(false);
    // A pid that exists but can't be signalled (EPERM) must be reported ALIVE.
    expect(processKillProbe(1)).toBe(true);
  });
});

describe('readTailBytes', () => {
  test('F3 regression: stale sizeBytes (file shrank after stat) never leaks NUL bytes into the tail', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tribe-viewer-f3-'));
    const path = join(dir, 'session.log');
    writeFileSync(path, 'x'.repeat(1000));
    // Capture the size BEFORE the file shrinks — mirrors a stale `statTail` result from just
    // before a concurrent log rotation/truncation.
    const staleSizeBytes = statSync(path).size;
    expect(staleSizeBytes).toBe(1000);
    truncateSync(path, 100); // simulate the concurrent shrink between stat and read

    const scanErrors: string[] = [];
    const lines = readTailBytes(path, staleSizeBytes, scanErrors);
    expect(lines).not.toBeNull();
    const joined = lines!.join('\n');
    expect(joined.length).toBe(100); // honestly shorter, not NUL-padded to the stale 1000
    for (const line of lines!) {
      for (let i = 0; i < line.length; i++) {
        expect(line.codePointAt(i)).not.toBe(0);
      }
    }
  });
});
