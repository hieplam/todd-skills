// Tests for card-actions.ts's buildEscalationMarkdown (P5 fix-list: escalation files must say
// what actually unblocks them — a reason-specific "## Options" / "How to unblock" block instead
// of the old generic list that presented the ruling path first for every reason, including
// mechanical verify failures a ruling can never clear).
import { describe, expect, test } from 'bun:test';
import { buildEscalationMarkdown } from './card-actions.ts';
import type { ResolvedConfig } from '../types.ts';

function fixtureResolved(overrides: Partial<ResolvedConfig> = {}): ResolvedConfig {
  return {
    repoRoot: '/repo',
    logsDir: '/repo/logs',
    homeDir: '/th',
    runId: 'r-1',
    argv: [],
    model: 'test-model',
    includeEscalated: false,
    dryRun: false,
    remote: 'origin',
    baseBranch: 'main',
    answersContent: '',
    briefTemplate: '',
    ...overrides,
  };
}

describe('buildEscalationMarkdown — P5 reason-specific Options', () => {
  test('needs_direction leads with the ruling path, not the verify-failure block', () => {
    const markdown = buildEscalationMarkdown('C1', 'needs_direction', 'What should we do?', fixtureResolved());
    expect(markdown).toContain('Append a ruling');
    expect(markdown).not.toContain('CANNOT clear');
  });

  test('planning_needed also leads with the ruling path', () => {
    const markdown = buildEscalationMarkdown('C1', 'planning_needed', 'Missing on disk: spec, plan', fixtureResolved());
    expect(markdown).toContain('Append a ruling');
    expect(markdown).not.toContain('CANNOT clear');
  });

  // Deliberately generic marker text (not the spec's own bullet wording) so these tests can
  // only pass by the implementation ADDING the reason-specific unblock bullet text — never by
  // the `## Context` section trivially echoing the raw `detail` string back.
  test('verify_failed_twice with only schemaGuard failing renders only the schemaGuard bullet', () => {
    const detail = '- schemaGuard: SOME_FAILURE_MARKER_A';
    const markdown = buildEscalationMarkdown('C1', 'verify_failed_twice', detail, fixtureResolved());
    expect(markdown).toContain('CANNOT clear');
    expect(markdown).toContain('allowsSchemaChange');
    expect(markdown).not.toContain('master/CI is genuinely red');
    expect(markdown).not.toContain('delete the leftover remote branch');
  });

  test('verify_failed_twice with two failing ids renders both bullets', () => {
    const detail = ['- schemaGuard: SOME_FAILURE_MARKER_A', '- checksGreen: SOME_FAILURE_MARKER_B'].join('\n');
    const markdown = buildEscalationMarkdown('C1', 'verify_failed_twice', detail, fixtureResolved());
    expect(markdown).toContain('CANNOT clear');
    expect(markdown).toContain('allowsSchemaChange');
    expect(markdown).toContain('master/CI is genuinely red');
    expect(markdown).not.toContain('delete the leftover remote branch');
  });
});
