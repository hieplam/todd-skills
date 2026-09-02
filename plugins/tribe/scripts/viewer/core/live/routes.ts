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

export function encodeSseFrame(frame: SseFrame): string {
  const data = JSON.stringify(frame.data === undefined ? null : frame.data).replace(/\r?\n/g, '');
  return `event: ${frame.event}\ndata: ${data}\n\n`;
}
