import { expect, test } from 'bun:test';
import { encodeSseFrame, parseLiveRoute } from './routes.ts';

test('the status page keeps the root path', () => {
  expect(parseLiveRoute('http://127.0.0.1:4321/')).toEqual({ kind: 'status' });
});

test('live and events carry a validated repo, slug and optional process', () => {
  expect(parseLiveRoute('http://127.0.0.1:4321/live?repo=-Users-hip-repo-x&slug=my-campaign')).toEqual({ kind: 'live', repoKey: '-Users-hip-repo-x', slug: 'my-campaign', processId: null });
  expect(parseLiveRoute('http://127.0.0.1:4321/events?repo=a&slug=b&process=agent:T20:a1')).toEqual({ kind: 'events', repoKey: 'a', slug: 'b', processId: 'agent:T20:a1' });
});

test('a traversal attempt in either identifier is rejected before any path is built', () => {
  expect(parseLiveRoute('http://127.0.0.1:4321/live?repo=../../etc&slug=b').kind).toBe('bad_request');
  expect(parseLiveRoute('http://127.0.0.1:4321/live?repo=a&slug=..%2Fb').kind).toBe('bad_request');
  expect(parseLiveRoute('http://127.0.0.1:4321/live?slug=b').kind).toBe('bad_request');
});

test('assets come from an allowlist and health has its own route', () => {
  expect(parseLiveRoute('http://127.0.0.1:4321/app.js')).toEqual({ kind: 'asset', name: 'app.js' });
  expect(parseLiveRoute('http://127.0.0.1:4321/app.css')).toEqual({ kind: 'asset', name: 'app.css' });
  expect(parseLiveRoute('http://127.0.0.1:4321/../../secret.js')).toEqual({ kind: 'not_found' });
  expect(parseLiveRoute('http://127.0.0.1:4321/healthz')).toEqual({ kind: 'health' });
});

test('an SSE frame is name plus one JSON data line, terminated by a blank line', () => {
  expect(encodeSseFrame({ event: 'append', data: { processId: 'card:T20', events: [] } }))
    .toBe('event: append\ndata: {"processId":"card:T20","events":[]}\n\n');
});

test('a dot-only identifier is rejected even though it matches the character class (F3)', () => {
  expect(parseLiveRoute('http://127.0.0.1:4321/live?repo=..&slug=..').kind).toBe('bad_request');
  expect(parseLiveRoute('http://127.0.0.1:4321/live?repo=.&slug=b').kind).toBe('bad_request');
  expect(parseLiveRoute('http://127.0.0.1:4321/live?repo=...&slug=b').kind).toBe('bad_request');
});

test('a bodiless keep-alive frame encodes rather than throwing (F4)', () => {
  expect(encodeSseFrame({ event: 'ping', data: undefined }))
    .toBe('event: ping\ndata: null\n\n');
});

test('the process parameter is validated at the same choke point as repo/slug (F43 layer 1)', () => {
  // Warchief's exact traversal payload: after unescaping, `process` carries `../../../../` —
  // this must be rejected here, before it ever reaches the poller/adapter's `join`.
  const traversal =
    parseLiveRoute('http://127.0.0.1:4399/events?repo=myrepo&slug=myslug&process=agent%3AT1%3A..%2F..%2F..%2F..%2Fsecret-session');
  expect(traversal.kind).toBe('bad_request');

  // A dot-only segment must be rejected exactly like a dot-only repo/slug (F3's rule, applied
  // to the same character class).
  expect(parseLiveRoute('http://127.0.0.1:4321/events?repo=a&slug=b&process=agent:T1:..').kind).toBe('bad_request');
  expect(parseLiveRoute('http://127.0.0.1:4321/events?repo=a&slug=b&process=agent:..:x').kind).toBe('bad_request');
  expect(parseLiveRoute('http://127.0.0.1:4321/events?repo=a&slug=b&process=card:.').kind).toBe('bad_request');

  // An ordinary agent id still parses.
  expect(parseLiveRoute('http://127.0.0.1:4321/events?repo=a&slug=b&process=agent:T1:a1b2c3'))
    .toEqual({ kind: 'events', repoKey: 'a', slug: 'b', processId: 'agent:T1:a1b2c3' });

  // The `card:<id>` form (selecting the session itself) still parses.
  expect(parseLiveRoute('http://127.0.0.1:4321/events?repo=a&slug=b&process=card:T1'))
    .toEqual({ kind: 'events', repoKey: 'a', slug: 'b', processId: 'card:T1' });

  // Absent process keeps meaning "no filter" — never turned into an error.
  expect(parseLiveRoute('http://127.0.0.1:4321/events?repo=a&slug=b'))
    .toEqual({ kind: 'events', repoKey: 'a', slug: 'b', processId: null });
});

test('the processes route parses to the processes variant (Warchief ruling)', () => {
  expect(parseLiveRoute('http://127.0.0.1:4321/api/processes?repo=r&slug=s'))
    .toEqual({ kind: 'processes', repoKey: 'r', slug: 's' });
});

test('encodeSseFrame is total: unserializable payloads never throw and still yield a well-formed frame (F8)', () => {
  const isWellFormed = (out: string) => /^event: ping\ndata: .+\n\n$/.test(out);

  const fnOut = encodeSseFrame({ event: 'ping', data: (() => {}) as unknown });
  expect(isWellFormed(fnOut)).toBe(true);

  const symOut = encodeSseFrame({ event: 'ping', data: Symbol('x') as unknown });
  expect(isWellFormed(symOut)).toBe(true);

  const bigintOut = encodeSseFrame({ event: 'ping', data: 10n as unknown });
  expect(isWellFormed(bigintOut)).toBe(true);

  const cyclic: Record<string, unknown> = {};
  cyclic.self = cyclic;
  const cyclicOut = encodeSseFrame({ event: 'ping', data: cyclic });
  expect(isWellFormed(cyclicOut)).toBe(true);
});
