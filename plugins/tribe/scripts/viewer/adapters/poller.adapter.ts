// adapters/poller.adapter.ts — the ONLY clock owner in the viewer (spec §4/§7). Every "run this
// again in 400ms" and "what time is it" decision lives here, behind an injectable seam
// (`schedule`/`now`) so a test can drive the poller with a controllable tick instead of a real
// timer. Every filesystem access goes through the injected `TranscriptIo` — this file names no
// `node:fs`/`node:child_process`/`node:http` import of its own.
//
// One poller instance owns exactly one SSE connection's worth of state: it always tails the
// campaign's parent (session) transcript — that is the ONLY place a subagent's spawning
// `tool_use` gets resolved (spec D3) — and, when the caller selected a different process, tails
// that process's own transcript too. `deriveProcesses`/`normalizeRecords`/`advanceTail` do every
// decision; this file only feeds them already-read bytes and turns their output into SSE frames.
import { join, resolve, sep } from 'node:path';
import { advanceTail, initialTailState, type TailState } from '../core/live/tail.ts';
import { parseRecordLines } from '../core/live/records.ts';
import { initialNormalizeState, normalizeRecords, type NormalizeState, type NormalizePatch } from '../core/live/normalize.ts';
import { deriveProcesses, type SubagentEntry } from '../core/live/processes.ts';
import { agentIdFromFileName, metaFileNameFor } from '../core/live/paths.ts';
import { MAX_SNAPSHOT_EVENTS, type ProcessNode, type SseFrame, type TranscriptEvent } from '../core/live/model.ts';
import type { TranscriptIo } from './transcript.adapter.ts';

// Exported so `core/live/model.test.ts` can assert `SSE_IDLE_TIMEOUT_SECONDS` (serve.ts's
// Bun.serve idleTimeout) actually exceeds this interval (F55) — the two constants must never
// drift apart silently.
export const PING_INTERVAL_MS = 15_000;

export interface LiveCampaignContext {
  cardId: string;
  sessionId: string;
  transcriptPath: string;
  subagentsDir: string;
  cardStatus: string;
}

export interface CreateLivePollerInput {
  io: TranscriptIo;
  intervalMs: number;
  campaign: LiveCampaignContext;
  processId: string | null;
  emit: (frame: SseFrame) => void;
  /** Injected clock — defaults to the real one. The only reason a caller would override it is a
   * test wanting a deterministic `nowIso` without waiting on wall time. */
  now?: () => string;
  /** Injected scheduler — defaults to real `setInterval`/`clearInterval`. This is the seam a
   * test uses to drive the poller with a controllable tick. */
  schedule?: (fn: () => void, ms: number) => { stop: () => void };
}

interface TrackedTranscript {
  path: string;
  tail: TailState;
  normalize: NormalizeState;
  /** Streaming UTF-8 decoder (F44): a multi-byte character can straddle two polls of a file
   * that is actively being appended to. Decoding each `readRange` independently (the old
   * behavior) turns the split character into `U+FFFD` on both sides and loses it permanently.
   * `TextDecoder` is STATEFUL when used with `{ stream: true }` — it withholds an incomplete
   * trailing byte sequence internally and prepends it to the next `decode()` call — so this
   * instance must live here, alongside this track's offset/carry, and never be recreated per
   * read (recreating it per call would throw away exactly the state that makes it work). */
  decoder: TextDecoder;
}

interface PullOutcome {
  events: TranscriptEvent[];
  patches: NormalizePatch[];
}

function freshTrack(path: string): TrackedTranscript {
  return { path, tail: initialTailState(), normalize: initialNormalizeState(), decoder: new TextDecoder('utf-8') };
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function defaultSchedule(fn: () => void, ms: number): { stop: () => void } {
  const handle = setInterval(fn, ms);
  return { stop: () => clearInterval(handle) };
}

/** Reads exactly the bytes `track`'s file grew by since the last call (or nothing, on a
 * shrink/rotate — `advanceTail` resets internally and the NEXT call re-reads from zero, spec
 * D2/D8). A FRESH `track` (offset 0) naturally reads everything already on disk, which is
 * exactly what the connection's first tick needs for the `snapshot` frame. Throws when the file
 * cannot be stat'd at all — the caller turns that into a per-process `error` frame. */
function readNewLines(io: TranscriptIo, track: TrackedTranscript): string[] {
  const stat = io.statFileOrNull(track.path);
  if (stat === null) throw new Error(`transcript not found: ${track.path}`);
  // A shrink/rotate (spec D2/D8) means whatever incomplete byte sequence the decoder was
  // carrying belonged to content that no longer exists at this offset — start it fresh so those
  // stale pending bytes never get prepended to the rewritten file's unrelated bytes.
  if (stat.sizeBytes < track.tail.offset) track.decoder = new TextDecoder('utf-8');
  const bytes = stat.sizeBytes > track.tail.offset ? io.readRange(track.path, track.tail.offset, stat.sizeBytes) : new Uint8Array(0);
  const chunk = track.decoder.decode(bytes, { stream: true });
  // `bytes.length` (F56) — the RAW byte count actually returned by `readRange`, which can be
  // LESS than `stat.sizeBytes - track.tail.offset` asked for (a single `readSync` is not
  // guaranteed to fill its buffer, and the file can shrink between the `stat` and the `read`).
  // `advanceTail` advances the offset by exactly this many bytes, never by `stat.sizeBytes` —
  // trusting the stale stat size instead would silently and permanently skip whatever the read
  // actually missed.
  const advanced = advanceTail(track.tail, chunk, bytes.length, stat.sizeBytes);
  track.tail = advanced.state;
  return advanced.lines;
}

function readSubagentEntries(io: TranscriptIo, subagentsDir: string): SubagentEntry[] {
  const entries: SubagentEntry[] = [];
  for (const name of io.listDirOrEmpty(subagentsDir)) {
    const agentId = agentIdFromFileName(name);
    if (agentId === null) continue;
    const stat = io.statFileOrNull(join(subagentsDir, name));
    const rawMeta = io.readJsonOrNull(join(subagentsDir, metaFileNameFor(agentId)));
    const meta = rawMeta !== null && typeof rawMeta === 'object' ? (rawMeta as SubagentEntry['meta']) : null;
    entries.push({
      agentId,
      meta,
      sizeBytes: stat?.sizeBytes ?? 0,
      mtimeIso: stat?.mtimeIso ?? null,
      firstSeenIso: stat?.birthtimeIso ?? null,
    });
  }
  return entries;
}

function capSnapshot(events: TranscriptEvent[]): { events: TranscriptEvent[]; truncated: boolean } {
  if (events.length <= MAX_SNAPSHOT_EVENTS) return { events, truncated: false };
  return { events: events.slice(events.length - MAX_SNAPSHOT_EVENTS), truncated: true };
}

function agentIdOf(processId: string, cardId: string): string | null {
  const prefix = `agent:${cardId}:`;
  return processId.startsWith(prefix) ? processId.slice(prefix.length) : null;
}

/** Second, independent boundary (F43 layer 2) — refuses to read outside `dir` regardless of
 * what `filePath` was built from. `core/live/routes.ts` already validates `process` so this
 * should never fire in practice, but this endpoint is unauthenticated by design: one layer is a
 * filter, two layers is a boundary. Resolves and normalizes both paths before comparing so
 * `..` segments (however they got there) can never slip through as a false "inside". */
function isWithinDir(dir: string, filePath: string): boolean {
  const normalizedDir = resolve(dir);
  const normalizedFile = resolve(filePath);
  return normalizedFile === normalizedDir || normalizedFile.startsWith(normalizedDir + sep);
}

export function createLivePoller(input: CreateLivePollerInput): { stop: () => void } {
  const { io, intervalMs, campaign, emit } = input;
  const now = input.now ?? (() => new Date().toISOString());
  const schedule = input.schedule ?? defaultSchedule;

  const sessionProcessId = `card:${campaign.cardId}`;
  const effectiveProcessId = input.processId ?? sessionProcessId;
  const isSessionSelected = effectiveProcessId === sessionProcessId;
  const selectedAgentId = isSessionSelected ? null : agentIdOf(effectiveProcessId, campaign.cardId);
  const rawSelectedPath =
    selectedAgentId === null ? null : join(campaign.subagentsDir, `agent-${selectedAgentId}.jsonl`);
  const selectedPath =
    rawSelectedPath !== null && isWithinDir(campaign.subagentsDir, rawSelectedPath) ? rawSelectedPath : null;

  const parentTrack = freshTrack(campaign.transcriptPath);
  const selectedTrack = selectedPath === null ? null : freshTrack(selectedPath);

  // Resolved by walking the PARENT transcript's own tool_call/tool_result pairing (spec D3): a
  // subagent's spawning `tool_use` id counts as resolved the moment the parent transcript
  // records the matching `tool_result` — tracked here so `deriveProcesses` never has to re-scan
  // the whole file itself.
  const seqToToolUseId = new Map<number, string>();
  const resolvedToolUseIds = new Set<string>();

  let lastSubagentEntries: SubagentEntry[] = [];
  let lastProcessesJson: string | null = null;
  let ticksSincePing = 0;
  const pingEveryTicks = Math.max(1, Math.round(PING_INTERVAL_MS / intervalMs));

  function pullParent(): PullOutcome {
    const lines = readNewLines(io, parentTrack);
    if (lines.length === 0) return { events: [], patches: [] };
    const { records } = parseRecordLines(lines);
    const outcome = normalizeRecords(parentTrack.normalize, records);
    parentTrack.normalize = outcome.state;
    for (const event of outcome.events) {
      if (event.toolUseId !== undefined) seqToToolUseId.set(event.seq, event.toolUseId);
    }
    for (const patch of outcome.patches) {
      const toolUseId = seqToToolUseId.get(patch.seq);
      if (toolUseId !== undefined) resolvedToolUseIds.add(toolUseId);
    }
    return outcome;
  }

  function pullSelected(track: TrackedTranscript): PullOutcome {
    const lines = readNewLines(io, track);
    if (lines.length === 0) return { events: [], patches: [] };
    const { records } = parseRecordLines(lines);
    const outcome = normalizeRecords(track.normalize, records);
    track.normalize = outcome.state;
    return outcome;
  }

  function computeProcesses(nowIso: string): ProcessNode[] {
    const sessionStat = io.statFileOrNull(campaign.transcriptPath);
    return deriveProcesses({
      cardId: campaign.cardId,
      sessionId: campaign.sessionId,
      transcriptPath: campaign.transcriptPath,
      sessionStat: { sizeBytes: sessionStat?.sizeBytes ?? 0, mtimeIso: sessionStat?.mtimeIso ?? null },
      subagentsDir: campaign.subagentsDir,
      subagents: lastSubagentEntries,
      resolvedToolUseIds,
      cardStatus: campaign.cardStatus,
      nowIso,
    });
  }

  function emitProcessesIfChanged(force: boolean): void {
    const nodes = computeProcesses(now());
    const serialized = JSON.stringify(nodes);
    if (!force && serialized === lastProcessesJson) return;
    lastProcessesJson = serialized;
    emit({ event: 'processes', data: { processes: nodes } });
  }

  function refreshSubagents(): void {
    try {
      lastSubagentEntries = readSubagentEntries(io, campaign.subagentsDir);
    } catch (err) {
      emit({ event: 'error', data: { message: `listing subagents: ${describeError(err)}` } });
    }
  }

  function runFirstTick(): void {
    refreshSubagents();

    let contentEvents: TranscriptEvent[] = [];
    try {
      const parentOutcome = pullParent();
      if (isSessionSelected) contentEvents = parentOutcome.events;
    } catch (err) {
      emit({ event: 'error', data: { message: `reading session transcript: ${describeError(err)}` } });
    }

    if (!isSessionSelected && selectedTrack !== null) {
      try {
        contentEvents = pullSelected(selectedTrack).events;
      } catch (err) {
        emit({ event: 'error', data: { message: `reading process transcript: ${describeError(err)}` } });
      }
    }

    emitProcessesIfChanged(true);

    const { events, truncated } = capSnapshot(contentEvents);
    emit({
      event: 'snapshot',
      data: {
        processId: effectiveProcessId,
        events,
        truncated,
        nextOffset: (selectedTrack ?? parentTrack).tail.offset,
      },
    });
  }

  function runTick(): void {
    refreshSubagents();

    try {
      const parentOutcome = pullParent();
      if (isSessionSelected && (parentOutcome.events.length > 0 || parentOutcome.patches.length > 0)) {
        emit({
          event: 'append',
          data: {
            processId: effectiveProcessId,
            events: parentOutcome.events,
            patches: parentOutcome.patches,
            nextOffset: parentTrack.tail.offset,
          },
        });
      }
    } catch (err) {
      emit({ event: 'error', data: { message: `reading session transcript: ${describeError(err)}` } });
    }

    if (!isSessionSelected && selectedTrack !== null) {
      try {
        const outcome = pullSelected(selectedTrack);
        if (outcome.events.length > 0 || outcome.patches.length > 0) {
          emit({
            event: 'append',
            data: {
              processId: effectiveProcessId,
              events: outcome.events,
              patches: outcome.patches,
              nextOffset: selectedTrack.tail.offset,
            },
          });
        }
      } catch (err) {
        emit({ event: 'error', data: { message: `reading process transcript: ${describeError(err)}` } });
      }
    }

    emitProcessesIfChanged(false);

    ticksSincePing += 1;
    if (ticksSincePing >= pingEveryTicks) {
      ticksSincePing = 0;
      emit({ event: 'ping', data: { t: now() } });
    }
  }

  runFirstTick();
  const scheduled = schedule(runTick, intervalMs);

  return {
    stop() {
      scheduled.stop();
    },
  };
}
