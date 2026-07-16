# OKRA frame — Bun-rewrite campaign

> **Status: CANDIDATE — nothing here is binding until the owner ratifies it.**
> Frame authored with the `reverse-tornado-okr` skill. It sits *above* the 10 specs; it does not
> amend them. The specs answer **how**. This answers **how we would know it worked, and what we
> must not break getting there**.

## 0. The gap this closes

The 10 specs are strong on scope fences, rollback, and interactions. Every one of them has an
evidence plan — and every one of those plans proves the same two things: *the law is written*
(a grep-level tripwire test) and *the agent obeys the law* (an eval).

Neither is the thing the campaign is buying. Idea 01 rests on an explicit quantitative claim —
each reviewer catches **70%**, so two independent reviewers catch **~91%** (`p²` recall) — while its
evidence plan verifies that *a Warchief dispatched two Skinners concurrently*. Those are different
facts. Build all ten, watch every test go green, and the tribe's escaped-defect rate could be exactly
what it was. A finished subtree with a flat objective metric is not success.

---

## 1. Objective (candidate)

**O — the tribe's audit gate catches materially more real defects, per unit of reviewer cost.**

| | |
|---|---|
| **Metric** | `audit_recall` = planted defects flagged Critical/Important by the audit gate ÷ total planted, over a fixed benchmark of seeded diffs |
| **Target** | **candidate ≥ 0.90** — placeholder only |
| **Read method** | seeded-defect benchmark + the existing `scripts/evals/run_evals.py` harness |
| **Readable today?** | **No.** No CI, no defect corpus. |
| **Coverage status** | `reducing-DKR DKR-0` — funded to become readable |

**On the target.** `70%` → `~91%` is *Bun's* arithmetic, measured on Zig→Rust translation where a
reviewer can diff against a reference source. Tribe reviews prompt-file edits, bash, and small
scripts. Importing Bun's numbers as tribe's target is an unsupported claim. **The target stays
candidate until DKR-0 reads tribe's actual baseline.**

---

## 2. Anti-goals — the walls (candidate)

A risks table is a sentence. A wall is a threshold with a read method.

| ID | Wall | Metric | Threshold | Type | Read method | Readable? | Activates when |
|---|---|---|---|---|---|---|---|
| **AG-1** | Fixer drowns in false positives | `false_positive_rate` = `NOT_REPRODUCED` ÷ findings routed to fixer | ≤ **0.30** (candidate) | drift gauge | count dispositions in the fixer's ledger (`warchief.md:473`) | **YES — today** | any card touching the reviewer/fixer loop → **01, 03, 04, 10** |
| **AG-2** | Fix-loop thrash | `tasks_hitting_3_round_cap` | **== 0** | tripwire | Warchief report file | yes | 01, 03, 04 |
| **AG-3** | Reviewer-cost creep | `skinner_dispatches_per_task_round` | ≤ **2** | drift gauge | count dispatches in the report | yes | 01, 03, **04** |
| **AG-4** | Regression in what already works | tribe evals (**9**) + bash fixture tests all green | no decrease | tripwire | `python3 scripts/evals/run_evals.py`; `bash plugins/tribe/scripts/tests/test-*.sh` | **YES — today** | **every card** (all touch prompts or scripts) |
| **AG-5** | Rule bloat (the wolf) | active tripwire blocker rules | ≤ **12** | tripwire | count in the rule source | once 06/10 land | 10 — *already owner-ratified as D4* |
| **AG-6** | Authority drift | tripwire rules ratified by anyone but the Shaman | **== 0** | tripwire | Decision Log | yes | 10 |
| **AG-7** | *(inner, always on)* | `anti_goal_bypass_or_dishonesty_count` | **== 0** | tripwire | — | — | always |

**Anti-goal coverage:** AG-1 `readable` · AG-2 `readable` · AG-3 `readable` · AG-4 `readable` ·
AG-5 `readable` · AG-6 `readable` · **objective `reducing-DKR DKR-0`**.

### The one that matters

**Ideas 01, 03, and 04 all inflate finding volume.** More reviewers, more findings, more claims routed
to a fixer. The cheapest way to hit "more bugs caught" is to drown the fixer and double the cost of
every task — and until now nothing in the campaign would have registered that as a failure.

**AG-1 is the wall they push against, and idea 05 already built its gauge by accident.** PR #27
shipped a mandatory disposition ledger — exactly one of `FIXED` / `NOT_REPRODUCED` / `ESCALATED` per
finding ID, back from every fixer. That is a false-positive counter, live today, needing no new work.
The campaign's most important measurement instrument is already in the repo.

---

## 3. Reclassification — the campaign is not 10 PKRs

It is currently planned as ten progressions in a build order. It is actually **two discovery probes,
four contributions, and seven progressions.**

### DKR-0 — baseline + instrument *(was demoted to "Bonus"; it is card zero)*

- **Decision it unlocks:** fund or veto the 01/03/04 cluster — **13 plan tasks**.
- **Probe:** build a seeded-defect benchmark sized to tribe's real workload (prompt edits, bash, small
  scripts), planting the defect classes the blog recounts — a resource/lifetime error, a numeric edge
  (`trunc()` on negative mtimes), an evaluation-order trap (eager evaluation in `unwrap_or`). Run
  **today's single Skinner** over it. Record the catch rate.
- **Returns:** the baseline number — which is what makes `audit_recall` readable at all.
- **An empty result is still a result:** if the single Skinner already catches nearly everything on
  tribe's workload, the entire 01/03/04 cluster is unfunded — and you just saved 13 tasks.

### DKR-1 — does the second reviewer actually decorrelate? *(the `p²` assumption)*

This is the load-bearing hypothesis under the campaign's most expensive cluster, and **it can be
tested without changing a single prompt file.**

- **Probe:** on DKR-0's benchmark, run a **contract-lens** Skinner and a **cold-lens** Skinner
  (idea 03's two briefs) over the same diffs. Measure the *overlap* of what each catches.
- **High overlap** → independence is a fiction on this workload → the `p²` math collapses → 01/03/04
  buys a doubled cost for almost nothing → **veto or redesign**.
- **Low overlap** → the cluster is funded, and you know the size of the prize *before* spending 13
  tasks.
- **Cost:** a handful of agent runs, zero prompt edits, zero merge risk. It de-risks ~13 tasks.
  **This is the highest-leverage move available in the whole campaign.**

### CKRs — contributions *(orchestrator context; never dispatched as work)*

| CKR | Contribution | Fed by | Direct metric | State |
|---|---|---|---|---|
| **A** | Audit recall rises | 01, 03, 04 | `audit_recall` on the benchmark | **BLOCKED on DKR-0 + DKR-1** |
| **B** | The bias channel is sealed | 02 | contamination-refusal eval passes | uncertainty ≈ 0 |
| **C** | Coordination is deterministic | 07, 08, 09 | step-5 prose → script; resume tests green | uncertainty ≈ 0 |
| **D** | Lessons survive the session | 06, 10 | tripwire rules minted, under AG-5's cap of **12** | low |

### PKRs — known work, no discovery left

**02, 06, 07, 08, 09, 10** — sequenced per the binding constraints already in the campaign README.
*(05 shipped in #27, satisfying its own precondition to the cluster.)*

---

## 4. The reordering this forces

The suggested build order is **2 → 1 → 5 → 4 → 10 → 6 → 7 → 8 → 9 → 3**. It puts the **most
uncertain, most expensive** cluster first and the **known-work** cluster last.

Read on OKRA's zig-zag quadrant — abstract→detail on the vertical, uncertain→certain on the
horizontal — that is committing *detail* without *certainty*: the reckless bottom-left. A DKR probe
moves you right (buys certainty); a descent moves you down (adds detail). You do not descend first.

**Proposed order:**

- **Wave A — certain, cheap, uncontested. Ship now.** `02` → then `07` → `08` → `09` (each its own
  wave, per the README's step-5 collision constraint; **08 before 09**).
- **In parallel — the probes.** `DKR-0` → `DKR-1`. They touch **no prompt file**, so they cannot
  collide with any wave in flight.
- **Gate: DKR-1's verdict.** Owner ratifies fund-or-veto.
- **Wave B — only if the probe funds it.** `01` → `03` → `04`.
- **Wave C.** `06` → `10` (06 first — it is 10's rule sink).

The README's `02 ⊥ 03` textual collision resolves itself for free: **02 lands in wave A, 03 in wave B.**

---

## 5. The three anti-goal eval points, instantiated

1. **Admissibility — *before* dispatching a card.** Screen the move against the walls before a
   Warchief ever sees it. *Worked example:* idea 04's conflict ladder, rung 3, is "run a third review
   round" → projected `skinner_dispatches_per_task_round` = **3** → **breaches AG-3 (≤ 2)**. So 04
   ships with a bounded ladder, or AG-3 gets renegotiated at the frame — but the conflict is caught
   *now*, on paper, not after 5 tasks of merged code.
2. **Direct read — *after* the card merges.** Run the benchmark, run the evals, count the disposition
   ledger. Never "the spec says isolation holds."
3. **Paired — at the progress read.** *Recall up **AND** false-positive rate held.* 01 lifting recall
   to 0.90 while AG-1 goes 0.25 → 0.55 is **not a win** — it is a fixer drowning, wearing a green test
   suite. Only the paired read catches it.

---

## 6. Flags

| Flag | Fires when | This campaign's exposure |
|---|---|---|
| **cannot** | DKR budget spent, benchmark can't separate the two lenses | report it; do not guess the cluster's value |
| **breaking** | AG-1 drifts past 0.30, or any eval goes red | pauses committing moves |
| **pointless** | cards merged, every test green, **benchmark recall flat** | **the flag this campaign is most exposed to** — the funnel narrowing onto the wrong tip |
| **stalled** | a cluster keeps committing while its risk stays flat and high | watch the 01/03/04 cluster |
| **authority drift** | a Warchief ratifies a tripwire rule (D4: **Shaman-only**) or relaxes a threshold | stop the move, escalate |

---

## 7. Human-only line

The owner owns the frame: the objective and its target, every AG threshold, the **DKR-1 fund-or-veto
verdict**, and the retirement of any wall. **D4 already encodes exactly this** for tripwire rules —
Shaman-only ratification under four machine-checkable conditions (recurred in **≥2 cards**; backtest
fires on **≤25% of the last 20 merged commits**; a Decision Log entry; blocker budget cap **12**), with
owner veto. The frame extends that same line to the campaign itself.

*Idea 10 independently reinvented a third of OKRA — a findings ledger, a `≥2`-recurrence trigger, a
candidate rule minted from a repeated failure, and human-only ratification. Take that as convergent
evidence the shape fits.*

---

## 8. Ratification checklist — owner

- [ ] **O** — accept `audit_recall`, with the target set *after* DKR-0 (not the imported `0.90`)?
- [ ] **AG-1** — is **0.30** the right false-positive ceiling?
- [ ] **AG-3** — does idea 04's third ladder rung get an exemption, or a bounded redesign?
- [ ] **DKR-1** promoted to card zero, ahead of 01/03/04?
- [ ] **Reordering** — wave A (`02`, `07`, `08`, `09`) ships before the contested cluster?
