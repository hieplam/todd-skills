# Task 3/6 report — `report.ts`: the report contract (spec §O5)

Hunter report to the Warchief. Branch: `feat/campaign-orchestration` (worked directly on it,
checked out at HEAD `f0789b2`, no worktree/new branch, per brief). Repo root:
`/Users/todd.lam/WORK/_TestScripts/todd-skills`. All commands run from
`plugins/tribe/scripts/runner/`.

A prior Hunter for this task died on a session limit before doing any work (`report.ts` did not
exist, nothing was half-done) — this is a clean build from that starting point.

## What changed, file by file

### `plugins/tribe/scripts/runner/report.ts` (new)

The whole report contract, as a pure module (no `node:fs`/`child_process` import — only
`node:path` and local `.ts` modules). Exports:

- **`shouldWriteReport({dryRun, exitCode})`** — the ONE decision for "does this exit path write a
  report at all". `dryRun` wins unconditionally (false regardless of exit code); `EXIT_LOCKED`
  (imported from `loop.ts`) is the other hard no. Everything else returns true. This exists as its
  own pure, unit-tested function specifically so this decision does NOT get buried inline in
  `run.ts`'s `main()` (brief design note 3) — it's provable by a table test instead of a code
  read.
- **`deriveExitReason({exitCode, hasMessage, threw})`** — maps a `runLoop` outcome (plus whether
  `main()` caught an unhandled exception) to the §O5 `run.reason` vocabulary I extended with
  `'error'` (not in the design doc's JSON example, but required by the plan's own "any error
  after the state was loadable" exit path — see the Ambiguities section). Also pure, also
  independently unit-tested, for the same "don't bury report-shaping logic in `main()`" reason.
- **`extractQuestionDigest(markdown)`** — best-effort one-line digest of an escalation file,
  parsing the exact shape `loop.ts`'s `buildEscalationMarkdown` produces (`**Reason:** <reason>`
  then a `## Context` section, takes its first line). Falls back to an honest
  `"(escalation file present but no recognizable question content)"` string rather than
  inventing a question — never throws.
- **`buildCampaignReport(state, run, config, io)`** — the core: walks `state.sequence` and
  derives one `CardReportEntry` per card **purely from the final `CampaignState`**, never from
  `loop.ts`'s `CardOutcome[]` (which this module never even imports/consumes). See "Warchief
  rulings" below for why, and why that's what makes "report written even when the state commit
  failed" true for free.
- **`renderReportMarkdown(report)`** — renders the exact same `CampaignReport` object the JSON
  twin serializes, so JSON<->md parity is structural (one input, two renderers), not two
  hand-maintained implementations that can drift.
- **`writeReport(state, run, dir, config, io)`** — the Task 3 entry point per the brief's literal
  signature: builds the one shared report, writes `campaign-report.json` and
  `campaign-report.md` into `dir` via the injected `io.writeFile`, returns the built report.

### `plugins/tribe/scripts/runner/report.test.ts` (new)

27 tests, all green:
- `deriveExitReason` — 5 tests, one per branch (`error` wins over everything; the 3
  `EXIT_*`-driven branches; the `EXIT_OK` + no-message `done` default).
- `shouldWriteReport` — 3 tests (`dryRun` always wins; `EXIT_LOCKED` alone; every other
  combination writes).
- `extractQuestionDigest` — 3 tests (reason+context happy path against loop.ts's real markdown
  shape; a multi-line `verify_failed_twice`-style context still yields one line; unrecognizable
  content's fallback).
- `buildCampaignReport` — 11 tests across shipped / escalated (fresh, absent
  `autoAnswerRounds` defaulting to 0, missing escalation file, unreadable escalation file, and
  the "prior-run pending escalation reports identically" case per ruling 4) / blocked (first
  unmet dependency chosen, an already-shipped dependency never named, graceful degradation when
  no unmet dependency is found) / not_reached (a plain staged card, and the `'running'`-stuck
  case — see Ambiguities) / one mixed-campaign test matching §O5's own worked JSON example shape
  almost exactly (`B3`/`B4`/`B8`/`A6`).
- `renderReportMarkdown` — 1 parity test asserting every JSON-observable value (card ids,
  outcomes, pr/mergeSha, escalationFile, question, autoAnswerRounds, blockedOn, stats, pending,
  run fields) appears as a substring of the rendered md, over a report covering all four outcome
  kinds at once.
- `writeReport` — 2 tests: both files written with JSON parsing back to the exact built report
  object; a 5-case matrix round-tripping `reason`/`exitCode` through the written JSON (this is
  the brief's "one report per exit-path in the matrix" test).
- One integration test (`writeReport — reflects persisted state even when the state-commit PR
  failed`) that runs the REAL `runLoop` (loop.ts, already unit-tested on its own terms) with a
  mocked `git push` failure forcing `commitStateAndMerge` to return `commit_failed`, then feeds
  the resulting on-disk state through `buildCampaignReport` and asserts the card still reports
  `shipped` with the correct pr/mergeSha. This is the brief's literal "report written even when
  the state commit failed" test, proven end-to-end rather than merely asserted from a
  hand-built fixture.

### `plugins/tribe/scripts/runner/run.ts` (wiring)

Added the single finally-style seam, kept genuinely thin per design note 3:

1. `runLoop(...)` is now wrapped in `try { result = await runLoop(...) } catch (err) { thrown =
   err }` — this is what makes "any error after the state was loadable" a real, reachable code
   path instead of an uncaught crash.
2. `exitCode` is computed once (`thrown ? EXIT_ERROR : result.exitCode`), where `EXIT_ERROR = 4`
   is a NEW constant local to `run.ts` (not `loop.ts`/`report.ts` — it's purely this file's own
   process-exit-code concern; the report's `reason: 'error'` field is the artifact that actually
   carries meaning, per §O3's "the exit code is a hint, the report is the truth").
3. `if (shouldWriteReport({dryRun, exitCode})) { await tryWriteReport(...) }` — the ONE call site
   in this file. `tryWriteReport` (new, thin) reloads state fresh from disk via `loadState`
   (`state.ts`) and calls `writeReport`, into `stateDirOf(config)` (reused from `loop.ts`, not
   reimplemented). A `loadState` failure here is swallowed deliberately — see the doc comment on
   `tryWriteReport` and the Ambiguities section.
4. Everything after that (the `thrown` re-throw-as-exit, the `--dry-run`/processed-cards console
   output, the final `process.exit`) is unchanged in shape from before, just reading `result`
   through the new `LoopResult | undefined` + `thrown` split instead of a bare awaited value.

`run.ts` itself is still NOT unit-tested (unchanged precedent, stated in its own file header) —
but I deliberately pulled BOTH of its report-related decisions (`shouldWriteReport`,
`deriveExitReason`) out into `report.ts` as pure functions specifically so the "which exit paths
write, which don't" contract IS provable by a table test, not just a code read. See "Which exit
paths write / don't" below for the reasoning on why that split is complete.

## How the finally-seam guarantees no exit path forgets the report

Every branch in `main()` funnels through exactly one call
(`if (shouldWriteReport(...)) { await tryWriteReport(...) }`) placed AFTER `runLoop` returns
*or throws*, and BEFORE any `process.exit` call. There is no early `return`/`process.exit` in
`main()` before that point except the argument-parse-error branch (which exits before `io` even
exists — see below for why that's correct, not a gap). Every other path — done, escalations
pending, STOP, session-incomplete, or the new caught-exception path — falls through the same
`if` before its own eventual `process.exit`, so there is no way to add a new outcome to
`runLoop`/`main()` in the future and silently skip the report without also having to delete this
one `if` (which is now a highly visible, single-purpose line, not scattered per-branch logic).

## Which exit paths write a report, and which deliberately do not

| Exit path | Writes report? | Why |
| --- | --- | --- |
| Argument parse error (`'error' in parsed`) | **No** | State was never loaded — `parseArgs` is pure, no I/O, and exits before `buildRealIo`/`runLoop` are even called. Nothing truthful to report (matches the brief's "any error after the state was loadable" framing — this error is BEFORE, not after). |
| `--dry-run` | **No** | `shouldWriteReport` returns false unconditionally when `dryRun` is true, regardless of `exitCode` or a thrown error. Its contract is zero side effects BY CONSTRUCTION (plan acceptance #1); a report file is a side effect. |
| `EXIT_LOCKED` | **No** | `shouldWriteReport` returns false for this exact code. Another live process owns the campaign; a report from the refused process would clobber the live one's in-progress report. |
| `EXIT_OK`, no message (ran to `done`) | **Yes** — `reason: 'done'` | |
| `EXIT_OK`, with message (startup STOP-file check) | **Yes** — `reason: 'stop_requested'` | The only other `LoopResult` shape carrying a `message` at `EXIT_OK` (see `deriveExitReason`'s doc comment for why `hasMessage` uniquely identifies this case). |
| `EXIT_ESCALATED` | **Yes** — `reason: 'escalations_pending'` | |
| `EXIT_SESSION_INCOMPLETE` | **Yes** — `reason: 'session_incomplete'` | |
| An unhandled exception thrown by `runLoop` (state WAS loaded at least once inside it) | **Yes** (best-effort) — `reason: 'error'`, exit code `EXIT_ERROR = 4` | `tryWriteReport` reloads whatever's currently on disk; if THAT reload itself fails (state never loadable at all, e.g. the exception happened before/during `runLoop`'s own initial `loadState`), the write is silently skipped — nothing truthful to report. |

## `blockedOn` derivation and the `question` digest

**`blockedOn`** (Warchief ruling 1): I chose to report the **first** unmet (non-`shipped`)
dependency in `card.dependsOn` order, as a single string — matching §O5's own JSON example
literally (`"blockedOn": "B4"`, not an array). Tested explicitly with a card carrying two unmet
dependencies (asserts the first, `A1`, not `B2`) and with a dependency that already shipped
(never named as the blocker). A defensive fallback
(`'(unknown — no unmet dependency found in state)'`) covers the case where a `blocked` card's
declared dependencies have all since shipped — not expected in practice, but `report.ts` degrades
rather than crashing or inventing an id.

**`question` digest** (Warchief ruling 4): read from the escalation file when cheap — I
implemented `extractQuestionDigest`, a regex-based parser matching `loop.ts`'s
`buildEscalationMarkdown` shape exactly (`**Reason:** <reason>` line, then the first line under
`## Context`), combined as `"<reason>: <first context line>"`, capped at 200 chars, whitespace
collapsed to guarantee a genuine single line even against a multi-line `verify_failed_twice`
bullet-list context. Three honest fallbacks, never an invented digest: file missing on disk,
file present but unreadable (wraps the underlying error message), and content present but not
matching the expected shape at all.

## Test count and gates

- **Baseline** (confirmed before any change, from `plugins/tribe/scripts/runner/`): `bun test` →
  **143 pass / 0 fail** (362 `expect()` calls); `bunx tsc --noEmit` → clean.
- **RED**: `bun test report.test.ts` against a repo with the test file but no `report.ts`:
  ```
  error: Cannot find module './report.ts' from '.../report.test.ts'
  0 pass, 1 fail, 1 error
  ```
  Failed for the right reason (module missing, not a typo/bad-import-path issue).
- **GREEN**: after writing `report.ts`, `bun test report.test.ts` → **27 pass / 0 fail**
  (74 `expect()` calls).
- **Full suite after `report.ts` alone**: `bun test` → **170 pass / 0 fail** (436 `expect()`
  calls) — exactly baseline (143) + 27.
- **After wiring `run.ts`**: `bun test` → **170 pass / 0 fail** (436 `expect()` calls, unchanged
  — `run.ts` is not unit-tested, so this wiring change adds no new test count, matching the
  file's own established precedent). `bunx tsc --noEmit` → clean, no output.
- `grep -n "claude-agent-sdk\|@anthropic" report.ts loop.ts run.ts` → empty (grep exit 1) — W2
  holds; no SDK/model import entered any of these three files.
- `grep -n "^import" report.ts` → only `node:path` and local `./loop.ts`/`./types.ts` — no
  `node:fs`/`child_process` (mirrors `state.ts`'s/`loop.ts`'s own purity).

**Final count: 170 pass / 0 fail, 436 `expect()` calls — baseline 143, +27 (all in
`report.test.ts`), which is MORE than 143 as required.**

## Ambiguities / gaps found while building this — flagging per the brief's instruction, not papering over them

1. **A real staleness gap in Task 1/2's `blocked` reconciliation, discovered while implementing
   ruling 1 ("`blocked` is derived — read it, don't recompute it").** I traced `runLoop`'s loop
   precisely (see `nextCard`'s `reconcileBlockedStatuses` call and `runLoop`'s while-loop in
   `loop.ts`) and found: the reconciliation that marks a card `blocked` happens INSIDE `nextCard`,
   called at the top of every loop tick — but the mutation is only ever PERSISTED to disk as a
   side effect of the NEXT card actually being processed (`shipCard`/`escalateCard`'s
   `persistLocalState` writes the whole `state` object, including whatever reconciliation just
   happened). If the tick that reconciles a card to `blocked` is the SAME tick that discovers
   `nextCard` now returns `done` (no further progressable card, so the loop `break`s with no more
   processing), that reconciliation is **never written to disk** — the persisted state still
   shows the newly-blocked card as `staged`. Concretely: sequence `['A', 'B']`, `A` independent,
   `B` `dependsOn: ['A']`; `A` escalates (persisted); next tick reconciles `B` to `blocked`
   in-memory, finds nothing left to process, returns `done` — the file on disk still says `B:
   staged`. The existing Task 2 "blocked cascade (W6)" test does NOT catch this because it always
   has a third independent card (`C`) that ships AFTER the blocking, which flushes the whole
   object (including `B`'s already-reconciled status) to disk as a side effect of `C`'s own
   persist. I did **not** touch `loop.ts`/`state.ts` to fix this (out of this task's scope, and
   the ruling explicitly told me not to re-derive the graph in `report.ts` either) — I'm
   flagging it as a genuine, reproducible gap for the Warchief to rule on (most likely fix: one
   more `persistLocalState` call right before `runLoop` returns, or right where `nc.kind ===
   'done'` is first discovered). Until fixed, a report generated by `run.ts`'s real wiring COULD
   show `not_reached` for a card that is actually `blocked`, in this specific "last-tick-only"
   shape. I did not write a report.test.ts regression test asserting this incorrect behavior
   (that would mean baking a known bug into the suite as "expected"); I'm relying on this written
   account plus the precise repro above.
2. **`report.reason: 'error'` is a value I added; it is not in §O5's JSON example.** The plan's
   own text says the report is written "even argument errors where the state was loadable" (an
   oddly-worded sentence — see item 3) and the plan.md task text says "any error after the state
   was loadable" is one of the exit paths a report must cover. Neither the design doc's own JSON
   example nor its enum-like prose (`shipped | escalated | blocked | not_reached` — that's the
   per-CARD outcome, not the run-level `reason`) actually names what `run.reason` should say for
   this case. I chose `'error'` as the obvious, minimal addition. Flagging as a choice, not a
   given.
3. **The brief itself quotes two slightly different phrasings for the same exit path** — the
   design doc (§O5) says "even argument errors where the state was loadable", the plan.md Task 3
   text says "any error after the state was loadable". Argument errors, as implemented, happen
   BEFORE any I/O (`parseArgs` is pure) — so "argument error where the state was loadable" is, as
   far as I can tell, not a reachable case at all (an argument error, by construction, happens
   before `--state` is ever read). I followed the plan.md phrasing (the one the brief itself
   pointed me to as canonical: "The plan's phrase ... is your test") and treated this as: no
   report for argument-parse errors (state never loaded), report for any OTHER exception that
   surfaces after `runLoop` was entered. If the design doc's wording was intentional and there's
   a scenario I'm not seeing where an argument error occurs AFTER state is loadable, that would
   be a genuine spec contradiction I'd need pointed out.
4. **`§O5`'s four-outcome vocabulary (`shipped | escalated | blocked | not_reached`) has no slot
   for `loop.ts`'s `CardOutcome.stopped` kind** (a session errors/times out mid-flight with no
   further D4 fallback; `card.status` is left at `'running'`, never reset). I folded this into
   `not_reached` (same bucket as a budget-skipped card) on the reasoning that both need zero
   owner action — the next run resumes a `'running'`/`'stopped'` card automatically, exactly like
   a `not_reached` one. This is documented inline in `report.ts` and tested explicitly
   (`buildCampaignReport — not_reached` describe block, second test). Flagging this as the one
   genuine "the frozen vocabulary doesn't name this case" gap I found — happy to add a 5th
   outcome value if the Warchief judges collapsing it is wrong, but that would be changing the
   frozen §O5 JSON contract, which felt like exactly the kind of thing I should NOT do
   unilaterally.
5. **A mid-pass STOP (the owner drops the `STOP` file while cards are still being processed) is
   NOT distinguishable from a plain `done` exit, given only `LoopResult`.** Only the STARTUP
   STOP-check (before the loop even starts) sets `message` in `LoopResult`; the mid-pass `break`
   inside `runLoop`'s while-loop returns the same shape a natural `done` completion would
   (`{exitCode: computeExitCode(processed), processed}`, no `message`). So `deriveExitReason`
   cannot tell these apart, and a mid-pass-STOP run gets `reason: 'done'` (or `'escalations_
   pending'`/`'session_incomplete'` if that's what `processed` implies) even though the owner
   did intervene. The report's PER-CARD breakdown still correctly shows the un-processed
   remainder as `not_reached`, so the fact that something didn't finish is visible — just not
   labeled as "the owner asked for this". I did not change `loop.ts` to add a distinguishing
   signal (out of scope for this task); flagging as an assumption to challenge.

## Assumptions a reviewer should specifically challenge

- **Item 1 above (the un-persisted last-tick reconciliation)** — the single most important thing
  to verify independently; I traced it by hand, did not add a failing regression test for it
  (deliberately — see the reasoning above), and it affects the CORRECTNESS of every future
  consumer of `card.status === 'blocked'`, not just this report.
- **Folding `CardOutcome.stopped`/`status: 'running'` into `not_reached`** (item 4) — a
  reasonable reading of "needs no owner action", but it is genuinely a 5th case the frozen
  vocabulary doesn't name.
- **`blockedOn` picks the FIRST unmet dependency, not all of them** — matches the JSON example's
  single-string shape; if a future consumer (the Task 4 skill) actually wants every blocker, this
  would need to become an array, which IS a JSON-shape change.
- **`reason: 'error'` and `EXIT_ERROR = 4`** are both additions with no explicit prior art in the
  frozen spec — see items 2/3.
- **Mid-pass STOP is not separately signaled** (item 5) — accepted as a `loop.ts`-side gap, not
  fixed here.
- **The escalation-file digest parser (`extractQuestionDigest`) is a small bespoke regex parser,
  not a Markdown library** — matches this codebase's existing precedent
  (`verify.ts`'s `readAllowsSchemaChange` is exactly this style: a minimal, purpose-built parser
  for one known shape, not a general-purpose parser) — but it is coupled to
  `loop.ts`'s exact `buildEscalationMarkdown` output shape; if that function's format ever
  changes, this digest silently degrades to its fallback string rather than erroring loudly.

No product/What-Why decision surfaced. Everything above is either a documented design choice
within the brief's stated discretion (rulings 1/4 explicitly left room), or a discovered gap in
already-landed code that I flagged rather than silently working around or unilaterally fixing
outside this task's scope.
