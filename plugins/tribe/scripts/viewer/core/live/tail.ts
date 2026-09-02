/**
 * Pure tail state machine (card D2, spec D8). The adapter stats the transcript
 * file and reads only the bytes past `state.offset`; this function turns those
 * bytes into complete lines and carries any partial final line to the next
 * tick. No filesystem, clock, or global state — the chunk and file size arrive
 * as arguments.
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
): { state: TailState; lines: string[] } {
  const base = fileSize < state.offset ? initialTailState() : state;
  const combined = base.carry + chunk;
  const parts = combined.split('\n');
  const carry = parts.pop() ?? '';
  const lines = parts.map((line) => line.replace(/\r$/, '')).filter((line) => line.length > 0);
  return { state: { offset: fileSize, carry }, lines };
}
