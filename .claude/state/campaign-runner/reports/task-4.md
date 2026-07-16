# Task 4 report — `github.ts` deterministic docs-PR helper (campaign runner)

Brief: dispatched by Warchief, Task 4/7 of `docs/superpowers/plans/2026-07-16-campaign-runner.md`.
Worktree branch reset to `feat/campaign-runner` @ `78d2591` first (the worktree had started
from an older base commit, `48d691e`, still an ancestor of `feat/campaign-runner` with a
clean tree — `git reset --hard feat/campaign-runner` before any work, no work lost).

## TDD sequence (RED -> GREEN -> REFACTOR)

1. Read spec §D6 ("State commits and the flake rule, codified") and §D5 ("Escalation: the
   loop stops, the human decides" — the "survives a failed commit" clause), plan Task 4 +
   Global constraints, `types.ts`/`state.ts` (Task 2, for style precedent), `verify.ts`
   (Task 3 placeholder — confirmed untouched, still `export {}`).
2. Checked real `gh` CLI flags/JSON fields before designing the exec command shapes (this
   machine has `gh version 2.92.0`): `gh pr checks --help` confirms `--json` fields include
   `bucket` (categorizes `state` into `pass`/`fail`/`pending`/`skipping`/`cancel`); `gh pr
   merge --help` confirms `-m/--merge` vs `-s/--squash` are distinct flags and `-d
   /--delete-branch` deletes both local+remote; `gh pr create`/`gh pr edit --help` confirm
   `--title`/`--body`/`--base`/`--head`. Used these for realistic command construction.
3. Wrote `github.test.ts` first (9 tests) importing `commitStateAndMerge`, `D6_MAX_RETRIES`,
   `D6_RETRY_SPACING_MS`, and the `CheckStatus`/`ExecResult`/`GithubConfig`/`GithubIO` types
   from `./github.ts`, none of which existed yet (`github.ts` was still the Task 1 placeholder
   `export {}`).
4. **RED**, confirmed for the right reason (missing exports, not a typo):
   ```
   $ bun test github.test.ts
   github.test.ts:
   # Unhandled error between tests
   SyntaxError: Export named 'D6_RETRY_SPACING_MS' not found in module
   '.../plugins/tribe/runner/github.ts'.
    0 pass
    1 fail
    1 error
   Ran 1 test across 1 file. [23.00ms]
   ```
5. **GREEN**: implemented `github.ts` (types + `commitStateAndMerge` + the D6 poll/retry
   helper + the sonar-504 classifier). Re-ran — all 9 tests pass on the first implementation
   attempt; no red/green cycling was needed after the initial write (see Gate output below).
6. **REFACTOR**: none needed beyond the initial write — kept the poll loop as one small
   `pollChecksUntilSettled` helper and the sonar-504 check as its own named predicate
   (`isSonar504Advisory`) rather than inlining either into `commitStateAndMerge`, for
   readability. Re-ran full suite + `tsc` after — still clean.

## API exposed (`github.ts`, all exported, defined locally per the brief — `types.ts`
unmodified)

```ts
export interface ExecResult { exitCode: number; stdout: string; stderr: string }

export interface GithubIO {
  exec(args: string[], opts?: { cwd?: string }): Promise<ExecResult>;
  sleep(ms: number): Promise<void>;
}

export interface GithubConfig {
  repoRoot: string;   // target repo root, cwd for every git/gh call — an input
  card: string;        // branch is `campaign-state/<card>`
  prBody: string;      // PR body text, the TARGET REPO's own conventions — an input
  baseBranch: string;  // e.g. 'master' — also an input, never hardcoded
}

export interface CheckStatus { name: string; bucket: string; description: string }

export interface MergedResult { outcome: 'merged'; branch: string; pr: number; attempts: number; waived: boolean }
export interface EscalateResult { outcome: 'escalate'; branch: string; pr: number; reason: string; failedChecks: CheckStatus[] }
export interface CommitFailedResult { outcome: 'commit_failed'; step: string; reason: string }
export type CommitStateAndMergeResult = MergedResult | EscalateResult | CommitFailedResult;

export const D6_MAX_RETRIES = 3;
export const D6_RETRY_SPACING_MS = 10 * 60 * 1000;

export async function commitStateAndMerge(
  files: string[],
  title: string,
  config: GithubConfig,
  io: GithubIO,
): Promise<CommitStateAndMergeResult>;
```

`files: string[]` is a list of **paths already written to disk** by the caller (loop.ts,
Task 6) relative to `config.repoRoot` — this task's scope is the git/gh plumbing around an
already-serialized state file, not writing state to disk (that stays `state.ts`'s / the
loop's job, keeping this module's only seam `io.exec`/`io.sleep`, no `io.writeFile` needed).

## io/sleep seam shapes

- `io.exec(args: string[], opts?: { cwd?: string })` — every git/gh invocation is one call
  to this, argv form (no shell string), always passing `{ cwd: config.repoRoot }`. No
  `child_process` import anywhere in `github.ts`.
- `io.sleep(ms: number): Promise<void>` — the ONLY place the D6 10-minute retry spacing is
  observed; production code always calls `io.sleep(D6_RETRY_SPACING_MS)` (never a raw
  `setTimeout`/`Bun.sleep` import), so tests inject a `mock` that resolves immediately and
  records the `ms` argument instead of actually waiting. Verified in the "retry-then-green"
  test: asserts `sleeps` equals exactly `[D6_RETRY_SPACING_MS, D6_RETRY_SPACING_MS]` and that
  the whole test completes in well under 2 seconds (not 20 real minutes).

## Outcome union chosen

`CommitStateAndMergeResult = MergedResult | EscalateResult | CommitFailedResult`, exactly the
three named in the brief (`merged | escalate | commit_failed`), discriminated on `outcome`.
No thrown error anywhere in `commitStateAndMerge` — the whole body (including the retry poll
loop) is wrapped in a `try { ... } catch (err) { return { outcome: 'commit_failed', step:
'unexpected', reason: ... } }` so even an `io.exec` that itself throws (not just returns a
nonzero exit code) still comes back as a structured outcome. Covered by the dedicated test
"a failed commit does not throw even when io.exec itself throws for an unrelated step".

## D6 retry + waiver policy encoding

`pollChecksUntilSettled(io, cwd, pr)`:
- Calls `gh pr checks <pr> --json name,bucket,description` (real gh CLI flag, verified above).
- A check counts as "not yet green" if `bucket !== 'pass' && bucket !== 'skipping'` (pending
  checks retry exactly like failures — never merges on an ambiguous state).
- Loop: attempt, check `settled`; if not settled and `attempts <= D6_MAX_RETRIES` (3), call
  `io.sleep(D6_RETRY_SPACING_MS)` and attempt again. Total polls when never green = 4 (1
  initial + 3 retries); total sleeps = 3 — matches spec §D6 "retry a failed check up to 3
  times (10-min spacing)" literally.
- If the `gh pr checks` command itself fails (nonzero exit) or returns unparseable JSON, that
  attempt is folded into "not yet green" (never silently treated as all-clear) via a
  `queryOk` flag and a `safeParseChecks` that never throws.
- After the loop settles or the retry budget is exhausted: if every check is green, proceed to
  merge (`waived: false`). Otherwise, only if **every remaining failing check** matches
  `isSonar504Advisory` (bucket `fail`, name contains "sonar" case-insensitively, description
  contains "504") does the waiver fire — the "diff is docs-only" half of §D6's exception
  condition is satisfied **structurally**: this helper's whole contract is committing only
  campaign state files (never code), so it needs no extra schema-lock/diff check duplicating
  `verify.ts`'s D3 logic. On waiver: `gh pr edit <pr> --body <prBody + waiver note>` records
  the exception in the PR body (note text includes "exception" and "504", asserted by test)
  before merging. If **any** other check is still red (or the checks query itself never
  succeeded), returns `{ outcome: 'escalate', ..., failedChecks }` and merge is never called
  — asserted directly by the "non-advisory red" and "mixed red" tests scanning the whole
  recorded call log for any `gh pr merge`/`gh pr edit` invocation.
- Merge command is always `['gh', 'pr', 'merge', String(pr), '--merge', '--delete-branch']` —
  `-d/--delete-branch` (verified via `gh pr merge --help`) deletes both the local and remote
  branch in one call; `--squash`/`--rebase` never appear anywhere in the source. Asserted by
  the green-path test both structurally (`toEqual` the exact argv) and negatively
  (`calls.some(c => c.includes('--squash'))` is `false` across the whole call log, in every
  test).
- After a successful merge: `git checkout <baseBranch>` then `git pull --ff-only origin
  <baseBranch>` — best-effort (not gated on exit code, since the PR is already merged on
  GitHub by this point; a local sync hiccup is not a commit failure and there was no test in
  the brief requiring it to be one).

## Stateless-capability wall check

```
$ grep -rin "ai-dict" github.ts github.test.ts        # exit 1, no output
$ grep -Ein "sonnet|opus|haiku|claude-3|claude-4" github.ts github.test.ts   # exit 1, no output
$ grep -n "/Users" github.ts github.test.ts            # exit 1, no output
```
No repo names, absolute paths, model names, or campaign-specific values anywhere in either
file. `config.repoRoot` in tests is a neutral placeholder (`/sample-repo-root`), `config.card`
is `'C2'` (generic), `config.prBody` is a generic sample sentence — deliberately not
ai-dict's "Testing performed: docs-only state update" example text from the plan (per the
brief: ignore every ai-dict mention, PR body is a pure caller-supplied input).

## Scope check

Only `github.ts` and `github.test.ts` were touched (plus this report file). `types.ts`,
`package.json`, `state.ts`, `verify.ts`, `loop.ts`, `run.ts`, `session.ts`, `brief.ts` are
untouched (confirmed via `git status --porcelain` before commit — only `github.ts` modified
and `github.test.ts` untracked). All github-specific types (`ExecResult`, `GithubIO`,
`GithubConfig`, `CheckStatus`, `MergedResult`, `EscalateResult`, `CommitFailedResult`,
`CommitStateAndMergeResult`) are defined and exported locally in `github.ts`, per the brief.

## Gate output (verbatim, run from `plugins/tribe/runner/`)

### `bun test` (full suite, both `state.test.ts` and `github.test.ts`)
```
$ bun test
bun test v1.3.13 (bf2e2cec)

 19 pass
 0 fail
 69 expect() calls
Ran 19 tests across 2 files. [73.00ms]
```
(`github.test.ts` alone: `9 pass / 0 fail`, `47 expect() calls`, `17.00ms`.)

### `bunx tsc --noEmit`
```
$ bunx tsc --noEmit
(no output)
```
Exit code: 0.

## Ambiguity flagged (not blocking — reported per Method, no guess made)

1. **`files` parameter shape.** The brief's signature `commitStateAndMerge(files, title,
   config, io)` doesn't spell out whether `files` are paths-already-on-disk (this call just
   does `git add`) or `{path, contents}` pairs this call must also write. I read it as the
   former — paths only — because (a) the brief's seam list only names `io.exec`/`sleep`, no
   `io.writeFile`, and (b) it keeps this helper's job purely the git/gh plumbing, matching its
   name ("docs-PR helper") and the plan's framing ("commit state via its own docs PR" — the
   writing-to-disk step is naturally `state.ts`'s `serializeState` + the loop's own `fs`
   write in Task 6, not duplicated here). If Task 6 instead expects `commitStateAndMerge` to
   also write file contents, that's a contained addition to this file (an `io.writeFile`
   entry + a loop over `files` before `git add`) — flagged here rather than guessed silently.
2. **`baseBranch`/remote as config vs. hardcoded.** I kept `baseBranch` as an explicit
   `GithubConfig` field (not hardcoded `'master'`) since branch-naming conventions differ
   across target repos and the design's own "stateless capability" wall argues for treating
   it as an input. I hardcoded the git remote name `'origin'` directly (not a config field) —
   this is a git-tooling convention, not a campaign/repo-specific value, so it stays out of
   `GithubConfig` to keep the input surface minimal per the brief's "no scope creep" anti-goal.
   Flagging both choices here in case the Warchief wants `origin` promoted to config too.

Neither of these forced a product/What-Why decision or contradicted the repo, so I proceeded
rather than blocking.

## Commit

`<filled in after commit>`
