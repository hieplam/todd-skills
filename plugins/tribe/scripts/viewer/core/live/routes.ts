// core/live/routes.ts — pure URL -> LiveRoute parsing and SSE frame encoding.
// No dependency on the outside world: takes a URL string, returns a value.

import type { LiveRoute, SseFrame } from './model.ts';

const IDENTIFIER_PATTERN = /^[A-Za-z0-9._-]+$/;
const DOTS_ONLY_PATTERN = /^\.+$/;

// Fixed allowlist — assets are never resolved by joining the request path.
const ASSET_NAMES = new Set(['app.js', 'app.css'] as const);

function isValidIdentifier(value: string | null): value is string {
  return value !== null && IDENTIFIER_PATTERN.test(value) && !DOTS_ONLY_PATTERN.test(value);
}

// `process` selects either the campaign's own session (`card:<cardId>`) or one of its
// subagents (`agent:<cardId>:<agentId>`) — the two `ProcessNode.id` shapes core/live/model.ts
// documents. `:` is never in IDENTIFIER_PATTERN's character class, so each segment below is
// validated with the exact same hardened identifier check `repo`/`slug` already use (F43): `/`
// is unrepresentable in a valid segment, which makes path traversal through this parameter
// structurally impossible rather than merely filtered.
const CARD_PROCESS_PATTERN = /^card:([A-Za-z0-9._-]+)$/;
const AGENT_PROCESS_PATTERN = /^agent:([A-Za-z0-9._-]+):([A-Za-z0-9._-]+)$/;

function isValidProcessId(value: string): boolean {
  const cardMatch = CARD_PROCESS_PATTERN.exec(value);
  if (cardMatch) return !DOTS_ONLY_PATTERN.test(cardMatch[1]!);
  const agentMatch = AGENT_PROCESS_PATTERN.exec(value);
  if (agentMatch) return !DOTS_ONLY_PATTERN.test(agentMatch[1]!) && !DOTS_ONLY_PATTERN.test(agentMatch[2]!);
  return false;
}

export function parseLiveRoute(url: string): LiveRoute {
  const parsed = new URL(url);
  const { pathname, searchParams } = parsed;

  if (pathname === '/') {
    return { kind: 'status' };
  }

  if (pathname === '/healthz') {
    return { kind: 'health' };
  }

  if (pathname === '/live' || pathname === '/events' || pathname === '/api/processes') {
    const repoKey = searchParams.get('repo');
    const slug = searchParams.get('slug');
    if (!isValidIdentifier(repoKey) || !isValidIdentifier(slug)) {
      return { kind: 'bad_request', reason: 'repo and slug must each match ^[A-Za-z0-9._-]+$' };
    }

    if (pathname === '/api/processes') {
      return { kind: 'processes', repoKey, slug };
    }

    const rawProcessId = searchParams.get('process');
    if (rawProcessId !== null && rawProcessId !== '' && !isValidProcessId(rawProcessId)) {
      return {
        kind: 'bad_request',
        reason: 'process must match ^card:[A-Za-z0-9._-]+$ or ^agent:[A-Za-z0-9._-]+:[A-Za-z0-9._-]+$',
      };
    }
    const processId = rawProcessId === null || rawProcessId === '' ? null : rawProcessId;

    return pathname === '/live'
      ? { kind: 'live', repoKey, slug, processId }
      : { kind: 'events', repoKey, slug, processId };
  }

  const assetName = pathname.slice(1);
  if (ASSET_NAMES.has(assetName as 'app.js' | 'app.css')) {
    return { kind: 'asset', name: assetName as 'app.js' | 'app.css' };
  }

  return { kind: 'not_found' };
}

// JSON.stringify returns `undefined` (not a throw) for a bare function or symbol, and throws
// outright for a BigInt or a cyclic object. `data` is typed `unknown`, so any of those can reach
// here — this boundary must be total: it always returns a well-formed frame, never propagates.
function serializeFrameData(value: unknown): string {
  try {
    const serialized = JSON.stringify(value === undefined ? null : value);
    if (serialized === undefined) {
      return JSON.stringify({ error: 'unserializable payload' });
    }
    return serialized;
  } catch {
    return JSON.stringify({ error: 'unserializable payload' });
  }
}

export function encodeSseFrame(frame: SseFrame): string {
  const data = serializeFrameData(frame.data).replace(/\r?\n/g, '');
  return `event: ${frame.event}\ndata: ${data}\n\n`;
}
