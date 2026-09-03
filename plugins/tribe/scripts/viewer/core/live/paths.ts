import { join } from 'node:path';

const MAX_SANITIZED_LENGTH = 200;
const AGENT_FILE_NAME_RE = /^agent-(.+)\.jsonl$/;

function djb2Hash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

function hashSuffix(name: string): string {
  // Mirror claude-code/src/utils/sessionStoragePortable.ts: prefer Bun.hash
  // (wyhash) when running under Bun, fall back to djb2 elsewhere. Both encode
  // base36. Cross-runtime stability matters only for paths >200 chars.
  const globalWithBun: { Bun?: { hash: (s: string) => number | bigint } } = globalThis as never;
  const maybeBun = globalWithBun.Bun;
  if (maybeBun && typeof maybeBun.hash === 'function') {
    return maybeBun.hash(name).toString(36);
  }
  return Math.abs(djb2Hash(name)).toString(36);
}

/**
 * Ported verbatim from Kanna's src/server/claude-pty/jsonl-path.adapter.ts:26-41
 * (sanitizePath + encodeCwd), minus the realpath call — that filesystem read
 * belongs to the Task 12 adapter. This module is pure string math only (D1).
 */
export function sanitizeProjectDirName(absPath: string): string {
  const normalized = absPath.normalize('NFC');
  const sanitized = normalized.replace(/[^a-zA-Z0-9]/g, '-');
  if (sanitized.length <= MAX_SANITIZED_LENGTH) return sanitized;
  return `${sanitized.slice(0, MAX_SANITIZED_LENGTH)}-${hashSuffix(normalized)}`;
}

export function projectDirOf(homeDir: string, encodedName: string): string {
  return join(homeDir, '.claude', 'projects', encodedName);
}

export function transcriptPathOf(projectDir: string, sessionId: string): string {
  return join(projectDir, `${sessionId}.jsonl`);
}

export function subagentsDirOf(projectDir: string, sessionId: string): string {
  return join(projectDir, sessionId, 'subagents');
}

export function agentIdFromFileName(name: string): string | null {
  const match = AGENT_FILE_NAME_RE.exec(name);
  return match ? match[1] : null;
}

export function metaFileNameFor(agentId: string): string {
  return `agent-${agentId}.meta.json`;
}
