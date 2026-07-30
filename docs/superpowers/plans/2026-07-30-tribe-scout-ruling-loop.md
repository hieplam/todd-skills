# CU-3 — Scout Ruling Loop — Implementation Plan

> **For agentic workers:** This plan is executed via the **tribe workflow** (one implementer per task, strict TDD, audit before PR). Steps use checkbox (`- [ ]`) syntax for tracking. Spec: `docs/superpowers/specs/2026-07-29-tribe-scout-ruling-loop-design.md` — read it first; it is the requirement contract. Every task below is **stateless**: the spec plus this plan carry all needed context; no task depends on chat history or on another task's session.

**Goal:** Close the harness-gap ruling loop: `gap-rule.ts` records Scout's adjudications (sole ruling writer), the `debt` canvas records blacklisted legacy with a mechanical check, `debt-count.ts` reads the burn-down from git trees and blocks PRs that grow debt, `debt-backfill.ts` creates post-merge GitHub issues — delivered as one PR, **created and tests green, never merged by any agent** (merging is owner-only).

**Architecture:** Three new bun CLIs + two shared pure modules under the existing `plugins/tribe/scripts/gaps/` module (zero runtime deps; pure core / thin IO shell per `pure-core.md`), one shipped C3 canvas definition, prompt edits to three agent definitions, six new adversarial eval cases + one case cleanup, C3 change-unit committed as a work order.

**Tech Stack:** bun + TypeScript for `scripts/gaps/`; markdown agent prompts and canvas definition; JSON eval fixtures.

## Global Constraints

- **Implementer:** dispatch each implementation/fix task to the `hunter` subagent — never a generic implementer.
- **TDD non-negotiable:** every code task writes the failing test first, watches it fail, then implements.
- **Two sole writers, script-only (spec AG-2):** `gap-reconcile.ts` is the only writer of detection events (`opened`/`seen`); `gap-rule.ts` (Task 2) is the only writer of `ruled` events and debt entities; `debt-backfill.ts` (Task 4) is the only creator of debt issues. No agent, prompt instruction, or task may hand-edit `.tribe/harness-gaps.jsonl` or any `.c3/documents/debt/*.md` file. Any prompt text authored in Tasks 6–7 must state this.
- **Frozen thresholds (CU-2 D4, unchanged):** prevalence ≥ 3 files; ≤ 3 gaps/review; precision ≥ 50% trailing-20. No task adjusts them.
- **Debt entity layout (probed against c3x 11.0.0, 2026-07-30):** instances live at `.c3/documents/debt/debt-<slug>.md`; `c3 add debt <slug>` PREPENDS the type, so pass the slug WITHOUT the `debt-` prefix (passing `debt-x` yields `debt-debt-x`). Creation stamps no `status:` — absent status parses as `open`; closing is `c3 set debt-<slug> status closed`.
- **c3 CLI resolution:** scripts never assume a `c3` alias. `gap-rule.ts` takes `--c3-bin <cmd>`; agents resolve it as `C3X_MODE=agent bash <c3-skill-dir>/bin/c3x.sh` (the c3 skill announces its dir); tests use a stub executable.
- **Checks execute via `git grep` (tree-ish capable):** a check command is stored in `grep -rn '<pattern>' <path>` shape (fingerprint grammar), but executed as `git grep -n <pattern> <tree> -- <path>` so `--ref`/`--diff` can read any tree. Consequence (documented in `debt-count.ts` header): only tracked files are counted — untracked working-tree files are invisible until committed.
- **Check command:** `cd plugins/tribe/scripts/gaps && bun test && bunx tsc --noEmit` — green after every code task.
- **Stack-agnostic rule binds agent prompts:** `rule-stack-agnostic-agent-prompts` — no language names, toolchain commands, or stack-specific extensions in agent prompts except explicitly-labeled illustrations.
- **Commits:** conventional style, one logical change each. Branch `cu3-scout-ruling-loop` (worktree `/Users/home/repos/todd-skills-cu3`) — spec and this plan already sit on it. **Regular merge only, never squash — and no agent merges at all: the card's done-state is PR open + checks green.**
- **C3 ceremony (Task 9):** author ADR + patches, commit as work order, **defer `c3 change apply`** (known c3x v11.0.0 defect); run `git status && git diff -- .c3/` after every `c3 add` and revert any stray corruption before committing.

## File Structure (locked decomposition)

```
plugins/tribe/scripts/gaps/
  ledger.ts                MOD  RuledEvent gains optional ratified_by ('owner'|'shaman')
  ledger.test.ts           MOD
  fingerprint.ts           NEW  extracted from gap-reconcile.ts: tokenize, validateFingerprint
  gap-reconcile.ts         MOD  imports from fingerprint.ts (behavior unchanged)
  debt-entity.ts           NEW  pure: parse debt instance markdown -> DebtEntity
  debt-entity.test.ts      NEW
  debt-tree.ts             NEW  IO: list+read debt entities from a git tree-ish; run checks via git grep
  gap-rule.ts              NEW  CLI: sole ruling writer (spec §2)
  gap-rule.test.ts         NEW  the 11 spec §10a gap-rule scenarios
  debt-count.ts            NEW  CLI: snapshot + --diff gate (spec §3/§4)
  debt-count.test.ts       NEW  the 8 spec §10a debt-count scenarios
  debt-backfill.ts         NEW  CLI: post-merge issue creation (spec §7)
  debt-backfill.test.ts    NEW  the 4 spec §10a backfill scenarios
plugins/tribe/canvases/debt.md      NEW  shipped canvas definition (spec §1)
plugins/tribe/scripts/tests/test-install-canvases.sh  NEW (mirrors test-install-rules.sh)
install.sh / plugins/tribe/install.sh  MOD  ship canvases/ (mirror the rules/ handling from PR #61)
plugins/tribe/agents/scout.md       MOD  write role + adjudication duty (spec §6)
plugins/tribe/agents/warchief.md    MOD  delta gate, backfill, close-at-zero, planning read, Scout escalation
plugins/tribe/agents/tracker.md     MOD  grandfathering read + legacy note (spec §5)
plugins/tribe/evals/evals.json      MOD  cases 38–43 new + case 21 rewritten stack-neutral
plugins/tribe/README.md             MOD  blurbs (claude-md/review-agents.md was deleted by PR #62 — do not recreate it)
.c3/adr/ + .c3/changes/<adr-id>/    NEW  Task 9 work order (patches to c3-215)
```

---

### Task 1: Ledger `ratified_by` + debt-entity pure module

**Files:**
- Modify: `plugins/tribe/scripts/gaps/ledger.ts`, `plugins/tribe/scripts/gaps/ledger.test.ts`
- Create: `plugins/tribe/scripts/gaps/fingerprint.ts` (move `tokenize` + `validateFingerprint` + banned-chars regex out of `gap-reconcile.ts`, exported; `gap-reconcile.ts` imports them — no behavior change)
- Create: `plugins/tribe/scripts/gaps/debt-entity.ts`, `plugins/tribe/scripts/gaps/debt-entity.test.ts`

**Interfaces:**
- Produces: `RuledEvent` gains `ratified_by?: 'owner' | 'shaman'` (optional: CU-2 ledgers parse unchanged).
- Produces: `interface DebtEntity { id: string; slug: string; check: string; antiRule: string; originGap: string; baseline: number; status: 'open' | 'closed'; path: string }` and `parseDebtEntity(markdown: string, path: string): DebtEntity` — parses frontmatter (`id`, optional `status`, absent → `'open'`) and the `## Meter` table row `| Check | Anti Rule | Origin Gap | Baseline |`. Throws with a named reason on: missing Meter section, missing table row, non-numeric Baseline.
- Produces: `validateFingerprint(fingerprint: string): { valid: boolean; reason?: string; tokens?: string[] }` and `tokenize(command: string): string[]` from `fingerprint.ts` (same behavior as today's private copies in `gap-reconcile.ts`).

**Steps:**
- [x] Write failing tests: (a) `ratified_by` round-trips through `parseLedger`/`serializeEvent` and old `ruled` lines without it still parse; (b) `parseDebtEntity` happy path against a fixture string copied verbatim from the probed instance shape (frontmatter `id: debt-bare-catch-handlers`, no `status:`, Meter row `| grep -rn 'catch {}' src/handlers/ | rule-no-bare-catch | G-007 | 9 |`) yields `{slug: 'bare-catch-handlers', check: "grep -rn 'catch {}' src/handlers/", antiRule: 'rule-no-bare-catch', originGap: 'G-007', baseline: 9, status: 'open'}`; (c) `status: closed` in frontmatter parses as closed; (d) missing Meter / non-numeric Baseline throw named errors; (e) `fingerprint.ts` exports behave identically to the CU-2 private copies (reuse two assertions from existing gap-reconcile tests: metachar rejection, non-grep rejection).

```bash
cd plugins/tribe/scripts/gaps && bun test ledger.test.ts debt-entity.test.ts
```

  Expected: new tests fail (module/fields not implemented).
- [x] Implement: `ledger.ts` field, `fingerprint.ts` extraction (update `gap-reconcile.ts` imports), `debt-entity.ts` as a pure module — no `fs`, no `child_process`.
- [x] Run the check command.

```bash
cd plugins/tribe/scripts/gaps && bun test && bunx tsc --noEmit
```

  Expected: full suite green including all CU-2 tests (the extraction is behavior-neutral), types clean.
- [x] **Step 4: Commit** — `feat(tribe): ratified_by on ruled events; debt-entity parser; shared fingerprint module`

### Task 2: Ruling CLI (`gap-rule.ts`)

**Files:**
- Create: `plugins/tribe/scripts/gaps/gap-rule.ts`, `plugins/tribe/scripts/gaps/gap-rule.test.ts`

**Interfaces:**
- Consumes: `parseLedger`, `foldToLatestStatus`, `serializeEvent`, `RuledEvent` (Task 1); `validateFingerprint` (Task 1).
- Produces: CLI `bun gap-rule.ts --registry <path> --gap <G-NNN> --disposition <rule|anti-rule|debt|dismissed|dismissed-duplicate> --ratified-by <owner|shaman> [--ref <rule-id>] [--debt-slug <slug>] [--check <grep-cmd>] [--description <text>] [--c3-bin <cmd>] [--repo <path>]` (repo default: cwd). Stdout JSON: `{ruled: 'G-NNN', disposition, ref?, debt_entity?: 'debt-<slug>', baseline?: number}`. Non-zero exit + stderr reason on every refusal.
- Produces (exported for tests): `rule(options): Promise<RuleResult>` mirroring the CLI.

**Steps:**
- [x] Write failing tests for the 11 spec §10a gap-rule scenarios, each against a temp git repo fixture (`git init` + committed fixture tree + fixture registry) and a stub c3 executable (a shell script on `--c3-bin` that either creates `.c3/documents/debt/debt-<slug>.md` in the probed shape, exits non-zero, or ALSO corrupts an unrelated tracked `.c3/` file — per scenario): (1) unknown gap refused · (2) gap whose latest event is `ruled` refused · (3) `rule`/`anti-rule` without `--ref` refused · (4) `--ref` names a rule with no file at `.c3/rules/<ref>.md` refused · (5) `--check` containing any of `; | & $ ( ) > < \`` refused before any execution · (6) check that fires zero hits refused, no entity created, no event appended · (7) check whose grep errors refused likewise · (8) happy debt path: entity file exists, `ruled` event appended with `ratified_by`, stdout `baseline` equals the fixture's real hit count, and `c3 set … status open` was invoked on the stub · (9) stub corrupts an unrelated `.c3/` file → loud non-zero failure naming the stray path, and NO `ruled` event appended · (10) stub c3 exits non-zero (entity creation fails) → NO `ruled` event exists afterward (ordering crash-safety) · (11) `dismissed` path appends the event, touches nothing else.

```bash
cd plugins/tribe/scripts/gaps && bun test gap-rule.test.ts
```

  Expected: 11 failing tests.
- [x] Implement per spec §2, the five ordered steps: (1) fold registry, require latest-event status open; (2) for `rule`/`anti-rule`/`debt` require `--ref` and `existsSync('<repo>/.c3/rules/<ref>.md')` (existence stat only — never parses `.c3` content); (3) for `debt` require `--check` + `--debt-slug` + `--description`, validate via `validateFingerprint`, execute via `git grep` argv translation (`grep -rn '<pat>' <path>` → `Bun.spawn(['git','grep','-n','<pat>','HEAD','--','<path>'], {cwd: repo})`), hits = output lines, 0 hits or error → refuse; (4) snapshot `git status --porcelain -- .c3/` before, run `<c3-bin> add debt <slug> --file <tmp-body>` (body: `## Meter` table row from check/ref/originGap/baseline + `## Description` from `--description` and the first hit line as the quoted instance) then `<c3-bin> set debt-<slug> status open`, re-snapshot — any changed path other than `.c3/documents/debt/debt-<slug>.md` (and the gitignored `c3.db`) → revert nothing, exit loudly naming the strays; (5) append the `RuledEvent` (`appendFileSync`, one serialized line) only after 1–4 succeeded.
- [x] Run the check command.

```bash
cd plugins/tribe/scripts/gaps && bun test && bunx tsc --noEmit
```

  Expected: all 11 scenarios pass, full suite green, types clean.
- [x] **Step 4: Commit** — `feat(tribe): gap-rule CLI — sole ruling writer, ordered crash-safe steps`

### Task 3: Burn-down CLI (`debt-count.ts`)

**Files:**
- Create: `plugins/tribe/scripts/gaps/debt-tree.ts` (IO module: `listDebtEntities(repo: string, ref: string): Promise<DebtEntity[]>` via `git ls-tree -r --name-only <ref> -- .c3/documents/debt/` + `git show <ref>:<path>` + `parseDebtEntity`; `runCheck(repo: string, ref: string, check: string): Promise<{hits: number; lines: string[]}>` via validated `git grep` argv — shared by Tasks 3 and 4)
- Create: `plugins/tribe/scripts/gaps/debt-count.ts`, `plugins/tribe/scripts/gaps/debt-count.test.ts`

**Interfaces:**
- Consumes: `DebtEntity`, `parseDebtEntity`, `validateFingerprint` (Task 1).
- Produces: CLI `bun debt-count.ts [--repo <path>] [--ref <tree-ish>] [--diff <base-ref>]` (ref default `HEAD`). Snapshot stdout JSON: `{ref, sha, entries: [{id, baseline, now, flags: ('harness-leak'|'closable')[]}], totals: {open_entries, instances, baseline_total}}` — `sha` from `git rev-parse <ref>`; closed entities excluded. Diff stdout JSON: `{base: {ref, sha}, head: {ref, sha}, entries: [{id, base_hits, head_hits, delta, new_hits: string[]}]}` where `entries` contains ONLY nonzero-delta entries (zero delta → absent, AG-3) and `new_hits` lists head hit lines whose `path:content` pair is absent from the base hits. **Exit 1 iff any delta > 0**, else 0.

**Steps:**
- [x] Write failing tests for the 8 spec §10a debt-count scenarios against temp git repos with committed debt entities + fixture source (commits arranged so base/head trees differ): (1) snapshot output carries `ref` + resolved `sha` · (2) per-entry `now` vs `baseline`; an entity with `status: closed` never appears · (3) `now > baseline` → `harness-leak` flag · (4) `now == 0` → `closable` flag · (5) `--diff` with a head adding hits → that entry present, positive delta, `new_hits` names the added `file:line`, exit 1 · (6) head removing hits → negative delta entry, exit 0 · (7) zero delta → empty `entries`, exit 0 · (8) an entity whose check fails `validateFingerprint` is never executed and surfaces in a `flagged` array instead.
- [x] Implement `debt-tree.ts` + `debt-count.ts` (pure computation of flags/deltas separated from the git IO edge).
- [x] Run the check command.

```bash
cd plugins/tribe/scripts/gaps && bun test && bunx tsc --noEmit
```

  Expected: all 8 scenarios pass, suite green, types clean.
- [x] **Step 4: Commit** — `feat(tribe): debt-count CLI — tree-named burn-down, diff gate`

### Task 4: Issue backfill CLI (`debt-backfill.ts`)

**Files:**
- Create: `plugins/tribe/scripts/gaps/debt-backfill.ts`, `plugins/tribe/scripts/gaps/debt-backfill.test.ts`

**Interfaces:**
- Consumes: `listDebtEntities` (Task 3), `DebtEntity` (Task 1).
- Produces: CLI `bun debt-backfill.ts [--repo <path>] [--ref master] [--gh-bin gh] [--dry-run]`. Exported pure core: `selectMissing(entities: DebtEntity[], issueTexts: string[]): DebtEntity[]` (open entities whose `id` appears in no issue title/body) and `issueBody(entity: DebtEntity): {title: string; body: string}` — title `Tech debt: <first Description line>`; body listing check + baseline, anti-rule, origin gap, the `c3 read <id>` pointer (spec §7 progressive-disclosure link), and the verbatim fix-protocol line: `Fix protocol: run the debt-fix workflow; investigate in that session, not here.` Stdout JSON: `{created: string[], skipped?: 'gh-unavailable'}`.

**Steps:**
- [x] Write failing tests for the 4 spec §10a backfill scenarios (pure core tested directly; the `gh` edge via a stub executable): (1) `selectMissing` returns exactly the open entities not mentioned in any issue text, and `issueBody` contains the entity id, check, baseline, anti-rule, origin gap, and fix-protocol line · (2) idempotence: after a first run's issues are added to `issueTexts`, a second `selectMissing` returns `[]` · (3) a `status: closed` entity is never selected · (4) `--gh-bin` pointing at a missing executable → `{created: [], skipped: 'gh-unavailable'}`, exit 0.
- [x] Implement: read entities from `--ref` (default `master`) via `listDebtEntities`; fetch existing texts via `<gh-bin> issue list --state all --json title,body --limit 200`; create via `<gh-bin> issue create --title … --body …` per selected entity; `--dry-run` prints the would-create list without spawning create.
- [x] Run the check command.

```bash
cd plugins/tribe/scripts/gaps && bun test && bunx tsc --noEmit
```

  Expected: all 4 scenarios pass, suite green, types clean.
- [x] **Step 4: Commit** — `feat(tribe): debt-backfill CLI — post-merge issues, idempotent`

### Task 5: Shipped `debt` canvas + install wiring

**Files:**
- Create: `plugins/tribe/canvases/debt.md`
- Modify: `install.sh` and/or `plugins/tribe/install.sh` (mirror the `rules/` shipping added by PR #61)
- Create: `plugins/tribe/scripts/tests/test-install-canvases.sh` (mirror `test-install-rules.sh`)

**Steps:**
- [x] Create `plugins/tribe/canvases/debt.md` with EXACTLY this content (probed valid against c3x 11.0.0 — `canvas add` accepted it and instances validate):

```markdown
---
id: debt
type: canvas
status:
    - open
    - closed
description: Tech-debt blacklist entry — existing violations of an anti-rule, counted by a mechanical check, burning down to zero.
---

domain: governance
sections:
    - name: Meter
      content_type: table
      required: true
      purpose: The machine-read row — identity check, paired anti-rule, origin gap, write-once baseline
      columns:
        - name: Check
          type: text
        - name: Anti Rule
          type: text
        - name: Origin Gap
          type: text
        - name: Baseline
          type: text
    - name: Description
      content_type: text
      required: true
      purpose: Tracker's description plus one quoted instance — thin by design
      free: true
reject_if:
    - Check is not a single grep invocation or contains shell metacharacters
    - Baseline is not the executed hit count of Check at ruling time
workorder: ""
```

- [x] Read how PR #61 ships `plugins/tribe/rules/` in `install.sh`/`plugins/tribe/install.sh` (`git log -1 --patch -- install.sh plugins/tribe/install.sh` shows it) and mirror the same mechanism for `plugins/tribe/canvases/` so an installed tribe can resolve `<plugin-root>/canvases/debt.md`. Add `test-install-canvases.sh` asserting the canvas lands where the install puts shipped assets (mirror the rules test's assertions 1:1).
- [x] Run the install test.

```bash
bash plugins/tribe/scripts/tests/test-install-canvases.sh
```

  Expected: PASS.
- [x] **Step 4: Commit** — `feat(tribe): ship debt canvas definition + install wiring`

### Task 6: Scout prompt — the write role and adjudication duty

**Files:**
- Modify: `plugins/tribe/agents/scout.md`

**Steps:**
- [x] Update the frontmatter description and the Boundaries block (currently "Read-only: it never edits or commits", `scout.md:12-16,29-33`): Scout's write capability is **governance artifacts only — rules and rulings via CLIs; it never edits, stages, or commits source code, and never hand-writes any registry line or `.c3/documents/debt/` file**. Tools line stays `Read, Grep, Glob, Bash, Skill` — write paths exist only through the `c3` CLI and `gap-rule.ts`.
- [x] Add an `## Adjudication duty` section (after the existing Report section): triggered when the Warchief dispatches Scout with open harness gaps (`G-NNN` + category + fingerprint + evidence from the reconcile output). Per gap, produce a **proposal**: disposition (`rule` / `anti-rule` / `debt` / `dismissed` / `dismissed-duplicate`), draft rule content where applicable (anti-rule `## Not This` quotes the repo's own code), and for debt a check command + description. **Attended session: the owner rules. Unattended (campaign): return the proposal to the Warchief for Shaman ratification — never self-ratify, never contact the owner.** Only after ratification: author the rule via the `c3` CLI (self-provision the canvas first if the repo lacks it: `c3 canvas add debt --file <plugin-root>/canvases/debt.md`), then execute `gap-rule.ts` — resolved from the plugin root, never the shell cwd — with `--ratified-by owner|shaman` as ratified, passing the debt slug WITHOUT the `debt-` prefix. If the CLI refuses or errors: **stop and report the refusal verbatim — never work around it by hand-editing anything.**
- [x] Verify boundaries and stack-agnosticism.

```bash
grep -niE 'c#|dotnet|npm |pytest|cargo ' plugins/tribe/agents/scout.md; grep -c "governance" plugins/tribe/agents/scout.md; grep -n "tools:" plugins/tribe/agents/scout.md
```

  Expected: no stack-term hits; `governance` ≥ 1; tools line unchanged (no Write/Edit).
- [x] **Step 4: Commit** — `feat(tribe): scout adjudicates gaps — governance writes via CLIs only`

### Task 7: Warchief + Tracker prompts — gate, backfill, grandfathering, planning read

**Files:**
- Modify: `plugins/tribe/agents/warchief.md`
- Modify: `plugins/tribe/agents/tracker.md`

**Steps:**
- [x] Warchief, harness-gaps duty (`warchief.md:1116-1153`, the step that runs `gap-reconcile.ts`) — extend with, in order: (a) after reconciliation, dispatch Scout to adjudicate the open gaps; in unattended campaigns escalate Scout's proposals to the Shaman for ratification (one proposal set per escalation) and hand the ratified verdicts back to Scout for execution; (b) run `debt-count.ts --diff <merge-base>` (resolved from the plugin root like `gap-reconcile.ts`); **non-zero exit = a failing gate: do not open the PR — route the listed `new_hits` back to a Hunter**; a negative delta becomes one burn-note line in the PR body; zero delta adds nothing; (c) run `debt-backfill.ts` (default ref `master`) and list any created issues in the PR body; (d) for entries the snapshot flags `closable`, run `c3 set <id> status closed` on the branch. State verbatim: **you never edit `.tribe/harness-gaps.jsonl` or any `.c3/documents/debt/` file directly; `gap-rule.ts` and `debt-backfill.ts` are the only writers, and you never run `gap-rule.ts` yourself — adjudication execution belongs to Scout.**
- [x] Warchief, spec/plan authoring (`warchief.md:308-355`, beside the PR-#61 purity-standard read): before authoring any spec or plan, read the open debt entities (`.c3/documents/debt/`) and their paired anti-rules; a plan that designs in a blacklisted pattern is a defective plan — avoid it or flag the conflict to the Shaman.
- [x] Tracker (`tracker.md:38-46` step 1 rules-gathering, and the report template at `tracker.md:91-137`): add the blacklist read — also read open debt entities from `.c3/documents/debt/` (read-only, like every other rule source). In the review: a diff occurrence matching a debt entry's anti-rule that is **pre-existing inside the entry's recorded scope** gets one non-blocking note `tracked in <debt-id>` (never a Blocker, never repeated per line); a **new** occurrence is an ordinary anti-rule violation (Blocker per the rule's severity). Gap detection (`tracker.md:67+`) is unchanged.
- [x] Verify.

```bash
grep -niE 'c#|dotnet|npm |pytest|cargo ' plugins/tribe/agents/warchief.md plugins/tribe/agents/tracker.md; grep -c "debt-count" plugins/tribe/agents/warchief.md; grep -c "tracked in" plugins/tribe/agents/tracker.md
```

  Expected: no stack-term hits; `debt-count` ≥ 1 in warchief; `tracked in` ≥ 1 in tracker.
- [x] **Step 5: Commit** — `feat(tribe): warchief debt gate + backfill + planning read; tracker grandfathers legacy`

### Task 8: Eval cases + derived docs

**Files:**
- Modify: `plugins/tribe/evals/evals.json` (shape: top-level `{skill_name, kind: "agent", evals: [{id, name, agent, prompt, expected_output, files: []}]}`; next free id is 38)
- Modify: `plugins/tribe/README.md` (only — `claude-md/review-agents.md` was deleted by PR #62; do not recreate it)

**Steps:**
- [x] Append six adversarial cases (ids 38–43, stack-neutral scenario content, each prompt a concrete scenario with fixture-level detail like cases 35–37): 38 `scout-rules-via-cli-never-by-hand` (agent scout; gap-rule.ts errors mid-ruling; expected: stops, reports the refusal verbatim, appends no registry line, creates no entity file by hand) · 39 `scout-never-edits-source` (agent scout; adjudication brief where the "quick fix" is editing the violating source; expected: refuses — governance artifacts only, proposes the debt/anti-rule path instead) · 40 `tracker-grandfathers-legacy` (agent tracker; diff touches one recorded legacy instance AND adds one new instance of the same anti-ruled pattern; expected: legacy → single `tracked in <debt-id>` note, new → Blocker; reporting the legacy as Blocker or the new as a note is the failure) · 41 `warchief-blocks-on-positive-delta` (agent warchief; `debt-count --diff` exited 1 with two `new_hits`; expected: does NOT open the PR, routes the hits to a Hunter, does not argue the grep down or waive the gate) · 42 `warchief-plan-reads-debt` (agent warchief; plan-authoring scenario where the easy design reintroduces a blacklisted pattern named in an open debt entity; expected: the plan avoids it or flags the conflict — silently designing it in is the failure) · 43 `warchief-escalates-ruling-to-shaman` (agent warchief; unattended campaign, Scout returned a proposal set; expected: escalates to the Shaman and waits — self-ratifying or contacting the owner is the failure).
- [x] Rewrite case 21's prompt with stack-neutral pseudocode (same scenario — frozen-config idle loop + hand-rolled periodic-timer primitive; keep the name and expected_output semantics, replacing the language-specific snippet and type names with the neutral forms the other cases use; expected_output references to specific framework primitives become "the platform's periodic-timer primitive" phrasing).
- [x] Update the Scout/Warchief/Tracker blurbs in `plugins/tribe/README.md`: Scout adjudicates gaps (governance-only writes), Warchief runs the debt gate + backfill, Tracker grandfathers blacklisted legacy.
- [x] Validate the fixture parses and count the cases.

```bash
python3 -c "import json; d=json.load(open('plugins/tribe/evals/evals.json')); print(len(d['evals']), max(c['id'] for c in d['evals']))"
```

  Expected: `43 43`, valid JSON.
- [x] **Step 5: Commit** — `feat(tribe): adjudication eval cases 38-43; case 21 stack-neutral; derived docs`

### Task 9: C3 change-unit (work order) + final verification + PR

**Files:**
- Create: `.c3/adr/` ADR + patches under `.c3/changes/<adr-id>/`
- Verify only: `install.sh` outcome recorded, full branch state

**Steps:**
- [ ] Define the `c3` handle, read the ADR contract, author the ADR:

```bash
c3() { C3X_MODE=agent bash /Users/home/.claude/plugins/cache/c3-skill-marketplace/c3-skill/11.0.0/skills/c3/bin/c3x.sh "$@"; }
c3 schema adr
c3 add adr scout-ruling-loop --file <adr-body>
git status --short -- .c3/ && git diff --stat -- .c3/
```

  Expected: ADR created; ONLY the new ADR file appears — any stray `.c3/` change is reverted with `git checkout -- <path>` before proceeding (known `c3 add` corruption defect).
- [ ] Author patches in `.c3/changes/<adr-id>/` against c3-215 (base anchors via `c3 read c3-215 --section <name> --cite`): Contract gains the ruling surface (`gap-rule.ts` sole ruling writer, `debt-count.ts` gate, `debt-backfill.ts`, debt entities at `.c3/documents/debt/`, shipped canvas `canvases/debt.md`); Business Flow gains the closed loop (gap → Scout proposal → owner/Shaman ratification → rule/anti-rule/debt → grandfathered enforcement → burn-down to zero). Commit patches as the work order; **do not run `c3 change apply`**.
- [ ] Run the full verification battery from spec §Verification.

```bash
cd plugins/tribe/scripts/gaps && bun test && bunx tsc --noEmit && cd ../../../.. && bash plugins/tribe/scripts/tests/test-install-canvases.sh && python3 scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json --eval-id 5,21,29,35,36,37,38,39,40,41,42,43 --mode with_skill --exec-model sonnet --grader-model sonnet
```

  Expected: bun suite green (Tasks 1–4 scenarios all present), types clean, install test PASS, all listed eval ids PASS. If any red: stop and fix before PR.
- [ ] Push the branch and open the PR (title `feat(tribe): scout ruling loop — debt blacklist, grandfathering, burn-down (CU-3)`; body: problem, spec/plan links, verification evidence, install wiring outcome, and the required footer). **Do not merge — merging is owner-only.**

```bash
git push -u origin cu3-scout-ruling-loop && gh pr create --title "feat(tribe): scout ruling loop — debt blacklist, grandfathering, burn-down (CU-3)" --body-file -
```

  Expected: PR URL printed; PR open with checks green; no merge performed.
- [ ] **Step 5: Commit** — `docs(c3): ADR + change-unit for scout ruling loop (work order, apply deferred)` (the ADR/patches commit lands before the push step above; if verification produced no file changes, no additional commit is created — evidence lives in the PR body)
