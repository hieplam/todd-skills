// D3 five-point SHIPPED verification, as code (Task 3).
//
// verifyShipped() is the acceptance gate for a card the executor claims is `SHIPPED
// <pr> <sha>` — that line is a signal only (design spec §D3); this module independently
// replays all five checks against reality. Every world-touching operation (gh/git
// invocations, reading the card's plan file) goes through the injected `io` seam below —
// this module never imports `child_process`, `fs`, or performs network I/O itself.
import { join } from 'node:path';
import type { Card } from './types.ts';
import type { ExecResult, VerifyIO } from '../ports/ports.ts';

export type { ExecResult, VerifyIO };

/** Everything verify.ts needs from campaign config — deliberately a narrow, LOCAL type
 * (not `CampaignState`). `schemaLockPaths`/`docsOnlyPaths` are campaign config carried by the
 * caller from `CampaignState.schemaLockPaths`/`CampaignState.docsOnlyPaths` — never hardcoded
 * here (stateless-capability wall). */
export interface VerifyConfig {
  /** Target repo root; `cwd` for every `exec` call (an input, per spec §2). */
  repoRoot: string;
  /** The git remote this repo's canonical upstream/PR-target actually is (resolved once,
   * `ResolvedConfig.remote` — never re-hardcoded here). */
  remote: string;
  /** The branch every check below diffs/merge-bases against (`ResolvedConfig.baseBranch`). */
  baseBranch: string;
  schemaLockPaths: string[];
  /** Path prefixes that count as "docs-only" for the D6 flake waiver — campaign config
   * carried by the caller from `CampaignState.docsOnlyPaths`, never hardcoded here
   * (stateless-capability wall). An EMPTY list fails closed: nothing counts as docs-only, so
   * a code diff never auto-waives (see `isDocsOnlyDiff`). */
  docsOnlyPaths: string[];
}

/** The D3 five points, each independently reported (never short-circuited) so a failed
 * `verifyShipped` names EVERY failing point, not just the first. */
export type VerifyPointId =
  | 'merged'
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
        detail: 'card.pr is not set; cannot query gh api repos/{owner}/{repo}/pulls/<pr>',
      },
      mergeSha: null,
    };
  }

  // F4: `gh api pulls/<pr>` resolves against the API ROOT, not the current repo, and 404s
  // (verified against the real CLI). `{owner}`/`{repo}` are gh's OWN literal placeholders —
  // gh substitutes them from the repo in `cwd` itself; passed through literally here, never
  // interpolated with a repo name (that would violate the stateless-capability wall).
  const apiPath = `repos/{owner}/{repo}/pulls/${card.pr}`;
  const result = await run(io, config.repoRoot, ['gh', 'api', apiPath]);
  if (result.exitCode !== 0) {
    return {
      point: {
        id: 'merged',
        passed: false,
        detail: `gh api ${apiPath} failed (exit ${result.exitCode}): ${result.stderr || result.stdout}`,
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
        detail: `gh api ${apiPath} returned non-JSON output`,
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
        : `PR #${card.pr} is not merged (gh api ${apiPath} reported merged=${String(parsed.merged)})`,
    },
    mergeSha,
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

  const target = `${config.remote}/${config.baseBranch}`;
  const result = await run(io, config.repoRoot, ['git', 'merge-base', '--is-ancestor', mergeSha, target]);
  const passed = result.exitCode === 0;
  return {
    id: 'mergeShaAncestorOfMaster',
    passed,
    detail: passed
      ? `${mergeSha} is an ancestor of ${target}`
      : `${mergeSha} is NOT an ancestor of ${target} (git merge-base --is-ancestor exit ${result.exitCode})`,
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

/** F1: the docs-only path set is campaign config (`config.docsOnlyPaths`), never a hardcoded
 * `docs/` prefix — that would bake the TARGET repo's directory layout into a capability that
 * must work against ANY repo (stateless-capability wall). An EMPTY `docsOnlyPaths` fails
 * closed: nothing counts as docs-only, so a code diff never auto-waives — the opposite
 * default (empty ⇒ everything docs-only) would auto-waive every code diff, which D6 forbids
 * absolutely. */
async function isDocsOnlyDiff(baseSha: string | null, config: VerifyConfig, io: VerifyIO): Promise<boolean> {
  if (!baseSha) return false;
  if (config.docsOnlyPaths.length === 0) return false;
  const result = await run(io, config.repoRoot, [
    'git',
    'diff',
    '--name-only',
    `${baseSha}..${config.remote}/${config.baseBranch}`,
  ]);
  if (result.exitCode !== 0) return false;
  const files = result.stdout
    .split('\n')
    .map((f) => f.trim())
    .filter(Boolean);
  return files.length > 0 && files.every((f) => config.docsOnlyPaths.some((prefix) => f.startsWith(prefix)));
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

  // F2: align with github.ts's `isNotPassing` — gh's `skipping` bucket (a routine
  // path-filtered check) is non-blocking, not a failure. Two modules disagreeing on this same
  // gh vocabulary would make verify.ts escalate healthy cards that github.ts would happily
  // merge.
  const failing = checks.filter((c) => c.bucket !== 'pass' && c.bucket !== 'skipping');
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

  const remoteResult = await run(io, config.repoRoot, ['git', 'ls-remote', '--heads', config.remote, card.branch]);
  const remoteStillExists = remoteResult.stdout.trim().length > 0;

  if (!worktreeStillExists && !remoteStillExists) {
    return {
      id: 'worktreeAndBranchGone',
      passed: true,
      detail: `worktree for ${card.branch} is gone and ${config.remote}/${card.branch} is deleted`,
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
      detail: `card.baseSha is not set; cannot diff baseSha..${config.remote}/${config.baseBranch} for the schema guard`,
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
    `${card.baseSha}..${config.remote}/${config.baseBranch}`,
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

/** The D3 five-point replay, as code. The executor's `SHIPPED <pr> <sha>` line is a signal
 * only (spec §D3) — this is the acceptance. Every point is checked and reported
 * independently; a failure at one point never short-circuits the rest, so a failed result
 * names EVERY failing point (it feeds the escalation file a human reads). Never throws on
 * a verification failure — a failed check is a normal, reportable outcome. */
export async function verifyShipped(card: Card, config: VerifyConfig, io: VerifyIO): Promise<VerifyResult> {
  const merged = await checkMerged(card, config, io);
  const points: VerifyPointResult[] = [
    merged.point,
    await checkAncestor(merged.mergeSha, config, io),
    await checkChecksGreen(card, config, io),
    await checkWorktreeAndBranchGone(card, config, io),
    await checkSchemaGuard(card, config, io),
  ];

  const failedPoints = points.filter((p) => !p.passed).map((p) => p.id);
  return { shipped: failedPoints.length === 0, points, failedPoints };
}
