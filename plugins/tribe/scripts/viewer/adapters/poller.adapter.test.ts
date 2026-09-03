import { expect, test } from 'bun:test';
import { createLivePoller } from './poller.adapter.ts';
import type { TranscriptIo } from './transcript.adapter.ts';
import type { SseFrame } from '../core/live/model.ts';

/** A fully in-memory `TranscriptIo` fake — no real filesystem — so a test can grow a "file" or
 * add a sidecar between ticks purely by mutating in-memory maps. */
function makeFakeIo() {
  const files = new Map<string, string>();
  const mtimes = new Map<string, string>();
  const dirs = new Map<string, string[]>();
  const jsons = new Map<string, unknown>();

  const io: TranscriptIo = {
    realpathOrNull: (p) => p,
    statFileOrNull: (p) => {
      const content = files.get(p);
      if (content === undefined) return null;
      return {
        sizeBytes: Buffer.byteLength(content, 'utf8'),
        mtimeIso: mtimes.get(p) ?? '2026-09-02T10:00:00.000Z',
        birthtimeIso: '2026-09-02T09:00:00.000Z',
      };
    },
    readRange: (p, start, end) => {
      const content = files.get(p) ?? '';
      return Buffer.from(content, 'utf8').subarray(start, end).toString('utf8');
    },
    listDirOrEmpty: (d) => dirs.get(d) ?? [],
    readJsonOrNull: (p) => jsons.get(p) ?? null,
    readAsset: () => '',
  };

  return {
    io,
    writeFile(path: string, content: string, mtimeIso?: string) {
      files.set(path, content);
      if (mtimeIso !== undefined) mtimes.set(path, mtimeIso);
    },
    setDir(dir: string, names: string[]) {
      dirs.set(dir, names);
    },
  };
}

/** A "controllable tick": the scheduler injected into `createLivePoller` never runs a real
 * timer — it just captures the callback so the test can invoke it deterministically. */
function makeControllableSchedule() {
  let captured: (() => void) | null = null;
  const schedule = (fn: () => void) => {
    captured = fn;
    return { stop: () => { captured = null; } };
  };
  return { schedule, tick: () => captured?.() };
}

const CAMPAIGN = {
  cardId: 'T1',
  sessionId: 'sess-1',
  transcriptPath: '/p/sess-1.jsonl',
  subagentsDir: '/p/sess-1/subagents',
  cardStatus: 'running',
};

test('construction emits an initial processes frame, then a snapshot of what is already on disk', () => {
  const fake = makeFakeIo();
  fake.writeFile(
    CAMPAIGN.transcriptPath,
    `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'hello' }] } })}\n`,
  );
  fake.setDir(CAMPAIGN.subagentsDir, []);

  const frames: SseFrame[] = [];
  const { schedule } = makeControllableSchedule();
  createLivePoller({
    io: fake.io,
    intervalMs: 400,
    campaign: CAMPAIGN,
    processId: null,
    emit: (f) => frames.push(f),
    now: () => '2026-09-02T10:00:05.000Z',
    schedule,
  });

  expect(frames.map((f) => f.event)).toEqual(['processes', 'snapshot']);
  const snapshot = frames[1]!.data as { events: { html: string }[]; truncated: boolean };
  expect(snapshot.truncated).toBe(false);
  expect(snapshot.events[0]!.html).toContain('hello');
});

test('a growing transcript file produces an append frame on the very next tick', () => {
  const fake = makeFakeIo();
  fake.writeFile(CAMPAIGN.transcriptPath, '');
  fake.setDir(CAMPAIGN.subagentsDir, []);

  const frames: SseFrame[] = [];
  const { schedule, tick } = makeControllableSchedule();
  createLivePoller({
    io: fake.io,
    intervalMs: 400,
    campaign: CAMPAIGN,
    processId: null,
    emit: (f) => frames.push(f),
    schedule,
  });
  frames.length = 0; // discard the construction-time processes+snapshot pair

  fake.writeFile(
    CAMPAIGN.transcriptPath,
    `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'growing' }] } })}\n`,
  );
  tick();

  const append = frames.find((f) => f.event === 'append');
  expect(append).not.toBeUndefined();
  const data = append!.data as { events: { html: string }[] };
  expect(data.events[0]!.html).toContain('growing');
});

test('a sidecar appearing between ticks produces a fresh processes frame with the new node', () => {
  const fake = makeFakeIo();
  fake.writeFile(CAMPAIGN.transcriptPath, '');
  fake.setDir(CAMPAIGN.subagentsDir, []);

  const frames: SseFrame[] = [];
  const { schedule, tick } = makeControllableSchedule();
  createLivePoller({
    io: fake.io,
    intervalMs: 400,
    campaign: CAMPAIGN,
    processId: null,
    emit: (f) => frames.push(f),
    schedule,
  });
  frames.length = 0;

  fake.setDir(CAMPAIGN.subagentsDir, ['agent-a1.jsonl']);
  fake.writeFile(`${CAMPAIGN.subagentsDir}/agent-a1.jsonl`, '');
  tick();

  const processesFrames = frames.filter((f) => f.event === 'processes');
  expect(processesFrames).toHaveLength(1);
  const data = processesFrames[0]!.data as { processes: { id: string }[] };
  expect(data.processes.map((p) => p.id)).toContain('agent:T1:a1');
});

test('a read failure becomes an error frame, the connection is never thrown', () => {
  const fake = makeFakeIo();
  // Deliberately no file written at the transcript path — statFileOrNull returns null and the
  // internal read throws; the poller must catch it and keep going, never let it escape.
  fake.setDir(CAMPAIGN.subagentsDir, []);

  const frames: SseFrame[] = [];
  const { schedule } = makeControllableSchedule();
  expect(() =>
    createLivePoller({
      io: fake.io,
      intervalMs: 400,
      campaign: CAMPAIGN,
      processId: null,
      emit: (f) => frames.push(f),
      schedule,
    }),
  ).not.toThrow();

  expect(frames.some((f) => f.event === 'error')).toBe(true);
});
