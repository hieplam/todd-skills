// debt-backfill.ts — the post-merge issue-backfill CLI (Task 4, spec §7 "GitHub issues —
// post-merge backfill"). The issue is the one debt artifact that cannot ride the branch (`gh
// issue create` publishes immediately), so this script never runs at ruling time — only against
// an already-merged tree (default `--ref master`). It is the sole creator of debt issues (plan
// Global Constraints): idempotent (entity->issue is derived by searching existing issue text for
// the entity's slug — no stored `issue:` field anywhere, spec §1), and a clean no-op when the
// repo isn't on GitHub / `gh` is absent (spec §7).
//
// CLI contract:
//   bun debt-backfill.ts [--repo <path>] [--ref master] [--gh-bin gh] [--dry-run]
//
// `selectMissing`/`issueBody` are the pure core (pure-core.md): given entities and issue texts
// already in memory, they decide WHAT to create and HOW to word it — no IO, same inputs always
// produce the same output. All `gh`/`git` execution lives in this file's thin CLI edge
// (`backfill`) or in `debt-tree.ts`'s shared IO module.
import { type DebtEntity } from './debt-entity.ts';
import { listDebtEntities } from './debt-tree.ts';

// ---------------------------------------------------------------------------------------------
// Pure core: no `fs`, no `child_process`, no network — everything arrives as an argument.
// ---------------------------------------------------------------------------------------------

/** Spec §7: the OPEN entities whose id appears in NO issue title/body — a closed entity is never
 * selected (its debt has already burned down; no issue is owed for it). Idempotence rides on
 * this same search: once an entity's own issue exists (its id appears somewhere in that issue's
 * title or body, per `issueBody` below), a second run selects nothing for it. */
export function selectMissing(entities: readonly DebtEntity[], issueTexts: readonly string[]): DebtEntity[] {
  return entities.filter(
    (entity) => entity.status === 'open' && !issueTexts.some((text) => text.includes(entity.id)),
  );
}

/** The thin, human-facing issue surface for one debt entity (spec §7): a pattern one-liner
 * title, then check + baseline, the paired anti-rule, the origin gap, the `c3 read <id>`
 * progressive-disclosure pointer, and the verbatim fix-protocol line. The body always contains
 * the entity's own id (via the `c3 read` pointer) so `selectMissing`'s issue-text search can find
 * it on a later run — this is what makes the whole backfill idempotent. */
export function issueBody(entity: DebtEntity): { title: string; body: string } {
  const summary = entity.description ?? entity.antiRule;
  const title = `Tech debt: ${summary}`;
  const body = [
    `Pattern: ${summary}`,
    '',
    `Check: \`${entity.check}\``,
    `Baseline: ${entity.baseline}`,
    `Anti-rule: ${entity.antiRule}`,
    `Origin gap: ${entity.originGap}`,
    '',
    `c3 read ${entity.id}`,
    '',
    'Fix protocol: run the debt-fix workflow; investigate in that session, not here.',
    '',
  ].join('\n');
  return { title, body };
}

// ---------------------------------------------------------------------------------------------
// IO edge: reads entities off a named tree, lists/creates issues via a caller-supplied `gh` bin.
// ---------------------------------------------------------------------------------------------

async function spawnCapture(
  argv: readonly string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string } | undefined> {
  let proc;
  try {
    proc = Bun.spawn(argv as string[], { cwd, stdout: 'pipe', stderr: 'pipe' });
  } catch (err) {
    // Spec §7: "gh absent -> clean no-op" — Bun.spawn throws synchronously (ENOENT) when the
    // named executable can't be resolved at all, distinct from `gh` running and failing.
    if (err && typeof err === 'object' && (err as { code?: string }).code === 'ENOENT') {
      return undefined;
    }
    throw err;
  }
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

export interface BackfillOptions {
  repo: string;
  ref: string;
  ghBin: string;
  dryRun?: boolean;
}

export interface BackfillResult {
  created: string[];
  skipped?: 'gh-unavailable';
}

interface IssueListRow {
  title?: string;
  body?: string;
}

/** Spec §7's edge: lists open debt entities at `ref`, fetches existing issue texts via
 * `<gh-bin> issue list`, selects what's missing, and creates it — unless `dryRun`, which reports
 * the would-create list without spawning `issue create` at all. `gh-bin` unresolvable (repo not
 * on GitHub, or `gh` simply absent) is a clean no-op: `{created: [], skipped: 'gh-unavailable'}`,
 * never an error. */
export async function backfill(options: BackfillOptions): Promise<BackfillResult> {
  const { repo, ref, ghBin, dryRun } = options;

  const entities = await listDebtEntities(repo, ref);

  const listResult = await spawnCapture(
    [ghBin, 'issue', 'list', '--state', 'all', '--json', 'title,body', '--limit', '200'],
    repo,
  );
  if (listResult === undefined) {
    return { created: [], skipped: 'gh-unavailable' };
  }
  if (listResult.exitCode !== 0) {
    throw new Error(`debt-backfill: ${ghBin} issue list failed: ${listResult.stderr.trim()}`);
  }

  const issues: IssueListRow[] = JSON.parse(listResult.stdout || '[]');
  const issueTexts = issues.map((issue) => `${issue.title ?? ''}\n${issue.body ?? ''}`);

  const missing = selectMissing(entities, issueTexts);
  if (dryRun) {
    return { created: missing.map((entity) => entity.id) };
  }

  const created: string[] = [];
  for (const entity of missing) {
    const { title, body } = issueBody(entity);
    const createResult = await spawnCapture([ghBin, 'issue', 'create', '--title', title, '--body', body], repo);
    if (createResult === undefined) {
      return { created, skipped: 'gh-unavailable' };
    }
    if (createResult.exitCode !== 0) {
      throw new Error(`debt-backfill: ${ghBin} issue create failed for ${entity.id}: ${createResult.stderr.trim()}`);
    }
    created.push(entity.id);
  }
  return { created };
}

interface ParsedArgs {
  repo: string;
  ref: string;
  ghBin: string;
  dryRun: boolean;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  return {
    repo: get('--repo') ?? process.cwd(),
    ref: get('--ref') ?? 'master',
    ghBin: get('--gh-bin') ?? 'gh',
    dryRun: argv.includes('--dry-run'),
  };
}

/** CLI entrypoint: prints the spec §7 output object as a single JSON line on stdout, always exit
 * 0 on a completed run (including the `gh`-unavailable no-op) — only a genuine `gh`/`git` error
 * (e.g. `issue list` failing while `gh` IS resolvable) exits non-zero. */
export async function main(argv: readonly string[] = Bun.argv.slice(2)): Promise<void> {
  const { repo, ref, ghBin, dryRun } = parseArgs(argv);
  try {
    const result = await backfill({ repo, ref, ghBin, dryRun });
    console.log(JSON.stringify(result));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
