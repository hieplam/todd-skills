import { describe, expect, test } from 'bun:test';
import { scrubEnvContent } from './env-guard.ts';

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
});
