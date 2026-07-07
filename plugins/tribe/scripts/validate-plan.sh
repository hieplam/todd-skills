#!/usr/bin/env bash
# validate-plan.sh — mechanically check a Warchief plan against warchief.md's own plan-step
# requirements (method step 3, "Write the plan"), instead of re-deriving "is this plan actually
# buildable?" by prose reasoning on every dispatch. Plan -> validate -> only then execute.
#
# Checks, against the plan file's Markdown:
#   - at least one task section exists (a heading whose text starts with "Task N", per the
#     writing-plans skill's "### Task N: [Component Name]" template — a heading that merely
#     mentions the word "task" in passing, e.g. an overview heading like "## Task Breakdown",
#     does not count)
#   - a "Global Constraints" section exists and names the hunter subagent as the implementer
#     (the exact line warchief.md's plan step requires)
#   - no placeholder markers survive (TODO, TBD, FIXME, XXX, PLACEHOLDER, "...", "<...>") — the
#     "..." and "<...>" checks both ignore matches written as inline code or inside a fenced
#     code block (e.g. `heartbeat-check.sh <report-file>`, or code using `...args`/`Ellipsis`/
#     `Callable[..., int]`), since those are legitimate code idioms and this repo's own
#     convention for documenting a script's arguments — not unfinished placeholders. TODO/TBD/
#     FIXME/XXX/PLACEHOLDER are still checked everywhere, code or not.
#   - each task section carries at least one fenced code block (actual commands/code, not
#     prose-only, whether or not the fence is indented under a list item) and mentions an
#     expected result ("expected")
#
# This does not (and cannot) judge whether the plan is *good* — only whether it is mechanically
# well-formed enough to hand to a Hunter. Judgment stays with the Warchief/Skinner.
#
# Output: prints a JSON summary on stdout (only). Logs go to stderr.
# Exit codes: 0 = ran successfully (regardless of pass/fail); 2 = setup error.
#
# Usage:
#   validate-plan.sh <plan-file-path>

set -euo pipefail

LOG() { printf '[validate-plan] %s\n' "$*" >&2; }
DIE() { LOG "ERROR: $*"; exit 2; }

PLAN_FILE=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    -*)         DIE "unknown flag: $1" ;;
    *)
      if [[ -n "$PLAN_FILE" ]]; then DIE "unexpected extra argument: $1"; fi
      PLAN_FILE="$1"; shift ;;
  esac
done

[[ -n "$PLAN_FILE" ]] || DIE "usage: validate-plan.sh <plan-file-path>"
[[ -f "$PLAN_FILE" ]] || DIE "plan file not found: $PLAN_FILE"
[[ -s "$PLAN_FILE" ]] || DIE "plan file is empty: $PLAN_FILE"
command -v python3 >/dev/null 2>&1 || DIE "python3 is required but not on PATH"

python3 - "$PLAN_FILE" <<'PY'
import json, re, sys

plan_file = sys.argv[1]
with open(plan_file, "r", errors="replace") as f:
    text = f.read()
lines = text.splitlines()

WORD_PLACEHOLDER_RE = re.compile(r"\b(TODO|TBD|FIXME|XXX|PLACEHOLDER)\b")
ELLIPSIS_RE = re.compile(r"\.\.\.(?!\))")
ANGLE_PLACEHOLDER_RE = re.compile(r"<[a-zA-Z_ -]{2,40}>")
INLINE_CODE_RE = re.compile(r"`[^`]*`")
CODE_FENCE_MARKER_RE = re.compile(r"^\s*```")

# A real per-task section per the writing-plans skill's "### Task N: [Component Name]"
# template — the title must *start* with "Task <number>", not merely contain the word
# "task" (which would also sweep in an unrelated overview heading like "## Task Breakdown").
TASK_HEADING_RE = re.compile(r"^task\s+\d+\b", re.IGNORECASE)

HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")

# Split the file into (heading_level, heading_text, start_line, body_lines) sections.
sections = []
current = None
for i, line in enumerate(lines, start=1):
    m = HEADING_RE.match(line)
    if m:
        if current is not None:
            sections.append(current)
        current = {"level": len(m.group(1)), "title": m.group(2).strip(), "line": i, "body": []}
    elif current is not None:
        current["body"].append(line)
if current is not None:
    sections.append(current)
if not sections:
    sections = [{"level": 0, "title": "(no headings)", "line": 1, "body": lines}]

task_sections = [s for s in sections if TASK_HEADING_RE.match(s["title"])]

checks = []

# 1. at least one task section
checks.append({
    "name": "has_task_sections",
    "status": "pass" if task_sections else "fail",
    "detail": f"{len(task_sections)} task section(s) found",
})

# 2. Global Constraints section names the hunter subagent
gc_sections = [s for s in sections if re.search(r"global constraints", s["title"], re.IGNORECASE)]
if not gc_sections:
    checks.append({"name": "global_constraints_present", "status": "fail",
                    "detail": "no 'Global Constraints' section found"})
    checks.append({"name": "hunter_named_as_implementer", "status": "fail",
                    "detail": "cannot check — no 'Global Constraints' section"})
else:
    checks.append({"name": "global_constraints_present", "status": "pass",
                    "detail": f"found at line {gc_sections[0]['line']}"})
    gc_text = "\n".join(gc_sections[0]["body"])
    names_hunter = bool(re.search(r"\bhunter\b", gc_text, re.IGNORECASE)) and \
                   bool(re.search(r"\bsubagent\b", gc_text, re.IGNORECASE))
    checks.append({
        "name": "hunter_named_as_implementer",
        "status": "pass" if names_hunter else "fail",
        "detail": "Global Constraints names the hunter subagent as implementer"
                  if names_hunter else
                  "Global Constraints does not name the hunter subagent as implementer",
    })

# 3. no placeholder markers anywhere in the file
# Angle-bracket notation (`<report-file>`) is this repo's own convention for documenting a
# script's CLI arguments, and "..." shows up in legitimate code (JS/TS rest/spread params like
# `function foo(...args)`, Python `Callable[..., int]`/`Ellipsis`/`arr[..., 0]`) — neither is a
# placeholder when it's written as inline code or sits inside a fenced code block, so both
# checks are skipped there. TODO/TBD/FIXME/XXX/PLACEHOLDER are real placeholder markers
# regardless of code formatting, so those are still checked everywhere.
in_fence = False
placeholder_hits = []
for i, line in enumerate(lines, start=1):
    for m in WORD_PLACEHOLDER_RE.finditer(line):
        placeholder_hits.append({"line": i, "match": m.group(0)})

    if CODE_FENCE_MARKER_RE.match(line):
        in_fence = not in_fence
        continue
    if in_fence:
        continue
    stripped = INLINE_CODE_RE.sub("", line)
    for m in ELLIPSIS_RE.finditer(stripped):
        placeholder_hits.append({"line": i, "match": m.group(0)})
    for m in ANGLE_PLACEHOLDER_RE.finditer(stripped):
        placeholder_hits.append({"line": i, "match": m.group(0)})
checks.append({
    "name": "no_placeholders",
    "status": "pass" if not placeholder_hits else "fail",
    "detail": f"{len(placeholder_hits)} placeholder marker(s) found" if placeholder_hits else "none found",
})

# 4. each task section carries a fenced code block and an expected-result mention
# Reuses CODE_FENCE_MARKER_RE (leading whitespace allowed) rather than requiring column 0, so a
# fence indented under a list item (e.g. nested under "- [ ] **Step 1: ...**", as the
# writing-plans template's bullet-based Task Structure naturally invites) still counts.
tasks_missing_code = []
tasks_missing_expected = []
for s in task_sections:
    body_text = "\n".join(s["body"])
    fence_count = sum(1 for b in s["body"] if CODE_FENCE_MARKER_RE.match(b))
    if fence_count < 2:  # opening + closing fence == 1 code block minimum
        tasks_missing_code.append(s["title"])
    if not re.search(r"\bexpected\b", body_text, re.IGNORECASE):
        tasks_missing_expected.append(s["title"])

checks.append({
    "name": "tasks_have_code_blocks",
    "status": "pass" if not tasks_missing_code else "fail",
    "detail": "all task sections carry a fenced code block" if not tasks_missing_code
              else f"missing in: {tasks_missing_code}",
})
checks.append({
    "name": "tasks_have_expected_output",
    "status": "pass" if not tasks_missing_expected else "fail",
    "detail": "all task sections mention an expected result" if not tasks_missing_expected
              else f"missing in: {tasks_missing_expected}",
})

verdict = "pass" if all(c["status"] == "pass" for c in checks) else "fail"

print(json.dumps({
    "plan_file": plan_file,
    "task_count": len(task_sections),
    "task_titles": [s["title"] for s in task_sections],
    "checks": checks,
    "placeholder_hits": placeholder_hits,
    "verdict": verdict,
}, indent=2))
PY
