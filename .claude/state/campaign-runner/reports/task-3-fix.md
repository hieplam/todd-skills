# Task 3-fix report — `verify.ts` fixer pass (F4, F2, F1)

## Environment
- Worktree branch `worktree-agent-a969ae3d587906a9b` started at `48d691e` (one commit behind
  `feat/campaign-runner`). Fast-forwarded via `git merge --ff-only feat/campaign-runner`
  (strict FF, no new content) to land at `2bbfe92` before starting, so `verify.ts`/`state.ts`/
  `types.ts` (Task 2/2b/3's real deliverables) were present.
- `bun install` in `plugins/tribe/runner/`: 107 packages installed, clean.
- Files touched (scope check — exactly the five named in the brief, nothing else):
  `verify.ts`, `verify.test.ts`, `types.ts`, `state.ts`, `state.test.ts`. Confirmed via
  `git diff --stat` (below). Never touched `github.ts`/`github.test.ts`/`session.ts`/
  `brief.ts` (the second Hunter's files).

## F4 — `gh api pulls/<pr>` 404s against the real CLI

### Real-CLI verification transcript (root-cause: every gh/git command in `verify.ts`)

Ran against this repo (`git remote -v` → `origin git@github.com:hieplam/todd-skills.git`,
`gh version 2.92.0`), all read-only:

```
$ gh api pulls/36
{
  "message": "Not Found",
  "documentation_url": "https://docs.github.com/rest",
  "status": "404"
}

$ gh api 'repos/{owner}/{repo}/pulls/36'
{"url":"https://api.github.com/repos/hieplam/todd-skills/pulls/36", ... "merged":true,
 "merge_commit_sha":"48d691efc57bb1dec8402bec23366f7ee94f0e65", ...}
```
Confirms the brief's finding exactly: bare `pulls/<pr>` 404s, `repos/{owner}/{repo}/pulls/<pr>`
resolves correctly and gh substitutes `{owner}`/`{repo}` itself from the repo in cwd.

```
$ git rev-list --parents -n 1 48d691e
48d691efc57bb1dec8402bec23366f7ee94f0e65 b11e53ca9a7030aee7c50ad6e41e424cb558be40 2db41f8dca85e66c885165546013515a3cc1dea5
(2 parents after the sha token — matches a real regular-merge commit; command shape is correct)

$ git merge-base --is-ancestor 48d691e origin/master
(exit 0 — correct: is-ancestor as designed)

$ git worktree list --porcelain
worktree /Users/todd.lam/WORK/_TestScripts/todd-skills
HEAD 2bbfe92e6976308ff78a86b97f721618466e6b3d
branch refs/heads/feat/campaign-runner

worktree /Users/todd.lam/WORK/_TestScripts/todd-skills/.claude/worktrees/agent-a969ae3d587906a9b
HEAD 2bbfe92e6976308ff78a86b97f721618466e6b3d
branch refs/heads/worktree-agent-a969ae3d587906a9b
locked claude agent agent-a969ae3d587906a9b (pid 92140 ...)
(porcelain format + "branch refs/heads/<name>" line shape matches verify.ts's parsing exactly)

$ git ls-remote --heads origin master
48d691efc57bb1dec8402bec23366f7ee94f0e65	refs/heads/master
$ git ls-remote --heads origin no-such-branch-xyz
(empty stdout, exit 0 — non-existent branch = empty output, matches verify.ts's
 remoteStillExists = stdout.trim().length > 0 logic)

$ git diff --name-only b11e53c..2db41f8
docs/superpowers/plans/2026-07-16-campaign-runner.md
docs/superpowers/specs/2026-07-16-campaign-runner-context.md
docs/superpowers/specs/2026-07-16-campaign-runner-design.md
$ git diff b11e53c..2db41f8 -- docs
diff --git a/docs/superpowers/plans/2026-07-16-campaign-runner.md ...
(both commands run and return real, well-formed diff output; shape matches verify.ts's calls)
```

**Root-cause conclusion:** only the `gh api pulls/<pr>` call (point 1, `checkMerged`) is
wrong against the real CLI. Every other `git`/`gh` invocation in `verify.ts` (`git rev-list
--parents`, `git merge-base --is-ancestor`, `git worktree list --porcelain`, `git ls-remote
--heads`, `git diff` / `git diff --name-only`, plus `gh pr checks --json name,bucket,description`
which the Warchief had already verified) is correct as written. Per the brief, `gh pr
create/merge/edit/checks` (repo-aware, in `github.ts`) were not re-checked — out of scope for
this Hunter and already Warchief-verified.

### RED proof

Added `buildIoRecordingCalls` (wraps `buildIo`, records every `cmd` array) and a new test:

```
test('checkMerged calls gh api against repos/{owner}/{repo}/pulls/<pr>, never bare pulls/<pr>')
```

Ran `bun test verify.test.ts` before the fix:
```
error: expect(received).toEqual(expected)
@@ -3,3 +3,3 @@
   "api",
-  "repos/{owner}/{repo}/pulls/42",
+  "pulls/42",
 ]
(fail) verifyShipped — point 1: the real gh api path (F4) > checkMerged calls gh api against
repos/{owner}/{repo}/pulls/<pr>, never bare pulls/<pr>
```
Failed for the right reason: the code issued the old, wrong path.

### Fix

`checkMerged` (`verify.ts`) now builds `apiPath = 'repos/{owner}/{repo}/pulls/' + card.pr` and
calls `['gh', 'api', apiPath]`. `{owner}`/`{repo}` are passed through as gh's own literal
placeholders — never interpolated with an actual repo name (would violate the stateless wall).
All three detail-message strings referencing the old `gh api pulls/<pr>` shorthand were updated
to the corrected path for consistency.

## F2 — `skipping` bucket disagreement between `github.ts` and `verify.ts`

### RED proof

New test:
```
test('a check with bucket "skipping" does not fail checksGreen')
```
Mocked checks: `[{name:'unit-tests',bucket:'pass'}, {name:'path-filtered-e2e',bucket:'skipping'}]`.

Before the fix:
```
error: expect(received).toBe(expected)
Expected: true
Received: false
(fail) verifyShipped — point 4: the skipping bucket is non-blocking (F2) > a check with
bucket "skipping" does not fail checksGreen
```

### Fix

`checkChecksGreen`'s `failing` filter changed from `checks.filter((c) => c.bucket !== 'pass')`
to `checks.filter((c) => c.bucket !== 'pass' && c.bucket !== 'skipping')` — the exact same
predicate `github.ts`'s `isNotPassing` already uses. `github.ts` itself was NOT touched (owned
by the concurrent Hunter).

## F1 — hardcoded `docs/` prefix (stateless-wall violation)

### RED proof

Two new tests under `verifyShipped — point 4: docs-only paths are config, not hardcoded (F1)`:

1. `'a non-"docs/" prefix configured as docsOnlyPaths still waives a matching sonar-504 diff'`
   — diff files under `notes/release-notes.md`, `VerifyConfig.docsOnlyPaths: ['notes/']`.
2. `'an EMPTY docsOnlyPaths list fails closed — nothing counts as docs-only, so a code diff
   never auto-waives'` — diff files under `docs/note.md` (a path that DID match the old
   hardcoded prefix), `docsOnlyPaths: []`.

Before the fix, `bunx tsc --noEmit` itself already failed (the new field doesn't exist yet on
`VerifyConfig`):
```
verify.test.ts(29,5): error TS2353: Object literal may only specify known properties, and
'docsOnlyPaths' does not exist in type 'VerifyConfig'.
verify.test.ts(311,23): error TS2353: ... 'Partial<VerifyConfig>'.
verify.test.ts(326,23): error TS2353: ...
verify.test.ts(340,23): error TS2353: ...
```
And `bun test` (which transpiles but doesn't enforce types) failed at runtime for the right
behavioral reason — the hardcoded `docs/` prefix ignored the new config entirely:
```
(fail) ... 'a non-"docs/" prefix configured as docsOnlyPaths still waives a matching
sonar-504 diff' — Expected: true, Received: false  (notes/ files never matched hardcoded docs/)
(fail) ... 'an EMPTY docsOnlyPaths list fails closed ...' — Expected: false, Received: true
  (docs/note.md matched the hardcoded prefix even with an empty config list)
```
(A third new test, asserting the same `notes/` diff is NOT waived when `docsOnlyPaths` is
`['docs/']`, happened to already pass before the fix — coincidental, since the hardcoded
`docs/` prefix produces the same negative result; it continues to pass after the fix and
guards the negative direction going forward.)

### Fix

- `types.ts`: added `docsOnlyPaths: string[]` to `CampaignState`, following the exact
  `schemaLockPaths` pattern (same doc-comment style, same "campaign config, never hardcoded"
  framing).
- `state.ts`: added `docsOnlyPaths: z.array(z.string())` to `CampaignStateSchema`, immediately
  next to `schemaLockPaths` in the schema — same threading pattern.
- `state.test.ts`: fixture (`fixtureState`) now includes `docsOnlyPaths: ['docs/']`; added one
  round-trip assertion (`expect(state.docsOnlyPaths).toEqual(['docs/'])`) next to the existing
  `schemaLockPaths` assertion.
- `verify.ts`: `VerifyConfig` gained `docsOnlyPaths: string[]`. `isDocsOnlyDiff` now checks
  `config.docsOnlyPaths.some((prefix) => f.startsWith(prefix))` instead of the hardcoded
  `f.startsWith('docs/')`, and returns `false` immediately when `config.docsOnlyPaths.length
  === 0` (before even running the `git diff --name-only` call).
- `verify.test.ts`: `fixtureConfig()` now includes `docsOnlyPaths: ['docs/']` by default (so
  every pre-existing test, whose fixtures use `docs/`-prefixed paths, is unaffected).

### Empty-list decision (required by the brief)

**Decision: an empty `docsOnlyPaths` fails CLOSED — nothing counts as docs-only, so the D6
sonar-504 waiver never fires.**

Justification: `schemaLockPaths` and `docsOnlyPaths` sit on opposite sides of the same
guard's logic, so the "empty means no-op" convention from `schemaLockPaths` does NOT
transfer safely:
- `schemaLockPaths` empty ⇒ the schema-lock DIFF check is vacuously empty ⇒ the guard passes
  (nothing to protect ⇒ no violation possible). Safe: an empty list narrows what can fail.
- `docsOnlyPaths` empty, if it meant "everything is docs-only" (the naive transfer of the
  same convention), would WIDEN what can be waived to include everything — i.e. an
  unconfigured campaign would auto-waive a red check on ANY diff, including pure code
  changes. That is exactly what spec §D6 forbids absolutely ("Code PRs... never auto-waive").
  An empty list must therefore mean "nothing is docs-only" (fails closed), the opposite
  direction from `schemaLockPaths`'s no-op default.
- This is proved by the RED-then-GREEN test above: with `docsOnlyPaths: []` and a diff under
  `docs/note.md` (a path that unambiguously WAS "docs" under the old hardcoded behavior), the
  waiver must NOT fire — `checksGreen.passed` is `false` and the detail message says the
  diff is "NOT docs-only".

## Gates (verbatim)

`bun test` (full suite, 5 files):
```
bun test v1.3.13 (bf2e2cec)

 55 pass
 0 fail
 148 expect() calls
Ran 55 tests across 5 files. [157.00ms]
```
(50 prior tests + 5 new: 1 F4 + 1 F2 + 3 F1.)

`bunx tsc --noEmit`:
```
(no output — clean, exit 0)
```

## Stateless-capability wall check

```
$ grep -n "ai-dict\|/Users/\|todd-skills\|hieplam" verify.ts verify.test.ts types.ts state.ts state.test.ts
(no matches)
```
No repo names, no absolute paths, no model names, no campaign-specific values. `{owner}`/
`{repo}` in the `gh api` call are gh's own literal placeholders (required by the brief, not a
violation).

## Scope check

```
$ git diff --stat
 plugins/tribe/runner/state.test.ts  |   2 +
 plugins/tribe/runner/state.ts       |   1 +
 plugins/tribe/runner/types.ts       |   4 ++
 plugins/tribe/runner/verify.test.ts | 102 ++++++++++++++++++++++++++++++++++++
 plugins/tribe/runner/verify.ts      |  39 ++++++++++----
 5 files changed, 139 insertions(+), 9 deletions(-)
```
Exactly the five files the brief named. `github.ts`, `github.test.ts`, `session.ts`,
`brief.ts` untouched.

## Plan-file checkbox note

`docs/superpowers/plans/2026-07-16-campaign-runner.md` has no `- [ ]`/`- [x]` checkbox items
under Task 3 (or anywhere) — same as Task 3's original report noted (tasks are plain `###
Task N` headers). Nothing to tick, consistent with prior Hunters' precedent on this plan file.

## Commit

See final commit hash in the Hunter's report-back message.

## Status

DONE. All 55 tests pass (50 baseline + 5 new), `tsc --noEmit` clean, scope held to the five
named files, all three findings reproduced RED-first and fixed GREEN.
