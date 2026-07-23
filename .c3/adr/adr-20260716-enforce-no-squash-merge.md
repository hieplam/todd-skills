---
id: adr-20260716-enforce-no-squash-merge
c3-seal: 5a0889bd9a9e9d508b6df98990d48740e586152af571681d59c371e7dc90e65b
title: enforce-no-squash-merge
type: adr
goal: |-
    Make the owner's "Do not Squash merge" rule an **enforced contract** rather than prose repeated
    (and contradicted) in three places: wire the new `rule-no-squash-merge` to both components that
    merge or verify merges (`c3-215` tribe, `c3-217` verify-shipped), and correct `c3-217`'s stated
    Definition of Done, which still promises a squash strategy.
status: accepted
date: "2026-07-16"
---

## Goal

Make the owner's "Do not Squash merge" rule an **enforced contract** rather than prose repeated
(and contradicted) in three places: wire the new `rule-no-squash-merge` to both components that
merge or verify merges (`c3-215` tribe, `c3-217` verify-shipped), and correct `c3-217`'s stated
Definition of Done, which still promises a squash strategy.

## Context

The owner's global CLAUDE.md **once** defined done as "PR squash-merged and ready to work on new
feature with LATEST CHANGES". It no longer does — the standing rule is now **"Do not Squash
merge"** (non-negotiable). The rule changed; three implementations never followed it, and the
repo shipped **two mutually exclusive Definitions of Done at the same time**:

| Artifact | Encoded | State |
| --- | --- | --- |
| verify-shipped skill + script | squash required — if [[ "$PARENT_COUNT" != "1" ]]; then FAIL | stale |
| tribe agents (shaman.md ×4, warchief.md ×8) | "Squash-merge into the default branch once green" | stale |
| campaign runner (D3 point 2) | regular merge — exactly 2 parents | current |

They cannot both pass on one PR. **Verified:** the owner's own correctly-merged PR #37 (merge sha
`d6de196f102b36241413e41b01448b2c012e57ad`, 2 parents) FAILS `verify-shipped`'s check today, and
a Warchief obeying `warchief.md:1125` would squash every card — which the runner's D3 point 2
then rejects, escalating every card and wedging the campaign on card one.

`c3-215`'s own squash claim was corrected earlier today
(`adr-20260716-add-campaign-runner`), but that fixed the *map*: the agents it describes, the
sibling skill, and `c3-217`'s doc all still said squash. Correcting descriptions one at a time is
what produced this drift — hence a rule, which is checkable, rather than more prose.

## Decision

Author `rule-no-squash-merge` (already created — a new fact, so the unguarded `add` path) and
wire it into the `uses` of both governing components, with a Governance row in each naming what
it binds. Its Golden Example is the runner's real `checkTwoParents` code, because that is the
canonical mechanical implementation: ask `git rev-list --parents` for the parent count, never
infer the shape from a commit title.

Correct `c3-217`'s Goal, Purpose, and Business Flow outcome to the regular-merge shape in the
same unit — leaving them would restate the contradiction the rule exists to end, inside a fact
that now cites the rule.

The rule's Override section deliberately offers no in-repo escape: the owner's rule is
non-negotiable and the runner's check is mechanical, so a deviation cannot be argued past it.
Changing the merge shape requires the owner to change their global rule first, then one
change-unit updating the rule **and every implementation in its Scope together**.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-217 | component | It IS the stale enforcement: its script asserted a 1-parent squash and failed the owner's own correctly-merged PR #37. Its Goal, Purpose, and Business Flow outcome all still promise a squash strategy, and it gains rule-no-squash-merge in its uses | c3-217#n543@v1:sha256:acde6817b08e4242088c26fba7a5dc26eedf43c943175206b2a13c25d4fd4240 "Mechanically verify a SHIPPED claim against the owner's Definition of Done: PR merged, squash strategy, local master in sync with origin, worktree removed." | rule-no-squash-merge (new, binding); rule-bash-strict-mode still binds its shell script |
| c3-215 | component | Its agent definitions instructed squash-merge in 12 places, which both violates the owner's rule and deadlocks its own campaign runner's D3 2-parent check. Gains rule-no-squash-merge in its uses so the contract is enforced, not restated | c3-215#n445@v1:sha256:f467fd1ec102c55b693524d1b29fda35cba5ac48b31be638a9f6a38cc5b3aef8 "Deliver features through a 5-agent chain of command — Shaman (What/Why) → Warchief (How) → Hunter (TDD execution), gated by Tracker (rules review) and Ski" | rule-no-squash-merge (new, binding) |
| c3-2 | container | Parent of both affected components and the reason this is a project-wide rule rather than per-component guidance: two sibling plugins in this container shipped opposite Definitions of Done. Its file-based cross-plugin contract is exactly the seam that drifted | c3-2#n944@v2:sha256:34447fd4a9c82ee7d7480da91fca6e40ce05b07cf4647f6ac8b2b9e22deb6de0 "Cross-plugin contracts stay file-based: tribe writes roadmap/spec/plan/report files; verify-shipped checks git/GitHub state produced by tribe's Warchief — no " | None — no container contract changes; membership unchanged |
| c3-0 | system | Top-down completeness only: the system ancestor of both components. No new component, container, or install-time surface | c3-0#n2@v1:sha256:d21dc72fe385cb42ca0b79273dbc1b309b5d308a10754974395b20c7fd30fcc0 "Package Todd Lam's personal Claude Code agents and skills as installable plugins, keep the repo the single source of truth via symlink installs, and benchmark e" | None |

## Verification

| Check | Result |
| --- | --- |
| c3x check --only rule-no-squash-merge | ok: true |
| git rev-list --parents -n 1 d6de196f102b36241413e41b01448b2c012e57ad | wc -w |
| grep -rn -i squash plugins/tribe/agents/ | every surviving hit is a deliberate "never squash" prohibition; zero instructions to squash |
| bash plugins/verify-shipped/skills/verify-shipped/scripts/verify-shipped.sh against PR #37 | the merge-strategy check PASSES after the fix (it FAILS today) |
| c3x check --only c3-215 and --only c3-217 after apply | ok: true; both cite rule-no-squash-merge |
| grep -rn -i "squash" .c3/ after apply | no surviving claim that anything squash-merges |
