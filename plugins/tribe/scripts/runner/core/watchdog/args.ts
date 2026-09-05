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
