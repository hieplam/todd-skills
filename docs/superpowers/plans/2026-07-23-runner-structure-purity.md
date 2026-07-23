# Runner Structure & Purity Wall Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **LOCAL-ONLY ARTIFACT:** never commit this plan file (owner rule: superpowers artifacts stay local).

**Goal:** Restructure the tribe campaign runner into a lightweight hexagon — shared kernel / pure core / `*.adapter.ts` leaves / composition root — with kanna's purity hard rule enforced mechanically (ESLint + a bun guard test), then make `loop.ts` readable via extract-method and parameter objects.

**Architecture:** Two change-units on two branches, merged in order. CU1 (`feat/runner-purity-wall`) fixes structure: moves shared constants to `types.ts` (kills the `report.ts → loop.ts` backward edge), splits the SDK import into `session.adapter.ts` (closes the transitive SDK load in `loop.ts`), makes `brief.ts` pure by injecting the template, extracts `run-io.adapter.ts`, and lands the ESLint wall + guard test. CU2 (`feat/runner-loop-readability`) is behavior-preserving readability: `runLoop` becomes a ~15-line table of contents, card functions take a `CardCtx` parameter object, and dead `maxTurns` plumbing is deleted. No directory changes — flat + filename convention, kanna's own evolved practice.

**Tech Stack:** Bun (runtime + `bun test`), TypeScript 7 (`strict`, `verbatimModuleSyntax` — type imports MUST use `import type`), ESLint 9 flat config + `typescript-eslint`.

## Amendments (Warchief rulings during execution)

- **A1 (Task 2, 2026-07-23):** `@types/bun@1.3.14` types `test.todo` with a REQUIRED callback — label-only `test.todo('…')` fails `bunx tsc --noEmit` (TS2554) although the runtime accepts it. Every `test.todo` in `structure.test.ts` must carry a `() => {}` second argument until its task flips it live. Task 2 additionally fixes the three remaining todos this way (authorized scope extension). Expected counts after Task 2: **177 pass / 3 todo / 0 fail** (the plan's original "176 pass" undercounted the flipped todo).

- **A2 (Task 4, 2026-07-23):** Task 4 has a THIRD test fallout the plan missed: `report.test.ts` drives the real `runLoop` through two inline `LoopIO` fixtures (~lines 540/634), so both need the same `BRIEF_TEMPLATE_PATH` branch as `loop.test.ts`'s fixture, plus `import { BRIEF_TEMPLATE_PATH } from './brief.ts';`. `report.test.ts` is added to Task 4's Files and stage list. Also: `loop.ts` has 2 real `executorBrief` call sites, not 3 (the third grep hit is a doc comment).

- **A3 (Task 6, 2026-07-23) — SUPERSEDES Task 6's ESLint steps:** every published `typescript-eslint` (≤8.65.0) hard-throws on `typescript` major ≥ 7 (its `dist/index.js` guard; tracking issue typescript-eslint#10940), and the repo's TS 7.0.2 native package exposes no classic API for it. Ruling: keep TS 7; do NOT add eslint/typescript-eslint deps; the purity wall's remaining pieces (ambient-state seal: `process.env` ban everywhere non-adapter, `process.exit` only in run.ts) land as comment-stripped source assertions in `structure.test.ts`; `check` script becomes `bunx tsc --noEmit && bun test`. The ESLint layer is DEFERRED until typescript-eslint supports TS ≥ 7.1 — record that in the C3 ADR (Task 7). Violation-injection proofs still required, against `bun test structure.test.ts`.

## Global Constraints

- Working dir for all commands: `plugins/tribe/scripts/runner` (except `git` commit/PR steps, which run at repo root or runner dir — paths below are relative to the runner dir unless prefixed).
- Baseline: `bun test` → **172 tests, 0 fail, 8 files**. The suite must be green at **every** commit.
- Behavior-preserving throughout: no semantic change is permitted except deleting `maxTurns` (runtime-neutral: it is `undefined` on every real path today — no CLI flag sets it, verified by grep).
- Commit message format: `[runner-purity-wall] <type>: <imperative subject>` on CU1, `[runner-loop-readability] <type>: <subject>` on CU2. **No Co-Authored-By trailer, no Claude attribution footer** (owner rule).
- PR titles: `[runner-purity-wall] …` / `[runner-loop-readability] …`. **Regular merge only, never squash** (merge commit must have 2 parents).
- The zero-LLM wall: after CU1, `session.adapter.ts` is the ONLY file importing `@anthropic-ai/claude-agent-sdk`.
- `verbatimModuleSyntax` is on: importing a type without `import type` fails typecheck. Every import shown below already respects this — copy them exactly.
- Never commit: this plan, `.c3/` files, `.okra/` files.
- `install.sh` needs no update (verified: zero references to the runner).
- The runner has no CI workflow; the gate is the new `bun run check` script (Task 6) run locally before each PR.

---

# CU1 — Purity wall (branch `feat/runner-purity-wall`)

Create the branch first: `git checkout -b feat/runner-purity-wall` (from up-to-date `master`).

### Task 1: Structure guard test (red-by-todo)

**Files:**
- Create: `plugins/tribe/scripts/runner/structure.test.ts`

**Interfaces:**
- Consumes: nothing (reads sibling source files as text).
- Produces: the executable structural contract. Later tasks flip one `test.todo` → `test` each. Helper names used later: `valueImportsOf(file)`, `allImportsOf(file)`, `CORE_FILES`.

- [ ] **Step 1: Write the guard test.** Four assertions that already HOLD are live `test`s (they lock in what's true today); four that FAIL today are `test.todo` (flipped live in Tasks 2–5).

```ts
// structure.test.ts — the runner's structural contract, executable (lesson L2: an
// architectural invariant is a lint/test in CI, or it is a wish).
//
// Roles (flat directory + filename convention — no folders):
//   types.ts                 shared kernel: imports nothing local; home of ALL shared vocabulary
//   *.adapter.ts             the ONLY files that may import world-touching modules (fs,
//                            child_process, http, the Agent SDK)
//   run.ts                   composition root: the only file that may VALUE-import adapters
//                            and loop.ts
//   everything else          pure core
// Tests are exempt everywhere (they need real IO or mocks freely) — kanna's own exemption.
import { describe, expect, test } from 'bun:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const DIR = import.meta.dir;
const SOURCE_FILES = readdirSync(DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
  .sort();
const CORE_FILES = SOURCE_FILES.filter((f) => !f.endsWith('.adapter.ts'));

/** Module specifiers of every import in the file, including `import type`. */
function allImportsOf(file: string): string[] {
  const src = readFileSync(join(DIR, file), 'utf8');
  return [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] as string);
}

/** Module specifiers of value imports only (`import type` statements stripped first). */
function valueImportsOf(file: string): string[] {
  const src = readFileSync(join(DIR, file), 'utf8').replace(/import\s+type\s[^;]+;/gs, '');
  return [...src.matchAll(/from\s+'([^']+)'/g)].map((m) => m[1] as string);
}

const WORLD = ['fs', 'node:fs', 'node:fs/promises', 'child_process', 'node:child_process', 'http', 'node:http', 'https', 'node:https', '@anthropic-ai/claude-agent-sdk'];

describe('structural contract', () => {
  // --- true today: locked in immediately ---
  test('types.ts is a leaf: no local imports at all', () => {
    expect(allImportsOf('types.ts').filter((s) => s.startsWith('./'))).toEqual([]);
  });
  test('loop/state/verify/github/report never import world-touching modules', () => {
    for (const f of ['loop.ts', 'state.ts', 'verify.ts', 'github.ts', 'report.ts']) {
      expect({ file: f, bad: allImportsOf(f).filter((s) => WORLD.includes(s)) }).toEqual({ file: f, bad: [] });
    }
  });
  test('only session-owned files import the Agent SDK', () => {
    const importers = SOURCE_FILES.filter((f) => allImportsOf(f).includes('@anthropic-ai/claude-agent-sdk'));
    expect(importers.every((f) => f.startsWith('session'))).toBe(true);
  });
  test('adapters are value-imported only by run.ts or other adapters', () => {
    for (const f of CORE_FILES.filter((f) => f !== 'run.ts')) {
      expect({ file: f, bad: valueImportsOf(f).filter((s) => s.includes('.adapter')) }).toEqual({ file: f, bad: [] });
    }
  });

  // --- false today: flipped live by CU1 tasks ---
  test.todo('leaf modules never import the orchestrator (only run.ts + tests may)'); // Task 2
  test.todo('session.ts is pure: no SDK import outside session.adapter.ts'); // Task 3
  test.todo('brief.ts is pure: no node:fs import'); // Task 4
  test.todo('run.ts is pure wiring: no node:fs / node:child_process import'); // Task 5
});
```

- [ ] **Step 2: Run it.** `bun test structure.test.ts` — Expected: **4 pass, 4 todo, 0 fail**.
- [ ] **Step 3: Run the whole suite.** `bun test` — Expected: 176 tests pass (172 + 4), 0 fail.
- [ ] **Step 4: Commit.** `git add structure.test.ts && git commit -m "[runner-purity-wall] test: Add executable structural contract for the runner"`

### Task 2: Move all `EXIT_*` constants to the shared kernel (`types.ts`)

**Files:**
- Modify: `types.ts` (append), `loop.ts:370-373` (delete decls, add import), `run.ts:12-35` (import changes, delete local const), `report.ts:20`, `loop.test.ts:9-31`, `report.test.ts:20-28`, `structure.test.ts` (flip todo)

**Interfaces:**
- Produces: `EXIT_OK = 0`, `EXIT_LOCKED = 1`, `EXIT_ESCALATED = 2`, `EXIT_SESSION_INCOMPLETE = 3`, `EXIT_ERROR = 4` exported from `./types.ts`. `loop.ts` no longer exports any `EXIT_*`.

- [ ] **Step 1: Flip the guard.** In `structure.test.ts` replace the Task-2 `test.todo` line with:

```ts
  test('leaf modules never import the orchestrator (only run.ts + tests may)', () => {
    for (const f of CORE_FILES.filter((f) => f !== 'run.ts')) {
      expect({ file: f, bad: allImportsOf(f).filter((s) => s === './loop.ts' || s === './loop') }).toEqual({ file: f, bad: [] });
    }
  });
```

- [ ] **Step 2: See it fail.** `bun test structure.test.ts` — Expected: FAIL, `report.ts` bad: `['./loop.ts']`.
- [ ] **Step 3: Append to `types.ts`:**

```ts
/** Process exit codes — the runner's shared vocabulary, homed in the kernel so leaf modules
 * (report.ts) import them from here, never from the orchestrator (lesson L5: anything used
 * by 2+ modules lives in the kernel). */
export const EXIT_OK = 0;
export const EXIT_LOCKED = 1;
export const EXIT_ESCALATED = 2;
export const EXIT_SESSION_INCOMPLETE = 3;
/** "An unhandled exception surfaced after `runLoop` was entered" — consumed only by run.ts's
 * `main()`; the exit code is a hint, the report is the truth (§O3). */
export const EXIT_ERROR = 4;
```

- [ ] **Step 4: `loop.ts`.** Delete the four `export const EXIT_…` lines (currently 370-373). Below the existing `import type { Card, … } from './types.ts';` line add:

```ts
import { EXIT_ESCALATED, EXIT_LOCKED, EXIT_OK, EXIT_SESSION_INCOMPLETE } from './types.ts';
```

- [ ] **Step 5: `report.ts:20`.** Change `from './loop.ts'` → `from './types.ts'` (same three names). The next line's `import type { Card, CampaignState } from './types.ts';` stays as-is.
- [ ] **Step 6: `run.ts`.** Delete `EXIT_LOCKED,` from the `./loop.ts` import block (line 13; it is referenced only in a comment — after deleting, `grep -n "EXIT_LOCKED" run.ts` must show comment hits only). Delete the `const EXIT_ERROR = 4;` declaration AND its full doc comment (lines 28-35). Add:

```ts
import { EXIT_ERROR } from './types.ts';
```

- [ ] **Step 7: Tests.** In `loop.test.ts` remove the four `EXIT_…` names from the `./loop.ts` import block and add a new line after it; same surgery in `report.test.ts`:

```ts
import { EXIT_ESCALATED, EXIT_LOCKED, EXIT_OK, EXIT_SESSION_INCOMPLETE } from './types.ts';
```

- [ ] **Step 8: Verify.** `bunx tsc --noEmit && bun test` — Expected: typecheck clean; 176 pass (Task-2 guard now live and green), 3 todo.
- [ ] **Step 9: Commit.** `git add -A && git commit -m "[runner-purity-wall] refactor: Home EXIT_* constants in types.ts kernel"`

### Task 3: Split `session.adapter.ts` out of `session.ts`

**Files:**
- Create: `session.adapter.ts`
- Modify: `session.ts:1-8` (header + delete SDK import), `session.ts:120-125` (delete `sdkSpawnSession`), `run.ts:24` (import from adapter), `structure.test.ts` (flip todo)

**Interfaces:**
- Produces: `sdkSpawnSession(params: SpawnSessionParams): AsyncIterable<SessionMessage>` exported from `./session.adapter.ts`. `session.ts` keeps everything else (`runSession`, `buildSessionOptions`, all types) and becomes SDK-free — so `loop.ts`'s `import { runSession } from './session.ts'` no longer transitively loads the SDK (the hole the ADR's direct-import grep misses).

- [ ] **Step 1: Flip the guard.** Replace the Task-3 `test.todo` with:

```ts
  test('session.ts is pure: no SDK import outside session.adapter.ts', () => {
    expect(allImportsOf('session.ts').includes('@anthropic-ai/claude-agent-sdk')).toBe(false);
  });
```

- [ ] **Step 2: See it fail.** `bun test structure.test.ts` — Expected: FAIL (session.ts imports the SDK at line 8).
- [ ] **Step 3: Create `session.adapter.ts`:**

```ts
// session.adapter.ts — the runner's ONLY import of `@anthropic-ai/claude-agent-sdk`
// (spec "SDK drift" risk note + the zero-LLM wall). An SDK upgrade touches this file and
// nothing else; every other module reaches a session through the `SessionIO` seam.
// Enforced by structure.test.ts + eslint.config.js, not by this comment.
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { SessionMessage, SpawnSessionParams } from './session.ts';

/** The real SDK spawn, wrapping `query()` — used by run.ts to build the production
 * `SessionIO`. Not exercised by unit tests (it would hit the real SDK); the option-building
 * and message-parsing logic it feeds (session.ts) is fully covered without it. */
export function sdkSpawnSession(params: SpawnSessionParams): AsyncIterable<SessionMessage> {
  return query({ prompt: params.prompt, options: params.options }) as unknown as AsyncIterable<SessionMessage>;
}
```

- [ ] **Step 4: `session.ts`.** Delete line 8 (`import { query } from '@anthropic-ai/claude-agent-sdk';`) and the whole `sdkSpawnSession` function with its doc comment (lines 120-125). Rewrite the file header's SDK sentence (lines 1-6) to:

```ts
// Pinned Claude Agent SDK query() options + session spawn/parse (Task 5b, spec §D1).
//
// PURE module: the SDK itself is imported only by `session.adapter.ts` (the zero-LLM wall).
// This file owns the pinned option block and the message-parsing logic; every module reaches
// a session through the `SessionIO` seam below, never the SDK package directly.
```

- [ ] **Step 5: `run.ts:24`.** Change to `import { sdkSpawnSession } from './session.adapter.ts';` (the `import type { SessionMessage, SpawnSessionParams } from './session.ts';` line below it is unchanged).
- [ ] **Step 6: Verify.** `bunx tsc --noEmit && bun test` — Expected: clean; 177 pass, 2 todo.
- [ ] **Step 7: Commit.** `git add -A && git commit -m "[runner-purity-wall] refactor: Isolate the SDK import in session.adapter.ts"`

### Task 4: Make `brief.ts` pure — inject the template

No new adapter file (prefer deletion over abstraction): `loop.ts` already loads `answersContent` through `io.readFile` in `runLoop` (line 885); the template is loaded the same way, once, into `ResolvedConfig`.

**Files:**
- Modify: `brief.ts` (delete fs import + `loadTemplate`, export path, new param), `loop.ts` (`ResolvedConfig`, `runLoop` resolved-construction, 3 `executorBrief` call sites), `brief.test.ts`, `loop.test.ts` (readFile fixture), `structure.test.ts` (flip todo)

**Interfaces:**
- Produces: `executorBrief(card: BriefCard, state: BriefState, answersContent: string, template: string): string` and `export const BRIEF_TEMPLATE_PATH: string` from `./brief.ts`; `ResolvedConfig` gains `briefTemplate: string`.

- [x] **Step 1: Flip the guard.** Replace the Task-4 `test.todo` with:

```ts
  test('brief.ts is pure: no node:fs import', () => {
    expect(allImportsOf('brief.ts').filter((s) => WORLD.includes(s))).toEqual([]);
  });
```

- [x] **Step 2: See it fail.** `bun test structure.test.ts` — Expected: FAIL (`brief.ts:9` imports `node:fs`).
- [x] **Step 3: `brief.ts`.** Delete `import { readFileSync } from 'node:fs';` and the `loadTemplate()` function. Replace the private `TEMPLATE_PATH` const with an export, and thread the template through:

```ts
/** Absolute path of the committed template asset — pure path computation; the CALLER reads
 * it (through its own injected IO seam) and passes the content in. */
export const BRIEF_TEMPLATE_PATH = join(import.meta.dir, 'brief-template.md');
```

and change the signature + first render arg:

```ts
export function executorBrief(card: BriefCard, state: BriefState, answersContent: string, template: string): string {
```
```ts
  return renderTemplate(template, {
```

- [x] **Step 4: `loop.ts`.** Add `briefTemplate: string;` to `ResolvedConfig` (after `answersContent: string;`, line 367). Add to the imports from `./brief.ts`: `import { BRIEF_TEMPLATE_PATH, executorBrief } from './brief.ts';` (replacing the existing value import of `executorBrief`). In `runLoop` where `resolved` is built (lines 884-886), add the read:

```ts
    const baseBranch = await resolveBaseBranch(io, config.repoRoot);
    const answersContent = String(await io.readFile(join(config.repoRoot, config.answersPath)));
    const briefTemplate = String(await io.readFile(BRIEF_TEMPLATE_PATH));
    const resolved: ResolvedConfig = { ...config, baseBranch, answersContent, briefTemplate };
```

Update all three `executorBrief(...)` call sites in `runCardSession` (lines 743-747 and 758) to pass the fourth arg, e.g.:

```ts
    const brief = executorBrief(
      toBriefCard(cardId, card),
      toBriefState(state),
      `${digest}\n\n---\n\n${resolved.answersContent}`,
      resolved.briefTemplate,
    );
```
```ts
  const brief = executorBrief(toBriefCard(cardId, card), toBriefState(state), answersContent, resolved.briefTemplate);
```

- [x] **Step 5: Run the suite to find the two test fallouts.** `bun test` — Expected failures: (a) `brief.test.ts` — every `executorBrief` call now needs the 4th arg; (b) `loop.test.ts` — the mocked `io.readFile` receives an unrecognized path (`BRIEF_TEMPLATE_PATH`). [Actual: a third fallout in `report.test.ts` was also found — see Amendment A2.]
- [x] **Step 6: Fix `brief.test.ts`.** Tests are purity-exempt — read the real template once at the top and pass it everywhere:

```ts
import { readFileSync } from 'node:fs';
import { BRIEF_TEMPLATE_PATH, executorBrief } from './brief.ts';

const TEMPLATE = readFileSync(BRIEF_TEMPLATE_PATH, 'utf8');
```

then append `, TEMPLATE` as the 4th argument of every `executorBrief(...)` call in the file.
- [x] **Step 7: Fix `loop.test.ts`.** Locate the fixture `readFile` implementation (grep `readFile` in the file); add a branch BEFORE its existing path handling:

```ts
import { BRIEF_TEMPLATE_PATH } from './brief.ts';
```
```ts
      if (path === BRIEF_TEMPLATE_PATH) return '# Executor brief for {{CARD_ID}}\n{{ANSWERS_CONTENT}}';
```

(The fixture template needs only placeholders that `executorBrief` supplies — any subset of the real ones is valid; unknown placeholders are what throw.) If multiple fixture IO builders exist, add the branch to each `readFile`.
- [x] **Step 8: Verify.** `bunx tsc --noEmit && bun test` — Expected: clean; 178 pass, 1 todo. [Actual: 179 pass / 1 todo / 0 fail, per Amendment A1's off-by-one — see Amendment A2 for the report.test.ts fix that was required to reach green.]
- [x] **Step 9: Commit.** `git add -A && git commit -m "[runner-purity-wall] refactor: Make brief.ts pure by injecting the template content"`

### Task 5: Extract `run-io.adapter.ts` from `run.ts`

**Files:**
- Create: `run-io.adapter.ts`
- Modify: `run.ts` (delete lines 10-11 fs/child_process imports + lines 153-223 `realExec`/`isProcessAlive`/`buildRealIo`, import the adapter), `structure.test.ts` (flip todo)

**Interfaces:**
- Produces: `buildRealIo(config: RunLoopConfig): LoopIO` from `./run-io.adapter.ts`. `run.ts` keeps `parseArgs` (pure), `tryWriteReport`, `main` (wiring) — and no world-touching imports.

- [x] **Step 1: Flip the guard.** Replace the Task-5 `test.todo` with:

```ts
  test('run.ts is pure wiring: no node:fs / node:child_process import', () => {
    expect(allImportsOf('run.ts').filter((s) => WORLD.includes(s))).toEqual([]);
  });
```

- [x] **Step 2: See it fail.** `bun test structure.test.ts` — Expected: FAIL (run.ts:10-11).
- [x] **Step 3: Create `run-io.adapter.ts`** — the moved code is byte-identical to run.ts:153-223 except the wrapper imports; only the header is new:

```ts
// run-io.adapter.ts — the production LoopIO: every real-world primitive the runner touches
// (filesystem, child processes, clock, own pid) lives behind this one adapter leaf. Pure
// modules receive it as the injected `io` parameter and never import these primitives
// themselves (purity wall — enforced by structure.test.ts + eslint.config.js).
import { dirname, join } from 'node:path';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
import type { ExecResult, LockInfo, LoopIO, PendingCommit, RunLoopConfig } from './loop.ts';
import type { SessionMessage, SpawnSessionParams } from './session.ts';
import { sdkSpawnSession } from './session.adapter.ts';

function realExec(cmd: string[], opts?: { cwd?: string }): Promise<ExecResult> {
  return new Promise((resolve) => {
    const child = spawn(cmd[0] as string, cmd.slice(1), { cwd: opts?.cwd });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => (stdout += chunk.toString()));
    child.stderr?.on('data', (chunk) => (stderr += chunk.toString()));
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }));
    child.on('error', (err) => resolve({ stdout, stderr: err.message, exitCode: 1 }));
  });
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return (err as NodeJS.ErrnoException).code === 'EPERM';
  }
}

export function buildRealIo(config: RunLoopConfig): LoopIO {
  const stateDir = dirname(join(config.repoRoot, config.statePath));
  const lockPath = join(stateDir, '.runner.lock');
  const pendingCommitPath = join(stateDir, '.pending-commit.json');

  return {
    exec: realExec,
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

    fileExists: (p) => existsSync(p),
    readFile: (p) => readFileSync(p, 'utf8'),
    writeFile: (p, content) => {
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, content);
    },

    readLock: () => {
      if (!existsSync(lockPath)) return null;
      return JSON.parse(readFileSync(lockPath, 'utf8')) as LockInfo;
    },
    writeLock: (info) => {
      mkdirSync(dirname(lockPath), { recursive: true });
      writeFileSync(lockPath, JSON.stringify(info));
    },
    removeLock: () => {
      if (existsSync(lockPath)) rmSync(lockPath);
    },
    isProcessAlive,
    currentPid: () => process.pid,
    now: () => new Date().toISOString(),

    readPendingCommit: () => {
      if (!existsSync(pendingCommitPath)) return null;
      return JSON.parse(readFileSync(pendingCommitPath, 'utf8')) as PendingCommit;
    },
    writePendingCommit: (pc) => {
      mkdirSync(dirname(pendingCommitPath), { recursive: true });
      writeFileSync(pendingCommitPath, JSON.stringify(pc));
    },
    clearPendingCommit: () => {
      if (existsSync(pendingCommitPath)) rmSync(pendingCommitPath);
    },

    spawnSession: (params: SpawnSessionParams): AsyncIterable<SessionMessage> => sdkSpawnSession(params),
    appendLog: (logPath, line) => {
      mkdirSync(dirname(logPath), { recursive: true });
      writeFileSync(logPath, `${line}\n`, { flag: 'a' });
    },
  };
}
```

- [x] **Step 4: `run.ts`.** Delete lines 10-11 (`node:fs`, `node:child_process` imports), delete `realExec`/`isProcessAlive`/`buildRealIo` (lines 153-223, including the "Real-world wiring" banner comment — move the banner text into the file-header comment if desired). Delete the now-unused `import { sdkSpawnSession } from './session.adapter.ts';` and the `SessionMessage, SpawnSessionParams` type import (both were only used by `buildRealIo`). Add:

```ts
import { buildRealIo } from './run-io.adapter.ts';
```

Check remaining `node:path` usage: `dirname`/`join` are still used by `parseArgs` (line 107) and `tryWriteReport` (line 237) — keep that import.
- [x] **Step 5: Verify.** `bunx tsc --noEmit && bun test` — Expected: clean; **179 pass, 0 todo, 0 fail**.
- [x] **Step 6: Smoke-run the CLI (wiring is untested by unit tests).** `bun run.ts --dry-run 2>&1 | head -3` — Expected: `campaign runner: missing required flag: --repo` (parse still works; no import crash).
- [x] **Step 7: Commit.** `git add -A && git commit -m "[runner-purity-wall] refactor: Extract production LoopIO into run-io.adapter.ts"`

### Task 6: ESLint purity wall (kanna's hard rule, ported)

**Files:**
- Create: `eslint.config.js`
- Modify: `package.json` (devDeps + scripts)

**Interfaces:**
- Produces: `bun run lint` (zero-warning ESLint) and `bun run check` (lint → typecheck → test), the pre-PR gate.

- [ ] **Step 1: Install.** `bun add -d eslint typescript-eslint` — Expected: `eslint@^9`, `typescript-eslint@^8` added to devDependencies.
- [ ] **Step 2: Create `eslint.config.js`:**

```js
// eslint.config.js — the purity wall + import-direction rule.
// Mechanism ported from kanna (its only mechanically-enforced boundary): plain
// `no-restricted-imports` string-matching on import sources + AST esquery selectors —
// no dependency-cruiser, no plugin-boundaries, no custom tooling (lesson L7: port the
// mechanism kanna actually runs, not the slogan).
import tseslint from 'typescript-eslint';

/** World-touching modules: importable ONLY from `*.adapter.ts` leaves (and tests). */
const WORLD = [
  'fs', 'node:fs', 'node:fs/promises',
  'child_process', 'node:child_process',
  'http', 'node:http', 'https', 'node:https',
  '@anthropic-ai/claude-agent-sdk',
].map((name) => ({ name, message: 'World-touching module: allowed only in *.adapter.ts leaves (purity wall).' }));

/** Ambient-state reads that hide inputs from tests (kanna's SHARED_CLIENT_SEAL, adapted). */
const PROCESS_ENV = {
  selector: "MemberExpression[object.name='process'][property.name='env']",
  message: 'Ambient process.env read: accept the value as an explicit input instead.',
};
const PROCESS_EXIT = {
  selector: "CallExpression[callee.object.name='process'][callee.property.name='exit']",
  message: 'process.exit belongs to run.ts (composition root) only.',
};

export default [
  // Composition root: no world-touching imports, but process.exit/pid are its job.
  {
    files: ['run.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', { paths: WORLD }],
      'no-restricted-syntax': ['error', PROCESS_ENV],
    },
  },
  // Pure core (everything except run.ts, adapters, tests): purity + import direction.
  {
    files: ['**/*.ts'],
    ignores: ['run.ts', '**/*.adapter.ts', '**/*.test.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', {
        paths: WORLD,
        patterns: [
          {
            group: ['*.adapter', '*.adapter.ts', './*.adapter', './*.adapter.ts'],
            message: 'Adapters are wired only by run.ts (composition root).',
            allowTypeImports: true,
          },
          {
            group: ['./loop', './loop.ts'],
            message: 'Only run.ts may import the orchestrator; shared vocabulary lives in types.ts.',
            allowTypeImports: true,
          },
        ],
      }],
      'no-restricted-syntax': ['error', PROCESS_ENV, PROCESS_EXIT],
    },
  },
];
```

- [ ] **Step 3: `package.json` scripts:**

```json
  "scripts": {
    "test": "bun test",
    "lint": "eslint . --max-warnings=0",
    "check": "bun run lint && bunx tsc --noEmit && bun test"
  },
```

- [ ] **Step 4: Run it.** `bun run lint` — Expected: exit 0, no output. (If it flags `structure.test.ts`'s fs import, the `**/*.test.ts` ignore has a typo — fix, don't suppress.)
- [ ] **Step 5: Prove the wall fires (both layers), then restore.**

```bash
echo "import { readFileSync } from 'node:fs'; readFileSync('/tmp/x');" >> state.ts && bun run lint; git checkout state.ts
echo "import { sdkSpawnSession } from './session.adapter.ts'; sdkSpawnSession;" >> report.ts && bun run lint; git checkout report.ts
```

Expected: each `bun run lint` FAILS with the matching message ("purity wall" / "wired only by run.ts"); after `git checkout`, `bun run lint` is clean again.
- [ ] **Step 6: Full gate.** `bun run check` — Expected: lint clean, typecheck clean, 179 tests pass.
- [ ] **Step 7: Commit.** `git add eslint.config.js package.json bun.lock && git commit -m "[runner-purity-wall] chore: Enforce purity wall and import direction via ESLint"`

### Task 7: CU1 close-out — C3 record (local) + PR + merge

- [ ] **Step 1: Record the structural contract in C3 (LOCAL ONLY — never stage `.c3/`).** Via the c3 skill wrapper: `add adr runner-purity-wall` with a body recording: decision (flat + `*.adapter.ts` convention, kernel = types.ts, composition root = run.ts), the two enforcement surfaces (`structure.test.ts`, `eslint.config.js`), and that `session.adapter.ts` supersedes "session.ts is the only SDK importer" in the two campaign ADRs' wall wording. Verify `git status` shows no `.c3/` files staged.
- [ ] **Step 2: Update `README.md`** (runner): add a short "Structure" section — the four roles, the import-direction table from the plan header, and `bun run check` as the gate. One screenful max.
- [ ] **Step 3: Commit README.** `git add README.md && git commit -m "[runner-purity-wall] docs: Document runner structure roles and check gate"`
- [ ] **Step 4: Push + PR.** `git push -u origin feat/runner-purity-wall`, then `gh pr create --title "[runner-purity-wall] Enforce purity wall and import direction in campaign runner" --body ...` — Description ≤3 sentences (what/why: purity wall + kernel + adapter split, closes the transitive SDK load in loop.ts); ≤3 one-line design-choice bullets (no folders — filename convention, kanna's evolved practice; template injected, no brief adapter; type-imports of ports exempt from direction rule). Use `.github/PULL_REQUEST_TEMPLATE` if the repo has one.
- [ ] **Step 5: Merge with a REGULAR merge (never squash)** after review: `gh pr merge --merge`. Verify: `git log -1 --format=%p origin/master | wc -w` → `2`.

---

# CU2 — Loop readability (branch `feat/runner-loop-readability`)

Create after CU1 merges: `git checkout master && git pull && git checkout -b feat/runner-loop-readability`. All tasks are behavior-preserving; the loop.test.ts suite (which drives `runLoop` from outside) is the regression harness — it must pass unmodified except where a signature it calls directly changes (none are exported, verified: `escalateCard`/`shipCard`/`actOnCard`/`runCardSession`/`buildSessionIOForCard` have no `export`).

### Task 8: `runLoop` becomes a table of contents

**Files:**
- Modify: `loop.ts:865-991` (extract four helpers, placed directly above `runLoop`)

**Interfaces:**
- Produces (module-private): `startupStopResult(config, io): LoopResult | null`, `resolveRunContext(config, io): Promise<ResolvedConfig>`, `retryPendingCommit(resolved, io): Promise<void>`, `runPass(state, resolved, io): Promise<LoopResult>`.

- [ ] **Step 1: Baseline.** `bun test loop.test.ts` — Expected: pass (record the count).
- [ ] **Step 2: Extract.** Move the code verbatim (keep every doc comment with the code it documents — the D5′ loop commentary moves into `runPass`, the W-F5 comment stays on the `persistLocalState` call in `runLoop`):

```ts
/** STOP honored before any work: a present STOP file ends the run cleanly, before the lock's
 * critical section does anything. */
function startupStopResult(config: RunLoopConfig, io: LoopIO): LoopResult | null {
  if (!isStopRequested(stopFilePathOf(config), io)) return null;
  return {
    exitCode: EXIT_OK,
    processed: [],
    message: 'STOP file present; exiting cleanly before processing any card.',
  };
}

/** Loads everything `RunLoopConfig` doesn't carry: the base branch (from origin/HEAD), the
 * committed --answers rulings, and the committed brief template — all through the io seam. */
async function resolveRunContext(config: RunLoopConfig, io: LoopIO): Promise<ResolvedConfig> {
  const baseBranch = await resolveBaseBranch(io, config.repoRoot);
  const answersContent = String(await io.readFile(join(config.repoRoot, config.answersPath)));
  const briefTemplate = String(await io.readFile(BRIEF_TEMPLATE_PATH));
  return { ...config, baseBranch, answersContent, briefTemplate };
}

/** Crash recovery: retries a prior run's pending state commit before any new work. */
async function retryPendingCommit(resolved: ResolvedConfig, io: LoopIO): Promise<void> {
  const pending = io.readPendingCommit();
  if (!pending) return;
  const retryResult = await commitState(pending.files, pending.title, githubConfigFor(resolved, pending.card), io);
  if (retryResult.outcome === 'merged') {
    io.clearPendingCommit();
  }
}

/** One D5′ park-and-continue pass over the campaign: derive-and-act until `done`, STOP, or
 * the --max-cards budget is spent. [move the existing attempted/worked doc comments here] */
async function runPass(state: CampaignState, resolved: ResolvedConfig, io: LoopIO): Promise<LoopResult> {
  const processed: CardOutcome[] = [];
  const attempted = new Set<string>();
  let worked = 0;
  const limit = resolved.maxCards ?? Infinity;

  while (worked < limit) {
    // ... existing while-body moved VERBATIM (lines 924-974), with `config.` → `resolved.` ...
  }

  return { exitCode: computeExitCode(processed), processed };
}
```

and `runLoop` shrinks to:

```ts
export async function runLoop(config: RunLoopConfig, io: LoopIO): Promise<LoopResult> {
  if (config.dryRun) {
    return runDryRun(config, io);
  }

  const lockResult = acquireLock(io);
  if (!lockResult.ok) {
    return { exitCode: EXIT_LOCKED, processed: [], message: lockResult.reason };
  }

  try {
    const stopped = startupStopResult(config, io);
    if (stopped) return stopped;

    const resolved = await resolveRunContext(config, io);
    await retryPendingCommit(resolved, io);

    const state = await loadState(() => io.readFile(join(config.repoRoot, config.statePath)));
    const result = await runPass(state, resolved, io);
    // W-F5 comment moves here verbatim (flush blocked-status reconciliation).
    persistLocalState(state, resolved, io);
    return result;
  } finally {
    releaseLock(io);
  }
}
```

Note the two in-loop `config.` references (`stopFilePathOf(config)` line 924, `filteredNextCard(state, config, …)` line 928, `config.maxCards` line 916) become `resolved.` — `ResolvedConfig extends RunLoopConfig`, so this is type-identical.
- [ ] **Step 3: Verify.** `bun run check` — Expected: lint clean, typecheck clean, all tests pass with the SAME count as Step 1 (extraction is invisible to callers).
- [ ] **Step 4: Commit.** `git add loop.ts && git commit -m "[runner-loop-readability] refactor: Extract runLoop into named single-purpose steps"`

### Task 9: `CardCtx` parameter object

**Files:**
- Modify: `loop.ts` — `escalateCard` (562), `shipCard` (595), `buildSessionIOForCard` (660), `performRevertAndRedo` (692), `runCardSession` (720), `actOnCard` (763), + their call sites in `runPass`/`actOnCard`

**Interfaces:**
- Produces (module-private): `interface CardCtx { cardId: string; state: CampaignState; resolved: ResolvedConfig; io: LoopIO }`. `card` is NEVER threaded as a parameter — each function derives `ctx.state.cards[ctx.cardId]` at point of use (the derived-value rule: `card` and `state.cards[cardId]` must stay one object).

- [ ] **Step 1: Add the interface** above `escalateCard`:

```ts
/** The per-card working set threaded through every card-scoped function. `card` is
 * deliberately NOT a member: it is always derived as `ctx.state.cards[ctx.cardId]` at point
 * of use, so the invariant "card IS the state entry" holds by construction (a separately
 * threaded `card` invites a `{...card}` copy that silently never persists). */
interface CardCtx {
  cardId: string;
  state: CampaignState;
  resolved: ResolvedConfig;
  io: LoopIO;
}
```

- [ ] **Step 2: Rewrite the six signatures** (bodies keep their exact logic; destructure at the top):

```ts
async function escalateCard(ctx: CardCtx, reason: string, detail: string): Promise<CardOutcome> {
  const { cardId, state, resolved, io } = ctx;
  // body unchanged from here (it already derives `const card = state.cards[cardId];`)
```
```ts
async function shipCard(ctx: CardCtx, verifyResult: VerifyResult): Promise<CardOutcome> {
  const { cardId, state, resolved, io } = ctx;
  const card = state.cards[cardId];
  // rest of body unchanged (was the `card` param — same object, now derived)
```
```ts
function buildSessionIOForCard(ctx: CardCtx): SessionIO {
  const { cardId, state, resolved, io } = ctx;
  const card = state.cards[cardId];
```
```ts
async function performRevertAndRedo(ctx: CardCtx): Promise<void> {
  const { cardId, state, resolved, io } = ctx;
  const card = state.cards[cardId];
```
```ts
async function runCardSession(ctx: CardCtx, phase: CardPhase): Promise<SessionResult> {
  const { cardId, state, resolved, io } = ctx;
  const card = state.cards[cardId];
  const sessionConfig = sessionConfigFor(cardId, resolved);
```
```ts
async function actOnCard(ctx: CardCtx, phase: CardPhase): Promise<CardOutcome> {
  const { cardId, state, resolved, io } = ctx;
  const card = state.cards[cardId];
```

- [ ] **Step 3: Update call sites.** Inside `actOnCard`: `shipCard(ctx, result)`, `escalateCard(ctx, 'verify_failed_twice', formatVerifyFailure(result))`, `escalateCard(ctx, 'needs_direction', sessionResult.finalText)`, `performRevertAndRedo(ctx)`, `runCardSession(ctx, phase)`. Inside `runCardSession`: `buildSessionIOForCard(ctx)` (both sites). Inside `runPass`: build once per tick —

```ts
      const ctx: CardCtx = { cardId: nc.cardId, state, resolved, io };
```

then `escalateCard(ctx, 'planning_needed', \`Missing on disk: ${nc.missing.join(', ')}\`)` and `actOnCard(ctx, phase)`.
- [ ] **Step 4: Verify.** `bun run check` — Expected: clean, same test count. (TS7 `strict` will catch any missed call site as a compile error — the compiler is the refactor harness here.)
- [ ] **Step 5: Commit.** `git add loop.ts && git commit -m "[runner-loop-readability] refactor: Bundle card-scoped parameters into CardCtx"`

### Task 10: One home for the `DerivePhaseConfig` literal

**Files:**
- Modify: `loop.ts` — `runDryRun` (843-847) and `runPass` (the moved 949-953 block)

- [ ] **Step 1: Add the helper** next to `DerivePhaseConfig`'s other users:

```ts
function derivePhaseConfigOf(config: RunLoopConfig): DerivePhaseConfig {
  return {
    repoRoot: config.repoRoot,
    escalationsDir: config.escalationsDir,
    includeEscalated: config.includeEscalated,
  };
}
```

- [ ] **Step 2: Replace both inline literals** with `derivePhaseConfigOf(config)` (runDryRun) / `derivePhaseConfigOf(resolved)` (runPass).
- [ ] **Step 3: Verify + commit.** `bun run check` clean → `git add loop.ts && git commit -m "[runner-loop-readability] refactor: Deduplicate DerivePhaseConfig construction"`

### Task 11: Delete the dead `maxTurns` plumbing

Reachability check (verified): no `--max-turns` CLI flag exists, no README row, `RunLoopConfig.maxTurns` is set by zero callers — it is `undefined` on every real path, so deletion is runtime-neutral (lesson L6: settable in zero places → delete).

**Files:**
- Modify: `loop.ts:354` (field), `loop.ts:683` (mapping), `session.ts:43-44` (`RunSessionConfig.maxTurns`), `session.ts:90` (`PinnedSessionOptions.maxTurns`), `session.ts:110` (`maxTurns: config.maxTurns,`), `session.test.ts:70,82`

- [ ] **Step 1: See the test that pins it.** `bun test session.test.ts` — pass; note the case at line 70 (`fixtureConfig({ maxTurns: 12 })` … `expect(options.maxTurns).toBe(12)`).
- [ ] **Step 2: Delete** all six sites: the two `loop.ts` lines, the three `session.ts` lines (field + doc comment each), and in `session.test.ts` remove `maxTurns: 12` from the fixture call and the `expect(options.maxTurns).toBe(12);` assertion (keep the rest of that test — it still pins the other §D1 options).
- [ ] **Step 3: Verify.** `bun run check` — Expected: clean; test count drops by 0 (an assertion was removed, not a test).
- [ ] **Step 4: Commit.** `git add -A && git commit -m "[runner-loop-readability] refactor: Delete unreachable maxTurns plumbing"`

### Task 12: CU2 close-out

- [ ] **Step 1: Full gate.** `bun run check` — Expected: lint clean, typecheck clean, all tests pass, 0 fail.
- [ ] **Step 2: Update the local C3 ADR** from Task 7 (or add a note) recording the readability pass + the parameter-object and derived-card rules as this package's conventions. Do NOT stage `.c3/`.
- [ ] **Step 3: Push + PR.** `git push -u origin feat/runner-loop-readability`; `gh pr create --title "[runner-loop-readability] Make runLoop read as a flat sequence of named steps" --body ...` — ≤3-sentence description; design bullets: CardCtx bundling, card derived-not-threaded, maxTurns deleted as unreachable.
- [ ] **Step 4: Regular merge** (never squash) after review; verify the merge commit has 2 parents.

---

## Self-Review (done at authoring time)

- **Coverage:** flat+convention ruling → no-folder design (header, Task 5/6); kanna purity hard rule → Task 6 (imports + AST selectors + max-warnings=0) and Task 1 guard test; EXIT backward edge → Task 2; transitive SDK hole → Task 3; brief/run purity → Tasks 4/5; loop readability findings #1/#2/#3/#6 → Tasks 8/9/10; dead plumbing #4 → Task 11; invariants-as-tests #5 → Tasks 1+6.
- **Type consistency:** `executorBrief(card, state, answersContent, template)` used identically in Tasks 4/8; `ResolvedConfig.briefTemplate` defined Task 4, consumed Task 8; `CardCtx` names match across Task 9's six rewrites; `buildRealIo(config: RunLoopConfig): LoopIO` matches run.ts's existing call `buildRealIo(parsed.config)`.
- **Placeholder scan:** the only intentionally non-verbatim block is `runPass`'s while-body ("moved VERBATIM" from loop.ts:924-974 with `config.`→`resolved.`) — a move instruction with source lines, not a TBD.
