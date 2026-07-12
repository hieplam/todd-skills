# Plan — Idea 10: meta-loop tripwires

**Spec:** `docs/tribe/planning/idea-10-meta-loop-tripwires/spec.md` (read it first — every task below
implements a numbered section of it).
**Card:** `idea-10-meta-loop-tripwires`
**Repo under work:** `todd-skills` (the tribe plugin's own repo).

This plan is for a **future implementation campaign**. It was authored by a planning-only Warchief
that deliberately applied none of it.

---

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.** The audit stays with the `skinner` subagent; a builder never grades its own work.
- **TDD, always.** Every task is red → green → refactor → commit, exactly one commit per task.
- **Commit trailers.** Every commit carries `Tribe-Card: idea-10-meta-loop-tripwires` plus
  `Tribe-Task: N/8`, both on the same final paragraph of the message. No co-authored trailers.
- **Script family conventions** (match `plugins/tribe/scripts/validate-plan.sh` exactly): JSON on
  stdout only, logs on stderr, exit `0` = ran successfully regardless of verdict, exit `2` = setup
  error. `set -euo pipefail`. Offline; no network.
- **Test harness conventions** (match `plugins/tribe/scripts/tests/test-validate-plan.sh`): bash,
  fixture-driven, TAP-ish `ok - ` / `not ok - ` lines, `mktemp -d` + `trap` cleanup, `python3` for
  JSON assertions. No new test dependency.
- **Never invent a rule the spec did not sanction.** Rule text is given verbatim in Tasks 5 and 6;
  copy it, do not improvise detectors.
- **Ratification authority — SETTLED (Decision Log D4, owner-ratified).** *Who may set
  `ratified: true` + `severity: blocker` on a tribe-minted rule* was escalated and ruled:
  **Option A — the Shaman ratifies, and the Warchief never does.** The Shaman may ratify ONLY when
  all four conditions hold: (1) the pattern `recurred` in ≥2 distinct cards, (2) the blast-radius
  backtest fires on ≤25% of the last 20 merged commits, (3) a Decision Log entry is written,
  (4) the blocker budget (cap 12) has room. A repo-wide rule that exceeds the backtest threshold
  **auto-escalates to the owner BEFORE ratification**. The owner sees every ratification in the
  campaign report and may veto. This ruling is encoded in exactly two places — the
  `RATIFY_AUTHORITY` constant (Task 3) and the shaman.md clause (Task 8) — and is settled law: do
  not re-open it.
- **Waves.** Tasks 1-4 all own `tripwire-check.sh` and must run in sequence. Tasks 5-8 own disjoint
  files (`.claude/rules/tripwires/`, `tracker.md`, `warchief.md`, `shaman.md`+`hunter.md`) and may
  be dispatched as one concurrent wave after Task 4 integrates.

### Files owned, per task

| task | owns_files |
|------|-----------|
| 1 | `plugins/tribe/scripts/tripwire-check.sh`, `plugins/tribe/scripts/tests/test-tripwire-check.sh`, `docs/tribe/ledger/README.md` |
| 2 | `plugins/tribe/scripts/tripwire-check.sh`, `plugins/tribe/scripts/tests/test-tripwire-check.sh` |
| 3 | same as 2 |
| 4 | same as 2 |
| 5 | `.claude/rules/tripwires/*.md`, `plugins/tribe/scripts/tests/test-tripwire-rules.sh` |
| 6 | `plugins/tribe/agents/tracker.md`, `plugins/tribe/scripts/tests/test-agent-contracts.sh` |
| 7 | `plugins/tribe/agents/warchief.md` |
| 8 | `plugins/tribe/agents/shaman.md`, `plugins/tribe/agents/hunter.md` |

---

## Task 1: Ledger format + `tripwire-check.sh` skeleton

Implements spec §2.1 and the JSON envelope of §2.2. The script must exist, parse a ledger
directory of per-card TSV files, and return a `clear` verdict on an empty ledger — before any
trigger arithmetic lands.

- [ ] **Step 1: Write the failing test.** Create
      `plugins/tribe/scripts/tests/test-tripwire-check.sh`, executable, modelled on
      `test-validate-plan.sh` (same `ok`/`bad`/`check`/`jget` helpers — copy them):

```bash
#!/usr/bin/env bash
# test-tripwire-check.sh — fixture tests for tripwire-check.sh (offline, no network).
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT="$HERE/../tripwire-check.sh"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }
check() { if [[ "$2" == "$3" ]]; then ok "$1"; else bad "$1 (got: $2, want: $3)"; fi; }
jget() { python3 - "$1" "$2" <<'EOF'
import json, sys
o = json.load(open(sys.argv[1]))
for k in sys.argv[2].split("."):
    o = o[int(k)] if isinstance(o, list) else o[k]
print(str(o).lower() if isinstance(o, bool) else o)
EOF
}

# A repo fixture: a ledger dir and a tripwire rules dir.
mkrepo() { # mkrepo NAME -> prints the repo root
  local root="$TMP/$1"
  mkdir -p "$root/docs/tribe/ledger" "$root/.claude/rules/tripwires"
  printf '%s' "$root"
}
led() { # led ROOT CARD TASK ROUND CLASS RULE OUTCOME EVIDENCE
  printf '%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' \
    "2026-07-12T09:00:00Z" "$2" "$3" "$4" "$5" "$6" "$7" "$8" \
    >> "$1/docs/tribe/ledger/$2.tsv"
}

# --- 1. empty ledger -> clear, exit 0
R="$(mkrepo empty)"
"$SCRIPT" "$R" > "$TMP/empty.json"
check "empty ledger exits 0" "$?" "0"
check "empty ledger verdict" "$(jget "$TMP/empty.json" verdict)" "clear"
check "empty ledger has no duties" "$(jget "$TMP/empty.json" duties)" "[]"

# --- 2. one lonely finding -> parsed, but no duty (threshold is 2)
R="$(mkrepo single)"
led "$R" idea-03-foo 2/5 1 weakened-test - uncovered "tests/api.test.ts:88 assertion deleted"
"$SCRIPT" "$R" > "$TMP/single.json"
check "single finding verdict" "$(jget "$TMP/single.json" verdict)" "clear"
check "single finding class parsed" "$(jget "$TMP/single.json" classes.0.class)" "weakened-test"
check "single finding occurrences" "$(jget "$TMP/single.json" classes.0.occurrences)" "1"
check "single finding duty" "$(jget "$TMP/single.json" classes.0.duty)" "none"

# --- 3. missing repo root -> setup error, exit 2
set +e
"$SCRIPT" "$TMP/nonexistent" > "$TMP/err.json" 2> "$TMP/err.log"
rc=$?
set -e
check "missing repo root exits 2" "$rc" "2"
check "missing repo root prints nothing on stdout" "$(wc -c < "$TMP/err.json" | tr -d ' ')" "0"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
```

- [ ] **Step 2: Watch it fail (RED).** Run it and confirm the failure is "script not found",
      not a broken test:

```bash
chmod +x plugins/tribe/scripts/tests/test-tripwire-check.sh
plugins/tribe/scripts/tests/test-tripwire-check.sh; echo "exit=$?"
```

      Expected: the run fails because `plugins/tribe/scripts/tripwire-check.sh` does not exist
      (`No such file or directory`), exit non-zero. That is the RED proof.

- [ ] **Step 3: Implement the skeleton (GREEN).** Create
      `plugins/tribe/scripts/tripwire-check.sh`, executable, `set -euo pipefail`, with a bash
      arg-parsing wrapper (usage: `tripwire-check.sh REPO-ROOT`) delegating to an inline
      `python3 - "$ROOT" <<'PY'` heredoc, exactly like `validate-plan.sh` lines 43-65. The wrapper
      must `DIE` (exit 2) when the repo root is missing or unreadable, and log to stderr only.

      The python half, for this task, must:
      - read every `docs/tribe/ledger/*.tsv` under the repo root (missing dir = empty ledger, not
        an error — a repo with no findings yet is `clear`, not broken);
      - skip blank lines and lines starting with `#`;
      - reject a row that does not have exactly 8 tab-separated fields (collect it into a
        `malformed` list in the JSON rather than crashing — a corrupt ledger line must never take
        the gate down);
      - group rows by `class`, computing per class: `occurrences`, sorted distinct `cards`,
        `max_rounds_in_one_card` (the largest count of distinct `round` values within a single
        card for that class), and an `outcomes` histogram;
      - set `duty: "none"` and `authority: null` for every class (trigger arithmetic is Task 2);
      - print the envelope from spec §2.2: `classes`, `budget`, `duties`, `malformed`, `verdict`,
        with `verdict: "clear"` when `duties` is empty.

- [ ] **Step 4: Prove GREEN.**

```bash
chmod +x plugins/tribe/scripts/tripwire-check.sh
plugins/tribe/scripts/tests/test-tripwire-check.sh
```

      Expected: every assertion prints `ok - `, final line `9 passed, 0 failed`, exit 0.

- [ ] **Step 5: Document the ledger format.** Create `docs/tribe/ledger/README.md` containing the
      8-column table from spec §2.1 verbatim, the example line, the `outcome` vocabulary with the
      one-sentence meaning of each value, and the one-file-per-card rationale (conflict-free under
      concurrent worktrees). Add `docs/tribe/ledger/.gitkeep` so the directory survives an empty
      ledger.

- [ ] **Step 6: Commit** — message `feat(tribe): tripwire ledger format + tripwire-check.sh
      skeleton`, trailers `Tribe-Card: idea-10-meta-loop-tripwires` and `Tribe-Task: 1/8` in one
      final paragraph.

---

## Task 2: The trigger arithmetic (within-card, cross-card)

Implements the first two rows of spec §2.2's trigger table — the card's question (a). "The same
pattern twice" becomes string equality on the `class` column plus a count.

- [ ] **Step 1: Extend the test (RED).** Append to `test-tripwire-check.sh`:

```bash
# --- 4. same class, 2 distinct rounds of ONE card -> within-card new-rule duty, warchief owns it
R="$(mkrepo within)"
led "$R" idea-03-foo 2/5 1 weakened-test - uncovered "tests/api.test.ts:88 assertion deleted"
led "$R" idea-03-foo 2/5 2 weakened-test - uncovered "tests/api.test.ts:91 second assertion skipped"
"$SCRIPT" "$R" > "$TMP/within.json"
check "within-card verdict"   "$(jget "$TMP/within.json" verdict)"            "duties_due"
check "within-card duty"      "$(jget "$TMP/within.json" classes.0.duty)"     "new-rule"
check "within-card authority" "$(jget "$TMP/within.json" classes.0.authority)" "warchief"
check "within-card rounds"    "$(jget "$TMP/within.json" classes.0.max_rounds_in_one_card)" "2"

# --- 5. same class in 2 distinct CARDS -> cross-card duty, the shaman owns it
R="$(mkrepo across)"
led "$R" idea-03-foo 2/5 1 weakened-test - uncovered "tests/api.test.ts:88 assertion deleted"
led "$R" idea-07-bar 1/3 1 weakened-test - uncovered "tests/db.test.ts:12 test marked skip"
"$SCRIPT" "$R" > "$TMP/across.json"
check "cross-card duty"      "$(jget "$TMP/across.json" classes.0.duty)"      "new-rule"
check "cross-card authority" "$(jget "$TMP/across.json" classes.0.authority)" "shaman"
check "cross-card cards"     "$(jget "$TMP/across.json" classes.0.cards.1)"   "idea-07-bar"

# --- 6. two rounds, but the SECOND round is a different class -> no duty (not the same pattern)
R="$(mkrepo mixed)"
led "$R" idea-03-foo 2/5 1 weakened-test        - uncovered "tests/api.test.ts:88 assertion deleted"
led "$R" idea-03-foo 2/5 2 missing-commit-trailer - uncovered "commit a1b2c3d lacks Tribe-Task"
"$SCRIPT" "$R" > "$TMP/mixed.json"
check "mixed classes stay clear" "$(jget "$TMP/mixed.json" verdict)" "clear"

# --- 7. only `uncovered` outcomes accumulate toward a new rule; a `deterred` line does not
R="$(mkrepo deterred)"
led "$R" idea-03-foo 2/5 1 weakened-test tripwire-weakened-test deterred "caught by the rule, fixed"
led "$R" idea-07-bar 1/3 1 weakened-test tripwire-weakened-test deterred "caught by the rule, fixed"
"$SCRIPT" "$R" > "$TMP/deterred.json"
check "deterred does not demand a new rule" "$(jget "$TMP/deterred.json" verdict)" "clear"
```

- [ ] **Step 2: Watch it fail (RED).**

```bash
plugins/tribe/scripts/tests/test-tripwire-check.sh; echo "exit=$?"
```

      Expected: the new assertions fail — `not ok - within-card duty (got: none, want: new-rule)`
      and friends. The Task-1 assertions still pass.

- [ ] **Step 3: Implement the triggers (GREEN).** In the python half, after the per-class
      aggregation, compute `duty` for each class using ONLY rows whose `outcome` is `uncovered`:

      - if the class has `uncovered` rows in **≥2 distinct rounds of the same card** →
        `duty: "new-rule"`, `authority: "warchief"` (it is this card's own repeated pattern; the
        Warchief must close it inside the same PR);
      - else if the class has `uncovered` rows in **≥2 distinct cards** → `duty: "new-rule"`,
        `authority: "shaman"`;
      - else → `duty: "none"`, `authority: null`.

      Within-card wins when both hold: the nearer authority discharges it sooner. Every class whose
      `duty` is not `none` is appended to the top-level `duties` array as
      `{"duty", "class", "authority"}`; a non-empty `duties` array sets `verdict: "duties_due"`.

- [ ] **Step 4: Prove GREEN.**

```bash
plugins/tribe/scripts/tests/test-tripwire-check.sh
```

      Expected: `18 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit** — `feat(tribe): tripwire trigger arithmetic (within-card + cross-card)`,
      trailers `Tribe-Card: idea-10-meta-loop-tripwires` and `Tribe-Task: 2/8`.

---

## Task 3: Rule coverage, promotion, retirement, narrowing, budget cap

Implements the rest of spec §2.2's trigger table plus guardrail G4. This is where the ledger meets
the rule files: a rule's `tripwire-class` frontmatter is the join key.

- [ ] **Step 1: Extend the test (RED).** Add a rule-file fixture helper and the cases:

```bash
rule() { # rule ROOT CLASS SEVERITY RATIFIED
  cat > "$1/.claude/rules/tripwires/$2.md" <<EOF
---
id: tripwire-$2
tripwire-class: $2
paths: ["**/*"]
severity: $3
status: probation
ratified: $4
detect-kind: line-regex
detect: 'never-matches-anything-zzz'
waiver: 'tribe-waiver: $2'
minted-by: warchief
minted-in: idea-10-meta-loop-tripwires
---
# Tripwire: $2
EOF
}

# --- 8. a class already covered by a rule raises NO new-rule duty
R="$(mkrepo covered)"; rule "$R" weakened-test should-fix false
led "$R" idea-03-foo 2/5 1 weakened-test tripwire-weakened-test recurred "skip added again"
led "$R" idea-03-foo 2/5 2 weakened-test tripwire-weakened-test recurred "and again"
"$SCRIPT" "$R" > "$TMP/covered.json"
check "covered class links its rule" "$(jget "$TMP/covered.json" classes.0.rule)" "tripwire-weakened-test"
check "covered class is not new-rule" "$(jget "$TMP/covered.json" classes.0.duty)" "none"

# --- 9. `recurred` in 2 distinct cards -> promotion duty, shaman owns it
R="$(mkrepo promote)"; rule "$R" weakened-test should-fix false
led "$R" idea-03-foo 2/5 2 weakened-test tripwire-weakened-test recurred "skip added despite the rule"
led "$R" idea-07-bar 1/3 2 weakened-test tripwire-weakened-test recurred "skip added despite the rule"
"$SCRIPT" "$R" > "$TMP/promote.json"
check "promotion duty"      "$(jget "$TMP/promote.json" classes.0.duty)"      "promotion"
check "promotion authority" "$(jget "$TMP/promote.json" classes.0.authority)" "shaman"

# --- 10. `waived` in 3 distinct cards -> narrowing duty (the rule is a false-positive generator)
R="$(mkrepo narrow)"; rule "$R" weakened-test should-fix false
led "$R" idea-01-a 1/2 1 weakened-test tripwire-weakened-test waived "fires on a fixture file name"
led "$R" idea-02-b 1/2 1 weakened-test tripwire-weakened-test waived "fires on a fixture file name"
led "$R" idea-03-c 1/2 1 weakened-test tripwire-weakened-test waived "fires on a fixture file name"
"$SCRIPT" "$R" > "$TMP/narrow.json"
check "narrowing duty" "$(jget "$TMP/narrow.json" classes.0.duty)" "narrowing"

# --- 11. budget: 12 ratified blockers exhausts the cap
R="$(mkrepo budget)"
for i in $(seq 1 12); do rule "$R" "cls$i" blocker true; done
"$SCRIPT" "$R" > "$TMP/budget.json"
check "budget counts ratified blockers" "$(jget "$TMP/budget.json" budget.ratified_blockers)" "12"
check "budget exhausted"                "$(jget "$TMP/budget.json" budget.exhausted)"         "true"

# --- 12. an unratified blocker does NOT count against the budget and cannot gate work
R="$(mkrepo unratified)"; rule "$R" weakened-test blocker false
"$SCRIPT" "$R" > "$TMP/unratified.json"
check "unratified blocker is not counted" "$(jget "$TMP/unratified.json" budget.ratified_blockers)" "0"
check "unratified blocker is not enforcing" "$(jget "$TMP/unratified.json" rules.0.enforcing)" "false"
```

- [ ] **Step 2: Watch it fail (RED).**

```bash
plugins/tribe/scripts/tests/test-tripwire-check.sh; echo "exit=$?"
```

      Expected: the new assertions fail (`classes.0.rule` is `null`, `budget` is absent or zero).

- [ ] **Step 3: Implement (GREEN).** Parse each `.claude/rules/tripwires/*.md` frontmatter (a plain
      key-value reader between the two `---` fences is enough; no yaml dependency — the script
      family takes no new dependencies). For every rule collect: `id`, `tripwire-class`, `severity`,
      `status`, `ratified`, `detect-kind`. Derive `enforcing = (severity == "blocker" and ratified
      is true and status != "retired")` — **this is guardrail G1 made computable: an unratified rule
      is never enforcing, so it can never FAIL work.**

      Then, per class:
      - join the rule by `tripwire-class`; put its id in `rule`;
      - a class **with** a rule can never raise `new-rule` (it is already covered);
      - `recurred` in ≥2 distinct cards → `duty: "promotion"`, `authority: RATIFY_AUTHORITY`;
      - `waived` in ≥3 distinct cards → `duty: "narrowing"`, `authority: "shaman"`;
      - a rule with **zero** `deterred` + `recurred` + `waived` citations across the last 5 distinct
        shipped cards present in the ledger → `duty: "retirement"`, `authority: "shaman"`
        (a `deterred` line is a citation — a rule that is *working* must never look dead);
      - promotion outranks narrowing when both hold; the Shaman adjudicates.

      Declare the ratification authority as one named constant near the top of the python half:

```python
# Who may set `ratified: true` + `severity: blocker` on a tribe-minted rule.
# SETTLED — Decision Log D4 (owner-ratified), Option A: the Shaman ratifies; the Warchief never
# does. Ratification requires ALL FOUR of: recurred in >= 2 distinct cards; backtest fire rate
# <= BACKTEST_MAX_FIRE_RATE over the last BACKTEST_COMMITS merged commits; a Decision Log entry;
# and budget room under BLOCKER_BUDGET. A repo-wide rule over the threshold auto-escalates to the
# owner before ratification (see the shaman.md clause, Task 8 — the only other encode point).
RATIFY_AUTHORITY = "shaman"
BLOCKER_BUDGET = 12
BACKTEST_COMMITS = 20
BACKTEST_MAX_FIRE_RATE = 0.25
RETIREMENT_WINDOW_CARDS = 5
```

      Emit a top-level `rules` array (`id`, `class`, `severity`, `ratified`, `enforcing`, `status`)
      and the `budget` object (`ratified_blockers`, `cap`, `exhausted`).

- [ ] **Step 4: Prove GREEN.**

```bash
plugins/tribe/scripts/tests/test-tripwire-check.sh
```

      Expected: `27 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit** — `feat(tribe): rule coverage, promotion/retirement/narrowing duties, blocker budget`,
      trailers `Tribe-Card: idea-10-meta-loop-tripwires` and `Tribe-Task: 3/8`.

---

## Task 4: `--backtest` and `--lint` — guardrail G2 and the format gate

Implements spec §2.4 G2 (the blast-radius false-positive estimate) and the rule-format lint. This is
the guardrail that catches a wolf **before** it is given teeth.

- [ ] **Step 1: Extend the test (RED).** Add a git-repo fixture with known diffs:

```bash
# --- 13. backtest: a narrow detector fires rarely -> pass; a broad one fires everywhere -> too-broad
G="$TMP/gitfix"; mkdir -p "$G/.claude/rules/tripwires" "$G/docs/tribe/ledger"
git -C "$G" init -q; git -C "$G" config user.email t@t; git -C "$G" config user.name t
for i in 1 2 3 4; do
  printf 'let value_%s = %s;\n' "$i" "$i" >> "$G/src.rs"
  git -C "$G" add -A; git -C "$G" commit -q -m "commit $i"
done
printf 'fn stub() { todo!() }\n' >> "$G/src.rs"
git -C "$G" add -A; git -C "$G" commit -q -m "commit 5 with a stub"

cat > "$G/.claude/rules/tripwires/narrow-rule.md" <<'EOF'
---
id: tripwire-narrow-rule
tripwire-class: narrow-rule
paths: ["**/*"]
severity: should-fix
status: probation
ratified: false
detect-kind: line-regex
detect: '(?i)\btodo!\('
waiver: 'tribe-waiver: narrow-rule'
minted-by: warchief
minted-in: idea-10-meta-loop-tripwires
---
# Tripwire: narrow-rule
EOF
cat > "$G/.claude/rules/tripwires/broad-rule.md" <<'EOF'
---
id: tripwire-broad-rule
tripwire-class: broad-rule
paths: ["**/*"]
severity: should-fix
status: probation
ratified: false
detect-kind: line-regex
detect: '(?i).'
waiver: 'tribe-waiver: broad-rule'
minted-by: warchief
minted-in: idea-10-meta-loop-tripwires
---
# Tripwire: broad-rule
EOF

"$SCRIPT" "$G" --backtest "$G/.claude/rules/tripwires/narrow-rule.md" --commits 5 > "$TMP/bt-narrow.json"
check "narrow rule fired on 1 of 5" "$(jget "$TMP/bt-narrow.json" commits_fired)" "1"
check "narrow rule verdict"         "$(jget "$TMP/bt-narrow.json" verdict)"       "pass"

"$SCRIPT" "$G" --backtest "$G/.claude/rules/tripwires/broad-rule.md" --commits 5 > "$TMP/bt-broad.json"
check "broad rule fire rate"  "$(jget "$TMP/bt-broad.json" fire_rate)" "1.0"
check "broad rule is refused" "$(jget "$TMP/bt-broad.json" verdict)"   "too-broad"

# --- 14. lint: an unsupported detect-kind is rejected
R="$(mkrepo lint)"
cat > "$R/.claude/rules/tripwires/bogus.md" <<'EOF'
---
id: tripwire-bogus
tripwire-class: bogus
paths: ["**/*"]
severity: should-fix
status: probation
ratified: false
detect-kind: vibes
---
# Tripwire: bogus
EOF
"$SCRIPT" "$R" --lint > "$TMP/lint.json"
check "lint rejects an unmechanical rule" "$(jget "$TMP/lint.json" verdict)" "invalid"
check "lint names the offender"           "$(jget "$TMP/lint.json" violations.0.id)" "tripwire-bogus"
```

- [ ] **Step 2: Watch it fail (RED).**

```bash
plugins/tribe/scripts/tests/test-tripwire-check.sh; echo "exit=$?"
```

      Expected: the run fails on the unknown flags (`--backtest`, `--lint` are not parsed yet).

- [ ] **Step 3: Implement (GREEN).**

      **`--backtest RULE-FILE [--commits N]`** (default N=20): for each of the last N commits on the
      current branch, take its added lines (`git show --unified=0 --format= SHA`, keep lines starting
      with a single `+` that are not the `+++` header, strip the leading `+`), apply the rule's
      detector to that content, and count the commits where it fires at least once. Print
      `{"rule", "commits_sampled", "commits_fired", "fire_rate", "threshold": 0.25, "verdict"}`
      where `verdict` is `pass` when `fire_rate <= 0.25` and `too-broad` above it. Round
      `fire_rate` to 2 decimals.

      **`--lint`**: every rule file must declare a `detect-kind` of `line-regex` (with a compilable
      `detect` regex) or `comment-block` (with `detect-keywords` and an integer `detect-min-lines`);
      must carry `id`, `tripwire-class`, `paths`, `severity`, `status`, `ratified`, `waiver`; and a
      rule that is `severity: blocker` + `ratified: true` must additionally carry a
      `backtest-fire-rate` field at or below `0.25` — **a rule cannot be given teeth without a
      recorded, passing blast-radius measurement.** Print
      `{"rules_checked", "violations": [{"id", "file", "problem"}], "verdict": "valid" | "invalid"}`.

      Both modes keep the family's exit contract: 0 when the check ran (whatever the verdict), 2 on
      a setup error such as an unreadable rule file or a repo root that is not a git work tree.

- [ ] **Step 4: Prove GREEN.**

```bash
plugins/tribe/scripts/tests/test-tripwire-check.sh
```

      Expected: `33 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit** — `feat(tribe): blast-radius backtest + rule-format lint for tripwires`,
      trailers `Tribe-Card: idea-10-meta-loop-tripwires` and `Tribe-Task: 4/8`.

---

## Task 5: The three seed tripwire rules

Implements spec §2.3. These are Jarred's three false-start patterns, and rule 1 is the one that
finally makes `plugins/tribe/agents/hunter.md:103-104` **checkable** rather than merely declared.
All three are born advisory (`ratified: false`) per guardrail G1.

- [ ] **Step 1: Write the failing test (RED).** Create
      `plugins/tribe/scripts/tests/test-tripwire-rules.sh` — every rule is proven on a **positive**
      fixture (must fire) and a **negative** fixture (must not fire; the false-positive half matters
      as much as the true-positive half):

```bash
#!/usr/bin/env bash
# test-tripwire-rules.sh — each seed tripwire fires on its positive fixture and stays silent
# on its negative fixture. Offline.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES="$HERE/../../../../.claude/rules/tripwires"
PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf 'ok - %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf 'not ok - %s\n' "$1"; }

fires() { # fires RULE-FILE ADDED-LINES-FILE -> prints "yes" or "no"
  python3 - "$1" "$2" <<'EOF'
import re, sys
fm, body = {}, open(sys.argv[2]).read()
lines = open(sys.argv[1]).read().splitlines()
inside = False
for ln in lines:
    if ln.strip() == "---":
        if inside: break
        inside = True; continue
    if inside and ":" in ln:
        k, v = ln.split(":", 1)
        fm[k.strip()] = v.strip().strip("'\"")
kind = fm.get("detect-kind")
if kind == "line-regex":
    hit = any(re.search(fm["detect"], l) for l in body.splitlines())
elif kind == "comment-block":
    kw, need, run, hit = fm["detect-keywords"], int(fm["detect-min-lines"]), [], False
    for l in body.splitlines() + [""]:
        if re.match(r"\s*(//|#|\*|--)", l):
            run.append(l)
        else:
            if len(run) >= need and any(re.search(kw, x) for x in run):
                hit = True
            run = []
else:
    raise SystemExit(f"unsupported detect-kind: {kind}")
print("yes" if hit else "no")
EOF
}

t() { # t NAME RULE FIXTURE WANT
  local got; got="$(fires "$RULES/$2.md" "$3")"
  if [[ "$got" == "$4" ]]; then ok "$1"; else bad "$1 (got: $got, want: $4)"; fi
}

TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

printf 'it.skip("returns 404 for a missing user", async () => {\n' > "$TMP/pos-test.txt"
printf 'it("returns 404 for a missing user", async () => {\n'      > "$TMP/neg-test.txt"
t "weakened-test fires on an added .skip"        weakened-test "$TMP/pos-test.txt" yes
t "weakened-test silent on an ordinary test"     weakened-test "$TMP/neg-test.txt" no

printf 'fn resolve(&self) -> Path { todo!() }\n'          > "$TMP/pos-stub.txt"
printf 'fn resolve(&self) -> Path { self.root.clone() }\n' > "$TMP/neg-stub.txt"
t "unfinished-work-marker fires on a stub"       unfinished-work-marker "$TMP/pos-stub.txt" yes
t "unfinished-work-marker silent on real code"   unfinished-work-marker "$TMP/neg-stub.txt" no

cat > "$TMP/pos-comment.txt" <<'EOF'
// This is a workaround for the upstream client, which resolves the socket
// eagerly and therefore drops our timeout. We cannot fix it upstream in time,
// so we pre-warm the pool and swallow the first error, which is harmless
// because the second attempt always carries the real timeout value.
EOF
printf '// Pre-warm the pool so the first request does not pay connection cost.\n' > "$TMP/neg-comment.txt"
t "workaround-justification fires on a 4-line excuse"  workaround-justification-comment "$TMP/pos-comment.txt" yes
t "workaround-justification silent on a normal comment" workaround-justification-comment "$TMP/neg-comment.txt" no

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
```

- [ ] **Step 2: Watch it fail (RED).**

```bash
chmod +x plugins/tribe/scripts/tests/test-tripwire-rules.sh
plugins/tribe/scripts/tests/test-tripwire-rules.sh; echo "exit=$?"
```

      Expected: it fails because `.claude/rules/tripwires/` holds no rule files yet
      (`No such file or directory`).

- [ ] **Step 3: Write the three rules (GREEN).** Create them verbatim.

      `.claude/rules/tripwires/weakened-test.md`:

```markdown
---
id: tripwire-weakened-test
tripwire-class: weakened-test
paths: ["**/*"]
severity: should-fix
status: probation
ratified: false
detect-kind: line-regex
detect: '(?i)(\.skip\s*\(|\bxit\s*\(|\bxdescribe\s*\(|@ignore\b|\[Ignore\b|#\[ignore\]|pytest\.mark\.skip|\bt\.Skip\s*\(|\bit\.only\s*\(|\bskip\s*=\s*true)'
waiver: 'tribe-waiver: weakened-test'
minted-by: warchief
minted-in: idea-10-meta-loop-tripwires
---

# Tripwire: a weakened or skipped test

**Trips when** the diff ADDS a line that skips, ignores, disables, or narrows a test.

**Why this rule exists.** `plugins/tribe/agents/hunter.md:103-104` already forbids silent green —
"Never weaken or delete a test to make the suite pass" — but that anti-goal lives only inside the
Hunter's own prompt: it binds the agent that reads it and nothing inspects the diff for a
violation. This rule is the missing checkable half. The reviewer greps `detect` against the added
lines and cites this id.

**Remedy.** Make the test pass honestly, or report `BLOCKED`. If the test is genuinely obsolete,
DELETE it in a commit whose message states why the behaviour it covered no longer exists — a
deletion with a stated reason is not a weakening.

**Honorable pass (waiver).** A Warchief may waive this rule for one commit with the trailer
`tribe-waiver: weakened-test REASON`. The waiver is recorded in the card's ledger as
`outcome=waived`; a rule waived in 3 or more distinct cards is flagged for narrowing, because a
rule that is routinely waived is a false-positive generator, not a guardrail.
```

      `.claude/rules/tripwires/unfinished-work-marker.md`:

```markdown
---
id: tripwire-unfinished-work-marker
tripwire-class: unfinished-work-marker
paths: ["**/*"]
severity: should-fix
status: probation
ratified: false
detect-kind: line-regex
detect: '(?i)(\btodo!\s*\(|\bunimplemented!\s*\(|NotImplementedException|\braise\s+NotImplementedError\b|\bpanic!\s*\(\s*"not implemented|\bthrow new NotSupportedException|^\s*(//|#)\s*(todo|fixme)\b)'
waiver: 'tribe-waiver: unfinished-work-marker'
minted-by: warchief
minted-in: idea-10-meta-loop-tripwires
---

# Tripwire: an unfinished-work marker left in the diff

**Trips when** the diff ADDS a stub, an unimplemented body, or an unfinished-work comment marker.

**Why this rule exists.** Stub functions are one of the three failure patterns Jarred fixed at the
process level during the Bun port, and they are the classic way an agent converts "I could not do
this" into a green build. A stub compiles, passes review by eye, and defers the failure to whoever
runs the code — which, in a fleet of stateless agents, is nobody.

**Remedy.** Implement the behaviour, or report `BLOCKED` to the Warchief with what is missing. A
task that cannot be finished honestly is a task the plan got wrong; that is information the
Warchief needs, not a hole to paper over.

**Honorable pass (waiver).** `tribe-waiver: unfinished-work-marker REASON` — legitimate when the
plan itself sanctions a scaffold (for example, a trait method a later task in the same plan fills
in). The waiver must name the task that closes it.
```

      `.claude/rules/tripwires/workaround-justification-comment.md`:

```markdown
---
id: tripwire-workaround-justification-comment
tripwire-class: workaround-justification-comment
paths: ["**/*"]
severity: should-fix
status: probation
ratified: false
detect-kind: comment-block
detect-keywords: '(?i)\b(workaround|work around|hack|kludge|for now|temporar|hacky|band-aid)\b'
detect-min-lines: 4
waiver: 'tribe-waiver: workaround-justification-comment'
minted-by: warchief
minted-in: idea-10-meta-loop-tripwires
---

# Tripwire: a paragraph-long comment justifying a workaround

**Trips when** the diff ADDS a contiguous comment block of 4 or more lines containing any of the
workaround keywords.

**Why this rule exists.** Jarred Sumner's rule, verbatim from the Bun port: *"If you need a
paragraph-long comment to justify why the workaround is OK, the code is wrong — fix the code."* Its
value is that it converts a vague judgment ("does this code smell?") into a near-mechanical
criterion that can be applied consistently by a stateless reviewer. Length of excuse is a proxy for
depth of wrongness, and it is a proxy you can measure.

**Remedy.** Fix the code so the excuse is unnecessary. If the constraint is genuinely external
(an upstream bug, a platform limit), state it in ONE line and link the upstream issue — a citation
is not an excuse.

**Honorable pass (waiver).** `tribe-waiver: workaround-justification-comment REASON` — legitimate
when the comment is documentation of a genuinely external constraint rather than a justification of
a local shortcut. A long comment that explains *the domain* trips nothing: the keywords are what
make it an excuse.
```

- [ ] **Step 4: Prove GREEN, and prove the lint accepts them.**

```bash
plugins/tribe/scripts/tests/test-tripwire-rules.sh
plugins/tribe/scripts/tripwire-check.sh . --lint
```

      Expected: `6 passed, 0 failed` from the rules test; the lint prints
      `"rules_checked": 3`, `"violations": []`, `"verdict": "valid"`.

- [ ] **Step 5: Commit** — `feat(tribe): three seed tripwire rules (weakened test, stub, workaround excuse)`,
      trailers `Tribe-Card: idea-10-meta-loop-tripwires` and `Tribe-Task: 5/8`.

---

## Task 6: Teach the Tracker to run a detector

Implements spec §2.5, row 1. The Tracker's rule-*loading* mechanism does not change at all
(`tracker.md:21`, `:33-35` already read `.claude/rules/` fresh, honouring `paths:`). It gains ONE
step: rules that carry a detector are checked mechanically instead of by reading prose.

- [ ] **Step 1: Write the failing contract test (RED).** Create
      `plugins/tribe/scripts/tests/test-agent-contracts.sh` — a prompt edit is TDD-able exactly this
      way: assert the contract clause exists in the agent file, watch it fail, add it.

```bash
#!/usr/bin/env bash
# test-agent-contracts.sh — the tribe's agent prompts must carry their contract clauses verbatim.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AGENTS="$HERE/../../agents"
PASS=0; FAIL=0
has() { # has FILE PATTERN NAME
  if grep -qF -- "$2" "$AGENTS/$1"; then
    PASS=$((PASS+1)); printf 'ok - %s\n' "$3"
  else
    FAIL=$((FAIL+1)); printf 'not ok - %s (missing in %s)\n' "$3" "$1"
  fi
}

has tracker.md '.claude/rules/tripwires/'      "tracker reads the tripwire rules directory"
has tracker.md 'detect-kind'                   "tracker runs a rule's declared detector"
has tracker.md 'ratified: true'                "tracker maps ratification to enforceable severity"

printf '\n%d passed, %d failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
```

- [ ] **Step 2: Watch it fail (RED).**

```bash
chmod +x plugins/tribe/scripts/tests/test-agent-contracts.sh
plugins/tribe/scripts/tests/test-agent-contracts.sh; echo "exit=$?"
```

      Expected: `not ok - tracker reads the tripwire rules directory` and the two others;
      `0 passed, 3 failed`.

- [ ] **Step 3: Edit `plugins/tribe/agents/tracker.md` (GREEN).** In step 1 ("Gather the rules"),
      extend the project-scoped bullet to name `.claude/rules/tripwires/` explicitly. Then add this
      paragraph immediately after the rule-source list, verbatim:

```markdown
- **Tripwire rules** — every `*.md` under the repo's `.claude/rules/tripwires/`. These are rules the
  tribe minted for itself after the same failure recurred, and they are **mechanically checkable**:
  each carries a `detect-kind` in its frontmatter. Do not merely read their prose — RUN the
  detector against the diff's ADDED lines (the leading `+` and the `+++`/`---` headers stripped):
  - `detect-kind: line-regex` → report a finding for each added line matching `detect`.
  - `detect-kind: comment-block` → report a finding for each added contiguous comment block of at
    least `detect-min-lines` lines containing a `detect-keywords` match.
  Report each hit at the rule's declared `severity`, citing its `id` and `file:line` — except that a
  rule is enforceable at **Blocker** only when its frontmatter says `ratified: true`. An unratified
  rule (the default for a freshly minted tripwire) is reported at **Should-fix** no matter what its
  `severity` field claims: the tribe may write itself a rule at any time, but it may not give itself
  a new blocking power without a ratification act. A rule whose `status` is `retired`, or whose
  `waiver` token appears in the commit message, is not reported at all — a waived rule is an
  honorable pass, not a violation.
```

- [ ] **Step 4: Prove GREEN.**

```bash
plugins/tribe/scripts/tests/test-agent-contracts.sh
```

      Expected: `3 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit** — `feat(tribe): tracker runs tripwire detectors against the diff`,
      trailers `Tribe-Card: idea-10-meta-loop-tripwires` and `Tribe-Task: 6/8`.

---

## Task 7: The Warchief's ledger duty and its pre-SHIPPED gate

Implements spec §2.5, row 2 — the within-card half of the loop.

- [ ] **Step 1: Extend the contract test (RED).** Append to `test-agent-contracts.sh`:

```bash
has warchief.md 'docs/tribe/ledger/'   "warchief writes the findings ledger"
has warchief.md 'tripwire-check.sh'    "warchief runs the tripwire gate before SHIPPED"
has warchief.md 'outcome'              "warchief records the ledger outcome column"
```

- [ ] **Step 2: Watch it fail (RED).**

```bash
plugins/tribe/scripts/tests/test-agent-contracts.sh; echo "exit=$?"
```

      Expected: the three new assertions fail; the Task-6 assertions still pass.

- [ ] **Step 3: Edit `plugins/tribe/agents/warchief.md` (GREEN).** Append to step 6
      ("Audit every deliverable with the skinner"), after the existing 3-round-cap paragraph:

```markdown
**Ledger every FAIL — the lesson must outlive you.** After each Skinner FAIL verdict, append one
line per Critical/Important finding **class** to `docs/tribe/ledger/CARD-SLUG.tsv` (8 tab-separated
columns: `ts`, `card`, `task`, `round`, `class`, `rule`, `outcome`, `evidence` — the format doc is
`docs/tribe/ledger/README.md`), and land it in the **same commit as the fix**, per the atomic
done-record invariant. Classes are kebab-case slugs: **grep the existing ledger and
`.claude/rules/tripwires/` for a matching class and REUSE it before coining a new one** — a
near-synonym (`skipped-test` beside `weakened-test`) silently defeats the recurrence count, which is
the whole mechanism. Set `outcome` to `uncovered` (no rule exists for this class), `deterred` (a
rule caught it and the fix landed that round), `recurred` (a rule exists and the class appeared
anyway, needing more than one round), or `waived` (you judged the rule a false positive here and
granted its waiver token). Ledger only findings that survived to a real fix or an explicit waiver —
a finding the fixer could not reproduce is not a pattern, and recording it would manufacture a rule
for a failure that never happened.

**Close the loop before you ship.** Before returning `SHIPPED`, run
`tripwire-check.sh REPO-ROOT` (resolve its path exactly as you resolve `heartbeat-check.sh`). If it
reports a `new-rule` duty with `authority: warchief` — the same class went `uncovered` in 2 or more
distinct fix rounds of THIS card — you do not just fix the code: **mint the rule in this same PR**,
at `.claude/rules/tripwires/CLASS.md`, following the frontmatter contract of the existing rules, at
`severity: should-fix`, `status: probation`, `ratified: false`. A minted rule is advisory from
birth; it can never FAIL another agent's work until it is ratified, and ratifying is not yours.
Prove the rule with `tripwire-check.sh REPO-ROOT --lint` (it must come back `valid`) and record it
in the PR body. A card that paid for the same failure twice and shipped without a tripwire has
taught the tribe nothing — that is the failure this step exists to prevent.
```

- [ ] **Step 4: Prove GREEN.**

```bash
plugins/tribe/scripts/tests/test-agent-contracts.sh
```

      Expected: `6 passed, 0 failed`, exit 0.

- [ ] **Step 5: Commit** — `feat(tribe): warchief ledgers every FAIL and mints a tripwire before shipping`,
      trailers `Tribe-Card: idea-10-meta-loop-tripwires` and `Tribe-Task: 7/8`.

---

## Task 8: The Shaman's cross-card duty, and the Hunter's cross-reference

Implements spec §2.5, rows 3 and 4 — the cross-card half of the loop, plus the ratification protocol
(the plan's default is Option A; see Global Constraints).

- [ ] **Step 1: Extend the contract test (RED).** Append to `test-agent-contracts.sh`:

```bash
has shaman.md 'tripwire-check.sh'   "shaman runs the tripwire gate at verify-SHIPPED"
has shaman.md 'ratif'              "shaman holds the ratification act"
has shaman.md '--backtest'         "shaman requires a blast-radius backtest before ratifying"
has shaman.md 'the Warchief never ratifies' "ruling D4: only the shaman ratifies"
has shaman.md 'Decision Log'       "ruling D4: every ratification is logged"
has shaman.md 'Auto-escalation to the owner' "ruling D4: repo-wide over-threshold rules go to the owner"
has hunter.md 'tripwire-weakened-test' "hunter anti-goal 5 points at its checkable rule"
```

      These six assertions are the mechanical guard on **Decision Log ruling D4**: the four
      ratification conditions and the owner auto-escalation must survive in the prompt verbatim, or
      this test goes red.

- [ ] **Step 2: Watch it fail (RED).**

```bash
plugins/tribe/scripts/tests/test-agent-contracts.sh; echo "exit=$?"
```

      Expected: the seven new assertions fail; the Task-6 and Task-7 assertions still pass.

- [ ] **Step 3a: Edit `plugins/tribe/agents/shaman.md` (GREEN).** In the campaign loop's **Rule**
      step, inside the `SHIPPED` branch, after the `verify-shipped` PASS and the outcome check, add:

```markdown
   - **Close the meta-loop.** Once the card is verified-SHIPPED and merged, run
     `tripwire-check.sh REPO-ROOT` on the default branch — this is the only place where every
     shipped card's ledger is visible at once, which is exactly what makes a CROSS-card pattern
     detectable. Act on each duty it reports:
     - `new-rule` (the same failure class went uncovered in 2 or more distinct cards) → **mint a
       tripwire card** and dispatch a Warchief for it, exactly like any other card: measurable goal
       = the rule file exists, its lint passes, and the Tracker cites it on a fixture diff. You
       decide *that* a rule is owed and at what severity; a Warchief writes the detector — you never
       read the diff it is grounded in, and that boundary does not bend for this.
     - `promotion` (a class recurred in 2 or more distinct cards DESPITE its rule) → the advisory
       severity is not deterring. **You hold the ratification act, and only you: the Warchief never
       ratifies.** Setting `ratified: true` + `severity: blocker` is what lets the Skinner FAIL work
       over a rule the tribe wrote for itself, so it is permitted only when **all four** of these
       hold — every one of them mechanical, none of them a matter of taste:
       1. the pattern is recorded as `recurred` in **2 or more distinct cards** (the duty above is
          precisely this condition, computed for you);
       2. the blast-radius backtest passes — `tripwire-check.sh REPO-ROOT --backtest RULE-FILE`
          returns `pass`, i.e. the detector fires on **no more than 25% of the last 20 merged
          commits**. A rule that would have fired on more than a quarter of recent work is a wolf,
          not a guardrail: narrow it instead of ratifying it;
       3. you write the ratification into the **Decision Log** — rule id, the two cards that earned
          it, and the measured fire rate;
       4. the **blocker budget has room** (cap: 12 ratified blockers). Minting a thirteenth means
          retiring one first — rules that accrete forever stop being read.
       **Auto-escalation to the owner:** if the rule's `paths` glob is repo-wide AND its backtest
       fire rate exceeds the threshold, you do **not** ratify it — carry it to the owner *before*
       any ratification. That combination is a standing veto over everything the tribe will ever
       build, and a standing veto is a new permission, which is the owner's alone to grant. Every
       ratification you do make appears in the end-of-campaign report, where the owner may veto or
       retire it.
     - `narrowing` (a rule waived in 3 or more distinct cards) → it is a false-positive generator.
       Dispatch a card to narrow its detector, or retire it.
     - `retirement` (a rule cited zero times across the last 5 shipped cards) → retire it at
       campaign close. Note that a `deterred` line COUNTS as a citation: a rule that is quietly
       working is not a rule that is dead.
     **Log every one of these acts in the Decision Log** — a ratification not written down was never
     made, and the next Shaman will not be able to tell a deliberate blocker from an accident.
```

- [ ] **Step 3b: Edit `plugins/tribe/agents/hunter.md` (GREEN).** Extend anti-goal 5, verbatim:

```markdown
5. **No silent green.** Never weaken or delete a test to make the suite pass; never claim done with
   a red or skipped gate. If you can't make it pass honestly, report `BLOCKED`. This is no longer
   only a norm you are trusted to keep: it is a checkable rule
   (`.claude/rules/tripwires/weakened-test.md`, id `tripwire-weakened-test`), and the reviewer runs
   its detector against your added lines. A skip you add is found by grep, not by goodwill.
```

- [ ] **Step 4: Prove GREEN — the whole suite, plus the end-to-end evidence.**

```bash
plugins/tribe/scripts/tests/test-tripwire-check.sh
plugins/tribe/scripts/tests/test-tripwire-rules.sh
plugins/tribe/scripts/tests/test-agent-contracts.sh
plugins/tribe/scripts/tests/test-validate-plan.sh
plugins/tribe/scripts/tests/test-resume-check.sh
```

      Expected: every suite reports `0 failed` and exits 0 — including the two pre-existing suites,
      which this card must not disturb.

      Then capture the card's evidence per spec §5: run the Tracker against the fixture diff that
      adds `it.skip(` — BEFORE (base commit, no rules directory) it flags nothing, because
      `tracker.md:89` forbids it from inventing standards; AFTER (this branch) it reports a
      Should-fix citing `tripwire-weakened-test` with `file:line`. Same input, same agent prompt for
      loading rules, different review. Embed both transcripts in the PR body.

- [ ] **Step 5: Commit** — `feat(tribe): shaman closes the cross-card meta-loop; hunter anti-goal 5 becomes checkable`,
      trailers `Tribe-Card: idea-10-meta-loop-tripwires` and `Tribe-Task: 8/8`.
