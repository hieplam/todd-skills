# Plan — Idea 05: fixer adjudication (reproduce-first mandate)

**Spec:** `docs/tribe/planning/idea-05-fixer-adjudication/spec.md` (read it first — it is the
contract this plan implements).
**Card:** `idea-05-fixer-adjudication`.
**What this plan is for:** a *future* implementation campaign. The planning campaign that authored it
applied none of these edits.

**The change in one line:** a Skinner *verdict* stays authoritative, but a Skinner *finding* becomes a
hypothesis the fixer Hunter must **reproduce before it may fix it** — and a finding it cannot
reproduce comes back as `NOT_REPRODUCED` plus a committed falsification test, which the next Skinner
round runs and settles.

---

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **TDD, per task.** Every task writes its slice of the mechanical conformance test FIRST, runs it,
  watches it fail for the right reason, then makes the prompt edit that turns it green. Prompt files
  have no runtime, so this grep-level suite is the proof — treat a red `not ok` line exactly as you
  would a failing unit test.
- **Every task ends green.** After each task, `bash plugins/tribe/scripts/tests/test-fixer-mandate.sh`
  exits 0, and both existing suites (`test-validate-plan.sh`, `test-resume-check.sh`) still exit 0.
- **Tasks are sequential.** Tasks 2 and 3 both edit `plugins/tribe/agents/warchief.md` and all four
  edit the same test file: one sub-plan, one worktree, one Hunter at a time. No concurrent wave.
- **Do not touch `plugins/tribe/agents/skinner.md`.** The referee's behavior is already sufficient
  (it runs the proof, it self-refutes, it hunts hollow tests) and that file belongs to other cards.
- **Every commit carries the trailers** `Tribe-Card: idea-05-fixer-adjudication` and
  `Tribe-Task: N/4`, both keys in the commit message's ONE final paragraph. No co-authored trailer.
- **Insert, do not rewrite.** Each edit is additive at a named anchor. Do not reflow, reorder, or
  "improve" surrounding prompt text — an unrelated diff in an agent charter is scope creep and the
  audit rejects it.

## Files touched (the whole blast radius)

| File | Task | Change |
| --- | --- | --- |
| `plugins/tribe/scripts/tests/test-fixer-mandate.sh` | 1, 2, 3, 4 | new mechanical conformance suite; each task appends its own assertion group |
| `plugins/tribe/agents/hunter.md` | 1 | new "Fixer mode" section, RED-rule carve-out, one anti-goal |
| `plugins/tribe/agents/warchief.md` | 2 | step 6: the fixer-brief template + disposition ledger |
| `plugins/tribe/agents/warchief.md` | 3 | step 6: the standoff rule + immediate escalation |
| `plugins/tribe/README.md` | 4 | one clarifying clause: verdict vs. finding |
| `plugins/tribe/claude-md/review-agents.md` | 4 | the same clause, kept in sync |

---

### Task 1: Fixer-mode charter in `hunter.md` (the authority to not fix)

**Why this task exists:** the fixer is a Hunter, and the Hunter's charter reads a brief as orders —
"Build **only** what the brief specifies" (`hunter.md:47`). Permission to decline a false claim cannot
be granted by the brief alone; it has to live in the charter, next to the rules it excepts. This task
also fixes the sharpest edge: `hunter.md:70-73` tells a Hunter that a test which passes immediately is
a *broken test* — which is exactly the instruction that turns an honest non-reproduction into a
fabricated confirmation.

- [x] **Step 1: Write the failing test (group A)**

Create `plugins/tribe/scripts/tests/test-fixer-mandate.sh` with the harness plus the hunter.md
assertions:

```bash
#!/usr/bin/env bash
# test-fixer-mandate.sh — conformance tests for the fixer's reproduce-first mandate (idea 05).
# Prompt files have no runtime, so the proof is mechanical: assert that the invariants which make
# the mandate real still exist in the prompt text. A careless future edit deletes them silently;
# this suite is what makes that deletion loud.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TRIBE="$(cd "$HERE/../.." && pwd)"          # plugins/tribe
HUNTER="$TRIBE/agents/hunter.md"
WARCHIEF="$TRIBE/agents/warchief.md"
README="$TRIBE/README.md"
REVIEW_DOC="$TRIBE/claude-md/review-agents.md"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
has()   { if grep -qiF -- "$2" "$1"; then ok "$3"; else bad "$3"; fi; }   # has FILE STRING NAME
lacks() { if grep -qiE -- "$2" "$1"; then bad "$3"; else ok "$3"; fi; }   # lacks FILE REGEX NAME

# --- group A: hunter.md carries the fixer-mode charter -------------------------------
has "$HUNTER" "Fixer mode" "hunter: has a Fixer mode section"
has "$HUNTER" "hypothesis, not an order" "hunter: a finding is a hypothesis, not an order"
has "$HUNTER" "FIXED" "hunter: disposition FIXED"
has "$HUNTER" "NOT_REPRODUCED" "hunter: disposition NOT_REPRODUCED"
has "$HUNTER" "ESCALATED" "hunter: disposition ESCALATED"
has "$HUNTER" "falsification test" "hunter: defines the falsification test"
has "$HUNTER" "RED-rule carve-out" "hunter: carve-out to the immediate-pass RED rule"
has "$HUNTER" "that green IS the result" "hunter: a green falsification test is a result, not a bug"
has "$HUNTER" "No blind fixing" "hunter: blind fixing is an anti-goal"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
exit $((FAIL > 0))
```

Make it executable and run it:

```bash
chmod +x plugins/tribe/scripts/tests/test-fixer-mandate.sh
bash plugins/tribe/scripts/tests/test-fixer-mandate.sh; echo "exit=$?"
```

Expected output — RED, and red for the right reason (the charter genuinely does not exist yet):

```text
not ok - hunter: has a Fixer mode section
not ok - hunter: a finding is a hypothesis, not an order
not ok - hunter: disposition NOT_REPRODUCED
(9 assertions, all failing except the incidental FIXED/ESCALATED word matches)

0 passed, 9 failed
exit=1
```

- [x] **Step 2: Add the Fixer-mode section to `hunter.md`**

In `plugins/tribe/agents/hunter.md`, insert the following block **between** the end of the Method
section (the line `---` that closes step 7, immediately before `## Anti-goals`) and the
`## Anti-goals` heading. Insert verbatim; change nothing else in the file:

```markdown
## Fixer mode — when your brief carries Skinner findings instead of a plan task

If your brief is a **FIX brief** — it hands you findings from a Skinner audit rather than a task from
the plan — everything above still holds, plus one rule that overrides how you would otherwise read a
brief:

**Every finding is a hypothesis, not an order.** The Skinner's *verdict* (PASS/FAIL) is authoritative
and gates done-ness. An individual *finding* under that verdict is a **falsifiable claim**, and claims
can be wrong. So: before you change a single line for a finding, **reproduce it** — make the defect it
claims manifest, mechanically. Only a reproduced finding may be fixed. **Fixing blind is a failure,
exactly like writing production code before its failing test** — you would be editing working code to
satisfy a claim nobody ever verified.

**How to reproduce, by what the finding claims:**

| The finding claims | Reproduce it by | `NOT_REPRODUCED` is available only with |
| --- | --- | --- |
| **Behavior is wrong** (wrong value, leak, off-by-one, crash) | writing the test that manifests the defect and watching it **fail RED** | a **falsification test** — a real test asserting the behavior the finding calls broken — that **passes green** on the current code, committed to the branch |
| **A rule / static violation** (governance rule, missing trailer, lint) | running the deterministic command (grep, lint, typecheck, `git log`) that **shows** the violation | that same command, run and transcribed into your report, showing the violation **absent** |
| **Something is missing** (no test for requirement N, an unmet Definition-of-Done item, "unverified") | running the named check — **the absence IS the reproduction** | citing, at `file:line`, the artifact the Skinner missed. If you cannot cite it, the finding is TRUE and you fix it. "I could not write a failing test" is **never** grounds for `NOT_REPRODUCED` on a missing-thing finding |

**RED-rule carve-out — the one exception to Method step 2.** Step 2 says a test that passes
immediately is a broken test. That rule is about *building*. In fixer mode, a falsification test that
passes immediately is **not** broken: **that green IS the result** — it is the evidence that the
claimed defect does not exist. Do not bend the test until it goes red. Report it green, and keep it in
the suite: it is now a regression test for the behavior a reviewer doubted.

**Report exactly one disposition per finding ID** — this ledger is what the Warchief expects back:

- **`FIXED`** — reproduced (a RED test, or a command showing the violation), then fixed. The
  reproduction artifact and the fix land in the **same commit**.
- **`NOT_REPRODUCED`** — you built the reproduction and the defect did not manifest. **A committed
  artifact or a transcribed command is mandatory.** A bare "I read it and it looks fine" is not a
  disposition: the Warchief rejects the report and re-dispatches.
- **`ESCALATED`** — the finding is not a code defect at all: it exposes a spec/plan ambiguity, or it
  demands the opposite of what your brief mandates. Stop and report `NEEDS_CONTEXT`. You never
  adjudicate product questions.

You are not arguing with the Skinner, and you never re-audit yourself. You hand back evidence; the
Skinner's next round is the referee.

---
```

Then add a seventh anti-goal at the end of the `## Anti-goals` list:

```markdown
7. **No blind fixing.** In fixer mode, changing code for a finding you never reproduced is a failure —
   even when the Skinner marked it Critical. Reproduce it, or report `NOT_REPRODUCED` with evidence.
```

- [x] **Step 3: Green**

```bash
bash plugins/tribe/scripts/tests/test-fixer-mandate.sh; echo "exit=$?"
bash plugins/tribe/scripts/tests/test-validate-plan.sh >/dev/null && echo "validate-plan suite ok"
```

Expected output:

```text
ok - hunter: has a Fixer mode section
ok - hunter: a finding is a hypothesis, not an order
ok - hunter: disposition FIXED
ok - hunter: disposition NOT_REPRODUCED
ok - hunter: disposition ESCALATED
ok - hunter: defines the falsification test
ok - hunter: carve-out to the immediate-pass RED rule
ok - hunter: a green falsification test is a result, not a bug
ok - hunter: blind fixing is an anti-goal

9 passed, 0 failed
exit=0
validate-plan suite ok
```

- [x] **Step 4: Commit**

```bash
git add plugins/tribe/agents/hunter.md plugins/tribe/scripts/tests/test-fixer-mandate.sh docs/tribe/planning/idea-05-fixer-adjudication/plan.md
git commit -m "feat(tribe): fixer-mode charter — a finding is a hypothesis, reproduce before fixing" \
  -m $'Tribe-Card: idea-05-fixer-adjudication\nTribe-Task: 1/4'
```

(The `git add` includes this plan file because your task's checkboxes above must be ticked in the
same commit as the code — the tribe's atomic done-record rule.)

---

### Task 2: The fixer-brief template + disposition ledger in `warchief.md` step 6

**Why this task exists:** step 6 today is one sentence — "Feed Critical/Important findings back to a
fixer Hunter and re-audit" (`warchief.md:445-446`). There is no brief template, so findings arrive as
bare orders with no identity. Without a **stable finding ID**, the Warchief cannot recognise the same
finding re-raised in a later round, and Task 3's loop termination would be a judgment call instead of
a mechanical rule.

- [x] **Step 1: Write the failing test (group B)**

Append to `plugins/tribe/scripts/tests/test-fixer-mandate.sh`, immediately **before** the final
`printf`/`exit` lines:

```bash
# --- group B: warchief.md step 6 carries the fixer-brief template ---------------------
has "$WARCHIEF" "The fixer brief" "warchief: has a fixer-brief template"
has "$WARCHIEF" "stable ID" "warchief: assigns each finding a stable ID"
has "$WARCHIEF" "finding key" "warchief: records a finding key for cross-round identity"
has "$WARCHIEF" "Reproduce it before you fix it" "warchief: brief carries the mandate verbatim"
has "$WARCHIEF" "disposition ledger" "warchief: requires a disposition ledger back"
has "$WARCHIEF" "Never send the fixer's report to the Skinner" "warchief: seals the reviewer's context"
```

Run it:

```bash
bash plugins/tribe/scripts/tests/test-fixer-mandate.sh; echo "exit=$?"
```

Expected output — group A green, group B RED:

```text
9 ok lines from group A, then:
not ok - warchief: has a fixer-brief template
not ok - warchief: assigns each finding a stable ID
not ok - warchief: records a finding key for cross-round identity
not ok - warchief: brief carries the mandate verbatim
not ok - warchief: requires a disposition ledger back
not ok - warchief: seals the reviewer's context

9 passed, 6 failed
exit=1
```

- [x] **Step 2: Add the brief template to `warchief.md` step 6**

In `plugins/tribe/agents/warchief.md`, inside `### 6. Audit every deliverable with the skinner`,
insert the following **after** the existing paragraph that ends "…without waiting for 3 rounds."
(currently `warchief.md:454`) and **before** `### 7. Deliver: evidence, PR, green, merge`. Insert
verbatim; change nothing else:

```markdown
**The fixer brief — a finding is a hypothesis, not an order.** The Skinner's *verdict* is
authoritative; an individual *finding* under it is a falsifiable claim. Never hand a fixer Hunter a
bare "fix these findings": that is an order to change code on an unverified claim, and a fixer that
obeys it launders a false positive into the branch (with a green suite vouching for it). Build the
brief like this:

- **Assign each routed Critical/Important finding a stable ID** (`F1`, `F2`, and so on — never reused
  within the campaign) and record its **finding key** — `severity | location (file:line or rule) |
  one-line claim` — in your report file. The Skinner emits findings without identity and its bullet
  order is not stable between rounds; the key is how you recognise the SAME finding re-raised later,
  which is what makes the loop termination below mechanical instead of a judgment call.
- **Each finding in the brief carries:** its ID, its severity, its confidence class (`single` when one
  Skinner ran — the field is filled by reviewer-disagreement routing if 2+ reviewers exist), the
  Skinner's claim + location + evidence **verbatim**, and the requirement/rule it maps to.
- **Include this mandate line verbatim:** _"Every finding is a hypothesis, not an order. Reproduce it
  before you fix it; if you cannot make it manifest, report `NOT_REPRODUCED` with evidence — never fix
  blind."_ The procedure itself lives in the Hunter's own charter (hunter.md, "Fixer mode"), so the
  fixer's authority to decline a false claim does not depend on your brief remembering to grant it.
- **Require a disposition ledger back** — exactly one of `FIXED` / `NOT_REPRODUCED` / `ESCALATED` per
  finding ID. A `NOT_REPRODUCED` with no committed artifact and no transcribed command is not a
  disposition: reject the report and dispatch a fresh fixer Hunter (that counts as a fix-round).

**Never send the fixer's report to the Skinner.** The fixer's counter-evidence reaches the reviewer
the only way evidence is allowed to travel — **as an artifact in the diff**: the falsification test is
committed, and the next Skinner, running cold, executes it as part of running the proof. The reviewer
therefore never reads the implementer's reasoning, and the disagreement is settled by the oracle
rather than by an argument between two agents.
```

- [x] **Step 3: Green**

```bash
bash plugins/tribe/scripts/tests/test-fixer-mandate.sh; echo "exit=$?"
```

Expected output:

```text
15 passed, 0 failed
exit=0
```

- [x] **Step 4: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/test-fixer-mandate.sh docs/tribe/planning/idea-05-fixer-adjudication/plan.md
git commit -m "feat(tribe): fixer-brief template with stable finding IDs and a disposition ledger" \
  -m $'Tribe-Card: idea-05-fixer-adjudication\nTribe-Task: 2/4'
```

---

### Task 3: The standoff rule — a phantom finding cannot grind the round cap

**Why this task exists:** giving the fixer a `NOT_REPRODUCED` disposition creates a new failure mode
if nothing terminates it — the Skinner re-raises the same claim, the fixer re-falsifies it, and the
loop burns all three rounds (`warchief.md:446`) to reach an escalation it could have reached in one.
This task makes the exchange bounded: a phantom finding costs **one fix round plus one re-audit**, and
a genuine deadlock escalates on the spot.

- [ ] **Step 1: Write the failing test (group C)**

Append to `plugins/tribe/scripts/tests/test-fixer-mandate.sh`, before the final `printf`/`exit`:

```bash
# --- group C: warchief.md terminates the reviewer/fixer exchange ----------------------
has "$WARCHIEF" "standoff" "warchief: names the standoff case"
has "$WARCHIEF" "DROPPED (falsified" "warchief: a non-re-raised finding falls"
has "$WARCHIEF" "with new evidence" "warchief: a refuted falsification sends the finding back"
has "$WARCHIEF" "only ever SHORTENS the loop" "warchief: standoff never extends the 3-round cap"
has "$WARCHIEF" "even with rounds left on the cap" "warchief: standoff escalates immediately"
```

Run it:

```bash
bash plugins/tribe/scripts/tests/test-fixer-mandate.sh; echo "exit=$?"
```

Expected output — groups A and B green, group C RED:

```text
not ok - warchief: names the standoff case
not ok - warchief: a non-re-raised finding falls
not ok - warchief: a refuted falsification sends the finding back
not ok - warchief: standoff never extends the 3-round cap
not ok - warchief: standoff escalates immediately

15 passed, 5 failed
exit=1
```

- [ ] **Step 2: Add the adjudication rules to `warchief.md` step 6**

Insert verbatim, directly **after** the block Task 2 added (still inside step 6, still before
`### 7. Deliver`):

```markdown
**Adjudicate the ledger after each re-audit — a phantom finding must never grind the round cap.** For
each finding the fixer returned as `NOT_REPRODUCED`, exactly one of these three applies:

1. **The Skinner does not re-raise it** → the finding **falls**. Record `DROPPED (falsified, round N)`
   against its ID and move on. The whole cost of that false positive was one test and one round —
   which is the point: you are not making the reviewer right, you are making its wrongness cheap.
2. **The Skinner re-raises it *with new evidence*** that defeats the falsification — it names the
   input, path, or condition the falsification test failed to cover → the finding **stands** and the
   reviewer won the exchange. Send it back to the fixer with that refutation attached; it must now be
   reproduced under the Skinner's stated condition. This is an ordinary fix-round.
3. **The Skinner re-raises it *unchanged*, with no new evidence, leaving the falsification artifact
   unaddressed** → **standoff**. Do NOT spend another round. Return `NEEDS_DIRECTION` to the Shaman
   **immediately — even with rounds left on the cap** — carrying the Skinner's report **verbatim** AND
   the fixer's falsification artifact plus its command output. A reviewer and a fixer deadlocked over
   whether a defect even exists is not a code bug you can grind out; it is usually a contract
   ambiguity wearing a bug costume, and that belongs with the Shaman.

The 3-round cap above is unchanged as the outer bound — the standoff rule **only ever SHORTENS the
loop**, never extends it. And note the correct-but-unfamiliar outcome this creates: a round in which
every routed finding came back `NOT_REPRODUCED` and the next Skinner re-raises none ends in **PASS,
with the branch's code unchanged and new regression tests added**. That is a clean result, not a
suspicious one — do not go hunting for something to change in order to feel like the round did work.
```

- [ ] **Step 3: Green**

```bash
bash plugins/tribe/scripts/tests/test-fixer-mandate.sh; echo "exit=$?"
```

Expected output:

```text
20 passed, 0 failed
exit=0
```

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/test-fixer-mandate.sh docs/tribe/planning/idea-05-fixer-adjudication/plan.md
git commit -m "feat(tribe): standoff rule — a falsified finding escalates instead of grinding the cap" \
  -m $'Tribe-Card: idea-05-fixer-adjudication\nTribe-Task: 3/4'
```

---

### Task 4: Align the doctrine — the *verdict* is authoritative, a *finding* is a claim

**Why this task exists:** `plugins/tribe/README.md:90` and `plugins/tribe/claude-md/review-agents.md:5`
both say the Skinner's ruling is "**authoritative — a `FAIL` must be fixed, never argued away**". That
is true of the verdict and it must stay — but a fixer Hunter reads those files as governance, and
unqualified they say the opposite of Task 1's charter. Two prompt documents disagreeing about whether
a finding is arguable is a coin flip at runtime. This task closes the contradiction and installs a
permanent regression guard against it re-opening.

- [ ] **Step 1: Write the failing test (group D, including the negative assertion)**

Append to `plugins/tribe/scripts/tests/test-fixer-mandate.sh`, before the final `printf`/`exit`:

```bash
# --- group D: doctrine distinguishes the verdict from a finding -----------------------
has "$README" "falsifiable hypothesis" "readme: a finding is a falsifiable hypothesis"
has "$README" "at the **verdict** level" "readme: scopes the authority to the verdict"
has "$REVIEW_DOC" "falsifiable hypothesis" "review-agents: a finding is a falsifiable hypothesis"
has "$REVIEW_DOC" "at the **verdict** level" "review-agents: scopes the authority to the verdict"

# negative assertion — the regression guard. No prompt or doc may call an individual FINDING
# authoritative/unarguable; that phrasing is reserved for the VERDICT.
for f in "$HUNTER" "$WARCHIEF" "$README" "$REVIEW_DOC"; do
  lacks "$f" "finding (is|remains) (authoritative|unarguable)" "no-finding-authority: $(basename "$f")"
done
```

Run it:

```bash
bash plugins/tribe/scripts/tests/test-fixer-mandate.sh; echo "exit=$?"
```

Expected output — the four positive assertions RED, the four negative guards already green:

```text
not ok - readme: a finding is a falsifiable hypothesis
not ok - readme: scopes the authority to the verdict
not ok - review-agents: a finding is a falsifiable hypothesis
not ok - review-agents: scopes the authority to the verdict
ok - no-finding-authority: hunter.md
ok - no-finding-authority: warchief.md
ok - no-finding-authority: README.md
ok - no-finding-authority: review-agents.md

24 passed, 4 failed
exit=1
```

- [ ] **Step 2: Add the clarifying clause to both docs**

In `plugins/tribe/README.md`, at the end of line 90 (the Skinner's "What it actually does" paragraph),
append this sentence — keep the existing sentence exactly as it is:

```markdown
That authority is **at the **verdict** level**: an individual **finding** underneath it is a *falsifiable hypothesis*, not a ruling — the fixer Hunter must **reproduce a finding before it may fix it**, and reports `NOT_REPRODUCED` with evidence when it cannot (see the Hunter's "Fixer mode"). The verdict is the referee; a finding is the claim it referees.
```

In `plugins/tribe/claude-md/review-agents.md`, at the end of line 5 (the Skinner bullet), append the
matching sentence:

```markdown
That authority is **at the **verdict** level**: an individual finding is a *falsifiable hypothesis* — a fixer must reproduce it before fixing, and records `NOT_REPRODUCED` with evidence if it cannot.
```

- [ ] **Step 3: Green — the whole suite, plus the repo's other suites**

```bash
bash plugins/tribe/scripts/tests/test-fixer-mandate.sh; echo "exit=$?"
bash plugins/tribe/scripts/tests/test-validate-plan.sh >/dev/null && echo "validate-plan ok"
bash plugins/tribe/scripts/tests/test-resume-check.sh  >/dev/null && echo "resume-check ok"
```

Expected output:

```text
28 passed, 0 failed
exit=0
validate-plan ok
resume-check ok
```

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/README.md plugins/tribe/claude-md/review-agents.md plugins/tribe/scripts/tests/test-fixer-mandate.sh docs/tribe/planning/idea-05-fixer-adjudication/plan.md
git commit -m "docs(tribe): scope the Skinner's authority to the verdict; a finding is a hypothesis" \
  -m $'Tribe-Card: idea-05-fixer-adjudication\nTribe-Task: 4/4'
```

---

## Evidence to capture before the PR (Warchief, not the Hunter)

The mechanical suite proves the text exists; it does not prove the behavior changed. Capture the
behavioral proof as spec §5 describes, and embed the transcripts in the PR body:

```bash
# BEFORE — today's prompts (master), today's brief shape: dispatch a fixer Hunter with a
# synthetic 2-finding Skinner report (one TRUE off-by-one, one PHANTOM null-deref) against a
# scratch fixture, then look at what it did to the phantom's target file.
git -C /path/to/before-worktree diff --stat -- fixture/

# AFTER — the branch's prompts, same synthetic report, same fixture.
git -C /path/to/after-worktree  diff --stat -- fixture/
```

Expected, and this single contrast IS the card:

```text
BEFORE: fixture/target.ts changed (the phantom finding was "fixed" — working code edited, or a
        test bent, to satisfy a defect that never existed)
AFTER:  fixture/target.ts unchanged; fixture/target.falsification.test.ts added
        ledger: F1 = FIXED (RED proof attached) | F2 = NOT_REPRODUCED (green falsification test)
```

Also capture the loop-termination proof: re-run the AFTER dry-run with a synthetic Skinner that
re-raises the phantom **unchanged** on re-audit, and show the Warchief returning `NEEDS_DIRECTION` at
round 2 rather than grinding to round 3.

## Definition of Done

- [ ] `hunter.md` carries the Fixer-mode charter, the three dispositions, the RED-rule carve-out, and
      the "No blind fixing" anti-goal.
- [ ] `warchief.md` step 6 carries the fixer-brief template (stable finding IDs, the verbatim mandate,
      the disposition ledger) and the standoff rule with its immediate `NEEDS_DIRECTION` escalation.
- [ ] `README.md` and `claude-md/review-agents.md` scope the Skinner's authority to the **verdict**;
      no file calls an individual finding authoritative.
- [ ] `plugins/tribe/agents/skinner.md` is **unchanged** (`git diff --name-only` proves it).
- [ ] `bash plugins/tribe/scripts/tests/test-fixer-mandate.sh` → 28 passed, 0 failed, exit 0; the
      `test-validate-plan.sh` and `test-resume-check.sh` suites still exit 0.
- [ ] Before/after dry-run evidence embedded in the PR; the phantom finding's target file is
      byte-identical in the AFTER run.
- [ ] Four commits, each carrying `Tribe-Card: idea-05-fixer-adjudication` and `Tribe-Task: N/4`; no
      co-authored trailer.
