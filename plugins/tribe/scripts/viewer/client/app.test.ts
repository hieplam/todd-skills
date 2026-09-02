import { expect, test } from 'bun:test';
import { createLiveClient } from './app.js';

function fakeDoc() {
  const nodes: string[] = [];
  const el = { innerHTML: '', scrollTop: 0, scrollHeight: 0, clientHeight: 0,
    insertAdjacentHTML: (_pos: string, html: string) => { nodes.push(html); },
    querySelector: () => null, addEventListener: () => {}, dataset: {} as Record<string, string> };
  return { nodes, doc: { getElementById: () => el, querySelector: () => el, body: el } };
}
class FakeEventSource {
  static last: FakeEventSource | null = null;
  handlers = new Map<string, (e: { data: string }) => void>();
  closed = false;
  constructor(public url: string) { FakeEventSource.last = this; }
  addEventListener(name: string, fn: (e: { data: string }) => void) { this.handlers.set(name, fn); }
  close() { this.closed = true; }
  emit(name: string, data: unknown) { this.handlers.get(name)?.({ data: JSON.stringify(data) }); }
}

test('it opens exactly one stream for the campaign in the page dataset', () => {
  const { doc } = fakeDoc();
  createLiveClient({ EventSource: FakeEventSource as never, document: doc as never, location: { search: '?repo=a&slug=b' } as never }).start();
  expect(FakeEventSource.last!.url).toBe('/events?repo=a&slug=b');
});

test('append frames are inserted, and a patch rewrites the matching call card', () => {
  const { nodes, doc } = fakeDoc();
  const client = createLiveClient({ EventSource: FakeEventSource as never, document: doc as never, location: { search: '?repo=a&slug=b' } as never });
  client.start();
  FakeEventSource.last!.emit('append', { processId: 'card:T20', events: [{ seq: 1, kind: 'assistant_text', html: '<p>hi</p>', timestamp: null }] });
  expect(nodes.join('')).toContain('<p>hi</p>');
  expect(nodes.join('')).toContain('data-seq="1"');
});

test('selecting another process closes the old stream and opens one for the new id', () => {
  const { doc } = fakeDoc();
  const client = createLiveClient({ EventSource: FakeEventSource as never, document: doc as never, location: { search: '?repo=a&slug=b' } as never });
  client.start();
  const first = FakeEventSource.last!;
  client.selectProcess('agent:T20:a1');
  expect(first.closed).toBe(true);
  expect(FakeEventSource.last!.url).toBe('/events?repo=a&slug=b&process=agent%3AT20%3Aa1');
});
