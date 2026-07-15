# Rescope — idea-11-review-cell-v3 against the advisory-Skinner law change

> Shaman rescoping memo. Mode 1 only — What/Why + scope, no How, no code, no dispatch. Grounds
> every verdict in the actual rewritten `plugins/tribe/agents/skinner.md` /
> `plugins/tribe/agents/warchief.md` (both uncommitted on master as of this memo) or the card/plan
> as committed. Verified by direct read + grep, not inference — citations are `file:line`.

## Ground truth established before scoring anything

- **Task 1 (plan) shipped and SURVIVED the rewrite intact.** `skinner.md`'s two cold sub-lenses
  (`lens: cold-executor` / `lens: cold-reader`, skinner.md:163-191) and the path-scope
  contamination rule (skinner.md:186-191) are present, and the bare-`cold` deprecation mapping
  (`lens: cold` → read as `cold-executor`, skinner.md:182-184) is present. Nothing here needs
  rebuilding.
- **`warchief.md` contains ZERO occurrences of `pre-gate`, `three-lens`, `cold-reader`, or
  `cold-executor`** (grepped directly). Confirmed: none of Task 2 (script), Task 3 (step-6 law:
  path-scope warchief half, three-lens dispatch, pre-gate law), or Task 4 (ledger) ever landed —
  matches the state file's "tasks 2-5 NOT BUILT."
- **The currently-live cell is still exactly two lenses**, dispatched by warchief.md Law 1
  ("two lenses, two briefs, one message", warchief.md:461) as Skinner A `lens: contract` and
  Skinner B `lens: cold` (warchief.md:478) — the bare, undifferentiated value, which skinner.md's
  deprecation rule silently resolves to `cold-executor`. **`lens: cold-reader` is fully built and
  fully dead code today** — nothing in warchief.md ever names it, so it is never dispatched by any
  standing law. This is the crux of the rescope: Task 1 paid for a capability Task 3 was supposed
  to wire in, and that wiring never happened, and now the law it would wire into has changed.
- **The adjudication model is genuinely new, not just relabeled.** Law 4 (warchief.md:556-582)
  is titled "no lens holds a verdict; you do" and is explicit that this used to be different — the
  contract lens's terminator is now `CONTRACT-LENS: N findings` (warchief.md:472, skinner.md:441),
  never `AUDIT: PASS/FAIL`. Confidence classes (warchief.md:657-667), the routing table
  (warchief.md:687-698), and the conflict ladder (warchief.md:719-1022) are otherwise **unchanged
  in wording** from the two-reviewer world — they still say "both reviewers" (warchief.md:665),
  not "at least two of three."
- **`warchief.md` step 7 still literally says squash** ("Squash-merge into the default branch once
  green.", warchief.md:1083) — D-owner-3's filed follow-up is confirmed still open; my rewrite did
  not touch it (out of its scope, and out of this rescope's scope fence too — flagged, not fixed).

---

## Per-piece verdict table

| # | Piece | Verdict | One-line why |
|---|---|---|---|
| Task 2 | `pre-gate.sh` script (create + self-test) | **RESCOPE** (goal wording only; the build itself survives) | Script mechanics are orthogonal to lens count and to verdict-vs-advisory; only the *justification numbers* need updating against the advisory model's already-reduced baseline |
| Task 3a | Delta-A warchief half — path-scoped cold diff, forbidden-channel row | **RESCOPE** — de-bundle from Task 3, build regardless of the 3-lens ruling | Independent of lens count; goal (a) needs it and nothing about it collides with advisory law |
| Task 3b | Delta-C law half — step-6.0 pre-gate law | **RESCOPE** — de-bundle from Task 3, reconcile against targeted verification | Compatible with, and arguably reinforced by, "failing proof = Critical, DEBT forbidden" (see below) |
| Task 3c | Delta-B — three-lens dispatch expansion (Law 1 rewrite, two-of-three `agreed`, rung-2 free majority) | **RESCOPE, gated on an owner ruling** | The old diff target (verdict-model step 6) no longer exists; the *idea* — a second cold sample — is still coherent under advisory adjudication, but is a new design against new text, not a reapplied patch |
| Task 4 | Ledger `lens` column + `## Reviewer yield` table | **RESCOPE** (minor) | Ledger already gained `class`/`routed` columns independently (warchief.md:885-888); `lens` slots in as a third; its value set depends on Task 3c's outcome |
| Task 5, eval 1 | cold-executor cites the run | **SURVIVES-AS-IS** | Tests skinner.md-only behavior already shipped; expected output (`COLD-LENS:` terminator, no `AUDIT:` line) is unchanged by the rewrite |
| Task 5, eval 2 | cold-reader finds contradiction without running suites | **SURVIVES-AS-IS** | Same reasoning as eval 1 — pure skinner.md behavior, unaffected |
| Task 5, eval 3 | Warchief refuses contract-bearing cold range | **RESCOPE** (blocked on Task 3a) | Content is fine; can't run until Task 3a's warchief-side path-scope law actually exists |
| Task 5, eval 4 | Warchief classes cold+cold convergence as `agreed` | **RESCOPE, gated on the same owner ruling as Task 3c** | Only meaningful if two cold lenses are actually dispatched; otherwise this scenario cannot occur |
| Goal (a) | zero cold-lens contamination incidents | **RESCOPE** (unblock only) | Needs Task 3a, independent of the lens-count ruling |
| Goal (b) | ≥1 finding from cold-executor's run artifacts | **SURVIVES-AS-IS** | Already achievable today — `lens: cold` already resolves to `cold-executor` (skinner.md:182-184); no further build needed, only needs to be observed on the next campaign |
| Goal (c) | briefs stop mandating full-suite reruns; ≤1 script-run per round | **RESCOPE** (reframe baseline) | The advisory model's targeted-verification law (warchief.md:640-647) already eliminated most of Gap 4's cost by removing per-fix-round Skinner redispatch entirely; the remaining gap is the one-time discovery-round sweep, not "2 full sweeps per round" |
| Goal (d) | per-reviewer yield columns filled every round | **RESCOPE** (minor) | Same shape as Task 4 |
| D-owner-1 | dogfood the new law on the final audit | **RESCOPE** | The "new law" it names (three-lens, pre-gate-first) is not what shipped; the *doctrine* (audit the campaign under its own newest law) still applies, restated against whichever law is actually live at the time of the final audit |
| D-owner-2 | eval subset (run 1&2, author 3&4) | **SURVIVES-AS-IS** | Still the right split: 1&2 are buildable and runnable now; 3&4 remain gated on Task 3a/3c respectively, exactly as before, just for an updated reason |
| D-owner-3 | rebase & merge, never squash | **SURVIVES-AS-IS** | Standing owner ruling, orthogonal to the advisory rewrite; its filed follow-up (step 7 + verify-shipped still say squash) is independently confirmed still open, still unfixed, still out of this card's fence |
| F16 | skinner.md "the other reviewer" singular language | **SURVIVES-AS-IS today; conditional debt** | Verified true and *currently accurate* — the live cell really is two lenses (skinner.md:53,62,265-272). It only becomes a defect if/when Task 3c ships a third dispatched lens. If the owner drops Task 3c permanently, F16 is **SUPERSEDED** (retire the debt entry, the language is correct forever) |
| Follow-up 1 (D14 too weak) | — | **out of scope for this rescope** | Not touched by the advisory rewrite; already correctly filed for the Shaman, not this card |
| Follow-up 2 (step 7/verify-shipped mandate squash) | — | **SURVIVES-AS-IS, confirmed still open** | Re-verified at warchief.md:1083; unrelated to the advisory rewrite |
| Follow-up 3 (Skinner can finish without writing report) | — | **out of scope for this rescope** | Not touched by the advisory rewrite |

---

## Detailed reasoning per piece

### Task 2 — `pre-gate.sh`: SURVIVES-AS-IS as a build; RESCOPE its justification

The script (spec Delta-C, plan.md:211-406) is stateless, parameterized, and tests itself by
running — nothing about *what it does* depends on lens count or on verdict-vs-advisory
adjudication. Build it exactly as planned.

What must be rescoped is the **number** it's sold against. The card's Gap 4 evidence ("Skinner
pairs executed the six tripwire suites 50 times... 37 suite executions returned byte-identical
green results") was measured against the OLD law, where — per the team lead's framing — "any FAIL
forces a fix round + a full fresh dual-Skinner re-audit." That per-fix-round full re-audit is
exactly what the advisory rewrite already eliminated: "Targeted verification replaces per-round
re-discovery... A FIX round does not, by default, dispatch a fresh dual-skinner pair"
(warchief.md:640-641). Under advisory law, a fix round is Warchief-only targeted re-verification —
zero fresh Skinner suite executions. The only Skinner-run suite executions left are: the first
discovery round per task, the "fix rewrote beyond named locations" exception round, and the final
whole-branch audit (warchief.md:633-647). That is already close to the "≤1 sweep" the card wanted
— pre-gate's remaining, real value is removing the *one* sweep the contract lens still runs on
each discovery round, plus the mechanical trailer/fence checks no Skinner does today. Keep the
task; shrink the claimed savings to match reality (see revised goal (c) below).

### Task 3a — path-scoped cold diff (Delta-A, warchief half): RESCOPE, de-bundle, build now

This has no dependency on the lens-count question. skinner.md already refuses a contaminated
**dispatch** (skinner.md:186-191, skinner.md:195-231) — but that refusal only fires if the
Warchief actually hands the cold lens a contaminated diff/range in the first place; nothing in
`warchief.md`'s Law 1 build instructions yet says "path-scope the cold diff, exclude
`docs/tribe/planning/`, `docs/tribe/state/`, add the forbidden-channel row." Building this closes
goal (a) regardless of what happens to Task 3c. **Recommend splitting this out of "Task 3" as its
own task** so it isn't hostage to the owner's 3-lens ruling.

### Task 3b — the pre-gate law (Delta-C, step-6.0): RESCOPE, de-bundle, reconcile with the new Critical/DEBT rule

Also lens-count-independent. Its collision, as the team lead flagged: does "a red pre-gate
short-circuits the round, consumes no fix round" survive next to the new "a failing proof command
is a Critical finding and DEBT is FORBIDDEN for it" (warchief.md's Law 3 DEBT rule, and the
severity rule in skinner.md:453 "a failing proof command... breaks conformance outright")?

**They are compatible, and the pre-gate law is now the CHEAPER path to the same outcome.** Under
advisory law, if the pre-gate never ran and a Skinner discovered the failing suite instead, that
finding would be Critical, CONFIRMED (DEBT is illegal for it — Law 3), and would consume a real
fix round plus a full LLM discovery dispatch just to notice "the suite doesn't pass." Routing that
same mechanical fact through pre-gate *before* any Skinner is dispatched catches it for the price
of a script run, and correctly treats it as what it is — the Hunter's unfinished work, not
something requiring adversarial judgment to find. Nothing here needs a different design from the
original Delta-C text; it composes cleanly with the rewritten Law 3/Law 4. Recommend keeping the
step-6.0 language close to the original spec (plan.md:485-511), adjusted only for: (1) "settled
mechanical fact" admissibility argument stays valid — D9's contract-class test is untouched by
this rewrite; (2) drop any wording that implied the pre-gate interacts with a verdict (`AUDIT:
PASS/FAIL`) — there is no such verdict for it to interact with anymore, it interacts with whether
a discovery round is dispatched at all.

### Task 3c — the three-lens expansion: RESCOPE, but genuinely gated (the heart of the rescope)

The **old diff target no longer exists** — the plan's Task 3 Step 2 (plan.md:478-537) rewrites
phrases like "two tool uses in the same message" and Law 1's exact shipped wording, all of which
have since been rewritten again by the advisory pass into different text at the same location
(warchief.md:461-525 is now the advisory two-lens Law 1, not the idea-03/04 text the old diff
targeted). Applying the old edit would corrupt the advisory rewrite; a fresh Warchief must
re-derive the three-lens delta **against the current step 6 text**, not patch forward from a
stale baseline.

The **design intent survives the law change cleanly**, because the two things are orthogonal:
advisory adjudication changes *who holds the verdict* (nobody; the Warchief adjudicates every
finding). The three-lens question is about *how many independent samples feed that adjudication*.
Under advisory law, "two of three lenses agree" would function exactly as it was designed to:
a stronger prior for the Warchief's CONFIRMED/REFUTED/DEBT call, not a vote that used to override
one. If anything, the case for a second cold sample is *slightly stronger* under advisory
adjudication than under the old verdict model — Law 4 puts the entire evidentiary burden on the
Warchief's own judgment now, so a second independent cold sample is cheap insurance against the
Warchief itself being wrong, exactly the same bias concern the final-whole-branch-audit doctrine
already names ("you are structurally biased toward accepting the work you designed", warchief.md
:454-456).

**Sunk-cost note, not a decision:** `cold-reader` is fully built in skinner.md today and dispatched
by nothing. Every campaign since task 1 shipped has paid zero return on that build. This is a real
consideration but not dispositive on its own — it argues for *resolving* the question (build the
wiring, or formally retire the sub-lens), not for which way to resolve it.

**This is squarely an owner-ratification-required decision** — see below — because it touches Law
4 (how many lenses feed the adjudication) and the `agreed` confidence-class definition, both
named in the card's own decision authority (card.md:88-93) as Shaman-or-above calls, and the team
lead's brief explicitly reserves it for the owner.

### Task 4 — ledger `lens` column + yield table: RESCOPE (minor, mechanical)

The ledger already gained two columns independently of this card: `class` and `routed`
(warchief.md:885-888, "Recording it — the disposition ledger gains two columns", heading at
warchief.md:879). Task 4's original design (spec Delta-D) adds a third, `lens`. Nothing about
`class`/`routed` conflicts with adding `lens` alongside them — same table, one more column, same
"filled by the Warchief when the row is first written" rule. The only thing that must change is
the **value set**: originally `contract` / `cold-exec` / `cold-read`, comma-joined. If Task 3c is
NOT approved, `cold-read` never appears in practice (dead value, same shape as the sub-lens
prompt text itself) — the column and yield table should still ship (cheap, and future-proofs the
data if Task 3c is approved later), but the card should say plainly that `cold-read` is expected
to show `0` in the yield table until/unless Task 3c ships. This makes "measure whether each lens
earns its seat" (the card's original T4 rationale) *more* honest, not less — a yield table that
can show a lens getting zero dispatches all campaign is doing its job.

### Task 5 evals — reconciled against the new terminators and adjudication

Evals 1 and 2 test `skinner.md` behavior directly (a bare `lens: cold-executor` /
`lens: cold-reader` dispatch to the Skinner agent, not routed through Warchief orchestration).
Their `expected_output` — ends with `COLD-LENS:`, never emits `AUDIT:` — is **unchanged** by the
advisory rewrite; skinner.md's cold-lens terminator contract was already exactly this before and
after (skinner.md:111-119, skinner.md:151-153). **No rewrite needed; run them as originally
planned** (this is also D-owner-2's executed subset — unaffected).

Eval 3 (Warchief refuses the contract-bearing cold range) tests Warchief-level behavior that
requires Task 3a to exist first — cannot run until then, exactly the same gate the original plan
implied (task 5 runs after task 3). Content itself needs no rewording: refusing to hand a cold
lens a contaminated range, re-scoping, consuming no fix round, are all still exactly the shape of
the new law (nothing here ever depended on a verdict existing).

Eval 4 (cold+cold convergence classed `agreed`) is **only meaningful if two cold lenses are
actually dispatched** — under a 2-lens-only cell there is no such thing as "both cold lenses flag
the same location," so the scenario cannot occur. This eval is gated on the same owner ruling as
Task 3c. If the owner declines Task 3c, replace eval 4 with a scenario that IS meaningful under
2-lens advisory law and still exercises "confidence classes reward independent convergence" — the
natural replacement is: contract lens silent, cold lens (executor) flags location X → expected
class `single`, CONFIRMED-or-REFUTED-with-evidence per Law 3, never silently dropped. That
preserves the eval's actual teaching point (silence isn't dissent, a lone cold finding still gets
a real disposition) without requiring a lens that may never be dispatched.

---

## Revised measurable goals (a)–(d)

> Superseding card.md's goal paragraph (card.md:22-27). Unchanged in letter for (a)/(b);
> reframed baseline for (c); unchanged in spirit, adjusted value-set language for (d).

**(a)** zero cold-lens contamination incidents on the next implementation campaign (no contract
document reachable from any cold dispatch's diff range) — **unchanged**, requires Task 3a only.

**(b)** at least one finding per campaign originates from the cold lens's run artifacts (command
output cited in the finding) — **unchanged, and already achievable today with zero further
build**: `lens: cold` already resolves to `cold-executor` (skinner.md:182-184), which already
carries the run-evidence mandate (skinner.md:165-169). This goal can be evidenced on the very next
campaign that runs a discovery-round Skinner B, with no code change required.

**(c)** reviewer briefs stop mandating full-suite re-runs, and the pre-gate report carries that
mechanical fact instead — **reframed baseline**: total tripwire-suite executions **by an LLM
reviewer, per DISCOVERY round** (not "per audit round" — fix rounds already run zero Skinner-side
suite executions under the advisory model's targeted verification, warchief.md:640-647) drop from
the contract lens's current full sweep to **zero**, replaced by the pre-gate's one script run.
Requires Task 2 + Task 3b.

**(d)** the disposition ledger shows the `lens` column and the `## Reviewer yield` table filled
for every round, with `cold-read`'s row legitimately showing zero dispatches unless/until Task 3c
ships — **requires Task 4 only; unblocked regardless of the Task 3c ruling.**

---

## Plan deltas for surviving tasks (What/Why only — not a rewritten plan.md)

These are notes for whichever Warchief eventually builds this card; they do **not** replace
plan.md's Method step 3 (writing-plans) work, which is How and belongs to that Warchief.

- **Split the old plan Task 3 into three:** 3a (path-scope, Delta-A warchief half — build
  unconditionally), 3b (pre-gate step-6.0 law, Delta-C law half — build unconditionally, after
  Task 2), 3c (three-lens dispatch expansion, Delta-B — build ONLY if the owner ratifies it).
  Sequencing: Task 1 (done) → Task 2 → Task 3a → Task 3b → [owner ruling] → Task 3c (if
  ratified) → Task 4 → Task 5. Task 4 can run either right after 3b (shipping the ledger/yield
  scaffold with `cold-read` legitimately idle) or after 3c (if ratified, so the value set is
  final on first landing) — Shaman's call at dispatch time, not a fence issue either way.
- **Task 3c, if ratified, must pay F16 first** — exactly as the original state file already
  ordered ("Fix it in task 1's file as the first act of task 3, or the three-lens cell ships with
  a hole in its isolation invariant," idea-11 state file, "Open debt" section). That instruction
  survives verbatim; only the trigger condition (whether task 3c ever happens) is now
  owner-gated instead of assumed.
- **Task 3c's tripwire suite section (old plan.md:415-566)** needs a full rewrite against the
  *current* step 6 text, not a reapplication of the stored diff — the anchor text it greps
  (`awk '/^### 6\./{f=1} /^### 7\./{f=0} f'`) still finds the right span, but every needle inside
  it must be re-derived from the advisory Law 1/3/4 wording actually in warchief.md today, plus
  whatever new phrasing Task 3c's build settles on.
- **Task 5's eval 4** needs either (i) the cold+cold convergence scenario, if Task 3c ships, or
  (ii) the single-cold-lens replacement scenario above, if it does not — decide which at the time
  Task 5 is actually dispatched, once Task 3c's fate is known, not before.

---

## Owner-only decisions (ratification required — not decided here)

Per the card's own decision authority (card.md:88-93: "Shaman decides... any change to Law 4") and
the team lead's explicit instruction to surface rather than rule on anything touching Law 4, the
3-round cap, or the `agreed` supersession, these go to the owner:

### Decision 1 — build the three-lens expansion (Task 3c), or retire `cold-reader`?

- **Option A — build it.** Wire `warchief.md` Law 1 to dispatch three Skinners
  (`contract`/`cold-executor`/`cold-reader`) per discovery round, re-derive `agreed` as
  two-of-three, add the rung-2 free-majority check. Realizes the value Task 1 already paid for;
  matches the card's original Gap-3 evidence (both real defects were each caught by only one of
  two reviewers). Cost: one more Sonnet Skinner per discovery round (first-per-task + final
  whole-branch only, under advisory law — cheaper than it would have been under the old
  per-fix-round re-audit law), plus the F16 fix, plus re-deriving the confidence-class/conflict-
  ladder wording against new text.
- **Option B — retire `cold-reader`.** Formally mark the sub-lens defined-but-unused (or remove
  it from skinner.md), keep the cell at two lenses permanently, close F16 as
  SUPERSEDED-not-a-defect, drop Task 3c and eval 4 entirely.
- **My recommendation: Option A, but only after Task 2/3a/3b ship and one campaign has run under
  them.** The advisory rewrite already captured most of Gap 4's savings on its own, which removes
  the urgency; there's no reason to gate the cheap, unconditional wins (a, c) on this ruling. But
  the sub-lens split exists, cost real money to build (task 1's 3 fix rounds, 6 Skinner reports
  per the state file), and the original evidence for a second cold sample was concrete defect
  data, not speculation — retiring it without ever wiring it in throws that evidence away
  untested. Sequencing the ruling AFTER 3a/3b/one campaign lets the owner decide with the yield
  table (goal d) partially populated instead of on priors alone.

### Decision 2 — the `agreed` two-of-three supersession (only relevant if Decision 1 = A)

- If Task 3c ships, idea-04's `agreed` wording ("both reviewers flagged...", warchief.md:665) must
  be superseded to "at least two of the three lenses," per the D12/D18 doctrine the original spec
  already invoked (spec.md:20-23) — same reasoning, just re-anchored to the advisory text instead
  of the verdict-model text.
- **My recommendation:** ratify the supersession as originally designed (spec.md §Delta-B4) if and
  only if Decision 1 is ratified as Option A — they are the same decision in practice; I would not
  present them as separable in the eventual dispatch.

### Decision 3 — F16's disposition

- If Decision 1 = A: F16 stays open debt, paid as the first act of Task 3c (per the state file's
  own standing order).
- If Decision 1 = B: F16 is retired as SUPERSEDED — the "two independent reviewers" /
  "the other reviewer" language is correct forever under a permanent two-lens cell, so there is
  nothing left to fix.
- **My recommendation:** follows mechanically from Decision 1; no independent ruling needed, but
  flagging it so the owner sees the ledger closes either way.

---

## Paths written

- `docs/tribe/planning/idea-11-review-cell-v3/RESCOPE.md` (this file)
- `docs/tribe/planning/idea-11-review-cell-v3/card-v2.md` (revised card, sibling of card.md)

No commits made. No Warchief or Hunter dispatched. `card.md`, `plan.md`, `spec.md`, and the state
file are all untouched (read-only).
