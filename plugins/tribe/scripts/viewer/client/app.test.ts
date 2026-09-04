import { expect, test } from 'bun:test';
import { createLiveClient } from './app.js';

// The fixture is real enough to exercise `applyPatches`' only behavior path (F18): appended
// cards are tracked by their rendered `data-seq`, and `querySelector('[data-seq="N"]')` returns
// the matching card object rather than always `null`. It also mimics two more real-DOM shapes
// `app.js` relies on: `#live-root`'s `data-process` attribute (F12's second seed source) and
// `childElementCount`/`firstElementChild`/`removeChild` for eviction (F14). A `querySelector`
// call built from a malformed `seq` throws, exactly like a real browser rejecting an invalid
// attribute-selector string (F15's reproduction vehicle).
//
// `#transcript` and `#process-list` are two SEPARATE nodes in a real document (Skinner audit,
// 2026-09-02, F28) — routing both to one shared object here would let a `renderProcessList`
// `.innerHTML =` write silently clobber a `replaceTranscript` write (or vice versa) without any
// test ever noticing, since neither call site reads the other's element back. `makeFakeEl()` is
// the one node shape both `#transcript` and `#process-list` get their own independent instance
// of.
function makeFakeEl() {
  const nodes: string[] = [];
  const cards = new Map<string, { innerHTML: string; className: string }>();
  const children: { seq: string; innerHTML: string; className: string }[] = [];

  const el = {
    innerHTML: '',
    scrollTop: 0,
    scrollHeight: 0,
    clientHeight: 0,
    get childElementCount() {
      return children.length;
    },
    get firstElementChild() {
      return children[0] ?? null;
    },
    insertAdjacentHTML: (_pos: string, html: string) => {
      nodes.push(html);
      const seqMatch = html.match(/data-seq="([^"]*)"/);
      const classMatch = html.match(/class="([^"]*)"/);
      if (seqMatch) {
        const card = { seq: seqMatch[1] as string, innerHTML: html, className: classMatch ? (classMatch[1] as string) : '' };
        children.push(card);
        cards.set(card.seq, card);
      }
    },
    removeChild: (child: { seq: string } | null) => {
      if (!child) return;
      const i = children.findIndex((c) => c.seq === child.seq);
      if (i >= 0) children.splice(i, 1);
      cards.delete(child.seq);
    },
    querySelector: (selector: string) => {
      const m = /^\[data-seq="(.*)"\]$/.exec(selector);
      if (!m || (m[1] as string).includes('"')) throw new Error('SyntaxError: malformed selector');
      return cards.get(m[1] as string) ?? null;
    },
    addEventListener: () => {},
    dataset: {} as Record<string, string>,
  };

  return { el, nodes, cards };
}

function fakeDoc(opts: { liveRootProcess?: string } = {}) {
  const { el: transcriptEl, nodes, cards } = makeFakeEl();
  const { el: processListEl } = makeFakeEl();

  const liveRootEl = { dataset: (opts.liveRootProcess ? { process: opts.liveRootProcess } : {}) as Record<string, string> };

  return {
    nodes,
    cards,
    doc: {
      getElementById: (id: string) => {
        if (id === 'live-root') return liveRootEl;
        if (id === 'transcript') return transcriptEl;
        if (id === 'process-list') return processListEl;
        return null;
      },
      querySelector: () => transcriptEl,
      body: transcriptEl,
    },
  };
}
class FakeEventSource {
  static last: FakeEventSource | null = null;
  static instances: FakeEventSource[] = [];
  handlers = new Map<string, (e: { data: string }) => void>();
  closed = false;
  constructor(public url: string) {
    FakeEventSource.last = this;
    FakeEventSource.instances.push(this);
  }
  addEventListener(name: string, fn: (e: { data: string }) => void) {
    this.handlers.set(name, fn);
  }
  close() {
    this.closed = true;
  }
  emit(name: string, data: unknown) {
    this.handlers.get(name)?.({ data: JSON.stringify(data) });
  }
}

test('it opens exactly one stream for the campaign in the page dataset', () => {
  const { doc } = fakeDoc();
  createLiveClient({ EventSource: FakeEventSource as never, document: doc as never, location: { search: '?repo=a&slug=b' } as never }).start();
  expect(FakeEventSource.last!.url).toBe('/events?repo=a&slug=b');
});

test('append frames are inserted, and a patch rewrites the matching call card (F18)', () => {
  const { nodes, cards, doc } = fakeDoc();
  const client = createLiveClient({ EventSource: FakeEventSource as never, document: doc as never, location: { search: '?repo=a&slug=b' } as never });
  client.start();
  FakeEventSource.last!.emit('append', { processId: 'card:T20', events: [{ seq: 1, kind: 'assistant_text', html: '<p>hi</p>', timestamp: null }] });
  expect(nodes.join('')).toContain('<p>hi</p>');
  expect(nodes.join('')).toContain('data-seq="1"');

  FakeEventSource.last!.emit('append', { processId: 'card:T20', patches: [{ seq: 1, html: '<p>updated</p>' }] });
  expect(cards.get('1')!.innerHTML).toContain('<p>updated</p>');
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

test('a deep link to a process-filtered live page keeps the filter on the first connection (F12)', () => {
  const { doc } = fakeDoc();
  createLiveClient({
    EventSource: FakeEventSource as never,
    document: doc as never,
    location: { search: '?repo=a&slug=b&process=agent:T20:a1' } as never,
  }).start();
  expect(FakeEventSource.last!.url).toBe('/events?repo=a&slug=b&process=agent%3AT20%3Aa1');
});

test('seeds the process filter from #live-root data-process when the URL search lacks one (F12)', () => {
  const { doc } = fakeDoc({ liveRootProcess: 'agent:T20:a1' });
  createLiveClient({
    EventSource: FakeEventSource as never,
    document: doc as never,
    location: { search: '?repo=a&slug=b' } as never,
  }).start();
  expect(FakeEventSource.last!.url).toBe('/events?repo=a&slug=b&process=agent%3AT20%3Aa1');
});

test('a patch carrying isError applies the error class to the matching call card (F13)', () => {
  const { doc, cards } = fakeDoc();
  const client = createLiveClient({ EventSource: FakeEventSource as never, document: doc as never, location: { search: '?repo=a&slug=b' } as never });
  client.start();
  FakeEventSource.last!.emit('append', { processId: 'card:T20', events: [{ seq: 1, kind: 'tool_call', html: 'pending call', timestamp: null }] });
  FakeEventSource.last!.emit('append', { processId: 'card:T20', patches: [{ seq: 1, html: 'Error: boom', isError: true }] });
  expect(cards.get('1')!.className).toContain('event-error');
});

test('a malformed seq in one patch does not drop the update to a well-formed sibling patch (F15)', () => {
  const { doc, cards } = fakeDoc();
  const client = createLiveClient({ EventSource: FakeEventSource as never, document: doc as never, location: { search: '?repo=a&slug=b' } as never });
  client.start();
  FakeEventSource.last!.emit('append', {
    processId: 'card:T20',
    events: [
      { seq: 1, kind: 'tool_call', html: 'pending call 1', timestamp: null },
      { seq: 2, kind: 'tool_call', html: 'pending call 2', timestamp: null },
    ],
  });
  FakeEventSource.last!.emit('append', {
    processId: 'card:T20',
    patches: [
      { seq: '"]', html: 'boom' },
      { seq: 2, html: 'resolved call 2' },
    ],
  });
  expect(cards.get('2')!.innerHTML).toContain('resolved call 2');
});

test('a thinking event carrying isError applies the error class like every other kind (F16)', () => {
  const { doc, cards } = fakeDoc();
  const client = createLiveClient({ EventSource: FakeEventSource as never, document: doc as never, location: { search: '?repo=a&slug=b' } as never });
  client.start();
  FakeEventSource.last!.emit('append', { processId: 'card:T20', events: [{ seq: 1, kind: 'thinking', html: 'oops', isError: true, timestamp: null }] });
  expect(cards.get('1')!.className).toContain('event-error');
});

test('the rendered transcript is capped at MAX_RENDERED_EVENTS, evicting oldest first (F14)', () => {
  const { doc, cards } = fakeDoc();
  const client = createLiveClient({ EventSource: FakeEventSource as never, document: doc as never, location: { search: '?repo=a&slug=b' } as never });
  client.start();
  const events = Array.from({ length: 2001 }, (_, i) => ({ seq: i + 1, kind: 'assistant_text' as const, html: `e${i + 1}`, timestamp: null }));
  FakeEventSource.last!.emit('append', { processId: 'card:T20', events });
  expect(cards.size).toBe(2000);
  expect(cards.has('1')).toBe(false);
  expect(cards.has('2001')).toBe(true);
});

test('calling start() twice does not leak a second EventSource (F17)', () => {
  const { doc } = fakeDoc();
  const client = createLiveClient({ EventSource: FakeEventSource as never, document: doc as never, location: { search: '?repo=a&slug=b' } as never });
  const before = FakeEventSource.instances.length;
  client.start();
  client.start();
  expect(FakeEventSource.instances.length - before).toBe(1);
  expect(FakeEventSource.last!.closed).toBe(false);
});

test('the process list and the transcript are distinct DOM nodes (F28)', () => {
  const { doc } = fakeDoc();
  const client = createLiveClient({ EventSource: FakeEventSource as never, document: doc as never, location: { search: '?repo=a&slug=b' } as never });
  client.start();
  FakeEventSource.last!.emit('processes', { processes: [{ id: 'card:T20', label: 'Root', status: 'running', depth: 0 }] });
  FakeEventSource.last!.emit('snapshot', { events: [{ seq: 1, kind: 'assistant_text', html: '<p>hi</p>', timestamp: null }] });
  const processListHtml = (doc.getElementById('process-list') as unknown as { innerHTML: string }).innerHTML;
  const transcriptHtml = (doc.getElementById('transcript') as unknown as { innerHTML: string }).innerHTML;
  expect(processListHtml).toContain('Root');
  expect(processListHtml).not.toContain('<p>hi</p>');
  expect(transcriptHtml).toContain('<p>hi</p>');
  expect(transcriptHtml).not.toContain('Root');
});
