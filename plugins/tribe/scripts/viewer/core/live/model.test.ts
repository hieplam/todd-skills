import { expect, test } from 'bun:test';
import { ACTIVE_WINDOW_MS, MAX_LIVE_STREAMS, MAX_SNAPSHOT_EVENTS, POLL_INTERVAL_MS, SSE_EVENT_NAMES, SSE_IDLE_TIMEOUT_SECONDS } from './model.ts';
import { PING_INTERVAL_MS } from '../../adapters/poller.adapter.ts';

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

// F55: Bun's own `Bun.serve` idle-timeout default (~10s) is shorter than the poller's 15s
// keepalive ping, so a quiet /events connection was closed by Bun itself before the ping ever
// had a chance to refresh it. This invariant is what keeps that regression from coming back:
// whatever the keepalive interval is, the server's own idle timeout MUST exceed it, with
// headroom for the ping frame's own network/scheduling jitter (not an exact tie).
test('the SSE idle timeout stays comfortably above the keepalive ping interval (F55)', () => {
  expect(SSE_IDLE_TIMEOUT_SECONDS * 1000).toBeGreaterThan(PING_INTERVAL_MS);
  // Bun caps idleTimeout at 255s — stay under that cap too.
  expect(SSE_IDLE_TIMEOUT_SECONDS).toBeLessThanOrEqual(255);
});
