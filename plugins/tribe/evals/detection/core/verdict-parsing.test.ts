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

  test('rejects a conventions[] array with a duplicate id', () => {
    const raw = '{"conventions":[{"id":"C1","verdict":"caught","evidence":"x"},{"id":"C1","verdict":"missed","evidence":"y"}],"decoys_flagged":[],"invented":[]}';
    const result = parseGraderVerdict(raw);
    expect(result.ok).toBe(false);
  });

  test('tolerates trailing whitespace after the closing fence', () => {
    const raw = '```json\n{"conventions":[],"decoys_flagged":[],"invented":[]}\n```   ';
    const result = parseGraderVerdict(raw);
    expect(result.ok).toBe(true);
  });

  test('tolerates leading whitespace before the opening fence', () => {
    const raw = '   ```json\n{"conventions":[],"decoys_flagged":[],"invented":[]}\n```';
    const result = parseGraderVerdict(raw);
    expect(result.ok).toBe(true);
  });

  test('tolerates a capitalized JSON language tag', () => {
    const raw = '```JSON\n{"conventions":[],"decoys_flagged":[],"invented":[]}\n```';
    const result = parseGraderVerdict(raw);
    expect(result.ok).toBe(true);
  });

  test('still rejects a fenced reply with prose before the fence', () => {
    const raw = 'Here is my answer:\n```json\n{"conventions":[],"decoys_flagged":[],"invented":[]}\n```';
    const result = parseGraderVerdict(raw);
    expect(result.ok).toBe(false);
  });
});
