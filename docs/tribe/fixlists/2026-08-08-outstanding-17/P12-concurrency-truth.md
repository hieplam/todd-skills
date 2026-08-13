# P12 — concurrency: the docs tell the truth, the skill authors the chain

- **Status:** SHIPPED — PR #87, merge `d57feeb` (2026-08-13) — options (a)+(c); no runner change.
- **Incident:** log lines 93–103. The skill doc claims "an undeclared dependency behaves
  as pure sequential order (today's default)"
  (`plugins/tribe/skills/orchestrate-campaign/SKILL.md:127`) — empirically FALSE: the
  runner spawned all 13 dependency-free cards in parallel within 30 seconds. The Shaman
  had to reconcile state by hand and author a 17-link dependsOn chain to honor the
  owner's "one by one".

## Decision

- **(a)** Fix SKILL.md:127 to state the real behavior.
- **(c)** The skill's campaign-file authoring step explicitly authors the FULL sequential
  `dependsOn` chain whenever the owner's directive implies serial execution ("one by
  one", "each card on the latest changes"), and recommends it as the default when cards
  merge to the same base branch (merge serialization was already the prior campaign's
  recommendation — log line 103).
- **Not chosen (recorded):** a `--max-concurrent N` runner flag — genuinely useful, but
  (a)+(c) closes the observed trap with zero runner risk; revisit if a campaign actually
  wants bounded parallelism.
- **Update (2026-08-13, P12 follow-up):** the owner approved building it. `--max-concurrent N`
  now exists (default `1` == this doc's own "one card's session at a time" behavior, unchanged
  unless the flag is passed) — see the runner README's "Concurrency" section and this skill's
  "The runner's concurrency model" section for the current, TRUE contract. (a)+(c) above remain
  correct and unchanged: `dependsOn` is still the only thing that orders cards, at any `N`.

## Implementation guide (fresh session, smaller model — docs-only change)

File: `plugins/tribe/skills/orchestrate-campaign/SKILL.md`.

1. Line 127 (search for "behaves as pure sequential order"): replace the sentence with:

   > an undeclared dependency runs IN PARALLEL — the runner spawns every card whose
   > declared dependencies are satisfied, all at once. Sequence order alone does NOT
   > serialize execution; only `dependsOn` does.

2. In the campaign-file authoring section (where `dependsOn` is specified), add:

   > **Serial campaigns:** when the owner's directive is one-card-at-a-time (or cards
   > merge to the same branch and each should build on the previous card's merged
   > master), author the full sequential chain — every card `dependsOn` its sequence
   > predecessor. Default to the chain when in doubt: parallel spawning is the exception
   > an owner asks for, not the default they expect.

3. Cross-check the same claim elsewhere:
   `grep -rn "sequential" plugins/tribe/skills/ plugins/tribe/agents/ plugins/tribe/README.md`
   — fix any other line repeating the false claim.

No code, no tests. Acceptance: the grep in step 3 returns no line claiming undeclared
dependencies serialize.
