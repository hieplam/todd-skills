// module: core/scoring
import type { GraderConventionVerdict, ScoreResult, Tier } from './types';

export interface ScoringInput {
  verdicts: GraderConventionVerdict[];
  seeded: { id: string; tier?: Tier }[];
  decoysFlagged: string[];
  invented: string[];
}

export function score(input: ScoringInput): ScoreResult {
  const byId = new Map(input.verdicts.map((v) => [v.id, v.verdict]));
  let caught = 0;
  let partial = 0;
  let missed = 0;
  for (const s of input.seeded) {
    const v = byId.get(s.id) ?? 'missed';
    if (v === 'caught') caught++;
    else if (v === 'partial') partial++;
    else missed++;
  }
  const seeded = input.seeded.length;
  const recall = seeded === 0 ? 0 : (caught + 0.5 * partial) / seeded;
  const fpDenominator = caught + input.decoysFlagged.length + input.invented.length;
  const precision = fpDenominator === 0 ? 1 : caught / fpDenominator;
  const easyIds = input.seeded.filter((s) => s.tier === 'easy').map((s) => s.id);
  let easyTierRecall: number | null = null;
  if (easyIds.length > 0) {
    const easyCaught = easyIds.filter((id) => byId.get(id) === 'caught').length;
    const easyPartial = easyIds.filter((id) => byId.get(id) === 'partial').length;
    easyTierRecall = (easyCaught + 0.5 * easyPartial) / easyIds.length;
  }
  return {
    recall, precision, easyTierRecall, caught, partial, missed,
    decoysFlagged: input.decoysFlagged.length, invented: input.invented.length, seeded,
  };
}
