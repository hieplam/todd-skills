# Plan — idea 09: the ephemeral Warchief (deliberate wave-boundary handoff)

**Spec:** `docs/tribe/planning/idea-09-ephemeral-warchief/spec.md` (read it first — it carries the
problem grounding and the design rationale this plan executes).
**Card:** idea-09-ephemeral-warchief.
**Repo:** `todd-skills`, plugin under `plugins/tribe/`.

This plan is written for a **future implementation campaign**. The planning branch that carries it
touches no file under `plugins/`; every task below is the work that campaign performs.

---

## What we are building, in one paragraph

A Warchief that runs a multi-wave card today lives through every wave and ends up making its
sharpest calls with a context full of Hunter reports and audit noise. We are turning the existing
crash-resume machinery into a **deliberate cycle**: after integrating a wave, the Warchief commits
its state, writes a machine-readable heartbeat line that says "wave N integrated, re-dispatch me",
and ends; the Shaman recognises that line as an *intentional* exit (not a death, not a live agent)
and immediately re-dispatches a fresh Warchief, which reads the law back off disk and runs wave N+1.
Four moving parts: a new `handoff` verdict in `heartbeat-check.sh`; wave-aware fields (and a
task-trailer bug fix) in `resume-check.sh`; a `HANDOFF` return status plus activation condition in
`warchief.md`; a routing branch plus loop guard in `shaman.md`.

---

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.** The audit of each task stays with the separate `skinner` subagent.
- **TDD, one commit per task.** Every task is one red → green → commit cycle. Write the failing
  check first, watch it fail, make it pass with the smallest change, commit once.
- **Commit trailers.** Every commit carries, in one final paragraph:
  `Tribe-Card: idea-09-ephemeral-warchief` and `Tribe-Task: N/9`. No co-authored trailers.
- **Tick this plan's checkboxes in the same commit as the code** for that task.
- **Backward compatibility is a hard requirement.** Both scripts must behave byte-identically on
  inputs that lack the new fields (a report file with no sentinel; a state file with no `waves:`
  field). Every task that touches a script re-runs the full existing suite.
- **Wave structure of this plan: one wave, nine sequential tasks** (each task builds on the file the
  previous one created). No sub-plan worktrees, no concurrent Hunters, and — fittingly — no handoff
  cycle applies to this plan itself, because the activation condition it introduces requires 2 or
  more waves.
- **Style:** match the existing scripts' conventions exactly — bash wrapper with `set -euo
  pipefail`, argument parsing, `DIE` on setup errors (exit 2), a `python3` heredoc doing the work,
  JSON on stdout only, logs on stderr. Tests are bash fixture files printing `ok -` / `not ok -`
  lines, in the style of `plugins/tribe/scripts/tests/test-resume-check.sh`.

**Definition of done for the campaign:** all four test files pass with a zero `not ok` count, the
before/after evidence from the spec's Evidence plan is captured into the PR body, CI is green, and
the PR is squash-merged.

---

## Task 1: Failing tests for the `handoff` verdict in heartbeat-check.sh

**Why:** the Shaman cannot tell a deliberate exit from a live agent (spec, problem P3). The verdict
is the contract; write its tests before the code exists.

**Files:** create `plugins/tribe/scripts/tests/test-heartbeat-check.sh` (new; there is no test file
for this script today).

- [ ] **Step 1: Write the failing test**

Create `plugins/tribe/scripts/tests/test-heartbeat-check.sh` with exactly this content:

```bash
#!/usr/bin/env bash
# test-heartbeat-check.sh — fixture tests for heartbeat-check.sh (offline, no git needed).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../heartbeat-check.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check() { # check NAME ACTUAL WANT
  if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2, want: $3)"; fi
}
jget() { # jget FILE KEY — prints the value, "null", or MISSING
  python3 - "$1" "$2" <<'EOF'
import json, sys
o = json.load(open(sys.argv[1]))
v = o.get(sys.argv[2], "MISSING")
print("null" if v is None else v)
EOF
}
iso() { # iso MINUTES_AGO — an ISO-8601 UTC timestamp that many minutes in the past
  python3 - "$1" <<'EOF'
import sys
from datetime import datetime, timedelta, timezone
t = datetime.now(timezone.utc) - timedelta(minutes=float(sys.argv[1]))
print(t.strftime("%Y-%m-%dT%H:%M:%SZ"))
EOF
}
run() { bash "$SCRIPT" "$1" > "$2"; }

# 1. A fresh handoff sentinel as the last line: an INTENTIONAL exit, actionable now.
f="$TMP/handoff-fresh.md"
{ printf '[%s] dispatch received\n' "$(iso 90)"
  printf '[%s] wave 2 integrated (merge committed)\n' "$(iso 3)"
  printf '[%s] HANDOFF wave 2 integrated — re-dispatch me (next: wave 3)\n' "$(iso 2)"
} > "$f"
run "$f" "$TMP/o1.json"
check "fresh sentinel -> status handoff"      "$(jget "$TMP/o1.json" status)"       handoff
check "fresh sentinel -> REDISPATCH_HANDOFF"  "$(jget "$TMP/o1.json" next_action)"  REDISPATCH_HANDOFF
check "fresh sentinel -> handoff_wave 2"      "$(jget "$TMP/o1.json" handoff_wave)" 2
check "fresh sentinel -> next_wave 3"         "$(jget "$TMP/o1.json" next_wave)"    3

# 2. The sentinel beats the clock: two hours old is still a handoff, never "stale".
f="$TMP/handoff-old.md"
printf '[%s] HANDOFF wave 1 integrated — re-dispatch me (next: wave 2)\n' "$(iso 120)" > "$f"
run "$f" "$TMP/o2.json"
check "old sentinel -> still handoff"      "$(jget "$TMP/o2.json" status)"      handoff
check "old sentinel -> REDISPATCH_HANDOFF" "$(jget "$TMP/o2.json" next_action)" REDISPATCH_HANDOFF
check "old sentinel -> next_wave 2"        "$(jget "$TMP/o2.json" next_wave)"   2

# 3. Self-clearing: the successor's own heartbeat line supersedes the sentinel.
f="$TMP/handoff-cleared.md"
{ printf '[%s] HANDOFF wave 1 integrated — re-dispatch me (next: wave 2)\n' "$(iso 20)"
  printf '[%s] dispatch received (resume: wave 2)\n' "$(iso 1)"
} > "$f"
run "$f" "$TMP/o3.json"
check "cleared sentinel -> alive" "$(jget "$TMP/o3.json" status)"      alive
check "cleared sentinel -> WAIT"  "$(jget "$TMP/o3.json" next_action)" WAIT

# 4. No false positives: lowercase prose is not the machine token.
f="$TMP/prose.md"
printf '[%s] discussing the handoff wave 2 integrated design in prose\n' "$(iso 1)" > "$f"
run "$f" "$TMP/o4.json"
check "lowercase prose -> alive, not handoff" "$(jget "$TMP/o4.json" status)" alive

# 5. Regression: the three existing verdicts are unchanged.
f="$TMP/alive.md"
printf '[%s] plan committed\n' "$(iso 5)" > "$f"
run "$f" "$TMP/o5.json"
check "fresh ordinary line -> alive" "$(jget "$TMP/o5.json" status)"      alive
check "alive -> next_action WAIT"    "$(jget "$TMP/o5.json" next_action)" WAIT

f="$TMP/stale.md"
printf '[%s] task 3 dispatched\n' "$(iso 45)" > "$f"
run "$f" "$TMP/o6.json"
check "45-minute-old line -> stale"   "$(jget "$TMP/o6.json" status)"      stale
check "stale -> REDISPATCH_STALE"     "$(jget "$TMP/o6.json" next_action)" REDISPATCH_STALE

f="$TMP/unknown.md"
printf 'no timestamp on this line at all\n' > "$f"
run "$f" "$TMP/o7.json"
check "no timestamp -> unknown"         "$(jget "$TMP/o7.json" status)"      unknown
check "unknown -> REDISPATCH_UNKNOWN"   "$(jget "$TMP/o7.json" next_action)" REDISPATCH_UNKNOWN

printf '\n# passed: %d, failed: %d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
```

Make it executable and run it:

```bash
chmod +x plugins/tribe/scripts/tests/test-heartbeat-check.sh
bash plugins/tribe/scripts/tests/test-heartbeat-check.sh; echo "exit=$?"
```

**Expected (RED):** the four `next_action` / `handoff` assertions fail — every one reports
`MISSING` or a wrong status, because `heartbeat-check.sh` has no `handoff` verdict and emits no
`next_action` key yet. Concretely, expect lines including:

```
not ok - fresh sentinel -> status handoff (got: alive, want: handoff)
not ok - fresh sentinel -> REDISPATCH_HANDOFF (got: MISSING, want: REDISPATCH_HANDOFF)
not ok - old sentinel -> still handoff (got: stale, want: handoff)
not ok - alive -> next_action WAIT (got: MISSING, want: WAIT)
```

and a non-zero `exit=`. The three status-only assertions (`alive`, `stale`, `unknown`) already pass —
that is the backward-compatibility baseline.

- [ ] **Step 2: Commit**

```bash
git add plugins/tribe/scripts/tests/test-heartbeat-check.sh docs/tribe/planning/idea-09-ephemeral-warchief/plan.md
git commit -m "test(tribe): failing tests for heartbeat-check handoff verdict" \
  -m $'Tribe-Card: idea-09-ephemeral-warchief\nTribe-Task: 1/9'
```

---

## Task 2: Implement the `handoff` verdict and `next_action` in heartbeat-check.sh

**Why:** turn the deadlock (spec P3) into an immediate, mechanical instruction.

**Files:** edit `plugins/tribe/scripts/heartbeat-check.sh`.

- [ ] **Step 1: Make the failing test pass**

Edit the header comment block: after the existing "Expected line shape" paragraph
(`heartbeat-check.sh:8-12`), add the sentinel documentation:

```text
# One line shape is special — the HANDOFF sentinel, written by a Warchief that is ending itself
# on purpose at a wave boundary (idea 09, "persistent policy, ephemeral instance"):
#   [2026-07-12T09:15:00Z] HANDOFF wave 2 integrated — re-dispatch me (next: wave 3)
# When that token is the LAST timestamped line, the verdict is "handoff" REGARDLESS of age: an
# intentional exit is actionable immediately (do not wait out the staleness window), and an old
# one is still a handoff, not a corpse. Any later heartbeat line (the successor's own "dispatch
# received") supersedes it, so the sentinel self-clears.
```

In the Python heredoc, add the sentinel pattern next to `TS_RE` (`heartbeat-check.sh:50-52`):

```python
# The machine-readable intentional-exit token. Uppercase and anchored on the word "wave" so
# ordinary prose mentioning a handoff can never trip it; only ever consulted on the LAST
# timestamped line of the file.
HANDOFF_RE = re.compile(r"\bHANDOFF\s+wave\s+(\d+)\s+integrated\b")
```

Replace the verdict block (`heartbeat-check.sh:93-119`, from `now = datetime.now(timezone.utc)` to
the final `print`) with:

```python
now = datetime.now(timezone.utc)

handoff_wave = None
if last_line:
    m = HANDOFF_RE.search(last_line)
    if m:
        handoff_wave = int(m.group(1))

result = {
    "report_file": report_file,
    "status": None,
    "next_action": None,
    "handoff_wave": handoff_wave,
    "next_wave": (handoff_wave + 1) if handoff_wave is not None else None,
    "last_heartbeat_line": last_line,
    "last_heartbeat_at": last_ts.isoformat() if last_ts else None,
    "age_minutes": (round((now - last_ts).total_seconds() / 60, 2) if last_ts else None),
    "threshold_minutes": threshold_minutes,
    "checked_at": now.isoformat(),
}

if last_ts is None:
    result["status"] = "unknown"
    result["next_action"] = "REDISPATCH_UNKNOWN"
    result["reason"] = "no timestamped heartbeat line found"
elif handoff_wave is not None:
    # Deliberate exit: state, not time. The clock does not get a vote here.
    result["status"] = "handoff"
    result["next_action"] = "REDISPATCH_HANDOFF"
elif result["age_minutes"] > threshold_minutes:
    result["status"] = "stale"
    result["next_action"] = "REDISPATCH_STALE"
else:
    result["status"] = "alive"
    result["next_action"] = "WAIT"

print(json.dumps(result, indent=2))
```

Run the new test plus the existing suite:

```bash
bash plugins/tribe/scripts/tests/test-heartbeat-check.sh; echo "exit=$?"
bash plugins/tribe/scripts/tests/test-resume-check.sh   | tail -1
bash plugins/tribe/scripts/tests/test-validate-plan.sh  | tail -1
```

**Expected (GREEN):** the heartbeat test prints only `ok -` lines, ends with
`# passed: 13, failed: 0` and `exit=0`; the two existing suites still report `failed: 0` (their
`# passed:` counts are unchanged — this change is additive).

- [ ] **Step 2: Commit**

```bash
git add plugins/tribe/scripts/heartbeat-check.sh docs/tribe/planning/idea-09-ephemeral-warchief/plan.md
git commit -m "feat(tribe): heartbeat-check gains the handoff verdict and next_action" \
  -m $'Tribe-Card: idea-09-ephemeral-warchief\nTribe-Task: 2/9'
```

---

## Task 3: Failing tests for resume-check.sh — wave fields and the wave-merge task amnesia

**Why:** spec P4. `resume-check.sh` scans `git log <base-sha>..HEAD` for `Tribe-Task` trailers
(`resume-check.sh:136-152`), but `warchief.md:155-156` re-records `base-sha` to the post-merge HEAD
at every wave integration — collapsing the range to empty and reporting `CONTINUE task 1` on a card
whose first three tasks are already committed. The ephemeral cycle makes that path normal, so it
must be fixed and locked down by a test.

**Files:** edit `plugins/tribe/scripts/tests/test-resume-check.sh` (append a new fixture section
before its final summary lines).

- [ ] **Step 1: Write the failing test**

Append this section to `plugins/tribe/scripts/tests/test-resume-check.sh`, immediately before its
closing `printf`/exit lines (reuse the helpers already defined at the top of that file: `git_c`,
`new_repo`, `run_check`, `jget`, `check`):

```bash
# --- idea 09: wave-aware fields + wave-merge task amnesia (spec P4) ---------------
# A 2-wave card: wave 1's tasks 1-3 are committed and merged; the state file records
# an IMMUTABLE base-sha (the branch point) plus a moving wave-base-sha (the merge).
WR="$TMP/waverepo"
new_repo "$WR"
BASE=$(git_c "$WR" rev-parse HEAD)
WT="$TMP/wave-wt"
git_c "$WR" worktree add -q "$WT" -b wt-waves master
mkdir -p "$WT/docs/tribe/state" "$WT/docs/superpowers/plans"
cat > "$WT/docs/superpowers/plans/waves.md" <<'EOF'
# waves plan
### Task 1: A
- [x] **Step 1: Write the failing test**
- [x] **Step 2: Commit**
### Task 2: B
- [x] **Step 1: Write the failing test**
- [x] **Step 2: Commit**
### Task 3: C
- [x] **Step 1: Write the failing test**
- [x] **Step 2: Commit**
### Task 4: D
- [ ] **Step 1: Write the failing test**
- [ ] **Step 2: Commit**
EOF
for n in 1 2 3; do
  echo "task $n" > "$WT/file-$n.txt"
  git_c "$WT" add -A
  git_c "$WT" commit -qm "task $n" -m "$(printf 'Tribe-Card: waves\nTribe-Task: %d/4' "$n")"
done
MERGE=$(git_c "$WT" rev-parse HEAD)
cat > "$WT/docs/tribe/state/waves.md" <<EOF
# tribe-state: waves
roadmap: docs/ROADMAP.md
worktree: $WT
branch: wt-waves
report: $TMP/waves-report.md
base-sha: $BASE
wave-base-sha: $MERGE
waves: 2
plan: docs/superpowers/plans/waves.md

## Milestones
- [x] spec committed
- [x] plan committed
- [x] wave 1 integrated
- [ ] wave 2 integrated
EOF
git_c "$WT" add -A
git_c "$WT" commit -qm "wave 1 integrated" -m "$(printf 'Tribe-Card: waves\nTribe-Milestone: wave-1-integrated')"
# Offline and deterministic: point the gh probe at a path that does not exist (the same
# technique this file already uses at its gh-unavailable scenario), so delivery is "unknown"
# and next_action is decided purely by trailers, checkboxes and the state file.
RESUME_CHECK_GH="$TMP/no-such-gh" run_check "$TMP/waves.json" "$WR"
check "wave card: 3 tasks counted"     "$(jget "$TMP/waves.json" cards.0.last_completed_task)" 3
check "wave card: continue at task 4"  "$(jget "$TMP/waves.json" cards.0.next_action)" "CONTINUE task 4"
check "wave card: waves_total 2"       "$(jget "$TMP/waves.json" cards.0.waves_total)"      2
check "wave card: waves_integrated 1"  "$(jget "$TMP/waves.json" cards.0.waves_integrated)" 1
check "wave card: next_wave 2"         "$(jget "$TMP/waves.json" cards.0.next_wave)"        2
check "wave card: no inconsistencies"  "$(jget "$TMP/waves.json" cards.0.inconsistencies.0)" MISSING

# P4 proper: an OLD-STYLE state file whose base-sha was overwritten with the merge SHA
# (what warchief.md:155-156 tells the Warchief to do today) must NOT lose the trailers.
python3 - "$WT/docs/tribe/state/waves.md" "$MERGE" <<'EOF'
import re, sys
p, merge = sys.argv[1], sys.argv[2]
s = open(p).read()
s = re.sub(r"^base-sha: .*$", "base-sha: " + merge, s, flags=re.M)
s = re.sub(r"^wave-base-sha: .*\n", "", s, flags=re.M)
open(p, "w").write(s)
EOF
git_c "$WT" add -A
git_c "$WT" commit -qm "legacy state shape" -m "$(printf 'Tribe-Card: waves\nTribe-Milestone: legacy')"
RESUME_CHECK_GH="$TMP/no-such-gh" run_check "$TMP/waves-legacy.json" "$WR"
check "stale base-sha: tasks still counted"  "$(jget "$TMP/waves-legacy.json" cards.0.last_completed_task)" 3
check "stale base-sha: continue at task 4"   "$(jget "$TMP/waves-legacy.json" cards.0.next_action)" "CONTINUE task 4"

# Backward compatibility: a card with no waves: field and no wave milestones.
NW="$TMP/nowaves-wt"
git_c "$WR" worktree add -q "$NW" -b wt-nowaves master
mkdir -p "$NW/docs/tribe/state"
cat > "$NW/docs/tribe/state/legacy.md" <<EOF
# tribe-state: legacy
roadmap: docs/ROADMAP.md
worktree: $NW
branch: wt-nowaves
report: $TMP/legacy-report.md
base-sha: $BASE
plan: docs/superpowers/plans/none.md

## Milestones
- [x] spec committed
EOF
git_c "$NW" add -A
git_c "$NW" commit -qm "legacy card" -m "$(printf 'Tribe-Card: legacy\nTribe-Milestone: state-file-created')"
RESUME_CHECK_GH="$TMP/no-such-gh" run_check "$TMP/nowaves.json" "$WR"
check "legacy card: waves_total null"      "$(jget "$TMP/nowaves.json" cards.1.waves_total)" None
check "legacy card: next_action unchanged" "$(jget "$TMP/nowaves.json" cards.1.next_action)" "CONTINUE task 1"
```

Run it:

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh | grep -E '^not ok|passed,'
```

**Expected (RED):** six failures — the three wave fields do not exist yet, and the legacy fixture
reproduces the task amnesia:

```
not ok - wave card: waves_total 2 (got: MISSING, want: 2)
not ok - wave card: waves_integrated 1 (got: MISSING, want: 1)
not ok - wave card: next_wave 2 (got: MISSING, want: 2)
not ok - stale base-sha: tasks still counted (got: 0, want: 3)
not ok - stale base-sha: continue at task 4 (got: CONTINUE task 1, want: CONTINUE task 4)
not ok - legacy card: waves_total null (got: MISSING, want: None)
```

Read those two groups carefully, because they say different things. The **new-shape** fixture
(immutable `base-sha`, moving `wave-base-sha`) already counts its three tasks correctly even before
the fix — that is the shape task 6 will teach the Warchief to write, and it passes on day one. The
**legacy** fixture is the one that bites: its `base-sha` was overwritten with the merge SHA exactly
as `warchief.md:155-156` instructs today, the trailer scan range collapses to empty, and the script
reports `CONTINUE task 1` on a card whose first three tasks are committed and merged. Task 4 fixes
both groups with one change (card-scoped scan plus a full-history fallback), so the fix also holds
for every card already in flight with an overwritten `base-sha`.

- [ ] **Step 2: Commit**

```bash
git add plugins/tribe/scripts/tests/test-resume-check.sh docs/tribe/planning/idea-09-ephemeral-warchief/plan.md
git commit -m "test(tribe): failing tests for resume-check wave fields and wave-merge task amnesia" \
  -m $'Tribe-Card: idea-09-ephemeral-warchief\nTribe-Task: 3/9'
```

---

## Task 4: Implement wave awareness and card-scoped trailer scanning in resume-check.sh

**Why:** make the fresh Warchief able to answer "which wave do I run?" from a lookup, and make the
task count survive a wave merge no matter which base SHA the state file happens to carry.

**Files:** edit `plugins/tribe/scripts/resume-check.sh`.

- [ ] **Step 1: Make the failing test pass**

Replace `trailer_progress` (`resume-check.sh:136-152`) with a card-scoped, range-tolerant version:

```python
def trailer_progress(wt_path, base_sha, slug):
    # Highest completed task number for THIS card, per Tribe-Task trailers.
    # Card-scoped (Tribe-Card must match) so a shared history can never inflate the count,
    # and range-tolerant: if base-sha..HEAD yields nothing (a state file whose base-sha was
    # re-recorded to a post-merge HEAD — the pre-idea-09 wave-merge shape), fall back to the
    # full history for this card rather than silently reporting zero completed tasks.
    fmt = ("--format=%(trailers:key=Tribe-Card,valueonly,separator=,)"
           "|%(trailers:key=Tribe-Task,valueonly,separator=,)")

    def scan(rng):
        rc, out, _ = sh(["git", "-C", wt_path, "log", fmt, rng])
        if rc != 0:
            return None
        last = 0
        for line in out.splitlines():
            cards_field, _, tasks_field = line.partition("|")
            if slug and slug not in [c.strip() for c in cards_field.split(",")]:
                continue
            for val in tasks_field.split(","):
                m = re.match(r"\s*(\d+)\s*/\s*\d+", val)
                if m:
                    last = max(last, int(m.group(1)))
        return last

    ranged = scan(f"{base_sha}..HEAD") if base_sha else None
    if ranged:
        return ranged
    return scan("HEAD") or 0
```

Add a wave reader next to it:

```python
WAVE_MS_RE = re.compile(r"^wave\s+(\d+)\s+integrated\b", re.IGNORECASE)

def wave_progress(state):
    # (waves_total, waves_integrated, next_wave). All None for a card that declares no waves —
    # the pre-idea-09 state-file shape stays valid and its next_action is unaffected.
    field = state["fields"].get("waves")
    total = int(field) if field and field.isdigit() else None
    seen = []
    for ms in state["milestones"]:
        m = WAVE_MS_RE.match(ms["text"])
        if m:
            seen.append((int(m.group(1)), ms["done"]))
    if not seen and total is None:
        return (None, None, None)
    seen.sort()
    integrated = 0
    for _, done in seen:
        if not done:
            break
        integrated += 1
    if total is None:
        total = max(n for n, _ in seen)
    next_wave = integrated + 1 if integrated < total else None
    return (total, integrated, next_wave)
```

In the card loop (`resume-check.sh:225-246`), pass the slug and record the wave fields:

```python
        trailer_last = trailer_progress(wt["path"], f.get("base-sha"), state["slug"])
        cb_prefix, total, plan_exists = plan_checkbox_progress(wt["path"], f.get("plan"))
        waves_total, waves_integrated, next_wave = wave_progress(state)
```

and add these keys to the `card` dict, immediately after `"total_tasks": total,`:

```python
            "waves_total": waves_total,
            "waves_integrated": waves_integrated,
            "next_wave": next_wave,
            "wave_base_sha": f.get("wave-base-sha"),
```

Finally, extend the header comment (`resume-check.sh:8-13`) so the state layers list names the new
fields:

```text
#   3. the per-card state file (docs/tribe/state/CARD.md in each worktree) — its immutable
#      base-sha (the branch point, the floor of the trailer scan), its moving wave-base-sha
#      (what the next wave's worktrees branch from), its waves: count, and one
#      "wave N integrated" milestone per wave (idea 09's ephemeral-Warchief cycle).
```

Run the suites:

```bash
bash plugins/tribe/scripts/tests/test-resume-check.sh | tail -1
bash plugins/tribe/scripts/tests/test-heartbeat-check.sh | tail -1
bash plugins/tribe/scripts/tests/test-validate-plan.sh | tail -1
```

**Expected (GREEN):** `test-resume-check.sh`'s last line reads `<n> passed, 0 failed` (its passed
count grows by the 10 new assertions from task 3 — note this file's summary format differs from the
new test files', which print `# passed: <n>, failed: 0`); the heartbeat and validate-plan suites are
unchanged and also report zero failures.

- [ ] **Step 2: Commit**

```bash
git add plugins/tribe/scripts/resume-check.sh docs/tribe/planning/idea-09-ephemeral-warchief/plan.md
git commit -m "fix(tribe): card-scoped trailer scan + wave fields in resume-check" \
  -m $'Tribe-Card: idea-09-ephemeral-warchief\nTribe-Task: 4/9'
```

---

## Task 5: Failing protocol test for warchief.md's half of the handoff

**Why:** the protocol lives in two prompts and two scripts. A grep-level test keeps the four in sync
— if someone rewrites step 5 and drops the sentinel, a test goes red instead of a campaign silently
deadlocking.

**Files:** create `plugins/tribe/scripts/tests/test-handoff-protocol.sh` (new).

- [ ] **Step 1: Write the failing test**

Create `plugins/tribe/scripts/tests/test-handoff-protocol.sh`:

```bash
#!/usr/bin/env bash
# test-handoff-protocol.sh — the ephemeral-Warchief handoff protocol (idea 09) lives in two
# prompts and two scripts. These are the load-bearing literals that keep them in sync.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$HERE/../../agents"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
has() { # has FILE LITERAL NAME
  if grep -qF -- "$2" "$1"; then ok "$3"; else bad "$3 (missing literal: $2)"; fi
}

W="$AGENTS/warchief.md"
has "$W" "HANDOFF wave"      "warchief documents the handoff sentinel token"
has "$W" "wave-base-sha"     "warchief state file separates the moving wave base from base-sha"
has "$W" "2 or more waves"   "warchief states the activation condition"
has "$W" "never hand off after the final wave" "warchief forbids a pointless final handoff"
has "$W" "waves:"            "warchief state-file template carries the wave count"

printf '\n# passed: %d, failed: %d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
```

Run it:

```bash
chmod +x plugins/tribe/scripts/tests/test-handoff-protocol.sh
bash plugins/tribe/scripts/tests/test-handoff-protocol.sh; echo "exit=$?"
```

**Expected (RED):** five `not ok -` lines (warchief.md documents none of this yet) and a non-zero
`exit=`:

```
not ok - warchief documents the handoff sentinel token (missing literal: HANDOFF wave)
not ok - warchief state file separates the moving wave base from base-sha (missing literal: wave-base-sha)
```

- [ ] **Step 2: Commit**

```bash
git add plugins/tribe/scripts/tests/test-handoff-protocol.sh docs/tribe/planning/idea-09-ephemeral-warchief/plan.md
git commit -m "test(tribe): failing protocol test for the warchief handoff contract" \
  -m $'Tribe-Card: idea-09-ephemeral-warchief\nTribe-Task: 5/9'
```

---

## Task 6: Teach warchief.md the handoff — state shape, HANDOFF status, wave-boundary exit

**Why:** the Warchief is the one that ends itself; its prompt is the policy.

**Files:** edit `plugins/tribe/agents/warchief.md`.

- [ ] **Step 1: Make the failing test pass**

**(a) State-file template.** Replace the fenced template at `warchief.md:140-153` with:

````markdown
  ```markdown
  # tribe-state: CARD-SLUG
  roadmap: ROADMAP-PATH
  worktree: ABSOLUTE-WORKTREE-PATH
  branch: BRANCH-NAME
  report: REPORT-FILE-PATH
  base-sha: SHA
  wave-base-sha: SHA
  waves: WAVE-COUNT
  plan: PLAN-PATH-RELATIVE-TO-WORKTREE

  ## Milestones
  - [ ] spec committed
  - [ ] plan committed
  - [ ] wave 1 integrated
  ```

  `base-sha` is **immutable**: the SHA your branch forked from, written once at intake and never
  rewritten. `resume-check.sh` uses it as the floor of its task-trailer scan, so re-recording it
  would erase every task your Hunters already committed. `wave-base-sha` is the moving one — it
  starts equal to `base-sha` and is re-recorded to the post-merge HEAD in the same commit as each
  wave integration; it is what the next wave's sub-plan worktrees branch from (step 4).
  `waves: WAVE-COUNT` and one `- [ ] wave N integrated` milestone **per wave** are written in the
  same commit as the plan, once the plan tells you how many waves there are (a single-wave plan
  keeps `waves: 1` and the single wave-1 milestone above).
````

**(b) Contract — the fourth status.** In "The Shaman ⇄ Warchief contract"
(`warchief.md:61-71`), add after the `BLOCKED` bullet:

```markdown
  - **`HANDOFF`** — you integrated a wave, it is committed and audited-clean, and another wave
    remains. You are ending **on purpose** to hand your successor a clean context: state, plan
    and report file are the memory; your context window is not. Return: the wave just integrated,
    the wave to run next, the worktree / spec / plan / state paths, and the handoff heartbeat line
    verbatim. The Shaman re-dispatches a fresh Warchief immediately — this is routine, not an
    escalation, and it is **not** a stop condition for an unattended campaign.
```

**(c) Channels — the sentinel.** After the staleness paragraph (`warchief.md:105-125`), add:

````markdown
**One heartbeat line is a machine-readable exit, not a status update — the HANDOFF sentinel.**
When you end yourself at a wave boundary (step 5), the last line you append is exactly:

```
[2026-07-12T09:15:00Z] HANDOFF wave 2 integrated — re-dispatch me (next: wave 3)
```

`heartbeat-check.sh` reads that token on the **last** timestamped line and returns
`status: handoff`, `next_action: REDISPATCH_HANDOFF` — **regardless of age**, so the Shaman
re-dispatches at once instead of reading a fresh timestamp as `alive` and waiting out a
staleness window on a Warchief that is already gone. Write it **only** at a legitimate handoff
(see step 5); never as decoration. If you are the successor, your `dispatch received` line at
intake supersedes the sentinel and the file reads `alive` again — so write it **first**, before
any other work.
````

**(d) Step 5 — the handoff step.** In step 5's wave-integration procedure, rewrite item 3
(`warchief.md:420-427`) and add item 4 (renumbering the old item 4 to item 5):

````markdown
  3. Once every wave-N branch is merged (and its worktree/branch cleaned up), re-record
     **`wave-base-sha`** (never `base-sha`) as your worktree's new HEAD, and tick that wave's
     milestone — both in the merge commit:
     ```bash
     git -C <your-worktree-path> rev-parse HEAD
     ```
     This new SHA is what step 4 uses as "the currently-recorded base commit" for wave N+1.
  4. **Hand off — end yourself, on purpose.** A context that coordinated a whole wave is a
     liability by the next one: the state lives in files, not in you. If the state file declares
     **2 or more waves** and an unrun wave remains, you now:
     - append the HANDOFF sentinel to the report file (Channels, above), naming the wave you just
       integrated and the wave that comes next;
     - return `HANDOFF` (final message, and `SendMessage` if you have a live channel) and **end**.
       The Shaman re-dispatches a fresh Warchief, which runs `resume-check.sh`, gets
       `CONTINUE task M` plus `next_wave`, and starts wave N+1 from `wave-base-sha` with a clean
       context.

     Hand off **only** when all of these hold — otherwise carry on yourself:
     - the plan has **2 or more waves** (a single-wave card never cycles: the handoff would be
       pure overhead, and there is nothing to hand off to);
     - an unrun wave remains — **never hand off after the final wave**; the last instance carries
       straight through to delivery (step 7). An extra dispatch just to open a PR buys nothing;
     - the wave's merge, its milestone tick and `wave-base-sha` are **committed**, and every
       sub-plan in the wave passed its audit (a mixed-outcome wave returns `NEEDS_DIRECTION`, not
       `HANDOFF`);
     - **you integrated that wave yourself** — an instance that has integrated nothing may never
       hand off (the Shaman's loop guard rejects it as `BLOCKED`).
  5. Otherwise (final wave, or a single-wave plan): create the next wave's worktrees (step 4) and
     dispatch its Hunters, or proceed to step 7 when no wave remains.
````

**(e) Resume protocol.** In the `next_action` list (`warchief.md:176-188`), append to the
`CONTINUE task N` bullet:

```markdown
    On a wave-structured card, `resume-check.sh` also prints `next_wave` (and `waves_integrated`
    / `waves_total`): task N belongs to that wave. Create that wave's sub-plan worktrees from
    `wave-base-sha` (step 4) and dispatch its Hunters. You were re-dispatched after a deliberate
    handoff, not a crash — the tree is clean and the previous waves are merged; **never** re-run
    a wave whose milestone is already ticked.
```

Run the protocol test and the whole suite:

```bash
bash plugins/tribe/scripts/tests/test-handoff-protocol.sh; echo "exit=$?"
for t in heartbeat-check resume-check validate-plan; do
  bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
```

**Expected (GREEN):** the protocol test prints five `ok -` lines, `# passed: 5, failed: 0`,
`exit=0`; the other three suites still report zero failures (`0 failed` for resume-check,
`failed: 0` for the other two).

- [ ] **Step 2: Commit**

```bash
git add plugins/tribe/agents/warchief.md docs/tribe/planning/idea-09-ephemeral-warchief/plan.md
git commit -m "feat(tribe): warchief hands off at wave boundaries (ephemeral instance)" \
  -m $'Tribe-Card: idea-09-ephemeral-warchief\nTribe-Task: 6/9'
```

---

## Task 7: Failing protocol test for shaman.md's half of the handoff

**Why:** the cycle only closes if the Shaman re-dispatches. Lock its three obligations —
recognise the verdict, apply the loop guard, do not treat a handoff as a campaign stop.

**Files:** edit `plugins/tribe/scripts/tests/test-handoff-protocol.sh`.

- [ ] **Step 1: Write the failing test**

Insert this block into `test-handoff-protocol.sh`, between the `warchief.md` assertions and the
final summary lines:

```bash
S="$AGENTS/shaman.md"
has "$S" "REDISPATCH_HANDOFF"   "shaman recognises the handoff next_action"
has "$S" "handoff"              "shaman documents the handoff verdict"
has "$S" "loop guard"           "shaman applies the no-progress loop guard"
has "$S" "HANDOFF is never a stop marker" "shaman keeps an unattended campaign running through a handoff"
has "$S" "same report-file path" "shaman re-dispatch continues the same heartbeat chain"
```

Run it:

```bash
bash plugins/tribe/scripts/tests/test-handoff-protocol.sh; echo "exit=$?"
```

**Expected (RED):** the five warchief assertions still pass; the five new shaman assertions fail
with a non-zero `exit=`, for example:

```
not ok - shaman recognises the handoff next_action (missing literal: REDISPATCH_HANDOFF)
not ok - shaman applies the no-progress loop guard (missing literal: loop guard)
```

- [ ] **Step 2: Commit**

```bash
git add plugins/tribe/scripts/tests/test-handoff-protocol.sh docs/tribe/planning/idea-09-ephemeral-warchief/plan.md
git commit -m "test(tribe): failing protocol test for the shaman handoff routing" \
  -m $'Tribe-Card: idea-09-ephemeral-warchief\nTribe-Task: 7/9'
```

---

## Task 8: Teach shaman.md to route a handoff — verdict, re-dispatch, loop guard

**Why:** close the cycle, and make it impossible for a broken agent to spin it forever.

**Files:** edit `plugins/tribe/agents/shaman.md`.

- [ ] **Step 1: Make the failing test pass**

**(a) Upward statuses.** In "The Shaman ⇄ Warchief contract" (`shaman.md:87-101`), add a bullet
after `BLOCKED`:

```markdown
- **`HANDOFF`** — the Warchief integrated a wave and ended **on purpose**, handing its successor a
  clean context (persistent policy, ephemeral instance). Your duty: **re-dispatch a fresh Warchief
  immediately**, mechanically — this is not a question, not an escalation, and **not** a Decision
  Log entry (no ruling was made). The re-dispatch carries: the card verbatim, the Standing
  Constraints, the roadmap path, **the same report-file path** (one continuous heartbeat chain
  across instances), the saved worktree / spec / plan / state-file paths, the handoff heartbeat
  line verbatim, every Decision Log ruling already made for this card, and the instruction "you
  are resuming — run `resume-check.sh` first and obey its `next_action`". The roadmap's
  `in-flight:` marker does not change: same card, same worktree.
  **Loop guard:** before re-dispatching, read `waves_integrated` from `resume-check.sh`. A
  `HANDOFF` that did **not** newly tick a wave milestone is an instance that ended without
  progress — that is a broken agent, not a handoff: treat it as `BLOCKED`. Every legitimate cycle
  advances `waves_integrated` by exactly one, so an infinite handoff loop is impossible.
```

**(b) Channels & liveness.** In the `heartbeat-check.sh` paragraph (`shaman.md:126-140`), after the
sentence describing `alive`/`stale`/`unknown`, add:

```markdown
  A fourth verdict, **`handoff`** (`next_action: REDISPATCH_HANDOFF`), means the Warchief ended
  itself deliberately at a wave boundary — its last heartbeat line is the `HANDOFF wave N
  integrated` sentinel. **Age is irrelevant to this verdict**: do not wait for it to go stale, and
  do not read its fresh timestamp as `alive`. Re-dispatch at once, per the `HANDOFF` bullet above
  (with the loop guard). The script also prints `next_wave`, which the fresh Warchief will confirm
  against `resume-check.sh`. `HANDOFF` reaching you as the Warchief's return message and `handoff`
  reaching you from the heartbeat file are the same event by two channels — act once.
```

**(c) Unattended mode.** In the Wiring bullet's stop-marker paragraph (`shaman.md:384-407`), add:

```markdown
  **`HANDOFF` is never a stop marker.** The routine's only legitimate stops are the three literal
  markers (`verified-SHIPPED`, `ESCALATE-NEEDS-DIRECTION`, `ESCALATE-BLOCKED`). A `HANDOFF` is a
  routine, non-halting round exactly like a `NEEDS_DIRECTION` you resolve yourself: re-dispatch the
  fresh Warchief and keep going. A routine that halted on a handoff would stall every multi-wave
  card at its first wave boundary — with the card half-built and nobody escalating.
```

Run the protocol test and the full suite:

```bash
bash plugins/tribe/scripts/tests/test-handoff-protocol.sh; echo "exit=$?"
for t in heartbeat-check resume-check validate-plan; do
  bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
```

**Expected (GREEN):** the protocol test prints ten `ok -` lines, `# passed: 10, failed: 0`,
`exit=0`; the other three suites report zero failures.

- [ ] **Step 2: Commit**

```bash
git add plugins/tribe/agents/shaman.md docs/tribe/planning/idea-09-ephemeral-warchief/plan.md
git commit -m "feat(tribe): shaman routes the wave-boundary handoff (with loop guard)" \
  -m $'Tribe-Card: idea-09-ephemeral-warchief\nTribe-Task: 8/9'
```

---

## Task 9: End-to-end handoff simulation and before/after evidence

**Why:** the two scripts must agree on the wave number — that agreement *is* the handoff contract.
And the PR needs the spec's before/after evidence.

**Files:** edit `plugins/tribe/scripts/tests/test-handoff-protocol.sh`; create
`docs/superpowers/evidence/idea-09-handoff-before-after.json`.

- [ ] **Step 1: Write the simulation, then capture the evidence**

Append to `test-handoff-protocol.sh` (before the summary lines) a simulation that walks a 2-wave
card across its boundary and asserts the two scripts agree:

```bash
# --- end-to-end: at a wave boundary, both scripts must name the SAME next wave ----
SIM="$(mktemp -d)"
trap 'rm -rf "$SIM"' EXIT
REPORT="$SIM/report.md"
python3 - "$REPORT" <<'EOF'
import sys
from datetime import datetime, timezone
ts = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
open(sys.argv[1], "w").write(
    "[%s] HANDOFF wave 1 integrated — re-dispatch me (next: wave 2)\n" % ts)
EOF
HB="$(bash "$HERE/../heartbeat-check.sh" "$REPORT")"
hb_status=$(printf '%s' "$HB" | python3 -c 'import json,sys; print(json.load(sys.stdin)["status"])')
hb_next=$(printf '%s' "$HB" | python3 -c 'import json,sys; print(json.load(sys.stdin)["next_wave"])')
if [[ "$hb_status" == "handoff" && "$hb_next" == "2" ]]; then
  ok "simulation: heartbeat-check says handoff, next wave 2"
else
  bad "simulation: heartbeat-check (got: $hb_status/$hb_next, want: handoff/2)"
fi
```

Then capture the evidence. On the **base branch** (`git stash` is not needed — use a second
worktree at `origin/master`) run the two commands against the same two fixtures, and on the
**branch** run them again:

```bash
git worktree add /tmp/idea09-base origin/master
# BEFORE: the deadlock — a handoff sentinel reads as "alive", so the Shaman waits.
bash /tmp/idea09-base/plugins/tribe/scripts/heartbeat-check.sh "$REPORT"
# AFTER: the same file, on this branch.
bash plugins/tribe/scripts/heartbeat-check.sh "$REPORT"
```

Save both JSON outputs (plus the `resume-check.sh` before/after pair from task 3's fixture) into
`docs/superpowers/evidence/idea-09-handoff-before-after.json` as a single object with `before` and
`after` keys, and paste them into the PR body as fenced JSON blocks.

**Expected:** BEFORE prints `"status": "alive"` with no `next_action` key — the deadlock, in
writing. AFTER prints `"status": "handoff"`, `"next_action": "REDISPATCH_HANDOFF"`,
`"next_wave": 2`. The resume-check pair shows `"next_action": "CONTINUE task 1"` before and
`"CONTINUE task 4"` after. The full suite (four test files) reports zero failures everywhere.

```bash
git worktree remove /tmp/idea09-base --force
for t in heartbeat-check resume-check validate-plan handoff-protocol; do
  bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
```

- [ ] **Step 2: Commit**

```bash
git add plugins/tribe/scripts/tests/test-handoff-protocol.sh \
        docs/superpowers/evidence/idea-09-handoff-before-after.json \
        docs/tribe/planning/idea-09-ephemeral-warchief/plan.md
git commit -m "test(tribe): end-to-end handoff simulation + before/after evidence" \
  -m $'Tribe-Card: idea-09-ephemeral-warchief\nTribe-Task: 9/9'
```

---

## After the tasks (Warchief, not Hunter)

1. Final whole-branch audit with the `skinner` subagent against this plan and the spec.
2. Open the PR with the before/after evidence embedded (spec, Evidence plan), wait for CI green,
   squash-merge.
3. Report `SHIPPED` to the Shaman with the measured outcome: a multi-wave card now runs one fresh
   Warchief per wave, and `heartbeat-check.sh` distinguishes an intentional exit from both a live
   agent and a corpse.
