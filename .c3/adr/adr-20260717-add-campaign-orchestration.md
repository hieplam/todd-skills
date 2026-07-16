---
id: adr-20260717-add-campaign-orchestration
c3-seal: 64469d25b29ca3298607ca976e7ccac5caed034b73a6ecb692e89350d3821626
title: add-campaign-orchestration
type: adr
goal: |-
    Give `c3-215` the **orchestration layer** the campaign runner was missing: amend the runner's
    contract with **D5′ park-and-continue** (an escalation parks the card and the pass continues,
    instead of exiting on the first question) and a **report contract** (`campaign-report.json` +
    `.md` twins written on every real exit path), and add a new IN surface — the
    **orchestrate-campaign skill** (trigger word "orchestration") that authors the campaign state
    file, triggers the runner, answers escalations within Shaman authority, and composes the one
    owner-facing report. In the same unit, correct the Business Flow, which today describes only the
    attended per-card path and cannot express the unattended campaign the component now supports.
status: accepted
date: "2026-07-17"
---

## Goal

Give `c3-215` the **orchestration layer** the campaign runner was missing: amend the runner's
contract with **D5′ park-and-continue** (an escalation parks the card and the pass continues,
instead of exiting on the first question) and a **report contract** (`campaign-report.json` +
`.md` twins written on every real exit path), and add a new IN surface — the
**orchestrate-campaign skill** (trigger word "orchestration") that authors the campaign state
file, triggers the runner, answers escalations within Shaman authority, and composes the one
owner-facing report. In the same unit, correct the Business Flow, which today describes only the
attended per-card path and cannot express the unattended campaign the component now supports.

## Context

The runner shipped as an **engine without a driver's seat**. Four gaps, all real and all
verified rather than assumed:

1. **No trigger.** `grep -ril "campaign runner" plugins/tribe/agents/` returned **nothing** — no
agent, skill, or session behavior knew the runner existed. The README instructed a human to type
a bun command into a terminal.
2. **No handoff (F12).** All 11 runner flags are inputs; **nothing created** the
`campaign-state.json` the runner requires. The plan's original seeder was a docs PR in another
repo; the owner correctly struck that repo from scope, which removed the only seeder and nothing
replaced it. The state file's shape was never documented anywhere — `--state` was documented as
required, its schema never specified.
3. **No report contract.** The runner emitted exit codes and log files. A calling session had no
single artifact saying "here is what shipped, here is what is blocked".
4. **Exit-on-escalation wedges unattended batches.** D5 exited the whole run on the first
escalation. For the target workload — 10-20 mostly-trivial cards run overnight — one ambiguous
card at position 1 stalls the other 19 behind a question nobody is awake to answer.

The forcing function is the owner's actual ask: say "orchestration: do these N ideas" in any
session, then touch nothing until ONE consolidated report lists every card shipped (PR + sha,
independently verified) or blocked (question + why it needs the owner).

## Decision

Add the orchestration layer as **one skill plus two runner amendments**, keeping the existing
split intact: judgment in sessions, mechanics in the runner.

**Entry is a skill, not an agent** (`plugins/tribe/skills/orchestrate-campaign/`), because the
owner triggers from *any* session — main chat, a Shaman, or a Warchief already in play. A skill
is exactly that: a capability any session invokes. `skills/` is already on install.sh's
whitelist, so it installs cleanly — unlike the runner itself, which stays repo-invoked under
`scripts/` per `ref-plugin-layout`.

**The skill composes with the runner through its CLI contract only** — flags, exit codes, the
report file — never by naming `loop.ts`/`state.ts` internals. Both live in one plugin, but the
discipline holds: the runner README is the contract, and the skill points at it as the single
source of truth for the state schema rather than carrying a competing copy.

**D5′ park-and-continue** replaces exit-on-escalation: write the escalation file, mark the card
`escalated`, continue to the next *progressable* card. A card is progressable when no card it
declares in the new optional `dependsOn` is parked; a dependent of a parked card becomes
`blocked` (new status, derived, never hand-authored). Exit code 2 now means "the pass finished;
at least one escalation is pending" — not "aborted at the first question".

**The report contract** is the ONLY artifact a caller must read: per-card
`shipped | escalated | blocked | not_reached`, plus `pending[]` and `stats`. The exit code is a
hint; the report is the truth. It is written on every real exit path but deliberately NOT on
`--dry-run` (zero side effects is a hard contract) nor on a refused start (another live process
owns the campaign; a report from the refused process would clobber the running one's).

**The zero-LLM wall extends to the new code.** `report.ts` joins `loop.ts`/`run.ts` under the
no-SDK-import rule — judgment must not migrate into the runner as it grows.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | Gains a new IN surface (the orchestrate-campaign skill, trigger "orchestration") and amends the runner's existing contract row with D5′ park-and-continue plus the report contract. Its Business Flow gains the unattended path: one owner directive to Stage A planning to a parked-and-continuing runner pass to a bounded answer round-trip to one owner report. The shaman and warchief role contracts gain their campaign-state authoring and planning-fanout duties | c3-215#n454@v1:sha256:251862af8e4a1e85ac79f1a2b86176842fce93c3f1b9e52758445fa817d64757 "Owns the delivery role contracts: who may talk to whom (Owner ⇄ Shaman ⇄ Warchief ⇄ Hunter, adjacent ranks only), which question each role answers, how qu" | ref-plugin-layout (the skill lands under skills/, already whitelisted), ref-docs-lifecycle (its spec + plan + evidence), rule-no-squash-merge (every campaign merge stays 2-parent) |
| c3-2 | container | Parent of c3-215 and owner of the install contract the new surface had to satisfy: orchestrate-campaign is a new installable skill inside an already-registered member plugin, verified to install with zero warnings. The container's file-based cross-plugin contract is what the orchestration layer extends — the campaign state, answers, escalation and report files are all ordinary files in the target repo. No membership change: the skill is a capability inside c3-215, not a new component | c3-2#n942@v2:sha256:fd983e54cededf8ac09a8f391d405e63adfc3a40bfd1e7d560a0a82c175ec7a1 "Plugins own their business logic and runtime assets end-to-end (skill references, helper scripts, templates); nothing here runs at install time except declared" | ref-plugin-layout — verified the install walk emits zero "unsupported component type" warnings with the new skill present |
| c3-0 | system | Top-down completeness only: c3-215's system ancestor. The orchestration layer adds no container and no new component, and changes no install-time surface — the symlink-install source-of-truth property is untouched | c3-0#n1258@v2:sha256:d21dc72fe385cb42ca0b79273dbc1b309b5d308a10754974395b20c7fd30fcc0 "Package Todd Lam's personal Claude Code agents and skills as installable plugins, keep the repo the single source of truth via symlink installs, and benchmark e" | None — no system-level contract changes |

## Compliance Refs

| Ref | Why required | Evidence | Action |
| --- | --- | --- | --- |
| ref-plugin-layout | Binding on c3-215 and it dictates which subdirectories install.sh understands. The new surface is a skill, and skills/ is already on the whitelist — this is precisely why entry is a skill rather than a new top-level directory. The runner stays under scripts/ (repo-invoked, never installed), unchanged | ref-plugin-layout#n666@v1:sha256:7308f9cf6c7b854b298ec94062198be5540c62222a8b3466b2796854039585c5 "Standardize the directory shape of every plugin so the installer, the marketplace manifest, and the eval harness can walk any plugin without per-plugin logic. T" | comply — skill lands at plugins/tribe/skills/orchestrate-campaign/; install verified 1 linked, 0 warnings; the ref needs no change |
| ref-docs-lifecycle | Binding on c3-215 and governs specs/plans/evidence for tribe's own feature work; this effort has a frozen design spec and an implementation plan under docs/superpowers/, plus per-task evidence reports | ref-docs-lifecycle#n647@v1:sha256:a163534e4fbc98d69ae8cd12167eedff5b0840b29f305b2a4d73a5784501ec2c "Give feature work a durable, ordered paper trail — designs, implementation plans, and proof artifacts must outlive the chat session that produced them. The re" | comply — spec and plan already on master; seven task reports under reports/ carry the per-task proof |
| ref-evals-fixture | Cited by c3-215 (its agent-kind eval cases), so this ADR must state its position rather than pass over it silently | ref-evals-fixture#n657@v1:sha256:f721836fe1202e2368d7d811c32d640cfc55f26882336819d9735bc3a9dbfd04 "One eval fixture format for every skill and agent in the repo, so a single runner can benchmark all of them and results are comparable across plugins. The recur" | N.A - this unit adds no eval fixtures. The orchestrate-campaign skill is instructions, not a scored capability with a fixture; the runner's proof surface remains bun test plus tsc --noEmit in its own package. The existing agent-kind cases in plugins/tribe/evals/evals.json are untouched |

## Compliance Rules

| Rule | Why required | Evidence | Action |
| --- | --- | --- | --- |
| rule-no-squash-merge | Listed in c3-215's uses and binding on every merge path this unit touches. The orchestration layer merges more PRs unattended, not fewer: each card's PR and each campaign-state docs PR must be a regular 2-parent merge, and the runner's own verification mechanically rejects anything else | rule-no-squash-merge#n950@v1:sha256:2f5ff61964fe9551d508719ff31ed7514dbdbd8d296ff884a7e952a5334fab6a "Every capability in this repo that merges a pull request, or that verifies one was merged," | comply — the skill instructs regular merges only; the runner's 2-parent check is unchanged and remains the mechanical enforcement |
| rule-bash-strict-mode | Listed in c3-215's uses and binding on its scripts; this unit adds TypeScript and markdown, so the rule's scope must be checked explicitly rather than assumed | rule-bash-strict-mode#n676@v1:sha256:cf218a707a61ba5ad906d29dec31f9f4eef92e5faeb9db74e3a75451c41c3c1d "Every shell script in the repo fails fast and loud: unset variables, failed commands, and broken pipelines abort the script instead of silently producing half-d" | N.A - this unit adds no shell script. report.ts is TypeScript; the skill is markdown instructions. The existing shell scripts under scripts/ remain bound by it |
| rule-marketplace-registration | Cited by c3-101 (the installer), and this unit adds a genuinely new INSTALLED surface — orchestrate-campaign is symlinked into the user's config, unlike the runner which is only ever repo-invoked. That makes the registry question live rather than academic, so the ADR must state its position rather than pass over it | rule-marketplace-registration#n693@v1:sha256:458830564c7ac131ef95420a16dfb572ec4fbd5c9a24cb1395d641667e5a5a16 "Every plugin that exists in the tree is discoverable and installable: the marketplace manifest is the authoritative registry" | N.A - no new plugin is created. The skill is a new component-type entry inside the already-registered tribe plugin, which install.sh already walks via the skills/ whitelist, so the marketplace manifest is unchanged and no new registry entry is owed. Verified rather than assumed: the install run links the skill and reports zero warnings, and c3-101/install.sh is not edited by this unit |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| Keep D5 exit-on-escalation and let the owner restart after each answer | Defeats the objective. The target workload is 10-20 trivial cards overnight; one ambiguous card at position 1 wedges the other 19 behind a question nobody is awake to answer, turning an unattended campaign into N attended restarts |
| Make the entry point a new agent rather than a skill | The owner triggers from any session — main chat, a Shaman, or a Warchief already in play. An agent is something you dispatch; a skill is a capability any session already has. A new agent would also force the owner to know which agent to invoke, which is the coupling this layer exists to remove |
| Let the runner answer its own escalations | Breaks the wall that keeps the loop honest: the runner is forbidden judgment. It would also make the loop non-deterministic and require LLM calls inside a process whose whole value is costing zero tokens |
| Have the skill carry its own copy of the state schema | It did, briefly, and the copies drifted within hours of both existing — the skill claimed the README did not document the schema while the README documented it. Two copies of one fact is two sources of truth; the README is the contract and the skill points at it |
| Emit only the JSON report and let readers render it | The owner's stated need is to see the blocks when they come back, readable straight from the target repo with no session at all. The md twin costs one render from the same structure and cannot drift from the JSON because both derive from it |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| Park-and-continue reintroduces a non-terminating loop: an escalated card is only excluded by status when --include-escalated is unset, and that flag is exactly what the answer round-trip uses | The pass keeps an in-run attempted set, so termination is structural — the candidate sequence strictly shrinks every tick, independent of any status mutation | Proven by controlled experiment: with the attempted filter removed, the regression test hangs the runner past 120s even with an 8s per-test timeout; with it, the same test passes in 107ms |
| A wrong auto-answer ships a wrong card unattended | Rulings are appended to one committed answers file (auditable); the owner-only escalation list is campaign config the owner writes; auto-answer is capped at 2 rounds per card, then the card parks for the owner; and the six-point verification still gates every ship mechanically | The cap is stated in the skill and tracked as autoAnswerRounds in state and report |
| The report misreports a blocked card as merely not-reached, telling the owner to re-run when the card can never run | The blocked status is derived to a fixpoint before the sequence walk and reconciled onto every card, then persisted before the pass returns, so the report reads the truth rather than a stale value | Proven against the real CLI: a 2-card campaign where A escalates and B depends on A now reports B blocked, blockedOn A, with A in pending — where it previously reported B not_reached with nothing pending |
| The skill is installed globally but names the runner by a relative path, so its first command fails from any session not sitting in this repo | The skill resolves the runner from the plugin root, never from the shell's cwd, and asks the owner rather than guessing if resolution fails | Proven from a foreign cwd: the resolution snippet resolves and the dry-run prints a real phase, where the previous relative path failed with module not found |
| Mocked seams validate logic but not invocations — the lesson this component already paid for once | Every new or changed gh/git command string is executed once against the real CLI before it is trusted; this unit added none, and the report/state paths were exercised end-to-end against a real runner process instead of only through mocks | This unit changed no gh/git invocation; the report contract, dry-run purity, and the blocked cascade were each verified by running the real CLI |

## Enforcement Surfaces

| Surface | Behavior | Evidence |
| --- | --- | --- |
| The in-run attempted set | Makes a pass provably terminate: every selected card is excluded from the candidate sequence for the rest of the pass regardless of status, so park-and-continue cannot re-select the card it just parked | loop.test.ts covers --include-escalated re-escalation terminating, deliberately without --max-cards so the bound cannot mask the bug |
| writeReport as a single seam in run.ts | Every exit path funnels through one call, so no path can forget the report; dry-run and a refused start deliberately write nothing | report.test.ts covers the exit-path matrix and JSON/md parity |
| Zero-LLM grep over loop, run and report | No SDK or model import may appear in the loop process — judgment stays in sessions as the component grows | grep for the agent SDK across loop.ts, run.ts, report.ts returns empty |
| Stateless grep over the skill and runner | No repo name, path, model, or campaign value in the capability; every environment value is a CLI input | grep for repo names and absolute paths across the skill and runner source returns only tests asserting their absence |
| Contract-only grep over the skill | The skill may not name the runner's source modules — it depends on the documented CLI contract, so the runner's internals stay swappable | grep for loop.ts, state.ts, report.ts and siblings across the skill returns empty |
| install.sh component walk | The new skill lands on the existing whitelist, so the install stays warning-free | install run reports 1 linked, 0 warnings |

## Verification

| Check | Result |
| --- | --- |
| cd plugins/tribe/scripts/runner && bun test | 172 pass / 0 fail / 450 expect() calls (baseline before this effort: 116) |
| cd plugins/tribe/scripts/runner && bunx tsc --noEmit | exit 0, no output |
| Park-and-continue termination, proven by sabotage | attempted-filter removed: the W-F2 test hangs the process past 120s (the tight loop never yields, so even an 8s per-test timeout cannot fire); filter restored: 1 pass in 107ms |
| Blocked cascade against the real CLI | 2-card campaign, A escalates, B dependsOn A: on-disk state A escalated / B blocked; report reads B blocked, Blocked on A, Pending A, Stats 0 shipped 1 escalated 1 blocked 0 not reached, exit 2 |
| Dry-run is still zero side effects | state file byte-identical (md5 unchanged) and no report written, after the report contract and the state-persist fix both landed |
| F12 closure, proven by authoring from the README alone | The README's own worked example, extracted verbatim into a scratch repo, yields a runnable campaign: cardId A1, phase fresh. With the planning field added, it still parses and planning survives a load-save round trip |
| F12 detection, inverted | grep -ril "campaign runner" plugins/tribe/agents/ returns shaman.md and warchief.md — previously empty |
| Skill resolves the runner from a foreign cwd | resolution snippet resolves to the plugin's scripts/runner and the dry-run prints cardId A1, phase fresh — the same command previously failed with module not found |
| ./install.sh tribe | 1 linked, 5 already linked, 0 backed up, 0 warning(s) |
| Stateless, contract-only and zero-LLM greps | all empty (W1, contract rule, W2) |
