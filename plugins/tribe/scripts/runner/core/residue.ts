// P4 fix-list item: the pure decision of which SHIPPED-verification residue is safe to
// self-heal between the first failed verify and the retry (see
// `docs/tribe/fixlists/2026-08-08-outstanding-17/P4-self-heal-safe-residue.md`).
//
// Pure core, impure edges: this module takes every fact it needs as a plain argument and
// performs zero I/O. The edge (`healSafeResidue` in `core/loop/card-actions.ts`) gathers
// those facts via `git`/`gh` through the injected `io.exec` seam and executes the actions
// this module decides are safe.

/** The two residue-cleanup recipes proven safe by `performRevertAndRedo` — reused here,
 * never duplicated: `git push <remote> --delete <branch>` for a leftover remote branch on
 * an already-merged PR, `git worktree remove <path>` + `git branch -D <branch>` for a
 * leftover worktree/branch that carries no uncommitted or unmerged work. */
export type HealAction =
  | { kind: 'delete_remote_branch'; branch: string }
  | { kind: 'remove_worktree'; path: string; branch: string };

export interface DecideResidueHealInput {
  /** Whether the first failed verify's `merged` point PASSED — healing is only ever
   * attempted on an already-merged PR (spec: "remote branch residue: safe because the PR
   * is proven merged"). */
  mergedPassed: boolean;
  /** The failing `worktreeAndBranchGone` point's detail string, e.g.
   * `"<branch>: remote branch still present"`, `"<branch>: worktree still present"`, or
   * both joined with `" and "` (see `verify.ts`'s `checkWorktreeAndBranchGone`). */
  detail: string;
  /** The worktree's filesystem path, if `findWorktreePathForBranch` found one — `null` when
   * no worktree is checked out for `branch` (nothing to remove). */
  worktreePath: string | null;
  /** `true` iff `git status --porcelain` was EMPTY in that worktree — no uncommitted work
   * to lose by removing it. */
  worktreeStatusClean: boolean;
  /** `true` iff the branch tip is an ancestor of `<remote>/<baseBranch>`
   * (`git merge-base --is-ancestor` exit 0) — nothing unmerged would be discarded. */
  tipIsAncestorOfBase: boolean;
  branch: string;
}

/** Returns the list of residue-cleanup actions provably safe to perform, in the order they
 * should be executed (remote branch before worktree — matches `performRevertAndRedo`'s own
 * order, though the two are independent). Returns `[]` unless `mergedPassed` — anything
 * else (unmerged PR, dirty worktree, non-ancestor tip) is unprovable, and the existing
 * escalation flow runs unchanged. */
export function decideResidueHeal(input: DecideResidueHealInput): HealAction[] {
  if (!input.mergedPassed) return [];

  const actions: HealAction[] = [];

  if (input.detail.includes('remote branch still present')) {
    actions.push({ kind: 'delete_remote_branch', branch: input.branch });
  }

  if (
    input.detail.includes('worktree still present') &&
    input.worktreePath &&
    input.worktreeStatusClean &&
    input.tipIsAncestorOfBase
  ) {
    actions.push({ kind: 'remove_worktree', path: input.worktreePath, branch: input.branch });
  }

  return actions;
}
