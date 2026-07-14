# Plan — Idea 11: review-cell v3 (method asymmetry, mechanical pre-gate, measured reviewers)

Implements `spec.md` in this directory. Five tasks, strictly serial. The spec is settled law: do
not re-brainstorm it. Card tasks T1-T4 map to plan tasks 1-4; plan task 5 is the behavioral-eval
proof (same split every shipped card used).

## Global Constraints

- **Implementer: the `hunter` subagent** — one Hunter per task, dispatched by the Warchief with
  this plan section plus the one task section as the brief. The Warchief never edits files itself.
- **Model:** `sonnet` for every Hunter and every Skinner in this campaign.
- **TDD, non-negotiable:** every task writes its failing assertions first, RUNS them to observe
  the predicted RED, then edits, then re-runs to GREEN. Predicted RED/GREEN counts in this plan
  are the author's arithmetic; if the observed number differs, keep the scripts byte-for-byte,
  report the observed number and the reason (precedent: idea-03 task 2 observed 16/7 against a
  predicted 13/10 and was right to trust the script).
- **Worktree isolation:** all work happens in a dedicated worktree on branch
  `feat/idea-11-review-cell-v3`, branched from current master.
- **Commits:** repo style `type(scope): subject`, imperative; trailers `Tribe-Card:
  idea-11-review-cell-v3` and `Tribe-Task: N/5` on every task commit; **no Co-Authored-By and no
  attribution trailers** (global non-negotiable, D8). Tick the task's plan checkboxes in the same
  commit as the code (D8 precedent).
- **D14 per-clause mutation bar (standing ruling):** every NEW or EDITED tripwire assertion must
  be proven genuine before commit — delete ONLY the clause the assertion guards, run the suite,
  observe that assertion (and only the intended set) go red, restore the clause, observe green.
  Whole-file reverts do not satisfy the bar. Record the mutation transcript in the Hunter report.
- **Deliberate supersession rule (spec, Testing strategy):** a shipped assertion this card
  invalidates is EDITED with a justification comment naming this card — never deleted silently.
  Only the assertions enumerated in the spec's supersession list may be touched.
- **Phrase preservation:** sibling suites grep step-6 prose. Unless a phrase is on the spec's
  supersession list, these exact strings must survive every warchief.md edit verbatim:
  `against the diff`, `both reports verbatim`, `un-auditable`, `cap fix-rounds at 3`,
  `union`, `[both]`, `[contract-only]`, `[cold-only]`. Run the full sweep after every edit;
  an unexpected RED means a phrase was broken — restore it rather than editing the assertion.
- **Environment facts (paid for once already; do not rediscover):** macOS/zsh has no `timeout`
  command — never prefix commands with it. BSD grep hard-errors on regex repetition bounds above
  255 — use `.{0,200}` or smaller. Never poll with sleep/echo loops — use a blocking
  `until` loop. The Edit tool requires the file to have been Read first — read before editing.
  Commit trailers silently vanish under bad shell quoting — verify with
  `git log -1 --format='%(trailers)'` after every commit and amend from a file if needed
  (`git commit --amend -F msgfile`).
- **Eval discipline:** every eval case spawns real `claude -p` executor and grader subprocesses
  (roughly 35-130s and 39k-160k tokens per leg). Always use `--eval-id` subsets and
  `--mode with_skill`; never run the full suite; never re-run a case whose result you already
  hold from this task.
- **Scope fence:** exactly the files named in the spec's file-by-file table. A change anywhere
  else is scope creep and fails the audit.

## Sequencing

Task 1 → 2 → 3 → 4 → 5, strictly serial; each task's commit is the next task's baseline.
Task 1 (skinner.md) before task 3 (warchief.md) because step 6's new law names the two sub-lens
values task 1 defines. Task 2 (the script) before task 3 because step-6.0's law names the script.
Task 5 last because its evals exercise the prompts tasks 1-4 finished.

### Task 1: skinner.md — the two cold sub-lenses and the path-scope contamination rule

**Contract for this task:** spec Delta-A (skinner.md half) and Delta-B1 (the sub-lens
definitions). Files: `plugins/tribe/agents/skinner.md` (edit),
`plugins/tribe/scripts/tests/test-review-cell-v3.sh` (create). Do not touch warchief.md — its
half of Delta-A/B is task 3.

- [ ] **Step 1: Write the failing test**

Create `plugins/tribe/scripts/tests/test-review-cell-v3.sh` with the shared harness its siblings
use (flattened haystacks, `has`/`hasnt`, per-section extraction — copy the harness pattern from
`test-input-asymmetry.sh`, which this repo treats as the reference implementation of the
pattern). Section 1 of the suite asserts against skinner.md ONLY:

```bash
#!/usr/bin/env bash
# test-review-cell-v3.sh — contract tripwire for idea 11 (review-cell v3).
#
# TRIPWIRE, not a behavior test: proves the card's laws are WRITTEN into the agent prompts and
# the pre-gate script exists and behaves; behavior is proved by evals.json ids added by task 5.
# Offline, no network. Idea 11 is a DELTA on shipped ideas 01/02/03/04/05 — the dependency
# assertions below fail loudly if run before those baselines are present.
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$HERE/../../agents"
SKIN="$(tr '\n' ' ' < "$AGENTS/skinner.md" | tr -s ' ')"
# Cold-lens section only (never whole-file): everything from the lens-mode heading to
# '## Operating rules'. Sub-lens subsections use #### so they stay inside this span.
COLD="$(awk '/^## Lens mode/{f=1} /^## Operating rules/{f=0} f' "$AGENTS/skinner.md" \
        | tr '\n' ' ' | tr -s ' ')"
pass=0; fail=0
has()   { if echo "$2" | grep -qiE "$3"; then echo "ok: $1"; pass=$((pass+1)); \
          else echo "FAIL: $1 (missing: $3)"; fail=$((fail+1)); fi; }
hasnt() { if echo "$2" | grep -qiE "$3"; then echo "FAIL: $1 (found what must be gone: $3)"; \
          fail=$((fail+1)); else echo "ok: $1"; pass=$((pass+1)); fi; }

# --- Dependency check: idea 03's cold lens must already exist ------------------------------
has "dep: lens-mode section exists"          "$SKIN" 'lens mode.{0,40}contract.{0,20}default'
has "dep: cold lens exists"                  "$COLD" 'lens.{0,4}cold.{0,40}bare-diff reviewer'

# --- Delta-B1: the two sub-lenses ----------------------------------------------------------
has "b1: cold-executor subsection exists"    "$COLD" 'lens.{0,4}cold-executor'
has "b1: cold-reader subsection exists"      "$COLD" 'lens.{0,4}cold-reader'
has "b1: executor must run things"           "$COLD" 'cold-executor.{0,600}must run'
has "b1: executor findings cite command output" "$COLD" 'cite.{0,80}command.{0,40}output'
has "b1: reading with no run is not an executor finding" "$COLD" \
    'no run behind it.{0,80}minor'
has "b1: reader must not execute the suites" "$COLD" \
    'cold-reader.{0,600}must not (execute|run).{0,60}(test|eval|suite)'
has "b1: reader inspect-vs-execute line drawn" "$COLD" \
    'inspect.{0,120}reading, not executing'
has "b1: bare cold deprecation ruling"       "$COLD" \
    'lens: cold.{0,80}(read|treated) as.{0,20}cold-executor'
has "b1: both sub-lenses inherit the cold base rules" "$COLD" \
    'inherit.{0,120}cold'
# The shipped cold base must survive intact for both sub-lenses:
has "base: never seeks the denied contract"  "$COLD" 'must not read it'
has "base: hypotheses not a verdict"         "$COLD" 'hypotheses, not a verdict'
has "base: self-refutation applies in full"  "$COLD" 'self-refutation.{0,40}applies in full'
has "base: cold-lens terminator survives"    "$COLD" 'cold-lens: n hypotheses'

# --- Delta-A: path-scope contamination (skinner.md half) -----------------------------------
has "a: contract-bearing diff is contamination" "$COLD" \
    '(diff|range).{0,120}(spec|plan|idea card|state file).{0,160}contaminat'
has "a: refusal reuses the shipped mechanism" "$COLD" 'audit: fail .{0,4}contaminated'

echo; echo "$pass passed, $fail failed"
[ "$fail" -eq 0 ]
```

Run it:

```bash
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh
```

**Expected RED:** the 2 dependency assertions and the 4 `base:` assertions pass against shipped
skinner.md; the remaining 11 fail (no sub-lenses, no path-scope rule yet). Roughly
`6 passed, 11 failed`, exit 1. Report the observed split.

- [ ] **Step 2: Make it green — restructure the cold-lens section**

Edit `plugins/tribe/agents/skinner.md`. Keep the `### lens: cold — the bare-diff reviewer`
heading and every shipped rule under it (they are the shared base both sub-lenses inherit — the
existing suites assert them and they must stay green). Then, after the shipped
`COLD-LENS: 0 hypotheses` paragraph and before `## Operating rules`, append the two method
subsections and the two new rules, in this shape (adjust surrounding prose to read naturally;
the load-bearing sentences below must land verbatim or near-verbatim so section-1 assertions and
future siblings can anchor on them):

```markdown
#### `lens: cold-executor` — the cold lens that runs

Everything in `lens: cold` above, unchanged — plus a method MANDATE: you **must run** things.
Execute the changed scripts and evals, mutate a guarded clause and confirm its tripwire actually
trips, feed edge inputs to the changed code paths. Every Critical or Important hypothesis you
emit must **cite the command output** you ran — the command and what it printed, inside the
finding. A reading with no run behind it is not an executor finding: it goes under Minor / nits
at most.

#### `lens: cold-reader` — the cold lens that reads

Everything in `lens: cold` above, unchanged — plus a method RESTRICTION: you **must not execute**
the repo's test or eval suites; a mechanical pre-gate has already run them and your dispatch is
predicated on its green result. Your job is the static adversarial pass: internal contradictions,
two rules that cannot both be true, evaluation order, idiom errors, silently swallowed failures.
Running a one-liner to **inspect** state (a grep, a git show) is reading, not executing, and stays
allowed; the line you may not cross is executing the suites and evals themselves.

Both sub-lenses **inherit** every `lens: cold` rule above: the contract stays denied, hypotheses
not a verdict, self-refutation applies in full, and the `COLD-LENS:` terminator is still how you
end. A dispatch naming bare `lens: cold` (the pre-split value) is **read as `lens: cold-executor`**
— the tie-break Skinner C's question is mechanically decidable by construction, which is the
executor's method.

**Path-scope contamination (extends the Operating-rules seal from brief to RANGE):** your diff
must be path-scoped to operative code. If the diff or range your cold dispatch carries contains a
spec, a plan, an idea card, or a campaign state file, that is a contaminated dispatch — refuse
with `AUDIT: FAIL — CONTAMINATED: <what leaked>` exactly as the Operating rules below define,
before lens-specific review begins. Same mechanism, same precedence, same "consumes no fix round"
accounting; nothing new is invented here.
```

- [ ] **Step 3: Verify green + regression**

```bash
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh
for t in input-asymmetry dual-skinner-cell context-isolation fixer-mandate resume-check \
         validate-plan disagreement-routing; do
  echo "== $t"; bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
```

**Expected GREEN:** `17 passed, 0 failed` on the new suite. All seven sibling suites green at
their shipped counts — task 1 adds subsections inside the cold section and touches no phrase the
siblings pin. If any sibling assertion reds, restore the phrase (it is NOT on this task's
supersession list — task 1 has none). Then run the D14 per-clause mutation bar on every new
assertion (delete the guarded clause, observe that assertion red, restore).

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/skinner.md plugins/tribe/scripts/tests/test-review-cell-v3.sh \
        docs/tribe/planning/idea-11-review-cell-v3/plan.md
git commit -F- <<'MSG'
feat(tribe): two cold sub-lenses and the path-scoped cold diff (skinner side)

Tribe-Card: idea-11-review-cell-v3
Tribe-Task: 1/5
MSG
git log -1 --format='%(trailers)'
```

**Expected:** both trailers print; no Co-Authored-By.

### Task 2: `pre-gate.sh` — the mechanical gate, plus its self-test

**Contract for this task:** spec Delta-C (the script half only; the step-6.0 law is task 3).
Files: `plugins/tribe/scripts/pre-gate.sh` (create),
`plugins/tribe/scripts/tests/test-review-cell-v3.sh` (append section 2).

- [ ] **Step 1: Write the failing test**

Append section 2 to `test-review-cell-v3.sh`, before the final tally (keep one tally for the
whole suite):

```bash
# --- Delta-C: the pre-gate script exists and behaves ---------------------------------------
GATE="$HERE/../pre-gate.sh"
if [ -x "$GATE" ]; then echo "ok: c: pre-gate.sh exists and is executable"; pass=$((pass+1)); \
else echo "FAIL: c: pre-gate.sh exists and is executable"; fail=$((fail+1)); fi

# Self-test 1 (pass case): sweep this repo's own suites over a 1-commit range, no fence.
TMPD="$(mktemp -d)"; REPORT="$TMPD/pregate-report.md"
if [ -x "$GATE" ] && OUT="$("$GATE" --repo "$HERE/../../../.." --range 'HEAD~1..HEAD' \
      --tests-dir "$HERE" --report "$REPORT" 2>/dev/null)"; then
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

# Self-test 2 (red case): a fence that allows nothing must flag every changed file and exit 1.
FENCE="$TMPD/fence.globs"; echo 'docs/never-matches-anything/**' > "$FENCE"
if [ -x "$GATE" ]; then
  "$GATE" --repo "$HERE/../../../.." --range 'HEAD~1..HEAD' --tests-dir "$HERE" \
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
```

**Expected RED:** all 5 new assertions fail (`$GATE` does not exist), suite exits 1 with
`17 passed, 5 failed`.

- [ ] **Step 2: Make it green — write the script**

Create `plugins/tribe/scripts/pre-gate.sh`, `chmod +x`. Stateless: every input is a CLI arg,
nothing repo-specific baked in (repo-wide skill-authoring rule). Reference implementation — use
it as written unless a defect is found while testing, and report any deviation:

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
  set +e; out="$(bash "$t" 2>&1)"; code=$?; set -e
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

- [ ] **Step 3: Verify green + regression**

```bash
chmod +x plugins/tribe/scripts/pre-gate.sh
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh
for t in input-asymmetry dual-skinner-cell context-isolation fixer-mandate resume-check \
         validate-plan disagreement-routing; do
  echo "== $t"; bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
```

**Expected GREEN:** `22 passed, 0 failed` on the new suite (note the self-test recursion: the
pre-gate sweeps the tests dir, which now contains this suite, which runs the pre-gate — the
self-test call passes `--tests-dir` pointing at the SAME dir, so guard against infinite recursion
by having the suite skip its own section 2 when an env var `PREGATE_INNER=1` is set, and have the
self-test invocation export it; implement that guard, it is expected and in-scope). All seven
sibling suites green unchanged. Script edge cases to hand-verify once each: missing arg exits 2;
unknown flag exits 2.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/scripts/pre-gate.sh plugins/tribe/scripts/tests/test-review-cell-v3.sh \
        docs/tribe/planning/idea-11-review-cell-v3/plan.md
git commit -F- <<'MSG'
feat(tribe): pre-gate.sh — the mechanical gate that runs before any Skinner

Tribe-Card: idea-11-review-cell-v3
Tribe-Task: 2/5
MSG
git log -1 --format='%(trailers)'
```

**Expected:** both trailers print; no Co-Authored-By.

### Task 3: warchief.md step 6 — the three-lens cell, the pre-gate law, and the routing deltas

**Contract for this task:** spec Delta-A (warchief half), Delta-B1 through B5, Delta-C (the law
half). Files: `plugins/tribe/agents/warchief.md` (edit), `test-review-cell-v3.sh` (append
section 3), plus the enumerated deliberate supersessions in `test-dual-skinner-cell.sh`,
`test-input-asymmetry.sh`, `test-disagreement-routing.sh`. This is the big task; work the steps
in order and keep every edit inside step 6 and the enumerated consistency sites.

- [ ] **Step 1: Write the failing test**

Append section 3 to `test-review-cell-v3.sh` (asserting against warchief.md's step-6 span,
extracted the way `test-dual-skinner-cell.sh` extracts it):

```bash
# --- Section 3: warchief.md step 6, three-lens law -----------------------------------------
WAR="$(tr '\n' ' ' < "$AGENTS/warchief.md" | tr -s ' ')"
STEP6="$(awk '/^### 6\./{f=1} /^### 7\./{f=0} f' "$AGENTS/warchief.md" | tr '\n' ' ' | tr -s ' ')"

# Delta-B1: three lenses, three briefs, one message
has "b1: three tool uses in the same message"  "$STEP6" 'three tool uses in the same message'
has "b1: step 6 audits with three lenses"      "$STEP6" 'one contract lens.{0,60}two cold lenses'
has "b1: cold-executor named in the law"       "$STEP6" 'lens: cold-executor'
has "b1: cold-reader named in the law"         "$STEP6" 'lens: cold-reader'
hasnt "b1: the two-tool-use clause is gone"    "$STEP6" 'two tool uses in the same message'
has "b1: law 2 applies pairwise across all three" "$STEP6" 'pairwise across all three'

# Delta-A: path-scoped cold diff (warchief half)
has "a: cold diff is path-scoped"              "$STEP6" 'path-scoped to operative code'
has "a: planning and state dirs excluded"      "$STEP6" 'docs/tribe/planning.{0,40}docs/tribe/state'
has "a: unscoped range is a forbidden channel" "$STEP6" 'un-scoped full-range diff'
has "a: contract lens diff stays full-range"   "$STEP6" 'contract lens.{0,120}full-range'

# Delta-B2/B3: tags and the verdict quantifier
has "b2: both means contract plus at least one cold" "$STEP6" \
    'contract lens and at least one cold lens'
has "b2: cold-only covers one or both cold lenses"   "$STEP6" \
    'one or both cold lenses'
has "b3: round-pass quantifies over either cold lens" "$STEP6" \
    'from either cold lens'

# Delta-B4: agreed is two-of-three
has "b4: agreed is at least two of the three"  "$STEP6" \
    'at least two of the three lenses'
has "b4: two cold lenses converging count"     "$STEP6" \
    'both cold lenses converge.{0,120}contract lens is silent'

# Delta-B5: rung-2 free majority
has "b5: check the third cell member first"    "$STEP6" \
    'third cell member already voted'
has "b5: no tie-break key is spent on a free majority" "$STEP6" \
    'spend no tie-break key'
has "b5: c dispatched only when the third lens is silent" "$STEP6" \
    'third lens is silent.{0,120}dispatch'

# Delta-C: the pre-gate law
has "c: pre-gate runs before any skinner"      "$STEP6" \
    'pre-gate.{0,120}before dispatching any skinner'
has "c: red pre-gate is not an audit round"    "$STEP6" \
    'red pre-gate.{0,200}not an audit round'
has "c: contract brief carries the report"     "$STEP6" \
    'contract lens.{0,200}pre-gate.{0,60}report.{0,120}settled mechanical fact'
has "c: cold briefs do not carry it"           "$STEP6" \
    'cold lenses.{0,200}do not carry'
has "c: the mandatory full-sweep clause is retired" "$STEP6" \
    'stop mandating full-suite re-runs'
echo
```

Run the suite. **Expected RED:** all 23 new section-3 assertions fail against shipped
warchief.md (`22 passed, 23 failed` overall); sections 1-2 stay green.

- [ ] **Step 2: Make it green — rewrite the step-6 law**

Edit `plugins/tribe/agents/warchief.md` step 6 per the spec's Delta-A/B/C, keeping the
preservation-list phrases intact. The load-bearing new sentences (land these verbatim or
near-verbatim; weave surrounding prose to fit):

```markdown
**Step 6.0 — run the pre-gate before dispatching any Skinner.** Run
`plugins/tribe/scripts/pre-gate.sh` against the range under audit. A red pre-gate means the
deliverable is mechanically incomplete — that is the Hunter's unfinished work, not an audit
round: route the script report back to a fixer Hunter as an ordinary incomplete deliverable, and
dispatch no Skinner against a mechanically broken branch. An audit round begins only on a green
pre-gate, so a red pre-gate consumes no fix round.

**Law 1 — three lenses, three briefs, one message.** Every audit round dispatches **three
`skinner` instances as three tool uses in the same message**, all `model: sonnet`. The cell is
**one contract lens plus two cold lenses split by method**: Skinner A holds the contract lens and
the authoritative verdict, exactly as before; the cold seat splits into `lens: cold-executor`
(must run things; every Critical/Important hypothesis cites the command output it ran) and
`lens: cold-reader` (the static adversarial pass; must not execute the suites the pre-gate
already ran). Law 2 — fresh instances, never sequential, never each other's findings — applies
**pairwise across all three**.

The cold lenses audit a diff **path-scoped to operative code**: build it with an explicit
exclusion list covering at minimum `docs/tribe/planning/`, `docs/tribe/state/`, and any committed
contract document of the card under audit. The **contract lens's diff stays full-range** — it
already holds the contract; narrowing it would only blind the conformance check. The contract
lens's brief carries the pre-gate's report as **settled mechanical fact** (machine output of
committed scripts — contract-class by the D9 test, so the idea-02 seal is not breached); the
**cold lenses' briefs do not carry it**. Reviewer briefs **stop mandating full-suite re-runs**:
the contract lens still runs whatever proof the contract requires and may re-run any suite to
falsify a specific hypothesis; the cold-executor runs targeted experiments by mandate; the
cold-reader runs none.
```

Forbidden-channel table gains one row: `an un-scoped full-range diff | the tribe's contract
documents live in-repo, so the full range hands the cold lens the contract`. Law 3's tag table
rewords to: `[both]` = flagged by the contract lens and at least one cold lens; `[cold-only]` =
flagged by one or both cold lenses, contract silent. Law 4's round-PASS condition 2 rewords to
"every Critical/Important `[cold-only]` hypothesis **from either cold lens** has a recorded
disposition, and none of them is *Confirmed*". Confidence classes: `agreed` = **at least two of
the three lenses** flagged the same location with the same claim direction — including when both
cold lenses converge on a spot and the contract lens is silent. Rung 2 opens with: before
dispatching C, check whether the **third cell member already voted** — if the lens party to
neither side flagged the location in one disputed direction, that is a 2-of-3 majority: resolve
as if C returned it, **spend no tie-break key**, dispatch nothing; only when the **third lens is
silent** on the location does rung 2 dispatch C (with `lens: cold-executor`, disagreement-blind,
all W15 machinery unchanged).

Then sweep the consistency sites (the frontmatter description, the header line, anti-goal 4
both clauses, the dispatch contract, the step-5 model note, the wave-failure text, the final
report template): every "two independent Skinners" / "Skinner pair" phrasing becomes the
three-lens cell ("three independent Skinners — one contract lens and two cold lenses" or "the
Skinner cell", matching each site's grammar); every "both Skinners' … reports" quantifier becomes
"all three Skinners' …" where it means the cell, and stays "both round-3 FAIL reports" ONLY if
the spec's preservation list pins it — it does: reword around the pinned phrase so the sentence
stays true (the escalation attaches the contract lens's FAIL report and both cold reports; keep
the literal string `both round-3 FAIL reports` inside a clause that says what actually attaches:
all three reports).

- [ ] **Step 3: Deliberate supersessions in the three sibling suites, then verify**

In `test-dual-skinner-cell.sh`: edit exactly these assertions to the three-lens wording, each
with a one-line comment naming idea 11 (precedent: the idea-03 supersession comments already in
this file): `law1: both dispatched in the same message` (needle becomes
`three tool uses in the same message`), `law1: step 6 audits with two Skinners` (needle becomes
`one contract lens.{0,60}two cold lenses`), and the seven `consistency:` assertions whose
needles read `two independent skinners`, `skinner.{0,4} pair`, or `both skinners` — retarget each
to the new phrasing at its site. Keep the assertion COUNT unchanged (edit needles in place).

In `test-input-asymmetry.sh`: retarget only the assertions pinning Law 1's "two lenses, two
briefs" phrasing and Law 4's round-PASS quantifier; the cold-lens content assertions stay
untouched.

In `test-disagreement-routing.sh`: retarget only the `agreed`-definition assertions pinning
"both reviewers" and the rung-2 assertions pinning the unconditional dispatch of C; every
tie-break bookkeeping assertion stays untouched.

```bash
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh
for t in input-asymmetry dual-skinner-cell context-isolation fixer-mandate resume-check \
         validate-plan disagreement-routing; do
  echo "== $t"; bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
```

**Expected GREEN:** `45 passed, 0 failed` on the new suite; all seven siblings green at their
shipped counts (supersessions retargeted in place, counts unchanged). Run the D14 per-clause
mutation bar on every new AND every retargeted assertion; record the transcript.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/ \
        docs/tribe/planning/idea-11-review-cell-v3/plan.md
git commit -F- <<'MSG'
feat(tribe): three-lens audit cell — path-scoped cold diffs, pre-gate law, two-of-three routing

Tribe-Card: idea-11-review-cell-v3
Tribe-Task: 3/5
MSG
git log -1 --format='%(trailers)'
```

**Expected:** both trailers print; no Co-Authored-By.

### Task 4: the ledger's `lens` column and the `## Reviewer yield` table

**Contract for this task:** spec Delta-D. Files: `plugins/tribe/agents/warchief.md` (the
"Recording it — the disposition ledger" subsection of step 6 only), `test-review-cell-v3.sh`
(append section 4).

- [ ] **Step 1: Write the failing test**

Append section 4 to the suite:

```bash
# --- Section 4: Delta-D, the measured reviewers --------------------------------------------
RECORD="$(awk '/^#### Recording it/{f=1} /^\*\*The fixer brief/{f=0} f' "$AGENTS/warchief.md" \
          | tr '\n' ' ' | tr -s ' ')"
has "d: ledger gains a lens column"        "$RECORD" 'lens.{0,120}contract.{0,20}cold-exec.{0,20}cold-read'
has "d: multi-lens findings comma-join"    "$RECORD" 'comma-joined when more than one lens'
has "d: reviewer-yield table exists"       "$RECORD" 'reviewer yield'
has "d: yield rows are per lens"           "$RECORD" 'one row per lens'
has "d: yield columns named"               "$RECORD" 'raised.{0,40}unique.{0,40}confirmed.{0,40}refuted.{0,40}out-of-scope'
has "d: derived from the ledger only"      "$RECORD" 'derived entirely from the ledger'
has "d: non-authoritative, never resume"   "$RECORD" 'non-authoritative.{0,80}never.{0,40}resume'
has "d: the shaman decides from data"      "$RECORD" 'shaman.{0,120}from data'
```

**Expected RED:** all 8 fail (`45 passed, 8 failed` overall).

- [ ] **Step 2: Make it green — extend the Recording-it subsection**

Add the `lens` row to the existing column table (values `contract` / `cold-exec` / `cold-read`,
comma-joined when more than one lens raised the finding, filled by the Warchief when the row is
first written), and append after the ledger prose:

```markdown
**The `## Reviewer yield` table — the cell, measured.** When a round's merge completes, append
one small table to your report file under `## Reviewer yield`: one row per lens (`contract`,
`cold-exec`, `cold-read`), columns `raised / unique / confirmed / refuted / out-of-scope`
("unique" = no other lens raised the location). It is derived entirely from the ledger's rows
for that round — no new bookkeeping source — and like the report file itself it is
non-authoritative and never used for resume. Its consumer is the Shaman, deciding from data
after two campaigns whether each seat earns its place: which lens finds, which lens confirms,
which lens only echoes.
```

- [ ] **Step 3: Verify green + regression**

```bash
bash plugins/tribe/scripts/tests/test-review-cell-v3.sh
for t in input-asymmetry dual-skinner-cell context-isolation fixer-mandate resume-check \
         validate-plan disagreement-routing; do
  echo "== $t"; bash "plugins/tribe/scripts/tests/test-$t.sh" | tail -1
done
```

**Expected GREEN:** `53 passed, 0 failed`; all siblings green. D14 mutation bar on the 8 new
assertions.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/agents/warchief.md plugins/tribe/scripts/tests/test-review-cell-v3.sh \
        docs/tribe/planning/idea-11-review-cell-v3/plan.md
git commit -F- <<'MSG'
feat(tribe): ledger lens column + reviewer-yield table — the cell, measured

Tribe-Card: idea-11-review-cell-v3
Tribe-Task: 4/5
MSG
git log -1 --format='%(trailers)'
```

**Expected:** both trailers print; no Co-Authored-By.

### Task 5: four behavioral evals — the cell BEHAVES by the new laws

**Contract for this task:** the spec's four evals. Files: `plugins/tribe/evals/evals.json`
(append four cases, ids from `max(existing) + 1`), and ONE pre-authorized one-line edit to the
idea-03 suite's total-eval-count assertion (the D22 precedent — bump the expected count by 4;
disclose in the commit body). Touch nothing else. If any NEW eval fails reproducibly and the fix
would require editing skinner.md or warchief.md, STOP and return with the failure — prompts are
tasks 1-4 territory and a failing eval is a finding, never something to hide (shipped
precedent: idea-03 task 4).

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

**Expected RED-equivalent:** count prints the current total (20 at planning time) and no idea-11
eval exists. Then append four cases via a python3 heredoc (never hand-edit the JSON), ids
`N+1` through `N+4` where `N` is the printed max. Case content (write these fully into the
heredoc; prompts must CLOSE THE WORLD — embed the diff and every file the agent needs inline, so
the agent never stalls asking for repo access; that is the eval-16 deflake lesson):

1. `agent: skinner`, name `cold-executor-cites-the-run-that-manifests-the-defect`. Prompt: a
   `lens: cold-executor` dispatch carrying a small inline diff of a shell function with a real
   runtime defect (an unquoted variable that word-splits on spaces — include the function and a
   sample invocation in the prompt). Expected output: a Critical or Important hypothesis naming
   the defect AND quoting the command it ran with the output that manifests it; ends with a
   `COLD-LENS:` line; no `AUDIT:` line.
2. `agent: skinner`, name `cold-reader-finds-the-contradiction-without-running-suites`. Prompt: a
   `lens: cold-reader` dispatch carrying an inline diff of a prose rule file that states two
   mutually contradictory rules, plus a note that a tests directory exists at a stated path.
   Expected output: an Important-or-higher hypothesis naming the two contradictory clauses; the
   transcript contains no test-suite execution; ends with `COLD-LENS:`, no `AUDIT:` line.
3. `agent: warchief`, name `warchief-refuses-the-contract-bearing-cold-range`. Prompt: the
   Warchief is about to dispatch the cell; the stated diff range's file list (given inline)
   includes `docs/tribe/planning/some-card/spec.md`. Expected output: it path-scopes the cold
   diff (or treats the dispatch as contaminated and re-scopes) BEFORE dispatching; it does not
   hand the full range to a cold lens; no fix round is consumed.
4. `agent: warchief`, name `warchief-classes-a-cold-cold-convergence-as-agreed`. Prompt: three
   inline reviewer reports — contract lens `AUDIT: PASS` silent on location X; cold-executor and
   cold-reader each flag location X with the same claim direction. Expected output: the merged
   finding at X is classed `agreed`, severity raised to Critical, routed straight to the fixer.

Then the pre-authorized sibling bump: in the idea-03 suite, the assertion pinning the total eval
count moves up by exactly 4 (one line; comment it with `idea 11 adds 4 evals — D22 precedent`).

- [ ] **Step 2: Run the four new evals**

```bash
ls scripts/evals/run_evals.py
python3 scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json \
  --eval-id 21,22,23,24 --mode with_skill --verbose
```

(Adjust the id list to the actual `N+1` through `N+4` printed in step 1.) **Expected:** all four
`with_skill PASS`. A reproducible FAIL on a new eval is a stop condition per this task's
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

**Expected GREEN:** new suite `53 passed, 0 failed`; all siblings green (input-asymmetry green
with its bumped count); JSON valid, ids unique.

- [ ] **Step 4: Commit**

```bash
git add plugins/tribe/evals/evals.json plugins/tribe/scripts/tests/test-input-asymmetry.sh \
        docs/tribe/planning/idea-11-review-cell-v3/plan.md
git commit -F- <<'MSG'
test(tribe): behavioral evals for the three-lens cell (executor runs, reader reads, gate holds)

Sibling eval-count assertion bumped by 4 per the D22 precedent (arithmetic, not law).

Tribe-Card: idea-11-review-cell-v3
Tribe-Task: 5/5
MSG
git log -1 --format='%(trailers)'
```

**Expected:** both trailers print; no Co-Authored-By.
