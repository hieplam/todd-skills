# Campaign orchestration state moves to `~/.tribe` — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the campaign runner's operational state (`campaign-state.json`, `answers.md`,
`escalations/`, `campaign-report.*`, `.runner.lock`, `STOP`) out of the target repo and under
`--home`, delete the never-working state auto-commit path entirely, and add a `Campaign: <slug>`
commit trailer so card commits stay traceable from the repo alone. Per
`docs/superpowers/specs/2026-08-01-campaign-state-home-migration-design.md`.

**Architecture:** `cli/main.ts`'s `parseArgs` does **no path joining today** — it stores raw
relative strings that ~11 consumer sites each `join(config.repoRoot, …)`. This plan collapses all
of them onto one new pure module, `core/paths.ts`, whose helpers take `homeDir` and return
absolute paths at fixed filenames. `--state`, `--answers`, `--escalations-dir` are deleted as
flags (required flags drop 6 → 3). The auto-commit path is deleted **first**, because doing so
removes several `statePath` consumers before the repointing task has to touch them.

**Tech Stack:** TypeScript (Bun), `bun test`, `tsc --noEmit` via `bun run check`, bash for the
migrator.

## Global Constraints

- Repo: `/Users/home/repos/todd-skills`. **Work in a git worktree**, branch off `master`.
  PR via `gh pr create --repo hieplam/todd-skills --base master`, merged with `gh pr merge --merge`
  (2-parent, never squash — `rule-no-squash-merge`).
- `bun run check` (`tsc --noEmit` + `bun test`) green in `plugins/tribe/scripts/runner/` before
  every commit. Run from that directory.
- **WALL (AG-5):** `structure.test.ts` import-layering stays green. `core/**` never imports a
  world-touching module; every `*IO`/`*Port` interface declaration stays in `ports/ports.ts`.
- **WALL (AG-2/AG-1):** never delete or relocate a SPEC or plan file; never weaken traceability to
  make a metric pass.
- **WALL:** `core/github.ts`'s *card-PR* handling is NOT in scope — but see Task 1, which
  establishes that this file contains **only** state-commit code. Card PRs are created by the
  executor session, not by this module. Verify before deleting.
- **Purity** (`~/.claude/rules/pure-core.md`): `core/paths.ts` is pure string math — no `fs`, no
  IO seam, no clock. Every outside-world effect stays behind an existing `ports/ports.ts` seam.
- Commits: **no agent co-author lines**, ever.
- If the brief is ambiguous or a product decision surfaces, **STOP and report back** — do not guess.

---

### Task 1: Delete the state auto-commit path

The runner's state auto-commit has never succeeded once in 6 live runs
(`2026-07-31-runner-remote-resolution-design.md` §1). With state leaving the repo it has no
remaining purpose. Deleting it first shrinks every later task.

**Files:**
- Delete: `plugins/tribe/scripts/runner/core/github.ts` (349 lines)
- Delete: `plugins/tribe/scripts/runner/core/github.test.ts`
- Modify: `plugins/tribe/scripts/runner/core/loop/commit-guard.ts` (keep ONLY `persistLocalState`)
- Modify: `plugins/tribe/scripts/runner/core/loop/card-actions.ts:20-27,105-127,138-147`
- Modify: `plugins/tribe/scripts/runner/core/loop/run-loop.ts:143-150,260`
- Modify: `plugins/tribe/scripts/runner/core/types.ts:86-92` (delete `StateCommitFiles`)
- Modify: `plugins/tribe/scripts/runner/core/loop.ts:10,11,25` (barrel re-exports)
- Modify: `plugins/tribe/scripts/runner/ports/ports.ts:10,46-50,207-211,217-227`
- Modify: `plugins/tribe/scripts/runner/adapters/run-io.adapter.ts:36,64-74`
- Modify: `plugins/tribe/scripts/runner/core/loop.test.ts` (delete commit describes)
- Modify: `plugins/tribe/scripts/runner/core/report.test.ts:503-605`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `persistLocalState(resolved, state, io)` survives in `commit-guard.ts` with its current
  signature — Task 3 repoints its path resolution. `CardOutcome` loses its `commitResult` field on
  both the `shipped` and `escalated` variants.

- [x] **Step 1: Prove `core/github.ts` is state-commit-only before deleting it**

The Global Constraints wall says card-PR handling must survive. Confirm this file is not it:

```bash
cd plugins/tribe/scripts/runner
grep -rn "from './github.ts'\|from '../github.ts'\|from '../../core/github.ts'" . --include='*.ts' | grep -v node_modules
```

Expected: the ONLY importer is `core/loop/commit-guard.ts`. If anything else imports it, **STOP
and report back** — the deletion premise is wrong.

- [x] **Step 2: Run the existing suite to capture the green baseline**

```bash
cd plugins/tribe/scripts/runner && bun run check 2>&1 | tail -20
```

Record the pass/fail counts. Every later step compares against this baseline.

- [x] **Step 3: Delete the two github files and the commit machinery in `commit-guard.ts`**

```bash
cd plugins/tribe/scripts/runner
git rm core/github.ts core/github.test.ts
```

In `core/loop/commit-guard.ts`, delete `ALLOWED_COMMIT_EXTENSIONS`, `assertStateOrEscalationPath`,
`toCommitFileList`, `commitState`, `buildStatePrBody`, `githubConfigFor`, and the now-unused
imports from `../github.ts` and `../types.ts`. The file must retain **only**:

```ts
import { join } from 'node:path';
import { serializeState } from '../state.ts';
import type { ResolvedConfig, CampaignState } from '../types.ts';
import type { LoopIO } from '../../ports/ports.ts';

/** Writes the campaign state JSON to disk. The runner never commits it. */
export function persistLocalState(resolved: ResolvedConfig, state: CampaignState, io: LoopIO): void {
  io.writeFile(join(resolved.repoRoot, resolved.statePath), serializeState(state));
}
```

(Keep the `repoRoot` join for now — Task 3 repoints it. Changing both at once makes a failure
ambiguous.)

- [x] **Step 4: Strip the commit blocks from `card-actions.ts`**

In `escalateCard`, delete lines 118-125 (the `StateCommitFiles` literal, `title`, `commitState`
call, and the `writePendingCommit`/`clearPendingCommit` branch). In `shipCard`, delete the
equivalent block at 138-145. Delete `commitResult` from both `CardOutcome` variants (lines 20-27)
and from both return statements (127, 147). Delete the `StateCommitFiles` import at line 6.

- [x] **Step 5: Delete `retryPendingCommit` and the `PendingCommitPort` seam**

In `core/loop/run-loop.ts` delete `retryPendingCommit` (143-150) and its call at line 260.
In `ports/ports.ts` delete the `PendingCommitPort` interface (46-50), the `PendingCommit`
interface (207-211), the `StateCommitFiles` type import (line 10), and remove `PendingCommitPort`
from `LoopIO`'s `extends` list (217-227). In `adapters/run-io.adapter.ts` delete `pendingCommitPath`
(line 36) and the three method implementations (64-74).
In `core/types.ts` delete `StateCommitFiles` (86-92).
In `core/loop.ts` delete the `StateCommitFiles` re-export (line 10), the `PendingCommit` re-export
(line 11), and the `commitState`/`toCommitFileList` re-export (line 25).

- [x] **Step 6: Delete the now-premise-less tests**

In `core/loop.test.ts`: delete the whole `describe('toCommitFileList — structural guard on
commitStateAndMerge inputs', …)` block (308-332) and its `toCommitFileList` import (line 17);
delete the test `'commit-failure path: exit code and escalation file stand even when the commit
fails'` (995-1023). Then remove every remaining `commitResult` assertion and every
`readPendingCommit`/`writePendingCommit`/`clearPendingCommit`/`pendingCommitCalls` fixture:

```bash
cd plugins/tribe/scripts/runner
grep -n "commitResult\|PendingCommit\|pendingCommitCalls" core/loop.test.ts
```

Every hit must be gone. Leave the `git`/`gh` exec mock handlers alone for now unless TypeScript
flags them as unused — trimming them is cosmetic and risks masking a real failure.

In `core/report.test.ts`: delete `describe('writeReport — reflects persisted state even when the
state-commit PR failed', …)` (503-605) entirely. Its premise — a state commit that can fail — no
longer exists.

- [x] **Step 7: Run the suite; expect green with a smaller count**

```bash
cd plugins/tribe/scripts/runner && bun run check 2>&1 | tail -20
```

Expected: PASS, with fewer tests than the Step 2 baseline (the deleted describes). Zero failures.
If `structure.test.ts` fails, a `*IO`/`*Port` declaration was left stranded outside `ports/` —
fix that, do not weaken the rule.

- [x] **Step 8: Commit**

```bash
git add -A
git commit -m "refactor(runner): delete the state auto-commit path

The runner's state auto-commit never succeeded once across 6 live runs
(see docs/superpowers/specs/2026-07-31-runner-remote-resolution-design.md).
With campaign state moving out of the target repo it has no remaining
purpose. Removes core/github.ts entirely (its only importer was
commit-guard.ts), the D6 SonarCloud docs-only waiver, StateCommitFiles,
the PendingCommitPort seam, and retryPendingCommit."
```

---

### Task 2: `core/paths.ts` — pure campaign-home path helpers

**Files:**
- Create: `plugins/tribe/scripts/runner/core/paths.ts`
- Test: `plugins/tribe/scripts/runner/core/paths.test.ts`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces — Task 3 consumes these exact names and signatures:
  - `campaignStatePathOf(homeDir: string): string`
  - `answersPathOf(homeDir: string): string`
  - `escalationsDirOf(homeDir: string): string`
  - `escalationPathOf(homeDir: string, cardId: string): string`
  - `reportDirOf(homeDir: string): string`

Precedent: `core/brief.ts`'s `reportPathFor` already returns `<home>/reports/<cardId>.md`, and
`core/brief.test.ts:155` asserts it. This module follows that shape.

- [ ] **Step 1: Write the failing test**

```ts
// core/paths.test.ts
import { describe, expect, test } from 'bun:test';
import {
  answersPathOf, campaignStatePathOf, escalationPathOf, escalationsDirOf, reportDirOf,
} from './paths.ts';

describe('campaign-home path helpers', () => {
  const home = '/Users/x/.tribe/-Users-x-repos-app/campaigns/widget-export';

  test('every artifact resolves to a fixed name under home', () => {
    expect(campaignStatePathOf(home)).toBe(`${home}/campaign-state.json`);
    expect(answersPathOf(home)).toBe(`${home}/answers.md`);
    expect(escalationsDirOf(home)).toBe(`${home}/escalations`);
    expect(escalationPathOf(home, 'C2')).toBe(`${home}/escalations/C2.md`);
    expect(reportDirOf(home)).toBe(home);
  });

  test('no helper ever resolves against a repo root', () => {
    const p = [campaignStatePathOf(home), answersPathOf(home), escalationsDirOf(home)];
    for (const one of p) expect(one.startsWith(home)).toBe(true);
  });

  test('a relative home is normalised, not concatenated blindly', () => {
    expect(campaignStatePathOf('a/b')).toBe('a/b/campaign-state.json');
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd plugins/tribe/scripts/runner && bun test core/paths.test.ts
```

Expected: FAIL — `Cannot find module './paths.ts'`.

- [ ] **Step 3: Write the implementation**

```ts
// core/paths.ts
/**
 * Pure path math for a campaign's machine-local home (`--home`, i.e.
 * `~/.tribe/<repo-key>/campaigns/<slug>/`). One campaign per home, so every artifact
 * has a fixed name and needs no CLI flag. No IO, no clock, no fs — string math only.
 */
import { join } from 'node:path';

export const CAMPAIGN_STATE_FILENAME = 'campaign-state.json';
export const ANSWERS_FILENAME = 'answers.md';
export const ESCALATIONS_DIRNAME = 'escalations';

/** `<home>/campaign-state.json` */
export function campaignStatePathOf(homeDir: string): string {
  return join(homeDir, CAMPAIGN_STATE_FILENAME);
}

/** `<home>/answers.md` */
export function answersPathOf(homeDir: string): string {
  return join(homeDir, ANSWERS_FILENAME);
}

/** `<home>/escalations` */
export function escalationsDirOf(homeDir: string): string {
  return join(homeDir, ESCALATIONS_DIRNAME);
}

/** `<home>/escalations/<cardId>.md` */
export function escalationPathOf(homeDir: string, cardId: string): string {
  return join(escalationsDirOf(homeDir), `${cardId}.md`);
}

/** Where `campaign-report.json`/`.md`, `.runner.lock` and `STOP` live: the home itself. */
export function reportDirOf(homeDir: string): string {
  return homeDir;
}
```

- [ ] **Step 4: Run the tests and the layering guard**

```bash
cd plugins/tribe/scripts/runner && bun test core/paths.test.ts && bun run check 2>&1 | tail -10
```

Expected: PASS. `structure.test.ts` must stay green — `node:path` is not a world-touching module
(it is already imported across `core/`), but confirm the sweep still passes.

- [ ] **Step 5: Commit**

```bash
git add core/paths.ts core/paths.test.ts
git commit -m "feat(runner): pure path helpers for the campaign home

One campaign per --home, so every operational artifact gets a fixed
name and needs no CLI flag. Mirrors brief.ts's existing reportPathFor
shape. Pure string math, no IO."
```

---

### Task 3: Repoint every resolution site to `--home`; delete the three path flags

**Files:**
- Modify: `plugins/tribe/scripts/runner/cli/main.ts:43-49,81-86,126-131,155-168`
- Modify: `plugins/tribe/scripts/runner/core/types.ts:99-111` (`RunLoopConfig`)
- Modify: `plugins/tribe/scripts/runner/core/loop/lock.ts:38-40` (`stateDirOf`)
- Modify: `plugins/tribe/scripts/runner/core/loop/commit-guard.ts` (`persistLocalState`)
- Modify: `plugins/tribe/scripts/runner/core/loop/run-loop.ts:100,137,262`
- Modify: `plugins/tribe/scripts/runner/core/loop/phase.ts:143`
- Modify: `plugins/tribe/scripts/runner/core/loop/card-actions.ts:105-109` + `buildEscalationMarkdown:82-101`
- Modify: `plugins/tribe/scripts/runner/core/report.ts:46-54,123-134,275-288`
- Modify: `plugins/tribe/scripts/runner/core/run-record.ts:43-65`
- Modify: `plugins/tribe/scripts/runner/adapters/run-io.adapter.ts:34-36`
- Test: `core/report.test.ts`, `core/loop.test.ts`, `core/run-record.test.ts`, `cli/main.test.ts`

**Interfaces:**
- Consumes: all five helpers from Task 2; `persistLocalState` from Task 1.
- Produces: `RunLoopConfig` loses `statePath`, `answersPath`, `escalationsDir` as *inputs*; all
  three are derived from `homeDir`. `--repo`, `--model`, `--home` are the only required flags.

- [ ] **Step 1: Write the failing test for the new CLI contract**

Append to `cli/main.test.ts`:

```ts
describe('parseArgs — path flags are derived from --home, not passed', () => {
  const base = ['--repo', '/repo', '--model', 'opus', '--home', '/home/c'];

  test('the three required flags are exactly --repo, --model, --home', () => {
    const config = parseArgs(base);
    expect(config.repoRoot).toBe('/repo');
    expect(config.homeDir).toBe('/home/c');
  });

  test('--state is rejected as an unknown flag', () => {
    expect(() => parseArgs([...base, '--state', 'x.json'])).toThrow(/--state/);
  });

  test('--answers and --escalations-dir are rejected too', () => {
    expect(() => parseArgs([...base, '--answers', 'a.md'])).toThrow(/--answers/);
    expect(() => parseArgs([...base, '--escalations-dir', 'e'])).toThrow(/--escalations-dir/);
  });

  test('omitting --home is still a usage error', () => {
    expect(() => parseArgs(['--repo', '/repo', '--model', 'opus'])).toThrow(/--home/);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
cd plugins/tribe/scripts/runner && bun test cli/main.test.ts
```

Expected: FAIL — `--state` is currently accepted, and omitting it currently throws.

- [ ] **Step 3: Update `RunLoopConfig` and `parseArgs`**

In `core/types.ts`, delete `statePath`, `answersPath`, `escalationsDir` from `RunLoopConfig`
(lines 99-111) along with their `/** … relative to repoRoot */` doc comments. `homeDir` stays.

In `cli/main.ts`: reduce `REQUIRED_FLAGS` (43-49) to the three entries `--repo`/`repoRoot`,
`--model`/`model`, `--home`/`homeDir`. Delete lines 82, 84, 85 (the three `raw.get` calls) and
their entries in the config literal (127-129). Update the stateless-capability doc comment at
53-54 to name only the three surviving flags and to state that the path flags were removed
because `--home` now carries the only environment-specific part.

An unknown flag must throw naming the flag — confirm `parseArgs` already rejects unknown flags; if
it silently ignores them, the Step 1 tests will tell you, and adding the rejection is in scope.

- [ ] **Step 4: Repoint every consumer site**

Replace each `join(config.repoRoot, config.<field>)` with the Task 2 helper:

| File:line | Was | Becomes |
| --- | --- | --- |
| `core/loop/lock.ts:38-40` | `dirname(join(config.repoRoot, config.statePath))` | `reportDirOf(config.homeDir)` |
| `core/loop/commit-guard.ts` (`persistLocalState`) | `join(resolved.repoRoot, resolved.statePath)` | `campaignStatePathOf(resolved.homeDir)` |
| `core/loop/run-loop.ts:100` | `join(config.repoRoot, config.statePath)` | `campaignStatePathOf(config.homeDir)` |
| `core/loop/run-loop.ts:262` | same | `campaignStatePathOf(config.homeDir)` |
| `core/loop/run-loop.ts:137` | `join(config.repoRoot, config.answersPath)` | `answersPathOf(config.homeDir)` |
| `core/loop/phase.ts:143` | `join(config.repoRoot, config.escalationsDir, \`${cardId}.md\`)` | `escalationPathOf(config.homeDir, cardId)` |
| `core/loop/card-actions.ts:105-109` | `\`${resolved.escalationsDir}/${cardId}.md\`` then `join(resolved.repoRoot, …)` | `escalationPathOf(resolved.homeDir, cardId)` |
| `adapters/run-io.adapter.ts:34-36` | `dirname(join(config.repoRoot, config.statePath))` | `reportDirOf(config.homeDir)` |
| `core/run-record.ts:56-58` | `join(config.repoRoot, config.<field>)` ×3 | `campaignStatePathOf(config.homeDir)`, `answersPathOf(config.homeDir)`, `escalationsDirOf(config.homeDir)` |

`run-io.adapter.ts:36`'s `pendingCommitPath` was already deleted in Task 1 — only `lockPath`
remains under `reportDirOf(config.homeDir)`.

In `core/run-record.ts`, `buildRunRecord`'s param type (43-52) drops `statePath`/`answersPath`/
`escalationsDir` and keeps `homeDir`. Update the field doc comment at line 12 — it currently says
*"Absolute — resolved against repo so the viewer never guesses a path"*; it now resolves against
the campaign home. **The field names and their absoluteness do not change** — that is what keeps
the viewer working (spec §4).

- [ ] **Step 5: Repoint `report.ts`**

`ReportConfig` (46-54) drops `repoRoot` + `escalationsDir` and gains `homeDir: string`.
`escalationFileRelPath` (123-125) and `buildEscalatedEntry` (127-154) use
`escalationPathOf(config.homeDir, cardId)`.

Keep the report's own `escalationFile` **relative** in the emitted JSON (`escalations/<id>.md`) so
the report stays readable without absolute-path noise — that string is a display value, not a
resolution input.

`writeReport` (275-288) keeps its `dir` param; only its caller changes. Update the doc comment at
271-274, which currently says *"the state file's own directory … the caller derives it via
loop.ts's `stateDirOf`"*.

In `cli/main.ts`'s `tryWriteReport` (155-168):

```ts
const state = await loadState(() => io.readFile(campaignStatePathOf(config.homeDir)));
await writeReport(state, run, reportDirOf(config.homeDir), { homeDir: config.homeDir }, io);
```

- [ ] **Step 6: Update `buildEscalationMarkdown`'s embedded wording**

`card-actions.ts:82-101` writes an "Options" line naming the answers file. It currently renders
the repo-relative path (verified live in kanna: *"Append a ruling to
`docs/tribe/planning/kanna-session-import/answers.md`"*). It must now render
`answersPathOf(resolved.homeDir)` so a human reading the escalation is pointed at the real file.

- [ ] **Step 7: Fix the path-sensitive tests**

- `core/report.test.ts`: `fixtureConfig` (75-81) → `{ homeDir: '/home/c' }`. The escalated
  describe (215-284) asserts `/repo/escalations/B4.md` → `/home/c/escalations/B4.md`. The
  `writeReport` twins describe (441-486) asserts `/repo/docs/campaign/…` and `/repo/state-dir/…`
  → `/home/c/campaign-report.json` and `.md`.
- `core/loop.test.ts`: the `deriveCardPhase` escalation tests (192, 201) need home-relative
  fixture paths.
- `core/run-record.test.ts`: the test at line 35 is literally named *"records absolute
  repo-relative paths…"* — rename to reflect home-relative and update its assertions.

- [ ] **Step 8: Run the full suite**

```bash
cd plugins/tribe/scripts/runner && bun run check 2>&1 | tail -20
```

Expected: PASS, zero failures.

- [ ] **Step 9: Prove the viewer still works untouched (AG-3 regression gate)**

The viewer must need **no source change** (spec §4). Prove it:

```bash
cd plugins/tribe/scripts/viewer && bun test 2>&1 | tail -10
git status --porcelain plugins/tribe/scripts/viewer/
```

Expected: viewer tests PASS and `git status` shows **zero modified viewer source files**. If a
viewer source change appears necessary, **STOP and report back** — that means the move broke the
`run.json` indirection and is a design problem, not something to patch around.

- [ ] **Step 10: Live `--dry-run` smoke against a real repo (AG-3)**

Mocked tests validate logic, not invocations — the runner README's own "Known limitations" records
that `gh api pulls/<pr>` 404'd in reality while 25 tests passed. Run a real dry-run:

```bash
cd /Users/home/repos/todd-skills
HOME_DIR="$(plugins/tribe/scripts/tribe-home.sh .)/campaigns/smoke-paths"
mkdir -p "$HOME_DIR/escalations"
cat > "$HOME_DIR/campaign-state.json" <<'JSON'
{"v":1,"campaign":"smoke-paths","sequence":["C1"],
 "cards":{"C1":{"status":"staged","spec":null,"plan":null,"branch":null,
 "baseSha":null,"pr":null,"mergeSha":null,"sessionId":null,"updatedAt":null}}}
JSON
printf '# Answers\n' > "$HOME_DIR/answers.md"
bun plugins/tribe/scripts/runner/run.ts --repo . --model opus --home "$HOME_DIR" --dry-run
echo "exit=$?"
```

Expected: exit 0, a derived next action printed, and **zero files written** into
`/Users/home/repos/todd-skills` (`git status --porcelain` unchanged). Record the output in the
task report.

- [ ] **Step 11: Commit**

```bash
git add -A
git commit -m "refactor(runner): resolve campaign state under --home, not --repo

campaign-state.json, answers.md, escalations/, campaign-report.*,
.runner.lock and STOP all move under the campaign's machine-local home.
--state, --answers and --escalations-dir are deleted as flags: with one
campaign per --home every artifact has a fixed name, so --home carries
the only environment-specific part. Required flags drop 6 to 3.

run.json keeps its field names and absolute paths, which is what lets
the status viewer keep working with no source change."
```

---

### Task 4: `Campaign: <slug>` commit trailer

Without this, moving `campaign-state.json` out of the repo leaves **no** in-repo record of which
commits belong to a campaign — spec §6, wall AG-1. `SPEC.md` names cards "PR A/B/C/D" and is never
backfilled with PR numbers.

**Files:**
- Modify: `plugins/tribe/scripts/runner/core/brief.ts:55-78` (`executorBrief`)
- Modify: the brief template file at `BRIEF_TEMPLATE_PATH` (resolve the constant in `core/brief.ts`)
- Modify: `plugins/tribe/scripts/runner/core/loop/card-actions.ts:245-253,258-268` (both call sites)
- Test: `plugins/tribe/scripts/runner/core/brief.test.ts`

**Interfaces:**
- Consumes: nothing from Tasks 1-3 beyond a green suite.
- Produces: `executorBrief` gains a `campaignSlug: string` parameter. The slug source is
  `ctx.state.campaign` (the `campaign` field of `CampaignState`), already available at both call
  sites via `CardCtx`.

- [ ] **Step 1: Write the failing test**

Append to `core/brief.test.ts`:

```ts
describe('executorBrief — campaign trailer', () => {
  test('instructs the executor to add a Campaign trailer with the real slug', () => {
    const brief = executorBrief({
      /* reuse this file's existing fixture-builder for the other params */
      campaignSlug: 'kanna-session-import',
    });
    expect(brief).toContain('Campaign: kanna-session-import');
  });

  test('the slug is substituted, never left as a placeholder', () => {
    const brief = executorBrief({ campaignSlug: 'widget-export' });
    expect(brief).not.toContain('CAMPAIGN_SLUG');
    expect(brief).toContain('Campaign: widget-export');
  });
});
```

Read the existing tests in this file first and match their fixture-construction style — do not
invent a new one.

- [ ] **Step 2: Run it and watch it fail**

```bash
cd plugins/tribe/scripts/runner && bun test core/brief.test.ts
```

Expected: FAIL — `campaignSlug` is not a parameter.

- [ ] **Step 3: Add the placeholder to the brief template**

Open the template named by `BRIEF_TEMPLATE_PATH` in `core/brief.ts` and add this section, matching
the template's existing heading style:

```markdown
## Commit trailer (required on every commit)

Every commit you make for this card MUST end with this trailer line, after a blank
line, alongside any other trailers:

    Campaign: CAMPAIGN_SLUG

This is the only in-repo record of which commits belong to this campaign — the
campaign's own state lives outside the repo. Recovery is
`git log --grep="Campaign: CAMPAIGN_SLUG"`. Do NOT add an agent co-author line.
```

- [ ] **Step 4: Substitute it in `executorBrief`**

In `core/brief.ts`, add `campaignSlug: string` to the params interface and substitute it exactly
as the existing `ANSWERS_CONTENT` placeholder is substituted — follow that code, do not invent a
second substitution mechanism.

- [ ] **Step 5: Pass the slug at both call sites**

`core/loop/card-actions.ts:245-253` (resume-failure fallback) and `258-268` (`runCardSession`'s
fresh path) both have `ctx` in scope. Pass `campaignSlug: ctx.state.campaign` at each.

- [ ] **Step 6: Run the suite**

```bash
cd plugins/tribe/scripts/runner && bun run check 2>&1 | tail -20
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(runner): instruct executors to add a Campaign trailer

With campaign state living outside the target repo, the trailer is the
only in-repo record of which commits belong to a campaign. Recovery is
git log --grep=\"Campaign: <slug>\" — no GitHub API, no epic issue, no
label, no docs PR."
```

---

### Task 5: Extend `migrate-campaign-home.sh` to move campaign operational files

**Files:**
- Modify: `plugins/tribe/scripts/migrate-campaign-home.sh`
- Modify: `plugins/tribe/scripts/tests/test-migrate-campaign-home.sh`

**Interfaces:**
- Consumes: the fixed filenames from Task 2 (`campaign-state.json`, `answers.md`, `escalations/`,
  `campaign-report.json`, `campaign-report.md`).
- Produces: nothing consumed by later tasks.

Do **not** write a new migrator. This script already moves `<repo>/.claude/state/<campaign>/reports/*.md`
into `<home>/reports/`, is idempotent, supports `--campaign <slug>` and `--dry-run`, prints
`CONFLICT` and exits non-zero rather than overwriting, and refuses a campaign whose `.runner.lock`
is held by a live pid. Every one of those guarantees must extend to the new file set — that is the
reason to reuse it.

- [ ] **Step 1: Read the script and its test, then write the failing test**

```bash
cd /Users/home/repos/todd-skills
cat plugins/tribe/scripts/migrate-campaign-home.sh
cat plugins/tribe/scripts/tests/test-migrate-campaign-home.sh
```

Add a case to the test harness, matching its existing style, that: builds a fixture repo with
`docs/tribe/planning/demo/{campaign-state.json,answers.md,campaign-report.json,escalations/C1.md}`,
runs the migrator, and asserts all four land under `<home>/` at the fixed names with the repo copies
gone. Add a second case asserting a pre-existing destination file produces `CONFLICT` + non-zero
exit and leaves both copies untouched. Add a third asserting `--dry-run` moves nothing.

- [ ] **Step 2: Run it and watch it fail**

```bash
bash plugins/tribe/scripts/tests/test-migrate-campaign-home.sh
```

Expected: FAIL on the new cases.

- [ ] **Step 3: Extend the script**

Add the operational-file move alongside the existing reports move, reusing the script's existing
conflict check and live-lock refusal helpers rather than duplicating them. Map:

| From (in repo) | To |
| --- | --- |
| `<repo>/docs/tribe/planning/<slug>/campaign-state.json` | `<home>/campaign-state.json` |
| `<repo>/docs/tribe/planning/<slug>/answers.md` | `<home>/answers.md` |
| `<repo>/docs/tribe/planning/<slug>/campaign-report.json` | `<home>/campaign-report.json` |
| `<repo>/docs/tribe/planning/<slug>/campaign-report.md` | `<home>/campaign-report.md` |
| `<repo>/docs/tribe/planning/<slug>/escalations/*.md` | `<home>/escalations/` |

**Leave `SPEC.md` and `plan-*.md` in place** — they are contracts, and relocating them into the
host repo's convention is a human judgement call about which convention applies (spec §3
decision 4). Print a reminder naming each spec/plan file left behind.

- [ ] **Step 4: Run the tests**

```bash
bash plugins/tribe/scripts/tests/test-migrate-campaign-home.sh
```

Expected: PASS, all cases.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tribe): migrate campaign operational files into the campaign home

Extends the existing migrator rather than adding a third one. Specs and
plans are deliberately left in the repo — they are contracts, and which
host convention they belong under is a human call."
```

---

### Task 6: Documentation — runner README, orchestrate-campaign skill, agents

Docs that assert the old behaviour become factually wrong the moment Tasks 1-4 land. The project
rule is explicit: *"When change content, always update docs to keep that updated."*

**Files:**
- Modify: `plugins/tribe/scripts/runner/README.md`
- Modify: `plugins/tribe/skills/orchestrate-campaign/SKILL.md`
- Modify: `plugins/tribe/agents/warchief.md`, `plugins/tribe/agents/shaman.md`
- Modify: `plugins/tribe/README.md`
- Modify: `plugins/tribe/scripts/kanna/list-session-ids.sh` (usage string only)
- Check: `install.sh` at the repo root

**Interfaces:** consumes the final CLI contract from Task 3 and the trailer from Task 4.

- [ ] **Step 1: Update the runner README**

Every one of these currently asserts deleted behaviour — fix each:
- Line 17: *"The campaign instance data (the state JSON, specs, plans, `answers.md`, escalation
  files) lives in the target repo"* → split the two classes: contracts (specs/plans) in the repo,
  operational state under `--home`.
- The Inputs table (28-39): delete the `--state`, `--answers`, `--escalations-dir` rows; update
  `--home` to describe the full layout; fix the "six required flags" sentence (41-43) to three.
- "Run record" (47+): `statePath`/`answersPath`/`escalationsDir` now resolve against `--home`.
- "State file schema" (99+): the file is no longer authored into the repo.
- "Escalation / answers workflow" step 3 (335-338): the best-effort docs-PR commit is **gone** —
  delete the step and renumber.
- "Report contract" (~360): reports write into `<home>`, not "the state file's own directory".
- "Known limitations": delete the D6 sonar-waiver bullet (the waiver no longer exists).
- Architecture/layer list (~460-485): `core/github.ts` and `commit-guard.ts`'s commit machinery are
  gone; `commit-guard.ts` now holds only `persistLocalState`. Add `core/paths.ts` to the core list.

- [ ] **Step 2: Update `orchestrate-campaign/SKILL.md`**

- The Inputs placeholder table: delete `<state-path>`, `<answers-path>`, `<escalations-dir>`; they
  are no longer caller-supplied.
- Stage A step 3-4: the state file and answers scaffold are authored under the campaign home, not
  the repo.
- **Stage A step 5 — "Land the docs PR (state file + answers scaffold + specs/plans) to
  `<target-repo>`'s master" — must become: land specs/plans ONLY, into the host repo's existing
  convention (`docs/specs/` + `docs/plans/` where present), discovered not imposed. State and
  answers are never committed.** This is the change that removes the Stage-A docs PR (#582's
  reason to exist).
- Every `bun "$runner_dir/run.ts"` invocation (Stage B dry-run, Stage B real run, Stage C
  re-trigger): drop the three deleted flags.
- Stage D: `campaign-report.json` is read from the campaign home.

- [ ] **Step 3: Update the agents and plugin README**

```bash
cd /Users/home/repos/todd-skills
grep -rn "docs/tribe\|--state\|--answers\|--escalations-dir" plugins/tribe/agents/ plugins/tribe/README.md
```

Fix every hit. `warchief.md` and `shaman.md` both reference `docs/tribe` paths.

- [ ] **Step 4: Check `install.sh`**

The project rule says new skills/agents/scripts must be added to the installer. This plan adds no
new installed artifact (`core/paths.ts` is internal to the runner; the migrator already exists),
so the expectation is **no change**. Verify and state the finding explicitly:

```bash
cd /Users/home/repos/todd-skills && ls install.sh scripts/install.sh 2>/dev/null
grep -rn "migrate-campaign-home\|runner" install.sh 2>/dev/null
```

If `install.sh` is not at the repo root, find it and report where it lives.

- [ ] **Step 5: Verify no stale reference survives**

```bash
cd /Users/home/repos/todd-skills
grep -rn -- "--state\|--answers\|--escalations-dir\|commitStateAndMerge\|StateCommitFiles\|sonar" \
  plugins/tribe/ --include='*.md' --include='*.ts' --include='*.sh' | grep -v node_modules
```

Expected: zero hits describing current behaviour. Hits inside historical `docs/superpowers/specs/`
files are fine — those are dated records, do not rewrite history.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "docs(tribe): campaign state lives in the campaign home, not the repo

Removes the Stage-A docs PR from the orchestrate-campaign flow: specs
and plans land in the host repo's own convention, campaign state never
gets committed at all."
```

---

### Task 7: C3 change unit for `c3-215-tribe`

`.c3/c3-2-plugins/c3-215-tribe.md` asserts the removed behaviour in six places (spec §8) and will
be factually wrong once Tasks 1-6 land.

**Files:**
- Create: `.c3/adr/adr-20260801-campaign-state-home-migration.md` + change units (via the C3 CLI)
- Modify: `.c3/c3-2-plugins/c3-215-tribe.md` (via `c3 change apply`, NOT by hand)

- [ ] **Step 1: Open the ADR and change units through the C3 skill**

Use `/c3` (operation: change). Per the project's C3 rule, **never hand-write a registry line or a
`.c3/documents/debt/` file.** The drifted rows are listed in spec §8 — carry them verbatim.

- [ ] **Step 2: Apply and verify**

```bash
c3 change apply adr-20260801-campaign-state-home-migration
c3 check --only c3-215
```

Expected: `c3 check` clean.

**Known hazard, evidenced from kanna PR #587:** `c3 change apply` can fail on pre-existing
block-anchor drift, and **`c3 repair` has been observed to silently delete unrelated pending
change-unit patch files repo-wide**. If `apply` blocks, hand-apply the patch text byte-identically
and verify with `c3 check --only c3-215`. **Do not run `c3 repair`.** If you do hit it, check
`git status` for mass deletions and revert with `git checkout --`.

- [ ] **Step 3: Commit**

```bash
git add .c3/
git commit -m "docs(c3): record the campaign-state home migration for c3-215"
```

---

## Self-review

**Spec coverage:** §3 decision 1 → Tasks 2+3. Decision 2 (CLI collapse) → Task 3 Steps 1-3.
Decision 3 (delete auto-commit) → Task 1. Decision 4 (specs/plans to host convention) → Task 6
Step 2 (skill behaviour) + Task 5 Step 3 (migrator leaves them). Decision 5 (trailer) → Task 4.
Decision 6 (Kanna cleanup) → deliberately out of scope, spec §9. §4 path contract → Task 2.
§4 viewer regression → Task 3 Step 9. §5 deletion list → Task 1. §6 trailer → Task 4. §7
migration → Task 5. §8 C3 → Task 7. AG-3 resume parity → Task 3 Step 10. AG-4 loud failure on
missing state → **gap**, see below. AG-5 → every task's `bun run check` step.

**Gap found and closed:** AG-4 ("runner exits non-zero with a named diagnostic when `--home` holds
no state for a campaign it is asked to resume") had no task. It is folded into Task 3 as an extra
step rather than a new task, since it touches the same `loadState` call site:

> **Task 3, Step 8b:** confirm that a missing `<home>/campaign-state.json` produces a named,
> non-zero failure rather than a silent fresh start. Run the Step 10 smoke with the state file
> deleted; expected: non-zero exit naming the expected absolute path. If it silently succeeds or
> throws an unnamed error, add the diagnostic and a test for it in `core/loop/run-loop.test.ts`.

**Type consistency:** `campaignStatePathOf`/`answersPathOf`/`escalationsDirOf`/`escalationPathOf`/
`reportDirOf` are defined in Task 2 and used under exactly those names in Task 3's table.
`persistLocalState` keeps its Task-1 signature into Task 3. `campaignSlug` is the param name in
Task 4 Steps 1, 4, and 5. `CardOutcome.commitResult` is deleted in Task 1 and referenced nowhere
after.
