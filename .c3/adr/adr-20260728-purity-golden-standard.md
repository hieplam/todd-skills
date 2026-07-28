---
id: adr-20260728-purity-golden-standard
c3-seal: 2d196d69c29f4142b607d8a5ce83baecc27bf4156c3ae1b50924535f8d6d21a3
title: purity-golden-standard
type: adr
goal: |-
    Give the tribe a cross-stack design golden standard — "pure core, impure edges": core logic
    (calculation, decisions, flow control) stays deterministic and side-effect-free, and every
    outside-world dependency (database, network, filesystem, clock, random) enters only through an
    abstraction injected from the edge — and make every delivery agent engage it at its natural
    moment: the Warchief designs specs/plans to it and stamps a verbatim Purity line into every
    plan's Global Constraints (which every Hunter brief inherits), the Tracker checks it on every
    review, and the Skinner loads it at the final done-ness audit. The canonical text ships as
    `plugins/tribe/rules/pure-core.md`, symlinked into `~/.claude/rules/` by the tribe plugin's
    install hook, so the standard travels to every codebase on the machine regardless of tech
    stack. `ref-plugin-layout`'s closed component-directory list gains `rules/`, and the root
    installer whitelists it.
status: proposed
date: "2026-07-28"
---

## Goal

Give the tribe a cross-stack design golden standard — "pure core, impure edges": core logic
(calculation, decisions, flow control) stays deterministic and side-effect-free, and every
outside-world dependency (database, network, filesystem, clock, random) enters only through an
abstraction injected from the edge — and make every delivery agent engage it at its natural
moment: the Warchief designs specs/plans to it and stamps a verbatim Purity line into every
plan's Global Constraints (which every Hunter brief inherits), the Tracker checks it on every
review, and the Skinner loads it at the final done-ness audit. The canonical text ships as
`plugins/tribe/rules/pure-core.md`, symlinked into `~/.claude/rules/` by the tribe plugin's
install hook, so the standard travels to every codebase on the machine regardless of tech
stack. `ref-plugin-layout`'s closed component-directory list gains `rules/`, and the root
installer whitelists it.

## Context

The owner's design philosophy exists only in conversation — no file any agent reads, so no
agent carries it into the repos the tribe is dispatched against. `c3-215` is built to be
dispatched across arbitrary repos and stacks (its prompts were made stack-agnostic by
adr-20260726-stack-agnostic-agent-prompts for exactly this reason), so the standard cannot
live in any one repo's rule set. The agents' existing read channels are asymmetric:
`tracker.md` forbids prompt-embedded rules ("The rules live in files, not in this prompt",
plugins/tribe/agents/tracker.md:21) and already reads every `~/.claude/rules/*.md` fresh per
review (tracker.md:42); `skinner.md`'s governance step reads project `.claude/rules/*.md` and
`~/.claude/CLAUDE.md` but NOT machine-global `~/.claude/rules/` (skinner.md:320-323);
`warchief.md`'s intake reads repo governance only (warchief.md:299-301). Nothing installs
machine-global rule files today: the tribe hook (`plugins/tribe/install.sh`) early-exits when
`claude-md/` is absent and handles only CLAUDE.md snippets, and `ref-plugin-layout`'s Choice
declares a closed component-dir list (`agents/`, `skills/`, `install.sh`, `claude-md/`,
`hooks/`, `scripts/`, `evals/`) with no `rules/`, mirrored by the root `install.sh` case
whitelist.

## Decision

Deliver the standard file-based, keyed to each agent's existing read channel, instead of
embedding philosophy prose per agent prompt. One canonical rule file
`plugins/tribe/rules/pure-core.md` (Rule / Why / Golden pattern / Not this / Pragmatism with a
reviewer severity guide, all stack-agnostic) is symlinked into `~/.claude/rules/` by the tribe
install hook — symlink, not copy, so the repo stays the single source of truth. Tracker then
needs ZERO prompt change: its step-1 global-rules read picks the file up in any repo, exactly
as its architecture intends. Skinner gets a one-line governance extension (read
`~/.claude/rules/*.md`). Warchief gets three surgical touches: intake names
`~/.claude/rules/` among governance, the spec step requires naming the pure core and the
seams, and the plan step mandates a second verbatim Global Constraints line ("Purity: core
logic stays deterministic and side-effect-free; every outside-world dependency ... enters
through an abstraction injected from the edge") so the standard rides into every Hunter brief
even in repos where the file is not installed. The hook is restructured (rules section before
the claude-md early-exit) with a new shell test, and `ref-plugin-layout` + root installer
learn the `rules/` component type. This wins because it reuses the exact mechanism each
reviewer already trusts (fresh file reads), keeps one editable source instead of N drifting
prose copies (the no-squash incident: 12 divergent restatements), and costs no per-session
context outside review/planning moments.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | Gains rules/pure-core.md, the hook's rules-linking section + test-install-rules.sh, warchief/skinner prompt edits, and a README section — a new delivery surface (machine-global rule) added to its role | c3-215#n1101@v1:sha256:f467fd1ec102c55b693524d1b29fda35cba5ac48b31be638a9f6a38cc5b3aef8 "Deliver features through a 5-agent chain of command — Shaman (What/Why) → Warchief (How) → Hunter (TDD execution), gated by Tracker (rules review) and Ski" | Parent Delta: updated — patch 04-c3-215-role-row.patch.md extends the Role-in-parent row; rule-bash-strict-mode + rule-stack-agnostic-agent-prompts reviewed below |
| c3-101 | component | Root install.sh adds rules to its component-type whitelist only; linking stays delegated to the plugin's own hook, so the installer's goal ("symlink agents and skills, expose the manifest") is unchanged | c3-101#n759@v1:sha256:8a9563d459545b56a385862bad44876587d4521828684a4ea81c2f950d7b65de "Symlink every plugin's agents and skills into ~/.claude idempotently, and expose the marketplace manifest that registers what exists." | Parent Delta: none — no new link path in the root installer; the layout contract change lands in ref-plugin-layout via patches 01–03 |

## Compliance Refs

| Ref | Why required | Evidence | Action |
| --- | --- | --- | --- |
| ref-plugin-layout | The tribe adds a new component directory rules/, extending the ref's deliberately closed list; the ref's Choice, Why (whitelist string), and How (golden tree) must all name it or every future reader sees the repo violating its own layout law | ref-plugin-layout#n1100@v1:sha256:746cee9fc8b862ca0c7baf82b2f1b47b0cd7295737bee04abfb69a030adb353d "A plugin is a directory under plugins/<name>/ containing .claude-plugin/plugin.json (name, description, version) plus any of exactly these component directo" | update-ref — patches 01–03 in this unit |
| ref-docs-lifecycle | This ADR plus committed patch files are the durable work order (change apply is deferred, see Risks), and the README section documents the standard — the paper trail must outlive this session | ref-docs-lifecycle#n1314@v1:sha256:a163534e4fbc98d69ae8cd12167eedff5b0840b29f305b2a4d73a5784501ec2c "Give feature work a durable, ordered paper trail — designs, implementation plans, and proof artifacts must outlive the chat session that produced them. The re" | comply |

## Compliance Rules

| Rule | Why required | Evidence | Action |
| --- | --- | --- | --- |
| rule-bash-strict-mode | Both edited installers and the new test are shell; all keep set -euo pipefail preambles | rule-bash-strict-mode#n1345@v1:sha256:7a8c286269da63a2ba7b7362b72631a2491addb28a1a4266304605106dbaba9a "All shell scripts start with #!/usr/bin/env bash followed by set -euo pipefail." | comply |
| rule-no-squash-merge | Delivering this ADR merges a PR; the merge must be a regular 2-parent merge | rule-no-squash-merge#n1377@v1:sha256:de99ab791d8de56b2db0a2df30884e92d9f70603716a1384a6965aa0c922273a "A merged PR's merge commit has exactly 2 parents; no capability merges with --squash or" | comply |
| rule-stack-agnostic-agent-prompts | The new warchief/skinner prompt lines and pure-core.md itself must stay language-neutral; stack names appear only as explicitly-labeled illustrations ("interface + DI (C#/Java), seam (TS/JS), trait object (Rust), protocol (Python/Swift)") | rule-stack-agnostic-agent-prompts#n1399@v1:sha256:a1a20b05de21d6ac887a4e6fcc020b0fde876fc17aed7fabaad35e79ece9cb2e "Agent prompt files (plugins/*/agents/*.md) never hardcode a language name, toolchain command," | comply |

## Work Breakdown

| Area | Detail | Evidence |
| --- | --- | --- |
| Canonical rule | New plugins/tribe/rules/pure-core.md: Rule / Why / Golden pattern (pseudocode) / Not this / Pragmatism + reviewer severity guide, stack-agnostic | plugins/tribe/rules/pure-core.md |
| Install hook | plugins/tribe/install.sh: rules/ symlink section (idempotent, backup-on-conflict) placed BEFORE the claude-md early-exit; header rewritten to name both jobs | plugins/tribe/install.sh |
| Hook test | New plugins/tribe/scripts/tests/test-install-rules.sh: rules-only plugin (the early-exit regression), idempotence, conflict backup, rules+claude-md together | 10 passed, 0 failed |
| Root installer | install.sh: rules added to the component-type whitelist with delegation comment; header Behavior note | install.sh case statement |
| Warchief | Intake reads ~/.claude/rules/; spec step names pure core + seams; plan step adds the verbatim Purity Global-Constraints line | plugins/tribe/agents/warchief.md Method steps 1–3 |
| Skinner | Governance step reads ~/.claude/rules/*.md (paths: frontmatter honoured) | plugins/tribe/agents/skinner.md Method step 2 |
| Tracker | Deliberately unchanged — already reads every ~/.claude/rules/*.md fresh per review | plugins/tribe/agents/tracker.md:42 |
| Docs | README section "Design golden standard: pure core, impure edges" with the per-agent delivery table | plugins/tribe/README.md |
| C3 material | Patches 01–03 (ref-plugin-layout Choice/Why/How) and 04 (c3-215 Role-in-parent row) committed in .c3/changes/<this-adr-id>/ | .c3/changes/ |

## Underlay C3 Changes

| Underlay area | Exact C3 change | Verification evidence |
| --- | --- | --- |
| N.A - no C3 CLI surface touched | N.A - this ADR changes plugin content and .c3 doc material only; no c3x command, validator, schema, hint, or template changes | N.A - not applicable |

## Enforcement Surfaces

| Surface | Behavior | Evidence |
| --- | --- | --- |
| plugins/tribe/scripts/tests/test-install-rules.sh | Fails if the hook stops linking rules/, loses idempotence, stops backing up conflicts, or regresses to the claude-md early-exit | 10 passed, 0 failed |
| pure-core.md "Pragmatism" severity guide | Tells tracker/skinner exactly which purity findings are Blocker/Should-fix/Optional, so grading is rule-cited, not invented | plugins/tribe/rules/pure-core.md |
| tracker step-1 fresh read of ~/.claude/rules/ | Every review in every repo derives a checklist item from the rule automatically | plugins/tribe/agents/tracker.md:42 |
| Plan Global Constraints Purity line | Carries the standard into every Hunter brief verbatim, even where the rule file is not installed | plugins/tribe/agents/warchief.md Method step 3 |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| Embed the philosophy as prose in each agent prompt | Contradicts tracker's own architecture ("The rules live in files, not in this prompt", tracker.md:21), and N prose copies drift — this repo already paid for that with no-squash stated in 12 diverging places before rule-no-squash-merge consolidated it |
| Append it to global CLAUDE.md via a claude-md/ snippet | Burns context in every session including non-review work; tracker's checklist derives from rule files, not CLAUDE.md guidance prose, so the agent the owner most wants enforcing it would engage it weakest |
| Add it as a C3 rule in this repo's .c3/rules/ | A repo's C3 rules govern that repo only; the tribe is dispatched into other codebases where this repo's .c3 does not exist — the standard must travel with the agents' machine, not the repo |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| A machine that never re-ran install.sh lacks ~/.claude/rules/pure-core.md, so tracker/skinner load nothing | The Warchief prompt states the shape holds even where the file is absent, and the plan's verbatim Purity line carries the standard into every Hunter brief regardless | re-run ./install.sh tribe; test-install-rules.sh proves the link path |
| c3x CLI defect (check/repair delete pending patch material; apply reports no material) blocks landing patches 01–04, leaving .c3 live docs stale vs code | Repo's corroborated convention: commit ADR + patches as the work order and defer c3 change apply until the CLI is fixed — same state as the adr-20260726 unit already on master; never hand-edit the frozen facts | c3 change apply <this-adr-id> once the CLI is fixed, then c3 check |
| The plan's Purity line is prompt-mandated but not mechanically validated, so a future Warchief could omit it | Tracker/skinner still enforce the rule file itself on every diff; extending validate-plan.sh to require the line is a named follow-up candidate | bash plugins/tribe/scripts/tests/test-validate-plan.sh stays green (validator deliberately untouched) |

## Verification

| Check | Result |
| --- | --- |
| bash plugins/tribe/scripts/tests/test-install-rules.sh | 10 passed, 0 failed |
| bash plugins/tribe/scripts/tests/test-install-hook.sh | 8 passed, 0 failed |
| bash plugins/tribe/scripts/tests/test-fresh-machine.sh | 24 passed, 0 failed (after bun install in the worktree runner — gitignored deps, environmental) |
| CLAUDE_DIR=$(mktemp -d) bash install.sh tribe | linked rules/pure-core.md, 0 warnings — no "unsupported component type" for rules/ |
