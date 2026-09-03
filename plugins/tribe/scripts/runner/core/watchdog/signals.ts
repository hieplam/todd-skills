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
  /**
   * True when the tail's LAST content line looked like it was going to be a signal-bearing
   * `rate_limit_event` or `result` message (matched on its `"type"` field) but failed to
   * parse — almost certainly a byte-bounded tail cut mid-JSON at the END, not the routinely
   * expected cut at the START. Unlike the first-line tolerance this module already has, a
   * dropped FINAL line can hide the newest, most authoritative event and leave `quota`/
   * `overload` above silently stale (audit F3; spec §9 amendment 3: "under-detecting quota is
   * the defect"). A caller MUST treat `true` here as "the signals above may be stale, not
   * current" — this field only reports that the newest event was lost; it never invents what
   * that event said. Absent (`undefined`) when the tail's final content line was either absent,
   * or parsed fine, or was unparseable noise that was never going to carry a signal anyway.
   */
  finalLineUnparseable?: boolean;
}

/** 429 is deliberately absent: it is the quota shape, and the quota path owns it (W-P3). */
const OVERLOAD_STATUSES = new Set([500, 502, 503, 504, 529]);

/** Matches only the two message shapes this module derives signals from — a truncated line that
 * doesn't even look like one of these was never going to carry a quota/overload signal, so
 * flagging it would just be noise for the caller (see `finalLineUnparseable` above). */
const SIGNAL_BEARING_TYPE = /"type":"(?:rate_limit_event|result)"/;

export function parseSessionSignals(tail: string): SessionSignals {
  let quota: SessionSignals['quota'] = null;
  let overload: SessionSignals['overload'] = null;
  let lastResultIsError = false;
  let finalLineUnparseable: boolean | undefined;

  const lines = tail.split('\n');
  let lastContentIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if ((lines[i] as string).trim() !== '') { lastContentIdx = i; break; }
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx] as string;
    const line = raw.trim();
    if (!line.startsWith('{')) continue;
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line) as Record<string, unknown>;
    } catch (err) {
      if (err instanceof SyntaxError) {
        if (idx === lastContentIdx && SIGNAL_BEARING_TYPE.test(line)) finalLineUnparseable = true;
        continue; // truncated tail line — expected
      }
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

  return { quota, overload, lastResultIsError, finalLineUnparseable };
}
