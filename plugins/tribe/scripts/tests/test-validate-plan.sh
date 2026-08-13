#!/usr/bin/env bash
# test-validate-plan.sh — fixture tests for validate-plan.sh (offline, no network).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../validate-plan.sh"
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
find_check() { # find_check FILE CHECK_NAME — prints that check's status, or MISSING
  python3 - "$1" "$2" <<'EOF'
import json, sys
data = json.load(open(sys.argv[1]))
for c in data.get("checks", []):
    if c["name"] == sys.argv[2]:
        print(c["status"]); break
else:
    print("MISSING")
EOF
}

good_plan_header() {
  cat <<'EOF'
# Fixture Plan

## Global Constraints

- Implementer: dispatch each implementation/fix task to the hunter subagent.

EOF
}

# fixture: a task that QUOTES a whole file containing a fenced plan — the quoted
# heading, inner fences, and angle tokens are content, not plan structure
F0="$TMP/fenced.md"
{ good_plan_header; cat <<'EOF'
### Task 1: Real task quoting a whole test file

- [ ] **Step 1: Write the failing test**

````markdown
### Task 9: Phantom — this heading is quoted content, not a real task

```bash
echo "an <angle-token> stays inside the fence"
```
````

Expected: the quoted file is written verbatim

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: fenced"
```
EOF
} > "$F0"
bash "$SCRIPT" "$F0" > "$TMP/out0.json"
check "quoted headings are not tasks" "$(jget "$TMP/out0.json" task_count)" "1"
check "fenced angle tokens are not placeholders" "$(find_check "$TMP/out0.json" no_placeholders)" "pass"
check "fenced fixture verdict is pass" "$(jget "$TMP/out0.json" verdict)" "pass"

# fixture: one task, exactly one commit step -> pass
F1="$TMP/single.md"
{ good_plan_header; cat <<'EOF'
### Task 1: One unit

- [ ] **Step 1: Write the failing test**

```bash
echo test
```

Expected: FAIL

- [ ] **Step 2: Commit**

```bash
git add -A && git commit -m "feat: one"
```
EOF
} > "$F1"
bash "$SCRIPT" "$F1" > "$TMP/out1.json"
check "single commit step passes" "$(find_check "$TMP/out1.json" tasks_single_commit_step)" "pass"

# fixture: one task with two commit steps -> fail
F2="$TMP/double.md"
{ good_plan_header; cat <<'EOF'
### Task 1: Two units glued together

- [ ] **Step 1: Write the failing test**

```bash
echo test
```

Expected: FAIL

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: part one"
```

- [ ] **Step 3: Commit**

```bash
git commit -m "feat: part two"
```
EOF
} > "$F2"
bash "$SCRIPT" "$F2" > "$TMP/out2.json"
check "two commit steps fail" "$(find_check "$TMP/out2.json" tasks_single_commit_step)" "fail"

# fixture: one task with no commit step -> fail
F3="$TMP/none.md"
{ good_plan_header; cat <<'EOF'
### Task 1: Never lands

- [ ] **Step 1: Write the failing test**

```bash
echo test
```

Expected: FAIL
EOF
} > "$F3"
bash "$SCRIPT" "$F3" > "$TMP/out3.json"
check "zero commit steps fail" "$(find_check "$TMP/out3.json" tasks_single_commit_step)" "fail"

# fixture: one task whose only commit-like step is "Commit and push" -> fail
# (the step title must BE "Commit", not merely start with it)
F4="$TMP/commit-and-push.md"
{ good_plan_header; cat <<'EOF'
### Task 1: Never lands either

- [ ] **Step 1: Write the failing test**

```bash
echo test
```

Expected: FAIL

- [ ] **Step 2: Commit and push**

```bash
git commit -m "feat: never lands" && git push
```
EOF
} > "$F4"
bash "$SCRIPT" "$F4" > "$TMP/out4.json"
check "commit-and-push does not count" "$(find_check "$TMP/out4.json" tasks_single_commit_step)" "fail"

# --- P9: --schema-lock-paths (schema-lock opt-outs validated at authoring) ---

LOCK_PATH="packages/app/src/ports.ts"

# fixture: task line touching the lock path, no front-matter -> fail, non-zero exit,
# message names the plan, the matched task line, and the fix (ruling UC-3).
F5="$TMP/lock-no-frontmatter.md"
{ good_plan_header; cat <<'EOF'
### Task 1: Touches the locked port surface

- [ ] **Step 1: Write the failing test**

```bash
echo test
```

Expected: FAIL

- Modify: packages/app/src/ports.ts

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: touch ports"
```
EOF
} > "$F5"
set +e
out5="$(bash "$SCRIPT" --schema-lock-paths "$LOCK_PATH" "$F5" 2>&1)"
code5=$?
set -e
check "lock path + no front-matter: non-zero exit" "$code5" "1"
if [[ "$out5" == *"$F5"* && "$out5" == *"Modify: packages/app/src/ports.ts"* \
      && "$out5" == *"allowsSchemaChange: true"* && "$out5" == *"UC-3"* ]]; then
  ok "lock path + no front-matter: message names plan, task line, and fix"
else
  bad "lock path + no front-matter: message names plan, task line, and fix (got: $out5)"
fi

# fixture: task line touching the lock path, WITH allowsSchemaChange: true front-matter -> pass
F6="$TMP/lock-with-frontmatter.md"
cat <<'EOF' > "$F6"
---
allowsSchemaChange: true
---

# Fixture Plan

## Global Constraints

- Implementer: dispatch each implementation/fix task to the hunter subagent.

### Task 1: Touches the locked port surface, declared

- [ ] **Step 1: Write the failing test**

```bash
echo test
```

Expected: FAIL

- Modify: packages/app/src/ports.ts

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: touch ports, declared"
```
EOF
set +e
out6="$(bash "$SCRIPT" --schema-lock-paths "$LOCK_PATH" "$F6" 2>&1)"
code6=$?
set -e
check "lock path + allowsSchemaChange: true: zero exit" "$code6" "0"

# fixture: only a PROSE mention of the lock path (no task line) -> pass, no front-matter needed
F7="$TMP/lock-prose-only.md"
{ good_plan_header; cat <<'EOF'
### Task 1: Discusses but does not touch the locked port surface

- [ ] **Step 1: Write the failing test**

```bash
echo test
```

Expected: FAIL. Note: packages/app/src/ports.ts is the interface this task exercises,
but this task does not modify it.

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: prose mention only"
```
EOF
} > "$F7"
set +e
out7="$(bash "$SCRIPT" --schema-lock-paths "$LOCK_PATH" "$F7" 2>&1)"
code7=$?
set -e
check "prose-only mention: zero exit" "$code7" "0"

# fixture: same task-line-touching-lock-path plan as F5, but with NO --schema-lock-paths flag
# at all -> check is skipped entirely (legacy invocations unaffected)
set +e
out8="$(bash "$SCRIPT" "$F5" 2>&1)"
code8=$?
set -e
check "no --schema-lock-paths flag: legacy invocation unaffected (zero exit)" "$code8" "0"

# fixture: EXACT-path rule — the lock path packages/app/src/ports.ts must NOT be tripped by
# a task line touching packages/app/src/ports.test.ts (a longer path that merely contains the
# lock path as a substring of its name, not the same path).
F9="$TMP/lock-exact-path.md"
{ good_plan_header; cat <<'EOF'
### Task 1: Touches only the test file, not the locked port surface

- [ ] **Step 1: Write the failing test**

```bash
echo test
```

Expected: FAIL

- Modify: packages/app/src/ports.test.ts

- [ ] **Step 2: Commit**

```bash
git commit -m "feat: touch ports test file only"
```
EOF
} > "$F9"
set +e
out9="$(bash "$SCRIPT" --schema-lock-paths "$LOCK_PATH" "$F9" 2>&1)"
code9=$?
set -e
check "exact-path rule: ports.test.ts does not trip ports.ts lock (zero exit)" "$code9" "0"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
exit $((FAIL > 0))
