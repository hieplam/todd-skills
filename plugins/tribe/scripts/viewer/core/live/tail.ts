/**
 * Pure tail state machine (card D2, spec D8). The adapter stats the transcript
 * file and reads only the bytes past `state.offset`; this function turns those
 * bytes into complete lines and carries any partial final line to the next
 * tick. No filesystem, clock, or global state — the chunk, the byte count it
 * was decoded from, and the file size all arrive as arguments.
 *
 * `advanceTail` never advances `offset` past what was actually read: the new
 * offset is always `base.offset + consumedBytes`, where `consumedBytes` is the
 * caller-reported number of RAW bytes the chunk was decoded from — never
 * `chunk.length` (a character count, not a byte count) and never `fileSize`
 * (the file may have grown since the read, or the read itself may have
 * returned fewer bytes than were available — a single `readSync` is not
 * guaranteed to fill its buffer). Trusting `fileSize` instead of the real
 * read length would mark unread bytes "consumed" and silently lose them
 * forever (F56) — `fileSize` is used ONLY to detect a shrink/rotate below,
 * never to compute the new offset.
 *
 * A `fileSize` smaller than `state.offset` means the file was truncated and
 * rewritten (or rotated). On that tick the caller can only have read bytes
 * past the OLD offset, which is no longer a valid range — so `chunk` (and
 * `consumedBytes`) may be empty/zero. The shrink branch resets `base` to
 * offset 0 before applying `consumedBytes`, so no unread byte is ever marked
 * "consumed". `reset` is `true` exactly on the tick the shrink branch fires,
 * telling a caller that already read from the stale offset to re-read from
 * zero immediately rather than waiting a tick.
 */
export interface TailState {
  offset: number;
  carry: string;
}

export function initialTailState(): TailState {
  return { offset: 0, carry: '' };
}

export function advanceTail(
  state: TailState,
  chunk: string,
  consumedBytes: number,
  fileSize: number,
): { state: TailState; lines: string[]; reset: boolean } {
  const reset = fileSize < state.offset;
  const base = reset ? initialTailState() : state;
  const combined = base.carry + chunk;
  const parts = combined.split('\n');
  const carry = parts.pop() ?? '';
  const lines = parts.map((line) => line.replace(/\r$/, '')).filter((line) => line.length > 0);
  // The offset only ever advances by the bytes actually consumed, on top of
  // whatever base offset this tick started from (0 on a reset tick, the
  // carried-over offset otherwise). Never `fileSize` — see the doc comment.
  const offset = base.offset + consumedBytes;
  return { state: { offset, carry }, lines, reset };
}
