import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { isMessageRecord, parseRecordLines } from './records.ts';

test('accepts camelCase sessionId and snake_case session_id alike (card D7)', () => {
  const { records } = parseRecordLines([
    JSON.stringify({ type: 'user', sessionId: 'a', message: { role: 'user', content: 'hi' } }),
    JSON.stringify({ type: 'user', session_id: 'b', message: { role: 'user', content: 'yo' } }),
  ]);
  expect(records.map((r) => r.sessionId)).toEqual(['a', 'b']);
});

test('a wrong-typed sessionId does not mask a good session_id fallback (F11)', () => {
  const { records } = parseRecordLines([
    JSON.stringify({ type: 'user', sessionId: 123, session_id: 'fallback' }),
  ]);
  expect(records).toEqual([{ type: 'user', sessionId: 'fallback' }]);
});

test('a null sessionId still falls back to session_id (F11)', () => {
  const { records } = parseRecordLines([
    JSON.stringify({ type: 'user', sessionId: null, session_id: 'fallback2' }),
  ]);
  expect(records).toEqual([{ type: 'user', sessionId: 'fallback2' }]);
});

test('an unparseable line is counted and skipped, never thrown', () => {
  const { records, skipped } = parseRecordLines(['{not json', JSON.stringify({ type: 'user' })]);
  expect(skipped).toBe(1);
  expect(records).toHaveLength(1);
});

test('bookkeeping row types parse but are not messages', () => {
  const noise = ['attachment', 'queue-operation', 'last-prompt', 'ai-title', 'mode', 'pr-link'];
  const { records } = parseRecordLines(noise.map((type) => JSON.stringify({ type })));
  expect(records.map(isMessageRecord)).toEqual(noise.map(() => false));
});

test('the malformed session fixture is tolerated: bad lines skipped, good line kept (F11b)', () => {
  const path = join(import.meta.dir, '..', '..', 'fixtures', 'session-malformed.jsonl');
  const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.length > 0);
  expect(() => parseRecordLines(lines)).not.toThrow();
  const { records, skipped } = parseRecordLines(lines);
  expect(skipped).toBeGreaterThan(0);
  expect(records).toHaveLength(1);
  expect(records[0]?.sessionId).toBe('sess-fixture-2');
});

test('assistant, user and system rows are messages', () => {
  const { records } = parseRecordLines(
    ['assistant', 'user', 'system'].map((type) => JSON.stringify({ type })),
  );
  expect(records.map(isMessageRecord)).toEqual([true, true, true]);
});
