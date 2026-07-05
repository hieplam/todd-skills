# Tribe role contracts — design

**Date:** 2026-07-05 · **Status:** approved by owner · **Scope:** `plugins/tribe/`

## Problem

The tribe plugin has three agents split by responsibility — Shaman (What & Why), Warchief
(How), Hunter (Do) — but the bonds between them are unevenly defined:

- **Warchief ⇄ Hunter** is fully specified: a named contract mirrored in both files, defined
  artifacts (task brief, report file), and a status vocabulary.
- **Shaman ⇄ Warchief** is one-sided: warchief.md says "ask the Shaman" and "report back to the
  Shaman", but shaman.md never mentions the Warchief, has no `Task` tool (cannot dispatch
  anyone), and has no duty to answer questions or receive reports. Its job ends at "hand off the
  roadmap".
- The forbidden Shaman ⇄ Hunter edge is stated only on the Hunter's side.

Each role needs an explicit boundary, explicit non-goals, and an explicit communication
protocol with its neighbors.

## Owner decisions (from brainstorming)

1. **Strict top-down entry.** ALL work enters the tribe through the Shaman. The Warchief is
   never invoked directly by the owner.
2. **The Shaman is the owner's delegate.** The owner normally plays the Shaman role by hand
   (deciding what to build, briefing implementers, fielding questions). That job is delegated to
   the biggest model because it is pure judgment. The Shaman's products are **decisions and
   questions**, never code.
3. **Ideation is collaborative.** The owner and the Shaman develop ideas together,
   back-and-forth — the Shaman does not ideate alone and present.
4. **Master–slave on both edges, bi-directional.** Shaman dispatches Warchief and fields its
   consultations, exactly as Warchief dispatches Hunter and fields its reports.
5. **Shaman ⇄ Hunter is a forbidden edge.** They never need to talk; if they ever seem to need
   to, the tribe is misconfigured. Likewise Warchief/Hunter never contact the owner.
6. **Campaign batch size is the owner's directive** ("do the next idea" / "do 5" / "run the
   whole roadmap"); default is one. Parallel Warchiefs only across dependency-independent
   cards, each in its own worktree.

## The chain of command

```
Owner ⇄ Shaman ⇄ Warchief ⇄ Hunter
```

**A role speaks only to its adjacent ranks.** Two forbidden edges are named explicitly in the
agent files: Shaman ⇄ Hunter, and Warchief/Hunter ⇄ Owner. Every file carries the rule: *if a
skip-rank conversation ever seems necessary, the tribe is misconfigured — stop and report up
your own chain.*

## Edge contract template

Every edge carries the same four parts (this is what "stronger bonds" means):

1. **Dispatch artifact** (down): what the master hands over — idea card / task brief — plus a
   report-file path.
2. **Report artifact + status vocabulary** (up): a report file plus a terse final status.
3. **Consult loop** (mid-work questions): agents die when they return, so the loop is
   file-mediated — the slave saves all state, returns `NEEDS_*` with ONE question; the master
   rules or escalates up, **logs the ruling**, re-dispatches; the fresh slave re-grounds from
   saved state + ruling.
4. **Non-goals per side**: what each side must never do on this edge.

## Edge specifications

### Owner ⇄ Shaman (the only human edge)

- **Ideation is co-created**: back-and-forth on ideas, constraints, and the frame.
- **The Shaman decides ordinary product calls on the owner's behalf** and records them. A
  Shaman that asks the owner everything is a messenger, not a delegate.
- **Escalates ONLY the escalation register**: irreversible data shapes, product-promise
  changes, new permissions/trust surface, privacy-surface changes, cutting a scope fence —
  plus roadmap approval and campaign batch size.
- **Every escalation is sharpened**: context, options, and the Shaman's recommendation — a
  decision ready to sign, one at a time. Never a raw forwarded question.

### Shaman ⇄ Warchief (new; mirrored in both files)

**Down:** one approved idea card per dispatch, always `subagent_type: warchief`. The dispatch
carries the card verbatim, the Standing Constraints block, the roadmap path, and a report-file
path. Order is by dependency, never score.

**Up (status vocabulary):**

- `SHIPPED` — PR squash-merged, CI green, before/after evidence, measured outcome vs the
  card's goal. Shaman verifies the outcome **from the evidence, never by reading code**, marks
  the card shipped, re-sequences, dispatches the next.
- `NEEDS_DIRECTION` — ONE open What/Why question, sharpened. Shaman rules it itself unless it
  touches the escalation register (then it goes to the owner). Either way the ruling is
  appended to the roadmap's **Decision Log** and the Warchief is re-dispatched with it.
- `BLOCKED` — cannot proceed; the specific obstacle and the single decision/action needed.

**Consult-loop mechanics:** before returning `NEEDS_DIRECTION`, the Warchief commits all state
(worktree, spec, plan, report file) so a fresh Warchief can resume from files + the ruling.

**Non-goals:** the Shaman never reads the Warchief's spec/plan/diff and never dictates
implementation in a ruling (the Warchief's work is graded by the adversarial-reviewer, not the
Shaman). The Warchief never contacts the owner and never edits the roadmap's What/Why —
roadmap bookkeeping belongs to the Shaman.

### Warchief ⇄ Hunter (already strong; tightened)

Unchanged in substance. Tightened: the consult loop's re-dispatch mechanics made explicit —
the Warchief answers `NEEDS_CONTEXT` by amending the brief and dispatching a **fresh** Hunter.

## Memory model

Agent instances die on return; files are the only memory. The Shaman's persistent brain is the
roadmap + its **Decision Log** (a ruling not written down was never made). The Warchief's is
its worktree + spec + plan + report file. Every dispatch grounds the receiver in files.

## File changes

- **shaman.md** — add `Task` + `TodoWrite` tools; rewrite the framing as "the owner,
  delegated"; add tribe roster + chain of command; add the Owner ⇄ Shaman bond section; add
  the Shaman ⇄ Warchief contract; add anti-goals (never speak to a Hunter, never review How
  artifacts, single human gateway); split the method into Mode 1 (forge the roadmap —
  existing steps) and Mode 2 (run the campaign — the agentic loop); add the Decision Log to
  the roadmap structure; update description for strict-entry routing.
- **warchief.md** — description: entry only via Shaman dispatch (drop direct-user entry);
  add the mirrored Shaman ⇄ Warchief contract; all "ask the Shaman" phrasing becomes "return
  `NEEDS_DIRECTION`" (the Shaman is the parent — consulting = returning, not spawning);
  formalize the SHIPPED/NEEDS_DIRECTION/BLOCKED report format; owner becomes a named
  forbidden edge.
- **hunter.md** — minor hardening: forbidden edges get the "tribe is broken" phrasing; chain
  of command line added.
- **plugin.json / marketplace.json** — descriptions updated to the top-down flow; plugin
  version → 2.0.0 (behavioral change: strict entry).

## Risks

- **Nested dispatch depth.** Shaman → Warchief → Hunter is two levels of Task nesting;
  Warchief → Hunter is proven in this repo, the extra level is not. Smoke-test after landing.
  Documented fallback: run the Shaman in the main conversation when campaigning.
- **Fresh-instance drift.** A re-dispatched Warchief re-grounds from files; if state isn't
  committed before `NEEDS_DIRECTION`, context is lost. Mitigated by making state-saving a
  contract requirement.

## Non-goals of this change

- No new agents, no shared PROTOCOL.md (contracts live mirrored in the agent files — an agent
  only reliably knows its own system prompt), no changes to `adversarial-reviewer`, no runtime
  code.
