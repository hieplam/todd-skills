# Campaign Runner Implementation Plan (tribe plugin)

> **For the implementing session (this repo, todd-skills):** TDD per task (failing test →
> implement → gates → commit). Design decisions live in
> `docs/superpowers/specs/2026-07-16-campaign-runner-design.md` — do not re-open them. The
> WHY (measured context costs, lessons, rejected alternatives, corrected SDK facts) lives in
> `docs/superpowers/specs/2026-07-16-campaign-runner-context.md` — read it first if you are
> tempted to change the architecture. The runner is a **stateless capability of the tribe
> plugin** (`plugins/tribe/scripts/runner/`): no repo, path, model, or campaign value is hardcoded —
> everything environment-specific arrives as a CLI input (spec §2 table). The tribe change is
> governed by this repo's C3 (`c3-215-tribe`) — record it as a change-unit, CLI-only.

**Goal:** `bun plugins/tribe/scripts/runner/run.ts --repo <target> --state <path> [...]` executes
staged roadmap cards sequentially — one fresh Agent-SDK executor session per card,
script-verified SHIPPED, state committed to the target repo's master — resumable after any
crash/stop, escalating to the human instead of deciding.

**Commit convention (this repo's style):** `feat(tribe): campaign runner — <task summary>`;
no Co-Authored-By, no attribution footer.

## Global constraints

- Loop logic is pure TypeScript — every function that touches the world (`gh`, `git`, SDK)
  goes through an injected `exec`/`spawnSession` seam so unit tests mock it (test-first
  rule).
- No LLM calls from the script itself. The only model usage is inside spawned sessions.
- SDK options pinned in ONE module (`session.ts`), exactly the spec §D1 block:
  `systemPrompt` preset `claude_code`, `settingSources: ['project']`,
  `plugins: [{type:'local', path: TRIBE_PLUGIN_DIR}]` (self-referencing this plugin's dir),
  `permissionMode: 'bypassPermissions'` + `allowDangerouslySkipPermissions: true`,
  `maxTurns`, `abortController`, `executable: 'bun'`.
- State schema versioned (`"v": 1`); reader rejects unknown major versions.
- This repo has NO root package.json — the runner gets a **plugin-local** one
  (`plugins/tribe/scripts/runner/package.json`); tests run with **`bun test`** (built-in, no vitest
  dependency to scaffold).

### Task 1: Scaffold + dependency

Files: `plugins/tribe/scripts/runner/{run.ts,loop.ts,state.ts,verify.ts,github.ts,session.ts,brief.ts,types.ts}`
(empty exports), `plugins/tribe/scripts/runner/package.json` (`@anthropic-ai/claude-agent-sdk` +
`zod` dependencies; `"test": "bun test"`), `tsconfig.json`. Gate: `bun install`,
`bun test` (empty suite passes), `bunx tsc --noEmit`. Commit (1/7).

### Task 2: `state.ts` — schema, load, next-card

- Types per spec §D2 (zod schema; parse + version check; **`baseSha` field included**;
  schema-lock path list and owner-only escalation list are campaign config fields).
- `loadState(readFile)` / `serializeState(state)` round-trip; unknown fields preserved.
- `nextCard(state, io)`: first card in `sequence` not `shipped`, skipping `escalated` unless
  `--include-escalated`; returns a `PLANNING_NEEDED` marker when the next card lacks
  spec/plan paths that exist on disk (paths resolved against `--repo`).
- **Seed data is instance data and does NOT live in this repo**: the ai-dict campaign's
  `campaign-state.json` (B5-era cards `shipped` with real PR/sha values, B3 `staged` with
  its real spec/plan paths, B4→A11 `spec: null, plan: null`) lands via a docs PR in ai-dict
  when the campaign resumes — Task 7 smoke consumes it via `--repo/--state`, this repo
  ships only the schema + a test fixture.
- Tests: parse/serialize, nextCard ordering, planning-needed detection, version rejection.
  Commit (2/7).

### Task 3: `verify.ts` — the D3 six-point replay as code

`verifyShipped(card, config, io): Promise<VerifyResult>` where `io.exec` is injected. Checks
per spec §D3: merged, 2 parents, ancestor of origin/master, checks green (incl. D6 flake
classification), worktree/branch gone, schema guard diffing `baseSha..origin/master` over
the config's schema-lock paths honoring `allowsSchemaChange` read from the card plan's YAML
front-matter (**absent front-matter or key ⇒ false**). Returns a structured result naming
every failed point (feeds the escalation file).
Tests: mocked `exec` matrix — happy path, squash detected, red check, sonar-504 signature
classification (docs-only vs code diff), schema-guard violation, missing front-matter
default. Commit (3/7).

### Task 4: `github.ts` — deterministic docs-PR helper

`commitStateAndMerge(files, title, config, io)`: branch `campaign-state/<card>` in the
target repo → commit → push → PR (body per the target repo's PR conventions, e.g. ai-dict's
"Testing performed: docs-only state update") → poll checks with D6 retry policy →
`gh pr merge --merge` → cleanup branch → ff-sync the target repo's local master. Bounded
waits, structured failure (never throws raw — **a failed commit does not invalidate an
escalation**, per D5). Tests with mocked exec: green path, retry-then-green, docs-only sonar
exception, non-advisory red → returns `escalate`, commit-failure path returns
`commit_failed` without throwing. Commit (4/7).

### Task 5: `brief.ts` + `session.ts`

- `brief-template.md` — committed template (the durable replacement for the B5 brief, which
  was never persisted; reconstruct from its known element list): executor mode, plan path on
  the target repo's master, realistic goal from state, walls, target-repo conventions,
  evidence policy, regular-merge order, worker-report path, `SHIPPED <pr> <sha>` /
  `NEEDS_DIRECTION:` terminal contract. `executorBrief(card, state, answersContent)` renders
  it + embeds the `--answers` file content. Snapshot test.
- `runSession({brief, resume?}, config, io)`: wraps SDK `query()` with the pinned §D1
  options; **captures `session_id` from the first `system/init` message and invokes
  `io.onSessionStart(sessionId)` immediately** (state write + log-file naming); streams
  messages to `<logs-dir>/<card>-<sessionId>.log`; returns
  `{ outcome: 'shipped'|'needs_direction'|'error'|'timeout', finalText, pr?, sha? }` parsed
  from the typed `result` message. `io.spawnSession` seam so tests never hit the SDK.
  Tests: init-message capture ordering, result parsing (SHIPPED line, NEEDS_DIRECTION,
  malformed → error), timeout path, resume-attempt failure surfaces as typed error (feeds
  D4 fallback). Commit (5/7).

### Task 6: `loop.ts` + `run.ts` — the loop, resume matrix, escalation

- `deriveCardPhase(card, config, io)`: implements the spec §D4 reality table (gh pr state,
  branch existence, worktree list, escalation file; resumability = **attempt resume via a
  seam-level probe, no listing API**).
- Main loop: **acquire `.runner.lock` (pid + start time; refuse if a live process holds
  it)** → STOP-file check → retry any pending state commit → nextCard → derivePhase → act
  (verify-only | resume-attempt-with-fallback | fresh | exit) → on shipped: verify (Task 3)
  → state update+merge (Task 4) → next. On needs_direction / double verify-fail /
  PLANNING_NEEDED: write `<escalations-dir>/<card>.md`, mark card `escalated`, best-effort
  commit, exit code 2 (**exit code and file stand even if the commit fails**). CLI:
  `--repo`, `--state`, `--model`, `--answers`, `--escalations-dir`, `--logs-dir`,
  `--session-timeout`, `--dry-run` (prints the derived plan, zero side effects), `--cards`
  filter, `--max-cards N`, `--include-escalated`.
- Tests: loop over mocked io — full happy path over two cards, crash-resume from each phase
  row, resume-probe failure → fresh-with-digest, STOP file, lock contention, escalation
  flow incl. commit-failure, dry-run output. Commit (6/7).

### Task 7: Docs + smoke

- `plugins/tribe/scripts/runner/README.md` (inputs table from spec §2, how to run, resume semantics,
  escalation/answers workflow, STOP + lock files); tribe plugin `README.md` gains a runner
  section; C3 change-unit recorded for `c3-215-tribe` (CLI-only).
- Smoke (requires the ai-dict seed PR from Task 2's note to have landed):
  `bun plugins/tribe/scripts/runner/run.ts --repo <ai-dict> --state docs/superpowers/campaign/campaign-state.json --dry-run`
  (expects: next = B3, phase = fresh). Then the first REAL run with `--cards B3
  --max-cards 1` — B3 ships through the runner end-to-end (this is the acceptance test; a
  human watches the first run).
- Final gate: `bun test`, `bunx tsc --noEmit`, this repo's pre-gate checks if applicable.
  PR; regular merge. Commit (7/7).

## Acceptance (the runner's own realistic goal)

1. `--dry-run` correctly derives phases from live GitHub state with zero side effects.
2. B3 ships end-to-end through the runner with no human input besides starting it.
3. Kill -9 the runner at any point during (2)'s re-run rehearsal → restart resumes without
   duplicate PRs, duplicate sessions, or lost state; a second concurrent start is refused by
   the lock.
4. A forced `NEEDS_DIRECTION` (temporarily corrupt a plan step) produces an escalation file
   and a clean exit — and an answers.md entry + re-run completes the card.
5. The loop process itself consumed 0 LLM tokens (only spawned sessions did).
6. Nothing ai-dict-specific appears in `plugins/tribe/scripts/runner/` source — every campaign value
   flows through the CLI inputs (grep-clean for repo names/paths; the stateless-capability
   wall).
