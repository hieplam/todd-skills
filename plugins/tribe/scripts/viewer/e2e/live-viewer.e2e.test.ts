import { expect, test } from 'bun:test';

const ENABLED = process.env.TRIBE_VIEWER_E2E === '1';

test.skipIf(!ENABLED)('a real haiku campaign renders parent and subagent, tailed inside 2s', async () => {
  const { runCampaignFixture } = await import('./harness.ts');
  const run = await runCampaignFixture({ model: 'claude-haiku-4-5-20251001', sessionTimeout: '6m' });
  try {
    const processes = await run.waitForProcesses((nodes) =>
      nodes.some((n) => n.kind === 'session') && nodes.some((n) => n.kind === 'subagent'), 300_000);
    expect(processes.filter((n) => n.kind === 'subagent').length).toBeGreaterThanOrEqual(1);

    const latencies = await run.measureAppendLatencies(5, 120_000);
    const worst = Math.max(...latencies);
    expect(worst).toBeLessThanOrEqual(2000);

    await run.writeEvidence({ processes, latencies, worst });
  } finally {
    await run.stop();
  }
}, 900_000);
