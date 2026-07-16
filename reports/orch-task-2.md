# Task 2/6 report — `loop.ts`: D5′ park-and-continue

Hunter report to the Warchief. Branch: `feat/campaign-orchestration` (worked directly on it,
already checked out at HEAD `38f4232`, no worktree/new branch, per brief). Repo root:
`/Users/todd.lam/WORK/_TestScripts/todd-skills`. All commands run from
`plugins/tribe/scripts/runner/`.

**Reopened once** by the Warchief's audit (the `attempted`/`--max-cards`-budget conflation, plus
this report never having been committed) and fixed in the same commit (amended, per the
Warchief's explicit instruction, not a second commit) — see "Warchief audit fix" near the end
for the full RED→GREEN evidence. Everything above that section is the original submission, left
intact for the record; the fix section documents what changed on top of it. Original submission
was `5f5ffa4`; this report, and the audit fix below, land amended into that same commit (the
final hash is reported back to the Warchief in the Hunter's completion message, per the report
protocol — a report cannot embed the hash of the commit it is itself part of).

## What changed, file by file

### `plugins/tribe/scripts/runner/loop.ts`

Four escalation-adjacent exit points inside `runLoop`'s main loop, all converted from
`break`/early-`return` to `continue`, plus the machinery that makes that safe (Warchief
ruling W-F2):

1. **`nc.kind === 'planning_needed'`** (spec/plan missing on disk): was
   `escalateCard(...)` → push → `exitCode = EXIT_ESCALATED; break;`. Now: `attempted.add(...)`
   → `escalateCard(...)` → push → `continue`.
2. **`phase.kind === 'escalation_pending'`** (a card whose escalation file already exists from
   a *prior* run): was an early `return` with a `message` string, never even reaching
   `processed`. Now: `attempted.add(...)` → push a **new** `CardOutcome` kind,
   `{ kind: 'escalation_pending', cardId, escalationPath }` → `continue`. This is a distinct
   kind from `escalated` on purpose: nothing is *written* this pass (the escalation file and
   `card.status` already carry the escalation from whenever it first fired), so it shouldn't
   masquerade as a fresh escalation event.
3. **`outcome.kind === 'escalated'`** (a new escalation this pass — `NEEDS_DIRECTION`,
   `PLANNING_NEEDED`, or D3 verify-fails-twice): was `exitCode = EXIT_ESCALATED; break;`. Now:
   `attempted.add(...)` → push → loop continues naturally (no special-case at all — the
   generic post-`actOnCard` code path handles it).
4. **`outcome.kind === 'stopped'`** (a session error/timeout with no further D4 fallback): was
   `exitCode = EXIT_SESSION_INCOMPLETE; break;`. Now: same generic path — `attempted.add(...)`
   → push → loop continues.

**The `attempted` set (Warchief ruling W-F2).** `runLoop` now declares
`const attempted = new Set<string>()` once per pass. `filteredNextCard` gained a 4th parameter,
`attempted: ReadonlySet<string> = new Set()`, and filters it out of the candidate `sequence`
*before* handing it to `nextCard` — independent of `card.status`. Every branch that decides to
act on a card (`planning_needed`, `escalation_pending`, or the generic `actOnCard` path) adds
that card's id to `attempted` before the next tick. This is what makes the loop's termination
**structural**: the candidate sequence `filteredNextCard` computes strictly shrinks by exactly
one id every iteration (bounded by `state.sequence.length`), so a pass is *guaranteed* to reach
`nextCard`'s `done` result — it never depends on `card.status` "eventually" excluding a card
(which, as shown below, two real triggers defeat).

**`computeExitCode(processed)`** (new, private): a pass can now end with a *mix* of outcomes.
Precedence: any `escalated`/`escalation_pending` → `EXIT_ESCALATED` (2); else any `stopped` →
`EXIT_SESSION_INCOMPLETE` (3); else `EXIT_OK` (0). Escalation outranks session-incomplete
because it needs a human ruling; session-incomplete merely resumes next run — matches the
brief's design note #2 verbatim.

**`--max-cards`** is now wired to `attempted.size` (the `while (attempted.size < limit)` loop
condition) rather than a raw tick counter, so a card `nextCard` itself skips (blocked by a
parked dependency) never consumes budget — matches the plan's "counts attempted cards (shipped
+ escalated)".

**STOP-file semantics: unchanged.** The `isStopRequested` check still runs once per tick, at
the very top of the loop body, before selecting a new card. Nothing inside a card's processing
(`actOnCard`, `escalateCard`) is interrupted by STOP appearing mid-flight — the in-flight card
always finishes. I did not touch this check at all; I only proved it still holds under the new
`continue`-based control flow (see the STOP-mid-pass test below).

### `plugins/tribe/scripts/runner/loop.test.ts`

Added 8 new tests (in 8 new `describe` blocks, all under a new `// Task 2 — D5′
park-and-continue` section) plus one shared helper `cleanCommitAndVerifyHandlers(mergeSha)`
(factors out the boilerplate exec-handler list every "this card ships/escalates cleanly" test
in the file already used, reused verbatim from 5+ pre-existing tests — not a new pattern).

1. **`escalate-then-continue ordering`** — C1 escalates (`NEEDS_DIRECTION`), independent C2
   still ships; asserts `processed` order `[escalated C1, shipped C2]` and exit code
   `EXIT_ESCALATED` (an escalation is present even though something shipped).
2. **`all cards parked, nothing ships`** — two independent cards both escalate; asserts the
   pass reaches `done` (not an infinite loop, not `--max-cards`-bounded) and exits
   `EXIT_ESCALATED`.
3. **`blocked cascade (W6)`** — `A` escalates → `B` (`dependsOn: ['A']`) becomes `blocked` and
   is **never** in `processed` at all (no session spawned, no escalation file written for it)
   → `C` (independent) still ships. Exercises Task 1's `nextCard`/`reconcileBlockedStatuses`
   through the new multi-tick loop, proving W6 (a card never starts while a dependency is
   parked) holds under park-and-continue specifically, not just in isolation.
4. **`escalation_pending phase (prior-run escalation file) parks and continues`** — C1's
   escalation file already exists on disk (no `card.status` marker at all — this is exactly
   what `deriveCardPhase`'s file-exists short-circuit keys on); independent C2 still ships.
   Proves exit point #2 above needs the `attempted` set too: nothing about this path mutates
   `card.status`, so without `attempted` it would re-select C1 forever regardless of
   `--include-escalated`.
5. **`W-F2: --include-escalated never re-selects the same card twice in one pass`** — the
   brief's **required** test. See its own section below.
6. **`--max-cards counts ATTEMPTED cards (shipped + escalated), park-and-continue included`**
   — `maxCards: 1`, C1 escalates and consumes the whole budget; independent C2 is never
   attempted (`processed` length 1, `spawnSession` called exactly once).
7. **`exit-code precedence (escalation outranks session-incomplete)`** — C1 escalates, C2's
   session throws (→ `stopped`); asserts `exitCode === EXIT_ESCALATED`, not
   `EXIT_SESSION_INCOMPLETE`, even though the *later* card is the one that merely stopped.
8. **`STOP file created mid-pass finishes the in-flight card only`** — the owner drops STOP
   while C1's session is in flight (simulated by flipping a `stopArmed` flag from inside a
   wrapped `spawnSession`); C1 finishes and ships, C2 is never started.

## Test count and gates

- **Baseline** (confirmed before any change, from `plugins/tribe/scripts/runner/`): `bun test`
  → **134 pass / 0 fail**; `bunx tsc --noEmit` → clean.
- **RED**: wrote all 8 new tests against the pre-Task-2 `loop.ts` (git-stashed my `loop.ts`
  changes, kept the new tests) and ran `bun test loop.test.ts`:
  ```
  37 pass, 6 fail, 102 expect() calls
  ```
  6 of 8 new tests failed for the right reason — old code `break`s on the very first
  escalation, so `processed` never grows past length 1 and never reaches the second/independent
  card (`toHaveLength(2)` / `toEqual(['A','C'])` / full-object mismatches, all showing the OLD
  code stopped after one card). The remaining 2 new tests (`--max-cards counts attempted...`
  and `STOP-mid-pass...`) coincidentally already held under the old code too, because both are
  single-card-then-stop scenarios where old and new semantics happen to coincide (`maxCards: 1`
  caps at 1 attempt either way; STOP-before-second-card was already correct pre-Task-2, since
  the old code also only ever got through one card before its own `break`) — these two are
  regression-proofs of the new code, not RED-discriminators, and I've noted that plainly here
  rather than implying they were RED for the "wrong" (accidental) reason.
- **GREEN**: restored `loop.ts` (`git stash pop`), reran: `bun test loop.test.ts` →
  **43 pass / 0 fail** (121 `expect()` calls).
- **Full suite**: `bun test` → **142 pass / 0 fail** (360 `expect()` calls) — **+8 over the 134
  baseline**, all landed in `loop.test.ts` (same file count, 7 files).
- `bunx tsc --noEmit` → clean (no output, exit 0).
- `grep -n "claude-agent-sdk\|@anthropic" loop.ts` → **empty** (grep exit 1) — W2 holds, no
  SDK/model import entered this module.

## The W-F2 test: exact proof it's load-bearing, not decorative

The Warchief's ruling (W-F2) is: turning `break` into `continue` alone reintroduces an infinite
loop, because (a) `nextCard` excludes an `escalated` card only when `--include-escalated` is
false, and Stage C's own re-trigger (`--cards <answered> --include-escalated`) sets it true; and
(b) `--max-cards` must never be the thing that bounds this, because that would hide the very
defect being fixed. I did two things to make this concrete, not just asserted:

**1. The committed test genuinely fails without the fix.** Fixture: `C1` already
`status: 'escalated'` (simulating a prior run), sequence `['C1', 'C2']`, config
`includeEscalated: true`, **no `--max-cards` set**. `spawnQueue` scripts exactly 2 sessions
(`needsDirectionMessages` for C1, `shippedMessages` for C2) — if C1 were ever re-selected a
third time, the mock's `spawnSession` throws `"spawnSession called more times than scripted"`.
Ran against the pre-Task-2 code (same stash/pop as above): fails —
`Expected length: 2, Received length: 1` — because old code `break`s after C1's first
escalation and never even reaches the retry-loop question.

**2. The `attempted`-set guard specifically (not just "continue") is what prevents the hang —
demonstrated live, not just argued.** After restoring the real fix, I temporarily neutralized
*only* the dedup line in `filteredNextCard` (commented out
`.filter((id) => !attempted.has(id))`, keeping everything else — i.e. simulating "continue was
added but the dedup guard was not") and ran the W-F2 test alone:

```
$ bun test loop.test.ts -t "W-F2" --timeout 5000
```

This did **not** complete within the bash tool's 120s ceiling and was moved to the background;
the background task later reported **`status: failed`** (killed, never resolved). `ps aux`
confirmed a live `bun test` process still spinning minutes later — I killed it (`kill -9`).
Tracing why it outlives even bun's own 5000ms per-test timeout: without the dedup filter, C1
(index 0, still `status: 'escalated'`, `includeEscalated: true`) is reselected every tick ahead
of C2; the two scripted `spawnQueue` entries get consumed by C1 alone (first: `NEEDS_DIRECTION`
→ escalate again; second: the messages *intended for C2* — `shippedMessages(2, ...)` — get fed
to C1 instead, which ships C1 under C2's PR number). Once the queue is empty, every further
`spawnSession` call throws synchronously; `session.ts`'s `consumeSession` catches that and
returns a typed `error` result (never propagates), so `actOnCard` returns `stopped` — which, in
the fixed loop, *also* parks-and-continues rather than exiting. Because a `stopped` outcome
happens before `onSessionStart` (and hence before `card.status` is ever touched) for a *fresh*
phase, C2's status never leaves `staged`, so it keeps being reselected too, throwing the same
error every tick, forever — a tight async spin with no real I/O wait, which appears to starve
whatever timer mechanism `bun test`'s own `--timeout` relies on (it never fired). I restored the
dedup line immediately after confirming the hang; `git diff --stat loop.ts` after restoring
matches exactly the pre-neutralization diff (82 insertions / 29 deletions), confirming no
residue. Full suite reran green (142 pass) and `tsc --noEmit` clean after restoring.

I did not commit the neutralized version at any point — this was a throwaway local edit,
reverted before the commit in this report.

## Design notes I implemented (from the brief, not additive scope)

- **Four exit points converted, not one** — see the file-by-file section above; all four are
  covered by name in the new tests (`escalation_pending` gets its own test #4; `planning_needed`
  is exercised by the pre-existing `PLANNING_NEEDED` test, unchanged assertions, still green
  under the new loop shape).
- **Exit-code precedence** — implemented as `computeExitCode`, proven by test #7.
- **STOP semantics unchanged** — proven by test #8 (the in-flight card finishes; the next one
  never starts).
- **`--max-cards` counts attempted cards** — implemented via `attempted.size` as the loop bound,
  proven by test #6.

## Ambiguities / things I resolved myself (flagging for the Warchief, not the Shaman)

1. **No `- [ ]` checkboxes in the plan file.** Same as Task 1's report: the plan is prose under
   `### Task N:` headings, zero `- [ ]`/`- [x]` matches. Followed the same precedent as Task 1's
   commit (`38f4232`): no plan-file edit; the done-record lives in the commit's
   `Tribe-Card`/`Tribe-Task: 2/6` trailers. I did not touch
   `.claude/state/campaign-orchestration.md` either (it was already modified before I started,
   not by me — see `git status` at dispatch time) — same reasoning Task 1's report gives and the
   Warchief already confirmed correct for that task.
2. **`CardOutcome.escalation_pending` as its own kind vs. folding into `escalated`.** The brief
   doesn't spell out the exact shape of the outcome value for the prior-run-escalation-file
   path, only that it should "record the card, move on." I chose a distinct kind (documented
   inline in `loop.ts`) rather than reusing `escalated`'s shape (which carries `reason` +
   `commitResult`, neither of which exists for this path — nothing is written this pass). This
   is a genuinely different situation from a *new* escalation and Task 3's report contract will
   likely want to say something different for it ("already parked" vs. "just escalated") — I'm
   flagging this as the one true design-shape choice I made without an explicit brief sentence,
   since Task 3 (report.ts) will need to consume `CardOutcome` and may want this distinction, or
   may want it folded back — easy to change if the Warchief disagrees.
3. **`message` field on the old `escalation_pending` early-return is gone.** The pre-Task-2 code
   returned `message: "card ${cardId}: answer pending at ${path}"` for this path. Since the pass
   can now have *multiple* escalation_pending cards, a single `message` string doesn't fit; I
   dropped it in favor of the per-card `processed` entries (which now carry `escalationPath`
   directly). Checked `run.test.ts`/`run.ts` for any dependency on this specific message string
   — none found (`run.ts`'s `main()` only logs `outcome.cardId`/`outcome.kind` generically per
   processed entry, and optionally `result.message` if present, which is still used for the
   LOCKED and startup-STOP paths, both untouched). Flagging since it's an observable behavior
   change (not just internal), even though nothing currently in the repo reads that string.

Nothing here rose to a genuine STOP-and-report — every item was resolved using the brief's own
rulings (W-F2, the four design notes) or direct precedent from Task 1's report/commit. No
product/What-Why decision surfaced.

## Assumptions a reviewer should specifically challenge

- That `escalation_pending` deserves its own `CardOutcome` kind rather than being folded into
  `escalated` (item 2 above) — this is the one shape choice with no explicit brief sentence
  pinning it down, and Task 3 (report.ts) is the next consumer of this type.
- That dropping the single-escalation `message` string (item 3 above) is safe — I verified no
  current test/consumer depends on it, but it is an observable CLI-output change for anyone
  piping `run.ts`'s stdout today.
- The W-F2 "hang" proof used a manual, uncommitted local edit + a killed background process as
  evidence (documented above with the exact commands and the background-task's own `failed`
  verdict) rather than a second committed test that intentionally hangs — I judged committing a
  test that can hang the suite to be worse than proving it out-of-band and documenting the
  transcript here. If the Warchief wants a bounded, always-terminating "would-have-hung" proof
  committed to the suite instead (e.g. an iteration-count assertion with an artificial low cap
  on a deliberately-unguarded helper), that's a follow-up I can add.

- **Independently re-verified by the Warchief's own audit**, using the same technique
    (scratch copy, removed only the dedup filter, reran W-F2 alone): hung past 120s even with
    `--timeout 8000`; the real code passed in 136ms. Confirms this was a controlled experiment
    that reproduces, not a one-off on my machine.

## Warchief audit fix: `attempted` was doing double duty (dedup AND `--max-cards` budget)

**The defect, as the Warchief found it.** My original loop used a single `while (attempted.size
< limit)` condition. `attempted` correctly answers "have I already selected this card id this
pass?" (the W-F2 dedup/termination guard). But reusing `attempted.size` as the `--max-cards`
BUDGET conflates that with a different question: "how much of the operator's requested work has
actually happened?" The plan says `--max-cards` "counts attempted cards **(shipped +
escalated)**" — but my `attempted` set also grew for `escalation_pending` cards, where nothing
is written or decided this pass (see the `CardOutcome.escalation_pending` doc — it's parked from
a run that already happened). Concrete failure: `--max-cards 1` with the first card in sequence
carrying a stale prior-run escalation file ⇒ the pass parks it, `attempted.size` hits 1, the
loop exits having shipped nothing — the operator asked for one card of real work and got zero,
under an `EXIT_ESCALATED` code that reads as if something happened this run.

**RED — reproduced exactly the Warchief's scenario, as a new test, before touching `loop.ts`:**
`--max-cards 1`, sequence `['A', 'B']`, `A` has a pending prior-run escalation file (via
`escalationFiles: new Set(['A'])`, no `card.status` marker — exactly the `escalation_pending`
phase), `B` is a healthy staged card with a pre-assigned branch that ships cleanly. Asserted
`result.processed` equals `[escalation_pending A, shipped B]` and `spawnSession` was called once
(for B). Ran against the pre-fix (already-committed `5f5ffa4`) code:

```
$ bun test loop.test.ts -t "budgets only cards actually WORKED"

error: expect(received).toEqual(expected)
@@ -3,11 +3,5 @@
      "cardId": "A",
      "escalationPath": "/repo/escalations/A.md",
      "kind": "escalation_pending",
-   },
-   { "cardId": "B", "commitResult": ObjectContaining {...}, "kind": "shipped" },
    },
- Expected  - 8
+ Received  + 1
0 pass, 1 fail, 1 expect() call
```

Confirmed failing for the right reason: the pass exited after parking A, exactly the bug
reported — B never even got selected, let alone shipped.

**GREEN — the fix.** Split the single counter into two, both declared right before the loop:

```ts
const attempted = new Set<string>();  // dedup ONLY — every selected card id, unconditionally
let worked = 0;                       // BUDGET — only cards where real work happened this pass

while (worked < limit) {
  ...
  if (nc.kind === 'planning_needed') {
    attempted.add(nc.cardId);
    const outcome = await escalateCard(...);   // a NEW escalation is written — real work
    processed.push(outcome);
    worked += 1;
    continue;
  }
  ...
  if (phase.kind === 'escalation_pending') {
    attempted.add(nc.cardId);                  // dedup: never re-select it this pass
    processed.push({ kind: 'escalation_pending', ... });
    continue;                                  // NOT worked += 1 — nothing was done
  }

  const outcome = await actOnCard(...);         // shipped / escalated / stopped — real work
  attempted.add(nc.cardId);
  processed.push(outcome);
  worked += 1;
}
```

`attempted` still grows on every selected card (including `escalation_pending` ones), so
`filteredNextCard`'s termination argument is untouched — the candidate sequence still strictly
shrinks every tick regardless of `worked`/`limit`, so a pass with e.g. every remaining card
parked on prior escalations still reaches `nextCard`'s `done` result and exits, rather than
spinning because `worked` never catches up to `limit`.

`bun test loop.test.ts -t "budgets only cards actually WORKED"` after the fix: **1 pass / 0
fail** (B ships, A parks, budget of 1 spent only on B).

**Re-checked exactly what the Warchief asked for:**
- `--max-cards` still bounds a pass of genuinely-worked cards — the pre-existing "max-cards 1:
  C1 escalates and consumes the whole budget" test (C1's escalation is real work, so it still
  counts) is unchanged and still green.
- The W-F2 test still terminates and still passes: `bun test loop.test.ts -t "W-F2"` →
  **1 pass / 0 fail** (172ms) — `attempted` (unaffected by this fix) is what bounds that case,
  not `worked`/`--max-cards` (which the W-F2 test deliberately never sets).

**Doc comments updated** to state the split explicitly: `runLoop`'s top comment, and a new
comment block directly above the `attempted`/`worked` declarations explaining why the two are
different questions and which branches increment which. `filteredNextCard`'s own doc comment
(the W-F2 rationale) needed no change — it was already scoped to dedup/termination only, never
mentioned budget.

**Gates, final (all run from `plugins/tribe/scripts/runner/`):**
1. `bun test` → **143 pass / 0 fail** (362 `expect()` calls) — baseline 134; **+9** (+8 from the
   original submission, +1 from this fix's regression test).
2. `bunx tsc --noEmit` → clean.
3. `grep -n "claude-agent-sdk\|@anthropic" loop.ts` → empty (W2 holds).

## Item 2 (missing artifact) — this report

Confirmed: the original `5f5ffa4` commit message referenced `reports/orch-task-2.md`, but the
file was left untracked/uncommitted on disk (a deliberate but, per the Warchief's ruling,
incorrect choice — see the original "Ambiguities" item 1 above, now superseded). This report,
including this very section, is included in the amend the Warchief instructed
(`git commit --amend`), so the reference is no longer dangling.

## Fix-Hunter re-verification (independent session, before amending `5f5ffa4`)

Re-ran the whole W-F4 sequence from a clean dispatch, against the working tree as found (the
`attempted`/`worked` split above and its regression test were already present, uncommitted).
Reproduced RED first, exactly as the brief requires, by temporarily reverting only `loop.ts` to
`HEAD` (`git checkout -- loop.ts`) while keeping the new test, then restored the fix
(`git apply` of the saved diff) and reran:

```
$ git checkout -- loop.ts   # test-only, fix reverted
$ bun test loop.test.ts -t "Warchief audit fix"
(fail) ... > max-cards 1: A parks on a PRIOR-run escalation file ... B — the one card actually
  worked — still ships in the same pass
error: expect(received).toEqual(expected)
  Expected  - 8  (escalation_pending A AND shipped B)
  Received  + 1  (only escalation_pending A — B never attempted)
0 pass, 43 filtered out, 1 fail

$ git apply <fix-diff>   # restore attempted/worked split
$ bun test loop.test.ts -t "Warchief audit fix"
1 pass, 43 filtered out, 0 fail (2 expect() calls)
```

Also independently reran and confirmed:
- `bun test loop.test.ts -t "W-F2"` → 1 pass / 0 fail (5 expect() calls), no hang.
- `bun test state.test.ts -t "byte-identical"` → 1 pass / 0 fail (3 expect() calls) — v1
  round-trip untouched.
- Full suite: `bun test` → **143 pass / 0 fail** (362 `expect()` calls; up from the 142-pass
  count this report recorded right after Task 2's original submission).
- `bunx tsc --noEmit` → clean, exit 0.
- `grep -n "claude-agent-sdk\|@anthropic" loop.ts` → empty, grep exit 1 (W2 holds).

No `gh`/`git` command strings were added or changed by this fix (W5 does not apply). Committed
via `git commit --amend` into `5f5ffa4`, carrying this report (previously untracked) into the
same commit, per the Warchief's brief.
