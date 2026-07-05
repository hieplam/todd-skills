# Tribe comms: upward channel + report-file heartbeat

**Date:** 2026-07-06 · **Status:** shipped · **Amends:** `2026-07-05-tribe-role-contracts-design.md`

## Problem (observed in the field)

Running the tribe against a real repo surfaced two communication failures on the upward legs:

1. **A dispatched Warchief went silent.** It committed its ADR/spec and then died mid-flight
   (most likely context exhaustion). Because the tribe's only upward channel was the agent's
   *final* message, its `SHIPPED`/`NEEDS_DIRECTION` never arrived — and from the outside a
   working Warchief and a dead one were indistinguishable. The Shaman had to forensically read
   the worktree to conclude the dispatch was dead.
2. **The Shaman could not reply to its own dispatcher.** Run as a *background named teammate*,
   its harness system prompt told it to use `SendMessage` — but the agent frontmatter `tools:`
   whitelist never granted that tool, so the schema didn't exist. It then tried to "reply" by
   spawning a child agent named "Reply to orchestrator status check", which creates a
   grandchild, not an upward message.

Root causes: (a) `SendMessage` missing from the `tools:` whitelists while the background-teammate
harness advertises it; (b) the contract assumed synchronous Task dispatch only, with no guidance
for background mode; (c) the report file was written only at the end, so it couldn't answer
"working or dead?".

## Decision

Both remedies, layered so each covers the other's failure mode:

1. **Grant the live channel.** Add `SendMessage` to the `tools:` frontmatter of `shaman` and
   `warchief`, and add a Channels contract to each prompt: the final message is always the
   contract return; when running as a background teammate, ALSO acknowledge dispatch, send
   milestone updates, answer status checks, and send the final status via `SendMessage`; never
   spawn an agent to deliver a message (a spawned agent is a child, not a courier).
2. **Make the report file a heartbeat.** The Warchief appends a timestamped line at every
   milestone (dispatch received → spec → plan → task N dispatched → audit PASS/FAIL → PR → CI →
   merged → final status). The Shaman treats silence as *no information*: it reads the heartbeat
   to distinguish progressing / dead, and re-dispatches from the last heartbeat line. Reading
   the heartbeat for liveness is explicitly exempted from the Shaman's "never review How
   artifacts" rule — it checks how far, never how well.

## Changes

- `plugins/tribe/agents/warchief.md` — `SendMessage` in tools; new "Channels" section (final
  message vs. background teammate, never-spawn-a-courier, heartbeat protocol); heartbeat start
  in Method step 1; heartbeat close-out + `SendMessage` mention in step 8.
- `plugins/tribe/agents/shaman.md` — `SendMessage` in tools; mirrored "Channels & liveness"
  block in the Shaman ⇄ Warchief contract; liveness exemption on anti-goal 10; a "Silence →"
  arm in the Mode 2 ruling loop.

## Non-goals

- **Hunter stays a leaf.** No `SendMessage`, no heartbeat: it is dispatched synchronously, one
  task at a time, with the Warchief awaiting its return — the tool split that keeps it unable
  to orchestrate is intact.
- No change to the status vocabulary (`SHIPPED` / `NEEDS_DIRECTION` / `BLOCKED`) or to any
  downward dispatch artifact.
