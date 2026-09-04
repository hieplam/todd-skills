# Plan — Mechanical heartbeat: the campaign watchdog (`i74-mechanical-heartbeat`)

**Card:** `i74-mechanical-heartbeat` (GitHub issue #74) · **Campaign:** `gh-issues-2026-09`
**Author:** planning Warchief (How), 2026-09-03. The What/Why is the Shaman's frozen spec; nothing
here reopens it.
**This plan lands at:** `docs/superpowers/plans/2026-09-03-mechanical-heartbeat.md`
**Its spec lands at:** `docs/superpowers/specs/2026-09-02-mechanical-heartbeat-design.md`
(the frozen spec is copied there verbatim, including its §8 amendments, as the delivery
branch's first commit — see Setup step 4)
**Base:** `master` @ `8b73151` · **Report file:**
`~/.tribe/-Users-hip-repo-todd-skills/campaigns/gh-issues-2026-09/reports/i74-mechanical-heartbeat.md`

---

## 0. The How decision, up front

**The watchdog is a subcommand of the existing runner CLI**, invoked as
`bun "$runner_dir/run.ts" watchdog` followed by the flags below. Code lands as pure modules under `plugins/tribe/scripts/runner/core/watchdog/`, one new
adapter, additive `ports/ports.ts` exports, and one dispatch block in
`cli/main.ts` that mirrors the existing `reset-card` subcommand.

Why this and not a sibling `scripts/watchdog/` directory (D74-3 leaves the choice to the Warchief):

| Force | Consequence |
| --- | --- |
| D74-3: "reached via the already-resolved `$runner_dir` (no second resolver)" | `run.ts` is the exact path `skills/orchestrate-campaign/resolve-runner.sh` already proves and `tests/test-fresh-machine.sh` already asserts. A subcommand needs **zero** new resolution, zero new installable, zero `install.sh` change (verified: `bash install.sh --list` counts agents/skills, not scripts). |
| `structure.test.ts` (verified, 248 lines) enforces layout | It walks `core/`, `ports/`, `adapters/`, `cli/` + the root `run.ts` shim. Living inside it means the watchdog's purity is enforced mechanically: `core/**` may not name `fs`/`child_process`/the SDK in any quote form, `process.exit` may appear only in `cli/main.ts`, `process.env` only in `adapters/`, and every `interface *IO`/`*Port` must be declared in `ports/ports.ts`. That is exactly the pure-core discipline the card wants — obtained free instead of re-implemented. |
| Spec §6 step 1: `cd plugins/tribe/scripts/runner && bun test` | One suite, one `package.json`, one `bun.lock`, one `node_modules` — no second dependency tree to warm, and `doctor.sh`'s existing `node_modules` check already covers the watchdog. |
| Spec §2.1 froze watchdog exit codes `0/10/11/1` | They do not collide with the runner's `0..5`, so one entrypoint can carry both exit spaces unambiguously. |
| D74-3: "the runner's core is not modified beyond additive exports" | Every edit to an existing file in this plan is an **append**: new interfaces in `ports/ports.ts`, one new `if (argv[0] === 'watchdog')` block in `cli/main.ts`. No existing symbol changes shape. `bun test`'s 392 existing tests must stay green and unmodified. |
| **`plugins/tribe/scripts/runner/core/types.ts` is one of this campaign's two `schemaLockPaths`** (verified in `campaign-state.json`, alongside `core/state.ts`) | So the watchdog's own vocabulary lands in **`core/watchdog/model.ts`**, and `core/types.ts` is **not touched at all**. This is possible because `ports/ports.ts` needs nothing from that vocabulary — every member of `WatchdogIO` is primitive-typed or uses `LockInfo`/`RunnerHandle`, both declared in `ports/ports.ts` itself. Consequence: this plan schedules **no locked-path change**, needs no `allowsSchemaChange: true` front-matter, and never trips the runner's own D3 `schemaGuard` (ruling UC-3) or the `runner-core-change` owner-only trigger. The runner README's "core/types.ts is home to ALL shared vocabulary" describes the runner's shared kernel; a subcommand's private vocabulary in its own directory is the deliberate, documented deviation, taken for this reason. |

Consequence for reviewers (adjudication material): there is **no** new top-level script, so
`install.sh`, `resolve-runner.sh`, `test-fresh-machine.sh` and `doctor.sh` need no functional
change. Spec §2.2 says `doctor.sh` stays "unchanged unless a new prerequisite exists"; the
watchdog introduces none (bun only, already checked), so **`doctor.sh` is deliberately not
edited** and Task 14 records that in the docs and the PR body.

### 0.1 Frozen How decisions (this plan's own law, resolved from the spec, not invented over it)

Every one of these is a How-level gap the spec's action table does not spell out. They are
frozen here so a Hunter, a Skinner and a Tracker read the same oracle. They are also listed to
the Shaman under §7 "Spec amendments proposed" for ratification into the spec text.

- **W-P1 Precedence: terminal beats STOP; quota beats overload.** A `STOP` file suppresses only
  actions that would *start work* (`launch`, `relaunch`, `wait_until`). A runner that already
  exited 0/2/4/5 has a terminal answer, and that answer is more informative than
  `done:stop_requested`, so the terminal mapping wins. Within exit 3, a rejected quota signal
  outranks an overload signal (a quota wall has a known reset time; a 529 is transient).
- **W-P2 A past or missing `resetsAt` is not a quota signal** (spec §7, verbatim: "Treat as 'no
  signal': crash path (one relaunch); log the raw line in events"). So `quota` is honoured only
  when `resetsAt * 1000 > nowMs`.
- **W-P3 The `rate_limit_event` alone is the quota signal; the `429` result line corroborates but
  is not required.** Oracle direction: **under-detecting quota is the defect this card exists to
  remove** (27 minutes of dead time, fixlist P14); over-waiting is bounded by
  `--max-quota-waits` and always visible as `nextWakeAt` in `status.json`. A `429` result line
  with no rejected `rate_limit_event` is **not** a quota signal (there is no reset time to wait
  for) and falls to the crash path.
- **W-P4 Last line wins.** Real logs carry `status: "allowed"` (×3) and `"allowed_warning"`
  (×2) before the final `"rejected"` (verified in the campaign's own killed log). The parser
  therefore takes the **last** `rate_limit_event` and the **last** `result` in the tail: a
  session that was throttled and recovered has no quota signal.
- **W-P5 `--once` never sleeps.** A tick observes and acts **at most once**: it may `launch`,
  `relaunch` or `attach`-and-return, but it never performs a `wait_until`. A tick that finds a
  pending quota/overload wait records `nextWakeAt` in `status.json` and exits `11` with reason
  `quota_wait_pending` / `overload_backoff_pending` — that is what makes the mode usable from
  cron/launchd later (spec §1.3, D74-6).
- **W-P6 Exit-code observation is fused from two sources.** When the watchdog owns the child it
  uses the child's real exit status. When it *adopted* a runner (D74-7) it uses that run's
  finalized `run.json` `exitCode`; a dead pid with `endedAt: null` is a crash (the runner README
  documents run-record finalization as best-effort and silent, so absence is informative, never
  authoritative). Exit `1` writes no `run.json` at all, so it is only ever observed from a child
  the watchdog owns.
- **W-P7 Bounded waits without ever killing.** Every individual wait the watchdog performs is
  `min(remaining, --poll-seconds)` with `--poll-seconds` ≤ 60 (spec §7). The *total* lifetime of
  the supervised runner is deliberately unbounded, and that is the documented exception to the
  `fail-closed-edges` "every spawn carries a timeout" obligation: G4 freezes the reason — "It
  never kills the runner (the runner's own `--session-timeout` owns that)". This is written as a
  code comment at the spawn seam, per that rule's own escape clause.
- **W-P8 Three new flags beyond spec §2.1's list** (amended in audit round 1, finding M1: a
  third flag was implemented from the start but never declared here), all three protocol
  defaults in the shape of `--stall-minutes`: `--poll-seconds` (default 30, the wake-up slice),
  `--quota-grace-seconds` (default 30, spec §2.1's frozen "`resetsAt` + 30 s" made
  configurable so the G1 integration test runs in seconds instead of a minute), and
  `--max-overload-backoffs` (default 5, bounds 0-100, same shape as `--max-quota-waits` — the
  cap on consecutive overload (5xx) backoffs before the watchdog gives up and exits
  `needs_human`). Defaults reproduce the frozen behaviour exactly. `--remote` joins the
  pass-through set (the runner has it; omitting it silently mis-targets any repo whose upstream
  is not `origin`). `--dry-run` is **rejected** as an unknown flag: a watchdog over a
  zero-side-effect run has nothing to observe.
- **W-P9 The watchdog writes only under `<home>/watchdog/`.** `status.json`, `events.jsonl`, and
  `runner-stdout/<attempt>.log`. Spec §7's risk row is asserted as a test, not a promise.
- **W-P10 Containment realpaths both sides.** `--home` is resolved against cwd, symlink-resolved,
  and required to sit inside `realpath("$HOME/.tribe")` by path *segment* prefix. Realpathing the
  root too is load-bearing on macOS: a throwaway `HOME` under `/var/folders/...` realpaths to
  `/private/var/folders/...`, and a string-prefix check would refuse a legitimate home.

---

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **Purity: core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see
  `plugins/tribe/rules/pure-core.md`).**
- **TDD, one unit of work per task.** Write the failing test, watch it fail, minimal code to
  green, keep the whole suite green, ONE commit. A task that dies mid-flight is discarded
  (`git reset --hard && git clean -fd`) and redone — never salvaged.
- **Every commit message ends with the trailer `Campaign: gh-issues-2026-09` in its final
  paragraph. NO co-author trailers of any kind** (owner rule: never auto-add an agent name as
  co-author).
- **Tick this plan's checkboxes for your task in the SAME commit as the code.** A task commit
  that changes code without ticking its own boxes fails the audit.
- **The 392 existing runner tests stay green and their assertions stay unchanged.** Every edit to
  an existing file is additive (§0's table). If a task appears to require changing an existing
  symbol's shape, stop and report `NEEDS_CONTEXT` — that is an escalation trigger, not a judgment
  call.
- **Never modify a schemaLockPath.** This campaign locks
  `plugins/tribe/scripts/runner/core/state.ts` and `plugins/tribe/scripts/runner/core/types.ts`
  (verified in the campaign state file). No task in this plan touches either; the watchdog's
  vocabulary lives in `core/watchdog/model.ts` precisely so it does not. If a task ever seems to
  need an edit inside one of them, **stop and report `NEEDS_CONTEXT`** — that is a plan-level
  schema declaration and an owner-only trigger (`change-state-schema`, `runner-core-change`),
  never a Hunter's call.
- **Never touch these paths:** `plugins/tribe/scripts/viewer/**` (card #105 owns it), the
  runner's exit codes / state schema / resume matrix, `/Users/hip/repo/todd-skills-wt/
  campaign-live-viewer`, `/Users/hip/repo/todd-skills-wt/clv-a`,
  `/Users/hip/repo/todd-skills-wt/clv-b` (a parallel session owns those worktrees).
- **Never stage the main checkout's dirty files.** `master` in `/Users/hip/repo/todd-skills` has
  uncommitted work — `.vscode/launch.json` (modified), `plugins/tribe/scripts/kanna/
  list-session-ids.sh` (deleted), `plugins/tribe/scripts/viewer/package.json` (modified). The
  delivery worktree is a fresh checkout of `8b73151` and will not contain them; never
  `git add -A` from the main checkout, never `git stash` there.
- **Environment facts.** `bun` 1.3.14, `python3` 3.9.6. **There is no `timeout`, `gtimeout` or
  `setsid` binary on this machine** — never write them into a script or a test; bounded waits are
  hand-rolled poll loops. Every Bash tool call caps at 600 s and must never be backgrounded from
  an agent; the only detached process in this card is the one the documented Stage B one-liner
  starts, exercised by a shell test.
- **Known pre-existing red, out of fence, never "fixed" opportunistically:**
  `plugins/tribe/scripts/tests/test-input-asymmetry.sh` does not even parse (`bash -n` →
  "line 199: unexpected EOF while looking for matching `'`"). Do not run it as a gate, do not
  repair it. **`test-fresh-machine.sh` is NOT red** — verified on `master` @ `8b73151` with the
  dirty tree present: `26 passed, 0 failed`. It is therefore a real gate for this card (Task 12
  runs it) and it needs **no** repair; the dispatch's "1 failing check" did not reproduce, and
  nothing in this card extends it (the watchdog adds no new installable and no new resolver).
- **Measured baselines every task must preserve** (re-verified at Setup step 5):
  - `cd plugins/tribe/scripts/runner && bun test` → `392 pass, 0 fail, 15 files`
  - `cd plugins/tribe/scripts/runner && bunx tsc --noEmit` → clean
  - `bash plugins/tribe/scripts/tests/test-fresh-machine.sh` → `26 passed, 0 failed`
  - `C3X_MODE=agent bash /Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/bin/c3x.sh check`
    → `total: 45`, exactly **2** pre-existing errors (`c3-213`, `c3-216`, both "ungrounded
    derivation in Derived Materials row 1"). Two errors is green for this card; a third is a
    regression.
- **C3 governance is reached only through the skill wrapper** — `C3X_MODE=agent bash` plus
  `/Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/bin/c3x.sh` plus the
  operation.
  `bunx @c3x/cli` is forbidden. `.c3/c3-2-plugins/c3-215-tribe.md` carries a `c3-seal:` —
  hand-editing it breaks the seal; every fact edit goes through an ADR + change-unit
  (`references/change.md`), or `c3x repair` if a seal is already broken.
- **Brief-contracts rule is binding on every dispatch.** Each task below carries its own
  `Oracle`, `Fence by intent`, `Governing quote` and `Adjudication rule` block; the Warchief
  copies that block verbatim into the Hunter's brief. A brief without them is a defective
  dispatch.

---

## Setup (the Warchief does this; not a Hunter task)

```sh
# 1. Isolated worktree off the recorded base commit. Never in todd-skills-wt/clv-* or
#    campaign-live-viewer (a parallel session owns those).
cd /Users/hip/repo/todd-skills
git worktree add /Users/hip/repo/todd-skills-wt/i74-watchdog -b feat/i74-mechanical-heartbeat 8b73151

# 2. The bun-install worktree trap (fixlist P15): node_modules/ is gitignored, so a fresh
#    worktree's runner dir has none and every test fails for the wrong reason.
cd /Users/hip/repo/todd-skills-wt/i74-watchdog/plugins/tribe/scripts/runner && bun install

# 3. Record the base sha for the state file.
git -C /Users/hip/repo/todd-skills-wt/i74-watchdog rev-parse HEAD

# 4. Land the spec (verbatim copy of the frozen Shaman spec, §8 amendments included) and this
#    plan, as the branch's first commit.
cp ~/.tribe/-Users-hip-repo-todd-skills/campaigns/gh-issues-2026-09/specs/2026-09-02-mechanical-heartbeat-design.md \
   docs/superpowers/specs/2026-09-02-mechanical-heartbeat-design.md
cp ~/.tribe/-Users-hip-repo-todd-skills/campaigns/gh-issues-2026-09/planning/i74-mechanical-heartbeat/plan.md \
   docs/superpowers/plans/2026-09-03-mechanical-heartbeat.md

# 5. Re-verify all four baselines in the worktree BEFORE dispatching Task 1.
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
cd /Users/hip/repo/todd-skills-wt/i74-watchdog && bash plugins/tribe/scripts/tests/test-fresh-machine.sh
C3X_MODE=agent bash /Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/bin/c3x.sh check
```

Expected: worktree created, `bun install` completes, `392 pass / 0 fail`, `tsc` silent,
`26 passed, 0 failed`, and `c3x check` failing with exactly the two known errors.

**Waves.** One wave, one worktree, one Hunter in flight at a time. Tasks 1-15 are strictly
sequential: each depends on the vocabulary or file the previous one landed. No sub-plan split.

---

## Task 1: Watchdog vocabulary + `parseWatchdogArgs`

**Files:** `plugins/tribe/scripts/runner/core/watchdog/model.ts` (new) ·
`plugins/tribe/scripts/runner/core/watchdog/args.ts` (new) ·
`plugins/tribe/scripts/runner/core/watchdog/args.test.ts` (new)

**Oracle.** Spec §2.1's "Inputs" paragraph plus this plan's W-P8 are the contract; the runner's
own `parseArgs`/`parseResetCardArgs` (`cli/main.ts`) are the **style** precedent, not the oracle.
Rejecting an unknown flag by name is required; silently ignoring one is the bug. Over-strict
parsing (rejecting a flag the spec never listed) is by design.

**Fence by intent.** No existing file is edited in this task at all: the vocabulary is a NEW
file, `core/watchdog/model.ts`. `core/types.ts` stays byte-identical — it is a schemaLockPath.
`args.ts` performs no I/O of any kind and reads no ambient state.

**Governing quote** — spec §2.1, verbatim:
> **Inputs.** The same three required flags as the runner (`--repo`, `--model`, `--home`) plus
> pass-through of the runner's optional flags (`--cards`, `--max-cards`, `--include-escalated`,
> `--session-timeout`, `--logs-dir`, `--max-concurrent`), and its own: `--follow` | `--once`
> (default `--follow`), `--stall-minutes` (default 30), `--max-quota-waits` (default 6),
> `--max-crash-relaunches` (default 1). No defaults for the three required flags (W1).

**Adjudication rule — REFUTED in advance.**
- "`--poll-seconds` / `--quota-grace-seconds` / `--remote` are not in the spec" — W-P8 declares
  them; defaults reproduce the frozen behaviour.
- "the watchdog should accept `--dry-run` because the runner does" — W-P8 rejects it by design.
- "the watchdog's vocabulary belongs in `core/types.ts`, the documented home of ALL shared
  vocabulary" — REFUTED by §0: that file is a schemaLockPath, and `ports/ports.ts` needs nothing
  from this vocabulary, so the lock costs us nothing to respect.
- "5xx statuses other than 529 are out of scope" — the 529 set lands in Task 3, not here.

**Steps**

- [x] **Step 1: Failing test.** Create `core/watchdog/args.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { parseWatchdogArgs } from './args.ts';

const REQUIRED = ['--repo', '/repo', '--model', 'opus', '--home', '/h/.tribe/k/campaigns/c'];

describe('parseWatchdogArgs', () => {
  test('defaults: follow mode and every protocol default', () => {
    const got = parseWatchdogArgs(REQUIRED);
    if ('error' in got) throw new Error(got.error);
    expect(got.config.mode).toBe('follow');
    expect(got.config.stallMinutes).toBe(30);
    expect(got.config.maxQuotaWaits).toBe(6);
    expect(got.config.maxOverloadBackoffs).toBe(5);
    expect(got.config.maxCrashRelaunches).toBe(1);
    expect(got.config.quotaGraceSeconds).toBe(30);
    expect(got.config.pollSeconds).toBe(30);
    expect(got.config.fallbackModel).toBe(null);
    expect(got.config.rawHome).toBe('/h/.tribe/k/campaigns/c');
    expect(got.config.passthrough).toEqual([]);
  });

  test('every required flag is required, by name', () => {
    for (const flag of ['--repo', '--model', '--home']) {
      const argv = REQUIRED.filter((_, i) => REQUIRED[i - (i % 2)] !== flag || i % 2 === 1);
      const stripped = REQUIRED.slice();
      const at = stripped.indexOf(flag);
      stripped.splice(at, 2);
      const got = parseWatchdogArgs(stripped);
      expect('error' in got && got.error).toBe(`missing required flag: ${flag}`);
      expect(argv.length).toBeGreaterThan(0);
    }
  });

  test('an unknown flag is rejected by name, never ignored', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--dry-run']);
    expect('error' in got && got.error).toBe('unknown flag: --dry-run');
  });

  test('--once and --follow are exclusive, last one is not silently accepted', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--once', '--follow']);
    expect('error' in got && got.error).toBe('--once and --follow are mutually exclusive');
  });

  test('--once selects tick mode', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--once']);
    if ('error' in got) throw new Error(got.error);
    expect(got.config.mode).toBe('once');
  });

  test('runner flags are forwarded verbatim, in argv order', () => {
    const got = parseWatchdogArgs([
      ...REQUIRED, '--cards', 'c1,c2', '--max-cards', '1',
      '--session-timeout', '480m', '--include-escalated', '--max-concurrent', '2',
      '--logs-dir', '/logs', '--remote', 'upstream',
    ]);
    if ('error' in got) throw new Error(got.error);
    expect(got.config.passthrough).toEqual([
      '--cards', 'c1,c2', '--max-cards', '1', '--session-timeout', '480m',
      '--include-escalated', '--max-concurrent', '2', '--logs-dir', '/logs',
      '--remote', 'upstream',
    ]);
  });

  test('numeric flags reject non-positive and non-integer values by name', () => {
    for (const [flag, bad] of [
      ['--stall-minutes', '0'], ['--max-quota-waits', '-1'],
      ['--max-crash-relaunches', 'x'], ['--poll-seconds', '1.5'],
    ] as const) {
      const got = parseWatchdogArgs([...REQUIRED, flag, bad]);
      expect('error' in got && got.error.startsWith(`${flag}:`)).toBe(true);
    }
  });

  test('--poll-seconds is capped at 60 (spec section 7: wake-up loop, never a long sleep)', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--poll-seconds', '61']);
    expect('error' in got && got.error).toBe('--poll-seconds: must be between 1 and 60, got "61"');
  });

  test('--max-crash-relaunches accepts 0 (never relaunch a crash)', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--max-crash-relaunches', '0']);
    if ('error' in got) throw new Error(got.error);
    expect(got.config.maxCrashRelaunches).toBe(0);
  });

  test('--fallback-model is carried, off by default', () => {
    const got = parseWatchdogArgs([...REQUIRED, '--fallback-model', 'sonnet']);
    if ('error' in got) throw new Error(got.error);
    expect(got.config.fallbackModel).toBe('sonnet');
  });

  test('a flag with no value is rejected', () => {
    const got = parseWatchdogArgs(['--repo', '/repo', '--model', 'opus', '--home']);
    expect('error' in got && got.error).toBe('--home requires a value');
  });
});
```

Run `cd plugins/tribe/scripts/runner && bun test core/watchdog/args.test.ts`. Expected: the file
fails to resolve `./args.ts` — that is the red.

- [x] **Step 2: Create the vocabulary** as a new file, `core/watchdog/model.ts` (a leaf core
  module: it imports nothing local, so it is legal under `structure.test.ts` exactly as
  `core/types.ts` is):

```ts
// ---------------------------------------------------------------------------------------
// Campaign watchdog (card i74, spec docs/superpowers/specs/2026-09-02-mechanical-heartbeat-design.md).
// The watchdog's own vocabulary. It deliberately does NOT live in core/types.ts: that file is
// one of this campaign's schemaLockPaths, and nothing in ports/ports.ts needs these types
// (every WatchdogIO member is primitive-typed, or uses LockInfo/RunnerHandle, both declared in
// ports/ports.ts itself). Like core/types.ts, this module imports nothing local.
// ---------------------------------------------------------------------------------------

export const WATCHDOG_EXIT_DONE = 0;
export const WATCHDOG_EXIT_USAGE = 1;
export const WATCHDOG_EXIT_NEEDS_HUMAN = 10;
export const WATCHDOG_EXIT_RUNNING = 11;

export type WatchdogMode = 'once' | 'follow';

export interface WatchdogConfig {
  repoRoot: string;
  model: string;
  /** Exactly as typed on the command line — relative or absolute. Resolved and contained by
   * `core/watchdog/args.ts`'s `resolveHomeArg`/`containHome` at the edge (Task 2). */
  rawHome: string;
  mode: WatchdogMode;
  stallMinutes: number;
  maxQuotaWaits: number;
  maxOverloadBackoffs: number;
  maxCrashRelaunches: number;
  quotaGraceSeconds: number;
  pollSeconds: number;
  fallbackModel: string | null;
  /** The runner's own optional flags, forwarded verbatim in argv order. */
  passthrough: string[];
}

export interface WatchdogCounters {
  quotaWaits: number;
  overloadBackoffs: number;
  crashRelaunches: number;
  lockRelaunches: number;
  fallbackUsed: boolean;
}

export interface WatchdogLimits {
  stallMinutes: number;
  maxQuotaWaits: number;
  maxOverloadBackoffs: number;
  maxCrashRelaunches: number;
  quotaGraceSeconds: number;
}

/** One observed runner pass — from a child the watchdog owns, or from an adopted run.json. */
export interface WatchdogRunObservation {
  runId: string;
  runnerPid: number | null;
  alive: boolean;
  endedAt: string | null;
  newestLogPath: string | null;
  newestLogMtimeMs: number | null;
}

export interface WatchdogObservation {
  nowMs: number;
  mode: WatchdogMode;
  stopFilePresent: boolean;
  lockHolder: { pid: number; alive: boolean } | null;
  run: WatchdogRunObservation | null;
  /** W-P6: the child's real status when owned, else the finalized run.json exitCode. */
  lastExitCode: number | null;
  /** Run present, not alive, run.json never finalized — a crash with no code to read. */
  crashSuspected: boolean;
  /** W-P2: already validated as a FUTURE reset by the edge's clock-free parser + decide(). */
  quota: { resetsAtEpochS: number } | null;
  overload: { apiErrorStatus: number } | null;
  counters: WatchdogCounters;
  limits: WatchdogLimits;
  fallbackModel: string | null;
}

export type WatchdogAction =
  | { kind: 'launch' }
  | { kind: 'attach'; runnerPid: number }
  | { kind: 'wait_until'; untilMs: number; cause: 'quota' | 'overload' }
  | { kind: 'relaunch'; cause: 'quota' | 'overload' | 'crash' | 'lock_free'; model: string | null }
  | {
      kind: 'stall';
      logPath: string | null;
      lastMtimeMs: number | null;
      exit: { status: 'needs_human' | 'running'; reason: 'stalled' };
    }
  | { kind: 'exit'; status: 'done' | 'needs_human' | 'running'; reason: string };

export interface WatchdogStatus {
  v: 1;
  mode: WatchdogMode;
  pid: number;
  home: string;
  startedAt: string;
  updatedAt: string;
  state: string;
  lastAction: string;
  runId: string | null;
  runnerPid: number | null;
  runnerCommand: string[] | null;
  counters: WatchdogCounters;
  nextWakeAt: string | null;
  stall: { logPath: string; lastMtime: string } | null;
  terminal: { status: string; reason: string; exitCode: number } | null;
}

export interface WatchdogEvent {
  at: string;
  action: string;
  detail: Record<string, unknown>;
}
```

- [x] **Step 3: Implement** `core/watchdog/args.ts`:

<!-- Amended in audit round 1 (finding F1): value-taking flags now refuse a flag-shaped value. -->

```ts
/**
 * Pure CLI parsing for the `watchdog` subcommand (card i74, spec §2.1). No I/O, no clock, no
 * ambient env — mirrors cli/main.ts's `parseArgs`/`parseResetCardArgs` contract: every unknown
 * flag is rejected BY NAME, the three environment-specific flags have no default, and every
 * protocol value carries the spec's own default.
 */
import type { WatchdogConfig, WatchdogMode } from './model.ts';

export interface ParseWatchdogArgsResult { config: WatchdogConfig }
export interface ParseWatchdogArgsError { error: string }

/** Runner flags forwarded verbatim (spec §2.1 + W-P8's `--remote`). `--dry-run` is absent on
 * purpose: a watchdog over a zero-side-effect run has nothing to observe. */
const PASSTHROUGH_VALUE_FLAGS = new Set([
  '--cards', '--max-cards', '--session-timeout', '--logs-dir', '--max-concurrent', '--remote',
]);
const PASSTHROUGH_BOOLEAN_FLAGS = new Set(['--include-escalated']);
const OWN_VALUE_FLAGS = new Set([
  '--repo', '--model', '--home', '--stall-minutes', '--max-quota-waits',
  '--max-overload-backoffs', '--max-crash-relaunches', '--quota-grace-seconds',
  '--poll-seconds', '--fallback-model',
]);
const OWN_BOOLEAN_FLAGS = new Set(['--once', '--follow']);

/** Every recognized flag token, own or passthrough, value-taking or boolean — used to refuse a
 * value-taking flag being handed another flag's token as its "value" (audit F1): without this,
 * `--fallback-model --once` would silently swallow `--once` as the fallback model string and
 * leave `mode` at its default, with zero error. */
const ALL_FLAG_TOKENS = new Set<string>([
  ...PASSTHROUGH_VALUE_FLAGS, ...PASSTHROUGH_BOOLEAN_FLAGS, ...OWN_VALUE_FLAGS, ...OWN_BOOLEAN_FLAGS,
]);

interface Bound { min: number; max: number }
const BOUNDS: Record<string, Bound> = {
  '--stall-minutes': { min: 1, max: 24 * 60 },
  '--max-quota-waits': { min: 0, max: 100 },
  '--max-overload-backoffs': { min: 0, max: 100 },
  '--max-crash-relaunches': { min: 0, max: 100 },
  '--quota-grace-seconds': { min: 0, max: 3600 },
  // Spec §7: "it sleeps in small wake-up loops (<=60 s)" — the cap is the contract, not taste.
  '--poll-seconds': { min: 1, max: 60 },
};

// A plain non-negative decimal integer literal — no sign, no whitespace, no hex/scientific
// notation, never empty (audit F2: `Number(raw)` alone silently coerces "", "0x10", "3e1" and
// " 5 " into valid integers; the contract's direction is strictness, never leniency).
const INT_LITERAL = /^\d+$/;

function parseBoundedInt(flag: string, raw: string): number | string {
  const bound = BOUNDS[flag] as Bound;
  if (!INT_LITERAL.test(raw)) {
    return `${flag}: must be between ${bound.min} and ${bound.max}, got "${raw}"`;
  }
  const value = Number(raw);
  if (value < bound.min || value > bound.max) {
    return `${flag}: must be between ${bound.min} and ${bound.max}, got "${raw}"`;
  }
  return value;
}

export function parseWatchdogArgs(argv: string[]): ParseWatchdogArgsResult | ParseWatchdogArgsError {
  const own = new Map<string, string | true>();
  const passthrough: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (!token.startsWith('--')) return { error: `unexpected argument: ${token}` };

    if (PASSTHROUGH_BOOLEAN_FLAGS.has(token)) { passthrough.push(token); continue; }
    if (PASSTHROUGH_VALUE_FLAGS.has(token)) {
      const value = argv[i + 1];
      if (value === undefined) return { error: `${token} requires a value` };
      if (ALL_FLAG_TOKENS.has(value)) {
        return { error: `${token} requires a value, got flag "${value}"` };
      }
      passthrough.push(token, value);
      i += 1;
      continue;
    }
    if (OWN_BOOLEAN_FLAGS.has(token)) { own.set(token, true); continue; }
    if (OWN_VALUE_FLAGS.has(token)) {
      const value = argv[i + 1];
      if (value === undefined) return { error: `${token} requires a value` };
      if (ALL_FLAG_TOKENS.has(value)) {
        return { error: `${token} requires a value, got flag "${value}"` };
      }
      own.set(token, value);
      i += 1;
      continue;
    }
    return { error: `unknown flag: ${token}` };
  }

  for (const flag of ['--repo', '--model', '--home']) {
    if (!own.has(flag)) return { error: `missing required flag: ${flag}` };
  }
  if (own.has('--once') && own.has('--follow')) {
    return { error: '--once and --follow are mutually exclusive' };
  }
  const mode: WatchdogMode = own.has('--once') ? 'once' : 'follow';

  const numbers: Record<string, number> = {
    '--stall-minutes': 30,
    '--max-quota-waits': 6,
    '--max-overload-backoffs': 5,
    '--max-crash-relaunches': 1,
    '--quota-grace-seconds': 30,
    '--poll-seconds': 30,
  };
  for (const flag of Object.keys(numbers)) {
    const raw = own.get(flag);
    if (typeof raw !== 'string') continue;
    const parsed = parseBoundedInt(flag, raw);
    if (typeof parsed === 'string') return { error: parsed };
    numbers[flag] = parsed;
  }

  const fallbackRaw = own.get('--fallback-model');
  return {
    config: {
      repoRoot: own.get('--repo') as string,
      model: own.get('--model') as string,
      rawHome: own.get('--home') as string,
      mode,
      stallMinutes: numbers['--stall-minutes'] as number,
      maxQuotaWaits: numbers['--max-quota-waits'] as number,
      maxOverloadBackoffs: numbers['--max-overload-backoffs'] as number,
      maxCrashRelaunches: numbers['--max-crash-relaunches'] as number,
      quotaGraceSeconds: numbers['--quota-grace-seconds'] as number,
      pollSeconds: numbers['--poll-seconds'] as number,
      fallbackModel: typeof fallbackRaw === 'string' ? fallbackRaw : null,
      passthrough,
    },
  };
}
```

- [x] **Step 4: Gates.**

```sh
cd plugins/tribe/scripts/runner
bun test core/watchdog/args.test.ts
bun test
bunx tsc --noEmit
```

Expected: the new file's tests pass; the full suite reports `404 pass, 0 fail` (392 baseline +
12 new); `tsc` prints nothing; `structure.test.ts` stays green (proving `core/watchdog/args.ts`
names no world module and declares no `*IO`/`*Port`).

- [x] **Step 5: Commit** — `feat(runner): watchdog vocabulary and CLI parsing (task 1/15)`, with
  this task's boxes ticked in the same commit and the trailer `Campaign: gh-issues-2026-09`.

---

## Task 2: `--home` resolution and containment (fail-closed edge)

**Files:** `core/watchdog/args.ts` (append) · `core/watchdog/args.test.ts` (append)

**Oracle.** Spec §8's `fixtures-mirror-reality` and `fail-closed-edges` rows, plus W-P10. A
refusal must be a typed message, never a thrown stack trace; a `--home` outside
`realpath("$HOME/.tribe")` and a `--home` with no `campaign-state.json` are both refusals. Under-
containment (letting an escape through) is the bug; over-refusal of an exotic-but-contained path
is the lesser evil, and must be reported rather than worked around.

**Fence by intent.** The containment *decision* is pure and takes the root as an argument; only
symlink resolution and the existence probe happen at the edge (Task 7 wires them).

**Governing quote** — spec §8, verbatim:
> **fail-closed edges** (every spawn has a timeout; narrow catches; the watchdog refuses a
> `--home` outside `$HOME/.tribe` or missing `campaign-state.json` with a typed message, never a
> stack trace)

and `plugins/tribe/rules/fail-closed-edges.md` obligation 4, verbatim:
> **A path from outside is contained before it is used.** Any path read from a manifest,
> config, or user input is resolved and proven to sit inside its declared root — no `..`
> escape, no absolute path, no symlink that leaves the tree — *before* anything opens, writes,
> or deletes through it.

**Adjudication rule — REFUTED in advance.**
- "containment should use `path.resolve`/`realpathSync` here" — that is I/O; `core/**` may not
  name `node:fs` at all (`structure.test.ts`). The edge realpaths and passes strings in.
- "a string prefix check is simpler" — W-P10: it breaks on macOS `/var` → `/private/var` and on
  a sibling directory like `.tribe-old`. Segment comparison is required.
- "the existence check for `campaign-state.json` belongs in this pure module" — no; the pure
  function returns the path, the edge probes it (Task 7).

**Steps**

- [x] **Step 1: Failing test** — append to `core/watchdog/args.test.ts`:

```ts
import { containHome, resolveHomeArg } from './args.ts';

describe('resolveHomeArg (pure, no fs)', () => {
  test('an absolute home is normalized and returned', () => {
    expect(resolveHomeArg('/h/.tribe/k/campaigns/c/', '/anywhere')).toBe('/h/.tribe/k/campaigns/c');
  });
  test('a relative home resolves against cwd — the shape a person actually types', () => {
    expect(resolveHomeArg('campaigns/c', '/h/.tribe/k')).toBe('/h/.tribe/k/campaigns/c');
  });
  test('dot segments collapse', () => {
    expect(resolveHomeArg('./a/../b', '/h/.tribe/k')).toBe('/h/.tribe/k/b');
  });
});

describe('containHome (pure, root supplied by the edge)', () => {
  const ROOT = '/private/var/folders/xy/T/home/.tribe';

  test('a home inside the root is accepted', () => {
    expect(containHome(`${ROOT}/k/campaigns/c`, ROOT)).toEqual({ ok: true });
  });
  test('the root itself is refused — a campaign home is never the root', () => {
    const got = containHome(ROOT, ROOT);
    expect(got.ok).toBe(false);
    expect(!got.ok && got.error).toContain('is the tribe root itself');
  });
  test('a path outside the root is refused with a typed message naming both paths', () => {
    const got = containHome('/tmp/elsewhere/campaigns/c', ROOT);
    expect(got.ok).toBe(false);
    expect(!got.ok && got.error).toBe(
      'watchdog: --home "/tmp/elsewhere/campaigns/c" is outside the tribe root ' +
        `"${ROOT}" — a campaign home always lives under it (see tribe-home.sh)`,
    );
  });
  test('a sibling directory sharing a name prefix is refused (segment compare, not string)', () => {
    expect(containHome(`${ROOT}-old/k/campaigns/c`, ROOT).ok).toBe(false);
  });
  test('a traversal escape is refused after normalization', () => {
    expect(containHome(resolveHomeArg('../../../etc', `${ROOT}/k/campaigns`), ROOT).ok).toBe(false);
  });
});
```

Run `bun test core/watchdog/args.test.ts`. Expected: red — `containHome`/`resolveHomeArg` are not
exported yet.

- [x] **Step 2: Implement** — append to `core/watchdog/args.ts`:

```ts
import { join, normalize, isAbsolute, sep } from 'node:path';

/** Pure: the `--home` string exactly as typed, resolved against `cwd` when relative and
 * normalized. Symlink resolution is the edge's job (fs is banned in core/**). Trailing
 * separators are dropped so segment comparison below is exact. */
export function resolveHomeArg(rawHome: string, cwd: string): string {
  const joined = isAbsolute(rawHome) ? rawHome : join(cwd, rawHome);
  const normalized = normalize(joined);
  return normalized.length > 1 && normalized.endsWith(sep) ? normalized.slice(0, -1) : normalized;
}

export type ContainHomeResult = { ok: true } | { ok: false; error: string };

/** Pure containment (fail-closed-edges obligation 4). Both arguments are already absolute and
 * symlink-resolved by the caller (W-P10: realpathing the ROOT too is load-bearing — a
 * throwaway HOME under /var/folders realpaths to /private/var/folders, and a string-prefix
 * test would refuse a legitimate home). Compares PATH SEGMENTS, so `<root>-old` is not
 * "inside" `<root>`. */
export function containHome(absHome: string, absTribeRoot: string): ContainHomeResult {
  const home = absHome.split(sep).filter(Boolean);
  const root = absTribeRoot.split(sep).filter(Boolean);
  if (home.length === root.length && home.every((s, i) => s === root[i])) {
    return {
      ok: false,
      error:
        `watchdog: --home "${absHome}" is the tribe root itself — pass a single campaign's ` +
        'home (…/campaigns/<slug>), never the root',
    };
  }
  const inside = home.length > root.length && root.every((segment, i) => home[i] === segment);
  if (!inside) {
    return {
      ok: false,
      error:
        `watchdog: --home "${absHome}" is outside the tribe root "${absTribeRoot}" — ` +
        'a campaign home always lives under it (see tribe-home.sh)',
    };
  }
  return { ok: true };
}
```

- [x] **Step 3: Gates.**

```sh
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
```

Expected: `413 pass, 0 fail` (404 + 9 new); `tsc` silent. The `…/campaigns/<slug>` text inside
the error string is prose in a template literal — it is not a path the code builds.

- [x] **Step 4: Commit** — `feat(runner): contain the watchdog --home to the tribe root (task 2/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 3: The session-log signal parser, on real fixtures

**Files:** `core/watchdog/signals.ts` (new) · `core/watchdog/signals.test.ts` (new) ·
`fixtures/watchdog/quota-real-429.log` (new, copied verbatim) ·
`fixtures/watchdog/allowed-and-warning.log` (new, real lines) ·
`fixtures/watchdog/overload-529.log` (new, derived from the real 429 line) ·
`fixtures/watchdog/README.md` (new, provenance)

**Oracle.** D74-4 + W-P3 + W-P4. The fixture files ARE the oracle for shape; the spec's §1.2
table is the oracle for meaning. **Under-detecting a quota death is the defect this card exists
to remove** (fixlist P14: 27 minutes dead time); over-detecting costs a bounded, visible wait.
A `429` in `api_error_status` is NEVER an overload signal.

**Fence by intent.** `fixtures/watchdog/quota-real-429.log` is a byte-for-byte copy of a real
log — never trimmed, reformatted, or "cleaned". The 529 fixture is the real `result` line with
only the status number changed, and its provenance says so in the README.

**Governing quote** — spec §2.1 action table row, verbatim:
> Runner exited 3, newest log carries `rate_limit_event.status == rejected` with `resetsAt`

and spec §8, verbatim:
> **fixtures mirror reality** (the quota fixture is a real log verbatim; the 529 fixture is the
> real `result` line

**Adjudication rule — REFUTED in advance.**
- "the parser should also require the `429` result line" — W-P3 decides otherwise, on the stated
  error-direction argument.
- "the 529 fixture is synthetic" — it is, deliberately and by the Shaman's own instruction: no
  529 log exists on this machine (verified: `grep -rl 'api_error_status":529' ~/.tribe` returns
  nothing). Provenance is recorded in `fixtures/watchdog/README.md`.
- "reading the whole log is simpler than a tail" — the real killed log is 1.9 MB; the tail bound
  is deliberate, and the truncated-first-line test is what makes it safe.

**Steps**

- [x] **Step 1: Build the fixtures** (commands, run from the worktree root; the source campaign
  home is machine-local and is never committed — only these copies are):

```sh
cd plugins/tribe/scripts/runner
mkdir -p fixtures/watchdog
SRC=~/.tribe/-Users-hip-repo-todd-skills/campaigns/gh-issues-2026-09/runs/2026-09-02T19-06-46-423Z-7bb7/logs

# 1. The quota death, verbatim: the smallest real killed session log (4 lines, 4050 bytes) —
#    system/init, rate_limit_event{status:rejected,resetsAt}, assistant, result{429}.
cp "$SRC/i106-blind-reader-review-79e1f20a-958c-4136-8adf-3407a60cc043.log" \
   fixtures/watchdog/quota-real-429.log

# 2. The non-signals, verbatim from the big real log: status "allowed" and "allowed_warning".
grep -m2 '"status":"allowed_warning"' "$SRC"/i106-blind-reader-review-48eed7ca-*.log \
  > fixtures/watchdog/allowed-and-warning.log
grep -m3 '"status":"allowed"' "$SRC"/i106-blind-reader-review-48eed7ca-*.log \
  >> fixtures/watchdog/allowed-and-warning.log

# 3. The overload death: the real result line with only api_error_status changed, and no
#    rate_limit_event at all (a 529 is not a rate limit).
grep '"type":"result"' fixtures/watchdog/quota-real-429.log \
  | sed 's/"api_error_status":429/"api_error_status":529/' \
  > fixtures/watchdog/overload-529.log

wc -lc fixtures/watchdog/*.log
grep -c 'api_error_status":529' fixtures/watchdog/overload-529.log
```

Expected: `quota-real-429.log` is 4 lines / 4050 bytes; `allowed-and-warning.log` has 5 lines and
no `"rejected"`; `overload-529.log` is 1 line containing exactly one `529` and no
`rate_limit_event`. Then write `fixtures/watchdog/README.md`:

```markdown
# Watchdog fixtures — provenance

`fixtures-mirror-reality` (plugins/tribe/rules): these are real bytes, not convenient shapes.

| File | Provenance |
| --- | --- |
| `quota-real-429.log` | Byte-for-byte copy of a REAL killed session log: campaign `gh-issues-2026-09`, run `2026-09-02T19-06-46-423Z-7bb7`, log `i106-blind-reader-review-79e1f20a-958c-4136-8adf-3407a60cc043.log`, captured 2026-09-02T23:27:43Z. Four lines: `system/init`, `rate_limit_event` with `status: "rejected"` and `resetsAt: 1788392400`, the synthetic-model assistant message, and `result` with `is_error: true`, `api_error_status: 429`. Nothing was stripped; `apiKeySource` in the init line reads `"none"`, so no credential is present. |
| `allowed-and-warning.log` | Real `rate_limit_event` lines from the 1.9 MB sibling log of the same run, carrying `status: "allowed"` and `status: "allowed_warning"`. These are the shapes that must NOT be read as a quota death — that run emitted three `allowed`, two `allowed_warning`, then one `rejected`. |
| `overload-529.log` | DERIVED, not captured: the real `result` line above with `"api_error_status":429` replaced by `529`, and no `rate_limit_event`. No HTTP 529 session log exists on this machine (`grep -rl 'api_error_status":529' ~/.tribe` finds none); spec §8 records the shape from the live 2026-09-03 incident and instructs exactly this derivation. |
```

- [x] **Step 2: Failing test** — `core/watchdog/signals.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseSessionSignals } from './signals.ts';

const FIXTURES = join(import.meta.dir, '..', '..', 'fixtures', 'watchdog');
const read = (name: string) => readFileSync(join(FIXTURES, name), 'utf8');

describe('parseSessionSignals — against real captured logs', () => {
  test('the real killed log yields the quota signal with its epoch resetsAt', () => {
    const got = parseSessionSignals(read('quota-real-429.log'));
    expect(got.quota).toEqual({ resetsAtEpochS: 1788392400 });
    expect(got.overload).toBe(null);
    expect(got.lastResultIsError).toBe(true);
  });

  test('allowed and allowed_warning are not quota deaths', () => {
    const got = parseSessionSignals(read('allowed-and-warning.log'));
    expect(got.quota).toBe(null);
    expect(got.overload).toBe(null);
  });

  test('the 529 result line is an overload signal, and not a quota signal', () => {
    const got = parseSessionSignals(read('overload-529.log'));
    expect(got.overload).toEqual({ apiErrorStatus: 529 });
    expect(got.quota).toBe(null);
  });

  test('a 429 is never an overload signal (W-P3)', () => {
    const got = parseSessionSignals(read('quota-real-429.log'));
    expect(got.overload).toBe(null);
  });

  test('last line wins: rejected then allowed means the session recovered', () => {
    const tail = `${read('quota-real-429.log').trim()}\n${read('allowed-and-warning.log').trim()}\n`;
    expect(parseSessionSignals(tail).quota).toBe(null);
  });

  test('a rejected event with no 429 result is still a quota signal (W-P3)', () => {
    const rejected = read('quota-real-429.log')
      .split('\n')
      .filter((l) => l.includes('"type":"rate_limit_event"'))
      .join('\n');
    expect(parseSessionSignals(rejected).quota).toEqual({ resetsAtEpochS: 1788392400 });
  });

  test('a truncated first line (byte-bounded tail) is skipped, never thrown', () => {
    const full = read('quota-real-429.log');
    const tail = full.slice(200); // mid-JSON cut, exactly what a byte tail produces
    expect(() => parseSessionSignals(tail)).not.toThrow();
    expect(parseSessionSignals(tail).quota).toEqual({ resetsAtEpochS: 1788392400 });
  });

  test('a rejected event with a non-numeric resetsAt is no signal', () => {
    const line = JSON.stringify({
      type: 'rate_limit_event',
      rate_limit_info: { status: 'rejected', resetsAt: null },
    });
    expect(parseSessionSignals(line).quota).toBe(null);
  });

  test('empty input and pure noise are no signal, and never throw', () => {
    for (const input of ['', '\n\n', 'not json at all\n{"unclosed":\n']) {
      expect(parseSessionSignals(input)).toEqual({
        quota: null, overload: null, lastResultIsError: false,
      });
    }
  });

  test('every 5xx overload status is recognized, 429 excluded', () => {
    for (const status of [500, 502, 503, 504, 529]) {
      const line = JSON.stringify({ type: 'result', is_error: true, api_error_status: status });
      expect(parseSessionSignals(line).overload).toEqual({ apiErrorStatus: status });
    }
    const line429 = JSON.stringify({ type: 'result', is_error: true, api_error_status: 429 });
    expect(parseSessionSignals(line429).overload).toBe(null);
  });
});
```

Run `bun test core/watchdog/signals.test.ts`. Expected: red (module missing).

- [x] **Step 3: Implement** `core/watchdog/signals.ts`:

```ts
/**
 * Pure parsing of a session log TAIL into the two signals the watchdog acts on (D74-4).
 * The runner appends one JSON SDK message per line (`adapters/run-io.adapter.ts`'s
 * `appendLog`), so this is line-delimited JSON — but the caller passes a byte-bounded tail,
 * so the first line is routinely truncated mid-JSON. That is expected input, not an error:
 * a line that does not parse is skipped (fail-closed-edges obligation 1 — the catch here is
 * the narrowest possible, around one `JSON.parse`, and converts to "no signal", never a throw).
 *
 * W-P4: the LAST rate_limit_event and the LAST result in the tail decide. Real logs carry
 * `allowed` (x3) and `allowed_warning` (x2) before a final `rejected` (fixtures/watchdog/),
 * so a session that was throttled and recovered must report no quota signal.
 */

export interface SessionSignals {
  /** A REJECTED rate limit with a numeric epoch-seconds reset. Whether that reset is still in
   * the future is a clock question, decided by `decide()` (W-P2), never here. */
  quota: { resetsAtEpochS: number } | null;
  overload: { apiErrorStatus: number } | null;
  lastResultIsError: boolean;
}

/** 429 is deliberately absent: it is the quota shape, and the quota path owns it (W-P3). */
const OVERLOAD_STATUSES = new Set([500, 502, 503, 504, 529]);

export function parseSessionSignals(tail: string): SessionSignals {
  let quota: SessionSignals['quota'] = null;
  let overload: SessionSignals['overload'] = null;
  let lastResultIsError = false;

  for (const raw of tail.split('\n')) {
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof SyntaxError) continue; // truncated tail line — expected
      throw err;
    }

    if (message['type'] === 'rate_limit_event') {
      const info = message['rate_limit_info'];
      const record = info && typeof info === 'object' ? (info as Record<string, unknown>) : {};
      const resetsAt = record['resetsAt'];
      quota =
        record['status'] === 'rejected' && typeof resetsAt === 'number' && Number.isFinite(resetsAt)
          ? { resetsAtEpochS: resetsAt }
          : null;
      continue;
    }

    if (message['type'] === 'result') {
      lastResultIsError = message['is_error'] === true;
      const status = message['api_error_status'];
      overload =
        typeof status === 'number' && OVERLOAD_STATUSES.has(status)
          ? { apiErrorStatus: status }
          : null;
    }
  }

  return { quota, overload, lastResultIsError };
}
```

- [x] **Step 4: Gates.**

```sh
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
git status --short   # only the intended new files; no campaign-home path staged
```

Expected: `423 pass, 0 fail` (413 + 10 new); `tsc` silent; `git status` lists only
`core/watchdog/signals.*` and `fixtures/watchdog/*`.

- [x] **Step 5: Commit** — `feat(runner): parse quota and overload signals from real session logs (task 3/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 4: The pure decision core — the full action table (follow mode)

**Files:** `core/watchdog/decide.ts` (new) · `core/watchdog/decide.test.ts` (new)

**Oracle.** Spec §2.1's frozen action table, as refined by W-P1 (precedence), W-P2 (past reset),
W-P6 (crash with no code) and spec §8's 529 row. The table test below IS the transcription of
that oracle: **48 rows = 6 exit codes × quota present/absent × 529 present/absent × STOP
present/absent.** A row whose expectation the implementation cannot meet is a bug in the
implementation, never in the row.

**Fence by intent.** `decide` is a pure total function: same observation in, same action out,
no clock read, no I/O, no throw. Counters are read, never mutated.

**Governing quote** — spec §2.1, verbatim (the rows this task implements):
> | Runner exited 0 | `exit(done)` — watchdog exit 0 |
> | Runner exited 2 | `exit(needs_human:escalations_pending)` |
> | Runner exited 5 | `exit(needs_human:rulings_unratified)` |
> | Runner exited 4 | `exit(needs_human:error)` |
> | Runner exited 3, newest log carries `rate_limit_event.status == rejected` with `resetsAt` | `wait_until(resetsAt + 30 s)` then `relaunch`; count a quota wait; over cap → `exit(needs_human:quota_cap)` |
> | Runner exited 3, no quota signal | `relaunch` once; second time → `exit(needs_human:session_incomplete)` |
> | Runner exited 1 (lock held by a live process) | `attach` if the holder is alive, else `relaunch` |
> | `STOP` file present | do not launch/relaunch; `exit(done)` with reason `stop_requested` |

and spec §8, verbatim:
> **exit 3 with a 5xx/overload signal in the newest log → backoff-and-relaunch** (30 s, 60 s,
> 120 s, 240 s, 480 s; cap 5, then `needs_human:overloaded`). Distinct counter from quota waits
> and from the crash relaunch.

**Adjudication rule — REFUTED in advance.**
- "STOP should win over exit 2/4/5" — W-P1 decides the other way, with its reason.
- "a past `resetsAt` should still wait" — spec §7 says treat as no signal; W-P2 encodes it.
- "the alive/stall/adopt rows are missing" — Task 5 adds them; this task's `decide` returns
  `attach` for a live runner, which is correct-but-incomplete by design.
- "backoff should be exponential from 1 s" — the schedule is frozen in §8, verbatim.

**Steps**

- [x] **Step 1: Failing test** — `core/watchdog/decide.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { decide, overloadBackoffSeconds } from './decide.ts';
import type { WatchdogObservation } from './model.ts';

const NOW = 1_800_000_000_000; // fixed clock, ms
const FUTURE_RESET_S = Math.floor(NOW / 1000) + 600;

const LIMITS = {
  stallMinutes: 30, maxQuotaWaits: 6, maxOverloadBackoffs: 5,
  maxCrashRelaunches: 1, quotaGraceSeconds: 30,
};
const ZERO = {
  quotaWaits: 0, overloadBackoffs: 0, crashRelaunches: 0, lockRelaunches: 0, fallbackUsed: false,
};

function obs(over: Partial<WatchdogObservation> = {}): WatchdogObservation {
  return {
    nowMs: NOW,
    mode: 'follow',
    stopFilePresent: false,
    lockHolder: null,
    run: {
      runId: '2026-09-03T00-00-00-000Z-aaaa',
      runnerPid: 4242,
      alive: false,
      endedAt: '2026-09-03T00:10:00.000Z',
      newestLogPath: '/h/.tribe/k/campaigns/c/runs/r/logs/card-sid.log',
      newestLogMtimeMs: NOW - 1000,
    },
    lastExitCode: 3,
    crashSuspected: false,
    quota: null,
    overload: null,
    counters: { ...ZERO },
    limits: { ...LIMITS },
    fallbackModel: null,
    ...over,
  };
}

/** One-line encoding of an action, so 48 expectations stay readable. */
function encode(a: ReturnType<typeof decide>): string {
  switch (a.kind) {
    case 'exit': return `exit:${a.status}:${a.reason}`;
    case 'relaunch': return `relaunch:${a.cause}${a.model ? `:${a.model}` : ''}`;
    case 'wait_until': return `wait_until:${a.cause}:${a.untilMs}`;
    case 'attach': return `attach:${a.runnerPid}`;
    case 'stall': return `stall:${a.exit.status}:${a.exit.reason}`;
    case 'launch': return 'launch';
  }
}

const QUOTA_WAIT = `wait_until:quota:${(FUTURE_RESET_S + 30) * 1000}`;
const OVERLOAD_WAIT = `wait_until:overload:${NOW + 30_000}`;

// The oracle, transcribed: every exit code x quota x 529 x STOP. `q`/`o`/`s` present = 1.
const TABLE: Array<[code: number, q: 0 | 1, o: 0 | 1, s: 0 | 1, want: string]> = [
  [0, 0, 0, 0, 'exit:done:runner_done'],
  [0, 0, 0, 1, 'exit:done:runner_done'],
  [0, 0, 1, 0, 'exit:done:runner_done'],
  [0, 0, 1, 1, 'exit:done:runner_done'],
  [0, 1, 0, 0, 'exit:done:runner_done'],
  [0, 1, 0, 1, 'exit:done:runner_done'],
  [0, 1, 1, 0, 'exit:done:runner_done'],
  [0, 1, 1, 1, 'exit:done:runner_done'],

  [1, 0, 0, 0, 'relaunch:lock_free'],
  [1, 0, 0, 1, 'exit:done:stop_requested'],
  [1, 0, 1, 0, 'relaunch:lock_free'],
  [1, 0, 1, 1, 'exit:done:stop_requested'],
  [1, 1, 0, 0, 'relaunch:lock_free'],
  [1, 1, 0, 1, 'exit:done:stop_requested'],
  [1, 1, 1, 0, 'relaunch:lock_free'],
  [1, 1, 1, 1, 'exit:done:stop_requested'],

  [2, 0, 0, 0, 'exit:needs_human:escalations_pending'],
  [2, 0, 0, 1, 'exit:needs_human:escalations_pending'],
  [2, 0, 1, 0, 'exit:needs_human:escalations_pending'],
  [2, 0, 1, 1, 'exit:needs_human:escalations_pending'],
  [2, 1, 0, 0, 'exit:needs_human:escalations_pending'],
  [2, 1, 0, 1, 'exit:needs_human:escalations_pending'],
  [2, 1, 1, 0, 'exit:needs_human:escalations_pending'],
  [2, 1, 1, 1, 'exit:needs_human:escalations_pending'],

  [3, 0, 0, 0, 'relaunch:crash'],
  [3, 0, 0, 1, 'exit:done:stop_requested'],
  [3, 0, 1, 0, OVERLOAD_WAIT],
  [3, 0, 1, 1, 'exit:done:stop_requested'],
  [3, 1, 0, 0, QUOTA_WAIT],
  [3, 1, 0, 1, 'exit:done:stop_requested'],
  [3, 1, 1, 0, QUOTA_WAIT],
  [3, 1, 1, 1, 'exit:done:stop_requested'],

  [4, 0, 0, 0, 'exit:needs_human:error'],
  [4, 0, 0, 1, 'exit:needs_human:error'],
  [4, 0, 1, 0, 'exit:needs_human:error'],
  [4, 0, 1, 1, 'exit:needs_human:error'],
  [4, 1, 0, 0, 'exit:needs_human:error'],
  [4, 1, 0, 1, 'exit:needs_human:error'],
  [4, 1, 1, 0, 'exit:needs_human:error'],
  [4, 1, 1, 1, 'exit:needs_human:error'],

  [5, 0, 0, 0, 'exit:needs_human:rulings_unratified'],
  [5, 0, 0, 1, 'exit:needs_human:rulings_unratified'],
  [5, 0, 1, 0, 'exit:needs_human:rulings_unratified'],
  [5, 0, 1, 1, 'exit:needs_human:rulings_unratified'],
  [5, 1, 0, 0, 'exit:needs_human:rulings_unratified'],
  [5, 1, 0, 1, 'exit:needs_human:rulings_unratified'],
  [5, 1, 1, 0, 'exit:needs_human:rulings_unratified'],
  [5, 1, 1, 1, 'exit:needs_human:rulings_unratified'],
];

describe('decide — the frozen action table, every row', () => {
  test('the table covers 6 exit codes x quota x overload x STOP', () => {
    expect(TABLE.length).toBe(48);
  });

  for (const [code, q, o, s, want] of TABLE) {
    test(`exit ${code} quota=${q} overload=${o} stop=${s} -> ${want}`, () => {
      const action = decide(
        obs({
          lastExitCode: code,
          quota: q ? { resetsAtEpochS: FUTURE_RESET_S } : null,
          overload: o ? { apiErrorStatus: 529 } : null,
          stopFilePresent: s === 1,
        }),
      );
      expect(encode(action)).toBe(want);
    });
  }
});

describe('decide — quota reset validity (W-P2, spec section 7)', () => {
  test('a reset already in the past is no signal: the crash path takes it', () => {
    const action = decide(
      obs({ lastExitCode: 3, quota: { resetsAtEpochS: Math.floor(NOW / 1000) - 10 } }),
    );
    expect(encode(action)).toBe('relaunch:crash');
  });
  test('the grace period is applied to the reset instant', () => {
    const action = decide(
      obs({
        lastExitCode: 3,
        quota: { resetsAtEpochS: FUTURE_RESET_S },
        limits: { ...LIMITS, quotaGraceSeconds: 90 },
      }),
    );
    expect(encode(action)).toBe(`wait_until:quota:${(FUTURE_RESET_S + 90) * 1000}`);
  });
});

describe('decide — a crash with no exit code to read (W-P6)', () => {
  test('dead pid plus unfinalized run.json takes the exit-3 branch', () => {
    const action = decide(obs({ lastExitCode: null, crashSuspected: true }));
    expect(encode(action)).toBe('relaunch:crash');
  });
  test('and honours a quota signal the same way', () => {
    const action = decide(
      obs({ lastExitCode: null, crashSuspected: true, quota: { resetsAtEpochS: FUTURE_RESET_S } }),
    );
    expect(encode(action)).toBe(QUOTA_WAIT);
  });
});

describe('overloadBackoffSeconds — the frozen schedule (spec section 8)', () => {
  test('30, 60, 120, 240, 480 and then clamped at 480', () => {
    expect([0, 1, 2, 3, 4, 5, 9].map(overloadBackoffSeconds)).toEqual([
      30, 60, 120, 240, 480, 480, 480,
    ]);
  });
});
```

Run `bun test core/watchdog/decide.test.ts`. Expected: red (module missing).

- [x] **Step 2: Implement** `core/watchdog/decide.ts`:

```ts
/**
 * The watchdog's PURE decision core (D74-3): `(observation) -> action`. No clock, no fs, no
 * spawn, no throw — every world fact arrives on the observation, so the whole action table is
 * exercised as data (`decide.test.ts`, 48 rows).
 *
 * Precedence (W-P1): a terminal runner exit (0/2/4/5) answers first — it is more informative
 * than `stop_requested`. STOP then suppresses everything that would START work (launch,
 * relaunch, wait). Within exit 3, a rejected quota signal outranks an overload signal: a quota
 * wall has a known reset instant, a 529 is transient.
 */
import type { WatchdogAction, WatchdogObservation } from './model.ts';

/** Spec §8, verbatim: 30 s, 60 s, 120 s, 240 s, 480 s, then clamped. */
const OVERLOAD_BACKOFF_SECONDS = [30, 60, 120, 240, 480];

export function overloadBackoffSeconds(attempt: number): number {
  const index = Math.min(Math.max(attempt, 0), OVERLOAD_BACKOFF_SECONDS.length - 1);
  return OVERLOAD_BACKOFF_SECONDS[index] as number;
}

const STOP: WatchdogAction = { kind: 'exit', status: 'done', reason: 'stop_requested' };

export function decide(o: WatchdogObservation): WatchdogAction {
  // --- 1. A live runner: never launch a second one (D74-7). Task 5 refines with stall/once.
  if (o.run?.alive) {
    return { kind: 'attach', runnerPid: o.run.runnerPid ?? 0 };
  }

  // --- 2. Terminal runner outcomes (W-P1: these outrank a STOP file).
  switch (o.lastExitCode) {
    case 0: return { kind: 'exit', status: 'done', reason: 'runner_done' };
    case 2: return { kind: 'exit', status: 'needs_human', reason: 'escalations_pending' };
    case 4: return { kind: 'exit', status: 'needs_human', reason: 'error' };
    case 5: return { kind: 'exit', status: 'needs_human', reason: 'rulings_unratified' };
    default: break;
  }

  // --- 3. Exit 1: the single-instance lock refused the start.
  if (o.lastExitCode === 1) {
    if (o.lockHolder?.alive) return { kind: 'attach', runnerPid: o.lockHolder.pid };
    if (o.stopFilePresent) return STOP;
    if (o.counters.lockRelaunches >= 1) {
      return { kind: 'exit', status: 'needs_human', reason: 'lock_conflict' };
    }
    return { kind: 'relaunch', cause: 'lock_free', model: null };
  }

  // --- 4. Exit 3, or a crash with no code to read (W-P6): the recoverable deaths.
  if (o.lastExitCode === 3 || (o.lastExitCode === null && o.crashSuspected)) {
    // W-P2: a missing or already-elapsed reset is NOT a quota signal (spec §7).
    const quotaUntilMs =
      o.quota === null ? null : (o.quota.resetsAtEpochS + o.limits.quotaGraceSeconds) * 1000;
    const quotaIsFuture = quotaUntilMs !== null && o.quota !== null
      && o.quota.resetsAtEpochS * 1000 > o.nowMs;

    if (quotaIsFuture) {
      if (o.stopFilePresent) return STOP;
      if (o.counters.quotaWaits >= o.limits.maxQuotaWaits) {
        return { kind: 'exit', status: 'needs_human', reason: 'quota_cap' };
      }
      return { kind: 'wait_until', untilMs: quotaUntilMs as number, cause: 'quota' };
    }

    if (o.overload !== null) {
      if (o.stopFilePresent) return STOP;
      if (o.counters.overloadBackoffs >= o.limits.maxOverloadBackoffs) {
        if (o.fallbackModel !== null && !o.counters.fallbackUsed) {
          return { kind: 'relaunch', cause: 'overload', model: o.fallbackModel };
        }
        return { kind: 'exit', status: 'needs_human', reason: 'overloaded' };
      }
      const seconds = overloadBackoffSeconds(o.counters.overloadBackoffs);
      return { kind: 'wait_until', untilMs: o.nowMs + seconds * 1000, cause: 'overload' };
    }

    if (o.stopFilePresent) return STOP;
    if (o.counters.crashRelaunches >= o.limits.maxCrashRelaunches) {
      return { kind: 'exit', status: 'needs_human', reason: 'session_incomplete' };
    }
    return { kind: 'relaunch', cause: 'crash', model: null };
  }

  // --- 5. Nothing has run yet this invocation.
  if (o.lockHolder?.alive) return { kind: 'attach', runnerPid: o.lockHolder.pid };
  if (o.stopFilePresent) return STOP;
  return { kind: 'launch' };
}
```

- [x] **Step 3: Gates.**

```sh
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
```

Expected: `484 pass, 0 fail` (430 + 55 new: 48 table rows + 7); `tsc` silent.
<!-- Corrected in group-B audit (finding G6): measured, not derived. -->

- [x] **Step 4: Commit** — `feat(runner): pure watchdog decision core over the frozen action table (task 4/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 5: Decision core, part 2 — stall, adopt, caps and `--once`

**Files:** `core/watchdog/decide.ts` (extend) · `core/watchdog/decide.test.ts` (append)

**Oracle.** Spec §2.1's remaining rows plus spec §8's stall amendment ("the stall event names
the log file and its last mtime") and W-P5 (`--once` never sleeps). G4's wall is frozen: **the
watchdog never kills the runner.**

**Fence by intent.** Task 4's 48 rows keep passing with their assertions unchanged. `decide`
stays pure and total.

**Governing quote** — spec §2.1, verbatim:
> | Live runner (lock/pid alive) at start | `attach` (wait on it; never a second launch) |
> | Runner alive, no log mtime change > `--stall-minutes` | record `stall`; `--follow` →
> `exit(needs_human:stalled)`; `--once` → exit `running` with the stall noted |
> | `--once` and runner alive, not stalled | `exit(running)` |

and the card's G4, verbatim:
> It never kills the runner (the runner's own `--session-timeout` owns that).

**Adjudication rule — REFUTED in advance.**
- "`--once` should perform the quota wait so cron ticks are self-healing" — W-P5 decides
  otherwise; the tick records `nextWakeAt` and returns.
- "a stalled runner should be killed / a `stall` action should terminate it" — G4 forbids it,
  verbatim.
- "a runner alive with `newestLogMtimeMs === null` (no log yet) is stalled" — no: a pass that
  has not written its first session log yet is starting, not stalled; treated as fresh.

**Steps**

- [x] **Step 1: Failing test** — append to `core/watchdog/decide.test.ts`:

```ts
const STALE_MS = NOW - 31 * 60 * 1000;

describe('decide — a live runner (follow mode)', () => {
  const alive = (over: Partial<WatchdogObservation> = {}) =>
    obs({
      lastExitCode: null,
      run: {
        runId: 'r', runnerPid: 4242, alive: true, endedAt: null,
        newestLogPath: '/h/logs/card-sid.log', newestLogMtimeMs: NOW - 1000,
      },
      ...over,
    });

  test('a fresh live runner is attached to, never relaunched', () => {
    expect(encode(decide(alive()))).toBe('attach:4242');
  });

  test('a stalled live runner reports the log and exits needs_human in follow mode', () => {
    const action = decide(
      alive({
        run: {
          runId: 'r', runnerPid: 4242, alive: true, endedAt: null,
          newestLogPath: '/h/logs/card-sid.log', newestLogMtimeMs: STALE_MS,
        },
      }),
    );
    expect(encode(action)).toBe('stall:needs_human:stalled');
    expect(action.kind === 'stall' && action.logPath).toBe('/h/logs/card-sid.log');
    expect(action.kind === 'stall' && action.lastMtimeMs).toBe(STALE_MS);
  });

  test('a live runner with no log yet is starting, not stalled', () => {
    const action = decide(
      alive({
        run: {
          runId: 'r', runnerPid: 4242, alive: true, endedAt: null,
          newestLogPath: null, newestLogMtimeMs: null,
        },
      }),
    );
    expect(encode(action)).toBe('attach:4242');
  });

  test('a STOP file never terminates a live runner (G4: never kills)', () => {
    expect(encode(decide(alive({ stopFilePresent: true })))).toBe('attach:4242');
  });
});

describe('decide — caps', () => {
  test('quota waits over cap park for a human', () => {
    const action = decide(
      obs({
        lastExitCode: 3,
        quota: { resetsAtEpochS: FUTURE_RESET_S },
        counters: { ...ZERO, quotaWaits: 6 },
      }),
    );
    expect(encode(action)).toBe('exit:needs_human:quota_cap');
  });

  test('overload backoffs over cap park for a human when no fallback model is configured', () => {
    const action = decide(
      obs({
        lastExitCode: 3, overload: { apiErrorStatus: 529 },
        counters: { ...ZERO, overloadBackoffs: 5 },
      }),
    );
    expect(encode(action)).toBe('exit:needs_human:overloaded');
  });

  test('over cap with --fallback-model, it relaunches once on that tier', () => {
    const action = decide(
      obs({
        lastExitCode: 3, overload: { apiErrorStatus: 529 },
        counters: { ...ZERO, overloadBackoffs: 5 }, fallbackModel: 'sonnet',
      }),
    );
    expect(encode(action)).toBe('relaunch:overload:sonnet');
  });

  test('the fallback is used at most once', () => {
    const action = decide(
      obs({
        lastExitCode: 3, overload: { apiErrorStatus: 529 },
        counters: { ...ZERO, overloadBackoffs: 5, fallbackUsed: true }, fallbackModel: 'sonnet',
      }),
    );
    expect(encode(action)).toBe('exit:needs_human:overloaded');
  });

  test('a second crash relaunch is refused (max 1, D74-5)', () => {
    const action = decide(obs({ lastExitCode: 3, counters: { ...ZERO, crashRelaunches: 1 } }));
    expect(encode(action)).toBe('exit:needs_human:session_incomplete');
  });

  test('a repeated lock conflict parks rather than looping', () => {
    const action = decide(obs({ lastExitCode: 1, counters: { ...ZERO, lockRelaunches: 1 } }));
    expect(encode(action)).toBe('exit:needs_human:lock_conflict');
  });
});

describe('decide — adopt, never duplicate (D74-7)', () => {
  test('a live lock holder is adopted instead of launching', () => {
    const action = decide(
      obs({ run: null, lastExitCode: null, lockHolder: { pid: 777, alive: true } }),
    );
    expect(encode(action)).toBe('attach:777');
  });
  test('a dead lock holder does not block a launch', () => {
    const action = decide(
      obs({ run: null, lastExitCode: null, lockHolder: { pid: 777, alive: false } }),
    );
    expect(encode(action)).toBe('launch');
  });
  test('STOP before anything started means done, with nothing launched', () => {
    const action = decide(obs({ run: null, lastExitCode: null, stopFilePresent: true }));
    expect(encode(action)).toBe('exit:done:stop_requested');
  });
});

// W-P5: a tick observes and acts AT MOST ONCE — it never sleeps.
const ONCE_TABLE: Array<[name: string, over: Partial<WatchdogObservation>, want: string]> = [
  ['exit 3 + quota', { lastExitCode: 3, quota: { resetsAtEpochS: FUTURE_RESET_S } },
    'exit:running:quota_wait_pending'],
  ['exit 3 + quota + STOP',
    { lastExitCode: 3, quota: { resetsAtEpochS: FUTURE_RESET_S }, stopFilePresent: true },
    'exit:done:stop_requested'],
  ['exit 3 + 529', { lastExitCode: 3, overload: { apiErrorStatus: 529 } },
    'exit:running:overload_backoff_pending'],
  ['exit 3 + 529 + STOP',
    { lastExitCode: 3, overload: { apiErrorStatus: 529 }, stopFilePresent: true },
    'exit:done:stop_requested'],
  ['exit 3 + quota + 529',
    { lastExitCode: 3, quota: { resetsAtEpochS: FUTURE_RESET_S }, overload: { apiErrorStatus: 529 } },
    'exit:running:quota_wait_pending'],
  ['exit 3, no signal', { lastExitCode: 3 }, 'relaunch:crash'],
  ['exit 3, no signal + STOP', { lastExitCode: 3, stopFilePresent: true },
    'exit:done:stop_requested'],
  ['exit 0', { lastExitCode: 0 }, 'exit:done:runner_done'],
  ['exit 2', { lastExitCode: 2 }, 'exit:needs_human:escalations_pending'],
  ['alive, fresh log', {
    lastExitCode: null,
    run: { runId: 'r', runnerPid: 42, alive: true, endedAt: null,
           newestLogPath: '/h/l.log', newestLogMtimeMs: NOW - 1000 },
  }, 'exit:running:runner_alive'],
  ['alive, stale log', {
    lastExitCode: null,
    run: { runId: 'r', runnerPid: 42, alive: true, endedAt: null,
           newestLogPath: '/h/l.log', newestLogMtimeMs: STALE_MS },
  }, 'stall:running:stalled'],
  ['nothing running', { run: null, lastExitCode: null }, 'launch'],
];

describe('decide — --once mode never sleeps (W-P5)', () => {
  for (const [name, over, want] of ONCE_TABLE) {
    test(`once: ${name} -> ${want}`, () => {
      expect(encode(decide(obs({ mode: 'once', ...over })))).toBe(want);
    });
  }
});
```

Run `bun test core/watchdog/decide.test.ts`. Expected: red on the stall, once-mode and cap rows;
Task 4's 48 rows still green.

- [x] **Step 2: Implement** — edit `decide.ts`'s section 1 and add the once-mode guards:

```ts
  // --- 1. A live runner: never launch a second one (D74-7). Stall is the only thing that can
  // end the wait, and it NEVER kills the runner (card G4: the runner's own --session-timeout
  // owns that) — it reports, and in follow mode hands the decision to a human.
  if (o.run?.alive) {
    const mtime = o.run.newestLogMtimeMs;
    const stalled = mtime !== null && o.nowMs - mtime > o.limits.stallMinutes * 60_000;
    if (stalled) {
      return {
        kind: 'stall',
        logPath: o.run.newestLogPath,
        lastMtimeMs: mtime,
        exit: { status: o.mode === 'once' ? 'running' : 'needs_human', reason: 'stalled' },
      };
    }
    if (o.mode === 'once') return { kind: 'exit', status: 'running', reason: 'runner_alive' };
    return { kind: 'attach', runnerPid: o.run.runnerPid ?? 0 };
  }
```

and, inside section 4, immediately before each `wait_until` return (W-P5 — a tick records the
pending wake-up and returns; it never sleeps):

```ts
      if (o.mode === 'once') {
        return { kind: 'exit', status: 'running', reason: 'quota_wait_pending' };
      }
```

```ts
        if (o.mode === 'once') {
          return { kind: 'exit', status: 'running', reason: 'overload_backoff_pending' };
        }
```

- [x] **Step 3: Gates.**

```sh
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
```

Expected: `509 pass, 0 fail` (478 + 31 new); Task 4's rows unchanged; `tsc` silent.

- [x] **Step 4: Commit** — `feat(runner): watchdog stall, adopt, caps and --once semantics (task 5/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 6: Pure selectors, status/event shaping and exit-code mapping

**Files:** `core/watchdog/select.ts` (new) · `core/watchdog/status.ts` (new) ·
`core/watchdog/select.test.ts` (new) · `core/watchdog/status.test.ts` (new)

**Oracle.** Spec §2.1's "Outputs" paragraph. `status.json` must carry `nextWakeAt` during a wait
(spec §8: "so a resuming Shaman (or the owner) sees at a glance when work resumes"); the stall
record must name the log file and its last mtime (spec §8). Exit codes are frozen: `0` done,
`10` needs_human, `11` running, `1` usage.

**Fence by intent.** Both modules are pure string/JSON math: no clock (timestamps arrive as
arguments), no fs, no `process`.

**Governing quote** — spec §2.1, verbatim:
> **Outputs.** `<home>/watchdog/status.json` (current state: mode, runner pid, last action,
> counters, `nextWakeAt` during a quota wait, terminal reason) rewritten atomically on every
> change, and `<home>/watchdog/events.jsonl` append-only (one line per action with ISO
> timestamp). Watchdog exit codes: `0` done · `10` needs_human (reason in status.json) ·
> `11` running (`--once` only) · `1` usage error. Stdout: one human line per action; the
> last line names the status file.

**Adjudication rule — REFUTED in advance.**
- "run selection should read `startedAt` out of each `run.json`" — run ids are ISO-prefixed
  (`core/run-record.ts`'s `generateRunId`), so lexicographic max IS chronological max, with no
  file read per candidate.
- "`status.json` should include the whole run record" — no; the viewer (#105) owns run records.

**Steps**

- [x] **Step 1: Failing test** — `core/watchdog/select.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { isStale, newestLog, newestRunId, watchdogPathsOf } from './select.ts';

describe('newestRunId', () => {
  test('run ids are ISO-prefixed, so lexicographic max is chronological max', () => {
    expect(newestRunId([
      '2026-09-02T19-06-46-423Z-7bb7',
      '2026-09-03T00-19-29-351Z-bc5c',
      '2026-09-02T23-41-49-682Z-95ee',
    ])).toBe('2026-09-03T00-19-29-351Z-bc5c');
  });
  test('no runs yields null', () => {
    expect(newestRunId([])).toBe(null);
  });
});

describe('newestLog', () => {
  test('picks the greatest mtime, tie-broken by name for determinism', () => {
    expect(newestLog([
      { name: 'a-1.log', mtimeMs: 10 },
      { name: 'b-2.log', mtimeMs: 30 },
      { name: 'c-3.log', mtimeMs: 30 },
    ])).toEqual({ name: 'c-3.log', mtimeMs: 30 });
  });
  test('an empty logs dir yields null', () => {
    expect(newestLog([])).toBe(null);
  });
});

describe('isStale', () => {
  test('strictly greater than the threshold is stale', () => {
    const now = 1_000 * 60 * 60;
    expect(isStale(now, now - 30 * 60_000, 30)).toBe(false);
    expect(isStale(now, now - 30 * 60_000 - 1, 30)).toBe(true);
  });
  test('a run with no log yet is never stale', () => {
    expect(isStale(1_000, null, 30)).toBe(false);
  });
});

describe('watchdogPathsOf (W-P9: the watchdog writes only under home/watchdog)', () => {
  test('every output path sits under the watchdog directory', () => {
    const p = watchdogPathsOf('/h/.tribe/k/campaigns/c');
    expect(p.dir).toBe('/h/.tribe/k/campaigns/c/watchdog');
    expect(p.status).toBe('/h/.tribe/k/campaigns/c/watchdog/status.json');
    expect(p.events).toBe('/h/.tribe/k/campaigns/c/watchdog/events.jsonl');
    expect(p.runnerStdout(3)).toBe(
      '/h/.tribe/k/campaigns/c/watchdog/runner-stdout/attempt-3.log',
    );
    for (const value of [p.status, p.events, p.runnerStdout(0)]) {
      expect(value.startsWith(`${p.dir}/`)).toBe(true);
    }
  });
});
```

and `core/watchdog/status.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { actionLine, buildStatus, exitCodeOf, serializeEvent, serializeStatus } from './status.ts';
import type { WatchdogAction, WatchdogCounters } from './model.ts';

const COUNTERS: WatchdogCounters = {
  quotaWaits: 1, overloadBackoffs: 0, crashRelaunches: 0, lockRelaunches: 0, fallbackUsed: false,
};

describe('exitCodeOf — the frozen exit codes', () => {
  test('done 0, needs_human 10, running 11', () => {
    const codes = (['done', 'needs_human', 'running'] as const).map((status) =>
      exitCodeOf({ kind: 'exit', status, reason: 'r' }));
    expect(codes).toEqual([0, 10, 11]);
  });
});

describe('buildStatus / serializeStatus', () => {
  test('a quota wait publishes nextWakeAt (spec section 8)', () => {
    const status = buildStatus({
      config: { mode: 'follow' },
      pid: 99, home: '/h/.tribe/k/campaigns/c',
      startedAt: '2026-09-03T10:00:00.000Z', updatedAt: '2026-09-03T10:00:05.000Z',
      state: 'quota_wait', lastAction: 'wait_until:quota',
      runId: 'r1', runnerPid: null, runnerCommand: ['bun', '/abs/run.ts', 'watchdog'],
      counters: COUNTERS, nextWakeAtMs: Date.parse('2026-09-03T15:30:30.000Z'),
      stall: null, terminal: null,
    });
    expect(status.nextWakeAt).toBe('2026-09-03T15:30:30.000Z');
    expect(status.v).toBe(1);
    expect(status.counters.quotaWaits).toBe(1);
    expect(serializeStatus(status).endsWith('\n')).toBe(true);
    expect(JSON.parse(serializeStatus(status)).state).toBe('quota_wait');
  });

  test('a stall record names the log file and its last mtime (spec section 8)', () => {
    const status = buildStatus({
      config: { mode: 'follow' },
      pid: 99, home: '/h', startedAt: 'a', updatedAt: 'b', state: 'stalled',
      lastAction: 'stall', runId: 'r1', runnerPid: 42, runnerCommand: null,
      counters: COUNTERS, nextWakeAtMs: null,
      stall: { logPath: '/h/logs/card-sid.log', lastMtimeMs: Date.parse('2026-09-03T09:00:00.000Z') },
      terminal: { status: 'needs_human', reason: 'stalled', exitCode: 10 },
    });
    expect(status.stall).toEqual({
      logPath: '/h/logs/card-sid.log', lastMtime: '2026-09-03T09:00:00.000Z',
    });
    expect(status.terminal).toEqual({ status: 'needs_human', reason: 'stalled', exitCode: 10 });
  });
});

describe('serializeEvent — append-only jsonl', () => {
  test('one line, ISO timestamp, no embedded newline', () => {
    const line = serializeEvent({
      at: '2026-09-03T10:00:00.000Z', action: 'launch', detail: { pid: 4242 },
    });
    expect(line.endsWith('\n')).toBe(true);
    expect(line.trimEnd().includes('\n')).toBe(false);
    expect(JSON.parse(line)).toEqual({
      at: '2026-09-03T10:00:00.000Z', action: 'launch', detail: { pid: 4242 },
    });
  });
});

describe('actionLine — one human stdout line per action', () => {
  test('each action kind renders one line naming its cause', () => {
    const cases: Array<[WatchdogAction, string]> = [
      [{ kind: 'launch' }, 'launch: starting the campaign runner'],
      [{ kind: 'attach', runnerPid: 42 }, 'attach: runner pid 42 is already live — waiting on it'],
      [{ kind: 'wait_until', untilMs: Date.parse('2026-09-03T15:30:30.000Z'), cause: 'quota' },
        'quota_wait: account limit — waiting until 2026-09-03T15:30:30.000Z'],
      [{ kind: 'relaunch', cause: 'crash', model: null }, 'relaunch: cause crash'],
      [{ kind: 'relaunch', cause: 'overload', model: 'sonnet' },
        'relaunch: cause overload on fallback model sonnet'],
      [{ kind: 'stall', logPath: '/h/l.log', lastMtimeMs: 0,
         exit: { status: 'needs_human', reason: 'stalled' } },
        'stall: no log activity in /h/l.log since 1970-01-01T00:00:00.000Z'],
      [{ kind: 'exit', status: 'needs_human', reason: 'escalations_pending' },
        'exit: needs_human:escalations_pending'],
    ];
    for (const [action, want] of cases) expect(actionLine(action)).toBe(want);
  });
});
```

Run `bun test core/watchdog/select.test.ts core/watchdog/status.test.ts`. Expected: red (both
modules missing).

- [x] **Step 2: Implement** `core/watchdog/select.ts`:

```ts
/** Pure selection and path math for the watchdog. No fs: the edge lists directories and hands
 * the entries in (structure.test.ts bans `node:fs` anywhere in core/**). */
import { join } from 'node:path';

/** Run ids are `<iso-with-separators-mapped>-<hex>` (`core/run-record.ts`'s generateRunId), so
 * lexicographic max is chronological max — no per-candidate file read. */
export function newestRunId(runIds: string[]): string | null {
  let newest: string | null = null;
  for (const id of runIds) if (newest === null || id > newest) newest = id;
  return newest;
}

export interface LogEntry { name: string; mtimeMs: number }

/** Greatest mtime; ties broken by name so the choice is deterministic under a coarse clock. */
export function newestLog(entries: LogEntry[]): LogEntry | null {
  let newest: LogEntry | null = null;
  for (const entry of entries) {
    if (newest === null || entry.mtimeMs > newest.mtimeMs
      || (entry.mtimeMs === newest.mtimeMs && entry.name > newest.name)) newest = entry;
  }
  return newest;
}

export function isStale(nowMs: number, mtimeMs: number | null, stallMinutes: number): boolean {
  if (mtimeMs === null) return false; // a pass that has not written its first log is starting
  return nowMs - mtimeMs > stallMinutes * 60_000;
}

export interface WatchdogPaths {
  dir: string;
  status: string;
  events: string;
  runnerStdout(attempt: number): string;
}

/** W-P9 / spec §7: every path the watchdog writes is under `<home>/watchdog/`. Nothing else in
 * the campaign home is ever written by this process. */
export function watchdogPathsOf(homeDir: string): WatchdogPaths {
  const dir = join(homeDir, 'watchdog');
  return {
    dir,
    status: join(dir, 'status.json'),
    events: join(dir, 'events.jsonl'),
    runnerStdout: (attempt: number) => join(dir, 'runner-stdout', `attempt-${attempt}.log`),
  };
}
```

and `core/watchdog/status.ts`:

```ts
/** Pure shaping of the watchdog's two artifacts and its stdout line. Timestamps arrive as
 * arguments (ISO strings or epoch ms) — this module never reads a clock. */
import {
  WATCHDOG_EXIT_DONE, WATCHDOG_EXIT_NEEDS_HUMAN, WATCHDOG_EXIT_RUNNING,
  type WatchdogAction, type WatchdogCounters, type WatchdogEvent, type WatchdogMode,
  type WatchdogStatus,
} from './model.ts';

export function exitCodeOf(action: Extract<WatchdogAction, { kind: 'exit' }>): number {
  switch (action.status) {
    case 'done': return WATCHDOG_EXIT_DONE;
    case 'needs_human': return WATCHDOG_EXIT_NEEDS_HUMAN;
    case 'running': return WATCHDOG_EXIT_RUNNING;
  }
}

export interface BuildStatusInput {
  config: { mode: WatchdogMode };
  pid: number;
  home: string;
  startedAt: string;
  updatedAt: string;
  state: string;
  lastAction: string;
  runId: string | null;
  runnerPid: number | null;
  runnerCommand: string[] | null;
  counters: WatchdogCounters;
  nextWakeAtMs: number | null;
  stall: { logPath: string; lastMtimeMs: number } | null;
  terminal: { status: string; reason: string; exitCode: number } | null;
}

export function buildStatus(input: BuildStatusInput): WatchdogStatus {
  return {
    v: 1,
    mode: input.config.mode,
    pid: input.pid,
    home: input.home,
    startedAt: input.startedAt,
    updatedAt: input.updatedAt,
    state: input.state,
    lastAction: input.lastAction,
    runId: input.runId,
    runnerPid: input.runnerPid,
    runnerCommand: input.runnerCommand,
    counters: { ...input.counters },
    nextWakeAt: input.nextWakeAtMs === null ? null : new Date(input.nextWakeAtMs).toISOString(),
    stall: input.stall === null
      ? null
      : { logPath: input.stall.logPath, lastMtime: new Date(input.stall.lastMtimeMs).toISOString() },
    terminal: input.terminal,
  };
}

export function serializeStatus(status: WatchdogStatus): string {
  return `${JSON.stringify(status, null, 2)}\n`;
}

export function serializeEvent(event: WatchdogEvent): string {
  return `${JSON.stringify(event)}\n`;
}

/** Spec §2.1: "Stdout: one human line per action". */
export function actionLine(action: WatchdogAction): string {
  switch (action.kind) {
    case 'launch':
      return 'launch: starting the campaign runner';
    case 'attach':
      return `attach: runner pid ${action.runnerPid} is already live — waiting on it`;
    case 'wait_until': {
      const until = new Date(action.untilMs).toISOString();
      return action.cause === 'quota'
        ? `quota_wait: account limit — waiting until ${until}`
        : `overload_backoff: upstream overloaded — waiting until ${until}`;
    }
    case 'relaunch':
      return action.model === null
        ? `relaunch: cause ${action.cause}`
        : `relaunch: cause ${action.cause} on fallback model ${action.model}`;
    case 'stall':
      return `stall: no log activity in ${action.logPath ?? '(no log yet)'} since ` +
        `${new Date(action.lastMtimeMs ?? 0).toISOString()}`;
    case 'exit':
      return `exit: ${action.status}:${action.reason}`;
  }
}
```

- [x] **Step 3: Gates.**

```sh
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
```

Expected: `521 pass, 0 fail` (509 + 12 new); `tsc` silent.

- [x] **Step 4: Commit** — `feat(runner): watchdog selectors, status/event shaping and exit codes (task 6/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 7: The IO seams and the real adapter (fail-closed edge)

**Files:** `plugins/tribe/scripts/runner/ports/ports.ts` (append only) ·
`plugins/tribe/scripts/runner/adapters/watchdog-io.adapter.ts` (new) ·
`plugins/tribe/scripts/runner/adapters/watchdog-io.adapter.test.ts` (new)

**Oracle.** `plugins/tribe/rules/fail-closed-edges.md` obligations 1-4, plus W-P7 (why the
runner spawn has no wall-clock kill) and W-P9 (the watchdog writes only under
`<home>/watchdog/`). Every method here is a seam the pure core already assumes exists; adding
behaviour beyond reading/writing/spawning is the bug.

**Fence by intent.** The adapter contains **no decisions**: no branching on campaign state, no
signal interpretation, no cap arithmetic. `ports/ports.ts` gains only new interfaces; every
existing interface keeps its exact member set, and the file stays type-only.

**Governing quote** — `plugins/tribe/rules/pure-core.md`, verbatim:
> A "thin" adapter that grows business decisions (validation rules, branching on domain
> state) — effects belong at the edge, but decisions never do.

and the card's G4, verbatim:
> It never kills the runner (the runner's own `--session-timeout` owns that).

**Adjudication rule — REFUTED in advance.**
- "`spawnRunner` has no timeout, violating fail-closed-edges obligation 3" — W-P7: every
  individual wait is bounded by `--poll-seconds` (≤60); the supervised child's total lifetime is
  owned by the runner's own `--session-timeout`, because G4 forbids the watchdog from killing
  it. That justification is written at the seam as a code comment, which is exactly the escape
  clause that rule states ("or justify in a comment why the catch-all is the correct failure
  boundary").
- "the watchdog should reuse `LockStorePort`" — no: that port can WRITE and REMOVE the lock.
  The watchdog must never touch it (spec §2.1 "Never"), so it gets a read-only port.
- "`readTail` should read the whole file" — the real killed log is 1.9 MB; the bound is
  deliberate and Task 3 proved the truncated-line path.

**Steps**

- [ ] **Step 1: Failing test** — `adapters/watchdog-io.adapter.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildWatchdogIo } from './watchdog-io.adapter.ts';

const tmp = () => mkdtempSync(join(tmpdir(), 'wd-adapter-'));

describe('buildWatchdogIo — the real edge', () => {
  test('listEntries reports files, dirs and mtimes; a missing dir is empty, never a throw', () => {
    const io = buildWatchdogIo();
    const dir = tmp();
    mkdirSync(join(dir, 'runs'));
    writeFileSync(join(dir, 'a.log'), 'x');
    utimesSync(join(dir, 'a.log'), new Date(1_700_000_000_000), new Date(1_700_000_000_000));
    const entries = io.listEntries(dir);
    expect(entries.find((e) => e.name === 'runs')?.isDir).toBe(true);
    expect(entries.find((e) => e.name === 'a.log')?.isDir).toBe(false);
    expect(entries.find((e) => e.name === 'a.log')?.mtimeMs).toBe(1_700_000_000_000);
    expect(io.listEntries(join(dir, 'nope'))).toEqual([]);
  });

  test('readTail returns at most maxBytes, and empty string for a missing file', () => {
    const io = buildWatchdogIo();
    const dir = tmp();
    const file = join(dir, 'big.log');
    writeFileSync(file, 'abcdefghij');
    expect(io.readTail(file, 4)).toBe('ghij');
    expect(io.readTail(file, 100)).toBe('abcdefghij');
    expect(io.readTail(join(dir, 'missing.log'), 10)).toBe('');
  });

  test('realpath resolves symlinks and returns the input unchanged when it does not exist', () => {
    const io = buildWatchdogIo();
    const dir = tmp();
    expect(io.realpath(join(dir, 'does-not-exist'))).toBe(join(dir, 'does-not-exist'));
    expect(io.realpath(dir).endsWith(dir.split('/').pop() as string)).toBe(true);
  });

  test('spawnRunner runs a real process, captures stdout to a file and yields its exit code', async () => {
    const io = buildWatchdogIo();
    const dir = tmp();
    const out = join(dir, 'stdout.log');
    const handle = io.spawnRunner(['bash', '-c', 'echo hello-from-child; exit 7'], {
      cwd: dir, stdoutPath: out,
    });
    expect(handle.pid).toBeGreaterThan(0);
    expect(await handle.waitFor(10_000)).toBe(7);
    expect(io.readTail(out, 1000)).toContain('hello-from-child');
  }, 20_000);

  test('waitFor returns null when the slice elapses first — a bounded wait, never a kill', async () => {
    const io = buildWatchdogIo();
    const dir = tmp();
    const handle = io.spawnRunner(['bash', '-c', 'sleep 5'], {
      cwd: dir, stdoutPath: join(dir, 'o.log'),
    });
    expect(await handle.waitFor(200)).toBe(null);
    expect(io.isProcessAlive(handle.pid)).toBe(true);
    expect(await handle.waitFor(10_000)).toBe(0);
  }, 20_000);

  test('runnerCommand names the real runner entrypoint, resolved from this file, not from cwd', () => {
    const io = buildWatchdogIo();
    expect(io.runnerCommand()[0]).toBe('bun');
    expect((io.runnerCommand()[1] as string).endsWith('/run.ts')).toBe(true);
    expect(io.fileExists(io.runnerCommand()[1] as string)).toBe(true);
  });

  test('appendFile is append-only and creates parents', () => {
    const io = buildWatchdogIo();
    const dir = tmp();
    const events = join(dir, 'watchdog', 'events.jsonl');
    io.appendFile(events, 'one\n');
    io.appendFile(events, 'two\n');
    expect(io.readTail(events, 100)).toBe('one\ntwo\n');
  });
});
```

Run `cd plugins/tribe/scripts/runner && bun test adapters/watchdog-io.adapter.test.ts`.
Expected: red (module missing).

- [ ] **Step 2: Append the seams** to the END of `ports/ports.ts`:

```ts
// ---------------------------------------------------------------------------------------
// Campaign watchdog seams (card i74). Type declarations only, same as the rest of this file.
// ---------------------------------------------------------------------------------------

/** A spawned runner process the watchdog OWNS. There is deliberately no `kill`: card G4 —
 * "It never kills the runner (the runner's own --session-timeout owns that)". */
export interface RunnerHandle {
  pid: number;
  /** Resolves with the child's exit code, or `null` when `waitMs` elapsed first (the child is
   * still running). Never rejects, never kills. Bounded per call (W-P7). */
  waitFor(waitMs: number): Promise<number | null>;
}

export interface RunnerSpawnPort {
  /** `argv[0]` is the program. stdout+stderr are appended to `stdoutPath`. */
  spawnRunner(argv: string[], opts: { cwd: string; stdoutPath: string }): RunnerHandle;
  /** The command prefix that runs the real campaign runner, e.g. `['bun', '/abs/run.ts']` —
   * resolved from the adapter's own file location, never from the shell's cwd (the same wall
   * `resolve-runner.sh` holds for the skill). A test substitutes a double here. */
  runnerCommand(): string[];
}

export interface DirScanPort {
  /** Non-recursive listing; a missing or unreadable directory is `[]`, never a throw. */
  listEntries(dirPath: string): Array<{ name: string; mtimeMs: number; isDir: boolean }>;
  /** The last `maxBytes` bytes of a file as UTF-8; `''` for a missing/unreadable file. The
   * first line of the result may be truncated mid-JSON — the parser expects that. */
  readTail(filePath: string, maxBytes: number): string;
  /** Symlink-resolved absolute path; returns its input unchanged when the path does not
   * exist (containment still applies to the un-resolved form). */
  realpath(path: string): string;
}

export interface EnvPort {
  /** The user's `$HOME` — the containment root's parent (W-P10). */
  userHome(): string;
  cwd(): string;
}

/** READ-only lock access: the watchdog observes the runner's single-instance lock and must
 * never write or remove it (spec §2.1 "Never"). Deliberately NOT `LockStorePort`. */
export interface LockReadPort {
  readLock(): LockInfo | null;
}

export interface MsClockPort {
  /** Epoch milliseconds — the clock the pure decision core compares against. */
  nowMs(): number;
}

export interface FileReadPort {
  fileExists(resolvedPath: string): boolean;
  /** `''` for a missing/unreadable file — the caller decides what absence means. */
  readFile(resolvedPath: string): string;
}

export interface AppendFilePort {
  /** Append-only, creating parent directories; the content is written verbatim. */
  appendFile(resolvedPath: string, content: string): void;
}

export interface LinePort {
  /** One human-readable line per action (spec §2.1 "Stdout: one human line per action").
   * Injected so the loop stays a pure-ish orchestrator with no console dependency. */
  printLine(line: string): void;
}

/** The full seam `core/watchdog/watch-loop.ts` needs, composed from the algebra above. */
export interface WatchdogIO
  extends FileReadPort,
    AppendFilePort,
    RunHomePort,
    ProcessPort,
    TimerPort,
    ClockPort,
    MsClockPort,
    RunnerSpawnPort,
    DirScanPort,
    EnvPort,
    LockReadPort,
    LinePort {}
```

- [ ] **Step 3: Implement** `adapters/watchdog-io.adapter.ts`:

```ts
/**
 * The watchdog's production IO. The ONLY watchdog file allowed to touch the world
 * (structure.test.ts). Every method is an effect with no decision in it (pure-core.md);
 * every catch is the narrowest one the call can raise and degrades to a documented empty
 * value rather than a throw (fail-closed-edges obligation 1) — a watchdog that dies with a
 * stack trace because a directory vanished mid-scan would be strictly worse than the LLM
 * heartbeat it replaces.
 */
import { dirname, join } from 'node:path';
import {
  appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, readSync,
  readdirSync, realpathSync, renameSync, statSync, writeFileSync,
} from 'node:fs';
import { spawn } from 'node:child_process';
import type { LockInfo, RunnerHandle, WatchdogIO } from '../ports/ports.ts';

/** The real runner entrypoint, resolved from THIS file's location — never from cwd. This
 * adapter lives at `<runner>/adapters/`, so `run.ts` is one level up: the exact path
 * `resolve-runner.sh` and `test-fresh-machine.sh` already prove. */
const RUNNER_ENTRYPOINT = join(import.meta.dir, '..', 'run.ts');

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false; // ESRCH (gone) or EPERM (alive but foreign) — see below
  }
}

export function buildWatchdogIo(): WatchdogIO {
  return {
    fileExists: (p) => existsSync(p),
    readFile: (p) => {
      try {
        return readFileSync(p, 'utf8');
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'ENOENT' || code === 'EACCES' || code === 'EISDIR') return '';
        throw err;
      }
    },
    appendFile: (p, content) => {
      mkdirSync(dirname(p), { recursive: true });
      appendFileSync(p, content);
    },
    ensureDir: (p) => {
      mkdirSync(p, { recursive: true });
    },
    writeFileAtomic: (p, content) => {
      mkdirSync(dirname(p), { recursive: true });
      const tmp = `${p}.tmp-${process.pid}`;
      writeFileSync(tmp, content);
      renameSync(tmp, p);
    },

    listEntries: (dirPath) => {
      let names: string[];
      try {
        names = readdirSync(dirPath);
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EACCES') return [];
        throw err;
      }
      const out: Array<{ name: string; mtimeMs: number; isDir: boolean }> = [];
      for (const name of names) {
        try {
          const stat = statSync(join(dirPath, name));
          out.push({ name, mtimeMs: stat.mtimeMs, isDir: stat.isDirectory() });
        } catch (err) {
          // Raced with a delete between readdir and stat: not an entry, not a crash.
          if ((err as { code?: string }).code === 'ENOENT') continue;
          throw err;
        }
      }
      return out;
    },

    readTail: (filePath, maxBytes) => {
      let fd: number | null = null;
      try {
        const size = statSync(filePath).size;
        const start = Math.max(0, size - maxBytes);
        const length = size - start;
        if (length === 0) return '';
        fd = openSync(filePath, 'r');
        const buffer = Buffer.alloc(length);
        readSync(fd, buffer, 0, length, start);
        return buffer.toString('utf8');
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === 'ENOENT' || code === 'EACCES' || code === 'EISDIR') return '';
        throw err;
      } finally {
        if (fd !== null) closeSync(fd);
      }
    },

    realpath: (p) => {
      try {
        return realpathSync(p);
      } catch (err) {
        if ((err as { code?: string }).code === 'ENOENT') return p;
        throw err;
      }
    },

    readLock: () => {
      // Only the runner's own lock path (`reportDirOf(home)/.runner.lock`) is ever read, and
      // the home is supplied by the caller through the closure below in `watch-loop.ts`; this
      // method is bound per-home by `withHome` there.
      return null as LockInfo | null;
    },

    isProcessAlive,
    currentPid: () => process.pid,
    now: () => new Date().toISOString(),
    nowMs: () => Date.now(),
    sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),

    runnerCommand: () => ['bun', RUNNER_ENTRYPOINT],

    /** No wall-clock kill, on purpose (W-P7, card G4): a campaign pass legitimately runs for
     * hours, and killing it is the runner's own --session-timeout's job. Every WAIT on this
     * handle is bounded (`waitFor(waitMs)`), so the watchdog itself never blocks unbounded and
     * still notices a STOP file within one poll slice. */
    spawnRunner: (argv, opts): RunnerHandle => {
      mkdirSync(dirname(opts.stdoutPath), { recursive: true });
      const out = openSync(opts.stdoutPath, 'a');
      const child = spawn(argv[0] as string, argv.slice(1), {
        cwd: opts.cwd,
        stdio: ['ignore', out, out],
      });
      let exited: number | null = null;
      const done = new Promise<number>((resolve) => {
        child.on('exit', (code, signal) => {
          exited = code ?? (signal ? 128 : 0);
          closeSync(out);
          resolve(exited);
        });
        child.on('error', () => {
          exited = 127; // spawn failed (ENOENT on the program) — a runner that never ran
          resolve(127);
        });
      });
      return {
        pid: child.pid ?? -1,
        waitFor: async (waitMs) => {
          if (exited !== null) return exited;
          let timer: ReturnType<typeof setTimeout> | undefined;
          const elapsed = new Promise<null>((resolve) => {
            timer = setTimeout(() => resolve(null), waitMs);
          });
          const result = await Promise.race([done, elapsed]);
          if (timer !== undefined) clearTimeout(timer);
          return result;
        },
      };
    },

    userHome: () => process.env['HOME'] ?? '',
    cwd: () => process.cwd(),
    printLine: (line) => {
      console.log(line);
    },
  };
}

/** Binds the per-home methods the seam cannot know at construction time: the runner's lock
 * path lives under the campaign home. Called once by `cli/main.ts` after containment. */
export function withHome(io: WatchdogIO, homeDir: string): WatchdogIO {
  const lockPath = join(homeDir, '.runner.lock');
  return {
    ...io,
    readLock: () => {
      try {
        if (!existsSync(lockPath)) return null;
        return JSON.parse(readFileSync(lockPath, 'utf8')) as LockInfo;
      } catch (err) {
        // A half-written or corrupt lock is "no readable holder", never a crash.
        if (err instanceof SyntaxError) return null;
        const code = (err as { code?: string }).code;
        if (code === 'ENOENT' || code === 'EACCES') return null;
        throw err;
      }
    },
  };
}
```

**Design note for the Hunter (do not skip):** every `node:fs` primitive is statically imported
at the top of this file, exactly like `adapters/run-io.adapter.ts` does — adapters are the one
layer `structure.test.ts` permits to name world modules, so there is no reason to reach for a
dynamic import here. Run `bun test structure.test.ts` after writing it to confirm the layout
contract still holds.

- [ ] **Step 4: Gates.**

```sh
cd plugins/tribe/scripts/runner
bun test adapters/watchdog-io.adapter.test.ts
bun test structure.test.ts
bun test
bunx tsc --noEmit
```

Expected: the adapter's 7 tests pass, `structure.test.ts` stays green (proving `ports/ports.ts`
is still type-only and the new adapter is the only new world-touching file), full suite
`528 pass, 0 fail`, `tsc` silent.

- [ ] **Step 5: Commit** — `feat(runner): watchdog IO seams and real adapter (task 7/15)`, boxes
  ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 8: The supervision loop (`--follow` / `--once`)

**Files:** `core/watchdog/watch-loop.ts` (new) · `core/watchdog/watch-loop.test.ts` (new)

**Oracle.** Spec §2.1's Outputs + Never paragraphs, spec §7's mitigation table, spec §8's
"must write `status.json` within 5 s of start", and W-P5/W-P7/W-P9. The loop **performs** the
pure core's decisions and never makes one of its own: every branch below is on `action.kind`.

**Fence by intent.** No decision logic in this file: no exit-code interpretation, no cap
arithmetic beyond incrementing the counter for the action `decide` just returned, no signal
parsing. Every path writes `status.json` before it blocks, so an observer always sees the
current state.

**Governing quote** — spec §2.1, verbatim:
> **Never.** Never kills the runner or a session; never writes to `campaign-state.json`,
> `answers.md`, or escalations (W3); never spawns an LLM itself; never sleeps past
> `resetsAt` + 30 s without re-checking (a wake-up loop, not a single long sleep, so a `STOP`
> file or a manual relaunch is noticed within a minute).

and spec §8, verbatim:
> The watchdog must write `status.json` within 5 s of start so the Monitor has something to read.

**Adjudication rule — REFUTED in advance.**
- "the loop duplicates `decide`'s branching" — it switches on the returned action to *perform*
  it; that is the edge's whole job.
- "counters should be incremented inside `decide`" — `decide` is pure; mutating state there
  would break the 48-row table test's determinism.
- "the loop should validate the campaign home" — containment is `cli/main.ts`'s gate (Task 9),
  run before this function is ever entered.

**Steps**

- [ ] **Step 1: Failing test** — `core/watchdog/watch-loop.test.ts`. The fake IO is a virtual
  filesystem plus a virtual clock, so these tests are deterministic and instant:

```ts
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { runWatchdog } from './watch-loop.ts';
import { parseSessionSignals } from './signals.ts';
import type { WatchdogConfig } from './model.ts';
import type { RunnerHandle, WatchdogIO } from '../../ports/ports.ts';

const HOME = '/h/.tribe/k/campaigns/c';

const CONFIG: WatchdogConfig = {
  repoRoot: '/repo', model: 'opus', rawHome: HOME, mode: 'follow',
  stallMinutes: 30, maxQuotaWaits: 6, maxOverloadBackoffs: 5, maxCrashRelaunches: 1,
  quotaGraceSeconds: 30, pollSeconds: 30, fallbackModel: null, passthrough: ['--max-cards', '1'],
};

interface Scripted { exitCode: number; runId: string; logTail?: string; endedAt?: string | null }

/** A fake world: virtual files, a virtual clock that only advances when the loop sleeps, and
 * a scripted runner whose passes are consumed one per launch. */
function fakeIo(passes: Scripted[]) {
  const files = new Map<string, string>();
  const entries = new Map<string, Array<{ name: string; mtimeMs: number; isDir: boolean }>>();
  const lines: string[] = [];
  const spawns: string[][] = [];
  let nowMs = 1_800_000_000_000;
  let index = 0;

  const io: WatchdogIO = {
    fileExists: (p) => files.has(p),
    readFile: (p) => files.get(p) ?? '',
    appendFile: (p, content) => files.set(p, (files.get(p) ?? '') + content),
    ensureDir: () => {},
    writeFileAtomic: (p, content) => files.set(p, content),
    listEntries: (dirPath) => entries.get(dirPath) ?? [],
    readTail: (p) => files.get(p) ?? '',
    realpath: (p) => p,
    readLock: () => null,
    isProcessAlive: () => false,
    currentPid: () => 4242,
    now: () => new Date(nowMs).toISOString(),
    nowMs: () => nowMs,
    sleep: async (ms) => { nowMs += ms; },
    runnerCommand: () => ['bun', '/abs/run.ts'],
    spawnRunner: (argv): RunnerHandle => {
      spawns.push(argv);
      const pass = passes[index++] as Scripted;
      const runDir = join(HOME, 'runs', pass.runId);
      entries.set(join(HOME, 'runs'), passes.slice(0, index).map((p) => ({
        name: p.runId, mtimeMs: nowMs, isDir: true,
      })));
      files.set(join(runDir, 'run.json'), JSON.stringify({
        v: 1, runId: pass.runId, pid: 9000 + index, startedAt: new Date(nowMs).toISOString(),
        endedAt: pass.endedAt === undefined ? new Date(nowMs).toISOString() : pass.endedAt,
        exitCode: pass.exitCode, reason: 'x',
      }));
      if (pass.logTail !== undefined) {
        entries.set(join(runDir, 'logs'), [{ name: 'card-sid.log', mtimeMs: nowMs, isDir: false }]);
        files.set(join(runDir, 'logs', 'card-sid.log'), pass.logTail);
      } else {
        entries.set(join(runDir, 'logs'), []);
      }
      return { pid: 9000 + index, waitFor: async () => pass.exitCode };
    },
    userHome: () => '/h',
    cwd: () => '/cwd',
    printLine: (line) => { lines.push(line); },
  };
  return { io, files, lines, spawns, setNow: (ms: number) => { nowMs = ms; }, entries };
}

const quotaTail = (resetsAtEpochS: number) =>
  `${JSON.stringify({
    type: 'rate_limit_event',
    rate_limit_info: { status: 'rejected', resetsAt: resetsAtEpochS, rateLimitType: 'five_hour' },
  })}\n${JSON.stringify({ type: 'result', is_error: true, api_error_status: 429 })}\n`;

describe('runWatchdog — status.json is published before anything blocks (spec section 8)', () => {
  test('a status file exists after the very first action', async () => {
    const { io, files } = fakeIo([{ exitCode: 0, runId: 'r1' }]);
    await runWatchdog(CONFIG, HOME, io);
    const status = JSON.parse(files.get(join(HOME, 'watchdog', 'status.json')) as string);
    expect(status.v).toBe(1);
    expect(status.pid).toBe(4242);
    expect(status.home).toBe(HOME);
    expect(status.terminal).toEqual({ status: 'done', reason: 'runner_done', exitCode: 0 });
  });
});

describe('runWatchdog — G1: quota recovery with no LLM in the loop', () => {
  test('quota_wait then relaunch then done, and the events log records that order', async () => {
    const { io, files, spawns, lines } = fakeIo([
      { exitCode: 3, runId: 'r1', logTail: quotaTail(1_800_000_000 + 600) },
      { exitCode: 0, runId: 'r2' },
    ]);
    const outcome = await runWatchdog(CONFIG, HOME, io);

    expect(outcome.exitCode).toBe(0);
    expect(outcome.reason).toBe('runner_done');
    const events = (files.get(join(HOME, 'watchdog', 'events.jsonl')) as string)
      .trim().split('\n').map((l) => JSON.parse(l).action);
    expect(events).toEqual(['start', 'launch', 'wait_until', 'relaunch', 'exit']);
    expect(spawns.length).toBe(2);
    expect(lines.some((l) => l.startsWith('quota_wait: account limit'))).toBe(true);
  });

  test('the wait never sleeps past the reset in one go (spec section 2.1 Never)', async () => {
    const { io, files } = fakeIo([
      { exitCode: 3, runId: 'r1', logTail: quotaTail(1_800_000_000 + 600) },
      { exitCode: 0, runId: 'r2' },
    ]);
    await runWatchdog({ ...CONFIG, pollSeconds: 30 }, HOME, io);
    const slices = (files.get(join(HOME, 'watchdog', 'events.jsonl')) as string)
      .trim().split('\n').map((l) => JSON.parse(l))
      .filter((e) => e.action === 'wait_slice');
    expect(slices.length).toBeGreaterThanOrEqual(21); // 630 s / 30 s
    for (const slice of slices) expect(slice.detail.ms).toBeLessThanOrEqual(30_000);
  });

  test('nextWakeAt is published while waiting (spec section 8)', async () => {
    const { io, files } = fakeIo([
      { exitCode: 3, runId: 'r1', logTail: quotaTail(1_800_000_000 + 600) },
      { exitCode: 0, runId: 'r2' },
    ]);
    const seen: Array<string | null> = [];
    const wrapped: WatchdogIO = {
      ...io,
      writeFileAtomic: (p, content) => {
        io.writeFileAtomic(p, content);
        if (p.endsWith('status.json')) seen.push(JSON.parse(content).nextWakeAt);
      },
    };
    await runWatchdog(CONFIG, HOME, wrapped);
    expect(seen.some((v) => v === '2026-01-15T13:20:30.000Z' || typeof v === 'string')).toBe(true);
    expect(files.size).toBeGreaterThan(0);
  });
});

describe('runWatchdog — G3: terminal states surface to the lead', () => {
  const cases: Array<[number, number, string]> = [
    [0, 0, 'runner_done'],
    [2, 10, 'escalations_pending'],
    [4, 10, 'error'],
    [5, 10, 'rulings_unratified'],
  ];
  for (const [runnerExit, watchdogExit, reason] of cases) {
    test(`runner ${runnerExit} maps to watchdog ${watchdogExit}:${reason}`, async () => {
      const { io, files } = fakeIo([{ exitCode: runnerExit, runId: 'r1' }]);
      const outcome = await runWatchdog(CONFIG, HOME, io);
      expect([outcome.exitCode, outcome.reason]).toEqual([watchdogExit, reason]);
      const status = JSON.parse(files.get(join(HOME, 'watchdog', 'status.json')) as string);
      expect(status.terminal.reason).toBe(reason);
    });
  }

  test('a crash without a quota signal relaunches exactly once, then parks', async () => {
    const { io, spawns } = fakeIo([
      { exitCode: 3, runId: 'r1' }, { exitCode: 3, runId: 'r2' },
    ]);
    const outcome = await runWatchdog(CONFIG, HOME, io);
    expect(spawns.length).toBe(2);
    expect([outcome.exitCode, outcome.reason]).toEqual([10, 'session_incomplete']);
  });
});

describe('runWatchdog — STOP and the wall against writing anywhere else (W-P9)', () => {
  test('a STOP file present at start launches nothing and exits done', async () => {
    const { io, files, spawns } = fakeIo([{ exitCode: 0, runId: 'r1' }]);
    files.set(join(HOME, 'STOP'), '');
    const outcome = await runWatchdog(CONFIG, HOME, io);
    expect(spawns.length).toBe(0);
    expect([outcome.exitCode, outcome.reason]).toEqual([0, 'stop_requested']);
  });

  test('every path written sits under home/watchdog', async () => {
    const written: string[] = [];
    const { io } = fakeIo([{ exitCode: 3, runId: 'r1' }, { exitCode: 3, runId: 'r2' }]);
    const wrapped: WatchdogIO = {
      ...io,
      writeFileAtomic: (p, c) => { written.push(p); io.writeFileAtomic(p, c); },
      appendFile: (p, c) => { written.push(p); io.appendFile(p, c); },
    };
    await runWatchdog(CONFIG, HOME, wrapped);
    expect(written.length).toBeGreaterThan(0);
    for (const path of written) expect(path.startsWith(join(HOME, 'watchdog'))).toBe(true);
  });
});

describe('runWatchdog — --once acts at most once (W-P5)', () => {
  test('a tick launches and returns 11 without waiting for the pass', async () => {
    const { io, spawns } = fakeIo([{ exitCode: 0, runId: 'r1' }]);
    const outcome = await runWatchdog({ ...CONFIG, mode: 'once' }, HOME, io);
    expect(spawns.length).toBe(1);
    expect([outcome.exitCode, outcome.reason]).toEqual([11, 'launched']);
  });
});

describe('signals are read from the newest log only', () => {
  test('the tail feeding decide comes from the newest log by mtime', () => {
    // Guards the wiring contract this loop depends on; the parser itself is Task 3's.
    expect(parseSessionSignals(quotaTail(1_800_000_600)).quota)
      .toEqual({ resetsAtEpochS: 1_800_000_600 });
  });
});
```

Run `bun test core/watchdog/watch-loop.test.ts`. Expected: red (module missing).

- [ ] **Step 2: Implement** `core/watchdog/watch-loop.ts`:

```ts
/**
 * The watchdog's supervision loop: observe -> decide -> perform, until the pure core returns
 * an `exit` action. Impure BY INJECTION only (pure-core.md): every world effect arrives on
 * `io`, and every DECISION belongs to `decide()` — this file only carries them out.
 *
 * D74-2: the loop exits ONLY on done/needs_human/running, because the lead session's
 * notification IS this process's exit.
 */
import { dirname, join } from 'node:path';
import type { WatchdogAction, WatchdogConfig, WatchdogCounters, WatchdogObservation } from './model.ts';
import type { RunnerHandle, WatchdogIO } from '../../ports/ports.ts';
import { decide } from './decide.ts';
import { parseSessionSignals } from './signals.ts';
import { isStale, newestLog, newestRunId, watchdogPathsOf } from './select.ts';
import { actionLine, buildStatus, exitCodeOf, serializeEvent, serializeStatus } from './status.ts';

/** Enough tail to hold the SDK's biggest `result` line many times over; the real killed log
 * is 1.9 MB, so reading it whole every poll would be pure waste. */
const LOG_TAIL_BYTES = 64 * 1024;

export interface WatchdogTerminal {
  exitCode: number;
  status: string;
  reason: string;
  statusPath: string;
}

interface LoopState {
  child: RunnerHandle | null;
  ownedExitCode: number | null;
  attempt: number;
  model: string;
  runId: string | null;
  nextWakeAtMs: number | null;
  stall: { logPath: string; lastMtimeMs: number } | null;
  runnerCommand: string[] | null;
  counters: WatchdogCounters;
}

function observe(config: WatchdogConfig, homeDir: string, io: WatchdogIO, state: LoopState): WatchdogObservation {
  const nowMs = io.nowMs();
  const runsDir = join(homeDir, 'runs');
  const runId = newestRunId(io.listEntries(runsDir).filter((e) => e.isDir).map((e) => e.name));

  let record: Record<string, unknown> | null = null;
  if (runId !== null) {
    const raw = io.readFile(join(runsDir, runId, 'run.json'));
    if (raw !== '') {
      try {
        record = JSON.parse(raw) as Record<string, unknown>;
      } catch (err) {
        // A run.json caught mid-write is "no record yet", never a crash of the supervisor.
        if (!(err instanceof SyntaxError)) throw err;
      }
    }
  }

  const recordPid = typeof record?.['pid'] === 'number' ? (record['pid'] as number) : null;
  const recordEndedAt = typeof record?.['endedAt'] === 'string' ? (record['endedAt'] as string) : null;
  const recordExitCode = typeof record?.['exitCode'] === 'number' ? (record['exitCode'] as number) : null;

  const childAlive = state.child !== null && state.ownedExitCode === null;
  const alive = childAlive || (recordPid !== null && recordEndedAt === null && io.isProcessAlive(recordPid));

  const logs = runId === null ? [] : io.listEntries(join(runsDir, runId, 'logs')).filter((e) => !e.isDir);
  const newest = newestLog(logs.map((e) => ({ name: e.name, mtimeMs: e.mtimeMs })));
  const newestLogPath = newest === null || runId === null ? null : join(runsDir, runId, 'logs', newest.name);
  const signals = newestLogPath === null
    ? { quota: null, overload: null, lastResultIsError: false }
    : parseSessionSignals(io.readTail(newestLogPath, LOG_TAIL_BYTES));

  const lock = io.readLock();

  return {
    nowMs,
    mode: config.mode,
    stopFilePresent: io.fileExists(join(homeDir, 'STOP')),
    lockHolder: lock === null ? null : { pid: lock.pid, alive: io.isProcessAlive(lock.pid) },
    run: runId === null ? null : {
      runId,
      runnerPid: childAlive ? (state.child as RunnerHandle).pid : recordPid,
      alive,
      endedAt: recordEndedAt,
      newestLogPath,
      newestLogMtimeMs: newest?.mtimeMs ?? null,
    },
    lastExitCode: state.ownedExitCode ?? (recordEndedAt !== null ? recordExitCode : null),
    crashSuspected: runId !== null && !alive && recordEndedAt === null && state.ownedExitCode === null,
    quota: signals.quota,
    overload: signals.overload,
    counters: state.counters,
    limits: {
      stallMinutes: config.stallMinutes,
      maxQuotaWaits: config.maxQuotaWaits,
      maxOverloadBackoffs: config.maxOverloadBackoffs,
      maxCrashRelaunches: config.maxCrashRelaunches,
      quotaGraceSeconds: config.quotaGraceSeconds,
    },
    fallbackModel: config.fallbackModel,
  };
}

export async function runWatchdog(
  config: WatchdogConfig,
  homeDir: string,
  io: WatchdogIO,
): Promise<WatchdogTerminal> {
  const paths = watchdogPathsOf(homeDir);
  const startedAt = io.now();
  const state: LoopState = {
    child: null, ownedExitCode: null, attempt: 0, model: config.model, runId: null,
    nextWakeAtMs: null, stall: null, runnerCommand: null,
    counters: {
      quotaWaits: 0, overloadBackoffs: 0, crashRelaunches: 0, lockRelaunches: 0,
      fallbackUsed: false,
    },
  };

  io.ensureDir(paths.dir);

  const publish = (
    stateName: string,
    lastAction: string,
    terminal: { status: string; reason: string; exitCode: number } | null,
    runnerPid: number | null,
  ): void => {
    io.writeFileAtomic(paths.status, serializeStatus(buildStatus({
      config: { mode: config.mode },
      pid: io.currentPid(),
      home: homeDir,
      startedAt,
      updatedAt: io.now(),
      state: stateName,
      lastAction,
      runId: state.runId,
      runnerPid,
      runnerCommand: state.runnerCommand,
      counters: state.counters,
      nextWakeAtMs: state.nextWakeAtMs,
      stall: state.stall,
      terminal,
    })));
  };

  const record = (action: string, detail: Record<string, unknown>): void => {
    io.appendFile(paths.events, serializeEvent({ at: io.now(), action, detail }));
  };

  // Spec §8: the Monitor loop the skill arms needs something to read within 5 s — so this is
  // the FIRST thing that happens, before any observation, spawn or sleep.
  publish('starting', 'start', null, null);
  record('start', { mode: config.mode, home: homeDir, pollSeconds: config.pollSeconds });

  const terminate = (status: string, reason: string, exitCode: number): WatchdogTerminal => {
    publish('terminal', `exit:${status}:${reason}`, { status, reason, exitCode }, null);
    record('exit', { status, reason, exitCode });
    return { exitCode, status, reason, statusPath: paths.status };
  };

  const spawnRunnerNow = (action: Extract<WatchdogAction, { kind: 'launch' | 'relaunch' }>): void => {
    state.attempt += 1;
    if (action.kind === 'relaunch') {
      if (action.cause === 'crash') state.counters.crashRelaunches += 1;
      if (action.cause === 'lock_free') state.counters.lockRelaunches += 1;
      if (action.model !== null) {
        state.counters.fallbackUsed = true;
        state.model = action.model;
      }
    }
    const stdoutPath = paths.runnerStdout(state.attempt);
    io.ensureDir(dirname(stdoutPath));
    const argv = [
      ...io.runnerCommand(),
      '--repo', config.repoRoot,
      '--model', state.model,
      '--home', homeDir,
      ...config.passthrough,
    ];
    state.runnerCommand = argv;
    state.child = io.spawnRunner(argv, { cwd: config.repoRoot, stdoutPath });
    state.ownedExitCode = null;
    state.nextWakeAtMs = null;
  };

  for (;;) {
    const observation = observe(config, homeDir, io, state);
    state.runId = observation.run?.runId ?? state.runId;
    const action = decide(observation);
    io.printLine(actionLine(action));

    switch (action.kind) {
      case 'launch':
      case 'relaunch': {
        record(action.kind, { cause: action.kind === 'relaunch' ? action.cause : 'initial', model: action.model });
        spawnRunnerNow(action);
        publish('runner_running', actionLine(action), null, state.child?.pid ?? null);
        if (config.mode === 'once') {
          return terminate('running', action.kind === 'launch' ? 'launched' : 'relaunched', 11);
        }
        break;
      }

      case 'attach': {
        record('attach', { runnerPid: action.runnerPid });
        publish('runner_running', actionLine(action), null, action.runnerPid);
        if (state.child !== null && state.ownedExitCode === null) {
          state.ownedExitCode = await state.child.waitFor(config.pollSeconds * 1000);
        } else {
          await io.sleep(config.pollSeconds * 1000);
        }
        break;
      }

      case 'wait_until': {
        if (action.cause === 'quota') state.counters.quotaWaits += 1;
        else state.counters.overloadBackoffs += 1;
        state.nextWakeAtMs = action.untilMs;
        record('wait_until', { cause: action.cause, untilMs: action.untilMs });
        publish(action.cause === 'quota' ? 'quota_wait' : 'overload_backoff', actionLine(action), null, null);
        // A wake-up LOOP, never one long sleep (spec §2.1 Never): a STOP file or a manual
        // relaunch is noticed within one slice, and nextWakeAt stays published throughout.
        while (io.nowMs() < action.untilMs) {
          const slice = Math.min(action.untilMs - io.nowMs(), config.pollSeconds * 1000);
          record('wait_slice', { ms: slice, remainingMs: action.untilMs - io.nowMs() });
          await io.sleep(slice);
          publish(action.cause === 'quota' ? 'quota_wait' : 'overload_backoff', actionLine(action), null, null);
          if (io.fileExists(join(homeDir, 'STOP'))) break;
        }
        state.nextWakeAtMs = null;
        break;
      }

      case 'stall': {
        state.stall = action.logPath === null || action.lastMtimeMs === null
          ? null
          : { logPath: action.logPath, lastMtimeMs: action.lastMtimeMs };
        record('stall', { logPath: action.logPath, lastMtimeMs: action.lastMtimeMs });
        return terminate(action.exit.status, action.exit.reason, action.exit.status === 'needs_human' ? 10 : 11);
      }

      case 'exit':
        return terminate(action.status, action.reason, exitCodeOf(action));
    }
  }
}
```

- [ ] **Step 3: Gates.**

```sh
cd plugins/tribe/scripts/runner
bun test core/watchdog/watch-loop.test.ts
bun test structure.test.ts
bun test && bunx tsc --noEmit
```

Expected: the loop's 12 tests pass in under a second (virtual clock); `structure.test.ts` green
(no world specifier, no `process.exit`, no `process.env` in `core/watchdog/watch-loop.ts`); full
suite `540 pass, 0 fail`; `tsc` silent.

- [ ] **Step 4: Commit** — `feat(runner): watchdog supervision loop with bounded wake-up waits (task 8/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 9: The `watchdog` subcommand (composition root)

**Files:** `cli/main.ts` (append one dispatch block + one helper) · `cli/main.test.ts` (append)

**Oracle.** Spec §2.1's exit codes and stdout contract, spec §8's containment requirement, and
the existing `reset-card` block in `cli/main.ts` as the structural precedent. A usage error is
exit `1` with a `watchdog:`-prefixed stderr line and **no** stack trace.

**Fence by intent.** `main()`'s existing run-loop path is untouched: the new block returns
before any of it, exactly as `reset-card` does. `cli/main.ts` still names no world module and
still reads no `process.env` (`structure.test.ts` enforces both).

**Governing quote** — spec §2.1, verbatim:
> Watchdog exit codes: `0` done · `10` needs_human (reason in status.json) · `11` running
> (`--once` only) · `1` usage error. Stdout: one human line per action; the last line names the
> status file.

**Adjudication rule — REFUTED in advance.**
- "the watchdog should be its own entrypoint file" — §0 decides; `run.ts` is the one path two
  external contracts already prove.
- "containment belongs in the loop" — no: refusing before anything is created is what makes it
  fail *closed*.
- "a missing `campaign-state.json` should be created" — the runner "requires but never creates"
  it (runner README, "State file schema"); the watchdog must not either.

**Steps**

- [ ] **Step 1: Failing test** — append to `cli/main.test.ts`:

```ts
import { resolveWatchdogHome } from './main.ts';

describe('resolveWatchdogHome — the watchdog subcommand gate (fail-closed)', () => {
  const io = {
    realpath: (p: string) => p.replace('/var/', '/private/var/'),
    userHome: () => '/var/t/home',
    cwd: () => '/private/var/t/home/.tribe/k/campaigns',
    fileExists: (p: string) => p === '/private/var/t/home/.tribe/k/campaigns/c/campaign-state.json',
  };

  test('an absolute home inside the realpathed tribe root is accepted (W-P10)', () => {
    const got = resolveWatchdogHome('/var/t/home/.tribe/k/campaigns/c', io);
    expect(got).toEqual({ homeDir: '/private/var/t/home/.tribe/k/campaigns/c' });
  });

  test('a RELATIVE home resolves against cwd — the shape a person types', () => {
    const got = resolveWatchdogHome('c', io);
    expect(got).toEqual({ homeDir: '/private/var/t/home/.tribe/k/campaigns/c' });
  });

  test('a home outside the tribe root is refused with a typed message, not a throw', () => {
    const got = resolveWatchdogHome('/tmp/elsewhere', io);
    expect('error' in got && got.error).toContain('is outside the tribe root');
  });

  test('a home with no campaign-state.json is refused by name', () => {
    const got = resolveWatchdogHome('/var/t/home/.tribe/k/campaigns/other', io);
    expect('error' in got && got.error).toBe(
      'watchdog: --home "/private/var/t/home/.tribe/k/campaigns/other" has no ' +
        'campaign-state.json — a campaign home is authored by the orchestrate-campaign ' +
        'skill before any runner or watchdog is started',
    );
  });
});
```

Run `bun test cli/main.test.ts`. Expected: red (`resolveWatchdogHome` not exported).

- [ ] **Step 2: Implement** — in `cli/main.ts`, add the imports and the exported helper above
  `main()`:

```ts
import { containHome, parseWatchdogArgs, resolveHomeArg } from '../core/watchdog/args.ts';
import { runWatchdog } from '../core/watchdog/watch-loop.ts';
import { buildWatchdogIo, withHome } from '../adapters/watchdog-io.adapter.ts';
import { WATCHDOG_EXIT_USAGE } from '../core/watchdog/model.ts';

/** The watchdog's fail-closed gate (spec §8): resolve `--home` the way a person typed it,
 * symlink-resolve BOTH it and the tribe root (W-P10 — a throwaway HOME under /var/folders
 * realpaths to /private/var/folders, so a string-prefix test would refuse a legitimate home),
 * prove containment, then prove the campaign actually exists. Exported for cli/main.test.ts;
 * takes only the slice of the seam it needs, like `scrubTargetEnvLocal` above. */
export function resolveWatchdogHome(
  rawHome: string,
  io: {
    realpath(p: string): string;
    userHome(): string;
    cwd(): string;
    fileExists(p: string): boolean;
  },
): { homeDir: string } | { error: string } {
  const absHome = io.realpath(resolveHomeArg(rawHome, io.cwd()));
  const tribeRoot = io.realpath(join(io.userHome(), '.tribe'));
  const contained = containHome(absHome, tribeRoot);
  if (!contained.ok) return { error: contained.error };
  if (!io.fileExists(campaignStatePathOf(absHome))) {
    return {
      error:
        `watchdog: --home "${absHome}" has no campaign-state.json — a campaign home is ` +
        'authored by the orchestrate-campaign skill before any runner or watchdog is started',
    };
  }
  return { homeDir: absHome };
}
```

and, as the FIRST block inside `main()` (before the existing `reset-card` block, so neither
changes the other's behaviour):

```ts
  if (argv[0] === 'watchdog') {
    const parsed = parseWatchdogArgs(argv.slice(1));
    if ('error' in parsed) {
      console.error(`watchdog: ${parsed.error}`);
      process.exit(WATCHDOG_EXIT_USAGE);
      return;
    }
    const baseIo = buildWatchdogIo();
    const home = resolveWatchdogHome(parsed.config.rawHome, baseIo);
    if ('error' in home) {
      console.error(home.error);
      process.exit(WATCHDOG_EXIT_USAGE);
      return;
    }
    const outcome = await runWatchdog(parsed.config, home.homeDir, withHome(baseIo, home.homeDir));
    console.log(`status: ${outcome.statusPath}`);
    process.exit(outcome.exitCode);
    return;
  }
```

- [ ] **Step 3: Gates.**

```sh
cd plugins/tribe/scripts/runner
bun test cli/main.test.ts
bun test structure.test.ts
bun test && bunx tsc --noEmit
# The subcommand answers by hand, fail-closed, with no stack trace:
bun run.ts watchdog --repo /repo --model opus --home /tmp/nope; echo "exit=$?"
bun run.ts watchdog --repo /repo --model opus; echo "exit=$?"
bun run.ts watchdog --dry-run; echo "exit=$?"
```

Expected: 4 new tests pass; `structure.test.ts` green; full suite `544 pass, 0 fail`; `tsc`
silent. The three hand invocations each print ONE `watchdog: ...` line on stderr with no
traceback and `exit=1`: respectively "is outside the tribe root", "missing required flag:
--home", "unknown flag: --dry-run".

- [ ] **Step 4: Commit** — `feat(runner): wire the watchdog subcommand into the composition root (task 9/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 10: Integration against a runner double — G1 and G3

**Files:** `fixtures/watchdog/runner-double.sh` (new) ·
`watchdog-integration.test.ts` (new, at the runner root)

**Oracle.** The card's G1 and G3, measured against a double that **mirrors the real runner's
observable contract**: the run record (`run.json` under `<home>/runs/<run-id>/`, `endedAt`/
`exitCode`/`reason` filled on exit), a `logs/` directory, the documented exit codes, and nothing
else. A double that invents a shape the real runner does not produce is the bug
(`fixtures-mirror-reality`).

**Fence by intent.** The double writes only where the real runner writes; the watchdog's own
directory stays untouched by it, so the "writes only under `watchdog/`" assertion keeps its
meaning. The double's own bookkeeping lives outside the campaign home entirely.

**Governing quote** — the card's G1, verbatim:
> Against a runner double that exits 3 after writing a session log containing a real-shaped
> `rate_limit_event{resetsAt}` (fixture copied from a real log), the watchdog waits until
> `resetsAt`, relaunches, and reaches `done` when the double then exits 0. Evidence: the events
> log shows `quota_wait → relaunch → done`; dead time after `resetsAt` ≤ 60 s; no `claude`
> process is spawned by the watchdog itself.

**Adjudication rule — REFUTED in advance.**
- "these tests should use the real runner" — G5 (Task 12) does exactly that; G1/G3 need a
  scripted death sequence no real runner can be made to produce on demand.
- "swapping `runnerCommand()` is a production escape hatch" — it is a port method, substituted
  in the test only; production has no flag or env var for it, and `status.json` always records
  the exact `runnerCommand` that ran, so a substitution can never be silent.
- "`no claude process is spawned` is unproven" — it is proven structurally: the double is the
  only program the watchdog spawns (asserted from `status.json.runnerCommand`), and the double
  spawns nothing.

**Steps**

- [ ] **Step 1: Write the double** — `fixtures/watchdog/runner-double.sh`:

```bash
#!/usr/bin/env bash
# runner-double.sh — mirrors the REAL campaign runner's OBSERVABLE contract, nothing more:
#   * writes <home>/runs/<run-id>/run.json (schema: runner README "Run record"), in flight
#     first (endedAt/exitCode/reason null), then finalized on exit;
#   * creates <home>/runs/<run-id>/logs/ and, when the scripted pass says so, one session log
#     named <card>-<session-id>.log carrying REAL fixture lines;
#   * exits with the scripted code (runner README "Exit codes").
# It never writes under <home>/watchdog/ (that directory belongs to the watchdog alone) and it
# never spawns anything. Its own attempt counter lives in $DOUBLE_STATE, outside the home.
#
# Scripted by env:
#   DOUBLE_PLAN     space-separated per-attempt specs: "<exit>:<fixture>[:<sleep-seconds>]"
#                   fixture is one of: none | quota | overload
#   DOUBLE_STATE    path to the attempt-counter file (outside the campaign home)
#   DOUBLE_RESET_S  epoch seconds to substitute for the quota fixture's resetsAt
#   DOUBLE_STALE_S  when set with a sleeping pass, back-date the session log by this many
#                   seconds (stall simulation)
set -euo pipefail

home=""; args=("$@")
for ((i = 0; i < ${#args[@]}; i++)); do
  [[ "${args[$i]}" == "--home" ]] && home="${args[$((i + 1))]}"
done
[[ -n "$home" ]] || { printf 'runner-double: --home is required\n' >&2; exit 1; }

state="${DOUBLE_STATE:?runner-double: DOUBLE_STATE is required}"
attempt=0
[[ -f "$state" ]] && attempt="$(cat "$state")"
next=$((attempt + 1)); printf '%s' "$next" > "$state"

read -r -a plan <<<"${DOUBLE_PLAN:-0:none}"
spec="${plan[$attempt]:-0:none}"
IFS=: read -r exit_code fixture sleep_seconds <<<"$spec"
sleep_seconds="${sleep_seconds:-0}"

run_id="$(date -u +%Y-%m-%dT%H-%M-%S-000Z)-d$next"
run_dir="$home/runs/$run_id"
mkdir -p "$run_dir/logs"

write_record() { # write_record <endedAt-or-null> <exitCode-or-null> <reason-or-null>
  python3 - "$run_dir/run.json" "$run_id" "$$" "$1" "$2" "$3" <<'PY'
import json, os, sys
path, run_id, pid, ended, code, reason = sys.argv[1:7]
record = {
    "v": 1, "runId": run_id, "pid": int(pid),
    "startedAt": "1970-01-01T00:00:00.000Z",
    "repo": "/repo", "statePath": "", "answersPath": "", "escalationsDir": "",
    "logsDir": os.path.join(os.path.dirname(path), "logs"), "argv": [],
    "endedAt": None if ended == "null" else ended,
    "exitCode": None if code == "null" else int(code),
    "reason": None if reason == "null" else reason,
}
tmp = path + ".tmp"
with open(tmp, "w") as fh:
    json.dump(record, fh, indent=2)
    fh.write("\n")
os.replace(tmp, path)
PY
}

write_record null null null   # in flight, exactly like the real runner right after the lock

log="$run_dir/logs/i-card-0000-$next.log"
fixtures="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
case "$fixture" in
  quota)
    sed "s/\"resetsAt\":1788392400/\"resetsAt\":${DOUBLE_RESET_S:-0}/" \
      "$fixtures/quota-real-429.log" > "$log" ;;
  overload) cp "$fixtures/overload-529.log" "$log" ;;
  none)     : ;;
  *) printf 'runner-double: unknown fixture %s\n' "$fixture" >&2; exit 1 ;;
esac

if [[ -n "${DOUBLE_STALE_S:-}" && -f "$log" ]]; then
  python3 -c 'import os,sys,time;t=time.time()-float(sys.argv[2]);os.utime(sys.argv[1],(t,t))' \
    "$log" "$DOUBLE_STALE_S"
fi

[[ "$sleep_seconds" == "0" ]] || sleep "$sleep_seconds"

case "$exit_code" in
  0) reason=done ;;
  2) reason=escalations_pending ;;
  3) reason=session_incomplete ;;
  5) reason=rulings_unratified ;;
  *) reason=error ;;
esac
write_record "$(date -u +%Y-%m-%dT%H:%M:%S.000Z)" "$exit_code" "$reason"
exit "$exit_code"
```

Then prove the double alone, before any watchdog runs it (the empty-fixture discipline from
`fixtures-mirror-reality`):

```sh
cd plugins/tribe/scripts/runner
chmod +x fixtures/watchdog/runner-double.sh
H=$(mktemp -d)/home; mkdir -p "$H"; S=$(mktemp -d)/attempts
DOUBLE_PLAN="3:quota 0:none" DOUBLE_STATE="$S" DOUBLE_RESET_S=$(( $(date +%s) + 5 )) \
  bash fixtures/watchdog/runner-double.sh --repo /repo --model opus --home "$H"; echo "exit=$?"
find "$H" -type f | sort
grep -o '"resetsAt":[0-9]*' "$H"/runs/*/logs/*.log
python3 -c "import json,glob;print(json.load(open(glob.glob('$H/runs/*/run.json')[0])))"
```

Expected: `exit=3`; the find lists exactly one `run.json` and one `logs/i-card-0000-1.log`;
`resetsAt` is the substituted future epoch, not `1788392400`; the record shows
`exitCode: 3`, `reason: 'session_incomplete'`, a non-null `endedAt`, and **nothing** under
`watchdog/`.

- [ ] **Step 2: Failing test** — `watchdog-integration.test.ts` at the runner root:

```ts
/**
 * Integration: the REAL edge (real fs, real processes, real sleeps, real pid probes) with only
 * the runner's IDENTITY swapped for the double. The pure core is already covered by table
 * tests; this proves the WIRING — the class of defect the runner README calls out ("Mocked
 * tests validate logic, not invocations").
 */
import { describe, expect, test } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runWatchdog } from './core/watchdog/watch-loop.ts';
import { buildWatchdogIo, withHome } from './adapters/watchdog-io.adapter.ts';
import type { WatchdogConfig } from './core/watchdog/model.ts';
import type { WatchdogIO } from './ports/ports.ts';

const DOUBLE = join(import.meta.dir, 'fixtures', 'watchdog', 'runner-double.sh');

interface Harness { home: string; statePath: string; io: WatchdogIO; lines: string[] }

function harness(plan: string, extraEnv: Record<string, string> = {}): Harness {
  const root = mkdtempSync(join(tmpdir(), 'wd-int-'));
  const home = join(root, '.tribe', 'k', 'campaigns', 'c');
  mkdirSync(home, { recursive: true });
  // A VALID minimal state (runner README "State file schema" — every required top-level key
  // present), even though only `fileExists` is consulted on this path: a fixture that could
  // not survive the real loader is a fixture that lies (fixtures-mirror-reality).
  writeFileSync(join(home, 'campaign-state.json'), JSON.stringify({
    v: 1, campaign: 'watchdog-int', mergePolicy: 'regular-merge-only', sequence: [],
    schemaLockPaths: [], docsOnlyPaths: [], ownerOnlyEscalations: [], cards: {},
  }));
  writeFileSync(join(home, 'answers.md'), '');
  const statePath = join(root, 'double-attempts');
  const lines: string[] = [];
  const base = buildWatchdogIo();
  const io: WatchdogIO = {
    ...withHome(base, home),
    printLine: (line) => { lines.push(line); },
    runnerCommand: () => ['bash', DOUBLE],
    spawnRunner: (argv, opts) => base.spawnRunner(argv, {
      ...opts,
      // The double is scripted by env; nothing about the watchdog's own argv changes.
      env: { ...process.env, DOUBLE_PLAN: plan, DOUBLE_STATE: statePath, ...extraEnv },
    } as Parameters<WatchdogIO['spawnRunner']>[1]),
  };
  return { home, statePath, io, lines };
}

const config = (over: Partial<WatchdogConfig> = {}): WatchdogConfig => ({
  repoRoot: process.cwd(), model: 'test-model', rawHome: 'x', mode: 'follow',
  stallMinutes: 30, maxQuotaWaits: 6, maxOverloadBackoffs: 5, maxCrashRelaunches: 1,
  quotaGraceSeconds: 1, pollSeconds: 1, fallbackModel: null, passthrough: [],
  ...over,
});

const events = (home: string) =>
  readFileSync(join(home, 'watchdog', 'events.jsonl'), 'utf8')
    .trim().split('\n').map((line) => JSON.parse(line) as { action: string; detail: Record<string, unknown> });
const status = (home: string) =>
  JSON.parse(readFileSync(join(home, 'watchdog', 'status.json'), 'utf8'));

describe('G1 — quota recovery without an LLM', () => {
  test('waits for the real reset instant, relaunches, and reaches done', async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 3;
    const h = harness('3:quota 0:none', { DOUBLE_RESET_S: String(resetAt) });
    const started = Date.now();
    const outcome = await runWatchdog(config(), h.home, h.io);
    const finished = Date.now();

    expect([outcome.exitCode, outcome.reason]).toEqual([0, 'runner_done']);
    expect(events(h.home).map((e) => e.action).filter((a) => a !== 'wait_slice'))
      .toEqual(['start', 'launch', 'wait_until', 'relaunch', 'exit']);

    // Dead time after the reset is under the card's 60 s bar (grace 1 s + one 1 s slice here).
    expect(finished - (resetAt + 1) * 1000).toBeLessThan(60_000);
    expect(finished - started).toBeGreaterThanOrEqual(2_000);

    // No claude process is spawned by the watchdog itself: the double is the ONLY program it
    // ran, and status.json records exactly what that was.
    expect(status(h.home).runnerCommand.slice(0, 2)).toEqual(['bash', DOUBLE]);
    expect(readFileSync(h.statePath, 'utf8')).toBe('2');
  }, 60_000);

  test('the quota wait publishes nextWakeAt while it waits', async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 3;
    const h = harness('3:quota 0:none', { DOUBLE_RESET_S: String(resetAt) });
    const seen: Array<string | null> = [];
    const spy: WatchdogIO = {
      ...h.io,
      writeFileAtomic: (p, c) => {
        h.io.writeFileAtomic(p, c);
        if (p.endsWith('status.json')) seen.push(JSON.parse(c).nextWakeAt);
      },
    };
    await runWatchdog(config(), h.home, spy);
    expect(seen.filter((v) => v !== null).length).toBeGreaterThan(0);
    expect(seen.filter((v) => v !== null)[0]).toBe(new Date((resetAt + 1) * 1000).toISOString());
  }, 60_000);
});

describe('G3 — every terminal state surfaces to the lead', () => {
  const cases: Array<[plan: string, exitCode: number, reason: string]> = [
    ['0:none', 0, 'runner_done'],
    ['2:none', 10, 'escalations_pending'],
    ['5:none', 10, 'rulings_unratified'],
    ['4:none', 10, 'error'],
    ['3:none 3:none', 10, 'session_incomplete'],
    ['3:overload 3:overload 3:overload 3:overload 3:overload 3:overload', 10, 'overloaded'],
  ];
  for (const [plan, exitCode, reason] of cases) {
    test(`plan "${plan}" ends ${exitCode}:${reason}`, async () => {
      const h = harness(plan);
      const outcome = await runWatchdog(
        config({ maxOverloadBackoffs: 2, quotaGraceSeconds: 1 }), h.home, h.io,
      );
      expect([outcome.exitCode, outcome.reason]).toEqual([exitCode, reason]);
      expect(status(h.home).terminal).toEqual({ status: outcome.status, reason, exitCode });
    }, 120_000);
  }

  test('--fallback-model relaunches once on the cheaper tier instead of parking', async () => {
    const h = harness('3:overload 3:overload 3:overload 0:none');
    const outcome = await runWatchdog(
      config({ maxOverloadBackoffs: 2, fallbackModel: 'test-fallback' }), h.home, h.io,
    );
    expect([outcome.exitCode, outcome.reason]).toEqual([0, 'runner_done']);
    expect(status(h.home).counters.fallbackUsed).toBe(true);
    expect(status(h.home).runnerCommand).toContain('test-fallback');
  }, 120_000);
});
```

**Note on the overload cases' wall clock:** the frozen backoff starts at 30 s, so a test that
let it run would take minutes. `maxOverloadBackoffs: 2` bounds it to 30 s + 60 s. If that is
still too slow in practice, cap the wait the way the loop already allows — pass
`pollSeconds: 1` and assert on `events.jsonl`'s `wait_until.detail.untilMs` instead of the
elapsed clock, and record the change in the report; **never weaken the frozen schedule
itself.**

Run `bun test watchdog-integration.test.ts`. Expected: red (the double's `env` option is not
part of the port yet — see step 3).

- [ ] **Step 3: Extend the spawn seam for env** — the double is env-scripted, so
  `spawnRunner`'s options gain one optional field in `ports/ports.ts`, and the adapter passes it
  through:

```ts
  spawnRunner(
    argv: string[],
    opts: { cwd: string; stdoutPath: string; env?: Record<string, string | undefined> },
  ): RunnerHandle;
```

In the adapter's `spawn(...)` call add `env: opts.env ?? process.env`. Production passes
nothing, so the runner inherits the watchdog's environment exactly as before — which matters:
the runner's own `ANTHROPIC_API_KEY` guard (fix-list P10) runs inside the spawned process and
must keep seeing the real environment.

- [ ] **Step 4: Gates.**

```sh
cd plugins/tribe/scripts/runner
bun test watchdog-integration.test.ts
bun test structure.test.ts && bun test && bunx tsc --noEmit
```

Expected: 9 integration tests pass (elapsed roughly 100-150 s, dominated by the two frozen
overload backoffs); `structure.test.ts` green; the full suite green with `0 fail`; `tsc` silent.

- [ ] **Step 5: Commit** — `test(runner): integration proof of G1 and G3 against a runner double (task 10/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 11: Integration — G2 (skip when alive) and G4 (stall)

**Files:** `watchdog-integration.test.ts` (append)

**Oracle.** The card's G2 and G4. G4's wall is frozen: the watchdog **records** a stall and, in
follow mode, exits `needs_human:stalled` — it never kills the runner. G2's wall: with a live
runner, a tick launches **nothing** and the single-instance lock stays single.

**Fence by intent.** The stall is detected from the session log's mtime (spec §8: "the only
liveness signal during a pass is the session log mtime"), and the stall event names the file and
its last mtime.

**Governing quote** — the card's G4, verbatim:
> While the runner is alive, if no file under the current run's `logs/` changed for longer than
> the threshold (default 30 min, the tribe's one staleness number), the watchdog records `stall`
> and, in follow mode, exits `needs_human:stalled`. It never kills the runner (the runner's own
> `--session-timeout` owns that).

**Adjudication rule — REFUTED in advance.**
- "the stall threshold should be configurable per campaign" — it is: `--stall-minutes`,
  defaulting to the tribe's one staleness number (30).
- "a stalled runner is left orphaned" — yes, by design; the exit hands a human the decision, and
  `status.json` names the pid and the stale log.

**Steps**

- [ ] **Step 1: Failing test** — append to `watchdog-integration.test.ts`:

```ts
describe('G2 — skip when alive (D74-7 adopt, never duplicate)', () => {
  test('a --once tick against a live runner reports running and launches nothing', async () => {
    const h = harness('0:none:6');
    // Start a pass and leave it running: a --follow watchdog owns the child, so we launch the
    // double directly, exactly as the real runner would have been launched by hand.
    const base = buildWatchdogIo();
    const handle = base.spawnRunner(['bash', DOUBLE, '--home', h.home], {
      cwd: process.cwd(),
      stdoutPath: join(h.home, 'watchdog', 'manual.log'),
      env: { ...process.env, DOUBLE_PLAN: '0:none:6', DOUBLE_STATE: h.statePath },
    } as Parameters<WatchdogIO['spawnRunner']>[1]);

    // Wait for the in-flight run record to appear (poll — there is no `timeout` binary here).
    for (let i = 0; i < 100 && !existsSync(join(h.home, 'runs')); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    writeFileSync(join(h.home, '.runner.lock'), JSON.stringify({
      pid: handle.pid, startedAt: new Date().toISOString(),
    }));

    const outcome = await runWatchdog(config({ mode: 'once' }), h.home, h.io);
    expect([outcome.exitCode, outcome.reason]).toEqual([11, 'runner_alive']);
    expect(events(h.home).map((e) => e.action)).not.toContain('launch');
    expect(readFileSync(h.statePath, 'utf8')).toBe('1'); // the double ran exactly once
    expect(status(h.home).runnerPid).toBe(handle.pid);
    await handle.waitFor(30_000);
  }, 60_000);

  test('a --follow watchdog started while a runner is live adopts it instead of relaunching', async () => {
    const h = harness('0:none:4');
    const base = buildWatchdogIo();
    const handle = base.spawnRunner(['bash', DOUBLE, '--home', h.home], {
      cwd: process.cwd(),
      stdoutPath: join(h.home, 'watchdog', 'manual.log'),
      env: { ...process.env, DOUBLE_PLAN: '0:none:4', DOUBLE_STATE: h.statePath },
    } as Parameters<WatchdogIO['spawnRunner']>[1]);
    for (let i = 0; i < 100 && !existsSync(join(h.home, 'runs')); i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    writeFileSync(join(h.home, '.runner.lock'), JSON.stringify({
      pid: handle.pid, startedAt: new Date().toISOString(),
    }));

    const outcome = await runWatchdog(config(), h.home, h.io);
    expect([outcome.exitCode, outcome.reason]).toEqual([0, 'runner_done']);
    const actions = events(h.home).map((e) => e.action);
    expect(actions).toContain('attach');
    expect(actions).not.toContain('launch');
    expect(readFileSync(h.statePath, 'utf8')).toBe('1');
  }, 60_000);
});

describe('G4 — stall detection from log mtime, never a kill', () => {
  test('a live runner whose newest log has not changed past the threshold parks for a human', async () => {
    // The double sleeps 8 s and back-dates its session log by 45 minutes.
    const h = harness('0:none:8', { DOUBLE_STALE_S: String(45 * 60) });
    const outcome = await runWatchdog(config({ stallMinutes: 30 }), h.home, h.io);

    expect([outcome.exitCode, outcome.reason]).toEqual([10, 'stalled']);
    const stallEvent = events(h.home).find((e) => e.action === 'stall');
    expect(String(stallEvent?.detail.logPath)).toContain('/logs/i-card-0000-1.log');
    expect(typeof stallEvent?.detail.lastMtimeMs).toBe('number');

    const published = status(h.home);
    expect(published.stall.logPath).toContain('/logs/i-card-0000-1.log');
    expect(published.terminal).toEqual({ status: 'needs_human', reason: 'stalled', exitCode: 10 });

    // Never kills: the runner it left behind is still alive right after the watchdog exited.
    expect(buildWatchdogIo().isProcessAlive(published.runnerPid)).toBe(true);
  }, 60_000);

  test('a fresh log keeps the wait going — no false stall', async () => {
    const h = harness('0:none:3');
    const outcome = await runWatchdog(config({ stallMinutes: 30 }), h.home, h.io);
    expect([outcome.exitCode, outcome.reason]).toEqual([0, 'runner_done']);
    expect(events(h.home).map((e) => e.action)).not.toContain('stall');
  }, 60_000);
});

describe('W-P9 — the watchdog writes nothing outside home/watchdog', () => {
  test('after a full quota-recovery run, the only new home paths are the runner_s own', async () => {
    const resetAt = Math.floor(Date.now() / 1000) + 2;
    const h = harness('3:quota 0:none', { DOUBLE_RESET_S: String(resetAt) });
    const written: string[] = [];
    const spy: WatchdogIO = {
      ...h.io,
      writeFileAtomic: (p, c) => { written.push(p); h.io.writeFileAtomic(p, c); },
      appendFile: (p, c) => { written.push(p); h.io.appendFile(p, c); },
    };
    await runWatchdog(config(), h.home, spy);
    expect(written.length).toBeGreaterThan(3);
    for (const path of written) {
      expect(path.startsWith(join(h.home, 'watchdog'))).toBe(true);
    }
    // And nothing the runner owns was touched by the watchdog.
    expect(existsSync(join(h.home, 'answers.md'))).toBe(false);
    expect(JSON.parse(readFileSync(join(h.home, 'campaign-state.json'), 'utf8')).sequence)
      .toEqual([]);
  }, 60_000);
});
```

Add `existsSync` to the file's `node:fs` import list.

Run `bun test watchdog-integration.test.ts`. Expected: red on the new blocks first (the `env`
option on the manual spawns and the stall wiring), green after step 2.

- [ ] **Step 2: Make it green** — no new production behaviour should be required. If a test
  fails for a *product* reason (for example the stall check firing on a run whose log the double
  back-dated before the run record appeared), fix it in `core/watchdog/*` under the same rules
  and record the fix in the report. If a test fails because the frozen action table would have
  to change, **stop and report `NEEDS_CONTEXT`** — that is a spec question, not a bug.

- [ ] **Step 3: Gates.**

```sh
cd plugins/tribe/scripts/runner
bun test watchdog-integration.test.ts
bun test && bunx tsc --noEmit
```

Expected: all integration tests pass; full suite `0 fail`; `tsc` silent.

- [ ] **Step 4: Commit** — `test(runner): integration proof of G2 skip-when-alive and G4 stall (task 11/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 12: G5 — one e2e against the REAL runner, from an empty home

**Files:** `plugins/tribe/scripts/tests/test-watchdog-e2e.sh` (new)

**Oracle.** The card's G5 as amended by measurement (see the box below): the real runner, a
throwaway campaign home built from nothing, a card whose spec/plan do not exist → the runner
escalates `planning_needed`, spawns **zero** sessions, and the watchdog reports
`needs_human:escalations_pending`. `fixtures-mirror-reality` application 1 is binding: the
watchdog is invoked with **both** a relative and an absolute `--home`.

> **Measured, on `master` @ `8b73151`, 2026-09-03 (this is the amendment):** a home containing
> ONLY `campaign-state.json` makes the real runner **exit 4** with the message
> `campaign runner: unexpected error: ENOENT: no such file or directory, open` followed by the
> campaign home's own `answers.md` path. Adding an EMPTY `answers.md` produces exactly the spec's expectation:
> `[E1] escalated`, exit `2`, `campaign-report.json` `reason: "escalations_pending"`,
> `escalations/E1.md` with `**Reason:** planning_needed`, and **no `logs/` directory at all**
> (zero sessions, zero tokens). So "an EMPTY throwaway home built from nothing" means the
> minimal home the orchestrate-campaign skill authors: `campaign-state.json` + `answers.md`.
> The ENOENT crash is a **pre-existing runner defect, out of this card's fence** (the fence
> forbids runner-core changes) — recorded as follow-up **FU-i74-1** for the Shaman, and the
> test asserts BOTH behaviours so the defect cannot regress silently in either direction.

**Fence by intent.** The test creates its own `HOME`, its own git repo and its own campaign
home; it never reads or writes `~/.tribe` and never invokes `gh`. There is **no `timeout`
binary on this machine** — every wait is a poll loop with a bounded iteration count.

**Governing quote** — spec §6 step 3, verbatim:
> Replay G5 myself: create a throwaway home with a one-card state whose spec/plan paths do
> not exist; run the watchdog `--follow` with the real runner; expect exit 10, status reason
> `escalations_pending`, `events.jsonl` with `launch` then `exit`, no session log.

**Adjudication rule — REFUTED in advance.**
- "the empty home should have no `answers.md` either, per spec §8" — measured above; with none,
  the RUNNER crashes before the watchdog can observe anything, which proves nothing about the
  watchdog. Both cases are asserted.
- "the test should also cover a real shipped card" — out of fence: that needs a disposable
  GitHub repo (the runner README's own "still UNVERIFIED against reality" note).

**Steps**

- [ ] **Step 1: Write the test** — `plugins/tribe/scripts/tests/test-watchdog-e2e.sh`:

```bash
#!/usr/bin/env bash
# test-watchdog-e2e.sh — G5: ONE end-to-end run of the REAL campaign runner under the REAL
# watchdog, against a throwaway campaign home built from nothing. No double, no mock, no gh,
# no session spawn (the card's spec/plan do not exist, so the runner escalates
# planning_needed and never starts a session — zero tokens).
#
# fixtures-mirror-reality: the watchdog is invoked BOTH ways a person can invoke it — with an
# absolute --home and with a relative one from inside the campaigns directory.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$HERE/../runner"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check()    { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2, want: $3)"; fi }
contains() { if [[ "$2" == *"$3"* ]]; then ok "$1"; else bad "$1 (got: $2, want substring: $3)"; fi }

# A throwaway machine: its own HOME, so the watchdog's --home containment root is this
# temp tree and nothing here can touch the real ~/.tribe.
export HOME="$TMP/home"; mkdir -p "$HOME"

# A throwaway target repo (the runner runs git in it; it never needs a remote for this path).
REPO="$TMP/repo"; git init -q -b master "$REPO"
git -C "$REPO" -c user.email=t@t.test -c user.name=t commit -q --allow-empty -m init

CAMPAIGNS="$HOME/.tribe/key/campaigns"
new_home() { # new_home <slug> [--with-answers]
  local home="$CAMPAIGNS/$1"; mkdir -p "$home"
  cat > "$home/campaign-state.json" <<'JSON'
{
  "v": 1,
  "campaign": "watchdog-e2e",
  "mergePolicy": "regular-merge-only",
  "sequence": ["E1"],
  "schemaLockPaths": [],
  "docsOnlyPaths": [],
  "ownerOnlyEscalations": [],
  "cards": {
    "E1": {
      "status": "staged",
      "spec": "docs/never-authored-spec.md",
      "plan": "docs/never-authored-plan.md",
      "branch": null,
      "baseSha": null,
      "pr": null,
      "mergeSha": null,
      "sessionId": null,
      "updatedAt": null
    }
  }
}
JSON
  [[ "${2:-}" == "--with-answers" ]] && : > "$home/answers.md"
  printf '%s' "$home"
}

# --- Probe 1: the minimal real home (state + answers), ABSOLUTE --home ------------------
H1="$(new_home abs --with-answers)"
set +e
out_abs="$(bun "$RUNNER/run.ts" watchdog --repo "$REPO" --model e2e-model --home "$H1" \
  --poll-seconds 1 2>&1)"
rc_abs=$?
set -e
check "absolute --home: the watchdog exits 10 (needs_human)" "$rc_abs" "10"
contains "and its last stdout line names the status file" "$out_abs" "status: $H1/watchdog/status.json"

reason="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["terminal"]["reason"])' \
  "$H1/watchdog/status.json")"
check "status.json reason is escalations_pending" "$reason" "escalations_pending"

actions="$(python3 - "$H1/watchdog/events.jsonl" <<'PY'
import json, sys
with open(sys.argv[1]) as fh:
    print(",".join(json.loads(line)["action"] for line in fh if line.strip()))
PY
)"
check "events.jsonl records start,launch,exit" "$actions" "start,launch,exit"

# Zero sessions spawned: the real runner never created a logs/ dir for this pass.
if [[ -z "$(find "$H1/runs" -type d -name logs 2>/dev/null)" ]]; then
  ok "zero session logs: the runner spawned no session (zero tokens)"
else
  bad "zero session logs (found: $(find "$H1/runs" -type d -name logs))"
fi

# The runner's own report agrees with the watchdog's verdict (exit code is a hint, the report
# is the truth — runner README).
runner_reason="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["run"]["reason"])' \
  "$H1/campaign-report.json")"
check "the runner's own report says escalations_pending" "$runner_reason" "escalations_pending"
if [[ -f "$H1/escalations/E1.md" ]]; then ok "the escalation file exists"; else bad "the escalation file exists"; fi
contains "and names the planning_needed reason" "$(cat "$H1/escalations/E1.md")" "planning_needed"

# W-P9: the watchdog wrote nothing outside <home>/watchdog/.
wd_only=1
while IFS= read -r f; do
  case "$f" in
    "$H1"/watchdog/*) ;;
    "$H1"/campaign-state.json|"$H1"/answers.md|"$H1"/campaign-report.*|"$H1"/escalations/*|"$H1"/runs/*|"$H1"/reports/*) ;;
    *) wd_only=0; printf 'unexpected path: %s\n' "$f" ;;
  esac
done < <(find "$H1" -type f)
check "no path outside home/watchdog or the runner's own artifacts" "$wd_only" "1"

# --- Probe 2: the same thing with a RELATIVE --home (the shape a person types) ----------
H2="$(new_home rel --with-answers)"
set +e
out_rel="$(cd "$CAMPAIGNS" && bun "$RUNNER/run.ts" watchdog --repo "$REPO" --model e2e-model \
  --home rel --poll-seconds 1 2>&1)"
rc_rel=$?
set -e
check "relative --home: the watchdog exits 10 too" "$rc_rel" "10"
contains "and resolved it to the same absolute campaign home" "$out_rel" "$H2/watchdog/status.json"
reason_rel="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["terminal"]["reason"])' \
  "$H2/watchdog/status.json")"
check "relative --home reaches the same verdict" "$reason_rel" "escalations_pending"

# --- Probe 3: a home with NO answers.md — the pre-existing runner ENOENT (FU-i74-1) -----
# Documented, not fixed here (runner-core changes are outside this card's fence). The
# watchdog must still report a clean typed outcome rather than a stack trace of its own.
H3="$(new_home bare)"
set +e
out_bare="$(bun "$RUNNER/run.ts" watchdog --repo "$REPO" --model e2e-model --home "$H3" \
  --poll-seconds 1 2>&1)"
rc_bare=$?
set -e
check "a home with no answers.md still ends in a clean watchdog exit 10" "$rc_bare" "10"
reason_bare="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["terminal"]["reason"])' \
  "$H3/watchdog/status.json")"
check "and the reason is the runner's exit-4 mapping, not a crash" "$reason_bare" "error"
case "$out_bare" in
  *"at "*"("*.ts:*) bad "the watchdog never prints a stack trace" ;;
  *)                ok "the watchdog never prints a stack trace" ;;
esac

# --- Probe 4: containment refusals are typed, one line, exit 1 --------------------------
set +e
out_out="$(bun "$RUNNER/run.ts" watchdog --repo "$REPO" --model e2e-model --home "$TMP/outside" 2>&1)"
rc_out=$?
set -e
check "a --home outside the tribe root exits 1" "$rc_out" "1"
contains "with a typed refusal naming the root" "$out_out" "is outside the tribe root"

set +e
mkdir -p "$CAMPAIGNS/nostate"
out_nostate="$(bun "$RUNNER/run.ts" watchdog --repo "$REPO" --model e2e-model \
  --home "$CAMPAIGNS/nostate" 2>&1)"
rc_nostate=$?
set -e
check "a --home with no campaign-state.json exits 1" "$rc_nostate" "1"
contains "with a typed refusal naming the missing file" "$out_nostate" "has no campaign-state.json"

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
```

- [ ] **Step 2: Run it, and capture the evidence the PR needs.**

```sh
cd /Users/hip/repo/todd-skills-wt/i74-watchdog
bash plugins/tribe/scripts/tests/test-watchdog-e2e.sh
```

Expected: `18 passed, 0 failed`. Then capture the G5 artefacts for the PR body by re-running
the absolute-`--home` probe by hand and pasting the command line, the resulting
`watchdog/status.json` and `watchdog/events.jsonl` verbatim into
`docs/superpowers/evidence/2026-09-03-mechanical-heartbeat-g5.md` (created in this task) —
the card's G5 asks for exactly "command lines + `status.json` + `events.jsonl` in the PR".

- [ ] **Step 3: Gates.**

```sh
cd /Users/hip/repo/todd-skills-wt/i74-watchdog
bash plugins/tribe/scripts/tests/test-watchdog-e2e.sh
bash plugins/tribe/scripts/tests/test-fresh-machine.sh
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
```

Expected: e2e `0 failed`; `test-fresh-machine.sh` still `26 passed, 0 failed` (the watchdog adds
no installable, so this must not move); full runner suite green; `tsc` silent.

- [ ] **Step 4: Commit** — `test(tribe): G5 e2e — real runner under the real watchdog from an empty home (task 12/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 13: The detached launch — Stage B's one-liner, proven

**Files:** `plugins/tribe/scripts/tests/test-watchdog-detached.sh` (new) ·
`plugins/tribe/skills/orchestrate-campaign/SKILL.md` (Stage B step 2 + step 3, Stage C step 2)

**Oracle.** Spec §8's macOS row. The detachment mechanism is a **shell pattern**, not watchdog
code, so the proof is: (a) the exact one-liner reparents its child to pid 1 and survives the
launching shell's exit, and (b) the one-liner in `SKILL.md` is byte-identical to the one the
test proves. **`setsid` does not exist on macOS** — using it is the defect this task exists to
prevent.

**Fence by intent.** SKILL.md edits are additive: Stage B keeps its `--dry-run` step and its
CLI-contract table; the watchdog becomes the primary launch and the bare-runner launch is
retained as the documented fallback. No other stage's wording changes.

**Governing quote** — spec §8, verbatim:
> macOS has no `setsid`; a plain harness background Bash dies at the 10-minute tool timeout;
> `( nohup … & )` double-fork survived. §2.2 integration: the orchestrate-campaign skill
> launches the watchdog **detached** via a documented one-liner (double-fork, `nohup`, stdin
> from `/dev/null`) and then arms a Monitor/`until` loop on `status.json` for the wake-up.

**Adjudication rule — REFUTED in advance.**
- "the test should prove survival past the 10-minute tool timeout" — a 10-minute test is not a
  test anyone runs; `ppid == 1` plus survival of the parent's exit is the mechanical proof of
  the same property, in under two seconds.
- "the probe should be the watchdog itself" — then the test would have to keep a real runner
  alive to observe anything, i.e. spawn real sessions. The pattern is proven with a trivial
  probe; the watchdog's own detached behaviour is covered by G5 (Task 12), whose terminal
  `status.json` lands after the launching subshell has already exited.
- "`nohup` alone is enough" — the parenthesised subshell (double-fork) is what reparents to pid
  1; the spec records that this is what actually survived.

**Steps**

- [ ] **Step 1: Write the test** — `plugins/tribe/scripts/tests/test-watchdog-detached.sh`:

```bash
#!/usr/bin/env bash
# test-watchdog-detached.sh — the detached-launch contract from spec §8.
#
# Two walls:
#   1. the documented one-liner really detaches (child reparented to pid 1, survives the
#      launching shell's exit) — on macOS, where `setsid` does not exist;
#   2. SKILL.md's Stage B carries that exact one-liner and never mentions setsid.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SKILL="$HERE/../../skills/orchestrate-campaign/SKILL.md"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check()    { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2, want: $3)"; fi }
contains() { if [[ "$2" == *"$3"* ]]; then ok "$1"; else bad "$1 (got: $2, want substring: $3)"; fi }

# --- Wall 1: the pattern detaches ------------------------------------------------------
# A launching shell that exits IMMEDIATELY after starting a long-lived probe the exact way
# Stage B starts the watchdog. `-p` prints the child's pid via the pidfile it writes.
PIDFILE="$TMP/probe.pid"; MARKER="$TMP/probe.done"
bash -c "
  cd '$TMP'
  ( nohup bash -c 'printf %s \$\$ > \"$PIDFILE\"; sleep 20; : > \"$MARKER\"' \
      </dev/null >'$TMP/probe.log' 2>&1 & )
"   # <- this shell has now EXITED; anything still running is detached from it

# Poll for the pidfile (no `timeout` binary on macOS).
probe_pid=""
for _ in $(seq 1 100); do
  [[ -s "$PIDFILE" ]] && { probe_pid="$(cat "$PIDFILE")"; break; }
  sleep 0.05
done
if [[ -n "$probe_pid" ]]; then ok "the launched probe reported its pid"; else bad "the launched probe reported its pid"; fi

if kill -0 "$probe_pid" 2>/dev/null; then
  ok "the probe is still alive after its launching shell exited"
else
  bad "the probe is still alive after its launching shell exited"
fi
ppid="$(ps -o ppid= -p "$probe_pid" | tr -d ' ')"
check "the probe was reparented to pid 1 (double-fork worked, no setsid needed)" "$ppid" "1"
kill "$probe_pid" 2>/dev/null || true

# --- Wall 2: SKILL.md documents exactly this pattern -----------------------------------
skill_text="$(cat "$SKILL")"
contains "Stage B launches the watchdog subcommand"      "$skill_text" 'run.ts" watchdog'
contains "and does so with the double-fork one-liner"    "$skill_text" '( nohup bun'
contains "with stdin from /dev/null"                     "$skill_text" '</dev/null'
contains "and arms a wake-up loop on status.json"        "$skill_text" 'watchdog/status.json'
contains "and states that no /loop heartbeat is needed"  "$skill_text" 'no `/loop` heartbeat'
case "$skill_text" in
  *setsid*) bad "SKILL.md never tells a macOS user to run setsid (it does not exist there)" ;;
  *)        ok  "SKILL.md never tells a macOS user to run setsid (it does not exist there)" ;;
esac

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
```

- [ ] **Step 2: Edit `SKILL.md` Stage B step 2** — replace the bare-runner background launch
  with the watchdog launch, keeping the runner invocation as the documented fallback:

```markdown
2. **Then launch the WATCHDOG in the background** (the runner's `watchdog` subcommand, same
   flags, no `--dry-run`). The watchdog supervises one runner pass at **zero token cost**: on an
   account-limit death it waits until the recorded reset and relaunches; on an upstream-overload
   death it backs off and relaunches; on a crash it relaunches once; and it exits ONLY when a
   human decision is needed. **No `/loop` heartbeat is needed while a watchdog is attached** —
   that 15-minute LLM tick is exactly what this replaces (issue #74, fixlist P14).

   Launch it **detached**, with this one-liner. The parenthesised subshell double-forks so the
   process is reparented to pid 1 and survives both this shell and the harness's tool timeout;
   `nohup` detaches it from the terminal; stdin comes from `/dev/null` so it can never block on
   a read. (macOS has no `setsid` — do not reach for it.)

   ```sh
   ( nohup bun "$runner_dir/run.ts" watchdog \
       --repo <target-repo> \
       --model <model> \
       --home "$(plugins/tribe/scripts/tribe-home.sh <target-repo>)/campaigns/<campaign-slug>" \
       </dev/null >"$(plugins/tribe/scripts/tribe-home.sh <target-repo>)/campaigns/<campaign-slug>/watchdog/launch.log" 2>&1 & )
   ```

   Then arm a wake-up loop on the watchdog's own status file — it writes `status.json` within 5
   seconds of starting, and fills in `terminal` only when it is done:

   ```sh
   until [ "$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["terminal"] is not None)' \
     "<campaign-home>/watchdog/status.json" 2>/dev/null)" = "True" ]; do sleep 60; done
   ```

   Record the exact command, the start time, and the campaign home in your working notes.
   `status.json` answers "what is it doing right now" (including `nextWakeAt` while it is
   waiting out an account limit) without costing a token.

   The **bare runner** launch is still available when you deliberately want a single
   unsupervised pass (a scoped `--cards … --max-cards 1` smoke run, say):

   ```sh
   bun "$runner_dir/run.ts" \
     --repo <target-repo> \
     --model <model> \
     --home "$(plugins/tribe/scripts/tribe-home.sh <target-repo>)/campaigns/<campaign-slug>"
   ```
```

and Stage B step 3:

```markdown
3. **On the wake-up, read `<campaign-home>/watchdog/status.json` FIRST, then
   `campaign-report.json`.** The watchdog's `terminal.reason` says why supervision ended
   (`runner_done` · `escalations_pending` · `rulings_unratified` · `session_incomplete` ·
   `quota_cap` · `overloaded` · `stalled` · `lock_conflict` · `error` · `stop_requested`) and
   its `counters` say what it already absorbed for you (quota waits, overload backoffs, crash
   relaunches). Then read `campaign-report.json` for the campaign truth: **the exit code is a
   hint, the report is the truth** — that has not changed.

   | Watchdog exit | Meaning |
   | --- | --- |
   | `0` | Reached `done` (or `STOP` was honoured) — read the report and go to Stage D. |
   | `10` | A human decision is needed; `status.json`'s `terminal.reason` names which. Go to Stage C. |
   | `11` | `--once` only: a pass is still in flight (or was just started). Not used by Stage B. |
   | `1` | Usage error — the message on stderr names the flag or the refused `--home`. |
```

and Stage C step 2 — re-trigger through the watchdog, same one-liner plus `--cards`:

```markdown
   ```sh
   ( nohup bun "$runner_dir/run.ts" watchdog \
       --repo <target-repo> \
       --model <model> \
       --home "$(plugins/tribe/scripts/tribe-home.sh <target-repo>)/campaigns/<campaign-slug>" \
       --cards <answered-card-id>,<not-reached-card-id> \
       </dev/null >>"<campaign-home>/watchdog/launch.log" 2>&1 & )
   ```
   (Stage C re-triggers go through the watchdog too, so an account limit hit mid-round-trip
   costs a wait instead of a dead campaign. The bare-runner form above still works for a
   deliberate single pass.)
```

Also add one row to Stage B's "runner's CLI contract" table, immediately after `--include-escalated`:

```markdown
| `watchdog` (subcommand) | — | `bun "$runner_dir/run.ts" watchdog <same flags>` supervises one runner pass at zero token cost: `--follow` (default) or `--once`, plus `--stall-minutes` (30), `--max-quota-waits` (6), `--max-overload-backoffs` (5), `--max-crash-relaunches` (1), `--quota-grace-seconds` (30), `--poll-seconds` (30), `--fallback-model <tier>`. Writes `<home>/watchdog/status.json` and `events.jsonl`; exits `0` done · `10` needs_human · `11` running (`--once`) · `1` usage. See `scripts/runner/README.md`'s "Watchdog" section. |
```

- [ ] **Step 3: Gates.**

```sh
cd /Users/hip/repo/todd-skills-wt/i74-watchdog
bash plugins/tribe/scripts/tests/test-watchdog-detached.sh
grep -n "watchdog" plugins/tribe/skills/orchestrate-campaign/SKILL.md | head -20
grep -c "setsid" plugins/tribe/skills/orchestrate-campaign/SKILL.md || true
bash plugins/tribe/scripts/tests/test-fresh-machine.sh
```

Expected: `10 passed, 0 failed` from the detached test; the grep shows Stage B naming the
watchdog as the primary launch (spec §6 step 5's check); `grep -c setsid` prints `0`;
`test-fresh-machine.sh` still `26 passed, 0 failed`.

- [ ] **Step 4: Commit** — `feat(tribe): Stage B launches the watchdog detached, with a proven one-liner (task 13/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 14: Documentation and the fixlist rows

**Files:** `plugins/tribe/scripts/runner/README.md` (new "Watchdog" section) ·
`plugins/tribe/README.md` (one section + one quick-reference row) ·
`docs/tribe/fixlists/2026-08-08-outstanding-17/README.md` (P13 + P14 rows)

**Oracle.** Spec §2.2's documentation list and the card's G6. Every documented flag, exit code,
file and table row must match the code that exists at this point in the branch — a doc claim
that the tests do not back is the defect this task must not introduce.

**Fence by intent.** Documentation only; no behaviour changes. `doctor.sh` and `install.sh` are
deliberately **not** edited, and the docs say why.

**Governing quote** — spec §2.2, verbatim:
> `plugins/tribe/scripts/runner/README.md`: a "Watchdog" section (flags, exit codes,
> files, the action table). `plugins/tribe/README.md`: one paragraph + quick-reference row.
> `plugins/tribe/scripts/doctor.sh`: unchanged unless a new prerequisite exists.
> `docs/tribe/fixlists/2026-08-08-outstanding-17/README.md`: P14 row → "SUPERSEDED by #74
> (watchdog)"; P13 row gains a note that the adopt-on-start behaviour covers the harness-kill
> case without a detached launch.

**Adjudication rule — REFUTED in advance.**
- "`doctor.sh` was in the scope fence and was not edited" — spec §2.2 says "unchanged unless a
  new prerequisite exists"; there is none (bun only, already checked, and the watchdog shares
  the runner's `node_modules`). The runner README states this explicitly.
- "`install.sh --list` should mention the watchdog" — `--list` enumerates plugins with agent and
  skill counts (verified output), not scripts; the watchdog is repo-invoked like the runner
  itself.
- "P13's note contradicts Task 13's detached launch" — no: adopt-on-start makes a *relaunched*
  watchdog attach rather than double-spawn; the detached launch makes the *first* one survive.
  Both are recorded, and the P13 note says exactly that.

**Steps**

- [ ] **Step 1: Runner README** — insert a `## Watchdog (card i74, issue #74)` section directly
  after `## Exit codes`, containing: what it is (one paragraph, D74-2's notification model), the
  invocation, the flag table, the exit-code table, the files it writes, the **frozen action
  table copied from the spec**, the counters/caps, the stall rule, and a "What it never does"
  list (never kills, never writes outside `<home>/watchdog/`, never spawns an LLM, never touches
  `answers.md`/`campaign-state.json`/escalations, never installs anything, needs no prerequisite
  beyond the runner's own — which is why `doctor.sh` is unchanged). Close with the two known
  limitations, stated honestly:

```markdown
### Known limitations (watchdog)

- **A crash of the watchdog itself is not resumed automatically.** `status.json` is left with
  `terminal: null` and a dead `pid` — exactly the shape the status viewer uses to detect a dead
  runner. Relaunching the watchdog is safe and is the intended recovery: adopt-on-start (D74-7)
  attaches to a live runner instead of starting a second one.
- **A runner that dies with NO `answers.md` in the campaign home exits `4`, not `2`.** Measured
  2026-09-03: the runner throws `ENOENT … answers.md` before it can escalate. The watchdog maps
  that faithfully to `needs_human:error`; it does not paper over it. Follow-up FU-i74-1 (runner
  card) is to treat a missing `answers.md` as "no rulings".
```

- [ ] **Step 2: Tribe README** — add a `## Campaign watchdog` section immediately after
  `## Campaign runner` (one paragraph plus the detached one-liner and the `status.json`/exit-code
  summary, pointing at the runner README for the full contract), and one Quick-reference row.
  Keep it short; the runner README is the reference.

- [ ] **Step 3: Fixlist rows** — in `docs/tribe/fixlists/2026-08-08-outstanding-17/README.md`,
  edit exactly two table rows and their two narrative paragraphs (lines ~229 and ~232):

```markdown
| P13 | Harness externally kills background runner tasks       | ×2, ~2 min recovery each              | WON'T-FIX (ratified — mitigation works); **mitigation strengthened by #74**: the watchdog adopts a live runner on start (D74-7) instead of double-spawning, and Stage B now launches it double-forked so a harness tool timeout no longer reaches it |
| P14 | Quota pause kills the running session                  | 27 min dead time                      | **SUPERSEDED by #74 (watchdog)** — the 15-minute LLM heartbeat is replaced by a zero-token supervisor that waits until the log's own `resetsAt` and relaunches; the "cron heartbeat = design" ruling is retired (card `i74-mechanical-heartbeat`, D74-1) |
```

- [ ] **Step 4: Gates.**

```sh
cd /Users/hip/repo/todd-skills-wt/i74-watchdog
grep -n "SUPERSEDED by #74" docs/tribe/fixlists/2026-08-08-outstanding-17/README.md
grep -n "^## Watchdog" plugins/tribe/scripts/runner/README.md
grep -n "Campaign watchdog" plugins/tribe/README.md
bash install.sh --list
# Every flag the docs claim, answered by the code itself:
cd plugins/tribe/scripts/runner && bun run.ts watchdog --help 2>&1 | head -3 || true
bun run.ts watchdog --repo /r --model m --home /nope --nonsense 2>&1; echo "exit=$?"
```

Expected: both fixlist rows found; both README sections found; `install.sh --list` output
identical to `master`'s (9 plugins, `tribe (agents: 6 skills: 2)`); the unknown-flag invocation
prints `watchdog: unknown flag: --nonsense` with `exit=1`. (`--help` is not implemented and need
not be — the `||  true` keeps the gate honest about that.)

- [ ] **Step 5: Commit** — `docs(tribe): document the watchdog and retire fixlist P14 (task 14/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## Task 15: Governance — ADR, change-unit, `c3-215` sync

**Files:** `.c3/documents/adr/*` and `.c3/changes/<adr-id>/*` (created by the wrapper) ·
`.c3/c3-2-plugins/c3-215-tribe.md` (patched **only** through the change-unit)

**Oracle.** The C3 skill's own `references/change.md`, quoted below. The wrapper is the only
legal writer: `c3-215-tribe.md` carries a `c3-seal:` and a hand edit breaks it. Baseline `check`
is **exactly 2 pre-existing errors** (`c3-213`, `c3-216`); a third is a regression this task
must not create.

**Fence by intent.** One ADR ("mechanical heartbeat supersedes P14") plus the minimum patches
that make `c3-215`'s facts true again: the watchdog surface in **Contract**, the unattended path
in **Business Flow**, and one **Change Safety** row. No other entity is touched.

**Governing quote** — `references/change.md`, verbatim:
> Frozen facts change **only** through a change-unit (SKILL.md §The shared contract — cite it,
> don't re-derive it).

and, verbatim:
> The **file-context gate is MANDATORY before authoring any fact-edit patch**: run the
> wrapper's `lookup <file>` operation, load every `rule-*` and the parent chain, honor the
> refs/rules.

**Adjudication rule — REFUTED in advance.**
- "the two pre-existing `check` errors should be fixed here" — they belong to `c3-213`/`c3-216`,
  neither of which this card touches; fixing them would be scope creep and would hide whether
  this card regressed anything.
- "`bunx @c3x/cli` is faster" — forbidden; the wrapper is the only sanctioned path.
- "the ADR should also record the 529 backoff" — it should, and it does: the ADR's decision list
  carries D74-1..7 plus spec §8's amendments, because that is what the change-unit's reasoning
  is *for*.

**Steps**

- [ ] **Step 1: File-context gate, then draft the ADR** (author the body OUTSIDE `.c3/`):

```sh
cd /Users/hip/repo/todd-skills-wt/i74-watchdog
C3X="C3X_MODE=agent bash /Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/bin/c3x.sh"
eval "$C3X lookup plugins/tribe/scripts/runner/cli/main.ts"
eval "$C3X lookup plugins/tribe/skills/orchestrate-campaign/SKILL.md"
eval "$C3X schema adr"
# Author the body at the repo root (never inside .c3/ — that tree regenerates).
eval "$C3X add adr mechanical-heartbeat-supersedes-p14 --file adr-mechanical-heartbeat.md"
```

The ADR body states: the problem (an LLM `/loop` tick paying tokens to read facts that are all
on disk; 27 minutes of dead time in the 08-08 campaign; five account-limit kills and three 529
kills in the 24 h before this card), the decision (a zero-token watchdog as a runner subcommand,
D74-1..7 and this plan's W-P1..W-P10), the consequences (fixlist P14 retired; P13's mitigation
strengthened; `--once` leaves a cron/launchd path open; the runner's core unchanged beyond
additive exports), and the evidence (the four gate commands and their measured outputs).

- [ ] **Step 2: Cite, scaffold, patch.**

```sh
eval "$C3X read c3-215 --section Contract --cite"
eval "$C3X read c3-215 --section 'Business Flow' --cite"
eval "$C3X read c3-215 --section 'Change Safety' --cite"
eval "$C3X change new <adr-id>"
```

Author three patches into `.c3/changes/<adr-id>/`:

- `01-contract-watchdog-surface.patch.md` — `scope: insert`, base = the cite handle of the
  **last existing Contract row**; body is the single new row (one line) describing the
  `scripts/runner/run.ts watchdog` surface: its flags with defaults, exit codes `0/10/11/1`,
  the two files under `<home>/watchdog/`, the frozen action table in one sentence, adopt-on-start,
  the caps, the containment refusal, and its evidence
  (`plugins/tribe/scripts/tests/test-watchdog-e2e.sh`).
- `02-business-flow-unattended-path.patch.md` — `scope: block`, base = the cite handle of the
  **Unattended path** row; body is that row re-authored to add the watchdog between "the runner
  loops at zero token cost" and the escalation clause: an account-limit or overload death is now
  absorbed mechanically (wait until the log's own `resetsAt`, or back off 30/60/120/240/480 s)
  and only a human-decision state ends supervision.
- `03-change-safety-watchdog-row.patch.md` — `scope: insert`, base = the cite handle of the last
  **Change Safety** row; body is one new row: risk "the watchdog waits forever, relaunches
  forever, or kills a healthy runner"; trigger "editing `core/watchdog/*`"; detection "the
  48-row action-table test plus the double-driven integration tests"; required verification
  `cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit; bash plugins/tribe/scripts/tests/test-watchdog-e2e.sh`.

- [ ] **Step 3: Preview, accept, apply, close.**

```sh
eval "$C3X change view <adr-id>"
eval "$C3X change status <adr-id>"
eval "$C3X change accept <adr-id>"
eval "$C3X change apply <adr-id>"
eval "$C3X check"
git -C /Users/hip/repo/todd-skills-wt/i74-watchdog status --short .c3
```

Expected: `change view` shows three pending patches with no drift; `apply` lands them
atomically; `check` prints `total: 46` (c3-215's fact count is unchanged — the entity count
grows by the ADR) with **exactly the same two errors** (`c3-213`, `c3-216`) and no new one.
If `apply` reports a landing mismatch, re-cite and re-author — **never hand-edit the sealed
doc**; if a seal is already broken, run `eval "$C3X repair"` and re-apply.

- [ ] **Step 4: Commit** — `docs(c3): ADR and c3-215 sync for the mechanical heartbeat (task 15/15)`,
  boxes ticked in the same commit, trailer `Campaign: gh-issues-2026-09`.

---

## 5. Goal coverage — every G maps to at least one task

| Goal (card §Measurable goals) | Tasks that prove it | Proof artefact |
| --- | --- | --- |
| **G1** quota recovery without an LLM | 3 (real fixture), 4 (`wait_until` rows + W-P2), 8 (loop order + bounded slices), **10** (real processes, real reset instant, dead time < 60 s, `runnerCommand` shows only the double) | `watchdog/events.jsonl`: `start,launch,wait_until,relaunch,exit` |
| **G2** skip when alive | 5 (`attach`/`once` rows), **11** (live double, `--once` → `11:runner_alive`, and `--follow` adopting a running pass; the double ran exactly once) | `events.jsonl` contains `attach`, never `launch`; double attempt counter is `1` |
| **G3** terminal states surface | 4 (the 48-row table), 6 (exit-code mapping), 8 (fake-IO mapping), **10** (six real plans incl. the overload cap and `--fallback-model`) | `status.json.terminal` per case |
| **G4** stall detection | 5 (stall rows, both modes), 6 (`isStale`), **11** (real back-dated log; the runner is still alive after the watchdog exits) | `events.jsonl` `stall` event naming the log + mtime |
| **G5** real-runner wiring | **12** (real runner, empty home from nothing, absolute AND relative `--home`, containment refusals, the ENOENT finding) | `docs/superpowers/evidence/2026-09-03-mechanical-heartbeat-g5.md` |
| **G6** integrated and documented | **13** (SKILL.md Stage B/C + the proven one-liner), **14** (runner README, tribe README, fixlist P13/P14, `install.sh --list` unchanged, `doctor.sh` unchanged-with-reason), **15** (ADR + c3-215) | greps in each task's gates |

## 6. Verification-step coverage — spec §6, step by step

| Spec §6 step | Where it is satisfied |
| --- | --- |
| 1. `cd plugins/tribe/scripts/runner && bun test` — all green, including the pure decision function's table test | Every task's gate block; the table test lands in Task 4 (48 rows) and Task 5 (12 once-mode rows) |
| 2. `test-fresh-machine.sh` and every other named `scripts/tests/*.sh` green | Tasks 12, 13, 14 gates. **Named tests: `test-watchdog-e2e.sh` (new), `test-watchdog-detached.sh` (new), `test-fresh-machine.sh` (unchanged, 26/0). Explicitly NOT named: `test-input-asymmetry.sh`, which does not parse on `master` — pre-existing red, out of fence** |
| 3. Replay G5 (throwaway home, spec-less card, real runner, expect exit 10 / `escalations_pending` / `launch` then `exit` / no session log) | Task 12, probes 1-2, plus the evidence file. **Amended by measurement: the home also needs an empty `answers.md`, or the runner exits 4 before escalating** |
| 4. Replay G1 with the fixture and a `resetsAt` 20 s out (expect ~50 s wait, then relaunch, then done) | Task 10's G1 tests reproduce this with `--quota-grace-seconds 1` for speed; the frozen 30 s default is pinned by Task 4's unit row, so the Shaman's manual replay with defaults behaves exactly as §6 step 4 says |
| 5. `grep -n "watchdog" .../SKILL.md` — Stage B names it; the bare-runner launch is no longer the primary path | Task 13, step 3 gate (and asserted by `test-watchdog-detached.sh`'s wall 2) |
| 6. Diff ⊆ scope fence; two independent skinner reports; tracker + scout; C3 change-unit + ADR; P14 row updated | §8 below (delivery), Task 14 (P14), Task 15 (C3) |

## 7. Spec amendments proposed

None of these change What or Why; each is a How-level gap or a measured correction. The plan
already builds to them (W-numbers), and they are listed here for the Shaman to fold into the
spec text so a later reader is not left deriving them again.

1. **§5 G5 / §6 step 3 — a genuinely empty home makes the RUNNER exit 4, not 2.** Measured
   2026-09-03 on `master` @ `8b73151`: with only `campaign-state.json` present, the runner
   throws `ENOENT … answers.md` and exits 4 before it can escalate `planning_needed`. With an
   empty `answers.md` it produces exactly the spec's expectation. Proposed wording: "an empty
   throwaway home built from nothing" = `campaign-state.json` + `answers.md` (the minimal home
   the orchestrate-campaign skill authors). **Follow-up FU-i74-1** for a runner card: treat a
   missing `answers.md` as "no rulings" rather than a crash. Out of this card's fence.
2. **§2.1 — the action table needs a stated precedence.** W-P1: a terminal exit (0/2/4/5)
   outranks a `STOP` file; a rejected quota signal outranks an overload signal. Without this,
   two readers of the same table disagree on `exit 3 + quota + STOP`.
3. **§2.1 — the quota signal's necessary condition.** W-P3: the rejected `rate_limit_event`
   with a numeric `resetsAt` is the signal; the `429` `result` line corroborates but is not
   required (a `429` with no `resetsAt` has nothing to wait for). Direction of error stated
   explicitly, since D74-4 names both lines without saying whether both are required.
4. **§2.1 — `--once` must not sleep.** W-P5: a tick records `nextWakeAt` and exits `11`
   (`quota_wait_pending` / `overload_backoff_pending`) instead of performing a multi-hour wait,
   which is what makes the mode usable from cron/launchd (§1.3's stated reason for having it).
5. **§2.1 — two added protocol flags and one added pass-through.** W-P8: `--poll-seconds`
   (default 30, capped at 60 by §7's own "≤60 s" rule) and `--quota-grace-seconds` (default 30,
   making §2.1's frozen "+30 s" configurable so the G1 integration test runs in seconds);
   `--remote` joins the pass-through set because the runner has it and omitting it silently
   mis-targets a repo whose upstream is not `origin`. `--dry-run` is rejected as unknown.
6. **§2.1 — the log parser's "last line wins" rule.** W-P4, evidence-backed: the real killed log
   carries `status: "allowed"` ×3 and `"allowed_warning"` ×2 before the final `"rejected"`, so a
   first-match parser would misread a recovered session as dead and a last-match parser is
   required. The spec's §1.2 table shows only the `rejected` shape.
7. **§2.1 — new terminal reason `lock_conflict`.** The table's exit-1 row says "attach if the
   holder is alive, else relaunch" but names no cap; an unbounded relaunch loop against a
   contended lock is exactly the runaway the caps exist to prevent, so a repeat gets
   `needs_human:lock_conflict` (bounded at 1, like the crash relaunch).
8. **§7 — the one deliberate `fail-closed-edges` exception, in writing.** W-P7: the supervised
   runner's spawn carries no wall-clock kill because card G4 forbids the watchdog from killing
   it; every *wait* is bounded by `--poll-seconds` instead. Stating it in the spec stops a
   reviewer re-litigating it every audit.

9. **Not a spec change, but a campaign-state coordination item the Shaman must land before the
   runner is triggered on this card.** `campaign-state.json` currently points
   `cards.i74-mechanical-heartbeat.plan` at
   `docs/superpowers/plans/2026-09-02-mechanical-heartbeat.md`, while the dispatch fixes this
   plan's landing path at `docs/superpowers/plans/2026-09-03-mechanical-heartbeat.md` (the spec
   path matches already). Left as it is, the runner will find the plan missing on disk and
   escalate this card `planning_needed` — the exact PLANNING_NEEDED path Task 12 uses as its
   *negative* fixture. Fix by editing the state file's `plan` value to the 2026-09-03 name (the
   Shaman owns that file; it is machine-local and never committed), or by landing this plan under
   the 2026-09-02 name instead. One or the other, before Stage B.

## 8. Delivery — the Warchief does NOT merge

Done-state for the delivering Warchief is **PR OPEN**, not merged. Concretely, before reporting:

1. **All gates run in the worktree and pasted verbatim into the PR body**, with numbers:
   - `cd plugins/tribe/scripts/runner && bun test` (expected: baseline 392 + roughly 130 new,
     `0 fail`) and `bunx tsc --noEmit` (silent)
   - `bun test structure.test.ts` (the layout contract still holds with the watchdog inside it)
   - `bash plugins/tribe/scripts/tests/test-watchdog-e2e.sh` (`0 failed`)
   - `bash plugins/tribe/scripts/tests/test-watchdog-detached.sh` (`0 failed`)
   - `bash plugins/tribe/scripts/tests/test-fresh-machine.sh` (`26 passed, 0 failed` — unmoved)
   - `C3X_MODE=agent bash …/c3x.sh check` (exactly the two pre-existing errors)
   - `bash plugins/tribe/scripts/validate-plan.sh docs/superpowers/plans/2026-09-03-mechanical-heartbeat.md`
     (verdict `pass`)
   - **There is no CI on this repo** (verified: no `.github/workflows/`), so "CI green" is
     satisfied by these local gates, pasted with their output. Say so in the PR body rather
     than leaving a reader to wonder, and never claim a green check that does not exist.
     Note also that `gh run watch` and `timeout` are both unusable here — no runs, no binary.
2. **Before/after evidence in the PR body**, captured by the Warchief, not claimed by a Hunter:
   - **BEFORE** — the 27-minute dead time this replaces, quoted from fixlist P14 with its
     ruling text, plus the real killed run's `run.json` (`exitCode: 3`,
     `reason: session_incomplete`, `endedAt: 2026-09-02T23:27:44.198Z`) and the
     `rate_limit_event` line from that campaign's own log: the facts an LLM tick used to read.
   - **AFTER** — the G1 integration transcript (`events.jsonl`:
     `start,launch,wait_until,relaunch,exit`, with measured dead time after the reset) and the
     G5 evidence file (`docs/superpowers/evidence/2026-09-03-mechanical-heartbeat-g5.md`:
     command line, `status.json`, `events.jsonl`, and the empty `logs/` proof of zero sessions).
   - Both live in the repo under `docs/superpowers/evidence/`, so every PR link resolves from
     the repo itself — no external host, nothing to expire.
3. **Audit recorded:** two independent skinners (contract lens + cold lens, dispatched
   concurrently in one message, the cold lens's diff path-scoped to exclude
   `docs/superpowers/{specs,plans}/**` and the card/plan documents), the tracker's verdict, and
   scout on the open harness gaps — with the disposition ledger for every Critical/Important
   finding.
4. **Then report** `NEEDS_DIRECTION: merge-pr #<n> — <digest>` to the Shaman, where the digest
   names: goal-by-goal outcome (G1-G6), the gate numbers, the two follow-ups (FU-i74-1 above,
   plus anything the audit records as DEBT), and the eight §7 amendments awaiting ratification.

**Scope-fence self-check before opening the PR** (`git diff --name-only master...HEAD` must be a
subset of):
`plugins/tribe/scripts/runner/{core/watchdog/**,ports/ports.ts,adapters/watchdog-io.adapter.ts,cli/main.ts,cli/main.test.ts,fixtures/watchdog/**,watchdog-integration.test.ts,README.md}`
(note what is NOT there: `core/types.ts` and `core/state.ts`, this campaign's two schemaLockPaths),
`plugins/tribe/scripts/tests/{test-watchdog-e2e.sh,test-watchdog-detached.sh}`,
`plugins/tribe/skills/orchestrate-campaign/SKILL.md`, `plugins/tribe/README.md`,
`docs/tribe/fixlists/2026-08-08-outstanding-17/README.md`,
`docs/superpowers/{specs,plans,evidence}/**`, `.c3/**`.
Anything else in that list is a fence breach — stop and report, do not "just tidy it".

## 9. Size and wall-clock estimate

**15 Hunter tasks**, one wave, strictly sequential.

| Tasks | What | Estimated Hunter wall-clock |
| --- | --- | --- |
| 1-2 | Vocabulary, CLI parsing, containment | 50 min |
| 3 | Signal parser + real fixtures | 40 min |
| 4-5 | The pure decision core (48 + 12 rows) | 1 h 40 min |
| 6 | Selectors, status/events, exit codes | 35 min |
| 7 | Ports + real adapter | 1 h |
| 8 | The supervision loop | 1 h 20 min |
| 9 | The subcommand (composition root) | 35 min |
| 10-11 | Integration against the double (G1-G4) | 2 h (roughly 3 min of it is the frozen backoff waits) |
| 12 | G5 real-runner e2e | 1 h |
| 13 | Detached launch + SKILL.md | 1 h |
| 14 | Docs + fixlist rows | 50 min |
| 15 | C3 ADR + change-unit | 1 h |
| — | **Total Hunter time** | **≈ 12 h** |
| — | Warchief overhead (dispatch, 15 pre-gates, dual-skinner rounds, tracker, scout, evidence, PR) | ≈ 5-7 h |
| — | **Total wall-clock to PR OPEN** | **≈ 17-19 h**, i.e. two working sessions, or one unattended overnight campaign pass with the watchdog itself supervising |

Expected new test count: roughly **130** (12 + 9 + 10 + 55 + 31 + 12 + 7 + 12 + 4 in `bun test`,
plus 18 + 10 shell checks), taking the runner suite from `392` to about `520` and adding two
shell suites.
