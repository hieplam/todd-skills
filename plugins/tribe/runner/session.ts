// Pinned Claude Agent SDK query() options + session spawn/parse (Task 5b, spec §D1).
//
// This is the ONLY module in the runner that may import `@anthropic-ai/claude-agent-sdk`
// (spec "SDK drift" risk note) — an SDK upgrade must only ever touch this file. Every other
// module reaches a session through the `SessionIO` seam below, never the SDK package
// directly.
import { join } from 'node:path';
import { query } from '@anthropic-ai/claude-agent-sdk';

/** The tribe plugin's own directory (`plugins/tribe`), derived from this module's location
 * — NEVER a hardcoded absolute path (stateless-capability wall). This is what the SDK's
 * `plugins` option loads the tribe agents from, so a stale user-global `~/.claude/agents`
 * copy cannot shadow them inside an executor session (spec §D1, "Agent duplication" risk). */
export const TRIBE_PLUGIN_DIR = join(import.meta.dir, '..');

/** Terminal outcome of one executor session, derived only from the typed `result` message —
 * never by scraping stdout (spec §D3: done is script-verified, agent SHIPPED is a signal). */
export type SessionOutcome = 'shipped' | 'needs_direction' | 'error' | 'timeout';

export interface SessionResult {
  outcome: SessionOutcome;
  finalText: string;
  pr?: number;
  sha?: string;
}

export interface RunSessionInput {
  /** The rendered executor brief (see `brief.ts`) — the session's initial prompt. */
  brief: string;
  /** SDK session id to resume (spec §D4). A failed resume attempt surfaces as a typed
   * `error` result, never a thrown exception, so callers can fall back to a fresh session. */
  resume?: string;
}

export interface RunSessionConfig {
  /** `--repo` input: session `cwd`. */
  repoRoot: string;
  /** `--model` input: executor model tier. Never defaulted here — always caller-supplied. */
  model: string;
  /** `--session-timeout`-derived turn cap, if the caller wants one. */
  maxTurns?: number;
  /** `--session-timeout` input, in ms: wall-clock abort for this session. */
  sessionTimeoutMs?: number;
  /** `--logs-dir` input: session log files land at `<logsDir>/<card>-<sessionId>.log`. */
  logsDir: string;
  /** The card id this session is executing, for log file naming. */
  card: string;
}

/** Loose supertype of the SDK's `SDKMessage` discriminated union — the runner only ever
 * narrows on `type`/`subtype`/`session_id`/`result`, so it doesn't need (or want) to import
 * the SDK's full internal message union outside this file. */
export interface SessionMessage {
  type: string;
  subtype?: string;
  session_id?: string;
  result?: string;
  [key: string]: unknown;
}

export interface SpawnSessionParams {
  prompt: string;
  options: PinnedSessionOptions;
}

/** The seam: production code funnels every session spawn through here so tests never hit
 * the real SDK or the network. Log writing is injected too (`appendLog`). */
export interface SessionIO {
  spawnSession(params: SpawnSessionParams): AsyncIterable<SessionMessage>;
  /** Invoked IMMEDIATELY on receipt of the first `system/init` message's `session_id` —
   * before any further message is processed. This drives the crash-safe state write; the
   * session id is SDK-assigned and cannot be known before spawn (spec §D1/§D4). */
  onSessionStart(sessionId: string): void;
  appendLog(logPath: string, line: string): void;
}

/** The exact §D1 pinned option set, pinned in this one module. Every field is load-bearing
 * — do not "simplify" any away (see the per-field notes on `buildSessionOptions`). */
export interface PinnedSessionOptions {
  cwd: string;
  model: string;
  systemPrompt: { type: 'preset'; preset: 'claude_code' };
  settingSources: ['project'];
  plugins: Array<{ type: 'local'; path: string }>;
  permissionMode: 'bypassPermissions';
  allowDangerouslySkipPermissions: true;
  maxTurns?: number;
  abortController: AbortController;
  executable: 'bun';
  resume?: string;
}

/** Builds the §D1 option block verbatim. */
export function buildSessionOptions(
  input: RunSessionInput,
  config: RunSessionConfig,
  abortController: AbortController,
): PinnedSessionOptions {
  const options: PinnedSessionOptions = {
    cwd: config.repoRoot, // --repo input
    model: config.model, // --model input
    systemPrompt: { type: 'preset', preset: 'claude_code' }, // REQUIRED for CLAUDE.md to apply
    settingSources: ['project'], // defaults to []; 'project' loads the target repo's own config
    plugins: [{ type: 'local', path: TRIBE_PLUGIN_DIR }], // tribe agents, never ~/.claude/agents
    permissionMode: 'bypassPermissions', // owner-ruled: headless, never hangs
    allowDangerouslySkipPermissions: true, // required by the SDK for the above
    maxTurns: config.maxTurns,
    abortController,
    executable: 'bun',
  };
  if (input.resume) {
    options.resume = input.resume;
  }
  return options;
}

/** The real SDK spawn, wrapping `query()` — used to build the production `SessionIO`. Not
 * exercised by unit tests (it would hit the real SDK); the option-building and
 * message-parsing logic it depends on is fully covered without it. */
export function sdkSpawnSession(params: SpawnSessionParams): AsyncIterable<SessionMessage> {
  return query({ prompt: params.prompt, options: params.options }) as unknown as AsyncIterable<SessionMessage>;
}

const SHIPPED_RE = /SHIPPED\s+#?(\d+)\s+([0-9a-f]{7,40})/i;
const NEEDS_DIRECTION_RE = /NEEDS_DIRECTION:/;

/** Parses the typed `result` message into a `SessionResult` — the only place stdout-style
 * scraping happens, and even here it operates on the SDK's own structured `result` field,
 * never raw process stdout (spec §D3). */
function parseResultMessage(message: SessionMessage): SessionResult {
  const finalText = typeof message.result === 'string' ? message.result : '';

  if (message.subtype !== 'success') {
    return {
      outcome: 'error',
      finalText: finalText || `session ended with error subtype "${message.subtype}"`,
    };
  }

  const shipped = finalText.match(SHIPPED_RE);
  if (shipped) {
    return { outcome: 'shipped', finalText, pr: Number(shipped[1]), sha: shipped[2] };
  }
  if (NEEDS_DIRECTION_RE.test(finalText)) {
    return { outcome: 'needs_direction', finalText };
  }
  return {
    outcome: 'error',
    finalText: finalText || 'result message carried neither a SHIPPED nor a NEEDS_DIRECTION terminal line',
  };
}

function errorResult(err: unknown): SessionResult {
  const message = err instanceof Error ? err.message : String(err);
  return { outcome: 'error', finalText: message };
}

async function consumeSession(
  input: RunSessionInput,
  config: RunSessionConfig,
  io: SessionIO,
  options: PinnedSessionOptions,
): Promise<SessionResult> {
  let sessionMessages: AsyncIterable<SessionMessage>;
  try {
    sessionMessages = io.spawnSession({ prompt: input.brief, options });
  } catch (err) {
    // A failed resume attempt (no transcript, SDK error) must surface as a typed error, not
    // a crash — §D4's resume matrix falls back to a fresh session on this result.
    return errorResult(err);
  }

  let logPath: string | null = null;

  try {
    for await (const message of sessionMessages) {
      if (logPath === null && message.type === 'system' && message.subtype === 'init') {
        const sessionId = String(message.session_id ?? '');
        // Invoked IMMEDIATELY on init receipt, before this (or any later) message is
        // otherwise processed — the crash window this closes is milliseconds wide.
        io.onSessionStart(sessionId);
        logPath = `${config.logsDir}/${config.card}-${sessionId}.log`;
      }

      if (logPath !== null) {
        io.appendLog(logPath, JSON.stringify(message));
      }

      if (message.type === 'result') {
        return parseResultMessage(message);
      }
    }
    return { outcome: 'error', finalText: 'session ended without a result message' };
  } catch (err) {
    return errorResult(err);
  }
}

/** Runs one executor session end-to-end: pins the §D1 options, streams messages to the
 * per-session log file, and resolves to a `SessionResult` parsed from the typed `result`
 * message. Never throws — every failure path (spawn failure, mid-stream failure, timeout)
 * resolves to a typed `SessionResult` instead. */
export async function runSession(
  input: RunSessionInput,
  config: RunSessionConfig,
  io: SessionIO,
): Promise<SessionResult> {
  const abortController = new AbortController();
  const options = buildSessionOptions(input, config, abortController);
  const sessionPromise = consumeSession(input, config, io, options);

  if (config.sessionTimeoutMs === undefined) {
    return sessionPromise;
  }

  let timer: ReturnType<typeof setTimeout>;
  const timeoutMs = config.sessionTimeoutMs;
  const timeoutPromise = new Promise<SessionResult>((resolve) => {
    timer = setTimeout(() => {
      abortController.abort();
      resolve({ outcome: 'timeout', finalText: `session exceeded the ${timeoutMs}ms wall-clock timeout` });
    }, timeoutMs);
  });

  try {
    return await Promise.race([sessionPromise, timeoutPromise]);
  } finally {
    clearTimeout(timer!);
  }
}
