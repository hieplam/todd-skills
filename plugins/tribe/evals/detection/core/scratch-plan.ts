// module: core/scratch-plan
import type { Arm, Leg, ScratchPlan } from './types';

export function planScratch(input: {
  fixtureFiles: string[];
  leg: Leg;
  arm: Arm;
  memoryFixtureFiles?: { path: string; content: string }[];
  patchPath?: string;
}): ScratchPlan {
  const excludePaths = input.fixtureFiles.filter((f) => f.includes('manifest'));
  const copyFiles = input.fixtureFiles.filter((f) => !f.includes('manifest'));
  return {
    copyFrom: 'fixtures/orderly',
    copyFiles,
    excludePaths,
    applyPatch: input.leg === 'tracker' ? (input.patchPath ?? 'diffs/orderly-pr1.patch') : null,
    memoryFiles: input.arm === 'mem' ? (input.memoryFixtureFiles ?? []) : [],
    assertNoMemory: input.arm === 'clean',
  };
}
