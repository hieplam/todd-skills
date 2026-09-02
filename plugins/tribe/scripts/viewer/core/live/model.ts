// core/live/model.ts — the single contract both tracks compile against.

export interface ProcessNode {
  id: string; // "card:<cardId>" | "agent:<cardId>:<agentId>"
  kind: 'session' | 'subagent';
  cardId: string;
  agentId: string | null;
  agentType: string | null; // e.g. "tribe:hunter"; null when meta is unreadable
  label: string; // meta.description, else the card id
  parentId: string | null; // ProcessNode.id of the parent (D3)
  depth: number;
  status: 'active' | 'idle' | 'done' | 'missing';
  startedAt: string | null;
  lastActivityAt: string | null;
  sizeBytes: number;
  toolUseId: string | null; // links a parent tool_call to this subagent
  transcriptPath: string;
}

export type EventKind =
  | 'user_prompt'
  | 'assistant_text'
  | 'thinking'
  | 'tool_call'
  | 'tool_result'
  | 'error'
  | 'result';

export interface TranscriptEvent {
  seq: number;
  kind: EventKind;
  timestamp: string | null;
  html: string; // already escaped by the pure core (D6)
  toolName?: string;
  toolUseId?: string;
  isError?: boolean;
}

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

export interface SseFrame {
  event: SseEventName;
  data: unknown;
}
