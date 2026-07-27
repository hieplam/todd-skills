# CU-2 — Tracker Harness-Gap Detection — Implementation Plan

> **For agentic workers:** This plan is executed via the **tribe workflow** (one implementer per task, strict TDD, audit before PR). Steps use checkbox (`- [ ]`) syntax for tracking. Spec: `docs/superpowers/specs/2026-07-27-tribe-harness-gap-detection-design.md` — read it first; it is the requirement contract. Every task below is **stateless**: the spec plus this plan carry all needed context; no task depends on chat history or on another task's session.

**Goal:** Tracker detects harness gaps (unwritten conventions in defect-prone categories, spec §1) and reports them read-only (spec §2); a deterministic bun script owns gap identity via an append-only registry (spec §3); precision is a computed metric (spec §4). Delivered as one PR — **created and tests green, never merged by any agent** (merging is owner-only for this campaign).

**Architecture:** Two pure TypeScript scripts under a new `plugins/tribe/scripts/gaps/` module (runner conventions: bun + tsc, zero runtime deps) + prompt edits to two agent definitions + three new eval cases + C3 change-unit committed as a work order.

**Tech Stack:** bun + TypeScript for `scripts/gaps/`; markdown agent prompts; JSON eval fixtures.

## Global Constraints

- **Implementer:** dispatch each implementation/fix task to the `hunter` subagent — never a generic implementer.
- **TDD non-negotiable:** every code task writes the failing test first, watches it fail, then implements.
- **Registry is script-written only (spec §3):** no agent, prompt instruction, or task may edit `.tribe/harness-gaps.jsonl` by hand — `gap-reconcile.ts` is the sole writer. Any prompt text authored in Tasks 3–4 must state this.
- **Boundary sentence (spec §Non-negotiable) is verbatim-load-bearing:** conventions inform verification and context; only written rules and correctness bugs produce violations. A harness gap is never a Blocker.
- **Frozen thresholds (spec §1, §2, §4):** prevalence floor ≥ 3 files; cap ≤ 3 gaps per review; precision target ≥ 50% over trailing 20 ruled gaps. These are owner-ratified; no task may adjust them.
- **Check command:** `cd plugins/tribe/scripts/gaps && bun test && bunx tsc --noEmit` — green after every code task.
- **Stack-agnostic rule binds these files:** `rule-stack-agnostic-agent-prompts` (added by PR #57) — no language names, toolchain commands, or stack-specific extensions in agent prompts except explicitly-labeled illustrations.
- **Commits:** conventional style, one logical change each. Branch `cu2-harness-gap-detection` (worktree `.claude/worktrees/cu2-spec`) — the spec and this plan already sit on it; implementation continues on the same branch. **Regular merge only, never squash — and no agent merges at all: the card's done-state is PR open + checks green.**
- **C3 ceremony (Task 6):** author ADR + patches, commit as work order, **defer `c3 change apply`** (known c3x v11.0.0 defect); run `git status && git diff -- .c3/` after every `c3 add` and revert any stray corruption before committing.
- Repo rule (`CLAUDE.md`): if anything new needs install-time linking, update `install.sh` — expected outcome: no change (`scripts/gaps/` is repo-invoked like the runner); Task 7 verifies and records this explicitly.

## File Structure (locked decomposition)

```
plugins/tribe/scripts/gaps/          NEW  (whole directory; mirror runner's zero-dep setup)
  package.json, tsconfig.json        NEW  copy shape from scripts/runner (no runtime deps)
  ledger.ts                          NEW  pure: event types (discriminated union), fold to
                                          per-id status, next-id minting, append serialization
  ledger.test.ts                     NEW
  gap-reconcile.ts                   NEW  CLI: --registry --changed-files --candidates;
                                          fingerprint validation + execution via Bun.spawn
  gap-reconcile.test.ts              NEW  the nine spec §6a scenarios
  gap-precision.ts                   NEW  CLI: --registry [--window 20]; overall + per-category
  gap-precision.test.ts              NEW
plugins/tribe/agents/tracker.md      MOD  detection duty (spec §1) + report section (spec §2)
plugins/tribe/agents/warchief.md     MOD  invoke-script duty + PR-body sink (spec §3)
plugins/tribe/evals/evals.json       MOD  three new cases (spec §6b)
plugins/tribe/README.md              MOD  Tracker/Warchief blurbs mention gap detection
plugins/tribe/claude-md/review-agents.md  MOD  same, condensed
.c3/adr/ + .c3/changes/<adr-id>/     NEW  Task 6 work order (patches to c3-215)
```

---

### Task 1: Ledger pure module (`ledger.ts`)

**Files:**
- Create: `plugins/tribe/scripts/gaps/package.json`, `plugins/tribe/scripts/gaps/tsconfig.json` (mirror `plugins/tribe/scripts/runner/` shape, zero runtime deps)
- Create: `plugins/tribe/scripts/gaps/ledger.ts`
- Create: `plugins/tribe/scripts/gaps/ledger.test.ts`

**Steps:**
- [x] Write failing tests for the event schema and fold logic per spec §3: event lines are `opened` (id, category, paths, fingerprint, hits_at_detection, first_seen_pr) · `seen` (id, pr, hits_now) · `ruled` (id, disposition ∈ rule | anti-rule | debt | dismissed | dismissed-duplicate, ref). Fold: latest event per id defines status. Minting: next id = `G-` + zero-padded(max existing numeric + 1), counting ALL ids including ruled ones. Serialization: one compact JSON object per line, newline-terminated.

```bash
cd plugins/tribe/scripts/gaps && bun test ledger.test.ts
```

  Expected: tests fail (module not yet implemented).
- [x] Implement `ledger.ts` as a pure module — no `fs`, no `child_process` imports (parsing/folding/minting only; IO lives in the CLI files).
- [x] Run the check command.

```bash
cd plugins/tribe/scripts/gaps && bun test && bunx tsc --noEmit
```

  Expected: all ledger tests pass, types clean.
- [x] **Step 4: Commit** — `feat(tribe): gaps ledger module — typed events, fold, minting`

### Task 2: Reconciliation CLI (`gap-reconcile.ts`)

**Files:**
- Create: `plugins/tribe/scripts/gaps/gap-reconcile.ts`
- Create: `plugins/tribe/scripts/gaps/gap-reconcile.test.ts`

**Steps:**
- [x] Write failing tests covering ALL nine spec §6a scenarios, using a temp-dir fixture registry and fixture repo tree per test. Scenario 3 (same gap, different prose/regex → matches via stored fingerprint) and scenario 7 (append-only: pre-existing ledger bytes unchanged after every operation — compare full file prefix byte-for-byte) are the load-bearing ones. Scenario 9: a fingerprint that is not a single `grep` invocation, or contains any of `; | & $ ( ) > < \` `, is rejected with a flagged report line and **never executed**.

```bash
cd plugins/tribe/scripts/gaps && bun test gap-reconcile.test.ts
```

  Expected: nine failing tests.
- [x] Implement the CLI per spec §3: `bun gap-reconcile.ts --registry <path> --changed-files <comma-list> --candidates <json-file>`. Candidates file: JSON array of `{category, paths, fingerprint, hits, description}`. Algorithm: filter OPEN entries by path overlap with changed files → validate + execute each stored fingerprint restricted to changed files (`Bun.spawn`, no shell) → fires ⇒ append `seen`; unmatched candidates ⇒ mint id + append `opened`; latest-event `ruled` ⇒ suppressed. Output (stdout, JSON): `{matched: [], minted: [], suppressed_count, flagged: []}`.
- [x] Run the check command.

```bash
cd plugins/tribe/scripts/gaps && bun test && bunx tsc --noEmit
```

  Expected: all nine scenarios pass, types clean.
- [x] **Step 4: Commit** — `feat(tribe): gap-reconcile CLI — deterministic identity, sole registry writer`

### Task 3: Precision CLI (`gap-precision.ts`)

**Files:**
- Create: `plugins/tribe/scripts/gaps/gap-precision.ts`
- Create: `plugins/tribe/scripts/gaps/gap-precision.test.ts`

**Steps:**
- [ ] Write failing tests per spec §4 and §6a: within the trailing window (default 20) of `ruled` gaps ordered by ledger position, precision = ruled(rule ∪ anti-rule ∪ debt) ÷ ruled(all), with `dismissed-duplicate` excluded from both sides; still-open gaps never enter the ratio; per-category breakdown emitted alongside the overall number.

```bash
cd plugins/tribe/scripts/gaps && bun test gap-precision.test.ts
```

  Expected: failing tests.
- [ ] Implement `bun gap-precision.ts --registry <path> [--window 20]` reusing `ledger.ts` for parsing/folding. Output (stdout, JSON): `{window, ruled_considered, precision, per_category: {}}`.
- [ ] Run the check command.

```bash
cd plugins/tribe/scripts/gaps && bun test && bunx tsc --noEmit
```

  Expected: full suite green, types clean.
- [ ] **Step 4: Commit** — `feat(tribe): gap-precision CLI — computed metric, never claimed`

### Task 4: Tracker prompt — detection duty + report section

**Files:**
- Modify: `plugins/tribe/agents/tracker.md`

**Steps:**
- [ ] Add the detection duty to the operating procedure (after the existing review step): report a candidate gap only when ALL four spec §1 conditions hold (diff-anchored; one of the five risk categories — error handling, concurrency/async, resource cleanup, input validation/security, test presence; prevalence ≥ 3 files verified by a quoted grep; no written rule covers it). State explicitly that naming/layout/style can never be a gap.
- [ ] Add the report section template per spec §2 verbatim structure: `### Harness gaps` heading with the decision menu, per-gap fields (Pattern / Category / Evidence with grep + hit count / Diff link / mandatory `Not judged` line), cap ≤ 3 with the `+N more suppressed` line. Tracker emits candidates only — no `G-NNN` ids, no registry access (it stays read-only and stateless).
- [ ] Add the boundary sentence to Principles: conventions inform verification and context; only written rules and correctness bugs produce violations — a harness gap is never a Blocker/Should-fix/Optional finding.
- [ ] Verify no stack-specific terms were introduced and the existing report format/severity ladder is untouched.

```bash
grep -niE 'c#|dotnet|npm |pytest|cargo ' plugins/tribe/agents/tracker.md; grep -c "Not judged" plugins/tribe/agents/tracker.md
```

  Expected: no stack-term hits; `Not judged` count ≥ 1.
- [ ] **Step 5: Commit** — `feat(tribe): tracker detects harness gaps — report-only, never judged`

### Task 5: Warchief prompt + eval cases + derived materials

**Files:**
- Modify: `plugins/tribe/agents/warchief.md`
- Modify: `plugins/tribe/evals/evals.json`
- Modify: `plugins/tribe/README.md`, `plugins/tribe/claude-md/review-agents.md`

**Steps:**
- [ ] Add the Warchief duty per spec §3: on a Tracker report containing harness gaps — (a) extract candidates into the structured JSON file, (b) invoke `gap-reconcile.ts` (resolved from the plugin root, never the shell cwd), (c) carry the script's output into the PR description under a `## Harness gaps` heading. State verbatim: Warchief never edits `.tribe/harness-gaps.jsonl` directly, never mints or matches ids by judgment.
- [ ] Append the three spec §6b eval cases to `plugins/tribe/evals/evals.json` following the existing fixture shape (kind "agent", per-case `agent` field, prompt + expected_output): `tracker-reports-followed-bad-pattern-as-gap-not-violation`, `tracker-does-not-report-style-taste-as-gap`, `warchief-reconciles-via-script-never-by-hand`. Use stack-neutral scenario content.
- [ ] Update the Tracker/Warchief blurbs in `plugins/tribe/README.md` and `plugins/tribe/claude-md/review-agents.md` to mention gap detection (derived-materials obligation, c3-215).
- [ ] Validate the fixture parses.

```bash
python3 -c "import json; d=json.load(open('plugins/tribe/evals/evals.json')); print(len(d['cases']) if isinstance(d, dict) and 'cases' in d else 'inspect-shape-ok')"
```

  Expected: valid JSON, three more cases than before the task.
- [ ] **Step 5: Commit** — `feat(tribe): warchief reconciles via script; gap eval cases; derived docs`

### Task 6: C3 change-unit (work order)

**Files:**
- Create: `.c3/adr/` ADR for this change-unit; patches under `.c3/changes/<adr-id>/`

**Steps:**
- [ ] Define the `c3` handle and author the ADR to its canvas: `c3 schema adr` first (read REJECT IF), then `c3 add adr` with slug `harness-gap-detection`, body via `--file`.

```bash
c3() { C3X_MODE=agent bash /Users/home/.claude/plugins/cache/c3-skill-marketplace/c3-skill/11.0.0/skills/c3/bin/c3x.sh "$@"; }
c3 schema adr
```

  Expected: ADR canvas contract rendered; ADR created without check errors.
- [ ] Immediately audit for the recorded `c3 add` corruption side effect and revert any stray changes.

```bash
git status --short -- .c3/ && git diff --stat -- .c3/
```

  Expected: only the new ADR file appears; anything else is reverted with `git checkout -- <path>` before proceeding.
- [ ] Author patches in `.c3/changes/<adr-id>/` against c3-215 (base anchors via `c3 read c3-215 --section <name> --cite`): Contract section gains the gap-report flow + registry surface (`scripts/gaps/gap-reconcile.ts`, script-only writes, `.tribe/harness-gaps.jsonl` in target repos); Business Flow gains the ruling loop (gap → rule / anti-rule / debt / dismissed). Commit patches as the work order; **do not run `c3 change apply`** (known c3x v11.0.0 defect — patches land when the CLI is fixed).
- [ ] **Step 4: Commit** — `docs(c3): ADR + change-unit patches for harness-gap detection (work order, apply deferred)`

### Task 7: Final verification + PR

**Files:**
- Verify only (no source edits expected): `install.sh`, full branch state

**Steps:**
- [ ] Confirm `install.sh` needs no change: `scripts/gaps/` is repo-invoked like the runner, not installed. Record the check's outcome in the PR body.

```bash
grep -n "scripts" install.sh | head; ls plugins/tribe/scripts/gaps/
```

  Expected: install.sh walks `agents|skills|claude-md|hooks|.claude-plugin` only — no change needed.
- [ ] Run the full verification battery from spec §Verification.

```bash
cd plugins/tribe/scripts/gaps && bun test && bunx tsc --noEmit && cd ../../../.. && python3 scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json --eval-id 5,29 --mode with_skill --exec-model sonnet --grader-model sonnet
```

  Expected: bun suite green, types clean, eval cases 5 and 29 PASS; then run the three new cases by their assigned ids the same way — PASS. If any red: stop and fix before PR.
- [ ] Push the branch and open the PR (title `feat(tribe): tracker harness-gap detection (CU-2)`; body: problem, spec/plan links, verification evidence, install.sh check outcome, and the required footer). **Do not merge — merging is owner-only.**

```bash
git push -u origin cu2-harness-gap-detection && gh pr create --title "feat(tribe): tracker harness-gap detection (CU-2)" --body-file -
```

  Expected: PR URL printed; PR open with checks green; no merge performed.
- [ ] **Step 4: Commit** — `chore(tribe): CU-2 verification evidence` (only if evidence files were added; otherwise record evidence in the PR body and make this a no-op commit check — an empty task-closing commit is not required)
