// module: core/verdict-parsing
import type { GraderVerdict, Verdict } from './types';

export type ParseResult =
  | { ok: true; value: GraderVerdict }
  | { ok: false; error: string };

const VERDICTS: Verdict[] = ['caught', 'partial', 'missed'];

export function parseGraderVerdict(raw: string): ParseResult {
  const stripped = raw.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch (e) {
    return { ok: false, error: `not valid JSON: ${(e as Error).message}` };
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'top-level value is not an object' };
  }
  const rec = data as Record<string, unknown>;
  if (!Array.isArray(rec.conventions)) {
    return { ok: false, error: 'missing conventions array' };
  }
  for (const c of rec.conventions as unknown[]) {
    if (typeof c !== 'object' || c === null) return { ok: false, error: 'a conventions[] entry is not an object' };
    const cr = c as Record<string, unknown>;
    if (typeof cr.id !== 'string') return { ok: false, error: 'a conventions[] entry is missing id' };
    if (!VERDICTS.includes(cr.verdict as Verdict)) {
      return { ok: false, error: `conventions[${cr.id}] has invalid verdict '${String(cr.verdict)}'` };
    }
  }
  if (!Array.isArray(rec.decoys_flagged) || !rec.decoys_flagged.every((x) => typeof x === 'string')) {
    return { ok: false, error: 'decoys_flagged must be a string[]' };
  }
  if (!Array.isArray(rec.invented) || !rec.invented.every((x) => typeof x === 'string')) {
    return { ok: false, error: 'invented must be a string[]' };
  }
  return { ok: true, value: data as GraderVerdict };
}
