// module: core/orchestrate
import { buildGraderPrompt } from './prompts';
import { parseGraderVerdict } from './verdict-parsing';
import type { Arm, GraderVerdict, Leg, Manifest } from './types';

export interface DetectorPort {
  run(input: { leg: Leg; arm: Arm; scratchDir: string; agentPath: string; model?: string }): Promise<{ report: string }>;
}

export interface GraderPort {
  run(input: { prompt: string }): Promise<{ text: string }>;
}

export interface CellResult {
  verdict: GraderVerdict | null;
  ungraded: boolean;
  error?: string;
  detectorReport: string;
}

export async function runCell(input: {
  leg: Leg;
  arm: Arm;
  scratchDir: string;
  agentPath: string;
  model?: string;
  manifest: Manifest;
  detector: DetectorPort;
  grader: GraderPort;
}): Promise<CellResult> {
  const detectorResult = await input.detector.run({
    leg: input.leg, arm: input.arm, scratchDir: input.scratchDir, agentPath: input.agentPath, model: input.model,
  });
  const graderPrompt = buildGraderPrompt({ leg: input.leg, manifest: input.manifest, detectorReport: detectorResult.report });

  let graderResponse = await input.grader.run({ prompt: graderPrompt });
  let parsed = parseGraderVerdict(graderResponse.text);
  if (!parsed.ok) {
    graderResponse = await input.grader.run({ prompt: graderPrompt });
    parsed = parseGraderVerdict(graderResponse.text);
  }
  if (!parsed.ok) {
    return { verdict: null, ungraded: true, error: parsed.error, detectorReport: detectorResult.report };
  }
  return { verdict: parsed.value, ungraded: false, detectorReport: detectorResult.report };
}
