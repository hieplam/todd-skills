/**
 * Pure tail state machine (card D2, spec D8). The adapter stats the transcript
 * file and reads only the bytes past `state.offset`; this function turns those
 * bytes into complete lines and carries any partial final line to the next
 * tick. No filesystem, clock, or global state — the chunk and file size arrive
 * as arguments.
 *
 * A `fileSize` smaller than `state.offset` means the file was truncated and
 * rewritten (or rotated). On that tick the caller can only have read bytes
 * past the OLD offset, which is no longer a valid range — so `chunk` may be
 * empty. `advanceTail` therefore never advances `offset` past what `chunk`
 * actually accounted for: when the shrink branch fires, the returned state's
 * `offset` reflects only the (possibly empty) chunk just processed, so no
 * unread byte is ever marked "consumed". `reset` is `true` exactly on the
 * tick the shrink branch fires, telling a caller that already read from the
 * stale offset to re-read from zero immediately rather than waiting a tick.
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
  fileSize: number,
): { state: TailState; lines: string[]; reset: boolean } {
  const reset = fileSize < state.offset;
  const base = reset ? initialTailState() : state;
  const combined = base.carry + chunk;
  const parts = combined.split('\n');
  const carry = parts.pop() ?? '';
  const lines = parts.map((line) => line.replace(/\r$/, '')).filter((line) => line.length > 0);
  // On the reset tick, an empty chunk means the caller could not yet have
  // read any of the rewritten bytes (the pre-shrink offset was out of range),
  // so nothing may be marked consumed: offset stays 0, not fileSize. A
  // non-empty chunk on the reset tick means the caller already read exactly
  // that range, so fileSize (a byte count, unlike chunk.length) is trusted
  // as before.
  const offset = reset && chunk.length === 0 ? 0 : fileSize;
  return { state: { offset, carry }, lines, reset };
}
