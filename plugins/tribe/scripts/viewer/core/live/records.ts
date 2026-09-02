/**
 * Tolerant JSONL transcript reader (spec §1.1, card D7). Pure: takes already
 * read lines and turns them into records, never touching the filesystem
 * itself. A line that fails to parse is never thrown — it is counted in
 * `skipped` and dropped.
 */

export interface TranscriptRecord {
  type: string;
  uuid?: string;
  parentUuid?: string;
  sessionId?: string;
  timestamp?: string;
  cwd?: string;
  message?: unknown;
  toolUseResult?: unknown;
  isSidechain?: boolean;
  agentId?: string;
}

const MESSAGE_TYPES = new Set(['assistant', 'user', 'system']);

export function parseRecordLines(lines: string[]): { records: TranscriptRecord[]; skipped: number } {
  const records: TranscriptRecord[] = [];
  let skipped = 0;
  for (const line of lines) {
    const record = parseLine(line);
    if (record === null) {
      skipped += 1;
      continue;
    }
    records.push(record);
  }
  return { records, skipped };
}

function parseLine(line: string): TranscriptRecord | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const obj = parsed as Record<string, unknown>;
  if (typeof obj.type !== 'string') return null;

  const record: TranscriptRecord = { type: obj.type };
  const sessionId = obj.sessionId ?? obj.session_id;
  if (typeof sessionId === 'string') record.sessionId = sessionId;
  if (typeof obj.uuid === 'string') record.uuid = obj.uuid;
  if (typeof obj.parentUuid === 'string') record.parentUuid = obj.parentUuid;
  if (typeof obj.timestamp === 'string') record.timestamp = obj.timestamp;
  if (typeof obj.cwd === 'string') record.cwd = obj.cwd;
  if ('message' in obj) record.message = obj.message;
  if ('toolUseResult' in obj) record.toolUseResult = obj.toolUseResult;
  if (typeof obj.isSidechain === 'boolean') record.isSidechain = obj.isSidechain;
  if (typeof obj.agentId === 'string') record.agentId = obj.agentId;
  return record;
}

export function isMessageRecord(record: TranscriptRecord): boolean {
  return MESSAGE_TYPES.has(record.type);
}
