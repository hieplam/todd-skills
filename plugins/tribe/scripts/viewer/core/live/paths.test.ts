import { expect, test } from 'bun:test';
import { agentIdFromFileName, metaFileNameFor, projectDirOf, sanitizeProjectDirName, subagentsDirOf, transcriptPathOf } from './paths.ts';

test('encodes a real repo path exactly as Claude Code does (verified on disk)', () => {
  expect(sanitizeProjectDirName('/Users/hip/repo/wiki-harness')).toBe('-Users-hip-repo-wiki-harness');
  expect(sanitizeProjectDirName('/Users/hip/repo/todd-skills')).toBe('-Users-hip-repo-todd-skills');
});

test('a path longer than 200 sanitized chars is truncated and hash-suffixed', () => {
  const long = `/Users/hip/${'a'.repeat(300)}`;
  const out = sanitizeProjectDirName(long);
  expect(out.length).toBeGreaterThan(200);
  expect(out.slice(0, 200)).toBe(long.replace(/[^a-zA-Z0-9]/g, '-').slice(0, 200));
  expect(out[200]).toBe('-');
  expect(sanitizeProjectDirName(long)).toBe(out);
});

test('composes a home dir and an already-encoded name into a project dir', () => {
  expect(projectDirOf('/Users/x', 'encoded-name')).toBe('/Users/x/.claude/projects/encoded-name');
});

test('builds the transcript and subagent locations from a session id', () => {
  const dir = '/home/.claude/projects/-Users-hip-repo-wiki-harness';
  expect(transcriptPathOf(dir, 'abc-123')).toBe(`${dir}/abc-123.jsonl`);
  expect(subagentsDirOf(dir, 'abc-123')).toBe(`${dir}/abc-123/subagents`);
});

test('recovers an agent id from its transcript file name, and its sidecar name', () => {
  expect(agentIdFromFileName('agent-a02f7fb139fbc0ce2.jsonl')).toBe('a02f7fb139fbc0ce2');
  expect(agentIdFromFileName('agent-a02f7fb139fbc0ce2.meta.json')).toBeNull();
  expect(agentIdFromFileName('notes.txt')).toBeNull();
  expect(metaFileNameFor('a02f7fb139fbc0ce2')).toBe('agent-a02f7fb139fbc0ce2.meta.json');
});
