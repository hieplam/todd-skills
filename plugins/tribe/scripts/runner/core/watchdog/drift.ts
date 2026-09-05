/**
 * Card i75 — upstream drift detection, pure core. Selects which running cards the watchdog
 * tick must check for drift against their base branch (spec §2.1: "for each card whose
 * runner status is `running` and whose `baseSha` is set"), and the small pure helpers the
 * tick needs to talk to git without a new CLI flag (W75-9). Pure string and JSON math only:
 * no fs, no clock, no subprocess, no import of anything outside `node:path` (which this file
 * does not even need). `core/state.ts` owns campaign-state.json's real schema and is a
 * schemaLockPath — this module reads three fields defensively and is deliberately tolerant
 * of everything else in the document.
 */

export type DriftCard = {
  cardId: string;
  baseSha: string;
  branch: string | null;
};

export type SelectDriftCardsResult = {
  cards: DriftCard[];
  warn: string | null;
};

/** A non-empty string after trimming; `undefined`/`null`/blank all read as absent. */
function nonBlankString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null;
}

/** Spec §2.1's selection condition, applied defensively over an untrusted JSON document
 * (W75-10: fail closed — a missing file, bad JSON or missing `cards` object selects nothing
 * and warns, never throws, never selects a false positive). Only `SyntaxError` from
 * `JSON.parse` is caught (`fail-closed-edges` obligation 1: narrow catch, typed refusal); any
 * other error propagates. */
export function selectDriftCards(rawStateJson: string): SelectDriftCardsResult {
  if (rawStateJson === '') {
    return { cards: [], warn: 'campaign-state.json is missing or unreadable' };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawStateJson);
  } catch (err) {
    if (err instanceof SyntaxError) {
      return { cards: [], warn: 'campaign-state.json is not valid JSON' };
    }
    throw err;
  }

  const cardsRaw = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>).cards : undefined;
  if (!cardsRaw || typeof cardsRaw !== 'object') {
    return { cards: [], warn: 'campaign-state.json has no cards object' };
  }

  const cards: DriftCard[] = [];
  for (const [cardId, cardRaw] of Object.entries(cardsRaw as Record<string, unknown>)) {
    if (!cardRaw || typeof cardRaw !== 'object') continue;
    const card = cardRaw as Record<string, unknown>;
    if (card.status !== 'running') continue;
    const baseSha = nonBlankString(card.baseSha);
    if (baseSha === null) continue;
    cards.push({ cardId, baseSha, branch: nonBlankString(card.branch) });
  }
  cards.sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));

  return { cards, warn: null };
}

/** W75-9: no new watchdog flag — read the remote name out of the runner's already-existing
 * `--remote` pass-through, defaulting to `origin` when absent or dangling (the last element
 * of argv). */
export function remoteFromPassthrough(argv: string[]): string {
  const idx = argv.indexOf('--remote');
  if (idx === -1) return 'origin';
  const value = argv[idx + 1];
  return value === undefined ? 'origin' : value;
}

/** Pure parse of `git symbolic-ref --short refs/remotes/<remote>/HEAD`, with the runner's own
 * `master` fallback. DELIBERATELY duplicated from `core/loop/run-loop.ts`'s `resolveBaseBranch`:
 * `structure.test.ts`'s "leaf core modules never import the orchestrator" test forbids
 * `core/watchdog/**` importing `core/loop/**`, and that test is the layout contract, not a
 * preference. Four lines of pure string math is the cheaper side of that trade. */
export function parseBaseBranch(stdout: string, exitCode: number, remote: string): string {
  if (exitCode !== 0) return 'master';
  const trimmed = stdout.trim();
  const prefix = `${remote}/`;
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed || 'master';
}
