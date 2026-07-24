import { describe, expect, test } from 'bun:test';
import { compareForRender, deriveStatus } from './derive.ts';
import type { CampaignSnapshot, CampaignStatus } from './model.ts';

/** Minimal state.json text builder — mirrors the runner's `CampaignStateSchema` shape
 * (`core/state.ts`) but the viewer never imports or validates against it (spec §7: tolerant
 * reader, not the runner's throwing parser). */
function stateJson(sequence: string[], cards: Record<string, Partial<Record<string, unknown>>>): string {
  const fullCards: Record<string, unknown> = {};
  for (const id of sequence) {
    fullCards[id] = {
      status: 'staged',
      spec: null,
      plan: null,
      branch: null,
      baseSha: null,
      pr: null,
      mergeSha: null,
      sessionId: null,
      updatedAt: null,
      ...cards[id],
    };
  }
  return JSON.stringify({
    v: 1,
    campaign: 'camp',
    mergePolicy: 'auto',
    sequence,
    schemaLockPaths: [],
    docsOnlyPaths: [],
    ownerOnlyEscalations: [],
    cards: fullCards,
  });
}

const BASE = {
  repoKey: '-Users-todd-ai-dict',
  campaignSlug: 'least-effort-5',
  homeDir: '/home/u/.tribe/-Users-todd-ai-dict/campaigns/least-effort-5',
  nowIso: '2026-07-24T06:13:59.000Z',
  scanErrors: [] as string[],
};

describe('deriveStatus — liveness', () => {
  test('running: latest run unfinalized, pid alive', () => {
    const snapshot: CampaignSnapshot = {
      ...BASE,
      runs: [
        {
          runId: '2026-07-20T00-00-00-000Z-a1a1',
          startedAt: '2026-07-20T00:00:00.000Z',
          pid: 111,
          endedAt: '2026-07-20T00:05:00.000Z',
          exitCode: 0,
          reason: 'done',
          pidAlive: false,
          parseError: null,
        },
        {
          runId: '2026-07-24T06-00-00-000Z-b2b2',
          startedAt: '2026-07-24T06:00:00.000Z',
          pid: 27542,
          endedAt: null,
          exitCode: null,
          reason: null,
          pidAlive: true,
          parseError: null,
        },
      ],
      stateRaw: stateJson(['C1', 'C2'], {
        C1: { status: 'shipped', pr: 12, mergeSha: 'abc', updatedAt: '2026-07-24T05:00:00.000Z' },
        C2: { status: 'running' },
      }),
      stopExists: false,
      reportRaw: null,
      escalations: [],
      reports: [],
      newestLog: null,
    };

    const status = deriveStatus(snapshot);

    expect(status).toEqual<CampaignStatus>({
      repoKey: '-Users-todd-ai-dict',
      campaignSlug: 'least-effort-5',
      homeDir: '/home/u/.tribe/-Users-todd-ai-dict/campaigns/least-effort-5',
      liveness: { kind: 'running', pid: 27542, startedAt: '2026-07-24T06:00:00.000Z', runId: '2026-07-24T06-00-00-000Z-b2b2' },
      stopRequested: false,
      cards: [
        { id: 'C1', status: 'shipped', pr: 12, updatedAt: '2026-07-24T05:00:00.000Z', dependsOn: [], blockedOn: null },
        { id: 'C2', status: 'running', pr: null, updatedAt: null, dependsOn: [], blockedOn: null },
      ],
      pendingEscalations: [],
      reports: [],
      sessionTail: null,
      errors: [],
    });
  });

  test('crashed: latest run unfinalized, pid dead', () => {
    const snapshot: CampaignSnapshot = {
      ...BASE,
      runs: [
        {
          runId: '2026-07-17T00-00-00-000Z-dead',
          startedAt: '2026-07-17T00:00:00.000Z',
          pid: 9999,
          endedAt: null,
          exitCode: null,
          reason: null,
          pidAlive: false,
          parseError: null,
        },
      ],
      stateRaw: stateJson(['C1'], { C1: { status: 'running' } }),
      stopExists: true,
      reportRaw: null,
      escalations: [],
      reports: [],
      newestLog: null,
    };

    const status = deriveStatus(snapshot);

    expect(status.liveness).toEqual({
      kind: 'crashed',
      pid: 9999,
      startedAt: '2026-07-17T00:00:00.000Z',
      runId: '2026-07-17T00-00-00-000Z-dead',
    });
    expect(status.stopRequested).toBe(true);
  });

  test('exited: latest run finalized — reason/exitCode/endedAt threaded through', () => {
    const snapshot: CampaignSnapshot = {
      ...BASE,
      runs: [
        {
          runId: '2026-07-18T00-00-00-000Z-fini',
          startedAt: '2026-07-18T00:00:00.000Z',
          pid: 123,
          endedAt: '2026-07-18T00:10:00.000Z',
          exitCode: 2,
          reason: 'escalations_pending',
          pidAlive: false,
          parseError: null,
        },
      ],
      stateRaw: stateJson(['C1', 'C2', 'C3'], {
        C1: { status: 'shipped', pr: 5 },
        C2: { status: 'shipped', pr: 6 },
        C3: { status: 'blocked' },
      }),
      stopExists: false,
      reportRaw: JSON.stringify({
        v: 1,
        campaign: 'camp',
        run: { startedAt: '2026-07-18T00:00:00.000Z', endedAt: '2026-07-18T00:10:00.000Z', exitCode: 2, reason: 'escalations_pending' },
        cards: {
          C1: { outcome: 'shipped', pr: 5, mergeSha: 'a' },
          C2: { outcome: 'shipped', pr: 6, mergeSha: 'b' },
          C3: { outcome: 'blocked', blockedOn: 'C2' },
        },
        pending: [],
        stats: { shipped: 2, escalated: 0, blocked: 1, notReached: 0 },
      }),
      escalations: [],
      reports: [],
      newestLog: null,
    };

    const status = deriveStatus(snapshot);

    expect(status.liveness).toEqual({
      kind: 'exited',
      reason: 'escalations_pending',
      exitCode: 2,
      endedAt: '2026-07-18T00:10:00.000Z',
      runId: '2026-07-18T00-00-00-000Z-fini',
    });
    expect(status.cards).toEqual([
      { id: 'C1', status: 'shipped', pr: 5, updatedAt: null, dependsOn: [], blockedOn: null },
      { id: 'C2', status: 'shipped', pr: 6, updatedAt: null, dependsOn: [], blockedOn: null },
      { id: 'C3', status: 'blocked', pr: null, updatedAt: null, dependsOn: [], blockedOn: 'C2' },
    ]);
  });

  test('never_run: no runs at all', () => {
    const snapshot: CampaignSnapshot = {
      ...BASE,
      runs: [],
      stateRaw: null,
      stopExists: false,
      reportRaw: null,
      escalations: [],
      reports: [],
      newestLog: null,
    };

    const status = deriveStatus(snapshot);

    expect(status.liveness).toEqual({ kind: 'never_run' });
    expect(status.cards).toEqual([]);
  });
});

describe('deriveStatus — cards', () => {
  test('unreadable state: parse failure -> cards: {error}, rest of status still derives', () => {
    const snapshot: CampaignSnapshot = {
      ...BASE,
      runs: [
        {
          runId: '2026-07-24T06-00-00-000Z-b2b2',
          startedAt: '2026-07-24T06:00:00.000Z',
          pid: 27542,
          endedAt: null,
          exitCode: null,
          reason: null,
          pidAlive: true,
          parseError: null,
        },
      ],
      stateRaw: '{not json',
      stopExists: false,
      reportRaw: null,
      escalations: [],
      reports: [{ cardId: 'C1', sizeBytes: 42 }],
      newestLog: null,
    };

    const status = deriveStatus(snapshot);

    expect(status.cards).toEqual({ error: expect.any(String) as unknown as string });
    if (!Array.isArray(status.cards)) {
      expect(status.cards.error.length).toBeGreaterThan(0);
    }
    // The rest of the status still derives even though cards failed to parse.
    expect(status.liveness.kind).toBe('running');
    expect(status.reports).toEqual([{ cardId: 'C1', sizeBytes: 42 }]);
  });
});

describe('deriveStatus — pendingEscalations', () => {
  test('parses cardId from filename, reason from **Reason:** line, truncates raw to 2000 chars', () => {
    const longRaw = `**Reason:** Need clarification on merge policy\n\n## Context\n${'x'.repeat(3000)}`;
    const snapshot: CampaignSnapshot = {
      ...BASE,
      runs: [],
      stateRaw: null,
      stopExists: false,
      reportRaw: null,
      escalations: [
        { file: 'C4.md', raw: longRaw },
        { file: 'C5.md', raw: 'no reason line in this file' },
      ],
      reports: [],
      newestLog: null,
    };

    const status = deriveStatus(snapshot);

    expect(status.pendingEscalations).toEqual([
      { cardId: 'C4', reason: 'Need clarification on merge policy', raw: longRaw.slice(0, 2000) },
      { cardId: 'C5', reason: '(unparsed)', raw: 'no reason line in this file' },
    ]);
    expect(status.pendingEscalations[0]!.raw.length).toBe(2000);
  });
});

describe('deriveStatus — sessionTail', () => {
  test('ageSeconds is (nowIso - mtimeIso) in whole seconds', () => {
    const snapshot: CampaignSnapshot = {
      ...BASE,
      nowIso: '2026-07-24T06:13:59.000Z',
      runs: [],
      stateRaw: null,
      stopExists: false,
      reportRaw: null,
      escalations: [],
      reports: [],
      newestLog: {
        file: 'session.log',
        mtimeIso: '2026-07-24T06:13:29.000Z',
        sizeBytes: 4096,
        tailLines: ['line 1', 'line 2'],
      },
    };

    const status = deriveStatus(snapshot);

    expect(status.sessionTail).toEqual({
      file: 'session.log',
      ageSeconds: 30,
      sizeBytes: 4096,
      lines: ['line 1', 'line 2'],
    });
  });
});

describe('deriveStatus — scanErrors passthrough', () => {
  test('per-campaign read failures surface as errors, do not block the rest of derivation', () => {
    const snapshot: CampaignSnapshot = {
      ...BASE,
      runs: [],
      stateRaw: null,
      stopExists: false,
      reportRaw: null,
      escalations: [],
      reports: [],
      newestLog: null,
      scanErrors: ['ENOENT reading logsDir'],
    };

    const status = deriveStatus(snapshot);

    expect(status.errors).toEqual(['ENOENT reading logsDir']);
  });
});

describe('compareForRender — sort order', () => {
  function statusWith(overrides: Partial<CampaignStatus>): CampaignStatus {
    return {
      repoKey: 'r',
      campaignSlug: overrides.campaignSlug ?? 'c',
      homeDir: '/h',
      liveness: { kind: 'never_run' },
      stopRequested: false,
      cards: [],
      pendingEscalations: [],
      reports: [],
      sessionTail: null,
      errors: [],
      ...overrides,
    };
  }

  test('running first, then crashed, then exited/never_run — ties by most recent activity', () => {
    const running = statusWith({
      campaignSlug: 'running-camp',
      liveness: { kind: 'running', pid: 1, startedAt: '2026-07-24T05:00:00.000Z', runId: 'r1' },
    });
    const crashed = statusWith({
      campaignSlug: 'crashed-camp',
      liveness: { kind: 'crashed', pid: 2, startedAt: '2026-07-23T05:00:00.000Z', runId: 'r2' },
    });
    const exitedRecent = statusWith({
      campaignSlug: 'exited-recent',
      liveness: { kind: 'exited', reason: 'done', exitCode: 0, endedAt: '2026-07-22T05:00:00.000Z', runId: 'r3' },
    });
    const exitedOld = statusWith({
      campaignSlug: 'exited-old',
      liveness: { kind: 'exited', reason: 'done', exitCode: 0, endedAt: '2026-07-01T05:00:00.000Z', runId: 'r4' },
    });
    const neverRun = statusWith({ campaignSlug: 'never-run', liveness: { kind: 'never_run' } });

    const sorted = [neverRun, exitedOld, crashed, exitedRecent, running].sort(compareForRender);

    expect(sorted.map((s) => s.campaignSlug)).toEqual([
      'running-camp',
      'crashed-camp',
      'exited-recent',
      'exited-old',
      'never-run',
    ]);
  });
});
