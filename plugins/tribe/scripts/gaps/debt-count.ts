// debt-count.ts — the burn-down CLI (Task 3, spec §3 "Burn-down counting" / §4 "The mechanical
// gate"). There is no stored current number anywhere: every count is produced by executing each
// open debt entity's `check` against a named git tree (`debt-tree.ts`'s IO edge), so parallel fix
// sessions never contend on shared state — git merge is the only serialization point.
//
// Checks execute via `git grep` (Global Constraints): only TRACKED files are counted — an
// untracked working-tree file is invisible to every check until it is committed. This is
// intentional (see `debt-tree.ts`'s header for the full rationale).
//
// CLI contract:
//   bun debt-count.ts [--repo <path>] [--ref <tree-ish>] [--diff <base-ref>]
//
// Snapshot mode (no `--diff`): per open entry, run `check` against `--ref` (default `HEAD`),
// print `now` vs `baseline`, flags, totals — every output line names the sha it measured (spec
// §3: "a number that doesn't name its tree doesn't print"). Closed entities are excluded.
// `now > baseline` -> `harness-leak`; `now == 0` -> `closable`.
//
// Diff mode (`--diff <base-ref>`): runs each open entry's check against both the base tree and
// `--ref` (the head tree, default `HEAD`), reports the delta and the newly-appeared hits. Spec
// §4 (the STRONG gate): **exit code is non-zero iff any entry's delta is positive** — Warchief's
// PR-assembly step treats that exactly like a failing test and does not open the PR. Zero-delta
// entries are omitted entirely (spec AG-3: "no output section at all").
//
// Flag/delta computation is a pure core (`computeFlags`, `computeDiffEntry`, `buildTotals`); all
// `git` execution lives in `debt-tree.ts`'s IO edge or this file's thin CLI shell (pure-core.md).
import { type DebtEntity } from './debt-entity.ts';
import { validateFingerprint } from './fingerprint.ts';
import { listDebtEntities, runCheck } from './debt-tree.ts';

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

async function resolveSha(repo: string, ref: string): Promise<string> {
  const { exitCode, stdout, stderr } = await spawnCapture(['git', 'rev-parse', ref], repo);
  if (exitCode !== 0) {
    throw new Error(`debt-count: git rev-parse ${ref} failed: ${stderr.trim()}`);
  }
  return stdout.trim();
}

// ---------------------------------------------------------------------------------------------
// Pure core: flags, totals, diff-entry computation. No `fs`, no `child_process` below this line
// until the IO edge (`snapshotDebt`/`diffDebt`) further down.
// ---------------------------------------------------------------------------------------------

export type SnapshotFlag = 'harness-leak' | 'closable';

/** Spec §3: `now > baseline` -> `harness-leak` (something merged without the gates firing);
 * `now == 0` -> `closable` (close the entity, and the issue if `Closes #N` didn't already). Both
 * flags can apply at once only if baseline is itself 0 and now regressed — impossible since
 * `now == 0` implies `now` is not `> baseline` unless baseline is negative, which never happens;
 * kept as two independent checks rather than an if/else so the rule reads the same as the spec. */
export function computeFlags(baseline: number, now: number): SnapshotFlag[] {
  const flags: SnapshotFlag[] = [];
  if (now > baseline) flags.push('harness-leak');
  if (now === 0) flags.push('closable');
  return flags;
}

export interface SnapshotEntry {
  id: string;
  baseline: number;
  now: number;
  flags: SnapshotFlag[];
}

/** Builds one snapshot entry from an entity and its measured `now` count — pure: no IO, just the
 * spec §3 flag rule applied to already-measured numbers. */
export function buildSnapshotEntry(entity: DebtEntity, now: number): SnapshotEntry {
  return { id: entity.id, baseline: entity.baseline, now, flags: computeFlags(entity.baseline, now) };
}

export interface SnapshotTotals {
  open_entries: number;
  instances: number;
  baseline_total: number;
}

/** `open_entries` counts every open entity considered (measured or flagged); `instances` and
 * `baseline_total` sum only the successfully MEASURED entries — a flagged (unexecuted) entity
 * contributes no number to either sum, since it was never run. */
export function buildTotals(openEntityCount: number, entries: readonly SnapshotEntry[]): SnapshotTotals {
  return {
    open_entries: openEntityCount,
    instances: entries.reduce((sum, entry) => sum + entry.now, 0),
    baseline_total: entries.reduce((sum, entry) => sum + entry.baseline, 0),
  };
}

/** Parses one `git grep -n <pattern> <ref> -- <path>` output line
 * (`<ref>:<path>:<line>:<content>`) into its parts. Returns `undefined` for a line that doesn't
 * match the expected shape (defensive; `git grep -n` always produces this shape for a real hit). */
function parseGrepHit(line: string): { ref: string; path: string; lineNo: string; content: string } | undefined {
  const firstColon = line.indexOf(':');
  if (firstColon === -1) return undefined;
  const secondColon = line.indexOf(':', firstColon + 1);
  if (secondColon === -1) return undefined;
  const thirdColon = line.indexOf(':', secondColon + 1);
  if (thirdColon === -1) return undefined;
  return {
    ref: line.slice(0, firstColon),
    path: line.slice(firstColon + 1, secondColon),
    lineNo: line.slice(secondColon + 1, thirdColon),
    content: line.slice(thirdColon + 1),
  };
}

/** The identity used to decide whether a head hit already existed at base: `path:content`,
 * deliberately ignoring the ref prefix (base and head are different trees by definition) and the
 * line number (an unrelated edit above a hit shifts its line number without making it a NEW
 * hit). */
function grepHitIdentity(line: string): string {
  const hit = parseGrepHit(line);
  return hit ? `${hit.path}:${hit.content}` : line;
}

/** The human-facing `file:line` naming a hit (spec §3: "the new `file:line` hits"). */
function grepHitPathLine(line: string): string {
  const hit = parseGrepHit(line);
  return hit ? `${hit.path}:${hit.lineNo}` : line;
}

export interface DiffEntry {
  id: string;
  base_hits: number;
  head_hits: number;
  delta: number;
  new_hits: string[];
}

/** Pure delta computation for one entity: compares its base-tree and head-tree hit lines.
 * Returns `undefined` for zero delta — spec AG-3: a zero-delta entry produces no output at all,
 * so the caller simply omits it from `entries` rather than including a zero row. `new_hits` lists
 * every head hit whose `path:content` identity is absent from the base hits (spec §3). */
export function computeDiffEntry(
  id: string,
  baseLines: readonly string[],
  headLines: readonly string[],
): DiffEntry | undefined {
  const delta = headLines.length - baseLines.length;
  if (delta === 0) return undefined;

  const baseIdentities = new Set(baseLines.map(grepHitIdentity));
  const newHits = headLines.filter((line) => !baseIdentities.has(grepHitIdentity(line))).map(grepHitPathLine);

  return { id, base_hits: baseLines.length, head_hits: headLines.length, delta, new_hits: newHits };
}

// ---------------------------------------------------------------------------------------------
// IO edge: resolves shas, lists entities, runs checks against named trees.
// ---------------------------------------------------------------------------------------------

export interface FlaggedEntity {
  id: string;
  reason: string;
}

export interface SnapshotOutput {
  ref: string;
  sha: string;
  entries: SnapshotEntry[];
  totals: SnapshotTotals;
  flagged: FlaggedEntity[];
}

/** Snapshot mode (spec §3): measures every OPEN debt entity's `check` against `ref`. An entity
 * whose `check` fails `validateFingerprint` is never executed — it surfaces in `flagged` instead
 * of `entries` (Task 3 scenario 8). Closed entities never appear (scenario 2). */
export async function snapshotDebt(repo: string, ref: string): Promise<SnapshotOutput> {
  const sha = await resolveSha(repo, ref);
  const openEntities = (await listDebtEntities(repo, ref)).filter((entity) => entity.status === 'open');

  const entries: SnapshotEntry[] = [];
  const flagged: FlaggedEntity[] = [];
  for (const entity of openEntities) {
    const validation = validateFingerprint(entity.check);
    if (!validation.valid) {
      flagged.push({ id: entity.id, reason: validation.reason ?? 'invalid check — rejected, never executed' });
      continue;
    }
    const { hits } = await runCheck(repo, ref, entity.check);
    entries.push(buildSnapshotEntry(entity, hits));
  }

  return { ref, sha, entries, totals: buildTotals(openEntities.length, entries), flagged };
}

export interface DiffOutput {
  base: { ref: string; sha: string };
  head: { ref: string; sha: string };
  entries: DiffEntry[];
}

/** Diff mode (spec §3/§4): for every open head-tree entity whose check validates, runs the check
 * against both trees and keeps only nonzero-delta entries. An entity absent from the base tree
 * (newly ruled on this branch) is treated as `base_hits: 0` — its check still runs against the
 * base tree (the pattern/path may already exist there even if the entity file doesn't). */
export async function diffDebt(repo: string, baseRef: string, headRef: string): Promise<DiffOutput> {
  const [baseSha, headSha] = await Promise.all([resolveSha(repo, baseRef), resolveSha(repo, headRef)]);
  const headEntities = (await listDebtEntities(repo, headRef)).filter((entity) => entity.status === 'open');

  const entries: DiffEntry[] = [];
  for (const entity of headEntities) {
    const validation = validateFingerprint(entity.check);
    if (!validation.valid) continue; // flagged, not diffed — same refusal snapshot mode applies

    const headResult = await runCheck(repo, headRef, entity.check);
    const baseResult = await runCheck(repo, baseRef, entity.check);
    const diffEntry = computeDiffEntry(entity.id, baseResult.lines, headResult.lines);
    if (diffEntry) entries.push(diffEntry);
  }

  return { base: { ref: baseRef, sha: baseSha }, head: { ref: headRef, sha: headSha }, entries };
}

interface ParsedArgs {
  repo: string;
  ref: string;
  diffBase?: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  return {
    repo: get('--repo') ?? process.cwd(),
    ref: get('--ref') ?? 'HEAD',
    diffBase: get('--diff'),
  };
}

/** CLI entrypoint: prints the spec §3 output object as a single JSON line on stdout. Diff mode
 * exits non-zero iff any entry has a positive delta (spec §4: the STRONG gate) — snapshot mode
 * always exits 0 (it reports, it does not gate). */
export async function main(argv: readonly string[] = Bun.argv.slice(2)): Promise<void> {
  const { repo, ref, diffBase } = parseArgs(argv);
  try {
    if (diffBase) {
      const result = await diffDebt(repo, diffBase, ref);
      console.log(JSON.stringify(result));
      const hasPositiveDelta = result.entries.some((entry) => entry.delta > 0);
      process.exit(hasPositiveDelta ? 1 : 0);
    } else {
      const result = await snapshotDebt(repo, ref);
      console.log(JSON.stringify(result));
    }
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
