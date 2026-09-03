import { expect, test } from 'bun:test';
import { advanceTail, initialTailState } from './tail.ts';

test('a line split across three chunks emits exactly once, when complete', () => {
  let s = initialTailState();
  let r = advanceTail(s, '{"a":', 5);
  expect(r.lines).toEqual([]);
  r = advanceTail(r.state, '1,"b":', 11);
  expect(r.lines).toEqual([]);
  r = advanceTail(r.state, '2}\n', 14);
  expect(r.lines).toEqual(['{"a":1,"b":2}']);
  expect(r.state.carry).toBe('');
  expect(r.state.offset).toBe(14);
});

test('a chunk ending exactly on a newline leaves no carry', () => {
  const r = advanceTail(initialTailState(), 'one\ntwo\n', 8);
  expect(r.lines).toEqual(['one', 'two']);
  expect(r.state.carry).toBe('');
});

test('blank lines are dropped, CRLF is trimmed', () => {
  const r = advanceTail(initialTailState(), 'a\r\n\nb\r\n', 7);
  expect(r.lines).toEqual(['a', 'b']);
});

test('a shrinking file resets the tail and re-reads from zero', () => {
  const first = advanceTail(initialTailState(), 'old\n', 4);
  expect(first.state.offset).toBe(4);
  const reset = advanceTail(first.state, 'new\n', 4 + 4);
  expect(reset.lines).toEqual(['new']);
  const truncated = advanceTail(reset.state, 'fresh\n', 6);
  expect(truncated.state.offset).toBe(6);
  expect(truncated.lines).toEqual(['fresh']);
});

test('a shrink to a smaller non-zero size with an empty chunk never marks the rewritten bytes as consumed (F6)', () => {
  // Warchief's exact three-tick reproduction.
  const tick1 = advanceTail(initialTailState(), 'line-one\nline-two\n', 18);
  expect(tick1.lines).toEqual(['line-one', 'line-two']);
  expect(tick1.state).toEqual({ offset: 18, carry: '' });

  // File truncated-and-rewritten to 10 bytes; adapter cannot know the new
  // content yet, so it can only pass an empty chunk on the discovery tick.
  const tick2 = advanceTail(tick1.state, '', 10);
  expect(tick2.lines).toEqual([]);
  // The 10 rewritten bytes must stay reachable: offset must NOT jump to 10
  // (that would mark bytes nobody ever read as "consumed"), and the caller
  // must be told to re-read from zero immediately via `reset`.
  expect(tick2.state).toEqual({ offset: 0, carry: '' });
  expect(tick2.reset).toBe(true);

  // Told via `reset`, the adapter re-reads immediately from zero (the whole
  // 10-byte rewritten file) rather than waiting a tick — the previously
  // "lost" content is fully recoverable.
  const recovered = advanceTail(tick2.state, 'abcdefghi\n', 10);
  expect(recovered.lines).toEqual(['abcdefghi']);
  expect(recovered.state).toEqual({ offset: 10, carry: '' });
  expect(recovered.reset).toBe(false);
});

test('reset is false on steady ticks and true exactly when the shrink branch fires, chunk non-empty or not', () => {
  const first = advanceTail(initialTailState(), 'old\n', 4);
  expect(first.reset).toBe(false);
  const reset = advanceTail(first.state, 'new\n', 8);
  expect(reset.reset).toBe(false);
  const truncated = advanceTail(reset.state, 'fresh\n', 6);
  expect(truncated.reset).toBe(true);
});
