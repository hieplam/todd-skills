# Task 3 report — `verify.ts` (D3 six-point SHIPPED replay)

## Branch / commit
- Worktree branch (fast-forwarded to `feat/campaign-runner` @ `78d2591` first — this
  worktree's own branch had fallen one commit behind the parent branch's Task 1/2 commits;
  fast-forwarding was a no-op merge, no new content):
  `worktree-agent-a42326af69ca996c7`
- Commit: see "Commit" section below for the final SHA (recorded after `git commit`).

## Files touched (scope check)
Only the two files this task owns:
- `plugins/tribe/runner/verify.ts` (implementation)
- `plugins/tribe/runner/verify.test.ts` (new test file)

`types.ts`, `state.ts`, `package.json`, and every other module were left untouched (verified
via `git diff --stat` before commit — only `verify.ts`/`verify.test.ts` appear).

## TDD proof (RED → GREEN)

1. Wrote `verify.test.ts` (15 tests) against the still-stubbed `verify.ts`
   (`export {};`).
2. Ran `bun test verify.test.ts` — failed for the right reason (the feature doesn't exist
   yet, not a typo):
   ```
   verify.test.ts:
   # Unhandled error between tests
   -------------------------------
   SyntaxError: Export named 'verifyShipped' not found in module
   '.../plugins/tribe/runner/verify.ts'.
   -------------------------------
   0 pass
   1 fail
   1 error
   Ran 1 test across 1 file.
   ```
3. Implemented `verify.ts`. Re-ran `bun test verify.test.ts` — GREEN:
   ```
   15 pass
   0 fail
   30 expect() calls
   Ran 15 tests across 1 file.
   ```

## Exported API (`plugins/tribe/runner/verify.ts`)

```ts
export interface ExecResult { stdout: string; stderr: string; exitCode: number; }

export interface VerifyIO {
  exec(cmd: string[], options?: { cwd?: string }): Promise<ExecResult>;
  readFile(resolvedPath: string): Promise<string> | string;
}

export interface VerifyConfig {
  repoRoot: string;
  schemaLockPaths: string[];
}

export type VerifyPointId =
  | 'merged'
  | 'mergeCommitTwoParents'
  | 'mergeShaAncestorOfMaster'
  | 'checksGreen'
  | 'worktreeAndBranchGone'
  | 'schemaGuard';

export interface VerifyPointResult { id: VerifyPointId; passed: boolean; detail: string; }

export interface VerifyResult {
  shipped: boolean;               // true iff every point passed
  points: VerifyPointResult[];    // all six, always present, in fixed order
  failedPoints: VerifyPointId[];  // convenience projection — every failing point's id
}

export function readAllowsSchemaChange(planContent: string): boolean;
export function verifyShipped(card: Card, config: VerifyConfig, io: VerifyIO): Promise<VerifyResult>;
```

`Card` is imported (read-only) from the existing `./types.ts` — nothing there was edited.
`VerifyConfig` is intentionally a narrow LOCAL type (repoRoot + schemaLockPaths only), not
`CampaignState`, per the brief's "define verify-specific types locally" instruction and the
"don't touch types.ts" wall.

## The io seam shape

Two injected functions, both on `VerifyIO`:
- `exec(cmd: string[], options?: { cwd?: string })` — every `gh`/`git` invocation goes
  through this. `verify.ts` never imports `child_process`, never imports `fs`, never does
  network I/O directly. Every call always passes `{ cwd: config.repoRoot }` explicitly.
  A rejected `io.exec` call is caught internally (`run()` helper) and folded into a
  synthetic `{ exitCode: 1 }` result rather than propagating — so a network blip surfaces
  as a normal failed point (`merged` in the test I wrote for this), never a thrown
  exception.
- `readFile(resolvedPath: string)` — reads the card's plan file, already joined against
  `config.repoRoot` by this module (callers of `readFile` never see a bare relative path).
  Used only by the point-6 schema guard to extract `allowsSchemaChange` from the plan's
  YAML front matter.

Exact commands issued (documented in code, and this is what the mocked test matrix
matches on):
1. `gh api pulls/<pr>` → JSON `{ merged: boolean, merge_commit_sha: string|null }`.
2. `git rev-list --parents -n 1 <mergeSha>` → parent count = tokens − 1.
3. `git merge-base --is-ancestor <mergeSha> origin/master` → exit 0 = ancestor.
4. `gh pr checks <pr> --json name,bucket,description` → JSON array of
   `{ name, bucket, description? }`; `bucket !== 'pass'` = failing.
5. `git worktree list --porcelain` (worktree still present if a `branch refs/heads/<branch>`
   line matches) + `git ls-remote --heads origin <branch>` (non-empty stdout = branch still
   on remote).
6. `git diff <baseSha>..origin/master -- <schemaLockPaths...>` → non-empty stdout = a
   schema-lock path changed. Additionally, for D6 flake classification only:
   `git diff --name-only <baseSha>..origin/master` → every changed path must start with
   `docs/` to count as "docs-only".

## D6 flake classification, how it's modelled

`isSonar504Signature(check)` — `true` iff `check.name` matches `/sonarcloud/i` AND
`check.description` contains `504` (the bootstrap-throttle signature). `checkChecksGreen`
only ever calls this when there is exactly **one** failing check (any other combination of
reds is a real failure, never inspected for the signature). If that single check matches
the signature, it additionally requires `isDocsOnlyDiff(card.baseSha, ...)` — every file in
`git diff --name-only <baseSha>..origin/master` starting with `docs/` — before treating it
as waived. A code diff with the exact same failing check is reported as a **failed**
`checksGreen` point (asymmetry from spec §D6: a code diff never auto-waives). Both
directions are asserted in `verify.test.ts`
(`'sonar-504 signature + docs-only diff is classified as a waivable flake (passes)'` and
`'sonar-504 signature on a CODE diff is NOT waivable'`).

## Schema guard / front-matter reader

`readAllowsSchemaChange(planContent)` looks for a leading `---`-delimited block and, inside
it, a line matching `/^allowsSchemaChange:\s*(true|false)\s*$/m`. No block, or a block
without the key, returns `false` — the binding convention ("absent front-matter or absent
key ⇒ false", guard enforced). This is intentionally not a general YAML parser — it only
ever extracts this one boolean. Covered directly by 4 unit tests plus 3 `verifyShipped`
tests (violation with no front matter, violation with front matter present but no key,
front matter with `allowsSchemaChange: true` waiving a real diff).

If `config.schemaLockPaths` is empty, the guard is a no-op (`passed: true`, "no schema-lock
paths configured"). If `card.baseSha` is null the guard fails closed (cannot diff without a
base). If `card.plan` is null, `allowsSchemaChange` defaults to `false` (same as "absent
front matter") since there's nothing to read.

## VerifyResult shape and multi-failure reporting

`verifyShipped` always runs and reports all six points — no short-circuiting. A card that
fails a squash-merge check (point 2), a real red CI check (point 4), and a schema-lock
violation (point 6) simultaneously reports `failedPoints: ['mergeCommitTwoParents',
'checksGreen', 'schemaGuard']` while points 1/3/5 are still individually reported as
`passed: true` — asserted directly in the `'every failed point is named, not just the
first'` test.

## Tests written (`verify.test.ts`, bun test) — 15 tests

- happy path — all six points pass
- point 2: 1-parent merge commit (squash/rebase) fails `mergeCommitTwoParents`
- point 4: a real red check (non-sonar) fails `checksGreen`
- point 4: sonar-504 signature + docs-only diff → waivable (passes)
- point 4: sonar-504 signature + CODE diff → NOT waivable (fails)
- point 5: worktree still present → fails
- point 5: remote branch still present → fails
- point 6: schema-lock diff non-empty, no allow flag → fails
- point 6: missing front-matter defaults `allowsSchemaChange` to `false` → guard stays
  enforced, fails
- point 6: front-matter `allowsSchemaChange: true` waives a real diff → passes
- `readAllowsSchemaChange` unit tests (no front matter / key absent / true / false) — 3
  assertions across 3 tests
- multi-failure: every failed point named, not just the first
- never-throws: a rejected `io.exec` call surfaces as a failed `merged` point, not a thrown
  error

All commands in the mocked matrix are fully synthetic (`gh`, `git` are never actually
invoked) — the mock dispatcher in the test file matches on `cmd[0]`/`cmd[1]` tokens and
returns canned `ExecResult`s.

## Gates (verbatim)

`bun install` (already run for the worktree by Task 1/2; re-confirmed clean):
```
bun install v1.3.13 (bf2e2cec)

+ @types/bun@1.3.14
+ typescript@7.0.2
+ @anthropic-ai/claude-agent-sdk@0.3.211
+ zod@4.4.3

107 packages installed [152.00ms]
```

`bun test` (full suite, both state.test.ts and verify.test.ts):
```
bun test v1.3.13 (bf2e2cec)

 25 pass
 0 fail
 52 expect() calls
Ran 25 tests across 2 files. [52.00ms]
```

`bunx tsc --noEmit`:
```
(no output — clean)
```

## Stateless-capability wall check

```
$ grep -ni "ai-dict" verify.ts verify.test.ts
(no matches)
$ grep -n "/Users/" verify.ts verify.test.ts
(no matches)
```
No repo names, no absolute paths, no model names, no campaign-specific values anywhere in
`verify.ts` or `verify.test.ts`. Fixtures use the neutral `C1` card / `docs/.../c1-plan.md`
convention established by Task 2's `state.test.ts`.

## Note on the plan file's checkboxes

`docs/superpowers/plans/2026-07-16-campaign-runner.md` has no `- [ ]` checkbox items —
tasks are plain `### Task N` headers, and Task 1's and Task 2's commits (`b264495`,
`78d2591`) did not add or tick any checkboxes either. I followed that precedent and did not
invent checkbox syntax the plan doesn't use.

## Worktree branch note

This worktree's branch (`worktree-agent-a42326af69ca996c7`) started one commit behind the
brief's stated parent (`feat/campaign-runner @ 78d2591`) — it was sitting at `48d691e`
(the merge commit just before Task 1/2 landed). I fast-forwarded it to `78d2591` via
`git merge --ff-only feat/campaign-runner` (a strict fast-forward, zero new content, purely
catching this worktree branch up) before starting Task 3, so `types.ts`/`state.ts` (Task
2's real deliverables) were present to import from.

## Status

DONE. All tests pass, `tsc --noEmit` clean, scope held to `verify.ts` + `verify.test.ts`
only.
