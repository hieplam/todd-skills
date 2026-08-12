# P4 — verify self-heals safe residue instead of escalating

- **Status:** RATIFIED 2026-08-12 (delegated).
- **Incident:** same B6 event as P3 (log lines 113–126). The only residue was the remote
  branch of an **already-merged** PR — unconditionally safe to delete — yet the runner
  escalated (`verify_failed_twice — worktreeAndBranchGone`) and a human ran the deletion.

## Decision

Between the first failed verify and the retry (`verifyWithRetry`,
`core/loop/card-actions.ts:53-61`), the runner heals residue it can PROVE safe, then
re-verifies. Escalation remains the path for anything unprovable.

## Spec

### Safety rules (pure decision)

Given the first verify's points, healing is attempted only when `merged` PASSED and
`worktreeAndBranchGone` is the failing point:

| Residue | Provably safe when | Heal action |
| --- | --- | --- |
| remote branch still present | PR is merged (already proven by the `merged` point) | `git push <remote> --delete <branch>` |
| worktree still present | worktree has NO uncommitted changes (`git status --porcelain` empty in it) AND its branch tip is an ancestor of `<remote>/<baseBranch>` (`git merge-base --is-ancestor`) | `git worktree remove <path>` then `git branch -D <branch>` |

Anything else (unmerged PR, dirty worktree, unpushed commits) → no heal, existing
escalation flow unchanged. Note: `performRevertAndRedo` (card-actions.ts:174-197) already
contains the exec recipes — reuse, don't duplicate.

### Design (pure core, impure edges)

- **Pure (`core/residue.ts`):** `decideResidueHeal(points, worktreeStatus, isAncestor):
  HealAction[]` — fully unit-tested; returns an empty list unless every safety condition
  holds.
- **Edge:** a `healResidue(ctx, actions)` step in `card-actions.ts` between first verify
  and retry, all I/O through the existing `io.exec` seam. Every heal performed is recorded
  in the verify detail string (so the report shows "healed: deleted remote branch" instead
  of silently passing).

### Tests / acceptance

- Unit: heal only on merged+branch-residue; dirty worktree → no heal; non-ancestor tip →
  no heal; unmerged PR → no heal.
- Acceptance: replay B6 — merged PR, remote branch left behind → runner deletes the
  branch, verify passes on retry, NO escalation, report notes the heal.

## Implementation guide (fresh session, smaller model)

Paths under `plugins/tribe/scripts/runner/`. Run: `cd plugins/tribe/scripts/runner && bun test`.

1. **Create `core/residue.ts`** (pure):

   ```ts
   export type HealAction =
     | { kind: 'delete_remote_branch'; branch: string }
     | { kind: 'remove_worktree'; path: string; branch: string };
   export function decideResidueHeal(input: {
     mergedPassed: boolean;
     detail: string;             // the failing worktreeAndBranchGone point's detail
     worktreePath: string | null;
     worktreeStatusClean: boolean;
     tipIsAncestorOfBase: boolean;
     branch: string;
   }): HealAction[]
   ```

   Returns `[]` unless `mergedPassed`. `detail.includes('remote branch still present')` →
   push delete_remote_branch. `detail.includes('worktree still present')` AND
   `worktreePath` AND `worktreeStatusClean` AND `tipIsAncestorOfBase` → push
   remove_worktree. Unit-test every combination.
2. **Wire into `core/loop/card-actions.ts` `verifyWithRetry`** (lines 53-61): the function
   needs more context than `VerifyIO` — change its callers instead. In `actOnCard`'s two
   verify blocks (lines ~320 and ~344), between first failure and retry: find the failing
   `worktreeAndBranchGone` point + a passing `merged` point; gather inputs
   (`findWorktreePathForBranch` from `phase.ts:14` over
   `git worktree list --porcelain`; `git status --porcelain` with `cwd` = the worktree
   path; `git merge-base --is-ancestor <branch> <remote>/<baseBranch>` exit 0 ⇒ ancestor);
   call `decideResidueHeal`; execute actions via `io.exec` (recipes exist in
   `performRevertAndRedo`, lines 174-197: `git push <remote> --delete <branch>`,
   `git worktree remove` — WITHOUT `--force` here); then run the retry verify. Append
   `healed: <action kinds>` to the retry result's detail so the report shows it.
   Extract this into a helper `healSafeResidue(ctx, firstResult): Promise<void>` to avoid
   duplicating it at both call sites.
3. **Tests** in `core/loop.test.ts`: fake io where first verify fails only on remote
   branch + merged passed → heal exec called, card ships, no escalation; dirty-worktree
   case → no heal exec, escalates as today.
