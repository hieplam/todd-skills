# Spec — Idea 10: the meta-loop, "fix the process, not the code"

**Card:** `idea-10-meta-loop-tripwires`
**Branch:** `planning/idea-10-meta-loop-tripwires`
**Status:** spec complete. The one escalated What/Why question — *who may ratify a tribe-minted rule
to Blocker severity* — was **ruled by the Shaman as Decision Log D4 (owner-ratified): Option A, the
Shaman ratifies under four mechanical conditions, with owner auto-escalation for repo-wide
over-threshold rules; the Warchief never ratifies.** See
[Ratification authority](#ratification-authority--ruled-decision-log-d4-owner-ratified). Nothing
else in this spec depends on that ruling.

---

## 1. Problem

Jarred Sumner's closing thesis for the Bun Zig→Rust port, verbatim from the blog:

> "A language-independent test suite with a million assertions, adversarial code review and when
> something does go wrong, **fixing the process that generates the code instead of hand-fixing the
> code.**"

Across 11 days he did not hand-fix code. When a failure *pattern* showed up — overlapping
`git stash`, stub functions, long comments justifying a workaround — he edited the **workflow
rules**, and the rules he wrote were near-mechanical:

> "If you need a paragraph-long comment to justify why the workaround is OK, the code is wrong —
> fix the code."

(Handoff `bun-rust-migration-analysis-handoff.md` §1.4 layer 5 / line 87, §1.3 line 70, §4.3 line
224, appendix B.3 lines 310-318.)

**Tribe already owns half of this loop, and only half.**

The **enforcement** half exists and is genuinely good:

- `plugins/tribe/agents/tracker.md:21` — *"The rules live in files, not in this prompt. You read
  them fresh on every review, so when rules are added or edited your review changes with them
  automatically — with no change to this agent."*
- `plugins/tribe/agents/tracker.md:33-35` — the rule sources it re-reads every run: every `*.md`
  under `~/.claude/rules/`, honouring each file's `paths:` frontmatter glob; the repo's
  `.claude/rules/`; `CLAUDE.md`; C3.
- `plugins/tribe/agents/tracker.md:37` — *"derive one concrete, checkable item per rule"*.
- `plugins/tribe/agents/tracker.md:91` — an existing severity vocabulary: Blocker > Should-fix >
  Optional.

So: **add a rule file, and every subsequent review enforces it, with zero agent changes.** The
socket is live and nothing is plugged into it.

The **learning** half does not exist. Nobody has the job of *writing* a rule when a pattern
repeats, and no durable record would let anyone notice that it repeated:

- `plugins/tribe/agents/warchief.md:441-454` (step 6) — the Warchief audits with the Skinner and
  loops fixes, capped at 3 rounds. Rounds 1, 2 and 3 may fail for *the same reason*; the Warchief
  sees that only inside its own context window, and **agents die on return**. Nothing about *why*
  a round failed is written anywhere durable. The lesson dies with the instance.
- `plugins/tribe/agents/shaman.md:89-94` and `:324-330` (verify-SHIPPED) — the Shaman verifies the
  *outcome* against the card's measurable goal, explicitly **"from the evidence — never by reading
  code"**. It therefore never sees FAIL classes at all, and has no way to notice that card 3 and
  card 7 failed for the same reason.
- `plugins/tribe/agents/shaman.md:97-98` — the Decision Log, the tribe's only durable cross-card
  memory, records **rulings on `NEEDS_DIRECTION` questions**. A failure pattern that the Warchief
  fixed on its own never produces a ruling, so it never reaches the log.
- `plugins/tribe/agents/hunter.md:103-104` — anti-goal 5: *"Never weaken or delete a test to make
  the suite pass."* This is exactly the shape of a Jarred rule — and it is **not a rule any
  reviewer can check**. It lives in the Hunter's own prompt, so it binds only the agent that reads
  it, and nothing inspects the diff to detect a violation. A Hunter that ignores it is caught only
  if a Skinner happens to notice.
- This repo has **no `.claude/rules/` directory at all** (verified: absent at repo root). Tracker's
  fresh-read mechanism currently loads zero project tripwire rules here. The socket is not just
  empty — it was never wired up in the tribe's own repo.

**Net:** the same failure can be paid for over and over. Each payment is a fix round (tokens, wall
clock, a fresh Hunter) and each one teaches the tribe nothing, because the tribe's memory is files
and no file records the pattern.

### The failure this feature must not become

The handoff's alarm-fatigue warning is real, and I must state its scope honestly: **it is not a
warning about rule bloat.** It is about adversarial reviewers with no honorable PASS path (§4.3
line 223 — a reviewer forced to always find something will Goodhart, invent nitpicks, and
"cry wolf", after which every later review is discounted; the Datadog analogy: a monitor that
screams constantly gets its notifications turned off, and on the day it screams for real nobody
listens). §4.4 principle 2 gives the prescription: *"an adversarial prior is not an obligation to
find a bug; a FAIL must carry a concrete, falsifiable claim; a PASS after real scrutiny is a valid
result — otherwise you are raising a wolf that howls at nothing."*

That warning transfers to *this* feature by analogy, and the analogy is exact enough to design
against: **a self-written rule with a sloppy detector is a wolf that howls at every diff.** The
handoff's own cost-asymmetry passage (§4.3 lines 219-221) says cheap false positives are fine
*when a mechanical oracle adjudicates them* — a compiler, a test. A Blocker-severity tripwire rule
IS a mechanical oracle, which is exactly why a bad one is dangerous: it blocks everything and there
is no higher oracle to overrule it. Guardrails G1-G4 below exist for precisely this.

---

## 2. Proposed design

Five pieces. The first four make the loop *mechanical* — "the same pattern twice" becomes string
equality and a script's exit code, not an LLM's recollection. The fifth wires the duties into the
three prompts that hold the matching authority.

### 2.1 The findings ledger — durable, greppable memory of *why* work failed

**New:** `docs/tribe/ledger/CARD-SLUG.tsv` — **one file per card**, append-only, tab-separated.

One file per card is not cosmetic: cards run concurrently in separate worktrees (up to 9 in the
current campaign). A single shared ledger file would conflict at end-of-file on every merge. Per-card
files are conflict-free by construction, and the aggregate is a `glob` read by the checker.

Columns:

| col | name | meaning |
|-----|------|---------|
| 1 | `ts` | ISO-8601 UTC timestamp |
| 2 | `card` | card slug |
| 3 | `task` | `N/TOTAL`, or `branch` for the end-of-branch audit |
| 4 | `round` | fix-round number (1-3) |
| 5 | `class` | kebab-case **failure class** slug — the unit of "the same pattern" |
| 6 | `rule` | id of the tripwire rule covering this class, or `-` if none exists |
| 7 | `outcome` | `uncovered` / `deterred` / `recurred` / `waived` (below) |
| 8 | `evidence` | one line, no tabs: `file:line` + what was wrong |

Example line:

```
2026-07-12T09:14:03Z	idea-03-foo	2/5	1	weakened-test	-	uncovered	tests/api.test.ts:88 assertion deleted to make the suite pass
```

**Who writes it:** the **Warchief**, in step 6, immediately after each Skinner FAIL verdict — one
line per Critical/Important finding **class** (findings collapse into classes; five findings of one
class are one line). It lands in the **same commit as the fix**, obeying the crash-safety invariant
already law in `warchief.md:129-193` (work and its done-record never separate).

**The `outcome` column is what makes the guardrails computable:**

- `uncovered` — no tripwire rule exists for this class. *This* is what accumulates toward
  "write a rule".
- `deterred` — a rule exists, it caught the problem, the Hunter fixed it that round. **The rule is
  earning its keep.** This is the column that stops a *working* rule from looking dead (the
  vaccine-worked-so-stop-vaccinating trap: a rule that successfully deters would otherwise show zero
  activity and be retired as useless).
- `recurred` — a rule exists, yet the class was introduced anyway *and* took more than one round to
  clear. The advisory severity is not deterring. **This is the promotion evidence.**
- `waived` — a Warchief judged the rule a false positive here and waived it (§2.4). Repeated waivers
  are the false-positive signal.

**Class vocabulary discipline (reuse-first):** before coining a class slug, the Warchief must grep
the existing ledger and rule files for a matching class and reuse it. Coining a near-synonym
(`skipped-test` next to `weakened-test`) is what would silently defeat the ≥2 trigger. This is
mechanical: `tripwire-check.sh --classes` prints the vocabulary in use.

### 2.2 `tripwire-check.sh` — the trigger, as a script rather than a memory

**New:** `plugins/tribe/scripts/tripwire-check.sh`, joining the existing script family
(`heartbeat-check.sh`, `resume-check.sh`, `validate-plan.sh`) and following its conventions exactly:
JSON on stdout, logs on stderr, exit 0 = ran successfully (regardless of verdict), exit 2 = setup
error, offline, fixture-testable.

It reads every `docs/tribe/ledger/*.tsv` plus the frontmatter of every rule file under the
tripwire rules directory, and prints the duties that are due, with the authority that owns each:

```json
{
  "classes": [
    {
      "class": "weakened-test",
      "occurrences": 3,
      "cards": ["idea-03-foo", "idea-07-bar"],
      "max_rounds_in_one_card": 2,
      "rule": null,
      "outcomes": {"uncovered": 3},
      "duty": "new-rule",
      "authority": "shaman"
    }
  ],
  "budget": {"ratified_blockers": 2, "cap": 12, "exhausted": false},
  "duties": [{"duty": "new-rule", "class": "weakened-test", "authority": "shaman"}],
  "verdict": "duties_due"
}
```

**The trigger rules — this is the card's question (a), answered precisely:**

| trigger | evidence read from | fires when | authority |
|---------|--------------------|-----------|-----------|
| **new-rule (within-card)** | this card's ledger file | the same `class` appears with `outcome=uncovered` in **≥2 distinct fix rounds of the same card** | **Warchief** — mints the rule in the same PR, before it may return `SHIPPED` |
| **new-rule (cross-card)** | all ledger files on the default branch | the same `class` appears with `outcome=uncovered` in **≥2 distinct cards** | **Shaman** — at verify-SHIPPED, mints a tripwire card and dispatches it |
| **promotion** | all ledger files | the same `class` has `outcome=recurred` in **≥2 distinct cards** despite a rule existing | **Shaman** (subject to the escalated question) |
| **retirement** | all ledger files | a rule has **zero** `deterred`/`recurred`/`waived` citations across the **last 5 shipped cards** | **Shaman**, at campaign close |
| **narrowing** | all ledger files | a rule has `outcome=waived` in **≥3 distinct cards** | **Shaman** — the rule is a false-positive generator |

Cross-card counting is evaluated on the **default branch**, where every shipped card's ledger lines
have landed. That is also exactly when the Shaman runs it: at verify-SHIPPED, after the merge.
Concurrent in-flight cards cannot see each other's ledgers, and should not.

### 2.3 The tripwire rule format — checkable by Tracker, mechanically

**New:** `.claude/rules/tripwires/CLASS.md` in the repo under work. Tracker already reads the
repo's `.claude/rules/` fresh every run and already honours `paths:` frontmatter
(`tracker.md:33-34`), so a rule dropped here is enforced with **no change to the Tracker's
rule-loading mechanism** — only one new *step* (§2.5) teaches it to run the detector.

Frontmatter contract:

| field | meaning |
|-------|---------|
| `id` | the id Tracker cites in findings (`tracker.md:59` — cite by id exactly as named in the source) |
| `tripwire-class` | the ledger class this rule closes — the join key between rules and ledger |
| `paths` | glob, honoured by Tracker as today |
| `severity` | `blocker` / `should-fix` / `optional` — Tracker's existing vocabulary (`tracker.md:91`) |
| `status` | `probation` / `active` / `retired` |
| `ratified` | `true` / `false` — **the flag that grants blocking power** (see the open question) |
| `detect-kind` | `line-regex` or `comment-block` — a closed detector vocabulary |
| `detect` | for `line-regex`: the regex, matched against the **content of each ADDED diff line** (leading `+` and diff headers already stripped by the caller) |
| `detect-keywords` + `detect-min-lines` | for `comment-block`: trips when the diff adds a contiguous comment block of ≥ N lines containing a keyword |
| `waiver` | the token that grants an honorable pass (§2.4) |
| `minted-by` / `minted-in` | provenance: which authority minted it, from which card |

`comment-block` exists because Jarred's sharpest rule — a paragraph-long comment justifying a
workaround — is inherently multi-line and cannot be a single-line regex. A closed two-kind detector
vocabulary keeps rules mechanically checkable while covering the real patterns; `tripwire-check.sh`
lints every rule file for a supported `detect-kind` so an unmechanical "rule" can never enter the
directory.

**Three seed rules ship with the feature** — Jarred's own three false starts, minus the git ones
(tribe already bans loose git operations via its commit contract):

1. `weakened-test` — an added line that skips/ignores/disables a test. This finally makes
   `hunter.md:103-104` **checkable** instead of merely declared.
2. `unfinished-work-marker` — an added stub or unfinished marker (`todo!(`, `unimplemented!(`,
   `NotImplementedException`, `raise NotImplementedError`, or a lowercase-insensitive `todo`/`fixme`
   comment marker).
3. `workaround-justification-comment` — an added contiguous comment block of ≥4 lines containing
   `workaround` / `hack` / `for now` / `temporar` / `kludge`. Jarred's rule, verbatim in spirit: if
   it takes a paragraph to justify, the code is wrong.

All three are minted at `severity: should-fix`, `status: probation`, `ratified: false` — advisory
from birth (G1).

### 2.4 Guardrails against the wolf — question (c), designed against, not hand-waved

- **G1 — Advisory-first.** A self-minted rule lands `ratified: false` → Tracker reports it at
  Should-fix; **the Skinner ignores it entirely.** Skinner enforces only *done-gating* governance,
  so a rule can only FAIL work once `ratified: true` + `severity: blocker`. **The tribe can never
  give itself blocking power by accident** — that requires a deliberate ratification act, which is
  the escalated question.
- **G2 — Blast-radius backtest.** Before any rule may be ratified to Blocker,
  `tripwire-check.sh --backtest RULE-FILE` runs its detector against the added lines of the last
  N=20 merged commits and prints a **fire rate**. If the rule would have fired on >25% of them, it
  is too broad: narrow it or escalate. This is a *mechanical false-positive-rate estimate* — the
  honest answer to "is this regex a wolf?", computed before it is given teeth, not after it has
  eaten the campaign.
- **G3 — An honorable pass path.** Every rule declares a `waiver` token. A Warchief may waive it for
  one commit (`tribe-waiver: CLASS reason`), which records `outcome=waived` in the ledger. This is
  §4.4 principle 2 applied to rules: an adversarial gate with no legitimate PASS breeds a wolf. And
  waivers are not free — ≥3 across distinct cards flags the rule for narrowing (§2.2).
- **G4 — Budget cap and retirement sweep.** At most **12 ratified Blocker tripwires**; minting the
  13th requires retiring one, which forces prioritisation instead of accretion. At campaign close
  the Shaman retires any rule with zero citations across the last 5 shipped cards. `deterred` counts
  as a citation, so a rule that is *working* is never mistaken for a dead one.

### 2.5 The duties — where each prompt changes (question (b): who writes, and where)

| file | change |
|------|--------|
| `plugins/tribe/agents/tracker.md` | one new step: for each loaded rule carrying a `detect-kind`, run the detector against the added lines of the diff and report at the declared `severity`, citing `id`. Plus the tripwire rules path in its rule-source list. |
| `plugins/tribe/agents/warchief.md` (step 6) | after each Skinner FAIL, append ledger lines (class + outcome + evidence) in the fix commit; before returning `SHIPPED`, run `tripwire-check.sh` — a within-card `new-rule` duty must be discharged **in this same PR** (mint the rule at probation/should-fix/unratified). |
| `plugins/tribe/agents/shaman.md` (verify-SHIPPED, step 3) | after `verify-shipped` PASS, run `tripwire-check.sh` on the default branch; cross-card `new-rule` duty → mint a tripwire idea card and dispatch a Warchief for it (the Shaman decides *that a rule is owed*; a Warchief writes it — roles intact, the Shaman never writes rule text from a diff it is forbidden to read). Promotion/retirement/narrowing duties → rule per the ratification protocol, log every act in the **Decision Log**. |
| `plugins/tribe/agents/hunter.md` | anti-goal 5 gains a pointer to the now-checkable `weakened-test` rule: the norm and its detector, cross-referenced. |

**Why the Shaman mints a *card* rather than writing the rule itself:** `shaman.md:104` forbids it
from reading the Warchief's spec, plan or diff. A rule's detector must be grounded in the diffs that
produced the pattern. So the Shaman's act is the What ("this pattern has recurred across cards and
now deserves a rule, at this severity"); the How (the regex, the waiver, the backtest) belongs to a
Warchief. The chain of command is preserved exactly.

---

## 3. Scope fence

**In scope** (for the future implementation campaign this plan feeds):

- `plugins/tribe/scripts/tripwire-check.sh` + its fixture tests.
- `.claude/rules/tripwires/` + the three seed rule files + a rule-format lint.
- Prompt edits to `tracker.md`, `warchief.md`, `shaman.md`, `hunter.md` (the four duties above).
- `docs/tribe/ledger/` (directory + format doc).

**Out of scope — explicitly:**

- Changing the Skinner's verdict semantics. A FAIL stays authoritative; the Skinner simply gains
  ratified Blocker tripwires as one more done-gating rule source.
- Any change to the fix-round cap of 3 (`warchief.md:446`), the Decision Log format, or the
  `verify-shipped` skill's own checks.
- Automatic rule *generation* by an LLM from the ledger. A duty is raised mechanically; the rule
  text is authored by an agent and reviewed — never auto-committed.
- Retro-filling the ledger for already-shipped cards.
- Idea 06's `CODEX.md` (see §6). This feature must not depend on it.

**Scope fence of THIS planning campaign** (already honoured): only
`docs/tribe/planning/idea-10-meta-loop-tripwires/` and `docs/tribe/state/`. **Zero changes under
`plugins/`.** The plan carries the intended rule and prompt text; it is not applied here.

---

## 4. Testing / verification strategy

The repo's existing script tests (`plugins/tribe/scripts/tests/test-validate-plan.sh`,
`test-resume-check.sh`) are offline, fixture-driven bash with TAP-ish `ok -` / `not ok -` output.
The plan follows that harness exactly — every task is red-first against it.

| what | how it is proven |
|------|------------------|
| ledger parsing, trigger arithmetic | `test-tripwire-check.sh` with fixture ledger dirs: empty → `clear`; same class in 2 rounds of one card → within-card `new-rule` duty, authority `warchief`; same class in 2 cards → cross-card duty, authority `shaman`; 2 `recurred` in 2 cards → `promotion`; zero citations over 5 cards → `retirement`; 3 `waived` → `narrowing`; a covered class → no new-rule duty. Exit 2 on a missing ledger dir. |
| the budget cap | fixture rules dir with 12 ratified blockers → `budget.exhausted: true` and a 13th mint blocked. |
| blast-radius backtest (G2) | `--backtest` against a fixture git repo with known diffs: a narrow regex → low fire rate, verdict `pass`; a deliberately broad regex (matches every diff) → fire rate 1.0, verdict `too-broad`. |
| the three seed rules actually detect | `test-tripwire-rules.sh`: each rule's detector is run against a **positive fixture diff** (must fire) and a **negative fixture diff** (must not fire) — the false-positive half is as tested as the true-positive half. |
| rule-format lint | a rule file with an unknown `detect-kind`, or a `blocker` + `ratified: true` rule with no backtest record, is rejected by `tripwire-check.sh --lint`. |
| the four prompt edits | `test-agent-contracts.sh` — greps each agent file for the exact required clause. A prompt edit is TDD-able exactly this way: assert the contract line is present, watch it fail, add it. |
| the loop actually closes (end-to-end) | the evidence plan below. |

## 5. Evidence plan

The measurable claim of this card is "**the pattern does not recur, because the rule now catches
it automatically**". The evidence must show a *behaviour change in the reviewer*, not a file
existing.

- **BEFORE:** on the base commit (no rules dir), run the Tracker against a fixture diff that
  deletes an assertion and adds `.skip` to a test. Capture its output: it does **not** flag a
  weakened test (there is no rule to cite; `tracker.md:89` — *"enforce the rules you read; never
  invent standards"*). Screenshot / captured transcript.
- **AFTER:** on the feature branch, run the Tracker against the *same* diff. It now loads
  `.claude/rules/tripwires/weakened-test.md`, runs its detector, and reports a Should-fix citing
  `tripwire-weakened-test` with `file:line`. Same input, different review — with **no change to the
  Tracker's own logic**, which is the whole point of `tracker.md:21`.
- **Trigger evidence:** a fixture ledger with the same class in 2 rounds → `tripwire-check.sh`
  prints the `new-rule` duty and its authority. The JSON is the artefact.
- **Guardrail evidence:** `--backtest` on a deliberately broad regex → fire rate >25%, verdict
  `too-broad`, ratification refused. The wolf is caught by the machine, before it can howl.

## 6. Interactions with other ideas

- **Idea 06 (campaign codex, `docs/tribe/CODEX.md`) — the alternate rule destination.** Idea 10
  needs a *rule sink that Tracker reads fresh*. Two exist: the repo's `.claude/rules/` (live today,
  `tracker.md:34`) and idea 06's codex (proposed, and idea 06 explicitly plans to add its path to
  Tracker's rule-source list — `bun-rust-migrate-ideas.md` idea 6: *"The Tracker gains one more rule
  source to read fresh… just add the path"*). **Idea 10 targets `.claude/rules/tripwires/` and does
  not depend on idea 06 shipping.** The relationship is defined, not left to chance:
  - **If idea 06 ships first or later**, the codex becomes the natural home for *cross-cutting,
    campaign-scoped* conventions (naming, test patterns, error-handling style — the lookup-table
    material), while tripwires stay in `.claude/rules/tripwires/` because they are **detector-bearing
    and permanent**, not campaign-scoped: a tripwire outlives the campaign that minted it, and the
    codex is explicitly frozen *per campaign*. Putting a detector in a frozen per-campaign artefact
    would mean the rule dies when the campaign ends — the exact failure idea 10 exists to prevent.
  - **The integration point, if the Shaman wants one:** the codex's frontmatter may *reference* the
    active tripwire ids (a one-line "active tripwires: see `.claude/rules/tripwires/`") so a Hunter
    reading the codex as its lookup table finds them. That is a one-line addition to idea 06's
    template and requires nothing from idea 10.
  - **Build-order note:** they are independent. `bun-rust-migrate-ideas.md:275-277` suggests
    "10 → 6" (the rule/artifact cluster); either order works, since neither's files overlap
    (`.claude/rules/tripwires/` vs `docs/tribe/CODEX.md`).
- **Idea 1 (2 parallel Skinners) and Idea 4 (disagreement routing).** These *multiply* idea 10's
  input: two reviewers produce more findings, so more classes reach the ledger. Ledger writing is
  per-**class**, not per-finding, so the volume does not explode. If idea 4's routing table lands,
  a "both Skinners flagged the same spot → Critical" finding is a strong candidate for a ledger line
  — worth one clause in idea 4's table, but not a dependency.
- **Idea 5 (fixer may drop claims, reproduce-first).** Direct interaction, and a *good* one: a
  finding the fixer could not reproduce must **not** be recorded as a ledger line (it would poison
  the class counts with false positives and manufacture a rule for a non-existent pattern). Rule:
  **only findings that survived to an actual fix (or an explicit waiver) are ledgered.** If idea 5
  ships, this is automatic; until then, the Warchief applies the same discipline by hand.
- **Idea 7 (mechanical work queue) / Idea 8 (`integrate-wave.sh`).** Same philosophy — determinism
  into scripts — and `tripwire-check.sh` is a sibling of their scripts, sharing the family's JSON /
  exit-code conventions. No file overlap.
- **Idea 9 (ephemeral Warchief per wave).** Reinforcing: a Warchief that dies every wave has *less*
  in-context memory of failure patterns, which makes the durable ledger **more** necessary, not
  less. Idea 10 is what keeps the lesson when idea 9 throws the context away.

## 7. Risks & rollback

| risk | mitigation |
|------|-----------|
| **A bad detector blocks every future card** (the wolf). | G1 (advisory-first: unratified rules can never FAIL work) + G2 (blast-radius backtest before ratification) + G3 (waiver = honorable pass) + G4 (budget cap). Rollback of a single rule = delete one file; the Tracker's fresh read means the change is instant, with no agent edit. |
| **Class-slug drift** (`skipped-test` vs `weakened-test`) silently defeats the ≥2 trigger. | Reuse-first discipline + `tripwire-check.sh --classes` prints the live vocabulary; the Warchief must grep before coining. |
| **Ledger noise from unreproduced findings** manufactures rules for non-patterns. | Only findings that survived to a real fix or an explicit waiver are ledgered (interaction with idea 5). |
| **The ledger becomes a chore nobody writes**, and the loop silently no-ops. | The ledger line rides in the *same commit* as the fix (the existing crash-safety invariant), and `tripwire-check.sh` is run as a **gate before `SHIPPED`** — an un-ledgered FAIL round is visible as a Skinner FAIL with no matching ledger line. |
| **Merge conflicts on a shared ledger** under 9 concurrent cards. | One ledger file per card; the checker globs. Conflict-free by construction. |
| **A working rule looks dead and gets retired.** | The `deterred` outcome counts as a citation in the retirement sweep. |
| **Rules accrete forever.** | G4: cap 12 ratified blockers; retirement sweep at campaign close. |

**Rollback:** the feature is additive and reversible in layers. Delete a rule file → that tripwire
is gone next review. Delete `.claude/rules/tripwires/` → Tracker reverts to today's behaviour
exactly. Revert the four prompt edits → the duties disappear; the ledger becomes an inert TSV that
nothing reads. No data shape, no user-facing promise, no CI dependency is touched.

---

## Ratification authority — RULED (Decision Log D4, owner-ratified)

> **Ruling (settled law — do not re-open).** **Option A.** The Shaman may set `ratified: true` +
> `severity: blocker` ONLY when all four hold: (1) the pattern `recurred` in ≥2 distinct cards,
> (2) the backtest fires on ≤25% of the last 20 merged commits, (3) a Decision Log entry is
> written, (4) the blocker budget (cap 12) has room. A repo-wide rule that exceeds the backtest
> threshold **auto-escalates to the owner before ratification**. The owner sees every ratification
> in the campaign report and may veto. **The Warchief never ratifies.**
>
> Encoded in exactly two places: `RATIFY_AUTHORITY` (plan Task 3) and the shaman.md clause (plan
> Task 8), and guarded by six assertions in `test-agent-contracts.sh`.

The question as escalated, and the options weighed, are preserved below for context.

**Question: who may set `ratified: true` + `severity: blocker` on a tribe-minted tripwire rule —
the flag that lets a rule the tribe wrote for itself FAIL future work?**

**Why it is a What/Why question and not mine.** The mechanism is How, and it is fully designed
above. But *who holds the authority to create new blocking power* is an allocation of authority
inside the chain of command — the Shaman's lane, not the Warchief's. Note the shape of what is
being granted: a ratified Blocker tripwire is a **standing, machine-enforced veto over all future
cards in the repo**, minted by the tribe itself. Under `shaman.md`'s escalation register
("data shapes, product promises, **new permissions**, privacy"), a system granting itself a new
standing permission is at least arguably in the register. I will not decide that for the Shaman.

**What is already settled and does NOT depend on the ruling:** the ledger, the trigger script, the
rule format, the detectors, the three seed rules, and guardrails G1-G4. Under every option below,
self-minted rules are born advisory and only a ratification act gives them teeth. **Only the holder
of that act changes** — one line in `shaman.md` and one line in the rule-format doc.

**Options:**

- **Option A — the Shaman ratifies (my recommendation).** Promotion to Blocker requires: ledger
  evidence (`recurred` in ≥2 distinct cards), a **passing blast-radius backtest** (G2), a Decision
  Log entry, and it counts against the budget of 12. The owner sees every ratification in the
  end-of-campaign report and may veto or retire any of them.
  *Why:* the Shaman is the owner's delegate and already holds the Decision Log; the evidence bar is
  mechanical rather than a matter of taste; the loop closes at machine speed, which is the entire
  payoff of the card. The blast radius of a mistake is bounded by design (delete one file, and the
  next review is clean).
- **Option B — the owner ratifies every Blocker.** The Shaman carries each promotion up as a "new
  permissions" escalation. *Cost:* an owner round-trip per rule. *Risk:* if the owner is slow, every
  tripwire stays advisory, gets routinely ignored, and the meta-loop never actually closes — the
  precise failure idea 10 exists to fix, restored in a new costume.
- **Option C — the Warchief mints Blockers directly** (no ratification act at all). *Fastest;
  highest wolf risk:* one over-broad regex, and every future card is blocked with no human in the
  loop. **Not recommended.**

**Recommendation: Option A**, with one hedge borrowed from B: a rule whose `paths` glob is
repo-wide **and** whose backtest fire rate exceeds 25% is auto-escalated to the owner rather than
being ratified by the Shaman. That routes exactly the rules with genuine blast radius to a human,
and nothing else.
