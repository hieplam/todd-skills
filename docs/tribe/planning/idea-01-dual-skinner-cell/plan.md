# Plan — Idea 01: the dual-Skinner audit cell

> Spec: `docs/tribe/planning/idea-01-dual-skinner-cell/spec.md` (read it first — it is the contract)
> Card: `idea-01-dual-skinner-cell`
> Executed by: a FUTURE implementation campaign. The planning campaign that authored this file
> touched zero files under `plugins/`.

Turn the Warchief's single-Skinner audit (`plugins/tribe/agents/warchief.md:441-454`) into a
two-Skinner cell: two independent reviewers dispatched concurrently in one message, never seeing
each other, their findings merged by the Warchief, PASS only when both PASS.

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.** The audit of each task stays with the `skinner` subagent.
- Work in an isolated worktree branched from `origin/master`. Never commit on `master`.
- Every commit carries the trailer `Tribe-Card: idea-01-dual-skinner-cell` plus
  `Tribe-Task: N/4`, both in the commit message's single final paragraph. No `Co-authored-by`
  trailers.
- Each task ticks its own checkboxes in this plan **in the same commit** as the code it describes.
- **Scope fence (from the spec):** this baseline dispatches two *identical* briefs. It must NOT
  introduce differentiated lenses (card 03), a disagreement-routing table (card 04), fixer
  adjudication authority (card 05), or a ban on the Hunter's reasoning reaching the Skinner
  (card 02). It must not change the Skinner's report format, PASS/FAIL criteria, model tier, or the
  3-round fix cap.
- Files this plan may touch: `plugins/tribe/agents/warchief.md`,
  `plugins/tribe/agents/skinner.md`, `plugins/tribe/evals/evals.json`,
  `plugins/tribe/scripts/tests/test-dual-skinner-cell.sh`. Nothing else.
- **Proof mechanism.** The repo has no CI and no unit-test framework. Its proofs are (a) bash
  fixture tests under `plugins/tribe/scripts/tests/`, run directly, and (b) behavioral evals in
  `plugins/tribe/evals/evals.json`. Every task below is red→green against the new bash test
  `test-dual-skinner-cell.sh`; the evals are the behavioral backstop added in Task 4.
- **Regression guard, run at the end of every task:** the two existing script tests must stay green.

```bash
bash plugins/tribe/scripts/tests/test-validate-plan.sh && bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: both scripts print their `ok -` lines and end with `N passed, 0 failed`, exit 0.

## Sequencing

Four tasks, strictly sequential — Tasks 1, 3 and 4 all touch `warchief.md` or files the earlier
tasks create, so there is **one wave, one worktree, one Hunter at a time**. No sub-plan splitting.

| Task | Touches | Deliverable |
|---|---|---|
| 1 | new `test-dual-skinner-cell.sh`, `warchief.md` step 6 | The four laws: concurrent dispatch, isolation, merge, both-must-PASS |
| 2 | `test-dual-skinner-cell.sh`, `skinner.md` | The reciprocal independence invariant |
| 3 | `test-dual-skinner-cell.sh`, `warchief.md` (7 singular-Skinner references) | Consistency sweep |
| 4 | `evals.json` | Three behavioral evals |

---

### Task 1: Dual dispatch, isolation, merge and verdict — rewrite Warchief step 6

The core of the card. Create the contract test, watch it fail against today's single-Skinner step 6,
then rewrite step 6 to green it.

- [ ] **Step 1: Write the failing test**

Create `plugins/tribe/scripts/tests/test-dual-skinner-cell.sh`. It extracts the step 6 section from
`warchief.md` and asserts each of the four laws is present, and that the old single-Skinner dispatch
line is gone. Style follows the existing `test-validate-plan.sh` harness (`ok -` / `not ok -`
lines, a pass/fail tally, non-zero exit on failure).

```bash
cat > plugins/tribe/scripts/tests/test-dual-skinner-cell.sh <<'SH'
#!/usr/bin/env bash
# test-dual-skinner-cell.sh — contract tripwire for the dual-Skinner audit cell (idea 01).
#
# This is a TRIPWIRE, not a behavior test: it proves the four laws of the cell are WRITTEN into
# the agent prompts, and fails loudly if a later edit deletes one. Behavior is proved by the
# evals in plugins/tribe/evals/evals.json. Offline, no network.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$HERE/../../agents"
WARCHIEF="$AGENTS/warchief.md"
SKINNER="$AGENTS/skinner.md"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

# Agent prompts are hard-wrapped prose, so a sentence routinely straddles a newline. grep is
# line-based and would miss it. Flatten every haystack to one whitespace-normalized line first:
# assertions then match meaning, not line-breaking accidents.
flat() { tr '\n' ' ' | tr -s ' '; }

has() { # has NAME HAYSTACK REGEX — the (flattened) text must contain the regex
  if grep -qiE "$3" <<<"$2"; then ok "$1"; else bad "$1 (missing: $3)"; fi
}
hasnt() { # hasnt NAME HAYSTACK REGEX — the (flattened) text must NOT contain the regex
  if grep -qiE "$3" <<<"$2"; then bad "$1 (found what must be gone: $3)"; else ok "$1"; fi
}

[[ -f "$WARCHIEF" ]] || { printf 'not ok - warchief.md not found\n'; exit 1; }
[[ -f "$SKINNER" ]]  || { printf 'not ok - skinner.md not found\n'; exit 1; }

# The step 6 section only: from its heading up to the step 7 heading, flattened.
STEP6="$(awk '/^### 6\./{f=1} /^### 7\./{f=0} f' "$WARCHIEF" | flat)"
[[ -n "$STEP6" ]] || { printf 'not ok - could not extract step 6 from warchief.md\n'; exit 1; }

# Law 1 — two Skinners, dispatched concurrently in ONE message, on an identical brief.
has   "law1: step 6 audits with two Skinners"        "$STEP6" 'two[[:space:]]+(independent[[:space:]]+)?skinners?'
has   "law1: both dispatched in the same message"    "$STEP6" 'two tool uses in the same message'
has   "law1: both get the identical brief"           "$STEP6" 'identical brief'
hasnt "law1: the single-Skinner dispatch line is gone" "$STEP6" 'dispatch the \*\*skinner\*\* against the diff'

# Law 2 — isolation: neither reviewer sees the other; sequential dispatch is the violation.
has   "law2: sequential dispatch is forbidden"       "$STEP6" 'sequential dispatch'
has   "law2: a fix round re-dispatches fresh instances" "$STEP6" 'two fresh'
has   "law2: never reuse a Skinner across rounds"    "$STEP6" 'never reuse'

# Law 3 — the Warchief merges: union of findings, tagged by agreement, both reports kept verbatim.
has   "law3: findings are merged as a union"         "$STEP6" 'union'
has   "law3: agreement tag for both-flagged findings" "$STEP6" '\[both\]'
has   "law3: agreement tag for single-flagged findings" "$STEP6" '\[one\]'
has   "law3: both reports preserved verbatim"        "$STEP6" 'both reports verbatim'

# Law 4 — PASS requires BOTH; the 3-round cap survives; escalation carries both reports.
has   "law4: the round passes only if both pass"     "$STEP6" 'passes only if both skinners return'
has   "law4: un-auditable from either is a fail"     "$STEP6" 'un-auditable'
has   "law4: the 3-round fix cap is unchanged"       "$STEP6" 'cap fix-rounds at 3'
has   "law4: escalation attaches both reports"       "$STEP6" 'both round-3 fail reports'

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
exit $((FAIL > 0))
SH
chmod +x plugins/tribe/scripts/tests/test-dual-skinner-cell.sh
bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh
```

Expected (RED): exactly `1 passed, 14 failed`, exit 1. The one passing assertion is
`law4: the 3-round fix cap is unchanged` — today's step 6 already carries "cap fix-rounds at 3",
and this card deliberately keeps it. Everything else fails: the four laws are absent, and the
`hasnt` check correctly reports still finding the old "dispatch the **skinner** against the diff"
line.

- [ ] **Step 2: Rewrite step 6 to green the test**

In `plugins/tribe/agents/warchief.md`, replace the whole of step 6 — the heading at line 441 and the
paragraph beneath it, i.e. this exact current text:

```markdown
### 6. Audit every deliverable with the skinner

After each task (and once more across the whole branch at the end), dispatch the
**skinner** against the diff, pointed at YOUR spec + plan and the repo's rules. It
runs the proof. Feed Critical/Important findings back to a fixer Hunter and re-audit — **cap
fix-rounds at 3.** If round 3 still comes back FAIL, **stop looping** (do not dispatch a 4th fix
attempt): save state and return `NEEDS_DIRECTION` to the Shaman with the Skinner's round-3 FAIL
report attached **verbatim**. A FAIL that survives 3 fix rounds usually isn't a code bug you can
fix alone — e.g. a spec ambiguity masquerading as a test failure — so it belongs back with the
Shaman, not another round (same shape as `check-diff-coverage`'s remediation loop: a fixed round
cap, then stop and hand back rather than grind past the stopping condition). You have the
authoring context, so you adjudicate any finding that conflicts with what the plan mandated — a
genuine plan-vs-card conflict goes up as `NEEDS_DIRECTION` immediately, without waiting for 3
rounds.
```

with this exact new text:

```markdown
### 6. Audit every deliverable with the dual-Skinner cell

After each task (and once more across the whole branch at the end), audit the diff with **two
Skinners, not one**. A single reviewer is a single sampling run with a single set of blind spots;
two independent reviewers miss the same bug only when they both miss it. This gate is the tribe's
whole claim to correctness, so it runs as a pair.

**Law 1 — dispatch both in ONE message.** Issue **two `skinner` dispatches as two tool uses in the
same message**, so they run concurrently. Both are `subagent_type: skinner`, `model: sonnet`. Both
receive the **identical brief**: the contract (YOUR spec + plan), the diff under audit, the repo's
rules, and a distinct report path each (e.g. an `-a` and a `-b` audit report for this task).
Identical on purpose — the pair decorrelates through sampling, not through assigned lenses. Do not
hand them different lenses, different inputs, or different instructions.

**Law 2 — never let them see each other.** Neither Skinner's brief may contain the other's
findings, verdict, or report — and since dispatching one after the other means you have already
read the first report before briefing the second, **sequential dispatch is itself the violation**.
Never ask one Skinner to review, reconcile, or comment on the other's findings. Every fix round
dispatches **two fresh** Skinner instances; **never reuse** one across rounds, or it anchors on its
own prior findings. Independence is the entire value of the second reviewer: two reviewers sharing a
context share one set of blind spots — you would have paid for two and bought one.

**Law 3 — you merge, at the layer above.** Take the **union** of both reports' Critical and
Important findings, collapsing two findings that name the same location and make the same claim
into one entry. Tag every merged finding **`[both]`** (both Skinners flagged it) or **`[one]`**
(only one did), and pass those tags into the fixer Hunter's brief. Keep **both reports verbatim**
in your report file — never summarize them away: they are the evidence trail, and on escalation
they are what the Shaman reads.

**Law 4 — PASS needs BOTH.** The round **passes only if both Skinners return `AUDIT: PASS`**. Any
FAIL — or an `UN-AUDITABLE` result — from either instance fails the round and opens a fix round. With two reviewers there is no majority to take, and one more cheap fix round always beats
one shipped bug that nobody will re-read. Feed the merged findings to a fixer Hunter and re-audit —
**cap fix-rounds at 3** (a round is both Skinners re-dispatched in parallel). If round 3 still comes
back FAIL, **stop looping** (do not dispatch a 4th fix attempt): save state and return
`NEEDS_DIRECTION` to the Shaman with **both round-3 FAIL reports** attached **verbatim**. A FAIL
that survives 3 fix rounds usually isn't a code bug you can fix alone — e.g. a spec ambiguity
masquerading as a test failure — so it belongs back with the Shaman, not another round (same shape
as `check-diff-coverage`'s remediation loop: a fixed round cap, then stop and hand back rather than
grind past the stopping condition).

You hold the authoring context, so you adjudicate any finding that conflicts with what the plan
mandated — including a head-on conflict where the two Skinners demand opposite changes. A genuine
plan-vs-card conflict goes up as `NEEDS_DIRECTION` immediately, without waiting for 3 rounds.
```

- [ ] **Step 3: Verify GREEN plus the regression guard**

```bash
bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh
bash plugins/tribe/scripts/tests/test-validate-plan.sh
bash plugins/tribe/scripts/tests/test-resume-check.sh
git diff --stat
```

Expected: `test-dual-skinner-cell.sh` prints `15 passed, 0 failed` and exits 0; the two existing
test scripts still end in `0 failed`; `git diff --stat` shows exactly two paths changed —
`plugins/tribe/agents/warchief.md` and the new
`plugins/tribe/scripts/tests/test-dual-skinner-cell.sh`. No other file is touched.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/test-dual-skinner-cell.sh \
        docs/tribe/planning/idea-01-dual-skinner-cell/plan.md
git commit -m "feat(tribe): dual-Skinner audit cell — two independent reviewers, merged by the Warchief" \
           -m $'Tribe-Card: idea-01-dual-skinner-cell\nTribe-Task: 1/4'
```

Expected: one commit whose trailers both appear under
`git log -1 --format='%(trailers:key=Tribe-Card)%(trailers:key=Tribe-Task)'`, and whose diff
includes this plan file with Task 1's four checkboxes ticked.

---

### Task 2: The reciprocal independence invariant in skinner.md

The Warchief is now forbidden from leaking one reviewer's findings to the other. Close the loop from
the other side: the Skinner itself must refuse to seek or accept a peer's findings.

- [ ] **Step 1: Write the failing test**

Append the skinner-side assertions to the test file, just above its final tally:

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("plugins/tribe/scripts/tests/test-dual-skinner-cell.sh")
text = p.read_text()
block = '''
# Skinner-side reciprocal invariant — it must know it is one of two, and refuse the peer's findings.
SKIN="$(flat <"$SKINNER")"
has "skinner: knows it is one of two independent reviewers" "$SKIN" 'one of two independent reviewers'
has "skinner: never seeks or accepts the peer findings"     "$SKIN" 'never seek'
has "skinner: reports only what it independently derived"   "$SKIN" 'independently derived'
'''
anchor = "\nprintf '\\n%d passed, %d failed\\n'"
assert anchor in text, "tally anchor not found"
p.write_text(text.replace(anchor, block + anchor, 1))
print("appended skinner assertions")
PY
bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh
```

Expected (RED): the three new `skinner:` assertions fail — `skinner.md` says nothing about a peer
reviewer today. The tally reads `15 passed, 3 failed` and the script exits 1.

- [ ] **Step 2: Add the invariant to the Skinner's Operating rules**

In `plugins/tribe/agents/skinner.md`, in the `## Operating rules` list (which today ends at line 59
with the "Be precise and unsparing" bullet), append one new bullet as the last item of that list:

```markdown
- **You are one of two independent reviewers.** The caller dispatches two Skinners on the same diff,
  concurrently, and merges the findings itself, one layer above you. You must **never seek** out,
  request, or accept the other reviewer's findings — not from the caller, and not by reading a
  sibling audit report you happen to find on disk. Build your understanding from the contract, the
  diff, and the proof you run yourself, and report only what you **independently derived**. Your
  independence is the whole reason a second reviewer is worth dispatching: two reviewers that share
  a line of reasoning share one blind spot, and the pair collapses into a single, more expensive
  reviewer.
```

- [ ] **Step 3: Verify GREEN plus the regression guard**

```bash
bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh
bash plugins/tribe/scripts/tests/test-validate-plan.sh
bash plugins/tribe/scripts/tests/test-resume-check.sh
git diff --stat
```

Expected: `18 passed, 0 failed`, exit 0; both existing test scripts still `0 failed`; the diff
touches only `plugins/tribe/agents/skinner.md` and the test script. The Skinner's report format,
PASS/FAIL criteria and `model: sonnet` tier are untouched — confirm with
`git diff plugins/tribe/agents/skinner.md`, which must show a pure addition of one bullet.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/skinner.md plugins/tribe/scripts/tests/test-dual-skinner-cell.sh \
        docs/tribe/planning/idea-01-dual-skinner-cell/plan.md
git commit -m "feat(tribe): Skinner refuses its peer reviewer's findings — independence invariant" \
           -m $'Tribe-Card: idea-01-dual-skinner-cell\nTribe-Task: 2/4'
```

Expected: one commit carrying both trailers, with Task 2's checkboxes ticked in the same commit.

---

### Task 3: Consistency sweep — every passage that still says "the skinner", singular

Step 6 now describes a pair, but **seven** other passages in `warchief.md` still speak of one
Skinner — including the YAML `description:` frontmatter, which is the text Claude Code itself reads
to decide when and how to invoke this agent. A prompt that contradicts itself is a prompt the model
resolves arbitrarily, so every one of them is assertion-covered here, not eyeballed.

- [ ] **Step 1: Write the failing test**

Append the consistency assertions to the test file, above the tally. The patterns use `.` wildcards
where the target text contains an apostrophe, so no quoting games are needed:

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("plugins/tribe/scripts/tests/test-dual-skinner-cell.sh")
text = p.read_text()
block = '''
# Consistency — no passage anywhere in warchief.md may still describe a single-Skinner audit.
WAR="$(flat <"$WARCHIEF")"
has   "consistency: frontmatter description audits with two Skinners" "$WAR" 'audits every deliverable with \\*\\*two independent skinners\\*\\*'
has   "consistency: header line audits with two Skinners"   "$WAR" 'you audit the result with \\*\\*two independent skinners\\*\\*'
has   "consistency: anti-goal 4 audits with two Skinners"   "$WAR" 'audited by \\*\\*two independent skinners\\*\\*'
has   "consistency: anti-goal 4 escalates with both reports" "$WAR" 'both skinners.{0,3} last fail reports'
has   "consistency: dispatch contract names the Skinner pair" "$WAR" 'audit its diff with the \\*\\*skinner\\*\\* pair'
has   "consistency: wave-failure text carries both reports" "$WAR" 'both skinners.{0,3} round-3 fail'
has   "consistency: step 5 model note names the Skinner pair" "$WAR" 'stays on the \\*\\*skinner\\*\\* pair'
has   "consistency: final report cites both Skinners"       "$WAR" 'audited pass against the spec by both skinners'
hasnt "consistency: no lone-Skinner audit claim survives"   "$WAR" 'spec by the skinner'
hasnt "consistency: no lone-Skinner escalation survives"    "$WAR" 'attach the skinner'
'''
anchor = "\nprintf '\\n%d passed, %d failed\\n'"
assert anchor in text, "tally anchor not found"
p.write_text(text.replace(anchor, block + anchor, 1))
print("appended consistency assertions")
PY
bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh
```

Expected (RED): all ten new `consistency:` assertions fail — the eight `has` patterns are absent,
and the two `hasnt` patterns are still present in today's text. Tally `18 passed, 10 failed`, exit 1.

- [ ] **Step 2: Update all seven passages**

Apply these seven exact replacements in `plugins/tribe/agents/warchief.md`. Each `old` string below
is verbatim from the current file; each `new` string keeps the surrounding line-wrapping intact.

1. **YAML frontmatter `description:`, line 9** (this is the text Claude Code reads to route work to
   this agent, so it must not still advertise a single reviewer) — old:

```markdown
  (implementer subagent) per task, audits every deliverable with the **skinner** by
```

   new:

```markdown
  (implementer subagent) per task, audits every deliverable with **two independent skinners** by
```

2. **Header, line 29** — old:

```markdown
**Hunter** to implement each task, you audit the result with the **skinner**, and
```

   new:

```markdown
**Hunter** to implement each task, you audit the result with **two independent skinners**, and
```

3. **Anti-goal 4, lines 240-244** — old:

```markdown
4. **Never trust "done".** Every Hunter deliverable is audited by the **skinner**,
   which verifies against YOUR spec/plan and the repo's rules by RUNNING the proof (tests,
   typecheck, lint, build) — not by reading claims. Loop fixes until it returns PASS, **capped at
   3 fix-rounds** — after 3 rounds without a PASS, stop looping and return `NEEDS_DIRECTION` with
   the Skinner's last FAIL report attached verbatim (see Method step 6).
```

   new:

```markdown
4. **Never trust "done".** Every Hunter deliverable is audited by **two independent skinners**,
   dispatched concurrently and never shown each other's findings, each verifying against YOUR
   spec/plan and the repo's rules by RUNNING the proof (tests, typecheck, lint, build) — not by
   reading claims. The round passes only when BOTH return PASS. Loop fixes until they do, **capped
   at 3 fix-rounds** — after 3 rounds without a PASS, stop looping and return `NEEDS_DIRECTION`
   with both Skinners' last FAIL reports attached verbatim (see Method step 6).
```

4. **Dispatch contract, lines 215-216** — old:

```markdown
  builds exactly that under TDD and reports back to YOU; you audit its diff with the
  `skinner`. The Hunter never contacts the Shaman or the owner — its questions come
```

   new:

```markdown
  builds exactly that under TDD and reports back to YOU; you audit its diff with the **skinner**
  pair. The Hunter never contacts the Shaman or the owner — its questions come
```

5. **Wave-failure text, lines 397-398** — old:

```markdown
     report file which sub-plans passed and which hit the cap (with the Skinner's round-3 FAIL
     report attached verbatim, per step 6), and save state + return `NEEDS_DIRECTION` to the
```

   new:

```markdown
     report file which sub-plans passed and which hit the cap (with both Skinners' round-3 FAIL
     reports attached verbatim, per step 6), and save state + return `NEEDS_DIRECTION` to the
```

6. **Step 5 model note, lines 437-439** — old:

```markdown
  model, each Hunter in its own isolated context — the same anti-self-preferential-bias pattern
  already used for the judgment call in step 6, which stays on the **skinner** (`model:
  sonnet`, unchanged by this).
```

   new:

```markdown
  model, each Hunter in its own isolated context — the same anti-self-preferential-bias pattern
  already used for the judgment call in step 6, which stays on the **skinner** pair (both
  instances `model: sonnet`, unchanged by this).
```

7. **Final report line, 535, plus the `NEEDS_DIRECTION` line at 537-538** — old:

```markdown
- **Audit:** one-line conformance note ("audited PASS against the spec by the skinner")
- **The question** (if `NEEDS_DIRECTION`): context, options, your recommendation — ready for the
  Shaman to rule on. If this `NEEDS_DIRECTION` was triggered by the 3-round audit cap (Method
  step 6), attach the Skinner's round-3 FAIL report **verbatim** instead of summarizing it.
```

   new:

```markdown
- **Audit:** one-line conformance note ("audited PASS against the spec by both skinners")
- **The question** (if `NEEDS_DIRECTION`): context, options, your recommendation — ready for the
  Shaman to rule on. If this `NEEDS_DIRECTION` was triggered by the 3-round audit cap (Method
  step 6), attach both Skinners' round-3 FAIL reports **verbatim** instead of summarizing them.
```

- [ ] **Step 3: Verify GREEN plus the regression guard**

```bash
bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh
bash plugins/tribe/scripts/tests/test-validate-plan.sh
bash plugins/tribe/scripts/tests/test-resume-check.sh
grep -n -i 'skinner' plugins/tribe/agents/warchief.md
```

Expected: `28 passed, 0 failed`, exit 0; both existing scripts `0 failed`. The `grep` is a
belt-and-braces read-through: every remaining mention of the Skinner must describe the pair, or a
single instance *within* the pair — no passage may still imply the audit runs on one reviewer. The
two `hasnt` assertions above already fail the build if either of the two known lone-Skinner claims
survives, so this read-through is a backstop, not the gate.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/test-dual-skinner-cell.sh \
        docs/tribe/planning/idea-01-dual-skinner-cell/plan.md
git commit -m "fix(tribe): warchief speaks of the Skinner pair consistently, not a lone reviewer" \
           -m $'Tribe-Card: idea-01-dual-skinner-cell\nTribe-Task: 3/4'
```

Expected: one commit carrying both trailers, Task 3's checkboxes ticked in the same commit.

---

### Task 4: Behavioral evals — prove the cell behaves, not just that it is written

The bash test is a tripwire on the prompt text. These three evals are the behavioral backstop: each
puts a Warchief in a situation where a fake cell and a real one diverge.

- [ ] **Step 1: Write the failing test**

Add three evals to `plugins/tribe/evals/evals.json` (existing schema: `id`, `name`, `agent`,
`prompt`, `expected_output`, `files`; the file currently holds 9 evals, so the new ids are 10-12).
The "failing test" here is the JSON validity + shape check, which fails until the entries exist:

```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path("plugins/tribe/evals/evals.json")
d = json.loads(p.read_text())
ids = {e["id"] for e in d["evals"]}
missing = [i for i in (10, 11, 12) if i not in ids]
print("missing eval ids:", missing)
raise SystemExit(1 if missing else 0)
PY
```

Expected (RED): prints `missing eval ids: [10, 11, 12]` and exits 1.

- [ ] **Step 2: Add the three evals**

Append these three objects to the `evals` array in `plugins/tribe/evals/evals.json`, preserving the
file's 2-space indentation:

```json
{
  "id": 10,
  "name": "warchief-dispatches-two-skinners-concurrently-in-one-message",
  "agent": "warchief",
  "prompt": "Your Hunter has just reported task 2/3 done on branch feat/x: it added a retry wrapper in src/http/client.ts and a test. Your spec is at docs/specs/x.md and your plan at docs/plans/x.md. Audit the task deliverable now, per your Method step 6. Report-file path: /tmp/warchief-report.md.",
  "expected_output": "Warchief dispatches TWO skinner subagents for this one audit, and issues both dispatches as two tool uses in a SINGLE message so they run concurrently — not one Skinner, and not two dispatched one-after-the-other. Both briefs are identical (same spec + plan + diff + repo rules, differing only in the report path) — it does NOT assign the two reviewers different lenses or different inputs. It does not write or fix the code itself.",
  "files": []
},
{
  "id": 11,
  "name": "warchief-fails-the-round-when-only-one-skinner-passes",
  "agent": "warchief",
  "prompt": "You audited task 1/2 with two Skinners. Skinner A returned 'AUDIT: PASS — tests exit 0, 6/6 requirements evidenced'. Skinner B returned 'AUDIT: FAIL — the retry wrapper swallows the 429 response body, so the caller cannot read Retry-After (src/http/client.ts:41); requirement R3 unevidenced'. Fix-round count so far: 0. What do you do next? Report-file path: /tmp/warchief-report.md.",
  "expected_output": "Warchief treats the round as FAILED, because PASS requires BOTH Skinners to pass — it does NOT take the majority, average the verdicts, pick the more convincing report, or ship on A's PASS. It opens a fix round: dispatches a fixer hunter subagent with the merged findings (B's finding included, tagged as flagged by one reviewer), then re-audits with two FRESH Skinners in parallel. It keeps both reports verbatim in the report file. It does not merge, and does not declare the task done.",
  "files": []
},
{
  "id": 12,
  "name": "warchief-never-leaks-one-skinners-findings-to-the-other",
  "agent": "warchief",
  "prompt": "You are auditing a task with two Skinners. Skinner A came back first with a Critical finding at src/db/pool.ts:88 (connection never released on the error path). Skinner B has not been dispatched yet. To save time and get a sharper second opinion, you consider dispatching Skinner B with A's report attached so B can confirm or refute A's finding. Do that now, or explain what you do instead. Report-file path: /tmp/warchief-report.md.",
  "expected_output": "Warchief REFUSES to attach Skinner A's report (or any summary of A's findings) to Skinner B's brief, and names the reason: independence is what makes the second reviewer worth anything — B would anchor on A's location and conform to A's claim, collapsing two reviewers into one. It also recognizes that this situation should not arise, because both Skinners must be dispatched in the SAME message (sequential dispatch is itself the violation). It re-dispatches the pair concurrently with identical, isolated briefs, and merges the findings itself at the layer above. It does NOT ask one Skinner to review, reconcile with, or comment on the other's findings.",
  "files": []
}
```

- [ ] **Step 3: Verify GREEN plus the regression guard**

```bash
python3 - <<'PY'
import json, pathlib
d = json.loads(pathlib.Path("plugins/tribe/evals/evals.json").read_text())
ids = [e["id"] for e in d["evals"]]
keys = {k for e in d["evals"] for k in e}
assert len(ids) == len(set(ids)), f"duplicate eval ids: {ids}"
assert {10, 11, 12} <= set(ids), f"new evals missing: {ids}"
assert keys == {"id", "name", "agent", "prompt", "expected_output", "files"}, keys
print(f"evals.json valid — {len(ids)} evals, ids {ids}")
PY
bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh
bash plugins/tribe/scripts/tests/test-validate-plan.sh
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: the python check prints `evals.json valid — 12 evals, ids [1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
11, 12]` and exits 0; all three bash test scripts end with `0 failed`. Running the behavioral evals
themselves (`python3 scripts/evals/run_evals.py`, per that harness's README) is the Warchief's
evidence step, not a task gate — it costs model calls, so it runs once, at branch level, before the
PR.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/evals/evals.json docs/tribe/planning/idea-01-dual-skinner-cell/plan.md
git commit -m "test(tribe): evals for concurrent dual-Skinner dispatch, split-verdict, and no cross-leakage" \
           -m $'Tribe-Card: idea-01-dual-skinner-cell\nTribe-Task: 4/4'
```

Expected: one commit carrying both trailers, Task 4's checkboxes ticked in the same commit.

---

## Definition of done for the implementing campaign

1. All four tasks committed, each with its `Tribe-Card` and `Tribe-Task` trailers.
2. `bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh` → `28 passed, 0 failed`.
3. The two pre-existing script tests still green.
4. `python3 scripts/evals/run_evals.py` run once at branch level; evals 10-12 pass, and the 9
   pre-existing evals do not regress.
5. Branch-level audit by the Skinner (which, once this lands, is itself a pair) against this plan
   and the spec: PASS.
6. Evidence in the PR body: the before/after of step 6 side by side, the red→green terminal output
   of the new test script, and the eval results.
7. PR squash-merged into `master`. The repo has **no CI** (`.github/` does not exist) — the
   Warchief's step 7 `exit 2` path applies: record "no CI registered in this repo" explicitly in
   the PR and report rather than treating an empty run list as green.
