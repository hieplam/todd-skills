---
id: c3-215
c3-seal: 58ca7f87454cc561f5d5b6182815bf9a05d50582c988fcc4268b9042eefb29fc
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
| Unattended path | One owner directive ("orchestration: do these N ideas") and then no owner intervention until one report. orchestrate-campaign assumes Shaman authority → Stage A authors the specs, plans and campaign state, landing them as a docs PR → the runner loops at zero token cost, verifying each card mechanically, and on an escalation it PARKS that card and continues to the next progressable one (a dependent of a parked card is blocked, never started) → the orchestrator answers within-authority escalations into answers.md and re-triggers, capped at 2 rounds per card → ONE consolidated report: every card either shipped (PR and merge sha, independently re-verified rather than agent-claimed) or blocked (the question, and why it needs the owner). The sole designed interruption is an irreversible decision — data shapes, product promises, new permissions, privacy — which parks for the owner by campaign config | N.A - see plugins/tribe/skills/orchestrate-campaign/SKILL.md, plugins/tribe/scripts/runner/README.md |

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
| scripts/runner/run.ts (campaign runner) | IN | Stateless CLI capability: every environment value is an input (--repo, --state, --model, --answers, --escalations-dir, --logs-dir, --session-timeout, --dry-run, --cards, --max-cards, --include-escalated). Executes staged cards sequentially — one fresh Agent-SDK executor session per card, script-verified SHIPPED, state committed to the target repo. D5′ park-and-continue: an escalation writes the escalation file, parks the card, and the pass CONTINUES to the next progressable card — exit 2 means "the pass finished, at least one escalation is pending", never "aborted at the first question"; a card declaring dependsOn a parked card becomes blocked (derived, reconciled to a fixpoint, never hand-authored). Report contract: campaign-report.json plus its .md twin are written next to the state file on every real exit path — but never on --dry-run (zero side effects is a hard contract) and never on a refused start (another live process owns the campaign). The exit code is a hint; the report is the truth. Zero LLM calls in the loop itself; the campaign instance lives in the target repo, never here | bun CLI, repo-invoked (never installed) | plugins/tribe/scripts/runner/run.test.ts |
| skills/orchestrate-campaign | IN | The campaign's entry point, trigger word "orchestration", invocable from ANY session — main chat, a Shaman, or a Warchief already in play — which is why it is a skill rather than an agent. Assumes Shaman authority for the campaign: authors the campaign state file the runner requires as input (nothing else in the system creates it), runs Stage A planning per the authorship policy (author specs and plans itself for few or complex cards; dispatch one planning-Warchief per card for many trivial ones), triggers the runner in the background, reads the report contract on exit, answers within-authority escalations into the committed answers file — never the campaign's owner-only list — re-triggers at most 2 auto-answer rounds per card before parking it for the owner, and composes the ONE owner report, independently re-verifying every card the runner claims shipped. Depends on the runner's documented CLI contract only (flags, exit codes, report file), never its source modules | installed skill (symlinked into the user's config); resolves the runner from the plugin root, never from the shell's cwd | plugins/tribe/skills/orchestrate-campaign/SKILL.md |
| scripts/doctor.sh | IN | Preflights the per-machine prerequisites the runner needs but the repo cannot carry: `bun` (the runner is TypeScript executed directly), `gh` plus its auth (PR state), Agent SDK credentials (an API key or an existing Claude Code login), and the runner's `node_modules/` (gitignored, so absent on a fresh clone). Reports EVERY gap in one pass with the command that fixes it, never fatal-on-first-miss, so a machine is provisioned in a single pass. Exits 0 when all are present, else 1. Run once per campaign before the first real run: a fresh clone can install with zero warnings and still fail hours into an unattended run, because these are provisioned per machine rather than per repo. Never installs anything itself — the plugin's boundary is linking, not provisioning | shell script, repo-invoked (never installed) | plugins/tribe/scripts/tests/test-fresh-machine.sh |
| skills/orchestrate-campaign/resolve-runner.sh | IN | Resolves the campaign runner's directory and fails CLOSED. Prints an absolute path on stdout and exits 0 ONLY after proving `run.ts` exists there; otherwise prints nothing and exits 3 with a named diagnostic. Honours `$CLAUDE_PLUGIN_ROOT` first but only once proven, so a stale or foreign value falls through rather than winning on presence; otherwise locates itself via `cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P`, resolving the install symlink to its physical home in the repo. Never dereferences `~`, so an unrelated or empty HOME cannot influence it, and it can never emit a relative path. Because it ships inside the skill directory it travels with the symlink install: a moved repo takes the script with it, so bash fails loudly instead of a wrong path being computed. Callers take exit 3 at face value and stop — substituting a guess reintroduces the bug it exists to prevent | bundled skill script (symlinked with the skill dir) | plugins/tribe/scripts/tests/test-fresh-machine.sh |

## Change Safety

| Risk | Trigger | Detection | Required Verification |
| --- | --- | --- | --- |
| Role-boundary erosion (an agent answers another's question) | Editing any agent definition | Agent evals grade role behavior per case | scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json |
| Broken crash resume | Changing checkpoint/report file formats | resume-check.sh misses resumable state | plugins/tribe/scripts/tests/test-resume-check.sh |
| Plan validation regression | Editing validate-plan.sh | Malformed plans reach Hunters | plugins/tribe/scripts/tests/test-validate-plan.sh |
| Non-idempotent CLAUDE.md append | Editing the install hook | Duplicate snippet blocks in global CLAUDE.md | Re-run ./install.sh tribe twice and diff the global CLAUDE.md |
| Runner accepts an unshipped card, or wedges the campaign | Editing verify.ts (the D3 six-point replay), github.ts (D6 retry/waiver), or any gh/git invocation in the runner | Mocked seams validate logic but NOT the commands: `gh api pulls/<pr>` 404d in reality while 25 tests passed, which would have failed every card forever. A wrong invocation is invisible to the suite | cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit; plus execute any changed gh/git command against a real repo before trusting it |
| The skill resolves the runner to a wrong path, or a campaign starts on a machine that cannot finish it | Editing resolve-runner.sh, doctor.sh, or re-inlining runner resolution into SKILL.md as shell prose | Invisible on the author's machine, where `~/.claude/skills/orchestrate-campaign` always exists — this class needs a SECOND machine to appear. The original `readlink -f` fallback printed nothing and exited 1 when the skill was not installed there; `$()` discarded the exit code, `dirname ""` returned `.`, and it collapsed to `./scripts/runner` against the target repo. A moved repo was worse: readlink prints the deepest surviving ancestor, so the result was a confident WRONG absolute path | bash plugins/tribe/scripts/tests/test-fresh-machine.sh (throwaway HOME per probe — the isolation is load-bearing: without overriding HOME every probe reads the author's real install and passes against a broken resolver). Mutation-check any change: swap the old expression back in and confirm the harness FAILS, incl. `an empty HOME never yields the forbidden relative path` |

## Derived Materials

| Material | Must derive from | Allowed variance | Evidence |
| --- | --- | --- | --- |
| CLAUDE.md review-agents snippet | Contract section (Global CLAUDE.md append surface) and Governance row ref-plugin-layout | Wording condensed for CLAUDE.md context | plugins/tribe/claude-md/review-agents.md |
| Agent-kind eval cases | Contract section (status protocol + dispatch surfaces) and Governance row ref-evals-fixture | Cases may grow | plugins/tribe/evals/evals.json |
| Script tests | Contract section (the scripts/validate-plan.sh and report-file surfaces they exercise) and Governance row rule-bash-strict-mode | Test style free | plugins/tribe/scripts/tests/test-resume-check.sh |
