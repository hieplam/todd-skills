# Fix brief: agents instruct a regular merge, never squash

Branch: `worktree-agent-ae5ec7314c22bebfe` (merged `fix/no-squash-merge` — was already
`--ff-only` up to date; base commit `d6de196`)

Files touched: `plugins/tribe/agents/shaman.md`, `plugins/tribe/agents/warchief.md` (only).

## Discovery

```
$ grep -rn -i "squash" plugins/tribe/agents/
plugins/tribe/agents/shaman.md:89:- **`SHIPPED`** — PR squash-merged, CI green, before/after evidence, measured outcome. Your
plugins/tribe/agents/shaman.md:91:  path** — mechanical proof of merge, squash strategy, master-in-sync, and worktree removal —
plugins/tribe/agents/shaman.md:325:     worktree path — mechanical proof the PR is merged, squash strategy, master is in sync with
plugins/tribe/agents/shaman.md:374:    plan → Hunter builds → audit → PR → CI → squash-merge duration in hand from the pilot run,
plugins/tribe/agents/warchief.md:11:  squash-merges, and returns `SHIPPED` to the Shaman. When an open What/Why question arises
plugins/tribe/agents/warchief.md:31:**green squash-merged PR with before/after evidence**, and a **status report back to the
plugins/tribe/agents/warchief.md:62:  - **`SHIPPED`** — PR squash-merged into the default branch, CI green, before/after evidence
plugins/tribe/agents/warchief.md:256:   means **PR squash-merged into the default branch, CI green, evidence attached** — "code
plugins/tribe/agents/warchief.md:1102:  and this only applies when `RUN_IDS` was non-empty** — proceed to squash-merge. Non-zero and
plugins/tribe/agents/warchief.md:1108:  variant of "green," it means no CI has registered for this SHA yet. Never squash-merge on it.
plugins/tribe/agents/warchief.md:1125:- **Squash-merge** into the default branch once green.
plugins/tribe/agents/warchief.md:1152:**Definition of done:** the card is **PR squash-merged into the default branch, CI green,
```

12 hits total: `shaman.md` ×4, `warchief.md` ×8 — matches the brief's count exactly.

## Before -> after, grouped by kind

### Kind 1 — Instructions to merge (must instruct a regular, 2-parent merge)

**warchief.md:11** (frontmatter description of the Warchief's own action)
- Before: `...waits for CI green, squash-merges, and returns \`SHIPPED\` to the Shaman.`
- After: `...waits for CI green, merges (regular merge, never squash — the merge commit must have exactly 2 parents), and returns \`SHIPPED\` to the Shaman.`

**warchief.md:1102** (branch of the CI-watch loop that greenlights the merge)
- Before: `...and this only applies when \`RUN_IDS\` was non-empty** — proceed to squash-merge. Non-zero and not \`2\` means...`
- After: `...and this only applies when \`RUN_IDS\` was non-empty** — proceed to merge (regular merge, never squash). Non-zero and not \`2\` means...`

**warchief.md:1125** (the primary "how to merge" instruction, Method step 7)
- Before: `- **Squash-merge** into the default branch once green.`
- After: `- **Merge** — regular merge (\`gh pr merge --merge\`), never squash: the merge commit must have exactly 2 parents. Do this into the default branch once green.`

### Kind 2 — Definition-of-done / status prose (other clauses unchanged, only the merge shape changes)

**shaman.md:89** (Shaman's own definition of the `SHIPPED` status it receives)
- Before: `- **\`SHIPPED\`** — PR squash-merged, CI green, before/after evidence, measured outcome.`
- After: `- **\`SHIPPED\`** — PR merged (regular merge, never squash), CI green, before/after evidence, measured outcome.`

**warchief.md:31** (Warchief's own deliverables list)
- Before: `**green squash-merged PR with before/after evidence**, and a **status report back to the Shaman**.`
- After: `**green, regular-merged PR (never squash) with before/after evidence**, and a **status report back to the Shaman**.`

**warchief.md:62** (Shaman ⇄ Warchief contract, `SHIPPED` return value)
- Before: `- **\`SHIPPED\`** — PR squash-merged into the default branch, CI green, before/after evidence links, ...`
- After: `- **\`SHIPPED\`** — PR merged (regular merge, never squash) into the default branch, CI green, before/after evidence links, ...`

**warchief.md:256** (Method's "respect governance / definition of done" law)
- Before: `Done means **PR squash-merged into the default branch, CI green, evidence attached** — "code written" is not done.`
- After: `Done means **PR merged into the default branch via a regular merge (never squash), CI green, evidence attached** — "code written" is not done.`

**warchief.md:1152** (closing Definition of done, end of file)
- Before: `**Definition of done:** the card is **PR squash-merged into the default branch, CI green, before/after evidence attached**, ...`
- After: `**Definition of done:** the card is **PR merged into the default branch via a regular merge (never squash), CI green, before/after evidence attached**, ...`

### Kind 3 — Verification prose (Shaman checks the merge *strategy* — flipped to the inverse: regular-merge, 2-parent)

**shaman.md:91** (verify-shipped's mechanical proof, first mention)
- Before: `...mechanical proof of merge, squash strategy, master-in-sync, and worktree removal — ...`
- After: `...mechanical proof of merge, regular-merge (2-parent) strategy, master-in-sync, and worktree removal — ...`

**shaman.md:325** (verify-shipped's mechanical proof, second mention — Method step 3's rule table)
- Before: `...mechanical proof the PR is merged, squash strategy, master is in sync with origin, and the worktree is gone — ...`
- After: `...mechanical proof the PR is merged, regular-merge (2-parent) strategy, master is in sync with origin, and the worktree is gone — ...`

### Descriptive/cycle-duration mention (not DoD, not an instruction, not a verification check — just names the pipeline stage)

**shaman.md:374** (pilot-phase cycle-time measurement, used to size the batch-phase schedule interval)
- Before: `plan → Hunter builds → audit → PR → CI → squash-merge duration in hand from the pilot run,`
- After: `plan → Hunter builds → audit → PR → CI → merge duration in hand from the pilot run,`

## The `:1108` trap

**warchief.md:1108** reads, in context, about the `exit 2` branch of the CI-watch loop — the
case where `gh run list` came back empty because no CI has registered for the SHA yet (not a
squash-specific rule at all):

- Before: `...it means no CI has registered for this SHA yet. Never squash-merge on it.`
- After: `...it means no CI has registered for this SHA yet. Never merge on it.`

Kept the meaning exactly as it was ("don't merge before CI registers for this SHA") — did not
turn it into a second no-squash prohibition, and did not delete or weaken it.

## Final grep (post-fix) — every surviving hit is a deliberate "never squash" prohibition

```
$ grep -rn -i "squash" plugins/tribe/agents/
plugins/tribe/agents/warchief.md:11:  merges (regular merge, never squash — the merge commit must have exactly 2 parents), and
plugins/tribe/agents/warchief.md:32:**green, regular-merged PR (never squash) with before/after evidence**, and a **status report
plugins/tribe/agents/warchief.md:63:  - **`SHIPPED`** — PR merged (regular merge, never squash) into the default branch, CI green,
plugins/tribe/agents/warchief.md:258:   means **PR merged into the default branch via a regular merge (never squash), CI green,
plugins/tribe/agents/warchief.md:1105:  squash). Non-zero and not `2` means at least one run genuinely failed: fix it via a Hunter
plugins/tribe/agents/warchief.md:1128:- **Merge** — regular merge (`gh pr merge --merge`), never squash: the merge commit must have
plugins/tribe/agents/warchief.md:1157:(never squash), CI green, before/after evidence attached**, the spec + plan are committed for
plugins/tribe/agents/shaman.md:89:- **`SHIPPED`** — PR merged (regular merge, never squash), CI green, before/after evidence,
```

8 surviving hits, all of the form "never squash" / "no squash" — zero instructions or DoD
prose still telling anyone to squash-merge. Line numbers shifted slightly (+2/+3) from the
original discovery because several corrections wrap onto an extra line for readability; no
content beyond the squash phrase itself was restructured.

## Scope discipline

- Touched only `plugins/tribe/agents/shaman.md` and `plugins/tribe/agents/warchief.md`, prose
  only — no restructuring, no other rule changed, no role-boundary changes.
- Did not touch `plugins/verify-shipped/**`, `.c3/`, the runner source, or any plan/state file.
- No plan file with `- [ ]` checkboxes is associated with this fix brief (it is a direct
  correction dispatch, not a plan task), so none were ticked.

## Commit

Commit created on top of `d6de196` (== `fix/no-squash-merge`, fast-forward, no divergence):

```
fix(tribe): agents instruct a regular merge, never squash

The owner's global rule changed to "Do not Squash merge"; the Shaman and
Warchief definitions still instructed squash-merge in 12 places, which would
also deadlock the campaign runner's D3 2-parent check on every card.

Tribe-Card: no-squash-merge
```

SHA: this file's own commit hash (self-referential — see the Hunter's final report
message to the Warchief for the authoritative SHA; `git log -1` on this file's
containing commit is the ground truth).
