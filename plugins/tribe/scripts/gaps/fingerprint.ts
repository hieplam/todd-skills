// Fingerprint tokenization and validation (Task 1, extracted from `gap-reconcile.ts`'s CU-2
// private copies — same behavior, shared home). Pure module: no `fs`, no `child_process`, no
// network I/O — callers (`gap-reconcile.ts`, `gap-rule.ts`, `debt-tree.ts`) build the real argv
// and execute it via `Bun.spawn` at their own thin IO edge; this module only decides whether a
// fingerprint string is safe to execute and how to split it into argv tokens.

const BANNED_FINGERPRINT_CHARS = /[;|&$()<>`]/;

/** Result of validating a stored fingerprint/check command (spec §3 / §6a scenario 9). */
export interface FingerprintValidation {
  valid: boolean;
  reason?: string;
  tokens?: string[];
}

/** Splits a fingerprint string into argv tokens, honoring single/double-quoted substrings (the
 * stored fingerprint is human/LLM-authored shell-command prose, e.g.
 * `grep -rn 'catch {}' src/handlers/`) — used only to build a real `Bun.spawn` argv, never to
 * hand the string to a shell. */
export function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let i = 0;
  const n = command.length;
  while (i < n) {
    while (i < n && /\s/.test(command[i]!)) i++;
    if (i >= n) break;
    let token = '';
    while (i < n && !/\s/.test(command[i]!)) {
      const c = command[i]!;
      if (c === "'" || c === '"') {
        const quote = c;
        i++;
        while (i < n && command[i] !== quote) {
          token += command[i];
          i++;
        }
        i++; // skip closing quote
      } else {
        token += c;
        i++;
      }
    }
    tokens.push(token);
  }
  return tokens;
}

/** Validates a stored fingerprint/check command (spec §3 / §6a scenario 9): must be a single
 * `grep` invocation only. Anything containing a shell metacharacter (`; | & $ ( ) > < \``), or
 * whose command is not literally `grep`, is rejected — flagged for a human, never executed. */
export function validateFingerprint(fingerprint: string): FingerprintValidation {
  if (BANNED_FINGERPRINT_CHARS.test(fingerprint)) {
    return { valid: false, reason: 'contains shell metacharacters — rejected, never executed' };
  }
  const tokens = tokenize(fingerprint);
  if (tokens.length < 2 || tokens[0] !== 'grep') {
    return { valid: false, reason: 'not a single grep invocation — rejected, never executed' };
  }
  return { valid: true, tokens };
}
