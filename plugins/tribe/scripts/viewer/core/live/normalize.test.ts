import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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

test('the valid session fixture normalizes into paired, non-raw events (F11b)', () => {
  const path = join(import.meta.dir, '..', '..', 'fixtures', 'session-valid.jsonl');
  const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.length > 0);
  const { records } = parseRecordLines(lines);
  const { events, patches } = normalizeRecords(initialNormalizeState(), records);

  // user prompt, thinking, assistant text, tool call; the tool_result arrives
  // for the same tick's tool_use so it resolves as a patch, not a new event.
  expect(events.map((e) => e.kind)).toEqual(['user_prompt', 'thinking', 'assistant_text', 'tool_call']);
  expect(patches).toHaveLength(1);
  expect(patches[0]!.html).toContain('README.md');
  expect(patches[0]!.isError).toBe(false);

  for (const event of events) {
    expect(event.html).not.toMatch(/^\s*\{/); // never a raw JSON dump
    expect(event.html).not.toContain('FIXTURESIG'); // thinking signature never rendered
  }
});

test('the subagent fixture (isSidechain rows) normalizes without throwing', () => {
  const path = join(import.meta.dir, '..', '..', 'fixtures', 'subagent-valid.jsonl');
  const lines = readFileSync(path, 'utf8').split('\n').filter((line) => line.length > 0);
  const { records } = parseRecordLines(lines);

  expect(records.every((r) => r.isSidechain === true)).toBe(true);
  expect(() => normalizeRecords(initialNormalizeState(), records)).not.toThrow();

  const { events, patches } = normalizeRecords(initialNormalizeState(), records);
  expect(events.length).toBeGreaterThan(0);
  expect(events.map((e) => e.kind)).toEqual(['user_prompt', 'assistant_text', 'tool_call']);
  expect(patches).toHaveLength(1);
  expect(patches[0]!.html).toContain('File written');

  for (const event of events) {
    expect(event.html).not.toMatch(/^\s*\{/);
  }
});
