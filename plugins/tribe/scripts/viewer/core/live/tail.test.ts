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
