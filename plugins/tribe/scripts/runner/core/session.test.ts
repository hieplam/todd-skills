// Tests for session.ts (Task 5b): the pinned §D1 SDK option set, init-message capture
// ordering, typed result parsing, timeout, and resume-attempt-failure handling.
//
// NEVER hits the real SDK or the network: every test drives `runSession` through a fake
// `io.spawnSession` seam. Fixtures are neutral (no repo names, no campaign values, no
// model names baked in) — the stateless-capability wall.
import { describe, expect, test } from 'bun:test';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  BACKGROUNDING_DENIED_REASON,
  TRIBE_PLUGIN_DIR,
  decideBackgroundingHook,
  runSession,
  type PinnedSessionOptions,
  type RunSessionConfig,
  type SessionIO,
  type SessionMessage,
} from './session.ts';

function fixtureConfig(overrides: Partial<RunSessionConfig> = {}): RunSessionConfig {
  return {
    repoRoot: '/fixture/repo',
    model: 'fixture-model',
    logsDir: '/fixture/logs',
    card: 'C7',
    ...overrides,
  };
}

function recordingIo(): SessionIO & { calls: string[]; logLines: string[] } {
  const calls: string[] = [];
  const logLines: string[] = [];
  return {
    calls,
    logLines,
    spawnSession: () => {
      throw new Error('spawnSession not stubbed for this test');
    },
    onSessionStart: (sessionId: string) => {
      calls.push(`onSessionStart:${sessionId}`);
    },
    appendLog: (path: string, line: string) => {
      calls.push(`appendLog:${path}`);
      logLines.push(line);
    },
  };
}

async function* messages(list: SessionMessage[]): AsyncGenerator<SessionMessage> {
  for (const m of list) yield m;
}

const INIT_MESSAGE: SessionMessage = {
  type: 'system',
  subtype: 'init',
  session_id: 'sess-123',
};

describe('runSession — §D1 option set (regression guard against SDK drift)', () => {
  test('passes exactly the pinned §D1 options to io.spawnSession', async () => {
    let capturedOptions: PinnedSessionOptions | undefined;
    const io = recordingIo();
    io.spawnSession = (params) => {
      capturedOptions = params.options;
      return messages([
        INIT_MESSAGE,
        { type: 'result', subtype: 'success', result: 'SHIPPED 42 abc1234', session_id: 'sess-123' },
      ]);
    };

    const config = fixtureConfig();
    await runSession({ brief: 'do the thing' }, config, io);

    expect(capturedOptions).toBeDefined();
    const options = capturedOptions as PinnedSessionOptions;
    expect(options.cwd).toBe('/fixture/repo');
    expect(options.model).toBe('fixture-model');
    expect(options.systemPrompt).toEqual({ type: 'preset', preset: 'claude_code' });
    expect(options.settingSources).toEqual(['project']);
    expect(options.plugins).toEqual([{ type: 'local', path: TRIBE_PLUGIN_DIR }]);
    expect(options.permissionMode).toBe('bypassPermissions');
    expect(options.allowDangerouslySkipPermissions).toBe(true);
    expect(options.abortController).toBeInstanceOf(AbortController);
    expect(options.executable).toBe('bun');
    expect(options.resume).toBeUndefined();
  });

  test('wires the anti-livelock PreToolUse deny-hook into every spawned session', async () => {
    let capturedOptions: PinnedSessionOptions | undefined;
    const io = recordingIo();
    io.spawnSession = (params) => {
      capturedOptions = params.options;
      return messages([
        INIT_MESSAGE,
        { type: 'result', subtype: 'success', result: 'SHIPPED 42 abc1234', session_id: 'sess-123' },
      ]);
    };

    await runSession({ brief: 'do the thing' }, fixtureConfig(), io);

    // Not merely "a hook is present" — invoke the wired hook and prove it actually denies.
    const wired = (capturedOptions as PinnedSessionOptions).hooks.PreToolUse[0]?.hooks[0];
    expect(wired).toBeDefined();
    const decision = await (wired as (i: unknown) => Promise<{ hookSpecificOutput?: { permissionDecision?: string } }>)({
      tool_name: 'Bash',
      tool_input: { command: 'bun run e2e:chrome', run_in_background: true },
    });
    expect(decision.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  test('TRIBE_PLUGIN_DIR is derived from the module location, never a hardcoded absolute path', () => {
    expect(TRIBE_PLUGIN_DIR).not.toContain('ai-dict');
    expect(TRIBE_PLUGIN_DIR.endsWith('runner')).toBe(false);
  });

  test('TRIBE_PLUGIN_DIR resolves on disk to the real plugins/tribe directory (not counted by eye)', () => {
    // The runner lives at plugins/tribe/scripts/runner/core/ — three levels below plugins/tribe.
    // Prove the resolved path is that exact directory by checking a file that only exists
    // there, not by asserting a string suffix alone.
    expect(TRIBE_PLUGIN_DIR.endsWith(join('plugins', 'tribe'))).toBe(true);
    expect(existsSync(join(TRIBE_PLUGIN_DIR, '.claude-plugin', 'plugin.json'))).toBe(true);
  });

  test('passes options.resume when a resume input is given', async () => {
    let capturedOptions: PinnedSessionOptions | undefined;
    const io = recordingIo();
    io.spawnSession = (params) => {
      capturedOptions = params.options;
      return messages([
        INIT_MESSAGE,
        { type: 'result', subtype: 'success', result: 'SHIPPED 1 aaaaaaa', session_id: 'sess-123' },
      ]);
    };

    await runSession({ brief: 'continue', resume: 'sess-previous' }, fixtureConfig(), io);
    expect((capturedOptions as PinnedSessionOptions).resume).toBe('sess-previous');
  });
});

describe('decideBackgroundingHook — the anti-livelock wall, enforced', () => {
  function deny(toolName: string, toolInput: Record<string, unknown> = {}) {
    return decideBackgroundingHook({ tool_name: toolName, tool_input: toolInput });
  }

  test('denies the exact call that killed 6 workers: a backgrounded Bash e2e run', () => {
    const decision = deny('Bash', { command: 'bun run e2e:chrome', run_in_background: true });
    expect(decision.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(decision.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
    expect(decision.hookSpecificOutput?.permissionDecisionReason).toBe(BACKGROUNDING_DENIED_REASON);
  });

  test('allows a foreground Bash call, with or without an explicit false', () => {
    expect(deny('Bash', { command: 'bun test', timeout: 600000 })).toEqual({});
    expect(deny('Bash', { command: 'bun test', run_in_background: false })).toEqual({});
  });

  test('denies Agent/Task when run_in_background is OMITTED — those tools background by default', () => {
    expect(deny('Agent', { prompt: 'audit this' }).hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(deny('Task', { prompt: 'audit this' }).hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  test('allows Agent/Task only when it explicitly opts out of backgrounding', () => {
    expect(deny('Agent', { prompt: 'audit this', run_in_background: false })).toEqual({});
    expect(deny('Task', { prompt: 'audit this', run_in_background: false })).toEqual({});
  });

  test('leaves unrelated tools alone', () => {
    expect(deny('Read', { file_path: '/x' })).toEqual({});
    expect(deny('Edit', { file_path: '/x' })).toEqual({});
  });

  test('does not throw on malformed or absent hook input', () => {
    expect(decideBackgroundingHook(undefined)).toEqual({});
    expect(decideBackgroundingHook(null)).toEqual({});
    expect(decideBackgroundingHook({})).toEqual({});
    expect(decideBackgroundingHook({ tool_name: 42, tool_input: 'nonsense' })).toEqual({});
  });
});

describe('runSession — init-message capture ordering (crash-safety guarantee)', () => {
  test('invokes io.onSessionStart on the init message BEFORE the result message is processed', async () => {
    const io = recordingIo();
    io.spawnSession = () =>
      messages([
        INIT_MESSAGE,
        { type: 'result', subtype: 'success', result: 'SHIPPED 42 abc1234', session_id: 'sess-123' },
      ]);

    const result = await runSession({ brief: 'do the thing' }, fixtureConfig(), io);

    expect(result.outcome).toBe('shipped');
    expect(io.calls).toEqual([
      'onSessionStart:sess-123',
      'appendLog:/fixture/logs/C7-sess-123.log',
      'appendLog:/fixture/logs/C7-sess-123.log',
    ]);
    expect(io.logLines[0]).toContain('"subtype":"init"');
    expect(io.logLines[1]).toContain('"type":"result"');
  });
});

describe('runSession — typed result parsing', () => {
  test('a SHIPPED <pr> <sha> line -> outcome "shipped" with pr/sha extracted', async () => {
    const io = recordingIo();
    io.spawnSession = () =>
      messages([
        INIT_MESSAGE,
        {
          type: 'result',
          subtype: 'success',
          result: 'All tasks landed.\nSHIPPED 42 abc1234def',
          session_id: 'sess-123',
        },
      ]);

    const result = await runSession({ brief: 'x' }, fixtureConfig(), io);
    expect(result).toEqual({
      outcome: 'shipped',
      finalText: 'All tasks landed.\nSHIPPED 42 abc1234def',
      pr: 42,
      sha: 'abc1234def',
    });
  });

  test('a NEEDS_DIRECTION: line -> outcome "needs_direction"', async () => {
    const io = recordingIo();
    io.spawnSession = () =>
      messages([
        INIT_MESSAGE,
        {
          type: 'result',
          subtype: 'success',
          result: 'NEEDS_DIRECTION: which schema-lock path applies here?',
          session_id: 'sess-123',
        },
      ]);

    const result = await runSession({ brief: 'x' }, fixtureConfig(), io);
    expect(result.outcome).toBe('needs_direction');
    expect(result.finalText).toBe('NEEDS_DIRECTION: which schema-lock path applies here?');
    expect(result.pr).toBeUndefined();
    expect(result.sha).toBeUndefined();
  });

  test('a malformed terminal line (neither SHIPPED nor NEEDS_DIRECTION) -> outcome "error"', async () => {
    const io = recordingIo();
    io.spawnSession = () =>
      messages([
        INIT_MESSAGE,
        { type: 'result', subtype: 'success', result: 'looks done, forgot the contract line', session_id: 'sess-123' },
      ]);

    const result = await runSession({ brief: 'x' }, fixtureConfig(), io);
    expect(result.outcome).toBe('error');
  });

  test('a result message with an error subtype -> outcome "error"', async () => {
    const io = recordingIo();
    io.spawnSession = () =>
      messages([INIT_MESSAGE, { type: 'result', subtype: 'error_max_turns', session_id: 'sess-123' }]);

    const result = await runSession({ brief: 'x' }, fixtureConfig(), io);
    expect(result.outcome).toBe('error');
  });
});

describe('runSession — timeout path', () => {
  test('aborts and returns outcome "timeout" when the session exceeds the wall-clock budget', async () => {
    const io = recordingIo();
    let capturedOptions: PinnedSessionOptions | undefined;
    io.spawnSession = (params) => {
      capturedOptions = params.options;
      return (async function* () {
        yield INIT_MESSAGE;
        await new Promise(() => {}); // hang forever — only the timeout should resolve first
      })();
    };

    const result = await runSession(
      { brief: 'x' },
      fixtureConfig({ sessionTimeoutMs: 20 }),
      io,
    );

    expect(result.outcome).toBe('timeout');
    expect((capturedOptions as PinnedSessionOptions).abortController).toBeInstanceOf(AbortController);
    expect((capturedOptions as PinnedSessionOptions).abortController.signal.aborted).toBe(true);
  });
});

describe('runSession — resume-attempt failure (§D4 fallback trigger)', () => {
  test('a failed resume attempt surfaces as a typed error, not a thrown exception', async () => {
    const io = recordingIo();
    io.spawnSession = () => {
      throw new Error('no transcript found for session sess-previous');
    };

    const result = await runSession({ brief: 'continue', resume: 'sess-previous' }, fixtureConfig(), io);
    expect(result.outcome).toBe('error');
    expect(result.finalText).toContain('no transcript found for session sess-previous');
  });

  test('a resume attempt that fails mid-stream (iterator throws) also surfaces as a typed error', async () => {
    const io = recordingIo();
    io.spawnSession = () =>
      (async function* () {
        yield INIT_MESSAGE;
        throw new Error('resume stream rejected');
      })();

    const result = await runSession({ brief: 'continue', resume: 'sess-previous' }, fixtureConfig(), io);
    expect(result.outcome).toBe('error');
    expect(result.finalText).toContain('resume stream rejected');
  });
});
