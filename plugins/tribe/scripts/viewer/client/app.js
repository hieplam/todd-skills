// client/app.js — browser client for the live viewer (Task 10, spec D7).
//
// A plain ES module, no imports, no build step. Every dependency on the outside world (the
// event stream, the DOM, the page location) arrives as an injected argument — the pure-core
// rule applied at the browser edge (spec D7). The server has already escaped and rendered every
// piece of transcript content (D6); this module never parses markdown and never sends anything
// back beyond opening the read-only event stream (card G4).

const SCROLL_PIN_THRESHOLD_PX = 24;

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
    return `<details class="event event-${kind}" data-seq="${seq}"><summary>thinking</summary>${evt.html}</details>`;
  }
  return `<div class="event event-${kind}${errorClass}" data-seq="${seq}">${evt.html}</div>`;
}

function processNodeHtml(node) {
  const indent = Math.max(0, node.depth) * 14;
  return `<div class="process-node process-status-${escapeAttr(node.status)}" style="margin-left:${indent}px" data-process-id="${escapeAttr(node.id)}">${escapeAttr(node.label)}</div>`;
}

export function createLiveClient({ EventSource, document, location }) {
  let source = null;
  let currentProcessId = null;
  let processListenerBound = false;

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
    }
    if (pinned) pinToBottom(el);
  }

  // A `tool_result` arriving after its call was already rendered patches the existing call card
  // by `seq` rather than appending a second, disconnected node (normalize.ts's pending-map).
  function applyPatches(patches) {
    const el = transcriptEl();
    if (!el || !Array.isArray(patches)) return;
    for (const patch of patches) {
      const card = el.querySelector(`[data-seq="${patch.seq}"]`);
      if (card) card.innerHTML = patch.html;
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
