# P2 — pre-merge check gate (mechanical, in the executor session)

- **Status:** SHIPPED — PR #79, merge `f11c83d` (2026-08-12).
- **Incident:** log lines 213–232. The A2 executor merged PR #188 while `format-check` was
  red on the PR head → master red for ~42 minutes — the campaign's only breach of a
  WRITTEN rule. The runner's `checksGreen` verify runs post-merge (`core/verify.ts`), so
  it detected the breach but could not prevent it.

## Decision

A second PreToolUse hook in executor sessions, same shape as the backgrounding hook
(`core/session.ts:71-88`): intercept every Bash command that is a `gh pr merge`
invocation, run `gh pr checks` first, and DENY unless every check has concluded
successfully. **Pending ≠ green. A red check is never mergeable without a ruling** (log
line 259) — when a check is red for reasons outside the card's diff (e.g. the
release-please `manifest.json` contamination behind PR #188's red), the executor escalates
`NEEDS_DIRECTION`; the escalation round replaces the red-master window, and that trade is
accepted.

## Spec

### Hook behavior

| Command | Hook action |
| --- | --- |
| Bash command containing `gh pr merge` with `--auto` or `--admin` | deny outright — `--auto` ends the session before DoD cleanup can run (P3), `--admin` bypasses the gate |
| `gh pr merge` (any other form) | run `gh pr checks [<pr-ref-from-command>] --json name,state` in the repo; deny unless ALL checks are `SUCCESS`/concluded-success |
| `gh pr checks` itself errors (no PR, network, auth) | deny (fail-closed) with "could not verify checks — run `gh pr checks` yourself, get full green, then retry the merge" |
| any other command | no opinion (empty decision) |

The deny message must steer, not just refuse (same principle as
`BACKGROUNDING_DENIED_REASON`): tell the executor to wait in the foreground with
`gh pr checks <pr> --watch` (timeout 600000), retry the merge when green, and escalate
`NEEDS_DIRECTION` if a check is red for causes outside this card's diff.

### Design (pure core, impure edges)

The existing hook is fully pure; this one needs one I/O call (running `gh pr checks`), so
it splits:

- **Pure (`core/merge-gate.ts`, fully unit-tested):**
  - `parseMergeCommand(command: string): { isMerge: boolean; prRef?: string; forbiddenFlag?: string }`
  - `judgeChecks(checksJson: string): { allGreen: boolean; notGreen: string[] }` —
    a parse failure or empty check list is NOT green (fail-closed).
  - `buildMergeGateDecision(...)` → the HookDecision object.
- **Edge:** `buildSessionOptions` (`core/session.ts:91`) gains an injected
  `execInRepo(argv): Promise<{stdout, exitCode}>` seam on `SessionIO` (real
  implementation in `adapters/run-io.adapter.ts`); the hook wrapper calls it only when
  `parseMergeCommand` says the call is a merge attempt.

### Brief addition (`core/brief-template.md`, Walls section)

> Merge gate: every PR check must have CONCLUDED green BEFORE `gh pr merge` — pending is
> not green. A merge attempt with checks not green is blocked at the permission layer; if
> a check is red for reasons outside this card's diff, escalate NEEDS_DIRECTION instead of
> merging.

### Known limitations (recorded, accepted)

- An executor could merge via `gh api` calls; the hook matches `gh pr merge` only. The
  brief clause + post-merge `checksGreen` verify remain the backstop.
- The post-merge SonarCloud-504 docs-only waiver (`verify.ts:234-248`, D6) is NOT
  replicated pre-merge — that flake now costs an escalation instead of a waived merge.
  Acceptable: strictness at the gate, judgment at the escalation.

### Tests / acceptance

- Unit: `parseMergeCommand` (plain merge / `--merge` / `--auto` / `--admin` / pr number vs
  URL vs bare / non-merge commands); `judgeChecks` (all success / one pending / one
  failing / malformed JSON / empty list → all deny except all-success).
- Acceptance: replay the A2 scenario — PR with one red check, executor attempts
  `gh pr merge --merge` → denied with the steering message; after checks green → allowed.

## Implementation guide (fresh session, smaller model)

Paths under `plugins/tribe/scripts/runner/`. Run: `cd plugins/tribe/scripts/runner && bun test`.

1. **Create `core/merge-gate.ts`** (pure, no imports beyond types):
   - `parseMergeCommand(command: string)` — treat the command as a merge attempt when it
     matches `/\bgh\s+pr\s+merge\b/`; extract an optional PR ref (first token after
     `merge` not starting with `-`); set `forbiddenFlag` when `--auto` or `--admin`
     appears as a standalone token.
   - `judgeChecks(stdout: string)` — parse JSON array of `{name, state}` (output of
     `gh pr checks --json name,state`); green iff array non-empty and every
     `state === 'SUCCESS'`. Parse failure / empty array → not green, `notGreen`
     explains why.
   - `MERGE_GATE_DENIED_*` reason constants (see table above for required content —
     steering text, `--watch` foreground instruction, NEEDS_DIRECTION path).
2. **Add the exec seam:** in `ports/ports.ts`, add
   `execInRepo?(argv: string[]): Promise<{ stdout: string; exitCode: number }>` to
   `SessionIO`. Implement in `core/loop/card-actions.ts` `buildSessionIOForCard`
   (line ~148): `execInRepo: (argv) => io.exec(argv, { cwd: resolved.repoRoot })`
   (`LoopIO.exec` already exists).
3. **Wire the hook:** `core/session.ts` — `buildSessionOptions` (line 91) currently takes
   `(input, config, abortController)`; `runSession` (line 194) has the `io: SessionIO` in
   scope — pass `io` into `buildSessionOptions` and register a second PreToolUse hook
   function: on Bash tool calls, run `parseMergeCommand`; if merge attempt →
   `forbiddenFlag` ⇒ deny; else `await io.execInRepo(['gh','pr','checks', ...(prRef ? [prRef] : []), '--json','name,state'])`,
   deny unless exit 0 AND `judgeChecks` green. Non-Bash or non-merge → `{}`.
4. **Brief clause:** add the Walls text quoted above to `core/brief-template.md`.
5. **Tests:** new `core/merge-gate.test.ts` (pure cases from the list above);
   `core/session.test.ts` — hook denies a red-check merge via a fake `execInRepo`, allows
   an all-SUCCESS one, ignores non-merge Bash; existing tests must stay green (the fake
   SessionIO in tests gains the optional `execInRepo`).
