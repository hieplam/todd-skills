# Loops applied to todd-skills — improvement roadmap

**Date:** 2026-07-07 · **Status:** proposed (roadmap, not yet actioned) · **Scope:**
`plugins/tribe/`, `plugins/check-diff-coverage/`, `plugins/splitting-plans/`,
`plugins/refactor-for-testability/`

Derived 2026-07-07. Raw research (full source list, per-claim verdicts, transcripts) is
persisted in the research repo, not here — this doc carries only the distilled, cited
findings needed to act.

## Provenance

Two inputs, combined:

1. **"Getting started with loops"** — ClaudeDevs blog, July 2026, by @delba_oliveira. Practical
   guidance on `/loop`, `/goal`, `/schedule`: give loops explicit stop conditions, match polling
   interval to how fast the watched thing actually changes, route routine work to smaller/faster
   models and reserve the biggest model for judgment calls, pilot before a large run.
2. **Adversarially-verified deep-research pass** over official Claude Code docs
   (code.claude.com/docs: `goal`, `commands`, `scheduled-tasks`, `routines`, `workflows`, skill
   best practices) plus the blog post above. Method: deep-research workflow, 108 agents, 25
   sources fetched, 103 claims extracted, each claim put through 3-vote adversarial
   verification — 24 confirmed, 1 refuted.

**Refuted claim — do not rely on it:** "verification skills should prescribe browser
automation / screenshot / Core Web Vitals checks" was killed 0–3. The confirmed pattern
instead is **plan → validate → execute**, plus validator-script loops and the
`/run` · `/verify` · `/run-skill-generator` triad. Any item below that talks about
verification means scripted/mechanical checks, not browser checks.

**Drift warning:** several mechanics cited here are version-gated (observed range
v2.1.139–v2.1.202) and `/schedule` + agent-teams are explicitly **research-preview**. Re-verify
exact behavior before hard-coding thresholds or flags into a shipped skill — treat every
number below as "best known value as of 2026-07-07," not a guarantee.

## Priority

Ranked by the owner, not by raw score — items **2, 1, 6, 3** ship first:

- **2** and **1** close real stall/runaway bugs already latent in the tribe (a run can hang
  forever, or churn forever).
- **6** compounds every other item: once an eval harness exists, every later change to these
  skills gets measured instead of asserted.
- **3** is a two-line diff fixing a bug we already fixed once elsewhere and forgot to repeat.

Items 4–10 are enhancements — valuable, not urgent, no known bug behind them.

---

## 1. Cap Warchief's audit loop

**Goal (measurable):** `plugins/tribe/agents/warchief.md` no longer contains an unbounded
"loop fixes until Skinner PASSes" instruction. After exactly 3 Skinner fix-rounds without a
PASS, the Warchief stops looping and returns `NEEDS_DIRECTION` to the Shaman with the last
Skinner FAIL report attached verbatim.

**Why (grounding):** warchief.md:153 currently reads "Loop fixes until it returns PASS" with
no round limit — a runaway loop if Skinner keeps failing for reasons the Warchief can't fix
alone (e.g. a spec ambiguity masquerading as a test failure). The article's core operating
rule is explicit turn caps — "stop after 5 tries" — because loops need a clear, cheap stop
condition, not an implicit trust that things will converge. `check-diff-coverage` already
proves the shape in this repo: max 3 rounds of one remedy + 2 of a fallback remedy, then stop
and hand back rather than "keep grinding past the stopping condition" (its SKILL.md, line 126).
Reuse that exact 3(+escalate) shape here instead of inventing a new one.

**Scope fence (files):** `plugins/tribe/agents/warchief.md` only (the audit-loop section
around line 153 and the report-format section around line 227/258). No change to Skinner's
own behavior or PASS/FAIL semantics.

**Priority:** Ship first (closes a runaway-loop bug).

---

## 2. Define heartbeat staleness threshold

**Goal (measurable):** Every place in the repo that says "stalled mid-milestone → treat as
dead" gets the same concrete number: **no new heartbeat line for 30 minutes while mid-milestone
= dead.** On declaring dead, the Shaman re-dispatches a fresh Warchief pointed at the saved
worktree path, spec path, plan path, and the exact last heartbeat line (not a summary of it).
The same 30-minute threshold closes `splitting-plans`' open question in its own SKILL.md §11
("Stale LOCKED — cook walked out mid-shift," currently phrased as "e.g. older than 30 min" —
make it the committed number, not an example).

**Why (grounding):** `shaman.md:114-116` and `warchief.md:97-101` both describe the
heartbeat-as-liveness-signal mechanism in detail but neither ever defines "stalled" in wall-clock
time — this is the single biggest silent-stall risk in the repo: a live tribe run can wait
indefinitely on a subagent that may already be dead, because there is no threshold that ever
fires. The article's guidance is to "match the interval to how often the thing you're watching
changes" — a Warchief mid-milestone is expected to write a heartbeat line at each named
milestone (spec, plan, task N dispatched, audit, PR, CI, merged), so 30 minutes without one is
well past that cadence for any milestone in the current step list.

**Scope fence (files):** `plugins/tribe/agents/shaman.md` (heartbeat/liveness section,
~lines 111-116 and 289-291), `plugins/tribe/agents/warchief.md` (heartbeat section, ~lines
91-101), `plugins/splitting-plans/skills/splitting-plans/SKILL.md` (§11 stale-LOCKED question,
~line 511). No change to the heartbeat *format* itself — only the threshold and what
re-dispatch grounds from.

**Priority:** Ship first (closes a real stall bug — currently a tribe run has no way to ever
conclude "dead").

---

## 3. Fix Tracker's model routing

**Goal (measurable):** `plugins/tribe/agents/tracker.md` frontmatter `model:` changes from
`opus` to `haiku` or `sonnet` (pick whichever the team's cost/quality bar prefers — either
satisfies the goal). Skinner's `model: inherit` is untouched.

**Why (grounding):** Tracker is a read-only, frequently-run advisory rule-checker — by its own
description "reads every applicable rule source fresh... derives a checklist... reviews the
current diff" — the definition of routine work, not a judgment call. `tracker.md:14` currently
hardcodes `model: opus`, the most expensive tier, which inverts the article's stated principle:
route routine, mechanical work to smaller/faster models and reserve the most capable model for
genuine judgment calls. This exact bug was already found and fixed once in this repo — commit
`9caefb6`, "shaman inherits model from caller instead of hardcoding opus" — but the fix wasn't
swept across the other agents, so Tracker still carries it. Skinner is the actual judgment call
in the tribe (PASS/FAIL adjudication) and correctly stays `model: inherit`.

**Scope fence (files):** `plugins/tribe/agents/tracker.md` frontmatter only — one line.

**Priority:** Ship first (two-line fix, no design risk).

---

## 4. Make Skinner's verdict `/goal`-compatible

**Goal (measurable):** Every Skinner report ends with one machine-judgeable line in a fixed
format, e.g. `AUDIT: PASS — tests exit 0, lint exit 0, 7/7 requirements evidenced` (or `AUDIT:
FAIL — <reason>`). A Warchief run can then be wrapped as `/goal don't stop until Skinner
reports PASS, or stop after 3 audit rounds` and have `/goal`'s evaluator judge it correctly
from the transcript alone.

**Why (grounding):** Verified mechanics from the docs pass: `/goal`'s evaluator (default
Haiku) judges **only the conversation transcript** — it has no tool access and no file access,
so a PASS/FAIL buried in Skinner's prose (current `skinner.md` behavior, e.g. around line 227)
is exactly the kind of judgment call an evaluator with no tools can get wrong. `/goal` also has
**no built-in turn cap** — any cap has to live in the condition text itself (confirmed:
"stop after 3 audit rounds" must be spelled out, it is not a flag). There is a 4000-character
limit on the condition text, which the fixed-format line respects trivially. This item is a
direct enabler for item 1's round cap: the same PASS/FAIL text becomes both Warchief's own stop
signal and `/goal`'s.

**Scope fence (files):** `plugins/tribe/agents/skinner.md` (report-format section) only. No
change to Skinner's actual audit criteria or process — only how it terminates its report.

**Priority:** Enhancement — depends on item 1 landing first for the round-cap wording to
reference.

---

## 5. Replace Warchief's blocking CI-wait with a time-based loop

**Goal (measurable):** `warchief.md`'s "open PR, wait CI green, squash-merge" step no longer
describes manual context-burning polling. It instead names `gh run watch --exit-status` as the
mechanism to block on CI status without spending turns re-checking, matching the pattern
`plugins/research-to-blog/agents/research-to-blog.md` already uses. Where an actual
turn-by-turn loop is warranted (e.g. addressing review comments over several minutes), the doc
names the canonical shape from the article: `/loop 5m check my PR, address review comments, fix
failing CI` — a fixed interval, not `ScheduleWakeup`.

**Why (grounding):** The article's canonical loop example is exactly this PR-babysitting case,
run on a several-minute interval because CI and review comments change on that cadence, not
faster. Research flagged `ScheduleWakeup` as carrying known reliability caveats (non-persistence
across restarts, no cancel-by-ID) — `gh run watch --exit-status` is a plain blocking command
that avoids the scheduling machinery entirely for the common case (wait for one CI run), and is
already proven inside this repo by `research-to-blog`.

**Scope fence (files):** `plugins/tribe/agents/warchief.md` (PR/CI section only, likely near
the SHIPPED-status method steps referenced around line 99). No change to the PR-opening or
squash-merge steps themselves.

**Priority:** Enhancement.

---

## 6. Repo-wide eval harness (skill-creator pattern)

**Goal (measurable):** At least the following skills gain an `evals/evals.json` in the shape
already used by `refactor-for-testability`, plus a runner script that actually executes them:
`plugins/tribe/` (per-agent or per-contract cases), `check-diff-coverage`, and
`splitting-plans` (most complex, least tested of the three — priority target). A repo-level
runner drives each eval's test case in an isolated subagent (clean context), records
tokens + duration, writes a `grading.json` (pass/fail + evidence per case), and a
`benchmark.json` comparing with-skill vs. without-skill behavior — mirroring the official
skill-creator eval loop, not inventing a new one.

**Why (grounding):** `refactor-for-testability/evals/evals.json` already exists in this repo
with 3 well-formed cases (critical-change-in-untestable-code, trivial-change-in-untestable-code,
feature-add-with-tight-coupling) — but nothing in the repo executes it; there is no runner. The
official, measurable loop confirmed in research is: evals.json cases → isolated-subagent run
(clean context, tokens + duration recorded) → grading.json with evidence → benchmark.json
with/without-skill comparison → blind A/B before committing skill edits, plus automated
trigger-description tuning. Right now this repo ships loop machinery (tribe's audit loop,
check-diff-coverage's remediation loop, splitting-plans' dependency-wave planning) with zero
loop testing any of it — every change to these skills is asserted correct, never measured.

**Scope fence (files):** New `evals/evals.json` under each of
`plugins/tribe/`, `plugins/check-diff-coverage/skills/check-diff-coverage/`,
`plugins/splitting-plans/skills/splitting-plans/`; one new repo-level runner script (exact
location TBD at implementation — natural home is a shared `scripts/` or a
`skill-creator`-invoked path, decide during planning, not here). No change to any skill's
runtime behavior — evals observe, they don't alter.

**Priority:** Ship first (highest leverage — everything else in this roadmap becomes
measurable once this lands, instead of trusted on prose).

---

## 7. Deterministic validator scripts over prose checklists

**Goal (measurable):** Three new scripts land, each replacing a prose checklist with a script
whose *output* (not source) enters context:

- `plugins/tribe/scripts/heartbeat-check.sh` — implements item 2's 30-minute staleness rule
  mechanically (given a report-file path, prints `alive` / `stale` + the last heartbeat line).
- `plugins/splitting-plans/skills/splitting-plans/scripts/validate-locks.sh` — checks
  frontmatter `status`/`locked_by`/`locked_at`/`owns_files` consistency across all sub-plan
  bundles (the AVAILABLE → LOCKED → DONE/BLOCKED gate is currently enforced entirely in prose
  per SKILL.md's Cook Protocol section).
- A plan validator for Warchief's plan step, following the official plan-validate-execute
  pattern (plan → run a validator → only then execute).

**Why (grounding):** Verified best practice from the docs pass: pre-made scripts beat
re-derived reasoning on every repeat run — cheaper (no re-deriving the check each time),
consistent (same check, same answer), and the script's source code never has to enter context,
only its output does. `check-diff-coverage/skills/check-diff-coverage/scripts/measure.sh` is
already the working exemplar in this repo — it prints a JSON summary on stdout and nothing
else, exit code 0 regardless of pass/fail (2 only on setup error), which is exactly the
contract the three new scripts above should copy.

**Scope fence (files):** New files only —
`plugins/tribe/scripts/heartbeat-check.sh`,
`plugins/splitting-plans/skills/splitting-plans/scripts/validate-locks.sh`, and one new
plan-validator script location TBD at implementation. Referencing edits to
`shaman.md`/`warchief.md`/`splitting-plans/SKILL.md` to invoke the new scripts, but no change
to the underlying gate semantics (status vocabulary, lock rules) they check.

**Reachability note (resolved in-fence, round-2 fix — supersedes the round-3 "scope amendment"
that briefly lived here):** `validate-locks.sh` lives under
`splitting-plans/skills/splitting-plans/scripts/`, an existing *real* skill (has a SKILL.md), so
it's already reachable via `install.sh`'s existing skills-symlink support with no installer
change. `heartbeat-check.sh` and `validate-plan.sh` are fixed by this card to a bare
`plugins/tribe/scripts/` path — `tribe` has no `skills/` directory, so there's no
symlink-the-whole-plugin mechanism for it. A prior round patched this by adding a `scripts`
component type to root `install.sh` and a second symlinking job to `plugins/tribe/install.sh` —
that touched files outside this card's scope fence and was never ratified by a card/spec owner,
so it was reverted. The actual fix needs no installer change at all: `install.sh` already
symlinks each `agents/*.md` file individually (e.g. `~/.claude/agents/warchief.md` ->
`<repo>/plugins/tribe/agents/warchief.md`), so an agent can resolve its own real (repo) path
with `readlink -f` and derive the sibling `scripts/` directory from it —
`dir="$(dirname "$(dirname "$(readlink -f ~/.claude/agents/warchief.md)")")/scripts"` — entirely
at invocation time, in the agent's own instructions, with zero installer involvement. Verified by
symlinking `tribe`'s agents into a scratch `CLAUDE_DIR` and confirming the derived path lands on
`plugins/tribe/scripts/{heartbeat-check.sh,validate-plan.sh}` regardless of the agent's cwd.
`shaman.md` and `warchief.md` now use this derivation instead of a hardcoded
`~/.claude/scripts/tribe/...` path.

**Priority:** Enhancement — depends on item 2 for the heartbeat threshold it encodes.

---

## 8. Encode Definition-of-Done as a verification skill

**Goal (measurable):** A new small skill, `verify-shipped`, runs four mechanical checks and
reports pass/fail on each: PR state == `merged`, merge strategy == `squash`, local `master` ==
`origin/master` (no divergence), worktree removed. Shaman's "verify SHIPPED from evidence only"
step becomes one script invocation instead of trusting Warchief's prose report.

**Why (grounding):** The owner's global CLAUDE.md already defines "done" precisely — "PR
squash-merged and ready to work on new feature with LATEST CHANGES" — but nothing in the repo
checks it mechanically today; `SHIPPED` is currently just a status string a Warchief asserts.
This is the same plan-validate-execute pattern confirmed elsewhere in research (validate before
trusting a claimed end-state), applied to the one end-state every tribe run is supposed to
reach.

**Scope fence (files):** New skill directory (e.g.
`plugins/verify-shipped/skills/verify-shipped/`) with `SKILL.md` + a validator script. Edit to
`plugins/tribe/agents/shaman.md`'s SHIPPED-verification step to call it. No change to the
SHIPPED/NEEDS_DIRECTION/BLOCKED vocabulary itself.

**Priority:** Enhancement — independent of the others; can land anytime after item 7
establishes the validator-script convention.

---

## 9. Tribe as a proactive loop (campaign routine) — optional mode

**Goal (measurable):** A documented, opt-in path exists for running "Shaman: run the next
roadmap idea" unattended via `/schedule` (cloud routine) or `/loop` (local), wrapped in
`/goal ... until verified-SHIPPED or NEEDS_DIRECTION`. Gated explicitly: piloted on exactly one
idea card end-to-end before any batch run is attempted.

**Why (grounding):** Shaman Mode 2 ("run the campaign," `shaman.md`) is already conceptually a
proactive loop, just with a manual trigger today ("do the next idea"). Two mechanics confirmed
in research make full automation viable: skill/agent frontmatter `disallowed-tools` can strip
`AskUserQuestion` for unattended fires (so an automated run never blocks on a prompt no one will
answer), and subagents inherit the lead's permission mode at spawn time (so a routine's
permission posture propagates correctly down the chain). Both `/schedule` and agent-teams are
explicitly research-preview — the article's own guidance is to pilot before a large run, which
here means one idea card, observed end-to-end, before ever batching.

**Scope fence (files):** Documentation-only addition to `plugins/tribe/agents/shaman.md` (Mode
2 section) describing the optional proactive-loop wiring and its pilot gate. No new runtime
code, no default-on behavior change — this is an opt-in mode the owner invokes explicitly.

**Priority:** Enhancement — explicitly gated behind a single-card pilot; do not scale to batch
runs until that pilot is observed and reported.

---

## 10. Dynamic-workflow orchestration for independent Hunter tasks + nesting smoke test

**Goal (measurable):** For a plan with 2+ dependency-independent sub-plans (as
`splitting-plans` already computes via dependency waves + `owns_files`), the Warchief can
dispatch one Hunter per sub-plan concurrently, each in its own isolated git worktree, with
mechanical/small tasks routed to a smaller model and the Skinner judgment call kept on the
biggest model in a separate context (already true today — Skinner is `model: inherit`,
unchanged). **Prerequisite, must complete first:** run the smoke test that
`2026-07-05-tribe-role-contracts-design.md`'s Risks section explicitly deferred — Shaman →
Warchief → Hunter is two levels of `Task` nesting and has never been verified to work; only
Warchief → Hunter (one level) is proven in this repo.

**Why (grounding):** `splitting-plans` already produces exactly the artifact a Workflow script
consumes — dependency waves and non-overlapping `owns_files` per sub-plan — so concurrent
Hunter dispatch in isolated worktrees is a natural fit, and isolated-worktree-per-parallel-agent
is a verified-safe pattern (confirmed in research: use worktree isolation only when agents
mutate files concurrently and would otherwise conflict — which is precisely this case). Routing
mechanical per-task work to a smaller model while keeping the judgment call on the biggest model
in its own context is the same anti-self-preferential-bias pattern already implemented for
Skinner. But the design doc that introduced the Shaman/Warchief/Hunter chain flagged the
two-level nesting depth as unproven and deferred its smoke test — "Smoke-test after landing" —
and there is no record in this repo of that test having run. Building parallel orchestration on
top of an unverified nesting depth would compound an unknown risk instead of retiring it.

**Scope fence (files):** No file changes until the prerequisite smoke test is run and its
result recorded (append the result to
`docs/superpowers/specs/2026-07-05-tribe-role-contracts-design.md`'s Risks section, or a new
dated spec if the result changes the design). Only after that: `plugins/tribe/agents/warchief.md`
(dispatch-step changes to fan out Hunters concurrently) and any new Workflow script this
requires.

**Priority:** Enhancement — hard-blocked on its own prerequisite; do not schedule
implementation work here until the nesting smoke test has run and passed.
