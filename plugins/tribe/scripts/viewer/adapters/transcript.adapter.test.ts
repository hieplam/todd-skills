import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTranscriptIo } from './transcript.adapter.ts';

test('readRange returns exactly the bytes appended since the last offset', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tribe-live-'));
  const file = join(dir, 's.jsonl');
  writeFileSync(file, 'one\n');
  const io = createTranscriptIo();
  const first = io.statFileOrNull(file)!;
  expect(io.readRange(file, 0, first.sizeBytes)).toBe('one\n');
  appendFileSync(file, 'two\n');
  const second = io.statFileOrNull(file)!;
  expect(io.readRange(file, first.sizeBytes, second.sizeBytes)).toBe('two\n');
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
