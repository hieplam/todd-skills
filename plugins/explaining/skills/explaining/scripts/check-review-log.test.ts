import { describe, expect, test } from 'bun:test';
import {
  EXIT_CODE,
  LEAK_NGRAM,
  MAX_ROUNDS,
  evaluateLog,
  findLeakedNgram,
  formatSummary,
  main,
  missingInvariants,
  ngrams,
  normalizeWords,
  parseArgs,
  parseReviewLog,
  templateInvariants,
} from './check-review-log';

const INVARIANTS = ['You are a first-time reader.', 'SEVERITY: BLOCK or NIT'];
const PROMPT = 'Explain how a journaling log keeps a database durable and crash consistent across a restart of the process';

function brief(extra = ''): string {
  return `Read the file at draft.md. It was written for a backend developer, in English.\nYou are a first-time reader.\nSEVERITY: BLOCK or NIT\n${extra}`;
}

function round(n: number, blocks: number, extra = ''): string {
  const findings = [];
  for (let i = 0; i < blocks; i++) {
    findings.push({ severity: 'BLOCK', location: `phrase ${i}`, issue: 'could not follow' });
  }
  return JSON.stringify({
    round: n,
    reader_model: 'sonnet',
    brief: brief(extra),
    findings,
    block_count: blocks,
    verdict: blocks === 0 ? 'PASS' : 'FAIL',
    author_action: blocks === 0 ? '' : 'rewrote the second section',
  });
}

describe('parseReviewLog', () => {
  test('parses a well-formed two-round log', () => {
    const { rounds, errors } = parseReviewLog(`${round(1, 2)}\n${round(2, 0)}\n`);
    expect(errors).toEqual([]);
    expect(rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(rounds[0].block_count).toBe(2);
    expect(rounds[1].verdict).toBe('PASS');
  });

  test('an empty log is an error, not an empty success', () => {
    expect(parseReviewLog('\n  \n').errors).toContain('log is empty');
  });

  test('rejects a line that is not JSON', () => {
    const { errors } = parseReviewLog('not json at all\n');
    expect(errors[0]).toContain('not valid JSON');
  });

  test('rejects a block_count that disagrees with the findings', () => {
    const bad = JSON.stringify({ round: 1, brief: brief(), findings: [], block_count: 2, verdict: 'FAIL' });
    expect(parseReviewLog(bad).errors[0]).toContain('block_count');
  });

  test('rejects a verdict that contradicts the block count', () => {
    const bad = JSON.stringify({
      round: 1, brief: brief(),
      findings: [{ severity: 'BLOCK', location: 'a', issue: 'b' }],
      block_count: 1, verdict: 'PASS',
    });
    expect(parseReviewLog(bad).errors[0]).toContain('contradicts');
  });

  test('rejects a finding with an unknown severity', () => {
    const bad = JSON.stringify({
      round: 1, brief: brief(),
      findings: [{ severity: 'MAYBE', location: 'a', issue: 'b' }],
      block_count: 0, verdict: 'PASS',
    });
    expect(parseReviewLog(bad).errors[0]).toContain('severity');
  });

  test('a stale round 0 degrade record still errors even when a full PASS review follows it', () => {
    const degrade = JSON.stringify({
      round: 0, brief: brief(), findings: [], block_count: 0, verdict: 'FAIL',
      author_action: 'dispatch failed: the failure text, verbatim',
    });
    const { rounds, errors } = parseReviewLog(`${degrade}\n${round(1, 1)}\n${round(2, 0)}\n`);
    expect(errors.some((error) => error.includes('round 0'))).toBe(true);
    expect(rounds.map((r) => r.round)).toEqual([1, 2]);
  });
});

describe('leak detection', () => {
  test('normalizes to lowercase words and drops punctuation', () => {
    expect(normalizeWords('Read, the FILE at draft.md!')).toEqual(['read', 'the', 'file', 'at', 'draft', 'md']);
  });

  test('ngrams slides a window of n words', () => {
    expect(ngrams(['a', 'b', 'c'], 2)).toEqual(['a b', 'b c']);
  });

  test('finds a shared run of exactly the window length', () => {
    const twelve = PROMPT.split(' ').slice(0, LEAK_NGRAM).join(' ');
    expect(findLeakedNgram(brief(twelve), PROMPT, LEAK_NGRAM)).not.toBeNull();
  });

  test('a shorter overlap is legitimate and does not trip it', () => {
    const eleven = PROMPT.split(' ').slice(0, LEAK_NGRAM - 1).join(' ');
    expect(findLeakedNgram(brief(eleven), PROMPT, LEAK_NGRAM)).toBeNull();
  });
});

describe('template matching', () => {
  const template = [
    '# heading that is not part of the brief',
    '<!-- BRIEF-START -->',
    'Read the file at {{artifact_path}}.',
    '',
    'You are a first-time reader.',
    '<!-- BRIEF-END -->',
    'Rendering notes that must never be sent.',
  ].join('\n');

  test('takes only the non-slot lines between the markers', () => {
    expect(templateInvariants(template)).toEqual(['You are a first-time reader.']);
  });

  test('returns nothing when the markers are absent', () => {
    expect(templateInvariants('no markers here')).toEqual([]);
  });

  test('re-wrapped whitespace still matches', () => {
    expect(missingInvariants('You are\na first-time    reader.', ['You are a first-time reader.'])).toEqual([]);
  });

  test('reports the invariant line a rewritten brief dropped', () => {
    expect(missingInvariants('a brief of my own invention', INVARIANTS)).toEqual(INVARIANTS);
  });
});

describe('evaluateLog', () => {
  const opts = { invariants: INVARIANTS, prompt: PROMPT };

  test('accepts a review that reached PASS inside the cap', () => {
    const { rounds } = parseReviewLog(`${round(1, 2)}\n${round(2, 0)}`);
    expect(evaluateLog(rounds, opts)).toEqual({ ok: true, reasons: [] });
  });

  test('accepts a review that ran out at the cap still failing', () => {
    const { rounds } = parseReviewLog(`${round(1, 3)}\n${round(2, 2)}\n${round(3, 1)}`);
    expect(evaluateLog(rounds, opts).ok).toBe(true);
  });

  test('rejects a fourth round', () => {
    const { rounds } = parseReviewLog(`${round(1, 3)}\n${round(2, 2)}\n${round(3, 1)}\n${round(4, 0)}`);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain(`cap is ${MAX_ROUNDS}`);
  });

  test('rejects an empty round list', () => {
    expect(evaluateLog([], opts).reasons).toContain('no review round recorded');
  });

  test('rejects giving up before the cap while still failing', () => {
    const { rounds } = parseReviewLog(`${round(1, 3)}\n${round(2, 1)}`);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain('before the cap');
  });

  test('rejects a PASS round followed by more rounds', () => {
    const { rounds } = parseReviewLog(`${round(1, 0)}\n${round(2, 1)}`);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain('the loop continued');
  });

  test('rejects round numbers that are not consecutive from 1', () => {
    const { rounds } = parseReviewLog(`${round(2, 1)}\n${round(3, 0)}`);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain('consecutive');
  });

  test('rejects a brief that does not reproduce the template', () => {
    const bad = JSON.stringify({ round: 1, brief: 'read the file and tell me if it is good', findings: [], block_count: 0, verdict: 'PASS' });
    const { rounds } = parseReviewLog(bad);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain('does not match the template');
  });

  test('rejects a brief carrying a long run of the prompt', () => {
    const twelve = PROMPT.split(' ').slice(0, LEAK_NGRAM).join(' ');
    const { rounds } = parseReviewLog(`${round(1, 0, twelve)}`);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain('leaks');
  });

  test('require-catch demands a round-1 finding and a fall in round 2', () => {
    const clean = parseReviewLog(`${round(1, 0)}`).rounds;
    expect(evaluateLog(clean, { ...opts, requireCatch: true }).reasons.join(' ')).toContain('round 1 found no BLOCK');
    const flat = parseReviewLog(`${round(1, 2)}\n${round(2, 2)}\n${round(3, 2)}`).rounds;
    expect(evaluateLog(flat, { ...opts, requireCatch: true }).reasons.join(' ')).toContain('did not fall below');
    const good = parseReviewLog(`${round(1, 2)}\n${round(2, 0)}`).rounds;
    expect(evaluateLog(good, { ...opts, requireCatch: true }).ok).toBe(true);
  });

  test('require-catch is off by default, so a clean first read passes', () => {
    const clean = parseReviewLog(`${round(1, 0)}`).rounds;
    expect(evaluateLog(clean, opts).ok).toBe(true);
  });
});

describe('formatSummary', () => {
  test('prints one greppable line per log', () => {
    const { rounds } = parseReviewLog(`${round(1, 2)}\n${round(2, 0)}`);
    expect(formatSummary('draft.md.review.jsonl', rounds))
      .toBe('REVIEW-LOG: file=draft.md.review.jsonl rounds=2 blocks=2,0 verdict=PASS');
  });

  test('the exit codes are the harness three-outcome vocabulary', () => {
    expect(EXIT_CODE).toEqual({ PASS: 0, FAIL: 1, CANNOT_RUN: 2 });
  });
});

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEMPLATE_TEXT = [
  '# not part of the brief',
  '<!-- BRIEF-START -->',
  'Read the file at {{artifact_path}}. It was written for {{audience}}, in {{language}}.',
  'You are a first-time reader.',
  'SEVERITY: BLOCK or NIT',
  '<!-- BRIEF-END -->',
  'notes',
].join('\n');

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'check-review-log-'));
}

describe('parseArgs', () => {
  test('defaults the glob and the directory', () => {
    const args = parseArgs(['--prompt', 'p']);
    expect(args.logGlob).toBe('*.review.jsonl');
    expect(args.dir).toBe('.');
    expect(args.requireCatch).toBe(false);
    expect(args.error).toBeNull();
  });

  test('a missing --prompt is a setup error, not a verdict', () => {
    expect(parseArgs([]).error).toContain('--prompt');
  });

  test('an unknown flag is a setup error', () => {
    expect(parseArgs(['--prompt', 'p', '--nope']).error).toContain('unknown argument');
  });
});

describe('main() exit codes', () => {
  test('exits 2 when the arguments cannot be understood', async () => {
    expect(await main([])).toBe(EXIT_CODE.CANNOT_RUN);
  });

  test('exits 2 when the brief template cannot be read', async () => {
    const dir = scratch();
    try {
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', join(dir, 'absent.md')]))
        .toBe(EXIT_CODE.CANNOT_RUN);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exits 1 when no review log exists — the review did not happen', async () => {
    const dir = scratch();
    const template = join(dir, 'template.md');
    writeFileSync(template, TEMPLATE_TEXT);
    try {
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', template]))
        .toBe(EXIT_CODE.FAIL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exits 0 on a well-formed two-round log', async () => {
    const dir = scratch();
    const template = join(dir, 'template.md');
    writeFileSync(template, TEMPLATE_TEXT);
    writeFileSync(join(dir, 'draft.md.review.jsonl'), `${round(1, 2)}\n${round(2, 0)}\n`);
    try {
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', template]))
        .toBe(EXIT_CODE.PASS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exits 1 on a fourth round', async () => {
    const dir = scratch();
    const template = join(dir, 'template.md');
    writeFileSync(template, TEMPLATE_TEXT);
    writeFileSync(join(dir, 'draft.md.review.jsonl'),
      `${round(1, 3)}\n${round(2, 2)}\n${round(3, 1)}\n${round(4, 0)}\n`);
    try {
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', template]))
        .toBe(EXIT_CODE.FAIL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--require-catch turns a clean first read into a fail, for post-hoc tallying', async () => {
    const dir = scratch();
    const template = join(dir, 'template.md');
    writeFileSync(template, TEMPLATE_TEXT);
    writeFileSync(join(dir, 'draft.md.review.jsonl'), `${round(1, 0)}\n`);
    try {
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', template]))
        .toBe(EXIT_CODE.PASS);
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', template, '--require-catch']))
        .toBe(EXIT_CODE.FAIL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('ruling R1 message hardening', () => {
  test('the over-cap reason quotes the stop sentence from Rule 5', () => {
    const rounds = [1, 2, 3, 4].map((round) => ({
      round,
      brief: 'x',
      findings: [],
      block_count: 0,
      verdict: 'PASS' as const,
    }));
    const reasons = evaluateLog(rounds, { invariants: [], prompt: '' }).reasons.join(' ');
    expect(reasons).toContain(`cap is ${MAX_ROUNDS}`);
    expect(reasons).toContain('Round 3 is the last round. After its verdict, stop — even on FAIL.');
  });

  test('a round 0 record is named as the degrade record, not a type complaint', () => {
    const line = JSON.stringify({
      round: 0,
      brief: 'x',
      findings: [],
      block_count: 0,
      verdict: 'FAIL',
      author_action: 'dispatch failed: no such tool',
    });
    const { rounds, errors } = parseReviewLog(line);
    expect(rounds).toHaveLength(0);
    expect(errors.join(' ')).toContain('round 0');
    expect(errors.join(' ')).toContain('degrade');
  });
});
