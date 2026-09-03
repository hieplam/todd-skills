# Campaign live viewer — implementation plan

> **For agentic workers:** executed via the tribe workflow (Warchief dispatches one Hunter per
> task, strict TDD, dual-Skinner audit per task and once across the branch). Steps use checkbox
> (`- [ ]`) syntax. Spec:
> `docs/superpowers/specs/2026-09-02-campaign-live-viewer-design.md` — read it first; it is the
> requirement contract. Decisions are cited by id (`D1`-`D14` = spec decisions;
> `card D1`-`card D7` = the idea card's settled rulings).

**Goal:** While a campaign runs, one read-only local page lists every process the runner spawned
for the running card — the executor session and every subagent — and renders each transcript as
messages, tailed live within 2 seconds, started automatically by the runner.

**Architecture:** Grow the existing `plugins/tribe/scripts/viewer/` package (never a second
viewer). A pure core under `core/live/` does all parsing, normalizing, process-list derivation
and HTML rendering; two new adapters own every filesystem and clock touch; `serve.ts` gains the
`/live`, `/events` (SSE), `/api/processes`, `/app.js`, `/app.css` and `/healthz` routes while
`GET /` keeps today's status page unchanged. The runner gains a pure launch decision, a
`ViewerPort`, one adapter, and four lines of wiring in its composition root.

**Tech stack:** bun 1.3.14 + TypeScript, zero runtime dependencies, no build step in the run
path. Test runner: `bun test`. Check command per package: `bun run check`
(`tsc --noEmit && bun test`).

## Global Constraints

- **Implementer:** dispatch each implementation/fix task to the `hunter` subagent — never a
  generic implementer.
- **Purity:** core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see
  `~/.claude/rules/pure-core.md`).
- **TDD non-negotiable:** every task writes the failing test first, watches it fail, then writes
  the minimum code to pass, then commits. A task that cannot show its red step is not done.
- **Read-only wall (card G4):** the viewer never writes, renames, deletes, locks, or executes
  anything; it never calls `git`, `gh`, or any network endpoint; it binds `127.0.0.1` only. The
  only writes anywhere in this plan are the evidence files of Task 15 and the docs of Task 14.
- **No new persisted format (card D5):** nothing in this plan adds a field to `run.json` or
  `campaign-state.json`. If a task believes it needs one, it stops and reports `NEEDS_CONTEXT`.
- **Never weaken a purity wall:** the runner's `plugins/tribe/scripts/runner/structure.test.ts`
  is not edited by any task in this plan and must stay green; the viewer gains its own
  equivalent in Task 11.
- **Kanna is a read-only reference.** Read `/Users/hip/repo/kanna` for shapes; never modify it,
  never import from it, never add it as a dependency.
- **Commits:** conventional style, one logical change per commit, and every commit's final
  paragraph carries the two trailers `Tribe-Card: campaign-live-viewer` and
  `Tribe-Task: N/15`. Tick this plan's checkboxes in the same commit as the code. **Never add an
  agent name as commit co-author.** Regular merge only, never squash.
- **Branch base:** `master` at `5e8c095`. Ignore the three uncommitted owner experiments in the
  working tree (a deleted kanna script, a `.vscode/launch.json` block, a `package.json`
  newline); never commit them.

## Wave and ownership map (two Hunters in parallel where marked)

| Wave | Worktree | Tasks | Owns files |
|---|---|---|---|
| 0 | main | 1 | `viewer/core/live/model.ts` |
| 1 | A | 2, 3, 4, 5, 6, 7 | `viewer/core/live/paths.ts`, `tail.ts`, `records.ts`, `markdown.ts`, `normalize.ts`, `processes.ts` and their tests, `viewer/fixtures/` |
| 1 | B | 8, 9, 10, 11 | `viewer/core/live/routes.ts`, `viewer/core/live/page.ts`, `viewer/client/`, `viewer/structure.test.ts` and their tests |
| 2 | C | 12 | `viewer/adapters/`, `viewer/serve.ts`, `viewer/package.json`, `viewer/README.md` |
| 2 | D | 13 | `runner/core/viewer-launch.ts`, `runner/ports/ports.ts`, `runner/adapters/viewer-launch.adapter.ts`, `runner/cli/main.ts` |
| 3 | main | 14 | docs, C3, SKILL.md, READMEs |
| 4 | main | 15 | `viewer/e2e/`, `docs/superpowers/evidence/2026-09-02-campaign-live-viewer/` |

Wave 1's two worktrees have disjoint owned files and both compile against Task 1's contract, so
their Hunters run concurrently. Wave 2's two worktrees are likewise disjoint (viewer vs runner).
Each wave merges into the Warchief's own branch before the next wave's worktrees are created.

## Audit and governance schedule (Warchief-run, not Hunter work)

- After **every** task: the dual-Skinner cell — one contract lens, one cold lens, dispatched
  concurrently, adjudicated by the Warchief.
- After **every** task: a `tracker` diff review against the written rules
  (`CLAUDE.md`, `~/.claude/rules/pure-core.md`, `html-illustration.md`, `.c3/`), plus the
  pre-gate, before any Skinner is dispatched.
- Once the branch is complete and before the final commit: a `scout` survey of every touched
  file (unwritten conventions, rule candidates) and a final `tracker` review, then the final
  whole-branch dual-Skinner audit. Every finding gets a recorded disposition in the report file.

## File structure (locked decomposition)

```
plugins/tribe/scripts/viewer/
  core/live/model.ts           NEW  shared types + wire contract (Task 1)
  core/live/paths.ts           NEW  encodeCwd sanitization + transcript path math (Task 2)
  core/live/tail.ts            NEW  pure tail state machine (Task 3)
  core/live/records.ts         NEW  tolerant JSONL reader (Task 4)
  core/live/markdown.ts        NEW  markdown subset to escaped HTML (Task 5)
  core/live/normalize.ts       NEW  records to TranscriptEvent[] (Task 6)
  core/live/processes.ts       NEW  process tree + status derivation (Task 7)
  core/live/routes.ts          NEW  URL parsing + SSE frame encoding (Task 8)
  core/live/page.ts            NEW  live page shell renderer (Task 9)
  client/app.js                NEW  browser ES module (Task 10)
  client/app.css               NEW  page styles (Task 10)
  structure.test.ts            NEW  viewer purity wall (Task 11)
  adapters/transcript.adapter.ts NEW fs primitives (Task 12)
  adapters/poller.adapter.ts   NEW  400 ms poll loop (Task 12)
  serve.ts                     MOD  routes + wiring (Task 12)
  core/render.ts               MOD  one live link per campaign (Task 12)
  README.md                    NEW  package docs (Task 12)
  e2e/live-viewer.e2e.test.ts  NEW  opt-in end-to-end (Task 15)
plugins/tribe/scripts/runner/
  core/viewer-launch.ts        NEW  pure launch decision (Task 13)
  ports/ports.ts               MOD  ViewerPort (Task 13)
  adapters/viewer-launch.adapter.ts NEW probe + detached spawn (Task 13)
  cli/main.ts                  MOD  two flags + wiring (Task 13)
docs + C3 + skill (Task 14): runner README, plugins/tribe/README.md,
  .c3/c3-2-plugins/c3-215-tribe.md, skills/orchestrate-campaign/SKILL.md
```

---

### Task 1: Shared live contract

**Files:**
- Create: `plugins/tribe/scripts/viewer/core/live/model.ts`
- Create: `plugins/tribe/scripts/viewer/core/live/model.test.ts`

**Interfaces produced** (every later task imports these exact names; nothing else in this task):
`ProcessNode`, `TranscriptEvent`, `EventKind`, `LiveRoute`, `SseFrame`, and the constants
`POLL_INTERVAL_MS = 400`, `ACTIVE_WINDOW_MS = 10000`, `MAX_SNAPSHOT_EVENTS = 400`,
`MAX_LIVE_STREAMS = 8`, `SSE_EVENT_NAMES`.

This task is types plus constants only — no logic, no imports of anything else in the repo. It
exists so wave 1's two Hunters compile against one frozen contract (spec §4.1).

- [x] **Step 1: Write the failing test.** Create `core/live/model.test.ts`:

```ts
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
```

  Run `cd plugins/tribe/scripts/viewer && bun test core/live/model.test.ts`.
  Expected: the run fails because `core/live/model.ts` does not resolve.

- [x] **Step 2: Implement.** Create `core/live/model.ts` with the interfaces exactly as spec
  §4.1 lists them (`ProcessNode`, `TranscriptEvent`, `EventKind`) plus:

```ts
export const POLL_INTERVAL_MS = 400;
export const ACTIVE_WINDOW_MS = 10_000;
export const MAX_SNAPSHOT_EVENTS = 400;
export const MAX_LIVE_STREAMS = 8;
export const SSE_EVENT_NAMES = ['processes', 'snapshot', 'append', 'ping', 'error'] as const;
export type SseEventName = (typeof SSE_EVENT_NAMES)[number];
export type LiveRoute =
  | { kind: 'status' }
  | { kind: 'live'; repoKey: string; slug: string; processId: string | null }
  | { kind: 'events'; repoKey: string; slug: string; processId: string | null }
  | { kind: 'processes'; repoKey: string; slug: string }
  | { kind: 'asset'; name: 'app.js' | 'app.css' }
  | { kind: 'health' }
  | { kind: 'bad_request'; reason: string }
  | { kind: 'not_found' };
export interface SseFrame { event: SseEventName; data: unknown }
```

- [x] **Step 3: Verify.** Run `cd plugins/tribe/scripts/viewer && bun run check`.
  Expected: `tsc --noEmit` clean and all tests pass, including the 27 pre-existing ones.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/core/live/model.ts \
        plugins/tribe/scripts/viewer/core/live/model.test.ts \
        docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(viewer): freeze the live-view wire contract' \
  -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 1/15'
```

  Expected: one commit whose `git log -1 --format=%(trailers)` shows both trailers.

---

### Task 2: Transcript path resolution

**Files:**
- Create: `plugins/tribe/scripts/viewer/core/live/paths.ts`
- Create: `plugins/tribe/scripts/viewer/core/live/paths.test.ts`

**Interfaces produced:** `sanitizeProjectDirName(absPath)`, `projectDirOf(homeDir, encodedName)`,
`transcriptPathOf(projectDir, sessionId)`, `subagentsDirOf(projectDir, sessionId)`,
`agentIdFromFileName(name)`, `metaFileNameFor(agentId)`.

Pure string math only (D1). The `realpath` call that produces the input to
`sanitizeProjectDirName` belongs to the adapter in Task 12 — this module never touches `fs`.
Port the algorithm verbatim from Kanna's `src/server/claude-pty/jsonl-path.adapter.ts:26-41`:
NFC-normalize, replace every `[^a-zA-Z0-9]` with `-`, and when the result exceeds 200 characters
truncate to 200 and append `-` plus the base36 hash suffix (`Bun.hash` when available, else the
djb2 fallback Kanna documents).

- [x] **Step 1: Write the failing test.** Create `core/live/paths.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { agentIdFromFileName, metaFileNameFor, sanitizeProjectDirName, subagentsDirOf, transcriptPathOf } from './paths.ts';

test('encodes a real repo path exactly as Claude Code does (verified on disk)', () => {
  expect(sanitizeProjectDirName('/Users/hip/repo/wiki-harness')).toBe('-Users-hip-repo-wiki-harness');
  expect(sanitizeProjectDirName('/Users/hip/repo/todd-skills')).toBe('-Users-hip-repo-todd-skills');
});

test('a path longer than 200 sanitized chars is truncated and hash-suffixed', () => {
  const long = `/Users/hip/${'a'.repeat(300)}`;
  const out = sanitizeProjectDirName(long);
  expect(out.length).toBeGreaterThan(200);
  expect(out.slice(0, 200)).toBe(long.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 200));
  expect(out[200]).toBe('-');
  expect(sanitizeProjectDirName(long)).toBe(out);
});

test('builds the transcript and subagent locations from a session id', () => {
  const dir = '/home/.claude/projects/-Users-hip-repo-wiki-harness';
  expect(transcriptPathOf(dir, 'abc-123')).toBe(`${dir}/abc-123.jsonl`);
  expect(subagentsDirOf(dir, 'abc-123')).toBe(`${dir}/abc-123/subagents`);
});

test('recovers an agent id from its transcript file name, and its sidecar name', () => {
  expect(agentIdFromFileName('agent-a02f7fb139fbc0ce2.jsonl')).toBe('a02f7fb139fbc0ce2');
  expect(agentIdFromFileName('agent-a02f7fb139fbc0ce2.meta.json')).toBeNull();
  expect(agentIdFromFileName('notes.txt')).toBeNull();
  expect(metaFileNameFor('a02f7fb139fbc0ce2')).toBe('agent-a02f7fb139fbc0ce2.meta.json');
});
```

  Run `cd plugins/tribe/scripts/viewer && bun test core/live/paths.test.ts`.
  Expected: fails to resolve `./paths.ts`.

- [x] **Step 2: Implement** `core/live/paths.ts` using only `join` from `node:path` (permitted in
  core — `node:path` is not a world module) and the Kanna algorithm above. `agentIdFromFileName`
  must match `^agent-(.+)\.jsonl$` only, so a `.meta.json` sidecar never yields an id.

- [x] **Step 3: Verify.** `cd plugins/tribe/scripts/viewer && bun run check`.
  Expected: green, and the two encoded names in the first test match the directories that exist
  under `~/.claude/projects` on this machine.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/core/live/paths.ts plugins/tribe/scripts/viewer/core/live/paths.test.ts docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(viewer): resolve transcript paths from a recorded session id' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 2/15'
```

  Expected: one commit carrying both trailers.

---

### Task 3: Pure tail state machine

**Files:**
- Create: `plugins/tribe/scripts/viewer/core/live/tail.ts`
- Create: `plugins/tribe/scripts/viewer/core/live/tail.test.ts`

**Interfaces produced:**
`interface TailState { offset: number; carry: string }`, `initialTailState()`,
`advanceTail(state, chunk: string, fileSize: number): { state: TailState; lines: string[] }`.

This is card D2 and spec D8 in pure form: the adapter stats the file and reads only the bytes
past `state.offset`; this function turns those bytes into complete lines and carries any partial
final line to the next tick. A `fileSize` smaller than `state.offset` means truncation or
rotation: reset to a fresh state and re-read from zero.

- [x] **Step 1: Write the failing test.** Create `core/live/tail.test.ts`:

```ts
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
```

  Run `cd plugins/tribe/scripts/viewer && bun test core/live/tail.test.ts`.
  Expected: fails to resolve `./tail.ts`.

- [x] **Step 2: Implement** `core/live/tail.ts`. Append `chunk` to `state.carry`, split on `\n`,
  pop the last element back into `carry`, trim a trailing `\r` from each emitted line, drop empty
  lines, and set `offset` to `fileSize`. When `fileSize < state.offset`, start from
  `initialTailState()` before processing the chunk.

- [x] **Step 3: Verify.** `cd plugins/tribe/scripts/viewer && bun run check`.
  Expected: green, four new tests passing.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/core/live/tail.ts plugins/tribe/scripts/viewer/core/live/tail.test.ts docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(viewer): pure stat-delta tail state machine' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 3/15'
```

  Expected: one commit carrying both trailers.

---

### Task 4: Tolerant transcript record reader

**Files:**
- Create: `plugins/tribe/scripts/viewer/core/live/records.ts`
- Create: `plugins/tribe/scripts/viewer/core/live/records.test.ts`
- Create: `plugins/tribe/scripts/viewer/fixtures/session-valid.jsonl`
- Create: `plugins/tribe/scripts/viewer/fixtures/session-malformed.jsonl`
- Create: `plugins/tribe/scripts/viewer/fixtures/subagent-valid.jsonl`

**Interfaces produced:** `TranscriptRecord` (a tolerant shape: `type`, optional `uuid`,
`parentUuid`, `sessionId`, `timestamp`, `cwd`, `message`, `toolUseResult`, `isSidechain`,
`agentId`), `parseRecordLines(lines: string[]): { records: TranscriptRecord[]; skipped: number }`,
and `isMessageRecord(record)`.

Reads both `sessionId` and `session_id` (card D7). Never throws: an unparseable line increments
`skipped`. Non-message row types (`attachment`, `queue-operation`, `last-prompt`, `ai-title`,
`mode`, `pr-link`, `summary`, `custom-title`) parse fine but answer `false` to
`isMessageRecord`. The fixtures are hand-authored to the shapes verified in spec §1.1 — copy the
shapes, never real session content.

- [x] **Step 1: Write the failing test.** Create `core/live/records.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { isMessageRecord, parseRecordLines } from './records.ts';

test('accepts camelCase sessionId and snake_case session_id alike (card D7)', () => {
  const { records } = parseRecordLines([
    JSON.stringify({ type: 'user', sessionId: 'a', message: { role: 'user', content: 'hi' } }),
    JSON.stringify({ type: 'user', session_id: 'b', message: { role: 'user', content: 'yo' } }),
  ]);
  expect(records.map((r) => r.sessionId)).toEqual(['a', 'b']);
});

test('an unparseable line is counted and skipped, never thrown', () => {
  const { records, skipped } = parseRecordLines(['{not json', JSON.stringify({ type: 'user' })]);
  expect(skipped).toBe(1);
  expect(records).toHaveLength(1);
});

test('bookkeeping row types parse but are not messages', () => {
  const noise = ['attachment', 'queue-operation', 'last-prompt', 'ai-title', 'mode', 'pr-link'];
  const { records } = parseRecordLines(noise.map((type) => JSON.stringify({ type })));
  expect(records.map(isMessageRecord)).toEqual(noise.map(() => false));
});

test('assistant, user and system rows are messages', () => {
  const { records } = parseRecordLines(
    ['assistant', 'user', 'system'].map((type) => JSON.stringify({ type })),
  );
  expect(records.map(isMessageRecord)).toEqual([true, true, true]);
});
```

  Run `cd plugins/tribe/scripts/viewer && bun test core/live/records.test.ts`.
  Expected: fails to resolve `./records.ts`.

- [x] **Step 2: Implement** `core/live/records.ts` and author the three fixture files (a valid
  parent transcript with a user prompt, a thinking block, a text block, a `tool_use` and its
  paired `tool_result`; a malformed file with two broken lines; a subagent transcript whose rows
  carry `isSidechain: true`).

- [x] **Step 3: Verify.** `cd plugins/tribe/scripts/viewer && bun run check`.
  Expected: green; the malformed fixture parses with a non-zero `skipped` and no exception.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/core/live/records.ts plugins/tribe/scripts/viewer/core/live/records.test.ts plugins/tribe/scripts/viewer/fixtures docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(viewer): tolerant JSONL transcript reader with fixtures' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 4/15'
```

  Expected: one commit carrying both trailers.

---

### Task 5: Markdown subset renderer

**Files:**
- Create: `plugins/tribe/scripts/viewer/core/live/markdown.ts`
- Create: `plugins/tribe/scripts/viewer/core/live/markdown.test.ts`

**Interfaces produced:** `escapeHtml(text)`, `renderMarkdown(text): string`.

Spec D6: the only place markdown becomes HTML, and the only place escaping happens for
transcript content. Supported subset and nothing more: fenced code blocks, inline code, bold,
italic, ATX headings, bullet and numbered lists, links, paragraphs, hard line breaks. Everything
else renders as escaped text. Escaping happens **before** markup is added, so no input can ever
inject an element or an attribute.

- [x] **Step 1: Write the failing test.** Create `core/live/markdown.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { escapeHtml, renderMarkdown } from './markdown.ts';

test('escapes every dangerous character before any markup is added', () => {
  expect(escapeHtml(`<img src=x onerror="1">&'`)).toBe('&lt;img src=x onerror=&quot;1&quot;&gt;&amp;&#39;');
  expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script>');
});

test('renders the supported subset', () => {
  expect(renderMarkdown('**bold** and *it* and `code`')).toBe('<p><strong>bold</strong> and <em>it</em> and <code>code</code></p>');
  expect(renderMarkdown('## Heading')).toBe('<h2>Heading</h2>');
  expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
  expect(renderMarkdown('[kanna](https://example.test/x)')).toBe('<p><a href="https://example.test/x" rel="noreferrer noopener" target="_blank">kanna</a></p>');
});

test('a fenced block keeps its content verbatim and escaped', () => {
  expect(renderMarkdown('```ts\nconst a = 1 < 2;\n```')).toBe('<pre><code class="lang-ts">const a = 1 &lt; 2;</code></pre>');
});

test('a javascript: link is rendered as plain text, never as an anchor', () => {
  expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a ');
});
```

  Run `cd plugins/tribe/scripts/viewer && bun test core/live/markdown.test.ts`.
  Expected: fails to resolve `./markdown.ts`.

- [x] **Step 2: Implement** `core/live/markdown.ts`. Split fenced blocks out first, escape every
  segment, then apply inline rules to the non-fenced segments only. Anchor `href` values are
  allowed only when they start with `http://`, `https://`, or `/`.

- [x] **Step 3: Verify.** `cd plugins/tribe/scripts/viewer && bun run check`.
  Expected: green, and no test input escapes as live markup.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/core/live/markdown.ts plugins/tribe/scripts/viewer/core/live/markdown.test.ts docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(viewer): pure markdown-subset renderer with escape-first ordering' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 5/15'
```

  Expected: one commit carrying both trailers.

---

### Task 6: Record normalization and tool pairing

**Files:**
- Create: `plugins/tribe/scripts/viewer/core/live/normalize.ts`
- Create: `plugins/tribe/scripts/viewer/core/live/normalize.test.ts`

**Interfaces produced:**
`interface NormalizeState { seq: number; pending: Map<string, number> }`,
`initialNormalizeState()`,
`normalizeRecords(state, records): { state: NormalizeState; events: TranscriptEvent[]; patches: Array<{ seq: number; html: string; isError: boolean }> }`.

This is card G1's core: user prompts, assistant text as markdown, thinking (collapsed, signature
never rendered), and tool calls paired with their results. Because the stream is incremental, a
`tool_result` arriving in a later tick cannot mutate an already-sent event — it is emitted as a
`patches` entry keyed by the original event's `seq`, which the client applies to the existing
call card (Kanna's pending-map idea, adapted to an append-only wire). Rows failing
`isMessageRecord` produce nothing. `model: "<synthetic>"` is not an error (card D7).

- [x] **Step 1: Write the failing test.** Create `core/live/normalize.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { initialNormalizeState, normalizeRecords } from './normalize.ts';
import { parseRecordLines } from './records.ts';

function run(objects: unknown[]) {
  const { records } = parseRecordLines(objects.map((o) => JSON.stringify(o)));
  return normalizeRecords(initialNormalizeState(), records);
}

test('a string user message becomes a user_prompt event', () => {
  const { events } = run([{ type: 'user', timestamp: '2026-09-02T10:00:00Z', message: { role: 'user', content: 'build it' } }]);
  expect(events.map((e) => e.kind)).toEqual(['user_prompt']);
  expect(events[0]!.html).toContain('build it');
});

test('assistant text, thinking and tool_use split into three events, thinking without its signature', () => {
  const { events } = run([
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: '**done**' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'thinking', thinking: 'hmm', signature: 'SECRETSIG' }] } },
    { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }] } },
  ]);
  expect(events.map((e) => e.kind)).toEqual(['assistant_text', 'thinking', 'tool_call']);
  expect(events[0]!.html).toContain('<strong>done</strong>');
  expect(events[1]!.html).not.toContain('SECRETSIG');
  expect(events[2]!.toolName).toBe('Bash');
  expect(events[2]!.toolUseId).toBe('toolu_1');
});

test('a tool_result in a later batch patches the earlier call rather than appending a raw dump', () => {
  const first = run([{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'ls' } }] } }]);
  const { records } = parseRecordLines([
    JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: 'README.md', is_error: false }] } }),
  ]);
  const second = normalizeRecords(first.state, records);
  expect(second.events).toEqual([]);
  expect(second.patches).toHaveLength(1);
  expect(second.patches[0]!.seq).toBe(first.events[0]!.seq);
  expect(second.patches[0]!.html).toContain('README.md');
});

test('bookkeeping rows and a synthetic model produce no events and no throw (card D7)', () => {
  const { events } = run([
    { type: 'attachment' },
    { type: 'queue-operation' },
    { type: 'assistant', message: { role: 'assistant', model: '<synthetic>', content: [{ type: 'text', text: 'ok' }] } },
  ]);
  expect(events.map((e) => e.kind)).toEqual(['assistant_text']);
});
```

  Run `cd plugins/tribe/scripts/viewer && bun test core/live/normalize.test.ts`.
  Expected: fails to resolve `./normalize.ts`.

- [x] **Step 2: Implement** `core/live/normalize.ts` over `records.ts` and `markdown.ts`, keeping
  `seq` monotonic across calls and `pending` mapping a `tool_use` id to the `seq` of its call
  event.

- [x] **Step 3: Verify.** `cd plugins/tribe/scripts/viewer && bun run check`.
  Expected: green; no code path renders a raw JSON line as output.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/core/live/normalize.ts plugins/tribe/scripts/viewer/core/live/normalize.test.ts docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(viewer): normalize transcript records into paired message events' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 6/15'
```

  Expected: one commit carrying both trailers.

---

### Task 7: Process list and status derivation

**Files:**
- Create: `plugins/tribe/scripts/viewer/core/live/processes.ts`
- Create: `plugins/tribe/scripts/viewer/core/live/processes.test.ts`

**Interfaces produced:**
`interface SubagentEntry { agentId: string; meta: { agentType?: string; description?: string; toolUseId?: string; parentAgentId?: string; spawnDepth?: number } | null; sizeBytes: number; mtimeIso: string | null; firstSeenIso: string | null }`,
`deriveProcesses(input): ProcessNode[]` where `input` carries the card id, the session id, the
transcript path and stat, the subagent entries, the set of `tool_use` ids already resolved in the
parent transcript, the card's state status, and `nowIso`.

Spec D3: the tree comes from the `.meta.json` sidecars — `spawnDepth: 1` entries hang off the
session node, deeper ones off `parentAgentId`. Status order: `missing`, then `done`, then
`active` (mtime within `ACTIVE_WINDOW_MS`), else `idle`. A null meta never drops an entry.

- [x] **Step 1: Write the failing test.** Create `core/live/processes.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { deriveProcesses } from './processes.ts';

const base = {
  cardId: 'T20',
  sessionId: 'sess-1',
  transcriptPath: '/p/sess-1.jsonl',
  sessionStat: { sizeBytes: 10, mtimeIso: '2026-09-02T10:00:00.000Z' },
  subagentsDir: '/p/sess-1/subagents',
  resolvedToolUseIds: new Set<string>(),
  cardStatus: 'running',
  nowIso: '2026-09-02T10:00:05.000Z',
};

test('a subagent named by its sidecar becomes a child of the session node', () => {
  const nodes = deriveProcesses({ ...base, subagents: [
    { agentId: 'a1', meta: { agentType: 'tribe:hunter', description: 'Implement T20', toolUseId: 'toolu_9', spawnDepth: 1 }, sizeBytes: 4, mtimeIso: '2026-09-02T10:00:04.000Z', firstSeenIso: '2026-09-02T10:00:01.000Z' },
  ] });
  expect(nodes.map((n) => n.id)).toEqual(['card:T20', 'agent:T20:a1']);
  expect(nodes[1]!.parentId).toBe('card:T20');
  expect(nodes[1]!.agentType).toBe('tribe:hunter');
  expect(nodes[1]!.label).toBe('Implement T20');
  expect(nodes[1]!.depth).toBe(1);
});

test('a deeper agent hangs off its parentAgentId, not off the session', () => {
  const nodes = deriveProcesses({ ...base, subagents: [
    { agentId: 'w1', meta: { agentType: 'warchief', spawnDepth: 1 }, sizeBytes: 1, mtimeIso: base.nowIso, firstSeenIso: base.nowIso },
    { agentId: 'h1', meta: { agentType: 'hunter', parentAgentId: 'w1', spawnDepth: 2 }, sizeBytes: 1, mtimeIso: base.nowIso, firstSeenIso: base.nowIso },
  ] });
  const deep = nodes.find((n) => n.agentId === 'h1');
  expect(deep!.parentId).toBe('agent:T20:w1');
  expect(deep!.depth).toBe(2);
});

test('status is derived from resolution then recency', () => {
  const nodes = deriveProcesses({ ...base, resolvedToolUseIds: new Set(['toolu_done']), subagents: [
    { agentId: 'done', meta: { toolUseId: 'toolu_done', spawnDepth: 1 }, sizeBytes: 1, mtimeIso: '2026-09-02T09:00:00.000Z', firstSeenIso: null },
    { agentId: 'live', meta: { toolUseId: 'toolu_live', spawnDepth: 1 }, sizeBytes: 1, mtimeIso: '2026-09-02T10:00:04.000Z', firstSeenIso: null },
    { agentId: 'stale', meta: { toolUseId: 'toolu_stale', spawnDepth: 1 }, sizeBytes: 1, mtimeIso: '2026-09-02T09:59:00.000Z', firstSeenIso: null },
    { agentId: 'gone', meta: null, sizeBytes: 0, mtimeIso: null, firstSeenIso: null },
  ] });
  const byId = Object.fromEntries(nodes.map((n) => [n.agentId, n.status]));
  expect(byId).toEqual({ null: 'active', done: 'done', live: 'active', stale: 'idle', gone: 'missing' });
});

test('an unreadable sidecar still yields a visible entry', () => {
  const nodes = deriveProcesses({ ...base, subagents: [
    { agentId: 'x9', meta: null, sizeBytes: 3, mtimeIso: base.nowIso, firstSeenIso: null },
  ] });
  expect(nodes[1]!.agentType).toBeNull();
  expect(nodes[1]!.label).toBe('agent x9');
});
```

  Run `cd plugins/tribe/scripts/viewer && bun test core/live/processes.test.ts`.
  Expected: fails to resolve `./processes.ts`.

- [x] **Step 2: Implement** `core/live/processes.ts`. The session node is always first, with
  `agentId: null` and `kind: 'session'`; children are sorted by `firstSeenIso` then `agentId` so
  the order is stable between ticks.

- [x] **Step 3: Verify.** `cd plugins/tribe/scripts/viewer && bun run check`.
  Expected: green, and the derivation reproduces the shapes verified on disk in spec §1.1.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/core/live/processes.ts plugins/tribe/scripts/viewer/core/live/processes.test.ts docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(viewer): derive the spawned-process tree from subagent sidecars' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 7/15'
```

  Expected: one commit carrying both trailers.

---

### Task 8: Route parsing and SSE frame encoding

**Files:**
- Create: `plugins/tribe/scripts/viewer/core/live/routes.ts`
- Create: `plugins/tribe/scripts/viewer/core/live/routes.test.ts`

**Interfaces produced:** `parseLiveRoute(url: string): LiveRoute`, `encodeSseFrame(frame): string`.

Spec §4.2. `repo` and `slug` are separate query parameters, each validated against
`^[A-Za-z0-9._-]+$`; anything else yields `bad_request` before any path is built. Assets resolve
from a fixed two-name allowlist, never from the request path.

- [x] **Step 1: Write the failing test.** Create `core/live/routes.test.ts`:

```ts
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
```

  Run `cd plugins/tribe/scripts/viewer && bun test core/live/routes.test.ts`.
  Expected: fails to resolve `./routes.ts`.

- [x] **Step 2: Implement** `core/live/routes.ts` using the `URL` global (no imports beyond
  `./model.ts`). `encodeSseFrame` must strip newlines from the serialized data so a single frame
  can never be split into two by transcript content.

- [x] **Step 3: Verify.** `cd plugins/tribe/scripts/viewer && bun run check`.
  Expected: green, traversal cases rejected.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/core/live/routes.ts plugins/tribe/scripts/viewer/core/live/routes.test.ts docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(viewer): pure route parsing and SSE frame encoding' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 8/15'
```

  Expected: one commit carrying both trailers.

---

### Task 9: Live page shell

**Files:**
- Create: `plugins/tribe/scripts/viewer/core/live/page.ts`
- Create: `plugins/tribe/scripts/viewer/core/live/page.test.ts`

**Interfaces produced:**
`renderLivePage(input: { repoKey: string; slug: string; processId: string | null }): string`.

A server-rendered shell only: header (campaign identity, the read-only disclaimer, a link back to
`/`), an empty process-list aside, an empty transcript main, and the two asset tags. All content
arrives over SSE. Follow the `html-illustration.md` structural numbers (container width, type
scale, reading measure, panel caps, spacing rhythm) while keeping the existing status page's
palette for continuity (spec §7).

- [x] **Step 1: Write the failing test.** Create `core/live/page.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { renderLivePage } from './page.ts';

test('the shell is self-contained, read-only-labelled and links its two assets', () => {
  const html = renderLivePage({ repoKey: 'a', slug: 'b', processId: null });
  expect(html.startsWith('<!doctype html>')).toBe(true);
  expect(html).toContain('<link rel="stylesheet" href="/app.css">');
  expect(html).toContain('<script type="module" src="/app.js"></script>');
  expect(html).toContain('read-only');
  expect(html).toContain('href="/"');
});

test('it carries the campaign identity as data attributes for the client', () => {
  const html = renderLivePage({ repoKey: 'repo-key', slug: 'the-slug', processId: 'card:T20' });
  expect(html).toContain('data-repo="repo-key"');
  expect(html).toContain('data-slug="the-slug"');
  expect(html).toContain('data-process="card:T20"');
});

test('campaign identifiers are escaped, never interpolated raw', () => {
  const html = renderLivePage({ repoKey: '"><img src=x>', slug: 'b', processId: null });
  expect(html).not.toContain('<img src=x>');
});

test('it contains no form, button or input — there is no control surface', () => {
  const html = renderLivePage({ repoKey: 'a', slug: 'b', processId: null });
  for (const tag of ['<form', '<input', '<textarea', '<button']) expect(html).not.toContain(tag);
});
```

  Run `cd plugins/tribe/scripts/viewer && bun test core/live/page.test.ts`.
  Expected: fails to resolve `./page.ts`.

- [x] **Step 2: Implement** `core/live/page.ts`, reusing the `escapeHtml` already exported by
  `core/render.ts` rather than writing a second escaper.

- [x] **Step 3: Verify.** `cd plugins/tribe/scripts/viewer && bun run check`.
  Expected: green, and the four assertions above hold.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/core/live/page.ts plugins/tribe/scripts/viewer/core/live/page.test.ts docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(viewer): server-rendered live page shell' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 9/15'
```

  Expected: one commit carrying both trailers.

---

### Task 10: Browser client module

**Files:**
- Create: `plugins/tribe/scripts/viewer/client/app.js`
- Create: `plugins/tribe/scripts/viewer/client/app.css`
- Create: `plugins/tribe/scripts/viewer/client/app.test.ts`

**Interfaces produced:** `createLiveClient({ EventSource, document, location })` returning
`{ start(), stop(), selectProcess(id) }`, self-starting only under
`if (typeof document !== 'undefined')` (spec D7).

The client is deliberately dumb: it opens one `EventSource`, renders the process list, appends
event nodes, applies `patches` to the matching call card by `seq`, keeps the view pinned to the
bottom unless the reader scrolled up, and reopens the stream when the selection changes. It
never parses markdown (the server already did, spec D6) and never sends anything.

- [x] **Step 1: Write the failing test.** Create `client/app.test.ts` driving the module with
  fakes:

```ts
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
```

  Run `cd plugins/tribe/scripts/viewer && bun test client/app.test.ts`.
  Expected: fails to resolve `./app.js`.

- [x] **Step 2: Implement** `client/app.js` (a plain ES module, no imports, no build step) and
  `client/app.css` (the structural numbers from `html-illustration.md`; the existing status
  page's palette). Thinking blocks render inside `<details>` so they are collapsed by default.

- [x] **Step 3: Verify.** `cd plugins/tribe/scripts/viewer && bun run check`.
  Expected: green; the module imports nothing and references `document` only through its
  injected dependency.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/client docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(viewer): dependency-injected browser client, no build step' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 10/15'
```

  Expected: one commit carrying both trailers.

---

### Task 11: Viewer purity wall

**Files:**
- Create: `plugins/tribe/scripts/viewer/structure.test.ts`

**Interfaces produced:** none — this task is the executable form of spec D14, modelled on
`plugins/tribe/scripts/runner/structure.test.ts` (read it first; reuse its `walk`, `codeOf`,
`allImportsOf`, `valueImportsOf` helper shapes rather than inventing new ones). Adapt the
directory roles to the viewer: `core/` is pure, `adapters/*.adapter.ts` own every world import,
`serve.ts` is the composition root, `client/` is browser code and is exempt from the Node-module
ban but must import nothing.

- [x] **Step 1: Write the failing test.** Create `structure.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = import.meta.dir;
const WORLD = ['fs', 'node:fs', 'node:fs/promises', 'child_process', 'node:child_process', 'http', 'node:http', 'https', 'node:https'];

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(join(ROOT, dir))) {
    if (entry === 'node_modules') continue;
    const rel = `${dir}/${entry}`;
    if (statSync(join(ROOT, rel)).isDirectory()) { out.push(...walk(rel)); continue; }
    if (!entry.endsWith('.ts') || entry.endsWith('.test.ts')) continue;
    out.push(rel);
  }
  return out;
}
const codeOf = (f: string) => readFileSync(join(ROOT, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const valueImportsOf = (f: string) => [...codeOf(f).replace(/import\s+type\s[^;]+;/gs, '').matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1] as string);

describe('viewer structural contract', () => {
  test('core/** never names a world-touching module, in any quote form', () => {
    for (const f of walk('core')) {
      const src = codeOf(f);
      expect({ file: f, bad: WORLD.filter((m) => src.includes(`'${m}'`) || src.includes(`"${m}"`)) }).toEqual({ file: f, bad: [] });
    }
  });

  test('adapters are value-imported only by serve.ts or other adapters', () => {
    for (const f of walk('core')) {
      expect({ file: f, bad: valueImportsOf(f).filter((s) => s.includes('.adapter')) }).toEqual({ file: f, bad: [] });
    }
  });

  test('no ambient process.env read outside adapters/ and serve.ts', () => {
    for (const f of walk('core')) {
      expect({ file: f, bad: /process\.env\b/.test(codeOf(f)) }).toEqual({ file: f, bad: false });
    }
  });

  test('the browser client imports nothing at all', () => {
    const src = readFileSync(join(ROOT, 'client/app.js'), 'utf8');
    expect([...src.matchAll(/^\s*import\s/gm)]).toEqual([]);
  });
});
```

  Run `cd plugins/tribe/scripts/viewer && bun test structure.test.ts`.
  Expected: it fails on the last test until `client/app.js` exists in this worktree (Task 10
  precedes it in the same worktree, so run Task 10 first and expect only genuine violations).

- [x] **Step 2: Implement.** Fix any violation the wall reports in this worktree's own files;
  never weaken an assertion to make it pass.

- [x] **Step 3: Verify.** `cd plugins/tribe/scripts/viewer && bun run check`.
  Expected: green, with the four structural tests passing.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/structure.test.ts docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'test(viewer): executable purity wall for the viewer package' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 11/15'
```

  Expected: one commit carrying both trailers.

---

### Task 12: Adapters and server wiring

**Files:**
- Create: `plugins/tribe/scripts/viewer/adapters/transcript.adapter.ts`
- Create: `plugins/tribe/scripts/viewer/adapters/transcript.adapter.test.ts`
- Create: `plugins/tribe/scripts/viewer/adapters/poller.adapter.ts`
- Create: `plugins/tribe/scripts/viewer/adapters/poller.adapter.test.ts`
- Create: `plugins/tribe/scripts/viewer/README.md`
- Modify: `plugins/tribe/scripts/viewer/serve.ts`
- Modify: `plugins/tribe/scripts/viewer/core/render.ts`

**Interfaces produced:** `TranscriptIo` (`realpathOrNull`, `statFileOrNull`, `readRange`,
`listDirOrEmpty`, `readJsonOrNull`, `readAsset`) and
`createLivePoller({ io, intervalMs, campaign, processId, emit })` returning `{ stop() }`.

This is the integration task: the adapters are the only new filesystem importers, the poller is
the only clock owner, and `serve.ts` wires the routes of spec §4.2. `GET /` keeps calling the
existing `scanTribeRoot`/`deriveStatus`/`renderPage` chain unchanged; `core/render.ts` gains one
`watch live` link per campaign section and nothing else. Streams are capped at
`MAX_LIVE_STREAMS`; the 8-th plus connection gets `503`. Every read failure becomes an `error`
frame, never a thrown request.

- [x] **Step 1: Write the failing tests.** Create both adapter tests; the transcript adapter test
  writes real files under a temp dir and asserts incremental reads:

```ts
import { expect, test } from 'bun:test';
import { mkdtempSync, writeFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createTranscriptIo } from './transcript.adapter.ts';

test('readRange returns exactly the bytes appended since the last offset', () => {
  const dir = mkdtempSync(join(tmpdir(), 'tribe-live-'));
  const file = join(dir, 's.jsonl');
  writeFileSync(file, 'one\n');
  const io = createTranscriptIo();
  const first = io.statFileOrNull(file)!;
  expect(io.readRange(file, 0, first.sizeBytes)).toBe('one\n');
  appendFileSync(file, 'two\n');
  const second = io.statFileOrNull(file)!;
  expect(io.readRange(file, first.sizeBytes, second.sizeBytes)).toBe('two\n');
});

test('a missing file or directory degrades, never throws', () => {
  const io = createTranscriptIo();
  expect(io.statFileOrNull('/nope/none.jsonl')).toBeNull();
  expect(io.listDirOrEmpty('/nope')).toEqual([]);
  expect(io.readJsonOrNull('/nope/x.json')).toBeNull();
  expect(io.realpathOrNull('/nope')).toBeNull();
});

test('a subagent appearing mid-run is listed on the very next poll', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tribe-live-'));
  mkdirSync(join(dir, 'subagents'), { recursive: true });
  const io = createTranscriptIo();
  expect(io.listDirOrEmpty(join(dir, 'subagents'))).toEqual([]);
  writeFileSync(join(dir, 'subagents', 'agent-a1.jsonl'), '');
  expect(io.listDirOrEmpty(join(dir, 'subagents'))).toEqual(['agent-a1.jsonl']);
});
```

  The poller test injects a fake `TranscriptIo` plus a controllable tick and asserts that a
  growing file produces `append` frames and a new sidecar produces a fresh `processes` frame.
  Run `cd plugins/tribe/scripts/viewer && bun test adapters`.
  Expected: both files fail to resolve their modules.

- [x] **Step 2: Implement** the two adapters, the `README.md`, the `serve.ts` routes, and the one
  link in `core/render.ts`. `serve.ts` reads the two client assets once at startup and serves
  them from memory with correct content types.

- [x] **Step 3: Verify.** Run the check, then drive the real server against the campaign home
  that already exists on this machine:

```sh
cd plugins/tribe/scripts/viewer && bun run check
bun serve.ts --port 4399 &
sleep 1
curl -s http://127.0.0.1:4399/healthz
curl -s 'http://127.0.0.1:4399/api/processes?repo=-Users-hip-repo-wiki-harness&slug=wiki-harness-extraction' | head -c 400
curl -s http://127.0.0.1:4399/ | grep -c 'watch live'
kill %1
```

  Expected: `bun run check` green; `/healthz` returns the health JSON; `/api/processes` lists the
  card session nodes with their subagents; the status page contains at least one live link.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(viewer): live routes, transcript adapter and SSE poller' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 12/15'
```

  Expected: one commit carrying both trailers.

---

### Task 13: Runner auto-start

**Files:**
- Create: `plugins/tribe/scripts/runner/core/viewer-launch.ts`
- Create: `plugins/tribe/scripts/runner/core/viewer-launch.test.ts`
- Create: `plugins/tribe/scripts/runner/adapters/viewer-launch.adapter.ts`
- Modify: `plugins/tribe/scripts/runner/ports/ports.ts`
- Modify: `plugins/tribe/scripts/runner/cli/main.ts`
- Modify: `plugins/tribe/scripts/runner/cli/main.test.ts`

**Interfaces produced:** `decideViewerLaunch(input): ViewerLaunchDecision`,
`viewerUrlFor(homeDir, port)`, `campaignKeyOf(homeDir)`, and `ViewerPort` in `ports/ports.ts`.

Spec D11 and D12. `decideViewerLaunch` is pure and takes `{ dryRun, disabled, port, homeDir,
entryPath, entryExists, probeOk }`, returning `{ kind: 'skip' | 'reuse' | 'spawn', url, argv,
note }`. The adapter performs the `/healthz` probe and the detached spawn
(`detached: true`, `stdio: 'ignore'`, then `unref()`), and is the only file naming
`node:child_process`. `cli/main.ts` adds `--viewer-port` and `--no-viewer` to `KNOWN_FLAGS`,
calls the adapter inside a `try`/`catch` before `runLoop`, and prints one line. The runner's
`structure.test.ts` is **not modified** and must stay green.

- [x] **Step 1: Write the failing test.** Create `core/viewer-launch.test.ts`:

```ts
import { expect, test } from 'bun:test';
import { campaignKeyOf, decideViewerLaunch, viewerUrlFor } from './viewer-launch.ts';

const home = '/Users/hip/.tribe/-Users-hip-repo-x/campaigns/my-campaign';
const base = { dryRun: false, disabled: false, port: 4321, homeDir: home, entryPath: '/p/viewer/serve.ts', entryExists: true, probeOk: false };

test('the campaign key and URL derive from --home alone, with nothing persisted (card D5)', () => {
  expect(campaignKeyOf(home)).toEqual({ repoKey: '-Users-hip-repo-x', slug: 'my-campaign' });
  expect(viewerUrlFor(home, 4321)).toBe('http://127.0.0.1:4321/live?repo=-Users-hip-repo-x&slug=my-campaign');
});

test('a dry run never spawns and never probes', () => {
  expect(decideViewerLaunch({ ...base, dryRun: true }).kind).toBe('skip');
});

test('an already-serving viewer is reused, not duplicated (card D6)', () => {
  const d = decideViewerLaunch({ ...base, probeOk: true });
  expect(d.kind).toBe('reuse');
  expect(d.url).toBe(viewerUrlFor(home, 4321));
});

test('otherwise it spawns bun against the sibling entry', () => {
  const d = decideViewerLaunch(base);
  expect(d.kind).toBe('spawn');
  expect(d.argv).toEqual(['bun', '/p/viewer/serve.ts', '--port', '4321']);
});

test('--no-viewer and a missing entry both degrade to skip with a reason', () => {
  expect(decideViewerLaunch({ ...base, disabled: true }).kind).toBe('skip');
  const missing = decideViewerLaunch({ ...base, entryExists: false });
  expect(missing.kind).toBe('skip');
  expect(missing.note).toContain('serve.ts');
});
```

  Add `cli/main.test.ts` cases asserting `parseArgs` accepts `--viewer-port 4399` and
  `--no-viewer` and still rejects an unknown flag by name.
  Run `cd plugins/tribe/scripts/runner && bun test viewer-launch`.
  Expected: fails to resolve `./viewer-launch.ts`.

- [x] **Step 2: Implement** the pure module, the `ViewerPort` interface in `ports/ports.ts`, the
  adapter, and the four-line wiring in `cli/main.ts`.

- [x] **Step 3: Verify.** Run the runner's own check plus a real dry run and a real launch:

```sh
cd plugins/tribe/scripts/runner && bun run check
bun run.ts --repo /Users/hip/repo/todd-skills --model claude-haiku-4-5-20251001 \
  --home /Users/hip/.tribe/-Users-hip-repo-todd-skills/campaigns/does-not-exist --dry-run
```

  Expected: `bun run check` green **including the untouched `structure.test.ts`**; the dry run
  prints its plan or its state error and prints no viewer line and spawns no process.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/runner docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'feat(runner): start the read-only live viewer alongside a campaign run' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 13/15'
```

  Expected: one commit carrying both trailers.

---

### Task 14: Docs, C3 and install verification

**Files:**
- Modify: `plugins/tribe/scripts/runner/README.md`
- Modify: `plugins/tribe/README.md`
- Modify: `plugins/tribe/skills/orchestrate-campaign/SKILL.md`
- Modify: `.c3/c3-2-plugins/c3-215-tribe.md`
- Modify: `plugins/tribe/scripts/viewer/README.md`

Progressive disclosure: every folder this branch touched gets its docs updated in the same PR.
The runner README gains the two new flags in its CLI table and a short "Live viewer" section
replacing the manual Kanna paragraph's role as the only transcript path (the Kanna paragraph
itself stays — the card leaves `list-session-ids.sh` alone). SKILL.md Stage B gains one sentence
saying the runner prints a viewer URL and how to disable it. The C3 `scripts/viewer/serve.ts`
contract row is rewritten to describe both surfaces, and the runner row gains the two flags.

**There is no `c3` executable on this machine.** The C3 runtime is `c3x`, invoked through the c3
skill's own wrapper. Resolve it once and reuse it; if the wrapper is not found, stop and report
`NEEDS_CONTEXT` rather than hand-editing any seal:

```sh
C3X="$(ls -d "$HOME"/.claude/plugins/cache/c3-skill-marketplace/c3-skill/*/skills/c3/bin/c3x.sh | tail -1)"
[ -f "$C3X" ] || { echo 'c3x wrapper not found'; exit 1; }
c3x() { C3X_MODE=agent bash "$C3X" "$@"; }
```

**Inherited state, measured on `master` at `5e8c095` before any change:** `c3x check` already
fails with two unrelated component errors (`c3-213` and `c3-216`, ungrounded Derived-Materials
derivations) and `c3x check --only c3-215` already reports canonical markdown drift. Repair
`c3-215` only. Never touch `c3-213` or `c3-216`; record both, before and after, in the PR body.

- [x] **Step 1: Write the failing check.** Capture the inherited baseline first, then the two
  documentation gaps this task closes:

```sh
c3x check > /tmp/c3-before.txt 2>&1 || true
c3x check --only c3-215 || true
grep -c 'viewer-port' plugins/tribe/scripts/runner/README.md || true
grep -c 'app.js' plugins/tribe/scripts/viewer/README.md || true
```

  Expected before the edits: the baseline file records exactly the two inherited errors,
  `--only c3-215` reports canonical markdown drift, and both `grep -c` calls report `0`.

- [x] **Step 2: Implement** the five documentation edits, then bring `c3-215` back into sync with
  `c3x repair` (never by hand-editing a seal). Confirm `install.sh` needs no change: `scripts/`
  is deliberately skipped (`install.sh:119-121`) and this branch adds no new agent, skill, rule
  or canvas — record that finding in the PR body rather than silently doing nothing.

- [x] **Step 3: Verify.**

```sh
c3x check --only c3-215
c3x check > /tmp/c3-after.txt 2>&1 || true
diff /tmp/c3-before.txt /tmp/c3-after.txt || true
bash plugins/tribe/scripts/tests/test-fresh-machine.sh
grep -c 'viewer-port' plugins/tribe/scripts/runner/README.md
```

  Expected: `--only c3-215` clean; the before/after diff shows the `c3-215` drift resolved and
  the two inherited `c3-213`/`c3-216` errors unchanged; the fresh-machine harness passes; and the
  flag is documented at least once.

- [x] **Step 4: Commit**

```sh
git add plugins/tribe/README.md plugins/tribe/scripts/runner/README.md plugins/tribe/scripts/viewer/README.md plugins/tribe/skills/orchestrate-campaign/SKILL.md .c3 docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'docs(tribe): document the campaign live viewer across readme, skill and c3' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 14/15'
```

  Expected: one commit carrying both trailers.

---

### Task 15: Opt-in end-to-end run and evidence

**Files:**
- Create: `plugins/tribe/scripts/viewer/e2e/live-viewer.e2e.test.ts`
- Create: `plugins/tribe/scripts/viewer/e2e/README.md`
- Create: `docs/superpowers/evidence/2026-09-02-campaign-live-viewer/commands.md`

Card D4 and G5. Gated by `TRIBE_VIEWER_E2E=1` so a plain `bun test` never runs it. It creates a
throwaway target repo under a temp dir with `git init` and **no git remote**, so opening a PR on
a real remote is impossible; authors a one-card campaign whose plan is trivial but whose brief
forces the executor to dispatch at least one subagent; runs the real `run.ts` with
`--model claude-haiku-4-5-20251001` and a short `--session-timeout`; then asserts through the
viewer that the parent session and at least one subagent are visible and that the tail latency
stays inside the budget. Every wait is bounded in TypeScript (`AbortSignal.timeout` or a deadline
loop) — this machine has no `timeout` binary.

- [ ] **Step 1: Write the failing test.** Create `e2e/live-viewer.e2e.test.ts`:

```ts
import { expect, test } from 'bun:test';

const ENABLED = process.env.TRIBE_VIEWER_E2E === '1';

test.skipIf(!ENABLED)('a real haiku campaign renders parent and subagent, tailed inside 2s', async () => {
  const { runCampaignFixture } = await import('./harness.ts');
  const run = await runCampaignFixture({ model: 'claude-haiku-4-5-20251001', sessionTimeout: '6m' });
  try {
    const processes = await run.waitForProcesses((nodes) =>
      nodes.some((n) => n.kind === 'session') && nodes.some((n) => n.kind === 'subagent'), 300_000);
    expect(processes.filter((n) => n.kind === 'subagent').length).toBeGreaterThanOrEqual(1);

    const latencies = await run.measureAppendLatencies(5, 120_000);
    const worst = Math.max(...latencies);
    expect(worst).toBeLessThanOrEqual(2000);

    await run.writeEvidence({ processes, latencies, worst });
  } finally {
    await run.stop();
  }
}, 900_000);
```

  Run `cd plugins/tribe/scripts/viewer && bun test e2e/`.
  Expected: the test is reported as skipped (no `TRIBE_VIEWER_E2E`), and with the variable set it
  fails because `./harness.ts` does not exist.

- [ ] **Step 2: Implement** `e2e/harness.ts`: temp repo creation, campaign home authoring, the
  detached `run.ts` spawn, an SSE client built on `fetch` (verified working under Bun 1.3.14),
  latency measurement as `sseArrivalMs` minus the transcript file's `mtimeMs` for the bytes that
  produced the frame, and `writeEvidence` emitting `latency.json` and `processes.json` under
  `docs/superpowers/evidence/2026-09-02-campaign-live-viewer/`. Screenshots come from the
  machine's installed Chrome and are skipped with a recorded reason when it is absent:

```sh
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
  --screenshot="docs/superpowers/evidence/2026-09-02-campaign-live-viewer/after-live-parent.png" \
  --window-size=1600,1200 --virtual-time-budget=8000 \
  "http://127.0.0.1:4399/live?repo=<repoKey>&slug=<slug>"
```

- [ ] **Step 3: Verify.**

```sh
cd plugins/tribe/scripts/viewer && bun test e2e/
TRIBE_VIEWER_E2E=1 bun test e2e/
ls docs/superpowers/evidence/2026-09-02-campaign-live-viewer/
```

  Expected: skipped without the variable; with it, the parent and at least one subagent are
  asserted present, the worst measured latency is at or under 2000 ms, and the evidence
  directory lists `latency.json`, `processes.json`, `commands.md` and the captured screenshots.

- [ ] **Step 4: Commit**

```sh
git add plugins/tribe/scripts/viewer/e2e docs/superpowers/evidence/2026-09-02-campaign-live-viewer docs/superpowers/plans/2026-09-02-campaign-live-viewer.md
git commit -m 'test(viewer): opt-in haiku end-to-end proving live parent and subagent rendering' -m $'Tribe-Card: campaign-live-viewer\nTribe-Task: 15/15'
```

  Expected: one commit carrying both trailers, and the evidence files committed alongside it.
