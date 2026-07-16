# Campaign Orchestration Implementation Plan (tribe plugin)

> **For the implementing session (this repo, todd-skills):** TDD per task (failing test →
> implement → gates → commit). Design decisions live in
> `docs/superpowers/specs/2026-07-16-campaign-orchestration-design.md` — do not re-open
> them; the runner's own frozen design
> (`docs/superpowers/specs/2026-07-16-campaign-runner-design.md`) stands except where §O4
> (D5′ park-and-continue) and §O5 (report contract) amend it. The tribe change is governed
> by this repo's C3 (`c3-215`) — record it as a change-unit, CLI-only.
> **Wall W5 applies to every task** (learning F4: mocked seams cannot validate
> invocations): any new or changed `gh`/`git` command string must be executed once against
> the real CLI before it is trusted — a green mocked suite is NOT that proof.

**Goal:** the owner says "orchestration: do these N ideas" in any chat session and touches
nothing again until ONE consolidated report lists every card as shipped (PR + sha,
independently D3-verified) or blocked (question + why it needs the owner). Closes F12.

**Commit convention (this repo's style):** `feat(tribe): campaign orchestration — <task
summary>`; no Co-Authored-By, no attribution footer.

## Global constraints (the walls, from spec §2)

- **W1 stateless:** no repo/path/model/campaign value hardcoded in the skill or runner —
  final gate greps the source clean.
- **W2 zero-LLM loop:** no SDK/model import may appear in `loop.ts`/`run.ts`/`report.ts`.
- **W3 judgment stays in sessions:** the runner writes escalation files; it NEVER writes to
  `answers.md`.
- **W4 no squash:** unchanged; `rule-no-squash-merge` governs every merge path.
- **W6 dependency safety:** a card never starts while a `dependsOn` target is parked.
- **W7 bounded auto-answer:** `autoAnswerRounds` ≤ 2 per card, enforced by the skill's
  protocol and recorded in state/report.
- Every world-touching call stays behind the existing injected `exec`/`spawnSession` seams.
- State schema stays `"v": 1` — Tasks 1–2 add only optional fields (the existing reader
  preserves unknown fields, so old states parse unchanged).

### Task 1: `state.ts` — `dependsOn`, `blocked`, `autoAnswerRounds` (schema additions)

- Optional per-card `dependsOn: string[]` (each id must exist in `cards` — extend the
  existing undefined-card validation), optional `autoAnswerRounds: number` (default 0).
- New card status `blocked` alongside `staged/running/shipped/escalated`.
- `nextCard` gains the **progressable** rule (spec §O4): skip a card whose `dependsOn`
  includes a card not `shipped`; if that dependency is `escalated`/`blocked`, mark the
  dependent `blocked` (W6). No `dependsOn` ⇒ independent, current behavior.
- Tests: dependency skip/block matrix, unknown-id rejection, v1 back-compat (a pre-existing
  state file with none of the new fields round-trips byte-identical). Commit (1/6).

### Task 2: `loop.ts` — D5′ park-and-continue

- On an escalation trigger: write the escalation file + mark `escalated` (unchanged), then
  **continue** to the next progressable card instead of exiting.
- Exit only when no progressable card remains; exit code 2 now means "pass finished, ≥1
  escalation pending". `EXIT_SESSION_INCOMPLETE` (3) also becomes park-and-continue: record
  the card, move on (the next run resumes it — same rationale).
- `--max-cards` counts attempted cards (shipped + escalated), unchanged semantics otherwise.
- Tests: escalate-then-continue ordering, all-cards-parked exit, blocked-cascade
  (A escalates → B dependsOn A becomes blocked → C independent still ships), STOP-file
  mid-pass still finishes the in-flight card only. Commit (2/6).

### Task 3: `report.ts` — the report contract (spec §O5)

- `writeReport(state, run, dir)` emits `campaign-report.json` + `campaign-report.md` (same
  content, machine/human twins) into the state file's directory on **every** exit path of
  `run.ts` — done, escalations pending, STOP, session-incomplete, and any error after the
  state was loadable. Wired as a single finally-style seam in `run.ts` so no exit path can
  forget it.
- Per-card `outcome`: `shipped | escalated | blocked | not_reached`, plus `pr`/`mergeSha`
  (shipped), `escalationFile` + one-line `question` digest + `autoAnswerRounds`
  (escalated), `blockedOn` (blocked). Top-level `pending[]` and `stats`.
- Tests: one report per exit-path in the matrix; JSON↔md content parity; report written
  even when the state commit failed. Commit (3/6).

### Task 4: `orchestrate-campaign` skill (spec §O1, §O3, §O6)

Files: `plugins/tribe/skills/orchestrate-campaign/SKILL.md` (installable — `skills/` is in
install.sh's whitelist). The skill is *instructions*, not code: it directs the invoking
session to:

1. Assume Shaman authority; run Stage A per the authorship policy (spec §O2) — author
   specs/plans itself for few/complex cards, dispatch planning-Warchiefs for ~10–20 trivial
   ones; record `planning.mode` in state; author `campaign-state.json` + `answers.md`
   scaffold (F12); land the docs PR.
2. Trigger: `--dry-run` first, then the real run **in the background**; on the exit
   notification read `campaign-report.json` (the exit code is a hint, the report is truth).
3. Round-trip per §O6: answer within-Shaman-authority escalations into `answers.md`,
   re-trigger with `--cards <answered> --include-escalated` (+ `not_reached` cards), honor
   W7's 2-round cap, park the rest.
4. Compose the ONE final owner report from the last `campaign-report.json`, after
   independently re-verifying each shipped card (`verify-shipped` — the no-cascade read).

The skill depends on the runner's **contract only** (README: flags, exit codes, report
file) — it never names `loop.ts`/`state.ts` internals. Gate: skill-creator conventions;
`./install.sh tribe` installs it with zero warnings. Commit (4/6).

### Task 5: docs — runner README (state schema + new semantics) + shaman/warchief awareness

- Runner README: document the state file **schema** (the F12 gap — `--state` was required
  but never specified), `dependsOn`/`blocked`, D5′ exit semantics, the report contract, and
  replace the "run this by hand" workflow with "normally triggered by the
  orchestrate-campaign skill; manual invocation remains for debugging".
- `agents/shaman.md`: Mode 2 gains the campaign-state authoring duty (F12 ruling) + the
  Stage A authorship policy + the Stage C answering protocol. `agents/warchief.md`: note
  the planning-Warchief dispatch shape (author spec+plan for one card, return them — no
  implementation). Both changes are additive to the role contracts, not re-writes.
- Gate: `grep -ril "campaign runner" plugins/tribe/agents/` is no longer empty (the F12
  detection, inverted). Commit (5/6).

### Task 6: C3 change-unit + final gates

- One change-unit against `c3-215`: Contract table — amend the runner surface row (D5′,
  report contract) and add the `orchestrate-campaign` skill surface (IN, trigger word
  "orchestration"); Business Flow — the unattended path now reads directive → Stage A →
  runner (park-and-continue) → round-trip → one owner report. `c3x check` green.
- Final gates: full `bun test` + `bunx tsc --noEmit` in the runner dir; W1 grep (source
  clean of any campaign/repo literal); W2 grep (no SDK import in loop/run/report); the W5
  ledger — list every new/changed `gh`/`git` invocation and the real-CLI proof for each.
  Commit (6/6) → PR → CI green → **regular merge** (2 parents).

## Acceptance (the frame's no-cascade reads)

1. **Objective read:** a live campaign of N ≥ 2 cards in a disposable target repo runs from
   one skill invocation to one final report with zero owner interventions; the report
   accounts for exactly N cards; every `shipped` card passes an independent `verify-shipped`
   replay. **This is also the designed closure of the runner's known UNVERIFIED surface**
   (`gh pr create/merge`, `git push`, `.runner.lock`, STOP under a real run) — it needs a
   disposable GitHub repo the owner authorizes; without that authorization, acceptance #1
   is BLOCKED and must be surfaced to the owner, never silently skipped (the campaign-runner
   effort's standing lesson).
2. **Park-and-continue read:** in the same live run, force one card to escalate
   (deliberately ambiguous card); the runner continues past it, the report lists it
   `escalated` with the question digest, and independent cards still ship.
3. **Round-trip read:** the orchestrator answers the forced escalation into `answers.md`
   and re-triggers; the card ships on round 2; `autoAnswerRounds == 1` in the final report.
4. **Wall reads:** W1/W2 greps clean; W3 — `answers.md`'s git history shows only
   session/owner commits, none from the runner's state-commit path; W4 — every merge in the
   run has 2 parents; W6 — the blocked-cascade case from Task 2's tests reproduced live.
