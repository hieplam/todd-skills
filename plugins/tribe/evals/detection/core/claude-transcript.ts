// module: core/claude-transcript
export type TranscriptResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export function extractFinalResult(lines: string[]): TranscriptResult {
  let resultEvent: { result?: string; is_error?: boolean } | null = null;
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed);
    } catch (e) {
      return { ok: false, error: `bad JSON on line ${i + 1}: ${(e as Error).message}` };
    }
    if (event.type === 'result') resultEvent = event as { result?: string; is_error?: boolean };
  }
  if (!resultEvent) return { ok: false, error: 'no result event found in stream' };
  if (resultEvent.is_error) return { ok: false, error: `result event reported an error: ${resultEvent.result ?? ''}` };
  return { ok: true, text: resultEvent.result ?? '' };
}
