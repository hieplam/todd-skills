/**
 * Process list and status derivation (spec D3). Pure: turns already-read
 * subagent sidecars, stats and the parent transcript's resolved tool_use ids
 * into an ordered `ProcessNode[]`. Nothing here touches the filesystem or
 * the clock -- `nowIso` arrives as an argument (pure-core rule).
 *
 * Tree: `spawnDepth: 1` entries hang off the session node; deeper ones hang
 * off their `parentAgentId`. A `meta: null` sidecar (unreadable/missing)
 * never drops the entry -- it degrades to `agentType: null` and a generic
 * label, and still gets a place in the tree.
 *
 * Status order: `missing` (no stat -- `mtimeIso` is null), then `done`
 * (the session's card is no longer running, or the subagent's spawning
 * `tool_use` already has a matching result), then `active` (`mtimeIso`
 * within `ACTIVE_WINDOW_MS` of `nowIso`), else `idle`.
 */
import { ACTIVE_WINDOW_MS, type ProcessNode } from './model.ts';

export interface SubagentEntry {
  agentId: string;
  meta: { agentType?: string; description?: string; toolUseId?: string; parentAgentId?: string; spawnDepth?: number } | null;
  sizeBytes: number;
  mtimeIso: string | null;
  firstSeenIso: string | null;
}

export interface DeriveProcessesInput {
  cardId: string;
  sessionId: string;
  transcriptPath: string;
  sessionStat: { sizeBytes: number; mtimeIso: string | null };
  subagentsDir: string;
  subagents: SubagentEntry[];
  resolvedToolUseIds: Set<string>;
  cardStatus: string;
  nowIso: string;
}

function deriveStatus(resolved: boolean, mtimeIso: string | null, nowIso: string): ProcessNode['status'] {
  if (mtimeIso === null) return 'missing';
  if (resolved) return 'done';
  const age = Date.parse(nowIso) - Date.parse(mtimeIso);
  return age <= ACTIVE_WINDOW_MS ? 'active' : 'idle';
}

function agentNodeId(cardId: string, agentId: string): string {
  return `agent:${cardId}:${agentId}`;
}

function compareEntries(a: SubagentEntry, b: SubagentEntry): number {
  const aKey = a.firstSeenIso ?? '';
  const bKey = b.firstSeenIso ?? '';
  if (aKey !== bKey) return aKey < bKey ? -1 : 1;
  return a.agentId < b.agentId ? -1 : a.agentId > b.agentId ? 1 : 0;
}

export function deriveProcesses(input: DeriveProcessesInput): ProcessNode[] {
  const sessionId = `card:${input.cardId}`;

  const sessionNode: ProcessNode = {
    id: sessionId,
    kind: 'session',
    cardId: input.cardId,
    agentId: null,
    agentType: null,
    label: input.cardId,
    parentId: null,
    depth: 0,
    status: deriveStatus(input.cardStatus !== 'running', input.sessionStat.mtimeIso, input.nowIso),
    startedAt: null,
    lastActivityAt: input.sessionStat.mtimeIso,
    sizeBytes: input.sessionStat.sizeBytes,
    toolUseId: null,
    transcriptPath: input.transcriptPath,
  };

  const knownAgentIds = new Set(input.subagents.map((entry) => entry.agentId));

  // Named-parent lookup restricted to references that resolve inside the
  // SAME batch: an entry whose parentAgentId is absent or names an id not
  // present here terminates at the session node immediately (the orphan
  // case, F34). Used below to detect cycles of ANY length, not just the
  // 1-node self-reference.
  const namedParentOf = new Map<string, string>();
  for (const entry of input.subagents) {
    const named = entry.meta?.parentAgentId;
    if (named && knownAgentIds.has(named)) namedParentOf.set(entry.agentId, named);
  }

  // Walk the named-parent chain from `agentId` toward the session root.
  // A chain that terminates (reaches an id with no further named parent)
  // reaches the session. A chain that revisits an id it has already seen
  // is a cycle of some length N >= 1 (self-reference included) and can
  // never reach the session, no matter how many nodes it involves (F36).
  // The `visited` set bounds the walk to at most `knownAgentIds.size + 1`
  // steps even on malformed input, so this can never loop forever.
  function reachesSession(agentId: string): boolean {
    const visited = new Set<string>([agentId]);
    let current = namedParentOf.get(agentId);
    while (current !== undefined) {
      if (visited.has(current)) return false;
      visited.add(current);
      current = namedParentOf.get(current);
    }
    return true;
  }

  const subagentNodes = [...input.subagents]
    .sort(compareEntries)
    .map((entry) => {
      const meta = entry.meta;
      const toolUseId = meta?.toolUseId ?? null;
      const resolved = toolUseId !== null && input.resolvedToolUseIds.has(toolUseId);
      // A subagent whose parentAgentId does not name another entry in the
      // SAME batch, or whose named-parent chain loops back on itself
      // instead of reaching the session root -- a 1-node self-reference
      // or a cycle of any length among several sidecars -- hangs off the
      // session node. This keeps `parentId` total into the returned array
      // and closes the missing-parent and every-length cycle cases
      // (F34, F36).
      const namedParentId = namedParentOf.get(entry.agentId);
      const parentId =
        namedParentId && reachesSession(entry.agentId) ? agentNodeId(input.cardId, namedParentId) : sessionId;

      const node: ProcessNode = {
        id: agentNodeId(input.cardId, entry.agentId),
        kind: 'subagent',
        cardId: input.cardId,
        agentId: entry.agentId,
        agentType: meta?.agentType ?? null,
        label: meta?.description ?? `agent ${entry.agentId}`,
        parentId,
        depth: meta?.spawnDepth ?? 1,
        status: deriveStatus(resolved, entry.mtimeIso, input.nowIso),
        startedAt: entry.firstSeenIso,
        lastActivityAt: entry.mtimeIso,
        sizeBytes: entry.sizeBytes,
        toolUseId,
        transcriptPath: `${input.subagentsDir}/agent-${entry.agentId}.jsonl`,
      };
      return node;
    });

  return [sessionNode, ...subagentNodes];
}
