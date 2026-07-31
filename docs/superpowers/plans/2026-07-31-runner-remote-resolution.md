# Campaign runner: resolve the PR-target remote (`--remote`, default `origin`)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace all ten hardcoded literal `'origin'` git-remote references in
`plugins/tribe/scripts/runner` with a single resolved `remote` configuration value (new
`--remote` CLI flag, default `'origin'` — zero behavior change for every existing campaign),
per `docs/superpowers/specs/2026-07-31-runner-remote-resolution-design.md`.

**Architecture:** `remote: string` joins `baseBranch` as a resolved/carried config value:
`RunLoopConfig.remote` (parsed once in `cli/main.ts`, default `'origin'`) flows straight
through to every consumer that already receives `RunLoopConfig`/`ResolvedConfig`
(`phase.ts`'s `DerivePhaseConfig`, `card-actions.ts`'s direct `resolved.remote` reads) and is
threaded into the two narrower configs that don't currently carry it at all
(`verify.ts`'s `VerifyConfig` gains `remote` + `baseBranch`; `github.ts`'s `GithubConfig` gains
`remote`, replacing its internal `REMOTE` constant). `resolveBaseBranch` itself also takes
`remote` as a parameter instead of hardcoding it in its own `refs/remotes/origin/HEAD` query.

**Tech Stack:** TypeScript (Bun), `bun test`, `tsc --noEmit` via `bun run check`.

## Global Constraints

- Repo: `/Users/home/repos/todd-skills`, branch off `master`; PR via
  `gh pr create --repo hieplam/todd-skills --base master --head <branch>`, merged with
  `gh pr merge --merge` (2-parent, never squash — `rule-no-squash-merge`).
- WALL: zero behavior change for the default case — every existing test's assertions for the
  literal `'origin'` case stay green with `remote` defaulted to `'origin'` in test fixtures.
- WALL: `structure.test.ts` (zero-LLM purity) stays green — no new adapter import, no world-touching
  code added outside `adapters/*.adapter.ts`.
- `bun run check` (`tsc --noEmit` + `bun test`) green before every push.
- Commits: no agent co-author lines.
- Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.
- Purity: core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see `~/.claude/rules/pure-core.md`).
  (This capability already follows this shape throughout — every git/gh call goes through the
  injected `io.exec` seam; this plan's changes are pure parameter-threading, no new IO.)

---

### Task 1: `--remote` CLI flag + `RunLoopConfig.remote`

**Files:**
- Modify: `plugins/tribe/scripts/runner/core/types.ts` (`RunLoopConfig` interface, ~line 98-128)
- Modify: `plugins/tribe/scripts/runner/cli/main.ts` (`parseArgs`, ~line 58-141)
- Test: `plugins/tribe/scripts/runner/cli/main.test.ts` (append)

**Interfaces:**
- Produces: `RunLoopConfig.remote: string` — always populated, default `'origin'` when `--remote`
  is omitted (Task 2+ consume this exact field name).

- [x] **Step 1: Write the failing test**

Append to `cli/main.test.ts` (after the existing `describe('parseArgs — required flags', ...)`
block, alongside the other optional-flag describe blocks — check the file for where
`--session-timeout`/`--logs-dir` defaults are tested and mirror that placement):

```ts
describe('parseArgs — --remote', () => {
  test('defaults to "origin" when omitted', () => {
    const result = parseArgs(validArgv(), RUN_ID);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.config.remote).toBe('origin');
    }
  });

  test('--remote overrides the default', () => {
    const result = parseArgs([...validArgv(), '--remote', 'upstream'], RUN_ID);
    expect('error' in result).toBe(false);
    if (!('error' in result)) {
      expect(result.config.remote).toBe('upstream');
    }
  });
});
```

- [x] **Step 2: Run to verify it fails**

```bash
cd plugins/tribe/scripts/runner
bun test cli/main.test.ts
```

Expected: FAIL — `result.config.remote` is `undefined`, not `'origin'`/`'upstream'`
(`RunLoopConfig` has no `remote` field yet).

- [x] **Step 3: Minimal implementation**

In `core/types.ts`, inside `RunLoopConfig` (after the `/** --dry-run */ dryRun: boolean;` line):

```ts
  /** `--remote` — the git remote name this repo's PR-target/canonical-upstream actually is.
   * Default `'origin'` (a protocol-level default, spec §2 shape — not a campaign value).
   * Threaded everywhere the runner previously hardcoded the literal string `'origin'`. */
  remote: string;
```

In `cli/main.ts`'s `parseArgs`, add alongside the other optional-with-default flags (near
`sessionTimeoutMs`/`logsDir`):

```ts
  const remote = typeof raw.get('--remote') === 'string' ? (raw.get('--remote') as string) : 'origin';
```

and add `remote,` to the returned `config` object literal.

- [x] **Step 4: Run to verify pass**

```bash
bun test cli/main.test.ts
```

Expected: both new tests PASS; every pre-existing test in this file still PASSES unmodified
(the new field is additive).

- [x] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/runner/core/types.ts plugins/tribe/scripts/runner/cli/main.ts plugins/tribe/scripts/runner/cli/main.test.ts
git commit -m "feat(runner): add --remote CLI flag (default 'origin')"
```

### Task 2: `resolveBaseBranch` takes `remote` as a parameter

**Files:**
- Modify: `plugins/tribe/scripts/runner/core/loop/run-loop.ts` (`resolveBaseBranch`, ~line
  53-61; its call site in `resolveRunContext`, ~line 130-135)
- Test: `plugins/tribe/scripts/runner/core/loop.test.ts` (modify the existing
  `describe('resolveBaseBranch', ...)` block, ~line 259-269 — it re-exports from
  `core/loop.ts`'s barrel)

**Interfaces:**
- Consumes: nothing new (pure signature change).
- Produces: `resolveBaseBranch(io, repoRoot, remote): Promise<string>` — Task 3+'s
  `resolveRunContext` call site is the only consumer.

- [x] **Step 1: Write the failing test** — update the two existing cases to pass a `remote`
  argument and assert it is what gets queried (not hardcoded):

```ts
describe('resolveBaseBranch', () => {
  test('strips the "origin/" prefix from <remote>/HEAD', async () => {
    const calls: string[][] = [];
    const io = {
      exec: mock(async (cmd: string[]) => {
        calls.push(cmd);
        return ok('upstream/master\n');
      }),
    };
    expect(await resolveBaseBranch(io, '/repo', 'upstream')).toBe('master');
    expect(calls[0]).toEqual(['git', 'symbolic-ref', '--short', 'refs/remotes/upstream/HEAD']);
  });

  test('falls back to "master" when the query fails', async () => {
    const io = { exec: mock(async () => fail('no such ref')) };
    expect(await resolveBaseBranch(io, '/repo', 'origin')).toBe('master');
  });
});
```

- [x] **Step 2: Run to verify it fails**

```bash
bun test core/loop.test.ts -t resolveBaseBranch
```

Expected: FAIL — `resolveBaseBranch` is called with 2 args in the current signature (a 3rd
`remote` argument doesn't change behavior yet — the still-hardcoded `refs/remotes/origin/HEAD`
literal means `calls[0]` asserts the wrong ref path).

- [x] **Step 3: Minimal implementation** — in `run-loop.ts`:

```ts
export async function resolveBaseBranch(
  io: { exec: LoopIO['exec'] },
  repoRoot: string,
  remote: string,
): Promise<string> {
  const result = await io.exec(['git', 'symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`], {
    cwd: repoRoot,
  });
  if (result.exitCode !== 0) {
    return 'master';
  }
  const trimmed = result.stdout.trim();
  const prefix = `${remote}/`;
  return trimmed.startsWith(prefix) ? trimmed.slice(prefix.length) : trimmed || 'master';
}
```

Update its doc comment's stale "`git symbolic-ref --short refs/remotes/origin/HEAD`" example to
read "`refs/remotes/<remote>/HEAD`" (no functional change, keeps the comment honest).

Update `resolveRunContext`'s call site (~line 131):

```ts
  const baseBranch = await resolveBaseBranch(io, config.repoRoot, config.remote);
```

- [x] **Step 4: Run to verify pass**

```bash
bun test core/loop.test.ts
```

Expected: full `loop.test.ts` suite PASSES (the `resolveBaseBranch` cases plus everything else
in that file, since nothing else in it calls `resolveBaseBranch` directly).

- [x] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/runner/core/loop/run-loop.ts plugins/tribe/scripts/runner/core/loop.test.ts
git commit -m "fix(runner): resolveBaseBranch takes the remote name as a parameter"
```

### Task 3: `VerifyConfig` gains `remote`/`baseBranch`; fix all 4 verify.ts call sites

**Files:**
- Modify: `plugins/tribe/scripts/runner/core/verify.ts` (`VerifyConfig` interface ~line 18-27;
  `checkAncestor` ~line 148-154; `isDocsOnlyDiff` ~line 183-188; `checkWorktreeAndBranchGone`
  ~line 275-281; `checkSchemaGuard` ~line 336-342)
- Modify: `plugins/tribe/scripts/runner/core/loop/card-actions.ts` (the two `VerifyConfig`
  literals, ~line 331-335 and ~line 353-357)
- Test: `plugins/tribe/scripts/runner/core/verify.test.ts` (modify `fixtureConfig`; append
  new cases)

**Interfaces:**
- Produces: `VerifyConfig.remote: string`, `VerifyConfig.baseBranch: string` — consumed by
  `checkAncestor`/`isDocsOnlyDiff`/`checkWorktreeAndBranchGone`/`checkSchemaGuard`.

- [x] **Step 1: Write the failing test** — update `fixtureConfig` and add remote-threading
  assertions using the existing `buildIoRecordingCalls` helper:

```ts
function fixtureConfig(overrides: Partial<VerifyConfig> = {}): VerifyConfig {
  return {
    repoRoot: '/repo',
    remote: 'origin',
    baseBranch: 'master',
    schemaLockPaths: ['packages/app/src/domain/sample-types.ts'],
    docsOnlyPaths: ['docs/'],
    ...overrides,
  };
}
```

Append a new describe block (after the existing point-by-point describes):

```ts
describe('verifyShipped — remote/baseBranch are threaded, never hardcoded', () => {
  test('checkAncestor queries <remote>/<baseBranch>, not a hardcoded origin/master', async () => {
    const { io, calls } = buildIoRecordingCalls();
    await verifyShipped(fixtureCard(), fixtureConfig({ remote: 'upstream', baseBranch: 'main' }), io);
    const ancestorCall = calls.find((c) => c[1] === 'merge-base');
    expect(ancestorCall).toEqual(['git', 'merge-base', '--is-ancestor', 'mergesha1', 'upstream/main']);
  });

  test('checkWorktreeAndBranchGone queries ls-remote against the resolved remote', async () => {
    const { io, calls } = buildIoRecordingCalls();
    await verifyShipped(fixtureCard(), fixtureConfig({ remote: 'upstream' }), io);
    const lsRemoteCall = calls.find((c) => c[1] === 'ls-remote');
    expect(lsRemoteCall).toEqual(['git', 'ls-remote', '--heads', 'upstream', fixtureCard().branch]);
  });

  test('isDocsOnlyDiff diffs against <remote>/<baseBranch>', async () => {
    const { io, calls } = buildIoRecordingCalls({ docsOnlyDiffFiles: ['docs/note.md'] });
    await verifyShipped(fixtureCard(), fixtureConfig({ remote: 'upstream', baseBranch: 'main' }), io);
    const diffCall = calls.find((c) => c[0] === 'git' && c[1] === 'diff' && c.includes('--name-only'));
    expect(diffCall).toContain('base0001..upstream/main');
  });

  test('checkSchemaGuard diffs against <remote>/<baseBranch>', async () => {
    const { io, calls } = buildIoRecordingCalls();
    await verifyShipped(fixtureCard(), fixtureConfig({ remote: 'upstream', baseBranch: 'main' }), io);
    const diffCall = calls.find(
      (c) => c[0] === 'git' && c[1] === 'diff' && c[2] === 'base0001..upstream/main',
    );
    expect(diffCall).toBeDefined();
  });
});
```

- [x] **Step 2: Run to verify it fails**

```bash
bun test core/verify.test.ts
```

Expected: FAIL — TypeScript error (`VerifyConfig` has no `remote`/`baseBranch`) or, once those
are added as optional stubs, the 4 new assertions fail because the checks still query literal
`origin/master`/`origin`.

- [x] **Step 3: Minimal implementation**

In `verify.ts`'s `VerifyConfig` interface, add:

```ts
  /** The git remote this repo's canonical upstream/PR-target actually is (resolved once,
   * `ResolvedConfig.remote` — never re-hardcoded here). */
  remote: string;
  /** The branch every check below diffs/merge-bases against (`ResolvedConfig.baseBranch`). */
  baseBranch: string;
```

`checkAncestor` (replace the `'git','merge-base','--is-ancestor',mergeSha,'origin/master'`
array and the two `origin/master` mentions in its `detail` strings):

```ts
  const target = `${config.remote}/${config.baseBranch}`;
  const result = await run(io, config.repoRoot, ['git', 'merge-base', '--is-ancestor', mergeSha, target]);
  const passed = result.exitCode === 0;
  return {
    id: 'mergeShaAncestorOfMaster',
    passed,
    detail: passed
      ? `${mergeSha} is an ancestor of ${target}`
      : `${mergeSha} is NOT an ancestor of ${target} (git merge-base --is-ancestor exit ${result.exitCode})`,
  };
```

`isDocsOnlyDiff` (replace `` `${baseSha}..origin/master` ``):

```ts
  const result = await run(io, config.repoRoot, [
    'git', 'diff', '--name-only', `${baseSha}..${config.remote}/${config.baseBranch}`,
  ]);
```

`checkWorktreeAndBranchGone` (replace the literal `'origin'` in the `ls-remote` call):

```ts
  const remoteResult = await run(io, config.repoRoot, ['git', 'ls-remote', '--heads', config.remote, card.branch]);
```

`checkSchemaGuard` (replace `` `${card.baseSha}..origin/master` ``):

```ts
  const result = await run(io, config.repoRoot, [
    'git', 'diff', `${card.baseSha}..${config.remote}/${config.baseBranch}`, '--', ...config.schemaLockPaths,
  ]);
```

In `card-actions.ts`, both `VerifyConfig` literals (`actOnCard`, ~line 331 and ~line 353) gain:

```ts
      remote: resolved.remote,
      baseBranch: resolved.baseBranch,
```

- [x] **Step 4: Run to verify pass**

```bash
bun test core/verify.test.ts core/loop.test.ts
```

Expected: full suite PASSES — the 4 new cases plus every pre-existing `verify.test.ts` case
(unmodified behavior at the default `remote: 'origin', baseBranch: 'master'`), plus
`loop.test.ts` (which exercises `actOnCard` and therefore both updated `VerifyConfig` literals).

- [x] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/runner/core/verify.ts plugins/tribe/scripts/runner/core/verify.test.ts plugins/tribe/scripts/runner/core/loop/card-actions.ts
git commit -m "fix(runner): thread remote/baseBranch through verify.ts's 4 checks"
```

### Task 4: `GithubConfig.remote` replaces `github.ts`'s hardcoded `REMOTE` constant

**Files:**
- Modify: `plugins/tribe/scripts/runner/core/github.ts` (`GithubConfig` interface ~line 17-27;
  delete `const REMOTE = 'origin'` ~line 73; its 4 use sites ~line 200, 222, 232, 261)
- Modify: `plugins/tribe/scripts/runner/core/loop/commit-guard.ts` (`githubConfigFor`, ~line
  56-63)
- Test: `plugins/tribe/scripts/runner/core/github.test.ts` (module-level `config` fixture;
  append a threading assertion)

**Interfaces:**
- Produces: `GithubConfig.remote: string` — the sole source of the remote name for every git
  operation `commitStateAndMerge` performs.

- [x] **Step 1: Write the failing test** — add `remote: 'origin'` to the module-level `config`
  fixture (so every EXISTING test keeps passing unmodified at the default), then append:

```ts
describe('commitStateAndMerge — remote is threaded, never hardcoded', () => {
  test('fetch/checkout/push/pull all use config.remote', async () => {
    const { io, calls } = makeIo({});
    await commitStateAndMerge(['docs/state.json'], 'title', { ...config, remote: 'upstream' }, io);
    const remoteCalls = calls.filter((c) => c.includes('upstream'));
    expect(remoteCalls.length).toBeGreaterThanOrEqual(3); // fetch, checkout -B, push (pull only fires on 'merged')
    expect(calls.some((c) => c.includes('origin'))).toBe(false);
  });
});
```

(Check `makeIo`'s exact returned shape — the file may name the calls array differently at its
own call site; match the existing helper's real signature rather than guessing.)

- [x] **Step 2: Run to verify it fails**

```bash
bun test core/github.test.ts
```

Expected: FAIL — TypeScript error (`GithubConfig` has no `remote`) or, once added, every `git`
call still fires with `'origin'` regardless of the `remote` override.

- [x] **Step 3: Minimal implementation**

In `GithubConfig`, add:

```ts
  /** The git remote every operation below runs against (`ResolvedConfig.remote`) — replaces
   * the module's former hardcoded `REMOTE` constant. */
  remote: string;
```

Delete `const REMOTE = 'origin';` (line 73). Replace its 4 use sites with `config.remote`:
- line ~200 (`git pull --ff-only ${REMOTE} config.baseBranch` → `config.remote`)
- line ~222 (`git fetch ${REMOTE} config.baseBranch` → `config.remote`)
- line ~232 (`` `${REMOTE}/${config.baseBranch}` `` → `` `${config.remote}/${config.baseBranch}` ``)
- line ~261 (`git push -u ${REMOTE} branch --force` → `config.remote`)

In `commit-guard.ts`'s `githubConfigFor`, add:

```ts
    remote: resolved.remote,
```

- [x] **Step 4: Run to verify pass**

```bash
bun test core/github.test.ts core/loop.test.ts
```

Expected: full suite PASSES.

- [x] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/runner/core/github.ts plugins/tribe/scripts/runner/core/github.test.ts plugins/tribe/scripts/runner/core/loop/commit-guard.ts
git commit -m "fix(runner): GithubConfig.remote replaces github.ts's hardcoded REMOTE constant"
```

### Task 5: fix the 3 remaining hardcodes in `phase.ts`/`card-actions.ts`

**Files:**
- Modify: `plugins/tribe/scripts/runner/core/loop/phase.ts` (`DerivePhaseConfig` ~line 22-30;
  `branchOrWorktreeExists` ~line 70-88; `derivePhaseConfigOf` — find its body, likely near the
  file's end)
- Modify: `plugins/tribe/scripts/runner/core/loop/card-actions.ts` (`performRevertAndRedo`
  ~line 197-218; `recordBaseSha` ~line 277-289)
- Test: `plugins/tribe/scripts/runner/core/loop.test.ts` (append; this file already covers
  `deriveCardPhase`/`performRevertAndRedo`/`recordBaseSha` via the `core/loop.ts` barrel —
  confirm the exact re-exported names with `grep -n "deriveCardPhase\|performRevertAndRedo\|recordBaseSha" core/loop.ts` before writing new cases, and follow that file's existing mock/fixture
  conventions for these three functions rather than introducing a new pattern)

**Interfaces:** no new exported names — pure internal parameterization.

- [x] **Step 1: Write the failing test** — three cases, one per function, each asserting the
  literal command array passed to `io.exec` contains the fixture's chosen non-`'origin'`
  remote instead of `'origin'`. Follow this shape (adjust mock construction to match
  `loop.test.ts`'s existing per-function fixture helpers — read the file's existing
  `deriveCardPhase`/`performRevertAndRedo`/`recordBaseSha` describe blocks first, since each
  likely has its own `ioWith(...)`-style builder already, and reuse it rather than
  hand-rolling a new one):

```ts
test('branchOrWorktreeExists (deriveCardPhase resume matrix) ls-remotes the resolved remote', async () => {
  // arrange a DerivePhaseConfig with remote: 'upstream'; assert the ls-remote call's args
  // include 'upstream', not 'origin' — mirror the existing deriveCardPhase test's IO builder.
});

test('performRevertAndRedo ls-remotes and (if needed) deletes on the resolved remote', async () => {
  // arrange resolved.remote = 'upstream'; assert both the ls-remote AND (when the remote
  // branch exists) the push --delete call use 'upstream'.
});

test('recordBaseSha rev-parses <remote>/<baseBranch>, not origin/<baseBranch>', async () => {
  // arrange resolved.remote = 'upstream', resolved.baseBranch = 'main'; assert the rev-parse
  // call is ['git', 'rev-parse', 'upstream/main'].
});
```

- [x] **Step 2: Run to verify it fails**

```bash
bun test core/loop.test.ts
```

Expected: FAIL — TypeScript error (`DerivePhaseConfig` has no `remote`) or the 3 new assertions
fail against the still-hardcoded `'origin'`.

- [x] **Step 3: Minimal implementation**

In `phase.ts`'s `DerivePhaseConfig`, add `remote: string;`. In `branchOrWorktreeExists`,
replace the hardcoded `'origin'`:

```ts
  const remoteResult = await io.exec(['git', 'ls-remote', '--heads', config.remote, branch], {
    cwd: config.repoRoot,
  });
```

(`branchOrWorktreeExists` needs `config` threaded as a parameter if it doesn't already take
one — check its current call sites in this same file and widen its signature exactly like the
other helpers here already take `config: DerivePhaseConfig`.)

In `derivePhaseConfigOf(config: RunLoopConfig): DerivePhaseConfig`, add `remote: config.remote,`
to the returned object.

In `card-actions.ts`'s `performRevertAndRedo`, replace both hardcodes:

```ts
  const remote = await io.exec(['git', 'ls-remote', '--heads', resolved.remote, branch], {
    cwd: resolved.repoRoot,
  });
  if (remote.stdout.trim().length > 0) {
    await io.exec(['git', 'push', resolved.remote, '--delete', branch], { cwd: resolved.repoRoot });
  }
```

In `recordBaseSha`, replace the hardcode:

```ts
  const result = await io.exec(['git', 'rev-parse', `${resolved.remote}/${resolved.baseBranch}`], {
    cwd: resolved.repoRoot,
  });
```

Also fix the stale doc-comment above `recordBaseSha` that says "diffs `baseSha..origin/master`"
to say "diffs `baseSha..<remote>/<baseBranch>`" (Task 3 already made that literally true; this
comment predates it).

- [x] **Step 4: Run to verify pass**

```bash
bun test core/loop.test.ts
```

Expected: full suite PASSES (the 3 new cases plus every pre-existing case in this file, since
the default `remote: 'origin'` reproduces prior behavior exactly).

- [x] **Step 5: Commit**

```bash
git add plugins/tribe/scripts/runner/core/loop/phase.ts plugins/tribe/scripts/runner/core/loop/card-actions.ts plugins/tribe/scripts/runner/core/loop.test.ts
git commit -m "fix(runner): thread remote through phase.ts + card-actions.ts's remaining raw git calls"
```

### Task 6: regression test — unknown top-level state fields (e.g. `planning`) survive round-trip

**Files:**
- Modify: `plugins/tribe/scripts/runner/core/state.test.ts` (append)

**Interfaces:** none new — this task adds test coverage only, proving a non-finding from the
design doc's §3 (already-correct behavior) stays correct.

- [x] **Step 1: Write the test** (no red/green cycle needed — this documents already-correct
  behavior; still verify it actually passes, since a passing assertion against the WRONG
  behavior would be worse than no test at all):

```ts
describe('loadState/serializeState — unknown top-level keys survive a round trip', () => {
  test('a caller-authored "planning" metadata field is preserved (not stripped) by loadState + serializeState', async () => {
    const input = {
      v: 1,
      campaign: 'x',
      planning: { mode: 'shaman' },
      mergePolicy: 'regular',
      sequence: ['a'],
      schemaLockPaths: [],
      docsOnlyPaths: [],
      ownerOnlyEscalations: [],
      cards: {
        a: {
          status: 'staged', spec: null, plan: null, branch: null,
          baseSha: null, pr: null, mergeSha: null, sessionId: null, updatedAt: null,
        },
      },
    };
    const state = await loadState(() => JSON.stringify(input));
    expect((state as unknown as { planning?: unknown }).planning).toEqual({ mode: 'shaman' });
    const roundTripped = JSON.parse(serializeState(state));
    expect(roundTripped.planning).toEqual({ mode: 'shaman' });
  });
});
```

- [x] **Step 2: Run to verify it passes**

```bash
bun test core/state.test.ts
```

Expected: PASS immediately — this documents existing, already-correct `z.looseObject` behavior
(the design doc's §3 non-finding); no production code changes in this task.

- [x] **Step 3: Commit**

```bash
git add plugins/tribe/scripts/runner/core/state.test.ts
git commit -m "test(runner): unknown top-level state fields survive load+serialize (regression guard)"
```

### Task 7: full gates + PR

- [x] **Step 1: Full check**

```bash
cd plugins/tribe/scripts/runner
bun run check
```

Expected: `tsc --noEmit` clean, full `bun test` suite green (including `structure.test.ts`).

- [ ] **Step 2: Commit**

```bash
git push -u origin HEAD
gh pr create --repo hieplam/todd-skills --base master \
  --title "fix(runner): resolve the PR-target remote instead of hardcoding 'origin'" \
  --body "$(cat <<'EOF'
Fixes 10 hardcoded literal 'origin' git-remote references across the campaign runner
(verify.ts x4, github.ts x1-constant/4-call-sites, phase.ts x1, card-actions.ts x2,
run-loop.ts's resolveBaseBranch x1) — found live during the kanna-session-import campaign,
where a local checkout's `origin` remote was repointed to a personal fork disconnected from
the project's actual PR flow, causing every card's first D3 verify pass to escalate on
`mergeShaAncestorOfMaster` even though the PR had genuinely merged, and the runner's own
state-auto-commit to never once land across 6 runs.

New optional `--remote` flag, default `'origin'` — zero behavior change for every existing
campaign. See docs/superpowers/specs/2026-07-31-runner-remote-resolution-design.md for the
full inventory + design.

Also includes a regression test proving the dispatching brief's third suspected bug
("planning metadata field dropped on state re-serialization") does NOT reproduce — z.looseObject
already preserves unknown top-level keys correctly (relocated to the end of the object, not
stripped); documented as a non-finding in the spec, converted into a permanent test guard here
rather than "fixed."

`bun run check` (tsc + full suite, incl. structure.test.ts purity wall): green.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Self-review checklist

- [x] Every one of the 10 inventoried hardcodes (spec §2 table) is gone — `grep -rn "'origin'"
      core/ cli/` inside `plugins/tribe/scripts/runner` returns zero matches outside test
      fixtures/comments.
- [x] Default behavior (`remote` omitted → `'origin'`) is byte-identical to pre-fix behavior —
      every pre-existing test in `loop.test.ts`/`verify.test.ts`/`github.test.ts`/`cli/main.test.ts`
      passes unmodified except for the mechanical `remote: 'origin'` fixture additions.
- [x] `structure.test.ts` still passes (no new adapter/world-touching import introduced).
- [x] The Task 6 regression test is genuinely new coverage, not a duplicate of an existing case.
