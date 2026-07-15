# Plan — Idea 11 cheap-wins wave (Tasks 2, 3a, 3b, 4, evals 1-3)

Implements `spec-cheapwins.md` in this directory (a wave-scoped delta on the settled `spec.md` /
`RESCOPE.md` / `card.md`). Five tasks, strictly serial. Task 3c and eval 4 are explicitly OUT —
do not build them. Base: `feat/advisory-skinner-review-cell` @ `f6a591d` (task 1 already shipped
on this branch: skinner.md's two cold sub-lenses + path-scope contamination rule).

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **Model:** `sonnet` for every Hunter and every Skinner in this campaign.
- **TDD, non-negotiable:** every task writes its failing assertions first, RUNS them to observe the
  predicted RED, then edits, then re-runs to GREEN. Predicted RED/GREEN counts below are the
  author's arithmetic; if the observed number differs, keep the scripts byte-for-byte, report the
  observed number and the reason (precedent: idea-03 task 2 observed 16/7 against a predicted
  13/10 and was right to trust the script).
- **No new worktree:** work directly in the current worktree
  (`/Users/todd.lam/WORK/_TestScripts/todd-skills`), branch `feat/advisory-skinner-review-cell` —
  the Warchief dispatch's constraint 1 pins this branch as the base and the owner reviews it as one
  unit with the advisory-law rewrite; do not open a PR (dispatch constraint 2).
- **Commits:** repo style `type(scope): subject`, imperative; trailers `Tribe-Card:
  idea-11-review-cell-v3` and `Tribe-Task: N/5` (this plan's own Task 1-5 numbering below, which
  maps onto the card's Task 2/3a/3b/4/5 as: plan Task 1=card Task 2, plan Task 2=card Task 3a,
  plan Task 3=card Task 3b, plan Task 4=card Task 4, plan Task 5=card Task 5) on every task commit;
  **no Co-Authored-By and no attribution trailers** (global non-negotiable). Tick this plan's task
  checkboxes in the same commit as the code.
- **D14 per-clause mutation bar (standing ruling):** every NEW tripwire assertion must be proven
  genuine before commit — delete ONLY the clause the assertion guards, run the suite, observe that
  assertion (and only the intended set) go red, restore the clause, observe green. Whole-file
  reverts do not satisfy the bar. Record the mutation transcript in the Hunter report. (Task 1's
  fix rounds 1-3 already fought this bar hard for the skinner.md/cold-lens text; this wave's new
  assertions are narrower in scope — anchor each to the smallest span that contains only its own
  clause, per Task 1's precedent, to avoid repeating those fix rounds.)
- **Phrase preservation:** sibling suites grep step-6 prose. These exact strings must survive every
  warchief.md edit verbatim: `against the diff`, `both reports verbatim`, `un-auditable`,
  `cap fix-rounds at 3`, `union`, `[both]`, `[contract-only]`, `[cold-only]`,
  `two lenses, two briefs, one message`, `two tool uses in the same message`,
  `Skinner B — lens: cold`. Run the full sweep after every edit; an unexpected RED means a phrase
  was broken — restore it rather than editing the assertion.
- **Environment facts (paid for once already; do not rediscover):** macOS/zsh has no `timeout`
  command — never prefix commands with it. BSD grep hard-errors on regex repetition bounds above
  255 — use `.{0,200}` or smaller. Never poll with sleep/echo loops. The Edit tool requires the
  file to have been Read first. Commit trailers silently vanish under bad shell quoting — verify
  with `git log -1 --format='%(trailers)'` after every commit and amend from a file if needed.
- **Eval discipline:** every eval case spawns real `claude -p` executor and grader subprocesses
  (roughly 35-130s and 39k-160k tokens per leg). Always use `--eval-id` subsets and
  `--mode with_skill`; never run the full suite; never re-run a case whose result you already hold.
- **Scope fence:** exactly the files named in `spec-cheapwins.md`'s file table. A change anywhere
  else is scope creep and fails the audit. **Do not touch `skinner.md`, `hunter.md`, warchief.md's
  Law 1 dispatch-count sentence, the confidence-classes table, or the conflict ladder** — those are
  Task 3c's territory, out of scope this wave.

## Sequencing

Plan Task 1 (script) -> Task 2 (path-scope, warchief half; card's 3a) -> Task 3 (pre-gate law;
card's 3b) -> Task 4 (ledger) -> Task 5 (evals 1-3). Task 2 before Task 3 because Task 3's law
references the pre-gate the same step-6 region Task 2 is also editing (serial edits to the same
file, same reason plan.md's original unsplit task 3 gave for keeping them one unit — here split
into two commits instead of one, per RESCOPE.md). Task 5 last because its evals exercise the
prompts Tasks 1-4 finish (eval 23 specifically needs Task 2's warchief-side law to exist).

**Baseline captured fresh at `f6a591d`** (verify these before Task 1 of this plan; report any
drift from the state file's older `db87488` baseline as a `file:line`-grounded observation, not an
error): `test-review-cell-v3.sh` 20/0, `test-input-asymmetry.sh` 47/0, `test-dual-skinner-cell.sh`
31/0, `test-context-isolation.sh` 35/0, `test-fixer-mandate.sh` 28/0, `test-resume-check.sh` 32/0,
`test-validate-plan.sh` 7/0, `test-disagreement-routing.sh` 183/0; `evals.json` 20 evals, max id 20.

### Task 1: `pre-gate.sh` — the mechanical gate, plus its self-test (card's Task 2)

**Contract:** `spec-cheapwins.md` Task 2 section (= `spec.md` Delta-C, script half only). Files:
`plugins/tribe/scripts/pre-gate.sh` (create), `plugins/tribe/scripts/tests/test-review-cell-v3.sh`
(insert new section immediately before the file's final tally block).

- [x] **Step 1: Write the failing test**

Read `plugins/tribe/scripts/tests/test-review-cell-v3.sh` first. Insert the block below
immediately **before** its last two lines (`echo; echo "$pass passed, $fail failed"` /
`[ "$fail" -eq 0 ]`) — do not touch anything above it:

```bash
# --- Task 2 (Delta-C): the pre-gate script exists and behaves -----------------------------
GATE="$HERE/../pre-gate.sh"
if [ -x "$GATE" ]; then echo "ok: c: pre-gate.sh exists and is executable"; pass=$((pass+1)); \
else echo "FAIL: c: pre-gate.sh exists and is executable"; fail=$((fail+1)); fi

if [ "${PREGATE_INNER:-0}" != "1" ]; then
  # Self-test 1 (pass case): sweep this repo's own suites over a 1-commit range, no fence.
  TMPD="$(mktemp -d)"; REPORT="$TMPD/pregate-report.md"
  if [ -x "$GATE" ] && OUT="$(PREGATE_INNER=1 "$GATE" --repo "$HERE/../../../.." \
        --range 'HEAD~1..HEAD' --tests-dir "$HERE" --report "$REPORT" 2>/dev/null)"; then
    echo "$OUT" | grep -q '"verdict": *"pass"' \
      && { echo "ok: c: self-test pass case verdict"; pass=$((pass+1)); } \
      || { echo "FAIL: c: self-test pass case verdict"; fail=$((fail+1)); }
    grep -q 'test-review-cell-v3' "$REPORT" \
      && { echo "ok: c: report names every suite it ran"; pass=$((pass+1)); } \
      || { echo "FAIL: c: report names every suite it ran"; fail=$((fail+1)); }
  else
    echo "FAIL: c: self-test pass case verdict"; fail=$((fail+1))
    echo "FAIL: c: report names every suite it ran"; fail=$((fail+1))
  fi

  # Self-test 2 (red case): a fence that allows nothing must flag every changed file, exit 1.
  FENCE="$TMPD/fence.globs"; echo 'docs/never-matches-anything/**' > "$FENCE"
  if [ -x "$GATE" ]; then
    PREGATE_INNER=1 "$GATE" --repo "$HERE/../../../.." --range 'HEAD~1..HEAD' --tests-dir "$HERE" \
            --report "$TMPD/red.md" --fence "$FENCE" >/dev/null 2>&1
    [ $? -eq 1 ] && { echo "ok: c: fence violation exits 1"; pass=$((pass+1)); } \
                 || { echo "FAIL: c: fence violation exits 1"; fail=$((fail+1)); }
    grep -qi 'fence' "$TMPD/red.md" \
      && { echo "ok: c: violation named in the report"; pass=$((pass+1)); } \
      || { echo "FAIL: c: violation named in the report"; fail=$((fail+1)); }
  else
    echo "FAIL: c: fence violation exits 1"; fail=$((fail+1))
    echo "FAIL: c: violation named in the report"; fail=$((fail+1))
  fi
  rm -rf "$TMPD"
fi
```

Note the `PREGATE_INNER` guard: `pre-gate.sh`'s own self-test sweeps `--tests-dir "$HERE"`, which
contains this very suite — without the guard, the self-test's inner invocation of
`test-review-cell-v3.sh` would re-enter this same self-test block and call `$GATE` again,
recursing. The guard makes the INNER run (invoked BY pre-gate.sh, which exports `PREGATE_INNER=1`
to it) skip straight past its own self-test, while the OUTER run (invoked directly by a human/CI/
another suite, with `PREGATE_INNER` unset) still exercises it.

Run it: `bash plugins/tribe/scripts/tests/test-review-cell-v3.sh`

**Expected RED:** the `pre-gate.sh exists` check and both self-tests fail (script does not exist
yet) — 5 new assertions fail. Tally: `20 passed, 5 failed`. Report the observed split if different.

- [x] **Step 2: Make it green — write the script**

Create `plugins/tribe/scripts/pre-gate.sh`, `chmod +x`. Stateless: every input is a CLI arg,
nothing repo-specific baked in. Use this reference implementation as written unless a defect is
found while testing; report any deviation:

```bash
#!/usr/bin/env bash
# pre-gate.sh — mechanical pre-audit gate (idea 11, review-cell v3).
#
# Runs BEFORE any Skinner is dispatched: sweeps every test-*.sh suite in --tests-dir, checks
# commit-trailer hygiene over --range (Tribe-Card present, Co-Authored-By absent), optionally
# checks every changed file against a fence of allowed globs, writes one Markdown report to
# --report, prints a JSON summary to stdout. Logs to stderr.
# Exit: 0 = all green; 1 = at least one check red; 2 = setup error.
set -euo pipefail
LOG() { printf '[pre-gate] %s\n' "$*" >&2; }
DIE() { LOG "ERROR: $*"; exit 2; }

REPO="" RANGE="" TESTS_DIR="" REPORT="" FENCE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --repo)      REPO="$2"; shift 2 ;;
    --range)     RANGE="$2"; shift 2 ;;
    --tests-dir) TESTS_DIR="$2"; shift 2 ;;
    --report)    REPORT="$2"; shift 2 ;;
    --fence)     FENCE="$2"; shift 2 ;;
    -h|--help)   sed -n '2,10p' "$0"; exit 0 ;;
    *) DIE "unknown argument: $1" ;;
  esac
done
[ -n "$REPO" ] && [ -n "$RANGE" ] && [ -n "$TESTS_DIR" ] && [ -n "$REPORT" ] \
  || DIE "usage: pre-gate.sh --repo P --range R --tests-dir D --report F [--fence GLOBFILE]"
[ -d "$REPO/.git" ] || git -C "$REPO" rev-parse --git-dir >/dev/null 2>&1 \
  || DIE "not a git repo: $REPO"
[ -d "$TESTS_DIR" ] || DIE "tests dir not found: $TESTS_DIR"

overall=pass
suites_json=""
{
  echo "# Pre-gate report"
  echo
  echo "- repo: $REPO"
  echo "- range: $RANGE"
  echo "- generated: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo
  echo "## Suites"
} > "$REPORT"

for t in "$TESTS_DIR"/test-*.sh; do
  [ -e "$t" ] || DIE "no test-*.sh suites found in $TESTS_DIR"
  name="$(basename "$t")"
  set +e; out="$(PREGATE_INNER=1 bash "$t" 2>&1)"; code=$?; set -e
  tally="$(printf '%s\n' "$out" | grep -E '[0-9]+ passed, [0-9]+ failed' | tail -1)"
  [ -n "$tally" ] || tally="(no tally line)"
  status=pass; [ "$code" -eq 0 ] || { status=fail; overall=fail; }
  printf -- '- `%s` — %s — exit %d — %s\n' "$name" "$tally" "$code" "$status" >> "$REPORT"
  suites_json="$suites_json{\"suite\":\"$name\",\"exit\":$code,\"status\":\"$status\"},"
  LOG "$name: exit $code ($tally)"
done

trailer_status=pass
{
  echo
  echo "## Commit trailers ($RANGE)"
} >> "$REPORT"
while IFS= read -r sha; do
  body="$(git -C "$REPO" log -1 --format='%(trailers)' "$sha")"
  ok=yes
  printf '%s' "$body" | grep -q 'Tribe-Card:' || ok=no
  printf '%s' "$body" | grep -qi 'co-authored-by' && ok=no
  if [ "$ok" = yes ]; then
    printf -- '- %s — ok\n' "$sha" >> "$REPORT"
  else
    printf -- '- %s — trailer violation\n' "$sha" >> "$REPORT"
    trailer_status=fail; overall=fail
  fi
done < <(git -C "$REPO" rev-list "$RANGE")

fence_status=skipped
if [ -n "$FENCE" ]; then
  [ -f "$FENCE" ] || DIE "fence file not found: $FENCE"
  fence_status=pass
  { echo; echo "## Scope fence"; } >> "$REPORT"
  while IFS= read -r f; do
    allowed=no
    while IFS= read -r glob; do
      [ -n "$glob" ] || continue
      case "$f" in $glob) allowed=yes ;; esac
      case "$f" in ${glob%/\*\*}/*) allowed=yes ;; esac
    done < "$FENCE"
    if [ "$allowed" = yes ]; then
      printf -- '- %s — in fence\n' "$f" >> "$REPORT"
    else
      printf -- '- %s — FENCE VIOLATION\n' "$f" >> "$REPORT"
      fence_status=fail; overall=fail
    fi
  done < <(git -C "$REPO" diff --name-only "$RANGE")
fi

{
  echo
  echo "## Verdict: $overall"
} >> "$REPORT"
printf '{"range":"%s","suites":[%s],"trailers":"%s","fence":"%s","verdict":"%s"}\n' \
  "$RANGE" "${suites_json%,}" "$trailer_status" "$fence_status" "$overall"
[ "$overall" = pass ]
```

Note vs. the original card-era draft: the inner `bash "$t"` sweep loop now also exports
`PREGATE_INNER=1` to every suite it runs — required so that when the sweep reaches
`test-review-cell-v3.sh` itself, that inner run skips its own self-test block (see Step 1's note).

- [x] **Step 3: Verify green + regression**

```bash
chmod +x plugins/tribe/scripts/pre-gate.sh
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh
for t in input-asymmetry dual-skinner-cell context-isolation fixer-mandate resume-check \
         validate-plan disagreement-routing; do
  echo "== $t"; bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
```

**Expected GREEN:** `25 passed, 0 failed` on `test-review-cell-v3.sh`. All seven sibling suites
green at their baseline counts (this task adds a script + an isolated new section; nothing it
touches overlaps any sibling's assertions). Then run the D14 mutation bar on each of the 5 new
assertions (delete the guarded behavior in `pre-gate.sh` — e.g. comment out the trailer check, or
change `[ "$overall" = pass ]` — run the suite, confirm only the intended assertion(s) go red,
restore). Hand-verify twice: missing required arg exits 2; unknown flag exits 2.

- [x] **Step 4: Commit**

```bash
git add plugins/tribe/scripts/pre-gate.sh plugins/tribe/scripts/tests/test-review-cell-v3.sh \
        docs/tribe/planning/idea-11-review-cell-v3/plan-cheapwins.md
git commit -F- <<'MSG'
feat(tribe): pre-gate.sh — the mechanical gate that runs before any Skinner

Tribe-Card: idea-11-review-cell-v3
Tribe-Task: 1/5
MSG
git log -1 --format='%(trailers)'
```

**Expected:** both trailers print; no Co-Authored-By.

### Task 2: path-scoped cold diff — warchief half (card's Task 3a)

**Contract:** `spec-cheapwins.md` Task 3a. Files: `plugins/tribe/agents/warchief.md` (edit — Law 1
Skinner-B paragraph + forbidden-channel table only; do NOT touch the "two lenses, two briefs, one
message" sentence or the dispatch-count), `test-review-cell-v3.sh` (new section + new `WAR`/`STEP6`
extraction variables).

- [x] **Step 1: Write the failing test**

Read `test-review-cell-v3.sh` first. Add these two extraction variables near the top, right after
the existing `COLD_PATHSCOPE=` block and before `pass=0; fail=0`:

```bash
# warchief.md step 6, whole span (task 2 of this wave onward reads from here). $AGENTS is
# already "$HERE/../../agents" (plugins/tribe/agents), same base $SKIN already reads
# "$AGENTS/skinner.md" from, two lines above.
WAR="$(tr '\n' ' ' < "$AGENTS/warchief.md" | tr -s ' ')"
STEP6="$(awk '/^### 6\./{f=1} /^### 7\./{f=0} f' "$AGENTS/warchief.md" | tr '\n' ' ' | tr -s ' ')"
```

Then insert this section immediately before the file's final tally block:

```bash
# --- Task 3a (Delta-A, warchief half): path-scoped cold diff ------------------------------
has "a: cold diff is path-scoped"              "$STEP6" 'path-scoped'
has "a: planning and state dirs excluded"      "$STEP6" 'docs/tribe/planning.{0,40}docs/tribe/state'
has "a: unscoped range is a forbidden channel" "$STEP6" 'un-scoped full-range diff'
has "a: contract lens diff stays full-range"   "$STEP6" 'contract lens.{0,60}stays full-range'
```

Run it. **Expected RED:** 4 new assertions fail (warchief.md has no path-scope law yet). Tally:
`25 passed, 4 failed`.

- [x] **Step 2: Make it green**

Edit `plugins/tribe/agents/warchief.md`. Add a new row to the "Forbidden in the cold brief" table
(the row list ending `| the other Skinner's findings, verdict, report path, or existence | Law 2,
unchanged |`) — append immediately after it, inside the same table:

```markdown
| an un-scoped full-range diff | the tribe's contract documents live in-repo, so the full range hands the cold lens the contract |
```

Then, after the paragraph ending "What it is denied is the statement of what the code was
*supposed* to do." and before "**Law 2 — never let them see each other.**", insert:

```markdown
**The cold lens's diff is path-scoped, not just its brief.** Build it with an explicit exclusion
list covering, at minimum, `docs/tribe/planning/`, `docs/tribe/state/`, and any file that is a
committed contract document for the card under audit — the tribe's specs, plans, and idea cards
live in-repo, so an un-scoped full-range diff hands the cold lens the contract exactly as
effectively as putting it in the brief would (the forbidden-channel table above names this). The
**contract lens's diff stays full-range**: it already holds the contract, so narrowing it would
only blind the conformance check, never protect anything.
```

- [x] **Step 3: Verify green + regression**

```bash
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh
for t in input-asymmetry dual-skinner-cell context-isolation fixer-mandate resume-check \
         validate-plan disagreement-routing; do
  echo "== $t"; bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
```

**Expected GREEN:** `29 passed, 0 failed`. All seven siblings green at baseline — this edit adds
content inside Law 1's existing paragraph and table; it does not delete or reword any phrase the
Global Constraints' preservation list names. If any sibling reds, that phrase was touched
unintentionally — restore it. Run D14 mutation bar on the 4 new assertions.

- [x] **Step 4: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/test-review-cell-v3.sh \
        docs/tribe/planning/idea-11-review-cell-v3/plan-cheapwins.md
git commit -F- <<'MSG'
feat(tribe): path-scope the cold lens's diff, not just its brief (warchief half)

Tribe-Card: idea-11-review-cell-v3
Tribe-Task: 2/5
MSG
git log -1 --format='%(trailers)'
```

### Task 3: the pre-gate step-6.0 law (card's Task 3b)

**Contract:** `spec-cheapwins.md` Task 3b. Files: `plugins/tribe/agents/warchief.md` (edit — insert
a step-6.0 preamble; do not touch Law 1/2/3/4 text), `test-review-cell-v3.sh` (new section).

- [x] **Step 1: Write the failing test**

Insert immediately before the final tally block:

```bash
# --- Task 3b (Delta-C, law half): the pre-gate step-6.0 law --------------------------------
has "c: pre-gate runs before any skinner"      "$STEP6" 'pre-gate.{0,60}before dispatching any skinner'
has "c: red pre-gate is not an audit round"    "$STEP6" 'red pre-gate.{0,160}not an audit round'
has "c: contract brief carries the report"     "$STEP6" \
    'contract lens.s brief carries.{0,60}pre-gate.s report.{0,80}settled mechanical fact'
has "c: cold brief does not carry it"          "$STEP6" 'cold lens.s brief does.{0,10}not.{0,10}carry it'
has "c: the mandatory full-sweep clause is retired" "$STEP6" 'stop mandating full-suite re-runs'
```

Run it. **Expected RED:** 5 new assertions fail. Tally: `29 passed, 5 failed`.

- [x] **Step 2: Make it green**

Edit `plugins/tribe/agents/warchief.md`. Insert this new paragraph after "...Delivery may proceed
only when the final audit's fix list is empty and every Critical/Important finding it carries ends
REFUTED-with-evidence or legal DEBT." and before "**Law 1 — two lenses, two briefs, one message.**":

```markdown
**Step 6.0 — run the pre-gate before dispatching any Skinner.** Run
`plugins/tribe/scripts/pre-gate.sh` against the range under audit before dispatching any Skinner. A
red pre-gate means the deliverable is mechanically incomplete — that is the Hunter's unfinished
work, not an audit round: route the script's report back to a fixer Hunter as an ordinary
incomplete-deliverable follow-up, and dispatch no Skinner against a mechanically broken branch. An
audit round begins only on a green pre-gate, so a red pre-gate consumes no fix round. On a green
pre-gate, the contract lens's brief carries the pre-gate's report (path or content) as **settled
mechanical fact** — machine output of committed scripts run against the committed diff,
contract-class by the D9 admissibility test, never the code side's prose; the cold lens's brief
does **not** carry it. Reviewer briefs stop mandating full-suite re-runs: the contract lens still
runs whatever proof the contract requires and may re-run any suite to falsify a specific
hypothesis; the cold lens runs whatever its own method already mandates, unchanged.
```

- [x] **Step 3: Verify green + regression**

```bash
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh
for t in input-asymmetry dual-skinner-cell context-isolation fixer-mandate resume-check \
         validate-plan disagreement-routing; do
  echo "== $t"; bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
```

**Expected GREEN:** `34 passed, 0 failed`. All seven siblings green at baseline. D14 mutation bar
on the 5 new assertions.

- [x] **Step 4: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/test-review-cell-v3.sh \
        docs/tribe/planning/idea-11-review-cell-v3/plan-cheapwins.md
git commit -F- <<'MSG'
feat(tribe): step-6.0 — the mechanical pre-gate runs before any Skinner is dispatched

Tribe-Card: idea-11-review-cell-v3
Tribe-Task: 3/5
MSG
git log -1 --format='%(trailers)'
```

### Task 4: ledger `lens` column + `## Reviewer yield` table (card's Task 4)

**Contract:** `spec-cheapwins.md` Task 4. Files: `plugins/tribe/agents/warchief.md` (the "Recording
it — the disposition ledger" subsection only), `test-review-cell-v3.sh` (new section).

- [ ] **Step 1: Write the failing test**

Add this extraction variable near `WAR`/`STEP6` (top of file):

```bash
RECORD="$(awk '/^#### Recording it/{f=1} /^\*\*The fixer brief/{f=0} f' "$AGENTS/warchief.md" \
          | tr '\n' ' ' | tr -s ' ')"
```

Insert immediately before the final tally block:

```bash
# --- Task 4 (Delta-D): the ledger's lens column + Reviewer-yield table ---------------------
has "d: ledger gains a lens column"        "$RECORD" 'lens.{0,120}contract.{0,20}cold-exec.{0,20}cold-read'
has "d: multi-lens findings comma-join"    "$RECORD" 'comma-joined when more than one lens'
has "d: reviewer-yield table exists"       "$RECORD" 'reviewer yield'
has "d: yield rows are per lens"           "$RECORD" 'one row per lens'
has "d: yield columns named"               "$RECORD" \
    'raised.{0,40}unique.{0,40}confirmed.{0,40}refuted.{0,40}out-of-scope'
has "d: derived from the ledger only"      "$RECORD" 'derived entirely from the ledger'
has "d: non-authoritative, never resume"   "$RECORD" 'non-authoritative.{0,80}never.{0,40}resume'
has "d: cold-read may show zero dispatches" "$RECORD" 'cold-read.{0,160}zero dispatches'
has "d: the shaman decides from data"      "$RECORD" 'shaman.{0,120}from data'
```

Run it. **Expected RED:** all 9 fail. Tally: `34 passed, 9 failed`.

- [ ] **Step 2: Make it green**

Edit `plugins/tribe/agents/warchief.md`. In the ledger column table (the one with `class`/`routed`
rows), add a third row right after the `routed` row:

```markdown
| `lens` | you, per round | `contract` / `cold-exec` / `cold-read`, comma-joined when more than one lens raised the finding |
```

Also reword the subsection's own heading and opening line from "gains two columns" /
"two columns that **you** fill" to "gains three columns" / "three columns that **you** fill"
(arithmetic correction only — no other wording in that sentence changes).

Then, after the paragraph ending "**Classes are re-derivable this way; how many tie-breaks a key
has already spent is not — that is history, and history must be written down**, which is exactly
what the state file's `## Tie-breaks spent` heading is for." and before "**The fixer brief — a
finding is a hypothesis, not an order.**", insert:

```markdown
**The `## Reviewer yield` table — the cell, measured.** When a round's merge completes, append one
small table to your report file under `## Reviewer yield`: one row per lens (`contract`,
`cold-exec`, `cold-read`), columns `raised / unique / confirmed / refuted / out-of-scope` ("unique"
= no other lens raised the location). It is derived entirely from the ledger's rows for that round
— no new bookkeeping source — and like the report file itself it is non-authoritative and never
used for resume. While the cell dispatches only `contract` and `cold-exec` (the current two-lens
Law 1), `cold-read`'s row legitimately shows zero dispatches — that is correct data, not a bug,
unless and until a future card wires a second cold lens in. Its consumer is the Shaman, deciding
from data after enough campaigns whether each seat earns its place: which lens finds, which lens
confirms, which lens only echoes.
```

- [ ] **Step 3: Verify green + regression**

```bash
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh
for t in input-asymmetry dual-skinner-cell context-isolation fixer-mandate resume-check \
         validate-plan disagreement-routing; do
  echo "== $t"; bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
```

**Expected GREEN:** `43 passed, 0 failed`. All seven siblings green at baseline. D14 mutation bar
on the 9 new assertions.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/test-review-cell-v3.sh \
        docs/tribe/planning/idea-11-review-cell-v3/plan-cheapwins.md
git commit -F- <<'MSG'
feat(tribe): ledger lens column + reviewer-yield table — the cell, measured

Tribe-Card: idea-11-review-cell-v3
Tribe-Task: 4/5
MSG
git log -1 --format='%(trailers)'
```

### Task 5: three behavioral evals — ids 21, 22, 23, NOT 24 (card's Task 5, evals 1-3)

**Contract:** `spec-cheapwins.md` Task 5. Files: `plugins/tribe/evals/evals.json` (append 3 cases,
ids 21-23), `plugins/tribe/scripts/tests/test-input-asymmetry.sh` (one pre-authorized one-line
bump: `evals-file-has-20-evals` → `evals-file-has-23-evals`, `== 20` → `== 23`, D22 precedent, bump
by exactly 3 — NOT 4, because eval 4 is out of scope this wave). Touch nothing else. If any new
eval fails reproducibly and the fix would require editing warchief.md/skinner.md, STOP and report —
prompts are tasks 2-4's territory (shipped precedent: idea-03 task 4).

- [ ] **Step 1: RED check, then append the cases**

```bash
python3 - <<'PY'
import json
e = json.load(open('plugins/tribe/evals/evals.json'))
cases = e['evals'] if isinstance(e, dict) else e
ids = sorted(c['id'] for c in cases)
print('count:', len(cases), 'max id:', ids[-1])
assert not any('cold-executor' in c.get('name','') for c in cases), 'idea-11 evals already present'
PY
```

**Expected RED-equivalent:** prints `count: 20 max id: 20`, assertion passes (no idea-11 eval
exists yet). Then append three cases via a python3 heredoc (never hand-edit the JSON), ids 21-23:

1. id 21, `agent: skinner`, name `cold-executor-cites-the-run-that-manifests-the-defect`. Prompt: a
   `lens: cold-executor` dispatch carrying a small inline diff of a shell function with a real
   runtime defect (an unquoted variable that word-splits on spaces — embed the function and a
   sample invocation in the prompt, plus a note that no spec/plan is available — dispatch is
   cold). Expected output: a Critical or Important hypothesis naming the defect AND quoting the
   command it ran with the output that manifests it; ends with a `COLD-LENS:` line; no `AUDIT:`
   line.
2. id 22, `agent: skinner`, name `cold-reader-finds-the-contradiction-without-running-suites`.
   Prompt: a `lens: cold-reader` dispatch carrying an inline diff of a prose rule file that states
   two mutually contradictory rules, plus a note that a tests directory exists at a stated path.
   Expected output: an Important-or-higher hypothesis naming the two contradictory clauses; the
   transcript contains no test-suite execution; ends with `COLD-LENS:`, no `AUDIT:` line.
3. id 23, `agent: warchief`, name `warchief-refuses-the-contract-bearing-cold-range`. Prompt: the
   Warchief is about to dispatch the cell for a card whose stated diff range's file list (given
   inline) includes `docs/tribe/planning/some-card/spec.md`. Expected output: it path-scopes the
   cold diff to exclude the planning file (or treats the unscoped dispatch as contaminated and
   re-scopes) BEFORE dispatching; it does not hand the full range to the cold lens; no fix round
   is consumed.

Every prompt must CLOSE THE WORLD — embed the diff and every file the agent needs inline, so the
agent never stalls asking for repo access (the eval-16 deflake lesson).

Then the pre-authorized sibling bump in `test-input-asymmetry.sh`: change
`out("evals-file-has-20-evals", len(evals) == 20)` to
`out("evals-file-has-23-evals", len(evals) == 23)` — one line, comment it
`# idea 11 cheap-wins wave adds 3 evals (ids 21-23) — D22 precedent; eval 4/id 24 is deferred (Task 3c)`.

- [ ] **Step 2: Run the three new evals**

```bash
python3 scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json \
  --eval-id 21,22,23 --mode with_skill --verbose
```

**Expected:** all three `with_skill PASS`. A reproducible FAIL is a stop condition per this task's
contract: report it, do not commit, do not weaken any `expected_output`.

- [ ] **Step 3: Regression sweep**

```bash
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh
for t in input-asymmetry dual-skinner-cell context-isolation fixer-mandate resume-check \
         validate-plan disagreement-routing; do
  echo "== $t"; bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
python3 - <<'PY'
import json
e = json.load(open('plugins/tribe/evals/evals.json'))
cases = e['evals'] if isinstance(e, dict) else e
ids = [c['id'] for c in cases]
assert len(ids) == len(set(ids)), 'duplicate eval ids'
print('evals:', len(cases), '— ids unique, JSON valid')
PY
```

**Expected GREEN:** `test-review-cell-v3.sh` unchanged at `43 passed, 0 failed`; all siblings green,
`input-asymmetry` green with its bumped count; `evals: 23 — ids unique, JSON valid`.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/evals/evals.json plugins/tribe/scripts/tests/test-input-asymmetry.sh \
        docs/tribe/planning/idea-11-review-cell-v3/plan-cheapwins.md
git commit -F- <<'MSG'
test(tribe): three behavioral evals for the cheap-wins wave (executor runs, reader reads, gate scopes)

Sibling eval-count assertion bumped by 3 per the D22 precedent (arithmetic, not law). Eval 4
(cold+cold agreed convergence) is deferred with Task 3c, per owner Decision 1 — not built here.

Tribe-Card: idea-11-review-cell-v3
Tribe-Task: 5/5
MSG
git log -1 --format='%(trailers)'
```

**Expected:** both trailers print; no Co-Authored-By.

## After Task 5: truncated delivery

Per the Warchief dispatch's constraint 2, stop here. Do not open a PR, do not push, do not merge.
Run the FINAL whole-branch audit (fresh dual-Skinner cell, per warchief.md step 6, against the
full range of this wave's 5 commits) before declaring the wave's own audit closed, then report
`SHIPPED` (truncated) to the Shaman with the evidence transcribed into the report file.
