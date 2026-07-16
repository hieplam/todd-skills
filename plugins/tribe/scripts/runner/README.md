# Campaign runner

A **stateless capability** of the `tribe` plugin: a deterministic script that drives a
roadmap campaign's outer loop — pick the next staged card, run one fresh executor session,
script-verify it shipped, record state, repeat — so the loop itself burns **zero LLM
tokens** (only the sessions it spawns do). See
[`docs/superpowers/specs/2026-07-16-campaign-runner-design.md`](../../../../docs/superpowers/specs/2026-07-16-campaign-runner-design.md)
for the full design; this file documents what the code in this directory actually does.

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
| `--state` | yes | Campaign state JSON path, relative to `--repo`. |
| `--model` | yes | Executor model tier passed to each spawned session. |
| `--answers` | yes | Path (relative to `--repo`) to the committed rulings file embedded in every executor brief. |
| `--escalations-dir` | yes | Path (relative to `--repo`) where escalation files are written. |
| `--logs-dir` | no | Session log destination. Default: `logs/` next to the state file (i.e. the state file's own directory + `logs`). |
| `--session-timeout` | no | Wall-clock abort per executor session. Accepts `<n>ms`, `<n>s`, `<n>m`, `<n>h`, or a plain millisecond integer (e.g. `3h`, `30m`, `90s`, `5000ms`, `5000`). Default: `3h`. |
| `--dry-run` | no | Derive and print the next action with **zero side effects** — no lock, no writes, no session. |
| `--cards` | no | Comma-separated list of card ids — restricts the loop to only these ids, in the state's own `sequence` order. Default: the full sequence. |
| `--max-cards` | no | Positive integer — stop after processing this many cards in this run. Default: unbounded (run until `done`, an escalation, or a stop). |
| `--include-escalated` | no | Bypass the escalation-file short-circuit for a card the human has already ruled on, and let `nextCard`/`deriveCardPhase` reconsider it. |

`--repo`, `--state`, `--model`, `--answers`, and `--escalations-dir` have **no default** —
this is deliberate (the stateless-capability wall): omitting any of them is a usage error,
not a value worth guessing.

## How to run

Always start with `--dry-run` — it derives the next card and its resume phase from live
`gh`/`git` state and prints the plan as JSON, without acquiring the lock, writing anything,
or spawning a session:

```sh
bun plugins/tribe/scripts/runner/run.ts \
  --repo <target-repo> \
  --state <path-to-campaign-state.json> \
  --model <model> \
  --answers <path-to-answers.md> \
  --escalations-dir <path-to-escalations-dir> \
  --dry-run
```

Then run for real, optionally scoped to one card while validating end-to-end:

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
| Escalation file exists for the card (unless `--include-escalated`) | `escalation_pending` | Exit: "answer pending" (see below). |
| No `branch` recorded for the card | `fresh` | Spawn a fresh session. |
| PR found for the branch, `state == "MERGED"` | `verify_only` | Run the D3 verify checks and record — no session spawned. |
| PR found for the branch, `state == "OPEN"`, a `sessionId` is recorded | `resume` (`pr_open`) | Attempt `resume: sessionId` with a "check CI, complete the merge" prompt. |
| PR found for the branch, `state == "OPEN"`, no `sessionId` recorded | `fresh` | Nothing to resume — spawn fresh (same as "no trace"). |
| No PR, but the branch/worktree still exists, a `sessionId` is recorded | `resume` (`branch_no_pr`) | Attempt `resume: sessionId` with a "continue implementing" prompt. |
| No PR, branch/worktree exists, no `sessionId` recorded | `revert_and_redo` | Delete the worktree + local/remote branch, then spawn fresh. |
| No PR, no branch, no worktree | `fresh` | Spawn a fresh session. |

If a `resume` attempt itself surfaces a typed `error` outcome (no transcript, an SDK error —
never on `timeout`, since the prior session may still be running), the loop falls back to a
**fresh** session, carrying a state digest (last known status/branch/PR/`baseSha`) so it isn't
starting blind. There is no session-listing API in the SDK, so resumability is only ever
probed by attempting the resume — never by listing.

## Escalation / answers workflow (spec §D5)

The runner escalates instead of deciding whenever: the executor reports
`NEEDS_DIRECTION`, the D3 verify checks fail **twice** in a row for a card, or the next
card's spec/plan files are missing on disk (`PLANNING_NEEDED`). On escalation, the runner:

1. Writes `<escalations-dir>/<card-id>.md` (question, context, options) — written **first,
   unconditionally**, before anything else.
2. Marks the card `escalated` in the local state.
3. Best-effort commits the state + escalation file via its own docs PR (the same commit path
   used for a shipped card) — but the escalation stands even if that commit fails, since a
   broken CI check is a common escalation *cause*. A failed commit is retried automatically
   at the start of the next run.
4. Exits with code `2` (see Exit codes below).

To resolve an escalation: a human appends a ruling to the committed `--answers` file (every
executor brief embeds its full content), then re-runs the script. A card whose escalation
file is still present is skipped (`escalation_pending`) unless the re-run passes
`--include-escalated`.

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

`--dry-run` touches neither file: it never acquires the lock and never checks `STOP`.

## Exit codes

Read from `EXIT_*` in `loop.ts` and the argument-parsing path in `run.ts`:

| Code | Constant | Meaning |
| --- | --- | --- |
| `0` | `EXIT_OK` | Ran to `done`, or `--dry-run` completed, or the `STOP` file was present at startup. |
| `1` | `EXIT_LOCKED` | `.runner.lock` is held by a live process. Also returned for a CLI argument error (missing/invalid flag) before the loop even starts. |
| `2` | `EXIT_ESCALATED` | The loop escalated a card (see above) and exited; an escalation file is pending an answer. |
| `3` | `EXIT_SESSION_INCOMPLETE` | A spawned session ended `error`/`timeout` with no further D4 fallback available; state was already recorded locally, so the next start resumes it — this is not a human-decision escalation. |

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
- **Mocked tests validate logic, not invocations.** All 116 tests mock every seam (`exec`,
  `spawnSession`, the filesystem, the clock, the lock). They prove the loop's *logic* against
  those mocks — not that a real `gh`/`git`/SDK call behaves as assumed. This gap is not
  theoretical: `gh api pulls/<pr>` 404'd against a real PR while the 25 tests covering that
  exact path passed unchanged, and a live `--dry-run` later caught an open-PR resume that
  would have opened a duplicate PR. **Any changed `gh`/`git` command must be executed against
  a real repo before it is trusted.**
- **What HAS been verified live** (smoke run, 2026-07-16): `--dry-run` phase derivation against
  real merged/open PRs; the D3 six-point replay against a real merged PR (all six pass,
  including a real 2-parent merge commit) and its correct rejection of an open PR; a real
  Agent-SDK session spawn under the pinned §D1 options, with the SDK-assigned `session_id`
  captured from the `system/init` message; `settingSources: ['project']` genuinely loading the
  target repo's CLAUDE.md; a real `resume` recalling prior session context; a bogus resume id
  surfacing as a typed `error` (so the fresh-fallback path is reachable); and per-session log
  files.
- **What is still UNVERIFIED against reality:** `github.ts`'s mutating path — `gh pr create`,
  `gh pr merge`, `git push` — and therefore a full end-to-end card ship (session → verify →
  state PR → next card), plus `.runner.lock` contention and the STOP file under a real run.
  Exercising these needs a disposable GitHub repo. **Do a scoped `--cards <id> --max-cards 1`
  run under supervision before trusting this against a live campaign.**
