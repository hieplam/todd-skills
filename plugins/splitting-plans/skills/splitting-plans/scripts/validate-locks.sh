#!/usr/bin/env bash
# validate-locks.sh — mechanically check the AVAILABLE -> LOCKED -> DONE/BLOCKED gate across a
# splitting-plans bundle folder, instead of re-deriving lock consistency by prose reasoning
# every time a cook or the head chef reads the status board.
#
# Checks, per sub-plan bundle (`<NN>-<title>.md` files with the §4.1 YAML frontmatter):
#   - status is one of AVAILABLE | LOCKED | DONE | BLOCKED
#   - LOCKED requires non-empty locked_by + locked_at; a lock older than the staleness
#     threshold (default 30 minutes, same number the tribe's Shaman<->Warchief heartbeat uses)
#     is flagged stale
#   - AVAILABLE requires empty locked_by/locked_at (never been picked up)
#   - LOCKED/DONE requires every listed prereq bundle to itself be DONE
#   - owns_files is disjoint across all bundles (no two bundles claim the same file)
#
# Output: prints a JSON summary on stdout (only). Logs go to stderr.
# Exit codes: 0 = ran successfully (regardless of pass/fail); 2 = setup error.
#
# Usage:
#   validate-locks.sh <bundles-dir> [--threshold-minutes N]

set -euo pipefail

LOG() { printf '[validate-locks] %s\n' "$*" >&2; }
DIE() { LOG "ERROR: $*"; exit 2; }

BUNDLES_DIR=""
THRESHOLD_MINUTES=30
while [[ $# -gt 0 ]]; do
  case "$1" in
    --threshold-minutes) THRESHOLD_MINUTES="$2"; shift 2 ;;
    -h|--help)           sed -n '2,17p' "$0"; exit 0 ;;
    -*)                   DIE "unknown flag: $1" ;;
    *)
      if [[ -n "$BUNDLES_DIR" ]]; then DIE "unexpected extra argument: $1"; fi
      BUNDLES_DIR="$1"; shift ;;
  esac
done

[[ -n "$BUNDLES_DIR" ]] || DIE "usage: validate-locks.sh <bundles-dir> [--threshold-minutes N]"
[[ -d "$BUNDLES_DIR" ]] || DIE "bundles directory not found: $BUNDLES_DIR"
command -v python3 >/dev/null 2>&1 || DIE "python3 is required but not on PATH"

python3 - "$BUNDLES_DIR" "$THRESHOLD_MINUTES" <<'PY'
import glob, json, os, re, sys
from datetime import datetime, timezone

bundles_dir, threshold_minutes = sys.argv[1], float(sys.argv[2])

VALID_STATUSES = {"AVAILABLE", "LOCKED", "DONE", "BLOCKED"}

def parse_ts(raw):
    s = (raw or "").strip()
    if not s:
        return None
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

def parse_frontmatter(path):
    """Minimal parser for the flat + one-level-list YAML frontmatter shape used by
    splitting-plans sub-plan templates (SKILL.md §4.1). Not a general YAML parser."""
    with open(path, "r", errors="replace") as f:
        lines = f.readlines()

    if not lines or lines[0].strip() != "---":
        return None, "missing frontmatter (no leading '---')"

    end = None
    for i in range(1, len(lines)):
        if lines[i].strip() == "---":
            end = i
            break
    if end is None:
        return None, "missing frontmatter (no closing '---')"

    fm = {}
    current_list_key = None
    for raw in lines[1:end]:
        line = raw.rstrip("\n")
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        # comment stripping for inline `key: value  # comment`
        if " #" in stripped:
            stripped = stripped.split(" #", 1)[0].rstrip()

        if stripped.startswith("- ") and current_list_key:
            fm.setdefault(current_list_key, []).append(stripped[2:].strip().strip('"\''))
            continue

        m = re.match(r"^([A-Za-z_][A-Za-z0-9_]*):\s*(.*)$", stripped)
        if not m:
            continue
        key, val = m.group(1), m.group(2).strip()
        if val == "":
            fm[key] = []
            current_list_key = key
            continue
        current_list_key = None
        if val.startswith("[") and val.endswith("]"):
            inner = val[1:-1].strip()
            fm[key] = [v.strip().strip('"\'') for v in inner.split(",") if v.strip()] if inner else []
        else:
            fm[key] = val.strip('"\'')
    return fm, None

bundle_paths = sorted(glob.glob(os.path.join(bundles_dir, "*.md")))
now = datetime.now(timezone.utc)

bundles = {}
violations = []
parse_errors = []

for path in bundle_paths:
    name = os.path.basename(path)
    fm, err = parse_frontmatter(path)
    if err:
        parse_errors.append({"file": name, "error": err})
        continue
    bundle_id = str(fm.get("bundle", "")).strip() or os.path.splitext(name)[0]
    bundles[bundle_id] = {"file": name, "fm": fm}

for bundle_id, entry in bundles.items():
    fm, name = entry["fm"], entry["file"]
    status = str(fm.get("status", "")).strip()
    locked_by = str(fm.get("locked_by", "")).strip()
    locked_at_raw = str(fm.get("locked_at", "")).strip()
    prereqs = fm.get("prereqs", [])
    if isinstance(prereqs, str):
        prereqs = [prereqs] if prereqs else []

    if status not in VALID_STATUSES:
        violations.append({"bundle": bundle_id, "file": name, "type": "invalid_status",
                            "detail": f"status={status!r} not in {sorted(VALID_STATUSES)}"})
        continue

    if status == "LOCKED":
        if not locked_by or not locked_at_raw:
            violations.append({"bundle": bundle_id, "file": name, "type": "incomplete_lock",
                                "detail": "LOCKED requires non-empty locked_by and locked_at"})
        else:
            locked_at = parse_ts(locked_at_raw)
            if locked_at is None:
                violations.append({"bundle": bundle_id, "file": name, "type": "unparseable_locked_at",
                                    "detail": f"locked_at={locked_at_raw!r}"})
            else:
                age_minutes = round((now - locked_at).total_seconds() / 60, 2)
                if age_minutes > threshold_minutes:
                    violations.append({"bundle": bundle_id, "file": name, "type": "stale_lock",
                                        "detail": f"locked_by={locked_by!r} locked_at={locked_at_raw!r} "
                                                   f"age_minutes={age_minutes} threshold_minutes={threshold_minutes}"})

    if status == "AVAILABLE" and (locked_by or locked_at_raw):
        violations.append({"bundle": bundle_id, "file": name, "type": "available_but_locked_fields_set",
                            "detail": f"locked_by={locked_by!r} locked_at={locked_at_raw!r}"})

    if status in ("LOCKED", "DONE"):
        for prereq in prereqs:
            prereq_entry = bundles.get(str(prereq).strip())
            if prereq_entry is None:
                violations.append({"bundle": bundle_id, "file": name, "type": "unknown_prereq",
                                    "detail": f"prereq={prereq!r} has no matching bundle file"})
                continue
            prereq_status = str(prereq_entry["fm"].get("status", "")).strip()
            if prereq_status != "DONE":
                violations.append({"bundle": bundle_id, "file": name, "type": "prereq_not_done",
                                    "detail": f"prereq={prereq!r} status={prereq_status!r} "
                                               f"(must be DONE before {bundle_id} can be {status})"})

# owns_files disjointness across ALL bundles regardless of status
owner_of = {}
for bundle_id, entry in bundles.items():
    owns = entry["fm"].get("owns_files", [])
    if isinstance(owns, str):
        owns = [owns] if owns else []
    for f in owns:
        owner_of.setdefault(f, []).append(bundle_id)

for f, owners in owner_of.items():
    if len(set(owners)) > 1:
        violations.append({"bundle": None, "file": None, "type": "owns_files_overlap",
                            "detail": f"file={f!r} claimed by bundles {sorted(set(owners))}"})

if parse_errors:
    verdict = "error"
elif not bundles:
    verdict = "noop"
elif violations:
    verdict = "fail"
else:
    verdict = "pass"

print(json.dumps({
    "bundles_dir": os.path.abspath(bundles_dir),
    "threshold_minutes": threshold_minutes,
    "checked_at": now.isoformat(),
    "bundle_count": len(bundles),
    "bundles": {bid: {"file": e["file"], "status": e["fm"].get("status")} for bid, e in bundles.items()},
    "parse_errors": parse_errors,
    "violations": violations,
    "verdict": verdict,
}, indent=2))
PY
