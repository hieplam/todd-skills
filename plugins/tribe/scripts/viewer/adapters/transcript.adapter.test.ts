import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTranscriptIo } from './transcript.adapter.ts';

test('readRange returns exactly the bytes appended since the last offset, raw (undecoded)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tribe-live-'));
  const file = join(dir, 's.jsonl');
  writeFileSync(file, 'one\n');
  const io = createTranscriptIo();
  const first = io.statFileOrNull(file)!;
  const chunk1 = io.readRange(file, 0, first.sizeBytes);
  expect(chunk1).toBeInstanceOf(Uint8Array);
  expect(Buffer.from(chunk1).toString('utf8')).toBe('one\n');
  appendFileSync(file, 'two\n');
  const second = io.statFileOrNull(file)!;
  expect(Buffer.from(io.readRange(file, first.sizeBytes, second.sizeBytes)).toString('utf8')).toBe('two\n');
});

test('readRange never decodes — a range that stops mid multi-byte character comes back as the raw, un-replaced bytes (F44)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tribe-live-'));
  const file = join(dir, 's.jsonl');
  const euroBytes = Buffer.from('€', 'utf8'); // e2 82 ac
  writeFileSync(file, Buffer.concat([Buffer.from('hello ', 'utf8'), euroBytes.subarray(0, 2)]));
  const io = createTranscriptIo();
  const stat = io.statFileOrNull(file)!;
  const chunk = io.readRange(file, 0, stat.sizeBytes);
  // The last 2 bytes are the incomplete euro-sign prefix (0xe2, 0x82) — readRange must hand
  // them back untouched, not collapse them into a lossy U+FFFD replacement character. Decoding
  // (and carrying that incompleteness forward) is the caller's job now, not this adapter's.
  expect(Array.from(chunk.subarray(chunk.length - 2))).toEqual([0xe2, 0x82]);
});

test('a missing file or directory degrades, never throws', () => {
  const io = createTranscriptIo();
  expect(io.statFileOrNull('/nope/none.jsonl')).toBeNull();
  expect(io.listDirOrEmpty('/nope')).toEqual([]);
  expect(io.readJsonOrNull('/nope/x.json')).toBeNull();
  expect(io.realpathOrNull('/nope')).toBeNull();
});

test('a subagent appearing mid-run is listed on the very next poll', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tribe-live-'));
  mkdirSync(join(dir, 'subagents'), { recursive: true });
  const io = createTranscriptIo();
  expect(io.listDirOrEmpty(join(dir, 'subagents'))).toEqual([]);
  writeFileSync(join(dir, 'subagents', 'agent-a1.jsonl'), '');
  expect(io.listDirOrEmpty(join(dir, 'subagents'))).toEqual(['agent-a1.jsonl']);
});

test('readJsonOrNull tolerates malformed JSON without throwing', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tribe-live-'));
  const file = join(dir, 'bad.json');
  writeFileSync(file, '{not json');
  const io = createTranscriptIo();
  expect(io.readJsonOrNull(file)).toBeNull();
});

test('readAsset reads the two allowlisted client files straight off disk', () => {
  const io = createTranscriptIo();
  expect(io.readAsset('app.js')).toContain('createLiveClient');
  expect(typeof io.readAsset('app.css')).toBe('string');
  expect(io.readAsset('app.css').length).toBeGreaterThan(0);
});
