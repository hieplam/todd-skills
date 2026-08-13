# P7 — rulings and running sessions: accept the spawn-time snapshot, document it

- **Status:** SHIPPED — PR #89, merge `eba7b41` (2026-08-13) — option (a): accept + document.
- **Incident:** log lines 267–279. The Conventional Commits gate landed on master while
  A12 was mid-flight with 5+ soon-to-be-rejected commits. The answers digest is injected
  once, at spawn (`core/brief.ts:58,77`) — a running session cannot receive new rulings.

## Decision and rationale

Accept the limitation and document it, instead of building a delivery mechanism.
Grounding for the call: the one observed occurrence resolved itself WITHOUT an escalation
— A12's quota-pause resume re-rendered the brief with the R5 ruling and the executor
reworded its commits (log lines 280–284). Observed cost ≈ 0; a delivery mechanism has
real complexity and mid-task rule changes risk confusing an executor more than helping.

**Deferred design (do NOT build now; recorded for a future ruling if the trap recurs):**
a PreToolUse hook holding the answers.md content-hash seen at spawn; when the hash
changes, deny exactly ONE tool call with a message carrying the new rulings, then stay
silent. Same enforcement infrastructure as P1/P2's hooks.

## Implementation guide (fresh session, smaller model — docs-only change)

1. `plugins/tribe/scripts/runner/core/brief-template.md`, "Answers" section: after the
   "Before raising any question…" paragraph, add:

   > These rulings are a snapshot taken when this session started. If your session is
   > resumed or re-spawned, re-read this section — it may carry rulings newer than your
   > earlier context.

2. `plugins/tribe/skills/orchestrate-campaign/SKILL.md`: in the section describing
   answers.md / rulings (search "answers.md"), add one paragraph:

   > A ruling reaches executors at SPAWN time only — a session already running keeps its
   > snapshot. If a new rule must apply to an in-flight card, either let it land on the
   > card's next resume/re-spawn (the normal case), or stop and re-trigger the card when
   > the rule is load-bearing for its correctness.

3. No code changes. No tests. Verify by reading the rendered brief for any card
   (the template line appears under "## Answers").
