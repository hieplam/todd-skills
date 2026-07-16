// Deterministic docs-PR helper: commit, push, PR, poll checks, merge (Task 4, spec §D6).
//
// Pure module: every world-touching operation (git/gh invocations, waiting between polls)
// is injected by the caller through `GithubIO` — this file never imports `child_process`,
// `fs`, or performs network I/O directly. Nothing environment-specific (repo names,
// absolute paths, campaign values) is hardcoded; every such value arrives via `GithubConfig`.
//
// D5's hard requirement: this helper runs on the escalation path too (the usual reason to
// escalate IS broken CI), so a failed commit must never invalidate an escalation — every
// failure path here returns a structured outcome, never a thrown error.

/** Result of a single injected shell invocation (git/gh). */
export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/** World-touching seam. No direct `child_process`/`fs`/network import anywhere in this
 * module — every git/gh call and every wait goes through this. */
export interface GithubIO {
  /** Runs `args` (argv, no shell string) with `cwd` set to the target repo root. */
  exec(args: string[], opts?: { cwd?: string }): Promise<ExecResult>;
  /** D6's 10-minute retry spacing goes through this seam so tests exercise the retry policy
   * in milliseconds instead of actually waiting. */
  sleep(ms: number): Promise<void>;
}

/** Everything environment-specific this helper needs, as inputs — never baked in. */
export interface GithubConfig {
  /** Target repo root; cwd for every git/gh call (an input, per spec §2 — never hardcoded). */
  repoRoot: string;
  /** Card id the state commit belongs to; the branch is `campaign-state/<card>`. */
  card: string;
  /** PR body text following the TARGET REPO's own PR conventions. Supplied by the caller —
   * this capability never hardcodes any repo's convention text. */
  prBody: string;
  /** Base branch PRs target and the branch fast-forward-synced after merge (e.g. `master`). */
  baseBranch: string;
}

/** One entry from `gh pr checks --json name,bucket,description`. `bucket` is gh's own
 * classification: `pass` | `fail` | `pending` | `skipping` | `cancel`. */
export interface CheckStatus {
  name: string;
  bucket: string;
  description: string;
}

export interface MergedResult {
  outcome: 'merged';
  branch: string;
  pr: number;
  /** Total `gh pr checks` polls performed (1 = green on the first look, no retry needed). */
  attempts: number;
  /** True if the merge went through only because the D6 flake-waiver fired. */
  waived: boolean;
}

/** D6: any red that isn't the docs-only sonar-504 exception, after retries are exhausted.
 * Never merges — the caller (loop.ts, D5) turns this into an escalation file. */
export interface EscalateResult {
  outcome: 'escalate';
  branch: string;
  pr: number;
  reason: string;
  failedChecks: CheckStatus[];
}

/** D5: the commit/push/PR-creation side failed. Returned, never thrown, so a pending
 * escalation this call was trying to record is never invalidated by CI/network trouble. */
export interface CommitFailedResult {
  outcome: 'commit_failed';
  step: string;
  reason: string;
}

export type CommitStateAndMergeResult = MergedResult | EscalateResult | CommitFailedResult;

/** D6: retry a failed/pending check up to this many times before evaluating the waiver. */
export const D6_MAX_RETRIES = 3;
/** D6: 10-minute spacing between retries, in milliseconds — always routed through
 * `GithubIO.sleep`, never a real wait. */
export const D6_RETRY_SPACING_MS = 10 * 60 * 1000;

const REMOTE = 'origin';

function branchNameFor(card: string): string {
  return `campaign-state/${card}`;
}

/** `gh pr checks --json bucket` classification: anything other than `pass`/`skipping`
 * counts as not-yet-green (pending checks retry exactly like failures — never merged on an
 * ambiguous state). */
function isNotPassing(check: CheckStatus): boolean {
  return check.bucket !== 'pass' && check.bucket !== 'skipping';
}

/** D6's named flake: an advisory third-party check (SonarCloud) failing at bootstrap with a
 * 504 (Bad Gateway) signature. Detected from the check's own name/description — no
 * environment-specific data needed. */
function isSonar504Advisory(check: CheckStatus): boolean {
  return (
    check.bucket === 'fail' &&
    check.name.toLowerCase().includes('sonar') &&
    check.description.includes('504')
  );
}

function safeParseChecks(stdout: string): CheckStatus[] {
  try {
    const parsed = JSON.parse(stdout.trim() || '[]');
    return Array.isArray(parsed) ? (parsed as CheckStatus[]) : [];
  } catch {
    return [];
  }
}

function parsePrNumber(stdout: string): number | null {
  const trimmed = stdout.trim();
  const urlMatch = trimmed.match(/\/pull\/(\d+)/);
  if (urlMatch) return Number(urlMatch[1]);
  const bareMatch = trimmed.match(/^#?(\d+)$/);
  if (bareMatch) return Number(bareMatch[1]);
  return null;
}

interface PollOutcome {
  checks: CheckStatus[];
  queryOk: boolean;
  attempts: number;
}

/** Polls `gh pr checks` until every check is settled green (or the D6 retry budget is
 * exhausted), sleeping the injected D6 spacing between attempts. Never throws — a query
 * failure is folded into `queryOk: false` and treated as "not yet green" for the retry loop. */
async function pollChecksUntilSettled(
  io: GithubIO,
  cwd: string,
  pr: number,
): Promise<PollOutcome> {
  let attempts = 0;
  let checks: CheckStatus[] = [];
  let queryOk = false;

  for (;;) {
    attempts += 1;
    const result = await io.exec(
      ['gh', 'pr', 'checks', String(pr), '--json', 'name,bucket,description'],
      { cwd },
    );
    queryOk = result.exitCode === 0;
    checks = queryOk ? safeParseChecks(result.stdout) : [];
    const settled = queryOk && checks.filter(isNotPassing).length === 0;

    if (settled || attempts > D6_MAX_RETRIES) {
      return { checks, queryOk, attempts };
    }
    await io.sleep(D6_RETRY_SPACING_MS);
  }
}

/**
 * The runner's own deterministic docs-PR helper (spec §D6): commits `files` (paths already
 * written to disk by the caller, relative to `config.repoRoot`) on a fresh
 * `campaign-state/<card>` branch, opens a PR, polls checks under the D6 retry + flake-waiver
 * policy, merges with a REGULAR merge (never squash — the owner's no-squash rule is
 * absolute), deletes the branch, and fast-forward-syncs the target repo's local base branch.
 *
 * Every failure is a structured outcome (`commit_failed` | `escalate`), never a thrown
 * error — this call also runs on the escalation path (D5), where the usual reason to
 * escalate IS broken CI, so a failed commit here must never take down an escalation that is
 * otherwise valid.
 */
export async function commitStateAndMerge(
  files: string[],
  title: string,
  config: GithubConfig,
  io: GithubIO,
): Promise<CommitStateAndMergeResult> {
  const branch = branchNameFor(config.card);
  const cwd = config.repoRoot;

  try {
    const branchResult = await io.exec(['git', 'checkout', '-b', branch], { cwd });
    if (branchResult.exitCode !== 0) {
      return {
        outcome: 'commit_failed',
        step: 'branch',
        reason: branchResult.stderr || 'git checkout -b failed',
      };
    }

    const addResult = await io.exec(['git', 'add', ...files], { cwd });
    if (addResult.exitCode !== 0) {
      return { outcome: 'commit_failed', step: 'add', reason: addResult.stderr || 'git add failed' };
    }

    const commitResult = await io.exec(['git', 'commit', '-m', title], { cwd });
    if (commitResult.exitCode !== 0) {
      return {
        outcome: 'commit_failed',
        step: 'commit',
        reason: commitResult.stderr || 'git commit failed',
      };
    }

    const pushResult = await io.exec(['git', 'push', '-u', REMOTE, branch], { cwd });
    if (pushResult.exitCode !== 0) {
      return { outcome: 'commit_failed', step: 'push', reason: pushResult.stderr || 'git push failed' };
    }

    const createResult = await io.exec(
      [
        'gh',
        'pr',
        'create',
        '--title',
        title,
        '--body',
        config.prBody,
        '--base',
        config.baseBranch,
        '--head',
        branch,
      ],
      { cwd },
    );
    if (createResult.exitCode !== 0) {
      return {
        outcome: 'commit_failed',
        step: 'pr_create',
        reason: createResult.stderr || 'gh pr create failed',
      };
    }

    const pr = parsePrNumber(createResult.stdout);
    if (pr === null) {
      return {
        outcome: 'commit_failed',
        step: 'pr_create',
        reason: `could not parse a PR number from gh pr create output: ${createResult.stdout}`,
      };
    }

    const { checks, queryOk, attempts } = await pollChecksUntilSettled(io, cwd, pr);
    const failing = checks.filter(isNotPassing);
    let waived = false;

    if (!queryOk || failing.length > 0) {
      const allAdvisory = queryOk && failing.length > 0 && failing.every(isSonar504Advisory);
      if (!allAdvisory) {
        return {
          outcome: 'escalate',
          branch,
          pr,
          reason: queryOk
            ? 'non-advisory check(s) red after D6 retries exhausted'
            : 'unable to confirm PR checks after D6 retries exhausted',
          failedChecks: failing,
        };
      }

      // D6 flake waiver: the ONLY red is the advisory SonarCloud-504 bootstrap signature,
      // and this helper's diff is docs-only by construction (it only ever commits campaign
      // state files) — merge, recording the exception in the PR body.
      waived = true;
      const waiverNote =
        '\n\n---\n**D6 exception recorded:** merged despite a red check — the only failure ' +
        'was the advisory SonarCloud bootstrap 504 signature, and this diff is docs-only ' +
        '(campaign state files only). Any other red never auto-waives.';
      const editResult = await io.exec(
        ['gh', 'pr', 'edit', String(pr), '--body', config.prBody + waiverNote],
        { cwd },
      );
      if (editResult.exitCode !== 0) {
        return {
          outcome: 'commit_failed',
          step: 'pr_edit',
          reason: editResult.stderr || 'gh pr edit failed',
        };
      }
    }

    const mergeResult = await io.exec(
      ['gh', 'pr', 'merge', String(pr), '--merge', '--delete-branch'],
      { cwd },
    );
    if (mergeResult.exitCode !== 0) {
      return { outcome: 'commit_failed', step: 'merge', reason: mergeResult.stderr || 'gh pr merge failed' };
    }

    // Fast-forward-sync the target repo's local base branch. Best-effort: the PR is already
    // merged on GitHub at this point, so a local sync hiccup is not a commit failure.
    await io.exec(['git', 'checkout', config.baseBranch], { cwd });
    await io.exec(['git', 'pull', '--ff-only', REMOTE, config.baseBranch], { cwd });

    return { outcome: 'merged', branch, pr, attempts, waived };
  } catch (err) {
    // D5: never throw raw. Any unexpected failure (including an io.exec that itself throws)
    // becomes a structured commit_failed outcome so the caller's escalation path is
    // unaffected.
    return {
      outcome: 'commit_failed',
      step: 'unexpected',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}
