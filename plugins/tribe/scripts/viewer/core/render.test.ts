import { describe, expect, test } from 'bun:test';
import { renderPage } from './render.ts';
import type { CampaignStatus } from './model.ts';

function statusWith(overrides: Partial<CampaignStatus>): CampaignStatus {
  return {
    repoKey: '-Users-todd-ai-dict',
    campaignSlug: 'camp',
    homeDir: '/home/u/.tribe/-Users-todd-ai-dict/campaigns/camp',
    liveness: { kind: 'never_run' },
    stopRequested: false,
    cards: [],
    pendingEscalations: [],
    reports: [],
    sessionTail: null,
    errors: [],
    ...overrides,
  };
}

const META = { tribeRoot: '/home/u/.tribe', nowIso: '2026-07-24T06:13:59.000Z' };

describe('renderPage', () => {
  test('HTML-escapes dynamic strings (a hostile campaign slug cannot inject markup)', () => {
    const html = renderPage(
      [statusWith({ campaignSlug: '<script>alert(1)</script>' })],
      META,
    );

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
  });

  test('contains the honest-labeling header line', () => {
    const html = renderPage([statusWith({})], META);

    expect(html).toContain('Read-only view of on-disk state. GitHub is authority for PR/merge truth.');
  });

  test('a crashed campaign renders the CRASHED badge text', () => {
    const html = renderPage(
      [statusWith({ liveness: { kind: 'crashed', pid: 9999, startedAt: '2026-07-17T00:00:00.000Z', runId: 'r1' } })],
      META,
    );

    expect(html).toContain('CRASHED');
  });

  test('a running campaign renders the RUNNING badge text', () => {
    const html = renderPage(
      [statusWith({ liveness: { kind: 'running', pid: 111, startedAt: '2026-07-24T06:00:00.000Z', runId: 'r1' } })],
      META,
    );

    expect(html).toContain('RUNNING');
  });

  test('STOP renders a banner when stopRequested', () => {
    const html = renderPage([statusWith({ stopRequested: true })], META);

    expect(html).toMatch(/STOP/);
  });

  test('a cards:{error} snapshot renders the error panel and still renders the liveness badge', () => {
    const html = renderPage(
      [
        statusWith({
          liveness: { kind: 'running', pid: 111, startedAt: '2026-07-24T06:00:00.000Z', runId: 'r1' },
          cards: { error: 'Unexpected token in JSON' },
        }),
      ],
      META,
    );

    expect(html).toContain('Unexpected token in JSON');
    expect(html).toContain('RUNNING');
  });

  test('session tail lines render inside a <pre> block, HTML-escaped', () => {
    const html = renderPage(
      [
        statusWith({
          sessionTail: {
            file: 'session.log',
            ageSeconds: 30,
            sizeBytes: 4096,
            lines: ['<b>not html</b>', 'plain line'],
          },
        }),
      ],
      META,
    );

    const preMatch = /<pre[^>]*>([\s\S]*?)<\/pre>/.exec(html);
    expect(preMatch).not.toBeNull();
    expect(preMatch![1]).toContain('&lt;b&gt;not html&lt;/b&gt;');
    expect(preMatch![1]).toContain('plain line');
  });

  test('empty statuses list renders a friendly empty-state page, not an error', () => {
    const html = renderPage([], META);

    expect(html).toContain('no campaigns recorded yet');
  });

  test('renders card table rows with status, pr, updatedAt, blockedOn', () => {
    const html = renderPage(
      [
        statusWith({
          cards: [
            { id: 'C1', status: 'shipped', pr: 12, updatedAt: '2026-07-24T05:00:00.000Z', dependsOn: [], blockedOn: null },
            { id: 'C2', status: 'blocked', pr: null, updatedAt: null, dependsOn: ['C1'], blockedOn: 'C1' },
          ],
        }),
      ],
      META,
    );

    expect(html).toContain('C1');
    expect(html).toContain('shipped');
    expect(html).toContain('12');
    expect(html).toContain('C2');
    expect(html).toContain('blocked');
  });

  test('renders pending escalation reason text inline', () => {
    const html = renderPage(
      [
        statusWith({
          pendingEscalations: [{ cardId: 'C3', reason: 'Need clarification on <merge>', raw: 'raw text' }],
        }),
      ],
      META,
    );

    expect(html).toContain('Need clarification on &lt;merge&gt;');
  });
});
