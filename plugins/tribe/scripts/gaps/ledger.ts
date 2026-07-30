// Gap-registry ledger: event schema, parsing, latest-status folding, id minting,
// serialization (Task 1, spec §3 "Gap registry & reconciliation").
//
// Pure module: no `fs`, no `child_process`, no network I/O. IO (reading/writing
// `.tribe/harness-gaps.jsonl`, running fingerprints) lives in the CLI files
// (`gap-reconcile.ts`, `gap-precision.ts`), never here.

/** Spec §3: the ruling a human records on a gap once decided. */
export type Disposition = 'rule' | 'anti-rule' | 'debt' | 'dismissed' | 'dismissed-duplicate';

/** Spec §3: a gap is first minted with an `opened` event — its identity (`id`), the
 * risk category it was detected under, the paths it covers, the frozen `fingerprint`
 * grep that re-detects it, the hit count at detection time, and the PR it was first
 * seen in. */
export interface OpenedEvent {
  id: string;
  event: 'opened';
  category: string;
  paths: string[];
  fingerprint: string;
  hits_at_detection: number;
  first_seen_pr: number;
}

/** Spec §3: an already-open gap fires again in a later PR — appended, never mutates
 * the `opened` event (append-only ledger). */
export interface SeenEvent {
  id: string;
  event: 'seen';
  pr: number;
  hits_now: number;
}

/** Spec §3: a human rules on a gap. `ref` names the artifact the ruling produced
 * (a rule id, an anti-rule id, or a free-form note for `dismissed`/`dismissed-duplicate`).
 * `ratified_by` (spec §2/§6, CU-3) records who ratified the ruling — `'owner'` in an attended
 * session, `'shaman'` on the owner's behalf in an unattended campaign. Optional so CU-2 `ruled`
 * lines (minted before this field existed) still parse unchanged. */
export interface RuledEvent {
  id: string;
  event: 'ruled';
  disposition: Disposition;
  ref: string;
  ratified_by?: 'owner' | 'shaman';
}

/** The three JSONL event kinds, discriminated on `event` (spec §3). */
export type GapEvent = OpenedEvent | SeenEvent | RuledEvent;

/** Parses raw ledger text (one JSON object per line, per spec §3) into typed events,
 * in the same order they appear in the text (ledger append order). Blank lines
 * (a trailing newline, or a stray blank line) are skipped rather than producing
 * empty entries. */
export function parseLedger(text: string): GapEvent[] {
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as GapEvent);
}

/** Folds an ordered event list to the latest event per id — "the latest event per id
 * defines its status" (spec §3). Events must be supplied in ledger (chronological)
 * order; each id's entry in the returned map is simply overwritten by every later
 * event for that same id, so the last one to arrive wins. */
export function foldToLatestStatus(events: readonly GapEvent[]): Map<string, GapEvent> {
  const status = new Map<string, GapEvent>();
  for (const event of events) {
    status.set(event.id, event);
  }
  return status;
}

const ID_PATTERN = /^G-(\d+)$/;

/** Mints the next sequential gap id: `G-` + zero-padded(max existing numeric suffix + 1)
 * (plan Task 1's minting rule). `existingIds` must include ALL ids ever minted —
 * including ids whose latest event is `ruled` (suppressed) — so a ruled gap's id is
 * never reused. Zero-pads to a minimum of 3 digits (`G-001`..`G-999`) but never
 * truncates once the numeric suffix reaches 4+ digits (`G-999` -> `G-1000`). */
export function mintNextId(existingIds: readonly string[]): string {
  let maxNumber = 0;
  for (const id of existingIds) {
    const match = ID_PATTERN.exec(id);
    if (!match) continue;
    const number = Number(match[1]);
    if (number > maxNumber) {
      maxNumber = number;
    }
  }
  const next = maxNumber + 1;
  return `G-${String(next).padStart(3, '0')}`;
}

/** Serializes one event to a single compact JSON line, newline-terminated (spec §3:
 * "Append-only; one JSON event per line"). No pretty-printing — each event is exactly
 * one line so the ledger stays append-only and diff-friendly. */
export function serializeEvent(event: GapEvent): string {
  return `${JSON.stringify(event)}\n`;
}
