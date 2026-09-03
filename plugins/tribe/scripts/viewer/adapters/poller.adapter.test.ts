import { expect, test } from 'bun:test';
import { createLivePoller } from './poller.adapter.ts';
import type { TranscriptIo } from './transcript.adapter.ts';
import type { SseFrame } from '../core/live/model.ts';

/** A fully in-memory `TranscriptIo` fake — no real filesystem — so a test can grow a "file" or
 * add a sidecar between ticks purely by mutating in-memory maps. */
function makeFakeIo() {
  // Raw bytes, not strings (F44) — so a test can simulate a writer that has flushed only PART
  // of a multi-byte UTF-8 character at stat time, which is impossible to represent by writing a
  // (necessarily well-formed) JS string.
  const files = new Map<string, Uint8Array>();
  const mtimes = new Map<string, string>();
  const dirs = new Map<string, string[]>();
  const jsons = new Map<string, unknown>();

  const io: TranscriptIo = {
    realpathOrNull: (p) => p,
    statFileOrNull: (p) => {
      const content = files.get(p);
      if (content === undefined) return null;
      return {
        sizeBytes: content.length,
        mtimeIso: mtimes.get(p) ?? '2026-09-02T10:00:00.000Z',
        birthtimeIso: '2026-09-02T09:00:00.000Z',
      };
    },
    readRange: (p, start, end) => {
      const content = files.get(p) ?? new Uint8Array(0);
      return content.subarray(start, end);
    },
    listDirOrEmpty: (d) => dirs.get(d) ?? [],
    readJsonOrNull: (p) => jsons.get(p) ?? null,
    readAsset: () => '',
  };

  return {
    io,
    writeFile(path: string, content: string | Uint8Array, mtimeIso?: string) {
      files.set(path, typeof content === 'string' ? Buffer.from(content, 'utf8') : content);
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

test('a multi-byte UTF-8 character split across a poll boundary survives, not corrupted (F44)', () => {
  const fake = makeFakeIo();
  fake.setDir(CAMPAIGN.subagentsDir, []);

  const text = 'hello € world'; // € = "€", encodes to the 3 bytes e2 82 ac
  const record = `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } })}\n`;
  const fullBytes = Buffer.from(record, 'utf8');
  const euroByteOffset = Buffer.byteLength(record.slice(0, record.indexOf('€')), 'utf8');
  // Split exactly inside the euro sign's 3-byte encoding: 2 bytes present, 1 still to come —
  // the Warchief's exact reproduction shape ("writer had flushed only 2 of 3 bytes").
  const splitPoint = euroByteOffset + 2;

  // Tick 0 (construction): the writer has flushed only up to `splitPoint` — the line isn't
  // even complete yet (no trailing \n reached), so this bytes-only prefix becomes carry.
  fake.writeFile(CAMPAIGN.transcriptPath, fullBytes.subarray(0, splitPoint));

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

  // Tick 1: the writer completes the line (the remaining euro byte, plus the rest of the text
  // and the trailing newline).
  fake.writeFile(CAMPAIGN.transcriptPath, fullBytes);
  tick();

  const append = frames.find((f) => f.event === 'append');
  expect(append).not.toBeUndefined();
  const data = append!.data as { events: { html: string }[] };
  expect(data.events[0]!.html).toContain('hello € world');
  expect(data.events[0]!.html).not.toContain('�');
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

test('a traversal payload in processId is refused at the adapter boundary, independent of route validation (F43 layer 2)', () => {
  const fake = makeFakeIo();
  fake.writeFile(CAMPAIGN.transcriptPath, '');
  fake.setDir(CAMPAIGN.subagentsDir, []);
  // A file OUTSIDE subagentsDir that a successful traversal would read.
  const secretPath = '/p/secret-session.jsonl';
  fake.writeFile(
    secretPath,
    `${JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: 'TOP SECRET' }] } })}\n`,
  );

  const statCalls: string[] = [];
  const originalStat = fake.io.statFileOrNull;
  fake.io.statFileOrNull = (p) => {
    statCalls.push(p);
    return originalStat(p);
  };

  const frames: SseFrame[] = [];
  const { schedule } = makeControllableSchedule();
  // Fed directly to the poller, deliberately bypassing `core/live/routes.ts` (proving this
  // layer stands on its own, not merely riding on layer 1's validation).
  createLivePoller({
    io: fake.io,
    intervalMs: 400,
    campaign: CAMPAIGN,
    processId: 'agent:T1:../../../../secret-session',
    emit: (f) => frames.push(f),
    schedule,
  });

  expect(statCalls).not.toContain(secretPath);
  const snapshot = frames.find((f) => f.event === 'snapshot');
  const data = snapshot!.data as { events: { html: string }[] };
  expect(data.events.some((e) => e.html.includes('TOP SECRET'))).toBe(false);
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
