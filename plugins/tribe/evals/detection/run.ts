#!/usr/bin/env bun
// module: run
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { evaluateLegAClean, evaluateLegBClean, cellPasses, memDelta, repetitionPasses, topLevelPass } from './core/gates';
import { runCell, type DetectorPort, type GraderPort } from './core/orchestrate';
import { buildDetectorPrompt } from './core/prompts';
import { planScratch } from './core/scratch-plan';
import { score } from './core/scoring';
import type { Arm, Leg, Manifest, ScoreResult, ScratchPlan } from './core/types';

const DETECTION_ROOT = import.meta.dir;

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {
    leg: 'both', arm: 'both', fixture: 'orderly', reps: '3',
    'min-recall': '0.70', 'min-precision': '0.70',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const body = a.slice(2);
    const eqIdx = body.indexOf('=');
    if (eqIdx !== -1) {
      // `--flag=value` form: key/value both come from this single token — never
      // consume argv[i+1], or the next real flag silently becomes this flag's value.
      const key = body.slice(0, eqIdx);
      const value = body.slice(eqIdx + 1);
      args[key] = key === 'dry-run' ? value === 'true' : value;
      continue;
    }
    if (body === 'dry-run') { args['dry-run'] = true; continue; }
    const next = argv[i + 1];
    args[body] = next;
    i++;
  }
  return args;
}

function listFixtureFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else out.push(relative(root, full));
    }
  };
  walk(root);
  return out;
}

function loadMemoryFiles(): { path: string; content: string }[] {
  const memoryPath = join(DETECTION_ROOT, 'memory-fixture/CLAUDE.md');
  return existsSync(memoryPath) ? [{ path: 'CLAUDE.md', content: readFileSync(memoryPath, 'utf8') }] : [];
}

function loadAgentPayload(agentMdPath: string): { name: string; description: string; prompt: string; model?: string } {
  const text = readFileSync(agentMdPath, 'utf8');
  const end = text.indexOf('\n---', 3);
  const fm = text.slice(3, end);
  const body = text.slice(end + 4).trimStart();
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*>?-?\s*\n([\s\S]*?)\n\S/m);
  const modelMatch = fm.match(/^model:\s*(.+)$/m);
  const name = nameMatch ? nameMatch[1].trim() : 'eval-agent';
  const description = descMatch ? descMatch[1].replace(/^\s+/gm, ' ').trim() : `Role under test: ${name}.`;
  // `inherit` (Claude Code's own frontmatter convention for "use the caller's model") or a
  // missing field both mean "no model resolved from frontmatter" — same precedent as
  // scripts/evals/run_evals.py's resolve_exec_model.
  const rawModel = modelMatch ? modelMatch[1].trim() : undefined;
  const model = rawModel && rawModel !== 'inherit' ? rawModel : undefined;
  return { name, description, prompt: body.trim(), model };
}

function agentPathFor(leg: Leg): string {
  const name = leg === 'scout' ? 'scout' : 'tracker';
  return join(DETECTION_ROOT, '../../agents', `${name}.md`);
}

// Copies the fixture into the scratch dir, git-inits it, applies the tracker-leg patch, and
// writes the mem-arm memory files — the filesystem/git assembly step for a single leg×arm cell.
// Pure logic (what to copy/apply/write) already lives in core/scratch-plan.ts; this function is
// the impure edge that actually performs those filesystem and git operations.
function assembleScratch(input: { scratchDir: string; fixtureRoot: string; plan: ScratchPlan }): void {
  for (const relPath of input.plan.copyFiles) {
    const src = join(input.fixtureRoot, relPath);
    const dest = join(input.scratchDir, relPath);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(src, dest);
  }
  Bun.spawnSync(['git', 'init', '-q'], { cwd: input.scratchDir });
  Bun.spawnSync(['git', 'add', '-A'], { cwd: input.scratchDir });
  Bun.spawnSync(['git', '-c', 'user.email=eval@local', '-c', 'user.name=eval', 'commit', '-q', '-m', 'baseline'], { cwd: input.scratchDir });
  if (input.plan.applyPatch) {
    const patchPath = join(DETECTION_ROOT, input.plan.applyPatch);
    const applyResult = Bun.spawnSync(['git', 'apply', patchPath], { cwd: input.scratchDir });
    if (applyResult.exitCode !== 0) {
      throw new Error(`failed to apply ${input.plan.applyPatch} to scratch: ${applyResult.stderr?.toString()}`);
    }
    Bun.spawnSync(['git', 'add', '-A'], { cwd: input.scratchDir });
    Bun.spawnSync(['git', '-c', 'user.email=eval@local', '-c', 'user.name=eval', 'commit', '-q', '-m', 'add refunds endpoint'], { cwd: input.scratchDir });
  }
  for (const mf of input.plan.memoryFiles) {
    const dest = join(input.scratchDir, mf.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, mf.content);
  }
  if (input.plan.assertNoMemory) {
    if (existsSync(join(input.scratchDir, 'CLAUDE.md')) || existsSync(join(input.scratchDir, '.claude'))) {
      throw new Error('clean arm scratch unexpectedly contains memory/CLAUDE.md — hard-check failed');
    }
  }
}

// Tracks every claude -p child process currently in flight so an interrupted run (SIGINT/SIGTERM)
// can kill them instead of leaving orphaned, real-API-calling processes running.
const liveChildren = new Set<ReturnType<typeof Bun.spawn>>();

// `Bun.spawn` does not put the child in its own process group, and claude -p runs with Bash tool
// use enabled by default (the detector port passes no --tools restriction) — so a single-PID
// signal to the direct child never reaches any grandchild process claude spawns internally (e.g.
// a backgrounded shell command). This walks the full descendant tree via `pgrep -P` (BFS) and
// kills every PID in it, deepest-first, so no grandchild survives an interrupt/timeout.
function killProcessTree(pid: number, signal: string = 'SIGKILL'): void {
  const descendants: number[] = [];
  const queue: number[] = [pid];
  const seen = new Set<number>([pid]);
  while (queue.length > 0) {
    const current = queue.shift()!;
    let result;
    try {
      result = Bun.spawnSync(['pgrep', '-P', String(current)]);
    } catch (err) {
      console.error(`WARNING: killProcessTree — pgrep unavailable, falling back to direct-child kill only: ${err instanceof Error ? err.message : String(err)}`);
      try { process.kill(pid, signal as NodeJS.Signals); } catch { /* already exited */ }
      return;
    }
    if (result.exitCode !== 0) continue; // no children found for `current` — base case
    const stdout = result.stdout.toString().trim();
    if (stdout === '') continue;
    for (const line of stdout.split('\n')) {
      const childPid = Number(line.trim());
      if (!Number.isFinite(childPid) || seen.has(childPid)) continue;
      seen.add(childPid);
      descendants.push(childPid);
      queue.push(childPid);
    }
  }
  // Kill leaves first (reverse discovery order), then the root pid itself.
  for (const descendantPid of [...descendants].reverse()) {
    try { process.kill(descendantPid, signal as NodeJS.Signals); } catch { /* already exited */ }
  }
  try { process.kill(pid, signal as NodeJS.Signals); } catch { /* already exited */ }
}

function killLiveChildren(): void {
  for (const proc of liveChildren) {
    try { killProcessTree(proc.pid); } catch { /* already exited */ }
  }
}

process.on('SIGINT', () => { killLiveChildren(); process.exit(130); });
process.on('SIGTERM', () => { killLiveChildren(); process.exit(143); });

// A real Scout/Tracker survey or grading call should never legitimately take longer than this.
const CLAUDE_TIMEOUT_MS = 300_000;

async function runClaude(input: { prompt: string; cwd: string; agentsJson?: Record<string, unknown>; model?: string; tools?: string }): Promise<string[]> {
  const cmd = ['claude', '-p', input.prompt, '--output-format', 'stream-json', '--verbose',
    '--setting-sources', 'project', '--strict-mcp-config'];
  if (input.agentsJson) cmd.push('--agents', JSON.stringify(input.agentsJson));
  if (input.model) cmd.push('--model', input.model);
  if (input.tools !== undefined) cmd.push('--tools', input.tools);
  const proc = Bun.spawn(cmd, { cwd: input.cwd, stdout: 'pipe', stderr: 'pipe' });
  liveChildren.add(proc);
  try {
    // Race the actual read against a hard timeout. On timeout we kill the child and return a
    // synthetic `result`/`is_error` transcript line (the same shape a real claude -p emits) so
    // extractFinalResult reports ok:false with our timeout message intact, instead of throwing
    // and crashing the whole run for a single hung cell.
    const stdout = await Promise.race([
      new Response(proc.stdout).text(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error(`claude -p timed out after ${CLAUDE_TIMEOUT_MS}ms`)), CLAUDE_TIMEOUT_MS);
      }),
    ]);
    await proc.exited;
    return stdout.split('\n');
  } catch (err) {
    killProcessTree(proc.pid);
    const message = err instanceof Error ? err.message : String(err);
    return [JSON.stringify({ type: 'result', is_error: true, result: message })];
  } finally {
    liveChildren.delete(proc);
  }
}

function makeDetectorPort(): DetectorPort {
  return {
    async run({ leg, scratchDir, agentPath, model }) {
      const agent = loadAgentPayload(agentPath);
      // CLI --model always overrides the agent's own frontmatter model: field.
      const resolvedModel = model ?? agent.model;
      const lines = await runClaude({
        prompt: buildDetectorPrompt(leg), cwd: scratchDir,
        agentsJson: { [agent.name]: { description: agent.description, prompt: agent.prompt } }, model: resolvedModel,
      });
      const { extractFinalResult } = await import('./core/claude-transcript');
      const parsed = extractFinalResult(lines);
      return { report: parsed.ok ? parsed.text : `DETECTOR_ERROR: ${parsed.error}` };
    },
  };
}

function makeGraderPort(model?: string): GraderPort {
  return {
    async run({ prompt }) {
      const lines = await runClaude({ prompt, cwd: DETECTION_ROOT, model, tools: '' });
      const { extractFinalResult } = await import('./core/claude-transcript');
      const parsed = extractFinalResult(lines);
      return { text: parsed.ok ? parsed.text : '' };
    },
  };
}

async function printDryRun(legs: Leg[], arms: Arm[], manifest: Manifest, minRecall: number, minPrecision: number) {
  const fixtureRoot = join(DETECTION_ROOT, 'fixtures/orderly');
  const fixtureFiles = listFixtureFiles(fixtureRoot);
  const memoryFiles = loadMemoryFiles();
  console.log('=== Detection Eval — dry run ===');
  for (const leg of legs) {
    for (const arm of arms) {
      const plan = planScratch({ fixtureFiles, leg, arm, memoryFixtureFiles: memoryFiles, patchPath: manifest.legB.patch });
      console.log(`\n--- leg=${leg} arm=${arm} ---`);
      console.log(`files to copy: ${plan.copyFiles.length}`);
      console.log(`apply patch: ${plan.applyPatch ?? '(none)'}`);
      console.log(`memory files: ${plan.memoryFiles.map((f) => f.path).join(', ') || '(none)'}`);
      console.log(`assert no memory present: ${plan.assertNoMemory}`);
      console.log(`detector prompt: ${buildDetectorPrompt(leg).slice(0, 120)}...`);
      console.log(`agent definition: ${agentPathFor(leg)}`);
      console.log('command: claude -p <prompt> --output-format stream-json --verbose --setting-sources project --strict-mcp-config --agents <json>');
    }
  }
  console.log('\n=== Gate table ===');
  console.log(`G1 legA-clean recall >= ${minRecall}`);
  console.log(`G2 legA-clean precision >= ${minPrecision}`);
  console.log('G3 legA-clean easy-tier recall == 1.00');
  console.log('G4 legB-clean gap-recall >= 0.75');
  console.log('G5 legB-clean invented-rule violations == 0');
  console.log('(dry run — zero API calls made)');
}

// Aggregates a cell's per-rep ScoreResults into a single mean recall/precision pair for
// memDelta's purposes. memDelta only reads recall/precision (see core/gates.ts), so the other
// ScoreResult fields are zeroed/defaulted — they are never inspected by memDelta.
function meanScoreResult(scores: ReturnType<typeof score>[]): ScoreResult {
  const n = scores.length;
  const meanRecall = n === 0 ? 0 : scores.reduce((sum, s) => sum + s.recall, 0) / n;
  const meanPrecision = n === 0 ? 0 : scores.reduce((sum, s) => sum + s.precision, 0) / n;
  return {
    recall: meanRecall, precision: meanPrecision, easyTierRecall: null,
    caught: 0, partial: 0, missed: 0, decoysFlagged: 0, invented: 0, seeded: 0,
  };
}

// Computes the mem-arm delta for a leg only when BOTH its clean and mem cells were actually
// run (present with at least one rep); otherwise null (that leg wasn't run with both arms).
function computeMemDeltaFor(
  cellResults: Record<string, { scores: ReturnType<typeof score>[] }>,
  cleanKey: string,
  memKey: string,
): { deltaRecall: number; deltaPrecision: number } | null {
  const cleanCell = cellResults[cleanKey];
  const memCell = cellResults[memKey];
  if (!cleanCell || !memCell || cleanCell.scores.length === 0 || memCell.scores.length === 0) return null;
  return memDelta(meanScoreResult(memCell.scores), meanScoreResult(cleanCell.scores));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest: Manifest = JSON.parse(readFileSync(join(DETECTION_ROOT, 'manifest', `${args.fixture}.json`), 'utf8'));
  const legs: Leg[] = args.leg === 'both' ? ['scout', 'tracker'] : [args.leg as Leg];
  const arms: Arm[] = args.arm === 'both' ? ['clean', 'mem'] : [args.arm as Arm];
  const minRecall = Number(args['min-recall']);
  const minPrecision = Number(args['min-precision']);
  const reps = Number(args.reps);

  if (args['dry-run']) {
    await printDryRun(legs, arms, manifest, minRecall, minPrecision);
    return 0;
  }

  const fixtureRoot = join(DETECTION_ROOT, 'fixtures/orderly');
  const memoryFiles = loadMemoryFiles();

  const outDir = join(DETECTION_ROOT, 'results', new Date().toISOString().replace(/[:.]/g, '-'));
  mkdirSync(outDir, { recursive: true });

  const cellResults: Record<string, { pass: boolean; scores: ReturnType<typeof score>[] }> = {};
  for (const leg of legs) {
    for (const arm of arms) {
      const repPasses: boolean[] = [];
      const scores: ReturnType<typeof score>[] = [];
      for (let rep = 0; rep < reps; rep++) {
        const scratchDir = join(outDir, `${leg}-${arm}-rep${rep}`);
        mkdirSync(scratchDir, { recursive: true });
        const plan = planScratch({
          fixtureFiles: listFixtureFiles(fixtureRoot), leg, arm,
          memoryFixtureFiles: memoryFiles, patchPath: manifest.legB.patch,
        });
        assembleScratch({ scratchDir, fixtureRoot, plan });
        const cell = await runCell({
          leg, arm, scratchDir, agentPath: agentPathFor(leg), model: args.model as string | undefined,
          manifest, detector: makeDetectorPort(), grader: makeGraderPort(args['grader-model'] as string | undefined),
        });
        if (cell.ungraded) {
          // grading.json already carries the full `cell` (including ungraded/error) — this is
          // the loud, impossible-to-miss terminal signal that grading itself failed, distinct
          // from the detector genuinely finding nothing.
          console.error(`WARNING: leg=${leg} arm=${arm} rep=${rep} — grading pipeline failed (ungraded): ${cell.error}`);
        }
        const seeded = leg === 'scout'
          ? manifest.conventions.map((c) => ({ id: c.id, tier: c.tier }))
          : manifest.conventions.filter((c) => manifest.legB.violates.includes(c.id)).map((c) => ({ id: c.id, tier: c.tier }));
        const s = score({
          verdicts: cell.verdict?.conventions ?? [], seeded,
          decoysFlagged: cell.verdict?.decoys_flagged ?? [], invented: cell.verdict?.invented ?? [],
        });
        scores.push(s);
        writeFileSync(join(scratchDir, 'grading.json'), JSON.stringify({ cell: cell, score: s }, null, 2));
        const gates = leg === 'scout' && arm === 'clean' ? evaluateLegAClean(s, minRecall, minPrecision)
          : leg === 'tracker' && arm === 'clean' ? evaluateLegBClean(s.recall, s.invented) : [];
        repPasses.push(gates.length === 0 ? true : repetitionPasses(gates));
      }
      cellResults[`${leg}-${arm}`] = { pass: cellPasses(repPasses), scores };
    }
  }

  const legAClean = cellResults['scout-clean']?.pass ?? false;
  const legBClean = cellResults['tracker-clean']?.pass ?? false;
  const pass = topLevelPass({ legAClean, legBClean });
  const deltas = {
    scout: computeMemDeltaFor(cellResults, 'scout-clean', 'scout-mem'),
    tracker: computeMemDeltaFor(cellResults, 'tracker-clean', 'tracker-mem'),
  };
  const benchmark = { cells: cellResults, pass, deltas };
  writeFileSync(join(outDir, 'benchmark.json'), JSON.stringify(benchmark, null, 2));
  console.log(JSON.stringify(benchmark, null, 2));
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((e) => { console.error(e); process.exit(1); });
