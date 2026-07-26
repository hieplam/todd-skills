---
id: adr-20260726-stack-agnostic-agent-prompts
c3-seal: 6a8011d9927c2d35ef2a2a611937493ea3eb1a34c7ba7aeb3805c8cbbc6f9a3f
title: stack-agnostic-agent-prompts
type: adr
goal: |-
    Remove the C#/.NET tech-stack coupling from the tribe plugin's agent prompts — primarily
    `plugins/tribe/agents/tracker.md`, plus two incidental leaks in `skinner.md` and two in the
    plugin's own docs — so agent prompts state roles, obligations, terminology, and DISCOVERY
    PROCEDURES generically, and never hardcode a language, toolchain command, or stack-specific
    file set except as an explicitly-labeled illustration. Encode that expectation as a new,
    checkable C3 rule (`rule-stack-agnostic-agent-prompts`) wired into `c3-215`'s `uses` and
    Governance table, since nothing in `c3-215`'s current contract authorizes — or forbids — any
    particular stack.
status: proposed
date: "2026-07-26"
---

## Goal

Remove the C#/.NET tech-stack coupling from the tribe plugin's agent prompts — primarily
`plugins/tribe/agents/tracker.md`, plus two incidental leaks in `skinner.md` and two in the
plugin's own docs — so agent prompts state roles, obligations, terminology, and DISCOVERY
PROCEDURES generically, and never hardcode a language, toolchain command, or stack-specific
file set except as an explicitly-labeled illustration. Encode that expectation as a new,
checkable C3 rule (`rule-stack-agnostic-agent-prompts`) wired into `c3-215`'s `uses` and
Governance table, since nothing in `c3-215`'s current contract authorizes — or forbids — any
particular stack.

## Context

`plugins/tribe/agents/tracker.md` currently hardcodes C#/.NET throughout its operating
procedure: its frontmatter `description` says "review C# pull requests"; its identity line
calls it "a meticulous C# reviewer"; its rule-gathering step scopes to "rules that could apply
to C#" and lists `.editorconfig`, `*.ruleset`, `*.globalconfig`, `Directory.Build.props` as
*the* project-scoped rule sources; its review step reviews only "changed C# files"; its bug-class
list names "null handling, wrong async usage, swallowed exceptions"; and its substantiation step
runs `dotnet build`, `dotnet test --filter`, `dotnet format --verify-no-changes` unconditionally.
Tracker's own eval fixture (`plugins/tribe/evals/evals.json` case 5,
`tracker-cites-rules-not-invented-standards`) reinforces the bias with an `OrderService.cs` /
`.editorconfig` scenario; case 29 asserts a `format --verify-no-changes` command literally.
Two more incidental leaks exist: `skinner.md`'s "run the repo's standard proof" step names
`tsc --noEmit`, `format:check`, and `.sln` as the discovered commands (lines ~362, ~366); and
the plugin's own docs (`plugins/tribe/README.md:79`, `plugins/tribe/claude-md/review-agents.md:10`)
cite `.editorconfig` as Tracker's canonical rule source.

`c3-215` (tribe) is designed to be dispatched against **any** repo the owner works in — this
very repo is TypeScript/Bash/Python/Markdown, not C# — so a reviewer agent that assumes C#/.NET
on every invocation silently produces wrong or unusable review guidance whenever it runs on a
non-C# codebase (exactly what would happen if Tracker reviewed this repo's own diff today).
Nothing in `c3-215`'s Governance table currently authorizes any stack assumption, and nothing
catches this class of drift mechanically: a future edit could reintroduce a different
stack-specific assumption (e.g. hardcoding `npm test`) with no rule to flag it.

## Decision

Rewrite `tracker.md` to insert a new step 0, "Learn how this repo verifies itself", before the
existing rule-gathering step: a 4-rung discovery ladder (hard rules in the rule sources it is
about to read > repo config it can observe — CI workflows, Makefile/Justfile, task-runner
manifest scripts > observed conventions, which inform HOW to verify but are never themselves a
source of violations > explicit "unverified" when nothing is found), and generalize every
C#-specific phrase (identity, rule-source enumeration, review-scope wording, bug-class examples,
substantiation commands, example paths) to language-neutral equivalents that point back at step
0 instead of a fixed toolchain. Apply the same "discovered, not hardcoded" fix to `skinner.md`'s
three named command examples (role-phrased: typecheck / lint-format check / build manifest) and
to the two doc mentions of `.editorconfig` (neutral: "formatter/linter config"). Reword tracker's
own eval fixture (case 5: `OrderService.cs`/`.editorconfig` → `order_service` module / "formatter
config"; case 29: `format --verify-no-changes` → "format check") so the fixture keeps testing
its real assertion — Tracker refuses to invent standards and stays read-only — without itself
teaching the stack bias being removed.

This wins over a narrower "just delete the C# words" pass because a rewritten agent still needs
a well-defined way to *learn* a repo's real commands at review time; the discovery ladder is
that mechanism, ordered by authority so a hard rule always outranks an inferred convention.
Encode the standard as a new rule rather than only fixing the prose, because prose alone already
drifted once (the current C# hardcoding shipped without any rule catching it) and a rule is
checkable on every future agent-prompt edit. Wire the rule into `c3-215` via the change-unit
flow, not `wire`/`set`, because `c3-215` is a frozen fact — direct mutation is refused by design.

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | Its Tracker/Skinner agent definitions hardcoded C#/.NET assumptions; gains rule-stack-agnostic-agent-prompts in uses plus a Governance row so future agent-prompt edits are held to a checkable, language-neutral standard | c3-215#n868@v1:sha256:f467fd1ec102c55b693524d1b29fda35cba5ac48b31be638a9f6a38cc5b3aef8 "Deliver features through a 5-agent chain of command — Shaman (What/Why) → Warchief (How) → Hunter (TDD execution), gated by Tracker (rules review) and Ski" | rule-stack-agnostic-agent-prompts (new, binding) |
| c3-2 | container | Parent of c3-215; no membership or directory-layout change, included for top-down completeness | c3-2#n574@v1:sha256:f92a1cfb53ada54dba5f5c1154ccef3423fe08276ff6ec199cc745be16f8d3d0 "Claude Code runtime content: the 9 installable plugins — agents and skills that, once symlinked into ~/.claude, extend every Claude Code session with delive" | None — no container contract change |
| c3-0 | system | Top-down completeness only: the system ancestor of the affected component. No new component, container, or install-time surface | c3-0#n2@v1:sha256:d21dc72fe385cb42ca0b79273dbc1b309b5d308a10754974395b20c7fd30fcc0 "Package Todd Lam's personal Claude Code agents and skills as installable plugins, keep the repo the single source of truth via symlink installs, and benchmark e" | None |

## Compliance Refs

| Ref | Why required | Evidence | Action |
| --- | --- | --- | --- |
| ref-evals-fixture | plugins/tribe/evals/evals.json cases 5 and 29 are edited; the shared fixture format (id/name/agent/prompt/expected_output/files) is unchanged, only prose content is reworded | ref-evals-fixture#n1089@v1:sha256:f721836fe1202e2368d7d811c32d640cfc55f26882336819d9735bc3a9dbfd04 "One eval fixture format for every skill and agent in the repo, so a single runner can benchmark all of them and results are comparable across plugins. The recur" | comply |
| ref-plugin-layout | No directory shape change — no files added, removed, or moved, only prose edits inside existing agent/doc/fixture files | ref-plugin-layout#n1098@v1:sha256:7308f9cf6c7b854b298ec94062198be5540c62222a8b3466b2796854039585c5 "Standardize the directory shape of every plugin so the installer, the marketplace manifest, and the eval harness can walk any plugin without per-plugin logic. T" | N.A - no layout change |

## Compliance Rules

| Rule | Why required | Evidence | Action |
| --- | --- | --- | --- |
| rule-bash-strict-mode | No shell script is touched by this change (agent .md prompts, docs, and an eval JSON fixture only) | rule-bash-strict-mode#n1110@v1:sha256:7a8c286269da63a2ba7b7362b72631a2491addb28a1a4266304605106dbaba9a "All shell scripts start with #!/usr/bin/env bash followed by set -euo pipefail." | N.A - no shell script edited |
| rule-stack-agnostic-agent-prompts | The rule this ADR creates; every prompt edit named in Work Breakdown must comply with it once authored, and it is the mechanism that makes the removed C#/.NET coupling a checkable violation going forward | N.A - new fact, created by this change-unit (see Work Breakdown); no prior citation exists | create-rule |

## Work Breakdown

| Area | Detail | Evidence |
| --- | --- | --- |
| plugins/tribe/agents/tracker.md | Add step-0 discovery ladder (4 rungs); generalize frontmatter description, identity line, rule-source enumeration, review-scope wording, bug-class examples, substantiation commands, and example paths to language-neutral phrasing | diff of the file (this PR) |
| plugins/tribe/agents/skinner.md | Replace tsc --noEmit / format:check / .sln named examples (~lines 362, 366) with role-phrased equivalents (typecheck / lint-format check / build manifest scripts), keeping the "discovered from the repo's own config" mechanism verbatim | diff of the file |
| plugins/tribe/README.md | Replace the .editorconfig mention (~line 79) with neutral "formatter/linter config" phrasing | diff of the file |
| plugins/tribe/claude-md/review-agents.md | Replace the .editorconfig mention (~line 10) with the same neutral phrasing | diff of the file |
| plugins/tribe/evals/evals.json | Case 5 (OrderService.cs, .editorconfig) and case 29 (format --verify-no-changes) reworded to stack-neutral surface details; the assertion under test (Tracker refuses to invent standards / stays read-only) is unchanged | diff of the file; python3 -c "import json;json.load(open('plugins/tribe/evals/evals.json'))" |
| rule-stack-agnostic-agent-prompts (new rule doc) | Authored via c3x schema rule then c3x add rule stack-agnostic-agent-prompts --file <body> | c3x read rule-stack-agnostic-agent-prompts |
| c3-215 (tribe component doc) | uses gains rule-stack-agnostic-agent-prompts; Governance table gains a row for it — applied via the change-unit flow (c3x change new/apply) since c3-215 is a frozen fact | c3x change apply <this-adr-id>; c3x check --only c3-215 |

## Underlay C3 Changes

| Underlay area | Exact C3 change | Verification evidence |
| --- | --- | --- |
| N.A - no C3 CLI, validator, schema, template, or help text is touched by this ADR | N.A - it uses the existing change-unit primitives (add rule, a block-patch to a frozen component's uses/Governance section) exactly as documented by c3x change --help | N.A |

## Enforcement Surfaces

| Surface | Behavior | Evidence |
| --- | --- | --- |
| scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json --eval-id 5,29 | Re-runs Tracker's own two eval cases against the rewritten prompt; both must keep passing their existing rubric (no-invented-standards, stays read-only) on stack-neutral surface details | run output captured in the PR |
| grep -rniE 'c#\|csharp\|dotnet\|\.csproj\|\.sln\|\.ruleset\|globalconfig\|Directory\.Build\|tsc --noEmit\|OrderService' plugins/tribe/agents/ plugins/tribe/README.md plugins/tribe/claude-md/ plugins/tribe/evals/evals.json | Zero matches proves the coupling is actually gone, not just renamed | grep output captured in the PR |
| c3x check --only c3-215 --rule rule-stack-agnostic-agent-prompts | Confirms the new rule is wired and the component doc is internally consistent after the change-unit applies | command output |
| python3 -c "import json;json.load(open('plugins/tribe/evals/evals.json'))" | Confirms the hand-edited fixture is still valid JSON | command output |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| Delete the C#-specific words without adding the step-0 discovery ladder | Leaves Tracker with no defined way to learn a repo's real build/test/lint/format commands, so "substantiate before reporting" degenerates into either guessing a command (false confidence) or never running anything (weaker reviews); the ladder is what keeps the substantiation obligation meaningful stack-agnostically |
| Fix only tracker.md and skip the eval fixture (case 5/29) | The fixture is the regression guard for exactly the behavior being generalized; leaving OrderService.cs/.editorconfig/dotnet format in the fixture would keep grading Tracker against a C#-flavored scenario forever, silently reintroducing the coupling this ADR removes |
| Skip the new C3 rule and rely on prose review only | The current C# hardcoding already shipped once with no rule catching it — prose-only guidance has already proven insufficient to prevent this exact class of drift in this repo |
| Hand-edit c3-215's frozen .c3/ markdown directly instead of the change-unit flow | c3-215 is a canonically sealed, frozen fact; wire/write/set are refused by the CLI, and hand-editing would break its seal the same way other pre-existing patches in this repo are currently broken-sealed — the change-unit flow is the only legal mutation path |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| The step-0 discovery ladder is too abstract for Tracker to act on consistently across very different repos | Ladder is ordered by authority (hard rule > repo config > observed convention > explicit "unverified"), mirroring the same discovery pattern already proven in skinner.md's "discovered from the repo's own config" step | Re-run eval cases 5 and 29 against the rewritten prompt; both must keep passing |
| Rewording the eval fixture accidentally changes what is being tested, silently weakening the regression guard | The assertion text (refuse to invent standards; stay read-only) is preserved verbatim in intent — only the surface nouns (file name, config file name, command name) change | Diff review of expected_output fields; --eval-id 5,29 run compares pass/fail against the same rubric |
| Pre-existing broken canonical seals elsewhere in .c3/ (unrelated to this change, from prior unapplied change-units) could make c3x check/repair destructive if run carelessly | This change-unit's own patches are applied via c3x change apply before any c3x check --fix/repair, per the repo's own recorded operating knowledge; no pre-existing patch material is touched by this change-unit | git status .c3/ before and after each c3x invocation in this session, to confirm no unintended file was modified or deleted |

## Verification

| Check | Result |
| --- | --- |
| grep -rniE 'c#\|csharp\|dotnet\|\.csproj\|\.sln\|\.ruleset\|globalconfig\|Directory\.Build\|tsc --noEmit\|OrderService' plugins/tribe/agents/ plugins/tribe/README.md plugins/tribe/claude-md/ plugins/tribe/evals/evals.json | Must return no matches (or only an explicitly-labeled illustration) — captured in the PR description |
| python3 -c "import json;json.load(open('plugins/tribe/evals/evals.json'))" | Must exit 0 (valid JSON) — captured in the PR description |
| scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json --eval-id 5,29 (or the documented not-run fallback if the full harness cannot execute in this environment) | Result captured verbatim in the PR description; never fabricated |
| c3x check --only c3-215 | Must report the component internally consistent after this change-unit applies |
