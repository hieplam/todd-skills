# P5 — escalation files say what actually unblocks them

- **Status:** SHIPPED — PR #84, merge `e367e9d` (2026-08-13).
- **Incident:** log lines 165–189. A schemaGuard escalation was "answered" with an
  answers.md ruling, but the guard mechanically reads the PLAN FILE's front-matter — only
  changing a file in the world clears it. The generic Options list
  (`core/loop/card-actions.ts:94-96`) presents the ruling path first for every reason, so
  one full re-trigger cycle was wasted discovering this.

## Decision

`buildEscalationMarkdown` renders reason-specific Options. Verify-failure reasons state
explicitly that a ruling alone CANNOT clear them and name the world-fix; only
`needs_direction` leads with the ruling path.

## Implementation guide (fresh session, smaller model)

File: `plugins/tribe/scripts/runner/core/loop/card-actions.ts`, function
`buildEscalationMarkdown` (lines 80–99). Tests: extend the suite that covers it (search
`buildEscalationMarkdown` in `core/loop.test.ts` / `core/report.test.ts`; if none, add
`core/loop/card-actions.test.ts`). Run: `cd plugins/tribe/scripts/runner && bun test`.

### Rendering rules (switch on the `reason` argument)

- `reason === 'needs_direction'` or `'planning_needed'` (answerable — a human judgment is
  the unblock):

  ```
  ## Options
  - Append a ruling to `<answersPath>` and re-run with `--include-escalated`.
  - If the question is owner-only (see the campaign's ownerOnlyEscalations), park it for
    the owner instead.
  ```

- `reason === 'verify_failed_twice'` (world-fixable — a ruling alone fixes nothing):

  ```
  ## How to unblock (a ruling alone CANNOT clear this)
  This is a mechanical verify failure: the runner re-checks the WORLD, not answers.md.
  Fix the failing condition, then re-run with `--include-escalated`:
  - schemaGuard: the plan file lacks `allowsSchemaChange: true` front-matter, or the
    card's baseSha is stale. Designed change → land a PR adding the front-matter to the
    plan. Stale base → correct `baseSha` in the campaign state (see P11).
  - checksGreen: master/CI is genuinely red — fix master first (own PR), then re-run.
  - worktreeAndBranchGone: delete the leftover remote branch / worktree by hand.
  ```

  Include only the bullet(s) whose point id actually appears in the `detail` string
  (the detail is built by `formatVerifyFailure`, lines 73-78, as `- <id>: ...` lines —
  parse the ids from it; a simple `detail.includes('schemaGuard')` per bullet is fine).

### Tests

- needs_direction → contains "Append a ruling", does NOT contain "CANNOT clear".
- verify_failed_twice with detail containing only `- schemaGuard:` → contains the
  schemaGuard bullet and "CANNOT clear", does NOT contain the checksGreen bullet.
- verify_failed_twice with two failing ids → both bullets present.

### Acceptance

Replaying A1's schemaGuard escalation produces a file whose first instruction is the
world-fix (plan front-matter PR), eliminating the wasted answers.md round-trip.
