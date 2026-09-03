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

// F30: the session node's `done` branch (cardStatus !== 'running') was
// never exercised by any test in this file.
test('F30: a non-running card yields a done session node', () => {
  const nodes = deriveProcesses({ ...base, cardStatus: 'done', subagents: [] });
  expect(nodes[0]!.status).toBe('done');
});

// F34: a subagent naming a parentAgentId that is not present in the SAME
// batch -- the ordinary race of discovering a child before its parent --
// hangs off the session node instead of pointing at a dangling id.
test('F34: an orphaned parentAgentId hangs off the session node', () => {
  const nodes = deriveProcesses({ ...base, subagents: [
    { agentId: 'orphan', meta: { agentType: 'x', parentAgentId: 'ghost', spawnDepth: 2 }, sizeBytes: 1, mtimeIso: base.nowIso, firstSeenIso: base.nowIso },
  ] });
  const ids = new Set(nodes.map((n) => n.id));
  const orphan = nodes.find((n) => n.agentId === 'orphan')!;
  expect(ids.has(orphan.parentId as string)).toBe(true);
  expect(orphan.parentId).toBe('card:T20');
});

// F34: a sidecar naming itself as its own parent (a 1-node cycle) must
// not produce a self-referential parentId.
test('F34: a self-referential parentAgentId hangs off the session node', () => {
  const nodes = deriveProcesses({ ...base, subagents: [
    { agentId: 'a1', meta: { agentType: 'x', parentAgentId: 'a1', spawnDepth: 1 }, sizeBytes: 1, mtimeIso: base.nowIso, firstSeenIso: base.nowIso },
  ] });
  const a1 = nodes.find((n) => n.agentId === 'a1')!;
  expect(a1.parentId).not.toBe(a1.id);
  expect(a1.parentId).toBe('card:T20');
});
