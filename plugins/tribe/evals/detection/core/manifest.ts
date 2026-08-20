// module: core/manifest
import type { ConventionEntry, DecoyEntry, Manifest, Tier } from './types';

const TIERS: Tier[] = ['easy', 'medium', 'hard'];

export type ValidationResult =
  | { ok: true; value: Manifest }
  | { ok: false; errors: string[] };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function validateConvention(c: unknown, idx: number, errors: string[]): c is ConventionEntry {
  if (typeof c !== 'object' || c === null) {
    errors.push(`conventions[${idx}]: not an object`);
    return false;
  }
  const rec = c as Record<string, unknown>;
  if (!isNonEmptyString(rec.id)) errors.push(`conventions[${idx}]: missing/invalid id`);
  if (!TIERS.includes(rec.tier as Tier)) errors.push(`conventions[${idx}] (${rec.id}): invalid tier '${String(rec.tier)}'`);
  if (!isNonEmptyString(rec.description)) errors.push(`conventions[${idx}] (${rec.id}): missing description`);
  if (!isStringArray(rec.exemplars) || rec.exemplars.length < 3) {
    errors.push(`conventions[${idx}] (${rec.id}): exemplars must be a string[] with length >= 3`);
  }
  const dev = rec.deviation as Record<string, unknown> | undefined;
  if (typeof dev !== 'object' || dev === null || !isNonEmptyString(dev.file) ||
      typeof dev.line !== 'number' || !isNonEmptyString(dev.note)) {
    errors.push(`conventions[${idx}] (${rec.id}): deviation must be {file, line, note}`);
  }
  if (!isNonEmptyString(rec.expected_detection)) errors.push(`conventions[${idx}] (${rec.id}): missing expected_detection`);
  return errors.length === 0;
}

function validateDecoy(d: unknown, idx: number, errors: string[]): d is DecoyEntry {
  if (typeof d !== 'object' || d === null) {
    errors.push(`decoys[${idx}]: not an object`);
    return false;
  }
  const rec = d as Record<string, unknown>;
  if (!isNonEmptyString(rec.id)) errors.push(`decoys[${idx}]: missing/invalid id`);
  if (!isNonEmptyString(rec.description)) errors.push(`decoys[${idx}] (${rec.id}): missing description`);
  if (!isStringArray(rec.exemplars) || rec.exemplars.length < 3) {
    errors.push(`decoys[${idx}] (${rec.id}): exemplars must be a string[] with length >= 3`);
  }
  return true;
}

export function validateManifest(data: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof data !== 'object' || data === null) {
    return { ok: false, errors: ['manifest: not an object'] };
  }
  const rec = data as Record<string, unknown>;
  if (!isNonEmptyString(rec.fixture)) errors.push('manifest: missing fixture name');
  if (!Array.isArray(rec.conventions)) {
    errors.push('manifest: conventions must be an array');
  } else {
    rec.conventions.forEach((c, i) => validateConvention(c, i, errors));
  }
  if (!Array.isArray(rec.decoys)) {
    errors.push('manifest: decoys must be an array');
  } else {
    rec.decoys.forEach((d, i) => validateDecoy(d, i, errors));
  }
  const legB = rec.legB as Record<string, unknown> | undefined;
  const conventionIds = Array.isArray(rec.conventions)
    ? (rec.conventions as Record<string, unknown>[]).map((c) => c.id).filter(isNonEmptyString)
    : [];
  if (typeof legB !== 'object' || legB === null || !isNonEmptyString(legB.patch) || !isStringArray(legB.violates)) {
    errors.push('manifest: legB must be {patch: string, violates: string[]}');
  } else {
    for (const v of legB.violates) {
      if (!conventionIds.includes(v)) errors.push(`manifest: legB.violates references unknown convention id '${v}'`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: data as Manifest };
}
