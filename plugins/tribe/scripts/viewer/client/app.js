// client/app.js — browser client for the live viewer (Task 10, spec D7).
//
// A plain ES module, no imports, no build step. Every dependency on the outside world (the
// event stream, the DOM, the page location) arrives as an injected argument — the pure-core
// rule applied at the browser edge (spec D7). The server has already escaped and rendered every
// piece of transcript content (D6); this module never parses markdown and never sends anything
// back beyond opening the read-only event stream (card G4).

const SCROLL_PIN_THRESHOLD_PX = 24;
// Five times the server's MAX_SNAPSHOT_EVENTS (core/live/model.ts) so scrollback stays
// generous while a long-running campaign's page can't grow DOM nodes without bound (F14).
// A local constant, not an import: the browser client imports nothing at all (Task 11).
const MAX_RENDERED_EVENTS = 2000;

function escapeAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function eventNodeHtml(evt) {
  const seq = escapeAttr(evt.seq);
  const kind = escapeAttr(evt.kind);
  const errorClass = evt.isError ? ' event-error' : '';
  // Thinking blocks are collapsed by default — the reader opts in to reading them.
  if (evt.kind === 'thinking') {
    return `<details class="event event-${kind}${errorClass}" data-seq="${seq}"><summary>thinking</summary>${evt.html}</details>`;
  }
  return `<div class="event event-${kind}${errorClass}" data-seq="${seq}">${evt.html}</div>`;
}

function processNodeHtml(node) {
  const indent = Math.max(0, node.depth) * 14;
  return `<div class="process-node process-status-${escapeAttr(node.status)}" style="margin-left:${indent}px" data-process-id="${escapeAttr(node.id)}">${escapeAttr(node.label)}</div>`;
}

export function createLiveClient({ EventSource, document, location }) {
  let source = null;
  let processListenerBound = false;

  // A deep link or reload of a process-filtered live page must keep the filter on the very
  // first connection (F12): seed from the URL's `process` param, falling back to the
  // `data-process` attribute `core/live/page.ts` server-renders onto `#live-root` for exactly
  // this purpose when the URL doesn't carry one.
  function seedProcessId() {
    const fromUrl = new URLSearchParams(location.search).get('process');
    if (fromUrl !== null && fromUrl !== '') return fromUrl;
    const root = document.getElementById('live-root');
    const fromAttr = root && root.dataset ? root.dataset.process : undefined;
    return fromAttr ? fromAttr : null;
  }

  let currentProcessId = seedProcessId();

  function buildEventsUrl() {
    const params = new URLSearchParams(location.search);
    if (currentProcessId === null) {
      params.delete('process');
    } else {
      params.set('process', currentProcessId);
    }
    const qs = params.toString();
    return qs ? `/events?${qs}` : '/events';
  }

  function transcriptEl() {
    return document.getElementById('transcript');
  }

  function processListEl() {
    return document.getElementById('process-list');
  }

  function isPinnedToBottom(el) {
    return el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_PIN_THRESHOLD_PX;
  }

  function pinToBottom(el) {
    el.scrollTop = el.scrollHeight;
  }

  function appendEvents(events) {
    const el = transcriptEl();
    if (!el || !Array.isArray(events) || events.length === 0) return;
    const pinned = isPinnedToBottom(el);
    for (const evt of events) {
      el.insertAdjacentHTML('beforeend', eventNodeHtml(evt));
      // Bound rendered-card growth (F14): a page left open through a long campaign run must
      // not accumulate DOM nodes without limit, so the oldest card is evicted once the cap is
      // exceeded.
      while (el.childElementCount > MAX_RENDERED_EVENTS) {
        el.removeChild(el.firstElementChild);
      }
    }
    if (pinned) pinToBottom(el);
  }

  // A `tool_result` arriving after its call was already rendered patches the existing call card
  // by `seq` rather than appending a second, disconnected node (normalize.ts's pending-map).
  // This loop must be TOTAL (same shape as routes.ts's `encodeSseFrame`, F8's fix): a single
  // malformed `seq` must never take out its well-formed siblings in the same batch (F15).
  function applyPatches(patches) {
    const el = transcriptEl();
    if (!el || !Array.isArray(patches)) return;
    for (const patch of patches) {
      try {
        const card = el.querySelector(`[data-seq="${patch.seq}"]`);
        if (!card) continue;
        card.innerHTML = patch.html;
        // A tool call that later resolves to an error must be highlighted, same as any
        // directly-rendered error event (F13).
        if (patch.isError && !card.className.includes('event-error')) {
          card.className += ' event-error';
        }
      } catch {
        // Drop this one malformed patch; keep processing the rest of the batch.
      }
    }
  }

  function renderProcessList(processes) {
    const el = processListEl();
    if (!el || !Array.isArray(processes)) return;
    el.innerHTML = processes.map(processNodeHtml).join('');
    if (!processListenerBound) {
      el.addEventListener('click', (event) => {
        const target = event.target && typeof event.target.closest === 'function'
          ? event.target.closest('[data-process-id]')
          : null;
        if (target) selectProcess(target.dataset.processId);
      });
      processListenerBound = true;
    }
  }

  function replaceTranscript(events) {
    const el = transcriptEl();
    if (!el) return;
    el.innerHTML = Array.isArray(events) ? events.map(eventNodeHtml).join('') : '';
    pinToBottom(el);
  }

  function open() {
    source = new EventSource(buildEventsUrl());
    source.addEventListener('processes', (e) => {
      const data = JSON.parse(e.data);
      renderProcessList(data.processes);
    });
    source.addEventListener('snapshot', (e) => {
      const data = JSON.parse(e.data);
      replaceTranscript(data.events);
    });
    source.addEventListener('append', (e) => {
      const data = JSON.parse(e.data);
      appendEvents(data.events);
      applyPatches(data.patches);
    });
    source.addEventListener('ping', () => {});
    source.addEventListener('error', () => {});
  }

  function close() {
    if (source) {
      source.close();
      source = null;
    }
  }

  function start() {
    // Re-entrancy guard (F17): a second `start()` call must never leak the first `EventSource`.
    if (source) return;
    open();
  }

  function stop() {
    close();
  }

  function selectProcess(id) {
    currentProcessId = id;
    close();
    open();
  }

  return { start, stop, selectProcess };
}

if (typeof document !== 'undefined') {
  createLiveClient({ EventSource, document, location }).start();
}
