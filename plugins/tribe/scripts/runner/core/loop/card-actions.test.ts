// Tests for card-actions.ts's buildEscalationMarkdown (P5 fix-list: escalation files must say
// what actually unblocks them — a reason-specific "## Options" / "How to unblock" block instead
// of the old generic list that presented the ruling path first for every reason, including
// mechanical verify failures a ruling can never clear).
import { describe, expect, test } from 'bun:test';
import { buildEscalationMarkdown } from './card-actions.ts';
import type { ResolvedConfig } from '../types.ts';
import type { VerifyPointId } from '../verify.ts';

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
    const failedPoints: VerifyPointId[] = ['schemaGuard'];
    const markdown = buildEscalationMarkdown('C1', 'verify_failed_twice', detail, fixtureResolved(), failedPoints);
    expect(markdown).toContain('CANNOT clear');
    expect(markdown).toContain('allowsSchemaChange');
    expect(markdown).not.toContain('master/CI is genuinely red');
    expect(markdown).not.toContain('delete the leftover remote branch');
  });

  test('verify_failed_twice with two failing ids renders both bullets', () => {
    const detail = ['- schemaGuard: SOME_FAILURE_MARKER_A', '- checksGreen: SOME_FAILURE_MARKER_B'].join('\n');
    const failedPoints: VerifyPointId[] = ['schemaGuard', 'checksGreen'];
    const markdown = buildEscalationMarkdown('C1', 'verify_failed_twice', detail, fixtureResolved(), failedPoints);
    expect(markdown).toContain('CANNOT clear');
    expect(markdown).toContain('allowsSchemaChange');
    expect(markdown).toContain('master/CI is genuinely red');
    expect(markdown).not.toContain('delete the leftover remote branch');
  });

  // P5 audit fix-round (blocker, skinnerB): reproduces the "zero bullets" defect for verify.ts's
  // OWN real point ids ('merged'/'mergeShaAncestorOfMaster') that the original P5
  // implementation's 3-entry map never covered — the exact scenario
  // `core/loop.test.ts:1023 'verifyShipped fails twice for the same card -> escalated'` drives
  // end-to-end (merged=false). Before the fix, the "How to unblock" header was followed by NO
  // bullets at all for this input.
  test('verify_failed_twice with merged failing renders the merged bullet, not zero bullets', () => {
    const detail = '- merged: PR #7 is not merged (gh api reported merged=false)';
    const failedPoints: VerifyPointId[] = ['merged'];
    const markdown = buildEscalationMarkdown('C1', 'verify_failed_twice', detail, fixtureResolved(), failedPoints);
    expect(markdown).toContain('CANNOT clear');
    expect(markdown).toContain('- merged: the PR is not merged yet');
    // The "How to unblock" block must contain more than just the two static intro lines.
    const unblockSection = markdown.split('## How to unblock')[1] ?? '';
    expect(unblockSection.trim().split('\n').length).toBeGreaterThan(3);
  });

  test('verify_failed_twice with mergeShaAncestorOfMaster failing renders that bullet, not zero bullets', () => {
    const detail =
      '- mergeShaAncestorOfMaster: abc123 is NOT an ancestor of origin/master (git merge-base --is-ancestor exit 1)';
    const failedPoints: VerifyPointId[] = ['mergeShaAncestorOfMaster'];
    const markdown = buildEscalationMarkdown('C1', 'verify_failed_twice', detail, fixtureResolved(), failedPoints);
    expect(markdown).toContain('CANNOT clear');
    expect(markdown).toContain('- mergeShaAncestorOfMaster: the merge commit is not');
    const unblockSection = markdown.split('## How to unblock')[1] ?? '';
    expect(unblockSection.trim().split('\n').length).toBeGreaterThan(3);
  });

  // P5 audit fix-round (blocker, skinnerB): worktreeAndBranchGone must NOT give unqualified
  // "delete it by hand" instructions when `merged` also failed (the PR simply hasn't merged
  // yet, so the branch/worktree being present is expected, not residue) — contradicts P4's
  // `decideResidueHeal` (residue.ts:46), which never even considers cleanup unless `merged`
  // passed.
  test('verify_failed_twice with merged AND worktreeAndBranchGone failing (unmerged PR) does not tell the reader to delete anything', () => {
    const detail = [
      '- merged: PR #7 is not merged (gh api reported merged=false)',
      '- worktreeAndBranchGone: my-branch: worktree still present and remote branch still present',
    ].join('\n');
    const failedPoints: VerifyPointId[] = ['merged', 'worktreeAndBranchGone'];
    const markdown = buildEscalationMarkdown('C1', 'verify_failed_twice', detail, fixtureResolved(), failedPoints);
    expect(markdown).not.toContain('delete the leftover remote branch / worktree by hand');
    expect(markdown).toContain('Merge the PR first');
  });

  // P5 audit fix-round (blocker, skinnerB): when `merged` PASSED (not in failedPoints) but
  // worktreeAndBranchGone still failed — the P4 "heal refused, worktree dirty" case — the
  // instruction must caveat checking for uncommitted/unmerged work before deleting anything by
  // hand, never an unqualified "delete it by hand".
  test('verify_failed_twice with only worktreeAndBranchGone failing (merged passed) caveats checking for uncommitted work first', () => {
    const detail = '- worktreeAndBranchGone: my-branch: worktree still present and remote branch still present';
    const failedPoints: VerifyPointId[] = ['worktreeAndBranchGone'];
    const markdown = buildEscalationMarkdown('C1', 'verify_failed_twice', detail, fixtureResolved(), failedPoints);
    expect(markdown).toContain('Check for uncommitted or unmerged work FIRST');
    expect(markdown).toContain('delete the leftover remote branch / worktree by hand');
  });
});
