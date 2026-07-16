# Task 5/7 report — `brief.ts` + `session.ts` + `brief-template.md`

## Environment note (read first)

My worktree's HEAD was at `48d691e` (the pre-runner merge commit) — Tasks 1 and 2 (`b264495`,
`78d2591`) had not yet fast-forwarded into it, so `plugins/tribe/runner/` didn't exist and
`bun install` had nothing to install against. Ran `git merge --ff-only 78d2591` first (a pure
fast-forward — my branch had zero divergent commits, `git merge-base HEAD feat/campaign-runner`
== HEAD) to pick up the scaffold, `types.ts`, and `state.ts` from Tasks 1/2. Then `bun install`
inside `plugins/tribe/runner/`.

## What changed

- `plugins/tribe/runner/brief-template.md` (new) — the committed template: executor mode,
  card/spec/plan, goal, walls (merge policy, target-repo CLAUDE.md/rules, owner-only
  escalations, no-scope-creep), evidence policy, merge order (`gh pr merge --merge`, "NEVER
  squash"), worker-report path, embedded answers section, terminal contract
  (`SHIPPED <pr> <sha>` / `NEEDS_DIRECTION:`). All ten plan-listed elements present.
- `plugins/tribe/runner/brief.ts` — `executorBrief(card, state, answersContent)`: reads the
  template (via `import.meta.dir`, no fs seam needed — it's a static bundled asset, not an
  environment-dependent input) and substitutes `{{CARD_ID}}`, `{{CAMPAIGN}}`, `{{SPEC_PATH}}`,
  `{{PLAN_PATH}}`, `{{GOAL}}`, `{{MERGE_POLICY}}`, `{{OWNER_ONLY_ESCALATIONS}}`,
  `{{REPORT_PATH}}`, `{{ANSWERS_CONTENT}}`. Embeds `answersContent` verbatim.
- `plugins/tribe/runner/session.ts` — `runSession(input, config, io)` wrapping the SDK's
  `query()`; the only module importing `@anthropic-ai/claude-agent-sdk`.
- New test files: `brief.test.ts` (4 tests), `session.test.ts` (11 tests).
- Did NOT touch `types.ts`, `package.json`, `state.ts`, `verify.ts`, `github.ts`, `loop.ts`,
  `run.ts` — confirmed via `git status --short` before commit (only the 5 allowed files show
  as modified/new).

## Exported API

`brief.ts`:
```ts
export interface BriefCard { id: string; spec: string | null; plan: string | null; }
export interface BriefState { campaign: string; mergePolicy: string; ownerOnlyEscalations: string[]; }
export function executorBrief(card: BriefCard, state: BriefState, answersContent: string): string
```

`session.ts`:
```ts
export const TRIBE_PLUGIN_DIR: string; // join(import.meta.dir, '..') — plugins/tribe

export type SessionOutcome = 'shipped' | 'needs_direction' | 'error' | 'timeout';
export interface SessionResult { outcome: SessionOutcome; finalText: string; pr?: number; sha?: string; }

export interface RunSessionInput { brief: string; resume?: string; }
export interface RunSessionConfig {
  repoRoot: string; model: string; maxTurns?: number; sessionTimeoutMs?: number;
  logsDir: string; card: string;
}

export interface SessionMessage { type: string; subtype?: string; session_id?: string; result?: string; [key: string]: unknown; }
export interface SpawnSessionParams { prompt: string; options: PinnedSessionOptions; }

export interface SessionIO {
  spawnSession(params: SpawnSessionParams): AsyncIterable<SessionMessage>;
  onSessionStart(sessionId: string): void;
  appendLog(logPath: string, line: string): void;
}

export interface PinnedSessionOptions {
  cwd: string; model: string;
  systemPrompt: { type: 'preset'; preset: 'claude_code' };
  settingSources: ['project'];
  plugins: Array<{ type: 'local'; path: string }>;
  permissionMode: 'bypassPermissions';
  allowDangerouslySkipPermissions: true;
  maxTurns?: number;
  abortController: AbortController;
  executable: 'bun';
  resume?: string;
}

export function buildSessionOptions(input, config, abortController): PinnedSessionOptions
export function sdkSpawnSession(params: SpawnSessionParams): AsyncIterable<SessionMessage> // wraps real query()
export async function runSession(input: RunSessionInput, config: RunSessionConfig, io: SessionIO): Promise<SessionResult>
```

## The io seam shape (why it's shaped this way)

`SessionIO` has exactly three members, each isolating one piece of world-contact so
`session.test.ts` never touches the real SDK or the filesystem:

- `spawnSession` — replaces a direct call to the SDK's `query()`. Production code gets a real
  implementation via the exported `sdkSpawnSession` (thin wrapper around `query()`, not
  unit-tested itself — it would need the real SDK/network; the option-building and
  message-parsing logic it depends on is fully covered without it, matching how `state.ts`
  leaves the real disk read in `loadState` untested while `parseState`/`nextCard` are fully
  covered through the injected `readFile`/`fileExists` seams).
- `onSessionStart` — the crash-safety hook; invoked the instant the `session_id` is known,
  strictly before any further message (including the eventual `result`) is processed. Task 6's
  loop will presumably wire this to a state write.
- `appendLog` — log writing injected per the brief ("Log writing is injected too"); production
  wiring (`fs.appendFileSync` or similar) belongs to Task 6/`run.ts`, which never needs to know
  the SDK exists — only `session.ts` imports `@anthropic-ai/claude-agent-sdk`.

`session.ts` intentionally does NOT construct the "real" `SessionIO` object (i.e. it doesn't
wire `onSessionStart`/`appendLog` to real state/fs) — that's plumbing for whichever module
(loop.ts/run.ts, Task 6) owns state writes and log-file paths. `session.ts` only exports the
one piece Task 6 cannot build itself without touching the SDK: `sdkSpawnSession`.

## `TRIBE_PLUGIN_DIR` — resolved without hardcoding

```ts
export const TRIBE_PLUGIN_DIR = join(import.meta.dir, '..');
```

`import.meta.dir` (Bun-native, confirmed in `node_modules/bun-types/globals.d.ts:1274-1294`:
"Absolute path to the directory containing the source file... Does not have a trailing
slash") resolves to `.../plugins/tribe/runner` at runtime; `join(..., '..')` walks up one level
to `.../plugins/tribe` — the tribe plugin directory (confirmed to be the plugin root by the
presence of `plugins/tribe/.claude-plugin/plugin.json` and `plugins/tribe/agents/`). No
absolute path or repo name appears in source; `session.test.ts` asserts
`TRIBE_PLUGIN_DIR` doesn't contain `'ai-dict'` and doesn't end in `'runner'` (i.e. it's the
plugin dir, not the runner subdir) as a regression guard against this drifting back to a
hardcoded path.

## The exact §D1 option object pinned (verbatim from `session.ts`)

```ts
{
  cwd: config.repoRoot,
  model: config.model,
  systemPrompt: { type: 'preset', preset: 'claude_code' },
  settingSources: ['project'],
  plugins: [{ type: 'local', path: TRIBE_PLUGIN_DIR }],
  permissionMode: 'bypassPermissions',
  allowDangerouslySkipPermissions: true,
  maxTurns: config.maxTurns,
  abortController,
  executable: 'bun',
  // + resume: input.resume, only when input.resume is set
}
```
This matches spec §D1 field-for-field. `session.test.ts`'s "regression guard against SDK
drift" test captures the object actually passed to `io.spawnSession` and asserts every field
by value (including `plugins` equal to `[{ type: 'local', path: TRIBE_PLUGIN_DIR }]` and
`abortController` being a real `AbortController` instance).

## How I verified the real SDK's shapes (not memory — cited from the installed package)

Installed via `bun install` in `plugins/tribe/runner/`: `@anthropic-ai/claude-agent-sdk@0.3.211`.
Read directly from `node_modules/@anthropic-ai/claude-agent-sdk/sdk.d.ts`:

- `query()` signature — `sdk.d.ts:2544-2547`: `query(_params: { prompt: string |
  AsyncIterable<SDKUserMessage>; options?: Options }): Query`.
- `Options.settingSources?: SettingSource[]` — `sdk.d.ts:1871`; `SettingSource = 'user' |
  'project' | 'local'` — `sdk.d.ts:6476`. Confirms `'project'` is a valid value and the field
  is optional (defaults to `[]` per the design doc's correction).
- `Options.systemPrompt` — `sdk.d.ts:1978-1983`: `string | string[] | { type: 'preset';
  preset: 'claude_code'; append?: string; excludeDynamicSections?: boolean }`. Confirms the
  exact literal shape pinned.
- `Options.plugins?: SdkPluginConfig[]` — `sdk.d.ts:1719-1732`, with the doc example showing
  `{ type: 'local', path: './my-plugin' }` — matches what we pin.
- `Options.permissionMode` / `allowDangerouslySkipPermissions` — `sdk.d.ts:1689-1712`;
  comment on `allowDangerouslySkipPermissions` (line ~1709): "Must be set to `true` when using
  `permissionMode: 'bypassPermissions'`."
- `Options.abortController?: AbortController` — `sdk.d.ts:1288`.
- `Options.executable?: 'bun' | 'deno' | 'node'` — `sdk.d.ts:1419`.
- `Options.resume?: string` — `sdk.d.ts:1762-1764`. Confirmed **no `listSessions()`** export
  relevant to resumability probing — grepped `sdk.d.ts` for `listSessions`/session-id
  discovery APIs; the only session-metadata type is `SDKSessionInfo` used by
  `renameSession`/session-mutation helpers, not a listing/probe API. Resumability is indeed
  probe-by-attempt only, confirming the design doc's D4 correction.
- `SDKSystemMessage` (init) — `sdk.d.ts:4308-4335`: `{ type: 'system'; subtype: 'init'; ...
  session_id: string; ... }`. Confirms `session_id` arrives on this message.
- `SDKResultMessage = SDKResultSuccess | SDKResultError` — `sdk.d.ts:4169-4189`.
  `SDKResultSuccess`: `{ type: 'result'; subtype: 'success'; result: string; session_id:
  string; ... }`. `SDKResultError`: `{ type: 'result'; subtype: 'error_during_execution' |
  'error_max_turns' | 'error_max_budget_usd' | 'error_max_structured_output_retries'; ...
  session_id: string }` (no `result` field on the error variant — confirms `parseResultMessage`
  must branch on `subtype` before reading `.result`, which is what it does).
- `Query extends AsyncGenerator<SDKMessage, void>` — `sdk.d.ts:2240`. Confirms `query()`'s
  return value is directly async-iterable, matching how `sdkSpawnSession` uses it.

## Gates (verbatim)

`bun test` (from `plugins/tribe/runner/`):
```
bun test v1.3.13 (bf2e2cec)

 25 pass
 0 fail
 62 expect() calls
Ran 25 tests across 3 files. [112.00ms]
```
(3 files = `state.test.ts` from Task 2 + this task's `brief.test.ts` + `session.test.ts`, all
green.)

`bunx tsc --noEmit` (from `plugins/tribe/runner/`): clean, no output.

RED proof before implementation:
- `bun test brief.test.ts` before `brief.ts` existed:
  `SyntaxError: Export named 'executorBrief' not found in module '.../brief.ts'` — 1 error, 0
  pass (failed for the right reason: missing feature, not a typo).
- `bun test session.test.ts` before `session.ts` existed:
  `SyntaxError: Export named 'runSession' not found in module '.../session.ts'` — 1 error,
  0 pass.

## Scope check

`git status --short` before commit showed only:
```
 M plugins/tribe/runner/brief.ts
 M plugins/tribe/runner/session.ts
?? plugins/tribe/runner/brief-template.md
?? plugins/tribe/runner/brief.test.ts
?? plugins/tribe/runner/session.test.ts
```
No other tracked file touched; `types.ts`/`package.json`/`state.ts`/`verify.ts`/`github.ts`
untouched (owned by concurrent Task 3/4 worktrees). Grep for stateless-capability violations
(`ai-dict`, `sonnet`, `opus`, `claude-sonnet`, `claude-opus`, absolute `/Users/`/`/home/`
paths) across all 5 new/changed files: the only hit is `session.test.ts`'s own negative
assertion `expect(TRIBE_PLUGIN_DIR).not.toContain('ai-dict')` — a regression guard, not a
real reference.

The plan file (`docs/superpowers/plans/2026-07-16-campaign-runner.md`) has no per-task
`- [ ]` checkboxes to flip (it's prose "### Task N" sections, not a checkbox list) — confirmed
by inspecting Task 1's and Task 2's commits (`b264495`, `78d2591`), neither of which touched
the plan file either. Nothing to tick.

## Commit

Branch: `worktree-agent-a6516173b43e52b1e` (fast-forwarded onto `feat/campaign-runner` @
`78d2591` first — see Environment note above).
