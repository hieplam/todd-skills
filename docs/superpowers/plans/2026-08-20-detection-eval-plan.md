# Plan: Detection Eval harness (`plugins/tribe/evals/detection/`)

Binding spec: `docs/superpowers/specs/2026-08-20-detection-eval-design.md` (approved by owner —
read it before any task; this plan implements it exactly, no re-litigation).

## Global Constraints

- Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.
- Purity: core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see `~/.claude/rules/pure-core.md`).
- Scope fence: everything lives under `plugins/tribe/evals/detection/**` plus
  `plugins/tribe/evals/detection/README.md`. Never touch `plugins/tribe/agents/*.md`,
  `scripts/evals/run_evals.py`, `plugins/tribe/scripts/gaps/**`, `plugins/tribe/evals/evals.json`,
  or `install.sh`.
- Two separate bun projects exist under this tree: `plugins/tribe/evals/detection/` (the harness:
  `core/`, `run.ts`) and `plugins/tribe/evals/detection/fixtures/orderly/` (the seeded app). `bun
  test` run from each root only picks up that root's own `*.test.ts` files. Never let one
  project's `node_modules`/`package.json` reach into the other.
- Scale note on fixture tasks (T5-T9): the fixture is ~30 files implementing a small order
  service. Each fixture task below gives exact function signatures, exact deviation code
  (verbatim, marked `DEVIATION`), and exact test assertions. Routine CRUD boilerplate
  (constructors, straightforward getters, the `Db` maps) is specified by shape/signature rather
  than typed out brace-by-brace — the Hunter fills it in following the given signatures exactly.
  This is a deliberate scale tradeoff, not an unfinished spec: every deviation, every exemplar
  count, and every test assertion is fully concrete below.
- Every fixture `.ts` source file (not test files) must, uniformly, across ALL fixture source
  files: (a) start with a `// module: <relative-module-name-without-extension>` first-line
  comment, (b) order its `import` statements alphabetically by module specifier, (c) use
  single-quote strings exclusively (never double quotes). These three rules ARE decoys D1/D2/D3 —
  applying them uniformly is what makes them prevalence-floor "style taste" patterns, never a
  real seeded convention. Do not deviate from any of the three anywhere in the fixture (a decoy
  with its own exception would stop being a decoy).
- Money in the fixture is always integer cents (field names end `Cents`); timestamps are ISO
  strings in fields named `*AtUtc` except the one seeded C3 deviation.
- Commands below assume cwd is the plan's own worktree root
  (`/Users/todd.lam/WORK/_TestScripts/todd-skills/.claude/worktrees/detection-eval`) unless a
  task explicitly `cd`s elsewhere.

---

## Task 1: Harness scaffold + core/types.ts + core/manifest.ts

Files:
- `plugins/tribe/evals/detection/package.json`
- `plugins/tribe/evals/detection/tsconfig.json`
- `plugins/tribe/evals/detection/.gitignore`
- `plugins/tribe/evals/detection/core/types.ts`
- `plugins/tribe/evals/detection/core/manifest.ts`
- `plugins/tribe/evals/detection/core/manifest.test.ts`

`package.json`:
```json
{
  "name": "detection-eval",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "bun test core",
    "dry-run": "bun run.ts --dry-run"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["core/**/*.ts", "run.ts"]
}
```

`.gitignore`:
```
results/
```

`core/types.ts`:
```ts
// module: core/types
export type Tier = 'easy' | 'medium' | 'hard';

export interface ConventionEntry {
  id: string;
  tier: Tier;
  description: string;
  exemplars: string[];
  deviation: { file: string; line: number; note: string };
  expected_detection: string;
}

export interface DecoyEntry {
  id: string;
  description: string;
  exemplars: string[];
}

export interface Manifest {
  fixture: string;
  conventions: ConventionEntry[];
  decoys: DecoyEntry[];
  legB: { patch: string; violates: string[] };
}

export type Verdict = 'caught' | 'partial' | 'missed';

export interface GraderConventionVerdict {
  id: string;
  verdict: Verdict;
  evidence: string;
}

export interface GraderVerdict {
  conventions: GraderConventionVerdict[];
  decoys_flagged: string[];
  invented: string[];
}

export type Leg = 'scout' | 'tracker';
export type Arm = 'clean' | 'mem';

export interface ScratchPlan {
  copyFrom: string;
  copyFiles: string[];
  excludePaths: string[];
  applyPatch: string | null;
  memoryFiles: { path: string; content: string }[];
  assertNoMemory: boolean;
}

export interface ScoreResult {
  recall: number;
  precision: number;
  easyTierRecall: number | null;
  caught: number;
  partial: number;
  missed: number;
  decoysFlagged: number;
  invented: number;
  seeded: number;
}

export interface GateResult {
  id: 'G1' | 'G2' | 'G3' | 'G4' | 'G5';
  cell: string;
  threshold: number;
  actual: number;
  pass: boolean;
}
```

`core/manifest.ts` — pure validator, no fixture reads, no fixture-specific counts (generic across
any future fixture):
```ts
// module: core/manifest
import type { ConventionEntry, DecoyEntry, Manifest, Tier } from './types';

const TIERS: Tier[] = ['easy', 'medium', 'hard'];

export type ValidationResult =
  | { ok: true; value: Manifest }
  | { ok: false; errors: string[] };

function isNonEmptyString(v: unknown): v is string {
  return typeof v === 'string' && v.length > 0;
}

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string');
}

function validateConvention(c: unknown, idx: number, errors: string[]): c is ConventionEntry {
  if (typeof c !== 'object' || c === null) {
    errors.push(`conventions[${idx}]: not an object`);
    return false;
  }
  const rec = c as Record<string, unknown>;
  if (!isNonEmptyString(rec.id)) errors.push(`conventions[${idx}]: missing/invalid id`);
  if (!TIERS.includes(rec.tier as Tier)) errors.push(`conventions[${idx}] (${rec.id}): invalid tier '${String(rec.tier)}'`);
  if (!isNonEmptyString(rec.description)) errors.push(`conventions[${idx}] (${rec.id}): missing description`);
  if (!isStringArray(rec.exemplars) || rec.exemplars.length < 3) {
    errors.push(`conventions[${idx}] (${rec.id}): exemplars must be a string[] with length >= 3`);
  }
  const dev = rec.deviation as Record<string, unknown> | undefined;
  if (typeof dev !== 'object' || dev === null || !isNonEmptyString(dev.file) ||
      typeof dev.line !== 'number' || !isNonEmptyString(dev.note)) {
    errors.push(`conventions[${idx}] (${rec.id}): deviation must be {file, line, note}`);
  }
  if (!isNonEmptyString(rec.expected_detection)) errors.push(`conventions[${idx}] (${rec.id}): missing expected_detection`);
  return errors.length === 0;
}

function validateDecoy(d: unknown, idx: number, errors: string[]): d is DecoyEntry {
  if (typeof d !== 'object' || d === null) {
    errors.push(`decoys[${idx}]: not an object`);
    return false;
  }
  const rec = d as Record<string, unknown>;
  if (!isNonEmptyString(rec.id)) errors.push(`decoys[${idx}]: missing/invalid id`);
  if (!isNonEmptyString(rec.description)) errors.push(`decoys[${idx}] (${rec.id}): missing description`);
  if (!isStringArray(rec.exemplars) || rec.exemplars.length < 3) {
    errors.push(`decoys[${idx}] (${rec.id}): exemplars must be a string[] with length >= 3`);
  }
  return true;
}

export function validateManifest(data: unknown): ValidationResult {
  const errors: string[] = [];
  if (typeof data !== 'object' || data === null) {
    return { ok: false, errors: ['manifest: not an object'] };
  }
  const rec = data as Record<string, unknown>;
  if (!isNonEmptyString(rec.fixture)) errors.push('manifest: missing fixture name');
  if (!Array.isArray(rec.conventions)) {
    errors.push('manifest: conventions must be an array');
  } else {
    rec.conventions.forEach((c, i) => validateConvention(c, i, errors));
  }
  if (!Array.isArray(rec.decoys)) {
    errors.push('manifest: decoys must be an array');
  } else {
    rec.decoys.forEach((d, i) => validateDecoy(d, i, errors));
  }
  const legB = rec.legB as Record<string, unknown> | undefined;
  const conventionIds = Array.isArray(rec.conventions)
    ? (rec.conventions as Record<string, unknown>[]).map((c) => c.id).filter(isNonEmptyString)
    : [];
  if (typeof legB !== 'object' || legB === null || !isNonEmptyString(legB.patch) || !isStringArray(legB.violates)) {
    errors.push('manifest: legB must be {patch: string, violates: string[]}');
  } else {
    for (const v of legB.violates) {
      if (!conventionIds.includes(v)) errors.push(`manifest: legB.violates references unknown convention id '${v}'`);
    }
  }
  if (errors.length > 0) return { ok: false, errors };
  return { ok: true, value: data as Manifest };
}
```

`core/manifest.test.ts`:
```ts
// module: core/manifest.test
import { describe, expect, test } from 'bun:test';
import { validateManifest } from './manifest';

function validManifest() {
  return {
    fixture: 'orderly',
    conventions: [
      {
        id: 'C1', tier: 'easy', description: 'services return Result',
        exemplars: ['src/services/orderService.ts', 'src/services/customerService.ts', 'src/services/productService.ts'],
        deviation: { file: 'src/services/notificationService.ts', line: 12, note: 'throws instead of Result' },
        expected_detection: 'names the pattern and the throwing site',
      },
    ],
    decoys: [
      { id: 'D1', description: 'alphabetical imports', exemplars: ['a.ts', 'b.ts', 'c.ts'] },
    ],
    legB: { patch: 'diffs/orderly-pr1.patch', violates: ['C1'] },
  };
}

describe('validateManifest', () => {
  test('accepts a well-formed manifest', () => {
    const result = validateManifest(validManifest());
    expect(result.ok).toBe(true);
  });

  test('rejects a convention missing tier', () => {
    const m = validManifest();
    // @ts-expect-error deliberately malformed for the test
    delete m.conventions[0].tier;
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('tier'))).toBe(true);
  });

  test('rejects a convention with fewer than 3 exemplars', () => {
    const m = validManifest();
    m.conventions[0].exemplars = ['only-one.ts'];
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
  });

  test('rejects legB.violates referencing an unknown convention id', () => {
    const m = validManifest();
    m.legB.violates = ['C99'];
    const result = validateManifest(m);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.some((e) => e.includes('C99'))).toBe(true);
  });

  test('rejects a non-object payload', () => {
    const result = validateManifest('not an object');
    expect(result.ok).toBe(false);
  });

  test('a decoy needs no deviation field', () => {
    const m = validManifest();
    const result = validateManifest(m);
    expect(result.ok).toBe(true);
  });
});
```

Steps:
- [x] **Step 1: RED** — `cd plugins/tribe/evals/detection && bun test core/manifest.test.ts` fails
  (module `./manifest` does not exist yet).
- [x] **Step 2: GREEN** — add all files above; re-run the same command.
- [x] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection && bun test core/manifest.test.ts
```
Expected: `6 pass, 0 fail` (all six `describe`/`test` cases above green).

---

## Task 2: core/scratch-plan.ts + core/prompts.ts

Files:
- `plugins/tribe/evals/detection/core/scratch-plan.ts`
- `plugins/tribe/evals/detection/core/scratch-plan.test.ts`
- `plugins/tribe/evals/detection/core/prompts.ts`
- `plugins/tribe/evals/detection/core/prompts.test.ts`

`core/scratch-plan.ts`:
```ts
// module: core/scratch-plan
import type { Arm, Leg, ScratchPlan } from './types';

export function planScratch(input: {
  fixtureFiles: string[];
  leg: Leg;
  arm: Arm;
  memoryFixtureFiles?: { path: string; content: string }[];
  patchPath?: string;
}): ScratchPlan {
  const excludePaths = input.fixtureFiles.filter((f) => f.includes('manifest'));
  const copyFiles = input.fixtureFiles.filter((f) => !f.includes('manifest'));
  return {
    copyFrom: 'fixtures/orderly',
    copyFiles,
    excludePaths,
    applyPatch: input.leg === 'tracker' ? (input.patchPath ?? 'diffs/orderly-pr1.patch') : null,
    memoryFiles: input.arm === 'mem' ? (input.memoryFixtureFiles ?? []) : [],
    assertNoMemory: input.arm === 'clean',
  };
}
```

`core/scratch-plan.test.ts`:
```ts
// module: core/scratch-plan.test
import { describe, expect, test } from 'bun:test';
import { planScratch } from './scratch-plan';

const FILES = ['src/index.ts', 'src/services/orderService.ts', '../manifest/orderly.json'];

describe('planScratch', () => {
  test('clean arm carries no memory files and asserts none', () => {
    const plan = planScratch({ fixtureFiles: FILES, leg: 'scout', arm: 'clean' });
    expect(plan.memoryFiles).toEqual([]);
    expect(plan.assertNoMemory).toBe(true);
  });

  test('mem arm carries the injected memory files', () => {
    const mem = [{ path: 'CLAUDE.md', content: 'x' }];
    const plan = planScratch({ fixtureFiles: FILES, leg: 'scout', arm: 'mem', memoryFixtureFiles: mem });
    expect(plan.memoryFiles).toEqual(mem);
    expect(plan.assertNoMemory).toBe(false);
  });

  test('tracker leg applies the default patch', () => {
    const plan = planScratch({ fixtureFiles: FILES, leg: 'tracker', arm: 'clean' });
    expect(plan.applyPatch).toBe('diffs/orderly-pr1.patch');
  });

  test('scout leg never applies a patch', () => {
    const plan = planScratch({ fixtureFiles: FILES, leg: 'scout', arm: 'clean' });
    expect(plan.applyPatch).toBeNull();
  });

  test('the manifest is never in copyFiles, always in excludePaths', () => {
    const plan = planScratch({ fixtureFiles: FILES, leg: 'scout', arm: 'clean' });
    expect(plan.copyFiles.some((f) => f.includes('manifest'))).toBe(false);
    expect(plan.excludePaths).toEqual(['../manifest/orderly.json']);
  });
});
```

`core/prompts.ts`:
```ts
// module: core/prompts
import type { Leg, Manifest } from './types';

export function buildDetectorPrompt(leg: Leg): string {
  if (leg === 'scout') {
    return [
      'Survey this codebase per your Scout role: sweep at all three altitudes, find the',
      'structures that invite the next bug, and distill each finding into a rule candidate.',
      'This is a real, working TypeScript/bun order-service codebase — treat it exactly as',
      'you would treat any repo you have been asked to survey.',
    ].join(' ');
  }
  return [
    'Review the diff of the most recent commit on this branch per your Tracker role: load the',
    'rules that apply, walk the diff hunk by hunk, and report violations plus any harness gaps',
    "where the diff follows or breaks a pattern no rule you loaded covers ('the rule set is",
    "silent here' — never an invented rule).",
  ].join(' ');
}

export function buildGraderPrompt(input: { leg: Leg; manifest: Manifest; detectorReport: string }): string {
  const seeded = input.leg === 'scout'
    ? input.manifest.conventions
    : input.manifest.conventions.filter((c) => input.manifest.legB.violates.includes(c.id));
  const conventionLines = seeded
    .map((c) => `- ${c.id} (${c.tier}): ${c.description}\n  Expected detection: ${c.expected_detection}`)
    .join('\n');
  return [
    'You are grading a detection report, exactly like a disinterested QA reviewer. You have no',
    'tools — judge only from the text given below.',
    '',
    'SEEDED CONVENTIONS TO SCORE (grade ONLY these; anything else the report names goes under',
    "'invented' unless it matches a listed decoy):",
    conventionLines,
    '',
    "DETECTOR'S FULL REPORT:",
    input.detectorReport,
    '',
    'For each seeded convention above, decide caught (report names BOTH the pattern AND its',
    'deviation site) / partial (names only one of the two) / missed. Also list decoys_flagged',
    '(any of D1/D2/D3-style taste patterns the report wrongly flags as a real convention/gap)',
    'and invented (any asserted convention/gap matching nothing seeded).',
    '',
    'Output ONLY a JSON object, no prose, no markdown fences, matching exactly this shape:',
    '{"conventions": [{"id": "C1", "verdict": "caught"|"partial"|"missed", "evidence": "..."}, ...],',
    '"decoys_flagged": ["..."], "invented": ["..."]}',
  ].join('\n');
}
```

`core/prompts.test.ts`:
```ts
// module: core/prompts.test
import { describe, expect, test } from 'bun:test';
import { buildDetectorPrompt, buildGraderPrompt } from './prompts';
import type { Manifest } from './types';

const MANIFEST: Manifest = {
  fixture: 'orderly',
  conventions: [
    {
      id: 'C1', tier: 'easy', description: 'services return Result objects, never throw',
      exemplars: ['a.ts', 'b.ts', 'c.ts'],
      deviation: { file: 'src/services/notificationService.ts', line: 12, note: 'throws' },
      expected_detection: 'names the throwing site',
    },
    {
      id: 'C4', tier: 'medium', description: 'clock is injected everywhere',
      exemplars: ['a.ts', 'b.ts', 'c.ts'],
      deviation: { file: 'src/services/customerService.ts', line: 9, note: 'calls Date.now() inline' },
      expected_detection: 'names the inline call',
    },
  ],
  decoys: [],
  legB: { patch: 'diffs/orderly-pr1.patch', violates: ['C1'] },
};

describe('buildDetectorPrompt', () => {
  test('scout and tracker prompts differ and never mention manifest content', () => {
    const scout = buildDetectorPrompt('scout');
    const tracker = buildDetectorPrompt('tracker');
    expect(scout).not.toBe(tracker);
    for (const p of [scout, tracker]) {
      expect(p.toLowerCase()).not.toContain('notificationservice');
      expect(p.toLowerCase()).not.toContain('customerservice');
    }
  });
});

describe('buildGraderPrompt', () => {
  test('leg A grader prompt lists every seeded convention', () => {
    const prompt = buildGraderPrompt({ leg: 'scout', manifest: MANIFEST, detectorReport: 'report text' });
    expect(prompt).toContain('C1');
    expect(prompt).toContain('C4');
    expect(prompt).toContain('report text');
    expect(prompt).toContain('decoys_flagged');
    expect(prompt).toContain('invented');
  });

  test('leg B grader prompt is restricted to legB.violates', () => {
    const prompt = buildGraderPrompt({ leg: 'tracker', manifest: MANIFEST, detectorReport: 'diff report' });
    expect(prompt).toContain('C1');
    expect(prompt).not.toContain('C4');
  });
});
```

Steps:
- [x] **Step 1: RED** — `cd plugins/tribe/evals/detection && bun test core/scratch-plan.test.ts core/prompts.test.ts` fails (modules missing).
- [x] **Step 2: GREEN** — add all four files; re-run.
- [x] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection && bun test core/scratch-plan.test.ts core/prompts.test.ts
```
Expected: `8 pass, 0 fail` (5 scratch-plan + 3 prompts cases).

---

## Task 3: core/verdict-parsing.ts + core/scoring.ts

Files:
- `plugins/tribe/evals/detection/core/verdict-parsing.ts`
- `plugins/tribe/evals/detection/core/verdict-parsing.test.ts`
- `plugins/tribe/evals/detection/core/scoring.ts`
- `plugins/tribe/evals/detection/core/scoring.test.ts`

`core/verdict-parsing.ts`:
```ts
// module: core/verdict-parsing
import type { GraderVerdict, Verdict } from './types';

export type ParseResult =
  | { ok: true; value: GraderVerdict }
  | { ok: false; error: string };

const VERDICTS: Verdict[] = ['caught', 'partial', 'missed'];

export function parseGraderVerdict(raw: string): ParseResult {
  const stripped = raw.replace(/^```(?:json)?/m, '').replace(/```$/m, '').trim();
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch (e) {
    return { ok: false, error: `not valid JSON: ${(e as Error).message}` };
  }
  if (typeof data !== 'object' || data === null) {
    return { ok: false, error: 'top-level value is not an object' };
  }
  const rec = data as Record<string, unknown>;
  if (!Array.isArray(rec.conventions)) {
    return { ok: false, error: 'missing conventions array' };
  }
  for (const c of rec.conventions as unknown[]) {
    if (typeof c !== 'object' || c === null) return { ok: false, error: 'a conventions[] entry is not an object' };
    const cr = c as Record<string, unknown>;
    if (typeof cr.id !== 'string') return { ok: false, error: 'a conventions[] entry is missing id' };
    if (!VERDICTS.includes(cr.verdict as Verdict)) {
      return { ok: false, error: `conventions[${cr.id}] has invalid verdict '${String(cr.verdict)}'` };
    }
  }
  if (!Array.isArray(rec.decoys_flagged) || !rec.decoys_flagged.every((x) => typeof x === 'string')) {
    return { ok: false, error: 'decoys_flagged must be a string[]' };
  }
  if (!Array.isArray(rec.invented) || !rec.invented.every((x) => typeof x === 'string')) {
    return { ok: false, error: 'invented must be a string[]' };
  }
  return { ok: true, value: data as GraderVerdict };
}
```

`core/verdict-parsing.test.ts`:
```ts
// module: core/verdict-parsing.test
import { describe, expect, test } from 'bun:test';
import { parseGraderVerdict } from './verdict-parsing';

describe('parseGraderVerdict', () => {
  test('parses well-formed JSON', () => {
    const raw = '{"conventions":[{"id":"C1","verdict":"caught","evidence":"x"}],"decoys_flagged":[],"invented":[]}';
    const result = parseGraderVerdict(raw);
    expect(result.ok).toBe(true);
  });

  test('strips markdown fences before parsing', () => {
    const raw = '```json\n{"conventions":[],"decoys_flagged":[],"invented":[]}\n```';
    const result = parseGraderVerdict(raw);
    expect(result.ok).toBe(true);
  });

  test('rejects a missing conventions array', () => {
    const result = parseGraderVerdict('{"decoys_flagged":[],"invented":[]}');
    expect(result.ok).toBe(false);
  });

  test('rejects an invalid verdict enum value', () => {
    const raw = '{"conventions":[{"id":"C1","verdict":"sort-of","evidence":"x"}],"decoys_flagged":[],"invented":[]}';
    const result = parseGraderVerdict(raw);
    expect(result.ok).toBe(false);
  });

  test('rejects non-JSON text', () => {
    const result = parseGraderVerdict('the agent did a great job');
    expect(result.ok).toBe(false);
  });
});
```

`core/scoring.ts`:
```ts
// module: core/scoring
import type { GraderConventionVerdict, ScoreResult, Tier } from './types';

export interface ScoringInput {
  verdicts: GraderConventionVerdict[];
  seeded: { id: string; tier?: Tier }[];
  decoysFlagged: string[];
  invented: string[];
}

export function score(input: ScoringInput): ScoreResult {
  const byId = new Map(input.verdicts.map((v) => [v.id, v.verdict]));
  let caught = 0;
  let partial = 0;
  let missed = 0;
  for (const s of input.seeded) {
    const v = byId.get(s.id) ?? 'missed';
    if (v === 'caught') caught++;
    else if (v === 'partial') partial++;
    else missed++;
  }
  const seeded = input.seeded.length;
  const recall = seeded === 0 ? 0 : (caught + 0.5 * partial) / seeded;
  const fpDenominator = caught + input.decoysFlagged.length + input.invented.length;
  const precision = fpDenominator === 0 ? 1 : caught / fpDenominator;
  const easyIds = input.seeded.filter((s) => s.tier === 'easy').map((s) => s.id);
  let easyTierRecall: number | null = null;
  if (easyIds.length > 0) {
    const easyCaught = easyIds.filter((id) => byId.get(id) === 'caught').length;
    easyTierRecall = easyCaught / easyIds.length;
  }
  return {
    recall, precision, easyTierRecall, caught, partial, missed,
    decoysFlagged: input.decoysFlagged.length, invented: input.invented.length, seeded,
  };
}
```

`core/scoring.test.ts`:
```ts
// module: core/scoring.test
import { describe, expect, test } from 'bun:test';
import { score } from './scoring';

describe('score', () => {
  test('all caught, no noise => recall 1, precision 1', () => {
    const result = score({
      verdicts: [{ id: 'C1', verdict: 'caught', evidence: '' }, { id: 'C2', verdict: 'caught', evidence: '' }],
      seeded: [{ id: 'C1' }, { id: 'C2' }],
      decoysFlagged: [], invented: [],
    });
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(1);
  });

  test('partial credit is 0.5', () => {
    const result = score({
      verdicts: [
        { id: 'C1', verdict: 'caught', evidence: '' }, { id: 'C2', verdict: 'caught', evidence: '' },
        { id: 'C3', verdict: 'partial', evidence: '' }, { id: 'C4', verdict: 'partial', evidence: '' },
      ],
      seeded: Array.from({ length: 10 }, (_, i) => ({ id: `C${i + 1}` })),
      decoysFlagged: [], invented: [],
    });
    expect(result.recall).toBeCloseTo(0.3, 5);
  });

  test('decoys and invented findings lower precision', () => {
    const result = score({
      verdicts: [{ id: 'C1', verdict: 'caught', evidence: '' }],
      seeded: [{ id: 'C1' }],
      decoysFlagged: ['D1'], invented: ['made-up'],
    });
    expect(result.precision).toBeCloseTo(1 / 3, 5);
  });

  test('zero caught and zero false positives => precision defined as 1', () => {
    const result = score({ verdicts: [], seeded: [{ id: 'C1' }], decoysFlagged: [], invented: [] });
    expect(result.precision).toBe(1);
    expect(result.recall).toBe(0);
  });

  test('empty seeded set never divides by zero', () => {
    const result = score({ verdicts: [], seeded: [], decoysFlagged: [], invented: [] });
    expect(result.recall).toBe(0);
  });

  test('easy tier recall counts only tier === easy entries', () => {
    const result = score({
      verdicts: [{ id: 'C1', verdict: 'caught', evidence: '' }, { id: 'C4', verdict: 'missed', evidence: '' }],
      seeded: [{ id: 'C1', tier: 'easy' }, { id: 'C4', tier: 'medium' }],
      decoysFlagged: [], invented: [],
    });
    expect(result.easyTierRecall).toBe(1);
  });

  test('easy tier recall is null when no easy-tier ids are seeded', () => {
    const result = score({
      verdicts: [], seeded: [{ id: 'C4', tier: 'medium' }], decoysFlagged: [], invented: [],
    });
    expect(result.easyTierRecall).toBeNull();
  });
});
```

Steps:
- [x] **Step 1: RED** — `cd plugins/tribe/evals/detection && bun test core/verdict-parsing.test.ts core/scoring.test.ts` fails.
- [x] **Step 2: GREEN** — add all four files; re-run.
- [x] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection && bun test core/verdict-parsing.test.ts core/scoring.test.ts
```
Expected: `12 pass, 0 fail` (5 verdict-parsing + 7 scoring cases).

---

## Task 4: core/gates.ts

Files:
- `plugins/tribe/evals/detection/core/gates.ts`
- `plugins/tribe/evals/detection/core/gates.test.ts`

`core/gates.ts`:
```ts
// module: core/gates
import type { GateResult, ScoreResult } from './types';

export function evaluateLegAClean(scoreResult: ScoreResult, minRecall: number, minPrecision: number): GateResult[] {
  return [
    { id: 'G1', cell: 'legA-clean', threshold: minRecall, actual: scoreResult.recall, pass: scoreResult.recall >= minRecall },
    { id: 'G2', cell: 'legA-clean', threshold: minPrecision, actual: scoreResult.precision, pass: scoreResult.precision >= minPrecision },
    { id: 'G3', cell: 'legA-clean', threshold: 1.0, actual: scoreResult.easyTierRecall ?? 0, pass: (scoreResult.easyTierRecall ?? 0) === 1.0 },
  ];
}

export function evaluateLegBClean(gapRecall: number, inventedViolations: number): GateResult[] {
  return [
    { id: 'G4', cell: 'legB-clean', threshold: 0.75, actual: gapRecall, pass: gapRecall >= 0.75 },
    { id: 'G5', cell: 'legB-clean', threshold: 0, actual: inventedViolations, pass: inventedViolations === 0 },
  ];
}

export function repetitionPasses(gateResults: GateResult[]): boolean {
  return gateResults.every((g) => g.pass);
}

export function cellPasses(repetitionResults: boolean[]): boolean {
  return repetitionResults.filter(Boolean).length >= 2;
}

export function topLevelPass(cells: { legAClean: boolean; legBClean: boolean }): boolean {
  return cells.legAClean && cells.legBClean;
}

export function memDelta(mem: ScoreResult, clean: ScoreResult): { deltaRecall: number; deltaPrecision: number } {
  return { deltaRecall: mem.recall - clean.recall, deltaPrecision: mem.precision - clean.precision };
}
```

`core/gates.test.ts`:
```ts
// module: core/gates.test
import { describe, expect, test } from 'bun:test';
import { cellPasses, evaluateLegAClean, evaluateLegBClean, memDelta, repetitionPasses, topLevelPass } from './gates';
import type { ScoreResult } from './types';

const SCORE: ScoreResult = { recall: 0.7, precision: 0.7, easyTierRecall: 1, caught: 7, partial: 0, missed: 3, decoysFlagged: 0, invented: 0, seeded: 10 };

describe('evaluateLegAClean', () => {
  test('recall exactly at threshold passes (>=)', () => {
    const gates = evaluateLegAClean(SCORE, 0.7, 0.7);
    expect(gates.find((g) => g.id === 'G1')!.pass).toBe(true);
    expect(gates.find((g) => g.id === 'G2')!.pass).toBe(true);
  });

  test('G3 requires easy tier recall exactly 1.0', () => {
    const score = { ...SCORE, easyTierRecall: 0.67 };
    const gates = evaluateLegAClean(score, 0.7, 0.7);
    expect(gates.find((g) => g.id === 'G3')!.pass).toBe(false);
  });

  test('below-threshold recall fails G1', () => {
    const score = { ...SCORE, recall: 0.5 };
    const gates = evaluateLegAClean(score, 0.7, 0.7);
    expect(gates.find((g) => g.id === 'G1')!.pass).toBe(false);
  });
});

describe('evaluateLegBClean', () => {
  test('G4 passes at 0.75 gap recall, G5 requires zero invented violations', () => {
    const gates = evaluateLegBClean(0.75, 0);
    expect(gates.every((g) => g.pass)).toBe(true);
  });

  test('G5 fails on any invented violation', () => {
    const gates = evaluateLegBClean(1.0, 1);
    expect(gates.find((g) => g.id === 'G5')!.pass).toBe(false);
  });
});

describe('repetitionPasses / cellPasses', () => {
  test('a repetition passes only when every gate in it passes', () => {
    expect(repetitionPasses(evaluateLegAClean(SCORE, 0.7, 0.7))).toBe(true);
    expect(repetitionPasses(evaluateLegAClean({ ...SCORE, recall: 0.1 }, 0.7, 0.7))).toBe(false);
  });

  test('2 of 3 repetitions passing passes the cell', () => {
    expect(cellPasses([true, true, false])).toBe(true);
    expect(cellPasses([true, false, false])).toBe(false);
  });
});

describe('topLevelPass', () => {
  test('passes only when both clean cells pass', () => {
    expect(topLevelPass({ legAClean: true, legBClean: true })).toBe(true);
    expect(topLevelPass({ legAClean: true, legBClean: false })).toBe(false);
  });
});

describe('memDelta', () => {
  test('reports signed deltas, mem minus clean', () => {
    const mem = { ...SCORE, recall: 0.9, precision: 0.6 };
    const clean = { ...SCORE, recall: 0.7, precision: 0.7 };
    const delta = memDelta(mem, clean);
    expect(delta.deltaRecall).toBeCloseTo(0.2, 5);
    expect(delta.deltaPrecision).toBeCloseTo(-0.1, 5);
  });
});
```

Steps:
- [x] **Step 1: RED** — `cd plugins/tribe/evals/detection && bun test core/gates.test.ts` fails.
- [x] **Step 2: GREEN** — add both files; re-run.
- [x] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection && bun test core/gates.test.ts
```
Expected: `9 pass, 0 fail`.

---

## Task 5: Fixture foundation — clock, ids, errorCodes, types, db

Files:
- `plugins/tribe/evals/detection/fixtures/orderly/package.json`
- `plugins/tribe/evals/detection/fixtures/orderly/tsconfig.json`
- `plugins/tribe/evals/detection/fixtures/orderly/README.md`
- `plugins/tribe/evals/detection/fixtures/orderly/src/clock.ts`
- `plugins/tribe/evals/detection/fixtures/orderly/src/ids.ts`
- `plugins/tribe/evals/detection/fixtures/orderly/src/errorCodes.ts`
- `plugins/tribe/evals/detection/fixtures/orderly/src/types.ts`
- `plugins/tribe/evals/detection/fixtures/orderly/src/db.ts`
- `plugins/tribe/evals/detection/fixtures/orderly/src/foundation.test.ts`

This is the fixture app's own bun project — apply the Global Constraints decoy rules (module
banner comment, alphabetical imports, single quotes) to every `.ts` file below, and to every
fixture file in every later task.

`package.json`:
```json
{
  "name": "orderly",
  "private": true,
  "type": "module",
  "scripts": { "test": "bun test", "typecheck": "bunx tsc --noEmit" }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src/**/*.ts"],
  "exclude": ["src/**/*.test.ts"]
}
```

`README.md` — describes ONLY what the app does, never a convention:
```markdown
# orderly

A small order-management service: create orders, look up orders, manage customers and products.
Run `bun test` to run the test suite, `bunx tsc --noEmit` to type-check.
```

`src/clock.ts` — the ONLY file in the fixture allowed to read the system clock:
```ts
// module: src/clock
export interface Clock {
  nowUtc(): string;
}

export const systemClock: Clock = {
  nowUtc(): string {
    return new Date().toISOString();
  },
};
```

`src/ids.ts`:
```ts
// module: src/ids
export const idPrefixes = {
  order: 'ord_',
  customer: 'cus_',
  product: 'prd_',
} as const;

export type EntityKind = keyof typeof idPrefixes;

export function mintId(kind: EntityKind): string {
  return `${idPrefixes[kind]}${crypto.randomUUID()}`;
}

export function isValidId(kind: EntityKind, id: string): boolean {
  return id.startsWith(idPrefixes[kind]);
}
```

`src/errorCodes.ts`:
```ts
// module: src/errorCodes
export const errorCodes = {
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  INVALID_PRICE: 'INVALID_PRICE',
  DUPLICATE_ORDER: 'DUPLICATE_ORDER',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];
```

`src/types.ts` — money always `*Cents`, timestamps always `*AtUtc`:
```ts
// module: src/types
export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface Order {
  id: string;
  customerId: string;
  productId: string;
  quantity: number;
  totalCents: number;
  createdAtUtc: string;
}

export interface Customer {
  id: string;
  name: string;
  createdAtUtc: string;
}

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  internalCostCents: number;
  createdAtUtc: string;
}
```

`src/db.ts` — plain in-memory store; a factory, not a singleton (injectable):
```ts
// module: src/db
import type { Customer, Order, Product } from './types';

export interface Db {
  orders: Map<string, Order>;
  customers: Map<string, Customer>;
  products: Map<string, Product>;
}

export function createDb(): Db {
  return { orders: new Map(), customers: new Map(), products: new Map() };
}
```

`src/foundation.test.ts`:
```ts
// module: src/foundation.test
import { describe, expect, test } from 'bun:test';
import { systemClock } from './clock';
import { createDb } from './db';
import { errorCodes } from './errorCodes';
import { idPrefixes, isValidId, mintId } from './ids';

describe('systemClock', () => {
  test('nowUtc returns an ISO 8601 string', () => {
    expect(systemClock.nowUtc()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('ids', () => {
  test('mintId prefixes by entity kind', () => {
    expect(mintId('order').startsWith(idPrefixes.order)).toBe(true);
    expect(mintId('customer').startsWith(idPrefixes.customer)).toBe(true);
  });

  test('isValidId checks the prefix', () => {
    expect(isValidId('order', 'ord_abc')).toBe(true);
    expect(isValidId('order', 'cus_abc')).toBe(false);
  });
});

describe('errorCodes', () => {
  test('is a closed set of string constants', () => {
    expect(errorCodes.ORDER_NOT_FOUND).toBe('ORDER_NOT_FOUND');
  });
});

describe('createDb', () => {
  test('returns fresh empty maps each call', () => {
    const a = createDb();
    const b = createDb();
    a.orders.set('x', {} as never);
    expect(b.orders.size).toBe(0);
  });
});
```

Steps:
- [x] **Step 1: RED** — `cd plugins/tribe/evals/detection/fixtures/orderly && bun test` fails (no source files yet).
- [x] **Step 2: GREEN** — add all nine files above.
- [x] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection/fixtures/orderly && bun test && bunx tsc --noEmit
```
Expected: `bun test` → `5 pass, 0 fail`; `bunx tsc --noEmit` exits 0 with no output.

---

## Task 6: Fixture repositories — order, customer (clean), product (C2 deviation)

Files:
- `plugins/tribe/evals/detection/fixtures/orderly/src/repositories/orderRepository.ts`
- `plugins/tribe/evals/detection/fixtures/orderly/src/repositories/customerRepository.ts`
- `plugins/tribe/evals/detection/fixtures/orderly/src/repositories/productRepository.ts`
- `plugins/tribe/evals/detection/fixtures/orderly/src/repositories/repositories.test.ts`

Convention C2: `find*` never returns `null` — it returns an option shape; `get*` asserts (throws
if absent, since this is a repository-internal assertion, not a service-boundary Result).

`src/repositories/orderRepository.ts` (clean, exemplar):
```ts
// module: src/repositories/orderRepository
import type { Db } from '../db';
import type { Order } from '../types';

export type Option<T> = { some: true; value: T } | { some: false };

export function createOrderRepository(db: Db) {
  return {
    findById(id: string): Option<Order> {
      const order = db.orders.get(id);
      return order === undefined ? { some: false } : { some: true, value: order };
    },
    getById(id: string): Order {
      const order = db.orders.get(id);
      if (order === undefined) throw new Error(`order not found: ${id}`);
      return order;
    },
    save(order: Order): void {
      db.orders.set(order.id, order);
    },
  };
}
```

`src/repositories/customerRepository.ts` (clean, exemplar — same option/assert shape):
```ts
// module: src/repositories/customerRepository
import type { Db } from '../db';
import type { Customer } from '../types';
import type { Option } from './orderRepository';

export function createCustomerRepository(db: Db) {
  return {
    findById(id: string): Option<Customer> {
      const customer = db.customers.get(id);
      return customer === undefined ? { some: false } : { some: true, value: customer };
    },
    getById(id: string): Customer {
      const customer = db.customers.get(id);
      if (customer === undefined) throw new Error(`customer not found: ${id}`);
      return customer;
    },
    save(customer: Customer): void {
      db.customers.set(customer.id, customer);
    },
  };
}
```

`src/repositories/productRepository.ts` — **DEVIATION for C2**: `findById` returns `null`
instead of the option shape (verbatim, keep this exact deviation line):
```ts
// module: src/repositories/productRepository
import type { Db } from '../db';
import type { Product } from '../types';

export function createProductRepository(db: Db) {
  return {
    // DEVIATION (C2): returns null instead of an Option<Product> shape.
    findById(id: string): Product | null {
      return db.products.get(id) ?? null;
    },
    getById(id: string): Product {
      const product = db.products.get(id);
      if (product === undefined) throw new Error(`product not found: ${id}`);
      return product;
    },
    save(product: Product): void {
      db.products.set(product.id, product);
    },
  };
}
```

`src/repositories/repositories.test.ts`:
```ts
// module: src/repositories/repositories.test
import { describe, expect, test } from 'bun:test';
import { createDb } from '../db';
import { createCustomerRepository } from './customerRepository';
import { createOrderRepository } from './orderRepository';
import { createProductRepository } from './productRepository';

describe('orderRepository', () => {
  test('findById returns an option shape, never null', () => {
    const repo = createOrderRepository(createDb());
    const result = repo.findById('missing');
    expect(result).toEqual({ some: false });
  });

  test('getById throws when absent', () => {
    const repo = createOrderRepository(createDb());
    expect(() => repo.getById('missing')).toThrow();
  });
});

describe('customerRepository', () => {
  test('findById returns an option shape, never null', () => {
    const repo = createCustomerRepository(createDb());
    expect(repo.findById('missing')).toEqual({ some: false });
  });
});

describe('productRepository (seeded deviation site)', () => {
  test('findById returns null when absent (the seeded C2 deviation)', () => {
    const repo = createProductRepository(createDb());
    expect(repo.findById('missing')).toBeNull();
  });

  test('getById still asserts (throws) when absent', () => {
    const repo = createProductRepository(createDb());
    expect(() => repo.getById('missing')).toThrow();
  });
});
```

Steps:
- [x] **Step 1: RED** — `cd plugins/tribe/evals/detection/fixtures/orderly && bun test src/repositories` fails.
- [x] **Step 2: GREEN** — add all four files.
- [x] **Step 3: Commit** — also record the exact line number of the `findById` DEVIATION comment
  in `productRepository.ts` (via `grep -n DEVIATION`) in the task's commit message body; Task 10
  needs it.

```bash
cd plugins/tribe/evals/detection/fixtures/orderly && bun test src/repositories && bunx tsc --noEmit
```
Expected: `bun test` → `5 pass, 0 fail`; `tsc --noEmit` clean.

---

## Task 7: Fixture services — order (C6 dev.), customer (C4 dev.), product (clean), pricing (C10 dev.), notification (C1 dev.)

Files:
- `.../src/services/orderService.ts`
- `.../src/services/customerService.ts`
- `.../src/services/productService.ts`
- `.../src/services/pricingService.ts`
- `.../src/services/notificationService.ts`
- `.../src/services/services.test.ts`

(all paths relative to `plugins/tribe/evals/detection/fixtures/orderly/`)

`src/services/orderService.ts` — exemplar for C1 (Result), C4 (injected clock), C5 (id prefix),
C10 (integer cents); **DEVIATION for C6** on one specific failure path (ad-hoc string instead of
an `errorCodes` member):
```ts
// module: src/services/orderService
import type { Clock } from '../clock';
import { errorCodes } from '../errorCodes';
import { mintId } from '../ids';
import type { OrderRepository } from '../repositories/orderRepository';
import type { Result, Order } from '../types';

export interface CreateOrderInput {
  customerId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export function createOrderService(deps: { orderRepo: OrderRepository; clock: Clock }) {
  return {
    createOrder(input: CreateOrderInput): Result<Order> {
      if (input.quantity <= 0) {
        // DEVIATION (C6): ad-hoc string reason instead of an errorCodes member.
        return { ok: false, reason: 'order total must be positive' };
      }
      if (!input.customerId) {
        return { ok: false, reason: errorCodes.VALIDATION_FAILED };
      }
      const order: Order = {
        id: mintId('order'),
        customerId: input.customerId,
        productId: input.productId,
        quantity: input.quantity,
        totalCents: input.unitPriceCents * input.quantity,
        createdAtUtc: deps.clock.nowUtc(),
      };
      deps.orderRepo.save(order);
      return { ok: true, value: order };
    },
    cancelOrder(id: string): Result<void> {
      const found = deps.orderRepo.findById(id);
      if (!found.some) return { ok: false, reason: errorCodes.ORDER_NOT_FOUND };
      return { ok: true, value: undefined };
    },
  };
}
```

Note: add `export type OrderRepository = ReturnType<typeof import('../repositories/orderRepository').createOrderRepository>;`
is not valid TS import-type syntax — instead, in `orderRepository.ts` (Task 6, amend if needed)
export the return type explicitly: add `export type OrderRepository = ReturnType<typeof createOrderRepository>;`
at the bottom of `orderRepository.ts`, and the equivalent `CustomerRepository` /
`ProductRepository` type exports in their own files. Apply this amendment as part of this task's
RED step (the service files won't type-check without it).

`src/services/customerService.ts` — exemplar for C1, C6; **DEVIATION for C4** (inline
`Date.now()`/`new Date()` instead of the injected clock):
```ts
// module: src/services/customerService
import { errorCodes } from '../errorCodes';
import { mintId } from '../ids';
import type { CustomerRepository } from '../repositories/customerRepository';
import type { Customer, Result } from '../types';

export function createCustomerService(deps: { customerRepo: CustomerRepository }) {
  return {
    createCustomer(name: string): Result<Customer> {
      if (!name) return { ok: false, reason: errorCodes.VALIDATION_FAILED };
      const customer: Customer = {
        id: mintId('customer'),
        name,
        // DEVIATION (C4): calls Date.now() directly instead of taking an injected Clock.
        createdAtUtc: new Date(Date.now()).toISOString(),
      };
      deps.customerRepo.save(customer);
      return { ok: true, value: customer };
    },
    getCustomer(id: string): Result<Customer> {
      const found = deps.customerRepo.findById(id);
      if (!found.some) return { ok: false, reason: errorCodes.CUSTOMER_NOT_FOUND };
      return { ok: true, value: found.value };
    },
  };
}
```

`src/services/productService.ts` — fully clean: exemplar for C1, C4, C5, C6, C10:
```ts
// module: src/services/productService
import type { Clock } from '../clock';
import { errorCodes } from '../errorCodes';
import { mintId } from '../ids';
import type { ProductRepository } from '../repositories/productRepository';
import type { Product, Result } from '../types';

export function createProductService(deps: { productRepo: ProductRepository; clock: Clock }) {
  return {
    createProduct(input: { name: string; priceCents: number; internalCostCents: number }): Result<Product> {
      if (input.priceCents <= 0) return { ok: false, reason: errorCodes.INVALID_PRICE };
      const product: Product = {
        id: mintId('product'),
        name: input.name,
        priceCents: input.priceCents,
        internalCostCents: input.internalCostCents,
        createdAtUtc: deps.clock.nowUtc(),
      };
      deps.productRepo.save(product);
      return { ok: true, value: product };
    },
    getProduct(id: string): Result<Product> {
      const found = deps.productRepo.findById(id);
      if (found === null) return { ok: false, reason: errorCodes.PRODUCT_NOT_FOUND };
      return { ok: true, value: found };
    },
  };
}
```

`src/services/pricingService.ts` — **DEVIATION for C10** (float dollar arithmetic instead of
integer cents):
```ts
// module: src/services/pricingService
export function applyLoyaltyMarkup(priceCents: number): number {
  // DEVIATION (C10): converts to float dollars and multiplies by a float factor instead of
  // staying in integer cents throughout.
  const priceDollars = priceCents / 100;
  const markedUpDollars = priceDollars * 1.1;
  return Math.round(markedUpDollars * 100);
}
```

`src/services/notificationService.ts` — **DEVIATION for C1** (throws instead of returning
Result); clean exemplar for C4 (injected clock):
```ts
// module: src/services/notificationService
import type { Clock } from '../clock';
import type { Order } from '../types';

export function createNotificationService(deps: { clock: Clock }) {
  return {
    sendOrderConfirmation(order: Order): { sentAtUtc: string } {
      // DEVIATION (C1): throws across the service boundary instead of returning a Result.
      if (!order.customerId) {
        throw new Error('cannot notify: order has no customer');
      }
      return { sentAtUtc: deps.clock.nowUtc() };
    },
  };
}
```

`src/services/services.test.ts`:
```ts
// module: src/services/services.test
import { describe, expect, test } from 'bun:test';
import { systemClock } from '../clock';
import { createDb } from '../db';
import { createCustomerRepository } from '../repositories/customerRepository';
import { createOrderRepository } from '../repositories/orderRepository';
import { createProductRepository } from '../repositories/productRepository';
import { createCustomerService } from './customerService';
import { createNotificationService } from './notificationService';
import { createOrderService } from './orderService';
import { applyLoyaltyMarkup } from './pricingService';
import { createProductService } from './productService';

describe('orderService', () => {
  test('createOrder returns a Result, never throws, on the happy path', () => {
    const db = createDb();
    const service = createOrderService({ orderRepo: createOrderRepository(db), clock: systemClock });
    const result = service.createOrder({ customerId: 'cus_1', productId: 'prd_1', quantity: 2, unitPriceCents: 500 });
    expect(result.ok).toBe(true);
  });

  test('the ad-hoc-string deviation path still returns ok:false (a smell, not a bug)', () => {
    const db = createDb();
    const service = createOrderService({ orderRepo: createOrderRepository(db), clock: systemClock });
    const result = service.createOrder({ customerId: 'cus_1', productId: 'prd_1', quantity: 0, unitPriceCents: 500 });
    expect(result).toEqual({ ok: false, reason: 'order total must be positive' });
  });
});

describe('customerService', () => {
  test('createCustomer returns a Result and a createdAtUtc field', () => {
    const db = createDb();
    const service = createCustomerService({ customerRepo: createCustomerRepository(db) });
    const result = service.createCustomer('Ada');
    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.value.createdAtUtc).toBe('string');
  });
});

describe('productService (clean)', () => {
  test('createProduct returns a Result using the injected clock', () => {
    const db = createDb();
    const service = createProductService({ productRepo: createProductRepository(db), clock: systemClock });
    const result = service.createProduct({ name: 'Widget', priceCents: 999, internalCostCents: 400 });
    expect(result.ok).toBe(true);
  });
});

describe('pricingService (seeded deviation site)', () => {
  test('applyLoyaltyMarkup still returns a plausible integer cents value', () => {
    expect(applyLoyaltyMarkup(1000)).toBe(1100);
  });
});

describe('notificationService (seeded deviation site)', () => {
  test('sendOrderConfirmation throws when the order has no customer', () => {
    const service = createNotificationService({ clock: systemClock });
    expect(() => service.sendOrderConfirmation({ id: 'ord_1', customerId: '', productId: 'p', quantity: 1, totalCents: 0, createdAtUtc: '' })).toThrow();
  });

  test('sendOrderConfirmation succeeds on the happy path', () => {
    const service = createNotificationService({ clock: systemClock });
    const result = service.sendOrderConfirmation({ id: 'ord_1', customerId: 'cus_1', productId: 'p', quantity: 1, totalCents: 0, createdAtUtc: '' });
    expect(typeof result.sentAtUtc).toBe('string');
  });
});
```

Steps:
- [x] **Step 1: RED** — `cd plugins/tribe/evals/detection/fixtures/orderly && bun test src/services` fails (modules missing; also add the `OrderRepository`/`CustomerRepository`/`ProductRepository` type exports to the Task 6 files as part of this RED step).
- [x] **Step 2: GREEN** — add all six files (plus the repository type-export amendment); re-run.
- [x] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection/fixtures/orderly && bun test && bunx tsc --noEmit
```
Expected: `bun test` → all tests across the fixture so far green (repositories + services +
foundation, `19 pass, 0 fail`); `bunx tsc --noEmit` clean.

---

## Task 8: Fixture handlers + mappers

Files:
- `.../src/handlers/createOrderHandler.ts`
- `.../src/handlers/getOrderHandler.ts`
- `.../src/handlers/createCustomerHandler.ts`
- `.../src/handlers/productHandler.ts`
- `.../src/handlers/handlers.test.ts`
- `.../src/mappers/orderMapper.ts`
- `.../src/mappers/customerMapper.ts`
- `.../src/mappers/productMapper.ts`
- `.../src/mappers/mappers.test.ts`

Convention C7: handlers never touch `db` directly — always via a repository (in practice here,
via a service, which itself goes through a repository).

`src/handlers/createOrderHandler.ts` (clean, exemplar):
```ts
// module: src/handlers/createOrderHandler
import type { CreateOrderInput, createOrderService } from '../services/orderService';

export function createOrderHandler(orderService: ReturnType<typeof createOrderService>) {
  return (input: CreateOrderInput) => orderService.createOrder(input);
}
```

`src/handlers/getOrderHandler.ts` (clean, exemplar) — also calls the C3 deviation site from
Task 9's `legacyReceipt.ts` to produce an optional receipt block:
```ts
// module: src/handlers/getOrderHandler
import type { OrderRepository } from '../repositories/orderRepository';
import { buildLegacyReceiptTimestamp } from '../utils/legacyReceipt';

export function getOrderHandler(orderRepo: OrderRepository) {
  return (id: string) => {
    const found = orderRepo.findById(id);
    if (!found.some) return { found: false as const };
    return { found: true as const, order: found.value, receipt: buildLegacyReceiptTimestamp() };
  };
}
```

`src/handlers/createCustomerHandler.ts` (clean, exemplar):
```ts
// module: src/handlers/createCustomerHandler
import type { createCustomerService } from '../services/customerService';

export function createCustomerHandler(customerService: ReturnType<typeof createCustomerService>) {
  return (name: string) => customerService.createCustomer(name);
}
```

`src/handlers/productHandler.ts` — **DEVIATION for C7** (queries `db` directly, bypassing the
repository):
```ts
// module: src/handlers/productHandler
import type { Db } from '../db';

export function productHandler(db: Db) {
  return (id: string) => {
    // DEVIATION (C7): reaches into db directly instead of going through productRepository.
    const product = db.products.get(id);
    return product ? { found: true as const, product } : { found: false as const };
  };
}
```

`src/mappers/orderMapper.ts` (clean, exemplar — two sites: `toDto` and `toSummaryDto`, both
strip internal fields; `Order` has no internal-only field today, so both simply pass through the
already-public shape, which is itself the correct behavior to keep in mind for the deviation
below):
```ts
// module: src/mappers/orderMapper
import type { Order } from '../types';

export interface OrderDto {
  id: string;
  customerId: string;
  totalCents: number;
  createdAtUtc: string;
}

export function toDto(order: Order): OrderDto {
  return { id: order.id, customerId: order.customerId, totalCents: order.totalCents, createdAtUtc: order.createdAtUtc };
}

export function toSummaryDto(order: Order): Pick<OrderDto, 'id' | 'totalCents'> {
  return { id: order.id, totalCents: order.totalCents };
}
```

`src/mappers/customerMapper.ts` (clean, exemplar):
```ts
// module: src/mappers/customerMapper
import type { Customer } from '../types';

export interface CustomerDto {
  id: string;
  name: string;
}

export function toDto(customer: Customer): CustomerDto {
  return { id: customer.id, name: customer.name };
}
```

`src/mappers/productMapper.ts` — **DEVIATION for C9** (`toDto` leaks the internal-only
`internalCostCents` field under the same "toDto" name every other mapper uses to mean "public,
stripped"):
```ts
// module: src/mappers/productMapper
import type { Product } from '../types';

export interface ProductDto {
  id: string;
  name: string;
  priceCents: number;
  internalCostCents: number;
}

// DEVIATION (C9): toDto leaks internalCostCents, an internal-only field every sibling mapper's
// toDto strips — same method name, diverged meaning.
export function toDto(product: Product): ProductDto {
  return { id: product.id, name: product.name, priceCents: product.priceCents, internalCostCents: product.internalCostCents };
}
```

`src/handlers/handlers.test.ts`:
```ts
// module: src/handlers/handlers.test
import { describe, expect, test } from 'bun:test';
import { systemClock } from '../clock';
import { createDb } from '../db';
import { createCustomerRepository } from '../repositories/customerRepository';
import { createOrderRepository } from '../repositories/orderRepository';
import { createCustomerService } from '../services/customerService';
import { createOrderService } from '../services/orderService';
import { createCustomerHandler } from './createCustomerHandler';
import { createOrderHandler } from './createOrderHandler';
import { getOrderHandler } from './getOrderHandler';
import { productHandler } from './productHandler';

describe('createOrderHandler / getOrderHandler (clean)', () => {
  test('a created order can be fetched back with a receipt block', () => {
    const db = createDb();
    const orderRepo = createOrderRepository(db);
    const orderService = createOrderService({ orderRepo, clock: systemClock });
    const create = createOrderHandler(orderService);
    const created = create({ customerId: 'cus_1', productId: 'prd_1', quantity: 1, unitPriceCents: 100 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const get = getOrderHandler(orderRepo);
    const fetched = get(created.value.id);
    expect(fetched.found).toBe(true);
  });
});

describe('createCustomerHandler (clean)', () => {
  test('creates a customer via the service', () => {
    const db = createDb();
    const handler = createCustomerHandler(createCustomerService({ customerRepo: createCustomerRepository(db) }));
    expect(handler('Ada').ok).toBe(true);
  });
});

describe('productHandler (seeded deviation site)', () => {
  test('still returns a correct result despite bypassing the repository', () => {
    const db = createDb();
    db.products.set('prd_1', { id: 'prd_1', name: 'Widget', priceCents: 100, internalCostCents: 40, createdAtUtc: '' });
    const handler = productHandler(db);
    expect(handler('prd_1')).toEqual({ found: true, product: db.products.get('prd_1')! });
  });
});
```

`src/mappers/mappers.test.ts`:
```ts
// module: src/mappers/mappers.test
import { describe, expect, test } from 'bun:test';
import { toDto as customerToDto } from './customerMapper';
import { toDto as orderToDto, toSummaryDto } from './orderMapper';
import { toDto as productToDto } from './productMapper';

const ORDER = { id: 'ord_1', customerId: 'cus_1', productId: 'prd_1', quantity: 1, totalCents: 100, createdAtUtc: 'x' };
const CUSTOMER = { id: 'cus_1', name: 'Ada', createdAtUtc: 'x' };
const PRODUCT = { id: 'prd_1', name: 'Widget', priceCents: 100, internalCostCents: 40, createdAtUtc: 'x' };

describe('orderMapper / customerMapper (clean)', () => {
  test('toDto and toSummaryDto both strip to the public shape', () => {
    expect(orderToDto(ORDER)).not.toHaveProperty('productId');
    expect(toSummaryDto(ORDER)).toEqual({ id: 'ord_1', totalCents: 100 });
    expect(customerToDto(CUSTOMER)).not.toHaveProperty('createdAtUtc');
  });
});

describe('productMapper (seeded deviation site)', () => {
  test('toDto leaks internalCostCents (the seeded C9 deviation)', () => {
    expect(productToDto(PRODUCT)).toHaveProperty('internalCostCents', 40);
  });
});
```

Steps:
- [x] **Step 1: RED** — `cd plugins/tribe/evals/detection/fixtures/orderly && bun test src/handlers src/mappers` fails (also depends on `src/utils/legacyReceipt.ts`, which Task 9 has not landed yet — stub it minimally in this task as `export function buildLegacyReceiptTimestamp() { return { createdAt: new Date().toString() }; }` with the same module banner comment; Task 9 will own its permanent home and tests, this task only needs the import to resolve).
- [x] **Step 2: GREEN** — add all nine files (eight plus the `src/utils/legacyReceipt.ts` stub); re-run.
- [x] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection/fixtures/orderly && bun test && bunx tsc --noEmit
```
Expected: `bun test` → `26 pass, 0 fail`; `bunx tsc --noEmit` clean.

---

## Task 9: Fixture migrations + legacyReceipt (C3, C8) + app wiring

Files:
- `.../src/migrations/001_create_orders.ts`
- `.../src/migrations/002_create_customers.ts`
- `.../src/migrations/003_create_products.ts`
- `.../src/migrations/004_create_refunds.ts`
- `.../src/migrations/index.ts`
- `.../src/migrations/index.test.ts`
- `.../src/utils/legacyReceipt.ts` (replaces Task 8's stub — same content, permanent home)
- `.../src/index.ts`

Convention C8: migrations pair `NNN_up`/`NNN_down` AND both are listed in `migrations/index.ts`.

`src/migrations/001_create_orders.ts`:
```ts
// module: src/migrations/001_create_orders
import type { Db } from '../db';

export function up001(db: Db): void {
  void db;
}

export function down001(db: Db): void {
  db.orders.clear();
}
```

`src/migrations/002_create_customers.ts`:
```ts
// module: src/migrations/002_create_customers
import type { Db } from '../db';

export function up002(db: Db): void {
  void db;
}

export function down002(db: Db): void {
  db.customers.clear();
}
```

`src/migrations/003_create_products.ts`:
```ts
// module: src/migrations/003_create_products
import type { Db } from '../db';

export function up003(db: Db): void {
  void db;
}

export function down003(db: Db): void {
  db.products.clear();
}
```

`src/migrations/004_create_refunds.ts` — **DEVIATION for C8**: this file exists, exports a
correctly-paired `up004`/`down004`, but is never added to `migrations/index.ts` below:
```ts
// module: src/migrations/004_create_refunds
import type { Db } from '../db';

export function up004(db: Db): void {
  void db;
}

export function down004(db: Db): void {
  void db;
}
```

`src/migrations/index.ts` — **the DEVIATION site is this omission**: 004 is never imported or
listed here:
```ts
// module: src/migrations/index
import { down001, up001 } from './001_create_orders';
import { down002, up002 } from './002_create_customers';
import { down003, up003 } from './003_create_products';
import type { Db } from '../db';

export interface Migration {
  name: string;
  up: (db: Db) => void;
  down: (db: Db) => void;
}

// DEVIATION (C8): 004_create_refunds.ts exists with a correctly paired up004/down004 but is
// missing from this registry.
export const migrations: Migration[] = [
  { name: '001_create_orders', up: up001, down: down001 },
  { name: '002_create_customers', up: up002, down: down002 },
  { name: '003_create_products', up: up003, down: down003 },
];
```

`src/migrations/index.test.ts` — tests only what IS registered (the fixture stays green; the
deviation is an omission, not a failing assertion):
```ts
// module: src/migrations/index.test
import { describe, expect, test } from 'bun:test';
import { createDb } from '../db';
import { migrations } from './index';

describe('migrations registry', () => {
  test('every registered migration runs up then down without error', () => {
    const db = createDb();
    for (const m of migrations) {
      expect(() => m.up(db)).not.toThrow();
      expect(() => m.down(db)).not.toThrow();
    }
  });

  test('registers exactly the three orders/customers/products migrations', () => {
    expect(migrations.map((m) => m.name)).toEqual(['001_create_orders', '002_create_customers', '003_create_products']);
  });
});
```

`src/utils/legacyReceipt.ts` — **DEVIATION for C3** (local `Date` + field named `createdAt`
instead of an injected clock + `*AtUtc` naming):
```ts
// module: src/utils/legacyReceipt
// DEVIATION (C3): uses a local Date (not the injected Clock) and names the field `createdAt`
// instead of the repo-wide `*AtUtc` convention.
export function buildLegacyReceiptTimestamp(): { createdAt: string } {
  return { createdAt: new Date().toString() };
}
```

`src/index.ts` — wires the app together (illustrative entrypoint, exercised indirectly by the
other suites; keep it minimal):
```ts
// module: src/index
import { systemClock } from './clock';
import { createDb } from './db';
import { createOrderRepository } from './repositories/orderRepository';
import { createCustomerRepository } from './repositories/customerRepository';
import { createProductRepository } from './repositories/productRepository';
import { createCustomerService } from './services/customerService';
import { createOrderService } from './services/orderService';
import { createProductService } from './services/productService';

export function buildApp() {
  const db = createDb();
  const orderRepo = createOrderRepository(db);
  const customerRepo = createCustomerRepository(db);
  const productRepo = createProductRepository(db);
  return {
    orderService: createOrderService({ orderRepo, clock: systemClock }),
    customerService: createCustomerService({ customerRepo }),
    productService: createProductService({ productRepo, clock: systemClock }),
  };
}
```

Steps:
- [x] **Step 1: RED** — `cd plugins/tribe/evals/detection/fixtures/orderly && bun test src/migrations` fails (migrations don't exist); confirm Task 8's `legacyReceipt.ts` stub is replaced by this file (same content — no functional change, just the permanent location) and `getOrderHandler`'s import still resolves.
- [x] **Step 2: GREEN** — add all eight files.
- [x] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection/fixtures/orderly && bun test && bunx tsc --noEmit
```
Expected: `bun test` → `28 pass, 0 fail` (whole fixture suite, all tasks so far); `bunx tsc
--noEmit` exits 0.

---

## Task 10: manifest/orderly.json + fixture meta-tests

Files:
- `plugins/tribe/evals/detection/manifest/orderly.json`
- `plugins/tribe/evals/detection/core/fixture-meta.test.ts`

First, grep the fixture (committed in Tasks 6-9) for every `DEVIATION` marker to get the exact
current `file:line`:

```bash
cd plugins/tribe/evals/detection/fixtures/orderly && grep -rn "DEVIATION" src/
```
Expected: exactly 10 hits, one per convention id (C1..C10) — use the reported line numbers
verbatim as each `deviation.line` below (the deviation is the line the marker comment sits above;
record the line of the actual offending statement, not the comment, by inspecting the one line
below each `grep` hit).

Write `manifest/orderly.json` with this exact shape (fill `deviation.line` from the grep output
above; every other field is fixed by this plan):
```json
{
  "fixture": "orderly",
  "conventions": [
    {
      "id": "C1", "tier": "easy",
      "description": "Services return Result objects ({ok:true,value}|{ok:false,reason}), never throw across the service boundary.",
      "exemplars": ["src/services/orderService.ts", "src/services/customerService.ts", "src/services/productService.ts"],
      "deviation": { "file": "src/services/notificationService.ts", "line": 0, "note": "sendOrderConfirmation throws instead of returning a Result" },
      "expected_detection": "Names the Result-returning convention AND the notificationService.ts throw site."
    },
    {
      "id": "C2", "tier": "easy",
      "description": "Repositories never return null: find* returns an option shape, get* asserts.",
      "exemplars": ["src/repositories/orderRepository.ts", "src/repositories/customerRepository.ts"],
      "deviation": { "file": "src/repositories/productRepository.ts", "line": 0, "note": "findById returns null instead of an Option shape" },
      "expected_detection": "Names the option-shape convention AND the productRepository.ts null return."
    },
    {
      "id": "C3", "tier": "easy",
      "description": "Timestamps are UTC ISO strings in fields named *AtUtc.",
      "exemplars": ["src/services/orderService.ts", "src/services/customerService.ts", "src/services/productService.ts"],
      "deviation": { "file": "src/utils/legacyReceipt.ts", "line": 0, "note": "uses a local Date and a field named createdAt instead of *AtUtc" },
      "expected_detection": "Names the *AtUtc/UTC ISO convention AND the legacyReceipt.ts site."
    },
    {
      "id": "C4", "tier": "medium",
      "description": "The clock is injected; no module calls Date.now() except clock.ts.",
      "exemplars": ["src/services/orderService.ts", "src/services/productService.ts", "src/services/notificationService.ts"],
      "deviation": { "file": "src/services/customerService.ts", "line": 0, "note": "calls Date.now()/new Date() inline instead of taking an injected Clock" },
      "expected_detection": "Names the injected-clock convention AND the customerService.ts inline call."
    },
    {
      "id": "C5", "tier": "medium",
      "description": "Entity ids carry a type prefix (ord_, cus_, prd_); validators check the prefix.",
      "exemplars": ["src/ids.ts", "src/services/orderService.ts", "src/services/productService.ts"],
      "deviation": { "file": "src/repositories/customerRepository.ts", "line": 0, "note": "customerRepository mints/accepts an id with no type prefix" },
      "expected_detection": "Names the id-prefix convention AND the bare-id site."
    },
    {
      "id": "C6", "tier": "medium",
      "description": "Every failure reason is a member of errorCodes.ts.",
      "exemplars": ["src/services/customerService.ts", "src/services/productService.ts", "src/services/orderService.ts (cancelOrder)"],
      "deviation": { "file": "src/services/orderService.ts", "line": 0, "note": "createOrder returns the ad-hoc string 'order total must be positive' instead of an errorCodes member" },
      "expected_detection": "Names the errorCodes convention AND the ad-hoc string in orderService.ts."
    },
    {
      "id": "C7", "tier": "medium",
      "description": "Handlers never touch the db directly — always via a repository.",
      "exemplars": ["src/handlers/createOrderHandler.ts", "src/handlers/getOrderHandler.ts", "src/handlers/createCustomerHandler.ts"],
      "deviation": { "file": "src/handlers/productHandler.ts", "line": 0, "note": "queries db directly instead of going through productRepository" },
      "expected_detection": "Names the repository-boundary convention AND the productHandler.ts direct db access."
    },
    {
      "id": "C8", "tier": "hard",
      "description": "Migrations pair NNN_up/NNN_down AND both are listed in migrations/index.ts.",
      "exemplars": ["src/migrations/001_create_orders.ts", "src/migrations/002_create_customers.ts", "src/migrations/003_create_products.ts"],
      "deviation": { "file": "src/migrations/index.ts", "line": 0, "note": "004_create_refunds.ts exists with a valid up/down pair but is missing from the registry" },
      "expected_detection": "Names the pair-and-register cross-file invariant AND that 004 is unregistered."
    },
    {
      "id": "C9", "tier": "hard",
      "description": "toDto() in every mapper strips internal fields — same name, same meaning.",
      "exemplars": ["src/mappers/orderMapper.ts", "src/mappers/customerMapper.ts"],
      "deviation": { "file": "src/mappers/productMapper.ts", "line": 0, "note": "toDto leaks internalCostCents, diverging from every sibling toDto's meaning" },
      "expected_detection": "Names the toDto-strips-internal-fields convention AND the leaked field in productMapper.ts."
    },
    {
      "id": "C10", "tier": "hard",
      "description": "Money is integer cents everywhere; no float arithmetic.",
      "exemplars": ["src/services/orderService.ts", "src/services/productService.ts"],
      "deviation": { "file": "src/services/pricingService.ts", "line": 0, "note": "converts to float dollars and multiplies by a float factor" },
      "expected_detection": "Names the integer-cents convention AND the float arithmetic in pricingService.ts."
    }
  ],
  "decoys": [
    { "id": "D1", "description": "Imports are ordered alphabetically in every file.", "exemplars": ["src/services/orderService.ts", "src/repositories/orderRepository.ts", "src/mappers/orderMapper.ts"] },
    { "id": "D2", "description": "Every file opens with a `// module: <name>` banner comment.", "exemplars": ["src/services/orderService.ts", "src/repositories/orderRepository.ts", "src/mappers/orderMapper.ts"] },
    { "id": "D3", "description": "Strings use single quotes throughout.", "exemplars": ["src/services/orderService.ts", "src/repositories/orderRepository.ts", "src/mappers/orderMapper.ts"] }
  ],
  "legB": { "patch": "diffs/orderly-pr1.patch", "violates": ["C1", "C4", "C6", "C10"] }
}
```

`core/fixture-meta.test.ts` — pure `bun test`, no LLM, no network; validates the manifest against
the actual fixture on disk (the "answer key can't silently rot" guard):
```ts
// module: core/fixture-meta.test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateManifest } from './manifest';

const DETECTION_ROOT = join(import.meta.dir, '..');
const FIXTURE_ROOT = join(DETECTION_ROOT, 'fixtures/orderly');
const manifestRaw = JSON.parse(readFileSync(join(DETECTION_ROOT, 'manifest/orderly.json'), 'utf8'));

describe('orderly.json manifest', () => {
  test('is schema-valid', () => {
    const result = validateManifest(manifestRaw);
    expect(result.ok).toBe(true);
  });

  test('has exactly 10 conventions and 3 decoys', () => {
    expect(manifestRaw.conventions).toHaveLength(10);
    expect(manifestRaw.decoys).toHaveLength(3);
  });

  test('every exemplar path exists in the fixture', () => {
    for (const c of manifestRaw.conventions) {
      for (const ex of c.exemplars) {
        const path = ex.split(' ')[0]; // strip trailing "(methodName)" annotations
        expect(() => readFileSync(join(FIXTURE_ROOT, path), 'utf8')).not.toThrow();
      }
    }
  });

  test('every deviation file:line exists and the line contains a DEVIATION marker', () => {
    for (const c of manifestRaw.conventions) {
      const filePath = join(FIXTURE_ROOT, c.deviation.file);
      const lines = readFileSync(filePath, 'utf8').split('\n');
      const target = lines[c.deviation.line - 1] ?? '';
      const nearby = lines.slice(Math.max(0, c.deviation.line - 2), c.deviation.line + 1).join('\n');
      expect(nearby).toContain('DEVIATION');
      expect(target.length).toBeGreaterThan(0);
    }
  });

  test('legB.violates matches the C1/C4/C6/C10 subset the plan seeded', () => {
    expect(manifestRaw.legB.violates.sort()).toEqual(['C1', 'C4', 'C6', 'C10']);
  });
});
```

Steps:
- [x] **Step 1: RED** — `cd plugins/tribe/evals/detection && bun test core/fixture-meta.test.ts`
  fails (manifest file does not exist yet).
- [x] **Step 2: GREEN** — run the grep above, fill in every `deviation.line`, write
  `manifest/orderly.json`, add `core/fixture-meta.test.ts`; iterate the line numbers until green
  (a `DEVIATION` marker line is a comment one line above the offending statement in most files
  above — adjust `deviation.line` to point at whichever line the meta-test's "nearby" window
  finds, i.e. the offending statement itself works since the marker comment sits immediately
  above it).
- [x] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection && bun test core/fixture-meta.test.ts
```
Expected: `5 pass, 0 fail`.

---

## Task 11: Leg B diff — diffs/orderly-pr1.patch

File: `plugins/tribe/evals/detection/diffs/orderly-pr1.patch`

Produce a real git patch, generated from an actual commit (not hand-written), adding a refunds
feature that violates exactly C1, C4, C6, C10 (matching `manifest.legB.violates`):

```bash
set -e
TMP=$(mktemp -d)
cp -R plugins/tribe/evals/detection/fixtures/orderly/. "$TMP"
cd "$TMP" && git init -q && git add -A && git -c user.email=eval@local -c user.name=eval commit -qm "baseline"
```

Then, inside `$TMP`, add exactly two new files:

`src/services/refundService.ts` (violates C1 throw, C4 inline Date.now(), C6 ad-hoc string, C10
float arithmetic — all four in one small file, matching a plausible rushed feature PR):
```ts
// module: src/services/refundService
import type { OrderRepository } from '../repositories/orderRepository';

export function createRefundService(deps: { orderRepo: OrderRepository }) {
  return {
    refund(orderId: string, amountCents: number) {
      const found = deps.orderRepo.findById(orderId);
      if (!found.some) {
        // violates C1 (throw instead of Result) and C6 (ad-hoc string, not an errorCodes member)
        throw new Error('cannot refund: order missing');
      }
      // violates C4: inline Date.now() instead of an injected Clock
      const refundedAtUtc = new Date(Date.now()).toISOString();
      // violates C10: float dollar arithmetic for the restocking fee instead of integer cents
      const amountDollars = amountCents / 100;
      const feeDollars = amountDollars * 0.1;
      const netCents = Math.round((amountDollars - feeDollars) * 100);
      return { orderId, netCents, refundedAtUtc };
    },
  };
}
```

`src/handlers/refundHandler.ts`:
```ts
// module: src/handlers/refundHandler
import type { createRefundService } from '../services/refundService';

export function refundHandler(refundService: ReturnType<typeof createRefundService>) {
  return (orderId: string, amountCents: number) => refundService.refund(orderId, amountCents);
}
```

Then generate and verify the patch:
```bash
cd "$TMP" && git add -A && git -c user.email=eval@local -c user.name=eval commit -qm "add refunds endpoint"
git -C "$TMP" diff HEAD~1 HEAD > /tmp/orderly-pr1.patch
mkdir -p plugins/tribe/evals/detection/diffs
cp /tmp/orderly-pr1.patch plugins/tribe/evals/detection/diffs/orderly-pr1.patch
# verify it applies cleanly to a pristine copy
VERIFY=$(mktemp -d)
cp -R plugins/tribe/evals/detection/fixtures/orderly/. "$VERIFY"
cd "$VERIFY" && git init -q && git add -A && git -c user.email=eval@local -c user.name=eval commit -qm "baseline"
git apply --check /tmp/orderly-pr1.patch
rm -rf "$TMP" "$VERIFY"
```
Expected: `git apply --check` exits 0 (no output = clean apply).

Steps:
- [x] **Step 1: RED** — `test -f plugins/tribe/evals/detection/diffs/orderly-pr1.patch` fails (no
  file yet).
- [x] **Step 2: GREEN** — run the full sequence above; the patch file now exists and applies
  cleanly.
- [x] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection && git apply --check --directory=fixtures/orderly diffs/orderly-pr1.patch
```
Expected: exit code 0, no output.

---

## Task 12: mem-arm memory fixture + zero-overlap meta-test

Files:
- `plugins/tribe/evals/detection/memory-fixture/CLAUDE.md`
- `plugins/tribe/evals/detection/core/memory-overlap.test.ts`

`memory-fixture/CLAUDE.md` — generic project memory that never restates any seeded
convention/decoy in prose (build commands, generic style guidance, fictional project notes —
deliberately about topics the manifest never touches: release cadence, on-call rotation, a
fictional incident retro):
```markdown
# orderly — project notes

Run `bun test` before opening a pull request. Keep functions short and give them one clear job.

## Release process
We cut a release every other Friday. Tag the commit, then post the changelog link in the team
channel. On-call rotates weekly; check the roster before paging anyone.

## History
This service replaced a spreadsheet the fulfillment team used to track orders by hand. The
original spreadsheet caused a bad afternoon in March when two people edited it at once and
overwrote each other's changes — that's the whole reason this exists.

## Reviewing pull requests
Read the whole diff before commenting. Prefer asking a question over demanding a change when
you are not sure. Small pull requests get reviewed faster than large ones.
```

`core/memory-overlap.test.ts` — mechanical, no judgment call: tokenizes both texts, excludes a
fixed small stopword list, and asserts zero shared significant words:
```ts
// module: core/memory-overlap.test
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DETECTION_ROOT = join(import.meta.dir, '..');
const manifest = JSON.parse(readFileSync(join(DETECTION_ROOT, 'manifest/orderly.json'), 'utf8'));
const memoryText = readFileSync(join(DETECTION_ROOT, 'memory-fixture/CLAUDE.md'), 'utf8');

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'never', 'always', 'every', 'each', 'file',
  'files', 'code', 'test', 'tests', 'project', 'module', 'convention', 'conventions', 'field',
  'fields', 'named', 'name', 'names', 'across', 'boundary', 'instead', 'exactly', 'same',
  'member', 'members', 'string', 'strings', 'shape', 'pattern', 'used', 'uses', 'throughout',
]);

function significantWords(text: string): Set<string> {
  return new Set(
    text
      .toLowerCase()
      .replace(/[`*_#\-().,:;{}[\]|]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4 && !STOPWORDS.has(w)),
  );
}

describe('mem-arm memory fixture', () => {
  test('shares zero significant words with the manifest convention/decoy descriptions', () => {
    const manifestWords = new Set<string>();
    for (const c of manifest.conventions) for (const w of significantWords(c.description)) manifestWords.add(w);
    for (const d of manifest.decoys) for (const w of significantWords(d.description)) manifestWords.add(w);
    const memoryWords = significantWords(memoryText);
    const overlap = [...memoryWords].filter((w) => manifestWords.has(w));
    expect(overlap).toEqual([]);
  });
});
```

Steps:
- [x] **Step 1: RED** — `cd plugins/tribe/evals/detection && bun test core/memory-overlap.test.ts`
  fails (files don't exist yet).
- [x] **Step 2: GREEN** — add both files; if the overlap assertion fails on first try, edit
  `CLAUDE.md`'s wording (never the stopword list, never the manifest) until the set is empty,
  then re-run.
- [x] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection && bun test core/memory-overlap.test.ts
```
Expected: `1 pass, 0 fail`.

---

## Task 13: core/claude-transcript.ts + core/orchestrate.ts (injected ports)

Files:
- `plugins/tribe/evals/detection/core/claude-transcript.ts`
- `plugins/tribe/evals/detection/core/claude-transcript.test.ts`
- `plugins/tribe/evals/detection/core/orchestrate.ts`
- `plugins/tribe/evals/detection/core/orchestrate.test.ts`

`core/claude-transcript.ts` — pure parser for `claude -p --output-format stream-json` stdout
(one JSON object per line):
```ts
// module: core/claude-transcript
export type TranscriptResult =
  | { ok: true; text: string }
  | { ok: false; error: string };

export function extractFinalResult(lines: string[]): TranscriptResult {
  let resultEvent: { result?: string; is_error?: boolean } | null = null;
  for (const [i, line] of lines.entries()) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let event: Record<string, unknown>;
    try {
      event = JSON.parse(trimmed);
    } catch (e) {
      return { ok: false, error: `bad JSON on line ${i + 1}: ${(e as Error).message}` };
    }
    if (event.type === 'result') resultEvent = event as { result?: string; is_error?: boolean };
  }
  if (!resultEvent) return { ok: false, error: 'no result event found in stream' };
  if (resultEvent.is_error) return { ok: false, error: `result event reported an error: ${resultEvent.result ?? ''}` };
  return { ok: true, text: resultEvent.result ?? '' };
}
```

`core/claude-transcript.test.ts`:
```ts
// module: core/claude-transcript.test
import { describe, expect, test } from 'bun:test';
import { extractFinalResult } from './claude-transcript';

describe('extractFinalResult', () => {
  test('reads the result field from the last result-type event', () => {
    const lines = [
      '{"type":"system","subtype":"init"}',
      '{"type":"assistant","message":{"content":[]}}',
      '{"type":"result","result":"final report text","is_error":false}',
    ];
    const parsed = extractFinalResult(lines);
    expect(parsed).toEqual({ ok: true, text: 'final report text' });
  });

  test('reports failure when the result event flags is_error', () => {
    const lines = ['{"type":"result","result":"boom","is_error":true}'];
    const parsed = extractFinalResult(lines);
    expect(parsed.ok).toBe(false);
  });

  test('reports failure when no result event ever appears', () => {
    const parsed = extractFinalResult(['{"type":"system"}']);
    expect(parsed.ok).toBe(false);
  });

  test('reports failure on malformed JSON', () => {
    const parsed = extractFinalResult(['not json']);
    expect(parsed.ok).toBe(false);
  });

  test('ignores blank lines', () => {
    const lines = ['', '{"type":"result","result":"ok","is_error":false}', ''];
    expect(extractFinalResult(lines)).toEqual({ ok: true, text: 'ok' });
  });
});
```

`core/orchestrate.ts` — the injected-port seam: everything here is pure GIVEN its ports, no
`claude` subprocess is spawned from this file:
```ts
// module: core/orchestrate
import { buildGraderPrompt } from './prompts';
import { parseGraderVerdict } from './verdict-parsing';
import type { Arm, GraderVerdict, Leg, Manifest } from './types';

export interface DetectorPort {
  run(input: { leg: Leg; arm: Arm; scratchDir: string; agentPath: string; model?: string }): Promise<{ report: string }>;
}

export interface GraderPort {
  run(input: { prompt: string }): Promise<{ text: string }>;
}

export interface CellResult {
  verdict: GraderVerdict | null;
  ungraded: boolean;
  error?: string;
  detectorReport: string;
}

export async function runCell(input: {
  leg: Leg;
  arm: Arm;
  scratchDir: string;
  agentPath: string;
  model?: string;
  manifest: Manifest;
  detector: DetectorPort;
  grader: GraderPort;
}): Promise<CellResult> {
  const detectorResult = await input.detector.run({
    leg: input.leg, arm: input.arm, scratchDir: input.scratchDir, agentPath: input.agentPath, model: input.model,
  });
  const graderPrompt = buildGraderPrompt({ leg: input.leg, manifest: input.manifest, detectorReport: detectorResult.report });

  let graderResponse = await input.grader.run({ prompt: graderPrompt });
  let parsed = parseGraderVerdict(graderResponse.text);
  if (!parsed.ok) {
    graderResponse = await input.grader.run({ prompt: graderPrompt });
    parsed = parseGraderVerdict(graderResponse.text);
  }
  if (!parsed.ok) {
    return { verdict: null, ungraded: true, error: parsed.error, detectorReport: detectorResult.report };
  }
  return { verdict: parsed.value, ungraded: false, detectorReport: detectorResult.report };
}
```

`core/orchestrate.test.ts` — fake ports, deterministic, no network:
```ts
// module: core/orchestrate.test
import { describe, expect, test } from 'bun:test';
import { runCell } from './orchestrate';
import type { Manifest } from './types';

const MANIFEST: Manifest = {
  fixture: 'orderly',
  conventions: [{
    id: 'C1', tier: 'easy', description: 'x',
    exemplars: ['a.ts', 'b.ts', 'c.ts'],
    deviation: { file: 'a.ts', line: 1, note: 'x' },
    expected_detection: 'x',
  }],
  decoys: [],
  legB: { patch: 'diffs/orderly-pr1.patch', violates: ['C1'] },
};

const VALID_VERDICT = '{"conventions":[{"id":"C1","verdict":"caught","evidence":"x"}],"decoys_flagged":[],"invented":[]}';

describe('runCell', () => {
  test('scores on the first well-formed grader reply', async () => {
    let graderCalls = 0;
    const result = await runCell({
      leg: 'scout', arm: 'clean', scratchDir: '/tmp/x', agentPath: 'agents/scout.md', manifest: MANIFEST,
      detector: { run: async () => ({ report: 'detector report' }) },
      grader: { run: async () => { graderCalls++; return { text: VALID_VERDICT }; } },
    });
    expect(result.ungraded).toBe(false);
    expect(graderCalls).toBe(1);
  });

  test('retries once on a malformed grader reply, then succeeds', async () => {
    let graderCalls = 0;
    const result = await runCell({
      leg: 'scout', arm: 'clean', scratchDir: '/tmp/x', agentPath: 'agents/scout.md', manifest: MANIFEST,
      detector: { run: async () => ({ report: 'detector report' }) },
      grader: { run: async () => { graderCalls++; return graderCalls === 1 ? { text: 'not json' } : { text: VALID_VERDICT }; } },
    });
    expect(graderCalls).toBe(2);
    expect(result.ungraded).toBe(false);
  });

  test('reports ungraded (loudly) after two consecutive malformed replies', async () => {
    let graderCalls = 0;
    const result = await runCell({
      leg: 'scout', arm: 'clean', scratchDir: '/tmp/x', agentPath: 'agents/scout.md', manifest: MANIFEST,
      detector: { run: async () => ({ report: 'detector report' }) },
      grader: { run: async () => { graderCalls++; return { text: 'still not json' }; } },
    });
    expect(graderCalls).toBe(2);
    expect(result.ungraded).toBe(true);
    expect(result.error).toBeTruthy();
  });

  test('the grader prompt is built from the real manifest and the detector report', async () => {
    let capturedPrompt = '';
    await runCell({
      leg: 'scout', arm: 'clean', scratchDir: '/tmp/x', agentPath: 'agents/scout.md', manifest: MANIFEST,
      detector: { run: async () => ({ report: 'UNIQUE_REPORT_MARKER' }) },
      grader: { run: async (input) => { capturedPrompt = input.prompt; return { text: VALID_VERDICT }; } },
    });
    expect(capturedPrompt).toContain('UNIQUE_REPORT_MARKER');
    expect(capturedPrompt).toContain('C1');
  });
});
```

Steps:
- [ ] **Step 1: RED** — `cd plugins/tribe/evals/detection && bun test core/claude-transcript.test.ts core/orchestrate.test.ts` fails.
- [ ] **Step 2: GREEN** — add all four files; re-run.
- [ ] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection && bun test core/claude-transcript.test.ts core/orchestrate.test.ts
```
Expected: `9 pass, 0 fail` (5 transcript + 4 orchestrate cases).

---

## Task 14: run.ts — the impure edge (CLI, --dry-run, and the real claude -p wiring)

File: `plugins/tribe/evals/detection/run.ts`

This is the composition root: argument parsing, filesystem, `git`, and `claude -p` subprocess
calls all live here and nowhere else. It wires the real `DetectorPort`/`GraderPort` from
`core/orchestrate.ts` to `Bun.spawn` running the `claude` CLI, using exactly the isolation flags
`scripts/evals/run_evals.py` already verified empirically: `--setting-sources project`, plus
`--strict-mcp-config`, plus `--output-format stream-json --verbose`, plus an `--agents` flag
whose value is a JSON payload built from the real `plugins/tribe/agents/scout.md` /
`tracker.md` frontmatter and body, plus a `--model` flag resolved from that same frontmatter's
`model:` field unless the CLI's own `--model` flag overrides it. Grader calls additionally pass
an empty `--tools` value.

```ts
#!/usr/bin/env bun
// module: run
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { evaluateLegAClean, evaluateLegBClean, cellPasses, memDelta, repetitionPasses, topLevelPass } from './core/gates';
import { runCell, type DetectorPort, type GraderPort } from './core/orchestrate';
import { buildDetectorPrompt } from './core/prompts';
import { planScratch } from './core/scratch-plan';
import { score } from './core/scoring';
import type { Arm, Leg, Manifest } from './core/types';

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
  const memoryPath = join(DETECTION_ROOT, 'memory-fixture/CLAUDE.md');
  const memoryFiles = existsSync(memoryPath) ? [{ path: 'CLAUDE.md', content: readFileSync(memoryPath, 'utf8') }] : [];
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
        // Filesystem/git assembly (copy fixture, git init, apply patch for tracker leg, write
        // memory files for the mem arm) happens here via node:fs + Bun.spawn(['git', ...]) —
        // straight port of the ScratchPlan core/scratch-plan.ts already computed and tested.
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
```

Steps:
- [ ] **Step 1: RED** — `cd plugins/tribe/evals/detection && bun run.ts --dry-run --leg both --arm both` fails (file does not exist).
- [ ] **Step 2: GREEN** — add `run.ts`; re-run.
- [ ] **Step 3: Commit**

```bash
cd plugins/tribe/evals/detection && bun run.ts --dry-run --leg both --arm both
```
Expected: prints `=== Detection Eval — dry run ===`, four `--- leg=... arm=... ---` blocks
(scout/clean, scout/mem, tracker/clean, tracker/mem), each showing a nonzero file count, the
correct patch/memory-files line per arm, and the `=== Gate table ===` section listing G1-G5 —
exit code 0, zero `claude` subprocess calls.

---

## Task 15: README.md for detection/

File: `plugins/tribe/evals/detection/README.md`

````markdown
# Detection Eval

Answers, with numbers: given a codebase whose conventions are written nowhere, what fraction
does the tribe's detection (Scout + Tracker) catch (recall), and how much noise does it add
(precision)? See `docs/superpowers/specs/2026-08-20-detection-eval-design.md` for the full design.

## Run

```bash
cd plugins/tribe/evals/detection
bun test core                                   # pure core + fixture meta-tests, no network
(cd fixtures/orderly && bun test && bunx tsc --noEmit)   # the fixture's own suite + typecheck
bun run.ts --dry-run --leg both --arm both       # print the full plan, zero API calls
bun run.ts --leg both --arm both --reps 3        # the real benchmark (24 claude -p calls)
```

## CLI

```
bun run.ts --leg scout|tracker|both --arm clean|mem|both [--fixture orderly] [--model <id>]
           [--reps 3] [--dry-run] [--min-recall 0.70] [--min-precision 0.70] [--scratch <dir>]
```

Defaults: `--reps 3`, `--min-recall 0.70`, `--min-precision 0.70` — these match the gate table in
the design spec; override for a cheaper smoke pass.

## Adding a fixture

1. Add `fixtures/<name>/` — a small, green (`bun test` + `bunx tsc --noEmit`) codebase whose
   conventions are written nowhere (no CLAUDE.md, no rules file).
2. Add `manifest/<name>.json` — the answer key (never copied into the scratch workspace):
   conventions with `id`/`tier`/`description`/`exemplars`/`deviation`/`expected_detection`,
   decoys, and (for a Leg B diff) `legB.patch` + `legB.violates`.
3. Add `diffs/<name>-pr1.patch` if the fixture supports a Tracker (diff) leg.
4. Add a `core/fixture-meta.test.ts`-style test asserting every manifest exemplar/deviation path
   exists in the fixture and the deviation line matches.
5. `bun run.ts --fixture <name> --dry-run` to sanity-check the plan before a real run.

## Output

Each invocation writes `results/<timestamp>/` (gitignored): one `grading.json` per
leg×arm×repetition plus a rollup `benchmark.json` with per-cell pass counts (`n/3`), the two
mem-arm deltas (`Δrecall`, `Δprecision` vs. the clean arm), and a top-level `"pass": true|false`
mirrored by the process exit code.

## Governance

This harness is a deliberate, owner-approved deviation from `ref-evals-fixture` (which declares
one shared eval fixture format via `scripts/evals/run_evals.py`) — see the design spec's
"Governance note" section. The C3 change-unit recording this deviation is authored separately by
the Shaman after this harness merges.
````

Steps:
- [ ] **Step 1: RED** — `test -f plugins/tribe/evals/detection/README.md` fails.
- [ ] **Step 2: GREEN** — add the file above.
- [ ] **Step 3: Commit**

```bash
test -f plugins/tribe/evals/detection/README.md && echo present
```
Expected: command prints `present`.

---

## Post-plan (Warchief, not a Hunter task)

1. Whole-branch dual-skinner audit (contract + cold lens).
2. Standing constraint (Mammoth Hunt): one `scout` survey of the touched files + one `tracker`
   diff review against written rules, before the final commit.
3. One real benchmark invocation: `bun run.ts --leg both --arm both --reps 3` — captured as the
   evidence the spec's success criteria require, run directly (not a Hunter task; it produces
   evidence, not source).
4. PR opened against `master`, before/after test-output evidence attached, CI (if any) green,
   **regular 2-parent merge — never squash**.
