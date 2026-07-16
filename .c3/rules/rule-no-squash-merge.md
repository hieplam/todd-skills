---
id: rule-no-squash-merge
c3-seal: 7a91a923c09bc2636bdfeeab426d6bb81c9ad25b518c8f6b17cf3f3bebc22a40
title: no-squash-merge
type: rule
goal: |-
    Every capability in this repo that merges a pull request, or that verifies one was merged,
    agrees on a single merge shape: a regular 2-parent merge commit. The recurring need: the owner's
    merge rule is stated once in their global CLAUDE.md ("Do not Squash merge"), but it is
    *implemented* independently by the tribe agents, the campaign runner, and the verify-shipped
    skill — three places that drifted apart, shipping two mutually exclusive Definitions of Done at
    the same time.
---

## Goal

Every capability in this repo that merges a pull request, or that verifies one was merged,
agrees on a single merge shape: a regular 2-parent merge commit. The recurring need: the owner's
merge rule is stated once in their global CLAUDE.md ("Do not Squash merge"), but it is
*implemented* independently by the tribe agents, the campaign runner, and the verify-shipped
skill — three places that drifted apart, shipping two mutually exclusive Definitions of Done at
the same time.

## Rule

A merged PR's merge commit has exactly 2 parents; no capability merges with `--squash` or
`--rebase`, and no capability accepts a 1-parent merge as done.

## Golden Example

Literal, from `plugins/tribe/scripts/runner/verify.ts` (the campaign runner's D3 point 2 — the
canonical implementation of this rule):

```ts
  const result = await run(io, config.repoRoot, ['git', 'rev-list', '--parents', '-n', '1', mergeSha]);  // REQUIRED — ask git, never infer from the PR title
  if (result.exitCode !== 0) {
    return {
      id: 'mergeCommitTwoParents',
      passed: false,
      detail: `git rev-list --parents -n 1 ${mergeSha} failed: ${result.stderr || result.stdout}`,   // OPTIONAL — wording
    };
  }

  const tokens = result.stdout.trim().split(/\s+/).filter(Boolean);
  const parentCount = Math.max(0, tokens.length - 1);   // REQUIRED — output is "<sha> <p1> <p2>", so parents = tokens - 1
  return {
    id: 'mergeCommitTwoParents',
    passed: parentCount === 2,   // REQUIRED — exactly 2. A squash yields 1; a rebase yields 1.
```

Verified against reality: `git rev-list --parents -n 1 48d691e` returns 3 tokens (the commit plus
2 parents) for a real regular merge in this repo.

The merge side of the same rule, from `plugins/tribe/scripts/runner/github.ts`:

```ts
      ['gh', 'pr', 'merge', String(pr), '--merge', '--delete-branch'],   // REQUIRED — `--merge`, never `--squash`/`--rebase`
```

## Not This

| Anti-Pattern | Correct | Why Wrong Here |
| --- | --- | --- |
| gh pr merge --squash | gh pr merge --merge | Produces a 1-parent commit. Violates the owner's standing rule, and the runner's D3 point 2 then fails the card, escalates it, and the campaign wedges — every card, forever. |
| Asserting a squash is done: if [[ "$PARENT_COUNT" != "1" ]]; then FAIL | Assert exactly 2 parents | This was verify-shipped.sh's real check. It encoded a superseded version of the owner's rule and failed the owner's own correctly-merged PR #37 (2 parents). Two capabilities enforcing opposite shapes can never both pass. |
| Inferring the merge shape from the commit title (e.g. a (#123) suffix) | Count parents with git rev-list --parents | The title suffix is a GitHub squash convention, not a guarantee; a regular merge has no such convention. Ask git for the parent count — it cannot be faked by a title. |
| Agent prose that says "squash-merge into the default branch once green" | Prose that says regular merge, never squash | Agent definitions are executable instructions. warchief.md:1125 said exactly this, so a compliant Warchief would squash every card while the docs claimed otherwise. |

## Scope

Applies to every capability that merges a PR or verifies one merged: the tribe agents
(`plugins/tribe/agents/*.md`), the campaign runner (`plugins/tribe/scripts/runner/`), and the
verify-shipped skill (`plugins/verify-shipped/`). Applies to merges into a default branch in any
repo these capabilities act on — the rule travels with the capability, not with this repo.

Does not govern how a *human* merges by hand (the owner's global CLAUDE.md already binds that),
and says nothing about branch naming, commit message shape, or rebasing a feature branch onto
its base *before* opening a PR — only the merge commit that lands it.

## Override

There is no in-repo override: the owner's rule is marked non-negotiable, and the runner's check
is mechanical, so a deviation cannot be argued past it — it fails the card. Changing the merge
shape requires the owner to change their global rule first, then a change-unit updating this rule
plus **every** implementation listed in Scope in the same unit. Changing one implementation alone
is what produced the drift this rule exists to prevent.
