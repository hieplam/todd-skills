import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ASSIGNMENT_RE, scrubEnvContent } from './env-guard.ts';

describe('scrubEnvContent', () => {
  test('removes a plain ANTHROPIC_API_KEY=... assignment', () => {
    const content = 'FOO=bar\nANTHROPIC_API_KEY=sk-ant-12345\nBAZ=qux\n';
    const result = scrubEnvContent(content);
    expect(result.cleaned).toBe('FOO=bar\nBAZ=qux\n');
    expect(result.removed).toBe(1);
  });

  test('removes an `export ANTHROPIC_API_KEY=...` assignment', () => {
    const content = 'FOO=bar\nexport ANTHROPIC_API_KEY=sk-ant-12345\nBAZ=qux\n';
    const result = scrubEnvContent(content);
    expect(result.cleaned).toBe('FOO=bar\nBAZ=qux\n');
    expect(result.removed).toBe(1);
  });

  test('removes an indented assignment', () => {
    const content = 'FOO=bar\n   ANTHROPIC_API_KEY=sk-ant-12345\nBAZ=qux\n';
    const result = scrubEnvContent(content);
    expect(result.cleaned).toBe('FOO=bar\nBAZ=qux\n');
    expect(result.removed).toBe(1);
  });

  test('removes multiple occurrences and counts each one', () => {
    const content = 'ANTHROPIC_API_KEY=first\nFOO=bar\nexport ANTHROPIC_API_KEY=second\n';
    const result = scrubEnvContent(content);
    expect(result.cleaned).toBe('FOO=bar\n');
    expect(result.removed).toBe(2);
  });

  test('a file without the key is returned unchanged, removed: 0', () => {
    const content = 'FOO=bar\nBAZ=qux\n';
    const result = scrubEnvContent(content);
    expect(result.cleaned).toBe(content);
    expect(result.removed).toBe(0);
  });

  test('a comment line mentioning the variable is KEPT, not removed', () => {
    const content = '# ANTHROPIC_API_KEY=sk-ant-should-stay\nFOO=bar\n';
    const result = scrubEnvContent(content);
    expect(result.cleaned).toBe(content);
    expect(result.removed).toBe(0);
  });

  test('preserves a trailing newline when the source has one', () => {
    const content = 'ANTHROPIC_API_KEY=sk-ant-12345\nFOO=bar\n';
    const result = scrubEnvContent(content);
    expect(result.cleaned.endsWith('\n')).toBe(true);
    expect(result.cleaned).toBe('FOO=bar\n');
  });

  test('preserves the absence of a trailing newline when the source has none', () => {
    const content = 'ANTHROPIC_API_KEY=sk-ant-12345\nFOO=bar';
    const result = scrubEnvContent(content);
    expect(result.cleaned.endsWith('\n')).toBe(false);
    expect(result.cleaned).toBe('FOO=bar');
  });

  // Skinner audit (P10 fix round): a file whose ONLY content is the key line — the closest
  // real-world shape to the actual incident (a .env.local created solely to hold the leaked
  // key) — must scrub down to a truly empty file, not a stray lone '\n'. Before the fix,
  // `[].join('\n') + '\n'` invented that byte.
  test('a file whose only content is the key line scrubs to a truly empty string', () => {
    const result = scrubEnvContent('ANTHROPIC_API_KEY=sk-only\n');
    expect(result.cleaned).toBe('');
    expect(result.removed).toBe(1);
  });

  test('a file whose only content is the key line, with no trailing newline, also scrubs to empty', () => {
    const result = scrubEnvContent('ANTHROPIC_API_KEY=sk-only');
    expect(result.cleaned).toBe('');
    expect(result.removed).toBe(1);
  });
});

// Skinner audit (P10 fix round): doctor.sh cannot import this TypeScript module (it is a
// standalone bash script), so it carries its own POSIX-ERE copy of ASSIGNMENT_RE as a string
// literal in a `grep -qE '...'` call. Nothing previously stopped the two from drifting apart
// silently. This test reads doctor.sh's actual source and asserts its pattern is byte-identical
// to `ASSIGNMENT_RE.source` — a future edit to one without the other now fails loudly here.
describe('ASSIGNMENT_RE stays in sync with doctor.sh\'s copy', () => {
  test('doctor.sh\'s grep -qE pattern equals ASSIGNMENT_RE.source', () => {
    const doctorPath = join(import.meta.dir, '..', '..', 'doctor.sh');
    const doctorSrc = readFileSync(doctorPath, 'utf8');
    const match = /grep -qE '([^']+)'/.exec(doctorSrc);
    expect(match).not.toBeNull();
    expect(match?.[1]).toBe(ASSIGNMENT_RE.source);
  });
});
