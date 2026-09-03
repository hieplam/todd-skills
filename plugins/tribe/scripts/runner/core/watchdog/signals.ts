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
