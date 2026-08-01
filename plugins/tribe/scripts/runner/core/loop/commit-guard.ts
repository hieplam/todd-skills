import { serializeState } from '../state.ts';
import type { ResolvedConfig, CampaignState } from '../types.ts';
import type { LoopIO } from '../../ports/ports.ts';
import { campaignStatePathOf } from '../paths.ts';

/** Writes the campaign state JSON to disk. The runner never commits it. */
export function persistLocalState(state: CampaignState, resolved: ResolvedConfig, io: LoopIO): void {
  io.writeFile(campaignStatePathOf(resolved.homeDir), serializeState(state));
}
