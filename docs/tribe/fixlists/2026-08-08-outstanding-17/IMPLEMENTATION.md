# IMPLEMENTATION playbook — read this first, then implement

> **Audience:** the fresh session (post-rewind) told to "implement the fixlist". This file
> is the entry point; you need NO conversation history. Owner directive: run a dynamic
> loop, Tribe-style — pick the next item, drive it to a MERGED PR, then move to the next
> item, until all 12 are shipped. Only stop for a genuine design question the specs don't
> answer.

## Ground rules (owner-ratified)

- **One item = one PR = one merge.** Never batch two P's in a PR.
- **Serial, in this order:** P10 → P2 → P3 → P4 → P1 → P6 → P5 → P11 → P9 → P12 → P8 → P7.
  The order front-loads impact AND resolves the file collisions (P1+P2 both edit
  `core/session.ts`; P1+P3+P7 all edit `core/brief-template.md`; P4+P6 both edit
  `core/loop/card-actions.ts`) — since items run serially from a fresh master each time,
  collisions never materialize.
- **Owner's Definition of Done per item:** PR merged, local master fast-forwarded to
  origin, worktree removed — ready to start the next item on the LATEST CHANGES.
- **Specs are the contract.** Each `P<NN>-*.md` has an "Implementation guide" with file
  anchors, signatures, and enumerated tests. Line numbers may have drifted — when a
  sketch and the code disagree, follow the code and the spec's *intent*, and say so in
  the PR body. Do not widen scope beyond the spec.
- **No agent co-author lines in commits or PRs** (owner rule).
- **Dogfood the fixes as they land:** from P2 onward, never merge with a non-green check
  (pending ≠ green); from P3 onward, do the full cleanup before calling an item done —
  the campaign practices the rules it is shipping.

## The per-item loop

For each item, in order:

1. **Sync:** `git -C /Users/home/repos/todd-skills checkout master && git pull` — start
   from the latest merged state.
2. **Worktree:** create one, branch `fixlist/p<NN>-<slug>` (repo rule: all work in
   worktrees). E.g. `git worktree add .claude/worktrees/p10 -b fixlist/p10-env-key-guard`.
3. **Implement per the spec's Implementation guide.** Tribe division of labor:
   - **Code items** (P10, P2, P4, P1, P6, P5, P11, P9): dispatch a **Hunter** subagent
     with the spec's Implementation guide pasted verbatim as its brief plus the worktree
     path and this instruction: test-first (write the enumerated failing tests, watch
     them fail, implement, all green), stay strictly inside the guide, report back with
     verbatim test output. Review its diff yourself (Warchief role) before proceeding.
   - **Docs-only items** (P3, P12, P7, and P8's SKILL.md/agent edits): edit directly —
     dispatching an implementer for prose is overhead without benefit.
   - **P8's script** is small code: either path is fine.
4. **Verify (run the proof, never trust claims):**
   - Runner changes: `cd <worktree>/plugins/tribe/scripts/runner && bun install && bun test`
     — the FULL suite, not just new tests (fresh worktrees need `bun install` first —
     that's UC-1, the trap this very fixlist documents).
   - Script changes (P9, P8): run the script's own tests under
     `plugins/tribe/scripts/tests/` if present, plus a by-hand invocation shown in the
     PR body.
   - New scripts (P8): check root `install.sh` and `plugins/tribe/install.sh` — if
     scripts are enumerated individually, add the new one (repo rule).
5. **Audit before claiming done:** dispatch a **skinner** subagent to self-audit the
   branch against the spec (its requirement contract) — every finding either fixed or
   explicitly documented in the PR body. For docs-only items a tracker/self-review pass
   is enough.
6. **PR:** title `fix(tribe): P<NN> <short description>`; body carries: one-paragraph
   problem statement (from the spec's incident section), link to the spec file, verbatim
   test output, any anchor drift encountered. **The FIRST PR of this campaign also
   commits the whole `docs/tribe/fixlists/2026-08-08-outstanding-17/` directory** (specs
   + this playbook are currently untracked — they must land in git).
7. **Merge:** `gh pr checks <pr> --watch` in the foreground until ALL checks conclude
   green, then `gh pr merge --merge`. A red check = fix it or stop and report; never
   merge past it.
8. **Cleanup (DoD):** delete the remote branch, remove the worktree, fast-forward local
   master.
9. **Record:** flip this item's README status row to
   `SHIPPED — PR #<n>, <merge-sha>` and update README's "Current position" line. Commit
   that row-flip as part of the NEXT item's PR (never commit to master directly); the
   final item's row-flip goes in a small closing docs PR together with the campaign
   summary.
10. **Next item.** Announce progress to the owner in one line (`P10 shipped, PR #N —
    starting P2`) and continue without waiting for permission.

## Stop conditions (the only reasons to pause the loop)

- A genuine design question the spec + code cannot answer (product tradeoff, new
  permission, data shape) → stop, ask the owner, citing the spec section.
- A spec's premise turns out false in current code (e.g. the function it patches was
  removed) → stop for that item, record the finding in README, SKIP to the next item,
  and report both at the end.
- Repo-level breakage you did not cause (master red before you start) → report, do not
  work on top of a red master.

## Completion

After P7 (the last item): closing docs PR with the final README state + a short campaign
summary (per-item PR numbers, total test delta, anything skipped), then report to the
owner: scoreboard, deviations from spec, and the two recorded follow-ups (a `reset-card`
CLI — P11's out-of-scope note; `--max-concurrent` — P12's not-chosen option).
