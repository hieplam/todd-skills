# Campaign runner

A **stateless capability** of the `tribe` plugin: a deterministic script that drives a
roadmap campaign's outer loop — pick the next progressable card, run one fresh executor session,
script-verify it shipped, record state, repeat — so the loop itself burns **zero LLM
tokens** (only the sessions it spawns do). See
[`docs/superpowers/specs/2026-07-16-campaign-runner-design.md`](../../../../docs/superpowers/specs/2026-07-16-campaign-runner-design.md)
for the base design, and
[`docs/superpowers/specs/2026-07-16-campaign-orchestration-design.md`](../../../../docs/superpowers/specs/2026-07-16-campaign-orchestration-design.md)
for the amendments this file also documents (D5′ park-and-continue, the `dependsOn`/`blocked`
schema additions, and the report contract). This file documents what the code in this directory
**actually does** — verified against the code, not asserted from memory.

"Stateless capability" means: this script hardcodes no repo, path, model, or campaign value.
Every environment-specific value — the target repo, where its state file lives, which model
tier to use, where answers/escalations live — arrives as a CLI input. The campaign
**instance** data (the state JSON, specs, plans, `answers.md`, escalation files) lives in the
**target repo**, never in this plugin. That's the split: the loop belongs to the tribe, the
memory belongs to the project.

## Inputs

All paths below that are relative are relative to `--repo` unless noted otherwise.

| Flag | Required | Meaning |
| --- | --- | --- |
| `--repo` | yes | Target repo root — `cwd` for every `gh`/`git` call and the executor session. |
| `--state` | yes | Campaign state JSON path, relative to `--repo`. **Schema documented below.** |
| `--model` | yes | Executor model tier passed to each spawned session. |
| `--answers` | yes | Path (relative to `--repo`) to the committed rulings file embedded in every executor brief. |
| `--escalations-dir` | yes | Path (relative to `--repo`) where escalation files are written. |
| `--logs-dir` | no | Session log destination. Default: `logs/` next to the state file (i.e. the state file's own directory + `logs`). |
| `--session-timeout` | no | Wall-clock abort per executor session. Accepts `<n>ms`, `<n>s`, `<n>m`, `<n>h`, or a plain millisecond integer (e.g. `3h`, `30m`, `90s`, `5000ms`, `5000`). Default: `3h`. |
| `--dry-run` | no | Derive and print the next action with **zero side effects** — no lock, no writes, no session, no report file (see the report contract below). |
| `--cards` | no | Comma-separated list of card ids — restricts the loop to only these ids, in the state's own `sequence` order. Default: the full sequence. |
| `--max-cards` | no | Positive integer — stop after WORKING this many cards in this run (a card actually `shipped`/`escalated`/`stopped` this pass — see D5′ below; a card merely parked on a prior run's escalation, or skipped as `blocked`, does not consume this budget). Default: unbounded (run until `done` or the budget is spent — an escalation no longer stops the run, see D5′). |
| `--include-escalated` | no | Bypass the escalation-file short-circuit for a card the human has already ruled on, and let `nextCard`/`deriveCardPhase` reconsider it. This is exactly the flag the Stage C round-trip re-triggers with (spec §O6). |

`--repo`, `--state`, `--model`, `--answers`, and `--escalations-dir` have **no default** —
this is deliberate (the stateless-capability wall): omitting any of them is a usage error,
not a value worth guessing.

## State file schema

The `--state` file is the one artifact the runner requires but never creates — it must be
authored before the runner is ever invoked (normally by a Shaman-authority session doing Stage A
planning; see `plugins/tribe/agents/shaman.md`'s Mode 2). This section documents the schema
completely enough to author a valid file from this README alone, derived from the authoritative
source: the zod schema in `state.ts`'s `CampaignStateSchema`/`CardSchema` and the TypeScript
types in `types.ts`. Schema version stays `"v": 1` — every field this effort added is optional,
so a pre-existing v1 file with none of them round-trips through a load→save cycle
byte-identical.

### Top-level fields

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `v` | `number` (int) | yes | Must equal `1` (`CURRENT_STATE_VERSION`). Any other value — including a missing `v` — is rejected before structural validation even runs (see Validation errors below). |
| `campaign` | `string` | yes | Free-form campaign name/id. Echoed verbatim as `campaign` in the report contract. |
| `mergePolicy` | `string` | yes | Free-form; carried through into every executor brief, not itself interpreted by this runner. |
| `sequence` | `string[]` | yes | Card ids, in build order. Every id **must** have a matching entry under `cards` — a dangling id is rejected at load (`UndefinedSequenceCardError`). |
| `schemaLockPaths` | `string[]` | yes (`[]` is valid) | Paths whose diff from a card's `baseSha` must stay empty unless that card's plan front-matter declares `allowsSchemaChange: true` (D3 point 6). Campaign config, never hardcoded (W1). |
| `docsOnlyPaths` | `string[]` | yes (`[]` is valid) | Path prefixes that count as "docs-only" for the D6 flake waiver. **Fails CLOSED: an empty list means nothing counts as docs-only, so a code diff never auto-waives a red check.** Campaign config, never hardcoded (W1). |
| `ownerOnlyEscalations` | `string[]` | yes (`[]` is valid) | Trigger names that always escalate to the human owner, regardless of what an executor session claims (D5). Campaign config, never hardcoded (W1). |
| `cards` | `Record<string, Card>` | yes | Every card in the campaign, keyed by its id. |

`schemaLockPaths`/`docsOnlyPaths`/`ownerOnlyEscalations` are worth calling out together: all
three are safety config that a Stage-A author must set deliberately, carried **in** the state
file rather than baked into this capability — an author who leaves `docsOnlyPaths` empty gets
the safe (fails-closed) default, not a silent free pass for code diffs.

### Per-card fields (`cards.<cardId>`)

| Field | Type | Required | Meaning |
| --- | --- | --- | --- |
| `status` | `"staged" \| "running" \| "shipped" \| "escalated" \| "blocked"` | yes | Author every card `staged`. `running`/`shipped`/`escalated` are written by the loop as it works the card. `blocked` is **derived** (see `dependsOn`/`blocked` below) — do not hand-author a card as `blocked`; the next `nextCard` call reconciles it back to `staged` if it has no unmet dependency. |
| `spec` | `string \| null` | yes (nullable) | Path (relative to `--repo`) to the card's spec file. Missing on disk (or `null`) when the card is next up triggers `PLANNING_NEEDED`, which the loop escalates. |
| `plan` | `string \| null` | yes (nullable) | Same, for the plan file. |
| `branch` | `string \| null` | yes (nullable) | The card's git branch, once work starts. `null` at authoring time — this is exactly what makes the D4 resume matrix classify a freshly-authored card `fresh`. |
| `baseSha` | `string \| null` | yes (nullable) | The commit the card's branch is built from; D3's schema-lock diff is taken from this. `null` at authoring time. |
| `pr` | `number \| null` | yes (nullable) | The card's PR number, once opened. `null` at authoring time. |
| `mergeSha` | `string \| null` | yes (nullable) | The merge commit sha, once shipped. `null` until shipped. |
| `sessionId` | `string \| null` | yes (nullable) | The SDK-assigned executor session id, written the instant a session starts (crash-safe write, before anything else). `null` at authoring time. |
| `updatedAt` | `string \| null` | yes (nullable) | ISO timestamp of the card's last loop-written change. `null` at authoring time. |
| `dependsOn` | `string[]` | **optional** | Card ids (each must resolve under `cards`) this card must not start before. Omit entirely for an independent card (the common case) — do not author `[]` as a substitute for omitting it. A dangling id is rejected at load (`UndefinedDependencyCardError`); a cycle — direct (`A -> A`) or indirect (`A -> B -> A`) — is also rejected at load (`CircularDependencyError`). See "`dependsOn` / `blocked`" below for runtime behavior. |
| `autoAnswerRounds` | `number` | **optional** | How many Stage-C auto-answer round-trips this card has been through (wall W7 caps this at 2 — see the runner README's escalation section and `shaman.md`'s Stage C protocol). Omit at authoring time. |

**Why `dependsOn`/`autoAnswerRounds` are optional with no schema-injected default:** a
schema-level default (e.g. `.default(0)`) would appear in a re-serialized file even when the
source JSON never had the key, breaking the v1 byte-identical round-trip contract. Omitting them
at authoring time is correct; callers read the conceptual default themselves
(`card.autoAnswerRounds ?? 0`; "no `dependsOn`" simply means independent).

### Worked example (a Shaman could author this from this section alone)

```json
{
  "v": 1,
  "campaign": "widget-export",
  "mergePolicy": "regular-merge-only",
  "sequence": ["A1", "A2", "A3"],
  "schemaLockPaths": ["src/schema/"],
  "docsOnlyPaths": ["docs/"],
  "ownerOnlyEscalations": ["data-shape-change"],
  "cards": {
    "A1": {
      "status": "staged",
      "spec": "docs/cards/A1-spec.md",
      "plan": "docs/cards/A1-plan.md",
      "branch": null,
      "baseSha": null,
      "pr": null,
      "mergeSha": null,
      "sessionId": null,
      "updatedAt": null
    },
    "A2": {
      "status": "staged",
      "spec": "docs/cards/A2-spec.md",
      "plan": "docs/cards/A2-plan.md",
      "branch": null,
      "baseSha": null,
      "pr": null,
      "mergeSha": null,
      "sessionId": null,
      "updatedAt": null,
      "dependsOn": ["A1"]
    },
    "A3": {
      "status": "staged",
      "spec": "docs/cards/A3-spec.md",
      "plan": "docs/cards/A3-plan.md",
      "branch": null,
      "baseSha": null,
      "pr": null,
      "mergeSha": null,
      "sessionId": null,
      "updatedAt": null
    }
  }
}
```

`A2` will not start until `A1` ships; `A3` is independent and can ship in any order relative to
the other two.

### Validation errors (thrown by `parseState`/`loadState`, `state.ts`, at load time)

Checked in this order, on every load — a malformed file is refused loudly before the loop ever
runs, never discovered card-by-card mid-campaign:

| Error | Thrown when |
| --- | --- |
| `UnsupportedStateVersionError` | `v` is not exactly `1` (including a missing `v`). |
| `UndefinedSequenceCardError` | `sequence` names a card id with no matching entry under `cards` (e.g. a typo). |
| `UndefinedDependencyCardError` | A card's `dependsOn` names an id with no matching entry under `cards`. |
| `CircularDependencyError` | The `dependsOn` graph contains a cycle — a direct self-dependency (`A -> A`) or an indirect one (`A -> B -> A`). The error carries the full cycle path. |

## How this is normally triggered

The runner is **not meant to be invoked by hand as the normal path.** It is triggered by the
`orchestrate-campaign` tribe skill (installed with `plugins/tribe`; trigger phrases:
"orchestration: do these N ideas", "orchestrate these ideas", "run these N cards"), which
authors the state file per the schema above, runs `--dry-run` first as a sanity check, then
triggers a real run in the background, and round-trips any escalations through Stage C (spec
§O1/§O3/§O6). That skill depends on this capability's **contract only** — the flags, exit
codes, and report file documented in this README — never on this directory's source; if you are
extending the skill or writing something else that drives this campaign runner, do the same.

**Manual invocation remains for debugging** — a scoped run under supervision, or a sanity check
while diagnosing one card:

```sh
bun plugins/tribe/scripts/runner/run.ts \
  --repo <target-repo> \
  --state <path-to-campaign-state.json> \
  --model <model> \
  --answers <path-to-answers.md> \
  --escalations-dir <path-to-escalations-dir> \
  --dry-run
```

`--dry-run` derives the next card and its resume phase from live `gh`/`git` state and prints the
plan as JSON, without acquiring the lock, writing anything (no state, no report — see the report
contract below), or spawning a session. Then, to run for real, optionally scoped to one card:

```sh
bun plugins/tribe/scripts/runner/run.ts \
  --repo <target-repo> \
  --state <path-to-campaign-state.json> \
  --model <model> \
  --answers <path-to-answers.md> \
  --escalations-dir <path-to-escalations-dir> \
  --cards <card-id> --max-cards 1
```

## Resume semantics (spec §D4)

**The file is data, `gh`/`git` are authority.** On every start, before acting on a card, the
runner re-derives that card's true phase from live GitHub/git state — it never trusts the
state file's own `status` field. The resume matrix, exactly as implemented in
`deriveCardPhase` (`loop.ts`):

| Observed reality | Phase | Action |
| --- | --- | --- |
| Escalation file exists for the card (unless `--include-escalated`) | `escalation_pending` | **Park** — nothing new is attempted or written for this card this pass; the loop records it and moves straight to the next progressable card. The run only exits once no progressable card remains (D5′, below) — this is **not** an immediate abort (`loop.ts:957-965`). |
| No `branch` recorded for the card | `fresh` | Spawn a fresh session (no digest — genuinely no trace). |
| PR found for the branch, `state == "MERGED"` | `verify_only` | Run the D3 verify checks and record — no session spawned. |
| PR found for the branch, `state == "OPEN"`, a `sessionId` is recorded | `resume` (`pr_open`) | Attempt `resume: sessionId` with a "check CI, complete the merge" prompt. |
| PR found for the branch, `state == "OPEN"`, no `sessionId` recorded | `fresh` (carries a digest) | **F8 fix, verified against `loop.ts:170-184`:** spawn fresh, but carrying a state digest that names the open PR and instructs the session to inspect and continue it rather than open a second one. This is explicitly **NOT** "same as no trace" — the in-code comment at `loop.ts:170-174` rebuts that reading directly. |
| No PR, but the branch/worktree still exists, a `sessionId` is recorded | `resume` (`branch_no_pr`) | Attempt `resume: sessionId` with a "continue implementing" prompt. |
| No PR, branch/worktree exists, no `sessionId` recorded | `revert_and_redo` | Delete the worktree + local/remote branch, then spawn fresh. |
| No PR, no branch, no worktree | `fresh` | Spawn a fresh session (no digest — genuinely no trace). |

> **Correction (this doc previously got the fifth row wrong):** an earlier revision of this
> table described "PR found, OPEN, no `sessionId`" as `fresh — nothing to resume — spawn fresh
> (same as "no trace")`. That was the **pre-F8** behavior. F8 was fixed in `cee591d` (merged
> `2c17c26`): the code has spawned fresh-with-digest ever since, precisely so a session never
> silently opens a second PR for a card that already has one open. The row above reflects what
> `loop.ts` actually does today, verified by reading `deriveCardPhase` directly.

A `fresh` phase can carry a state digest (last known status/branch/PR/`baseSha`) in **two**
distinct situations — never blindly:

1. **F8** (the corrected row above): an OPEN PR was found for the branch but no `sessionId` was
   ever recorded — there IS a trace (the PR itself), so a blind fresh session would rebuild the
   card and open a duplicate PR.
2. A `resume` attempt itself surfaced a typed `error` outcome (no transcript, an SDK error —
   never on `timeout`, since the prior session may still be running); the loop falls back to a
   **fresh** session carrying the digest (`loop.ts`'s `runCardSession`).

A `fresh` phase with no digest (the two rows above with no PR/branch/worktree trace at all) means
there really is nothing to report — a blind fresh session is correct there. There is no
session-listing API in the SDK, so resumability is only ever probed by attempting the resume —
never by listing.

## `dependsOn` / `blocked` (spec §O4)

A card may declare `dependsOn: ["<card-id>", ...]` — ids of cards it must not start before (all
must resolve under `cards`; a dangling id or a cycle is rejected at load, see Validation errors
above). A card with no `dependsOn` (or an empty one) is independent — exactly the behavior before
this field existed.

- **Progressable** (`nextCard`, `state.ts`) means: not `shipped`; not `escalated` (unless
  `--include-escalated`); not `blocked`; and every id in its `dependsOn` is currently `shipped`.
  A card whose dependency is merely unshipped-but-healthy (`staged`/`running`) is skipped for now
  — its own status is left untouched, and it may still ship later in the same pass once that
  dependency ships.
- **`blocked`** (a new card status) means: the card is not itself `shipped`/`escalated`, but it
  (transitively) depends on a card that is `escalated` or itself `blocked` this same way — wall
  W6, dependency safety: a card never starts while a dependency it declared is parked.
- **`blocked` is DERIVED, never authored and never trusted from disk.** Every `nextCard` call
  recomputes the full `blocked` set from scratch (a fixpoint over every card in `state.cards`,
  not just `sequence`/`--cards`-filtered ones) and reconciles every card's stored status against
  it before the selection walk even starts: a card that should be blocked but isn't yet is set to
  `blocked`; a card that stores a stale `blocked` but no longer has an unmet dependency is reset
  to `staged`. A card's parking status is therefore always current, even for a card the
  selection walk itself never reaches this pass.

## Escalation / answers workflow (spec §D5) and D5′ park-and-continue (spec §O4)

The runner escalates instead of deciding whenever: the executor reports
`NEEDS_DIRECTION`, the D3 verify checks fail **twice** in a row for a card, or the next
progressable card's spec/plan files are missing on disk (`PLANNING_NEEDED`). On escalation, the
runner:

1. Writes `<escalations-dir>/<card-id>.md` (question, context, options) — written **first,
   unconditionally**, before anything else.
2. Marks the card `escalated` in the local state.
3. Best-effort commits the state + escalation file via its own docs PR (the same commit path
   used for a shipped card) — but the escalation stands even if that commit fails, since a
   broken CI check is a common escalation *cause*. A failed commit is retried automatically
   at the start of the next run.
4. **D5′ (this effort's amendment — replaces the original D5 "exit"):** the loop does **not**
   exit here. It moves on to the next progressable card in the same pass (`loop.ts`'s `runLoop`,
   the `while` loop that turned a `break` into a `continue`). The run exits only once **no
   progressable card remains** — every remaining card is `shipped`, `escalated`, or `blocked` —
   or the `--max-cards` budget is spent. Exit code `2` (`EXIT_ESCALATED`) therefore now means
   "the pass finished; **≥1 escalation is pending**", **not** "aborted at the first question" —
   other cards in the same pass may well have shipped normally. `EXIT_SESSION_INCOMPLETE` (3)
   is the same shape: a card whose session ended `error`/`timeout` with no further D4 fallback is
   recorded and the pass continues past it too.

Within one pass, a card is never selected twice (`loop.ts`'s `attempted` set) — this is what
makes `--include-escalated` (the exact flag Stage C's round-trip re-triggers with) terminate
instead of re-escalating the same card forever.

To resolve an escalation: a human (or, per spec §O6, a Shaman-authority orchestrator session)
appends a ruling to the committed `--answers` file (every executor brief embeds its full
content), then re-runs the script. A card whose escalation file is still present is skipped
(`escalation_pending`, parked — see the resume matrix above) unless the re-run passes
`--include-escalated`.

## Report contract (spec §O5)

On **every** exit path except `--dry-run` (zero side effects, by construction — nothing is
written) and `EXIT_LOCKED` (a refused process must never clobber the live process's in-progress
report), the runner writes `campaign-report.json` and its human-readable twin
`campaign-report.md` into the state file's own directory. This is the **one artifact** a caller
needs to read after an invocation — per spec §O3, **the exit code is a hint; the report is the
truth.**

```json
{
  "v": 1,
  "campaign": "widget-export",
  "run": { "startedAt": "…", "endedAt": "…", "exitCode": 2, "reason": "escalations_pending" },
  "cards": {
    "A1": { "outcome": "shipped", "pr": 41, "mergeSha": "…" },
    "A2": { "outcome": "escalated", "escalationFile": "escalations/A2.md",
             "question": "one-line digest", "autoAnswerRounds": 1 },
    "A3": { "outcome": "blocked", "blockedOn": "A2" }
  },
  "pending": ["A2"],
  "stats": { "shipped": 1, "escalated": 1, "blocked": 1, "notReached": 0 }
}
```

- **`run.reason`** — one of `done` | `stop_requested` | `escalations_pending` |
  `session_incomplete` | `error` (`report.ts`'s `deriveExitReason`). `error` covers an unhandled
  exception thrown after `runLoop` was entered (`run.ts`'s own `EXIT_ERROR = 4` — see Exit codes
  below; not one of `loop.ts`'s `EXIT_*` constants).
- **Per-card `outcome`** is one of `shipped | escalated | blocked | not_reached`, read entirely
  from the final `CampaignState` on disk (never from `loop.ts`'s own `CardOutcome[]`) — which is
  what makes "report written even when the state commit failed" true for free: the local state
  is persisted before the GitHub commit is even attempted.
  - `shipped` carries `pr`/`mergeSha`.
  - `escalated` carries `escalationFile`, a best-effort one-line `question` digest parsed from
    that file, and `autoAnswerRounds` (defaults to `0` if absent).
  - `blocked` carries `blockedOn` — the **first** unmet dependency in the card's own `dependsOn`
    order (a single string, matching this JSON shape, not an array).
  - `not_reached` covers both a card the pass never got to, and a card left `running` by a
    session that stopped mid-flight without concluding (the frozen four-value vocabulary has no
    separate slot for that case; it needs no distinct owner action either way, so it folds in).
- **`pending`** lists every `escalated` card id — the ones that need an answer. A `blocked` card
  is not itself in `pending` (its `blockedOn` names the card that is).
- The `.md` twin is rendered from the exact same report structure the JSON twin serializes
  (`renderReportMarkdown`) — JSON↔md parity is structural, not a maintained-by-hand promise.

**Which exit paths write a report — the complete list:**

| Exit path | Writes report? |
| --- | --- |
| CLI argument error (missing/invalid flag) | **No** — state was never loadable; `run.ts` exits before the report logic is even reached. |
| `--dry-run` | **No**, unconditionally, regardless of exit code. |
| `EXIT_LOCKED` (`.runner.lock` held by a live process) | **No** — would clobber the live process's report. |
| `EXIT_OK` (`done`, or startup `STOP`) | Yes — `reason: 'done'` or `'stop_requested'`. |
| `EXIT_ESCALATED` | Yes — `reason: 'escalations_pending'`. |
| `EXIT_SESSION_INCOMPLETE` | Yes — `reason: 'session_incomplete'`. |
| An unhandled exception after `runLoop` was entered | Yes (best-effort) — `reason: 'error'`, exit code `4`. |

## STOP file and the lock file (spec §D2)

Both live next to the state file (i.e. in the state file's own directory):

- **`STOP`** — the owner's soft-stop. If present when a run starts, the runner exits cleanly
  (code `0`) before touching any card. If it appears mid-run, the loop finishes the
  in-flight card and stops before starting the next one. Delete it to resume.
- **`.runner.lock`** — single-instance guard (`{ pid, startedAt }`). A run refuses to start
  (exit code `1`) if a **live** process already holds the lock — two concurrent loops would
  double-spawn sessions and PRs. A lock left behind by a process that is no longer running
  (a crash, `kill -9`) is reclaimed automatically on the next start — liveness is checked via
  an OS-level probe (`process.kill(pid, 0)`), not a time-based guess.

`--dry-run` touches neither file, and writes no report either: it never acquires the lock and
never checks `STOP` — zero side effects by construction, not merely by intent.

## Exit codes

Read from `EXIT_*` in `loop.ts`, plus `run.ts`'s own `EXIT_ERROR`:

| Code | Constant | Meaning |
| --- | --- | --- |
| `0` | `EXIT_OK` | Ran to `done` (every progressable card `shipped`/`blocked`/`escalated`), or `--dry-run` completed, or the `STOP` file was present at startup. |
| `1` | `EXIT_LOCKED` | `.runner.lock` is held by a live process. Also returned for a CLI argument error (missing/invalid flag) before the loop even starts. |
| `2` | `EXIT_ESCALATED` | D5′: the pass finished and **at least one card is `escalated`** — a fresh escalation this pass, or one still parked, unanswered, from a prior run. Not "aborted at the first question"; other cards in the same pass may have shipped. Read `campaign-report.json`'s `pending` for which card(s) need an answer. |
| `3` | `EXIT_SESSION_INCOMPLETE` | D5′: at least one card's session ended `error`/`timeout` with no further D4 fallback (no card in this pass escalated); state was already recorded locally, so the next start resumes it — this is not a human-decision escalation. |
| `4` | `EXIT_ERROR` (`run.ts`, not a `loop.ts` constant) | An unhandled exception surfaced after `runLoop` was entered. The report's `run.reason` is `'error'` — per §O3, treat the report as authoritative over this numeric code. |

## Known limitations

- **`verifyWithRetry` retries with zero delay.** The D3 verify-shipped check is attempted
  twice back-to-back with no sleep between attempts (`loop.ts`). This catches a transient
  `gh`/network blip on the *second* call, but it will **not** catch a check that is still
  settling (e.g. CI still running) — the two attempts happen too close together for that.
  This is separate from `github.ts`'s own D6 check-polling loop, which does sleep between
  attempts (`D6_RETRY_SPACING_MS`).
- **`baseBranch` derivation has a silent fallback.** `resolveBaseBranch` runs
  `git symbolic-ref --short refs/remotes/origin/HEAD` and falls back to the literal string
  `"master"` if that command fails for any reason (not just "unset"). A target repo whose
  default branch is `main`, hit by a transient `git` failure on this one call, would silently
  target `master` instead and fail loudly later at `git fetch`/push — there is no
  distinguishing "origin/HEAD really is unset" from "the query itself broke".
- **`github.ts`'s D6 sonar waiver assumes its diff is docs-only by construction, not by
  inspection.** The waiver that lets a red PR merge despite a single advisory
  SonarCloud-504 check never inspects the PR's actual file diff — it relies entirely on the
  fact that this module's only call site (`loop.ts`'s `commitState`) is restricted at the
  type/runtime level to `.json`/`.md` paths. If that restriction were ever bypassed, the
  waiver would apply to a non-docs diff too.
- **Mocked tests validate logic, not invocations.** All 172 tests (baseline 116 before this
  effort, +56 across `dependsOn`/`blocked`, D5′, and the report contract) mock every seam
  (`exec`, `spawnSession`, the filesystem, the clock, the lock). They prove the loop's *logic*
  against those mocks — not that a real `gh`/`git`/SDK call behaves as assumed. This gap is not
  theoretical: `gh api pulls/<pr>` 404'd against a real PR while the 25 tests covering that
  exact path passed unchanged, and a live `--dry-run` later caught an open-PR resume that
  would have opened a duplicate PR. **Any changed `gh`/`git` command must be executed against
  a real repo before it is trusted.**
- **What HAS been verified live** (smoke run, 2026-07-16, campaign-runner effort): `--dry-run`
  phase derivation against real merged/open PRs; the D3 six-point replay against a real merged PR
  (all six pass, including a real 2-parent merge commit) and its correct rejection of an open PR;
  a real Agent-SDK session spawn under the pinned §D1 options, with the SDK-assigned `session_id`
  captured from the `system/init` message; `settingSources: ['project']` genuinely loading the
  target repo's CLAUDE.md; a real `resume` recalling prior session context; a bogus resume id
  surfacing as a typed `error` (so the fresh-fallback path is reachable); and per-session log
  files.
- **What HAS additionally been verified live for this effort's D5′/report-contract changes**
  (campaign-orchestration effort, 2026-07-16, same real-CLI discipline as above, scoped to what
  changed here — not a re-verification of the base runner's surface listed above): `--dry-run`
  writes neither the state file nor a report (byte-identical state on disk, no
  `campaign-report.*` written); the report contract end-to-end on real exit paths (a `STOP`-file
  run, and a real escalation run); and a real 2-card blocked cascade (`A` escalates, `B`
  declares `dependsOn: ["A"]`) producing `### B — blocked` / `- Blocked on: A` in
  `campaign-report.md`, with `pending: ["A"]` and `Stats: 0 shipped, 1 escalated, 1 blocked, 0
  not reached`, exit code `2`.
- **What is still UNVERIFIED against reality:** `github.ts`'s mutating path — `gh pr create`,
  `gh pr merge`, `git push` — and therefore a full end-to-end card ship (session → verify →
  state PR → next card), plus `.runner.lock` contention and the STOP file **under a real,
  in-flight session** (the STOP verification above proves the startup-check exit path and its
  report write; it does not exercise a live executor session running when `STOP` appears).
  Exercising these needs a disposable GitHub repo. **Do a scoped `--cards <id> --max-cards 1`
  run under supervision before trusting this against a live campaign.**
