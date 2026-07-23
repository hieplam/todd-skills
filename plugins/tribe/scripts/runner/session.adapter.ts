// session.adapter.ts — the runner's ONLY import of `@anthropic-ai/claude-agent-sdk`
// (spec "SDK drift" risk note + the zero-LLM wall). An SDK upgrade touches this file and
// nothing else; every other module reaches a session through the `SessionIO` seam.
// Enforced by structure.test.ts + eslint.config.js, not by this comment.
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SessionMessage, SpawnSessionParams } from './session.ts';

/** The real SDK spawn, wrapping `query()` — used by run.ts to build the production
 * `SessionIO`. Not exercised by unit tests (it would hit the real SDK); the option-building
 * and message-parsing logic it feeds (session.ts) is fully covered without it. */
export function sdkSpawnSession(params: SpawnSessionParams): AsyncIterable<SessionMessage> {
  return query({ prompt: params.prompt, options: params.options }) as unknown as AsyncIterable<SessionMessage>;
}
