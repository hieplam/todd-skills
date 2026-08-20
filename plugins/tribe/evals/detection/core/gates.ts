// module: core/gates
import type { GateResult, ScoreResult } from './types';

export function evaluateLegAClean(scoreResult: ScoreResult, minRecall: number, minPrecision: number): GateResult[] {
  return [
    { id: 'G1', cell: 'legA-clean', threshold: minRecall, actual: scoreResult.recall, pass: scoreResult.recall >= minRecall },
    { id: 'G2', cell: 'legA-clean', threshold: minPrecision, actual: scoreResult.precision, pass: scoreResult.precision >= minPrecision },
    { id: 'G3', cell: 'legA-clean', threshold: 1.0, actual: scoreResult.easyTierRecall ?? 0, pass: (scoreResult.easyTierRecall ?? 0) === 1.0 },
  ];
}

export function evaluateLegBClean(gapRecall: number, inventedViolations: number): GateResult[] {
  return [
    { id: 'G4', cell: 'legB-clean', threshold: 0.75, actual: gapRecall, pass: gapRecall >= 0.75 },
    { id: 'G5', cell: 'legB-clean', threshold: 0, actual: inventedViolations, pass: inventedViolations === 0 },
  ];
}

export function repetitionPasses(gateResults: GateResult[]): boolean {
  return gateResults.every((g) => g.pass);
}

export function cellPasses(repetitionResults: boolean[]): boolean {
  return repetitionResults.filter(Boolean).length >= 2;
}

export function topLevelPass(cells: { legAClean: boolean; legBClean: boolean }): boolean {
  return cells.legAClean && cells.legBClean;
}

export function memDelta(mem: ScoreResult, clean: ScoreResult): { deltaRecall: number; deltaPrecision: number } {
  return { deltaRecall: mem.recall - clean.recall, deltaPrecision: mem.precision - clean.precision };
}
