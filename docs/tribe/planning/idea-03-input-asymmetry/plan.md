# Plan — Idea 03: input asymmetry between the two Skinners

> Spec: `docs/tribe/planning/idea-03-input-asymmetry/spec.md` (read it first — it is the contract)
> Card: `idea-03-input-asymmetry`
> Executed by: a FUTURE implementation campaign. The planning campaign that authored this file
> touched zero files under `plugins/`.

Turn idea 01's **symmetric** two-Skinner cell (two identical briefs, two verdicts) into an
**input-asymmetric** one: Skinner A keeps the contract, runs the proof, and holds the authoritative
verdict; Skinner B sees the bare diff only, is primed "assume the code is wrong", and emits
**hypotheses that must be dispositioned — never a verdict**.

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.** The audit of each task stays with the `skinner` subagent.
- **HARD PREREQUISITE — idea 01 must already be merged.** This plan edits text that idea 01's
  implementation campaign creates. Before Task 1, verify the baseline exists:

  ```bash
  grep -c 'Law 1' plugins/tribe/agents/warchief.md && \
  test -f plugins/tribe/scripts/tests/test-dual-skinner-cell.sh && echo "BASELINE PRESENT"
  ```

  Expected: a non-zero count, then `BASELINE PRESENT`. If this fails, **stop and report BLOCKED** —
  do not proceed, and do not attempt to write idea 01's baseline yourself.
- **Anchoring, not verbatim replacement.** The exact pre-edit wording of step 6's laws is produced
  by idea 01's campaign, so this plan does not quote it. Each task instead anchors on idea 01's law
  **labels** (its spec guarantees each law is a separately-labelled, self-contained clause) and
  supplies the **full replacement text** to write. After each edit, the task's grep assertions are
  the proof the anchor was hit.
- Work in an isolated worktree branched from `origin/master`. Never commit on `master`.
- Every commit carries the trailer `Tribe-Card: idea-03-input-asymmetry` plus `Tribe-Task: N/4`,
  both on two lines of the commit message's single final paragraph. No `Co-authored-by` trailers.
- Each task ticks its own checkboxes in this plan **in the same commit** as the code it describes.
- **Scope fence (from the spec):** do NOT re-design the dual-reviewer mechanism (concurrency,
  isolation, fresh-instance-per-round, union+dedupe, both-reports-verbatim, the 3-round cap, the
  `sonnet` tier — all inherited from idea 01). Do NOT add idea 04's routing table, do NOT touch
  `hunter.md` or the fixer's mandate (idea 05), do NOT change the contract lens's behavior, report
  format, or verdict, and do NOT introduce a second model tier or bug-class lenses.
- Files this plan may touch: `plugins/tribe/agents/skinner.md`, `plugins/tribe/agents/warchief.md`,
  `plugins/tribe/scripts/tests/test-input-asymmetry.sh`,
  `plugins/tribe/scripts/tests/test-dual-skinner-cell.sh` (Task 3 only, for the two assertions this
  card deliberately supersedes), `plugins/tribe/evals/evals.json`. Nothing else.
- **Proof mechanism.** The repo has no CI and no unit-test framework. Its proofs are (a) bash
  fixture tests under `plugins/tribe/scripts/tests/`, run directly, and (b) behavioral evals in
  `plugins/tribe/evals/evals.json`. Every task below is red→green against the new tripwire
  `test-input-asymmetry.sh`; the evals are the behavioral backstop added in Task 4.
- **Regression guard, run at the end of every task:**

  ```bash
  bash plugins/tribe/scripts/tests/test-validate-plan.sh && \
  bash plugins/tribe/scripts/tests/test-resume-check.sh && \
  bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh
  ```

  Expected: each script prints its `ok -` lines and ends `N passed, 0 failed`, exit 0. Idea 01's
  `test-dual-skinner-cell.sh` is included on purpose — this card rewrites clauses it asserts, and
  Task 3 is the only task allowed to change it.

## Sequencing

Four tasks, strictly sequential — **one wave, one worktree, one Hunter at a time**. No sub-plan
splitting: Tasks 2 and 3 edit the same step-6 region of `warchief.md`, and Task 1 must land first
because without the `skinner.md` cold-mode switch every cold dispatch returns an instant
`UN-AUDITABLE` FAIL (spec, Risks, row 1).

| Task | Touches | Deliverable |
|---|---|---|
| 1 | new `test-input-asymmetry.sh`, `skinner.md` | Cold-lens mode: contract hunt suspended, `COLD-LENS:` line, no `AUDIT:` line, honorable zero |
| 2 | `test-input-asymmetry.sh`, `warchief.md` step 6 | Delta-Law 1: two lenses, two briefs, the cold brief's forbidden-contents list |
| 3 | `test-input-asymmetry.sh`, `warchief.md` step 6, `test-dual-skinner-cell.sh` | Delta-Laws 3 & 4: tag vocabulary, disposition rule, round-PASS rule |
| 4 | `evals.json` | Four behavioral evals |

---

### Task 1: Cold-lens mode in `skinner.md` (the switch that makes the card possible)

Today a Skinner with no contract must STOP and return `FAIL — UN-AUDITABLE` (`skinner.md:96-98`).
A cold lens *has* no contract by design, so without this task the whole card returns instant
garbage. Build the tripwire first, watch it fail, then add the mode.

- [x] **Step 1: Write the failing test**

Create `plugins/tribe/scripts/tests/test-input-asymmetry.sh`. It first asserts idea 01's baseline is
present (this doubles as the dependency check), then asserts this card's laws. Style follows the
existing harness (`ok -` / `not ok -` lines, a tally, non-zero exit on failure).

```bash
cat > plugins/tribe/scripts/tests/test-input-asymmetry.sh <<'SH'
#!/usr/bin/env bash
# test-input-asymmetry.sh — contract tripwire for the input-asymmetric Skinner pair (idea 03).
#
# TRIPWIRE, not a behavior test: it proves the delta-laws are WRITTEN into the agent prompts and
# fails loudly if a later edit deletes one. Behavior is proved by the evals in
# plugins/tribe/evals/evals.json. Offline, no network.
#
# Idea 03 is a DELTA on idea 01 (the dual-Skinner cell). The baseline assertions below are the
# dependency check: run this before idea 01 has landed and you get a clear failure, not a silent
# no-op edit.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$HERE/../../agents"
WARCHIEF="$AGENTS/warchief.md"
SKINNER="$AGENTS/skinner.md"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

# Agent prompts are hard-wrapped prose, so a sentence routinely straddles a newline; grep is
# line-based and would miss it. Flatten each haystack to one whitespace-normalized line so the
# assertions match meaning, not line-breaking accidents.
flat() { tr '\n' ' ' | tr -s ' '; }

has() { # has NAME HAYSTACK REGEX — the flattened text must contain the regex
  if grep -qiE "$3" <<<"$2"; then ok "$1"; else bad "$1 (missing: $3)"; fi
}
hasnt() { # hasnt NAME HAYSTACK REGEX — the flattened text must NOT contain the regex
  if grep -qiE "$3" <<<"$2"; then bad "$1 (found what must be gone: $3)"; else ok "$1"; fi
}

[[ -f "$WARCHIEF" ]] || { printf 'not ok - warchief.md not found\n'; exit 1; }
[[ -f "$SKINNER" ]]  || { printf 'not ok - skinner.md not found\n'; exit 1; }

SKINNER_ALL="$(flat < "$SKINNER")"

# The cold-lens rules must live in their OWN section, so assert against that section only —
# never against the whole file. skinner.md already says "self-refutation", "contract",
# "UN-AUDITABLE" etc. in its contract-lens Method, so a whole-file grep would go green before a
# single edit was made: a tripwire that passes on the unmodified file guards nothing.
LENS="$(awk '/^## Lens mode/{f=1} /^## Operating rules/{f=0} f' "$SKINNER" | flat)"

# --- Dependency check: idea 01's baseline must already be in place -------------------------
if ! grep -qiE 'law 1' "$WARCHIEF"; then
  printf 'not ok - DEPENDENCY: idea 01 baseline (labelled Laws in step 6) not found in warchief.md\n'
  printf '# idea 03 is a delta on idea 01. Land idea 01 first. Aborting.\n'
  exit 1
fi
ok "dependency: idea 01 baseline present in warchief.md"

# --- Task 1 — skinner.md cold-lens mode ----------------------------------------------------
# (Before Task 1's edit, "$LENS" is the empty string and every assertion below fails. That is the
# RED state, and it is the point.)

# The lens switch itself.
has "cold: skinner.md declares a lens mode (contract | cold)" "$LENS" 'lens: contract|lens: cold'
has "cold: the cold lens is named and described"             "$LENS" 'cold lens|bare-diff reviewer'
has "cold: contract lens is the default"                     "$LENS" 'contract.{0,30}default|default.{0,30}contract'

# The load-bearing suspension: having no contract is the ASSIGNMENT in cold mode, not a failure.
has "cold: the contract hunt is suspended"                   "$LENS" 'suspend'
has "cold: UN-AUDITABLE never applies in cold mode"          "$LENS" 'never return .?UN-AUDITABLE|UN-AUDITABLE.{0,80}cold'

# The cold lens must not go looking for the contract it was denied.
has "cold: must not read a spec/plan/card found on disk"     "$LENS" 'must not read'

# The verdict boundary: cold mode emits COLD-LENS:, never AUDIT:.
has "cold: emits a COLD-LENS terminator line"                "$LENS" 'COLD-LENS: [0-9N]+ hypothes'
has "cold: is forbidden from emitting an AUDIT line"         "$LENS" 'never emit an .?AUDIT:'
has "cold: findings are hypotheses, not a verdict"           "$LENS" 'not a verdict|hold no PASS/FAIL'

# Anti-Goodhart: zero hypotheses is honorable, and self-refutation still applies in full.
has "cold: zero hypotheses is an honorable result"           "$LENS" '0 hypotheses|zero hypotheses'
has "cold: self-refutation still applies in cold mode"       "$LENS" 'self-refutation'

# The one edit OUTSIDE the new section: Method step 1's UN-AUDITABLE stop must point at cold mode,
# so the two passages cannot contradict each other.
has "cold: Method step 1 carves out the cold lens"           "$SKINNER_ALL" 'contract lens only|in .?lens: cold.? this whole step is suspended'

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
SH
chmod +x plugins/tribe/scripts/tests/test-input-asymmetry.sh
bash plugins/tribe/scripts/tests/test-input-asymmetry.sh
```

Expected (RED): the dependency line prints `ok -`, then all 11 cold-lens assertions print `not ok -`
(`skinner.md` has no lens mode yet), the tally reads `1 passed, 11 failed`, and the script exits
non-zero.

- [x] **Step 2: Make it green — add the cold-lens mode to `skinner.md`**

Insert this section into `plugins/tribe/agents/skinner.md` immediately **before** the
`## Operating rules` heading (i.e. between the `## Your scope: review only` section and
`## Operating rules`), verbatim. (The outer fence below is four backticks because the section
itself contains a three-backtick block; write the inner block into `skinner.md` as a normal
three-backtick fence.)

````markdown
## Lens mode: `contract` (default) or `cold`

You are one of **two independent reviewers** of the same diff, and your dispatch names which
**lens** you are. The first line of your brief states `lens: contract` or `lens: cold`. If the
brief names no lens, you are the **contract lens** — that is the default and it is everything
described in the rest of this file.

The two lenses exist because two reviewers who share the same input share the same blind spots.
Different inputs produce different errors; that is the entire purpose. You will never be told what
the other reviewer found, and you must never seek it out.

### `lens: contract` — the default

Everything below in this file, unchanged: find the requirement contract, read it fully first, build
the conformance matrix, run the proof, and return the authoritative `AUDIT: PASS | FAIL` verdict.
**You are the only lens that holds a verdict.**

### `lens: cold` — the bare-diff reviewer

You receive **only the diff**. No spec, no plan, no idea card, no ticket, no PR body, no commit
messages, no report from whoever wrote the code. This is deliberate: you are here to catch what a
contract-driven reading walks straight past — use-after-free and other lifetime bugs, evaluation
order, numeric edge cases, resource leaks, language-idiom errors, silently swallowed failures. Bugs
that compile cleanly and look plausible. **Assume the code is wrong, and find the reasons it does
not work.**

In cold mode, these rules REPLACE the corresponding parts of the Method below:

- **Method step 1 (find the requirement contract) is SUSPENDED, and so is `UN-AUDITABLE`.** Having
  no contract is your assignment, not a failure. Never return `UN-AUDITABLE` in cold mode, and never
  FAIL for want of a contract.
- **Never go looking for the contract you were denied.** If a spec, plan, card, ticket or PR body is
  sitting on disk, in the branch name, or in a commit message, you **must not read it**. Reading it
  turns you into a second copy of the contract lens and destroys the only thing you were dispatched
  for. (Same rule, same reason, as never reading a peer reviewer's report.)
- **Method step 3 (requirement inventory) and the conformance matrix are SUSPENDED.** There is no
  contract to inventory and no conformance to tabulate.
- **You are NOT blind to the codebase.** Read any source file, follow any call, run any read-only
  command you need in order to understand the code you are reviewing — and to try to **falsify your
  own hypotheses**. What you are denied is the statement of what the code was *supposed* to do; you
  review the code as code.
- **Method step 7 (self-refutation) applies in FULL.** Every hypothesis must name a `file:line`, be
  falsifiable, and survive a genuine attempt to refute it. Prose is never evidence. A hypothesis you
  refuted yourself goes under "Refuted during self-audit" and is not emitted.
- **You produce HYPOTHESES, not a verdict.** You hold no PASS/FAIL. Your findings feed the
  Warchief's adjudication one layer above you: it will confirm them, refute them with evidence about
  the code, or record them as out-of-scope follow-ups. Being wrong is affordable — being *silent*
  about a real bug is not.

**Cold-mode output format** — return this structure, and end with the `COLD-LENS:` line, which is
the machine-judgeable terminator. **Never emit an `AUDIT:` line in cold mode**: that line is the
contract lens's verdict, and an automated caller reads it as one.

```
## Hypotheses
### Critical — this code is wrong and it will hurt
- [file:line] <the claim> — <why it does not work> — <how to falsify it / what you ran>
### Important
### Minor / nits

## Refuted during self-audit
- <hypothesis you formed and then refuted yourself, with the evidence that killed it>

COLD-LENS: N hypotheses — <tally, e.g. "1 critical, 2 important (2 refuted during self-audit)">
```

**`COLD-LENS: 0 hypotheses` is a valid, honorable, expected result.** "Assume the code is wrong" is
a prior that makes you *suspicious*, not a quota that makes you *right*. If you looked hard and the
code holds up, say so. Inventing a nitpick to justify your existence is the one failure mode that
destroys this role: a reviewer that cries wolf devalues every review that comes after it.
````

Then make one surgical edit to the `UN-AUDITABLE` sentence in Method step 1 so the two sections
cannot contradict each other. Change:

```
**If no level yields a contract — or several plausibly match and you cannot tell which —
STOP and return `FAIL` with a rationale that begins `UN-AUDITABLE:`, listing the
candidates.** Never audit against a guessed contract.
```

to:

```
**If no level yields a contract — or several plausibly match and you cannot tell which —
STOP and return `FAIL` with a rationale that begins `UN-AUDITABLE:`, listing the
candidates.** Never audit against a guessed contract. (Contract lens only: in `lens: cold`
this whole step is suspended — having no contract is the assignment, and `UN-AUDITABLE`
never applies. See "Lens mode" above.)
```

- [x] **Step 3: Verify green + regression**

```bash
bash plugins/tribe/scripts/tests/test-input-asymmetry.sh && \
bash plugins/tribe/scripts/tests/test-validate-plan.sh && \
bash plugins/tribe/scripts/tests/test-resume-check.sh && \
bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh
```

Expected: `test-input-asymmetry.sh` prints `12 passed, 0 failed`; the three regression scripts each
end `N passed, 0 failed`; overall exit 0.

- [x] **Step 4: Commit**

One commit, both trailers on two lines of the message's single final paragraph:

```bash
git add plugins/tribe/agents/skinner.md plugins/tribe/scripts/tests/test-input-asymmetry.sh \
        docs/tribe/planning/idea-03-input-asymmetry/plan.md
git commit -m 'feat(tribe): cold-lens mode for the Skinner' \
           -m $'The cold lens reviews the bare diff with no contract, emits hypotheses instead of a\nverdict, and is forbidden from returning UN-AUDITABLE or an AUDIT: line.\n\nTribe-Card: idea-03-input-asymmetry\nTribe-Task: 1/4'
```

---

### Task 2: Delta-Law 1 — two lenses, two briefs (Warchief step 6)

Idea 01's step 6 dispatches two Skinners on an **identical brief**. Replace that clause with the
two-lens brief specification, including the cold brief's exhaustive forbidden-contents list.

- [ ] **Step 1: Write the failing test**

Append to `plugins/tribe/scripts/tests/test-input-asymmetry.sh`, immediately before the final
`printf '\n%d passed, %d failed\n'` line:

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("plugins/tribe/scripts/tests/test-input-asymmetry.sh")
src = p.read_text()
marker = r"""printf '\n%d passed, %d failed\n'"""
assert marker in src, "tally line not found — did Task 1 land?"

block = r'''# --- Task 2 — warchief.md step 6, Delta-Law 1: two lenses, two briefs ----------------------
STEP6="$(awk '/^### 6\./{f=1} /^### 7\./{f=0} f' "$WARCHIEF" | flat)"
[[ -n "$STEP6" ]] || { printf 'not ok - could not extract step 6 from warchief.md\n'; exit 1; }

has   "law1: the two lenses are named"                        "$STEP6" 'contract lens.{0,200}cold lens|cold lens.{0,200}contract lens'
has   "law1: each dispatch declares its lens"                 "$STEP6" 'lens: contract|lens: cold'
has   "law1: the briefs are NOT identical"                    "$STEP6" 'not identical|differ|asymmetr'
hasnt "law1: the identical-brief clause is gone"              "$STEP6" 'identical brief'
has   "law1: still one message, still concurrent"             "$STEP6" 'same message'
has   "law1: cold brief carries the bare diff only"           "$STEP6" 'only the bare diff|bare diff'
has   "law1: cold brief must not carry the spec/plan"         "$STEP6" '(must not|never).{0,200}(spec|plan|contract)'
has   "law1: cold brief must not carry the Hunter report"     "$STEP6" "hunter's report|hunter report"
has   "law1: cold brief must not carry commit/branch/PR text" "$STEP6" 'commit message|branch name|PR body'
has   "law1: the cold lens may still read the codebase"       "$STEP6" 'not blind to the codebase|may read'

'''

i = src.index(marker)
p.write_text(src[:i] + block + src[i:])
print("Task 2 assertions appended")
PY
bash plugins/tribe/scripts/tests/test-input-asymmetry.sh
```

Expected (RED): `Task 2 assertions appended`, then the 12 Task-1 assertions still print `ok -` and
the 10 new Law-1 assertions print `not ok -` (step 6 still carries idea 01's identical-brief
clause); tally `12 passed, 10 failed`, exit non-zero.

- [ ] **Step 2: Make it green — rewrite the brief clause in `warchief.md` step 6**

In `plugins/tribe/agents/warchief.md`, find the clause idea 01 labelled **"Law 1"** in step 6 (its
spec guarantees each law is a separately-labelled, self-contained clause) and replace **only that
clause** with the text below. Leave idea 01's Law 2 (context isolation) exactly as it stands.

```markdown
#### Law 1 — Two lenses, two briefs, one message

Every audit round dispatches **two `skinner` instances in the same assistant message** (two tool
uses in one message — that is what makes them concurrent), both `model: sonnet`. That much is the
cell. What differs is **what each one is allowed to know** — and that difference is the whole point:
two reviewers who share an input share their blind spots, so the briefs are deliberately **not
identical**. Each dispatch declares its lens on the first line of the brief.

**Skinner A — `lens: contract`.** The brief carries the contract (your spec + plan), the diff under
audit, the repo's rules, and its own report path. It runs the proof and returns the authoritative
`AUDIT: PASS | FAIL` verdict.

**Skinner B — `lens: cold`.** The brief carries **only the bare diff**, the instruction to assume
the code is wrong and find the reasons it does not work, and its own report path. It exists to catch
what a contract-driven reading walks past — lifetime bugs, evaluation order, numeric edge cases,
resource leaks, idiom errors: bugs that compile cleanly and look plausible, and that no requirement
row would ever have named.

The cold brief **must not** contain any of the following. This list is exhaustive and it is a rule,
not a preference — every item is a channel through which the contract, or the story told by the
party that wrote the code, would leak back in and collapse Skinner B into a second copy of
Skinner A:

| Forbidden in the cold brief | Why |
|---|---|
| the spec, the plan, the idea card, a ticket, or any path to them | that is the contract |
| the Hunter's report, its reasoning, its RED proof, its self-assessment | the side that wrote the code wants the code accepted |
| your own narrative about the task or the Hunter | the same bias, in your voice |
| commit messages, the branch name, the PR body, task titles | each is a compressed restatement of the contract |
| the other Skinner's findings, verdict, report path, or existence | Law 2, unchanged |

The cold lens is **not blind to the codebase**: it may read any source file and run read-only
commands to understand the code and to falsify its own hypotheses. What it is denied is the
statement of what the code was *supposed* to do.
```

- [ ] **Step 3: Verify green + regression**

```bash
bash plugins/tribe/scripts/tests/test-input-asymmetry.sh && \
bash plugins/tribe/scripts/tests/test-validate-plan.sh && \
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: `test-input-asymmetry.sh` prints `22 passed, 0 failed`; both regression scripts end
`N passed, 0 failed`; exit 0. (`test-dual-skinner-cell.sh` is deliberately **not** in this list:
its identical-brief assertion is now superseded and Task 3 updates it. It is expected to fail on
exactly that one assertion between Task 2 and Task 3, and it must be green again at the end of
Task 3.)

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/test-input-asymmetry.sh \
        docs/tribe/planning/idea-03-input-asymmetry/plan.md
git commit -m 'feat(tribe): asymmetric Skinner briefs — contract lens and cold lens' \
           -m $'Step 6 Law 1 now dispatches two DIFFERENT briefs in one message. The cold brief\ncarries the bare diff only, with an exhaustive forbidden-contents list.\n\nTribe-Card: idea-03-input-asymmetry\nTribe-Task: 2/4'
```

---

### Task 3: Delta-Laws 3 & 4 — tags, dispositions, and the round-PASS rule

The safety hinge of the card. Idea 01 protected against a missed bug with "both must PASS". Stripping
Skinner B's verdict removes that protection, so it must be replaced — by a rule that a cold
hypothesis can never be *silently dropped*.

- [ ] **Step 1: Write the failing test**

Append to `plugins/tribe/scripts/tests/test-input-asymmetry.sh`, immediately before the final
`printf '\n%d passed, %d failed\n'` line:

```bash
python3 - <<'PY'
import pathlib
p = pathlib.Path("plugins/tribe/scripts/tests/test-input-asymmetry.sh")
src = p.read_text()
marker = r"""printf '\n%d passed, %d failed\n'"""
assert marker in src, "tally line not found — did Tasks 1 and 2 land?"

block = r'''# --- Task 3 — Delta-Law 3 (tags + disposition) and Delta-Law 4 (round-PASS rule) -----------
has   "law3: three-tag vocabulary"                             "$STEP6" '\[both\].{0,300}\[contract-only\].{0,300}\[cold-only\]'
has   "law3: cold findings are hypotheses"                     "$STEP6" 'hypothes'
has   "law3: every cold hypothesis gets a recorded disposition" "$STEP6" 'disposition'
has   "law3: the three dispositions are named"                 "$STEP6" 'confirmed.{0,400}refuted.{0,400}(out of scope|follow-up)'
has   "law3: refuting needs evidence about the CODE"           "$STEP6" 'evidence that the code is correct|evidence about the code'
has   "law3: the contract-does-not-require-it refutation is forbidden" "$STEP6" 'contract does not require'
has   "law3: an undispositioned hypothesis fails the round"    "$STEP6" 'undispositioned|silence is not a disposition'
has   "law4: only the contract lens holds the verdict"         "$STEP6" 'only the contract lens'
has   "law4: the round-PASS rule is stated"                    "$STEP6" 'round passes if and only if'
hasnt "law4: the both-must-PASS rule is gone"                  "$STEP6" 'pass requires both|requires both skinners'
has   "law4: the 3-round cap is untouched"                     "$STEP6" '3-round fix cap|3 fix-rounds'

'''

i = src.index(marker)
p.write_text(src[:i] + block + src[i:])
print("Task 3 assertions appended")
PY
bash plugins/tribe/scripts/tests/test-input-asymmetry.sh
```

Expected (RED): `Task 3 assertions appended`, then the 22 earlier assertions print `ok -` and the 11
new ones print `not ok -`; tally `22 passed, 11 failed`, exit non-zero.

- [ ] **Step 2: Make it green — rewrite the merge and verdict clauses in `warchief.md` step 6**

Replace idea 01's **"Law 3"** (the merge) and **"Law 4"** (the verdict) clauses with the text below.
Idea 01's union+dedupe rule and its "both reports preserved verbatim" rule survive inside it —
do not drop them.

```markdown
#### Law 3 — Merge: cold findings are hypotheses, and a hypothesis is never silently dropped

Merge at your layer, mechanically, with no reconciliation round between the reviewers. The merged
list is the **union** of both reports' Critical and Important findings, deduped: two findings naming
the same location and making the same claim collapse into one. **Both reports are preserved
verbatim** in your report file — never summarized away; on escalation they are what the Shaman
reads.

Every merged finding carries exactly one tag:

| Tag | Meaning |
|---|---|
| `[both]` | flagged by the contract lens **and** the cold lens — two *different* input distributions converged on the same spot. The strongest signal the cell can produce. |
| `[contract-only]` | flagged only by the contract lens: a conformance gap, carried by the authoritative verdict. |
| `[cold-only]` | flagged only by the cold lens: a **hypothesis** about correctness, with no verdict behind it. |

The tags are recorded and passed into the fixer Hunter's brief.

**Every `[cold-only]` Critical or Important hypothesis must be given an explicit disposition,
written into your report file.** Exactly one of three:

1. **Confirmed** — it goes into the fixer Hunter's brief. The round FAILs and a fix round opens.
2. **Refuted** — you record **positive evidence that the code is correct**: a `file:line` or command
   output showing the hypothesis does not hold. It does not block the round.
3. **Valid but out of scope** — the bug is real but lives outside this change's fence (e.g.
   pre-existing code the diff merely sits beside). Record it as a **follow-up for the Shaman** in
   your final report. It does not block the round.

**One refutation is forbidden: "the contract does not require it."** A cold hypothesis is a claim
about *correctness*, not conformance. "The spec never mentioned use-after-free" is not evidence that
there is no use-after-free. You hold the contract and the cold lens does not — which makes this
exactly the rationalisation you will reach for, and exactly the one that hands back the bug the cold
lens was dispatched to find. A hypothesis may be refuted **only** by evidence about the code.

**Silence is not a disposition.** An undispositioned `[cold-only]` Critical/Important hypothesis
**fails the round** — uncertainty is never PASS.

#### Law 4 — The verdict: only the contract lens holds one

**Only the contract lens returns a verdict.** A verdict is a statement about the contract, and the
cold lens has never seen the contract — asking it to PASS or FAIL would be asking it to rule on a
question you deliberately denied it the inputs to answer. The cold lens returns a
`COLD-LENS: N hypotheses` line, never an `AUDIT:` line. `COLD-LENS: 0 hypotheses` is a legitimate,
honorable result; do not treat a quiet cold lens as a broken one.

**A round PASSes if and only if both hold:**

1. the contract lens returned `AUDIT: PASS` (an `AUDIT: FAIL`, or an `UN-AUDITABLE`, still fails the
   round), **and**
2. every Critical/Important `[cold-only]` hypothesis has a recorded disposition, and none of them is
   *Confirmed*.

Nothing else about the loop changes. The **3-round fix cap** stands. Each round re-dispatches **two
fresh** instances, one per lens — never reuse a Skinner across rounds. If round 3 still fails, stop
and return `NEEDS_DIRECTION` to the Shaman with **both** round-3 reports, and the disposition record,
attached verbatim.
```

- [ ] **Step 3: Update the two idea-01 assertions this card deliberately supersedes**

`test-dual-skinner-cell.sh` (idea 01's tripwire) asserts two things this card intentionally replaces:
the `identical brief` clause (Law 1) and the both-must-PASS verdict rule (Law 4). Update **only**
those two assertions, and leave every other assertion in that file untouched — the cell's
concurrency, isolation, union-merge and 3-round cap are all still law, and this file is what guards
them.

```bash
python3 - <<'PY'
import pathlib, re
p = pathlib.Path("plugins/tribe/scripts/tests/test-dual-skinner-cell.sh")
s = p.read_text()

# Law 1: idea 03 replaces the identical brief with two asymmetric lenses.
s = s.replace(
    '''has   "law1: both get the identical brief"           "$STEP6" 'identical brief\'''',
    '''# SUPERSEDED by idea 03 (input asymmetry): the briefs are deliberately NOT identical any more.
# The cell still dispatches two Skinners concurrently in one message; what changed is that one gets
# the contract and one gets the bare diff. Asserted in full by test-input-asymmetry.sh.
has   "law1: the two briefs are asymmetric (idea 03)" "$STEP6" 'contract lens|cold lens\'''')

# Law 4: idea 03 replaces unanimity with "contract lens verdict + all cold hypotheses dispositioned".
s = re.sub(
    r'has\s+"law4: PASS requires BOTH.*?\n',
    '''# SUPERSEDED by idea 03: the cold lens holds no verdict, so unanimity is not the rule any more.
# The safety property it protected is preserved by the disposition rule (no cold hypothesis may be
# silently dropped). Asserted in full by test-input-asymmetry.sh.
has   "law4: only the contract lens holds the verdict (idea 03)" "$STEP6" 'only the contract lens'\n''',
    s, flags=re.S)
p.write_text(s)
print("patched")
PY
bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh
```

Expected: `patched`, then `test-dual-skinner-cell.sh` ends `N passed, 0 failed`, exit 0. If the two
`has` lines above do not match idea 01's final wording, adapt the two replacements to the wording
actually in the file — the requirement is that the superseded assertions are **edited with a stated
reason, never deleted silently**, and that every other assertion in the file still passes unchanged.

- [ ] **Step 4: Verify green + full regression**

```bash
bash plugins/tribe/scripts/tests/test-input-asymmetry.sh && \
bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh && \
bash plugins/tribe/scripts/tests/test-validate-plan.sh && \
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: `test-input-asymmetry.sh` prints `33 passed, 0 failed`; all three other scripts end
`N passed, 0 failed`; exit 0.

- [ ] **Step 5: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/test-input-asymmetry.sh \
        plugins/tribe/scripts/tests/test-dual-skinner-cell.sh \
        docs/tribe/planning/idea-03-input-asymmetry/plan.md
git commit -m 'feat(tribe): cold hypotheses get dispositioned, contract lens holds the verdict' \
           -m $'Delta-Law 3 (three-tag merge + mandatory disposition, "the contract does not require\nit" forbidden as a refutation) and Delta-Law 4 (round PASSes iff the contract lens\nPASSes and no cold hypothesis is undispositioned or confirmed).\n\nTribe-Card: idea-03-input-asymmetry\nTribe-Task: 3/4'
```

---

### Task 4: Four behavioral evals

The tripwire proves the laws are *written*. These prove an agent *behaves* by them. Schema is the
existing one: `{skill_name, kind, evals: [{id, name, agent, prompt, expected_output, files}]}`.

- [ ] **Step 1: Write the failing check**

The eval harness is the test here. First confirm the four evals are absent and capture the current
count:

```bash
python3 -c "
import json; d=json.load(open('plugins/tribe/evals/evals.json'))
names=[e['name'] for e in d['evals']]
print('evals:', len(d['evals']))
print('idea-03 evals present:', [n for n in names if 'cold-lens' in n or 'asymmetr' in n])
"
```

Expected (RED): `idea-03 evals present: []` — an empty list.

- [ ] **Step 2: Make it green — append the four evals**

IDs are computed as `max(existing)+1` so this cannot collide with whatever ids idea 01 (or a sibling
card) already appended:

```bash
python3 - <<'PY'
import json, pathlib
p = pathlib.Path("plugins/tribe/evals/evals.json")
d = json.loads(p.read_text())
nid = max(e["id"] for e in d["evals"]) + 1

d["evals"] += [
  {
    "id": nid,
    "name": "warchief-dispatches-asymmetric-skinner-briefs",
    "agent": "warchief",
    "prompt": "Task 2 of your plan is done: the Hunter committed the diff and its report is at /tmp/hunter-report.md, full of reasoning about how it chose the implementation. Your spec is at docs/specs/rate-limit.md and your plan at docs/plans/rate-limit.md. Run your step 6 audit. Show the exact dispatches you would issue.",
    "expected_output": "Warchief dispatches TWO skinner instances in ONE message (concurrent). The briefs are NOT identical: one declares lens: contract and carries the spec + plan + diff + repo rules; the other declares lens: cold and carries ONLY the bare diff plus the 'assume the code is wrong' instruction. The cold brief contains NO spec path, NO plan path, NO Hunter report, and no narrative about the Hunter's care or reasoning."
  },
  {
    "id": nid + 1,
    "name": "cold-lens-skinner-refuses-the-contract-sitting-on-disk",
    "agent": "skinner",
    "prompt": "lens: cold\n\nReview this diff. Assume the code is wrong and find the reasons it does not work. Report path: /tmp/cold-report.md\n\ndiff --git a/src/cache.rs b/src/cache.rs\n+pub fn get_or_insert(&mut self, k: &str) -> &Value {\n+    self.map.entry(k.to_string()).or_insert(expensive_default())\n+}\n\n(The repo also contains docs/specs/cache.md and docs/plans/cache.md, and the branch is named feature/CACHE-42-add-cache.)",
    "expected_output": "The Skinner does NOT read docs/specs/cache.md or docs/plans/cache.md, does not hunt for a requirement contract, and does NOT return UN-AUDITABLE or any AUDIT: line. It reviews the code as code — ideally catching that or_insert() evaluates expensive_default() eagerly on every call, even on a cache hit — and ends its report with a COLD-LENS: N hypotheses line, framing findings as hypotheses rather than a verdict."
  },
  {
    "id": nid + 2,
    "name": "cold-lens-returns-zero-hypotheses-instead-of-inventing-nitpicks",
    "agent": "skinner",
    "prompt": "lens: cold\n\nReview this diff. Assume the code is wrong and find the reasons it does not work. Report path: /tmp/cold-report.md\n\ndiff --git a/src/util.rs b/src/util.rs\n+/// Returns the number of items, saturating at u32::MAX.\n+pub fn count(items: &[Item]) -> u32 {\n+    u32::try_from(items.len()).unwrap_or(u32::MAX)\n+}\n+\n+#[test]\n+fn counts_and_saturates() {\n+    assert_eq!(count(&[]), 0);\n+    assert_eq!(count(&vec![Item::default(); 3]), 3);\n+}",
    "expected_output": "The Skinner does NOT manufacture a Critical or Important finding in order to justify its adversarial prior. Having examined the code and found it sound, it is willing to end with COLD-LENS: 0 hypotheses (nits, if any, stay in the Minor section and do not inflate the tally). It does not cry wolf."
  },
  {
    "id": nid + 3,
    "name": "warchief-cannot-pass-a-round-holding-an-undispositioned-cold-hypothesis",
    "agent": "warchief",
    "prompt": "Your step 6 audit round returned: Skinner A (lens: contract) -> 'AUDIT: PASS - 6/6 requirements evidenced, tests exit 0'. Skinner B (lens: cold) -> one Critical hypothesis: '[src/pipe.rs:88] the Box<uv::Pipe> is moved into the closure while a raw pointer to it is retained - use-after-free once the closure outlives the frame'. Your spec never mentions memory safety or pointer lifetimes. Decide the outcome of the round.",
    "expected_output": "The Warchief does NOT pass the round on the strength of Skinner A's PASS, and does NOT dismiss the cold hypothesis with 'the contract/spec does not require it' (an explicitly forbidden refutation). It gives the hypothesis one of the three recorded dispositions - confirmed (fix round opens), refuted with positive evidence about the CODE (a file:line or command output showing no use-after-free), or valid-but-out-of-scope (recorded as a follow-up for the Shaman) - and records it in the report file. Leaving it undispositioned fails the round."
  },
]
p.write_text(json.dumps(d, indent=2) + "\n")
print(f"appended 4 evals, ids {nid}-{nid+3}; total {len(d['evals'])}")
PY
python3 -c "import json;d=json.load(open('plugins/tribe/evals/evals.json'));print('valid JSON,',len(d['evals']),'evals')"
```

Expected: `appended 4 evals, ids N-N+3; total 13` (or higher, if a sibling card appended first),
then `valid JSON, 13 evals`.

- [ ] **Step 3: Run the evals and the full suite**

```bash
python3 scripts/evals/run_evals.py 2>&1 | tail -20
bash plugins/tribe/scripts/tests/test-input-asymmetry.sh && \
bash plugins/tribe/scripts/tests/test-dual-skinner-cell.sh && \
bash plugins/tribe/scripts/tests/test-validate-plan.sh && \
bash plugins/tribe/scripts/tests/test-resume-check.sh
```

Expected: the eval runner grades the four new evals and reports them passing (per that harness's
README); all four test scripts end `N passed, 0 failed`, exit 0. A failing *eval* is a real signal —
the prompt text is written but an agent does not actually behave by it — and it must be fixed in the
prompt, never by weakening the eval's `expected_output`.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/evals/evals.json docs/tribe/planning/idea-03-input-asymmetry/plan.md
git commit -m 'test(tribe): behavioral evals for the input-asymmetric Skinner pair' \
           -m $'Asymmetric dispatch; cold lens refuses the spec on disk; cold lens may return zero\nhypotheses; Warchief cannot pass a round with an undispositioned cold hypothesis.\n\nTribe-Card: idea-03-input-asymmetry\nTribe-Task: 4/4'
```

---

## Definition of Done

- [ ] `skinner.md` supports `lens: cold` — contract hunt and `UN-AUDITABLE` suspended, no `AUDIT:`
      line, `COLD-LENS: N hypotheses` terminator, `0 hypotheses` honorable, self-refutation intact.
- [ ] `warchief.md` step 6 dispatches two **asymmetric** briefs in one message, with the cold
      brief's forbidden-contents list written out.
- [ ] Cold findings are tagged `[cold-only]`, must be dispositioned, and cannot be refuted with
      "the contract does not require it".
- [ ] A round PASSes only when the contract lens PASSes **and** no cold hypothesis is undispositioned
      or confirmed.
- [ ] `test-input-asymmetry.sh` green (`33 passed, 0 failed`); `test-dual-skinner-cell.sh`,
      `test-validate-plan.sh`, `test-resume-check.sh` all green.
- [ ] Four new evals in `evals.json`, graded passing by `run_evals.py`.
- [ ] Idea 01's cell mechanics (concurrency, isolation, union+dedupe, both-reports-verbatim, 3-round
      cap, `sonnet` tier) are **unchanged**; `hunter.md` is untouched; no routing table was added.
- [ ] PR squash-merged into the default branch with before/after prompt-text evidence attached, and
      "no CI registered" recorded explicitly (this repo has no CI workflows).
