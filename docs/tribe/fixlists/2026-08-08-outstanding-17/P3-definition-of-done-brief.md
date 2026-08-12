# P3 — Definition of Done in the executor brief (+ P15's bootstrap clause)

- **Status:** RATIFIED 2026-08-12 (delegated). P15's tribe-side remainder is folded in
  here because both are edits to the same brief template.
- **Incident:** log lines 113–126. The B6 executor merged and removed its worktree but
  left the remote branch → ship-verify failed twice → the campaign's first escalation.
  Ruling R1/UC-2 defined "merged ≠ done", but the ruling lives only in that campaign's
  answers.md — nothing carries it to the next campaign.

## Decision

Promote ruling R1/UC-2 from campaign answers.md into the permanent brief template and the
warchief agent definition: the `SHIPPED` terminal line has explicit preconditions.

## Spec

### New section in `core/brief-template.md` (before "Terminal contract")

> ## Definition of Done (preconditions for SHIPPED)
>
> "Merged" is not "done". You may print the `SHIPPED` line only after ALL of:
>
> 1. The PR is merged (behind the pre-merge check gate).
> 2. The remote feature branch is deleted (`git push origin --delete <branch>`).
> 3. The card's worktree is removed (`git worktree remove <path>`).
> 4. Local master is fast-forwarded to origin/master.
>
> Verify each step with a command, not from memory — the runner independently re-verifies
> all four and a missing one costs a full escalation round-trip.

Rationale line for executors (concept, not just mechanism — per the
prompts-carry-concept-not-mechanism principle): *done = the next card starts clean on the
latest changes.*

### Bootstrap clause (P15's tribe-side remainder), added to Walls

> After creating a worktree, run the repo's dependency bootstrap (e.g. `bun install`)
> before the first commit — repo hooks typically run repo-wide and fail spuriously in a
> worktree without dependencies.

### Mirror in `plugins/tribe/agents/warchief.md`

The warchief agent definition gets the same DoD list in its ship/merge section (exact
placement decided at implementation; the obligation is stated once, as concept).

### Out of scope

- Runner-side self-healing of missed cleanup is **P4**, not this change.
- ai-dict's repo-wide (non-diff-scoped) pre-commit cost stays ai-dict's problem (P15).

### Acceptance

- Rendered brief for any card contains the DoD section with all four steps.
- Next campaign: a card whose executor completes cleanup unprompted on the FIRST card
  (the 08-08 campaign only reached this state after burning escalation R1).

## Implementation guide (fresh session, smaller model — docs/template-only change)

1. `plugins/tribe/scripts/runner/core/brief-template.md`: insert the "Definition of Done"
   section (exact text above, including the rationale line) immediately BEFORE the
   "## Terminal contract" section; add the bootstrap clause as a new bullet in
   "## Walls (non-negotiable)".
2. `plugins/tribe/agents/warchief.md` (large file, 91KB): `grep -n "merge\|SHIPPED"` to
   find the ship/merge/report section; add the same four DoD steps there once, stated as
   concept with the mechanism as illustration. Do not duplicate it in multiple places.
3. Check `plugins/tribe/scripts/runner/core/brief.test.ts`: if it asserts template
   structure/sections, extend the assertions to cover the new section. Run
   `cd plugins/tribe/scripts/runner && bun test`.
