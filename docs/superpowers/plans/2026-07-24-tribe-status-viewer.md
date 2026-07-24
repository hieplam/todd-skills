# Tribe Status Viewer + `~/.tribe` Campaign Home — Implementation Plan

> **For agentic workers:** This plan is executed via the **tribe workflow** (Warchief dispatches one Hunter per task, strict TDD, dual-skinner audit before PR). Steps use checkbox (`- [ ]`) syntax for tracking. Spec: `docs/superpowers/specs/2026-07-24-tribe-status-viewer-design.md` — read it first; it is the requirement contract.

**Goal:** Campaign-runner operational exhaust (worker reports, run records, session logs) moves to an injected `~/.tribe/<repo-key>/campaigns/<slug>/` home, and a local read-only refresh-based web viewer renders every campaign's live status from that tree.

**Architecture:** Three pieces sharing one layout contract (spec §4): (1) the runner gains a required `--home` input, writes an atomic `run.json` per invocation under `runs/<run-id>/`, and renders `REPORT_PATH` from the home instead of the deleted `brief.ts` hardcode; (2) a sibling bun capability `scripts/viewer/` scans the tree and server-renders one HTML page per GET; (3) a bash migration script moves old `.claude/state/<campaign>/reports/` artifacts into the new tree via `tribe-home.sh`.

**Tech Stack:** bun + TypeScript (runner conventions: pure core, `ports/` seams, `adapters/` own world imports, `structure.test.ts` enforced), bash strict-mode scripts with test harnesses under `scripts/tests/`.

## Global Constraints

- **Implementer:** dispatch each implementation/fix task to the `hunter` subagent — never a generic implementer.
- **TDD non-negotiable:** every task writes the failing test first, watches it fail, then implements (repo global rule `test-first.md`).
- **Stateless-capability wall (W1):** no `~/.tribe`, repo path, or campaign value hardcoded in the runner or viewer core; every environment value is a CLI input. `tribe-home.sh` is the ONLY key-derivation source.
- **`--dry-run` stays zero-side-effects by construction** — no lock, no run.json, no directory creation.
- **v1 state-file byte-identical round-trip untouched** — nothing in this plan edits `state.ts` schemas.
- **`structure.test.ts` must stay green** — core modules never import `fs`/`child_process`/`http`; only `adapters/*.adapter.ts` may.
- **Runner check command:** `cd plugins/tribe/scripts/runner && bun run check` (tsc --noEmit + bun test). Viewer gets the same shape: `cd plugins/tribe/scripts/viewer && bun run check`.
- **Commits:** conventional style, frequent, one logical change each. Branch `feat/tribe-status-viewer` (worktree `.claude/worktrees/tribe-status-viewer`). **Regular merge only, never squash.**
- **Viewer is read-only:** never writes inside `<tribe-root>` or any campaign dir, never takes a lock, no `gh`/`git`/network calls, binds `127.0.0.1` only.
- Repo rule (`CLAUDE.md`): if anything new needs install-time linking, update `install.sh` — expected outcome: no change (viewer + migration script are repo-invoked like the runner); Task 7 verifies and records this explicitly.

## File Structure (locked decomposition)

```
plugins/tribe/scripts/runner/
  core/run-record.ts            NEW  pure: run-id, run.json build/finalize/serialize, path helpers
  core/run-record.test.ts       NEW
  core/types.ts                 MOD  RunLoopConfig += homeDir, runId, argv
  ports/ports.ts                MOD  += RunHomePort { ensureDir, writeFileAtomic }; LoopIO extends it
  adapters/run-io.adapter.ts    MOD  implement ensureDir/writeFileAtomic (mkdir -p; temp+rename)
  cli/main.ts                   MOD  --home required flag; runId generation; finalize seam
  cli/main.test.ts              MOD  parseArgs cases for --home/runId/logs default
  core/loop/run-loop.ts         MOD  write run.json after lock acquisition
  core/loop/run-loop.test.ts / loop.test.ts  MOD  run-record write/skip cases (mock io += 2 members)
  core/brief.ts                 MOD  reportPathFor(homeDir, cardId); executorBrief gains reportPath param
  core/brief.test.ts            MOD
  core/loop/card-actions.ts     MOD  thread resolved.homeDir into executorBrief call sites
plugins/tribe/scripts/viewer/   NEW  (whole directory)
  package.json, tsconfig.json        mirror runner's (zero runtime deps)
  core/model.ts                      shared types (snapshot in, status out)
  core/derive.ts + derive.test.ts    pure: CampaignSnapshot -> CampaignStatus
  core/render.ts + render.test.ts    pure: CampaignStatus[] -> HTML string
  adapters/scan.adapter.ts + .test.ts  fs walk + pid probe + log tail -> CampaignSnapshot[]
  serve.ts                           entry: flags, Bun.serve, wiring (composition root)
plugins/tribe/scripts/
  migrate-campaign-home.sh      NEW  old .claude/state reports -> new tree
  tests/test-migrate-campaign-home.sh  NEW
docs + skill + C3 (Task 7): runner README, orchestrate-campaign SKILL.md, .c3/c3-2-plugins/c3-215-tribe.md
```

---

### Task 1: Run-record pure module + ports + adapter

**Files:**
- Create: `plugins/tribe/scripts/runner/core/run-record.ts`
- Create: `plugins/tribe/scripts/runner/core/run-record.test.ts`
- Modify: `plugins/tribe/scripts/runner/ports/ports.ts` (add `RunHomePort`, extend `LoopIO`)
- Modify: `plugins/tribe/scripts/runner/adapters/run-io.adapter.ts` (implement the two new members)

**Interfaces:**
- Consumes: `RunLoopConfig` from `core/types.ts` (Task 2 adds `homeDir`/`runId`/`argv` — write this module against the post-Task-2 shape; if executing before Task 2, declare the three fields in a local param type and switch to `RunLoopConfig` in Task 2).
- Produces (later tasks rely on these exact names):
  - `interface RunRecord { v: 1; runId: string; pid: number; startedAt: string; repo: string; statePath: string; answersPath: string; escalationsDir: string; logsDir: string; argv: string[]; endedAt: string | null; exitCode: number | null; reason: string | null }`
  - `generateRunId(nowIso: string, randomHex: string): string`
  - `runDirOf(homeDir: string, runId: string): string`
  - `runRecordPathOf(homeDir: string, runId: string): string`
  - `reportsDirOf(homeDir: string): string`
  - `buildRunRecord(config: { homeDir: string; runId: string; argv: string[]; repoRoot: string; statePath: string; answersPath: string; escalationsDir: string; logsDir: string }, io: { currentPid(): number; now(): string }): RunRecord`
  - `finalizeRunRecord(record: RunRecord, end: { endedAt: string; exitCode: number; reason: string }): RunRecord`
  - `serializeRunRecord(record: RunRecord): string` (2-space JSON + trailing newline, same convention as `serializeState`)
  - `interface RunHomePort { ensureDir(resolvedPath: string): void; writeFileAtomic(resolvedPath: string, content: string): void }` in `ports/ports.ts`; `LoopIO` extends it.

- [ ] **Step 1: Write the failing tests** (`core/run-record.test.ts`)

```ts
import { describe, expect, test } from 'bun:test';
import {
  buildRunRecord, finalizeRunRecord, generateRunId,
  reportsDirOf, runDirOf, runRecordPathOf, serializeRunRecord,
} from './run-record.ts';

const io = { currentPid: () => 4242, now: () => '2026-07-24T01:02:03.000Z' };
const config = {
  homeDir: '/home/u/.tribe/-repo/campaigns/camp',
  runId: '2026-07-24T01-02-03-000Z-ab12',
  argv: ['--cards', 'C1'],
  repoRoot: '/work/target',
  statePath: 'docs/tribe/campaigns/camp/state.json',
  answersPath: 'docs/tribe/campaigns/camp/answers.md',
  escalationsDir: 'docs/tribe/campaigns/camp/escalations',
  logsDir: '/home/u/.tribe/-repo/campaigns/camp/runs/2026-07-24T01-02-03-000Z-ab12/logs',
};

describe('generateRunId', () => {
  test('is filesystem-safe (no colons/dots) and carries the random suffix', () => {
    const id = generateRunId('2026-07-24T01:02:03.000Z', 'ab12');
    expect(id).toBe('2026-07-24T01-02-03-000Z-ab12');
  });
});

describe('path helpers', () => {
  test('runDirOf / runRecordPathOf / reportsDirOf compose from the home', () => {
    expect(runDirOf('/h', 'r1')).toBe('/h/runs/r1');
    expect(runRecordPathOf('/h', 'r1')).toBe('/h/runs/r1/run.json');
    expect(reportsDirOf('/h')).toBe('/h/reports');
  });
});

describe('buildRunRecord', () => {
  test('records absolute repo-relative paths, pid, startedAt; end fields null (spec §4 run.json v1)', () => {
    const rec = buildRunRecord(config, io);
    expect(rec).toEqual({
      v: 1,
      runId: config.runId,
      pid: 4242,
      startedAt: '2026-07-24T01:02:03.000Z',
      repo: '/work/target',
      statePath: '/work/target/docs/tribe/campaigns/camp/state.json',
      answersPath: '/work/target/docs/tribe/campaigns/camp/answers.md',
      escalationsDir: '/work/target/docs/tribe/campaigns/camp/escalations',
      logsDir: config.logsDir,
      argv: ['--cards', 'C1'],
      endedAt: null,
      exitCode: null,
      reason: null,
    });
  });
});

describe('finalizeRunRecord', () => {
  test('fills the three end fields, touches nothing else, does not mutate its input', () => {
    const rec = buildRunRecord(config, io);
    const done = finalizeRunRecord(rec, { endedAt: '2026-07-24T02:00:00.000Z', exitCode: 2, reason: 'escalations_pending' });
    expect(done.endedAt).toBe('2026-07-24T02:00:00.000Z');
    expect(done.exitCode).toBe(2);
    expect(done.reason).toBe('escalations_pending');
    expect(rec.endedAt).toBeNull();
    expect({ ...done, endedAt: null, exitCode: null, reason: null }).toEqual(rec);
  });
});

describe('serializeRunRecord', () => {
  test('2-space JSON with trailing newline (parses back identical)', () => {
    const rec = buildRunRecord(config, io);
    const text = serializeRunRecord(rec);
    expect(text.endsWith('\n')).toBe(true);
    expect(JSON.parse(text)).toEqual(rec);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd plugins/tribe/scripts/runner && bun test core/run-record.test.ts`
Expected: FAIL — `Cannot find module './run-record.ts'`.

- [ ] **Step 3: Implement `core/run-record.ts`**

```ts
// Run record (spec §4): one run.json per runner invocation under <home>/runs/<run-id>/.
// Pure module — no fs/clock imports; the caller injects pid/now and performs the writes
// through the RunHomePort seam (ports/ports.ts).
import { join } from 'node:path';

export interface RunRecord {
  v: 1;
  runId: string;
  pid: number;
  startedAt: string;
  repo: string;
  /** Absolute — resolved against repo so the viewer never guesses a path (spec §4). */
  statePath: string;
  answersPath: string;
  escalationsDir: string;
  /** Exactly as configured (already absolute under the default; see cli/main.ts). */
  logsDir: string;
  argv: string[];
  endedAt: string | null;
  exitCode: number | null;
  reason: string | null;
}

/** Filesystem-safe run id: ISO timestamp with `:`/`.` mapped to `-`, plus a random hex
 * suffix (collision guard at human trigger rates). The caller supplies both parts — this
 * stays pure and deterministic under test. */
export function generateRunId(nowIso: string, randomHex: string): string {
  return `${nowIso.replace(/[:.]/g, '-')}-${randomHex}`;
}

export function runDirOf(homeDir: string, runId: string): string {
  return join(homeDir, 'runs', runId);
}

export function runRecordPathOf(homeDir: string, runId: string): string {
  return join(runDirOf(homeDir, runId), 'run.json');
}

export function reportsDirOf(homeDir: string): string {
  return join(homeDir, 'reports');
}

export function buildRunRecord(
  config: {
    homeDir: string; runId: string; argv: string[]; repoRoot: string;
    statePath: string; answersPath: string; escalationsDir: string; logsDir: string;
  },
  io: { currentPid(): number; now(): string },
): RunRecord {
  return {
    v: 1,
    runId: config.runId,
    pid: io.currentPid(),
    startedAt: io.now(),
    repo: config.repoRoot,
    statePath: join(config.repoRoot, config.statePath),
    answersPath: join(config.repoRoot, config.answersPath),
    escalationsDir: join(config.repoRoot, config.escalationsDir),
    logsDir: config.logsDir,
    argv: config.argv,
    endedAt: null,
    exitCode: null,
    reason: null,
  };
}

export function finalizeRunRecord(
  record: RunRecord,
  end: { endedAt: string; exitCode: number; reason: string },
): RunRecord {
  return { ...record, endedAt: end.endedAt, exitCode: end.exitCode, reason: end.reason };
}

export function serializeRunRecord(record: RunRecord): string {
  return `${JSON.stringify(record, null, 2)}\n`;
}
```

- [ ] **Step 4: Run to verify pass**

Run: `bun test core/run-record.test.ts` — Expected: PASS (all 5).

- [ ] **Step 5: Add the port + adapter implementation**

In `ports/ports.ts`, after `PendingCommitPort` (around line 50), add:

```ts
export interface RunHomePort {
  /** mkdir -p semantics; idempotent. */
  ensureDir(resolvedPath: string): void;
  /** Crash-safe write: temp file in the same directory, then rename (spec §4). */
  writeFileAtomic(resolvedPath: string, content: string): void;
}
```

and extend the orchestrator seam (bottom of file):

```ts
export interface LoopIO
  extends ExecPort,
    TimerPort,
    ClockPort,
    FsPort,
    LogPort,
    ProcessPort,
    LockStorePort,
    PendingCommitPort,
    SessionSpawnPort,
    RunHomePort {}
```

In `adapters/run-io.adapter.ts`, implement both members on the returned `LoopIO` object, following the file's existing fs style (it already imports `node:fs`):

```ts
ensureDir: (resolvedPath) => { mkdirSync(resolvedPath, { recursive: true }); },
writeFileAtomic: (resolvedPath, content) => {
  const tmp = `${resolvedPath}.tmp-${process.pid}`;
  writeFileSync(tmp, content);
  renameSync(tmp, resolvedPath);
},
```

(Adjust import list to include `mkdirSync`/`renameSync` if absent.) **Existing loop-test mock IO objects now fail to typecheck** — extend the shared mock builder in `core/loop.test.ts` (and any other file constructing a full `LoopIO`) with recording stubs:

```ts
ensureDir: (p: string) => { calls.ensuredDirs.push(p); },
writeFileAtomic: (p: string, c: string) => { calls.atomicWrites.push({ path: p, content: c }); },
```

- [ ] **Step 6: Commit**

Run: `bun run check` — Expected: tsc clean, all tests pass (172 baseline + 5 new).

```bash
git add core/run-record.ts core/run-record.test.ts ports/ports.ts adapters/run-io.adapter.ts core/*.test.ts core/loop/*.test.ts
git commit -m "feat(runner): run-record module + RunHomePort seam (spec §4)"
```

---

### Task 2: `--home` flag, run-id generation, run.json write + finalize wiring

**Files:**
- Modify: `plugins/tribe/scripts/runner/core/types.ts:98-121` (`RunLoopConfig`)
- Modify: `plugins/tribe/scripts/runner/cli/main.ts` (`REQUIRED_FLAGS:41-47`, `parseArgs:53`, `main:159`)
- Modify: `plugins/tribe/scripts/runner/cli/main.test.ts`
- Modify: `plugins/tribe/scripts/runner/core/loop/run-loop.ts:227` (`runLoop`)
- Modify: `plugins/tribe/scripts/runner/core/loop.test.ts` (or the run-loop suite file — wherever `runLoop` is exercised)

**Interfaces:**
- Consumes: everything Task 1 produced (`buildRunRecord`, `serializeRunRecord`, `runDirOf`, `runRecordPathOf`, `reportsDirOf`, `finalizeRunRecord`, `generateRunId`, `RunHomePort` members on `LoopIO`).
- Produces: `RunLoopConfig` gains **exactly** `homeDir: string; runId: string; argv: string[]` (Tasks 3–5 rely on `resolved.homeDir`); `parseArgs(argv: string[], runId: string)` (signature change); run.json exists on disk after any non-dry-run, non-locked run, finalized on the same exits that write the report.

- [ ] **Step 1: Write the failing parseArgs tests** (extend `cli/main.test.ts`; mirror the file's existing helper that builds a valid argv — add `'--home', '/th/campaigns/camp'` to it so existing cases keep passing)

```ts
const RUN_ID = '2026-07-24T00-00-00-000Z-beef';

test('--home is required: missing flag is a usage error', () => {
  const result = parseArgs(validArgvWithout('--home'), RUN_ID);
  expect(result).toEqual({ error: 'missing required flag: --home' });
});

test('--home and runId land on the config; argv is echoed verbatim', () => {
  const argv = validArgv(); // includes --home /th/campaigns/camp
  const result = parseArgs(argv, RUN_ID);
  if ('error' in result) throw new Error(result.error);
  expect(result.config.homeDir).toBe('/th/campaigns/camp');
  expect(result.config.runId).toBe(RUN_ID);
  expect(result.config.argv).toEqual(argv);
});

test('logs default moves under the run dir (spec §5.4)', () => {
  const result = parseArgs(validArgvWithout('--logs-dir'), RUN_ID);
  if ('error' in result) throw new Error(result.error);
  expect(result.config.logsDir).toBe(`/th/campaigns/camp/runs/${RUN_ID}/logs`);
});

test('explicit --logs-dir still overrides the default', () => {
  const result = parseArgs([...validArgvWithout('--logs-dir'), '--logs-dir', '/custom/logs'], RUN_ID);
  if ('error' in result) throw new Error(result.error);
  expect(result.config.logsDir).toBe('/custom/logs');
});
```

- [ ] **Step 2: Run to verify failure** — `bun test cli/main.test.ts` — Expected: FAIL (`--home` unknown / wrong arity).

- [ ] **Step 3: Implement**

`core/types.ts` — add to `RunLoopConfig` (after `logsDir`):

```ts
  /** `--home` — the campaign's machine-local operational home (spec §4). REQUIRED input;
   * the runner never derives `~/.tribe` itself (wall W1) — its caller injects it. */
  homeDir: string;
  /** Unique per invocation (sessionId-style), generated by the composition root. */
  runId: string;
  /** Raw argv echo, recorded in run.json for the viewer/audit trail. */
  argv: string[];
```

`cli/main.ts`:
- `REQUIRED_FLAGS` type union gains `'homeDir'`; add `{ flag: '--home', key: 'homeDir' }`.
- `parseArgs(argv: string[], runId: string)`; read `const homeDir = raw.get('--home') as string;`; replace the `defaultLogsDir` line (currently `main.ts:92`):

```ts
  const defaultLogsDir = join(homeDir, 'runs', runId, 'logs');
```

- return `config: { ..., homeDir, runId, argv }`.
- In `main()` (line 160), generate the id before parsing:

```ts
import { randomBytes } from 'node:crypto';
import { finalizeRunRecord, generateRunId, runRecordPathOf } from '../core/run-record.ts';
// ...
const runId = generateRunId(new Date().toISOString(), randomBytes(2).toString('hex'));
const parsed = parseArgs(process.argv.slice(2), runId);
```

- Finalize seam — inside the existing `if (shouldWriteReport(...))` block (`main.ts:187-194`), after `tryWriteReport`, add (same best-effort contract as the report — spec §9):

```ts
    tryFinalizeRunRecord(parsed.config, io, { endedAt, exitCode, reason: deriveExitReason({ threw: Boolean(thrown), exitCode, hasMessage: Boolean(result?.message) }) });
```

with, next to `tryWriteReport`:

```ts
/** Best-effort, same contract as tryWriteReport: a missing/corrupt run.json (e.g. the
 * startup write itself failed) is swallowed — observability exhaust never crashes the run;
 * an unfinalized record with a dead pid is exactly how the viewer detects a crash. */
function tryFinalizeRunRecord(
  config: RunLoopConfig,
  io: LoopIO,
  end: { endedAt: string; exitCode: number; reason: string },
): void {
  try {
    const path = runRecordPathOf(config.homeDir, config.runId);
    const record = JSON.parse(String(io.readFile(path)));
    io.writeFileAtomic(path, serializeRunRecord(finalizeRunRecord(record, end)));
  } catch {
    // See doc comment.
  }
}
```

`core/loop/run-loop.ts` — in `runLoop` (line 227), right after the lock is acquired (after line 235's refusal return, first statement of the `try`):

```ts
    // Spec §4/§5.2: the run record is written the moment the lock is held — never on a
    // refused start, never on --dry-run (which returned above, before the lock). Failures
    // are swallowed: observability exhaust must never kill a campaign run (spec §9); the
    // record's absence is itself the viewer-visible signal.
    try {
      io.ensureDir(runDirOf(config.homeDir, config.runId));
      io.ensureDir(reportsDirOf(config.homeDir));
      io.writeFileAtomic(
        runRecordPathOf(config.homeDir, config.runId),
        serializeRunRecord(buildRunRecord(config, io)),
      );
    } catch {
      // See comment above.
    }
```

(import from `../run-record.ts`).

- [ ] **Step 4: Write the failing runLoop tests** (in the suite that already drives `runLoop` with a mock `LoopIO`; reuse its builder + the Task-1 recording stubs)

```ts
test('run record is written after lock acquisition, into <home>/runs/<runId>/run.json', async () => {
  const { io, calls } = buildMockIo(/* healthy single-card state */);
  await runLoop(configWith({ homeDir: '/th/campaigns/camp', runId: 'r-1' }), io);
  expect(calls.ensuredDirs).toContain('/th/campaigns/camp/runs/r-1');
  expect(calls.ensuredDirs).toContain('/th/campaigns/camp/reports');
  const write = calls.atomicWrites.find((w) => w.path === '/th/campaigns/camp/runs/r-1/run.json');
  expect(write).toBeDefined();
  const record = JSON.parse(write!.content);
  expect(record.runId).toBe('r-1');
  expect(record.endedAt).toBeNull();
});

test('EXIT_LOCKED writes no run record (refused start creates no artifacts)', async () => {
  const { io, calls } = buildMockIo({ lockHeldByLivePid: true });
  const result = await runLoop(configWith({ homeDir: '/th/campaigns/camp', runId: 'r-1' }), io);
  expect(result.exitCode).toBe(EXIT_LOCKED);
  expect(calls.atomicWrites).toHaveLength(0);
});

test('--dry-run writes no run record and creates no directories', async () => {
  const { io, calls } = buildMockIo(/* healthy state */);
  await runLoop(configWith({ dryRun: true, homeDir: '/th/campaigns/camp', runId: 'r-1' }), io);
  expect(calls.atomicWrites).toHaveLength(0);
  expect(calls.ensuredDirs).toHaveLength(0);
});

test('a run-record write failure does not kill the pass', async () => {
  const { io, calls } = buildMockIo(/* healthy state */);
  io.writeFileAtomic = () => { throw new Error('disk full'); };
  const result = await runLoop(configWith({ homeDir: '/th', runId: 'r-1' }), io);
  expect(result.exitCode).toBe(EXIT_OK); // the card still processed normally
});
```

- [ ] **Step 5: Run the full suite** — `bun run check` — Expected: PASS. Fix any remaining mock-IO/config fixture gaps (every test config literal now needs `homeDir`/`runId`/`argv` — add them to the suite's shared `configWith` helper once, not per test).

- [ ] **Step 6: Commit**

```bash
git add core/types.ts cli/main.ts cli/main.test.ts core/loop/run-loop.ts core/loop.test.ts
git commit -m "feat(runner): required --home input; per-invocation run.json record (spec §4, §5.1-2)"
```

---

### Task 3: `REPORT_PATH` from the home — delete the `.claude/state` hardcode

**Files:**
- Modify: `plugins/tribe/scripts/runner/core/brief.ts:39-41, 51-68`
- Modify: `plugins/tribe/scripts/runner/core/brief.test.ts`
- Modify: `plugins/tribe/scripts/runner/core/loop/card-actions.ts:244-263` (both `executorBrief` call sites)

**Interfaces:**
- Consumes: `resolved.homeDir` (Task 2), `reportsDirOf` (Task 1).
- Produces: `reportPathFor(homeDir: string, cardId: string): string` exported from `brief.ts`; `executorBrief(card, state, answersContent, template, reportPath: string)` — **5th parameter added**.

- [ ] **Step 1: Write the failing tests** (extend `core/brief.test.ts`, mirroring its existing template fixtures)

```ts
import { executorBrief, reportPathFor } from './brief.ts';

test('reportPathFor composes <home>/reports/<cardId>.md — no .claude/state anywhere (spec §5.3)', () => {
  expect(reportPathFor('/th/campaigns/camp', 'C1')).toBe('/th/campaigns/camp/reports/C1.md');
});

test('executorBrief substitutes the injected report path into {{REPORT_PATH}}', () => {
  const brief = executorBrief(card, state, 'answers', template, '/th/campaigns/camp/reports/C1.md');
  expect(brief).toContain('/th/campaigns/camp/reports/C1.md');
  expect(brief).not.toContain('.claude/state');
});
```

- [ ] **Step 2: Run to verify failure** — `bun test core/brief.test.ts` — Expected: FAIL (no export `reportPathFor`; arity).

- [ ] **Step 3: Implement**

`core/brief.ts` — replace `reportPathFor` (lines 39-41) entirely:

```ts
/** Spec §5.3: the worker report lives in the campaign's machine-local home — injected by
 * the caller, ABSOLUTE (executor sessions run with cwd = --repo, so a repo-relative path
 * can no longer express it). The old `.claude/state/...` hardcode violated this module's
 * own stateless-capability header and is gone. */
export function reportPathFor(homeDir: string, cardId: string): string {
  return join(homeDir, 'reports', `${cardId}.md`);
}
```

`executorBrief` gains the 5th param and uses it verbatim:

```ts
export function executorBrief(card: BriefCard, state: BriefState, answersContent: string, template: string, reportPath: string): string {
  // ... unchanged ...
    REPORT_PATH: reportPath,
```

`core/loop/card-actions.ts` — both call sites in `runCardSession` (the resume-fallback at line 245 and the fresh path at line 261) append the argument:

```ts
      executorBrief(toBriefCard(cardId, card), toBriefState(state), answersContent, resolved.briefTemplate, reportPathFor(resolved.homeDir, cardId))
```

(import `reportPathFor` from `../brief.ts`).

- [ ] **Step 4: Run the full suite** — `bun run check` — Expected: PASS (card-actions suites compile against the new arity via their `resolved` fixtures from Task 2).

- [ ] **Step 5: Commit**

Grep-gate first. Run: `grep -rn "\.claude/state" plugins/tribe/scripts/runner/` — Expected: **no code matches** (comments referencing history are fine only in `brief.ts`'s doc comment above).

```bash
git add core/brief.ts core/brief.test.ts core/loop/card-actions.ts
git commit -m "feat(runner): REPORT_PATH from injected campaign home; delete .claude/state hardcode (spec §5.3)"
```

---

### Task 4: Viewer pure core — `deriveStatus` + `renderPage`

**Files:**
- Create: `plugins/tribe/scripts/viewer/package.json`, `plugins/tribe/scripts/viewer/tsconfig.json` (copy the runner's, name `tribe-viewer`, **zero dependencies**; `"check": "tsc --noEmit && bun test"`)
- Create: `plugins/tribe/scripts/viewer/core/model.ts`
- Create: `plugins/tribe/scripts/viewer/core/derive.ts` + `core/derive.test.ts`
- Create: `plugins/tribe/scripts/viewer/core/render.ts` + `core/render.test.ts`

**Interfaces:**
- Consumes: nothing from the runner (**deliberate** — spec §7: the viewer reads the world tolerantly and must not import the runner's throwing parsers; the layout contract, not code, is shared).
- Produces (Task 5 relies on these exact shapes):

```ts
// core/model.ts — the adapter fills CampaignSnapshot (plain data, all IO done); derive/render are pure.
export interface RunView {
  runId: string; startedAt: string;
  pid: number | null; endedAt: string | null; exitCode: number | null; reason: string | null;
  pidAlive: boolean;            // adapter probes only when endedAt === null; else false
  parseError: string | null;    // set when run.json was unreadable — run still listed
}
export interface CampaignSnapshot {
  repoKey: string; campaignSlug: string; homeDir: string;
  runs: RunView[];
  stateRaw: string | null;      // contents of statePath from the LATEST run, or null
  stopExists: boolean;
  reportRaw: string | null;     // campaign-report.json next to the state file, or null
  escalations: Array<{ file: string; raw: string }>;
  reports: Array<{ cardId: string; sizeBytes: number }>;
  newestLog: { file: string; mtimeIso: string; sizeBytes: number; tailLines: string[] } | null;
  nowIso: string;
  scanErrors: string[];         // per-campaign read failures, already fault-isolated
}
export type Liveness =
  | { kind: 'running'; pid: number; startedAt: string; runId: string }
  | { kind: 'crashed'; pid: number; startedAt: string; runId: string }
  | { kind: 'exited'; reason: string; exitCode: number; endedAt: string; runId: string }
  | { kind: 'never_run' };
export interface CardRow { id: string; status: string; pr: number | null; updatedAt: string | null; dependsOn: string[]; blockedOn: string | null }
export interface CampaignStatus {
  repoKey: string; campaignSlug: string; homeDir: string;
  liveness: Liveness; stopRequested: boolean;
  cards: CardRow[] | { error: string };
  pendingEscalations: Array<{ cardId: string; reason: string; raw: string }>;
  reports: Array<{ cardId: string; sizeBytes: number }>;
  sessionTail: { file: string; ageSeconds: number; sizeBytes: number; lines: string[] } | null;
  errors: string[];
}
export function deriveStatus(snapshot: CampaignSnapshot): CampaignStatus;   // core/derive.ts
export function renderPage(statuses: CampaignStatus[], meta: { tribeRoot: string; nowIso: string }): string; // core/render.ts
```

**Derivation rules to implement and test (spec §7):**
1. Latest run = max `startedAt`. `endedAt === null && pidAlive` → `running`; `endedAt === null && !pidAlive` → `crashed`; `endedAt !== null` → `exited`; no runs → `never_run`.
2. Cards: `JSON.parse(stateRaw)` **defensively** — never the runner's throwing validation. Walk `sequence` order; unknown/missing fields render as `null`s, not exceptions; any parse failure → `cards: { error: <message> }` while the rest of the status still derives. `blockedOn`: parsed from `reportRaw`'s per-card `blockedOn` when present, else `null`.
3. `pendingEscalations`: one entry per `escalations[]` file; `cardId` = filename minus `.md`; `reason` = first `**Reason:** ...` match, else `'(unparsed)'`; `raw` truncated to 2000 chars.
4. `sessionTail.ageSeconds` = `(nowIso − mtimeIso)` in whole seconds.
5. Sort for render: `running` → `crashed` → `exited`/`never_run`, ties by most recent activity.

**Render rules to test:** every dynamic string HTML-escaped (test with a `campaign` named `<script>alert(1)</script>`); page contains the honest-labeling header line "Read-only view of on-disk state. GitHub is authority for PR/merge truth."; a `crashed` campaign renders the badge text `CRASHED`; STOP renders a banner; a `cards: {error}` snapshot renders the error panel and still renders the liveness badge; tail lines inside `<pre>`.

- [ ] **Step 1: Write failing `derive.test.ts`** — fixture snapshots as plain literals covering: running (live pid), crashed (unfinalized + dead pid), exited-with-report (blockedOn threading), never_run, unreadable state (`stateRaw: '{not json'`), escalation parsing, sort order. Assert full `CampaignStatus` literals where practical.
- [ ] **Step 2: Run to verify failure** — `bun test core/derive.test.ts` — Expected: FAIL (module `./derive.ts` missing).
- [ ] **Step 3: Implement `core/derive.ts`** (pure; ~120 lines; no imports beyond `./model.ts`).
- [ ] **Step 4: Run to verify pass** — `bun test core/derive.test.ts` — Expected: PASS (all fixture cases).
- [ ] **Step 5: Write failing `render.test.ts`** per the render rules above (string-contains assertions against `renderPage` output). Run: `bun test core/render.test.ts` — Expected: FAIL (module `./render.ts` missing).
- [ ] **Step 6: Implement `core/render.ts`** — one exported `renderPage`, private `escapeHtml` (`&<>"'`), inline `<style>` block, no external assets (self-contained page). Run: `bun test core/render.test.ts` — Expected: PASS.
- [ ] **Step 7: Commit**

Run: `cd plugins/tribe/scripts/viewer && bun run check` — Expected: tsc clean, all tests PASS.

```bash
git add plugins/tribe/scripts/viewer
git commit -m "feat(viewer): pure status derivation + server-rendered page (spec §7)"
```

---

### Task 5: Viewer scan adapter + HTTP entry

**Files:**
- Create: `plugins/tribe/scripts/viewer/adapters/scan.adapter.ts` + `adapters/scan.adapter.test.ts`
- Create: `plugins/tribe/scripts/viewer/serve.ts`

**Interfaces:**
- Consumes: `CampaignSnapshot`/`deriveStatus`/`renderPage` (Task 4). Run-record field names from Task 1 (`runId`, `pid`, `startedAt`, `endedAt`, `exitCode`, `reason`, `statePath`, `escalationsDir`, `logsDir`).
- Produces: `scanTribeRoot(root: string, probe: (pid: number) => boolean, nowIso: string): CampaignSnapshot[]`; CLI `bun serve.ts [--tribe-root <dir>] [--port <n>]`.

**Adapter behavior (all reads individually try/caught into `scanErrors` — spec §9):**
- Walk `<root>/<repoKey>/campaigns/<slug>/` two levels; skip non-directories.
- `runs/*/run.json` → `RunView[]` (a JSON parse failure yields `parseError` set, other fields best-effort null); probe pid **only** for records with `endedAt === null`.
- From the latest run: read `statePath` file → `stateRaw`; sibling `campaign-report.json` → `reportRaw`; sibling `STOP` existence → `stopExists`; `escalationsDir/*.md` → `escalations`; `<home>/reports/*.md` → `reports` (cardId = basename minus `.md`).
- `newestLog`: newest-mtime file under the latest run's `logsDir`; tail = **last 64 KiB read via `openSync`/`readSync` at `max(0, size - 65536)`**, split to lines, last 40 (never read a multi-GB log whole).
- Liveness probe implementation (passed in from `serve.ts`): `try { process.kill(pid, 0); return true } catch { return false }`.

- [ ] **Step 1: Write failing `scan.adapter.test.ts`** — build a real temp tree with `fs.mkdtempSync` (inside `os.tmpdir()`): one campaign with a finalized run + state file + escalation + report + log file; one campaign with an unfinalized run and `pid: process.pid` (probe true → running end-to-end through `deriveStatus`); one campaign with corrupt `run.json` (asserts `parseError` and that the OTHER campaigns still return). Assert tail truncation with a >64 KiB log fixture written in the test.
- [ ] **Step 2: `bun test` → FAIL.**
- [ ] **Step 3: Implement the adapter** (only file besides `serve.ts` importing `node:fs`/`node:path`/`node:os`).
- [ ] **Step 4: `bun test` → PASS.**
- [ ] **Step 5: Implement `serve.ts`** (composition root — flag parsing pure-inline, ~40 lines):

```ts
import { deriveStatus } from './core/derive.ts';
import { renderPage } from './core/render.ts';
import { scanTribeRoot } from './adapters/scan.adapter.ts';
import { join } from 'node:path';

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const tribeRoot = arg('--tribe-root') ?? join(process.env.HOME ?? '', '.tribe');
const port = Number(arg('--port') ?? '4321');
const probe = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };

Bun.serve({
  hostname: '127.0.0.1',
  port,
  fetch() {
    const nowIso = new Date().toISOString();
    const statuses = scanTribeRoot(tribeRoot, probe, nowIso).map(deriveStatus);
    return new Response(renderPage(statuses, { tribeRoot, nowIso }), {
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  },
});
console.log(`tribe viewer: http://127.0.0.1:${port} (root: ${tribeRoot}) — read-only, refresh to update`);
```

- [ ] **Step 6: Manual smoke** — `bun serve.ts --tribe-root <the adapter test's temp tree> --port 4399` + `curl -s 127.0.0.1:4399 | grep -c CRASHED` — Expected: ≥1. Record the transcript in the task report.
- [ ] **Step 7: Commit**

Run: `cd plugins/tribe/scripts/viewer && bun run check` — Expected: tsc clean, all tests PASS.

```bash
git add plugins/tribe/scripts/viewer
git commit -m "feat(viewer): tribe-root scan adapter + 127.0.0.1 refresh server (spec §7)"
```

---

### Task 6: Migration script

**Files:**
- Create: `plugins/tribe/scripts/migrate-campaign-home.sh` (executable)
- Create: `plugins/tribe/scripts/tests/test-migrate-campaign-home.sh` (mirror the harness style of `scripts/tests/test-migrate-state.sh` — read it first)

**Interfaces:**
- Consumes: `tribe-home.sh` **by invocation only** (never re-derive the key).
- Produces: `migrate-campaign-home.sh <repo> [--campaign <slug>] [--dry-run]`; exit 0 = all migrated/nothing to do; exit 1 = ≥1 conflict or live-lock refusal (others still processed).

**Behavior (spec §8):** for each `<repo>/.claude/state/<slug>/reports/` (filtered by `--campaign`): refuse the slug if any `.runner.lock` under `<repo>` whose path contains `/<slug>/` holds a live pid (`kill -0`); else `mkdir -p "$($DIR/tribe-home.sh "$REPO")/campaigns/<slug>/reports"` and per file: existing destination → print `CONFLICT`, mark failure; else `mv` (or echo under `--dry-run`). Remove emptied source dirs (`rmdir` best-effort). Always print a summary + reminder that old session logs were caller-chosen (`--logs-dir`) and are not auto-migrated.

- [ ] **Step 1: Write the failing test script.** Harness: `mktemp -d`; `export HOME="$TMP/home"`; fixture repo `git init`; seed `.claude/state/camp1/reports/C1.md`. Cases: (a) `--dry-run` moves nothing, prints the would-move line; (b) real run moves the file to `$HOME/.tribe/<key>/campaigns/camp1/reports/C1.md` and empties the source; (c) re-run is a no-op exit 0 (idempotent); (d) destination pre-seeded with different content → `CONFLICT`, exit 1, source untouched; (e) live lock: write `docs/x/camp1/.runner.lock` containing `{"pid":$$,...}` → refusal, exit 1, file not moved. Run: `bash scripts/tests/test-migrate-campaign-home.sh` — Expected: FAIL (script missing).
- [ ] **Step 2: Implement the script** (`set -euo pipefail`, pid extraction via `grep -o '"pid":[0-9]*' | grep -o '[0-9]*'` — no jq dependency).
- [ ] **Step 3: Run to verify pass** — `bash scripts/tests/test-migrate-campaign-home.sh` — Expected: PASS (all cases a-e). Also run `bash scripts/tests/test-migrate-state.sh` — Expected: PASS (sibling script still passes, untouched).
- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/scripts/migrate-campaign-home.sh plugins/tribe/scripts/tests/test-migrate-campaign-home.sh
git commit -m "feat(tribe): migrate old .claude/state worker reports into the campaign home (spec §8)"
```

---

### Task 7: Docs, skill injection, C3, install.sh verification, live smoke

**Files:**
- Modify: `plugins/tribe/scripts/runner/README.md` (Inputs table: `--home` required row + `--logs-dir` default change; new "Run record" section documenting the §4 layout + run.json schema; worked-example invocations gain `--home`; Known-limitations note that run-record write failures are silent by design)
- Modify: `plugins/tribe/skills/orchestrate-campaign/SKILL.md` (inputs table + both trigger command examples gain `--home "$(plugins/tribe/scripts/tribe-home.sh <target-repo>)/campaigns/<campaign-slug>"`; note that the value is computed, never typed literally)
- Modify: `plugins/tribe/README.md` (viewer + migration script one-paragraph entries, how to start the viewer)
- Modify: `.c3/c3-2-plugins/c3-215-tribe.md` (runner contract row: add `--home`; new IN rows for `scripts/viewer/serve.ts` and `scripts/migrate-campaign-home.sh`)
- Verify: `install.sh` — confirm nothing new needs linking (viewer/migration are repo-invoked); record the verification in the task report. If that assumption is wrong, add the linking and update this plan's Global Constraints note in the same commit.

- [ ] **Step 1: Make the doc edits above.** Every claim written into the README must be verified against the merged code, not this plan (the README's own standard: "verified against the code, not asserted from memory").
- [ ] **Step 2: Doc-consistency gate** — Run: `grep -rn "\.claude/state" plugins/tribe/ | grep -v tests` — Expected: only the migration script + its docs appear (the old location may be referenced there as the *source* being migrated). Run: `grep -n "home" plugins/tribe/scripts/runner/README.md` — Expected: shows the required-flag row.
- [ ] **Step 3: Live smoke (spec §10 — the runner README's own discipline: mocked tests validate logic, not invocations).** In a disposable target repo (or a scoped `--cards <id> --max-cards 1 --dry-run` first against a fixture campaign):
  1. Real runner invocation with `--home "$($PWD/plugins/tribe/scripts/tribe-home.sh <fixture-repo>)/campaigns/smoke"` — Expected: `run.json` exists with `endedAt` non-null after exit, `reports/` dir exists.
  2. `--dry-run` — Expected: **nothing** created under the home (`find <home> -newer <marker>` empty).
  3. Start the viewer against the real `~/.tribe` — Expected: browser/`curl` shows the smoke campaign with an `EXITED` badge; paste the HTML snippet into the task report.
- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/scripts/runner/README.md plugins/tribe/skills/orchestrate-campaign/SKILL.md plugins/tribe/README.md .c3/c3-2-plugins/c3-215-tribe.md
git commit -m "docs(tribe): --home contract, run-record layout, viewer + migration usage (spec §5-8)"
```

---

## Plan Self-Review (completed at authoring)

1. **Spec coverage:** §4 layout → T1/T2; §5.1-2 flag+record → T2; §5.3 brief → T3; §5.4 logs default → T2; §5.5 ports → T1; §5.6 README → T7; §6 skill → T7; §7 viewer → T4/T5; §8 migration → T6; §9 error table → T2 (swallow + tests), T4/T5 (fault isolation), T6 (conflict/lock exits); §10 testing → every task's TDD steps + T7 live smoke; §11 rollout note → T7 README. **Deviation recorded:** spec §9 said run-record write failure "logs a warning"; implementation swallows with a doc comment instead (a warning would need a new logging seam through pure core for zero observer value — the record's absence is the signal; the spec's intent, "never kill the run", is kept). Gap: none other found.
2. **Placeholder scan:** clean — every step has code, commands, or an exact edit target.
3. **Type consistency:** `homeDir`/`runId`/`argv` (T2) match T1's `buildRunRecord` param and T3's `reportPathFor(resolved.homeDir, ...)`; `RunView`/`CampaignSnapshot` field names in T4 match the T5 adapter contract and T1's `RunRecord` JSON field names.
