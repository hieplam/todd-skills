# Task 5 report — docs: runner README schema + shaman/warchief awareness

Hunter: hunter-orch-5. Card: campaign-orchestration. Task 5/6.

## Scope discipline

Touched exactly the three files the brief named:
- `plugins/tribe/scripts/runner/README.md`
- `plugins/tribe/agents/shaman.md`
- `plugins/tribe/agents/warchief.md`

Did **not** touch `plugins/tribe/skills/orchestrate-campaign/` (Task 4's lane, in flight in
parallel as `hunter-orch-4`; it had already committed `477408f` by the time I checked, no
collision occurred). Did not touch `state.ts`/`loop.ts`/`report.ts`/`types.ts`/`run.ts` — this
task is docs-only; I read them extensively to ground every claim in code, but wrote nothing to
them.

## What changed, file by file

### `plugins/tribe/scripts/runner/README.md` (rewritten, +333/-39 lines)

1. **W-F1 fix (the assigned Warchief finding) — see its own section below.**
2. **New "State file schema" section** (closes the F12 gap: `--state` was documented as required
   but its shape was never specified anywhere). Derived directly from `state.ts`'s
   `CampaignStateSchema`/`CardSchema` (zod) and `types.ts`'s `Card`/`CampaignState` interfaces —
   not summarized from memory. Contains:
   - A top-level fields table (`v`, `campaign`, `mergePolicy`, `sequence`, `schemaLockPaths`,
     `docsOnlyPaths`, `ownerOnlyEscalations`, `cards`), each marked required/optional and
     null-vs-not.
   - Explicit call-out that `docsOnlyPaths`/`schemaLockPaths`/`ownerOnlyEscalations` are campaign
     config carried IN the state file (never hardcoded, W1) and that **`docsOnlyPaths` fails
     CLOSED** (empty list ⇒ nothing counts as docs-only ⇒ a code diff never auto-waives a red
     check) — verbatim from the Warchief's brief and cross-checked against `types.ts:44-46`'s
     own doc comment.
   - A per-card fields table (`status`, `spec`, `plan`, `branch`, `baseSha`, `pr`, `mergeSha`,
     `sessionId`, `updatedAt`, plus Task 1's optional `dependsOn`/`autoAnswerRounds`), including
     why the two optional fields carry **no schema-injected default** (byte-identical v1
     round-trip — `state.ts:98-103`).
   - A realistic worked example (3-card campaign, one dependency edge) authorable from the
     README alone.
   - A validation-errors table: `UnsupportedStateVersionError`, `UndefinedSequenceCardError`,
     `UndefinedDependencyCardError`, `CircularDependencyError` — all four thrown by
     `parseState`/`loadState` (`state.ts:180-192`), in that order, at load time.
3. **"How this is normally triggered" replaces the old "How to run" framing** (plan's literal
   instruction): leads with "normally triggered by the `orchestrate-campaign` skill; manual
   invocation remains for debugging", keeps the two CLI examples (dry-run, scoped real run) under
   that debugging framing rather than as the primary workflow.
4. **New "`dependsOn` / `blocked`" section** (spec §O4): progressable rule, `blocked` semantics,
   and the "derived, never trusted from disk, reconciled every call" invariant — grounded in
   `state.ts`'s `computeBlockedCardIds`/`reconcileBlockedStatuses`/`nextCard` doc comments
   (`state.ts:221-336`).
5. **"Escalation / answers workflow" section rewritten to fold in D5′ park-and-continue** (spec
   §O4): step 4 now says the loop continues instead of exiting; exit-code semantics corrected
   (see Exit codes below); the `attempted`-set dedup note explaining why `--include-escalated`
   (Stage C's own re-trigger shape) terminates rather than looping forever (W-F2, closed in
   `35a91e8`).
6. **New "Report contract" section** (spec §O5): full JSON shape with a 3-card worked example
   matching the schema example above, the `run.reason` vocabulary, per-card outcome shape
   (`shipped`/`escalated`/`blocked`/`not_reached`, including the `not_reached`-folds-`running`
   design note from `report.ts:213-220`), the `pending`/`blockedOn` semantics, and the complete
   "which exit paths write a report" table (argument error / `--dry-run` / `EXIT_LOCKED` never
   write; every other path does) — grounded in `report.ts:75-101` and `run.ts:250-308`.
7. **Exit codes table extended**: `EXIT_ESCALATED`/`EXIT_SESSION_INCOMPLETE` rows corrected for
   D5′ semantics (see below); added the previously-undocumented `4` / `EXIT_ERROR` code (defined
   in `run.ts:35`, not a `loop.ts` constant — the prior README had NO row for it at all, even
   though it is exactly the code that produces the report's `reason: 'error'`).
8. **"Known limitations" extended, not weakened**: the mutating-`gh`/`git`-path, `.runner.lock`
   contention, and STOP-under-a-real-session items remain, verbatim in substance, still marked
   UNVERIFIED (I sharpened the STOP wording only to distinguish "startup STOP-check, now verified
   live" from "STOP appearing while a session is genuinely in flight, still unverified" — see
   below). Added one new bullet for what this effort additionally verified live, per Warchief
   ruling 3, and corrected the stale "All 116 tests" count to the current 172 (that count is
   itself a claim that had drifted true-to-false as this effort's own tasks landed — see "Other
   drift found" below).

### `plugins/tribe/agents/warchief.md` (+15 lines)

Added one new subsection, **"Planning-only dispatch (campaign orchestration Stage A)"**, inserted
at the end of the existing "The Shaman ⇄ Warchief contract" section (before "## Channels"). It
documents the dispatch-shape variant design §O2 introduces: a Shaman-authority orchestrator
session may dispatch a Warchief to author spec+plan for one card ONLY and return them — no
isolation, no Hunter orchestration, no audit, no PR, no merge (Method steps 4–8 skipped). Purely
additive: no existing text in the file was reworded or removed.

### `plugins/tribe/agents/shaman.md` (+49 lines)

Added one new Mode-2 subsection, **"Optional: campaign orchestration (runner-driven execution,
closes F12)"**, inserted immediately after the existing "Optional: unattended campaign mode
(opt-in, pilot-gated)" subsection (both are optional Mode-2 variants; keeping them adjacent
avoids implying they're alternatives to each other's mechanics — they are not: the existing
section automates the chat-level Shaman→Warchief loop via `/schedule`/`/loop`, this new one
documents the campaign runner's own CLI loop). Covers, per the brief's three named duties:
- **Campaign-state authoring duty (F12 ruling):** the Shaman-authority session authors
  `campaign-state.json` itself; points to the runner README's new schema section as the contract
  to author from.
- **Stage A authorship policy** (design §O2's table, reproduced verbatim: few/complex → author
  itself; many trivial → one planning-Warchief per card, cross-referenced to warchief.md's new
  note).
- **Stage C answering protocol** (design §O6): within-authority rulings into `answers.md` +
  re-trigger scoped to answered/not_reached cards, capped at 2 rounds (W7), owner-only/too-hard
  left parked, final owner report composed once nothing is progressable/answerable.
Purely additive: no existing text in the file was reworded or removed.

## The W-F1 fix (the assigned Warchief finding)

**Old row** (`plugins/tribe/scripts/runner/README.md:80`, pre-fix):

> `| PR found for the branch, `state == "OPEN"`, no `sessionId` recorded | `fresh` | Nothing to
> resume — spawn fresh (same as "no trace"). |`

**New row** (current README, "Resume semantics" table):

> `| PR found for the branch, `state == "OPEN"`, no `sessionId` recorded | `fresh` (carries a
> digest) | **F8 fix, verified against `loop.ts:170-184`:** spawn fresh, but carrying a state
> digest that names the open PR and instructs the session to inspect and continue it rather than
> open a second one. This is explicitly **NOT** "same as no trace" — the in-code comment at
> `loop.ts:170-174` rebuts that reading directly. |`

**Proof, verified myself against the code (not taken from the Warchief's summary), `loop.ts`,
`deriveCardPhase`:**

```
166  if (pr.kind === 'found' && pr.state === 'OPEN') {
167    if (card.sessionId) {
168      return { kind: 'resume', sessionId: card.sessionId, reason: 'pr_open', pr: pr.number };
169    }
170    // F8: an open PR with no recorded sessionId has nothing to resume — but there IS a trace
171    // (an open PR on GitHub), so this is NOT "same as no trace". A blind `{ kind: 'fresh' }`
172    // here spawns an executor with no idea the PR exists; it rebuilds the card and opens a
173    // SECOND PR (violates acceptance #3: no duplicate PRs on resume). Reuse the same
174    // `buildStateDigest` the resume-failure fallback already uses, so the fresh session is
175    // told the PR number and instructed to continue it, not duplicate it.
176    const reason = ...
184    return { kind: 'fresh', digest: buildStateDigest(cardId, card, reason) };
185  }
```

`card.sessionId` falsy ⇒ line 184: `{ kind: 'fresh', digest: buildStateDigest(...) }` — a `fresh`
phase that DOES carry a digest, contradicting the old README's "same as no trace" (a `fresh`
phase with a digest and a `fresh` phase with none are handled identically by the phase *type*,
but the executor brief they produce is materially different — `runCardSession`, `loop.ts:754-760`,
prepends the digest to `answersContent` only when `phase.digest` is set). The old README wording
would have told a reader "no trace to worry about", which is exactly the bug F8 fixed and exactly
what the in-code comment (lines 170-174) exists to rebut. Fixed the row and added an explicit
`>` callout block explaining the correction (not just silently rewriting it — per the F11 lesson
the brief cites, I wanted the correction itself to be legible to a future reader diffing this
file).

## Other README/agent claims I found that contradicted the code (audited the resume matrix as a
whole, per the brief's instruction)

1. **The `escalation_pending` row's "Action" column was ALSO stale**, independent of W-F1 — it
   said `Exit: "answer pending" (see below)`. That was accurate before Task 2 (D5); after D5′
   (`35a91e8`), an `escalation_pending` card is **parked and the loop continues** to the next
   progressable card (`loop.ts:957-965`) — the whole run only exits once no progressable card
   remains. Fixed the Action column to say "Park" and cross-referenced D5′.
2. **`--max-cards`'s Inputs-table description was stale.** It said "Default: unbounded (run
   until `done`, an escalation, or a stop)" — under D5′, an escalation no longer stops the run,
   so that phrasing actively contradicts the current behavior. Fixed to "run until `done` or the
   budget is spent", and added the `worked`-vs-`attempted` budget-counting nuance (W-F4, closed
   in `35a91e8`) that the old README never mentioned at all.
3. **`EXIT_ESCALATED`/`EXIT_SESSION_INCOMPLETE`'s meanings in the Exit codes table were stale**
   for the same D5′ reason — both previously read as "the run exited because of this", which
   under D5′ conflates "this happened" with "the pass is over". Rewrote both to state the D5′
   semantics explicitly (a pass-level summary, not a single-card abort reason).
4. **`4` / `EXIT_ERROR` had NO row in the Exit codes table at all**, despite being reachable
   (`run.ts:35,270`) and being the exact code that produces the report's `reason: 'error'` (a
   value this same effort's report contract introduced). Not a "wrong" claim, but a coverage gap
   directly relevant to a reader trying to understand `campaign-report.json`'s `run.reason`
   field — added the row.
5. **The "Mocked tests validate logic, not invocations" bullet's test count ("All 116 tests")**
   was the baseline from BEFORE this whole effort — current count is 172 (baseline 116 + this
   effort's 56: Task 1 +18, Task 2 +9, Task 3 +27, the W-F5 fix +2). Updated the number and added
   a short parenthetical breaking down where the growth came from, so a future reader doesn't
   have to `bun test` just to know whether the doc is current.
6. **The old "What HAS been verified live" bullet was left completely untouched in substance**
   (I did not reword or weaken it) but its scope needed a label, because this effort's report
   contract changes ALSO have live verification now (per Warchief ruling 3) that is NOT part of
   that original campaign-runner smoke run. Rather than merge the two into one list (which would
   have made it ambiguous which claims trace to which effort's live check), I added a clearly
   separate, clearly dated second bullet scoped to only what changed here.

No other resume-matrix row, escalation-workflow claim, or STOP/lock claim disagreed with the code
I read (`loop.ts`, `run.ts`, `state.ts`, `types.ts`, `report.ts` in full).

## Gates

1. `grep -ril "campaign runner" plugins/tribe/agents/` — **non-empty**, confirmed:
   ```
   plugins/tribe/agents/shaman.md
   plugins/tribe/agents/warchief.md
   ```
   (The exact phrase "campaign runner" now appears in both files' new prose — this is the F12
   detection gate the plan itself names, inverted from empty to non-empty.)
2. `grep -rn "ai-dict\|/Users/" plugins/tribe/scripts/runner/README.md plugins/tribe/agents/` —
   empty (grep exit 1). W1 stateless holds.
3. From `plugins/tribe/scripts/runner/`: `bun test` → **172 pass / 0 fail** (450 `expect()`
   calls), identical to the pre-task baseline I confirmed before touching anything. `bunx tsc
   --noEmit` → clean, no output. Both **unchanged**, as expected for a docs-only task — I edited
   no `.ts` file in this directory.

## Ambiguities / things a reviewer should challenge — flagged, not papered over

- **The "planning-only dispatch" note I added to `warchief.md` is new prose, not a re-statement
  of anything already in the file.** I judged it additive (a new subsection, no existing text
  touched) per the Warchief ruling, but it is the one place in this task where I had to write
  original contract language rather than transcribe/correct an existing claim against code. If
  the Warchief wants different wording or a different anchor point in the file, that's a
  legitimate style call, not a correctness one — I placed it at the end of "The Shaman ⇄ Warchief
  contract" section since it's a variant of that same contract, immediately before "## Channels".
- **I did not update either agent's YAML frontmatter `description:`/trigger-phrase list** (e.g.
  shaman.md's frontmatter doesn't mention "orchestration" as a trigger phrase). The brief's task
  text only asked for "Mode 2 gains the campaign-state authoring duty... Stage A authorship
  policy... Stage C answering protocol" and "note the planning-Warchief dispatch shape" — both of
  which I read as body-content additions, not a frontmatter change. Frontmatter drives agent
  *discovery* (which agent a session picks for a task), a different concern from documenting what
  the agent does once dispatched. I judged expanding frontmatter to be scope beyond what the
  brief named ("Both changes are additive to the role contracts, not re-writes" — a frontmatter
  trigger-phrase edit felt like the kind of adjacent improvement the Hunter contract forbids
  unless asked for). Flagging this as a real choice a reviewer might want to reverse, not
  something I'm confident is unambiguously correct.
- **The new shaman.md section references `verify-shipped`** (Stage C's final report step, per
  design §O6) as an existing skill — I did not verify `verify-shipped` exists as an installed
  skill in this repo; I took it on the strength of the design doc's own explicit naming of it
  (§O6: "independently re-verifying each shipped card (`verify-shipped` — the no-cascade read)")
  and shaman.md's own pre-existing Mode 2 text, which already names `verify-shipped` for the
  ordinary (non-orchestration) SHIPPED path. Not a new claim I invented.
- **No What/Why product decision surfaced.** Everything above is either a grounded correction
  (cited against code) or a documented judgment call within the brief's stated discretion
  (placement/wording of the two additive agent-contract sections).

## Assumptions a reviewer should specifically challenge

- The exact wording/placement of the two new agent-contract subsections (noted above).
- The decision to split "verified live" into two dated bullets in the README's Known limitations
  rather than merging them into one list — I judged the provenance distinction (campaign-runner
  effort vs. campaign-orchestration effort) worth keeping visible.
- Whether "STOP under a real, in-flight session" still deserves to stay in the UNVERIFIED list
  given the Warchief's ruling that the report contract was proven "on a real exit path (STOP,
  and an escalation run)" — I read that ruling narrowly (the *startup* STOP-check exit path, plus
  its report write, are what got proven; nothing in the ruling described a session actually
  running when `STOP` was dropped) and kept the mid-flight case UNVERIFIED rather than removing
  it, per the explicit instruction not to claim more than the ruling stated. If the live check
  actually did cover a mid-flight STOP, this line should be loosened — I did not have evidence
  for that stronger claim, so I did not write it.
