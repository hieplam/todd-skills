// module: core/verdict-parsing.test
import { describe, expect, test } from 'bun:test';
import { parseGraderVerdict } from './verdict-parsing';

describe('parseGraderVerdict', () => {
  test('parses well-formed JSON', () => {
    const raw = '{"conventions":[{"id":"C1","verdict":"caught","evidence":"x"}],"decoys_flagged":[],"invented":[]}';
    const result = parseGraderVerdict(raw);
    expect(result.ok).toBe(true);
  });

  test('strips markdown fences before parsing', () => {
    const raw = '```json\n{"conventions":[],"decoys_flagged":[],"invented":[]}\n```';
    const result = parseGraderVerdict(raw);
    expect(result.ok).toBe(true);
  });

  test('rejects a missing conventions array', () => {
    const result = parseGraderVerdict('{"decoys_flagged":[],"invented":[]}');
    expect(result.ok).toBe(false);
  });

  test('rejects an invalid verdict enum value', () => {
    const raw = '{"conventions":[{"id":"C1","verdict":"sort-of","evidence":"x"}],"decoys_flagged":[],"invented":[]}';
    const result = parseGraderVerdict(raw);
    expect(result.ok).toBe(false);
  });

  test('rejects non-JSON text', () => {
    const result = parseGraderVerdict('the agent did a great job');
    expect(result.ok).toBe(false);
  });
});
