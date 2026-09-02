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

test('the processes route parses to the processes variant (Warchief ruling)', () => {
  expect(parseLiveRoute('http://127.0.0.1:4321/api/processes?repo=r&slug=s'))
    .toEqual({ kind: 'processes', repoKey: 'r', slug: 's' });
});
