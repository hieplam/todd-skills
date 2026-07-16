// D3 six-point SHIPPED verification, as code (Task 3).
//
// verifyShipped() is the acceptance gate for a card the executor claims is `SHIPPED
// <pr> <sha>` — that line is a signal only (design spec §D3); this module independently
// replays all six checks against reality. Every world-touching operation (gh/git
// invocations, reading the card's plan file) goes through the injected `io` seam below —
// this module never imports `child_process`, `fs`, or performs network I/O itself.
import { join } from 'node:path';
import type { Card } from './types.ts';

/** One shell/network call, injected. Production wires this to `child_process` +
 * `gh`/`git`; tests drive a fully mocked matrix and never invoke a real binary. */
export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

/** io seam for verify.ts. `exec` covers every gh/git call; `readFile` covers reading the
 * card's plan file for the D3 point-6 front-matter guard — both are injected so this
 * module stays pure TypeScript (test-first rule, global constraint). */
export interface VerifyIO {
  exec(cmd: string[], options?: { cwd?: string }): Promise<ExecResult>;
  /** `resolvedPath` is already joined against `config.repoRoot` by this module — callers
   * never see a bare relative path. */
  readFile(resolvedPath: string): Promise<string> | string;
}

/** Everything verify.ts needs from campaign config — deliberately a narrow, LOCAL type
 * (not `CampaignState`; Task 3 must not touch `types.ts`). `schemaLockPaths` is campaign
 * config carried by the caller from `CampaignState.schemaLockPaths` — never hardcoded
 * here (stateless-capability wall). */
export interface VerifyConfig {
  /** Target repo root; `cwd` for every `exec` call (an input, per spec §2). */
  repoRoot: string;
  schemaLockPaths: string[];
}

/** The D3 six points, each independently reported (never short-circuited) so a failed
 * `verifyShipped` names EVERY failing point, not just the first. */
export type VerifyPointId =
  | 'merged'
  | 'mergeCommitTwoParents'
  | 'mergeShaAncestorOfMaster'
  | 'checksGreen'
  | 'worktreeAndBranchGone'
  | 'schemaGuard';

export interface VerifyPointResult {
  id: VerifyPointId;
  passed: boolean;
  detail: string;
}

export interface VerifyResult {
  /** True iff every point passed. */
  shipped: boolean;
  points: VerifyPointResult[];
  /** Convenience projection of `points` — every failed point's id, in point order. Feeds
   * the escalation file (spec §D5) directly; a reader never has to scan `points` to find
   * out what broke. */
  failedPoints: VerifyPointId[];
}

/** A single PR check as read from `gh pr checks --json name,bucket,description`.
 * `bucket` mirrors gh's own pass/fail/pending/skipping/cancel vocabulary. */
interface PrCheck {
  name: string;
  bucket: string;
  description?: string;
}

/** Runs one exec call; a rejected `io.exec` (network blip, missing binary) is folded into
 * a synthetic non-zero result rather than propagating — every check function reports a
 * failed point instead of throwing (non-negotiable: a failed check is a reportable
 * outcome, never an exception). */
async function run(io: VerifyIO, cwd: string, cmd: string[]): Promise<ExecResult> {
  try {
    return await io.exec(cmd, { cwd });
  } catch (err) {
    return { stdout: '', stderr: err instanceof Error ? err.message : String(err), exitCode: 1 };
  }
}

async function checkMerged(
  card: Card,
  config: VerifyConfig,
  io: VerifyIO,
): Promise<{ point: VerifyPointResult; mergeSha: string | null }> {
  if (card.pr == null) {
    return {
      point: {
        id: 'merged',
        passed: false,
        detail: 'card.pr is not set; cannot query gh api pulls/<pr>',
      },
      mergeSha: null,
    };
  }

  const result = await run(io, config.repoRoot, ['gh', 'api', `pulls/${card.pr}`]);
  if (result.exitCode !== 0) {
    return {
      point: {
        id: 'merged',
        passed: false,
        detail: `gh api pulls/${card.pr} failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
      },
      mergeSha: null,
    };
  }

  let parsed: { merged?: unknown; merge_commit_sha?: unknown };
  try {
    parsed = JSON.parse(result.stdout);
  } catch {
    return {
      point: {
        id: 'merged',
        passed: false,
        detail: `gh api pulls/${card.pr} returned non-JSON output`,
      },
      mergeSha: null,
    };
  }

  const merged = parsed.merged === true;
  const mergeSha = typeof parsed.merge_commit_sha === 'string' ? parsed.merge_commit_sha : null;
  return {
    point: {
      id: 'merged',
      passed: merged,
      detail: merged
        ? `PR #${card.pr} is merged (merge_commit_sha=${mergeSha ?? 'unknown'})`
        : `PR #${card.pr} is not merged (gh api pulls/${card.pr} reported merged=${String(parsed.merged)})`,
    },
    mergeSha,
  };
}

async function checkTwoParents(
  mergeSha: string | null,
  config: VerifyConfig,
  io: VerifyIO,
): Promise<VerifyPointResult> {
  if (!mergeSha) {
    return {
      id: 'mergeCommitTwoParents',
      passed: false,
      detail: 'no merge sha available (point 1 did not report one); cannot inspect parents',
    };
  }

  const result = await run(io, config.repoRoot, ['git', 'rev-list', '--parents', '-n', '1', mergeSha]);
  if (result.exitCode !== 0) {
    return {
      id: 'mergeCommitTwoParents',
      passed: false,
      detail: `git rev-list --parents -n 1 ${mergeSha} failed: ${result.stderr || result.stdout}`,
    };
  }

  const tokens = result.stdout.trim().split(/\s+/).filter(Boolean);
  const parentCount = Math.max(0, tokens.length - 1);
  return {
    id: 'mergeCommitTwoParents',
    passed: parentCount === 2,
    detail:
      parentCount === 2
        ? `merge commit ${mergeSha} has 2 parents (regular merge)`
        : `merge commit ${mergeSha} has ${parentCount} parent(s) — squash/rebase merges have 1, expected 2`,
  };
}

async function checkAncestor(
  mergeSha: string | null,
  config: VerifyConfig,
  io: VerifyIO,
): Promise<VerifyPointResult> {
  if (!mergeSha) {
    return {
      id: 'mergeShaAncestorOfMaster',
      passed: false,
      detail: 'no merge sha available (point 1 did not report one); cannot check ancestry',
    };
  }

  const result = await run(io, config.repoRoot, [
    'git',
    'merge-base',
    '--is-ancestor',
    mergeSha,
    'origin/master',
  ]);
  const passed = result.exitCode === 0;
  return {
    id: 'mergeShaAncestorOfMaster',
    passed,
    detail: passed
      ? `${mergeSha} is an ancestor of origin/master`
      : `${mergeSha} is NOT an ancestor of origin/master (git merge-base --is-ancestor exit ${result.exitCode})`,
  };
}

/** D6: a failing check is a waivable flake iff it is the ONLY failing check, its name
 * matches the SonarCloud advisory signature, and its description carries the bootstrap
 * "504" signature. `checkChecksGreen` additionally requires a docs-only diff before
 * treating it as waived — a code diff never auto-waives, even when the check itself
 * matches this signature. */
function isSonar504Signature(check: PrCheck): boolean {
  return /sonarcloud/i.test(check.name) && /504/.test(check.description ?? '');
}

async function isDocsOnlyDiff(baseSha: string | null, config: VerifyConfig, io: VerifyIO): Promise<boolean> {
  if (!baseSha) return false;
  const result = await run(io, config.repoRoot, [
    'git',
    'diff',
    '--name-only',
    `${baseSha}..origin/master`,
  ]);
  if (result.exitCode !== 0) return false;
  const files = result.stdout
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
  return files.length > 0 && files.every((f) => f.startsWith('docs/'));
}

async function checkChecksGreen(card: Card, config: VerifyConfig, io: VerifyIO): Promise<VerifyPointResult> {
  if (card.pr == null) {
    return { id: 'checksGreen', passed: false, detail: 'card.pr is not set; cannot query gh pr checks' };
  }

  const result = await run(io, config.repoRoot, [
    'gh',
    'pr',
    'checks',
    String(card.pr),
    '--json',
    'name,bucket,description',
  ]);
  if (result.exitCode !== 0) {
    return {
      id: 'checksGreen',
      passed: false,
      detail: `gh pr checks ${card.pr} failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
    };
  }

  let checks: PrCheck[];
  try {
    checks = JSON.parse(result.stdout);
  } catch {
    return { id: 'checksGreen', passed: false, detail: `gh pr checks ${card.pr} returned non-JSON output` };
  }

  const failing = checks.filter((c) => c.bucket !== 'pass');
  if (failing.length === 0) {
    return { id: 'checksGreen', passed: true, detail: `all ${checks.length} check(s) concluded success` };
  }

  if (failing.length === 1 && isSonar504Signature(failing[0])) {
    const docsOnly = await isDocsOnlyDiff(card.baseSha, config, io);
    if (docsOnly) {
      return {
        id: 'checksGreen',
        passed: true,
        detail: `waived: only failing check "${failing[0].name}" matches the SonarCloud-504 bootstrap signature and the diff is docs-only`,
      };
    }
    return {
      id: 'checksGreen',
      passed: false,
      detail: `"${failing[0].name}" matches the SonarCloud-504 signature but the diff is NOT docs-only — D6 never auto-waives a code diff`,
    };
  }

  return {
    id: 'checksGreen',
    passed: false,
    detail: `${failing.length} check(s) not successful: ${failing.map((c) => c.name).join(', ')}`,
  };
}

async function checkWorktreeAndBranchGone(
  card: Card,
  config: VerifyConfig,
  io: VerifyIO,
): Promise<VerifyPointResult> {
  if (!card.branch) {
    return {
      id: 'worktreeAndBranchGone',
      passed: false,
      detail: 'card.branch is not set; cannot check worktree/branch state',
    };
  }

  const worktreeResult = await run(io, config.repoRoot, ['git', 'worktree', 'list', '--porcelain']);
  const worktreeStillExists = worktreeResult.stdout
    .split('\n')
    .some((line) => line.trim() === `branch refs/heads/${card.branch}`);

  const remoteResult = await run(io, config.repoRoot, [
    'git',
    'ls-remote',
    '--heads',
    'origin',
    card.branch,
  ]);
  const remoteStillExists = remoteResult.stdout.trim().length > 0;

  if (!worktreeStillExists && !remoteStillExists) {
    return {
      id: 'worktreeAndBranchGone',
      passed: true,
      detail: `worktree for ${card.branch} is gone and origin/${card.branch} is deleted`,
    };
  }

  const problems: string[] = [];
  if (worktreeStillExists) problems.push('worktree still present');
  if (remoteStillExists) problems.push('remote branch still present');
  return {
    id: 'worktreeAndBranchGone',
    passed: false,
    detail: `${card.branch}: ${problems.join(' and ')}`,
  };
}

/** Minimal YAML front-matter reader: only extracts the boolean `allowsSchemaChange` key
 * from a leading `---`-delimited block. Binding convention (spec §D3 point 6): absent
 * front-matter OR absent key ⇒ `false` (guard enforced). Everything else in the front
 * matter, and everything after the closing `---`, is ignored — this is not a general YAML
 * parser, just the one flag D3 needs. */
export function readAllowsSchemaChange(planContent: string): boolean {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(planContent);
  if (!match) return false;
  const frontMatter = match[1] ?? '';
  const keyMatch = /^allowsSchemaChange:\s*(true|false)\s*$/m.exec(frontMatter);
  if (!keyMatch) return false;
  return keyMatch[1] === 'true';
}

async function checkSchemaGuard(card: Card, config: VerifyConfig, io: VerifyIO): Promise<VerifyPointResult> {
  if (config.schemaLockPaths.length === 0) {
    return { id: 'schemaGuard', passed: true, detail: 'no schema-lock paths configured; guard is a no-op' };
  }

  if (!card.baseSha) {
    return {
      id: 'schemaGuard',
      passed: false,
      detail: 'card.baseSha is not set; cannot diff baseSha..origin/master for the schema guard',
    };
  }

  let allowsSchemaChange = false;
  if (card.plan) {
    const resolvedPlanPath = join(config.repoRoot, card.plan);
    const planContent = await io.readFile(resolvedPlanPath);
    allowsSchemaChange = readAllowsSchemaChange(planContent);
  }

  const result = await run(io, config.repoRoot, [
    'git',
    'diff',
    `${card.baseSha}..origin/master`,
    '--',
    ...config.schemaLockPaths,
  ]);
  const diffIsEmpty = result.stdout.trim().length === 0;

  if (diffIsEmpty) {
    return { id: 'schemaGuard', passed: true, detail: `no diff on schema-lock paths since ${card.baseSha}` };
  }

  if (allowsSchemaChange) {
    return {
      id: 'schemaGuard',
      passed: true,
      detail: `schema-lock paths changed since ${card.baseSha}, but the plan's front-matter declares allowsSchemaChange: true`,
    };
  }

  return {
    id: 'schemaGuard',
    passed: false,
    detail: `schema-lock paths (${config.schemaLockPaths.join(', ')}) changed since ${card.baseSha} and allowsSchemaChange is not true`,
  };
}

/** The D3 six-point replay, as code. The executor's `SHIPPED <pr> <sha>` line is a signal
 * only (spec §D3) — this is the acceptance. Every point is checked and reported
 * independently; a failure at one point never short-circuits the rest, so a failed result
 * names EVERY failing point (it feeds the escalation file a human reads). Never throws on
 * a verification failure — a failed check is a normal, reportable outcome. */
export async function verifyShipped(card: Card, config: VerifyConfig, io: VerifyIO): Promise<VerifyResult> {
  const merged = await checkMerged(card, config, io);
  const points: VerifyPointResult[] = [
    merged.point,
    await checkTwoParents(merged.mergeSha, config, io),
    await checkAncestor(merged.mergeSha, config, io),
    await checkChecksGreen(card, config, io),
    await checkWorktreeAndBranchGone(card, config, io),
    await checkSchemaGuard(card, config, io),
  ];

  const failedPoints = points.filter((p) => !p.passed).map((p) => p.id);
  return { shipped: failedPoints.length === 0, points, failedPoints };
}
