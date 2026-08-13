// CLI entrypoint for the campaign runner (Task 6, spec §2).
//
// `parseArgs` is pure (no I/O) and fully unit-tested. `main()` below it is the COMPOSITION
// ROOT: the only module allowed to wire adapters — it builds the production `LoopIO` via
// `buildRealIo` (run-io.adapter.ts, which owns every fs/child_process primitive and the real
// SDK spawn from session.adapter.ts) and hands it to `runLoop`. `main()` is deliberately NOT
// unit-tested: the logic it depends on (`runLoop`, `deriveCardPhase`, ...) is fully covered
// without touching a real binary or the network (same precedent as the adapters themselves).
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  liveLockHolder,
  runLoop,
  type LoopIO,
  type LoopResult,
  type RunLoopConfig,
} from '../core/loop.ts';
import { loadState, resetCard, serializeState } from '../core/state.ts';
import { campaignStatePathOf, escalationPathOf, reportDirOf } from '../core/paths.ts';
import { buildRealIo, unsetAnthropicApiKeyEnv } from '../adapters/run-io.adapter.ts';
import { deriveExitReason, shouldWriteReport, writeReport, type ReportRunInfo } from '../core/report.ts';
import { EXIT_ERROR } from '../core/types.ts';
import type { CampaignState } from '../core/types.ts';
import { finalizeRunRecord, generateRunId, runRecordPathOf, serializeRunRecord } from '../core/run-record.ts';
import { scrubEnvContent } from '../core/env-guard.ts';

const DEFAULT_SESSION_TIMEOUT_MS = 3 * 60 * 60 * 1000; // spec §2: 3h protocol default.

function parseDurationMs(value: string): number | null {
  const trimmed = value.trim();
  const match = /^(\d+)(ms|s|m|h)?$/.exec(trimmed);
  if (!match) return null;
  const amount = Number(match[1]);
  const unit = match[2] ?? 'ms';
  const multiplier = { ms: 1, s: 1000, m: 60 * 1000, h: 60 * 60 * 1000 }[unit];
  return amount * (multiplier as number);
}

export interface ParseArgsResult {
  config: RunLoopConfig;
}
export interface ParseArgsError {
  error: string;
}

const REQUIRED_FLAGS: Array<{ flag: string; key: 'repoRoot' | 'model' | 'homeDir' }> = [
  { flag: '--repo', key: 'repoRoot' },
  { flag: '--model', key: 'model' },
  { flag: '--home', key: 'homeDir' },
];

/** Every flag `parseArgs` recognizes — anything else (including the deleted `--state`,
 * `--answers`, `--escalations-dir`) is rejected by name (spec §3 decision 2). */
const KNOWN_FLAGS = new Set([
  '--repo',
  '--model',
  '--home',
  '--session-timeout',
  '--logs-dir',
  '--max-cards',
  '--cards',
  '--dry-run',
  '--include-escalated',
  '--remote',
]);

/** Parses `argv` into a `RunLoopConfig`. Pure — no filesystem/network access. Every
 * environment-specific value (`--repo`, `--model`, `--home`) is a REQUIRED input with no
 * default (stateless-capability wall); only `--session-timeout`/`--logs-dir` carry a
 * protocol-level default (spec §2's own table / spec §5.4). `--state`, `--answers` and
 * `--escalations-dir` were deleted as flags: every campaign operational artifact now resolves
 * to a fixed name under `--home` (one campaign per home, `core/paths.ts`), so those three
 * values are no longer environment-specific and the stateless-capability wall no longer
 * applies to them — `--home` alone carries the environment-specific part. `runId` is generated
 * by the composition root (`main()`, below) — never derived here — and threaded through so the
 * default `--logs-dir` can live under the run dir. */
export function parseArgs(argv: string[], runId: string): ParseArgsResult | ParseArgsError {
  const raw = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (!token.startsWith('--')) continue;
    if (!KNOWN_FLAGS.has(token)) {
      return { error: `unknown flag: ${token}` };
    }
    if (token === '--dry-run' || token === '--include-escalated') {
      raw.set(token, true);
      continue;
    }
    const value = argv[i + 1];
    if (value === undefined) {
      return { error: `${token} requires a value` };
    }
    raw.set(token, value);
    i += 1;
  }

  for (const { flag } of REQUIRED_FLAGS) {
    if (!raw.has(flag)) {
      return { error: `missing required flag: ${flag}` };
    }
  }

  const repoRoot = raw.get('--repo') as string;
  const model = raw.get('--model') as string;
  const homeDir = raw.get('--home') as string;

  let sessionTimeoutMs = DEFAULT_SESSION_TIMEOUT_MS;
  const sessionTimeoutRaw = raw.get('--session-timeout');
  if (typeof sessionTimeoutRaw === 'string') {
    const parsed = parseDurationMs(sessionTimeoutRaw);
    if (parsed === null) {
      return { error: `--session-timeout: invalid duration "${sessionTimeoutRaw}" (expected e.g. "3h", "30m", "90s", "5000ms", or plain milliseconds)` };
    }
    sessionTimeoutMs = parsed;
  }

  const defaultLogsDir = join(homeDir, 'runs', runId, 'logs');
  const logsDir = typeof raw.get('--logs-dir') === 'string' ? (raw.get('--logs-dir') as string) : defaultLogsDir;

  let maxCards: number | undefined;
  const maxCardsRaw = raw.get('--max-cards');
  if (typeof maxCardsRaw === 'string') {
    const parsed = Number(maxCardsRaw);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      return { error: `--max-cards: expected a positive integer, got "${maxCardsRaw}"` };
    }
    maxCards = parsed;
  }

  let cardsFilter: string[] | undefined;
  const cardsRaw = raw.get('--cards');
  if (typeof cardsRaw === 'string') {
    cardsFilter = cardsRaw
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
  }

  const dryRun = raw.get('--dry-run') === true;
  const includeEscalated = raw.get('--include-escalated') === true;
  const remote = typeof raw.get('--remote') === 'string' ? (raw.get('--remote') as string) : 'origin';

  return {
    config: {
      repoRoot,
      logsDir,
      homeDir,
      runId,
      argv,
      model,
      sessionTimeoutMs,
      maxCards,
      cardsFilter,
      includeEscalated,
      dryRun,
      remote,
    },
  };
}

/** Task 3 wiring: reloads whatever state is on disk right now and writes the report through
 * it — the ONLY call site of `writeReport` in this file (the "single finally-style seam" the
 * brief asks for; every exit path in `main()` below funnels through this one call before its
 * own `process.exit`). Swallows a `loadState` failure deliberately: per the brief's design note
 * 1, if state was never loadable at all (e.g. a fresh campaign whose state file doesn't exist
 * yet, or an argument error that never got this far), there is nothing truthful to report —
 * this is a best-effort artifact, never a reason to crash the process over. Every OTHER failure
 * inside `writeReport`/`buildCampaignReport` is already handled internally there (the
 * escalation-file digest read degrades to an honest fallback string); this catch is only the
 * outermost safety net for "state itself never loaded". */
async function tryWriteReport(config: RunLoopConfig, io: LoopIO, run: ReportRunInfo): Promise<void> {
  try {
    // P11 fix-list: surfaces `loadState`'s R3-invariant normalization warnings here too —
    // state.ts stays pure (it only computes the warning strings; it never imports `console`
    // itself), this is the edge that prints them for the report-writing path.
    const state = await loadState(
      () => io.readFile(campaignStatePathOf(config.homeDir)),
      (warning) => console.error(`[tribe-runner] ${warning}`),
    );
    await writeReport(
      state,
      run,
      reportDirOf(config.homeDir),
      { homeDir: config.homeDir },
      io,
    );
  } catch {
    // See the doc comment above: no truthful report to write.
  }
}

/** P10 (fix-list): scrub a stray ANTHROPIC_API_KEY line out of the target repo's
 * `.env.local` — the incident vector (Bun auto-loads `.env.local` from cwd). Real run:
 * delete without asking (owner ruling). Dry run: warn only — stays zero side effects by
 * construction. Best-effort, same contract as tryWriteReport/tryFinalizeRunRecord below: a
 * transient fs error here (EACCES, a mid-flight delete between the exists-check and the
 * read, a read-only mount) must never crash the run before `runLoop` is even entered — this
 * is a hygiene step, not part of the campaign's actual progress, so it degrades to a warning
 * rather than an uncaught exception. Exported for `cli/main.test.ts` (takes only the FsPort
 * slice of `LoopIO` it actually needs, so a test can inject a throwing mock without building
 * a full `LoopIO`). */
export async function scrubTargetEnvLocal(
  repoRoot: string,
  dryRun: boolean,
  io: Pick<LoopIO, 'fileExists' | 'readFile' | 'writeFile'>,
): Promise<void> {
  const envLocalPath = join(repoRoot, '.env.local');
  try {
    if (!io.fileExists(envLocalPath)) return;
    const { cleaned, removed } = scrubEnvContent(String(await io.readFile(envLocalPath)));
    if (removed === 0) return;
    if (dryRun) {
      console.error(`campaign runner: ${envLocalPath} has ${removed} ANTHROPIC_API_KEY line(s) — would remove (--dry-run, not written)`);
      return;
    }
    io.writeFile(envLocalPath, cleaned);
    console.error(`campaign runner: removed ${removed} ANTHROPIC_API_KEY line(s) from ${envLocalPath}`);
  } catch (err) {
    console.error(`campaign runner: could not scrub ${envLocalPath} for ANTHROPIC_API_KEY (continuing): ${err instanceof Error ? err.message : String(err)}`);
  }
}

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

// ---------------------------------------------------------------------------------------
// `reset-card` subcommand (P11 fix-list "out of scope" note): "so humans never hand-edit
// state.json." A second, tiny mode alongside the main run loop — `main()` below dispatches to
// it the moment argv[0] is literally `reset-card`, before any of the run-loop-specific setup
// (the ANTHROPIC_API_KEY hygiene check, runId generation, `parseArgs`) — none of that applies
// to a subcommand that never spawns a session.
// ---------------------------------------------------------------------------------------

export interface ParseResetCardArgsResult {
  homeDir: string;
  cardId: string;
}
export interface ParseResetCardArgsError {
  error: string;
}

/** `reset-card`'s own flag set — deliberately separate from `KNOWN_FLAGS` above; this
 * subcommand's contract has nothing to do with running a campaign pass, so `--repo`/`--model`/
 * `--remote`/... are all unknown flags here, exactly like `--state`/`--answers` are unknown to
 * the main parser. */
const RESET_CARD_KNOWN_FLAGS = new Set(['--home', '--card']);

/** Pure — mirrors `parseArgs`'s own shape (unknown-flag rejection, missing-required-flag
 * rejection, "next token is the value") at a much smaller scale: exactly `--home` and
 * `--card`, both required. */
export function parseResetCardArgs(argv: string[]): ParseResetCardArgsResult | ParseResetCardArgsError {
  const raw = new Map<string, string>();
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i] as string;
    if (!token.startsWith('--')) continue;
    if (!RESET_CARD_KNOWN_FLAGS.has(token)) {
      return { error: `unknown flag: ${token}` };
    }
    const value = argv[i + 1];
    if (value === undefined) {
      return { error: `${token} requires a value` };
    }
    raw.set(token, value);
    i += 1;
  }

  const homeDir = raw.get('--home');
  if (!homeDir) return { error: 'missing required flag: --home' };
  const cardId = raw.get('--card');
  if (!cardId) return { error: 'missing required flag: --card' };

  return { homeDir, cardId };
}

/** The `reset-card` subcommand's execution. Refuses (returns non-zero, prints a named
 * diagnostic to stderr prefixed `reset-card:`, writes nothing) when:
 * - a LIVE process holds `.runner.lock` — checked via `liveLockHolder` (the exact same
 *   liveness check `acquireLock` refuses on), never claimed: a reset while a pass is
 *   mid-flight on that very card is exactly the race this guard exists to prevent, since the
 *   running pass may write this card's state again before it next reads the lock;
 * - the state file is missing, unreadable, or fails to parse/validate (`loadState` already
 *   covers "unparseable" — `JSON.parse` and `parseState`'s own typed errors);
 * - the named card has no entry under `cards` (`resetCard` throws `CardNotFoundError`).
 *
 * On success: writes the reset state back, warns (never auto-archives — see `resetCard`'s doc
 * comment in state.ts for why) if the card's escalation file is still present, then prints the
 * `resetCard`-produced summary as ONE line of JSON to stdout — the "so sessions can quote it"
 * contract from the fix-list note.
 *
 * Field-by-field reset decisions live on `resetCard` itself (`core/state.ts`) — this function
 * is the thin IO edge around it: check the lock, load, transform, write, report. `io` is only
 * the slice of `LoopIO` this subcommand actually touches (same `Pick<LoopIO, ...>` pattern as
 * `scrubTargetEnvLocal` above), so tests exercise it without a real filesystem. */
export async function performResetCard(
  homeDir: string,
  cardId: string,
  io: Pick<LoopIO, 'fileExists' | 'readFile' | 'writeFile' | 'readLock' | 'isProcessAlive'>,
): Promise<number> {
  const heldBy = liveLockHolder(io);
  if (heldBy) {
    console.error(
      `reset-card: refusing to reset — .runner.lock is held by live pid ${heldBy.pid} ` +
        `(started ${heldBy.startedAt}); the running pass may still be working this card.`,
    );
    return 1;
  }

  const statePath = campaignStatePathOf(homeDir);
  let state: CampaignState;
  try {
    state = await loadState(() => io.readFile(statePath));
  } catch (err) {
    console.error(
      `reset-card: could not load campaign state at ${statePath}: ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
    return 1;
  }

  let outcome: ReturnType<typeof resetCard>;
  try {
    outcome = resetCard(state, cardId);
  } catch (err) {
    console.error(`reset-card: ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }

  io.writeFile(statePath, serializeState(outcome.state));

  // Not a Card field (see resetCard's doc comment) — a live escalation file would otherwise
  // silently re-park this card as escalation_pending on the very next run, contradicting the
  // state file's own freshly-written `status: 'staged'`. Never auto-archived: that ritual is
  // coupled to an actual ruling recorded in answers.md, which a plain reset never makes.
  const escalationPath = escalationPathOf(homeDir, cardId);
  if (io.fileExists(escalationPath)) {
    console.error(
      `reset-card: note — ${escalationPath} still exists; this card re-parks as ` +
        'escalation_pending until that file is archived (see the ruling ritual in ' +
        "orchestrate-campaign's SKILL.md) or the next run passes --include-escalated.",
    );
  }

  console.log(JSON.stringify(outcome.summary));
  return 0;
}

export async function main(): Promise<void> {
  const argv = process.argv.slice(2);

  if (argv[0] === 'reset-card') {
    const parsed = parseResetCardArgs(argv.slice(1));
    if ('error' in parsed) {
      console.error(`reset-card: ${parsed.error}`);
      process.exit(1);
      return;
    }
    const io = buildRealIo({ homeDir: parsed.homeDir });
    const exitCode = await performResetCard(parsed.homeDir, parsed.cardId, io);
    process.exit(exitCode);
    return;
  }

  // P10 (fix-list): the tribe never authenticates via ANTHROPIC_API_KEY — executor
  // sessions authenticate via Claude Code login. Unset it before anything else runs
  // (before any session spawn), so an inherited key from the launching shell's env
  // never reaches a spawned session. The env mutation itself lives in the adapter
  // (`unsetAnthropicApiKeyEnv`) — cli/main.ts never reads `process.env` directly
  // (structure.test.ts: "no ambient process.env read outside adapters/").
  if (unsetAnthropicApiKeyEnv()) {
    console.error('campaign runner: ANTHROPIC_API_KEY was set in the environment — removed (the tribe authenticates via Claude Code login, never this variable)');
  }

  const runId = generateRunId(new Date().toISOString(), randomBytes(2).toString('hex'));
  const parsed = parseArgs(argv, runId);
  if ('error' in parsed) {
    console.error(`campaign runner: ${parsed.error}`);
    process.exit(1); // argument errors always exit 1 — state was never loadable, no report.
    return;
  }

  const io = buildRealIo(parsed.config);
  const startedAt = new Date().toISOString();

  // P10: scrub a stray ANTHROPIC_API_KEY line out of the target repo's .env.local. Routed
  // through `io` (the composition root's own adapter handle), never a direct fs import here
  // — cli/main.ts only wires adapters, per structure.test.ts. See scrubTargetEnvLocal's doc
  // comment above for the best-effort contract (never throws).
  await scrubTargetEnvLocal(parsed.config.repoRoot, parsed.config.dryRun, io);

  let result: LoopResult | undefined;
  let thrown: unknown;
  try {
    result = await runLoop(parsed.config, io);
  } catch (err) {
    thrown = err;
  }

  const endedAt = new Date().toISOString();
  const exitCode = thrown ? EXIT_ERROR : (result as LoopResult).exitCode;

  // Task 3 (spec §O5): the single finally-style seam. `shouldWriteReport`/`deriveExitReason`
  // (report.ts, fully unit-tested there) hold the only two decisions made here — this file
  // never re-derives report-shaping logic (design note 3) — so every exit path below (done,
  // escalations pending, STOP, session-incomplete, or this unhandled-error path) writes a
  // report through the one call, except `--dry-run` (zero side effects by construction) and
  // `EXIT_LOCKED` (a refused process must never clobber the live one's report).
  if (shouldWriteReport({ dryRun: parsed.config.dryRun, exitCode })) {
    await tryWriteReport(parsed.config, io, {
      startedAt,
      endedAt,
      exitCode,
      reason: deriveExitReason({ threw: Boolean(thrown), exitCode, hasMessage: Boolean(result?.message) }),
      // Harness-gap-wiring PR C: threads `runLoop`'s rulings-gate ids (see `run-loop.ts`'s
      // `applyRulingsGate`) onto the ONE artifact an orchestrating session reads — undefined on
      // every other exit path, exactly like `LoopResult.unratifiedRulings` itself.
      unratifiedRulings: result?.unratifiedRulings,
    });
    tryFinalizeRunRecord(parsed.config, io, { endedAt, exitCode, reason: deriveExitReason({ threw: Boolean(thrown), exitCode, hasMessage: Boolean(result?.message) }) });
  }

  if (thrown) {
    console.error(
      `campaign runner: unexpected error: ${thrown instanceof Error ? thrown.message : String(thrown)}`,
    );
    process.exit(EXIT_ERROR);
    return;
  }

  const finalResult = result as LoopResult;
  if (parsed.config.dryRun) {
    console.log(JSON.stringify(finalResult.dryRunPlan, null, 2));
  } else {
    for (const outcome of finalResult.processed) {
      console.log(`[${outcome.cardId}] ${outcome.kind}`);
    }
    if (finalResult.message) {
      console.log(finalResult.message);
    }
  }

  process.exit(finalResult.exitCode);
}

if (import.meta.main) {
  main();
}
