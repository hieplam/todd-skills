# Task 4 report — Make `brief.ts` pure (inject the template)

**Status: NEEDS_CONTEXT — STOPPED before commit.** All Task-4 edits per the plan are applied
and working-tree-present (uncommitted). tsc is clean. Two tests fail, both in `report.test.ts`
— a genuine **third fallout** the brief did not name and that touches a file the brief's
"Stage only" list explicitly excludes. Per my brief's own rule ("Unexpected mismatch beyond
the two prescribed fallouts... → STOP, report NEEDS_DIRECTION, no commit"), I stopped instead
of silently widening scope to a file the brief never listed.

## What I did, in order

1. **Flipped the Task-4 todo** in `structure.test.ts` (`test.todo('brief.ts is pure...')` →
   live `test`).
2. **RED proof — ran `bun test structure.test.ts`, saw it fail for the right reason:**

```
 61 |   });
 62 |   test('session.ts is pure: no SDK import outside session.adapter.ts', () => {
 63 |     expect(allImportsOf('session.ts').includes('@anthropic-ai/claude-agent-sdk')).toBe(false);
 64 |   });
 65 |   test('brief.ts is pure: no node:fs import', () => {
 66 |     expect(allImportsOf('brief.ts').filter((s) => WORLD.includes(s))).toEqual([]);
                                                                           ^
error: expect(received).toEqual(expected)

- []
+ [
+   "node:fs",
+ ]

      at <anonymous> (structure.test.ts:66:71)
(fail) structural contract > brief.ts is pure: no node:fs import [5.46ms]

 6 pass
 1 todo
 1 fail
```

3. **`brief.ts` edits (per plan Step 3):**
   - Deleted `import { readFileSync } from 'node:fs';`.
   - Deleted `loadTemplate()`.
   - Replaced private `TEMPLATE_PATH` with `export const BRIEF_TEMPLATE_PATH = join(import.meta.dir, 'brief-template.md');` (same doc comment as the plan).
   - `executorBrief` signature gained a 4th param `template: string`; `renderTemplate(loadTemplate(), {...})` → `renderTemplate(template, {...})`.

4. **`loop.ts` edits (per plan Step 4):**
   - Import: `import { executorBrief } from './brief.ts';` → `import { BRIEF_TEMPLATE_PATH, executorBrief } from './brief.ts';`.
   - `ResolvedConfig` gained `briefTemplate: string;` (after `answersContent: string;`).
   - In `runLoop`'s resolved-construction block: added `const briefTemplate = String(await io.readFile(BRIEF_TEMPLATE_PATH));` and threaded it into `resolved`.
   - **Only 2 `executorBrief(...)` call sites exist in the current `loop.ts`** (both inside `runCardSession`) — not 3 as the brief's file list suggested (a 3rd hit at line ~637 is a doc-comment reference to the API shape, not a call). Both real call sites updated to pass the 4th arg (`resolved.briefTemplate`).

5. **Ran `bun test` to find the fallouts** — found **three** failure clusters, not two:
   - `brief.test.ts` — 4 tests, `executorBrief(...)` missing 4th arg → `TypeError: undefined is not an object (evaluating 'template.replace')`.
   - `loop.test.ts` — 2 tests, mocked `readFile` had no fixture for `BRIEF_TEMPLATE_PATH` → `readFile: no fixture for .../brief-template.md`.
   - **`report.test.ts` — 2 tests, same missing-fixture error, from two of its own inline `LoopIO` builders** (lines ~540 and ~634) that drive the real `runLoop`. This file is not in the brief's fallout description or its "Stage only" list.

6. **Fixed the two prescribed fallouts exactly as Steps 6–7 say**, to isolate whether they were sufficient:
   - `brief.test.ts`: added `import { readFileSync } from 'node:fs';`, `import { BRIEF_TEMPLATE_PATH, executorBrief } from './brief.ts';`, `const TEMPLATE = readFileSync(BRIEF_TEMPLATE_PATH, 'utf8');`, and appended `, TEMPLATE` as the 4th arg to all 4 `executorBrief(...)` calls.
   - `loop.test.ts`: confirmed only **one** fixture IO builder exists (`buildMockLoopIo`, single `readFile` mock at line 412 pre-edit). Added `import { BRIEF_TEMPLATE_PATH } from './brief.ts';` and, inside that one `readFile` mock, a branch before the existing lookup:
     `if (p === BRIEF_TEMPLATE_PATH) return '# Executor brief for {{CARD_ID}}\n{{ANSWERS_CONTENT}}';`
     (uses only 2 placeholders — a valid subset per the plan's own note; no unknown-placeholder error was thrown.)
   - Re-ran `bun test` — `brief.test.ts` and `loop.test.ts` now fully green; `report.test.ts` still fails, 2 tests, unchanged, both citing `no fixture for .../brief-template.md` at its own `readFile` lines (540, 634).

7. **Confirmed `report.test.ts` is a genuine 3rd fallout, not something the prescribed fixes happen to also cover:**

```
report.test.ts:
error: no fixture for .../brief-template.md
      at readFile (report.test.ts:542:40)
      at runLoop (loop.ts:884:43)
      at async <anonymous> (report.test.ts:573:30)
(fail) writeReport — reflects persisted state even when the state-commit PR failed > a card that ships locally is reported "shipped" even though its state-commit push failed

error: no fixture for .../brief-template.md
      at readFile (report.test.ts:636:40)
      at runLoop (loop.ts:884:43)
      at async <anonymous> (report.test.ts:668:30)
(fail) writeReport — W-F5: last-tick blocked reconciliation reaches the report as blocked, not not_reached > ...

 177 pass
 1 todo
 2 fail
 464 expect() calls
Ran 180 tests across 9 files. [236.00ms]
```

`bunx tsc --noEmit` at this point is **silent** (clean) — confirmed separately.

## Why I stopped instead of just also patching `report.test.ts`

- The brief names exactly two fallout files (`brief.test.ts`, `loop.test.ts`) and an explicit
  "if there are multiple fixture IO builders, patch each" carve-out — but that carve-out reads
  as being about `loop.test.ts` having multiple builders internally (it doesn't; it has one),
  not about a *different test file* needing the same surgery.
- The brief's **stage list is explicit and exhaustive**: `brief.ts loop.ts brief.test.ts
  loop.test.ts structure.test.ts`. `report.test.ts` is not on it. Committing a change to a file
  outside the authorized stage list, for a fix the brief never described, is exactly the
  "no scope creep" anti-goal even though the fix itself is small and mechanical (same one-line
  branch pattern as `loop.test.ts`'s).
- The brief's own escape hatch says: "Unexpected mismatch (beyond the two prescribed fallouts
  and the off-by-one note) → STOP, report NEEDS_DIRECTION, no commit." Two tests in a file
  outside the stage list, failing for a reason the brief didn't anticipate, is precisely that
  case.

## Suggested minimal fix (for the Warchief to authorize, not applied)

In `report.test.ts`, both inline `LoopIO` fixtures (the ones at the current `readFile: (p) => {
const c = written.get(p); ...}` blocks, lines ~540 and ~634) need the same branch added before
their existing lookup, e.g.:

```ts
readFile: (p) => {
  if (p === BRIEF_TEMPLATE_PATH) return '# Executor brief for {{CARD_ID}}\n{{ANSWERS_CONTENT}}';
  const c = written.get(p);
  if (c === undefined) throw new Error(`no fixture for ${p}`);
  return c;
},
```

plus `import { BRIEF_TEMPLATE_PATH } from './brief.ts';` at the top of `report.test.ts`, and
adding `report.test.ts` to the commit's staged-files list.

## Current working-tree state (uncommitted, nothing staged/committed)

```
 M brief.test.ts
 M brief.ts
 M loop.test.ts
 M loop.ts
 M structure.test.ts
```

All edits above are present in the working tree exactly as described, ready for a follow-up
Hunter (or this same session, once the brief is amended) to add the `report.test.ts` branch and
commit. No commit was made.

## Gate outputs at time of stopping

`bunx tsc --noEmit` → silent, exit 0 (clean).

`bun test` → **177 pass / 1 todo / 2 fail** (see full failure transcript in step 7 above). The 2
failures are both in `report.test.ts`, both `no fixture for .../brief-template.md`, both feeding
into the real `runLoop`.

## Deviations from the brief

1. Only 2 `executorBrief(...)` call sites exist in current `loop.ts`, not 3 — the brief's "3
   executorBrief call sites" count includes a doc-comment reference at line ~637
   (`existing executorBrief(card, state, answersContent) API's answersContent param`), not a
   real call. Both real calls were updated; the comment was left untouched (not in scope, still
   accurate in spirit).
2. **The blocking deviation:** a 3rd fallout file, `report.test.ts` (2 tests, its own inline
   `LoopIO` fixtures), which the brief did not name and which is outside the authorized stage
   list. This is why I stopped.

## Question for the Warchief

Please confirm: should `report.test.ts` be added to Task 4's scope (files list + stage list),
with the one-line `readFile` branch above applied to both of its inline fixtures? Once
confirmed/amended, I (or a fresh Hunter) can apply that one change, re-run `bunx tsc --noEmit &&
bun test` (expected 179 pass / 1 todo / 0 fail per the brief's stated gate), and commit exactly
as the brief's commit step specifies.
