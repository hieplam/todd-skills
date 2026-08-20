// module: core/claude-transcript
export type TranscriptResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export function extractFinalResult(lines: string[]): TranscriptResult {
  let resultEvent: { result?: string; is_error?: boolean } | null = null;
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch (e) {
      if (resultEvent) continue;
      return { ok: false, error: `bad JSON on line ${i + 1}: ${(e as Error).message}` };
    }
    if (typeof parsed !== 'object' || parsed === null) {
      if (resultEvent) continue;
      return { ok: false, error: `line ${i + 1} did not parse to an object: ${trimmed}` };
    }
    const event = parsed as Record<string, unknown>;
    if (event.type === 'result') resultEvent = event as { result?: string; is_error?: boolean };
  }
  if (!resultEvent) return { ok: false, error: 'no result event found in stream' };
  if (resultEvent.is_error) return { ok: false, error: `result event reported an error: ${resultEvent.result ?? ''}` };
  return { ok: true, text: resultEvent.result ?? '' };
}
