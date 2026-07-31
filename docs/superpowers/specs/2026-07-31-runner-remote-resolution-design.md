# Campaign runner: resolve the PR-target remote instead of hardcoding `origin` — design

Date: 2026-07-31
Status: approved (Shaman dispatch, follow-up to the kanna-session-import campaign)
Owner ruling: fix within `scripts/runner` only; no behavior change beyond parameterizing the
remote name (default stays `'origin'`, so every existing campaign is unaffected).

## 1. Problem

The campaign runner (`plugins/tribe/scripts/runner/`) assumes, in ten separate call sites
across five files, that the git remote named `origin` is both (a) the repo's canonical
upstream (the one whose default branch the runner should read) and (b) the repo the runner's
own PRs get opened against and merged into. Both assumptions can be false on a real machine:
a local checkout's `origin` remote can be repointed to a personal fork for unrelated reasons,
while the actual project work happens against a different, explicitly-named remote (verified
live during the kanna-session-import campaign: `origin` was `hieplam/kanna`, a personal fork
that never received any of the campaign's PRs, while every PR was opened against `cuongtranba/kanna`
via `gh pr create --repo cuongtranba/kanna` — `gh`'s own `--repo` flag decouples PR
creation from git remote resolution entirely, but this runner's own git-level bookkeeping does
not have an equivalent decoupling).

Symptom observed live: every one of 5 campaign cards' first D3 verify pass (`core/verify.ts`)
escalated with `mergeShaAncestorOfMaster: <sha> is NOT an ancestor of origin/master` even
though the card's PR had genuinely merged — because `git merge-base --is-ancestor <sha>
origin/master` checked ancestry against the wrong remote's wrong branch name (neither fork in
that campaign has a branch literally named `master`; both default to `main`). The runner's own
state-auto-commit (`core/github.ts`'s `commitStateAndMerge`) never once succeeded across 6 runs
for the same reason — it force-pushes its `campaign-state/<card>` branch to `origin`, which was
never the intended target.

## 2. Full inventory of the hardcode (grounded, file:line)

| # | File:line | What it does | Fix |
| - | --- | --- | --- |
| 1 | `core/loop/run-loop.ts:53` (`resolveBaseBranch`) | `git symbolic-ref --short refs/remotes/origin/HEAD` | parameterize the remote |
| 2 | `core/verify.ts:153` (`checkAncestor`) | `git merge-base --is-ancestor <sha> origin/master` | use resolved `remote`/`baseBranch` |
| 3 | `core/verify.ts:187` (`isDocsOnlyDiff`) | `git diff --name-only <baseSha>..origin/master` | same |
| 4 | `core/verify.ts:279` (`checkWorktreeAndBranchGone`) | `git ls-remote --heads origin <branch>` | same |
| 5 | `core/verify.ts:339` (`checkSchemaGuard`) | `git diff <baseSha>..origin/master -- <paths>` | same |
| 6 | `core/github.ts:73` (`REMOTE` const, 4 call sites: fetch/checkout/push/pull) | every git operation this module performs | thread as `GithubConfig.remote` |
| 7 | `core/loop/phase.ts:82` (D4 resume matrix) | `git ls-remote --heads origin <branch>` | same |
| 8 | `core/loop/card-actions.ts:212` (`performRevertAndRedo`) | `git ls-remote --heads origin <branch>` | same |
| 9 | `core/loop/card-actions.ts:216` (`performRevertAndRedo`) | `git push origin --delete <branch>` | same |
| 10 | `core/loop/card-actions.ts:282` (`recordBaseSha`) | `git rev-parse origin/${resolved.baseBranch}` | same |

All ten are the SAME class of bug: a literal `'origin'` (or a template string embedding it)
where the value should instead be a single resolved configuration input, exactly like
`baseBranch` already is (`resolveBaseBranch` derives it once; every downstream consumer reads
`config.baseBranch`, never re-derives or re-hardcodes it). The fix is to give `remote` the same
treatment: resolve it once, thread it everywhere.

**Not a hardcode, not in scope:** `core/verify.ts`'s `checkMerged` (`gh api
repos/{owner}/{repo}/pulls/<pr>`) and `core/github.ts`'s `gh pr create --base <branch> --head
<branch>` already resolve the target repo through `gh`'s own mechanism (`gh`'s literal
`{owner}/{repo}` placeholders, or the `cwd`'s `gh repo set-default`/git-remote-inferred
default) — that path was never broken; only the runner's own direct `git` invocations were.

## 3. Non-finding (reproduced and refuted — do NOT fix)

The dispatching brief's third item ("state re-serialization drops the `planning` metadata
field") does not reproduce. `core/state.ts`'s `CampaignStateSchema`/`CardSchema` use
`z.looseObject`, which genuinely preserves unknown top-level keys through `parse()` — verified
directly:

```
$ bun -e '
import { z } from "zod";
const s = z.looseObject({ a: z.string() });
console.log(JSON.stringify(s.parse({ a: "x", extra: { nested: 1 } })));
'
{"a":"x","extra":{"nested":1}}
```

and end-to-end through this runner's actual `loadState`/`serializeState`:

```
$ bun /tmp/state-repro.ts   # loadState(planning-carrying JSON) -> serializeState
planning after loadState: {"mode":"shaman"}
{ ... "cards": {...}, "planning": { "mode": "shaman" } }
```

`planning` survives — it is relocated to the END of the serialized object (JS object key
order: schema-declared keys first, unknown keys appended after, since `z.looseObject` doesn't
reorder), which is exactly what a hasty `head -60`-truncated `git diff` review during the live
campaign made look like data loss. Task 6 (below) adds a permanent regression test for this
non-finding instead of "fixing" a working code path — cheap insurance against a future zod/schema
change actually breaking it.

## 4. Fix shape

Add one new configuration value, `remote: string`, resolved exactly once and threaded
everywhere the ten call sites above currently hardcode `'origin'`:

- **CLI surface:** new optional `--remote` flag (default `'origin'` — every existing campaign's
  behavior is unchanged unless it opts in). Parsed in `cli/main.ts`'s `parseArgs`, stored on
  `RunLoopConfig.remote` (kernel type, `core/types.ts`).
- **`resolveBaseBranch(io, repoRoot, remote)`** (`run-loop.ts`) — takes `remote` as a parameter
  instead of the literal string; its one call site (`resolveRunContext`) passes
  `config.remote`.
- **`VerifyConfig`** (`core/verify.ts`) gains two fields: `remote: string` and `baseBranch:
  string` (the latter didn't exist on this narrow config type at all — `checkAncestor` needs
  it to build `` `${remote}/${baseBranch}` ``). Both call sites that construct a `VerifyConfig`
  (`core/loop/card-actions.ts`'s `actOnCard`) pass `resolved.remote`/`resolved.baseBranch`.
- **`GithubConfig`** (`core/github.ts`) gains `remote: string`, replacing the internal `REMOTE`
  constant at all 4 use sites. `githubConfigFor` (`commit-guard.ts`) passes `resolved.remote`.
- **`phase.ts`/`card-actions.ts`**'s three remaining raw `git` calls take the resolved remote
  from `resolved.remote` (already in scope at each call site — no new parameter threading
  needed beyond what `ResolvedConfig` already carries).

No change to any existing test's fixtures/mocks for the default case: every seam that gains a
`remote` parameter defaults its test fixtures to `'origin'`, so the full existing suite's
assertions (which never varied this value) stay green unmodified except where a test itself
constructs a `VerifyConfig`/`GithubConfig` object literal (those gain the new required field,
set to `'origin'` — a mechanical, behavior-preserving fixture update).

## 5. Walls (this fix must hold)

- **Zero-LLM purity** (`structure.test.ts`): unaffected — this fix touches zero adapter/IO
  wiring shape; every changed file stays in its existing layer (kernel/core/cli).
- **Stateless-capability wall (W1):** `--remote` is a new environment-specific input with a
  protocol-level default (`'origin'`), exactly the same shape as `--session-timeout`'s
  `3h` default — never a campaign value baked in.
- **No behavior change for existing campaigns:** default `'origin'` reproduces every current
  code path byte-for-byte; the fix is additive parameterization, not a logic change.
- **`bun run check`** (`tsc --noEmit` + `bun test`) stays green.

## 6. Evidence plan

- Unit tests per task (below) exercising the new `remote` parameter with a non-`'origin'` value
  against each of the 10 call sites, proving the literal string is gone and the parameter is
  actually threaded (a test using the DEFAULT value alone would not catch a reintroduced
  hardcode).
- `core/state.test.ts` regression test for the Section-3 non-finding.
- `bun run check` output (tsc clean, full suite green) pasted into the PR body.
- One PR merged to `todd-skills` master (this capability's own convention: `gh pr merge --merge`,
  the repo's `rule-no-squash-merge`/2-parent convention — confirm current wording via
  `c3 query` or by reading `CLAUDE.md`/`.c3/` before opening the PR, per this repo's own
  mandate).
