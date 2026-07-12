# Plan — Idea 06: the campaign codex (`docs/tribe/CODEX.md`)

Implementation plan for a **future** campaign. Authored against `6a46391`. Read
[`spec.md`](./spec.md) first — this plan assumes its §2 design and cites its section numbers
rather than restating them.

**What ships:** one new script (`validate-codex.sh`) + tests, one new template
(`docs/tribe/CODEX.template.md`), and five additive prompt sections (Shaman, Skinner, Tracker,
Warchief, Hunter). **What does not ship:** the content of any real campaign's codex — the Shaman
fills that per campaign.

---

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.** The audit of each task stays with the `skinner` subagent; a builder never grades
  its own work.
- **TDD, no exceptions.** Every task writes its failing test first, watches it fail for the right
  reason, then makes it pass. The repo's harness is standalone bash, TAP-style, no runner and no
  CI workflows — model every new test on `plugins/tribe/scripts/tests/test-validate-plan.sh:1-13`
  (`ok -` / `not ok -`, `exit $((FAIL > 0))`).
- **One commit per task**, carrying both trailers in the final paragraph:
  `Tribe-Card: idea-06-campaign-codex-impl` and `Tribe-Task: N/7`. No co-authored trailers.
  Tick this plan's checkboxes in the SAME commit as the code.
- **Graceful absence is a hard requirement.** Every consumer must treat a missing
  `docs/tribe/CODEX.md` as "no codex this campaign" and behave exactly as today. No agent may
  hard-fail because the codex is absent — this is what makes the feature revertable (spec §7).
- **Additive prompt edits only.** Do not rewrite or reflow existing prompt prose; append the new
  section and add the minimum wiring lines. Prompt files are the tribe's source code — an
  unrelated reflow is scope creep and will be rejected.
- **Scope: only** `plugins/tribe/scripts/`, `plugins/tribe/agents/`, and `docs/tribe/`. No
  changes to `install.sh`, `.claude-plugin/`, or `evals/`.

## Dependency waves

| Wave | Tasks | Why |
|---|---|---|
| 1 | Task 1 | The validator is the gate everything else is tested against. |
| 2 | Task 2 | The template must be validated by Task 1's script. |
| 3 | Tasks 3, 4, 5, 6, 7 | Five prompt files, five test files — fully disjoint `owns_files`, run concurrently. |

`owns_files` per task:

| Task | Owns |
|---|---|
| 1 | `plugins/tribe/scripts/validate-codex.sh`, `plugins/tribe/scripts/tests/test-validate-codex.sh` |
| 2 | `docs/tribe/CODEX.template.md`, `plugins/tribe/scripts/tests/test-codex-template.sh` |
| 3 | `plugins/tribe/agents/shaman.md`, `plugins/tribe/scripts/tests/test-codex-wiring-shaman.sh` |
| 4 | `plugins/tribe/agents/skinner.md`, `plugins/tribe/scripts/tests/test-codex-wiring-skinner.sh` |
| 5 | `plugins/tribe/agents/tracker.md`, `plugins/tribe/scripts/tests/test-codex-wiring-tracker.sh` |
| 6 | `plugins/tribe/agents/warchief.md`, `plugins/tribe/scripts/tests/test-codex-wiring-warchief.sh` |
| 7 | `plugins/tribe/agents/hunter.md`, `plugins/tribe/scripts/tests/test-codex-wiring-hunter.sh` |

---

## Task 1: `validate-codex.sh` — the mechanical schema gate

Sibling of `validate-plan.sh`, same contract (`validate-plan.sh:34-38`): mechanical
well-formedness only, JSON verdict on stdout, logs to stderr, exit 0 when it ran (whatever the
verdict), exit 2 on setup error. Judgment stays with the Skinner (spec §2.6).

- [ ] **Step 1: RED — write the fixture tests first**

  Create `plugins/tribe/scripts/tests/test-validate-codex.sh`. It builds codex fixtures in a
  temp dir and asserts the JSON verdict and per-check statuses. Reuse the `jget` / `find_check`
  helpers from `test-validate-plan.sh` verbatim.

  ````bash
  #!/usr/bin/env bash
  # test-validate-codex.sh — fixture tests for validate-codex.sh (offline, no network).
  set -euo pipefail
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  SCRIPT="$HERE/../validate-codex.sh"
  TMP="$(mktemp -d)"
  trap 'rm -rf "$TMP"' EXIT
  PASS=0; FAIL=0
  ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
  bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
  check() { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2, want: $3)"; fi; }

  jget() { python3 - "$1" "$2" <<'EOF'
  import json, sys
  try:
      o = json.load(open(sys.argv[1]))
      for k in sys.argv[2].split("."):
          o = o[int(k)] if isinstance(o, list) else o[k]
      print(str(o).lower() if isinstance(o, bool) else o)
  except (KeyError, IndexError, ValueError):
      print("MISSING")
  EOF
  }
  find_check() { python3 - "$1" "$2" <<'EOF'
  import json, sys
  data = json.load(open(sys.argv[1]))
  for c in data.get("checks", []):
      if c["name"] == sys.argv[2]:
          print(c["status"]); break
  else:
      print("MISSING")
  EOF
  }

  header() {
    cat <<'EOF'
  # Tribe Campaign Codex

  campaign: demo
  codex-version: 1
  frozen-at: 2026-07-12T09:00:00Z
  base-sha: 6a46391
  status: frozen
  review: PASS (skinner, round 1)

  | ID | Scope | Category | Decision | Source | Check | Severity | State |
  |----|-------|----------|----------|--------|-------|----------|-------|
  EOF
  }
  GOOD_ROW='| CDX-001 | `plugins/tribe/scripts/*.sh` | testing | Every script ships a fixture test under scripts/tests. | `plugins/tribe/scripts/tests/test-validate-plan.sh:1` | `test -f $T` | Blocker | active |'

  run() { "$SCRIPT" "$1" > "$TMP/out.json" 2>/dev/null; }

  # 1. golden codex passes
  { header; echo "$GOOD_ROW"; } > "$TMP/good.md"
  run "$TMP/good.md"
  check "golden codex verdict=pass"        "$(jget "$TMP/out.json" verdict)" "pass"
  check "golden codex row_count=1"         "$(jget "$TMP/out.json" row_count)" "1"

  # 2. duplicate ID fails ids_unique_wellformed
  { header; echo "$GOOD_ROW"; echo "$GOOD_ROW"; } > "$TMP/dup.md"
  run "$TMP/dup.md"
  check "duplicate ID verdict=fail"        "$(jget "$TMP/out.json" verdict)" "fail"
  check "duplicate ID names the check"     "$(find_check "$TMP/out.json" ids_unique_wellformed)" "fail"

  # 3. empty Source fails source_grounded
  { header; echo '| CDX-002 | `*` | naming | Name things clearly. |  | `manual` | Should-fix | active |'; } > "$TMP/nosrc.md"
  run "$TMP/nosrc.md"
  check "missing Source verdict=fail"      "$(jget "$TMP/out.json" verdict)" "fail"
  check "missing Source names the check"   "$(find_check "$TMP/out.json" source_grounded)" "fail"

  # 4. ungrounded Source (prose, not file:line or DL-NNN) fails source_grounded
  { header; echo '| CDX-003 | `*` | naming | Name things clearly. | because it is nicer | `manual` | Should-fix | active |'; } > "$TMP/prosesrc.md"
  run "$TMP/prosesrc.md"
  check "prose Source names the check"     "$(find_check "$TMP/out.json" source_grounded)" "fail"

  # 5. a Decision-Log source (DL-NNN) is grounded — the amendment path (spec 2.4)
  { header; echo '| CDX-004 | `*` | tripwire | A weakened or skipped test is a Blocker. | `DL-007` | `manual` | Blocker | active |'; } > "$TMP/dl.md"
  run "$TMP/dl.md"
  check "DL source verdict=pass"           "$(jget "$TMP/out.json" verdict)" "pass"

  # 6. illegal Severity fails severity_legal
  { header; echo '| CDX-005 | `*` | naming | Name things clearly. | `README.md:1` | `manual` | Nitpick | active |'; } > "$TMP/sev.md"
  run "$TMP/sev.md"
  check "illegal Severity names the check" "$(find_check "$TMP/out.json" severity_legal)" "fail"

  # 7. illegal State fails state_legal
  { header; echo '| CDX-006 | `*` | naming | Name things clearly. | `README.md:1` | `manual` | Blocker | retired |'; } > "$TMP/state.md"
  run "$TMP/state.md"
  check "illegal State names the check"    "$(find_check "$TMP/out.json" state_legal)" "fail"

  # 8. an over-long Decision (prose, not a lookup line) fails decision_single_line
  LONG=$(python3 -c 'print("Prefer the clearer option and also consider the surrounding context " * 5)')
  { header; echo "| CDX-007 | \`*\` | naming | $LONG | \`README.md:1\` | \`manual\` | Should-fix | active |"; } > "$TMP/long.md"
  run "$TMP/long.md"
  check "prose Decision names the check"   "$(find_check "$TMP/out.json" decision_single_line)" "fail"

  # 9. missing header key fails header_complete
  { echo '# Tribe Campaign Codex'; echo; echo 'campaign: demo'; echo; \
    echo '| ID | Scope | Category | Decision | Source | Check | Severity | State |'; \
    echo '|----|-------|----------|----------|--------|-------|----------|-------|'; \
    echo "$GOOD_ROW"; } > "$TMP/nohdr.md"
  run "$TMP/nohdr.md"
  check "missing header names the check"   "$(find_check "$TMP/out.json" header_complete)" "fail"

  # 10. status: draft is legal (a codex may be pre-freeze)
  { header; echo "$GOOD_ROW"; } | sed 's/^status: frozen$/status: draft/' > "$TMP/draft.md"
  run "$TMP/draft.md"
  check "draft status verdict=pass"        "$(jget "$TMP/out.json" verdict)" "pass"

  # 11. a Check containing an ESCAPED pipe still parses as 8 cells. Check cells hold shell
  # commands and shell commands pipe — a naive split("|") would shred exactly the rows this
  # column exists to carry, so this is a hard regression guard, not an edge case.
  { header; echo '| CDX-008 | `**/*` | tripwire | A weakened or skipped test in the diff is a Blocker, never a fix. | `DL-001` | `git diff \| grep -q "^-.*test(" && echo violation` | Blocker | active |'; } > "$TMP/pipe.md"
  run "$TMP/pipe.md"
  check "escaped pipe in Check verdict=pass" "$(jget "$TMP/out.json" verdict)" "pass"
  check "escaped pipe row parses to 8 cells" "$(find_check "$TMP/out.json" rows_complete)" "pass"

  # 12. setup errors exit 2 (contract shared with validate-plan.sh)
  set +e
  "$SCRIPT" "$TMP/nope.md" >/dev/null 2>&1; check "missing file exits 2" "$?" "2"
  "$SCRIPT" >/dev/null 2>&1;               check "no argument exits 2"   "$?" "2"
  set -e

  printf '\n# passed %d, failed %d\n' "$PASS" "$FAIL"
  exit $((FAIL > 0))
  ````

  Make it executable and run it. **Expected: it fails at the first assertion because
  `validate-codex.sh` does not exist yet** — this is the RED state.

  ```bash
  chmod +x plugins/tribe/scripts/tests/test-validate-codex.sh
  plugins/tribe/scripts/tests/test-validate-codex.sh; echo "exit=$?"
  # expected: "No such file or directory" on ../validate-codex.sh, exit=1 (non-zero)
  ```

- [ ] **Step 2: GREEN — write `validate-codex.sh`**

  Create `plugins/tribe/scripts/validate-codex.sh`, mirroring `validate-plan.sh`'s structure
  (bash arg-parsing wrapper + embedded `python3` heredoc; JSON to stdout, logs to stderr).

  ````bash
  #!/usr/bin/env bash
  # validate-codex.sh — mechanically check a campaign codex (docs/tribe/CODEX.md) against the
  # schema in docs/tribe/planning/idea-06-campaign-codex/spec.md (2.1), instead of re-deriving
  # "is this codex well-formed?" by prose reasoning. Forge -> validate -> Skinner round -> freeze.
  #
  # Checks: header keys present; codex-version an integer; status legal; the 8-column table
  # header; every row complete; IDs unique and well-formed (CDX-NNN); Decision is one short
  # imperative line (a lookup row, not prose); Source grounded (file:line or DL-NNN); Check
  # non-empty; Severity and State in their enums.
  #
  # It cannot judge whether a decision is *right* — that is the Shaman's What — nor whether a
  # citation actually supports its row: that is the Skinner's grounding round.
  #
  # Output: a JSON summary on stdout (only). Logs go to stderr.
  # Exit codes: 0 = ran successfully (regardless of pass/fail); 2 = setup error.
  #
  # Usage:
  #   validate-codex.sh <codex-file-path>

  set -euo pipefail

  LOG() { printf '[validate-codex] %s\n' "$*" >&2; }
  DIE() { LOG "ERROR: $*"; exit 2; }

  CODEX_FILE=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
      -*)        DIE "unknown flag: $1" ;;
      *)
        if [[ -n "$CODEX_FILE" ]]; then DIE "unexpected extra argument: $1"; fi
        CODEX_FILE="$1"; shift ;;
    esac
  done

  [[ -n "$CODEX_FILE" ]] || DIE "usage: validate-codex.sh <codex-file-path>"
  [[ -f "$CODEX_FILE" ]] || DIE "codex file not found: $CODEX_FILE"
  [[ -r "$CODEX_FILE" ]] || DIE "codex file not readable (permission denied?): $CODEX_FILE"
  [[ -s "$CODEX_FILE" ]] || DIE "codex file is empty: $CODEX_FILE"
  command -v python3 >/dev/null 2>&1 || DIE "python3 is required but not on PATH"

  python3 - "$CODEX_FILE" <<'PY'
  import json, re, sys

  path = sys.argv[1]
  try:
      with open(path, "r", errors="replace") as f:
          text = f.read()
  except OSError as e:
      print(f"[validate-codex] ERROR: cannot read codex file: {e}", file=sys.stderr)
      sys.exit(2)
  lines = text.splitlines()

  REQUIRED_HEADER = ["campaign", "codex-version", "frozen-at", "base-sha", "status", "review"]
  COLUMNS = ["ID", "Scope", "Category", "Decision", "Source", "Check", "Severity", "State"]
  LEGAL_STATUS   = {"draft", "frozen"}
  LEGAL_SEVERITY = {"Blocker", "Should-fix"}
  LEGAL_STATE    = {"active", "superseded"}
  LEGAL_CATEGORY = {"naming", "testing", "error-handling", "structure",
                    "security", "commit", "tripwire"}
  ID_RE     = re.compile(r"^CDX-\d{3}$")
  # Grounded provenance: a repo citation (file:line, optionally a line range) or a Decision
  # Log ruling id. Backticks are cosmetic and stripped before matching.
  FILELINE_RE = re.compile(r"^[\w./*\-]+:\d+(-\d+)?$")
  DL_RE       = re.compile(r"^DL-\d{3}$")
  DECISION_MAX = 200   # one imperative lookup line, not a paragraph

  # A Check cell is a shell command, and shell commands pipe. So the table MUST be split on
  # UNESCAPED pipes only: a row may carry `git diff \| grep -q foo` and still be 8 cells.
  # A naive split("|") would shred exactly the rows the Check column exists to hold.
  SPLIT_RE = re.compile(r"(?<!\\)\|")

  def split_row(s):
      s = s.strip()
      if s.startswith("|"): s = s[1:]
      if s.endswith("|") and not s.endswith(r"\|"): s = s[:-1]
      return [c.strip() for c in SPLIT_RE.split(s)]

  def cell(s):
      return s.strip().strip("`").strip().replace(r"\|", "|")

  header = {}
  for line in lines:
      m = re.match(r"^([a-z-]+):\s*(.+)$", line.strip())
      if m and m.group(1) in REQUIRED_HEADER:
          header.setdefault(m.group(1), m.group(2).strip())

  checks = []
  def add(name, ok, detail):
      checks.append({"name": name, "status": "pass" if ok else "fail", "detail": detail})

  missing = [k for k in REQUIRED_HEADER if k not in header]
  add("header_complete", not missing,
      "all header keys present" if not missing else f"missing header key(s): {missing}")

  ver = header.get("codex-version", "")
  add("codex_version_integer", ver.isdigit(),
      f"codex-version={ver!r}" if ver.isdigit() else f"codex-version not an integer: {ver!r}")

  status = header.get("status", "")
  add("status_legal", status in LEGAL_STATUS,
      f"status={status!r}" if status in LEGAL_STATUS
      else f"illegal status {status!r} (legal: {sorted(LEGAL_STATUS)})")

  # The table: find the header row, then every pipe row after the separator.
  rows, hdr_idx = [], None
  for i, line in enumerate(lines):
      s = line.strip()
      if not s.startswith("|"):
          continue
      cells = split_row(s)
      if hdr_idx is None:
          if cells == COLUMNS:
              hdr_idx = i
          continue
      if set(s) <= set("|- :"):      # the separator row
          continue
      rows.append({"line": i + 1, "cells": cells})

  add("table_schema", hdr_idx is not None,
      f"8-column header found at line {hdr_idx + 1}" if hdr_idx is not None
      else f"no table header row matching {COLUMNS}")

  bad_width = [r["line"] for r in rows if len(r["cells"]) != len(COLUMNS)]
  add("rows_complete", not bad_width,
      f"{len(rows)} row(s), all 8 cells" if not bad_width
      else f"row(s) with wrong cell count at line(s): {bad_width}")

  good = [r for r in rows if len(r["cells"]) == len(COLUMNS)]
  for r in good:
      r["f"] = dict(zip(COLUMNS, [cell(c) for c in r["cells"]]))

  ids = [r["f"]["ID"] for r in good]
  dupes = sorted({i for i in ids if ids.count(i) > 1})
  malformed = [i for i in ids if not ID_RE.match(i)]
  add("ids_unique_wellformed", not dupes and not malformed,
      f"{len(ids)} unique well-formed id(s)" if not dupes and not malformed
      else f"duplicate id(s): {dupes}; malformed id(s): {malformed}")

  long_dec = [r["f"]["ID"] for r in good
              if not r["f"]["Decision"] or len(r["f"]["Decision"]) > DECISION_MAX]
  add("decision_single_line", not long_dec,
      "every Decision is one lookup line" if not long_dec
      else f"empty or over-long (>{DECISION_MAX} chars) Decision in: {long_dec}")

  ungrounded = [r["f"]["ID"] for r in good
                if not (FILELINE_RE.match(r["f"]["Source"]) or DL_RE.match(r["f"]["Source"]))]
  add("source_grounded", not ungrounded,
      "every Source is a file:line or DL-NNN citation" if not ungrounded
      else f"ungrounded or empty Source in: {ungrounded}")

  no_check = [r["f"]["ID"] for r in good if not r["f"]["Check"]]
  add("check_present", not no_check,
      "every row carries a Check (command or 'manual')" if not no_check
      else f"empty Check in: {no_check}")

  bad_cat = [r["f"]["ID"] for r in good if r["f"]["Category"] not in LEGAL_CATEGORY]
  add("category_legal", not bad_cat,
      "every Category is legal" if not bad_cat else f"illegal Category in: {bad_cat}")

  bad_sev = [r["f"]["ID"] for r in good if r["f"]["Severity"] not in LEGAL_SEVERITY]
  add("severity_legal", not bad_sev,
      "every Severity is Blocker or Should-fix" if not bad_sev
      else f"illegal Severity in: {bad_sev}")

  bad_state = [r["f"]["ID"] for r in good if r["f"]["State"] not in LEGAL_STATE]
  add("state_legal", not bad_state,
      "every State is active or superseded" if not bad_state
      else f"illegal State in: {bad_state}")

  verdict = "pass" if all(c["status"] == "pass" for c in checks) else "fail"
  print(json.dumps({
      "codex_file": path,
      "campaign": header.get("campaign", ""),
      "codex_version": ver,
      "status": status,
      "row_count": len(rows),
      "active_rows": sum(1 for r in good if r["f"]["State"] == "active"),
      "checks": checks,
      "verdict": verdict,
  }, indent=2))
  PY
  ````

  ```bash
  chmod +x plugins/tribe/scripts/validate-codex.sh
  plugins/tribe/scripts/tests/test-validate-codex.sh; echo "exit=$?"
  # expected: every line "ok - ...", then "# passed 17, failed 0", exit=0
  ```

- [ ] **Step 3: Verify the neighbours still pass** — the shared harness must stay green.

  ```bash
  plugins/tribe/scripts/tests/test-validate-plan.sh >/dev/null && echo "validate-plan OK"
  plugins/tribe/scripts/tests/test-resume-check.sh  >/dev/null && echo "resume-check OK"
  # expected: both print OK (exit 0) — this task touches neither
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add plugins/tribe/scripts/validate-codex.sh plugins/tribe/scripts/tests/test-validate-codex.sh docs/tribe/planning/idea-06-campaign-codex/plan.md
  git commit -m "feat(tribe): validate-codex.sh — mechanical schema gate for the campaign codex" \
    -m $'Tribe-Card: idea-06-campaign-codex-impl\nTribe-Task: 1/7'
  # expected: one commit, both trailers visible in `git log -1 --format=%(trailers)`
  ```

---

## Task 2: `docs/tribe/CODEX.template.md` — the form the Shaman fills

The Shaman needs a shape to conform to, and the template is the cheapest possible regression test
of the schema: if the template stops validating, the schema drifted.

- [ ] **Step 1: RED — the template round-trip test**

  Create `plugins/tribe/scripts/tests/test-codex-template.sh`:

  ````bash
  #!/usr/bin/env bash
  # test-codex-template.sh — the shipped codex template must satisfy the shipped schema.
  set -euo pipefail
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  ROOT="$(cd "$HERE/../../../.." && pwd)"
  SCRIPT="$HERE/../validate-codex.sh"
  TEMPLATE="$ROOT/docs/tribe/CODEX.template.md"
  PASS=0; FAIL=0
  ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
  bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

  [[ -f "$TEMPLATE" ]] && ok "template exists at docs/tribe/CODEX.template.md" \
                       || bad "template missing at docs/tribe/CODEX.template.md"

  if [[ -f "$TEMPLATE" ]]; then
    OUT="$("$SCRIPT" "$TEMPLATE" 2>/dev/null)"
    V="$(printf '%s' "$OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["verdict"])')"
    [[ "$V" == "pass" ]] && ok "template validates against validate-codex.sh" \
                         || bad "template fails validate-codex.sh (verdict=$V)"
    S="$(printf '%s' "$OUT" | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')"
    [[ "$S" == "draft" ]] && ok "template ships as status: draft" \
                          || bad "template must ship as draft, not $S"
    # The example rows must demonstrate both provenance forms (spec 2.1, 2.4).
    grep -q 'DL-' "$TEMPLATE" && ok "template shows a Decision-Log-sourced row" \
                              || bad "template must show a DL-NNN sourced row"
    grep -q 'tripwire' "$TEMPLATE" && ok "template reserves the tripwire category (idea 10)" \
                                   || bad "template must show the tripwire category"
  fi

  printf '\n# passed %d, failed %d\n' "$PASS" "$FAIL"
  exit $((FAIL > 0))
  ````

  ```bash
  chmod +x plugins/tribe/scripts/tests/test-codex-template.sh
  plugins/tribe/scripts/tests/test-codex-template.sh; echo "exit=$?"
  # expected: "not ok - template missing at docs/tribe/CODEX.template.md", exit=1 (RED)
  ```

- [ ] **Step 2: GREEN — write the template**

  Create `docs/tribe/CODEX.template.md`. It ships `status: draft`, carries the column contract as
  a comment, and shows one example row per provenance form.

  ````markdown
  # Tribe Campaign Codex

  <!-- Copy this file to docs/tribe/CODEX.md at the start of a MULTI-CARD campaign, fill the
       header and the rows, run scripts/validate-codex.sh, put it through ONE Skinner round,
       then set status: frozen. Rows are lookups, not prose: one imperative line each, every
       row grounded in a file:line citation or a Decision Log ruling (DL-NNN). Amend only via
       a Decision Log ruling, append-only (new ID, old row flipped to superseded). -->

  campaign: name-of-the-campaign
  codex-version: 1
  frozen-at: 1970-01-01T00:00:00Z
  base-sha: 0000000
  status: draft
  review: pending

  | ID | Scope | Category | Decision | Source | Check | Severity | State |
  |----|-------|----------|----------|--------|-------|----------|-------|
  | CDX-001 | `plugins/tribe/scripts/*.sh` | testing | Every script ships a fixture test at scripts/tests/test-NAME.sh printing TAP ok/not-ok and exiting non-zero on failure. | `plugins/tribe/scripts/tests/test-validate-plan.sh:1` | `test -f plugins/tribe/scripts/tests/test-$(basename "$F" .sh).sh` | Blocker | active |
  | CDX-002 | `plugins/tribe/scripts/*.sh` | error-handling | Exit 2 means setup error; exit 0 means the script ran, with the verdict in JSON on stdout and logs on stderr. | `plugins/tribe/scripts/validate-plan.sh:38` | `grep -q "Exit codes: 0 = ran successfully" "$F"` | Blocker | active |
  | CDX-003 | `**/*` | tripwire | A weakened, skipped, or deleted test in the diff is a Blocker, never a fix. | `DL-001` | `git diff \| grep -qE "^-.*(it\|test)\(" && echo violation` | Blocker | active |
  ````

  **Note the escaped pipes** (`\|`) in that `Check` cell: it is a shell pipeline living inside a
  markdown table, so every `|` that belongs to the *command* must be escaped or it would be read
  as a *column* separator. Task 1's validator splits on unescaped pipes only and unescapes the
  cell afterwards, so the row round-trips as 8 cells and the stored command is the real one. This
  is not incidental — the `Check` column exists to hold shell commands, and shell commands pipe.

  ```bash
  plugins/tribe/scripts/tests/test-codex-template.sh; echo "exit=$?"
  # expected: 5 "ok -" lines, "# passed 5, failed 0", exit=0
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add docs/tribe/CODEX.template.md plugins/tribe/scripts/tests/test-codex-template.sh docs/tribe/planning/idea-06-campaign-codex/plan.md
  git commit -m "feat(tribe): ship the campaign-codex template (schema the Shaman fills)" \
    -m $'Tribe-Card: idea-06-campaign-codex-impl\nTribe-Task: 2/7'
  # expected: one commit carrying both trailers
  ```

---

## Task 3: Shaman — forge, review, freeze, amend (the codex lifecycle)

Wave 3. Owns `plugins/tribe/agents/shaman.md` only. The new Mode-2 step sits **between** the
existing resume step 0 and pick step 1 (`shaman.md:299-343`), and the amend rule hangs off the
existing Decision Log ruling path (`shaman.md:95-98`).

- [ ] **Step 1: RED — the wiring test**

  Create `plugins/tribe/scripts/tests/test-codex-wiring-shaman.sh`:

  ````bash
  #!/usr/bin/env bash
  # test-codex-wiring-shaman.sh — the Shaman prompt must carry the codex lifecycle.
  set -euo pipefail
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  F="$(cd "$HERE/../.." && pwd)/agents/shaman.md"
  PASS=0; FAIL=0
  want() { # want DESCRIPTION PATTERN
    if grep -qiE "$2" "$F"; then PASS=$((PASS+1)); printf 'ok - %s\n' "$1"
    else FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; fi
  }
  want "names the codex path"                 'docs/tribe/CODEX\.md'
  want "forges it only for multi-card campaigns" 'multi-card|batch of 2 or more|two or more cards'
  want "runs validate-codex.sh before review" 'validate-codex\.sh'
  want "puts the codex through one Skinner round" 'skinner'
  want "freezes it before the first dispatch" 'freez'
  want "amends only via a Decision Log ruling" 'Decision Log'
  want "amendments are append-only"           'append-only|new row with a new id'
  want "in-flight cards keep their codex version" 'codex-version|version pinning|pinned'
  want "absent codex degrades gracefully"     'no codex|absent|does not exist'
  printf '\n# passed %d, failed %d\n' "$PASS" "$FAIL"
  exit $((FAIL > 0))
  ````

  ```bash
  chmod +x plugins/tribe/scripts/tests/test-codex-wiring-shaman.sh
  plugins/tribe/scripts/tests/test-codex-wiring-shaman.sh; echo "exit=$?"
  # expected: 9 "not ok -" lines, exit=1 (RED — no codex wiring in shaman.md yet)
  ```

- [ ] **Step 2: GREEN — append the lifecycle section to `plugins/tribe/agents/shaman.md`**

  Insert as **step 0.5 of Mode 2** (after the resume step, before "1. **Pick**"), and add the
  amend bullet to the Decision Log ruling path. Exact text to add:

  ````markdown
  0.5 **Forge the codex — multi-card campaigns only.** If the batch is **two or more cards**,
     before dispatching the first card you freeze the campaign's shared lookup table at
     `docs/tribe/CODEX.md`. A single-card batch skips this entirely: there is no cross-card
     consistency problem to solve and the codex would be pure overhead.

     *Why it exists:* every Hunter is a fresh context window, so without a shared table the same
     convention gets re-derived — differently — on every card, the Tracker has no rule source to
     enforce it with, and a ruling you make on card 2 never reaches card 4. The codex turns a
     repeated **judgment call** into a **lookup**.

     - **Forge it (you write it — nobody else).** Copy `docs/tribe/CODEX.template.md` and distill
       rows from: the repo's governance (`CLAUDE.md`, `.claude/rules/`, C3, the existing scripts),
       the roadmap's **Decision Log**, and the Standing Constraints block. Each row is ONE
       imperative lookup line with mandatory provenance — a `file:line` citation or a `DL-NNN`
       ruling id. Never write a row you cannot cite.
     - **Gate it mechanically first:** `validate-codex.sh docs/tribe/CODEX.md` must print
       `"verdict": "pass"` (schema, unique ids, grounded sources). Cheap gate before expensive
       judgment.
     - **One Skinner round — on the codex itself.** Dispatch the `skinner` subagent with the codex
       as the artifact and the **codex charter as a caller-given contract**: it verifies that every
       `Source` resolves and supports its `Decision`, every `Check` runs, no two `active` rows
       contradict, and every `Decision` is one unambiguous line. It rules on **grounding and form,
       never on whether a convention is the right one** — that is yours. At most **2 fix rounds**;
       you are the writer, so you fix your own document. **A row that still cannot be evidenced is
       DELETED, not softened** — every stateless agent trusts every row equally, so one lying row
       poisons every card in the campaign.
     - **Freeze it.** Commit with `status: frozen` and `codex-version: 1`. From here it is
       byte-stable for the campaign: that byte-stability is both the consistency guarantee and the
       shared prompt-cache prefix every agent spawns with.
     - **Then dispatch card 1**, and pass the codex path in every Warchief dispatch.

  **Amending a frozen codex — the only legal path.** A **Decision Log ruling** is the sole trigger:
  when you rule on a `NEEDS_DIRECTION` and the ruling is cross-card knowledge, append it to the
  codex too. No agent may edit the codex; nothing else may amend it.
  - **Append-only:** a new row with a **new ID**, whose `Source` is that `DL-NNN`. A superseded row
    is never edited in place — flip its `State` to `superseded` and let the new row replace it.
    Stable IDs mean a finding cited as `CDX-007` still means the same thing a year later.
  - **Bump `codex-version`, re-run `validate-codex.sh`, and re-run the Skinner round on the
    new/changed rows only** — not the whole table.
  - **Version pinning:** a card **already in flight keeps the codex version it was dispatched
    with**; the amendment applies to cards dispatched after it. Mutating a frozen codex under a
    running Hunter would silently make its brief stale (it was briefed on version N and will never
    learn of N+1) and break the cache prefix of every agent still in flight.

  **No codex, no problem.** If `docs/tribe/CODEX.md` does not exist (single-card batch, or a
  campaign that predates one), every agent behaves exactly as it does today. The codex is additive;
  its absence is never an error.
  ````

  ```bash
  plugins/tribe/scripts/tests/test-codex-wiring-shaman.sh; echo "exit=$?"
  # expected: 9 "ok -" lines, "# passed 9, failed 0", exit=0
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add plugins/tribe/agents/shaman.md plugins/tribe/scripts/tests/test-codex-wiring-shaman.sh docs/tribe/planning/idea-06-campaign-codex/plan.md
  git commit -m "feat(tribe): Shaman forges, reviews, freezes and amends the campaign codex" \
    -m $'Tribe-Card: idea-06-campaign-codex-impl\nTribe-Task: 3/7'
  # expected: one commit carrying both trailers
  ```

---

## Task 4: Skinner — the codex-review protocol and its hard boundary

Wave 3. Owns `plugins/tribe/agents/skinner.md` only. This is the one place a Skinner audits a
**What-level artifact**, so the boundary must be written into the prompt, not assumed.

- [ ] **Step 1: RED — the wiring test**

  Create `plugins/tribe/scripts/tests/test-codex-wiring-skinner.sh`:

  ````bash
  #!/usr/bin/env bash
  # test-codex-wiring-skinner.sh — the Skinner prompt must carry the codex-review protocol
  # AND the boundary that keeps it out of What.
  set -euo pipefail
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  F="$(cd "$HERE/../.." && pwd)/agents/skinner.md"
  PASS=0; FAIL=0
  want() { if grep -qiE "$2" "$F"; then PASS=$((PASS+1)); printf 'ok - %s\n' "$1"
           else FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; fi; }
  want "has a codex-review mode"                   'codex'
  want "treats the charter as a caller-given contract" 'caller-given'
  want "verifies every Source citation resolves"   'source|citation'
  want "checks rows do not contradict"             'contradict'
  want "may NOT fail a row for being the wrong convention" 'observation, never a FAIL|never a FAIL'
  want "unevidenced rows are deleted not softened" 'delete'
  want "enforces only Blocker rows as done-gating" 'Blocker'
  want "an absent codex is not a failure"          'no codex|absent'
  printf '\n# passed %d, failed %d\n' "$PASS" "$FAIL"
  exit $((FAIL > 0))
  ````

  ```bash
  chmod +x plugins/tribe/scripts/tests/test-codex-wiring-skinner.sh
  plugins/tribe/scripts/tests/test-codex-wiring-skinner.sh; echo "exit=$?"
  # expected: 8 "not ok -" lines, exit=1 (RED)
  ```

- [ ] **Step 2: GREEN — append to `plugins/tribe/agents/skinner.md`**

  Add a new section after step 2 ("Load the repo's governance", `skinner.md:100-112`):

  ````markdown
  ### 2b. The campaign codex — as a rule source, and (rarely) as the artifact under audit

  **As a rule source (the common case).** If `docs/tribe/CODEX.md` exists, read it. Enforce the
  rows whose `Scope` glob matches a changed file and whose `Severity` is **`Blocker`** — those
  gate done-ness, and that is your scope. `Should-fix` rows are convention conformance: they are
  the `tracker` agent's capability, not yours. Cite any finding by its row id (`CDX-NNN`). If the
  file does not exist, there is no codex this campaign — proceed exactly as you would otherwise;
  its absence is never a finding.

  **As the artifact under audit (once per campaign).** The Shaman may dispatch you against the
  **codex itself**, before it freezes. The question you answer is unchanged — *is this claimed-done
  work actually done?* — only the artifact class changes (a document, not a diff). Your contract is
  **caller-given** (level 1 of the chain above): the Shaman hands you the **codex charter**. Verify
  it by running the proof:

  1. **Every `Source` resolves and supports its `Decision`.** Open the `file:line`; read it; does it
     actually say what the row claims? A fabricated or drifted citation is the most dangerous defect
     a lookup table can have — every downstream agent trusts it blindly and never re-checks.
  2. **Every `Check` command executes** and is deterministic (or is honestly marked `manual`).
  3. **No two `active` rows contradict** — same `Scope` and `Category`, incompatible `Decision`s.
  4. **Every `Decision` is one unambiguous imperative line** — not a paragraph, not a hedge.
  5. **Schema integrity** is already gated by `validate-codex.sh`; do not re-litigate parsing. Spend
     your judgment on 1–4.

  **The boundary — do not cross it.** You rule on whether a row is **grounded, unambiguous,
  non-contradictory, and checkable**. You do **not** rule on whether a convention is the *right*
  convention: that is **What**, and What belongs to the Shaman alone. If you believe a convention is
  wrong-headed, say so as an **observation, never a FAIL**. A FAIL may be raised only on criteria
  1–5.

  **Remediation is decisive:** a row that cannot be evidenced is **deleted, not softened**. A short
  codex whose rows are all true beats a long one containing a single row that lies.
  ````

  ```bash
  plugins/tribe/scripts/tests/test-codex-wiring-skinner.sh; echo "exit=$?"
  # expected: 8 "ok -" lines, "# passed 8, failed 0", exit=0
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add plugins/tribe/agents/skinner.md plugins/tribe/scripts/tests/test-codex-wiring-skinner.sh docs/tribe/planning/idea-06-campaign-codex/plan.md
  git commit -m "feat(tribe): Skinner reviews the codex (grounding only, never the What)" \
    -m $'Tribe-Card: idea-06-campaign-codex-impl\nTribe-Task: 4/7'
  # expected: one commit carrying both trailers
  ```

---

## Task 5: Tracker — the codex as a rule source read fresh

Wave 3. Owns `plugins/tribe/agents/tracker.md` only. The Tracker already reads rules from files on
every run and is forbidden from inventing standards (`tracker.md:21`, `:33-35`, `:89`) — so this
task adds **a path, not machinery**. That refusal to invent is exactly why the codex matters: it
*promotes* a convention into something the Tracker is finally allowed to enforce.

- [ ] **Step 1: RED — the wiring test**

  Create `plugins/tribe/scripts/tests/test-codex-wiring-tracker.sh`:

  ````bash
  #!/usr/bin/env bash
  # test-codex-wiring-tracker.sh — the codex must be one of the Tracker's fresh rule sources.
  set -euo pipefail
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  F="$(cd "$HERE/../.." && pwd)/agents/tracker.md"
  PASS=0; FAIL=0
  want() { if grep -qiE "$2" "$F"; then PASS=$((PASS+1)); printf 'ok - %s\n' "$1"
           else FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; fi; }
  want "lists the codex as a rule source"      'docs/tribe/CODEX\.md'
  want "honours the row Scope glob"            'Scope'
  want "uses only active rows"                 'active'
  want "cites findings by the row id"          'CDX-'
  want "an absent codex is not an error"       'no codex|absent|does not exist'
  # The codex bullet must live inside the rule-gathering step, not in some unrelated section.
  python3 - "$F" <<'EOF'
  import re, sys
  text = open(sys.argv[1]).read()
  m = re.search(r"### 1\. Gather the rules(.*?)(?=\n### )", text, re.S)
  body = m.group(1) if m else ""
  print("ok - codex is inside the rule-gathering step" if "CODEX.md" in body
        else "not ok - codex is not inside the rule-gathering step")
  sys.exit(0 if "CODEX.md" in body else 1)
  EOF
  RC=$?
  [[ $RC -eq 0 ]] && PASS=$((PASS+1)) || FAIL=$((FAIL+1))
  printf '\n# passed %d, failed %d\n' "$PASS" "$FAIL"
  exit $((FAIL > 0))
  ````

  ```bash
  chmod +x plugins/tribe/scripts/tests/test-codex-wiring-tracker.sh
  plugins/tribe/scripts/tests/test-codex-wiring-tracker.sh; echo "exit=$?"
  # expected: 6 "not ok -" lines, exit=1 (RED)
  ```

- [ ] **Step 2: GREEN — add one bullet to the rule-gathering list in `tracker.md`**

  Append to the bullet list at `tracker.md:33-35` (after the C3 bullet), keeping the existing
  bullets untouched:

  ````markdown
  - **The campaign codex** — if `docs/tribe/CODEX.md` exists, read it fresh like any other rule
    source. It is the frozen lookup table of cross-card decisions the Shaman distilled for this
    campaign, and each `active` row whose `Scope` glob matches a changed file is one checkable
    rule. Derive one checklist item per matching row and **cite findings by the row's id**
    (`CDX-NNN`) — that id is the rule's name in the source, exactly as the citation rule below
    requires. Rows marked `superseded` are dead: ignore them. A row's `Check` column gives you the
    command that verifies it; a row's `Severity` gives you the finding's severity (`Blocker` or
    `Should-fix`). If the file does not exist, this campaign simply has no codex — that is normal
    and never a finding.
  ````

  ```bash
  plugins/tribe/scripts/tests/test-codex-wiring-tracker.sh; echo "exit=$?"
  # expected: 6 "ok -" lines, "# passed 6, failed 0", exit=0
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add plugins/tribe/agents/tracker.md plugins/tribe/scripts/tests/test-codex-wiring-tracker.sh docs/tribe/planning/idea-06-campaign-codex/plan.md
  git commit -m "feat(tribe): Tracker reads the campaign codex as a fresh rule source" \
    -m $'Tribe-Card: idea-06-campaign-codex-impl\nTribe-Task: 5/7'
  # expected: one commit carrying both trailers
  ```

---

## Task 6: Warchief — codex-first brief ordering and version pinning

Wave 3. Owns `plugins/tribe/agents/warchief.md` only. Two additions: the codex leads **every**
brief (the prompt-cache prefix), and the dispatched `codex-version` is pinned in the state file.

- [ ] **Step 1: RED — the wiring test**

  Create `plugins/tribe/scripts/tests/test-codex-wiring-warchief.sh`:

  ````bash
  #!/usr/bin/env bash
  # test-codex-wiring-warchief.sh — the Warchief must lead every brief with the codex.
  set -euo pipefail
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  F="$(cd "$HERE/../.." && pwd)/agents/warchief.md"
  PASS=0; FAIL=0
  want() { if grep -qiE "$2" "$F"; then PASS=$((PASS+1)); printf 'ok - %s\n' "$1"
           else FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; fi; }
  want "names the codex path"                     'docs/tribe/CODEX\.md'
  want "puts the codex FIRST in every brief"      'first|verbatim, before'
  want "explains the shared prompt-cache prefix"  'prefix|prompt.cache'
  want "records codex-version in the state file"  'codex-version'
  want "passes the codex to Skinner and Tracker"  'skinner|tracker'
  want "an absent codex changes nothing"          'no codex|absent|does not exist'
  printf '\n# passed %d, failed %d\n' "$PASS" "$FAIL"
  exit $((FAIL > 0))
  ````

  ```bash
  chmod +x plugins/tribe/scripts/tests/test-codex-wiring-warchief.sh
  plugins/tribe/scripts/tests/test-codex-wiring-warchief.sh; echo "exit=$?"
  # expected: 6 "not ok -" lines, exit=1 (RED)
  ```

- [ ] **Step 2: GREEN — edit `plugins/tribe/agents/warchief.md`**

  (a) Add to the **Warchief → Hunter dispatch contract** section, and (b) add the `codex-version`
  field to the state-file template in the crash-safe-state section:

  ````markdown
  - **The codex leads every brief — the ordering is load-bearing.** If `docs/tribe/CODEX.md`
    exists, it is the campaign's frozen lookup table of cross-card decisions. Every Hunter brief,
    and every `skinner` / `tracker` dispatch, is assembled in exactly this order:

    1. **the codex, verbatim** (identical bytes for every agent in the campaign)
    2. the card and spec context
    3. the task brief
    4. any volatile per-agent context

    Prompt caching matches a **prefix**: one identical leading block shared by every stateless agent
    is what makes the cache hit. Put a single per-task line *above* the codex and you destroy the
    shared prefix for every agent in the campaign — so this order is a rule, not a preference.

    Brief the Hunter with one line of instruction about it: **look the convention up in the codex;
    do not re-derive it.** A Hunter that re-derives a convention the codex already answers has
    wasted the artifact.

  - **Pin the codex version at intake.** Record `codex-version: N` (from the codex header) in your
    state file, and brief every Hunter against **that** version. If the Shaman amends the codex
    mid-campaign, your in-flight card keeps the version it was dispatched with — the amendment
    applies to cards dispatched after it.

  - **No codex, no change.** If `docs/tribe/CODEX.md` does not exist, this campaign has no codex
    (single-card batches never forge one). Brief exactly as you do today; its absence is never an
    error and never a reason to stop.
  ````

  State-file template addition (one line, in the field block):

  ```markdown
  codex-version: N-OR-NONE
  ```

  ```bash
  plugins/tribe/scripts/tests/test-codex-wiring-warchief.sh; echo "exit=$?"
  # expected: 6 "ok -" lines, "# passed 6, failed 0", exit=0
  ```

- [ ] **Step 3: Commit**

  ```bash
  git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/test-codex-wiring-warchief.sh docs/tribe/planning/idea-06-campaign-codex/plan.md
  git commit -m "feat(tribe): Warchief leads every brief with the codex and pins its version" \
    -m $'Tribe-Card: idea-06-campaign-codex-impl\nTribe-Task: 6/7'
  # expected: one commit carrying both trailers
  ```

---

## Task 7: Hunter — look it up, do not re-derive it

Wave 3. Owns `plugins/tribe/agents/hunter.md` only. The Hunter is the consumer the whole artifact
exists for: a fresh context window that would otherwise re-derive every convention from scratch
(`hunter.md:46-55`).

- [ ] **Step 1: RED — the wiring test**

  Create `plugins/tribe/scripts/tests/test-codex-wiring-hunter.sh`:

  ````bash
  #!/usr/bin/env bash
  # test-codex-wiring-hunter.sh — the Hunter must treat the codex as settled law it looks up.
  set -euo pipefail
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  F="$(cd "$HERE/../.." && pwd)/agents/hunter.md"
  PASS=0; FAIL=0
  want() { if grep -qiE "$2" "$F"; then PASS=$((PASS+1)); printf 'ok - %s\n' "$1"
           else FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; fi; }
  want "knows the codex leads its brief"        'codex'
  want "looks the convention up, never re-derives it" 'look.*up|do not re-derive'
  want "may not edit the codex"                 'never edit|do not edit'
  want "conflicts go back to the Warchief"      'NEEDS_CONTEXT|report back'
  want "an absent codex is normal"              'no codex|absent|does not exist'
  printf '\n# passed %d, failed %d\n' "$PASS" "$FAIL"
  exit $((FAIL > 0))
  ````

  ```bash
  chmod +x plugins/tribe/scripts/tests/test-codex-wiring-hunter.sh
  plugins/tribe/scripts/tests/test-codex-wiring-hunter.sh; echo "exit=$?"
  # expected: 5 "not ok -" lines, exit=1 (RED)
  ```

- [ ] **Step 2: GREEN — append to `plugins/tribe/agents/hunter.md`**

  Add to the operating rules (near the "Honor the repo's laws" rule at `hunter.md:78`):

  ````markdown
  - **The codex is a lookup table, not reading material.** When your brief opens with a campaign
    codex (`docs/tribe/CODEX.md`), it is the frozen table of decisions the Shaman already made for
    this whole campaign. Its rows are **settled law, exactly like the brief**: when a row's `Scope`
    matches a file you touch, **look the row up and follow it — never re-derive the convention from
    the repo, and never "improve" on it.** Re-deriving is how ten Hunters end up with ten different
    answers to the same question; the codex exists precisely to stop that.
    - **Never edit the codex.** It is frozen for the campaign, and only the Shaman may amend it
      (through a Decision Log ruling). Editing it is out of scope for every task, always.
    - **If a codex row contradicts your brief, or two rows contradict each other, STOP** and report
      `NEEDS_CONTEXT` to the Warchief with the row ids. Do not pick a winner yourself — a
      contradiction in settled law is precisely the class of thing you must never resolve alone.
    - If your brief has no codex, this campaign has no codex. That is normal: work from the brief
      and the repo's rules exactly as you otherwise would.
  ````

  ```bash
  plugins/tribe/scripts/tests/test-codex-wiring-hunter.sh; echo "exit=$?"
  # expected: 5 "ok -" lines, "# passed 5, failed 0", exit=0
  ```

- [ ] **Step 3: Full-suite regression — every test in the repo, green**

  ```bash
  for t in plugins/tribe/scripts/tests/test-*.sh; do
    printf '%-46s' "$t"; "$t" >/dev/null 2>&1 && echo PASS || echo FAIL
  done
  # expected: 8 lines, all PASS — test-validate-plan, test-resume-check, test-validate-codex,
  # test-codex-template, and the five test-codex-wiring-* scripts
  ```

- [ ] **Step 4: Commit**

  ```bash
  git add plugins/tribe/agents/hunter.md plugins/tribe/scripts/tests/test-codex-wiring-hunter.sh docs/tribe/planning/idea-06-campaign-codex/plan.md
  git commit -m "feat(tribe): Hunter looks conventions up in the codex instead of re-deriving them" \
    -m $'Tribe-Card: idea-06-campaign-codex-impl\nTribe-Task: 7/7'
  # expected: one commit carrying both trailers
  ```

---

## Evidence (for the implementing Warchief's PR)

Per spec §6, capture and embed:
- **Before:** `ls plugins/tribe/scripts/validate-codex.sh` (absent) and
  `grep -rn 'CODEX' plugins/tribe/agents/` (no matches) — proving no agent had a codex rule source.
- **After:** the full-suite loop from Task 7 Step 3, all PASS; `validate-codex.sh` on the template
  printing `"verdict": "pass"`; and the same script on a deliberately-broken row printing `"fail"`
  with the offending check named.
- **Prompt-cache proof:** a rendered sample Hunter brief showing the codex block first, byte-
  identical across two different task briefs (`diff <(head -c 2000 brief-a.md) <(head -c 2000 brief-b.md)`
  is empty).
