/**
 * Pure module (P10, fix-list): the tribe never authenticates via `ANTHROPIC_API_KEY` —
 * executor sessions authenticate via Claude Code login. No IO, no clock, no fs — string
 * math only; the edge (`cli/main.ts`) reads/writes the file and calls this.
 */

/** Matches a line assigning ANTHROPIC_API_KEY, with or without a leading `export `, and
 * with any amount of leading whitespace. Comment lines that merely mention the variable
 * (e.g. `# ANTHROPIC_API_KEY=...`) do NOT match — only real assignments. */
const ASSIGNMENT_RE = /^\s*(export\s+)?ANTHROPIC_API_KEY\s*=/;

/** Removes every line assigning ANTHROPIC_API_KEY (with or without `export `),
 *  preserving all other lines byte-for-byte. */
export function scrubEnvContent(content: string): { cleaned: string; removed: number } {
  const hadTrailingNewline = content.endsWith('\n');
  const lines = content.split('\n');
  // A trailing newline produces one empty trailing element from split('\n'); drop it here
  // and restore it at the end so join() never invents or drops a blank final line.
  if (hadTrailingNewline) lines.pop();

  let removed = 0;
  const kept = lines.filter((line) => {
    if (ASSIGNMENT_RE.test(line)) {
      removed += 1;
      return false;
    }
    return true;
  });

  const cleaned = kept.join('\n') + (hadTrailingNewline ? '\n' : '');
  return { cleaned, removed };
}
