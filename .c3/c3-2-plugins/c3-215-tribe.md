---
id: c3-215
c3-seal: 298c981635aa16840471d8102c76358f355d9c1fcc2db55023e5e9da66f7af2c
title: tribe
type: component
category: feature
parent: c3-2
goal: Deliver features through a 5-agent chain of command — Shaman (What/Why) → Warchief (How) → Hunter (TDD execution), gated by Tracker (rules review) and Skinner (done-ness audit) — ending in regular-merged (2-parent, never squashed), evidenced PRs. The loop itself is optionally executed unattended by the campaign runner, at zero token cost.
uses:
    - ref-docs-lifecycle
    - ref-evals-fixture
    - ref-plugin-layout
    - rule-bash-strict-mode
    - rule-no-squash-merge
---

## Goal

Deliver features through a 5-agent chain of command — Shaman (What/Why) → Warchief (How) → Hunter (TDD execution), gated by Tracker (rules review) and Skinner (done-ness audit) — ending in regular-merged (2-parent, never squashed), evidenced PRs. The loop itself is optionally executed unattended by the campaign runner, at zero token cost.

## Parent Fit

| Field | Value |
| --- | --- |
| Container | c3-2 plugins — Claude Code runtime content |
| Category | Feature — delivery orchestration, the container's complex member |
| Role in parent | Agent-flavored plugin: 5 agent definitions + heartbeat/resume/plan-validation scripts with shell tests + agent-kind evals + CLAUDE.md snippet appended by install hook |
| Depends on siblings | verify-shipped encodes its Definition of Done as mechanical checks; splitting-plans complements Warchief planning |

## Purpose

Owns the delivery role contracts: who may talk to whom (Owner ⇄ Shaman ⇄ Warchief ⇄ Hunter, adjacent ranks only), which question each role answers, how questions flow up as statuses (NEEDS_DIRECTION / NEEDS_CONTEXT / BLOCKED) and decisions flow down as idea cards and briefs, with memory in files (roadmap, Decision Log, spec, plan, reports). Non-goals: none of these agents replaces the owner's judgment on irreversible decisions.

## Foundational Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Precondition | Agents symlink-installed; repo with git + gh for delivery; roadmap/report file paths supplied at dispatch | N.A - see agents/*.md |
| Inputs | Owner directives to the Shaman ("what's next", "run the roadmap"); idea cards down the chain | N.A - see agents/shaman.md |
| State | File-based memory: roadmap + Decision Log, spec/plan files, report files; atomic checkpoints for crash resume | ref-docs-lifecycle |
| Shared dependencies | Model-tier pinning per role (chain-of-command design); heartbeat protocol | N.A - see scripts/heartbeat-check.sh, commit 6a46391 |

## Business Flow

| Aspect | Detail | Reference |
| --- | --- | --- |
| Outcome | One idea card → a regular-merged (2-parent, never squashed), evidenced PR (SHIPPED), verified against the card's measurable goal — driven either by a human Shaman session or unattended by the campaign runner | ref-docs-lifecycle |
| Primary path | Shaman picks card → Warchief specs + plans → Hunters implement under strict TDD → Tracker reviews diffs during dev → Skinner audits done-ness by running the proof → Warchief merges → reports up | N.A - see plugin README flow diagram |
| Alternates | Open What/Why question → Warchief returns NEEDS_DIRECTION to Shaman; Shaman escalates only irreversible decisions to owner | N.A - see agents/warchief.md, agents/shaman.md |
| Failure behavior | Crash → resume from atomic checkpoints (resume-check.sh); stalled agents caught by heartbeat; Skinner FAIL must be fixed, never argued away | N.A - see scripts/resume-check.sh, scripts/heartbeat-check.sh |

## Governance

| Reference | Type | Governs | Precedence | Notes |
| --- | --- | --- | --- | --- |
| ref-plugin-layout | ref | Directory shape incl. claude-md/ snippet + install hook | binding | Hook appends review-agent guidance to global CLAUDE.md (idempotent) |
| ref-evals-fixture | ref | Agent-kind eval cases (kind: "agent", per-case agent field) | binding | The reason the fixture shape grew the agent flavor |
| ref-docs-lifecycle | ref | Specs/plans/evidence for tribe's own feature work | binding | Most docs/superpowers files are tribe designs |
| rule-bash-strict-mode | rule | heartbeat/resume/validate-plan scripts + their tests | binding | — |
| rule-no-squash-merge | rule | Every merge the Warchief performs, and the campaign runner's D3 point 2 that verifies it | binding | The agent definitions instructed squash-merge in 12 places, which the runner's 2-parent check rejects — the rule is what keeps agents, runner, and the owner's standing rule on one merge shape |

## Contract

| Surface | Direction | Contract | Boundary | Evidence |
| --- | --- | --- | --- | --- |
| Owner → Shaman dispatch | IN | Single entry point for all feature work; owner never briefs Warchief/Hunter directly | agent invocation | agents/shaman.md |
| Status protocol | OUT | SHIPPED / NEEDS_DIRECTION / NEEDS_CONTEXT / BLOCKED flow up one rank only | report files | plugins/tribe/.claude-plugin/plugin.json |
| Roadmap / spec / plan / report files | IN/OUT | All inter-agent memory is file-based, survives session death | filesystem | plugins/tribe/.claude-plugin/plugin.json |
| scripts/validate-plan.sh | IN | Plan structure validated before Hunters are dispatched | shell script + tests | plugins/tribe/scripts/tests/test-validate-plan.sh |
| Global CLAUDE.md append | OUT | Install hook appends claude-md/review-agents.md guidance, idempotently | user's global config | install.sh + claude-md/ |
| scripts/runner/run.ts (campaign runner) | IN | Stateless CLI capability: every environment value is an input (--repo, --state, --model, --answers, --escalations-dir, --logs-dir, --session-timeout, --dry-run, --cards, --max-cards, --include-escalated). Executes staged cards sequentially — one fresh Agent-SDK executor session per card, script-verified SHIPPED, state committed to the target repo. Zero LLM calls in the loop itself; the campaign instance lives in the target repo, never here | bun CLI, repo-invoked (never installed) | plugins/tribe/scripts/runner/run.test.ts |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Role-boundary erosion (an agent answers another's question) | Editing any agent definition | Agent evals grade role behavior per case | scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json |
| Broken crash resume | Changing checkpoint/report file formats | resume-check.sh misses resumable state | plugins/tribe/scripts/tests/test-resume-check.sh |
| Plan validation regression | Editing validate-plan.sh | Malformed plans reach Hunters | plugins/tribe/scripts/tests/test-validate-plan.sh |
| Non-idempotent CLAUDE.md append | Editing the install hook | Duplicate snippet blocks in global CLAUDE.md | Re-run ./install.sh tribe twice and diff the global CLAUDE.md |
| Runner accepts an unshipped card, or wedges the campaign | Editing verify.ts (the D3 six-point replay), github.ts (D6 retry/waiver), or any gh/git invocation in the runner | Mocked seams validate logic but NOT the commands: `gh api pulls/<pr>` 404d in reality while 25 tests passed, which would have failed every card forever. A wrong invocation is invisible to the suite | cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit; plus execute any changed gh/git command against a real repo before trusting it |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| CLAUDE.md review-agents snippet | Contract section (Global CLAUDE.md append surface) and Governance row ref-plugin-layout | Wording condensed for CLAUDE.md context | plugins/tribe/claude-md/review-agents.md |
| Agent-kind eval cases | Contract section (status protocol + dispatch surfaces) and Governance row ref-evals-fixture | Cases may grow | plugins/tribe/evals/evals.json |
| Script tests | Contract section (the scripts/validate-plan.sh and report-file surfaces they exercise) and Governance row rule-bash-strict-mode | Test style free | plugins/tribe/scripts/tests/test-resume-check.sh |
