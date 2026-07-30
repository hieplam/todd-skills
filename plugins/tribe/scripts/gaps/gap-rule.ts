// gap-rule.ts — the ruling CLI (Task 2, spec §2 "The ruling CLI"). Sole writer of `ruled` events:
// unlike `gap-reconcile.ts`, which writes `opened`/`seen` by executing a stored fingerprint, this
// script records a HUMAN decision — but the decision is only ever recorded after the five ordered
// steps below all succeed, so a crash mid-run never leaves a ruling pointing at nothing (spec §2
// step 5: "artifacts first, ruling last").
//
// CLI contract:
//   bun gap-rule.ts --registry <path> --gap <G-NNN> --disposition <rule|anti-rule|debt|dismissed|
//     dismissed-duplicate> --ratified-by <owner|shaman> [--ref <rule-id>] [--debt-slug <slug>]
//     [--check <grep-cmd>] [--description <text>] [--c3-bin <cmd>] [--repo <path>]
//
// IO (fs reads/writes, `git`/`c3-bin` execution via Bun.spawn) lives here, never in ledger.ts —
// ledger.ts stays a pure module (parse/fold/serialize only). Fingerprint validation is the shared
// pure module (`fingerprint.ts`). The core never assumes a `c3` shell alias: it is always passed
// in via `--c3-bin`, resolved by the caller (pure-core.md: dependencies enter only via an
// abstraction the caller supplies).
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import {
  foldToLatestStatus,
  parseLedger,
  serializeEvent,
  type Disposition,
  type RuledEvent,
} from './ledger.ts';
import { validateFingerprint } from './fingerprint.ts';

/** Options mirroring the CLI flags 1:1 (spec §2). `repo` defaults to the process cwd, same as the
 * CLI's `--repo` default. */
export interface RuleOptions {
  registryPath: string;
  gap: string;
  disposition: Disposition;
  ratifiedBy: 'owner' | 'shaman';
  ref?: string;
  debtSlug?: string;
  check?: string;
  description?: string;
  c3Bin?: string;
  repo?: string;
}

/** Spec §2 stdout shape: `ref`/`debt_entity`/`baseline` are present only when the disposition
 * produced them. */
export interface RuleResult {
  ruled: string;
  disposition: Disposition;
  ref?: string;
  debt_entity?: string;
  baseline?: number;
}

/** Dispositions whose ruling must point at an existing rule artifact (spec §2 step 2) — `debt`'s
 * `--ref` is its PAIRED anti-rule, not the debt entity itself. */
const REQUIRES_REF: ReadonlySet<Disposition> = new Set(['rule', 'anti-rule', 'debt']);

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

/** Step 3 execution edge: translates a validated fingerprint's argv (`['grep', <flags...>,
 * <pattern>, <path...>]`) into the tree-ish-capable `git grep` invocation spec §2/Global
 * Constraints mandate — `grep -rn '<pat>' <path>` runs as
 * `Bun.spawn(['git','grep','-n','<pat>','HEAD','--','<path>'], {cwd: repo})`. Hits = non-empty
 * output lines. Exit code 1 (git grep's "no matches" code) is zero hits, not an error; any other
 * non-zero exit is a real error ("the meter can't see the pattern" either way, but the two get
 * distinct refusal messages per spec §2 steps 6/7). */
async function runDebtCheck(
  repo: string,
  tokens: readonly string[],
  rawCheck: string,
): Promise<{ hits: number; lines: string[] }> {
  const rest = tokens.slice(1);
  let idx = 0;
  while (idx < rest.length && rest[idx]!.startsWith('-')) idx++;
  const pattern = rest[idx];
  const paths = rest.slice(idx + 1);
  if (pattern === undefined || paths.length === 0) {
    throw new Error(`gap-rule: --check is not shaped like 'grep <flags> <pattern> <path>' (check: ${rawCheck})`);
  }

  const argv = ['git', 'grep', '-n', pattern, 'HEAD', '--', ...paths];
  const { exitCode, stdout, stderr } = await spawnCapture(argv, repo);
  const lines = stdout.split('\n').filter((line) => line.length > 0);

  if (exitCode !== 0 && exitCode !== 1) {
    throw new Error(`gap-rule: --check errored (exit ${exitCode}): ${stderr.trim() || rawCheck}`);
  }
  if (lines.length === 0) {
    throw new Error(`gap-rule: --check fired zero hits — the meter can't see the pattern (check: ${rawCheck})`);
  }
  return { hits: lines.length, lines };
}

/** The debt entity body handed to `c3 add debt <slug> --file <tmp-body>` — the `## Meter` table
 * row (check/anti-rule/origin-gap/baseline) plus a `## Description` section carrying the ruling's
 * description and the check's first hit line as the one quoted instance (spec §2 step 4 / §1). */
function buildDebtBody(
  check: string,
  antiRule: string,
  originGap: string,
  baseline: number,
  description: string,
  firstHitLine: string,
): string {
  return [
    '## Meter',
    '',
    '| Check | Anti Rule | Origin Gap | Baseline |',
    '| --- | --- | --- | --- |',
    `| ${check} | ${antiRule} | ${originGap} | ${baseline} |`,
    '',
    '## Description',
    '',
    description,
    '',
    `> ${firstHitLine}`,
    '',
  ].join('\n');
}

async function gitStatusLines(repo: string): Promise<string[]> {
  const { stdout } = await spawnCapture(['git', 'status', '--porcelain', '--', '.c3/'], repo);
  return stdout.split('\n').filter((line) => line.length > 0);
}

/** A porcelain status line is `XY<space>path` — the path always starts at index 3. */
function statusLinePath(line: string): string {
  return line.slice(3).trim();
}

/** `git status --porcelain` collapses a wholly-untracked directory to the directory path itself
 * (e.g. `?? .c3/documents/`) instead of listing every file inside it — exactly what happens the
 * first time a debt entity is created under a brand-new `.c3/documents/debt/` tree. A status
 * `path` counts as "the entity" if it names the entity file exactly, OR names a directory that is
 * a prefix of it. */
function isEntityStatusPath(path: string, entityPath: string): boolean {
  return path === entityPath || (path.endsWith('/') && entityPath.startsWith(path));
}

/** Step 4: creates the debt entity via the (stubbed or real) `c3-bin`, then diffs `git status
 * --porcelain -- .c3/` before/after — any path other than the new entity itself (and the
 * gitignored `c3.db`) is the known c3x `add`-corruption defect, mechanized into a refusal (spec
 * §2 step 4). Throws with the offending path(s) named; never reverts anything itself (the
 * caller/human decides how to clean up a corrupted `.c3/`). */
async function createDebtEntity(options: {
  repo: string;
  c3Bin: string;
  debtSlug: string;
  body: string;
}): Promise<void> {
  const { repo, c3Bin, debtSlug, body } = options;
  const entityPath = `.c3/documents/debt/debt-${debtSlug}.md`;
  const c3Argv = c3Bin.split(/\s+/).filter((token) => token.length > 0);

  const tmpDir = mkdtempSync(join(tmpdir(), 'gap-rule-debt-'));
  try {
    const tmpBodyPath = join(tmpDir, 'body.md');
    writeFileSync(tmpBodyPath, body);

    const beforeLines = await gitStatusLines(repo);

    const addResult = await spawnCapture([...c3Argv, 'add', 'debt', debtSlug, '--file', tmpBodyPath], repo);
    if (addResult.exitCode !== 0) {
      throw new Error(
        `gap-rule: c3 add debt ${debtSlug} failed (exit ${addResult.exitCode}): ${addResult.stderr.trim()}`,
      );
    }

    const setResult = await spawnCapture([...c3Argv, 'set', `debt-${debtSlug}`, 'status', 'open'], repo);
    if (setResult.exitCode !== 0) {
      throw new Error(
        `gap-rule: c3 set debt-${debtSlug} status open failed (exit ${setResult.exitCode}): ${setResult.stderr.trim()}`,
      );
    }

    const afterLines = await gitStatusLines(repo);
    const beforeSet = new Set(beforeLines);
    const strayLines = afterLines.filter((line) => {
      if (beforeSet.has(line)) return false;
      const path = statusLinePath(line);
      return !isEntityStatusPath(path, entityPath) && !path.endsWith('c3.db');
    });
    if (strayLines.length > 0) {
      throw new Error(
        `gap-rule: c3 add debt corrupted unrelated .c3/ paths: ${strayLines.map(statusLinePath).join(', ')}`,
      );
    }
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}

/** The five ordered, crash-safe steps of spec §2: fold + require open (1), require the
 * referenced rule artifact to exist (2), validate + execute the debt check (3), create the debt
 * entity with a stray-diff guard (4), and ONLY THEN append the `ruled` event (5). Every refusal
 * throws before step 5 is ever reached, so a crash (or a thrown refusal) never leaves a ruling
 * pointing at an artifact that doesn't exist. */
export async function rule(options: RuleOptions): Promise<RuleResult> {
  const { registryPath, gap, disposition, ratifiedBy, ref, debtSlug, check, description, c3Bin } = options;
  const repo = options.repo ?? process.cwd();

  // Step 1: fold the registry; the gap must be present and not already ruled.
  const registryText = existsSync(registryPath) ? readFileSync(registryPath, 'utf8') : '';
  const events = parseLedger(registryText);
  const latest = foldToLatestStatus(events).get(gap);
  if (!latest) {
    throw new Error(`gap-rule: gap ${gap} not found in registry ${registryPath}`);
  }
  if (latest.event === 'ruled') {
    throw new Error(`gap-rule: gap ${gap} is already ruled (disposition '${latest.disposition}')`);
  }

  // Step 2: rule/anti-rule/debt must name a rule that already exists on the branch (existence
  // stat only — never parses `.c3` content).
  if (REQUIRES_REF.has(disposition)) {
    if (!ref) {
      throw new Error(`gap-rule: disposition '${disposition}' requires --ref`);
    }
    const rulePath = join(repo, '.c3', 'rules', `${ref}.md`);
    if (!existsSync(rulePath)) {
      throw new Error(`gap-rule: --ref '${ref}' has no rule file at ${rulePath}`);
    }
  }

  let baseline: number | undefined;

  if (disposition === 'debt') {
    // Step 3: check validates and fires.
    if (!check) throw new Error("gap-rule: disposition 'debt' requires --check");
    if (!debtSlug) throw new Error("gap-rule: disposition 'debt' requires --debt-slug");
    if (!description) throw new Error("gap-rule: disposition 'debt' requires --description");

    const validation = validateFingerprint(check);
    if (!validation.valid) {
      throw new Error(`gap-rule: --check rejected — ${validation.reason} (check: ${check})`);
    }
    const { hits, lines } = await runDebtCheck(repo, validation.tokens!, check);
    baseline = hits;

    // Step 4: create the debt entity (c3-bin required only here — the check ran without it).
    if (!c3Bin) throw new Error("gap-rule: disposition 'debt' requires --c3-bin");
    const body = buildDebtBody(check, ref!, gap, baseline, description, lines[0]!);
    await createDebtEntity({ repo, c3Bin, debtSlug, body });
  }

  // Step 5: append the ruling LAST — only reached after every refusal above has already passed.
  const event: RuledEvent = {
    id: gap,
    event: 'ruled',
    disposition,
    ref: ref ?? '',
    ratified_by: ratifiedBy,
  };
  mkdirSync(dirname(registryPath), { recursive: true });
  appendFileSync(registryPath, serializeEvent(event));

  const result: RuleResult = { ruled: gap, disposition };
  if (ref) result.ref = ref;
  if (disposition === 'debt') {
    result.debt_entity = `debt-${debtSlug}`;
    result.baseline = baseline;
  }
  return result;
}

interface ParsedArgs {
  registry: string;
  gap: string;
  disposition: Disposition;
  ratifiedBy: 'owner' | 'shaman';
  ref?: string;
  debtSlug?: string;
  check?: string;
  description?: string;
  c3Bin?: string;
  repo: string;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const registry = get('--registry');
  const gap = get('--gap');
  const disposition = get('--disposition') as Disposition | undefined;
  const ratifiedBy = get('--ratified-by') as 'owner' | 'shaman' | undefined;
  if (!registry || !gap || !disposition || !ratifiedBy) {
    throw new Error(
      'Usage: gap-rule.ts --registry <path> --gap <G-NNN> --disposition <rule|anti-rule|debt|dismissed|dismissed-duplicate> --ratified-by <owner|shaman> [--ref <rule-id>] [--debt-slug <slug>] [--check <grep-cmd>] [--description <text>] [--c3-bin <cmd>] [--repo <path>]',
    );
  }
  return {
    registry,
    gap,
    disposition,
    ratifiedBy,
    ref: get('--ref'),
    debtSlug: get('--debt-slug'),
    check: get('--check'),
    description: get('--description'),
    c3Bin: get('--c3-bin'),
    repo: get('--repo') ?? process.cwd(),
  };
}

/** CLI entrypoint: parses argv, rules, and prints the spec §2 output object as a single JSON
 * line on stdout. Every refusal prints its reason on stderr and exits non-zero (spec §2: "each
 * refusal is a test"). */
export async function main(argv: readonly string[] = Bun.argv.slice(2)): Promise<void> {
  const parsed = parseArgs(argv);
  try {
    const result = await rule({
      registryPath: parsed.registry,
      gap: parsed.gap,
      disposition: parsed.disposition,
      ratifiedBy: parsed.ratifiedBy,
      ref: parsed.ref,
      debtSlug: parsed.debtSlug,
      check: parsed.check,
      description: parsed.description,
      c3Bin: parsed.c3Bin,
      repo: parsed.repo,
    });
    console.log(JSON.stringify(result));
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

if (import.meta.main) {
  main();
}
