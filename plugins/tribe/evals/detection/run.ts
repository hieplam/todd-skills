#!/usr/bin/env bun
// module: run
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { evaluateLegAClean, evaluateLegBClean, cellPasses, memDelta, repetitionPasses, topLevelPass } from './core/gates';
import { runCell, type DetectorPort, type GraderPort } from './core/orchestrate';
import { buildDetectorPrompt } from './core/prompts';
import { planScratch } from './core/scratch-plan';
import { score } from './core/scoring';
import type { Arm, Leg, Manifest, ScratchPlan } from './core/types';

const DETECTION_ROOT = import.meta.dir;

function parseArgs(argv: string[]) {
  const args: Record<string, string | boolean> = {
    leg: 'both', arm: 'both', fixture: 'orderly', reps: '3',
    'min-recall': '0.70', 'min-precision': '0.70',
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') { args['dry-run'] = true; continue; }
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      args[key] = next;
      i++;
    }
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

function loadAgentPayload(agentMdPath: string): { name: string; description: string; prompt: string } {
  const text = readFileSync(agentMdPath, 'utf8');
  const end = text.indexOf('\n---', 3);
  const fm = text.slice(3, end);
  const body = text.slice(end + 4).trimStart();
  const nameMatch = fm.match(/^name:\s*(.+)$/m);
  const descMatch = fm.match(/^description:\s*>?-?\s*\n([\s\S]*?)\n\S/m);
  const name = nameMatch ? nameMatch[1].trim() : 'eval-agent';
  const description = descMatch ? descMatch[1].replace(/^\s+/gm, ' ').trim() : `Role under test: ${name}.`;
  return { name, description, prompt: body.trim() };
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

async function runClaude(input: { prompt: string; cwd: string; agentsJson?: Record<string, unknown>; model?: string; tools?: string }): Promise<string[]> {
  const cmd = ['claude', '-p', input.prompt, '--output-format', 'stream-json', '--verbose',
    '--setting-sources', 'project', '--strict-mcp-config'];
  if (input.agentsJson) cmd.push('--agents', JSON.stringify(input.agentsJson));
  if (input.model) cmd.push('--model', input.model);
  if (input.tools !== undefined) cmd.push('--tools', input.tools);
  const proc = Bun.spawn(cmd, { cwd: input.cwd, stdout: 'pipe', stderr: 'pipe' });
  const stdout = await new Response(proc.stdout).text();
  await proc.exited;
  return stdout.split('\n');
}

function makeDetectorPort(): DetectorPort {
  return {
    async run({ leg, scratchDir, agentPath, model }) {
      const agent = loadAgentPayload(agentPath);
      const lines = await runClaude({
        prompt: buildDetectorPrompt(leg), cwd: scratchDir,
        agentsJson: { [agent.name]: { description: agent.description, prompt: agent.prompt } }, model,
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
  const benchmark = { cells: cellResults, pass };
  writeFileSync(join(outDir, 'benchmark.json'), JSON.stringify(benchmark, null, 2));
  console.log(JSON.stringify(benchmark, null, 2));
  return pass ? 0 : 1;
}

main().then((code) => process.exit(code)).catch((e) => { console.error(e); process.exit(1); });
