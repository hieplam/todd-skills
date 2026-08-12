// Tests for merge-gate.ts (P2 fix-list card): the pure pre-merge check gate — parsing a
// `gh pr merge` Bash command and judging a `gh pr checks --json name,state` result.
//
// PURELY unit-level: no exec, no network, no session. `parseMergeCommand`/`judgeChecks`/
// `buildMergeGateDecision` are ordinary functions over strings and plain objects.
import { describe, expect, test } from 'bun:test';
import {
  MERGE_GATE_DENIED_CHECKS_ERROR_REASON,
  MERGE_GATE_DENIED_FORBIDDEN_FLAG_REASON,
  buildMergeGateDecision,
  judgeChecks,
  mergeGateNotGreenReason,
  parseMergeCommand,
} from './merge-gate.ts';

describe('parseMergeCommand', () => {
  test('a plain "gh pr merge" is a merge attempt with no ref and no forbidden flag', () => {
    expect(parseMergeCommand('gh pr merge')).toEqual({ isMerge: true, prRef: undefined, forbiddenFlag: undefined });
  });

  test('"gh pr merge --merge" is a merge attempt; --merge is not a forbidden flag', () => {
    expect(parseMergeCommand('gh pr merge --merge')).toEqual({
      isMerge: true,
      prRef: undefined,
      forbiddenFlag: undefined,
    });
  });

  test('"--auto" sets forbiddenFlag', () => {
    const parsed = parseMergeCommand('gh pr merge --auto');
    expect(parsed.isMerge).toBe(true);
    expect(parsed.forbiddenFlag).toBe('--auto');
  });

  test('"--admin" sets forbiddenFlag', () => {
    const parsed = parseMergeCommand('gh pr merge --admin');
    expect(parsed.isMerge).toBe(true);
    expect(parsed.forbiddenFlag).toBe('--admin');
  });

  test('a PR ref given as a bare number is extracted', () => {
    const parsed = parseMergeCommand('gh pr merge 188 --merge');
    expect(parsed.isMerge).toBe(true);
    expect(parsed.prRef).toBe('188');
    expect(parsed.forbiddenFlag).toBeUndefined();
  });

  test('a PR ref given as a URL is extracted', () => {
    const parsed = parseMergeCommand('gh pr merge https://github.com/acme/widget/pull/188 --merge');
    expect(parsed.isMerge).toBe(true);
    expect(parsed.prRef).toBe('https://github.com/acme/widget/pull/188');
  });

  test('no ref given (bare command) leaves prRef undefined', () => {
    const parsed = parseMergeCommand('gh pr merge --merge');
    expect(parsed.isMerge).toBe(true);
    expect(parsed.prRef).toBeUndefined();
  });

  test('commands that are not "gh pr merge" are not merge attempts', () => {
    expect(parseMergeCommand('gh pr checks 188')).toEqual({ isMerge: false, prRef: undefined, forbiddenFlag: undefined });
    expect(parseMergeCommand('gh pr view 188')).toEqual({ isMerge: false, prRef: undefined, forbiddenFlag: undefined });
    expect(parseMergeCommand('git commit -m "merge conflict fix"')).toEqual({
      isMerge: false,
      prRef: undefined,
      forbiddenFlag: undefined,
    });
    expect(parseMergeCommand('bun test')).toEqual({ isMerge: false, prRef: undefined, forbiddenFlag: undefined });
  });
});

describe('judgeChecks', () => {
  test('all SUCCESS -> green', () => {
    const result = judgeChecks(
      JSON.stringify([
        { name: 'format-check', state: 'SUCCESS' },
        { name: 'unit-tests', state: 'SUCCESS' },
      ]),
    );
    expect(result.allGreen).toBe(true);
    expect(result.notGreen).toEqual([]);
  });

  test('one pending check -> not green (pending is not green)', () => {
    const result = judgeChecks(
      JSON.stringify([
        { name: 'format-check', state: 'SUCCESS' },
        { name: 'unit-tests', state: 'PENDING' },
      ]),
    );
    expect(result.allGreen).toBe(false);
    expect(result.notGreen).toEqual(['unit-tests: PENDING']);
  });

  test('one failing check -> not green', () => {
    const result = judgeChecks(
      JSON.stringify([
        { name: 'format-check', state: 'FAILURE' },
        { name: 'unit-tests', state: 'SUCCESS' },
      ]),
    );
    expect(result.allGreen).toBe(false);
    expect(result.notGreen).toEqual(['format-check: FAILURE']);
  });

  test('malformed JSON -> not green (fail-closed)', () => {
    const result = judgeChecks('not json at all {{{');
    expect(result.allGreen).toBe(false);
    expect(result.notGreen.length).toBeGreaterThan(0);
  });

  test('empty check list -> not green (fail-closed)', () => {
    const result = judgeChecks('[]');
    expect(result.allGreen).toBe(false);
    expect(result.notGreen.length).toBeGreaterThan(0);
  });
});

describe('buildMergeGateDecision', () => {
  test('a non-merge command gets an empty decision (no opinion)', () => {
    expect(buildMergeGateDecision({ parsed: { isMerge: false } })).toEqual({});
  });

  test('a forbidden flag (--auto) denies outright, without needing a checks result', () => {
    const decision = buildMergeGateDecision({ parsed: { isMerge: true, forbiddenFlag: '--auto' } });
    expect(decision.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(decision.hookSpecificOutput?.permissionDecisionReason).toBe(MERGE_GATE_DENIED_FORBIDDEN_FLAG_REASON);
  });

  test('a forbidden flag (--admin) denies outright', () => {
    const decision = buildMergeGateDecision({ parsed: { isMerge: true, forbiddenFlag: '--admin' } });
    expect(decision.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  test('a missing checks exec result denies fail-closed', () => {
    const decision = buildMergeGateDecision({ parsed: { isMerge: true } });
    expect(decision.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(decision.hookSpecificOutput?.permissionDecisionReason).toBe(MERGE_GATE_DENIED_CHECKS_ERROR_REASON);
  });

  test('gh pr checks itself erroring (non-zero exit) denies fail-closed', () => {
    const decision = buildMergeGateDecision({
      parsed: { isMerge: true, prRef: '188' },
      checksExec: { stdout: '', exitCode: 1 },
    });
    expect(decision.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(decision.hookSpecificOutput?.permissionDecisionReason).toBe(MERGE_GATE_DENIED_CHECKS_ERROR_REASON);
  });

  test('a red check denies with the steering reason (A2 replay: one red check)', () => {
    const decision = buildMergeGateDecision({
      parsed: { isMerge: true, prRef: '188' },
      checksExec: { stdout: JSON.stringify([{ name: 'format-check', state: 'FAILURE' }]), exitCode: 0 },
    });
    expect(decision.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(decision.hookSpecificOutput?.permissionDecisionReason).toBe(
      mergeGateNotGreenReason('188', ['format-check: FAILURE']),
    );
  });

  test('all-SUCCESS checks allow (empty decision)', () => {
    const decision = buildMergeGateDecision({
      parsed: { isMerge: true, prRef: '188' },
      checksExec: { stdout: JSON.stringify([{ name: 'format-check', state: 'SUCCESS' }]), exitCode: 0 },
    });
    expect(decision).toEqual({});
  });
});

describe('deny reason content — steers, not just refuses', () => {
  test('the forbidden-flag reason names both --auto and --admin and their specific hazards', () => {
    expect(MERGE_GATE_DENIED_FORBIDDEN_FLAG_REASON).toContain('--auto');
    expect(MERGE_GATE_DENIED_FORBIDDEN_FLAG_REASON).toContain('--admin');
  });

  test('the checks-error reason is the exact fail-closed instruction', () => {
    expect(MERGE_GATE_DENIED_CHECKS_ERROR_REASON).toContain('could not verify checks');
    expect(MERGE_GATE_DENIED_CHECKS_ERROR_REASON).toContain('gh pr checks');
  });

  test('the not-green reason instructs a foreground --watch retry and a NEEDS_DIRECTION escalation path', () => {
    const reason = mergeGateNotGreenReason('188', ['format-check: FAILURE']);
    expect(reason).toContain('gh pr checks 188 --watch');
    expect(reason).toContain('600000');
    expect(reason).toContain('NEEDS_DIRECTION');
  });

  test('the not-green reason omits the ref when none was parsed', () => {
    const reason = mergeGateNotGreenReason(undefined, ['format-check: FAILURE']);
    expect(reason).toContain('gh pr checks --watch');
    expect(reason).not.toContain('gh pr checks undefined');
  });
});
