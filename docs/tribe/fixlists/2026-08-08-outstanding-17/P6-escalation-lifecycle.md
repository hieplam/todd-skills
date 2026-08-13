# P6 — escalation lifecycle: answered/shipped escalations stop haunting re-triggers

- **Status:** SHIPPED — PR #83, merge `2beb0a9` (2026-08-13).
- **Incident:** log lines 315–321. The escalation FILE's existence short-circuits the card
  to `escalation_pending` (`core/loop/phase.ts:145`) and nothing removes the file when a
  ruling lands — so every re-trigger of an ever-escalated card needs `--include-escalated`
  by hand; one forgotten flag parked B14 for a wasted cycle. The Shaman already invented
  the fix manually for A2: rename the file to `A2.md.resolved-R4`.

## Decision — two changes

1. **Runner:** `shipCard` archives a leftover escalation file when the card ships
   (rename to `<card>.md.resolved-shipped`) — a shipped card must never re-park.
2. **Skill:** the orchestrate-campaign answering flow archives the escalation file as
   `<card>.md.resolved-<ruling-id>` in the same step that appends the ruling to
   answers.md. After that, no `--include-escalated` is needed; the flag remains only as a
   manual override to re-run a card whose escalation is still UNanswered.

(Deliberately NOT chosen: runner comparing answers.md mtime vs escalation file — mtime is
not a reliable signal and the ruling→archive step is already co-located human work.)

## Implementation guide (fresh session, smaller model)

Run tests with: `cd plugins/tribe/scripts/runner && bun test`.

### Step 1 — port: add `renameFile`

- `ports/ports.ts`: add `renameFile(from: string, to: string): void` to `LoopIO`
  (follow the `writeFile` declaration style).
- `adapters/run-io.adapter.ts`: implement with `renameSync` from `node:fs` (follow the
  existing writeFile pattern). Update any test fakes implementing `LoopIO` (search
  `writeFile:` in `core/loop.test.ts` fakes; add a `renameFile` recording stub).

### Step 2 — runner: archive on ship

- `core/loop/card-actions.ts`, `shipCard` (lines 118–127): before returning, add:

  ```ts
  const escalationPath = escalationPathOf(resolved.homeDir, cardId);
  if (io.fileExists(escalationPath)) {
    io.renameFile(escalationPath, `${escalationPath}.resolved-shipped`);
  }
  ```

  (`escalationPathOf` is already imported at line 16; `fileExists` already exists on
  `LoopIO` — see `core/loop/phase.ts` usage.)
- Tests in `core/loop.test.ts`: card ships while an escalation file exists → file renamed
  to `.resolved-shipped`; card ships with no file → no rename call; a rename does NOT
  happen on `escalated`/`stopped` outcomes.
- Regression test for the B14 trap: state has card escalated + escalation file present;
  first run with `--include-escalated` ships it; a SECOND run WITHOUT the flag reaches
  `done` (no `escalation_pending` park), because the file was archived.

### Step 3 — skill: ruling step archives the file

- `plugins/tribe/skills/orchestrate-campaign/SKILL.md`: find the escalation-answering
  step (search "answers.md"). Amend it to a single atomic ritual:
  1. Append the ruling `R<n>` to answers.md.
  2. `mv <home>/escalations/<card>.md <home>/escalations/<card>.md.resolved-R<n>`
  3. Re-trigger the runner — `--include-escalated` is now needed ONLY when deliberately
     re-running a card whose escalation file is still present (unanswered).

  Keep it stated as concept + one illustrative command (prompts-carry-concept rule).

### Acceptance

The B14 scenario cannot recur: after a ruling is written via the skill flow (file
archived) or after a card ships (runner archives), a flag-less re-trigger proceeds
instead of parking.
