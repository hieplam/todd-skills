// module: core/claude-transcript.test
import { describe, expect, test } from 'bun:test';
import { extractFinalResult } from './claude-transcript';

describe('extractFinalResult', () => {
  test('reads the result field from the last result-type event', () => {
    const lines = [
      '{"type":"system","subtype":"init"}',
      '{"type":"assistant","message":{"content":[]}}',
      '{"type":"result","result":"final report text","is_error":false}',
    ];
    const parsed = extractFinalResult(lines);
    expect(parsed).toEqual({ ok: true, text: 'final report text' });
  });

  test('reports failure when the result event flags is_error', () => {
    const lines = ['{"type":"result","result":"boom","is_error":true}'];
    const parsed = extractFinalResult(lines);
    expect(parsed.ok).toBe(false);
  });

  test('reports failure when no result event ever appears', () => {
    const parsed = extractFinalResult(['{"type":"system"}']);
    expect(parsed.ok).toBe(false);
  });

  test('reports failure on malformed JSON', () => {
    const parsed = extractFinalResult(['not json']);
    expect(parsed.ok).toBe(false);
  });

  test('ignores blank lines', () => {
    const lines = ['', '{"type":"result","result":"ok","is_error":false}', ''];
    expect(extractFinalResult(lines)).toEqual({ ok: true, text: 'ok' });
  });
});
