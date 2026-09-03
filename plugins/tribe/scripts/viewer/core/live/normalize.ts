/**
 * Record normalizer (card G1, spec D6/D7). Pure: turns already-parsed
 * `TranscriptRecord[]` into an append-only sequence of `TranscriptEvent`s
 * plus `patches` for `tool_result`s that arrive after their `tool_call` was
 * already emitted (Kanna's pending-map idea, adapted to an append-only
 * wire). Everything that becomes HTML is routed through `markdown.ts` --
 * this module never hand-rolls escaping and never renders a raw JSON line.
 *
 * `seq` stays monotonic across calls: pass the returned `state` back in on
 * the next tick. `pending` maps a `tool_use` id to the `seq` of its call
 * event so a later `tool_result` can be paired without re-emitting it.
 */
import { escapeHtml, renderMarkdown } from './markdown.ts';
import { isMessageRecord, type TranscriptRecord } from './records.ts';
import type { EventKind, TranscriptEvent } from './model.ts';

export interface NormalizeState {
  seq: number;
  pending: Map<string, number>;
}

export interface NormalizePatch {
  seq: number;
  html: string;
  isError: boolean;
}

export interface NormalizeOutcome {
  state: NormalizeState;
  events: TranscriptEvent[];
  patches: NormalizePatch[];
}

export function initialNormalizeState(): NormalizeState {
  return { seq: 0, pending: new Map() };
}

export function normalizeRecords(state: NormalizeState, records: TranscriptRecord[]): NormalizeOutcome {
  let seq = state.seq;
  const pending = new Map(state.pending);
  const events: TranscriptEvent[] = [];
  const patches: NormalizePatch[] = [];

  const pushEvent = (kind: EventKind, timestamp: string | undefined, html: string, extra?: Partial<TranscriptEvent>): TranscriptEvent => {
    seq += 1;
    const event: TranscriptEvent = { seq, kind, timestamp: timestamp ?? null, html, ...extra };
    events.push(event);
    return event;
  };

  for (const record of records) {
    if (!isMessageRecord(record)) continue;
    const message = asRecord(record.message);
    if (message === null) continue;

    if (record.type === 'user') {
      normalizeUserMessage(message, record.timestamp, pushEvent, patches, pending);
    } else if (record.type === 'assistant') {
      normalizeAssistantMessage(message, record.timestamp, pushEvent, pending);
    }
    // 'system' rows: card D7 -- this CLI writes none; nothing to normalize
    // without a concrete shape to render.
  }

  return { state: { seq, pending }, events, patches };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function asBlocks(content: unknown): Record<string, unknown>[] {
  if (!Array.isArray(content)) return [];
  return content.filter((block): block is Record<string, unknown> => typeof block === 'object' && block !== null);
}

function contentToText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        if (typeof block !== 'object' || block === null) return '';
        const text = (block as Record<string, unknown>).text;
        return typeof text === 'string' ? text : '';
      })
      .filter((text) => text.length > 0)
      .join('\n');
  }
  return '';
}

function summarizeInput(input: unknown): string {
  if (input === undefined) return '';
  try {
    return JSON.stringify(input) ?? '';
  } catch {
    return '';
  }
}

function renderToolCallHtml(name: string, input: unknown): string {
  const summary = summarizeInput(input);
  const code = summary.length > 0 ? ` <code>${escapeHtml(summary)}</code>` : '';
  return `<p><strong>${escapeHtml(name)}</strong>${code}</p>`;
}

function renderToolResultHtml(content: unknown): string {
  return renderMarkdown(contentToText(content));
}

function normalizeUserMessage(
  message: Record<string, unknown>,
  timestamp: string | undefined,
  pushEvent: (kind: EventKind, timestamp: string | undefined, html: string, extra?: Partial<TranscriptEvent>) => TranscriptEvent,
  patches: NormalizePatch[],
  pending: Map<string, number>,
): void {
  const content = message.content;

  if (typeof content === 'string') {
    pushEvent('user_prompt', timestamp, renderMarkdown(content));
    return;
  }

  for (const block of asBlocks(content)) {
    if (block.type !== 'tool_result') continue;
    const toolUseId = typeof block.tool_use_id === 'string' ? block.tool_use_id : null;
    if (toolUseId === null) continue;
    const callSeq = pending.get(toolUseId);
    // No matching call in view (e.g. the call happened before this window
    // started) -- drop it rather than appending an orphaned raw dump.
    if (callSeq === undefined) continue;
    pending.delete(toolUseId);
    patches.push({ seq: callSeq, html: renderToolResultHtml(block.content), isError: block.is_error === true });
  }
}

function normalizeAssistantMessage(
  message: Record<string, unknown>,
  timestamp: string | undefined,
  pushEvent: (kind: EventKind, timestamp: string | undefined, html: string, extra?: Partial<TranscriptEvent>) => TranscriptEvent,
  pending: Map<string, number>,
): void {
  const content = message.content;
  const blocks = typeof content === 'string' ? [{ type: 'text', text: content }] : asBlocks(content);

  for (const block of blocks) {
    if (block.type === 'text' && typeof block.text === 'string') {
      pushEvent('assistant_text', timestamp, renderMarkdown(block.text));
    } else if (block.type === 'thinking' && typeof block.thinking === 'string') {
      // `signature` is intentionally never read here -- card G1: thinking
      // renders collapsed, its signature is never rendered.
      pushEvent('thinking', timestamp, renderMarkdown(block.thinking));
    } else if (block.type === 'tool_use') {
      const toolName = typeof block.name === 'string' ? block.name : 'tool';
      const toolUseId = typeof block.id === 'string' ? block.id : undefined;
      const event = pushEvent('tool_call', timestamp, renderToolCallHtml(toolName, block.input), {
        toolName,
        toolUseId,
      });
      if (toolUseId !== undefined) pending.set(toolUseId, event.seq);
    }
  }
}
