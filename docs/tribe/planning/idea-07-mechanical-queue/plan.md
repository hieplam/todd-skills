# Plan — Idea 07: Mechanical work queue (`build-queue.sh`)

**Card:** idea-07-mechanical-queue
**Spec:** `docs/tribe/planning/idea-07-mechanical-queue/spec.md` (read it first — it holds the
contract this plan implements)
**Repo:** `todd-skills`; all work lands under `plugins/tribe/`.

This plan is written for a **future implementation campaign**. The planning campaign that authored
it changed nothing under `plugins/`; every code block below is the *intended* content for the
implementer to write.

---

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **TDD, strictly.** Every task is red → green → commit: write the failing test, run it and *see it
  fail*, write the minimal code to pass, run it and see it pass, commit. Never write the
  implementation first.
- **One commit per task.** Every task is a single unit of work ending in exactly one commit. The
  commit ticks that task's checkboxes in the SAME commit as the code, and carries the trailers:
  `Tribe-Card: idea-07-mechanical-queue` and `Tribe-Task: N/6`. Both keys go in the commit
  message's ONE final paragraph. No co-authored trailers.
- **Script family contract (non-negotiable — match `validate-plan.sh` / `resume-check.sh` /
  `heartbeat-check.sh` exactly).** Bash wrapper for args and setup errors, a `python3` heredoc for
  the real work, `set -euo pipefail`, `LOG`/`DIE` helpers, `-h/--help` prints the header comment via
  `sed`, **JSON summary on stdout only**, all logs on stderr. **Exit 0 = ran successfully regardless
  of the verdict; exit 2 = setup error.** A failing proof command is the *normal* case and is never
  an error of this script.
- **Tests are offline and hermetic.** No network, no real test runner: every fixture's "proof
  command" is a throwaway script printing canned output. Tests follow `test-validate-plan.sh`'s
  style verbatim (`mktemp -d` + `trap`, `ok`/`bad`/`check`, a `jget` python3 heredoc, a final
  `N passed, M failed` line, `exit $((FAIL > 0))`).
- **This repo has no CI workflow.** The test scripts are the gate: both
  `bash plugins/tribe/scripts/tests/test-build-queue.sh` and
  `bash plugins/tribe/scripts/tests/test-validate-plan.sh` must be green before any task is
  considered done.
- **Backward compatibility is a hard requirement.** Existing (non-queue) plans must validate exactly
  as they do today. The queue mode activates only on an explicit `Queue:` declaration.
- If a brief is ambiguous or a product decision surfaces, STOP and report `NEEDS_CONTEXT` to the
  Warchief. Do not guess.

---

## Task 1: `build-queue.sh` skeleton — args, proof-command discovery, JSON summary

**Goal:** the script exists, parses its flags, discovers the repo's proof command through the fixed
precedence chain, runs it, and prints the family-standard JSON summary. No parsing yet.

**Files:** create `plugins/tribe/scripts/build-queue.sh`, create
`plugins/tribe/scripts/tests/test-build-queue.sh`.

- [ ] **Step 1: Write the failing test**

Create `plugins/tribe/scripts/tests/test-build-queue.sh`:

```bash
#!/usr/bin/env bash
# test-build-queue.sh — fixture tests for build-queue.sh (offline, no network,
# no real test runner: every "proof command" is a canned-output script).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../build-queue.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check() { # check NAME ACTUAL WANT
  if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2, want: $3)"; fi
}
jget() { # jget FILE DOTTED.PATH — prints the value, or MISSING
  python3 - "$1" "$2" <<'EOF'
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
rc_of() { # rc_of CMD... — prints the exit code, never trips set -e
  set +e; "$@" >/dev/null 2>&1; local rc=$?; set -e; printf '%d' "$rc"
}

# ---------- discovery precedence ----------
R1="$TMP/r1"; mkdir -p "$R1"
printf '{"scripts":{"test":"echo pkg-json-test"}}\n' > "$R1/package.json"

# 1. --proof beats everything
TRIBE_PROOF_CMD="echo env-cmd" bash "$SCRIPT" --repo-root "$R1" --proof "echo flag-cmd" \
  --dry-run > "$TMP/d1.json"
check "--proof wins"            "$(jget "$TMP/d1.json" proof_cmd)"        "echo flag-cmd"
check "--proof source reported" "$(jget "$TMP/d1.json" proof_cmd_source)" "--proof"

# 2. env var beats package.json
TRIBE_PROOF_CMD="echo env-cmd" bash "$SCRIPT" --repo-root "$R1" --dry-run > "$TMP/d2.json"
check "env var beats package.json" "$(jget "$TMP/d2.json" proof_cmd)"        "echo env-cmd"
check "env source reported"        "$(jget "$TMP/d2.json" proof_cmd_source)" "TRIBE_PROOF_CMD"

# 3. package.json scripts.test
bash "$SCRIPT" --repo-root "$R1" --dry-run > "$TMP/d3.json"
check "package.json scripts.test" "$(jget "$TMP/d3.json" proof_cmd)"        "echo pkg-json-test"
check "package source reported"   "$(jget "$TMP/d3.json" proof_cmd_source)" "package.json:scripts.test"

# 4. Cargo.toml
R2="$TMP/r2"; mkdir -p "$R2"; printf '[package]\nname = "x"\n' > "$R2/Cargo.toml"
bash "$SCRIPT" --repo-root "$R2" --dry-run > "$TMP/d4.json"
check "Cargo.toml discovery" "$(jget "$TMP/d4.json" proof_cmd)" "cargo check --message-format=json"

# 5. Makefile test target
R3="$TMP/r3"; mkdir -p "$R3"; printf 'test:\n\techo hi\n' > "$R3/Makefile"
bash "$SCRIPT" --repo-root "$R3" --dry-run > "$TMP/d5.json"
check "Makefile discovery" "$(jget "$TMP/d5.json" proof_cmd)" "make test"

# ---------- setup errors: exit 2, never a silent guess ----------
R4="$TMP/r4"; mkdir -p "$R4"
check "no proof command exits 2"  "$(rc_of bash "$SCRIPT" --repo-root "$R4" --dry-run)"        "2"
check "unknown flag exits 2"      "$(rc_of bash "$SCRIPT" --repo-root "$R4" --bogus)"          "2"
check "unknown parser exits 2"    "$(rc_of bash "$SCRIPT" --repo-root "$R4" --proof true --parser nope)" "2"
check "missing repo root exits 2" "$(rc_of bash "$SCRIPT" --repo-root "$TMP/nope" --proof true)" "2"
check "help exits 0"              "$(rc_of bash "$SCRIPT" --help)"                             "0"

# ---------- a failing proof command is NORMAL: exit 0, signal in the JSON ----------
R5="$TMP/r5"; mkdir -p "$R5"
check "failing proof still exits 0" \
  "$(rc_of bash "$SCRIPT" --repo-root "$R5" --proof "exit 1" --out "$TMP/q5.tsv")" "0"
bash "$SCRIPT" --repo-root "$R5" --proof "exit 1" --out "$TMP/q5.tsv" > "$TMP/d6.json"
check "proof exit code reported" "$(jget "$TMP/d6.json" proof_exit_code)" "1"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
exit $((FAIL > 0))
```

- [ ] **Step 2: Run it — see RED**

```bash
bash plugins/tribe/scripts/tests/test-build-queue.sh
```

Expected: the run fails — every check reports `not ok` (the script does not exist yet), and the
final line shows `0 passed, 14 failed`.

- [ ] **Step 3: Write `plugins/tribe/scripts/build-queue.sh` (minimal — discovery + summary)**

```bash
#!/usr/bin/env bash
# build-queue.sh — turn the repo's proof command into a MECHANICAL work queue, instead of
# having the Warchief narrate a list of failures in prose.
#
# It runs the repo's proof command (test suite / lint / build), parses each failure into one
# line of queue.tsv, and writes each failure's raw block to its own detail file. The queue is
# machine output; agents only consume it. One row = one task = one unit of work.
#
# queue.tsv schema (tab-separated, '#'-prefixed header, sorted by file then digest):
#   id     content-derived sha1(file + TAB + digest), 12 hex chars — STABLE across re-runs
#   file   repo-relative path of the failing file
#   digest one-line normalised error summary (volatile bits stripped, 160 chars max)
#   detail path to the raw failure block, queue.d/ID.txt, relative to queue.tsv
#
# Idempotent: re-running refreshes the queue in place — fixed failures lose their row and their
# detail file; an unchanged failure set reproduces a byte-identical queue.tsv. Zero rows
# ("queue_empty": true) is the sweep's mechanical done-check.
#
# Proof-command discovery (fixed precedence; the choice is always reported, never guessed):
#   1. --proof CMD   2. TRIBE_PROOF_CMD   3. package.json scripts.test
#   4. Cargo.toml    5. Makefile 'test:' target      none -> exit 2
#
# Output: prints a JSON summary on stdout (only). Logs go to stderr.
# Exit codes: 0 = ran successfully (regardless of how many failures were found); 2 = setup error.
# A non-zero proof command is the NORMAL case, not an error of this script.
#
# Usage:
#   build-queue.sh [--proof CMD] [--parser auto|generic|pytest|jest|eslint|cargo]
#                  [--out FILE] [--repo-root DIR] [--dry-run]

set -euo pipefail

LOG() { printf '[build-queue] %s\n' "$*" >&2; }
DIE() { LOG "ERROR: $*"; exit 2; }

PROOF_CMD=""; PARSER="auto"; OUT=""; REPO_ROOT=""; DRY_RUN=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --proof)     [[ $# -ge 2 ]] || DIE "missing value for --proof";     PROOF_CMD="$2"; shift 2 ;;
    --parser)    [[ $# -ge 2 ]] || DIE "missing value for --parser";    PARSER="$2";    shift 2 ;;
    --out)       [[ $# -ge 2 ]] || DIE "missing value for --out";       OUT="$2";       shift 2 ;;
    --repo-root) [[ $# -ge 2 ]] || DIE "missing value for --repo-root"; REPO_ROOT="$2"; shift 2 ;;
    --dry-run)   DRY_RUN=1; shift ;;
    -h|--help)   sed -n '2,29p' "$0"; exit 0 ;;
    -*)          DIE "unknown flag: $1" ;;
    *)           DIE "unexpected extra argument: $1" ;;
  esac
done

REPO_ROOT="${REPO_ROOT:-$PWD}"
[[ -d "$REPO_ROOT" ]] || DIE "repo root not found: $REPO_ROOT"
REPO_ROOT="$(cd "$REPO_ROOT" && pwd)"
OUT="${OUT:-$REPO_ROOT/queue.tsv}"
command -v python3 >/dev/null 2>&1 || DIE "python3 is required but not on PATH"
case "$PARSER" in
  auto|generic|pytest|jest|eslint|cargo) ;;
  *) DIE "unknown parser: $PARSER (want: auto|generic|pytest|jest|eslint|cargo)" ;;
esac

# --- proof-command discovery: a fixed chain, and the winner is always reported --------------
PROOF_SRC=""
if [[ -n "$PROOF_CMD" ]]; then
  PROOF_SRC="--proof"
elif [[ -n "${TRIBE_PROOF_CMD:-}" ]]; then
  PROOF_CMD="$TRIBE_PROOF_CMD"; PROOF_SRC="TRIBE_PROOF_CMD"
elif [[ -f "$REPO_ROOT/package.json" ]] &&
     PKG_TEST="$(python3 -c 'import json,sys
try:
    print(json.load(open(sys.argv[1])).get("scripts", {}).get("test", ""))
except Exception:
    print("")' "$REPO_ROOT/package.json")" && [[ -n "$PKG_TEST" ]]; then
  PROOF_CMD="$PKG_TEST"; PROOF_SRC="package.json:scripts.test"
elif [[ -f "$REPO_ROOT/Cargo.toml" ]]; then
  PROOF_CMD="cargo check --message-format=json"; PROOF_SRC="Cargo.toml"
elif [[ -f "$REPO_ROOT/Makefile" ]] && grep -qE '^test:' "$REPO_ROOT/Makefile"; then
  PROOF_CMD="make test"; PROOF_SRC="Makefile:test"
else
  DIE "no proof command: pass --proof or set TRIBE_PROOF_CMD"
fi
LOG "proof command ($PROOF_SRC): $PROOF_CMD"

if [[ "$DRY_RUN" -eq 1 ]]; then
  python3 -c 'import json,sys
print(json.dumps({"proof_cmd": sys.argv[1], "proof_cmd_source": sys.argv[2],
                  "parser": sys.argv[3], "dry_run": True}, indent=2))' \
    "$PROOF_CMD" "$PROOF_SRC" "$PARSER"
  exit 0
fi

# --- run the proof command; a non-zero exit is the normal, expected case --------------------
RAW="$(mktemp)"
trap 'rm -f "$RAW"' EXIT
set +e
( cd "$REPO_ROOT" && eval "$PROOF_CMD" ) > "$RAW" 2>&1
PROOF_EXIT=$?
set -e
LOG "proof command exited $PROOF_EXIT ($(wc -l < "$RAW" | tr -d ' ') lines of output)"

python3 -c 'import json,sys
print(json.dumps({"queue_file": sys.argv[1], "proof_cmd": sys.argv[2],
                  "proof_cmd_source": sys.argv[3], "parser": sys.argv[4],
                  "proof_exit_code": int(sys.argv[5]), "row_count": 0,
                  "queue_empty": True}, indent=2))' \
  "$OUT" "$PROOF_CMD" "$PROOF_SRC" "$PARSER" "$PROOF_EXIT"
```

Then make it executable:

```bash
chmod +x plugins/tribe/scripts/build-queue.sh
```

- [ ] **Step 4: Run the test — see GREEN**

```bash
bash plugins/tribe/scripts/tests/test-build-queue.sh
```

Expected: `14 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/build-queue.sh \
        plugins/tribe/scripts/tests/test-build-queue.sh \
        docs/tribe/planning/idea-07-mechanical-queue/plan.md
git commit -m "feat(tribe): build-queue.sh skeleton — proof-command discovery + JSON summary" \
  -m $'Tribe-Card: idea-07-mechanical-queue\nTribe-Task: 1/6'
```

Expected: one commit, both trailers visible in
`git log -1 --format='%(trailers:key=Tribe-Card,key=Tribe-Task)'`.

---

## Task 2: the generic parser, `queue.tsv` schema, stable ids, detail files

**Goal:** real rows. Parse the proof output with the `generic` parser, write the 4-column
`queue.tsv` plus one `queue.d/ID.txt` detail file per row, with content-derived stable ids and a
deterministic sort.

**Files:** edit `plugins/tribe/scripts/build-queue.sh`, edit
`plugins/tribe/scripts/tests/test-build-queue.sh`.

- [ ] **Step 1: Write the failing test**

Append to `plugins/tribe/scripts/tests/test-build-queue.sh`, **before** its final `printf` /
`exit` lines:

```bash
# ---------- generic parser: schema, ids, detail files, sorting ----------
R6="$TMP/r6"; mkdir -p "$R6/src"
cat > "$R6/proof.sh" <<'EOF'
#!/usr/bin/env bash
echo "src/beta.ts:12:5: TypeError: cannot read property exp of undefined"
echo "    at Object.verify (src/beta.ts:12:5)"
echo "    at Context.run (src/harness.ts:88:1)"
echo "src/alpha.ts:3:1: SyntaxError: unexpected token"
exit 1
EOF
chmod +x "$R6/proof.sh"
Q6="$TMP/q6/queue.tsv"; mkdir -p "$TMP/q6"
bash "$SCRIPT" --repo-root "$R6" --proof "./proof.sh" --parser generic --out "$Q6" > "$TMP/d7.json"

check "two rows parsed"    "$(jget "$TMP/d7.json" row_count)"   "2"
check "queue not empty"    "$(jget "$TMP/d7.json" queue_empty)" "false"
check "header line"        "$(head -1 "$Q6")"                   "$(printf '#id\tfile\tdigest\tdetail')"
check "row count on disk"  "$(grep -vc '^#' "$Q6")"             "2"
check "4 columns per row"  "$(awk -F'\t' '!/^#/ {print NF}' "$Q6" | sort -u)" "4"
# deterministic sort: alpha.ts sorts before beta.ts
check "rows sorted by file" "$(awk -F'\t' '!/^#/ {print $2}' "$Q6" | head -1)" "src/alpha.ts"

# the detail file holds the RAW block (the stacktrace the Hunter actually reads)
BETA_ID="$(awk -F'\t' '$2 == "src/beta.ts" {print $1}' "$Q6")"
BETA_DETAIL="$(awk -F'\t' '$2 == "src/beta.ts" {print $4}' "$Q6")"
check "detail path is queue.d/ID.txt" "$BETA_DETAIL" "queue.d/$BETA_ID.txt"
if [[ -f "$TMP/q6/$BETA_DETAIL" ]]; then ok "detail file exists"; else bad "detail file exists"; fi
if grep -q "at Object.verify" "$TMP/q6/$BETA_DETAIL"; then ok "detail holds the raw stack"; else bad "detail holds the raw stack"; fi

# id is content-derived: same failure -> same id on a fresh run into a fresh dir
Q6B="$TMP/q6b/queue.tsv"; mkdir -p "$TMP/q6b"
bash "$SCRIPT" --repo-root "$R6" --proof "./proof.sh" --parser generic --out "$Q6B" > /dev/null
BETA_ID2="$(awk -F'\t' '$2 == "src/beta.ts" {print $1}' "$Q6B")"
check "id is stable across runs" "$BETA_ID2" "$BETA_ID"

# a green proof command yields an empty queue — the sweep's done-check
R7="$TMP/r7"; mkdir -p "$R7"
Q7="$TMP/q7/queue.tsv"; mkdir -p "$TMP/q7"
bash "$SCRIPT" --repo-root "$R7" --proof "true" --parser generic --out "$Q7" > "$TMP/d8.json"
check "green proof -> 0 rows"      "$(jget "$TMP/d8.json" row_count)"   "0"
check "green proof -> queue_empty" "$(jget "$TMP/d8.json" queue_empty)" "true"
```

- [ ] **Step 2: Run it — see RED**

```bash
bash plugins/tribe/scripts/tests/test-build-queue.sh
```

Expected: the 14 task-1 checks still pass; the new checks fail (the script still reports
`row_count: 0` and writes no queue file), so the run ends non-zero with roughly
`14 passed, 12 failed`.

- [ ] **Step 3: Implement — replace the final `python3 -c` summary block with the real engine**

In `plugins/tribe/scripts/build-queue.sh`, delete the closing `python3 -c ...` summary from task 1
and put this in its place:

```bash
python3 - "$RAW" "$OUT" "$REPO_ROOT" "$PARSER" "$PROOF_CMD" "$PROOF_SRC" "$PROOF_EXIT" <<'PY'
import hashlib, json, os, re, sys

raw_path, out_path, repo_root, parser, proof_cmd, proof_src, proof_exit = sys.argv[1:8]
proof_exit = int(proof_exit)

ANSI_RE = re.compile(r"\x1b\[[0-9;]*[A-Za-z]")
with open(raw_path, errors="replace") as fh:
    lines = ANSI_RE.sub("", fh.read()).splitlines()

# --- digest normalisation: strip the volatile bits, so the digest (and therefore the id)
# is the SAME for the same failure on every run. This invariant is what makes the queue
# idempotent; without it, every refresh would churn every row.
VOLATILE = [
    (re.compile(re.escape(repo_root.rstrip("/")) + "/?"), ""),
    (re.compile(r"\b0x[0-9a-fA-F]+\b"), "ADDR"),
    (re.compile(r"\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}\S*"), "TIME"),
    (re.compile(r"\b\d+(?:\.\d+)?\s?(?:ms|s|sec|secs|seconds)\b"), "DUR"),
    (re.compile(r"\bpid[:= ]\s*\d+\b", re.IGNORECASE), "PID"),
    (re.compile(r"\s+"), " "),
]

def digest_of(msg):
    d = msg.replace("\t", " ").strip()
    for rx, rep in VOLATILE:
        d = rx.sub(rep, d)
    return d.strip()[:160]

def relpath(p):
    p = p.strip()
    if os.path.isabs(p):
        try:
            p = os.path.relpath(p, repo_root)
        except ValueError:
            pass
    return p.replace("\t", " ")

# --- generic parser: the two universal failure shapes, so an unknown toolchain still
# produces a usable queue instead of an error.
FILE_LINE_RE = re.compile(r"^\s*(?P<file>[^\s:]+\.[A-Za-z0-9]+):(?P<ln>\d+)(?::\d+)?:?\s+(?P<msg>\S.*)$")
FAIL_RE = re.compile(r"^\s*(?:FAIL|FAILED)\s+(?P<file>\S+)\s*(?P<msg>.*)$")
BLOCK_MAX = 40

def parse_generic(lines):
    items, cur = [], None
    for line in lines:
        m = FILE_LINE_RE.match(line) or FAIL_RE.match(line)
        if m:
            cur = {"file": m.group("file"),
                   "message": (m.group("msg") or "failed").strip(),
                   "block": [line]}
            items.append(cur)
        elif cur is not None and line.strip() and len(cur["block"]) < BLOCK_MAX:
            cur["block"].append(line)
        elif not line.strip():
            cur = None
    return items

PARSERS = {"generic": parse_generic}

def pick_parser(name, lines):
    return name if name in PARSERS else "generic"

chosen = pick_parser(parser, lines)
items = PARSERS[chosen](lines)

# --- rows: content-derived id, de-duplicated, deterministically sorted
rows = {}
for it in items:
    f, d = relpath(it["file"]), digest_of(it["message"])
    if not f or not d:
        continue
    rid = hashlib.sha1((f + "\t" + d).encode("utf-8")).hexdigest()[:12]
    rows.setdefault(rid, {"id": rid, "file": f, "digest": d,
                          "block": "\n".join(it["block"])})
ordered = sorted(rows.values(), key=lambda r: (r["file"], r["digest"]))

out_dir = os.path.dirname(os.path.abspath(out_path)) or "."
detail_dir = os.path.join(out_dir, "queue.d")
os.makedirs(detail_dir, exist_ok=True)
for r in ordered:
    r["detail"] = os.path.join("queue.d", r["id"] + ".txt")
    with open(os.path.join(out_dir, r["detail"]), "w") as fh:
        fh.write(r["block"].rstrip() + "\n")

with open(out_path, "w") as fh:
    fh.write("#id\tfile\tdigest\tdetail\n")
    for r in ordered:
        fh.write("\t".join([r["id"], r["file"], r["digest"], r["detail"]]) + "\n")

print(json.dumps({
    "queue_file": out_path,
    "detail_dir": os.path.join(out_dir, "queue.d"),
    "proof_cmd": proof_cmd,
    "proof_cmd_source": proof_src,
    "parser": chosen,
    "proof_exit_code": proof_exit,
    "row_count": len(ordered),
    "queue_empty": len(ordered) == 0,
}, indent=2))
PY
```

- [ ] **Step 4: Run the test — see GREEN**

```bash
bash plugins/tribe/scripts/tests/test-build-queue.sh
```

Expected: `26 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/build-queue.sh \
        plugins/tribe/scripts/tests/test-build-queue.sh \
        docs/tribe/planning/idea-07-mechanical-queue/plan.md
git commit -m "feat(tribe): queue.tsv schema, stable content-derived ids, raw detail files" \
  -m $'Tribe-Card: idea-07-mechanical-queue\nTribe-Task: 2/6'
```

Expected: one commit carrying both trailers.

---

## Task 3: toolchain parsers — `pytest`, `jest`, `eslint`, `cargo`, and `auto` inference

**Goal:** each supported runner's failures parse into the same rows; `auto` picks the right parser
from the proof command and the output shape, and degrades to `generic` for an unknown toolchain
rather than erroring.

**Files:** edit `plugins/tribe/scripts/build-queue.sh`, edit
`plugins/tribe/scripts/tests/test-build-queue.sh`.

- [ ] **Step 1: Write the failing test**

Append to `plugins/tribe/scripts/tests/test-build-queue.sh` (before the final `printf` / `exit`):

```bash
# ---------- toolchain parsers ----------
mk_repo() { # mk_repo NAME  — makes a repo dir whose ./proof.sh prints canned output on stdin
  local d="$TMP/$1"; mkdir -p "$d"
  { printf '#!/usr/bin/env bash\ncat <<'"'"'OUTPUT'"'"'\n'; cat; printf 'OUTPUT\nexit 1\n'; } > "$d/proof.sh"
  chmod +x "$d/proof.sh"; printf '%s' "$d"
}
run_parser() { # run_parser REPO PARSER OUTJSON QUEUE
  bash "$SCRIPT" --repo-root "$1" --proof "./proof.sh" --parser "$2" --out "$4" > "$3"
}

# pytest
P_REPO="$(mk_repo pytest <<'EOF'
=================================== FAILURES ===================================
____________________________ test_token_expiry _________________________________
    def test_token_expiry():
>       assert decode(tok) == 401
E       AssertionError: assert 200 == 401
=========================== short test summary info ============================
FAILED tests/test_auth.py::test_token_expiry - AssertionError: assert 200 == 401
FAILED tests/test_user.py::test_create - KeyError: 'email'
============================== 2 failed in 1.20s ===============================
EOF
)"
mkdir -p "$TMP/qp"; run_parser "$P_REPO" pytest "$TMP/dp.json" "$TMP/qp/queue.tsv"
check "pytest rows"  "$(jget "$TMP/dp.json" row_count)" "2"
check "pytest file"  "$(awk -F'\t' '!/^#/ {print $2}' "$TMP/qp/queue.tsv" | head -1)" "tests/test_auth.py"
check "pytest digest carries the test name" \
  "$(awk -F'\t' '!/^#/ && $2 == "tests/test_auth.py" {print $3}' "$TMP/qp/queue.tsv" | grep -c 'test_token_expiry')" "1"

# jest
J_REPO="$(mk_repo jest <<'EOF'
FAIL src/auth/token.test.ts
  ● token › rejects an expired token

    expect(received).toBe(expected)
    Expected: 401
    Received: 200

  ● token › rejects a forged signature

    TypeError: cannot read property exp of undefined
EOF
)"
mkdir -p "$TMP/qj"; run_parser "$J_REPO" jest "$TMP/dj.json" "$TMP/qj/queue.tsv"
check "jest rows" "$(jget "$TMP/dj.json" row_count)" "2"
check "jest file" "$(awk -F'\t' '!/^#/ {print $2}' "$TMP/qj/queue.tsv" | sort -u)" "src/auth/token.test.ts"

# eslint (stylish)
E_REPO="$(mk_repo eslint <<'EOF'
/repo/src/index.ts
   3:1   error  Unexpected var, use let or const instead  no-var
  10:7   error  Strings must use singlequote              quotes
  12:1   warning  Unexpected console statement            no-console
EOF
)"
mkdir -p "$TMP/qe"; run_parser "$E_REPO" eslint "$TMP/de.json" "$TMP/qe/queue.tsv"
check "eslint rows (errors only, warnings ignored)" "$(jget "$TMP/de.json" row_count)" "2"

# cargo (--message-format=json)
C_REPO="$(mk_repo cargo <<'EOF'
{"reason":"compiler-message","message":{"level":"error","message":"cannot borrow `x` as mutable","spans":[{"file_name":"src/lib.rs","line_start":42,"is_primary":true}],"rendered":"error[E0502]: cannot borrow `x` as mutable\n  --> src/lib.rs:42:5"}}
{"reason":"compiler-message","message":{"level":"warning","message":"unused variable: `y`","spans":[{"file_name":"src/lib.rs","line_start":7,"is_primary":true}],"rendered":"warning: unused variable"}}
{"reason":"build-finished","success":false}
EOF
)"
mkdir -p "$TMP/qc"; run_parser "$C_REPO" cargo "$TMP/dc.json" "$TMP/qc/queue.tsv"
check "cargo rows (errors only)" "$(jget "$TMP/dc.json" row_count)" "1"
check "cargo file" "$(awk -F'\t' '!/^#/ {print $2}' "$TMP/qc/queue.tsv")" "src/lib.rs"

# ---------- auto inference ----------
mkdir -p "$TMP/qa1"
bash "$SCRIPT" --repo-root "$J_REPO" --proof "npx jest --ci" --parser auto --out "$TMP/qa1/queue.tsv" > "$TMP/da1.json" || true
check "auto infers jest from the proof command" "$(jget "$TMP/da1.json" parser)" "jest"

mkdir -p "$TMP/qa2"
run_parser "$P_REPO" auto "$TMP/da2.json" "$TMP/qa2/queue.tsv"
check "auto infers pytest from the output shape" "$(jget "$TMP/da2.json" parser)" "pytest"

U_REPO="$(mk_repo unknown <<'EOF'
src/thing.zig:19:3: error: expected type 'u32'
EOF
)"
mkdir -p "$TMP/qa3"; run_parser "$U_REPO" auto "$TMP/da3.json" "$TMP/qa3/queue.tsv"
check "auto degrades to generic"        "$(jget "$TMP/da3.json" parser)"    "generic"
check "unknown toolchain still queues"  "$(jget "$TMP/da3.json" row_count)" "1"
```

- [ ] **Step 2: Run it — see RED**

```bash
bash plugins/tribe/scripts/tests/test-build-queue.sh
```

Expected: the 26 earlier checks still pass; the new parser checks fail (only `generic` exists, so
`parser` reports `generic` everywhere and the row counts are wrong).

- [ ] **Step 3: Implement — add the parsers and the inference**

In `build-queue.sh`'s python heredoc, insert these parsers after `parse_generic`, and replace the
`PARSERS` / `pick_parser` lines:

```python
PYTEST_FAILED_RE = re.compile(r"^FAILED\s+(?P<file>[^\s:]+)::(?P<test>[^\s]+)\s*(?:-\s*(?P<msg>.*))?$")

def parse_pytest(lines):
    items = []
    for i, line in enumerate(lines):
        m = PYTEST_FAILED_RE.match(line)
        if not m:
            continue
        msg = (m.group("msg") or "").strip() or "failed"
        items.append({"file": m.group("file"),
                      "message": f"{m.group('test')}: {msg}",
                      "block": _block_from(lines, i)})
    return items

JEST_FAIL_RE = re.compile(r"^\s*FAIL\s+(?P<file>\S+)\s*$")
JEST_CASE_RE = re.compile(r"^\s*(?:●|●)\s+(?P<title>\S.*)$")

def parse_jest(lines):
    items, cur_file = [], None
    for i, line in enumerate(lines):
        mf = JEST_FAIL_RE.match(line)
        if mf:
            cur_file = mf.group("file")
            continue
        mc = JEST_CASE_RE.match(line)
        if mc and cur_file and not mc.group("title").lower().startswith("console"):
            detail = next((l.strip() for l in lines[i + 1:i + 8] if l.strip()), "")
            items.append({"file": cur_file,
                          "message": f"{mc.group('title').strip()}: {detail}",
                          "block": _block_from(lines, i)})
    return items

ESLINT_FILE_RE = re.compile(r"^(?P<file>(?:/|\./|[A-Za-z0-9_.-]+/)[^\s:]*\.[A-Za-z0-9]+)\s*$")
ESLINT_MSG_RE = re.compile(r"^\s*(?P<ln>\d+):(?P<col>\d+)\s+error\s+(?P<msg>\S.*?)\s*$")

def parse_eslint(lines):
    items, cur_file = [], None
    for i, line in enumerate(lines):
        mf = ESLINT_FILE_RE.match(line)
        if mf:
            cur_file = mf.group("file")
            continue
        mm = ESLINT_MSG_RE.match(line)
        if mm and cur_file:
            items.append({"file": cur_file,
                          "message": f"line {mm.group('ln')}: {mm.group('msg')}",
                          "block": _block_from(lines, i)})
    return items

def parse_cargo(lines):
    items = []
    for i, line in enumerate(lines):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except ValueError:
            continue
        if obj.get("reason") != "compiler-message":
            continue
        msg = obj.get("message") or {}
        if msg.get("level") != "error":
            continue
        spans = [s for s in msg.get("spans", []) if s.get("is_primary")] or msg.get("spans", [])
        if not spans:
            continue
        items.append({"file": spans[0].get("file_name", ""),
                      "message": msg.get("message", "error"),
                      "block": msg.get("rendered") or msg.get("message", "")})
    return items

def _block_from(lines, i):
    block = [lines[i]]
    for l in lines[i + 1:i + BLOCK_MAX]:
        if not l.strip():
            break
        block.append(l)
    return block

PARSERS = {"generic": parse_generic, "pytest": parse_pytest, "jest": parse_jest,
           "eslint": parse_eslint, "cargo": parse_cargo}

# auto: infer from the proof command first (cheap and explicit), then from the output shape,
# then fall back to generic — an unknown toolchain must still yield a usable queue.
CMD_HINTS = [("pytest", "pytest"), ("jest", "jest"), ("vitest", "jest"),
             ("eslint", "eslint"), ("cargo", "cargo")]
def pick_parser(name, lines, cmd):
    if name in PARSERS:
        return name
    low = cmd.lower()
    for needle, p in CMD_HINTS:
        if needle in low:
            return p
    head = "\n".join(lines[:200])
    if PYTEST_FAILED_RE.search(head) or "short test summary info" in head:
        return "pytest"
    if re.search(r"^\s*●\s+", head, re.MULTILINE):
        return "jest"
    if '"reason":"compiler-message"' in head.replace(" ", ""):
        return "cargo"
    if re.search(r"^\s*\d+:\d+\s+error\s+", head, re.MULTILINE):
        return "eslint"
    return "generic"
```

`parse_generic` must also use the shared block helper — replace its body's inline block collection
with `_block_from` semantics (a matched line plus following non-blank lines, capped at `BLOCK_MAX`).
Finally change the call site:

```python
chosen = pick_parser(parser, lines, proof_cmd)
items = PARSERS[chosen](lines)
```

- [ ] **Step 4: Run the test — see GREEN**

```bash
bash plugins/tribe/scripts/tests/test-build-queue.sh
```

Expected: `38 passed, 0 failed`, exit 0. If a parser check fails, fix the parser — never weaken the
fixture.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/build-queue.sh \
        plugins/tribe/scripts/tests/test-build-queue.sh \
        docs/tribe/planning/idea-07-mechanical-queue/plan.md
git commit -m "feat(tribe): pytest/jest/eslint/cargo parsers + auto inference for build-queue" \
  -m $'Tribe-Card: idea-07-mechanical-queue\nTribe-Task: 3/6'
```

Expected: one commit carrying both trailers.

---

## Task 4: idempotency — a refresh, not an append

**Goal:** re-running refreshes the queue in place. An unchanged failure set reproduces a
byte-identical `queue.tsv`; volatile noise in the output does not churn ids; a fixed failure loses
both its row **and** its detail file; a fully green proof leaves zero rows and `queue_empty: true`.

**Files:** edit `plugins/tribe/scripts/build-queue.sh`, edit
`plugins/tribe/scripts/tests/test-build-queue.sh`.

- [ ] **Step 1: Write the failing test**

Append to `plugins/tribe/scripts/tests/test-build-queue.sh` (before the final `printf` / `exit`):

```bash
# ---------- idempotency: re-running REFRESHES the queue ----------
R8="$TMP/r8"; mkdir -p "$R8"
cat > "$R8/proof.sh" <<'EOF'
#!/usr/bin/env bash
# Volatile noise on every run: a timestamp and a duration. Neither may change the row ids.
echo "run at $(date -u +%Y-%m-%dT%H:%M:%SZ) took ${RANDOM}ms"
echo "src/alpha.ts:3:1: SyntaxError: unexpected token"
if [[ -z "${BETA_FIXED:-}" ]]; then
  echo "src/beta.ts:12:5: TypeError: cannot read property exp of undefined (0x7ffd in 12ms)"
fi
exit 1
EOF
chmod +x "$R8/proof.sh"
Q8="$TMP/q8/queue.tsv"; mkdir -p "$TMP/q8"

bash "$SCRIPT" --repo-root "$R8" --proof "./proof.sh" --parser generic --out "$Q8" > "$TMP/d9.json"
check "two rows before the fix" "$(jget "$TMP/d9.json" row_count)" "2"
cp "$Q8" "$TMP/q8-first.tsv"
BETA_ID3="$(awk -F'\t' '$2 == "src/beta.ts" {print $1}' "$Q8")"

# re-run, unchanged tree -> byte-identical queue.tsv (stable ids + stable sort + normalised digests)
bash "$SCRIPT" --repo-root "$R8" --proof "./proof.sh" --parser generic --out "$Q8" > /dev/null
if diff -q "$TMP/q8-first.tsv" "$Q8" > /dev/null; then ok "re-run is byte-identical"; else bad "re-run is byte-identical"; fi

# fix beta -> its row disappears AND its detail file is pruned (no ghosts left behind)
BETA_FIXED=1 bash "$SCRIPT" --repo-root "$R8" --proof "./proof.sh" --parser generic --out "$Q8" > "$TMP/d10.json"
check "one row after the fix" "$(jget "$TMP/d10.json" row_count)" "1"
check "remaining row is alpha" "$(awk -F'\t' '!/^#/ {print $2}' "$Q8")" "src/alpha.ts"
if [[ ! -f "$TMP/q8/queue.d/$BETA_ID3.txt" ]]; then ok "stale detail file pruned"; else bad "stale detail file pruned"; fi

# fix everything -> zero rows, queue_empty true: the sweep's mechanical done-check
bash "$SCRIPT" --repo-root "$R8" --proof "true" --parser generic --out "$Q8" > "$TMP/d11.json"
check "drained queue -> 0 rows"      "$(jget "$TMP/d11.json" row_count)"       "0"
check "drained queue -> queue_empty" "$(jget "$TMP/d11.json" queue_empty)"     "true"
check "drained queue keeps header"   "$(head -1 "$Q8")" "$(printf '#id\tfile\tdigest\tdetail')"
check "no detail files remain"       "$(ls "$TMP/q8/queue.d" | wc -l | tr -d ' ')" "0"
```

- [ ] **Step 2: Run it — see RED**

```bash
bash plugins/tribe/scripts/tests/test-build-queue.sh
```

Expected: earlier checks pass; the new ones fail — the digest still carries the timestamp/duration
noise (so the re-run is not byte-identical and beta's id churns), and stale detail files are never
pruned.

- [ ] **Step 3: Implement — prune stale details; harden the digest normalisation**

In `build-queue.sh`, add the pruning pass immediately after the detail files are written, and make
the digest normalisation strip the `(...)` volatile trailers too:

```python
# Prune stale detail files: a fixed failure must not leave a ghost behind, or the detail dir
# slowly fills with the debris of work already done.
live = {r["id"] + ".txt" for r in ordered}
if os.path.isdir(detail_dir):
    for name in sorted(os.listdir(detail_dir)):
        if name.endswith(".txt") and name not in live:
            os.remove(os.path.join(detail_dir, name))
```

and extend `VOLATILE` (before the whitespace-collapsing entry, which must stay last):

```python
    (re.compile(r"\b\d+\s?ms\b"), "DUR"),
    (re.compile(r"\brandom seed[:= ]\s*\d+\b", re.IGNORECASE), "SEED"),
```

The `queue.tsv` write already truncates the file (mode `"w"`), so a refresh replaces the queue
rather than appending to it — assert this stays true.

- [ ] **Step 4: Run the test — see GREEN**

```bash
bash plugins/tribe/scripts/tests/test-build-queue.sh
```

Expected: `47 passed, 0 failed`, exit 0. Run it twice in a row and confirm the count is identical
both times (the suite itself must be idempotent).

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/build-queue.sh \
        plugins/tribe/scripts/tests/test-build-queue.sh \
        docs/tribe/planning/idea-07-mechanical-queue/plan.md
git commit -m "feat(tribe): idempotent queue refresh — stable ids, pruned detail files" \
  -m $'Tribe-Card: idea-07-mechanical-queue\nTribe-Task: 4/6'
```

Expected: one commit carrying both trailers.

---

## Task 5: `validate-plan.sh` gains queue-backed mode

**Goal:** a plan that declares `Queue: PATH` is validated against the queue, not against narrated
prose: `task_count` becomes the queue's row count, and the plan must carry exactly one task section
marked `Queue-Template: true`. Non-queue plans keep validating exactly as they do today.

**Files:** edit `plugins/tribe/scripts/validate-plan.sh`, edit
`plugins/tribe/scripts/tests/test-validate-plan.sh`.

- [ ] **Step 1: Write the failing test**

Append to `plugins/tribe/scripts/tests/test-validate-plan.sh` (before its final `printf` / `exit`).
Note the outer fence here is four backticks because the fixture content itself contains fences:

````bash
# ---------- queue-backed plans ----------
QDIR="$TMP/queues"; mkdir -p "$QDIR/queue.d"
printf '#id\tfile\tdigest\tdetail\n' > "$QDIR/queue.tsv"
printf 'aaa111\tsrc/a.ts\tboom\tqueue.d/aaa111.txt\n' >> "$QDIR/queue.tsv"
printf 'bbb222\tsrc/b.ts\tbang\tqueue.d/bbb222.txt\n' >> "$QDIR/queue.tsv"
printf 'ccc333\tsrc/c.ts\tsplat\tqueue.d/ccc333.txt\n' >> "$QDIR/queue.tsv"

queue_plan() { # queue_plan QUEUE_REL N_TASK_SECTIONS
  good_plan_header
  printf '## Work Queue\n\nQueue: %s\n\n' "$1"
  local i
  for i in $(seq 1 "$2"); do
    cat <<EOF
### Task $i: Fix one queue row (queue template)

Queue-Template: true

- [ ] **Step 1: Reproduce this row's failure**

\`\`\`bash
bash proof.sh
\`\`\`

Expected: the failure in this row's detail file reproduces

- [ ] **Step 2: Commit**

\`\`\`bash
git commit -m "fix: one row"
\`\`\`
EOF
  done
}

QP1="$TMP/queue-plan.md"; queue_plan "queues/queue.tsv" 1 > "$QP1"
bash "$SCRIPT" "$QP1" > "$TMP/qout1.json"
check "queue-backed detected"   "$(jget "$TMP/qout1.json" queue_backed)" "true"
check "task_count = queue rows" "$(jget "$TMP/qout1.json" task_count)"   "3"
check "queue_rows reported"     "$(jget "$TMP/qout1.json" queue_rows)"   "3"
check "queue-backed verdict"    "$(jget "$TMP/qout1.json" verdict)"      "pass"

# 2 task sections in a queue-backed plan -> fail (the template must be exactly one)
QP2="$TMP/queue-plan-2.md"; queue_plan "queues/queue.tsv" 2 > "$QP2"
bash "$SCRIPT" "$QP2" > "$TMP/qout2.json"
check "two templates fail" "$(find_check "$TMP/qout2.json" queue_single_template)" "fail"

# Queue: pointing at a missing file -> fail
QP3="$TMP/queue-plan-3.md"; queue_plan "queues/nope.tsv" 1 > "$QP3"
bash "$SCRIPT" "$QP3" > "$TMP/qout3.json"
check "missing queue file fails" "$(find_check "$TMP/qout3.json" queue_file_resolves)" "fail"

# an EMPTY queue (header only, zero rows) -> fail: there is no work to plan
QDIR2="$TMP/queues2"; mkdir -p "$QDIR2"
printf '#id\tfile\tdigest\tdetail\n' > "$QDIR2/queue.tsv"
QP4="$TMP/queue-plan-4.md"; queue_plan "queues2/queue.tsv" 1 > "$QP4"
bash "$SCRIPT" "$QP4" > "$TMP/qout4.json"
check "empty queue fails" "$(find_check "$TMP/qout4.json" queue_file_resolves)" "fail"

# REGRESSION: a normal plan is untouched by the new mode
bash "$SCRIPT" "$F1" > "$TMP/qout5.json"
check "normal plan not queue-backed" "$(jget "$TMP/qout5.json" queue_backed)" "false"
check "normal plan still passes"     "$(jget "$TMP/qout5.json" verdict)"      "pass"
check "normal plan task_count"       "$(jget "$TMP/qout5.json" task_count)"   "1"
````

- [ ] **Step 2: Run it — see RED**

```bash
bash plugins/tribe/scripts/tests/test-validate-plan.sh
```

Expected: the 8 pre-existing checks still pass; the new queue checks fail — `queue_backed` reports
`MISSING` because the key does not exist yet.

- [ ] **Step 3: Implement — add queue-backed mode to `validate-plan.sh`**

In the python heredoc, after `task_sections` is computed and before the `checks` list is finalised,
insert:

```python
# --- queue-backed mode: the plan REFERENCES a machine-generated queue instead of narrating
# the failure list in prose. One row = one task = one unit of work; the plan carries a single
# template task that the Warchief instantiates once per row. Non-queue plans are untouched:
# this whole block only activates on an explicit "Queue:" declaration.
QUEUE_DECL_RE = re.compile(r"^\s*Queue:\s*(\S+)\s*$")
QUEUE_TEMPLATE_RE = re.compile(r"^\s*Queue-Template:\s*true\s*$", re.IGNORECASE)

queue_decl = None
for i, line in enumerate(lines, start=1):
    if in_fence_flags[i - 1]:
        continue
    m = QUEUE_DECL_RE.match(line)
    if m:
        queue_decl = m.group(1)
        break

queue_backed = queue_decl is not None
queue_file = None
queue_rows = 0
if queue_backed:
    queue_file = os.path.normpath(
        os.path.join(os.path.dirname(os.path.abspath(plan_file)), queue_decl))
    rows = []
    try:
        with open(queue_file, "r", errors="replace") as fh:
            rows = [l for l in fh.read().splitlines()
                    if l.strip() and not l.lstrip().startswith("#")]
    except OSError:
        rows = None
    if rows is None:
        checks.append({"name": "queue_file_resolves", "status": "fail",
                       "detail": f"queue file not readable: {queue_file}"})
    elif not rows:
        checks.append({"name": "queue_file_resolves", "status": "fail",
                       "detail": f"queue file has zero rows: {queue_file}"})
    else:
        queue_rows = len(rows)
        checks.append({"name": "queue_file_resolves", "status": "pass",
                       "detail": f"{queue_rows} queue row(s) in {queue_file}"})

    templates = [s for s in task_sections
                 if any(QUEUE_TEMPLATE_RE.match(l) for l in s["span"])]
    single = len(task_sections) == 1 and len(templates) == 1
    checks.append({
        "name": "queue_single_template",
        "status": "pass" if single else "fail",
        "detail": "exactly one task section, marked Queue-Template: true" if single
                  else f"{len(task_sections)} task section(s), "
                       f"{len(templates)} marked as a queue template (want exactly 1 of each)",
    })
```

`import os` must join the heredoc's import line. Then make `task_count` reflect the queue, and add
the new keys to the JSON payload:

```python
print(json.dumps({
    "plan_file": plan_file,
    "queue_backed": queue_backed,
    "queue_file": queue_file,
    "queue_rows": queue_rows,
    "task_count": queue_rows if queue_backed else len(task_sections),
    "task_titles": [s["title"] for s in task_sections],
    "checks": checks,
    "placeholder_hits": placeholder_hits,
    "verdict": verdict,
}, indent=2))
```

Because `verdict` is computed from `checks`, move its computation **after** the queue block so the
new checks count toward it. Finally, extend the script's header comment to document queue-backed
mode (the `-h` output is the contract).

- [ ] **Step 4: Run both suites — see GREEN**

```bash
bash plugins/tribe/scripts/tests/test-validate-plan.sh
bash plugins/tribe/scripts/tests/test-build-queue.sh
```

Expected: `test-validate-plan.sh` reports `18 passed, 0 failed`; `test-build-queue.sh` still reports
`47 passed, 0 failed`. Both exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/validate-plan.sh \
        plugins/tribe/scripts/tests/test-validate-plan.sh \
        docs/tribe/planning/idea-07-mechanical-queue/plan.md
git commit -m "feat(tribe): validate-plan.sh queue-backed mode (task_count from queue.tsv)" \
  -m $'Tribe-Card: idea-07-mechanical-queue\nTribe-Task: 5/6'
```

Expected: one commit carrying both trailers.

---

## Task 6: the Warchief rule — homogeneous cards must be queue-backed

**Goal:** the prompt change that makes the machinery load-bearing. Step 3 requires a queue-backed
plan for homogeneous fix/repair cards; step 5 dispatches one Hunter per row and requires the queue
to drain to zero before delivery.

**Files:** edit `plugins/tribe/agents/warchief.md`, edit `plugins/tribe/README.md`.

- [ ] **Step 1: Write the failing test (the doc gate)**

There is no unit test for prompt prose, so the check is a grep-based assertion. Add this to the end
of `plugins/tribe/scripts/tests/test-build-queue.sh` (before its final `printf` / `exit`):

```bash
# ---------- the rule is actually wired into the Warchief prompt ----------
WC="$HERE/../../agents/warchief.md"
RM="$HERE/../../README.md"
grep_ok() { if grep -q "$2" "$1"; then ok "$3"; else bad "$3"; fi; }
grep_ok "$WC" "build-queue.sh"       "warchief.md names build-queue.sh"
grep_ok "$WC" "queue-backed"         "warchief.md states the queue-backed rule"
grep_ok "$WC" "queue_empty"          "warchief.md requires the drain check before delivery"
grep_ok "$RM" "build-queue.sh"       "README documents build-queue.sh"
```

- [ ] **Step 2: Run it — see RED**

```bash
bash plugins/tribe/scripts/tests/test-build-queue.sh
```

Expected: the 47 earlier checks pass; the 4 new doc checks report `not ok` (the prompt says nothing
about a queue yet).

- [ ] **Step 3: Implement — the prompt text**

In `plugins/tribe/agents/warchief.md`, append to **step 3 (Write the plan)**, right after the
"Plan → validate → only then execute" paragraph:

```markdown
**Homogeneous cards are queue-backed, not narrated.** When the card is homogeneous fix/repair work
— a regression sweep, a lint sweep, a coverage sweep, a mechanical refactor across N files — the
task list is not a judgment call; it is a fact a tool already knows. Do **not** narrate the failure
list in prose. Instead run the queue generator (resolve its path exactly as you resolve
`validate-plan.sh` above — same two install mechanisms, same `NEEDS_DIRECTION` if neither yields it):

    "$dir/build-queue.sh" --proof "REPO-PROOF-COMMAND" --out docs/tribe/queues/CARD-SLUG/queue.tsv

It runs the repo's proof command and writes one row per failure (id, file, error digest, detail
path) plus a raw detail file per row. Commit `queue.tsv` and `queue.d/` as campaign artifacts, then
write a **queue-backed plan**: a `## Work Queue` section declaring `Queue: PATH-TO-QUEUE-TSV`, and
**exactly one task section** marked `Queue-Template: true` describing one row's
red→green→commit cycle. `validate-plan.sh` detects the declaration and validates the plan against
the queue — `task_count` comes from the queue's rows, not from your prose. One row = one task = one
unit of work, so the crash-safety budget is unchanged.
```

and append to **step 5 (Orchestrate the build via Hunters)**:

```markdown
- **Queue-backed cards: one Hunter per queue row.** Instantiate the template task once per row of
  `queue.tsv` and dispatch a fresh Hunter for each (`Tribe-Task: i/N`, where N is the row count).
  Each brief carries the row's `file` and its **raw detail file verbatim** — never your paraphrase
  of the stacktrace. Rows are independent by construction, so they follow the same wave rules as
  sub-plans: rows touching disjoint files may run concurrently, one Hunter per worktree.
- **The drain check is the done-check.** Before delivery (step 7), re-run `build-queue.sh` and
  require `"queue_empty": true`. A sweep is not finished because an LLM ticked its boxes; it is
  finished because the proof command reports zero failures. A queue that has not drained is not
  ready to ship — and a queue that drained because a test was weakened or skipped is a Skinner
  FAIL, not a pass.
```

In `plugins/tribe/README.md`, add `build-queue.sh` to the scripts list with a one-line description
matching the others' style.

- [ ] **Step 4: Run both suites — see GREEN**

```bash
bash plugins/tribe/scripts/tests/test-build-queue.sh
bash plugins/tribe/scripts/tests/test-validate-plan.sh
```

Expected: `test-build-queue.sh` reports `51 passed, 0 failed`; `test-validate-plan.sh` reports
`18 passed, 0 failed`. Both exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/README.md \
        plugins/tribe/scripts/tests/test-build-queue.sh \
        docs/tribe/planning/idea-07-mechanical-queue/plan.md
git commit -m "feat(tribe): Warchief rule — homogeneous fix/repair cards must be queue-backed" \
  -m $'Tribe-Card: idea-07-mechanical-queue\nTribe-Task: 6/6'
```

Expected: one commit carrying both trailers.

---

## Definition of done (for the implementation campaign)

1. `bash plugins/tribe/scripts/tests/test-build-queue.sh` → `51 passed, 0 failed`.
2. `bash plugins/tribe/scripts/tests/test-validate-plan.sh` → `18 passed, 0 failed`.
3. `plugins/tribe/scripts/build-queue.sh --help` prints the contract (schema, exit codes, discovery
   chain).
4. Evidence per the spec's §5: the before/after transcripts, the drain to `queue_empty: true`, and
   the byte-identical idempotency `diff`.
5. Skinner audit PASS against this plan and the spec, then PR squash-merged with CI green.
