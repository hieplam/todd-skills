# 🪨 Tribe

> An agent *tribe* for the software development lifecycle. Each agent is a role in a prehistoric hunting tribe — every role answers **exactly one question** and **never steps on another's toes**.

`tribe` is a plugin that bundles 5 agents into a 3-tier hierarchy plus 2 review gates. The "hunting tribe" metaphor isn't just for fun — it **encodes function into the name**, so that when you read the code/config you can immediately guess what each agent does, when it runs, and how far its authority reaches.

---

## Tribe overview

| Agent | Tier | Question it answers |
|---|---|---|
| 🔮 **Shaman** | Super Lead | *What? / Why?* — what to do, and why |
| 🪓 **Warchief** | Leader | *How?* — how to do it, split work, review, merge |
| 🏹 **Hunter** | Worker | (execution) — turn specs into real artifacts |
| 👣 **Tracker** | Review gate (during dev) | *Does this diff follow our written rules?* |
| 🔪 **Skinner** | Review gate (before "done") | *Is the work actually done?* |

**Basic flow:**

```
Shaman  ──(vision: what/why)──▶  Warchief
                                    │
                     (spec + how, dispatch)
                                    ▼
                                 Hunter ──(implement, commit)──▶ diff
                                    │
              ┌─────────────────────┴─────────────────────┐
              ▼ (throughout dev, many times)               ▼ (once, at the end)
           Tracker                                      Skinner
   "does this diff follow the rules?"          "is the work ACTUALLY done?"
        advisory                                    authoritative
              └─────────────────────┬─────────────────────┘
                                    ▼
                          Warchief opens the PR, swings the hammer ──▶ merge
                                    │
                          (reports back up) ──▶ Shaman
```

---

## Each agent in detail

### 🔮 Shaman — *Super Lead*

**Answers:** *What?* and *Why?*

**What it actually does:** Generates ideas, sets the direction and the meaning for the whole tribe. The Shaman does **not** pick up a weapon and hunt (no writing code, no detailed tactics). It sees far, interprets "why this is worth doing" and "what needs to be achieved," then hands it off to the Warchief. When a PR is merged, the Warchief reports back up to the Shaman to close the vision → outcome loop.

**Why the name Shaman:** In a tribe, the Shaman (medicine man / seer) is the one who "reads the omens" — interpreting the *meaning* (why) and pointing out the *direction* (what) for the whole tribe, without personally going on the hunt. This fits the role of generating ideas + vision, without touching the *how*.

---

### 🪓 Warchief — *Leader*

**Answers:** *How?*

**What it actually does:** Receives **one idea card at a time** from the Shaman (the Shaman picks — the Warchief never chooses what to build), brainstorms, writes the spec/plan, then **dispatches** work to the Hunter. When the Hunter reports "done," the Warchief orchestrates the audit/review, opens the PR, and is the **only one with the authority to swing the hammer and merge**. After merging, the Warchief reports the result up to the Shaman.

**Why the name Warchief:** The war chief is the one who takes the Shaman's word and turns it into concrete tactics — splitting the party, overseeing the battle, and being the only one to declare "victory" (merge). This fits the role of turning *what/why* into *how* and holding the final decision authority.

---

### 🏹 Hunter — *Worker*

**Answers:** (doesn't answer a strategic question — it **does**)

**What it actually does:** The one who directly hunts — executes the real work per the Warchief's spec under strict TDD, produces the artifact (the kill), commits it, and reports back to the Warchief (who opens the PR). The Hunter makes no strategic decisions; its job is to **bring back the kill exactly as ordered**.

**Why the name Hunter:** Hunting is the tribe's most primal act of "producing a result." The artifact here is **the kill** — a natural metaphor for building/coding a real PR.

---

### 👣 Tracker — *code-reviewer (during development)*

**Answers:** *Does this diff follow our written rules?*

**What it actually does:** The **cheap, frequently-run** gate — meant to run before every commit/PR while developing. The Tracker re-reads **every rule source fresh** (global rules, `CLAUDE.md`, `.editorconfig`, C3…), inspects the diff, and attaches a **concrete fix** to each finding. Its verdict is **advisory**: `BLOCK` / `APPROVE-WITH-COMMENTS` / `APPROVE`.

**Ownership:** The Tracker is the **single source of truth** for *rule/style conformance*. It inspects the **process / the path** — whether the diff is following the trail (the rules).

**Why the name Tracker:** A tracker reads tracks **all along the hunt**, continuously checking whether the party is still on the right trail. Its nature — *walking alongside, checking many times, advisory in tone* ("you've drifted left, correct it") — matches exactly the advisory + recurring role of a code-reviewer during dev.

---

### 🔪 Skinner — *adversarial-reviewer (before "done" / before merge)*

**Answers:** *Is the work that claims to be done actually done?*

**What it actually does:** The **heavy, run-once-at-the-end** gate — before declaring "done" or before merging. The Skinner reconstructs the **requirement contract** (from spec/plan → Jira ticket via `ask-copilot` → PR description), then **RUNS real proof** to verify the implementation against that contract, and **self-refutes its own findings** before ruling. Its `PASS`/`FAIL` verdict is **authoritative — a `FAIL` must be fixed, never argued away.** That authority is **at the **verdict** level**: an individual **finding** underneath it is a *falsifiable hypothesis*, not a ruling — the fixer Hunter must **reproduce a finding before it may fix it**, and reports `NOT_REPRODUCED` with evidence when it cannot (see the Hunter's "Fixer mode"). The verdict is the referee; a finding is the claim it referees.

**Ownership:** The Skinner is the **single source of truth** for *done-ness*, and enforces only the done-gating governance. It inspects the **product / the kill** — whether the work is *actually* finished and correct.

**Why the name Skinner:** The one who skins/guts the kill has to **cut it open to actually know** whether the meat is good, whether it's the right animal — matching "you have to RUN the proof to know, not eyeball it." And the result is undeniable: bad meat is bad meat — matching the authoritative `PASS/FAIL`.

---

## The critical boundary: Tracker ≠ Skinner

These two review agents must **never have their roles merged**. The orchestrator (Warchief) calls **both**, but at two different times for two different questions:

| | 👣 **Tracker** | 🔪 **Skinner** |
|---|---|---|
| Question | Does the diff follow the **rules**? | Is the work **actually done**? |
| Inspects | The **process** (path / diff vs rules) | The **product** (kill / done-ness) |
| When it runs | **During dev**, before each commit/PR | **Once, at the end**, before merge |
| Frequency | Often (cheap recurring gate) | Once (expensive final gate) |
| How it works | Reads rules + inspects diff | **RUNS proof** + self-refutes |
| Verdict | **Advisory** (BLOCK / APPROVE-W-COMMENTS / APPROVE) | **Authoritative** (PASS / FAIL) |
| Weight | Advisory — can have comments and still proceed | FAIL **must be fixed, never argued** |

> A normal change should **pass through the Tracker many times during dev**, then **pass through the Skinner exactly once at the end** before the word "done" is spoken.

This split is **encoded right into the metaphor**: *a tracker naturally walks the whole trail* (recurring), while *a skinner naturally works only once after the hunt is over* (one-time, final). You don't need to read the docs to guess which one runs often and which one runs at the gate.

**Boundary with the Warchief:** The Skinner only **rules** on whether the kill is good/bad (gates done-ness); it does **not** swing the merge hammer — merging is always the Warchief's authority. The Skinner issues an authoritative verdict for the Warchief to act on, and the two don't overlap.

---

## Quick reference

| Agent | Technical role | Question | Authority |
|---|---|---|---|
| 🔮 Shaman | Super Lead / ideation | What? / Why? | Sets direction, receives final report |
| 🪓 Warchief | Leader / orchestrator | How? | Spec, dispatch, open PR, **merge** |
| 🏹 Hunter | Worker / implementer | (execution) | Code, commit, report |
| 👣 Tracker | code-reviewer | Does the diff follow rules? | Advisory (BLOCK/APPROVE) |
| 🔪 Skinner | adversarial-reviewer | Is the work actually done? | **Authoritative** (PASS/FAIL) |

---

*Plugin: `tribe` — Shaman · Warchief · Hunter · Tracker · Skinner*
