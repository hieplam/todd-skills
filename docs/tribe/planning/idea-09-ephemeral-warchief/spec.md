# Spec — idea 09: the ephemeral Warchief (deliberate wave-boundary handoff)

**Card:** idea-09-ephemeral-warchief · **Status:** planned (implementation is a future campaign)
**Branch:** `planning/idea-09-ephemeral-warchief`

---

## The idea in one paragraph, for a reader with no context

The tribe is a chain of agents: the **Shaman** decides *what* to build, the **Warchief** decides
*how* and coordinates, the **Hunters** write the code. A Warchief that runs a big card lives a long
time: it authors the spec and plan, then dispatches wave after wave of Hunters, and every Hunter
report, every audit finding, every merge log lands in its context window. By wave 4 the instance
that must make the sharpest judgment calls is the one swimming in the most noise — the failure the
Bun rewrite's author avoided by keeping *authority* in his head and *coordination state* on disk.
This card makes that split literal: **persistent policy, ephemeral instance.** After the Warchief
integrates a wave, it commits its state, writes a heartbeat line that says "wave N integrated —
re-dispatch me", and ends. The Shaman re-dispatches a **fresh** Warchief, which reads the law back
off disk (`resume-check.sh`, the state file, the spec, the plan) and runs wave N+1 with a clean
context. The machinery to do this already exists — it was built for crashes (PR #22). This card
only changes the **trigger**: from "on death" to "at every wave boundary".

---

## Problem (grounded in the code)

### P1. The Warchief's context accumulates exactly where judgment matters most

`plugins/tribe/agents/warchief.md:363-439` (step 5) has a single Warchief instance run *every* wave
of a plan: extract each task brief, dispatch a Hunter per task, collect its report, dispatch a
Skinner per task (step 6, `warchief.md:441-454`), adjudicate findings, loop fixes up to 3 rounds,
merge the wave, then do it all again for the next wave. Every one of those artifacts enters one
context window. Nothing in the prompt sheds any of it.

The handoff's LƯỢT 3 names this precisely: *"Warchief persistent điều phối 20 Hunters → mọi status
report/PR summary/test result đổ vào context → sau 50 tasks, context 150k token toàn noise → đúng lúc
cần judgment quan trọng nhất … thì 'trí khôn' bơi giữa noise"* — persistent context is not an asset,
it is an accumulating liability (agentic laziness / context rot). The conclusion drawn there is the
design this card implements: *"Persistence của **state** ≠ persistence của **context window**"* — the
best Warchief is not the one that remembers everything, but the one that, each time it wakes, reads
the old law off disk, rules sharply, writes it down, and goes back to sleep.

### P2. The resume machinery exists but only fires on death

`warchief.md:129-193` ("Crash-safe state & resume") already gives the tribe everything an ephemeral
instance needs: a committed state file (`docs/tribe/state/CARD-SLUG.md`, template at
`warchief.md:140-153`), commit trailers as ground truth (`warchief.md:164-171`), and
`scripts/resume-check.sh`, which reconciles trailers + plan checkboxes + state file into exactly one
`next_action` (`resume-check.sh:198-211`). But the *trigger* is a crash: `warchief.md:172-175` says
"When your dispatch says you are resuming (or you inherit a saved worktree)". A Warchief that
survives five waves never uses any of it — and carries five waves of noise to the end.

### P3. An intentional exit today is indistinguishable from a corpse — and worse, from a live agent

The Shaman decides whether a quiet Warchief is alive by running `heartbeat-check.sh` on its report
file (`shaman.md:110-140`). That script has exactly three verdicts (`heartbeat-check.sh:95-117`):

| verdict | condition | Shaman's action (`shaman.md:128-135`) |
|---|---|---|
| `alive` | last timestamped line is < 30 min old | leave it alone, wait |
| `stale` | last line is ≥ 30 min old | re-dispatch a fresh Warchief |
| `unknown` | no parseable ISO-8601 line at all | treat as `stale`, re-dispatch |

A Warchief that deliberately ends itself right after writing `[…] wave 2 integrated` produces a
**fresh** timestamp — so for the next 30 minutes the checker says `alive` and the Shaman's rule is
*"Recent progress (`alive`) → leave it alone"*. Nobody is working; the Shaman is waiting on a ghost.
The cycle deadlocks for a full staleness window on every single wave boundary, and when it finally
unsticks it does so by mislabelling a clean, deliberate handoff as a **death**. There is no
mechanical way today for the Warchief to say "I left on purpose, at a known-good point — send the
next one now."

### P4. Latent bug that this card would otherwise ride straight into: wave-merge task amnesia

`warchief.md:155-156` instructs the Warchief to **re-record `base-sha`** in the same commit as each
wave integration, and step 5.3 (`warchief.md:420-427`) re-records it as the post-merge HEAD so the
next wave's worktrees branch from it. But `resume-check.sh` uses that same `base-sha` field as the
**floor of its trailer scan**: `trailer_progress()` runs `git log <base-sha>..HEAD` to find the
highest `Tribe-Task: N/TOTAL` trailer (`resume-check.sh:136-152`, called at `resume-check.sh:225`).

Once `base-sha` has been re-recorded to the post-merge HEAD, that range is **empty** — so
`last_completed_task` collapses to `0`, `next_action` becomes `CONTINUE task 1` /
`REVERT_AND_REDO task 1` (`resume-check.sh:198-211`), and the reconciler additionally reports the
plan checkboxes as "inconsistent" with git (`resume-check.sh:225-231`). A resumed Warchief obeying
`next_action` verbatim would **re-dispatch already-committed tasks**.

Today this is latent — it only bites a crash that happens to land after a wave merge. This card
makes the post-wave-merge resume the **normal path, on every wave**, so the bug becomes
load-bearing. It must be fixed as part of this card.

---

## Proposed design

Four changes: one new heartbeat verdict, one state-file shape change (which also fixes P4), one
Warchief return status with a strict activation condition, one Shaman routing branch.

### D1. The handoff sentinel — a heartbeat line that means "I left on purpose"

The ending Warchief appends exactly this line to its report file (the same report file the whole
card shares — one continuous heartbeat chain across instances):

```
[2026-07-12T09:15:00Z] HANDOFF wave 2 integrated — re-dispatch me (next: wave 3)
```

- The ISO-8601 UTC prefix is unchanged, so the existing timestamp regex
  (`heartbeat-check.sh:50-52`) still parses it as a heartbeat line.
- `HANDOFF wave <N> integrated` is the machine-readable token — **uppercase, matched only on the
  last timestamped line** of the file, so ordinary prose that mentions handoffs can never trip it.

`heartbeat-check.sh` gains a **fourth status**, `handoff`, plus a `next_action` field for all four
statuses (additive to the JSON; every existing key keeps its meaning):

| status | when | `next_action` | new fields |
|---|---|---|---|
| `handoff` | last timestamped line matches the sentinel — **regardless of age** | `REDISPATCH_HANDOFF` | `handoff_wave: N`, `next_wave: N+1` |
| `alive` | else, last line < threshold | `WAIT` | — |
| `stale` | else, last line ≥ threshold | `REDISPATCH_STALE` | — |
| `unknown` | no parseable timestamp | `REDISPATCH_UNKNOWN` | — |

**`handoff` beats the clock, deliberately.** The status answers "what should the Shaman do now",
and an intentional exit is actionable *immediately* — that is what dissolves P3's deadlock (no
30-minute wait) and P3's mislabelling (an hours-old handoff is still a handoff, not a corpse; the
Shaman re-dispatches it with the right briefing, not a crash briefing). The 30-minute staleness rule
is untouched for every other line: it keeps governing genuine silence.

**Self-clearing, by construction.** The fresh Warchief's first act at intake is already "append a
`dispatch received` line" (`warchief.md:266-268`). That line is now *also* the acknowledgement: once
it lands, the sentinel is no longer the last timestamped line and the file reads `alive` again. The
Warchief must therefore write it **immediately at intake, before any other work** — this closes the
double-dispatch window.

### D2. State-file shape: one milestone per wave, and an immutable base

Today's template (`warchief.md:140-153`) hardcodes a single `- [ ] wave 1 integrated` milestone and
one mutable `base-sha`. New shape (the Warchief rewrites the Milestones block in the **same commit
as the plan**, once the wave count is known):

```markdown
# tribe-state: CARD-SLUG
roadmap: ROADMAP-PATH
worktree: ABSOLUTE-WORKTREE-PATH
branch: BRANCH-NAME
report: REPORT-FILE-PATH
base-sha: SHA
wave-base-sha: SHA
waves: 3
plan: PLAN-PATH-RELATIVE-TO-WORKTREE

## Milestones
- [ ] spec committed
- [ ] plan committed
- [ ] wave 1 integrated
- [ ] wave 2 integrated
- [ ] wave 3 integrated
```

- **`base-sha` becomes immutable** — the SHA the branch forked from, written once at intake, never
  rewritten. It is the floor of `resume-check.sh`'s trailer scan, and that is the whole point: the
  scan must see *every* task commit on the branch. **This is the P4 fix.**
- **`wave-base-sha` is the moving one** — re-recorded (with its wave's milestone tick, in the merge
  commit) after each wave integration; it is what step 4 branches the next wave's sub-plan worktrees
  from (`warchief.md:343-361`). Step 5.3's "re-record the base commit" (`warchief.md:420-427`) now
  names this field explicitly.
- **`waves: N`** makes the activation condition (D3) mechanically checkable, and one milestone per
  wave makes "which wave am I on?" a lookup, not a re-derivation.

`resume-check.sh` gains three **derived, informational** fields per card — `waves_total`,
`waves_integrated` (count of ticked `wave N integrated` milestones), `next_wave` — and keeps its
`next_action` vocabulary **completely unchanged**. That is the load-bearing compatibility claim of
this design, so it is spelled out per verdict:

| situation at a handoff boundary | `resume-check.sh` `next_action` | fresh Warchief does |
|---|---|---|
| wave N merged, tree clean, tasks remain | `CONTINUE task M` (M = first task of wave N+1, thanks to the P4 fix) | create wave N+1's worktrees from `wave-base-sha`, dispatch its Hunters |
| wave N merged, tree clean, all tasks committed | `RESUME_DELIVERY` | skip to step 7 (evidence, PR, CI, merge) |
| instance died *during* the merge | `REDO_MERGE` | `git merge --abort`, redo the wave (unchanged) |
| instance died with a dirty tree | `REVERT_AND_REDO task M` | discard, redo task M (unchanged) |
| PR already merged | `VERIFY_SHIPPED` | close out (unchanged) |

The wave to run is the state file's **first unticked `wave N integrated` milestone** — the exact
rule `warchief.md:183-184` already uses for `REDO_MERGE`. Nothing new to learn.

### D3. `HANDOFF` — a fourth Warchief return status, with a hard activation condition

The Shaman ⇄ Warchief contract (`warchief.md:61-71`, `shaman.md:87-101`) gains one status:

> **`HANDOFF`** — a wave is integrated, committed, and audited-clean; the next wave is ready to
> start; this instance is ending on purpose to hand a clean context to its successor. Carries: the
> wave just integrated, the wave to run next, the worktree/spec/plan/state paths, and the handoff
> heartbeat line verbatim.

**Activation condition (the anti-overhead fence).** A Warchief hands off **only** when all of these
hold:

1. the state file says `waves: N` with **N ≥ 2** (a single-wave card never cycles — zero overhead
   for the small cards, which are the majority);
2. the wave just integrated is wave K with **K < N** (never hand off after the *final* wave —
   the last instance carries straight through to delivery; an extra dispatch just to open a PR buys
   nothing);
3. the wave's merge, milestone tick and `wave-base-sha` update are **committed** and every sub-plan
   in the wave passed its Skinner audit (`warchief.md:388-401` — a mixed-outcome wave still returns
   `NEEDS_DIRECTION`, never `HANDOFF`);
4. **this instance integrated that wave itself** — the loop guard (see D4).

Never mid-wave, never mid-audit, never with a dirty tree, never in place of `NEEDS_DIRECTION` or
`BLOCKED`.

**Handoff sequence** (the ending Warchief, in order): tick `wave K integrated` + update
`wave-base-sha` in the wave's merge commit → append the D1 sentinel to the report file → return
`HANDOFF` (final message, and `SendMessage` if it has a live channel) → end. Nothing else — no PR,
no cleanup beyond the wave's own worktree removal that step 5.2 already does.

### D4. The Shaman's routing branch (and the loop guard)

Mode 2's Rule step (`shaman.md:320-335`) gains a `HANDOFF` branch, and Channels & liveness
(`shaman.md:110-140`) gains the `handoff` verdict:

- **`HANDOFF` returned, or `heartbeat-check.sh` reports `handoff`** → **re-dispatch a fresh
  Warchief, immediately and mechanically.** This is not an escalation, not a question, and not a
  Decision Log entry — no ruling was made. The `in-flight:` roadmap marker (`shaman.md:316-319`) is
  unchanged: same card, same worktree.
- **The re-dispatch carries:** the card verbatim, the Standing Constraints, the roadmap path, **the
  same report-file path** (the heartbeat chain continues), the saved worktree / spec / plan / state
  paths, the handoff line verbatim, any Decision Log rulings already made for this card, and the
  instruction *"you are resuming — run `resume-check.sh` first and obey its `next_action`."*
- **Loop guard (mandatory).** Before re-dispatching, the Shaman reads `waves_integrated` from
  `resume-check.sh`. A `HANDOFF` whose wave milestone is **not** newly ticked means the instance
  ended without making progress — that is a broken agent, not a handoff: treat it as `BLOCKED`. This
  makes an infinite handoff loop mechanically impossible: every cycle must advance `waves_integrated`
  by exactly one.
- **Unattended mode: `HANDOFF` is non-halting.** The `/goal`-wrapped routine
  (`shaman.md:344-443`) stops on exactly three literal markers — `verified-SHIPPED`,
  `ESCALATE-NEEDS-DIRECTION`, `ESCALATE-BLOCKED`. `HANDOFF` is **none of them**: the Shaman
  re-dispatches and the routine keeps running, exactly as it does for a self-resolved
  `NEEDS_DIRECTION`. Stating this explicitly is required — an unattended campaign that treated
  `HANDOFF` as a stop would stall every multi-wave card at its first wave boundary.

### What the design deliberately does NOT do

- It does not make the Warchief stateless in the "workflow-script" sense (idea 08's territory) — the
  Warchief keeps its authority and its judgment work; only its *lifetime* is bounded.
- It does not touch the Hunter or the Skinner, which are already ephemeral (one per task).
- It does not change `resume-check.sh`'s `next_action` vocabulary, the 30-minute threshold, or the
  three existing Warchief statuses.

---

## Scope fence

**In scope (implementation campaign):**

- `plugins/tribe/scripts/heartbeat-check.sh` — `handoff` status, `next_action`, `handoff_wave`,
  `next_wave`.
- `plugins/tribe/scripts/resume-check.sh` — parse `waves` / `wave-base-sha`; emit `waves_total`,
  `waves_integrated`, `next_wave`; use the now-immutable `base-sha` for the trailer scan (P4 fix).
- `plugins/tribe/agents/warchief.md` — state-file template (D2), `HANDOFF` status + activation
  condition (D3), step 5 handoff sequence, resume-protocol wording.
- `plugins/tribe/agents/shaman.md` — `handoff` verdict in Channels & liveness, `HANDOFF` branch +
  loop guard in Mode 2, non-halting note in unattended mode.
- `plugins/tribe/scripts/tests/` — new `test-heartbeat-check.sh`, new `test-handoff-protocol.sh`,
  extensions to `test-resume-check.sh`.

**Out of scope (explicitly):**

- Idea 08's `integrate-wave.sh` (the wave-merge mechanics as a script). This card composes with it
  but does not need it and does not write it.
- Any change to the 30-minute staleness threshold, to `validate-plan.sh`, or to the Hunter/Skinner/
  Tracker prompts.
- Making the Shaman itself ephemeral (its planning phase is legitimately a long conversation —
  handoff LƯỢT 3: *"Persistent như một phase, không phải một daemon"*).
- Automatic wave-count detection from a plan file — `waves: N` is written by the Warchief from its
  own plan, not inferred by a script.
- **This planning card:** no `plugins/**` file is touched on this branch. The tasks below describe
  the changes; a future campaign applies them.

---

## Testing / verification strategy

Everything here is mechanically testable — this is a scripts + prompts change with no UI.

1. **`test-heartbeat-check.sh` (new).** Fixture report files, in the existing `ok`/`not ok` bash
   style of `plugins/tribe/scripts/tests/test-resume-check.sh:1-30`:
   - fresh sentinel as the last line → `handoff`, `next_action: REDISPATCH_HANDOFF`,
     `handoff_wave: 2`, `next_wave: 3`;
   - **sentinel two hours old → still `handoff`, not `stale`** (the clock does not beat the
     sentinel);
   - sentinel followed by a later ordinary line (the successor's `dispatch received`) → `alive`
     (self-clearing);
   - ordinary fresh line → `alive` / `WAIT`; ordinary old line → `stale` / `REDISPATCH_STALE`;
     no timestamps → `unknown` / `REDISPATCH_UNKNOWN` (regression: the three existing verdicts are
     unchanged);
   - lowercase "handoff" in prose, or the token in a non-last line → **not** a handoff.
2. **`test-resume-check.sh` (extended).** A synthetic 2-wave card fixture:
   - **P4 regression:** wave 1's three task commits + a wave-merge commit that re-records
     `wave-base-sha` (leaving `base-sha` immutable) → `last_completed_task: 3`,
     `next_action: CONTINUE task 4` — *not* `CONTINUE task 1`, and no `inconsistencies` entry;
   - wave fields: `waves_total: 2`, `waves_integrated: 1`, `next_wave: 2`;
   - a state file with no `waves:` field (an old card) → wave fields absent/null, `next_action`
     byte-identical to today (backward compatibility).
3. **`test-handoff-protocol.sh` (new).** Grep-level invariants over the two prompts, so the protocol
   cannot silently rot: `warchief.md` documents the sentinel format, the `HANDOFF` status, and the
   `waves ≥ 2` activation condition; `shaman.md` documents the `handoff` verdict, the loop guard,
   and that `HANDOFF` is not a `/goal` stop marker.
4. **End-to-end simulation** (fixture, offline): a 2-wave card at its boundary — `heartbeat-check.sh`
   says `handoff`/`next_wave: 2`, `resume-check.sh` says `CONTINUE task 4`/`next_wave: 2`. The two
   scripts must agree on the wave number; that agreement is the whole handoff contract.

Full suite: `bash plugins/tribe/scripts/tests/test-heartbeat-check.sh`,
`test-resume-check.sh`, `test-handoff-protocol.sh`, `test-validate-plan.sh` — all `not ok` counts
zero.

---

## Evidence plan

This is a CLI/prompt change, so "before/after" is captured as terminal output, not screenshots
(a screenshot of a shell is a screenshot of text — the repo's existing evidence for the
`heartbeat-check`/`resume-check` family is JSON captured under `docs/superpowers/evidence/`, e.g.
`docs/superpowers/evidence/2026-07-08-nesting-smoke-test.json`, and this card follows that
convention):

- **BEFORE (base branch, the bug demo), captured into the PR body:**
  1. `heartbeat-check.sh` on a report file whose last line is the handoff sentinel → `"status":
     "alive"` → the Shaman's rule says *wait*: **the deadlock, demonstrated**.
  2. `resume-check.sh` on the 2-wave fixture after a wave merge → `"last_completed_task": 0`,
     `"next_action": "CONTINUE task 1"`, plus an `inconsistencies` entry: **P4's task amnesia,
     demonstrated**.
- **AFTER (branch build):** the same two commands on the same two fixtures →
  `"status": "handoff"`, `"next_action": "REDISPATCH_HANDOFF"`, `"next_wave": 3`; and
  `"last_completed_task": 3`, `"next_action": "CONTINUE task 4"`, `"next_wave": 2`, no
  inconsistencies.
- **Suite output:** all four test files, `not ok` count zero, before and after.
- Both captures land in the PR body as fenced JSON blocks and are archived to
  `docs/superpowers/evidence/`.

---

## Risks & rollback

| # | Risk | Mitigation |
|---|---|---|
| R1 | **Sentinel false positive** — prose containing "handoff" flips a live card to `handoff` and triggers a spurious re-dispatch. | Uppercase `HANDOFF wave <N> integrated` token, matched **only** on the last timestamped line. Tested explicitly (test 1, last bullet). |
| R2 | **Double dispatch** — the Shaman re-dispatches twice off the same sentinel, putting two Warchiefs in one worktree. | The successor's first act is the `dispatch received` heartbeat append, which clears the sentinel; the roadmap `in-flight:` marker is unchanged; the loop guard requires `waves_integrated` to advance. |
| R3 | **Infinite handoff loop** — an instance hands off without doing a wave. | D4's loop guard: no new ticked wave milestone ⇒ `BLOCKED`, not a re-dispatch. Mechanically checked from `resume-check.sh` output. |
| R4 | **Context genuinely lost at the boundary** — the successor needs something only the dead instance knew. | That is a documentation bug by definition: the spec, plan, state file and report file are the contract. The successor must **not** guess — it returns `NEEDS_DIRECTION`. The audit (Skinner) also re-derives from the spec/plan, not from any instance's memory. |
| R5 | **Overhead on small cards** — an extra dispatch per wave is pure cost when there is one wave. | Activation condition D3.1: `waves ≥ 2`, and D3.2: never after the final wave. A 1-wave card behaves exactly as today, byte for byte. |
| R6 | **Backward incompatibility** with in-flight cards whose state files predate `waves:`. | Both script changes are additive and null-safe (test 2, third bullet): no `waves:` ⇒ no wave fields, `next_action` unchanged; no sentinel ⇒ the three existing verdicts unchanged. |

**Rollback:** revert the two prompt sections (the scripts' new fields are inert without a Warchief
that writes the sentinel — a reverted prompt means no sentinel is ever written, so
`heartbeat-check.sh` never returns `handoff` and `resume-check.sh` reports wave fields nobody reads).
Prompt-only revert is a one-commit rollback and needs no data migration; the P4 fix should be kept
regardless of the rollback, since it is a bug fix independent of the cycle.

---

## Interactions with other ideas

### Idea 08 — `integrate-wave.sh` (coordination into code) — **the natural cycle boundary**

Idea 08 wraps the deterministic half of the wave boundary (`warchief.md:402-427`: merge `--no-ff`
each sub-plan branch in order → remove merged worktrees/branches → print the new base SHA) into a
script, leaving the Warchief only the judgment. Idea 09 defines what happens at that same boundary
*after* the mechanics: tick, commit, sentinel, exit. **They meet at exactly the same line of the
prompt** — 08 owns the boundary's *mechanics*, 09 owns the boundary's *policy*.

- **If 08 ships first:** 09's handoff sequence sits immediately after the `integrate-wave.sh` call —
  a successful exit (0) *is* the "wave integrated" signal that arms the handoff, and the SHA the
  script prints is what 09 writes into `wave-base-sha`. Cleanest possible composition: 09's
  handoff step becomes three lines of prompt.
- **If 09 ships first:** 08 later absorbs steps 5.2/5.3 unchanged; the handoff step is already
  written *after* them and does not move. The natural follow-up (a good candidate for 08's own
  scope) is for `integrate-wave.sh` to also emit the sentinel line and the state-file tick, making
  the entire boundary — mechanics *and* the handoff record — one deterministic call.
- **Sequencing constraint (hard):** both cards edit `plugins/tribe/agents/warchief.md` step 5, so
  their `owns_files` overlap. **They must not run in the same wave / concurrently.** Either order
  works; 08-then-09 is marginally cheaper (09 then writes three lines instead of rewriting a
  procedure).
- 09's `wave-base-sha` split (D2/P4) is a **prerequisite for 08 being correct too**: any script that
  re-records the base SHA into the old single `base-sha` field re-introduces P4's task amnesia.
  Whichever of the two ships first should carry that fix; this spec assumes 09 does.

### Idea 06 — a frozen `CODEX.md` per campaign

The codex is precisely the artifact a re-awakened Warchief rehydrates from — cross-card decisions as
a lookup instead of context to carry. It makes every handoff *cheaper* (less to re-derive on wake)
and 09 makes the codex *more valuable* (a fresh instance per wave means more wakes). Strongly
complementary, no file overlap (06 adds `docs/tribe/CODEX.md` and touches the dispatch briefs).

### Ideas 01 / 02 / 03 — the 2-Skinner adversarial cell

These multiply the audit artifacts flowing through the Warchief's context per wave (two reviews per
task instead of one), which makes P1's noise accumulation *worse* — and therefore makes 09's payoff
*larger*. No conflict: they edit step 6, 09 edits step 5. If both land, a wave boundary sheds two
Skinner reports per task instead of one.

### Idea 07 — the mechanical work queue (`queue.tsv`)

Same philosophy from the other end: state on disk, not in a head. A queue file is trivially readable
by a fresh instance, so 07 and 09 reinforce each other (a re-awakened Warchief resumes a queue by
reading it). No overlap.

### Idea 10 — the meta-loop (repeated pattern ⇒ new rule)

09 makes 10 *necessary*: with an ephemeral Warchief, a lesson learned in wave 2 cannot survive in an
instance's head to wave 3 — it must land in a rule file the Tracker/Skinner read fresh. 10 is the
mechanism that writes it down. No file overlap (10 edits `.claude/rules/` + step 6).

### Ideas 04 / 05

No interaction (they govern finding adjudication inside a single audit round).

---

## Open questions

None. Every question this design raised (sentinel format, clock-vs-sentinel precedence, activation
threshold, loop guard, `next_action` compatibility) is a **How** call and is answered above. If the
implementing campaign finds that a card's `waves` count cannot be known at plan-commit time, that is
a plan-authoring bug, not a product question — the plan defines the waves.
