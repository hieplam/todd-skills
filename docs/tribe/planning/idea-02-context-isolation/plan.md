# Plan — Idea 02: Absolute context asymmetry (the Skinner never sees the code side's reasoning)

**Card:** `idea-02-context-isolation`
**Spec:** `docs/tribe/planning/idea-02-context-isolation/spec.md` — read it first; it is the contract.
**For:** a FUTURE implementation campaign. This plan was authored on branch
`planning/idea-02-context-isolation`, which deliberately contains **zero** changes under `plugins/`.

**What this plan builds:** a two-sided seal on the Skinner's dispatch context — an **outbound**
allowlist in the Warchief's audit step, an **inbound** refusal in the Skinner's operating rules, a
clarifying clause in the Hunter's report section, and a mechanical governance test that proves all
three exist.

---

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **TDD, red first.** Every task adds its assertions to the governance test, **runs the test and sees
  it fail for the stated reason**, then edits the prompt file to make it pass. A task that never saw
  red did not follow this plan.
- **Every task ends green.** The full test suite (all three scripts under
  `plugins/tribe/scripts/tests/`) passes at every commit. Never commit a knowingly-red suite.
- **The rule text in this plan is verbatim and normative.** Paste it as written. It was worded against
  three constraints that are easy to break by paraphrase: (a) the allowlist is a **ceiling** ("only",
  "never more") so sibling idea 03 can later show a reviewer *less*; (b) artifacts inside the diff are
  **always** admissible, so sibling idea 05's falsification-test channel survives; (c) a
  `CONTAMINATED:` verdict judges the **dispatch**, not the code. If you believe a word is wrong,
  report back — do not improve it silently.
- **No scope creep.** Touch only the four files named in the tasks below. Do not add a second Skinner,
  do not change the 3-round fix cap, do not touch `validate-plan.sh` / `resume-check.sh`.
- **Commit trailers.** Every commit carries, in ONE final paragraph:
  `Tribe-Card: idea-02-context-isolation` and `Tribe-Task: N/3`. Tick this plan's checkboxes in the
  **same commit** as the code. No co-authored trailers.
- **Repo conventions.** Tests are TAP-style bash under `plugins/tribe/scripts/tests/`, `set -euo
  pipefail`, offline, run directly. Match the style of the existing `test-validate-plan.sh`.

**Files this plan touches (the whole list):**

| File | Change |
|---|---|
| `plugins/tribe/scripts/tests/test-context-isolation.sh` | new — the governance test |
| `plugins/tribe/agents/warchief.md` | step 6 (currently lines 441-454) — the outbound allowlist |
| `plugins/tribe/agents/skinner.md` | Operating rules (line 48+) and contract chain level 1 (lines 79-80) — the inbound refusal |
| `plugins/tribe/agents/hunter.md` | report section (lines 122-123) — close the invitation |

**Not a Hunter task (the Warchief owns these):** capturing the before/after evidence (§5 of the spec),
opening the PR, and dispatching the final whole-branch Skinner audit **under the new rule** — the card
dogfooding itself.

---

## Task 1: The governance test + the Warchief's outbound allowlist

Creates the test harness and seals the sending side. Assertions T1-T5 from the spec.

- [x] **Step 1: Write the failing test (RED).** Create `plugins/tribe/scripts/tests/test-context-isolation.sh`
      with exactly this content:

```bash
#!/usr/bin/env bash
# test-context-isolation.sh — governance test for the Skinner dispatch seal (idea-02).
# Asserts the context-isolation rule is PRESENT and REACHABLE in the tribe's agent prompts.
# The artifact under test is prompt text, so the proof is a static check on that text.
# Offline, no network.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$HERE/../../agents"
WARCHIEF="$AGENTS/warchief.md"
SKINNER="$AGENTS/skinner.md"
HUNTER="$AGENTS/hunter.md"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

# has NAME FILE PATTERN — assert PATTERN (fixed string, case-insensitive) appears in FILE
has() {
  if grep -qiF -- "$3" "$2"; then ok "$1"; else bad "$1 (missing in $(basename "$2"): $3)"; fi
}

for f in "$WARCHIEF" "$SKINNER" "$HUNTER"; do
  [[ -f "$f" ]] || { printf 'not ok - agent file missing: %s\n' "$f"; exit 1; }
done

# --- T1: warchief step 6 carries the four-item allowlist ------------------------
has "T1a warchief: dispatch-content checklist exists" "$WARCHIEF" "Dispatch-content checklist"
has "T1b warchief: allowlist is exhaustive"           "$WARCHIEF" "may contain ONLY these four things"
has "T1c warchief: allows the contract"               "$WARCHIEF" "the spec and/or plan (paths or content), authored before the code existed"
has "T1d warchief: allows the diff"                   "$WARCHIEF" "the change under audit, in full, identified mechanically"
has "T1e warchief: allows the repo rules"             "$WARCHIEF" "C3 docs, and the like"
has "T1f warchief: allows mechanical scope"           "$WARCHIEF" "which change to audit and where"
has "T1g warchief: allowlist is a ceiling"            "$WARCHIEF" "CEILING, not a floor"

# --- T2: warchief step 6 bans the code side's narrative -------------------------
has "T2a warchief: bans the Hunter's report file"     "$WARCHIEF" "the Hunter's report file"
has "T2b warchief: bans the Hunter's return message"  "$WARCHIEF" "the Hunter's return message"
has "T2c warchief: bans the Warchief's own narrative" "$WARCHIEF" "your own narrative about the build"
has "T2d warchief: bans prior Skinner reports"        "$WARCHIEF" "prior Skinner reports on the same code"
has "T2e warchief: states the bias rationale"         "$WARCHIEF" "wants the code to get accepted"

# --- T3: the diff-carries-artifacts exception -----------------------------------
has "T3a warchief: diff is the only code-side channel" "$WARCHIEF" "ONLY channel from the code side"
has "T3b warchief: narrative banned, artifacts are not" "$WARCHIEF" "never on artifacts inside the diff"
has "T3c warchief: prose vs artifacts maxim"            "$WARCHIEF" "Prose persuades; artifacts get run"

# --- T4: every audit starts cold, including re-audits ---------------------------
has "T4a warchief: fresh Skinner per fix-round"        "$WARCHIEF" "Each fix-round gets a FRESH Skinner"
has "T4b warchief: no prior findings carried in"       "$WARCHIEF" "no previous findings"
has "T4c warchief: final audit carries no history"     "$WARCHIEF" "no accumulated per-task audit history"

# --- T5: CONTAMINATED routing -----------------------------------------------------
has "T5a warchief: contaminated is a dispatch fault"   "$WARCHIEF" "a verdict on YOUR dispatch, not on the code"
has "T5b warchief: never route it to a fixer"          "$WARCHIEF" "never route it to a fixer Hunter"
has "T5c warchief: it costs no fix-round"              "$WARCHIEF" "does NOT consume one of the 3 fix-rounds"

printf '\n# passed %d, failed %d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
```

  Make it executable and run it. It **must fail** — the seal does not exist yet:

```bash
chmod +x plugins/tribe/scripts/tests/test-context-isolation.sh
bash plugins/tribe/scripts/tests/test-context-isolation.sh; echo "exit=$?"
```

  **Expected (RED):** every `T1`-`T5` line prints `not ok`, the summary reads
  `# passed 0, failed 21`, and `exit=1`. If any assertion passes here, stop and report back —
  it means the anchor string is matching unrelated prose, and the test is not proving what it claims.

- [x] **Step 2: Make it green — add the allowlist to `warchief.md` step 6.** In
      `plugins/tribe/agents/warchief.md`, find the section `### 6. Audit every deliverable with the
      skinner` (currently line 441). Keep its existing paragraph exactly as it is, and insert the
      following **immediately after** that paragraph (i.e. after the sentence ending "...without
      waiting for 3 rounds.") and before `### 7. Deliver: evidence, PR, green, merge`.

      Paste verbatim:

````markdown
**Dispatch-content checklist — the Skinner runs COLD (non-negotiable).**

A Skinner dispatch may contain ONLY these four things:

1. **The contract** — the spec and/or plan (paths or content), authored before the code existed.
2. **The diff** — the change under audit, in full, identified mechanically (a git range, a PR
   number, or file paths).
3. **The repo's rules** — `CLAUDE.md`, `.claude/rules/`, C3 docs, and the like.
4. **Mechanical scope** — which change to audit and where: the git range / PR number / worktree
   path, the base branch, and the report-file path for the Skinner's OWN output.

This list is a **CEILING, not a floor**: a dispatch may contain *less* (a deliberately
contract-blind reviewer is a valid variant), but **never more**.

**BANNED — never put these in a Skinner dispatch:**

- **the Hunter's report file** — its path or any excerpt of it;
- **the Hunter's return message** — its `DONE` / `DONE_WITH_CONCERNS` status, its test counts, its
  concerns;
- **your own narrative about the build** — "the Hunter was careful", "this bit was tricky", "the
  first failure was expected", "I already reviewed it";
- **prior Skinner reports on the same code**, and any fixer's explanation of why it fixed something.

**Why:** *"the Claude that wrote the code wants the code to get accepted"* — reading the code
side's self-justification **persuades** the reviewer into letting bugs through. The real bugs this
kind of review exists to catch all compiled cleanly and looked plausible; only a context that was
never told the code is fine catches them. A Skinner that has read "all tests green, no concerns" is
no longer auditing — it is confirming. You are holding the Hunter's report when you dispatch; that
is exactly why the rule names it.

**The diff is the ONLY channel from the code side to the auditor.** The ban is on out-of-band
narrative, **never on artifacts inside the diff**: if the code side needs the auditor to know
something, it **commits** it — a test, an assertion, a fixture, a comment — and the Skinner reads it
as part of the change and **runs** it. *Prose persuades; artifacts get run.*

**Scope mechanically, never judgmentally.** Telling the Skinner *which bytes* to audit is address
information and is required. Telling it *what to think* about them is anchoring — it imports the
code side's model of its own work, which is what handing over the reasoning does, only shorter:

| Allowed (mechanical) | Banned (judgmental) |
|---|---|
| "Audit commit range `abc123..def456`." | "Focus on the caching logic — that's where it got hairy." |
| "Audit branch X vs `origin/master`." | "The Hunter says the edge case is handled; verify that." |
| "Task 3 of the plan is the contract for this diff." | "Tasks 1-2 already passed audit, so just check 3." |

**Every audit starts cold — including re-audits.**
Each fix-round gets a FRESH Skinner with a clean allowlist dispatch: no previous findings, no fixer
explanation, and no account of what changed in response. The fixer's answer to a finding must already
be in the diff. The final whole-branch audit likewise carries
no accumulated per-task audit history and no "all tasks already passed" preamble — it is the coldest
read of the whole change and must stay that way.

**If a Skinner returns `AUDIT: FAIL — CONTAMINATED: <what leaked>`**, that is
a verdict on YOUR dispatch, not on the code. Nothing about the code has been judged. Fix the dispatch
and re-dispatch a fresh Skinner;
never route it to a fixer Hunter, and it does NOT consume one of the 3 fix-rounds —
a briefing bug of yours must not burn the code's fix budget.
````

  Re-run the test:

```bash
bash plugins/tribe/scripts/tests/test-context-isolation.sh; echo "exit=$?"
```

  **Expected (GREEN):** all 21 assertions print `ok`, summary `# passed 21, failed 0`, `exit=0`.

- [x] **Step 3: Commit** — tick this task's boxes in the same commit as the code.

```bash
git add plugins/tribe/scripts/tests/test-context-isolation.sh plugins/tribe/agents/warchief.md docs/tribe/planning/idea-02-context-isolation/plan.md
git commit -m "feat(tribe): seal the Skinner dispatch — outbound allowlist in warchief step 6" \
  -m $'Tribe-Card: idea-02-context-isolation\nTribe-Task: 1/3'
git log --format='%h %s%n%(trailers:only)' -1
```

  **Expected:** one commit; the trailer block prints both `Tribe-Card:` and `Tribe-Task: 1/3`.

---

## Task 2: The Skinner's inbound quarantine

Seals the receiving side, so a contaminated dispatch is refused even when the caller is **not** the
Warchief (the Skinner is also dispatched for owner self-audits and "review this PR"). Adds assertions
T6, T7, and the T9 anti-regression guard.

- [x] **Step 1: Extend the test (RED).** Append to `plugins/tribe/scripts/tests/test-context-isolation.sh`,
      **before** the final `printf`/`[[ "$FAIL" -eq 0 ]]` lines (move those two lines to the end):

```bash
# --- T6: skinner refuses a contaminated dispatch --------------------------------
has "T6a skinner: refuse-contaminated rule exists"  "$SKINNER" "Refuse a contaminated dispatch"
has "T6b skinner: names the four admissible items"  "$SKINNER" "the contract (spec/plan), the diff, the repo's rules, and mechanical scope"
has "T6c skinner: may contain less, never more"     "$SKINNER" "It may contain less; it may never contain more"
has "T6d skinner: bans the Hunter's report"         "$SKINNER" "the Hunter's report file or any excerpt of it"
has "T6e skinner: exact refusal token"              "$SKINNER" "AUDIT: FAIL — CONTAMINATED:"
has "T6f skinner: refusal not 'read it but ignore'" "$SKINNER" "ignoring it is unverifiable"
has "T6g skinner: verdict on dispatch not code"     "$SKINNER" "a verdict on the DISPATCH, not the code"

# --- T7: contract-chain level 1 carries the caveat ------------------------------
has "T7 skinner: caller-given material is limited"  "$SKINNER" "admissible ONLY as contract, diff, rules, or mechanical scope"

# --- T9 (anti-regression): the seal must NOT ban artifacts in the diff -----------
# Guards sibling idea-05: a fixer's counter-evidence travels as a committed test in the
# diff. If a future edit ever tightens this rule into "the Skinner sees less than the full
# diff", these fail.
has "T9a skinner: artifacts in the diff are admissible" "$SKINNER" "everything the code side COMMITTED is in the diff and is fully admissible"
has "T9b skinner: still reads the whole diff"           "$SKINNER" "git diff --name-only"
has "T9c warchief: still points the Skinner at the diff" "$WARCHIEF" "against the diff"
```

  Run it:

```bash
bash plugins/tribe/scripts/tests/test-context-isolation.sh; echo "exit=$?"
```

  **Expected (RED):** T1-T5 still `ok` (21). The `T6*`, `T7` and `T9a` lines print `not ok` (9
  failures — they assert skinner text you have not written yet). `T9b` and `T9c` print **`ok`**:
  those two are pure anti-regression guards on text that *already* exists (`skinner.md:74`,
  `warchief.md:444`) and must keep existing. Summary: `# passed 23, failed 9`, `exit=1`.

  Prove the T9 guards can actually fail (a guard that cannot go red is decoration). Mutate, observe,
  restore:

```bash
cp plugins/tribe/agents/skinner.md /tmp/skinner.bak
sed -i '' 's/git diff --name-only/git show --stat/' plugins/tribe/agents/skinner.md
bash plugins/tribe/scripts/tests/test-context-isolation.sh | grep 'T9b'
cp /tmp/skinner.bak plugins/tribe/agents/skinner.md && rm /tmp/skinner.bak
```

  **Expected:** the mutated run prints `not ok - T9b skinner: still reads the whole diff`, and after
  the restore the file is byte-identical (`git diff --quiet plugins/tribe/agents/skinner.md` exits 0).

- [x] **Step 2: Make it green — add the quarantine to `skinner.md`.** Two edits.

  **(a)** In `plugins/tribe/agents/skinner.md`, in the `## Operating rules` section (currently starting
  line 48), insert this as the **first** bullet — before "Read + verify only. NEVER mutate." — so it is
  the first thing read. Paste verbatim:

````markdown
- **Refuse a contaminated dispatch. You audit COLD.** Your dispatch may contain only four things:
  the contract (spec/plan), the diff, the repo's rules, and mechanical scope (a git range / PR
  number / base branch / worktree path, and your own report-file path).
  It may contain less; it may never contain more.
  If it contains anything the code-writing side **said** —
  the Hunter's report file or any excerpt of it, the Hunter's return message or its concerns,
  the caller's narrative about how the build went ("the Hunter was careful", "the tests all pass",
  "this part was tricky"), a prior audit's findings, or a fixer's explanation of why it fixed
  something — **STOP. Do not audit.** Return `AUDIT: FAIL — CONTAMINATED: <what leaked>` and nothing
  else.
  - **Why refuse instead of reading it and ignoring it:** once the narrative is in your context
    window, ignoring it is unverifiable — the bias has already been applied. The only cure is a
    fresh context: a fresh Skinner with a clean dispatch. (Same stop-and-refuse shape as
    `UN-AUDITABLE:` below.) *"The Claude that wrote the code wants the code to get accepted"* —
    its self-justification is engineered, however unconsciously, to persuade you.
  - **This is a verdict on the DISPATCH, not the code.** Say so plainly, so the caller re-dispatches
    clean instead of sending the code to a fixer. You have judged nothing about the change itself.
  - **The ban is on narrative, never on artifacts:**
    everything the code side COMMITTED is in the diff and is fully admissible — read it, and run it.
    A test the implementer wrote to prove a point is evidence you can execute; a paragraph it wrote
    is not. *Prose persuades; artifacts get run.*
````

  **(b)** In the contract chain (currently line 79-80), extend level 1 so the Skinner knows *how much*
  of a caller's material it may accept. Replace:

```text
1. **Caller-given** — an explicit spec/plan path or requirement statement the caller
   passed you.
```

  with:

```text
1. **Caller-given** — an explicit spec/plan path or requirement statement the caller
   passed you. Caller-given material is
   admissible ONLY as contract, diff, rules, or mechanical scope; if the caller also handed you
   the code side's narrative (a Hunter report, its concerns, a prior audit's findings, a fixer's
   explanation), refuse the dispatch per the contamination rule in Operating rules.
```

  Re-run:

```bash
bash plugins/tribe/scripts/tests/test-context-isolation.sh; echo "exit=$?"
```

  **Expected (GREEN):** `# passed 32, failed 0`, `exit=0`.

- [x] **Step 3: Commit**

```bash
git add plugins/tribe/scripts/tests/test-context-isolation.sh plugins/tribe/agents/skinner.md docs/tribe/planning/idea-02-context-isolation/plan.md
git commit -m "feat(tribe): Skinner refuses a contaminated dispatch (inbound quarantine)" \
  -m $'Tribe-Card: idea-02-context-isolation\nTribe-Task: 2/3'
git log --format='%h %s%n%(trailers:only)' -1
```

  **Expected:** one commit carrying `Tribe-Card:` and `Tribe-Task: 2/3`.

---

## Task 3: Close the invitation in `hunter.md`, and prove no regression

`hunter.md:122-123` currently reads "the Warchief reads the report file for depth **and** audits your
diff with the `skinner`" — one sentence that sets the report file beside the Skinner with nothing
between them. This task turns that accidental invitation into a restatement of the seal, and tells the
Hunter where to put what it was tempted to narrate. Adds assertion T8.

- [x] **Step 1: Extend the test (RED).** Append to `plugins/tribe/scripts/tests/test-context-isolation.sh`,
      again before the final `printf` / `[[ "$FAIL" -eq 0 ]]` lines:

```bash
# --- T8: the Hunter's report never reaches the Skinner ---------------------------
has "T8a hunter: report is the Warchief's alone"    "$HUNTER" "it never reaches the Skinner"
has "T8b hunter: Skinner audits the diff cold"      "$HUNTER" "audits your diff cold"
has "T8c hunter: put it in the diff, not the report" "$HUNTER" "must live in the diff"
```

  Run it:

```bash
bash plugins/tribe/scripts/tests/test-context-isolation.sh; echo "exit=$?"
```

  **Expected (RED):** the three `T8*` lines print `not ok`; everything else stays `ok`. Summary:
  `# passed 32, failed 3`, `exit=1`.

- [x] **Step 2: Make it green — edit `plugins/tribe/agents/hunter.md`.** Replace the closing paragraph
      (currently lines 122-124), which reads:

```text
Keep it tight: the Warchief reads the report file for depth and audits your diff with the
`skinner`. Your job is done when the one task is built, test-proven, committed, and
reported — never before.
```

  with, verbatim:

````markdown
Keep it tight. The report file is the **Warchief's** to read —
it never reaches the Skinner, which
audits your diff cold (contract + diff + repo rules, nothing else), precisely so your own account of
the work cannot persuade it. That asymmetry is deliberate: the side that wrote the code wants the code
accepted, so its story is exactly the thing an auditor must not be told. Anything you need the auditor
to know
must live in the diff — a test, an assertion, a fixture, a comment — never in your report.
Prose persuades; artifacts get run.

Your job is done when the one task is built, test-proven, committed, and reported — never before.
````

  Run the **full** suite — the new test plus both existing ones, to prove nothing regressed:

```bash
for t in plugins/tribe/scripts/tests/test-context-isolation.sh \
         plugins/tribe/scripts/tests/test-validate-plan.sh \
         plugins/tribe/scripts/tests/test-resume-check.sh; do
  printf '=== %s\n' "$t"; bash "$t" | tail -1
done
```

  **Expected (GREEN):** `test-context-isolation.sh` reports `# passed 35, failed 0`; the two existing
  suites report their own all-passing summaries and exit 0. No suite regresses.

- [x] **Step 3: Commit**

```bash
git add plugins/tribe/scripts/tests/test-context-isolation.sh plugins/tribe/agents/hunter.md docs/tribe/planning/idea-02-context-isolation/plan.md
git commit -m "docs(tribe): the Hunter's report is the Warchief's alone, never the Skinner's" \
  -m $'Tribe-Card: idea-02-context-isolation\nTribe-Task: 3/3'
git log --format='%h %s%n%(trailers:only)' -1
```

  **Expected:** one commit carrying `Tribe-Card:` and `Tribe-Task: 3/3`.

---

## Definition of done (the Warchief checks this, not the Hunter)

1. All three tasks committed, each with its trailers; the suite is green at every commit.
2. **Before/after evidence** in the PR body: the RED run of `test-context-isolation.sh` on the base
   commit (the seal is absent — the hole is real), and the GREEN run on the branch, plus the two
   pre-existing suites still green.
3. **The dogfood proof:** the final whole-branch Skinner audit is dispatched **under the new rule** —
   contract + diff + repo rules + mechanical scope, and nothing else — and returns `AUDIT: PASS`. The
   card's own rule, applied to the diff that introduces it.
4. PR squash-merged into the default branch.
