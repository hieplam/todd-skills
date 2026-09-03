import { expect, test } from 'bun:test';
import { campaignKeyOf, decideViewerLaunch, viewerUrlFor } from './viewer-launch.ts';

const home = '/Users/hip/.tribe/-Users-hip-repo-x/campaigns/my-campaign';
const base = { dryRun: false, disabled: false, port: 4321, homeDir: home, entryPath: '/p/viewer/serve.ts', entryExists: true, probeOk: false };

test('the campaign key and URL derive from --home alone, with nothing persisted (card D5)', () => {
  expect(campaignKeyOf(home)).toEqual({ repoKey: '-Users-hip-repo-x', slug: 'my-campaign' });
  expect(viewerUrlFor(home, 4321)).toBe('http://127.0.0.1:4321/live?repo=-Users-hip-repo-x&slug=my-campaign');
});

test('a dry run never spawns and never probes', () => {
  expect(decideViewerLaunch({ ...base, dryRun: true }).kind).toBe('skip');
});

test('an already-serving viewer is reused, not duplicated (card D6)', () => {
  const d = decideViewerLaunch({ ...base, probeOk: true });
  expect(d.kind).toBe('reuse');
  expect(d.url).toBe(viewerUrlFor(home, 4321));
});

test('otherwise it spawns bun against the sibling entry', () => {
  const d = decideViewerLaunch(base);
  expect(d.kind).toBe('spawn');
  expect(d.argv).toEqual(['bun', '/p/viewer/serve.ts', '--port', '4321']);
});

test('--no-viewer and a missing entry both degrade to skip with a reason', () => {
  expect(decideViewerLaunch({ ...base, disabled: true }).kind).toBe('skip');
  const missing = decideViewerLaunch({ ...base, entryExists: false });
  expect(missing.kind).toBe('skip');
  expect(missing.note).toContain('serve.ts');
});
