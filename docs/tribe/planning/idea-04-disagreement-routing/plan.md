# Plan — Idea 04: disagreement routing

**Card:** `idea-04-disagreement-routing`
**Spec:** `docs/tribe/planning/idea-04-disagreement-routing/spec.md` (read it first — it is the
contract this plan implements)
**This plan is for a FUTURE implementation campaign.** The planning campaign that authored it made
zero changes under `plugins/`. Everything below is what a Hunter will apply then, not now.

---

## Global Constraints

**Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
implementer.**

1. **Sequencing — this card lands LAST in the step-6 cluster.** Implementation order is
   `05 → 01/03 → 04`. **Do not run this campaign until ideas 05 and 01 have merged.** Both edit
   `warchief.md` step 6; their `owns_files` overlap with this card's, so they must be sequenced, never
   parallelised. Every task below is written against a step 6 that **already contains** idea 01's
   merge laws (the `[both]`/`[one]` agreement tag) and idea 05's fixer-brief template + disposition
   ledger + standoff rule.
2. **Anchor check before editing (mandatory first action of every task).** Re-read
   `plugins/tribe/agents/warchief.md` step 6 as it actually exists. If the anchor a task names is
   absent — because 01 or 05 shipped with different wording than their specs promised — **stop and
   report `NEEDS_CONTEXT` to the Warchief.** Do not paper over the difference and do not invent an
   anchor. The Warchief amends the brief and dispatches a fresh Hunter.
3. **Files this campaign may touch — nothing else:**
   - `plugins/tribe/agents/warchief.md` (step 6 only)
   - `plugins/tribe/scripts/tests/test-disagreement-routing.sh` (new)
   - `plugins/tribe/evals/evals.json`
4. **Files that are explicitly OFF LIMITS:** `plugins/tribe/agents/skinner.md` and
   `plugins/tribe/agents/hunter.md`. This card is a pure function over the reviewers' **outputs**. It
   does not change what reviewers do, and it does not re-specify the fixer's duties (reproduce-first,
   the disposition vocabulary, the RED-rule carve-out) — those belong to idea 05 and are consumed
   here unchanged. Touching either file is an auto-fail.
5. **TDD, strictly.** Every task: write the test assertions first, run the test, **watch them fail**,
   then make the prompt edit, then watch them pass. A task whose assertions passed before the prompt
   edit is a broken test, not a finished task.
6. **Commit hygiene.** Every commit carries the trailers `Tribe-Card: idea-04-disagreement-routing`
   and `Tribe-Task: N/5` in the final paragraph. Tick this plan's checkboxes in the **same commit** as
   the code. No `Co-authored-by` trailers.
7. **The test file is cumulative.** Task 1 creates it; tasks 2 to 5 append their slice. Every task
   re-runs the whole file and leaves it fully green.

---

## Task 1: The test harness and the three confidence classes

Creates the mechanical conformance test, then teaches step 6 what `agreed`, `single`, and
`conflicting` mean — including the two rules that stop the taxonomy from degenerating.

- [x] **Step 1: Write the test harness with the class assertions (RED)**

Create `plugins/tribe/scripts/tests/test-disagreement-routing.sh`. It greps step 6 of `warchief.md`
for the invariants a careless future edit would silently delete. Harness style follows
`plugins/tribe/scripts/tests/test-validate-plan.sh` (bash, `ok`/`not ok` lines, non-zero exit on any
failure).

```bash
#!/usr/bin/env bash
# test-disagreement-routing.sh — conformance test for idea-04 (disagreement routing).
# Asserts that warchief.md step 6 carries the confidence classes, the routing table,
# the conflict ladder, and the ledger columns. Offline, no network.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WARCHIEF="$HERE/../../agents/warchief.md"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

[[ -f "$WARCHIEF" ]] || { printf 'not ok - warchief.md not found at %s\n' "$WARCHIEF"; exit 1; }

# Step 6 spans from its own heading to the next same-level heading (step 7).
STEP6="$(awk '/^### 6\./,/^### 7\./' "$WARCHIEF")"
[[ -n "$STEP6" ]] || { printf 'not ok - could not extract step 6 from warchief.md\n'; exit 1; }

has() {   # has NAME REGEX — step 6 MUST match
  if grep -Eqi -- "$2" <<<"$STEP6"; then ok "$1"; else bad "$1 (missing: $2)"; fi
}
hasnt() { # hasnt NAME REGEX — step 6 must NOT match
  if grep -Eqi -- "$2" <<<"$STEP6"; then bad "$1 (found forbidden: $2)"; else ok "$1"; fi
}

# --- Task 1: the three confidence classes -----------------------------------
has 'class token: agreed'       '`?agreed`?'
has 'class token: single'       '`?single`?'
has 'class token: conflicting'  '`?conflicting`?'
has 'classes are computed at merge, before the fixer is dispatched' \
    'before any fixer is dispatched|at merge time'
has 'Rule A: silence is not dissent' \
    'silence is not dissent'
has 'Rule A: one-flags-one-silent is single, never conflicting' \
    'never.{0,20}`?conflicting`?'
has 'Rule B: co-location alone is not a conflict' \
    'co-location is not conflict|mutually unsatisfiable'
has 'Rule B: the one yes/no compatibility test' \
    'can one edit satisfy both remedies'

printf '\n# passed: %d, failed: %d\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
```

Run it. It must **fail** — step 6 says nothing about classes yet:

```bash
bash plugins/tribe/scripts/tests/test-disagreement-routing.sh; echo "exit=$?"
```

Expected output (RED — all 8 class assertions fail, non-zero exit):

```text
not ok - class token: agreed (missing: `?agreed`?)
not ok - class token: single (missing: `?single`?)
not ok - class token: conflicting (missing: `?conflicting`?)
not ok - classes are computed at merge, before the fixer is dispatched (missing: before any fixer is dispatched|at merge time)
not ok - Rule A: silence is not dissent (missing: silence is not dissent)
not ok - Rule A: one-flags-one-silent is single, never conflicting (missing: never.{0,20}`?conflicting`?)
not ok - Rule B: co-location alone is not a conflict (missing: co-location is not conflict|mutually unsatisfiable)
not ok - Rule B: the one yes/no compatibility test (missing: can one edit satisfy both remedies)

# passed: 0, failed: 8
exit=1
```

- [x] **Step 2: Add the class definitions to step 6 (GREEN)**

In `plugins/tribe/agents/warchief.md`, inside step 6, insert this block **immediately after idea
01's merge law** (the paragraph that tags each merged finding `[both]` or `[one]`) and **before**
idea 05's fixer-brief template. Anchor check per Global Constraint 2 first.

```markdown
#### Confidence classes — what agreement between two reviewers buys you

Two independent reviewers agreeing is the cheapest confidence measurement this system has. Compute
it explicitly; never throw it away. **At merge time, before any fixer is dispatched**, classify
every merged finding:

| Class | Definition |
| --- | --- |
| `agreed` | Both reviewers flagged the same location with the same claim direction (the merge deduped them into one entry). |
| `single` | Exactly one reviewer flagged the location; the other said nothing about it. |
| `conflicting` | Both reviewers flagged the same location, and their demanded remedies are mutually unsatisfiable — no single edit can satisfy both. |

**Rule A — silence is not dissent.** A reviewer that did not flag a location has **not** certified
it correct. Skinners emit *findings*, not per-location clearances, and an `AUDIT: PASS` is a
statement about the contract as a whole, never a line-by-line acquittal. One-flags-one-silent is
therefore `single`, **never `conflicting`**. Get this wrong and every solo finding becomes an
escalation — the most expensive path becomes the default path.

**Rule B — co-location is not conflict.** Two reviewers may flag the same line for two *unrelated*
defects; both are true and one edit fixes both. `conflicting` requires **mutual unsatisfiability**.
Your test is a single yes/no question: **can one edit satisfy both remedies?** Yes → two ordinary
findings, classed independently. No → `conflicting`. That question asks about *compatibility*, never
*merit* — you are never deciding who is right.
```

Re-run the test. Expected: the 8 class assertions now pass, exit 0.

```bash
bash plugins/tribe/scripts/tests/test-disagreement-routing.sh; echo "exit=$?"
```

Expected output (GREEN):

```text
ok - class token: agreed
ok - class token: single
ok - class token: conflicting
ok - classes are computed at merge, before the fixer is dispatched
ok - Rule A: silence is not dissent
ok - Rule A: one-flags-one-silent is single, never conflicting
ok - Rule B: co-location alone is not a conflict
ok - Rule B: the one yes/no compatibility test

# passed: 8, failed: 0
exit=0
```

- [x] **Step 3: Commit**

```bash
chmod +x plugins/tribe/scripts/tests/test-disagreement-routing.sh
git add plugins/tribe/scripts/tests/test-disagreement-routing.sh \
        plugins/tribe/agents/warchief.md \
        docs/tribe/planning/idea-04-disagreement-routing/plan.md
git commit --no-gpg-sign -m "feat(tribe): confidence classes for merged reviewer findings" \
  -m "$(printf 'Tribe-Card: idea-04-disagreement-routing\nTribe-Task: 1/5')"
```

Expected: one commit, tree clean, both trailers present under
`git log -1 --format='%(trailers:only)'`.

---

## Task 2: The routing table

Turns the class into an action. Three rows, and the one additive line idea 05 explicitly asked
this card to contribute.

- [x] **Step 1: Append the routing assertions (RED)**

Append to `plugins/tribe/scripts/tests/test-disagreement-routing.sh`, immediately before the final
`printf` summary block:

```bash
# --- Task 2: the routing table ----------------------------------------------
has 'agreed raises severity to Critical' \
    'agreed.*critical|critical.*by default'
has 'agreed goes straight into the fixer brief' \
    'straight into the fixer'
has 'single is routed to the fixer, which adjudicates' \
    'the fixer adjudicates'
has 'single findings are not pre-filtered by the Warchief' \
    'do not pre-filter'
has 'conflicting is never routed to the fixer as-is' \
    'never routed to the fixer as-is'
has 'conflicting is never self-reconciled' \
    'never self-reconcile'
has 'reproduce-first still applies to an agreed finding' \
    'reproduce-first applies to every finding'
has 'NOT_REPRODUCED on an agreed finding escalates immediately' \
    'NOT_REPRODUCED.*`?agreed`?|`?agreed`?.*NOT_REPRODUCED'
```

Run the test. Expected: the 8 task-1 assertions still pass, the 8 new ones fail, exit 1.

```bash
bash plugins/tribe/scripts/tests/test-disagreement-routing.sh; echo "exit=$?"
```

Expected tail:

```text
# passed: 8, failed: 8
exit=1
```

- [x] **Step 2: Add the routing table to step 6 (GREEN)**

Insert directly beneath the class-definitions block from task 1:

```markdown
#### The routing table

| Class | Routing |
| --- | --- |
| `agreed` | Severity is raised to **Critical** by default; the finding goes **straight into the fixer's brief** with its class label. Two independent samples converged — that is the highest prior this system can cheaply produce. |
| `single` | Goes into the fixer's brief with its class label; **the fixer adjudicates it** (reproduce-first). False positives are cheap *and are meant to be filtered by the layer below* — **do not pre-filter** what you have no evidence about. |
| `conflicting` | **Never routed to the fixer as-is, and never self-reconciled by you.** Walk the conflict ladder below. A fixer handed two mutually unsatisfiable orders either oscillates or silently picks one. |

**Reproduce-first applies to every finding, including an `agreed` one.** Two reviewers
hallucinating in the same direction is still a hallucination, and fixing blind is the harm. What the
class changes is only the **escalation path on non-reproduction**: if the fixer reports
`NOT_REPRODUCED` for an `agreed` finding, that is a strong signal the *fixer's reproduction* is at
fault (two independent samples flagged it) — it escalates to you **immediately** for adjudication,
rather than waiting for the next audit round to settle it as a `single` finding would.
```

Re-run. Expected: 16 passed, 0 failed, exit 0.

- [x] **Step 3: Commit**

```bash
git add plugins/tribe/scripts/tests/test-disagreement-routing.sh \
        plugins/tribe/agents/warchief.md \
        docs/tribe/planning/idea-04-disagreement-routing/plan.md
git commit --no-gpg-sign -m "feat(tribe): routing table for agreed/single/conflicting findings" \
  -m "$(printf 'Tribe-Card: idea-04-disagreement-routing\nTribe-Task: 2/5')"
```

Expected: one commit; `bash plugins/tribe/scripts/tests/test-disagreement-routing.sh` exits 0.

---

## Task 3: The conflict ladder

The heart of the card: how a head-on conflict is resolved **without** the Warchief picking a winner
by taste. Three rungs, strictly ordered, bounded so they can never grind.

- [x] **Step 1: Append the ladder assertions (RED)**

Append before the summary block:

```bash
# --- Task 3: the conflict ladder --------------------------------------------
has 'rung 1: resolve by verbatim contract citation' \
    'verbatim.{0,40}(file:line|`?file:line`?)|quote the deciding sentence'
has 'rung 1: no citation means the rung does not apply' \
    'no citation'
has 'rung 1: an intention is not a citation' \
    'is not a citation'
has 'rung 2: exactly one tie-break Skinner is dispatched' \
    'one third skinner|one tie-break'
has 'rung 2: the tie-break Skinner is dispatched COLD' \
    'dispatched cold'
has 'rung 2: it never receives A or B reports' \
    'never.{0,80}(their reports|reports, findings)'
has 'rung 2: it is a third sample, not an arbiter' \
    'not an arbiter'
has 'rung 2: majority direction across three samples' \
    'majority'
has 'rung 2: silence from C is not a vote' \
    'silence is not a vote'
has 'rung 2: at most ONE tie-break per finding key per campaign' \
    'one tie-break round per finding key'
has 'rung 2: a tie-break does NOT consume a fix round' \
    'does not consume a fix round'
has 'rung 3: immediate NEEDS_DIRECTION, not at round 3' \
    'at once \(not at round 3\)|immediately.{0,40}NEEDS_DIRECTION'
has 'rung 3: a question no experiment can settle is not a code question' \
    'no experiment can settle'
has 'rung 3: escalation carries both reports verbatim' \
    'both reviewers.{0,20}reports.{0,20}verbatim|reports verbatim'
```

Run. Expected: 16 passed, 14 failed, exit 1.

- [x] **Step 2: Add the ladder to step 6 (GREEN)**

Insert directly beneath the routing table:

```markdown
#### The conflict ladder — walk in order, stop at the first rung that applies

**Rung 1 — does the contract already settle it? Resolve by CITATION, not judgment.**
If the spec or plan, read literally, **mandates or forbids** one of the two directions, one reviewer
simply did not read the contract carefully. You resolve it — but **only by citation**: quote the
deciding sentence **verbatim, with its `file:line`**, from the spec or plan. The surviving finding
proceeds to the fixer with its class rewritten to `agreed` (the contract is the second vote); the
loser is dropped, ledger `DROPPED (contract: path:line)`. **No citation → this rung does not apply;
fall through to rung 2.** "The plan clearly intends…" **is not a citation.** Reading the written law
is your job (you authored it); picking a winner by taste is not.

**Rung 2 — is the question mechanically decidable? ONE cold tie-break round.**
If *running something* could answer the dispute (does this leak? is it off by one? does this
evaluation order fire early?), the dispute has a mechanical oracle. Dispatch **one third Skinner**
and take the **majority direction** across the three independent samples.

> **The tie-break Skinner is dispatched COLD.** It receives *exactly* the brief A and B received —
> the contract, the diff, the repo's rules — and **never their reports, findings, verdicts, or even
> the fact that a disagreement exists.** It is a third independent **sample**, **not an arbiter**
> reading two briefs. Handing it the two reports would destroy the very independence that makes
> agreement meaningful, and would breach the reviewers' isolation invariant. The obvious reading of
> "run one more review round" is the forbidden one — do not take it.

- C flags the location in **A's direction** → majority (2 of 3): A's finding proceeds to the fixer as
  `agreed`; B's is dropped, ledger `DROPPED (tie-break, round N)`.
- C flags it in **B's direction** → symmetric.
- C flags a **third direction**, or **says nothing** about the location → **no majority** (silence is
  not a vote — Rule A) → rung 3.

**Bounds — this rung can never grind.** At most **ONE tie-break round per finding key, per
campaign** (the key is the finding's identity, not the round): a conflict resurfacing on the same key
has already spent its tie-break and goes **straight to rung 3**. And a **tie-break is a REVIEW round:
it does not consume a fix round** — no code changes, no fixer is dispatched, and the 3-round fix cap
counts *fix* rounds only. Otherwise one conflict would eat a third of the branch's entire fix budget
without a single line being fixed.

**Rung 3 — the conflict IS the finding → `NEEDS_DIRECTION`, immediately.**
No citation settles it and no majority exists: the two reviewers read the contract differently and
**both readings are defensible** — which means the contract is underdetermined. **A question no
experiment can settle is not a code question**, and no number of review rounds can repair an
ambiguous spec: each new reviewer only adds another opinion on a question the document never
answered. Return `NEEDS_DIRECTION` to the Shaman **at once (not at round 3)**, carrying:

1. **Both reviewers' reports, verbatim.**
2. The finding key, and the two mutually unsatisfiable remedies stated as **the two options**.
3. The tie-break Skinner's report, verbatim, if rung 2 ran.
4. **Your recommendation** — which reading you believe the card intends, and why.
```

Re-run. Expected: 30 passed, 0 failed, exit 0.

- [x] **Step 3: Commit**

```bash
git add plugins/tribe/scripts/tests/test-disagreement-routing.sh \
        plugins/tribe/agents/warchief.md \
        docs/tribe/planning/idea-04-disagreement-routing/plan.md
git commit --no-gpg-sign -m "feat(tribe): bounded conflict ladder for head-on reviewer disagreement" \
  -m "$(printf 'Tribe-Card: idea-04-disagreement-routing\nTribe-Task: 3/5')"
```

Expected: one commit; the full test file exits 0.

---

## Task 4: The ledger columns

Records the routing outcome, so the 3-round cap and the one-tie-break-per-key cap stay readable off
a single document — and so the boundary with idea 05 is visible in the table itself.

- [x] **Step 1: Append the ledger assertions (RED)**

Append before the summary block:

```bash
# --- Task 4: the ledger columns ---------------------------------------------
has 'ledger has a class column' \
    '\| *`?class`? *\|'
has 'ledger has a routed column' \
    '\| *`?routed`? *\|'
has 'routed value TO_FIXER' \
    'TO_FIXER'
has 'routed value DROPPED with a contract citation' \
    'DROPPED \(contract'
has 'routed value DROPPED by tie-break' \
    'DROPPED \(tie-break'
has 'routed value ESCALATED for spec ambiguity' \
    'ESCALATED \(spec ambiguity\)'
has 'disposition stays empty when the finding never reached the fixer' \
    'empty.{0,60}TO_FIXER|never reached the fixer'
has 'the ledger lives in the report file so a resumed Warchief can read it' \
    'report file'
```

Run. Expected: 30 passed, 8 failed, exit 1.

- [x] **Step 2: Add the ledger columns to step 6 (GREEN)**

Insert directly beneath the conflict ladder. This **extends idea 05's existing disposition ledger**
— it does not create a second one. Anchor check: idea 05's ledger must already exist in step 6; if it
does not, report `NEEDS_CONTEXT`.

```markdown
#### Recording it — the disposition ledger gains two columns

The disposition ledger in your report file gains two columns that **you** fill at merge time, before
the fixer is dispatched. Same ledger, same rows — a finding's routing and its disposition are facts
about the same finding at two stages of its life, so they belong in one table.

| Column | Filled by | Values |
| --- | --- | --- |
| `class` | you, at merge | `agreed` / `single` / `conflicting` |
| `routed` | you, at merge | `TO_FIXER` / `DROPPED (contract: path:line)` / `DROPPED (tie-break, round N)` / `TIEBREAK` / `ESCALATED (spec ambiguity)` |

The fixer still fills `disposition` (`FIXED` / `NOT_REPRODUCED` / `ESCALATED`), and it stays **empty
for any finding whose `routed` is not `TO_FIXER`** — a finding that **never reached the fixer** has a
routing outcome and no disposition. That empty cell is the boundary: you decide what reaches the
fixer; the fixer decides what to do with what it got.

The ledger lives in your **report file** (on disk, append-only), which is what lets a re-dispatched
Warchief resuming this card see **which finding keys have already spent their one tie-break round**.
No state-file change is needed: `docs/tribe/state/` tracks crash-resume milestones, and an audit
round is idempotent — the diff is unchanged, so a resumed Warchief re-runs the round and re-derives
the same classes from the same inputs.
```

Re-run. Expected: 38 passed, 0 failed, exit 0.

- [x] **Step 3: Commit**

```bash
git add plugins/tribe/scripts/tests/test-disagreement-routing.sh \
        plugins/tribe/agents/warchief.md \
        docs/tribe/planning/idea-04-disagreement-routing/plan.md
git commit --no-gpg-sign -m "feat(tribe): record routing outcome in the disposition ledger" \
  -m "$(printf 'Tribe-Card: idea-04-disagreement-routing\nTribe-Task: 4/5')"
```

Expected: one commit; the full test file exits 0.

---

## Task 5: Negative assertions, evals, and the whole-suite gate

The three regression guards that keep this card from being silently un-done by a later edit, plus
the behavioral evals and proof that the neighbouring cards' suites still pass.

- [ ] **Step 1: Append the negative assertions and run the full suite (RED)**

Each negative assertion names a specific way the card can be quietly reversed. Append before the
summary block:

```bash
# --- Task 5: negative assertions (regression guards) ------------------------
# The rung-1 loophole: resolving a conflict by taste, dressed up as adjudication.
hasnt 'no permission to pick a conflict winner without a contract citation' \
      'choose (the )?winner|pick (the )?winner|decide which reviewer is right'
# The rung-2 leak: an arbiter round instead of a third independent sample.
hasnt 'the tie-break Skinner is never given the other reviewers reports' \
      "(attach|include|pass|hand).{0,40}(both|the two|A's and B's).{0,20}reports"
# Delegating an unresolvable conflict downward.
hasnt 'a conflicting finding is never handed to the fixer unresolved' \
      'route (the )?`?conflicting`? .{0,20}to the fixer'
```

Also add the eval entries to `plugins/tribe/evals/evals.json` (append to its array, matching the
file's existing entry shape):

```json
{
  "id": "warchief-routes-agreed-finding-as-critical",
  "prompt": "Two Skinners both flagged src/pipe.rs:88 with the same claim. Merge and route.",
  "expect": "The finding is classed agreed, severity raised to Critical, routed TO_FIXER, and the fixer is still told to reproduce it before fixing."
},
{
  "id": "warchief-classes-one-flags-one-silent-as-single",
  "prompt": "Skinner A flagged src/pipe.rs:88; Skinner B said nothing about that line. Merge and route.",
  "expect": "The finding is classed single (never conflicting — silence is not dissent) and routed TO_FIXER for the fixer to adjudicate."
},
{
  "id": "warchief-tie-break-skinner-is-dispatched-cold",
  "prompt": "Skinner A demands src/pipe.rs:88 be eagerly evaluated; Skinner B demands it be deferred. The plan is silent. Resolve.",
  "expect": "A third Skinner is dispatched with the same cold brief A and B got — containing neither reviewer's report nor the fact that a disagreement exists — and the majority direction decides."
},
{
  "id": "warchief-escalates-spec-ambiguity-immediately",
  "prompt": "Two Skinners conflict head-on at src/pipe.rs:88, no contract sentence settles it, and the tie-break produced no majority. Decide.",
  "expect": "NEEDS_DIRECTION is returned to the Shaman at once (not at round 3), carrying both reports verbatim, the two options, and a recommendation."
}
```

Run the full suite. Expected: the 38 positive assertions pass; the 3 negative ones **fail** only if
step 6 contains forbidden text. Since tasks 1 to 4 wrote it correctly, the expected outcome here is
that all 41 already pass — **so prove the guards actually bite** before trusting them:

```bash
# Prove each negative guard is live: inject the forbidden text, watch it fail, revert.
cp plugins/tribe/agents/warchief.md /tmp/warchief.bak
printf '\nOn a conflict, decide which reviewer is right.\n' >> plugins/tribe/agents/warchief.md
bash plugins/tribe/scripts/tests/test-disagreement-routing.sh; echo "exit=$?"
cp /tmp/warchief.bak plugins/tribe/agents/warchief.md
```

Expected: the injected line trips the guard (a guard that cannot fail is not a guard):

```text
not ok - no permission to pick a conflict winner without a contract citation (found forbidden: choose (the )?winner|pick (the )?winner|decide which reviewer is right)
exit=1
```

- [ ] **Step 2: Restore, then prove the whole suite green (GREEN)**

With `warchief.md` restored, run this card's test **and** every neighbouring suite — this card edits
the same section of step 6 that ideas 01 and 05 edited, so their tests are the collateral-damage
gate:

```bash
bash plugins/tribe/scripts/tests/test-disagreement-routing.sh
bash plugins/tribe/scripts/tests/test-validate-plan.sh
bash plugins/tribe/scripts/tests/test-resume-check.sh
python3 -c "import json;json.load(open('plugins/tribe/evals/evals.json'));print('evals.json parses')"
```

Expected: every suite prints only `ok - ...` lines and exits 0; the last command prints
`evals.json parses`. Any `not ok` from ideas 01's or 05's suite means this card broke a neighbour —
stop and report to the Warchief.

- [ ] **Step 3: Commit**

```bash
git add plugins/tribe/scripts/tests/test-disagreement-routing.sh \
        plugins/tribe/evals/evals.json \
        docs/tribe/planning/idea-04-disagreement-routing/plan.md
git commit --no-gpg-sign -m "test(tribe): regression guards and evals for disagreement routing" \
  -m "$(printf 'Tribe-Card: idea-04-disagreement-routing\nTribe-Task: 5/5')"
```

Expected: one commit; `git status` clean; all suites exit 0.

---

## Definition of done for the implementation campaign

1. Step 6 carries the three class definitions plus Rule A (silence is not dissent) and Rule B
   (co-location is not conflict).
2. Step 6 carries the routing table (all three rows), including reproduce-first for `agreed` findings
   and the immediate escalation on `NOT_REPRODUCED` for them.
3. Step 6 carries the conflict ladder: rung 1 (verbatim contract citation), rung 2 (one **cold**
   tie-break Skinner, one per finding key, not a fix round), rung 3 (immediate `NEEDS_DIRECTION`).
4. The disposition ledger carries the `class` and `routed` columns; `hunter.md` and `skinner.md` are
   **untouched** (verify with `git diff --stat` on the branch).
5. `bash plugins/tribe/scripts/tests/test-disagreement-routing.sh` exits 0, including the three
   negative guards, each proven to bite; ideas 01's and 05's suites still green.
6. The spec's §5 evidence is embedded in the PR: two divergent BEFORE transcripts versus identical
   AFTER routing, the conflict-blindness before/after, and a dump of the tie-break Skinner's cold
   brief.
