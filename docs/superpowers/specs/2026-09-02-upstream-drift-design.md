# Spec — Upstream drift: the heartbeat detects new commits on `origin/<base>` and tells the running card

**Card:** `i75-upstream-drift` · **Source:** GitHub issue #75 · **Date:** 2026-09-03
**Author:** Shaman (What/Why). The plan (How) is authored separately by a planning Warchief
after `i74-mechanical-heartbeat` has merged (this card extends that watchdog's tick).
**Status:** contract for the implementation card in campaign `gh-issues-2026-09`.
**Depends on:** `i74-mechanical-heartbeat` merged (its `status.json`/`events.jsonl`, tick loop,
and pure decision core are the surfaces this card extends).

---

## 1. Problem, grounded

### 1.1 The owner's question, answered

Issue #75 asks: *has Claude Code's own file-change reminder solved this, or must the check go
into the runner's heartbeat?* The reminder the owner saw (quoted in the issue) fires when a file
the session has **already read** has **different bytes on disk in that session's own working
tree**. Two facts make it useless for upstream drift:

| Fact | Evidence |
| --- | --- |
| A commit on `origin/master` changes no byte in an executor's worktree until someone fetches and merges. The executor works in its own worktree (`/Users/hip/repo/todd-skills-wt/<card>`), never in the main checkout. | Runner brief `core/brief-template.md` (worktree per card); observed for every card in this campaign. |
| The reminder only fires for files the **parent** session read. In this campaign, a ruling appended to a file only Hunters had read never reached the resumed Warchief (diary 2026-09-03T00:32Z/00:20Z). | `SHAMAN-STATE.md` diary; runner run `2026-09-03T00-19-29-351Z-bc5c` re-escalated blind. |
| Drift happened twice during this campaign without any signal to the executor: PR #109 (three new rules) landed on master while #106 was in flight; the #105 session holds three sibling worktrees on the same master. | `git log 176c9d8..origin/master` at merge time: `96b8c32`, `aa97850`. |

So: **no, the harness has not solved it, and cannot** — detection must come from something
that fetches. That is the heartbeat (the #74 watchdog tick).

### 1.2 Delivery to a running session is the hard half

Rulings reach an executor only at spawn/resume (fixlist P7 "accept the spawn-time snapshot").
P7 recorded a **deferred design** for exactly this: a PreToolUse hook that, when a watched
file's content hash changes, denies exactly ONE tool call with a message carrying the new
information, then stays silent. The runner already owns this hook infrastructure
(`core/session.ts`: the backgrounding and wait-tool denials, P1/P2). This card builds that
deferred design, for drift.

### 1.3 What exists to build on

| Surface | Where |
| --- | --- |
| Watchdog tick, `status.json`, `events.jsonl`, pure decision core, `--once`/`--follow` | `i74-mechanical-heartbeat` (merged before this card starts) |
| Card `baseSha` recorded before spawn; `branch` known once a PR exists | runner README "Per-card fields"; `campaign-state.json` |
| Brief rendering with sections (`Answers`, digest) | `core/brief.ts`, `core/brief-template.md` |
| PreToolUse hook seam | `core/session.ts` (`decideBackgroundingHook` and the P1 wait-tool denial) |
| Merge shape: regular 2-parent merges only, never rebase/squash | `.c3/rules/rule-no-squash-merge.md`; ADR 2026-07-16 |

---

## 2. The change (What)

### 2.1 Detection — a watchdog tick duty

Every tick (default 60 s; reuse the #74 tick), for each card whose runner status is `running`
and whose `baseSha` is set:

1. `git fetch origin <base>` (timeout; fail-closed: a fetch error is an event `drift_check_failed`
   with the stderr, never a crash, never a false "no drift").
2. Compute `ahead = origin/<base> ∖ baseSha` (commits, subjects, files).
3. If `ahead` is non-empty: compute the **overlap** = files in `ahead` ∩ files changed on the
   card's branch (`git diff --name-only <merge-base>..<branch-tip>`; when no branch is known yet,
   overlap is "unknown", stated as such).
4. Write `<home>/drift/<card>.md` — the digest: base sha, new tip, the commits (sha, subject,
   files), the overlap (or "none" / "unknown"), and the instruction to reconcile (§2.3). Rewrite
   only when content changes (so the hash-based delivery below fires once per real change).
5. Append `upstream_drift{card, ahead: n, overlap: k}` to `events.jsonl`; `status.json` gains
   `drift: {card, ahead, overlap, digestPath, since}`.

No drift → nothing is written and nothing is appended (G5 zero false alarms). The watchdog
never fetches into, merges, rebases, or otherwise mutates any worktree or branch (D75-1).

### 2.2 Delivery — three channels, all mechanical

1. **At spawn/resume (brief).** `core/brief.ts` renders a `## Upstream drift` section from
   `<home>/drift/<card>.md` when it exists; absent otherwise. The resume prompt (which carries
   no brief) carries one line pointing at the digest path when the file exists.
2. **Mid-flight (deny-once hook).** A PreToolUse hook holds the digest's content hash as seen
   at spawn (or "absent"). When the hash differs at a tool call, deny exactly that ONE call with
   a message carrying the digest and the reconcile instruction; then record the new hash and
   stay silent until the digest changes again. Never denies twice for the same content; never
   denies when the file is absent or unchanged.
3. **Pre-PR gate (brief DoD).** The executor brief's Definition of Done gains a step before
   `gh pr create`: run the drift check (a CLI the card ships or the watchdog's `--once` output),
   and if `origin/<base>` is ahead of the branch's merge-base, `git merge origin/<base>` into the
   branch (regular merge — never rebase, D75-4), re-run gates, then open the PR.

### 2.3 The reconcile instruction (verbatim in digest, hook message, and brief)

> Upstream `origin/<base>` moved from `<baseSha>` to `<tip>` (<n> commits; overlap with your
> branch: <k files | none | unknown>). Before your next commit: `git fetch origin && git merge
> origin/<base>` in your worktree (regular merge, never rebase), resolve conflicts, re-run the
> gates, then continue. Files that moved upstream and that you also changed: <list>.

### 2.4 Governance

C3 change-unit naming c3-215; ADR "upstream drift detection in the heartbeat; P7 deferred
design built"; fixlist P7 row → "deferred design built by #75 (drift)"; runner README (brief
section, hook, drift files); watchdog docs (tick duty, flags); orchestrate-campaign SKILL.md
Stage B note ("drift digests live under `<home>/drift/`; the Shaman reads them when ruling").

---

## 3. Decisions (frozen — see the card's D75-1..4)

D75-1 heartbeat detects, executor reconciles · D75-2 deny-once delivery is in scope ·
D75-3 overlap is advisory, never a gate · D75-4 regular merge of `origin/<base>`, never rebase.

Additional, from this campaign's evidence:

- **D75-5 Ruling delivery rides the same hook.** The deny-once mechanism watches a small
  allowlist of files, not just the drift digest: `<home>/drift/<card>.md` and
  `<home>/answers.md`. A ruling appended to `answers.md` after spawn therefore reaches a
  resumed session on its next tool call — closing the gap that cost three runner passes on
  #106 (diary 2026-09-03T00:32Z). Same contract: one denial per content change per file.
- **D75-6 Fail closed, never fail silent.** A fetch failure, a missing base, an unreadable
  digest → typed event + WARN in status, never an exception, never "no drift".

---

## 4. Non-goals

Automatic merging/rebasing by the watchdog; conflict resolution policy; changing the runner's
resume matrix or state schema; the status viewer; notifying the owner outside `status.json`.

---

## 5. Acceptance — measurable goals (from the card)

| Goal | Evidence the PR must carry | Gate |
| --- | --- | --- |
| G1 detection ≤ 1 tick | integration test with a local bare remote: push a commit → digest + event within one tick, with commits, files, overlap | green |
| G2 brief delivery | brief rendered with digest present contains the section; absent otherwise (unit test on the renderer) | green |
| G3 deny-once mid-flight | hook unit tests (P1 shape): hash change → one denial carrying the digest; next call passes; unchanged → never; absent → never; same for `answers.md` (D75-5) | green, every row |
| G4 pre-PR reconcile | brief template test asserts the DoD step text; the real-brief render shows it | green |
| G5 zero false alarms | no fetch-ahead → no file, no event, no denial; non-running card → nothing | green |
| G6 governed | change-unit, ADR, P7 row, README/SKILL docs | present |

## 6. Verification steps (what the Shaman runs before merging)

1. Watchdog + runner test suites green (`bun test` in each dir the plan names).
2. Replay G1 myself: local bare remote, throwaway home, watchdog `--once`; push a commit; run a tick; read `drift/<card>.md` and `events.jsonl`.
3. Render a brief for a card with a digest present (the plan names the command) and see the section.
4. Hook tests include the `answers.md` row (D75-5).
5. Diff ⊆ fence; two skinner reports PASS; tracker + scout present; C3 change-unit + ADR; P7 row updated.

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| Denying a tool call confuses a mid-edit executor | The message is one paragraph with a single imperative; only one denial per change; tested against the P1 pattern that already ships |
| Fetch cost every 60 s | `git fetch` of one ref is cheap; the tick interval is a flag; fetch failures are events, not retries in a tight loop |
| Overlap computation needs the branch, unknown before a PR | "unknown" is a legal value (D75-3 advisory); the digest still instructs the merge |

## 8. Grounding update after #74 merged (Shaman, 2026-09-05)

`i74-mechanical-heartbeat` shipped in PR #123 (master `cb35173`). The watchdog is the runner
subcommand `bun plugins/tribe/scripts/runner/run.ts watchdog` with its pure core under
`plugins/tribe/scripts/runner/core/watchdog/`, IO seams in `ports/ports.ts`, the real adapter in
`adapters/watchdog-io.adapter.ts`, `status.json` + `events.jsonl` under `<home>/watchdog/`, a
`--once`/`--follow` tick loop with `--poll-seconds` slices, and the runner README's "Watchdog"
section as the contract. This card adds the drift duty to that tick (§2.1) and the deny-once
hook to `core/session.ts` (§2.2). Known watchdog follow-ups that this card must not silently
fix: FU-i74-2 (`--once` no-log stall), FU-i74-3 (`--no-viewer`/`--viewer-port` pass-through).

## 9. Amendments accepted from planning (Shaman ruling R5, 2026-09-05)

All nine planning amendments are accepted; where §2 and this section differ, this section wins.

1. The digest file is **timestamp-free** (otherwise "rewrite only on content change" rewrites every tick and deny-once becomes deny-always).
2. One `upstream_drift` event **per content change**, never per tick.
3. The new tip is `commits[0].sha` of the ahead range (no separate `rev-parse`).
4. Remote and base are **derived** (`--remote` pass-through; `symbolic-ref` with `master` fallback); no new watchdog flag.
5. "Hash as seen at spawn" is realized as **primed on the first tool call** (the hook is built before the session exists; the brief rendered at the same instant already carries the digest).
6. One denial may carry **several** changed watched files (still one denial per content change per file).
7. **No drift check runs during a quota/overload wait** — documented limitation (the wait sleeps inside the loop body; `i74` surface, out of fence).
8. `status.json.drift` is the **most recent** drift, singular; per-card detail lives in `events.jsonl` and one digest per card.
9. Plan landing path: `docs/superpowers/plans/2026-09-05-upstream-drift.md`; the campaign state file's `plan` value is updated to match.
