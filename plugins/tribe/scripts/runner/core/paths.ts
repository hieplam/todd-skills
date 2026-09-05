/**
 * Pure path math for a campaign's machine-local home (`--home`, i.e.
 * `~/.tribe/<repo-key>/campaigns/<slug>/`). One campaign per home, so every artifact
 * has a fixed name and needs no CLI flag. No IO, no clock, no fs — string math only.
 */
import { join } from 'node:path';

export const CAMPAIGN_STATE_FILENAME = 'campaign-state.json';
export const ANSWERS_FILENAME = 'answers.md';
export const ESCALATIONS_DIRNAME = 'escalations';

/** `<home>/campaign-state.json` */
export function campaignStatePathOf(homeDir: string): string {
  return join(homeDir, CAMPAIGN_STATE_FILENAME);
}

/** `<home>/answers.md` */
export function answersPathOf(homeDir: string): string {
  return join(homeDir, ANSWERS_FILENAME);
}

/** `<home>/escalations` */
export function escalationsDirOf(homeDir: string): string {
  return join(homeDir, ESCALATIONS_DIRNAME);
}

/** `<home>/escalations/<cardId>.md` */
export function escalationPathOf(homeDir: string, cardId: string): string {
  return join(escalationsDirOf(homeDir), `${cardId}.md`);
}

/** Where `campaign-report.json`/`.md`, `.runner.lock` and `STOP` live: the home itself. */
export function reportDirOf(homeDir: string): string {
  return homeDir;
}

export const DRIFT_DIRNAME = 'drift';

/** `<home>/drift` — card i75: one digest file per card, written only by the watchdog. */
export function driftDirOf(homeDir: string): string {
  return join(homeDir, DRIFT_DIRNAME);
}

/** `<home>/drift/<cardId>.md` */
export function driftPathOf(homeDir: string, cardId: string): string {
  return join(driftDirOf(homeDir), `${cardId}.md`);
}
