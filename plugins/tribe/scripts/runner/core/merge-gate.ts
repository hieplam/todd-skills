// P2 fix-list card: the pre-merge check gate — a second PreToolUse hook, alongside the
// anti-livelock hook in session.ts, that stops an executor session from landing `gh pr
// merge` while a PR check is red or still pending. Incident: PR #188 merged with
// `format-check` red -> master red for ~42 minutes (spec §Incident).
//
// PURE module: no imports beyond types (`HookDecision`, from ports.ts). The one I/O call
// this gate needs — actually running `gh pr checks` — is an edge concern; it lives in
// session.ts's hook wrapper, which calls `io.execInRepo(...)` and hands the *result* to
// `buildMergeGateDecision` here. This file never touches a process, a network, or a clock.
import type { HookDecision } from '../ports/ports.ts';

export interface ParsedMergeCommand {
  isMerge: boolean;
  /** The PR ref given to `gh pr merge` (a bare number, a PR URL, or a branch name) — the
   * first token after `merge` that doesn't start with `-`. `undefined` when the command
   * gives no ref (gh then resolves the PR from the current branch). */
  prRef?: string;
  /** Set when `--auto` or `--admin` appears as a standalone token — both are forbidden
   * outright, never routed through the checks gate at all. */
  forbiddenFlag?: string;
}

export interface JudgeChecksResult {
  allGreen: boolean;
  /** Human-readable `"<name>: <state>"` entries for every check that is not `SUCCESS`, or a
   * single explanatory entry when the input couldn't even be judged (parse failure / empty
   * list) — always non-empty when `allGreen` is false. */
  notGreen: string[];
}

export interface MergeGateDecisionInput {
  parsed: ParsedMergeCommand;
  /** The result of `io.execInRepo(['gh', 'pr', 'checks', ...])`, already run by the edge.
   * `undefined` means the edge never attempted the call (or couldn't) — fail-closed, same
   * as a non-zero exit code. */
  checksExec?: { stdout: string; exitCode: number };
}

const MERGE_COMMAND_RE = /\bgh\s+pr\s+merge\b/;
const FORBIDDEN_FLAGS = new Set(['--auto', '--admin']);

/** PURE: is this Bash command a `gh pr merge` attempt, and if so what ref/forbidden flag
 * does it carry? Any prefix (`cd repo && gh pr merge ...`) still matches — the regex looks
 * for the three words as whitespace-separated tokens anywhere in the command. */
export function parseMergeCommand(command: string): ParsedMergeCommand {
  if (!MERGE_COMMAND_RE.test(command)) {
    return { isMerge: false, prRef: undefined, forbiddenFlag: undefined };
  }

  const tokens = command.trim().split(/\s+/);
  const mergeTokenIndex = tokens.findIndex(
    (token, i) => token === 'merge' && tokens[i - 1] === 'pr' && tokens[i - 2] === 'gh',
  );

  let forbiddenFlag: string | undefined;
  let prRef: string | undefined;

  for (let i = mergeTokenIndex + 1; i < tokens.length; i++) {
    const token = tokens[i];
    if (FORBIDDEN_FLAGS.has(token)) {
      forbiddenFlag = token;
      continue;
    }
    if (!token.startsWith('-') && prRef === undefined) {
      prRef = token;
    }
  }

  return { isMerge: true, prRef, forbiddenFlag };
}

/** PURE: judges the parsed `gh pr checks --json name,state` output. A parse failure or an
 * empty check list is NOT green — fail-closed, never "no checks means nothing to block". */
export function judgeChecks(stdout: string): JudgeChecksResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stdout);
  } catch {
    return { allGreen: false, notGreen: ['gh pr checks output was not valid JSON (fail-closed)'] };
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    return { allGreen: false, notGreen: ['gh pr checks returned no checks — an empty list is not green'] };
  }

  const notGreen = (parsed as Array<{ name?: unknown; state?: unknown }>)
    .map((entry) => ({
      name: typeof entry?.name === 'string' ? entry.name : 'unknown',
      state: typeof entry?.state === 'string' ? entry.state : 'unknown',
    }))
    .filter((check) => check.state !== 'SUCCESS')
    .map((check) => `${check.name}: ${check.state}`);

  return { allGreen: notGreen.length === 0, notGreen };
}

/** Steers, not just refuses (same principle as `BACKGROUNDING_DENIED_REASON` in
 * session.ts): both forbidden flags share one deny reason since neither is ever legitimate
 * on this gate. */
export const MERGE_GATE_DENIED_FORBIDDEN_FLAG_REASON =
  'Merge denied: `--auto` and `--admin` are forbidden on `gh pr merge` in this session — ' +
  '`--auto` ends the session before DoD (Definition of Done) cleanup can run, and `--admin` ' +
  'bypasses the pre-merge check gate entirely. Wait for every PR check to conclude green ' +
  '(`gh pr checks <pr> --watch`, timeout: 600000), then retry with a plain `gh pr merge --merge`. ' +
  "If a check is red for reasons outside this card's diff, escalate NEEDS_DIRECTION instead of merging.";

/** The `gh pr checks` call itself failed (no PR, network, auth) — fail-closed: an unreadable
 * check state is treated exactly like a red one, never like "nothing to block". */
export const MERGE_GATE_DENIED_CHECKS_ERROR_REASON =
  'Merge denied: could not verify checks — run `gh pr checks` yourself, get full green, then ' +
  'retry the merge.';

/** Builds the steering reason for a merge attempt whose checks are not all green. */
export function mergeGateNotGreenReason(prRef: string | undefined, notGreen: string[]): string {
  const watchCmd = prRef ? `gh pr checks ${prRef} --watch` : 'gh pr checks --watch';
  return (
    `Merge denied: not all checks have concluded green (${notGreen.join(', ')}) — pending is ` +
    `not green. Wait in the foreground with \`${watchCmd}\` (timeout: 600000), then retry the ` +
    "merge once every check is SUCCESS. If a check is red for reasons outside this card's " +
    'diff, escalate NEEDS_DIRECTION instead of merging.'
  );
}

function deny(reason: string): HookDecision {
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'deny',
      permissionDecisionReason: reason,
    },
  };
}

/** PURE: the full decision for one PreToolUse event, given the already-parsed command and
 * (if the edge attempted it) the already-run `gh pr checks` result. Non-merge commands get
 * an empty decision (no opinion) — this function never decides anything about a tool call
 * that isn't a `gh pr merge` attempt. */
export function buildMergeGateDecision(input: MergeGateDecisionInput): HookDecision {
  const { parsed, checksExec } = input;
  if (!parsed.isMerge) return {};

  if (parsed.forbiddenFlag) {
    return deny(MERGE_GATE_DENIED_FORBIDDEN_FLAG_REASON);
  }

  if (!checksExec || checksExec.exitCode !== 0) {
    return deny(MERGE_GATE_DENIED_CHECKS_ERROR_REASON);
  }

  const judged = judgeChecks(checksExec.stdout);
  if (!judged.allGreen) {
    return deny(mergeGateNotGreenReason(parsed.prRef, judged.notGreen));
  }

  return {};
}
