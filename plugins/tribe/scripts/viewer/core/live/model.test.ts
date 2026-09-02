import { expect, test } from 'bun:test';
import { ACTIVE_WINDOW_MS, MAX_LIVE_STREAMS, MAX_SNAPSHOT_EVENTS, POLL_INTERVAL_MS, SSE_EVENT_NAMES } from './model.ts';

test('poll interval leaves headroom under the 2s budget (card D3)', () => {
  expect(POLL_INTERVAL_MS).toBe(400);
  expect(POLL_INTERVAL_MS * 4).toBeLessThan(2000);
});

test('the SSE frame vocabulary is frozen for both tracks', () => {
  expect(SSE_EVENT_NAMES).toEqual(['processes', 'snapshot', 'append', 'ping', 'error']);
});

test('bounds are explicit values, not magic numbers at call sites', () => {
  expect(ACTIVE_WINDOW_MS).toBe(10_000);
  expect(MAX_SNAPSHOT_EVENTS).toBe(400);
  expect(MAX_LIVE_STREAMS).toBe(8);
});
