import { expect, test } from 'bun:test';
import { isMessageRecord, parseRecordLines } from './records.ts';

test('accepts camelCase sessionId and snake_case session_id alike (card D7)', () => {
  const { records } = parseRecordLines([
    JSON.stringify({ type: 'user', sessionId: 'a', message: { role: 'user', content: 'hi' } }),
    JSON.stringify({ type: 'user', session_id: 'b', message: { role: 'user', content: 'yo' } }),
  ]);
  expect(records.map((r) => r.sessionId)).toEqual(['a', 'b']);
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

test('assistant, user and system rows are messages', () => {
  const { records } = parseRecordLines(
    ['assistant', 'user', 'system'].map((type) => JSON.stringify({ type })),
  );
  expect(records.map(isMessageRecord)).toEqual([true, true, true]);
});
