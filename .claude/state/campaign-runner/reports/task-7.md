# Task 7/7 — Docs (README-only half)

Scope: `plugins/tribe/scripts/runner/README.md` (new) + `plugins/tribe/README.md` (runner
section added). The C3 change-unit half of Task 7 was already done by the Warchief
(`e087cb7`) — not touched here. No `.ts` source, no `.c3/` files, no deps changed.

## Flags verified against `run.ts` (source of truth, not the spec)

Read `plugins/tribe/scripts/runner/run.ts` end to end (`parseArgs`, `REQUIRED_FLAGS`,
`DEFAULT_SESSION_TIMEOUT_MS`, `parseDurationMs`, the `main()` real-world wiring) plus
`loop.ts` (`RunLoopConfig`, `deriveCardPhase`, `runLoop`, `acquireLock`, `isStopRequested`,
`resolveBaseBranch`, the `EXIT_*` constants) before writing a single line of README. Every
flag documented exists in `parseArgs`'s `raw` map / `REQUIRED_FLAGS`:

| Flag | Verified in `run.ts` | Notes |
| --- | --- | --- |
| `--repo` | `REQUIRED_FLAGS` → `repoRoot` | required, no default |
| `--state` | `REQUIRED_FLAGS` → `statePath` | required, no default |
| `--model` | `REQUIRED_FLAGS` → `model` | required, no default |
| `--answers` | `REQUIRED_FLAGS` → `answersPath` | required, no default |
| `--escalations-dir` | `REQUIRED_FLAGS` → `escalationsDir` | required, no default |
| `--logs-dir` | line 94, default `join(dirname(join(repoRoot, statePath)), 'logs')` | optional |
| `--session-timeout` | lines 84-91, `parseDurationMs` (ms/s/m/h/plain), default `DEFAULT_SESSION_TIMEOUT_MS` = 3h | optional |
| `--dry-run` | boolean flag, line 59-62 | optional |
| `--cards` | comma-split, lines 106-113 | optional |
| `--max-cards` | positive-integer validated, lines 96-104 | optional |
| `--include-escalated` | boolean flag, line 59-62 | optional |

No invented flags — every row above traces to a specific line range I read, not to the spec
alone.

## Spec vs code disagreement found

None material for the flags themselves — the spec §2 table and `run.ts`'s `REQUIRED_FLAGS`
agree exactly on which five inputs are required. The one place code goes further than the
spec text: the spec's inputs table doesn't list `--cards`/`--max-cards`/`--include-escalated`
(only the plan's Task 6 description does), but they are real, implemented flags in
`parseArgs` — documented them as such, sourced from the plan/code, not invented.

I also verified in `loop.ts` (not just taking the spec's word) that:
- `verifyWithRetry` (lines 449-457) truly has **zero delay** between its two
  `verifyShipped` calls — no `io.sleep` in that function — confirming the "Known
  limitations" claim about it catching a network blip but not a still-settling check. This
  is distinct from `github.ts`'s `pollChecksUntilSettled`, which DOES sleep
  `D6_RETRY_SPACING_MS` between polls (verified via `grep -n "sleep" github.ts`).
- `resolveBaseBranch` (loop.ts lines 402-414) falls back to the literal `'master'` on ANY
  non-zero exit from `git symbolic-ref`, not only "origin/HEAD unset" — confirming the
  silent-fallback limitation as written.
- `github.ts`'s D6 sonar waiver (lines 312-337) never inspects the PR's actual file diff; the
  "docs-only by construction" guarantee is enforced entirely upstream by `loop.ts`'s
  `toCommitFileList`/`assertStateOrEscalationPath` (lines 258-278), which the waiver code
  itself never touches — confirmed by reading both files, not asserted from memory.

## Exit codes documented + where read

From `loop.ts`: `EXIT_OK = 0`, `EXIT_LOCKED = 1`, `EXIT_ESCALATED = 2`,
`EXIT_SESSION_INCOMPLETE = 3` (lines 355-358), plus their actual return sites:
`acquireLock` failure → `EXIT_LOCKED` (line 792-793); STOP-file-at-startup / `done` /
successful `--dry-run` → `EXIT_OK`; `escalateCard`/`planning_needed`/`escalation_pending`
phase → `EXIT_ESCALATED` (lines 845, 862, 872); a `stopped` `CardOutcome` (unresumed
session error/timeout) → `EXIT_SESSION_INCOMPLETE` (line 876). Also documented, from
`run.ts` line 215, that a CLI argument-parse error exits `1` (same code as `EXIT_LOCKED`,
no separate constant — `process.exit(1)` with a comment "argument errors always exit 1").

## Walls honored

- No repo names, no `ai-dict` mentions, no absolute paths, no model names in either README —
  grepped both new/changed files for `ai-dict`, `/Users/`, `sonnet` before committing: none
  found. Placeholders (`<target-repo>`, `<model>`, `<path>`) used throughout.
- Docs only: no `.ts` file touched, no `.c3/` file touched, no `package.json`/deps changed.

## Gates

```
$ bun test
bun test v1.3.13 (bf2e2cec)
 114 pass
 0 fail
 279 expect() calls
Ran 114 tests across 7 files. [304.00ms]

$ bunx tsc --noEmit
(no output, exit 0)
```

Both run from `plugins/tribe/scripts/runner/`, confirming 114 tests still pass and no
source was touched.

## Files changed

- `plugins/tribe/scripts/runner/README.md` (new)
- `plugins/tribe/README.md` (new "Campaign runner" section added after the Tracker/Skinner
  boundary section, before "Quick reference"; rest of file untouched)

## Commit

`docs(tribe): campaign runner — runner README + tribe plugin runner section (7/7)` with
`Tribe-Card: campaign-runner` / `Tribe-Task: 7/7` trailers. SHA recorded below once created.

## Note on unrelated working-tree state

At task start the repo had pre-existing, unrelated modified/untracked files not part of this
brief (`.claude/state/campaign-runner/reports/task-2.md`, `task-2b.md` modified;
`.claude/state/campaign-runner.md`, `task-1.md`, `task-6b.md`, `b1.txt`, `conflict.txt`,
`.claude/settings.local.json.doctor-bak` untracked). None of these were touched or staged by
this task — only the two README files (plus this report) were added to the commit.
