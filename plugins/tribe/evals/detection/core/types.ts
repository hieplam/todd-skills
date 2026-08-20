// module: core/types
export type Tier = 'easy' | 'medium' | 'hard';

export interface ConventionEntry {
  id: string;
  tier: Tier;
  description: string;
  exemplars: string[];
  deviation: { file: string; line: number; note: string };
  expected_detection: string;
}

export interface DecoyEntry {
  id: string;
  description: string;
  exemplars: string[];
}

export interface Manifest {
  fixture: string;
  conventions: ConventionEntry[];
  decoys: DecoyEntry[];
  legB: { patch: string; violates: string[] };
}

export type Verdict = 'caught' | 'partial' | 'missed';

export interface GraderConventionVerdict {
  id: string;
  verdict: Verdict;
  evidence: string;
}

export interface GraderVerdict {
  conventions: GraderConventionVerdict[];
  decoys_flagged: string[];
  invented: string[];
}

export type Leg = 'scout' | 'tracker';
export type Arm = 'clean' | 'mem';

export interface ScratchPlan {
  copyFrom: string;
  copyFiles: string[];
  excludePaths: string[];
  applyPatch: string | null;
  memoryFiles: { path: string; content: string }[];
  assertNoMemory: boolean;
}

export interface ScoreResult {
  recall: number;
  precision: number;
  easyTierRecall: number | null;
  caught: number;
  partial: number;
  missed: number;
  decoysFlagged: number;
  invented: number;
  seeded: number;
}

export interface GateResult {
  id: 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
  cell: string;
  threshold: number;
  actual: number;
  pass: boolean;
}
