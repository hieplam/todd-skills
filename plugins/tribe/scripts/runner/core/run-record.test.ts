import { describe, expect, test } from 'bun:test';
import {
  buildRunRecord, finalizeRunRecord, generateRunId,
  reportsDirOf, runDirOf, runRecordPathOf, serializeRunRecord,
} from './run-record.ts';

const io = { currentPid: () => 4242, now: () => '2026-07-24T01:02:03.000Z' };
const config = {
  homeDir: '/home/u/.tribe/-repo/campaigns/camp',
  runId: '2026-07-24T01-02-03-000Z-ab12',
  argv: ['--cards', 'C1'],
  repoRoot: '/work/target',
  logsDir: '/home/u/.tribe/-repo/campaigns/camp/runs/2026-07-24T01-02-03-000Z-ab12/logs',
};

describe('generateRunId', () => {
  test('is filesystem-safe (no colons/dots) and carries the random suffix', () => {
    const id = generateRunId('2026-07-24T01:02:03.000Z', 'ab12');
    expect(id).toBe('2026-07-24T01-02-03-000Z-ab12');
  });
});

describe('path helpers', () => {
  test('runDirOf / runRecordPathOf / reportsDirOf compose from the home', () => {
    expect(runDirOf('/h', 'r1')).toBe('/h/runs/r1');
    expect(runRecordPathOf('/h', 'r1')).toBe('/h/runs/r1/run.json');
    expect(reportsDirOf('/h')).toBe('/h/reports');
  });
});

describe('buildRunRecord', () => {
  test('records absolute home-relative paths, pid, startedAt; end fields null (spec §4 run.json v1)', () => {
    const rec = buildRunRecord(config, io);
    expect(rec).toEqual({
      v: 1,
      runId: config.runId,
      pid: 4242,
      startedAt: '2026-07-24T01:02:03.000Z',
      repo: '/work/target',
      statePath: '/home/u/.tribe/-repo/campaigns/camp/campaign-state.json',
      answersPath: '/home/u/.tribe/-repo/campaigns/camp/answers.md',
      escalationsDir: '/home/u/.tribe/-repo/campaigns/camp/escalations',
      logsDir: config.logsDir,
      argv: ['--cards', 'C1'],
      endedAt: null,
      exitCode: null,
      reason: null,
    });
  });
});

describe('finalizeRunRecord', () => {
  test('fills the three end fields, touches nothing else, does not mutate its input', () => {
    const rec = buildRunRecord(config, io);
    const done = finalizeRunRecord(rec, { endedAt: '2026-07-24T02:00:00.000Z', exitCode: 2, reason: 'escalations_pending' });
    expect(done.endedAt).toBe('2026-07-24T02:00:00.000Z');
    expect(done.exitCode).toBe(2);
    expect(done.reason).toBe('escalations_pending');
    expect(rec.endedAt).toBeNull();
    expect(rec).toEqual({ ...done, endedAt: null, exitCode: null, reason: null });
  });
});

describe('serializeRunRecord', () => {
  test('2-space JSON with trailing newline (parses back identical)', () => {
    const rec = buildRunRecord(config, io);
    const text = serializeRunRecord(rec);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(rec);
  });
});
