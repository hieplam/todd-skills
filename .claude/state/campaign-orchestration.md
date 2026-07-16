# Campaign Orchestration — implementation effort STATE

**Status:** running
**Role in force:** Claude = **Warchief** (owner ruling, 2026-07-16, re-confirmed for THIS effort).
Dispatches one Hunter per plan task; never writes feature source itself; audits every
deliverable; opens PR; **regular merge** (2 parents).
**Branch:** `feat/campaign-orchestration` (base: `master` @ `9a18103`)
**Plan:** `docs/superpowers/plans/2026-07-16-campaign-orchestration.md`
**Design (frozen — do not re-open):** `docs/superpowers/specs/2026-07-16-campaign-orchestration-design.md`
**Predecessor effort (its findings F11/F12 created this one):** `.claude/state/campaign-runner.md`

**Goal:** owner says "orchestration: do these N ideas" in any session and touches nothing
again until ONE consolidated report lists every card shipped (PR + sha, D3-verified) or
blocked (question + why). Closes F12 (the Shaman→runner handoff does not exist).

## Owner directives in force (this effort)

1. **"Build Tasks 1–6 now, park live smoke"** (2026-07-16). Implement all 6 tasks with TDD +
   mocked seams, PLUS the W5 real-CLI sweep on every new/changed `gh`/`git` string (read-only
   probes where mutation is unsafe). **Acceptance #1–#3 (live campaign, forced escalation,
   round-trip) are reported BLOCKED-pending-repo in the PR — never claimed, never silently
   skipped.** Rationale: my token has `repo` but NOT `delete_repo` (verified `gh auth status`),
   so any throwaway repo I create is permanent litter in the owner's account.
2. **"Warchief — dispatch a Hunter per task"** (2026-07-16). Hunter per task, TDD, audit each
   deliverable before accepting.
3. Global standing: **no squash merge**; no Co-Authored-By / attribution footer.

## Commit convention (plan §, matches repo history)

`feat(tribe): campaign orchestration — <task summary>` — conventional commits, no `[Branch]`
prefix. Repo trailers `Tribe-Card:` / `Tribe-Task: N/M` are real convention — keep them.

## Baseline (verified before any change, 2026-07-16)

`bun test` → **116 pass / 0 fail**, `bunx tsc --noEmit` → clean, in
`plugins/tribe/scripts/runner/`. Any Hunter that reports green must beat this bar, not match it.

## Task status

| # | Task | Status | Report |
|---|------|--------|--------|
| 1 | `state.ts` — `dependsOn`, `blocked`, `autoAnswerRounds` | ✅ shipped `38f4232` — audited: 134 tests (baseline 116), tsc clean; **W-F3 found by probing + fixed + re-probed** (stale `blocked` now reconciles to `staged`); byte-identical v1 round-trip re-verified | `reports/orch-task-1.md` |
| 2 | `loop.ts` — D5′ park-and-continue | ✅ shipped `35a91e8` — audited: 143 tests, tsc clean, W2 clean; **W-F2 proven by sabotage experiment** (hang vs 107ms pass); **W-F4 fixed** (budget split, RED→GREEN proven); `attempted` dedup intact | `reports/orch-task-2.md` |
| 3 | `report.ts` — report contract (§O5) | ✅ shipped `f05a387` + **W-F5 fix `5511492`** — audited: 172 tests, tsc clean; **report contract proven END-TO-END against the real CLI** (see below) | `reports/orch-task-3.md`, `orch-task-3-fix.md` |
| 4 | `orchestrate-campaign` skill (§O1/O3/O6) | 🔄 in flight (hunter-orch-4) | `reports/orch-task-4.md` |
| 5 | Docs — runner README schema + shaman/warchief awareness | ✅ shipped `1733ce5` — audited: **F12 proven closed** (README's own example → runnable campaign, live); **W-F1 fixed** + honest correction note; both code citations verified accurate; docs-only scope confirmed (172 tests unchanged) | `reports/orch-task-5.md` |
| 6 | C3 change-unit + final gates | ✅ Warchief-authored `3730b5e` — **two** units applied (`c3-215` ok:true); all final wall gates green; W5 not triggered (this effort changed no gh/git string) | ADRs are the record |

Sequencing: 1 → 2 → 3 → (4 ∥ 5) → 6.

## Anti-goals / walls (spec §2 — each is a tripwire, W7 a drift gauge)

- **W1 stateless:** no repo/path/model/campaign value hardcoded in the skill or runner. Final
  gate greps source clean.
- **W2 zero-LLM loop:** no SDK/model import in `loop.ts`/`run.ts`/**`report.ts`** (new file —
  the wall extends to it).
- **W3 judgment stays in sessions:** the runner writes escalation files; it NEVER writes to
  `answers.md`.
- **W4 no squash:** `rule-no-squash-merge` governs every merge path.
- **W5 real-CLI proof:** any new/changed `gh`/`git` command string must be executed once
  against the real CLI before trust. **A green mocked suite is NOT that proof** (learning F4).
- **W6 dependency safety:** a card never starts while a `dependsOn` target is parked.
- **W7 bounded auto-answer:** `autoAnswerRounds` ≤ 2 per card.
- State schema stays `"v": 1` — Tasks 1–2 add only OPTIONAL fields (existing reader preserves
  unknown fields, so old states parse unchanged).
- Hunters build **only** their brief — no adjacent improvements.

## Next action

**All 6 tasks shipped and audited.** PR open; awaiting CI + the owner's **regular merge**
(2 parents, never squash). After merge: `verify-shipped` the PR, then commit a snapshot of this
STATE to the repo's docs home per the global resume protocol.

**The one thing NOT done, by owner directive, and it must not be quietly closed:** the live-smoke
acceptance (#1–#3) is **BLOCKED-pending-repo**. See "Known-carried gaps" below.

**Audit protocol that is EARNING its cost — keep doing this:** every Hunter claim is verified
against the repo, and every load-bearing behavior is **probed against the real module/CLI**, not
read and not trusted from a green suite. W-F3 was found this way (132 green tests passed over
it). Hunter-orch-1 also **went idle once claiming "available" WITHOUT applying the audit fix** —
`git log` proved the commit sha unchanged. **Never trust an agent's idle/completion notification
as evidence of work; verify the sha.**

## Learnings bank (inherited — these BIND this effort)

- **🔑 Mocked seams cannot validate the commands themselves.** F4 (`gh api pulls/<pr>` → 404)
  passed 25 green tests and would have wedged the campaign on card 1. A mock returns the shape
  its author imagined. Hence wall W5.
- **A doc fix is not a fix (F11).** Fixing `c3-215`'s doc fixed the MAP; the agents + sibling
  skill — the TERRITORY — still said squash. Prose repeated in three places drifts in three
  places. Task 5 touches agents; Task 6 touches C3 — do BOTH, and prefer a checkable rule over
  repeated prose.
- **`bun test` hard-errors (exit 1) on zero test files** — not a soft pass.
- **The plan's original seeder was struck (F12 root cause).** The ai-dict docs PR was the ONLY
  thing that authored `campaign-state.json`; removing it left nothing. Tasks 4–5 replace it via
  the Shaman. Watch for the same class of gap: removing a step can silently orphan a contract.

## Warchief findings (found during this effort — must be cleared or carried deliberately)

- **W-F1 — the runner README's resume matrix is STALE and documents a fixed bug as current
  behavior.** README row (`plugins/tribe/scripts/runner/README.md:80`) says: *"PR found for the
  branch, `state == "OPEN"`, no `sessionId` recorded | `fresh` | Nothing to resume — spawn fresh
  (same as 'no trace')."* That is the **pre-F8** behavior. F8 was fixed in `cee591d` (merged
  `2c17c26`): `loop.ts:171-181` now spawns fresh **carrying a state digest** naming the open PR,
  precisely so it does not open a duplicate PR — and the in-code comment explicitly rebuts the
  README's wording ("this is NOT 'same as no trace'"). The code is right; the doc is wrong.
  **This is the F11 lesson running in reverse** — a code fix that never updated the map. Anyone
  reading the README to understand resume semantics learns the bug, not the fix.
  ⇒ **Assigned to Task 5** (which already owns the README). Fix the row; do not let Task 5 add
  new schema docs on top of a lie.

- **W-F2 — 🔴 park-and-continue INTRODUCES an infinite loop on the `--include-escalated` path.
  Ruled before dispatch; binds Task 2.** Today `runLoop` `break`s on escalation, so re-selecting
  the same card is impossible. Once Task 2 turns that `break` into a `continue`, the existing
  `filteredNextCard` (`loop.ts:431`) → `nextCard(..., { includeEscalated })` returns *the first
  non-shipped card*. With `--include-escalated` set, an escalated card is **not** skipped ⇒ the
  loop re-selects the card it just escalated, escalates it again, forever — bounded only by
  `--max-cards`, which is **unbounded by default**.
  **This is not exotic: it is the designed Stage C round-trip path.** §O6 re-triggers with
  exactly `--cards <answered> --include-escalated`. So the normal happy path of the feature this
  effort exists to build is the path that hangs.
  ⇒ **Ruling (How, mine):** `runLoop` maintains an in-run `attempted` set — a card is never
  selected twice in one pass. This also gives the plan's "`--max-cards` counts attempted cards
  (shipped + escalated)" its natural meaning, and makes the loop's termination argument
  *structural* (the sequence is finite and each card is attempted ≤ once) rather than incidental.
  A test MUST cover: `--include-escalated` + a card that escalates again ⇒ pass terminates.

- **W-F3 — `nextCard` SETS `blocked` but never CLEARS a stale one.** Found by **probing the real
  module** during the Task 1 audit (not by reading, and not by the 132 green tests — which all
  passed over it). Probe: `A shipped`, `B {status:'blocked', dependsOn:['A']}`, `C staged`,
  `sequence:['C','B']` ⇒ `nextCard` returns `C` and **returns early**, so `B` is never visited,
  its stale `blocked` is never corrected, and `persistLocalState` **serializes `blocked` to
  disk** — for a card whose only dependency has already shipped.
  `computeBlockedCardIds` is correct (B is rightly absent from the computed set); the bug is
  that stored status disagrees with derived truth. **Impact is on the owner's ONE artifact:**
  Task 3's report renders `blocked` cards with a `blockedOn` field, so this state yields
  *"B blocked, blockedOn: A"* where **A is shipped**. The runner self-heals (next `nextCard`
  selects B — `blocked` is not in the skip list); the report does not.
  ⇒ **Ruled + sent back to hunter-orch-1 to amend into `986c1e1`:** reconcile ALL cards against
  `blockedCardIds` up-front, before the walk's early return — in-set ⇒ `blocked`; stored
  `blocked` but out-of-set ⇒ reset `staged` (safe: only `staged`/`running` can become blocked,
  and `running` is re-derived from gh/git by D4, never trusted from the file). Makes the
  invariant total instead of incidental.
  **The lesson (third time this effort's lineage has paid for it):** the 132 tests were green,
  well-written, and covered the cascade thoroughly — they simply never asked what happens to a
  card the walk returns *before*. A green suite proves the logic its author imagined.

- **W-F4 — `--max-cards` budget counts cards where NO work happened.** Found in the Task 2 audit.
  `attempted` correctly does dedup (structural termination, the W-F2 fix), but
  `while (attempted.size < limit)` makes the SAME set answer "how much work have I done?".
  Those are different questions. `attempted` also absorbs `escalation_pending` and
  `planning_needed` — cards where nothing happened this pass. Concrete: `--max-cards 1` +
  first card carries a stale escalation file ⇒ pass parks it, budget spent, **exits having
  shipped nothing**, with an `EXIT_ESCALATED` that looks like it did something. Diverges from
  plan line 54 ("counts attempted cards (shipped + escalated)").
  ⇒ **Ruled + sent back to hunter-orch-2:** split the concerns — `attempted` = dedup only
  (unchanged); budget counts only genuinely-worked cards (`shipped`/`escalated`/`stopped`).
  ✅ **CLOSED in `35a91e8`** (`let worked = 0` / `while (worked < limit)`), RED→GREEN proven by
  reverting `loop.ts` to HEAD with the new test in place and watching it fail for the right
  reason.
  **⚠️ Warchief correction — MY ruling was wrong on one detail, the Hunter's reading was
  better.** I instructed that `planning_needed` consume no budget. The Hunter counts it, and is
  right: `planning_needed` calls `escalateCard`, which writes the escalation file and yields an
  `escalated` outcome — so it IS an escalation created this pass, and plan line 54 says the
  budget counts "shipped + **escalated**". Only `escalation_pending` (a PRIOR run's escalation,
  nothing written this pass) is correctly excluded. Recorded because a Warchief ruling is not
  automatically right, and the record should show which party the evidence favored.

### W-F2 — CLOSED, and the ruling was correct (controlled experiment, 2026-07-16)

Independently falsified rather than trusted. Copied the runner to a scratch dir, removed ONLY
`.filter((id) => !attempted.has(id))`, ran the W-F2 test:
- **sabotaged code ⇒ HUNG the bun process past 120s**, even with `--timeout 8000` (the tight
  await loop never yields, so the per-test timeout cannot even fire);
- **real code ⇒ 1 pass in 136ms.**
⇒ The infinite loop was real, and the regression test genuinely catches it. Implementing plan
Task 2 literally ("turn the break into a continue") would have shipped a green-tested runner
that hangs on §O6's own Stage C re-trigger shape. **Keep this technique** — sabotage-then-run is
the cheapest way to prove a regression test is load-bearing rather than decorative.

- **W-F5 — 🔴 the owner's ONE report calls a BLOCKED card `not_reached`.** Flagged by
  hunter-orch-3b from a hand trace; **I proved it against the real CLI** (scratch repo, real
  `run.ts`): sequence `[A, B]`, `B dependsOn A`, `A` escalates ⇒ disk state says `B: staged`, and
  `campaign-report.md` says **`### B — not_reached`** with **`## Pending: (none)`**.
  **Truth:** B is blocked behind A's unanswered question and will NEVER run until the owner
  answers. **Report:** "not_reached" — which reads as *"we just didn't get to it; a re-run will
  pick it up."* The owner re-triggers, B never ships, and the report names no `blockedOn` and
  nothing pending. This defeats the design's core promise (§O5: every card accounted for as
  shipped **or blocked**, with the question and why it needs the owner) in the exact artifact the
  whole effort exists to produce.
  **Mechanism (two bugs compounding):**
  1. `nextCard`'s `reconcileBlockedStatuses` marks `B: blocked` **in memory** on the tick that
     also discovers `done` — the loop `break`s with no further card to process, so
     `persistLocalState` (which only ever runs as a side effect of shipping/escalating the NEXT
     card) is never called. The reconciliation is lost.
  2. `run.ts:237`'s `tryWriteReport` **re-loads state from DISK**, not from the in-memory object
     — so it reports the stale `staged` ⇒ `not_reached`.
  **Why the suites missed it (all 170 green):** Task 2's W6 blocked-cascade test always has a
  third independent card `C` that ships *after* the blocking, and `C`'s own persist flushes the
  whole state object — including `B`'s already-reconciled status — to disk as a side effect. The
  bug only appears when the reconciling tick is the LAST tick. A 2-card campaign (`A` escalates,
  `B` depends on it) is exactly plan acceptance #2's shape.
  ⇒ **Ruled:** `persistLocalState` before `runLoop` returns, so a reconciliation on the final
  tick reaches disk. Smallest fix, keeps `state.ts` the single owner of the dependency graph
  (no duplicate logic in `report.ts`), and corrects the state file for EVERY consumer, not just
  the report. ✅ **CLOSED in `5511492`** — **re-proven against the real CLI**, same repro:
  disk now `{A: escalated, B: blocked}`; report now reads `### B — blocked / - Blocked on: A`,
  `Pending: [A]`, `Stats: 0 shipped, 1 escalated, 1 blocked, 0 not reached`, exit 2. Regressions
  re-checked live: W-F2 still terminates, byte-identical round-trip holds, and **`--dry-run`
  still writes NOTHING** (state byte-identical, no report) — the new persist did not leak into
  the zero-side-effects path.
  **Third instance of one root class this effort:** derived state computed in memory but never
  propagated (W-F3 = set-but-never-cleared; W-F5 = computed-but-never-persisted). Worth a
  standing rule: *if a value is derived, name exactly where it is persisted and who reads it.*

- **W-F6 — 🔴 the skill's FIRST command fails from exactly the sessions §O1 says must trigger it.**
  Found by running the skill's own documented command from a target repo:
  ```
  cwd = <a target repo>
  $ bun plugins/tribe/scripts/runner/run.ts ... --dry-run
  error: Module not found "plugins/tribe/scripts/runner/run.ts"
  ```
  `SKILL.md:134` tells the session to invoke the runner by a **repo-relative** path, which only
  resolves when cwd happens to be the todd-skills repo root. But the skill is **installed
  globally** (verified: `~/.claude/skills/orchestrate-campaign` → symlink into this repo's
  plugin), and §O1's whole premise is triggering from ANY session — "the main chat, a Shaman, or
  a Warchief… it can be option 1, 2 or just a simple chat session" — while `--repo <target-repo>`
  points the *campaign* at a different repo entirely. So the common case (owner is sitting in the
  target repo, says "orchestration: …") dies on the skill's first instruction.
  ⇒ **Ruled + sent to hunter-orch-4:** resolve the runner's absolute path once at the start of
  Stage B from the tribe plugin's own installed location (the skill knows where it lives; the
  runner is its sibling at `scripts/runner/run.ts`). Do NOT hardcode a repo path (W1), and do NOT
  `cd` into the plugin repo (breaks `--repo`'s decoupling). Prove the fix by running from a
  non-plugin cwd.
  **Note the irony worth keeping:** this is F12's own shape — a handoff that does not exist
  because nobody executed the path end-to-end. Every gate Task 4 passed (install zero warnings,
  W1 grep, contract-only grep, trigger phrases) was green; none of them RAN the command.

- **W-F7 — schema duplication DID drift, within hours, inside one effort.** ✅ **CLOSED in
  `38faa05`.** Predicted when deferring, then confirmed by cross-reading both docs against the
  frozen spec. Two defects, neither Hunter at fault — the drift was *structural*:
  1. `SKILL.md` said *"The campaign runner's own documentation does not yet show this schema (a
     known gap)"* — **true when written, false the moment Task 5 landed the schema** at
     `README.md:43`. The skill lied about its own contract.
  2. The README's field table omitted **`planning`**, which frozen §O2 REQUIRES
     (`planning: { mode: "shaman" | "warchief-fanout" }`, so a resuming session knows how the
     docs were produced) — while the same section claimed to document the schema *"completely
     enough to author a valid file from this README alone."* Author from it alone ⇒ omit a field
     the design requires. The skill wrote it correctly; the contract never documented it.
  ⇒ **Ruled:** collapse to ONE source of truth rather than syncing two — the README is the
  contract; the skill NAMES it authoritative and keeps only a subordinate example (an
  illustration, not a competing specification). This is also the owner's standing skill-authoring
  rule: depend on a capability's **contract**, never a private copy of it.
  **Proven live after the fix:** README example + `planning` → runner accepts it (`phase: fresh`),
  and `planning` **survives a load→save round-trip** (`{'mode': 'shaman'}` intact after a real run
  persisted state) — confirming the `looseObject` preservation the README now documents.
  **The lesson, sharper than F11's:** F11 said prose repeated in N places drifts in N places.
  This proves the drift clock is not months — it is **hours**, when two agents write in parallel.
  The fix for duplicated prose is never "sync it"; it is "delete one copy and point at the other."

### F12 — PROVEN CLOSED (live, 2026-07-17)

The finding that created this effort ("the Shaman→runner handoff does not exist — nothing authors
`campaign-state.json`; no agent knows the runner exists") is closed, and **proven empirically
rather than argued**:

1. **The README's own worked example, extracted verbatim** (`awk` out of the `## State file
   schema` section) into a scratch repo → the real `run.ts --dry-run` accepts it and derives
   `{ "cardId": "A1", "phase": { "kind": "fresh" } }`. So a Shaman-authority session reading
   **only the README** can author a valid, runnable state file. That is the F12 gap, gone.
2. **The F12 detection, inverted:** `grep -ril "campaign runner" plugins/tribe/agents/` →
   `shaman.md`, `warchief.md`. Previously empty (no agent knew the runner existed).
3. **W-F1 fixed** — the stale resume-matrix row now documents the real F8 fresh-with-digest
   behavior, with an explicit "Correction" note recording that the doc previously had it wrong.
   Both of the Hunter's code citations (`loop.ts:170-184`, `loop.ts:957-965`) verified accurate
   against the actual lines.

### INCIDENT (2026-07-17) — a Hunter destroyed a parallel Hunter's commit. Recovered, no loss.

**What happened.** hunter-orch-4 was told (by me) to `git commit --amend` its Task 4 commit
`477408f`. By the time it acted, hunter-orch-5 had landed Task 5 as `1733ce5` ON TOP. Reflog
shows the sequence: it amended while HEAD was Task 5's commit (producing `ca3db3d` — Task 5's
content under a Task 4 message), noticed, `reset` to `HEAD^` (dropping `1733ce5` off the branch
entirely), then re-amended `477408f` → `58638a7`. Net: **Task 5's commit vanished from history**
and its files reverted to uncommitted working-tree modifications.

**Recovery (Warchief-executed — git/delivery is my role, not a Hunter's).** Verified all four of
Task 5's files were byte-identical to the lost `1733ce5`, which was still a reachable object;
discarded the redundant working-tree copies; `git cherry-pick 1733ce5` → `8835d0f`, preserving
its original message, authorship, and content. Confirmed: Task 5's files are identical between
the lost and restored commits (the only delta is the W-F6 fix `8835d0f` correctly inherits from
its new base). 172 tests green, tsc clean. **Nothing lost.**

**MY error, not the Hunter's.** I issued "amend into `<sha>`" to one of two Hunters running in
PARALLEL on the same branch. That instruction is only safe while the target is HEAD — and I had
no way to guarantee that, because I had deliberately dispatched a concurrent Hunter that could
commit at any moment. The Hunter followed a wrong instruction.

**Rules this buys (bind future parallel dispatch):**
1. **Never instruct `--amend` when a parallel agent shares the branch.** Amend is only safe on a
   branch with exactly one writer. With concurrent Hunters, always "one NEW commit on top".
2. **Parallel Hunters must own disjoint FILES *and* disjoint COMMITS.** File-disjointness (which
   I did enforce, and which held — no content was ever clobbered) is necessary but NOT sufficient;
   history is a shared mutable resource that file-level lanes do not protect.
3. **A Hunter must never `reset`/rewrite history it did not create.** Escalate to the Warchief
   instead — recovery is a delivery concern.

## Known-carried gaps (surface in the PR — do NOT report the effort done without these)

- **Acceptance #1–#3 BLOCKED-pending-repo** (owner directive 1 above).
- The runner's mutating surface (`gh pr create`/`gh pr merge`/`git push`), `.runner.lock`
  contention, and STOP under a real run remain **UNVERIFIED** — carried over from the
  campaign-runner effort, and by design this effort's live smoke was where they would close.
- Pre-existing C3 drift in `c3-213` and `c3-216` (same ungrounded-derivation drift) is **out of
  scope** — each needs its own ADR; fixing here would smuggle unrelated changes into a feature
  branch.
