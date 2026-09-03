// Unit-style proof for F51: the pure frame→samples decision `measureAppendLatencies` relies on,
// exercised directly against a synthetic SSE frame — no live server, no real campaign needed.
import { expect, test } from 'bun:test';
import { encodeSseFrame } from '../core/live/routes.ts';
import type { TranscriptEvent } from '../core/live/model.ts';
import { sampleAppendFrameLatencies, quote } from './harness.ts';
import { execFileSync } from 'node:child_process';

function event(seq: number, timestamp: string | null): TranscriptEvent {
  return { seq, kind: 'assistant_text', timestamp, html: `<p>${seq}</p>` };
}

test('a batched append frame (two events, two different timestamps) produces ONE sample per event, not one for the whole frame (F51)', () => {
  // Mirrors the real poller's behavior (`poller.adapter.ts`): everything written since the last
  // 400ms tick lands in a SINGLE `append` frame. Line A written 257ms before arrival, line B
  // written 4ms before arrival — the old mtime-based methodology collapsed both into one 3.94ms
  // number; per-event sampling must recover both true delays.
  const arrivalMs = Date.parse('2026-09-02T10:00:00.257Z');
  const frame = encodeSseFrame({
    event: 'append',
    data: {
      processId: 'card:C1',
      events: [event(1, '2026-09-02T10:00:00.000Z'), event(2, '2026-09-02T10:00:00.253Z')],
      patches: [],
      nextOffset: 42,
    },
  });
  const rawFrame = frame.slice(0, frame.length - 2); // strip the trailing blank-line terminator, as the reader loop does

  const samples = sampleAppendFrameLatencies(rawFrame, arrivalMs, /* mtimeFallbackMs */ 0);

  expect(samples).toHaveLength(2);
  expect(samples[0]).toEqual({ valueMs: 257, method: 'timestamp' });
  expect(samples[1]).toEqual({ valueMs: 4, method: 'timestamp' });
  // The true per-line delay of line A (257ms) must be visible — never silently discarded in
  // favor of only the batch's last write.
  expect(Math.max(...samples.map((s) => s.valueMs))).toBe(257);
});

test('an event with a null timestamp falls back to the mtime-based sample, explicitly labeled (F51)', () => {
  const arrivalMs = 1_000_000;
  const frame = encodeSseFrame({
    event: 'append',
    data: { processId: 'card:C1', events: [event(1, null)], patches: [], nextOffset: 1 },
  });
  const rawFrame = frame.slice(0, frame.length - 2);

  const samples = sampleAppendFrameLatencies(rawFrame, arrivalMs, /* mtimeFallbackMs */ 999_400);

  expect(samples).toEqual([{ valueMs: 600, method: 'mtime-fallback' }]);
});

test('quote() makes a URL containing & safe to paste into a real shell — round-trips through bash unchanged (F54)', () => {
  // Every /events and /live URL commands.md logs looks exactly like this: `?repo=...&slug=...`.
  const url = 'http://127.0.0.1:4399/events?repo=my-repo&slug=e2e-123&process=card:C1';
  const quoted = quote(url);
  const out = execFileSync('bash', ['-c', `echo ${quoted}`], { encoding: 'utf8' }).replace(/\n$/, '');
  // Before the fix, the unquoted `&` splits this into three backgrounded (non-)commands and
  // `out` truncates at the first `&` — reproduced by hand: `bash -c 'echo http://.../events?repo=abc&slug=def'`
  // prints only "http://.../events?repo=abc".
  expect(out).toBe(url);
});

for (const metachar of ['&', '|', ';', '<', '>', '$', '`', '(', ')', '*', '?', '~', '!', '#']) {
  test(`quote() quotes an argument containing the shell metacharacter ${JSON.stringify(metachar)} (F54)`, () => {
    const arg = `value${metachar}rest`;
    expect(quote(arg)).not.toBe(arg);
  });
}

test('a negative sample (clock skew: timestamp AFTER arrival) is reported as measured, never clamped to zero (F51)', () => {
  const arrivalMs = Date.parse('1970-01-01T00:00:01.000Z');
  const frame = encodeSseFrame({
    event: 'append',
    data: { processId: 'card:C1', events: [event(1, '1970-01-01T00:00:01.500Z')], patches: [], nextOffset: 1 },
  });
  const rawFrame = frame.slice(0, frame.length - 2);

  const samples = sampleAppendFrameLatencies(rawFrame, arrivalMs, 0);

  expect(samples).toEqual([{ valueMs: -500, method: 'timestamp' }]);
});
