// module: core/seeded-conventions
import type { Leg, Manifest, Tier } from './types';

// Which conventions a given leg scores against: scout is graded on the full manifest, tracker
// is graded only on the subset the seeded patch (legB.patch) actually violates. Pure — a
// manifest + a leg in, a filtered id/tier list out — so both the prompt-building edge
// (core/prompts.ts) and the scoring-path edge (run.ts) can share one implementation instead of
// each reimplementing the same filter.
export function selectSeededConventions(manifest: Manifest, leg: Leg): { id: string; tier: Tier }[] {
  const conventions = leg === 'scout'
    ? manifest.conventions
    : manifest.conventions.filter((c) => manifest.legB.violates.includes(c.id));
  return conventions.map((c) => ({ id: c.id, tier: c.tier }));
}
