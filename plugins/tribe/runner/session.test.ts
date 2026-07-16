// Tests for session.ts (Task 5b): the pinned §D1 SDK option set, init-message capture
// ordering, typed result parsing, timeout, and resume-attempt-failure handling.
//
// NEVER hits the real SDK or the network: every test drives `runSession` through a fake
// `io.spawnSession` seam. Fixtures are neutral (no repo names, no campaign values, no
// model names baked in) — the stateless-capability wall.
import { describe, expect, test } from 'bun:test';
import {
  TRIBE_PLUGIN_DIR,
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

    const config = fixtureConfig({ maxTurns: 12 });
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
    expect(options.maxTurns).toBe(12);
    expect(options.abortController).toBeInstanceOf(AbortController);
    expect(options.executable).toBe('bun');
    expect(options.resume).toBeUndefined();
  });

  test('TRIBE_PLUGIN_DIR is derived from the module location, never a hardcoded absolute path', () => {
    expect(TRIBE_PLUGIN_DIR).not.toContain('ai-dict');
    expect(TRIBE_PLUGIN_DIR.endsWith('runner')).toBe(false);
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
