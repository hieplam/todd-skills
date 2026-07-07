#!/usr/bin/env bash
# heartbeat-check.sh — mechanically apply the tribe's 30-minute staleness threshold to a
# Warchief (or Hunter) report file, instead of re-deriving "is this still alive?" by prose
# reasoning every time the Shaman checks.
#
# The report file is a heartbeat: the agent appends one timestamped line per milestone
# (dispatch received, spec committed, plan committed, task N dispatched, ..., final status).
# Expected line shape: an ISO-8601 UTC timestamp (`YYYY-MM-DDTHH:MM:SSZ`, optionally with a
# `[...]` wrapper) followed by the milestone text, e.g.:
#   [2026-07-07T14:32:00Z] dispatch received
#   2026-07-07T14:47:11Z plan committed — docs/superpowers/plans/2026-07-07-foo.md
#
# Output: prints a JSON summary on stdout (only). Logs go to stderr.
# Exit codes: 0 = ran successfully (regardless of alive/stale verdict); 2 = setup error.
#
# Usage:
#   heartbeat-check.sh <report-file-path> [--threshold-minutes N]

set -euo pipefail

LOG() { printf '[heartbeat-check] %s\n' "$*" >&2; }
DIE() { LOG "ERROR: $*"; exit 2; }

REPORT_FILE=""
THRESHOLD_MINUTES=30
while [[ $# -gt 0 ]]; do
  case "$1" in
    --threshold-minutes) THRESHOLD_MINUTES="$2"; shift 2 ;;
    -h|--help)           sed -n '2,14p' "$0"; exit 0 ;;
    -*)                   DIE "unknown flag: $1" ;;
    *)
      if [[ -n "$REPORT_FILE" ]]; then DIE "unexpected extra argument: $1"; fi
      REPORT_FILE="$1"; shift ;;
  esac
done

[[ -n "$REPORT_FILE" ]] || DIE "usage: heartbeat-check.sh <report-file-path> [--threshold-minutes N]"
[[ -f "$REPORT_FILE" ]] || DIE "report file not found: $REPORT_FILE"
command -v python3 >/dev/null 2>&1 || DIE "python3 is required but not on PATH"

python3 - "$REPORT_FILE" "$THRESHOLD_MINUTES" <<'PY'
import json, re, sys
from datetime import datetime, timezone

report_file, threshold_minutes = sys.argv[1], float(sys.argv[2])

# Matches an ISO-8601 UTC timestamp, optionally wrapped in [...] or (...), anywhere on a line.
TS_RE = re.compile(
    r"(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)"
)

def parse_ts(raw):
    s = raw.strip()
    if s.endswith("Z"):
        s = s[:-1] + "+00:00"
    if "T" not in s and " " in s:
        s = s.replace(" ", "T", 1)
    try:
        dt = datetime.fromisoformat(s)
    except ValueError:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)

last_line = None
last_ts = None
with open(report_file, "r", errors="replace") as f:
    for raw_line in f:
        line = raw_line.rstrip("\n")
        if not line.strip():
            continue
        m = TS_RE.search(line)
        if not m:
            continue
        ts = parse_ts(m.group(1))
        if ts is None:
            continue
        last_line = line.strip()
        last_ts = ts

now = datetime.now(timezone.utc)

if last_ts is None:
    result = {
        "report_file": report_file,
        "status": "unknown",
        "reason": "no timestamped heartbeat line found",
        "last_heartbeat_line": None,
        "last_heartbeat_at": None,
        "age_minutes": None,
        "threshold_minutes": threshold_minutes,
        "checked_at": now.isoformat(),
    }
else:
    age_minutes = round((now - last_ts).total_seconds() / 60, 2)
    status = "stale" if age_minutes > threshold_minutes else "alive"
    result = {
        "report_file": report_file,
        "status": status,
        "last_heartbeat_line": last_line,
        "last_heartbeat_at": last_ts.isoformat(),
        "age_minutes": age_minutes,
        "threshold_minutes": threshold_minutes,
        "checked_at": now.isoformat(),
    }

print(json.dumps(result, indent=2))
PY
