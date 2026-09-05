# Plan — Upstream drift: the heartbeat tells the running card (`i75-upstream-drift`)

**Card:** `i75-upstream-drift` (GitHub issue #75) · **Campaign:** `gh-issues-2026-09`
**Author:** planning Warchief (How), 2026-09-05. The What/Why is the Shaman's frozen spec;
nothing here reopens it.
**This plan lands at:** `docs/superpowers/plans/2026-09-05-upstream-drift.md`
**Its spec lands at:** `docs/superpowers/specs/2026-09-02-upstream-drift-design.md`
(the frozen Shaman spec, copied verbatim including its §8 grounding update, as the delivery
branch's first commit — see Setup step 4)
**Base:** `master` @ `cb35173` (PR #123, the merged watchdog this card extends) · **Report file:**
`~/.tribe/-Users-hip-repo-todd-skills/campaigns/gh-issues-2026-09/reports/i75-upstream-drift.md`

---

## 0. The How decision, up front

**The drift duty is a second duty of the existing watchdog tick, not a second process.** It lands
as three new pure modules plus one seam:

| Piece | Where | Kind |
| --- | --- | --- |
| Pure drift vocabulary, card selection, git argv builders, log parsing, overlap, digest rendering | `core/watchdog/drift.ts` (new) | pure |
| The tick's drift orchestration (read state, run git, write digest, emit events) | `core/watchdog/drift-tick.ts` (new) | impure BY INJECTION only |
| Read-only git seam | `GitReadPort` in `ports/ports.ts`, composed into `WatchdogIO` | seam |
| Real git invocation | `adapters/watchdog-io.adapter.ts` (the only watchdog file allowed to touch the world) | edge |
| Digest paths | `core/paths.ts` (additive: `driftDirOf`, `driftPathOf`) | pure |
| Delivery channel 1 (brief) | `core/brief.ts` + `core/brief-template.md` | pure |
| Delivery channel 2 (deny-once hook) | `core/session.ts` + `SessionIO.readWatchedFile` | pure + seam |
| Delivery channel 3 (pre-PR reconcile) | `core/brief-template.md` | text |
| Wiring | `core/watchdog/watch-loop.ts`, `core/loop/card-actions.ts` | orchestration |

Why this shape, and not the alternatives the card leaves to the Warchief:

| Force | Consequence |
| --- | --- |
| Spec §2.1: "Every tick (default 60 s; **reuse the #74 tick**)" | No new process, no new subcommand, no new resolver, no `install.sh` change. The drift duty runs inside `runWatchdog`'s existing loop body, once per tick, in both `--once` and `--follow`. |
| `structure.test.ts` (248 lines, verified on `cb35173`) | `core/**` may not name `node:child_process` in any quote form, so the `git fetch` lives in the adapter and reaches the core only through a port. Every `interface *IO`/`*Port` must be declared in `ports/ports.ts`, so the new seam is `GitReadPort` there. This is the pure-core rule obtained mechanically instead of promised. |
| `core/state.ts` and `core/types.ts` are this campaign's two `schemaLockPaths` (verified in `campaign-state.json` on 2026-09-05) | The drift vocabulary lands in `core/watchdog/drift.ts` and `core/watchdog/model.ts`, exactly as `i74` put the watchdog's vocabulary in `model.ts`. `ports/ports.ts` needs nothing from it (`GitReadPort` is primitive-typed and returns the `ExecResult` already declared in `ports/ports.ts`). **This plan therefore schedules no locked-path change, needs no `allowsSchemaChange: true` front-matter, and never trips the runner's D3 schema guard or the `runner-core-change` owner-only trigger.** |
| D75-1: the watchdog never mutates a worktree or branch | The only git verbs the drift code may ever emit are `symbolic-ref`, `fetch`, `log`, `diff` — asserted mechanically by a unit test over the argv builders (Task 2), not promised in prose. `git fetch` updates remote-tracking refs in the shared `.git` directory; it touches no worktree, no local branch, no index. |
| The runner's own base-branch resolution lives in `core/loop/run-loop.ts` | `structure.test.ts`'s "leaf core modules never import the orchestrator" forbids `core/watchdog/**` importing it. `parseBaseBranch` in `drift.ts` is therefore a deliberate 4-line re-implementation of that pure parse, with a comment naming the wall that requires the duplication. Do not "fix" it by importing the orchestrator: that breaks a green structural test. |
| Spec §2.2's three channels are three different lifecycles | Brief (spawn), hook (mid-flight), template text (pre-PR). They share exactly one thing — the digest file — so the digest is the single artifact and every channel reads it. No channel re-derives drift itself. |

Consequence for reviewers: **no new installable, no new script entry point, no `doctor.sh`
change, no new prerequisite** (bun only, already checked). The one new shell test file joins
`plugins/tribe/scripts/tests/` alongside `test-watchdog-e2e.sh`, which needs no registration.

### 0.1 Frozen How decisions (this plan's own law, resolved from the spec, not invented over it)

Each is a How-level gap the spec does not spell out. They are frozen here so a Hunter, a Skinner
and a Tracker read the same oracle, and listed again in §7 for the Shaman to fold into the spec.

- **W75-1 The digest is the single source; every channel reads it.** Detection writes exactly one
  artifact per card (`<home>/drift/<card>.md` — always written as backticked path text in this
  plan). The brief embeds its content, the hook embeds its content, the pre-PR step points at it.
  Nothing recomputes drift outside the watchdog (D75-1: the executor reconciles, it never detects).
- **W75-2 The digest content is timestamp-free.** No `detectedAt`, no tick number, no counter goes
  inside the file. A timestamp would change the bytes on every tick, so "rewrite only when content
  changes" (spec §2.1 step 4) would rewrite always, and the hash-based deny-once delivery would
  deny on **every** tool call — the exact failure D75-2 forbids. The observation time lives in
  `status.json`'s `drift.since` and in the `events.jsonl` line's own `at`, never in the digest.
- **W75-3 One `upstream_drift` event per real change, not per tick.** The event is appended only
  when the digest bytes actually change; a standing, unchanged drift keeps `status.json.drift`
  populated but appends nothing further. Otherwise a 30-second tick writes 120 identical lines an
  hour into `events.jsonl` and the audit trail becomes noise.
- **W75-4 The upstream tip is the newest commit in the ahead range, not a separate `rev-parse`.**
  `git log` lists newest first, so `commits[0].sha` **is** the tip of `<remote>/<base>` at fetch
  time. This costs one fewer subprocess per card per tick and cannot disagree with the range the
  digest lists.
- **W75-5 Delivery identity is a length-prefixed FNV-1a fingerprint computed in the pure core.**
  `fingerprintOf(content)` returns `absent` for a missing file and `<length>:<hex>` otherwise. No
  `node:crypto` import (keeps the hook trivially pure and testable), and length-prefixing makes a
  collision require equal length AND equal hash. The consequence of a miss is a delayed notice,
  never a wrong action, and two other channels back it up.
- **W75-6 The hook primes on its first tool call and never denies that call.** The hook is built
  synchronously inside `buildSessionOptions`, before the session exists, so it cannot read files
  there; its seam is async. The first tool call therefore records the fingerprints and allows.
  This is behaviourally "as seen at spawn" (spec §2.2) because the brief rendered milliseconds
  earlier already carried the drift section — re-denying for content the brief just delivered
  would be a duplicate notice, not a missed one. The window between spawn and first tool call is
  covered by the brief channel and by the pre-PR reconcile step.
- **W75-7 One denial carries every file that changed, never one denial per file.** Spec §2.2
  permits one denial per content change per file; when two watched files change before the same
  tool call, a single denial listing both is strictly less disruptive and still never denies twice
  for the same content. Two separate changes at two separate times still produce two denials.
- **W75-8 The brief renderer gains ONE optional trailing options parameter**, not three positional
  ones: `executorBrief(card, state, answersContent, template, reportPath, campaignSlug, extras)`
  where `extras` is `{ driftContent?, remote?, baseBranch? }` and defaults to `{}`. Every existing
  call site keeps compiling unchanged; the two real call sites in `core/loop/card-actions.ts` pass
  the real values.
- **W75-9 No new watchdog flag.** Spec §2.1 fixes the cadence as "the #74 tick", so the drift duty
  reuses `--poll-seconds` and reads the remote name out of the already-existing `--remote`
  pass-through. Fewer flags, no new arg-parser rows, no new CLI contract to document twice.
- **W75-10 Fail closed means: a typed event plus a WARN string in `status.json`, and never a
  denial or a digest built on a failed read.** A failed fetch, an unreadable campaign state, a
  failed `git log` and an unreadable digest each produce `drift_check_failed` with a reason code
  and never a false "no drift". For the **hook**, the safe direction is inverted and the spec says
  so explicitly ("never denies when the file is absent or unchanged"): an unreadable watched file
  reads as absent and never denies, because a denial storm on an unreadable advisory file would
  wedge an executor that has nothing to fix.
- **W75-11 Zero-cost when nothing is running.** The tick reads `campaign-state.json` FIRST and
  returns before any git call when no card is `running` with a `baseSha`. That is what makes G5
  ("never for a card that is not running") structural rather than incidental, and it is why the
  existing watchdog test suites see no new subprocess.

---

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.**
- **Purity: core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see
  `plugins/tribe/rules/pure-core.md`).**
- **TDD, one unit of work per task.** Write the failing test, watch it fail, minimal code to
  green, keep the whole suite green, ONE commit. A task that dies mid-flight is discarded
  (`git reset --hard && git clean -fd`) and redone — never salvaged.
- **Every commit message ends with the trailer `Campaign: gh-issues-2026-09` in its final
  paragraph. NO co-author trailers of any kind** (owner rule: never auto-add an agent name as
  co-author).
- **Commit and push after every task.** The account limit kills agents mid-flight in this
  campaign; an unpushed task is a task that never happened.
- **Tick this plan's checkboxes for your task in the SAME commit as the code.** A task commit that
  changes code without ticking its own boxes fails the audit.
- **The 645 existing runner tests stay green and their assertions stay unchanged.** Every edit to
  an existing production file in this plan is additive: new exports, one new optional interface
  member, one new optional parameter, one new hook entry appended at index 3. Adding a member to a
  shared TEST fake (`fakeIo` in `watch-loop.test.ts`) is not an assertion change and is expected;
  changing what an existing test asserts is a `NEEDS_CONTEXT` stop.
- **Never modify a schemaLockPath.** This campaign locks
  `plugins/tribe/scripts/runner/core/state.ts` and `plugins/tribe/scripts/runner/core/types.ts`
  (verified in the campaign state file on 2026-09-05). No task here touches either. If a task ever
  seems to need an edit inside one, **stop and report `NEEDS_CONTEXT`** — that is an owner-only
  trigger (`change-state-schema`, `runner-core-change`), never a Hunter's call.
- **Never touch these paths:** `plugins/tribe/scripts/viewer/**`, anything under
  `/Users/hip/repo/todd-skills-wt/` that is not this card's own worktree (parallel sessions own
  those), the runner's exit codes, its state schema, and its resume matrix (card scope fence,
  "Out": "changes to the runner's resume matrix or state schema").
- **Never stage the main checkout's dirty files.** `master` in `/Users/hip/repo/todd-skills` has
  uncommitted work — `.vscode/launch.json` (modified) and
  `plugins/tribe/scripts/viewer/package.json` (modified). The delivery worktree is a fresh
  checkout of `cb35173` and will not contain them; never `git add -A` from the main checkout,
  never `git stash` there.
- **Environment facts.** `bun` 1.3.14, `python3` 3.9.6. **There is no `timeout`, `gtimeout` or
  `setsid` binary on this machine** — never write one into a script or a test; bounded waits are
  hand-rolled poll loops, and subprocess timeouts use the spawn API's own `timeout` option. Every
  Bash tool call caps at 600 s and must never be backgrounded from an agent.
- **Every git subprocess this card spawns runs with host git config neutralized**
  (`GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` pointed at `/dev/null`) and with a timeout —
  `plugins/tribe/rules/fail-closed-edges.md` obligations 2 and 3. A test whose verdict could turn
  on the developer's `~/.gitconfig` is not a test.
- **Known pre-existing red, out of fence, never "fixed" opportunistically:**
  `plugins/tribe/scripts/tests/test-input-asymmetry.sh` does not parse (`bash -n` fails). Do not
  run it as a gate, do not repair it.
- **Measured baselines every task must preserve** (measured on `master` @ `cb35173`,
  2026-09-05, and re-verified at Setup step 5):
  - `cd plugins/tribe/scripts/runner && bun test` → `645 pass, 0 fail, 26 files` (212 s)
  - `cd plugins/tribe/scripts/runner && bunx tsc --noEmit` → silent, exit 0
  - `C3X_MODE=agent bash /Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/bin/c3x.sh check`
    → `total: 52`, `ok: true` (zero errors — the two `i74`-era errors are fixed; **any** error is
    a regression for this card)
- **C3 governance is reached only through the skill wrapper** — `C3X_MODE=agent bash` plus
  `/Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/bin/c3x.sh` plus the
  operation, always with stdin redirected from `/dev/null`. `bunx @c3x/cli` is forbidden.
  `.c3/c3-2-plugins/c3-215-tribe.md` carries a `c3-seal:` — hand-editing it breaks the seal; every
  fact edit goes through an ADR plus change-unit (`references/change.md`).
- **Brief-contracts rule is binding on every dispatch.** Each task below carries its own `Oracle`,
  `Fence by intent`, `Governing quote` and `Adjudication rule` block; the Warchief copies that
  block verbatim into the Hunter's brief. A brief without them is a defective dispatch.
- **`plugins/tribe/rules/html-illustration.md` is N/A for this card** — every artifact it produces
  is Markdown or TypeScript; nothing here emits an HTML page a human reads.

---

## Setup (the Warchief does this; not a Hunter task)

```sh
# 1. Isolated worktree off the recorded base commit.
cd /Users/hip/repo/todd-skills
git worktree add /Users/hip/repo/todd-skills-wt/i75-drift -b feat/i75-upstream-drift cb35173

# 2. The bun-install worktree trap (fixlist P15): node_modules/ is gitignored, so a fresh
#    worktree's runner dir has none and every test fails for the wrong reason.
cd /Users/hip/repo/todd-skills-wt/i75-drift/plugins/tribe/scripts/runner && bun install

# 3. Record the base sha for the state file.
git -C /Users/hip/repo/todd-skills-wt/i75-drift rev-parse HEAD

# 4. Land the spec (verbatim copy of the frozen Shaman spec, its §8 grounding update included)
#    and this plan, as the branch's first commit.
cd /Users/hip/repo/todd-skills-wt/i75-drift
cp ~/.tribe/-Users-hip-repo-todd-skills/campaigns/gh-issues-2026-09/specs/2026-09-02-upstream-drift-design.md \
   docs/superpowers/specs/2026-09-02-upstream-drift-design.md
cp ~/.tribe/-Users-hip-repo-todd-skills/campaigns/gh-issues-2026-09/planning/i75-upstream-drift/plan.md \
   docs/superpowers/plans/2026-09-05-upstream-drift.md

# 5. Re-verify the baselines in the worktree BEFORE dispatching Task 1.
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
C3X_MODE=agent bash /Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/bin/c3x.sh check </dev/null
```

Expected: worktree created, `bun install` completes, `645 pass, 0 fail`, `tsc` silent,
`c3x check` printing `total: 52` and `ok: true`.

**Empty-fixture pre-check (`fixtures-mirror-reality.md` obligation 2 — before Task 1, not after).**
Prove on the real binary, in a throwaway tree, that the three git reads this card is designed
around behave as the plan assumes when the target is bare-new and when the upstream has moved:

```sh
T="$(mktemp -d)"; T="$(cd "$T" && pwd -P)"
git init -q --bare "$T/remote.git"
git init -q -b master "$T/repo" && cd "$T/repo"
git -c user.email=t@t.test -c user.name=t commit -q --allow-empty -m base
git remote add origin "$T/remote.git" && git push -q -u origin master
BASE="$(git rev-parse HEAD)"
git -c user.email=t@t.test -c user.name=t checkout -q -b feat/x
mkdir -p a && echo one > a/shared.txt
git add a/shared.txt && git -c user.email=t@t.test -c user.name=t commit -q -m "card work"
git -c user.email=t@t.test -c user.name=t checkout -q master
echo two > a/shared.txt && echo x > a/only-upstream.txt && git add a
git -c user.email=t@t.test -c user.name=t commit -q -m "upstream work" && git push -q origin master
git checkout -q feat/x
git fetch --quiet origin master
git log --name-only --format="%x1e%H%x1f%s" "$BASE..origin/master"
git diff --name-only origin/master...feat/x
```

Expected: the `log` prints one record whose header is `<record-separator>sha<field-separator>upstream work`
followed by `a/shared.txt` and `a/only-upstream.txt`; the `diff` prints exactly `a/shared.txt`.
That is the overlap this card computes (`a/shared.txt`) and the upstream-only file it must not
claim as overlap. Record both outputs in the report file before Task 1 is dispatched.

**Waves.** One wave, one worktree, one Hunter in flight at a time. Tasks 1-13 are strictly
sequential: each depends on a symbol or a file the previous one landed. No sub-plan split.

---

## Task 1: Drift paths and card selection (pure)

**Files:** `plugins/tribe/scripts/runner/core/paths.ts` (modify, additive) ·
`plugins/tribe/scripts/runner/core/paths.test.ts` (modify, additive) ·
`plugins/tribe/scripts/runner/core/watchdog/drift.ts` (new) ·
`plugins/tribe/scripts/runner/core/watchdog/drift.test.ts` (new)

**Oracle.** Spec §2.1 opening sentence decides which cards are checked: "for each card whose
runner status is `running` and whose `baseSha` is set". The direction of error is fixed by G5
("Zero false alarms"): **over-selecting is a bug** (it produces a digest and a denial for a card
nobody is working on); under-selecting merely delays a notice that two other channels also carry.
When in doubt, do not select.

**Fence by intent.** This task adds pure string and JSON math only. No fs, no clock, no
subprocess, no import of anything outside `node:path`.

**Governing quote** — spec §2.1, verbatim:
> Every tick (default 60 s; reuse the #74 tick), for each card whose runner status is `running`
> and whose `baseSha` is set:

and card §Measurable goals G5, verbatim:
> **G5 Zero false alarms.** No drift file, no event, no denial when `origin/<base>` did not
> move (test), and never for a card that is not running.

**Adjudication rule — REFUTED in advance.**
- "`selectDriftCards` should validate the whole campaign-state schema" — no; `core/state.ts` owns
  schema validation and is a schemaLockPath. This function reads three fields defensively and is
  deliberately tolerant of everything else.
- "a card with `status: running` but no `baseSha` should be reported as an error" — no; the spec's
  own condition is a conjunction, and a card mid-spawn legitimately has no `baseSha` yet.
- "the duplicated `parseBaseBranch` should import `resolveBaseBranch` from `core/loop/run-loop.ts`"
  — that import is banned by `structure.test.ts`'s "leaf core modules never import the
  orchestrator" test, which is green today and must stay green.

**Steps**

- [ ] **Step 1: Failing test** — append to `core/paths.test.ts`:

```ts
import { driftDirOf, driftPathOf } from './paths.ts';

describe('drift digest paths (card i75)', () => {
  test('the digest for a card lives at home/drift/cardId.md', () => {
    expect(driftDirOf('/h/.tribe/k/campaigns/c')).toBe('/h/.tribe/k/campaigns/c/drift');
    expect(driftPathOf('/h/.tribe/k/campaigns/c', 'i75-upstream-drift'))
      .toBe('/h/.tribe/k/campaigns/c/drift/i75-upstream-drift.md');
  });
});
```

and create `core/watchdog/drift.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { parseBaseBranch, remoteFromPassthrough, selectDriftCards } from './drift.ts';

function stateJson(cards: Record<string, unknown>): string {
  return JSON.stringify({
    v: 1, campaign: 'c', mergePolicy: 'm', sequence: Object.keys(cards),
    schemaLockPaths: [], docsOnlyPaths: [], ownerOnlyEscalations: [], cards,
  });
}

describe('selectDriftCards — spec 2.1: running AND baseSha set', () => {
  test('selects only running cards that carry a baseSha, sorted by id', () => {
    const raw = stateJson({
      b: { status: 'running', baseSha: 'bbb', branch: 'feat/b' },
      a: { status: 'running', baseSha: 'aaa', branch: null },
      staged: { status: 'staged', baseSha: 'ccc', branch: 'feat/c' },
      shipped: { status: 'shipped', baseSha: 'ddd', branch: 'feat/d' },
      noBase: { status: 'running', baseSha: null, branch: 'feat/e' },
      blankBase: { status: 'running', baseSha: '   ', branch: 'feat/f' },
    });
    expect(selectDriftCards(raw)).toEqual({
      cards: [
        { cardId: 'a', baseSha: 'aaa', branch: null },
        { cardId: 'b', baseSha: 'bbb', branch: 'feat/b' },
      ],
      warn: null,
    });
  });

  test('an empty branch string is the same as no branch (overlap unknown)', () => {
    expect(selectDriftCards(stateJson({ a: { status: 'running', baseSha: 'aaa', branch: '' } })).cards)
      .toEqual([{ cardId: 'a', baseSha: 'aaa', branch: null }]);
  });

  test('a missing or unreadable state file selects nothing and warns (W75-10 fail closed)', () => {
    expect(selectDriftCards('')).toEqual({ cards: [], warn: 'campaign-state.json is missing or unreadable' });
  });

  test('invalid JSON selects nothing and warns, never throws', () => {
    expect(selectDriftCards('{ not json')).toEqual({
      cards: [], warn: 'campaign-state.json is not valid JSON',
    });
  });

  test('a state file with no cards object selects nothing and warns', () => {
    expect(selectDriftCards('{"v":1}')).toEqual({
      cards: [], warn: 'campaign-state.json has no cards object',
    });
  });

  test('a valid state with zero running cards is silence, not a warning (G5)', () => {
    expect(selectDriftCards(stateJson({ a: { status: 'staged', baseSha: 'aaa', branch: null } })))
      .toEqual({ cards: [], warn: null });
  });
});

describe('remoteFromPassthrough — W75-9: no new flag, read the runner pass-through', () => {
  test('reads --remote when present, defaults to origin otherwise', () => {
    expect(remoteFromPassthrough(['--cards', 'x', '--remote', 'upstream'])).toBe('upstream');
    expect(remoteFromPassthrough(['--cards', 'x'])).toBe('origin');
    expect(remoteFromPassthrough(['--remote'])).toBe('origin');
  });
});

describe('parseBaseBranch — the remote HEAD parse (duplicated on purpose, see drift.ts)', () => {
  test('strips the remote prefix, falls back to master on any failure', () => {
    expect(parseBaseBranch('origin/master\n', 0, 'origin')).toBe('master');
    expect(parseBaseBranch('upstream/main\n', 0, 'upstream')).toBe('main');
    expect(parseBaseBranch('trunk\n', 0, 'origin')).toBe('trunk');
    expect(parseBaseBranch('', 128, 'origin')).toBe('master');
    expect(parseBaseBranch('   \n', 0, 'origin')).toBe('master');
  });
});
```

Run `cd plugins/tribe/scripts/runner && bun test core/watchdog/drift.test.ts core/paths.test.ts`.
Expected: fails to resolve `./drift.ts` and the two new `paths.ts` exports.

- [ ] **Step 2: Minimal implementation** — append to `core/paths.ts`:

```ts
export const DRIFT_DIRNAME = 'drift';

/** `<home>/drift` — card i75: one digest file per card, written only by the watchdog. */
export function driftDirOf(homeDir: string): string {
  return join(homeDir, DRIFT_DIRNAME);
}

/** `<home>/drift/<cardId>.md` */
export function driftPathOf(homeDir: string, cardId: string): string {
  return join(driftDirOf(homeDir), `${cardId}.md`);
}
```

and create `core/watchdog/drift.ts` with the header comment, `DriftCard`,
`SelectDriftCardsResult`, `selectDriftCards`, `remoteFromPassthrough` and `parseBaseBranch`
exactly as the tests above pin them. `selectDriftCards` catches only `SyntaxError` from
`JSON.parse` and rethrows anything else (`fail-closed-edges` obligation 1: narrow catch, typed
refusal). `parseBaseBranch` carries this comment verbatim:

```ts
/** Pure parse of `git symbolic-ref --short refs/remotes/<remote>/HEAD`, with the runner's own
 * `master` fallback. DELIBERATELY duplicated from `core/loop/run-loop.ts`'s `resolveBaseBranch`:
 * `structure.test.ts`'s "leaf core modules never import the orchestrator" test forbids
 * `core/watchdog/**` importing `core/loop/**`, and that test is the layout contract, not a
 * preference. Four lines of pure string math is the cheaper side of that trade. */
```

- [ ] **Step 3: Gates** — from `plugins/tribe/scripts/runner`:

```sh
bun test core/watchdog/drift.test.ts core/paths.test.ts && bun test && bunx tsc --noEmit
```

Expected: the new tests pass; the whole suite reports `0 fail` with the baseline 645 plus the new
tests; `tsc` silent.

- [ ] **Step 4: Commit** — `feat(watchdog): drift digest paths and running-card selection` with
  the `Campaign: gh-issues-2026-09` trailer, this task's checkboxes ticked in the same commit,
  then `git push`.

---

## Task 2: Git argv builders, ahead-log parsing, overlap (pure)

**Files:** `core/watchdog/drift.ts` (modify) · `core/watchdog/drift.test.ts` (modify)

**Oracle.** Spec §2.1 steps 2 and 3 define the two computations: `ahead` is the set of commits
on the base branch that the card's `baseSha` does not contain (with their subjects and files), and
overlap is the intersection of those commits' files with the files the card's branch changed,
computed by `git diff --name-only <merge-base>..<branch-tip>`; when no branch is known yet,
overlap is "unknown", stated as such.
D75-1 fixes the direction of error for the argv builders: **emitting any git verb that could
mutate state is a Blocker**, no matter how convenient; emitting one read too few is merely a
missing digest line.

**Fence by intent.** Pure functions producing argv arrays and parsing captured output. This task
runs no subprocess and imports nothing new.

**Governing quote** — spec §2.1, verbatim:
> 2. Compute `ahead = origin/<base> ∖ baseSha` (commits, subjects, files).
> 3. If `ahead` is non-empty: compute the **overlap** = files in `ahead` ∩ files changed on the
>    card's branch (`git diff --name-only <merge-base>..<branch-tip>`; when no branch is known yet,
>    overlap is "unknown", stated as such).

and card D75-1, verbatim:
> **D75-1 The heartbeat owns detection; the executor owns reconciliation.** The watchdog
> never touches a worktree or branch.

**Adjudication rule — REFUTED in advance.**
- "`git log` should use `-m` so merge commits list their files" — no. The ahead RANGE already
  contains the individual commits that each merge brought in (verified on this repo: every PR
  lands as a 2-parent merge and its own commits are inside the range), so `-m` would duplicate
  every file without adding one.
- "`git diff A...B` should be `git merge-base` followed by `git diff`" — no. Three-dot diff IS
  `merge-base(A,B)..B` by definition, which is exactly the spec's formula in one subprocess, and
  it self-heals after the branch has already merged upstream once.
- "the parser should reject output it cannot read" — no; a record whose header lacks the field
  separator is skipped (a truncated or exotic subject must not lose the other commits).

**Steps**

- [ ] **Step 1: Failing test** — append to `core/watchdog/drift.test.ts`:

```ts
import {
  aheadLogCommand, AHEAD_FIELD_SEP, AHEAD_RECORD_SEP, baseBranchCommand, branchFilesCommand,
  computeOverlap, DRIFT_READ_ONLY_VERBS, fetchCommand, parseAheadLog,
} from './drift.ts';

const rec = (sha: string, subject: string, files: string[]) =>
  `${AHEAD_RECORD_SEP}${sha}${AHEAD_FIELD_SEP}${subject}\n\n${files.join('\n')}\n`;

describe('git argv builders — D75-1: read-only verbs only, never a mutation', () => {
  test('every builder emits a verb from the read-only allowlist', () => {
    const argvs = [
      baseBranchCommand('origin'),
      fetchCommand('origin', 'master'),
      aheadLogCommand({ remote: 'origin', base: 'master', baseSha: 'abc123' }),
      branchFilesCommand({ remote: 'origin', base: 'master', branch: 'feat/x' }),
    ];
    for (const argv of argvs) {
      expect(DRIFT_READ_ONLY_VERBS).toContain(argv[0] as string);
      expect(argv.some((token) => ['merge', 'rebase', 'checkout', 'reset', 'pull', 'push',
        'commit', 'cherry-pick', 'switch', 'restore', 'clean'].includes(token))).toBe(false);
    }
  });

  test('the exact argv each builder produces', () => {
    expect(baseBranchCommand('upstream')).toEqual(['symbolic-ref', '--short', 'refs/remotes/upstream/HEAD']);
    expect(fetchCommand('origin', 'master')).toEqual(['fetch', '--quiet', 'origin', 'master']);
    expect(aheadLogCommand({ remote: 'origin', base: 'master', baseSha: 'abc123' })).toEqual([
      'log', '--name-only', `--format=${AHEAD_RECORD_SEP}%H${AHEAD_FIELD_SEP}%s`,
      'abc123..origin/master',
    ]);
    expect(branchFilesCommand({ remote: 'origin', base: 'master', branch: 'feat/x' }))
      .toEqual(['diff', '--name-only', 'origin/master...feat/x']);
  });
});

describe('parseAheadLog', () => {
  test('reads sha, subject and files per commit, newest first', () => {
    const out = rec('s2', 'second: fix the thing', ['a/one.ts', 'b/two.ts'])
      + rec('s1', 'first: add the thing', ['a/one.ts']);
    expect(parseAheadLog(out)).toEqual([
      { sha: 's2', subject: 'second: fix the thing', files: ['a/one.ts', 'b/two.ts'] },
      { sha: 's1', subject: 'first: add the thing', files: ['a/one.ts'] },
    ]);
  });

  test('a merge commit with no listed files is a commit with an empty file list', () => {
    expect(parseAheadLog(`${AHEAD_RECORD_SEP}m1${AHEAD_FIELD_SEP}Merge pull request #1\n`))
      .toEqual([{ sha: 'm1', subject: 'Merge pull request #1', files: [] }]);
  });

  test('no output is no commits (G5: no drift, nothing written)', () => {
    expect(parseAheadLog('')).toEqual([]);
    expect(parseAheadLog('\n')).toEqual([]);
  });

  test('an unreadable record is skipped, never fatal, and never loses its siblings', () => {
    const out = `${AHEAD_RECORD_SEP}garbage-with-no-separator\n` + rec('s1', 'real', ['a.ts']);
    expect(parseAheadLog(out)).toEqual([{ sha: 's1', subject: 'real', files: ['a.ts'] }]);
  });
});

describe('computeOverlap — D75-3: advisory, sorted, deduped', () => {
  const commits = [
    { sha: 's2', subject: 'x', files: ['b/two.ts', 'a/one.ts'] },
    { sha: 's1', subject: 'y', files: ['a/one.ts', 'c/three.ts'] },
  ];
  test('intersects upstream files with the branch files, deduped and sorted', () => {
    expect(computeOverlap(commits, ['a/one.ts', 'b/two.ts', 'd/four.ts', '']))
      .toEqual(['a/one.ts', 'b/two.ts']);
  });
  test('an empty intersection is an empty list, never null (empty is stated as such)', () => {
    expect(computeOverlap(commits, ['z/none.ts'])).toEqual([]);
  });
});
```

Run `bun test core/watchdog/drift.test.ts`. Expected: fails on the seven missing exports.

- [ ] **Step 2: Minimal implementation** — add to `core/watchdog/drift.ts`:

```ts
/** ASCII record/unit separators: a commit subject can contain anything a human types, including
 * newlines-worth of punctuation, but never these two control characters. */
export const AHEAD_RECORD_SEP = '\u001e';
export const AHEAD_FIELD_SEP = '\u001f';

/** D75-1, mechanically: the ONLY git verbs the drift duty may ever emit. `select.test.ts`-style
 * argv assertions in `drift.test.ts` pin this — a mutation verb here is a Blocker, not a taste
 * question, because the watchdog "never touches a worktree or branch". */
export const DRIFT_READ_ONLY_VERBS = ['symbolic-ref', 'fetch', 'log', 'diff'] as const;

export interface AheadCommit { sha: string; subject: string; files: string[] }

export function baseBranchCommand(remote: string): string[] {
  return ['symbolic-ref', '--short', `refs/remotes/${remote}/HEAD`];
}

/** One ref, quietly. Never `--update-head-ok`, never a refspec that writes a local branch. */
export function fetchCommand(remote: string, base: string): string[] {
  return ['fetch', '--quiet', remote, base];
}

export function aheadLogCommand(i: { remote: string; base: string; baseSha: string }): string[] {
  return ['log', '--name-only', `--format=${AHEAD_RECORD_SEP}%H${AHEAD_FIELD_SEP}%s`,
    `${i.baseSha}..${i.remote}/${i.base}`];
}

/** Three-dot diff IS `merge-base(<remote>/<base>, <branch>)..<branch>` — spec 2.1 step 3's
 * formula in one subprocess, and it self-corrects after the branch has merged upstream once. */
export function branchFilesCommand(i: { remote: string; base: string; branch: string }): string[] {
  return ['diff', '--name-only', `${i.remote}/${i.base}...${i.branch}`];
}
```

plus `parseAheadLog` and `computeOverlap` exactly as pinned above.

- [ ] **Step 3: Gates** — from `plugins/tribe/scripts/runner`:

```sh
bun test core/watchdog/drift.test.ts && bun test && bunx tsc --noEmit
```

Expected: new tests pass, whole suite `0 fail`, `tsc` silent.

- [ ] **Step 4: Commit** — `feat(watchdog): read-only git argv builders, ahead-log parse, overlap`
  with the campaign trailer and this task's boxes ticked, then `git push`.

---

## Task 3: The digest and the §2.3 reconcile instruction (pure)

**Files:** `core/watchdog/drift.ts` (modify) · `core/watchdog/drift.test.ts` (modify)

**Oracle.** Spec §2.3 is the contract for the instruction text and it is quoted verbatim below;
the digest is the artifact that carries it (spec §2.1 step 4). D75-3 fixes the ordering: an empty
overlap still produces the digest, a non-empty overlap is highlighted first. W75-2 fixes the one
property a reviewer cannot see by reading the text: the rendered bytes must be a pure function of
the observed git facts, with no clock in them.

**Fence by intent.** Pure rendering. The digest's own path, its writing, and the decision of when
to write it are Task 5's business; this task only decides what the bytes are and whether two
renderings differ.

**Governing quote** — spec §2.3, verbatim (fenced so the text below is byte-for-byte the
spec's own, angle brackets included):

```text
Upstream `origin/<base>` moved from `<baseSha>` to `<tip>` (<n> commits; overlap with your
branch: <k files | none | unknown>). Before your next commit: `git fetch origin && git merge
origin/<base>` in your worktree (regular merge, never rebase), resolve conflicts, re-run the
gates, then continue. Files that moved upstream and that you also changed: <list>.
```

and spec §2.1 step 4, verbatim:
> 4. Write `<home>/drift/<card>.md` — the digest: base sha, new tip, the commits (sha, subject,
>    files), the overlap (or "none" / "unknown"), and the instruction to reconcile (§2.3). Rewrite
>    only when content changes (so the hash-based delivery below fires once per real change).

**Adjudication rule — REFUTED in advance.**
- "the digest should record when it was detected" — REFUTED by W75-2: a timestamp inside the file
  makes every tick a content change, which makes the deny-once hook deny on every tool call. The
  time lives in `status.json.drift.since` and in the event's own `at`.
- "the instruction should say `git pull`" — REFUTED by D75-4 and by
  `.c3/rules/rule-no-squash-merge.md`: fetch plus an explicit regular merge, never a pull, never a
  rebase.
- "an empty overlap should suppress the digest" — REFUTED by D75-3, verbatim: "an empty overlap
  still produces the digest (the executor still merges before the PR)".

**Steps**

- [ ] **Step 1: Failing test** — append to `core/watchdog/drift.test.ts`:

```ts
import { decideDriftWrite, reconcileInstruction, renderDriftDigest } from './drift.ts';

const COMMITS = [
  { sha: 'aaaaaaaaaaaa1111', subject: 'feat: land the thing', files: ['a/one.ts', 'b/two.ts'] },
  { sha: 'bbbbbbbbbbbb2222', subject: 'fix: repair the thing', files: ['a/one.ts'] },
];
const INPUT = {
  cardId: 'i9-card', remote: 'origin', base: 'master', baseSha: 'ffff0000',
  tip: 'aaaaaaaaaaaa1111', commits: COMMITS, overlap: ['a/one.ts'],
};

describe('reconcileInstruction — spec 2.3, verbatim shape', () => {
  test('names the move, the count, the overlap and the exact merge command', () => {
    expect(reconcileInstruction(INPUT)).toBe(
      'Upstream `origin/master` moved from `ffff0000` to `aaaaaaaaaaaa1111` (2 commits; overlap '
      + 'with your branch: 1 file). Before your next commit: `git fetch origin && git merge '
      + 'origin/master` in your worktree (regular merge, never rebase), resolve conflicts, '
      + 're-run the gates, then continue. Files that moved upstream and that you also changed: '
      + 'a/one.ts.');
  });

  test('an empty overlap reads "none"; an unknown branch reads "unknown" (D75-3)', () => {
    expect(reconcileInstruction({ ...INPUT, overlap: [] }))
      .toContain('overlap with your branch: none');
    expect(reconcileInstruction({ ...INPUT, overlap: [] }))
      .toContain('that you also changed: (none).');
    expect(reconcileInstruction({ ...INPUT, overlap: null }))
      .toContain('overlap with your branch: unknown');
    expect(reconcileInstruction({ ...INPUT, overlap: null }))
      .toContain('(unknown — no branch is recorded for this card yet)');
  });

  test('the remote name is never hardcoded', () => {
    expect(reconcileInstruction({ ...INPUT, remote: 'upstream', base: 'main' }))
      .toContain('`git fetch upstream && git merge upstream/main`');
  });
});

describe('renderDriftDigest', () => {
  test('leads with the instruction, then the overlap, then every commit and its files', () => {
    const text = renderDriftDigest(INPUT);
    expect(text.startsWith('# Upstream drift — card i9-card\n')).toBe(true);
    const overlapAt = text.indexOf('## Overlap');
    const commitsAt = text.indexOf('## New commits');
    expect(overlapAt).toBeGreaterThan(0);
    expect(commitsAt).toBeGreaterThan(overlapAt);
    expect(text).toContain('- `aaaaaaaaaaaa` feat: land the thing');
    expect(text).toContain('  - `b/two.ts`');
    expect(text).toContain('## New commits on `origin/master` (2)');
  });

  test('an empty overlap still renders a digest, without the overlap section (D75-3)', () => {
    const text = renderDriftDigest({ ...INPUT, overlap: [] });
    expect(text).toContain('# Upstream drift');
    expect(text).not.toContain('## Overlap');
  });

  test('W75-2: the rendered bytes are a pure function of the git facts — no clock', () => {
    expect(renderDriftDigest(INPUT)).toBe(renderDriftDigest(INPUT));
    expect(renderDriftDigest(INPUT)).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/);
  });
});

describe('decideDriftWrite — spec 2.1 step 4: rewrite only when content changes', () => {
  test('identical content is not rewritten; any difference is', () => {
    const text = renderDriftDigest(INPUT);
    expect(decideDriftWrite(text, text)).toBe(false);
    expect(decideDriftWrite('', text)).toBe(true);
    expect(decideDriftWrite(text, renderDriftDigest({ ...INPUT, overlap: [] }))).toBe(true);
  });
});
```

Run `bun test core/watchdog/drift.test.ts`. Expected: fails on the three missing exports.

- [ ] **Step 2: Minimal implementation** — add `ReconcileInput`, `DigestInput`,
  `reconcileInstruction`, `renderDriftDigest` and `decideDriftWrite` to `core/watchdog/drift.ts`,
  matching the assertions byte for byte. Pluralization is explicit (`1 file` / `2 files`,
  `1 commit` / `2 commits`); the commit sha is displayed at 12 characters; `decideDriftWrite` is a
  named one-liner (`existing !== rendered`) so the tick reads as a decision, not a comparison.
  Carry this comment on `renderDriftDigest`:

```ts
/** W75-2: NOTHING time-varying may enter these bytes. The digest's identity IS the delivery
 * trigger — `decideDriftWrite` compares content, and the deny-once hook fingerprints content —
 * so a timestamp here would rewrite the file every tick and deny every tool call, which is the
 * exact failure D75-2 forbids. Observation time belongs to `status.json.drift.since` and to the
 * event's own `at`. */
```

- [ ] **Step 3: Gates** — from `plugins/tribe/scripts/runner`:

```sh
bun test core/watchdog/drift.test.ts && bun test && bunx tsc --noEmit
```

Expected: new tests pass, whole suite `0 fail`, `tsc` silent.

- [ ] **Step 4: Commit** — `feat(watchdog): drift digest rendering and the reconcile instruction`
  with the campaign trailer and this task's boxes ticked, then `git push`.

---

## Task 4: The read-only git seam and its real adapter (fail-closed edge)

**Files:** `plugins/tribe/scripts/runner/ports/ports.ts` (modify, additive) ·
`plugins/tribe/scripts/runner/adapters/watchdog-io.adapter.ts` (modify) ·
`plugins/tribe/scripts/runner/adapters/watchdog-io.adapter.test.ts` (modify)

**Oracle.** `plugins/tribe/rules/fail-closed-edges.md` obligations 2 and 3 are the contract for
this task: every spawned subprocess neutralizes host git config and carries a timeout. Spec §2.1
step 1 fixes the failure semantics: "timeout; fail-closed: a fetch error is an event
`drift_check_failed` with the stderr, never a crash, never a false 'no drift'". Direction of
error: **a git call that can hang or that can be steered by the developer's `~/.gitconfig` is a
Blocker**; an over-strict environment is by design.

**Fence by intent.** One new port interface and one new adapter method. No decision may live in
the adapter — it captures stdout, stderr and an exit code, and nothing else. Every other adapter
method stays exactly as it is.

**Governing quote** — `plugins/tribe/rules/fail-closed-edges.md`, verbatim:
> **Isolate every subprocess the tool spawns.** A tool shelling out to `git` must neutralize host
> config: set `GIT_CONFIG_GLOBAL` and `GIT_CONFIG_SYSTEM` to `os.devnull` so host settings
> (gpgsign, global hooks path, template dir) cannot change the tool's behavior or a test's verdict.

and, verbatim:
> **Every subprocess call carries a timeout.** A subprocess without a timeout is an unbounded hang
> waiting for the one network call, lock, or prompt that never returns.

**Adjudication rule — REFUTED in advance.**
- "`git` should be reached through the runner's existing `ExecPort`" — no. `WatchdogIO` composes
  its own narrow ports on purpose (`LockReadPort` exists precisely so the watchdog cannot write
  the lock); a general `exec` seam would hand the watchdog the ability to run any command, which
  is what D75-1 exists to prevent.
- "the timeout should be a flag" — REFUTED by W75-9: no new flag. It is a module constant next to
  the argv builders, tested by name.
- "a non-zero exit should throw" — REFUTED by spec §2.1 step 1: the exit code and stderr are data
  the caller turns into a typed event.

**Steps**

- [ ] **Step 1: Failing test** — append to `adapters/watchdog-io.adapter.test.ts`:

```ts
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('buildWatchdogIo().git — the read-only git seam (card i75)', () => {
  const repo = mkdtempSync(join(tmpdir(), 'wd-git-'));
  const io = buildWatchdogIo();

  test('captures stdout and exit 0 for a successful read', async () => {
    const init = await io.git(['init', '--quiet', '-b', 'master', repo], { cwd: tmpdir(), timeoutMs: 30_000 });
    expect(init.exitCode).toBe(0);
    const result = await io.git(['rev-parse', '--is-inside-work-tree'], { cwd: repo, timeoutMs: 30_000 });
    expect([result.exitCode, result.stdout.trim()]).toEqual([0, 'true']);
  });

  test('a failing git call resolves with its stderr and non-zero code, never throws', async () => {
    const result = await io.git(['rev-parse', 'refs/heads/definitely-not-a-ref'], {
      cwd: repo, timeoutMs: 30_000,
    });
    expect(result.exitCode).not.toBe(0);
    expect(result.stderr.length).toBeGreaterThan(0);
  });

  test('host git config cannot reach the subprocess (fail-closed-edges obligation 2)', async () => {
    const hostConfig = join(repo, 'host.gitconfig');
    writeFileSync(hostConfig, '[user]\n\tname = should-never-be-read\n');
    const result = await io.git(['config', '--get', 'user.name'], { cwd: repo, timeoutMs: 30_000 });
    expect(result.stdout).not.toContain('should-never-be-read');
  });

  test('a missing program resolves as a typed failure, never an unhandled rejection', async () => {
    const result = await io.git(['--exec-path'], { cwd: '/nonexistent-directory-for-sure', timeoutMs: 30_000 });
    expect(result.exitCode).not.toBe(0);
  });
});
```

Run `bun test adapters/watchdog-io.adapter.test.ts`. Expected: fails because `io.git` does not
exist (and `tsc` reports it is not a member of `WatchdogIO`).

- [ ] **Step 2: Minimal implementation** — add to `ports/ports.ts`, next to the other watchdog
  seams, and compose it into `WatchdogIO`:

```ts
/** Card i75: READ-only git access for the drift duty. Deliberately NOT `ExecPort`: the watchdog
 * must never be able to run an arbitrary command (D75-1 — it "never touches a worktree or
 * branch"), and the pure core builds every argv from `DRIFT_READ_ONLY_VERBS`. The adapter
 * neutralizes host git config and enforces `timeoutMs` (fail-closed-edges obligations 2, 3);
 * a non-zero exit is DATA, never a throw. */
export interface GitReadPort {
  git(args: string[], opts: { cwd: string; timeoutMs: number }): Promise<ExecResult>;
}
```

and implement it in `adapters/watchdog-io.adapter.ts` using the already-imported `spawn`:
`stdio: ['ignore', 'pipe', 'pipe']`, `env: { ...process.env, GIT_CONFIG_GLOBAL: '/dev/null',
GIT_CONFIG_SYSTEM: '/dev/null', GIT_TERMINAL_PROMPT: '0' }`, `timeout: opts.timeoutMs`,
collecting both streams and resolving `{ stdout, stderr, exitCode }`. An `'error'` event
(program never started) resolves `{ stdout: '', stderr: String(err), exitCode: 127 }`; a
timeout kill resolves with `exitCode: 124` and a stderr line naming the timeout. The promise
never rejects.

- [ ] **Step 3: Gates** — from `plugins/tribe/scripts/runner`:

```sh
bun test adapters/watchdog-io.adapter.test.ts && bun test && bunx tsc --noEmit
```

Expected: the four new adapter tests pass against real `git`; the whole suite is `0 fail` (every
existing `WatchdogIO` fake now needs the new member — supply it in the shared `fakeIo` factory in
`core/watchdog/watch-loop.test.ts` as `git: async () => ({ stdout: '', stderr: '', exitCode: 0 })`
and in `watchdog-integration.test.ts` via the real adapter, which already has it); `tsc` silent.

- [ ] **Step 4: Commit** — `feat(watchdog): read-only git seam with config isolation and timeout`
  with the campaign trailer and this task's boxes ticked, then `git push`.

---

## Task 5: The drift tick (impure by injection only)

**Files:** `core/watchdog/drift-tick.ts` (new) · `core/watchdog/drift-tick.test.ts` (new)

**Oracle.** Spec §2.1's five numbered steps, in order, plus D75-6 and G5. Direction of error is
fixed by G5 and W75-11: **an event, a digest or a git call for a card that is not running is a
Blocker**; a missed detection is a delay. The tick reads the campaign state first and returns
before any subprocess when nothing is running.

**Fence by intent.** This module owns sequencing and nothing else: every decision it needs comes
from `drift.ts`, every effect from the injected `WatchdogIO`. It imports no fs, no clock, no
subprocess module — `structure.test.ts` enforces that mechanically.

**Governing quote** — spec §2.1, verbatim:
> 1. `git fetch origin <base>` (timeout; fail-closed: a fetch error is an event `drift_check_failed`
>    with the stderr, never a crash, never a false "no drift").

and:
> No drift → nothing is written and nothing is appended (G5 zero false alarms). The watchdog
> never fetches into, merges, rebases, or otherwise mutates any worktree or branch (D75-1).

and card D75-6, verbatim:
> **D75-6 Fail closed, never fail silent.** A fetch failure, a missing base, an unreadable
> digest → typed event + WARN in status, never an exception, never "no drift".

**Adjudication rule — REFUTED in advance.**
- "the tick should retry a failed fetch" — no; spec §7's mitigation is explicit: "fetch failures
  are events, not retries in a tight loop". The next tick is the retry.
- "the tick should skip the `symbolic-ref` call and assume `master`" — no; the base branch is a
  repo fact, and `parseBaseBranch` already carries `master` as the fallback for a repo that has no
  remote HEAD.
- "one card failing should abort the whole tick" — no; each card is independent, and a per-card
  failure records its own `drift_check_failed` and continues.

**Steps**

- [ ] **Step 1: Failing test** — create `core/watchdog/drift-tick.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { join } from 'node:path';
import { runDriftTick } from './drift-tick.ts';
import type { WatchdogConfig } from './model.ts';
import type { ExecResult } from '../../ports/ports.ts';

const HOME = '/h/.tribe/k/campaigns/c';
const REPO = '/repo';
const AHEAD = '\u001eaaaa1111\u001ffeat: upstream landed\n\na/one.ts\nb/two.ts\n';

const config = (over: Partial<WatchdogConfig> = {}): WatchdogConfig => ({
  repoRoot: REPO, model: 'm', rawHome: 'x', mode: 'follow', stallMinutes: 30, maxQuotaWaits: 6,
  maxOverloadBackoffs: 5, maxCrashRelaunches: 1, quotaGraceSeconds: 30, pollSeconds: 30,
  fallbackModel: null, passthrough: [], ...over,
});

function state(cards: Record<string, unknown>): string {
  return JSON.stringify({
    v: 1, campaign: 'c', mergePolicy: 'm', sequence: Object.keys(cards),
    schemaLockPaths: [], docsOnlyPaths: [], ownerOnlyEscalations: [], cards,
  });
}

function fakeIo(files: Record<string, string>, gitOf: (args: string[]) => ExecResult) {
  const written: Record<string, string> = {};
  const calls: string[][] = [];
  const io = {
    fileExists: (p: string) => p in files || p in written,
    readFile: (p: string) => written[p] ?? files[p] ?? '',
    writeFileAtomic: (p: string, content: string) => { written[p] = content; },
    ensureDir: () => {},
    now: () => '2026-09-05T10:00:00.000Z',
    git: async (args: string[]) => { calls.push(args); return gitOf(args); },
  };
  return { io, written, calls };
}

const ok = (stdout = ''): ExecResult => ({ stdout, stderr: '', exitCode: 0 });
const gitScript = (args: string[]): ExecResult => {
  if (args[0] === 'symbolic-ref') return ok('origin/master\n');
  if (args[0] === 'fetch') return ok();
  if (args[0] === 'log') return ok(AHEAD);
  if (args[0] === 'diff') return ok('a/one.ts\nz/mine.ts\n');
  return ok();
};

describe('runDriftTick — G5: nothing runs when nothing is running', () => {
  test('no running card means no git call, no event, no file', async () => {
    const f = fakeIo({ [join(HOME, 'campaign-state.json')]: state({ a: { status: 'staged', baseSha: 's', branch: null } }) }, gitScript);
    const result = await runDriftTick(config(), HOME, f.io as never, null);
    expect(result).toEqual({ events: [], drift: null, warn: null });
    expect(f.calls).toEqual([]);
    expect(f.written).toEqual({});
  });

  test('a running card whose upstream did not move writes nothing and appends nothing', async () => {
    const f = fakeIo(
      { [join(HOME, 'campaign-state.json')]: state({ a: { status: 'running', baseSha: 's', branch: 'feat/a' } }) },
      (args) => (args[0] === 'log' ? ok('') : gitScript(args)),
    );
    const result = await runDriftTick(config(), HOME, f.io as never, null);
    expect(result).toEqual({ events: [], drift: null, warn: null });
    expect(f.written).toEqual({});
    expect(f.calls.map((c) => c[0])).toEqual(['symbolic-ref', 'fetch', 'log']);
  });
});

describe('runDriftTick — detection (spec 2.1 steps 2-5)', () => {
  test('writes the digest, appends upstream_drift, and reports drift in status', async () => {
    const f = fakeIo(
      { [join(HOME, 'campaign-state.json')]: state({ a: { status: 'running', baseSha: 'ffff0000', branch: 'feat/a' } }) },
      gitScript,
    );
    const result = await runDriftTick(config(), HOME, f.io as never, null);
    const digestPath = join(HOME, 'drift', 'a.md');

    expect(Object.keys(f.written)).toEqual([digestPath]);
    expect(f.written[digestPath]).toContain('Upstream `origin/master` moved from `ffff0000`');
    expect(f.written[digestPath]).toContain('a/one.ts');
    expect(result.events).toEqual([{
      action: 'upstream_drift',
      detail: { card: 'a', ahead: 1, overlap: 1, digestPath },
    }]);
    expect(result.drift).toEqual({
      card: 'a', ahead: 1, overlap: 1, digestPath, since: '2026-09-05T10:00:00.000Z',
    });
    expect(result.warn).toBe(null);
  });

  test('W75-3: an unchanged digest is not rewritten and appends no second event', async () => {
    const f = fakeIo(
      { [join(HOME, 'campaign-state.json')]: state({ a: { status: 'running', baseSha: 'ffff0000', branch: 'feat/a' } }) },
      gitScript,
    );
    const first = await runDriftTick(config(), HOME, f.io as never, null);
    const second = await runDriftTick(config(), HOME, f.io as never, first.drift);
    expect(second.events).toEqual([]);
    expect(second.drift?.since).toBe(first.drift?.since);
  });

  test('a card with no branch yet computes no diff and reports overlap unknown (D75-3)', async () => {
    const f = fakeIo(
      { [join(HOME, 'campaign-state.json')]: state({ a: { status: 'running', baseSha: 'ffff0000', branch: null } }) },
      gitScript,
    );
    const result = await runDriftTick(config(), HOME, f.io as never, null);
    expect(f.calls.map((c) => c[0])).toEqual(['symbolic-ref', 'fetch', 'log']);
    expect(result.drift?.overlap).toBe(null);
    expect(f.written[join(HOME, 'drift', 'a.md')]).toContain('overlap with your branch: unknown');
  });
});

describe('runDriftTick — D75-6: fail closed, never fail silent', () => {
  test('a failed fetch is a typed event plus a warn, and no digest', async () => {
    const f = fakeIo(
      { [join(HOME, 'campaign-state.json')]: state({ a: { status: 'running', baseSha: 's', branch: 'feat/a' } }) },
      (args) => (args[0] === 'fetch'
        ? { stdout: '', stderr: 'fatal: could not read from remote repository', exitCode: 128 }
        : gitScript(args)),
    );
    const result = await runDriftTick(config(), HOME, f.io as never, null);
    expect(result.events[0]?.action).toBe('drift_check_failed');
    expect(result.events[0]?.detail).toMatchObject({ reason: 'fetch_failed', exitCode: 128 });
    expect(String(result.warn)).toContain('could not read from remote repository');
    expect(f.written).toEqual({});
    expect(result.drift).toBe(null);
  });

  test('an unreadable campaign state is a typed event plus a warn, and no git call', async () => {
    const f = fakeIo({ [join(HOME, 'campaign-state.json')]: '{ broken' }, gitScript);
    const result = await runDriftTick(config(), HOME, f.io as never, null);
    expect(result.events[0]?.action).toBe('drift_check_failed');
    expect(result.events[0]?.detail).toMatchObject({ reason: 'state_unreadable' });
    expect(f.calls).toEqual([]);
  });

  test('a failed per-card log records the card and continues to the next card', async () => {
    const f = fakeIo(
      {
        [join(HOME, 'campaign-state.json')]: state({
          a: { status: 'running', baseSha: 'bad', branch: 'feat/a' },
          b: { status: 'running', baseSha: 'ffff0000', branch: 'feat/b' },
        }),
      },
      (args) => (args[0] === 'log' && args[3]?.startsWith('bad')
        ? { stdout: '', stderr: 'fatal: bad revision', exitCode: 128 }
        : gitScript(args)),
    );
    const result = await runDriftTick(config(), HOME, f.io as never, null);
    expect(result.events.map((e) => e.action)).toEqual(['drift_check_failed', 'upstream_drift']);
    expect(result.drift?.card).toBe('b');
  });

  test('the remote name comes from the runner pass-through (W75-9)', async () => {
    const f = fakeIo(
      { [join(HOME, 'campaign-state.json')]: state({ a: { status: 'running', baseSha: 's', branch: null } }) },
      (args) => (args[0] === 'symbolic-ref' ? ok('upstream/main\n') : gitScript(args)),
    );
    await runDriftTick(config({ passthrough: ['--remote', 'upstream'] }), HOME, f.io as never, null);
    expect(f.calls[0]).toEqual(['symbolic-ref', '--short', 'refs/remotes/upstream/HEAD']);
    expect(f.calls[1]).toEqual(['fetch', '--quiet', 'upstream', 'main']);
  });
});
```

Run `bun test core/watchdog/drift-tick.test.ts`. Expected: fails to resolve `./drift-tick.ts`.

- [ ] **Step 2: Minimal implementation** — create `core/watchdog/drift-tick.ts` exporting
  `DriftTickEvent`, `DriftStatusEntry`, `DriftTickResult`, `DRIFT_GIT_TIMEOUT_MS = 30_000` and
  `runDriftTick(config, homeDir, io, previous)`. Sequence, exactly: read
  `campaignStatePathOf(homeDir)` → `selectDriftCards` (warn short-circuits with
  `drift_check_failed{reason:'state_unreadable'}`; zero cards short-circuits with silence) →
  `baseBranchCommand` → `parseBaseBranch` → `fetchCommand` (non-zero exit short-circuits with
  `drift_check_failed{reason:'fetch_failed', remote, base, exitCode, stderr}`) → per card, in
  sorted order: `aheadLogCommand` → `parseAheadLog` → skip when empty → `branchFilesCommand` only
  when `branch !== null` → `computeOverlap` → `renderDriftDigest` (tip is `commits[0].sha`, W75-4)
  → `decideDriftWrite` → `ensureDir(driftDirOf(homeDir))` + `writeFileAtomic` + the
  `upstream_drift` event only when it changed. `io` is typed as the narrow slice this module
  needs (`Pick<WatchdogIO, 'readFile' | 'writeFileAtomic' | 'ensureDir' | 'now' | 'git'>`), so the
  test's fake needs nothing more than those five members.

- [ ] **Step 3: Gates** — from `plugins/tribe/scripts/runner`:

```sh
bun test core/watchdog/drift-tick.test.ts && bun test structure.test.ts && bun test && bunx tsc --noEmit
```

Expected: the eleven new tick tests pass; `structure.test.ts` still green (the new module names no
world-touching specifier); whole suite `0 fail`; `tsc` silent.

- [ ] **Step 4: Commit** — `feat(watchdog): the drift tick — detect, digest, event, fail closed`
  with the campaign trailer and this task's boxes ticked, then `git push`.

---

## Task 6: Wire the tick into the supervision loop and `status.json`

**Files:** `core/watchdog/watch-loop.ts` (modify) · `core/watchdog/model.ts` (modify) ·
`core/watchdog/status.ts` (modify) · `core/watchdog/watch-loop.test.ts` (modify) ·
`core/watchdog/status.test.ts` (modify)

**Oracle.** Spec §2.1 step 5 fixes the status shape: "`status.json` gains `drift: {card, ahead,
overlap, digestPath, since}`". D75-6 adds the WARN. The direction of error for the loop wiring is
fixed by the watchdog's own reason for existing: **a drift failure that kills the supervisor is a
Blocker** — a watchdog that dies with a stack trace is strictly worse than the LLM heartbeat it
replaced (`adapters/watchdog-io.adapter.ts` header, verbatim).

**Fence by intent.** Additive only: one call inside the existing loop body, two new fields on the
published status, one new `LoopState` slot. No existing action, event or exit code changes.

**Governing quote** — spec §2.1 step 5, verbatim:
> 5. Append `upstream_drift{card, ahead: n, overlap: k}` to `events.jsonl`; `status.json` gains
>    `drift: {card, ahead, overlap, digestPath, since}`.

**Adjudication rule — REFUTED in advance.**
- "the broad `catch` around `runDriftTick` in the loop violates fail-closed-edges obligation 1" —
  REFUTED in advance: obligation 1 requires converting a failure into a **typed refusal** rather
  than letting a traceback escape, which is exactly what this catch does (`drift_check_failed` +
  WARN). This is the supervisor boundary; the same argument is already written into
  `adapters/watchdog-io.adapter.ts`'s header and into `cli/main.ts`'s `runWatchdog` wrapper. Every
  catch INSIDE `drift.ts` and `drift-tick.ts` stays narrow.
- "`drift` should be an array so several drifting cards are visible" — REFUTED by the spec's own
  literal shape (`drift: {card, ahead, overlap, digestPath, since}`, singular). Per-card detail
  lives in `events.jsonl` and in one digest file per card; `status.json` carries the most recent.
- "the drift tick should run during a `wait_until` sleep" — out of fence and a known limitation
  documented in Task 12: the loop re-enters the tick when the wait ends.

**Steps**

- [ ] **Step 1: Failing test** — append to `core/watchdog/status.test.ts`:

```ts
describe('buildStatus — drift (card i75)', () => {
  test('a detected drift is published; absence is an explicit null', () => {
    const base = {
      config: { mode: 'follow' as const }, pid: 1, home: '/h', startedAt: 'a', updatedAt: 'b',
      state: 'runner_running', lastAction: 'attach', runId: null, runnerPid: null,
      runnerCommand: null, counters: COUNTERS, nextWakeAtMs: null, stall: null, terminal: null,
    };
    expect(buildStatus(base).drift).toBe(null);
    expect(buildStatus(base).driftWarn).toBe(null);
    const withDrift = buildStatus({
      ...base,
      drift: { card: 'a', ahead: 2, overlap: 1, digestPath: '/h/drift/a.md', since: 'c' },
      driftWarn: 'drift check failed: boom',
    });
    expect(withDrift.drift).toEqual({
      card: 'a', ahead: 2, overlap: 1, digestPath: '/h/drift/a.md', since: 'c',
    });
    expect(withDrift.driftWarn).toBe('drift check failed: boom');
  });
});
```

and append to `core/watchdog/watch-loop.test.ts` (the shared `fakeIo` gains a scriptable `git`
and a real `campaign-state.json` entry in its file map — a fake whose home has no state file
could not survive the CLI's own `resolveWatchdogHome` gate, and `fixtures-mirror-reality`
forbids a fixture that could not exist):

```ts
describe('the drift duty inside the tick (card i75)', () => {
  test('a running card whose upstream moved gets a digest, an event and status.drift', async () => {
    const io = fakeIo([{ runId: 'r1', exitCode: 0 }]);
    io.setStateCards({ a: { status: 'running', baseSha: 'ffff0000', branch: 'feat/a' } });
    io.setGitScript((args) => {
      if (args[0] === 'symbolic-ref') return { stdout: 'origin/master\n', stderr: '', exitCode: 0 };
      if (args[0] === 'log') return { stdout: '\u001eaaaa1111\u001ffeat: landed\n\na/one.ts\n', stderr: '', exitCode: 0 };
      if (args[0] === 'diff') return { stdout: 'a/one.ts\n', stderr: '', exitCode: 0 };
      return { stdout: '', stderr: '', exitCode: 0 };
    });
    await runWatchdog(config(), HOME, io.io);

    expect(io.events().map((e) => e.action)).toContain('upstream_drift');
    expect(io.status().drift).toMatchObject({ card: 'a', ahead: 1, overlap: 1 });
    expect(io.files.get(join(HOME, 'drift', 'a.md'))).toContain('never rebase');
  });

  test('a failing drift check never kills the supervisor: typed event, WARN, run continues', async () => {
    const io = fakeIo([{ runId: 'r1', exitCode: 0 }]);
    io.setStateCards({ a: { status: 'running', baseSha: 'ffff0000', branch: 'feat/a' } });
    io.setGitScript(() => { throw new Error('git seam exploded'); });
    const outcome = await runWatchdog(config(), HOME, io.io);

    expect([outcome.exitCode, outcome.reason]).toEqual([0, 'runner_done']);
    expect(io.events().map((e) => e.action)).toContain('drift_check_failed');
    expect(String(io.status().driftWarn)).toContain('git seam exploded');
  });

  test('G5: with no running card the tick makes no git call and adds no event', async () => {
    const io = fakeIo([{ runId: 'r1', exitCode: 0 }]);
    io.setGitScript(() => { throw new Error('git must not be called'); });
    await runWatchdog(config(), HOME, io.io);
    expect(io.events().map((e) => e.action)).not.toContain('upstream_drift');
    expect(io.events().map((e) => e.action)).not.toContain('drift_check_failed');
  });
});
```

Run `bun test core/watchdog/watch-loop.test.ts core/watchdog/status.test.ts`. Expected: fails —
`drift` is not on `WatchdogStatus`, and `fakeIo` has no `setStateCards`/`setGitScript`.

- [ ] **Step 2: Minimal implementation** —
  `model.ts`: add `drift: DriftStatusPublication | null` and `driftWarn: string | null` to
  `WatchdogStatus`, with the interface declared in `model.ts` (never in `core/types.ts`).
  `status.ts`: `BuildStatusInput` gains both as OPTIONAL fields; `buildStatus` writes
  `input.drift ?? null` and `input.driftWarn ?? null`, so every pre-existing fixture compiles and
  keeps asserting what it always asserted.
  `watch-loop.ts`: `LoopState` gains `drift` and `driftWarn`; `publish()` passes them; the loop
  body calls the tick immediately after `currentSignalDetail = signalDetail;`:

```ts
    try {
      const driftResult = await runDriftTick(config, homeDir, io, state.drift);
      for (const event of driftResult.events) record(event.action, event.detail);
      if (driftResult.drift !== null) state.drift = driftResult.drift;
      state.driftWarn = driftResult.warn;
    } catch (err) {
      // Supervisor boundary (see this task's adjudication rule): the drift duty is ADVISORY, and
      // a watchdog that dies with a stack trace because a git seam failed is strictly worse than
      // the LLM heartbeat it replaced (adapters/watchdog-io.adapter.ts's own header argument).
      // Converted to the same typed refusal every other drift failure produces, never swallowed.
      const message = err instanceof Error ? err.message : String(err);
      record('drift_check_failed', { reason: 'internal', message });
      state.driftWarn = `drift check failed: ${message}`;
    }
```

- [ ] **Step 3: Gates** — from `plugins/tribe/scripts/runner`:

```sh
bun test core/watchdog && bun test && bunx tsc --noEmit
```

Expected: the three new loop tests and the new status test pass; every pre-existing watchdog test
still passes with its assertions unchanged; whole suite `0 fail`; `tsc` silent.

- [ ] **Step 4: Commit** — `feat(watchdog): run the drift duty every tick and publish it in status`
  with the campaign trailer and this task's boxes ticked, then `git push`.

---

## Task 7: G1 — integration against a real bare remote

**Files:** `plugins/tribe/scripts/runner/watchdog-drift-integration.test.ts` (new)

**Oracle.** Card G1, verbatim below, is the contract. `fixtures-mirror-reality.md` fixes the
method: real `git`, a real push to a real bare remote, the REAL adapter — no mocked git, no
scripted stdout. Direction of error: **a test that would still pass if `git fetch` were never
called is a defective test.**

**Fence by intent.** One new integration test file at the runner root, next to
`watchdog-integration.test.ts`. It drives `runDriftTick` with the real `buildWatchdogIo()` adapter
against a throwaway repo, remote and campaign home. It spawns no runner and no session.

**Governing quote** — card §Measurable goals G1, verbatim:
> **G1 Detection within one tick.** Integration test with a local bare remote: card running
> (simulated), a commit pushed to the remote's `master` → within one tick (default 60 s) the
> drift file `<home>/drift/<card>.md` exists, lists the new commit(s) with subject and files,
> and names the overlap with the card branch's changed files (empty overlap stated as such).
> `events.jsonl` carries `upstream_drift{card, ahead, overlap}`.

**Adjudication rule — REFUTED in advance.**
- "the test should run the whole `watchdog --once` CLI" — that is Task 11's shell e2e, which
  covers the CLI edge including relative and absolute `--home`. This file covers the tick against
  the real adapter, which is where the git wiring lives.
- "creating commits with `-c user.email=...` is unnecessary" — it is necessary: the host git
  config is neutralized (Task 4), so identity must be supplied per command or `git commit` fails.

**Steps**

- [ ] **Step 1: Failing test** — create `watchdog-drift-integration.test.ts`:

```ts
/** Integration: the REAL git adapter against a REAL local bare remote — the drift duty's wiring,
 * not its logic (the pure core is table-tested). fixtures-mirror-reality: a real push is the only
 * honest source of "upstream moved". */
import { describe, expect, test } from 'bun:test';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDriftTick } from './core/watchdog/drift-tick.ts';
import { buildWatchdogIo } from './adapters/watchdog-io.adapter.ts';
import type { WatchdogConfig } from './core/watchdog/model.ts';

const io = buildWatchdogIo();
const git = (cwd: string, args: string[]) => io.git(args, { cwd, timeoutMs: 60_000 });
const ID = ['-c', 'user.email=t@t.test', '-c', 'user.name=t'];

async function scaffold() {
  const root = mkdtempSync(join(tmpdir(), 'drift-int-'));
  const remote = join(root, 'remote.git');
  const repo = join(root, 'repo');
  const home = join(root, '.tribe', 'k', 'campaigns', 'c');
  mkdirSync(home, { recursive: true });
  await git(root, ['init', '--quiet', '--bare', remote]);
  await git(root, ['init', '--quiet', '-b', 'master', repo]);
  await git(repo, [...ID, 'commit', '--quiet', '--allow-empty', '-m', 'base']);
  await git(repo, ['remote', 'add', 'origin', remote]);
  await git(repo, ['push', '--quiet', '-u', 'origin', 'master']);
  const baseSha = (await git(repo, ['rev-parse', 'HEAD'])).stdout.trim();
  return { root, remote, repo, home, baseSha };
}

function writeState(home: string, card: Record<string, unknown>) {
  writeFileSync(join(home, 'campaign-state.json'), JSON.stringify({
    v: 1, campaign: 'drift-int', mergePolicy: 'regular-merge-only', sequence: ['D1'],
    schemaLockPaths: [], docsOnlyPaths: [], ownerOnlyEscalations: [],
    cards: { D1: { status: 'running', spec: null, plan: null, pr: null, mergeSha: null,
      sessionId: null, updatedAt: null, ...card } },
  }));
}

const config = (repo: string): WatchdogConfig => ({
  repoRoot: repo, model: 'm', rawHome: 'x', mode: 'once', stallMinutes: 30, maxQuotaWaits: 6,
  maxOverloadBackoffs: 5, maxCrashRelaunches: 1, quotaGraceSeconds: 30, pollSeconds: 30,
  fallbackModel: null, passthrough: [],
});

describe('G1 — a real commit pushed to a real remote is detected in one tick', () => {
  test('digest names the commit, its files and the overlap; the event carries the counts', async () => {
    const s = await scaffold();
    // The card's branch changes one file that upstream will also change, and one it will not.
    await git(s.repo, [...ID, 'checkout', '--quiet', '-b', 'feat/d1']);
    mkdirSync(join(s.repo, 'a'), { recursive: true });
    writeFileSync(join(s.repo, 'a', 'shared.ts'), 'card version\n');
    writeFileSync(join(s.repo, 'a', 'mine.ts'), 'card only\n');
    await git(s.repo, ['add', 'a']);
    await git(s.repo, [...ID, 'commit', '--quiet', '-m', 'card work']);
    writeState(s.home, { baseSha: s.baseSha, branch: 'feat/d1' });

    // Nothing has moved upstream yet: G5 — no file, no event.
    const quiet = await runDriftTick(config(s.repo), s.home, io, null);
    expect(quiet).toEqual({ events: [], drift: null, warn: null });
    expect(existsSync(join(s.home, 'drift', 'D1.md'))).toBe(false);

    // A second clone pushes upstream — the parallel-agent scenario this card exists for.
    const other = join(s.root, 'other');
    await git(s.root, ['clone', '--quiet', s.remote, other]);
    mkdirSync(join(other, 'a'), { recursive: true });
    writeFileSync(join(other, 'a', 'shared.ts'), 'upstream version\n');
    writeFileSync(join(other, 'a', 'upstream-only.ts'), 'x\n');
    await git(other, ['add', 'a']);
    await git(other, [...ID, 'commit', '--quiet', '-m', 'upstream: land the other card']);
    await git(other, ['push', '--quiet', 'origin', 'master']);

    const result = await runDriftTick(config(s.repo), s.home, io, null);
    const digestPath = join(s.home, 'drift', 'D1.md');
    const digest = readFileSync(digestPath, 'utf8');

    expect(result.events).toEqual([{
      action: 'upstream_drift', detail: { card: 'D1', ahead: 1, overlap: 1, digestPath },
    }]);
    expect(digest).toContain('upstream: land the other card');
    expect(digest).toContain('a/shared.ts');
    expect(digest).toContain('a/upstream-only.ts');
    expect(digest).toContain('## Overlap');
    expect(digest).toContain('overlap with your branch: 1 file');
    expect(digest).not.toContain('a/mine.ts');
    expect(result.drift).toMatchObject({ card: 'D1', ahead: 1, overlap: 1, digestPath });

    // W75-3: a second tick with the same upstream state rewrites nothing and adds no event.
    const again = await runDriftTick(config(s.repo), s.home, io, result.drift);
    expect(again.events).toEqual([]);
  }, 120_000);

  test('an empty overlap is stated as such, and an unknown branch reads unknown (D75-3)', async () => {
    const s = await scaffold();
    writeState(s.home, { baseSha: s.baseSha, branch: null });
    const other = join(s.root, 'other');
    await git(s.root, ['clone', '--quiet', s.remote, other]);
    writeFileSync(join(other, 'far-away.ts'), 'x\n');
    await git(other, ['add', 'far-away.ts']);
    await git(other, [...ID, 'commit', '--quiet', '-m', 'upstream: unrelated']);
    await git(other, ['push', '--quiet', 'origin', 'master']);

    const unknown = await runDriftTick(config(s.repo), s.home, io, null);
    expect(unknown.drift?.overlap).toBe(null);
    expect(readFileSync(join(s.home, 'drift', 'D1.md'), 'utf8'))
      .toContain('overlap with your branch: unknown');

    // Now give the card a branch that touches nothing upstream touched: overlap is "none".
    await git(s.repo, [...ID, 'checkout', '--quiet', '-b', 'feat/d1']);
    writeFileSync(join(s.repo, 'only-mine.ts'), 'x\n');
    await git(s.repo, ['add', 'only-mine.ts']);
    await git(s.repo, [...ID, 'commit', '--quiet', '-m', 'card work']);
    writeState(s.home, { baseSha: s.baseSha, branch: 'feat/d1' });
    const none = await runDriftTick(config(s.repo), s.home, io, null);
    expect(none.drift?.overlap).toBe(0);
    expect(readFileSync(join(s.home, 'drift', 'D1.md'), 'utf8'))
      .toContain('overlap with your branch: none');
  }, 120_000);

  test('D75-1: the drift duty leaves the worktree and every branch untouched', async () => {
    const s = await scaffold();
    await git(s.repo, [...ID, 'checkout', '--quiet', '-b', 'feat/d1']);
    writeState(s.home, { baseSha: s.baseSha, branch: 'feat/d1' });
    const other = join(s.root, 'other');
    await git(s.root, ['clone', '--quiet', s.remote, other]);
    writeFileSync(join(other, 'u.ts'), 'x\n');
    await git(other, ['add', 'u.ts']);
    await git(other, [...ID, 'commit', '--quiet', '-m', 'upstream']);
    await git(other, ['push', '--quiet', 'origin', 'master']);

    const headBefore = (await git(s.repo, ['rev-parse', 'HEAD'])).stdout.trim();
    const statusBefore = (await git(s.repo, ['status', '--porcelain'])).stdout;
    await runDriftTick(config(s.repo), s.home, io, null);
    expect((await git(s.repo, ['rev-parse', 'HEAD'])).stdout.trim()).toBe(headBefore);
    expect((await git(s.repo, ['status', '--porcelain'])).stdout).toBe(statusBefore);
    // The fetch DID update the remote-tracking ref — that is the whole point, and it is neither
    // a worktree nor a branch.
    expect((await git(s.repo, ['rev-parse', 'origin/master'])).stdout.trim()).not.toBe(headBefore);
  }, 120_000);
});
```

Run `bun test watchdog-drift-integration.test.ts`. Expected: red until Tasks 1-5 are in place;
once they are, it must go green without touching them (if it does not, the defect is in the
production code, never in this test's expectations).

- [ ] **Step 2: Minimal implementation** — none expected. If a real-git behaviour contradicts a
  pure-core assumption (for example `git log --name-only` quoting a path with unusual characters),
  fix the PURE module and its unit test in the same commit, and record the correction in the
  worker report — the real binary is the oracle here, not the earlier fixture.

- [ ] **Step 3: Gates** — from `plugins/tribe/scripts/runner`:

```sh
bun test watchdog-drift-integration.test.ts && bun test && bunx tsc --noEmit
```

Expected: three integration tests pass against real `git`; whole suite `0 fail`; `tsc` silent.

- [ ] **Step 4: Commit** — `test(watchdog): G1 drift detection against a real bare remote` with the
  campaign trailer and this task's boxes ticked, then `git push`.

---

## Task 8: Brief delivery — the drift section and the pre-PR reconcile step

**Files:** `core/brief-template.md` (modify) · `core/brief.ts` (modify) ·
`core/brief.test.ts` (modify)

**Oracle.** Card G2 and G4, verbatim below. Spec §2.2 channel 1 and channel 3. The direction of
error: **a brief that renders a `## Upstream drift` heading with no drift is a bug** (G2 says
"absent otherwise"); a brief that says too much about reconciling before the PR is by design.

**Fence by intent.** The renderer learns one optional options parameter (W75-8) and the committed
template gains one section marker plus one new section. No caller is forced to change; the two
real call sites are Task 10's business.

**Governing quote** — card §Measurable goals G2 and G4, verbatim:
> **G2 Delivery at spawn/resume.** A brief rendered after drift contains a `## Upstream
> drift` section with the digest; a brief rendered with no drift file contains none.
> **G4 Pre-PR reconcile is mandatory.** The executor brief's Definition of Done gains a step
> before `gh pr create`: run the drift check; if `origin/<base>` is ahead of the branch's
> merge-base, merge it in (regular merge, never rebase — repo convention) and re-run gates.
> Evidence: the rendered brief text + a test that the template carries it.

**Adjudication rule — REFUTED in advance.**
- "the template should hardcode `origin/master`" — REFUTED by `core/brief.ts`'s own
  stateless-capability header ("no repo names, paths, model names, or campaign values are
  hardcoded here"): the remote and base arrive through the options parameter, with the runner's
  own protocol defaults (`origin`, `master`) as fallbacks.
- "the drift section belongs under Answers" — no; Answers is a snapshot of rulings and its
  own text says a resume never re-sends it. Drift is operational and belongs above the Walls,
  where the session reads it before planning any work.
- "`executorBrief` should take three new positional parameters" — REFUTED by W75-8.

**Steps**

- [ ] **Step 1: Failing test** — append to `core/brief.test.ts`:

```ts
import { driftSection } from './brief.ts';

const DIGEST = '# Upstream drift — card C7\n\nUpstream `origin/master` moved from `aaa` to `bbb` '
  + '(1 commit; overlap with your branch: 1 file).\n';

describe('driftSection (G2)', () => {
  test('absent drift renders nothing at all', () => {
    expect(driftSection('')).toBe('');
    expect(driftSection('   \n')).toBe('');
  });
  test('present drift renders one section carrying the digest verbatim', () => {
    expect(driftSection(DIGEST)).toBe(`\n## Upstream drift\n\n${DIGEST.trim()}\n`);
  });
});

describe('executorBrief — drift delivery at spawn (G2)', () => {
  test('a brief rendered with a digest carries the section and the digest text', () => {
    const brief = executorBrief(fixtureCard(), fixtureState(), FIXTURE_ANSWERS, TEMPLATE,
      FIXTURE_REPORT_PATH, FIXTURE_CAMPAIGN_SLUG, { driftContent: DIGEST });
    expect(brief).toContain('## Upstream drift');
    expect(brief).toContain('overlap with your branch: 1 file');
  });

  test('a brief rendered with no digest contains no drift heading anywhere', () => {
    const brief = executorBrief(fixtureCard(), fixtureState(), FIXTURE_ANSWERS, TEMPLATE,
      FIXTURE_REPORT_PATH, FIXTURE_CAMPAIGN_SLUG);
    expect(brief).not.toContain('Upstream drift');
    expect(brief).toBe(EXPECTED_BRIEF);
  });
});

describe('executorBrief — the pre-PR reconcile step (G4)', () => {
  test('the rendered brief mandates fetch + regular merge before gh pr create', () => {
    const brief = executorBrief(fixtureCard(), fixtureState(), FIXTURE_ANSWERS, TEMPLATE,
      FIXTURE_REPORT_PATH, FIXTURE_CAMPAIGN_SLUG, { remote: 'upstream', baseBranch: 'main' });
    expect(brief).toContain('## Before you open the PR (upstream reconcile — mandatory)');
    expect(brief).toContain('git fetch upstream');
    expect(brief).toContain('git merge upstream/main');
    expect(brief).toContain('regular merge, never rebase');
    expect(brief.indexOf('## Before you open the PR'))
      .toBeLessThan(brief.indexOf('## Definition of Done'));
  });

  test('the remote and base default to the runner protocol defaults when not supplied', () => {
    const brief = executorBrief(fixtureCard(), fixtureState(), FIXTURE_ANSWERS, TEMPLATE,
      FIXTURE_REPORT_PATH, FIXTURE_CAMPAIGN_SLUG);
    expect(brief).toContain('git merge origin/master');
  });
});
```

`EXPECTED_BRIEF` in that file is updated in the same edit to include the new
`## Before you open the PR` section and the blank line the empty drift marker leaves behind —
that constant is the byte-exact rendering, so it changes whenever the template does.

Run `bun test core/brief.test.ts`. Expected: fails on the missing `driftSection` export and the
missing template sections.

- [ ] **Step 2: Minimal implementation** — `core/brief-template.md` gains the marker between the
  Goal and Walls sections:

```md
## Goal

{{GOAL}}
{{DRIFT_SECTION}}
## Walls (non-negotiable)
```

and, immediately before `## Definition of Done (preconditions for SHIPPED)`:

```md
## Before you open the PR (upstream reconcile — mandatory)

Other agents land work on `{{REMOTE}}/{{BASE_BRANCH}}` while you work. Before `gh pr create`,
ALWAYS, in this order:

1. `git fetch {{REMOTE}}` in your worktree.
2. `git log --oneline {{REMOTE}}/{{BASE_BRANCH}}...HEAD` — if the base branch is ahead of your
   branch's merge-base, it moved under you.
3. If it moved: `git merge {{REMOTE}}/{{BASE_BRANCH}}` — a regular merge, never rebase, never
   squash (this repo's only merge shape is a 2-parent merge). Resolve conflicts, re-run every
   gate, and only then open the PR.
4. If a `## Upstream drift` section appears above, or a drift digest is named in a resume
   prompt, it already lists the new commits and which of them touch files you also changed.

A PR opened on a stale base wastes a full review round; this step is not optional.
```

`core/brief.ts` gains `driftSection`, the `BriefExtras` interface, and the seventh optional
parameter (default `{}`), passing `DRIFT_SECTION`, `REMOTE` (default `origin`) and `BASE_BRANCH`
(default `master`) into `renderTemplate`.

- [ ] **Step 3: Gates** — from `plugins/tribe/scripts/runner`:

```sh
bun test core/brief.test.ts && bun test && bunx tsc --noEmit
```

Expected: the six new brief tests pass, the byte-exact `EXPECTED_BRIEF` test passes, whole suite
`0 fail`, `tsc` silent.

- [ ] **Step 4: Commit** — `feat(runner): brief carries the upstream drift section and the pre-PR
  reconcile step` with the campaign trailer and this task's boxes ticked, then `git push`.

---

## Task 9: The deny-once PreToolUse hook (P7's deferred design, built)

**Files:** `core/session.ts` (modify) · `ports/ports.ts` (modify, additive) ·
`core/session.test.ts` (modify)

**Oracle.** Spec §2.2 channel 2 and D75-5, verbatim below; card G3 is the acceptance row list.
The existing `decideWaitToolHook` is the shape to copy: a pure decision function, its own
`PreToolUse` entry, its own exported reason constant, its own `describe` block invoking the hook
directly. Direction of error: **denying twice for the same content, or denying for an absent
file, is a Blocker** (it wedges an executor that has nothing to fix); a missed notice is a delay
the brief and the pre-PR step both backstop.

**Fence by intent.** Additive: one new exported pure function, one new hook factory, one new
optional `SessionIO` member, one new optional `RunSessionConfig` field, one new `PreToolUse` entry
appended at index 3. Indices 0, 1 and 2 keep their current hooks and their current tests.

**Governing quote** — spec §2.2 channel 2, verbatim:
> 2. **Mid-flight (deny-once hook).** A PreToolUse hook holds the digest's content hash as seen
>    at spawn (or "absent"). When the hash differs at a tool call, deny exactly that ONE call with
>    a message carrying the digest and the reconcile instruction; then record the new hash and
>    stay silent until the digest changes again. Never denies twice for the same content; never
>    denies when the file is absent or unchanged.

and spec D75-5, verbatim:
> **D75-5 Ruling delivery rides the same hook.** The deny-once mechanism watches a small
> allowlist of files, not just the drift digest: `<home>/drift/<card>.md` and
> `<home>/answers.md`. A ruling appended to `answers.md` after spawn therefore reaches a
> resumed session on its next tool call — closing the gap that cost three runner passes on
> #106 (diary 2026-09-03T00:32Z). Same contract: one denial per content change per file.

**Adjudication rule — REFUTED in advance.**
- "the hook should read the files synchronously at spawn so priming is literal" — REFUTED by
  W75-6: `buildSessionOptions` is synchronous and runs before the session exists; the seam is
  async by design and the first tool call primes. The brief rendered at the same instant already
  carried the drift section, so nothing is lost.
- "an unreadable watched file should deny (fail closed)" — REFUTED by the governing quote itself:
  "never denies when the file is absent". For this hook the safe direction is to allow (W75-10).
- "the hook should use `node:crypto`" — REFUTED by W75-5; a pure length-prefixed FNV-1a keeps
  `core/session.ts` importing nothing new and makes the fingerprint unit-testable by value.
- "two changed files should produce two denials" — REFUTED by W75-7: one denial carrying both is
  strictly within "one denial per content change per file" and less disruptive.

**Steps**

- [ ] **Step 1: Failing test** — append to `core/session.test.ts`:

```ts
import { buildMidFlightNoticeHook, fingerprintOf, MID_FLIGHT_NOTICE_HEADLINE } from './session.ts';

const CALL = { tool_name: 'Bash', tool_input: { command: 'bun test' } };
const denial = (d: HookDecision) => d.hookSpecificOutput?.permissionDecision ?? null;
const reason = (d: HookDecision) => d.hookSpecificOutput?.permissionDecisionReason ?? '';

function watchedIo(files: Record<string, string | null>) {
  return { readWatchedFile: async (p: string) => files[p] ?? null };
}

describe('fingerprintOf (W75-5)', () => {
  test('absent is its own value; content fingerprints are stable and length-prefixed', () => {
    expect(fingerprintOf(null)).toBe('absent');
    expect(fingerprintOf('abc')).toBe(fingerprintOf('abc'));
    expect(fingerprintOf('abc')).not.toBe(fingerprintOf('abd'));
    expect(fingerprintOf('abc').startsWith('3:')).toBe(true);
  });
});

describe('buildMidFlightNoticeHook — deny once per content change (G3, D75-2)', () => {
  test('primes on the first call, denies the call after a change, then stays silent', async () => {
    const files: Record<string, string | null> = { '/h/drift/a.md': null };
    const hook = buildMidFlightNoticeHook(watchedIo(files),
      [{ label: 'Upstream drift digest', path: '/h/drift/a.md' }]);

    expect(denial(await hook(CALL))).toBe(null);                 // primes, never denies (W75-6)
    files['/h/drift/a.md'] = 'Upstream `origin/master` moved; merge it, never rebase, then continue.';
    const denied = await hook(CALL);
    expect(denial(denied)).toBe('deny');
    expect(reason(denied)).toContain(MID_FLIGHT_NOTICE_HEADLINE);
    expect(reason(denied)).toContain('Upstream `origin/master` moved');
    expect(reason(denied)).toContain('never rebase');
    expect(denial(await hook(CALL))).toBe(null);                 // the very next call passes
    expect(denial(await hook(CALL))).toBe(null);                 // and stays passing
  });

  test('a second, different change denies exactly once again', async () => {
    const files: Record<string, string | null> = { '/h/drift/a.md': 'first' };
    const hook = buildMidFlightNoticeHook(watchedIo(files),
      [{ label: 'Upstream drift digest', path: '/h/drift/a.md' }]);
    await hook(CALL);
    files['/h/drift/a.md'] = 'second';
    expect(denial(await hook(CALL))).toBe('deny');
    expect(denial(await hook(CALL))).toBe(null);
  });

  test('an absent file never denies, however many calls are made (G5)', async () => {
    const hook = buildMidFlightNoticeHook(watchedIo({ '/h/drift/a.md': null }),
      [{ label: 'Upstream drift digest', path: '/h/drift/a.md' }]);
    for (let i = 0; i < 5; i++) expect(denial(await hook(CALL))).toBe(null);
  });

  test('a file that disappears never denies (W75-10: the safe direction is allow)', async () => {
    const files: Record<string, string | null> = { '/h/drift/a.md': 'present' };
    const hook = buildMidFlightNoticeHook(watchedIo(files),
      [{ label: 'Upstream drift digest', path: '/h/drift/a.md' }]);
    await hook(CALL);
    files['/h/drift/a.md'] = null;
    expect(denial(await hook(CALL))).toBe(null);
  });

  test('answers.md rides the same hook (D75-5)', async () => {
    const files: Record<string, string | null> = { '/h/answers.md': 'old rulings' };
    const hook = buildMidFlightNoticeHook(watchedIo(files),
      [{ label: 'Campaign rulings (answers.md)', path: '/h/answers.md' }]);
    await hook(CALL);
    files['/h/answers.md'] = 'old rulings\n\n## new ruling\nMerge it yourself.\n';
    const denied = await hook(CALL);
    expect(denial(denied)).toBe('deny');
    expect(reason(denied)).toContain('## new ruling');
    expect(reason(denied)).toContain('Campaign rulings');
  });

  test('W75-7: two files changing before the same call produce ONE denial naming both', async () => {
    const files: Record<string, string | null> = { '/h/drift/a.md': null, '/h/answers.md': null };
    const hook = buildMidFlightNoticeHook(watchedIo(files), [
      { label: 'Upstream drift digest', path: '/h/drift/a.md' },
      { label: 'Campaign rulings (answers.md)', path: '/h/answers.md' },
    ]);
    await hook(CALL);
    files['/h/drift/a.md'] = 'drift text';
    files['/h/answers.md'] = 'ruling text';
    const denied = await hook(CALL);
    expect(denial(denied)).toBe('deny');
    expect(reason(denied)).toContain('drift text');
    expect(reason(denied)).toContain('ruling text');
    expect(denial(await hook(CALL))).toBe(null);
  });

  test('an empty watch list, a missing seam, and a throwing seam never deny and never throw', async () => {
    expect(denial(await buildMidFlightNoticeHook(watchedIo({}), [])(CALL))).toBe(null);
    expect(denial(await buildMidFlightNoticeHook({}, [{ label: 'x', path: '/h/x.md' }])(CALL))).toBe(null);
    const exploding = { readWatchedFile: async () => { throw new Error('EACCES'); } };
    expect(denial(await buildMidFlightNoticeHook(exploding, [{ label: 'x', path: '/h/x.md' }])(CALL))).toBe(null);
  });

  test('malformed hook input is not a crash', async () => {
    const hook = buildMidFlightNoticeHook(watchedIo({}), []);
    expect(denial(await hook(undefined))).toBe(null);
    expect(denial(await hook(null))).toBe(null);
    expect(denial(await hook({ tool_name: 42 }))).toBe(null);
  });
});

describe('runSession — the mid-flight notice hook is wired at PreToolUse index 3', () => {
  test('the wired hook denies after a watched file changes', async () => {
    let capturedOptions: PinnedSessionOptions | undefined;
    const files: Record<string, string | null> = { '/h/drift/a.md': null };
    const io = recordingIo();
    io.readWatchedFile = async (p: string) => files[p] ?? null;
    io.spawnSession = (params) => {
      capturedOptions = params.options;
      return messages([INIT_MESSAGE,
        { type: 'result', subtype: 'success', result: 'SHIPPED 42 abc1234', session_id: 'sess-123' }]);
    };
    await runSession({ brief: 'do the thing' }, {
      ...fixtureConfig(),
      noticeFiles: [{ label: 'Upstream drift digest', path: '/h/drift/a.md' }],
    }, io);

    const wired = (capturedOptions as PinnedSessionOptions).hooks.PreToolUse[3]?.hooks[0];
    expect(wired).toBeDefined();
    const call = wired as (i: unknown) => Promise<HookDecision>;
    expect(denial(await call(CALL))).toBe(null);
    files['/h/drift/a.md'] = 'drift landed';
    expect(denial(await call(CALL))).toBe('deny');
  });
});
```

Run `bun test core/session.test.ts`. Expected: fails on the three missing exports and on
`PreToolUse[3]` being undefined.

- [ ] **Step 2: Minimal implementation** — `ports/ports.ts`: `SessionIO` gains
  `readWatchedFile?(resolvedPath: string): Promise<string | null>` (optional, exactly like
  `execInRepo`, so no existing implementation of the seam breaks). `core/session.ts` gains
  `fingerprintOf` (pure, length-prefixed FNV-1a, `absent` for `null`), `MID_FLIGHT_NOTICE_HEADLINE`,
  `WatchedNoticeFile`, `buildMidFlightNoticeHook(io, watched)` and the `noticeFiles?` field on
  `RunSessionConfig`; `buildSessionOptions` appends the fourth `PreToolUse` entry
  `{ hooks: [buildMidFlightNoticeHook(io, config.noticeFiles ?? [])] }`. The denial reason is the
  headline, then one block per changed file (`--- <label> (<path>) ---` and its content verbatim),
  then the closing instruction: this was a one-time notice, reconcile now (fetch and regular merge
  the base branch into your branch, never rebase, re-run the gates), then re-issue the call, which
  will not be denied again. Every read is wrapped so a rejected seam call reads as `null`, and the
  hook body cannot throw.

- [ ] **Step 3: Gates** — from `plugins/tribe/scripts/runner`:

```sh
bun test core/session.test.ts && bun test && bunx tsc --noEmit
```

Expected: the nine new hook tests plus the wiring test pass; the three existing hook-wiring tests
(indices 0, 1, 2) pass unchanged; whole suite `0 fail`; `tsc` silent.

- [ ] **Step 4: Commit** — `feat(runner): deny-once PreToolUse notice hook for drift and rulings`
  with the campaign trailer and this task's boxes ticked, then `git push`.

---

## Task 10: Wire delivery into the runner (brief, hook, resume prompt)

**Files:** `core/loop/card-actions.ts` (modify) · `core/loop/card-actions.test.ts` (modify)

**Oracle.** Spec §2.2 channel 1, second sentence: "The resume prompt (which carries no brief)
carries one line pointing at the digest path when the file exists." Card G2 for the brief path.
Direction of error: **a resume prompt that names a digest that does not exist is a bug**; a
missing line merely falls back to the hook, which fires on the next content change.

**Fence by intent.** Wiring only. No new decision lives here: the brief section comes from
`brief.ts`, the notice paths from `paths.ts`, the prompt suffix from one new pure exported
function in this module (kept local because the three `CONTINUE_*` prompts it decorates are
already local exports here).

**Governing quote** — spec §2.2 channel 1, verbatim:
> 1. **At spawn/resume (brief).** `core/brief.ts` renders a `## Upstream drift` section from
>    `<home>/drift/<card>.md` when it exists; absent otherwise. The resume prompt (which carries
>    no brief) carries one line pointing at the digest path when the file exists.

**Adjudication rule — REFUTED in advance.**
- "the resume prompt should embed the whole digest" — no; spec §2.2 says "one line pointing at the
  digest path", and a resumed session can read the file itself.
- "`runCardSession` should re-read the digest per retry" — it reads once per session spawn, which
  is exactly when a brief or prompt is composed; mid-flight changes are the hook's job.
- "reading the digest through `io.readFile` duplicates the hook's read" — yes, and deliberately:
  they run at different times, in different processes' lifecycles, through different seams.

**Steps**

- [ ] **Step 1: Failing test** — append to `core/loop/card-actions.test.ts`:

```ts
import { driftNoticeFilesFor, withDriftNotice } from './card-actions.ts';

describe('withDriftNotice — spec 2.2 channel 1, the resume prompt line', () => {
  test('no digest leaves the prompt byte-identical', () => {
    expect(withDriftNotice(CONTINUE_BRANCH_PROMPT, null)).toBe(CONTINUE_BRANCH_PROMPT);
  });
  test('a digest appends exactly one line naming its path and the merge shape', () => {
    const decorated = withDriftNotice(CONTINUE_BRANCH_PROMPT, '/h/drift/a.md');
    expect(decorated.startsWith(CONTINUE_BRANCH_PROMPT)).toBe(true);
    expect(decorated).toContain('/h/drift/a.md');
    expect(decorated).toContain('never rebase');
  });
});

describe('driftNoticeFilesFor — D75-5: the watched allowlist is exactly two files', () => {
  test('the digest for THIS card and the campaign answers file, in that order', () => {
    expect(driftNoticeFilesFor('/h', 'C7').map((f) => f.path))
      .toEqual(['/h/drift/C7.md', '/h/answers.md']);
  });
});

describe('runCardSession — drift reaches a fresh session and a resumed one', () => {
  test('a fresh session brief carries the drift section when the digest exists', async () => {
    const ctx = fixtureCtx();
    ctx.io.fileExists = (p: string) => p.endsWith('/drift/C7.md');
    ctx.io.readFile = () => '# Upstream drift — card C7\n\nUpstream moved.\n';
    let seenBrief = '';
    ctx.io.spawnSession = (params) => { seenBrief = params.prompt; return shippedMessages(); };
    await runCardSession(ctx, { kind: 'fresh' });
    expect(seenBrief).toContain('## Upstream drift');
    expect(seenBrief).toContain('Upstream moved.');
  });

  test('a resumed session prompt names the digest path when it exists', async () => {
    const ctx = fixtureCtx();
    ctx.io.fileExists = (p: string) => p.endsWith('/drift/C7.md');
    ctx.io.readFile = () => '# Upstream drift — card C7\n';
    let seenPrompt = '';
    ctx.io.spawnSession = (params) => { seenPrompt = params.prompt; return shippedMessages(); };
    await runCardSession(ctx, { kind: 'resume', sessionId: 's1', reason: 'branch_no_pr' });
    expect(seenPrompt).toContain('drift/C7.md');
  });

  test('no digest means no drift text in either channel (G2, G5)', async () => {
    const ctx = fixtureCtx();
    ctx.io.fileExists = () => false;
    let seenBrief = '';
    ctx.io.spawnSession = (params) => { seenBrief = params.prompt; return shippedMessages(); };
    await runCardSession(ctx, { kind: 'fresh' });
    expect(seenBrief).not.toContain('Upstream drift');
  });
});
```

(`fixtureCtx` and `shippedMessages` are this file's existing helpers; extend them only if the
compiler requires it.) Run `bun test core/loop/card-actions.test.ts`. Expected: fails on the two
missing exports and on the brief lacking the drift section.

- [ ] **Step 2: Minimal implementation** — in `core/loop/card-actions.ts`: export
  `withDriftNotice(prompt, digestPath)` and `driftNoticeFilesFor(homeDir, cardId)`; add a small
  private `resolveDrift(ctx)` returning `{ path: string | null; content: string }` from
  `io.fileExists` plus `io.readFile`; `sessionConfigFor` gains
  `noticeFiles: driftNoticeFilesFor(resolved.homeDir, cardId)`; `buildSessionIOForCard` gains
  `readWatchedFile`; and `runCardSession` passes `withDriftNotice(prompt, drift.path)` on the
  resume path and `{ driftContent: drift.content, remote: resolved.remote, baseBranch:
  resolved.baseBranch }` as `executorBrief`'s options argument on both fresh paths.

- [ ] **Step 3: Gates** — from `plugins/tribe/scripts/runner`:

```sh
bun test core/loop && bun test && bunx tsc --noEmit
```

Expected: the six new wiring tests pass, every existing `card-actions` test passes unchanged,
whole suite `0 fail`, `tsc` silent.

- [ ] **Step 4: Commit** — `feat(runner): deliver drift to fresh and resumed sessions` with the
  campaign trailer and this task's boxes ticked, then `git push`.

---

## Task 11: The shell e2e — the real CLI, a real remote, both `--home` spellings

**Files:** `plugins/tribe/scripts/tests/test-watchdog-drift.sh` (new)

**Oracle.** Card G1 and G5 through the CLI the owner actually types, and
`fixtures-mirror-reality.md` obligation 1: "at least one test exercises each shape that reaches
different code" — `--home` is accepted relative and absolute, and only the absolute form is
exercised by `watchdog-drift-integration.test.ts`. Direction of error: **a probe that passes
without the drift duty having run is worthless**; assert on the artifacts, never on the exit code
alone.

**Fence by intent.** A new shell test modelled on `test-watchdog-e2e.sh`: its own `HOME`, its own
temp repo and bare remote, no network, no session spawn, no `gh`. It never touches the real
`~/.tribe` and never runs `timeout` or `setsid` (absent on this machine).

**Governing quote** — `plugins/tribe/rules/fixtures-mirror-reality.md`, verbatim:
> **Vary the input shape the caller controls.** Where an interface accepts a value spellable more
> than one way (relative vs. absolute path, trailing slash, symlink, name with a space), at least
> one test exercises each shape that reaches different code.

**Adjudication rule — REFUTED in advance.**
- "this duplicates the integration test" — no: that one drives `runDriftTick` with the adapter;
  this one drives `bun run.ts watchdog --once` through argument parsing, home containment,
  composition and the loop, which is where a wiring defect would hide.
- "the watchdog should be run with `--follow` here" — no; `--once` is the bounded shape, and this
  machine has no `timeout` binary to bound a `--follow` run with.

**Steps**

- [ ] **Step 1: Failing test** — create `plugins/tribe/scripts/tests/test-watchdog-drift.sh`,
  `chmod +x`, modelled line-for-line on `test-watchdog-e2e.sh`'s harness (its `ok`/`bad`/`check`/
  `contains` helpers, its `TMP="$(cd "$TMP" && pwd -P)"` realpath step, its throwaway `HOME`):

```sh
#!/usr/bin/env bash
# test-watchdog-drift.sh — G1/G5 for card i75 through the REAL CLI: a real bare remote, a real
# push, a real campaign home. No session spawn (the card's spec/plan do not exist), no gh, no
# network. fixtures-mirror-reality: --home is exercised BOTH ways a person can type it.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RUNNER="$HERE/../runner"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
TMP="$(cd "$TMP" && pwd -P)"
export HOME="$TMP/home"; mkdir -p "$HOME"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_SYSTEM=/dev/null
GIT="git -c user.email=t@t.test -c user.name=t"

git init -q --bare "$TMP/remote.git"
git init -q -b master "$TMP/repo"
(cd "$TMP/repo" && $GIT commit -q --allow-empty -m base && git remote add origin "$TMP/remote.git" \
  && git push -q -u origin master && $GIT checkout -q -b feat/d1 \
  && printf 'card\n' > shared.txt && git add shared.txt && $GIT commit -q -m "card work")
BASE="$(git -C "$TMP/repo" rev-parse master)"

CAMPAIGNS="$HOME/.tribe/key/campaigns"
mkdir -p "$CAMPAIGNS/drift"
: > "$CAMPAIGNS/drift/answers.md"
write_state() { # write_state <status>
  python3 - "$CAMPAIGNS/drift/campaign-state.json" "$1" "$BASE" <<'PY'
import json, sys
path, status, base = sys.argv[1], sys.argv[2], sys.argv[3]
json.dump({"v": 1, "campaign": "drift-e2e", "mergePolicy": "regular-merge-only",
           "sequence": ["D1"], "schemaLockPaths": [], "docsOnlyPaths": [],
           "ownerOnlyEscalations": [],
           "cards": {"D1": {"status": status, "spec": "docs/none.md", "plan": "docs/none.md",
                            "branch": "feat/d1", "baseSha": base, "pr": None, "mergeSha": None,
                            "sessionId": None, "updatedAt": None}}}, open(path, "w"))
PY
}

# --- Probe 1: G5 — a staged card, an unmoved upstream: no digest, no drift event -------------
write_state staged
set +e; bun "$RUNNER/run.ts" watchdog --repo "$TMP/repo" --model e2e --home \
  "$CAMPAIGNS/drift" --once --poll-seconds 1 >/dev/null 2>&1; set -e
if [[ -e "$CAMPAIGNS/drift/drift/D1.md" ]]; then bad "G5: no digest for a staged card"; \
  else ok "G5: no digest for a staged card"; fi

# --- Probe 2: G1 — a running card, upstream moved, ABSOLUTE --home ---------------------------
write_state running
git clone -q "$TMP/remote.git" "$TMP/other"
(cd "$TMP/other" && printf 'upstream\n' > shared.txt && printf 'x\n' > upstream-only.txt \
  && git add . && $GIT commit -q -m "upstream: land the other card" && git push -q origin master)
set +e; bun "$RUNNER/run.ts" watchdog --repo "$TMP/repo" --model e2e --home \
  "$CAMPAIGNS/drift" --once --poll-seconds 1 >/dev/null 2>&1; set -e
digest="$(cat "$CAMPAIGNS/drift/drift/D1.md" 2>/dev/null || printf '')"
contains "G1: the digest names the new commit" "$digest" "upstream: land the other card"
contains "G1: the digest names the overlap file" "$digest" "shared.txt"
contains "G1: the digest carries the reconcile instruction" "$digest" "never rebase"
actions="$(python3 - "$CAMPAIGNS/drift/watchdog/events.jsonl" <<'PY'
import json, sys
with open(sys.argv[1]) as fh:
    print(",".join(json.loads(l)["action"] for l in fh if l.strip()))
PY
)"
contains "G1: events.jsonl carries upstream_drift" "$actions" "upstream_drift"
drift_card="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["drift"]["card"])' \
  "$CAMPAIGNS/drift/watchdog/status.json")"
check "G1: status.json names the drifting card" "$drift_card" "D1"

# --- Probe 3: W75-3 + a RELATIVE --home (fixtures-mirror-reality) ----------------------------
before="$(cat "$CAMPAIGNS/drift/drift/D1.md")"
set +e; (cd "$CAMPAIGNS" && bun "$RUNNER/run.ts" watchdog --repo "$TMP/repo" --model e2e \
  --home drift --once --poll-seconds 1 >/dev/null 2>&1); set -e
check "relative --home produces the identical digest (no rewrite)" \
  "$(cat "$CAMPAIGNS/drift/drift/D1.md")" "$before"
count="$(grep -c upstream_drift "$CAMPAIGNS/drift/watchdog/events.jsonl" || printf '0')"
check "W75-3: one upstream_drift event across three ticks" "$count" "1"

# --- Probe 4: D75-1 — the worktree and its branch are untouched ------------------------------
check "the card branch HEAD did not move" "$(git -C "$TMP/repo" rev-parse HEAD)" \
  "$(git -C "$TMP/repo" rev-parse feat/d1)"
check "the worktree is clean" "$(git -C "$TMP/repo" status --porcelain)" ""

printf '\n%s passed, %s failed\n' "$PASS" "$FAIL"
[[ "$FAIL" -eq 0 ]]
```

Run `bash plugins/tribe/scripts/tests/test-watchdog-drift.sh`. Expected: every probe passes once
Tasks 1-6 are in; a red probe here is a wiring defect in the production code, not a test to relax.

- [ ] **Step 2: Minimal implementation** — none expected. If the CLI edge needs a fix (for
  example the drift directory not being created before the first write), fix it in
  `core/watchdog/**` with a unit test in the same commit.

- [ ] **Step 3: Gates** — from the worktree root:

```sh
bash plugins/tribe/scripts/tests/test-watchdog-drift.sh
bash plugins/tribe/scripts/tests/test-watchdog-e2e.sh
bash plugins/tribe/scripts/tests/test-fresh-machine.sh
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
```

Expected: the new script prints `0 failed`; both pre-existing shell suites keep their current
counts; whole runner suite `0 fail`; `tsc` silent.

- [ ] **Step 4: Commit** — `test(watchdog): CLI-level drift e2e against a real bare remote` with
  the campaign trailer and this task's boxes ticked, then `git push`.

---

## Task 12: Documentation and the fixlist row

**Files:** `plugins/tribe/scripts/runner/README.md` (modify) ·
`plugins/tribe/skills/orchestrate-campaign/SKILL.md` (modify) ·
`docs/tribe/fixlists/2026-08-08-outstanding-17/README.md` (modify) ·
`docs/tribe/fixlists/2026-08-08-outstanding-17/P7-mid-flight-rulings.md` (modify)

**Oracle.** Card G6, verbatim below, plus spec §2.4. Direction of error: **documentation that
describes a behaviour the code does not have is a Blocker**; every claim added here must be
greppable in the code that landed in Tasks 1-11.

**Fence by intent.** Documentation only. No code, no test, no behaviour change in this task.

**Governing quote** — card §Measurable goals G6, verbatim:
> **G6 Governed and documented.** Watchdog docs gain the drift section; runner README brief
> section documents the new brief section and hook; C3 change-unit + ADR via `/c3`;
> fixlist P7 row → "deferred design built by #75 for drift".

and spec §2.4, verbatim:
> orchestrate-campaign SKILL.md Stage B note ("drift digests live under `<home>/drift/`; the
> Shaman reads them when ruling").

**Adjudication rule — REFUTED in advance.**
- "the README needs a whole new top-level section for the hook" — the README has no PreToolUse
  section today; the hook is documented inside the Watchdog section's delivery subsection and in
  a short `## Mid-flight notices` section next to the escalation/answers workflow, which is where
  a reader looking for `answers.md` behaviour already is.
- "the P7 file should be rewritten" — no; its deferred design is now built, so its status line and
  its implementation guide gain a "built by #75" note. The historical record stays.

**Steps**

- [ ] **Step 1: Write the documentation** — four edits, each greppable against the code:

```sh
# The exact anchors to edit, verified on master @ cb35173:
grep -n "^### Files (all under" plugins/tribe/scripts/runner/README.md
grep -n "^### What it never does" plugins/tribe/scripts/runner/README.md
grep -n "^## Escalation / answers workflow" plugins/tribe/scripts/runner/README.md
grep -n "^| P7 " docs/tribe/fixlists/2026-08-08-outstanding-17/README.md
```

  1. Runner README, Watchdog section: a new `### Upstream drift (card i75, issue #75)`
     subsection after `### Files` — the tick's five steps, the `<home>/drift/<card>.md` artifact
     (written as backticked path text), the `upstream_drift` and `drift_check_failed` events, the
     `drift`/`driftWarn` fields in `status.json`, the read-only git verbs, and the known
     limitation that no drift check runs during a quota or overload wait. The
     `### What it never does` list gains one bullet: the drift duty fetches but never merges,
     rebases, checks out or resets anything.
  2. Runner README, a new `## Mid-flight notices (card i75)` section before
     `## Report contract`: the two watched files, the deny-once contract, the one-denial-per-
     content-change rule, and the fact that the brief carries the same digest at spawn.
  3. `orchestrate-campaign/SKILL.md`, Stage B: the spec §2.4 note, verbatim in substance —
     drift digests live under `<home>/drift/`, and the Shaman reads them when ruling.
  4. Fixlist: the P7 row in the README table gains "; deferred design built by #75 for drift
     (and rulings)" and the `P7-mid-flight-rulings.md` deferred-design paragraph gains a line
     recording that it is now built, naming `buildMidFlightNoticeHook` in `core/session.ts`.

- [ ] **Step 2: Prove every documented claim** — run each grep the documentation implies:

```sh
grep -n "upstream_drift\|drift_check_failed" plugins/tribe/scripts/runner/core/watchdog/drift-tick.ts
grep -n "driftWarn" plugins/tribe/scripts/runner/core/watchdog/status.ts
grep -n "buildMidFlightNoticeHook" plugins/tribe/scripts/runner/core/session.ts
grep -n "Upstream drift" plugins/tribe/scripts/runner/core/brief.ts
grep -rn "drift" plugins/tribe/skills/orchestrate-campaign/SKILL.md
```

Expected: every grep returns at least one line; a claim with no matching line is deleted or
corrected before the commit.

- [ ] **Step 3: Gates** — from the worktree root:

```sh
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
bash plugins/tribe/scripts/tests/test-fresh-machine.sh
```

Expected: whole suite `0 fail`, `tsc` silent, `test-fresh-machine.sh` at its baseline count (docs
changes must not move it).

- [ ] **Step 4: Commit** — `docs(tribe): upstream drift in the watchdog, brief and hook docs` with
  the campaign trailer and this task's boxes ticked, then `git push`.

---

## Task 13: Governance — change-unit, ADR, `c3-215` sync

**Files:** `.c3/**` (via the C3 wrapper only) · this plan's checkboxes

**Oracle.** Spec §2.4 and card G6. The repo's own rule: `.c3/c3-2-plugins/c3-215-tribe.md`
carries a `c3-seal:` (verified: line 3), so it is never hand-edited; every fact change goes
through the change-unit flow described in the skill's `references/change.md`. Direction of error:
**a hand-edited sealed document is a Blocker** and breaks `c3x check` for everyone afterwards.

**Fence by intent.** Governance artifacts only. This task changes no runner code and no test.

**Governing quote** — spec §2.4, verbatim:
> C3 change-unit naming c3-215; ADR "upstream drift detection in the heartbeat; P7 deferred
> design built"; fixlist P7 row → "deferred design built by #75 (drift)"; runner README (brief
> section, hook, drift files); watchdog docs (tick duty, flags); orchestrate-campaign SKILL.md
> Stage B note.

**Adjudication rule — REFUTED in advance.**
- "`c3x repair` is the quick fix for a broken seal" — only if a seal is ALREADY broken by someone
  else; this task must not break one in the first place.
- "the ADR should also re-open the i74 decisions" — no; this ADR records one decision: drift
  detection joins the heartbeat tick, and P7's deferred design is now built.
- "unrelated re-exports the tool adds should be kept" — no; revert anything the wrapper rewrites
  that this card did not cause, and say so in the worker report.

**Steps**

- [ ] **Step 1: Read the change procedure and take the baseline**:

```sh
C3="/Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/bin/c3x.sh"
sed -n '1,120p' /Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/references/change.md
C3X_MODE=agent bash "$C3" check </dev/null
```

Expected: the change procedure is read before any write; `check` prints `total: 52` and
`ok: true` (the baseline this task must restore).

- [ ] **Step 2: Record the change unit and the ADR through the wrapper** — an ADR titled
  "upstream drift detection in the heartbeat; P7 deferred design built" with `type: adr`,
  `status: accepted`, `date: "2026-09-05"` and a `goal` block naming: the watchdog tick's new
  drift duty, the per-card digest under `<home>/drift/`, the three delivery channels, and D75-1
  (detect only, never mutate). Then sync `c3-215-tribe.md` through the change unit so its
  `## Contract` watchdog row names the drift duty and its `## Change Safety` row names
  `bash plugins/tribe/scripts/tests/test-watchdog-drift.sh` as the guard command. Every
  invocation uses `C3X_MODE=agent bash "$C3" <operation>` with stdin from `/dev/null`; no file
  under `.c3/` is opened in an editor.

- [ ] **Step 3: Gates**:

```sh
C3X_MODE=agent bash "$C3" check </dev/null
git -C . status --porcelain .c3
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
```

Expected: `check` prints `ok: true` with zero errors; the `.c3` diff contains only the ADR, the
change unit and the `c3-215` sync (revert any unrelated re-export the tool rewrites); the runner
suite is `0 fail`.

- [ ] **Step 4: Commit** — `chore(c3): ADR and change-unit for upstream drift detection` with the
  campaign trailer and this task's boxes ticked, then `git push`.

---

## 5. Goal coverage — every G maps to at least one task

| Goal (card §Measurable goals) | Tasks that prove it | Proof artefact |
| --- | --- | --- |
| **G1** detection within one tick | 2 (ahead/overlap parse), 3 (digest), 5 (tick sequence, 11 unit rows), **7** (real bare remote, real push, real adapter), **11** (the real CLI, both `--home` spellings) | `drift/D1.md` naming the commit, its files and the overlap; `events.jsonl` line `upstream_drift{card, ahead, overlap}` |
| **G2** delivery at spawn/resume | **8** (renderer: section present with a digest, absent without), 10 (fresh brief and resume prompt wiring) | the byte-exact `EXPECTED_BRIEF` test plus the two `runCardSession` tests |
| **G3** deny-once mid-flight | **9** (nine hook rows: prime, deny once, next call passes, unchanged never denies, absent never denies, disappearance never denies, `answers.md` row per D75-5, two-files-one-denial, malformed input) | `core/session.test.ts` |
| **G4** pre-PR reconcile mandatory | **8** (template test asserts the section, its command text and its position before the Definition of Done) | rendered brief text in the test's own assertions |
| **G5** zero false alarms | 1 (selection), 5 (no running card → no git call, no event, no file), 6 (loop row), **7** (unmoved upstream → nothing), **11** (staged card probe) | `expect(result).toEqual({ events: [], drift: null, warn: null })` and the shell probe |
| **G6** governed and documented | **12** (runner README drift + notices sections, SKILL.md Stage B note, fixlist P7 row), **13** (ADR, change-unit, `c3-215` sync) | greps in Task 12 step 2; `c3x check` `ok: true` |

## 6. Verification-step coverage — spec §6, step by step

| Spec §6 step | Where it is satisfied |
| --- | --- |
| 1. Watchdog + runner test suites green (`bun test` in each dir the plan names) | Every task's gate block. The only directory is `plugins/tribe/scripts/runner`; the expected end state is the 645 baseline plus roughly 55 new tests, `0 fail` |
| 2. Replay G1: local bare remote, throwaway home, watchdog `--once`, push a commit, run a tick, read `drift/<card>.md` and `events.jsonl` | Task 11's script IS that replay, scripted end to end (`bash plugins/tribe/scripts/tests/test-watchdog-drift.sh`); Task 7 replays the same facts against the adapter inside `bun test` |
| 3. Render a brief for a card with a digest present (the plan names the command) and see the section | Task 8's test, plus this one-liner for the Shaman, run from `plugins/tribe/scripts/runner`: `bun -e 'import {executorBrief,BRIEF_TEMPLATE_PATH} from "./core/brief.ts"; import {readFileSync} from "node:fs"; console.log(executorBrief({id:"C7",spec:"s.md",plan:"p.md"},{campaign:"c",mergePolicy:"merge",ownerOnlyEscalations:[]},"(no rulings)",readFileSync(BRIEF_TEMPLATE_PATH,"utf8"),"/h/reports/C7.md","c",{driftContent:readFileSync(process.argv[1],"utf8")}))' <path-to-a-digest>` |
| 4. Hook tests include the `answers.md` row (D75-5) | Task 9, the row named "answers.md rides the same hook (D75-5)" |
| 5. Diff ⊆ fence; two skinner reports PASS; tracker + scout present; C3 change-unit + ADR; P7 row updated | §8 below (delivery), Task 12 (P7 row), Task 13 (C3) |

## 7. Spec amendments proposed

None changes What or Why; each is a How-level gap or a measured correction. The plan already
builds to them (W75 numbers), and they are listed for the Shaman to fold into the spec text.

1. **§2.1 step 4 — the digest must be timestamp-free (W75-2).** The spec asks for "rewrite only
   when content changes" and for hash-based delivery, which together forbid any time-varying byte
   inside the file. Worth stating, because the obvious first implementation puts a "detected at"
   line at the top and silently turns deny-once into deny-always.
2. **§2.1 step 5 — one `upstream_drift` event per content change, not per tick (W75-3).** The step
   reads as if the event were appended whenever `ahead` is non-empty; at a 30-second tick that is
   120 identical lines an hour. The event fires with the rewrite.
3. **§2.1 — the tip comes from the ahead range (W75-4)**, not a separate `rev-parse`: `git log`
   lists newest first, so the first record IS the new tip.
4. **§2.1 — the base branch and the remote are derived, not configured (W75-9).** The remote is
   read from the runner's existing `--remote` pass-through (default `origin`) and the base from
   `git symbolic-ref --short refs/remotes/<remote>/HEAD` with the runner's own `master` fallback.
   No new watchdog flag exists.
5. **§2.2 channel 2 — "as seen at spawn" is realized as "primed on the first tool call" (W75-6),**
   because the hook is constructed synchronously before the session exists. The brief rendered at
   the same instant already carried the digest, so the semantics the spec wants are preserved.
6. **§2.2 channel 2 — one denial may carry several changed files (W75-7).** Strictly within "one
   denial per content change per file", and less disruptive than two consecutive denials.
7. **§2.1 — no drift check runs during a quota or overload wait.** The tick's waits sleep inside
   the loop body, so drift is re-checked when the wait ends. Documented as a known limitation
   rather than fixed here: changing the wait loop is `i74` surface and outside this card's fence.
8. **§2.1 step 5 — `status.json.drift` is the MOST RECENT drift, singular**, exactly as the spec's
   literal shape says. Per-card detail lives in `events.jsonl` and in one digest file per card. If
   the Shaman wants every drifting card visible in `status.json` at once, that is a shape change
   and needs a ruling.
9. **Not a spec change, but a campaign-state coordination item the Shaman must land before the
   runner is triggered on this card.** `campaign-state.json` points
   `cards.i75-upstream-drift.plan` at `docs/superpowers/plans/2026-09-02-upstream-drift.md`, while
   this dispatch fixes the landing path at `docs/superpowers/plans/2026-09-05-upstream-drift.md`
   (the spec path already matches). Left as it is, the runner finds the plan missing on disk and
   escalates the card `planning_needed`. Fix by editing the state file's `plan` value to the
   2026-09-05 name (the Shaman owns that file; it is machine-local and never committed), or by
   landing this plan under the 2026-09-02 name instead. One or the other, before Stage B.

## 8. Delivery — the Warchief does NOT merge

Done-state for the delivering Warchief is **PR OPEN**, not merged (campaign `mergePolicy`:
"SHAMAN-ONLY-MERGE"). Concretely, before reporting:

1. **Merge `origin/master` into the branch BEFORE opening the PR.** This campaign saw four
   upstream drifts in three days (the `i74` branch alone carried three upstream integration
   merges, e.g. `fe0725b`). Run, from the worktree:

```sh
git fetch origin && git merge origin/master
cd plugins/tribe/scripts/runner && bun test && bunx tsc --noEmit
cd - && bash plugins/tribe/scripts/tests/test-watchdog-drift.sh
```

   Regular merge, never rebase, never squash. Re-run every gate after the merge; a gate result
   from before it is not evidence about what the PR actually contains.

2. **All gates run in the worktree and pasted verbatim into the PR body**, with numbers:
   - `cd plugins/tribe/scripts/runner && bun test` (expected: baseline 645 plus roughly 55 new,
     `0 fail`) and `bunx tsc --noEmit` (silent)
   - `bun test structure.test.ts` (the layout contract still holds with the drift modules inside it)
   - `bash plugins/tribe/scripts/tests/test-watchdog-drift.sh` (`0 failed`)
   - `bash plugins/tribe/scripts/tests/test-watchdog-e2e.sh` (`0 failed`, unmoved)
   - `bash plugins/tribe/scripts/tests/test-watchdog-detached.sh` (`0 failed`, unmoved)
   - `bash plugins/tribe/scripts/tests/test-fresh-machine.sh` (unmoved from its baseline count)
   - `C3X_MODE=agent bash …/c3x.sh check </dev/null` (`ok: true`, zero errors)
   - `bash plugins/tribe/scripts/validate-plan.sh --schema-lock-paths
     plugins/tribe/scripts/runner/core/state.ts,plugins/tribe/scripts/runner/core/types.ts
     docs/superpowers/plans/2026-09-05-upstream-drift.md` (verdict `pass`)
   - **There is no CI on this repo** (verified 2026-09-05: no `.github/workflows/`), so "CI green"
     is satisfied by these local gates, pasted with their output. Say so in the PR body rather
     than leaving a reader to wonder, and never claim a green check that does not exist.
     `gh run watch` and `timeout` are both unusable here — no runs, no binary.
3. **Before/after evidence in the PR body**, captured by the Warchief, not claimed by a Hunter,
   and committed under `docs/superpowers/evidence/2026-09-05-upstream-drift-g1.md` so every PR
   link resolves from the repo itself:
   - **BEFORE** — this campaign's own drift, quoted from git: `git log --oneline --merges
     cb35173 | head` showing the `i74` branch's three "merge: origin/master into i74" commits,
     plus the spec §1.1 evidence row (PR #109's three rules landing on master while #106 was in
     flight). The executor received no signal in any of those cases; the merges happened only
     because a human noticed.
   - **AFTER** — the Task 11 script's transcript (the digest file's contents, the
     `upstream_drift` event line, `status.json`'s `drift` object, and the D75-1 probe showing
     `HEAD` and the worktree untouched), plus the rendered-brief excerpt from §6 step 3 and the
     hook denial text from Task 9's test output.
4. **Audit recorded:** two independent skinners (contract lens and cold lens, dispatched
   concurrently in one message, the cold lens's diff path-scoped to exclude
   `docs/superpowers/{specs,plans}/**` and this card's own documents), the tracker's verdict, and
   scout on the open harness gaps — with the disposition ledger for every Critical or Important
   finding.
5. **Then report** `NEEDS_DIRECTION: merge-pr #<n> — <digest>` to the Shaman, where the digest
   names: goal-by-goal outcome (G1-G6), the gate numbers, the §7 amendments awaiting
   ratification (item 9 in particular, which the Shaman must act on in the campaign state file),
   and anything the audit recorded as DEBT.

**Scope-fence self-check before opening the PR** (`git diff --name-only master...HEAD` must be a
subset of):
`plugins/tribe/scripts/runner/{core/watchdog/drift.ts,core/watchdog/drift.test.ts,core/watchdog/drift-tick.ts,core/watchdog/drift-tick.test.ts,core/watchdog/model.ts,core/watchdog/status.ts,core/watchdog/status.test.ts,core/watchdog/watch-loop.ts,core/watchdog/watch-loop.test.ts,core/paths.ts,core/paths.test.ts,core/brief.ts,core/brief.test.ts,core/brief-template.md,core/session.ts,core/session.test.ts,core/loop/card-actions.ts,core/loop/card-actions.test.ts,ports/ports.ts,adapters/watchdog-io.adapter.ts,adapters/watchdog-io.adapter.test.ts,watchdog-drift-integration.test.ts,README.md}`,
`plugins/tribe/scripts/tests/test-watchdog-drift.sh`,
`plugins/tribe/skills/orchestrate-campaign/SKILL.md`,
`docs/tribe/fixlists/2026-08-08-outstanding-17/{README.md,P7-mid-flight-rulings.md}`,
`docs/superpowers/{specs,plans,evidence}/**`, `.c3/**`.
Note what is NOT there: `core/state.ts` and `core/types.ts`, this campaign's two schemaLockPaths,
and `plugins/tribe/scripts/viewer/**`. Anything else in that list is a fence breach — stop and
report, do not "just tidy it".

## 9. Size and wall-clock estimate

**13 Hunter tasks**, one wave, strictly sequential, one worktree.

| Tasks | What | Estimated Hunter wall-clock |
| --- | --- | --- |
| 1-3 | Pure drift core: paths, selection, argv, parsing, overlap, digest | 2 h |
| 4 | The read-only git seam and its real adapter | 45 min |
| 5 | The drift tick, eleven unit rows | 1 h 15 min |
| 6 | Loop and status wiring (plus the shared fake's new members) | 1 h |
| 7 | G1 integration against a real bare remote | 1 h 15 min |
| 8 | Brief section and pre-PR reconcile step | 50 min |
| 9 | The deny-once hook | 1 h 15 min |
| 10 | Runner delivery wiring | 50 min |
| 11 | The shell e2e through the real CLI | 1 h |
| 12 | Documentation and the fixlist row | 50 min |
| 13 | C3 ADR, change-unit, `c3-215` sync | 1 h |
| — | **Total Hunter time** | **≈ 12 h** |

Warchief overhead on top: setup and the empty-fixture pre-check (30 min), thirteen dual-skinner
audit rounds plus tracker and scout (roughly 3 h), the pre-PR upstream merge, evidence capture and
the PR body (1 h). **Expected end-to-end: two working days**, assuming no audit round exceeds its
fix cap and no account-limit stall.
