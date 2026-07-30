// debt-tree.ts — the shared git-tree IO edge for debt entities (Task 3, spec §3, shared by
// Task 3's `debt-count.ts` and Task 4's `debt-backfill.ts`). All `git` execution for reading
// debt entities and running their checks lives here, at the edge — `debt-entity.ts` stays pure
// (parse only) and `debt-count.ts` keeps its flag/delta computation pure and separate from this
// module's IO (pure-core.md).
//
// Checks execute via `git grep` (Global Constraints): a stored check command is shaped like
// `grep -rn '<pattern>' <path>` (fingerprint grammar, validated by `validateFingerprint`) but
// runs as `git grep -n <pattern> <tree-ish> -- <path>` so any named tree (a branch, a commit, a
// merge-base) can be measured, not just the working tree. Consequence, intentional: `git grep`
// only sees TRACKED files — an untracked working-tree file is invisible to every check until it
// is committed. This is the same tree-ish-capable execution shape `gap-rule.ts` uses against
// `HEAD`, generalized to an arbitrary `ref`.
import { parseDebtEntity, type DebtEntity } from './debt-entity.ts';
import { validateFingerprint } from './fingerprint.ts';

async function spawnCapture(
  argv: readonly string[],
  cwd: string,
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(argv as string[], { cwd, stdout: 'pipe', stderr: 'pipe' });
  const [stdout, stderr] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
  ]);
  const exitCode = await proc.exited;
  return { exitCode, stdout, stderr };
}

/** Lists every debt entity committed under `.c3/documents/debt/` at `ref`, parsed via
 * `parseDebtEntity` (Task 1). Reads the tree directly (`git ls-tree` + `git show`) — never the
 * working tree — so a snapshot or diff against a historical ref sees exactly what was committed
 * there, independent of what's currently checked out. */
export async function listDebtEntities(repo: string, ref: string): Promise<DebtEntity[]> {
  const lsResult = await spawnCapture(
    ['git', 'ls-tree', '-r', '--name-only', ref, '--', '.c3/documents/debt/'],
    repo,
  );
  if (lsResult.exitCode !== 0) {
    throw new Error(`debt-tree: git ls-tree failed against ${ref}: ${lsResult.stderr.trim()}`);
  }

  const paths = lsResult.stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const entities: DebtEntity[] = [];
  for (const path of paths) {
    const showResult = await spawnCapture(['git', 'show', `${ref}:${path}`], repo);
    if (showResult.exitCode !== 0) {
      throw new Error(`debt-tree: git show ${ref}:${path} failed: ${showResult.stderr.trim()}`);
    }
    entities.push(parseDebtEntity(showResult.stdout, path));
  }
  return entities;
}

/** Result of executing a validated check against a tree-ish: `hits` is the count of non-empty
 * `git grep` output lines, `lines` are those lines verbatim (`<ref>:<path>:<line>:<content>`). */
export interface CheckResult {
  hits: number;
  lines: string[];
}

/** Executes a debt entity's stored `check` against `ref` via the tree-ish-capable `git grep`
 * translation (Global Constraints): validates via `validateFingerprint` first — an invalid
 * check is NEVER executed, it throws instead so the caller can route it to a `flagged` list
 * rather than a measured count. Zero hits is a normal, valid result (a debt entry can burn down
 * to zero); only a real `git grep` error (a bad regex, an absent path — any exit code other than
 * 0 "matched" or 1 "no matches") throws. */
export async function runCheck(repo: string, ref: string, check: string): Promise<CheckResult> {
  const validation = validateFingerprint(check);
  if (!validation.valid) {
    throw new Error(`debt-tree: check rejected — ${validation.reason} (check: ${check})`);
  }

  const tokens = validation.tokens!;
  const rest = tokens.slice(1);
  let idx = 0;
  while (idx < rest.length && rest[idx]!.startsWith('-')) idx++;
  const pattern = rest[idx];
  const paths = rest.slice(idx + 1);
  if (pattern === undefined || paths.length === 0) {
    throw new Error(`debt-tree: check is not shaped like 'grep <flags> <pattern> <path>' (check: ${check})`);
  }

  const argv = ['git', 'grep', '-n', pattern, ref, '--', ...paths];
  const { exitCode, stdout, stderr } = await spawnCapture(argv, repo);
  const lines = stdout.split('\n').filter((line) => line.length > 0);

  if (exitCode !== 0 && exitCode !== 1) {
    throw new Error(`debt-tree: check errored (exit ${exitCode}) against ${ref}: ${stderr.trim() || check}`);
  }
  return { hits: lines.length, lines };
}
