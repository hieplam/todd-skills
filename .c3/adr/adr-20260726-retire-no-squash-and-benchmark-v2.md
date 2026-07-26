---
id: adr-20260726-retire-no-squash-and-benchmark-v2
c3-seal: ab5bea3c0012e76595c9d40e72ee299b813e0eeaa70517729a826f4c6ceec0cb
title: retire-no-squash-and-benchmark-v2
type: adr
goal: 'Retire the no-squash-merge rule from every live enforcing surface in this repo — the owner has ruled (2026-07-26) that merge shape is an implementation detail with no bearing on their goal ("miễn là PR được merge"): prompts should carry guidance and goals, not enforce implementation details other than anti-goals. Simultaneously, make the tribe prompt benchmark a valid baseline instrument: fix the two remaining measurement defects (grader truncation fail-closed as FAIL; executor model ignoring agent frontmatter) and repair the four invalid eval cases (19, 26, 27, 32) plus write the case-12 remedy into warchief.md — so that a 3-run baseline v2 can be recorded that `compare.py`''s CONFIRMED tripwire can actually fire against.'
status: accepted
date: "2026-07-26"
---

## Goal

Retire the no-squash-merge rule from every live enforcing surface in this repo — the owner has ruled (2026-07-26) that merge shape is an implementation detail with no bearing on their goal ("miễn là PR được merge"): prompts should carry guidance and goals, not enforce implementation details other than anti-goals. Simultaneously, make the tribe prompt benchmark a valid baseline instrument: fix the two remaining measurement defects (grader truncation fail-closed as FAIL; executor model ignoring agent frontmatter) and repair the four invalid eval cases (19, 26, 27, 32) plus write the case-12 remedy into warchief.md — so that a 3-run baseline v2 can be recorded that `compare.py`'s CONFIRMED tripwire can actually fire against.

## Context

The no-squash rule ("merge commit must have exactly 2 parents") is stated in the owner's global CLAUDE.md history and implemented independently in: `plugins/verify-shipped/skills/verify-shipped/scripts/verify-shipped.sh` (check 2, lines 94-115), the campaign runner's `plugins/tribe/scripts/runner/core/verify.ts` (D3 point 2, `mergeCommitTwoParents`) with tests asserting it, `core/brief-template.md` ("NEVER squash" in every Warchief brief), `core/loop/card-actions.ts:164`, `plugins/tribe/skills/orchestrate-campaign/SKILL.md` (wall W4), eval case 26 in `plugins/tribe/evals/evals.json`, and C3 entities `rule-no-squash-merge`, `c3-215`, `c3-217`. The owner already hand-removed the rule from `warchief.md`/`shaman.md` prose (commit d3eee74), leaving prompt text and mechanical checks in contradiction: a squash-merged PR would still FAIL verify-shipped and wedge the campaign runner.

On the benchmark side, the committed baseline `scripts/evals/baselines/2026-07-25-sonnet/benchmark.json` was recorded with `runs_per_configuration: 1`, while `compare.py:123` requires ≥2 runs per side before recording CONFIRMED — so the committed baseline can never trip the regression gate. `run_evals.py:398-402` converts a truncated grader reply into `passed: False` (a harness failure scored as an agent failure). The harness passes one global `--exec-model` and ignores agent frontmatter (`warchief.md` declares `model: opus`, `scout.md` `opus`; the baseline measured everything on sonnet). Cases 27 and 32 were proven test-design errors (the agent behaved per charter), case 19 is too underspecified to grade, and case 26 now tests the retired no-squash rule.

## Decision

Two arms, one work order, ratified by the owner in session on 2026-07-26:

**(a) Retire no-squash everywhere it is live.** Delete verify-shipped's check 2 (the skill drops to 3 checks; `merge_strategy_no_squash` leaves the JSON contract), delete the runner's `mergeCommitTwoParents` point from `verify.ts` and its test assertions, delete "NEVER squash" language from `brief-template.md` / `card-actions.ts` / orchestrate-campaign's W4 wall, reword eval case 26's rubric to merge-shape-agnostic, and in C3: retire `rule-no-squash-merge`, patch `c3-215` and `c3-217` text and un-wire their `uses:` edges to the rule. The runner and agents keep `gh pr merge --merge` as their default *behavior* (unchanged operational choice), but nothing verifies or forbids any merge shape anymore: Definition of Done is "PR merged, CI green, evidence attached".

**(b) Make the benchmark a valid instrument.** In `run_evals.py`: add an `UNGRADED` grading state (grader failed/truncated ≠ agent FAIL; excluded from pass-rate denominators), and resolve each case's executor model from the subject agent's frontmatter `model:` key by default (`inherit` → harness default; explicit `--exec-model` still overrides all). In `plugins/tribe/evals/evals.json`: rewrite case 27 (drop the contaminating "correct, working / the logic is right" narrative; supply a real diff), rewrite case 32 in the no-tools decision-exercise framing case 16 already uses (its premise cannot be materialized on a machine whose real `~/.claude` resolves the script), rewrite case 19 with the context its rubric demands (state file fixture, report path, both reports), reword case 26 per arm (a). In `warchief.md` Law 2: add the explicit remedy for the discovered-mid-violation state (one reviewer's report already read before the second was dispatched → set that round's report aside and re-dispatch a fresh concurrent pair). After this lands: record baseline v2 with `--runs 3` on production models and commit it as the new comparison root (follow-up execution of this same ADR).

## Affected Topology

| Entity | Type | Why affected | Evidence | Governance review |
| --- | --- | --- | --- | --- |
| c3-215 | component | Its goal/Business Flow/Governance text asserts "regular-merged (2-parent, never squashed)" outcomes and cites rule-no-squash-merge; runner code + brief templates + evals it owns change | c3-215#n892@v1:sha256:f467fd1ec102c55b693524d1b29fda35cba5ac48b31be638a9f6a38cc5b3aef8 "Deliver features through a 5-agent chain of command — Shaman (What/Why) → Warchief (How) → Hunter (TDD execution), gated by Tracker (rules review) and Ski" | Block patches in this unit update Goal, Business Flow, Governance, Change Safety; uses: edge to the rule un-wired by frontmatter patch |
| c3-217 | component | Exists as "four git/GitHub checks" including merge_strategy_no_squash; drops to three checks | c3-217#n1000@v1:sha256:a38f33ab7fed9c33aeb847b0ef938d4075f6752cdf40d3fe4edc787c6cc2140f "Mechanically verify a SHIPPED claim against the owner's Definition of Done: PR merged, a regular 2-parent merge (never squashed), local master in sync with orig" | Block patches update Goal, Purpose, Business Flow, Governance, Derived Materials; uses: edge un-wired |
| c3-301 | component | run_evals.py gains the UNGRADED grading state and per-agent frontmatter model resolution | c3-301#n1058@v1:sha256:1e2eb86791640d972d66231acb66c7709dd53074b94011a4ce9e6643d861cf16 "Execute every evals/evals.json fixture in isolated claude -p subprocesses and grade the transcripts into with/without-skill benchmarks." | No block contradiction — behavior refinement inside stated goal; Parent Delta: none (c3-3 container boundary unchanged) |

## Compliance Refs

| Ref | Why required | Evidence | Action |
| --- | --- | --- | --- |
| ref-evals-fixture | Case rewrites (19, 26, 27, 32) must keep the documented evals.json shape incl. files fixtures and prose rubrics | ref-evals-fixture#n1121@v1:sha256:c23a84b81f00e3a094fb16cab6d52f6c8af6d50c853d2e32e6f532796c2d0047 "From plugins/tribe/evals/evals.json shape (documented in scripts/evals/README.md):" | comply |

## Compliance Rules

| Rule | Why required | Evidence | Action |
| --- | --- | --- | --- |
| rule-no-squash-merge | This ADR removes the constraint it encodes; its own Override section requires exactly this: an owner ruling first, then one change-unit updating the rule plus every implementation in its Scope together | rule-no-squash-merge#n1186@v1:sha256:0bb07ade7df6f4da874a109b169be3696d56b31517cdcf08979ad1b709c3152a "There is no in-repo override: the owner's rule is marked non-negotiable, and the runner's check" | update-rule (retire) |
| rule-bash-strict-mode | verify-shipped.sh keeps its strict-mode preamble through the check-2 deletion | rule-bash-strict-mode#n1136@v1:sha256:7a8c286269da63a2ba7b7362b72631a2491addb28a1a4266304605106dbaba9a "All shell scripts start with #!/usr/bin/env bash followed by set -euo pipefail." | comply |

## Work Breakdown

| Area | Detail | Evidence |
| --- | --- | --- |
| verify-shipped plugin | Delete check 2 from scripts/verify-shipped.sh (lines 5-12 header, 94-115 check, 182 JSON row); SKILL.md 4→3 checks; plugin.json description drops "regular (non-squash) merge" | grep sweep 2026-07-26 in session |
| campaign runner | verify.ts: remove mergeCommitTwoParents point; verify.test.ts: remove/replace point-2 describe block; brief-template.md + brief.test.ts: drop "NEVER squash" lines; github.ts comment reword; github.test.ts: drop never-squash assertions (keep --merge call-shape assertions); core/loop/card-actions.ts:164 reword; README.md:531 "all six pass" recount | grep sweep 2026-07-26 |
| orchestrate-campaign | SKILL.md: remove wall W4 (no squash) and the §81 "never squash" line | plugins/tribe/skills/orchestrate-campaign/SKILL.md:81,340 |
| tribe evals | evals.json: rewrite cases 19, 26, 27, 32 per Decision (b) | plugins/tribe/evals/evals.json:159,215,222,262 |
| warchief prompt | Law 2: add discovered-mid-violation remedy sentence | plugins/tribe/agents/warchief.md:555-563 |
| eval harness | run_evals.py: UNGRADED state in grade() + result rollup; per-agent frontmatter model resolution; scripts/evals/README.md documents both | scripts/evals/run_evals.py:398-402,409-412,669 |
| C3 | Patches: retire rule-no-squash-merge; c3-215 Goal/Business Flow/Governance/Change Safety blocks + uses; c3-217 Goal/Purpose/Business Flow/Governance/Derived Materials blocks + uses | this change-unit's patch files |
| baseline v2 | After merge: run_evals.py --runs 3, production models, commit under scripts/evals/baselines/ | phase-2 execution of this ADR |

## Underlay C3 Changes

| Underlay area | Exact C3 change | Verification evidence |
| --- | --- | --- |
| N.A - no c3x CLI surface touched | N.A - this repo consumes the packaged c3x; no commands, validators, schemas, or templates of the CLI change | N.A - c3 check green post-apply is the only C3-facing proof |

## Enforcement Surfaces

| Surface | Behavior | Evidence |
| --- | --- | --- |
| runner test suite | cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit green with point-2 removed | c3-215 §Change Safety runner row mandates exactly this |
| verify-shipped.sh live run | Against merged PR #54: verdict PASS with exactly 3 checks in output | script's own JSON output |
| eval harness dry-run | run_evals.py --evals plugins/tribe/evals/evals.json --dry-run lists 34 cases post-rewrite | runner's dry-run output |
| grader-truncation probe | Feeding grade() a truncated JSON yields UNGRADED, not passed:False | python -c unit probe in Verification |
| compare.py tripwire | Baseline v2 (3 runs) makes len(b) >= 2 satisfiable → CONFIRMED reachable | compare.py:123 |
| c3 check | Green after change apply | CLI output |

## Alternatives Considered

| Alternative | Rejected because |
| --- | --- |
| Keep the script/runner checks as the sole (silent) enforcement of no-squash, only trim prose | Owner explicitly ruled merge shape irrelevant to their goal; a check that fails a permitted merge shape wedges the campaign runner on every squash — enforcement contradicting the ruling is a bug, not a backstop |
| Downgrade check 2 to a warning | A warning nobody gates on is noise in a mechanical verdict table; the skill's value is binary trust |
| Keep baseline on sonnet for cost | It measures a model the production warchief (frontmatter model: opus) never runs; regression conclusions would not transfer — owner ratified production-model baseline with --exec-model retained as the cost-override |
| Drop case 32 instead of rewriting | The stop-rule it guards (never invoke a nonexistent path, never hand-roll substitute validation) is real; case 16's no-tools framing makes the premise materializable without sandboxing HOME |

## Risks

| Risk | Mitigation | Verification |
| --- | --- | --- |
| Consumers parsing verify-shipped's 4-key JSON break on 3 keys | The only in-repo consumers are SKILL.md prose and the runner's own verify.ts (independent implementation, updated in the same unit); external callers read the verdict line | grep for merge_strategy_no_squash returns zero hits post-change |
| UNGRADED changes benchmark.json semantics for compare.py | UNGRADED runs excluded from pass/total; compare.py sees unchanged pass-rate fields | grader-truncation probe + a --dry-run and single-case smoke run |
| Squash merges now land with 1-parent history | Accepted by owner ruling — Definition of Done is "PR merged"; no capability depends on parent count after this unit | grep sweep shows no remaining parent-count assertion outside docs history |
| Per-agent opus execution raises baseline cost | --exec-model still overrides globally for smoke passes; only baseline v2 runs on production models | run_evals.py flag precedence test in code review |

## Verification

| Check | Result |
| --- | --- |
| cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit | pending |
| bash plugins/verify-shipped/skills/verify-shipped/scripts/verify-shipped.sh against PR #54 → PASS, 3 checks | pending |
| scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json --dry-run lists 34 cases | pending |
| python3 -c probe: truncated grader text → {"status": "UNGRADED"} not passed: False | pending |
| grep -rn "squash | PARENT_COUNT |
| c3 check after c3 change apply | pending |
