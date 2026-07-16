# Campaign Runner — deterministic card loop on the Claude Agent SDK (design)

Owner directives (2026-07-16): move the campaign's outer loop out of a long-lived LLM session
into a deterministic script; **the runner is tribe machinery and lives in this plugin**
(`plugins/tribe/runner/`), not in the target project. Authored by the Shaman; the owner
implements this in a following session in this repo.

> **Full rationale & lessons-learnt:**
> [`2026-07-16-campaign-runner-context.md`](2026-07-16-campaign-runner-context.md) — the
> measured context-cost breakdown of the Shaman-as-loop model, why the Agent SDK
> specifically (with the SDK facts corrected against current docs), alternatives rejected,
> and the 9 lessons each design mechanism encodes. Implementation plan:
> [`../plans/2026-07-16-campaign-runner.md`](../plans/2026-07-16-campaign-runner.md).
>
> Supersedes the ai-dict PR #107 version of these docs (reverted there). Deltas: re-homed to
> the tribe plugin as a stateless capability; D1 rewritten to the verified SDK option set;
> D2 gains `baseSha` + a single-instance lock; D4 drops `listSessions()`; D5 survives
> CI-down; the schema-guard front-matter convention is defined.

## 1. Problem

A campaign (e.g. ai-dict's "Run the roadmap", 25 cards) currently runs with the Shaman (a
large-model session) as the loop: it dispatches one executor Warchief per card, waits,
verifies, updates state, repeats. That session's context is append-only — B5 alone consumed
~40% of a 1M window — so the loop dies of context exhaustion long before the campaign
finishes, and every card pays rent on all previous cards' history.

The loop itself is deterministic work (pick next card → run executor → verify → record). It
needs zero intelligence and therefore should cost zero tokens.

## 2. Architecture — two stages, hard boundary; capability vs campaign

```
STAGE A — PLANNING (human + Fable, interactive, BEFORE the runner)
  Shaman session authors specs + plans for a batch of N cards
  → docs PR → the TARGET REPO's master (docs/superpowers/{specs,plans}/...)
  Owner rulings (E-items, policy) happen here, recorded in the target repo's ROADMAP §8.

STAGE B — EXECUTION (Claude Agent SDK script, headless, 0 tokens for the loop)
  bun plugins/tribe/runner/run.ts --repo <target repo> --state <state.json path> [...]
  loop: next staged card → ONE fresh executor session → script-verified SHIPPED
        → state updated on the target repo's master → next card
  Any gap/question → write escalation file, EXIT. Human answers, re-runs.
```

**Capability/instance split (owner's skill-authoring anti-goals, non-negotiable):** the
runner is a **stateless capability of the tribe plugin**. It hardcodes no repo, no paths, no
model, no campaign. Everything environment-specific is an input:

| Input (CLI flag)      | Meaning                                                      | ai-dict campaign value (example, lives in ai-dict)          |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------ |
| `--repo`              | target repo root (session `cwd`, gh/git context)             | `~/WORK/_TestScripts/ai-dict`                                 |
| `--state`             | campaign state JSON, path relative to repo                   | `docs/superpowers/campaign/campaign-state.json`               |
| `--model`             | executor model tier                                          | `sonnet` (owner protocol)                                     |
| `--answers`           | committed rulings file embedded in every brief               | `docs/superpowers/campaign/answers.md`                        |
| `--escalations-dir`   | where escalation files are written                           | `docs/superpowers/campaign/escalations/`                      |
| `--session-timeout`   | wall-clock abort per session                                 | `3h` (default)                                                |
| `--logs-dir`          | session log destination (outside the repo by default)        | default `<state dir>/logs/`                                   |

The campaign *instance* files (state JSON, specs, plans, `answers.md`, escalations) live in
the **target repo** — memory belongs to the project, the loop belongs to the tribe. The
runner never designs, never answers What/Why/How questions, never relaxes a wall. It is the
Warchief-dispatcher and the verifier, as code.

## 3. Key mechanics (decided)

### D1 — One fresh SDK session per card (verified option set)

`query({ prompt: executorBrief(card), options })` from `@anthropic-ai/claude-agent-sdk`
(TypeScript, bun). Options per session — pinned in one module (`session.ts`):

```ts
{
  cwd: config.repoRoot,                                      // --repo input
  model: config.model,                                       // --model input ("sonnet")
  systemPrompt: { type: 'preset', preset: 'claude_code' },   // REQUIRED for CLAUDE.md to apply
  settingSources: ['project'],                               // target repo CLAUDE.md + .claude/rules
  plugins: [{ type: 'local', path: TRIBE_PLUGIN_DIR }],      // warchief/hunter/skinner agents
  permissionMode: 'bypassPermissions',                       // owner-ruled: headless, never hangs
  allowDangerouslySkipPermissions: true,                     // required by the SDK for the above
  maxTurns: config.maxTurns,
  abortController,                                           // wall-clock timeout (--session-timeout)
  executable: 'bun',
}
```

Notes, each verified against the current SDK reference:

- `settingSources` defaults to `[]` — omit it and the session loads **nothing** (no
  CLAUDE.md, no rules). `'project'` scopes the session to the target repo's own config; the
  tribe agents come from the `plugins` option, NOT from a `~/.claude/agents` copy — the
  executor must not depend on what happens to be installed user-globally.
- The **session id is SDK-assigned**: it arrives in the first message
  (`type: 'system', subtype: 'init'` → `session_id`) and is written to state **on receipt**
  (crash window: milliseconds). Resume is `options.resume: <id>` (+ `forkSession` only if a
  branch is ever wanted — it is not, in v1).
- Sessions are not "deleted" — a finished session is simply never resumed; its transcript
  stays on disk as the audit log (and as the resume handle if the process crashed mid-card).

### D2 — Machine-readable state in the target repo, verified against reality

`--state` JSON (committed in the target repo; the human snapshot .md stays alongside):

```json
{
  "v": 1,
  "campaign": "run-the-roadmap-2026-07-16",
  "mergePolicy": "merge",
  "sequence": ["B3", "B4", "B8", "A6", "..."],
  "cards": {
    "B3": {
      "status": "staged",
      "spec": "docs/superpowers/specs/2026-07-16-b3-...md",
      "plan": "docs/superpowers/plans/2026-07-16-b3-...md",
      "branch": "feat/b3-re-encounter-highlighting",
      "baseSha": null,
      "pr": null,
      "mergeSha": null,
      "sessionId": null,
      "updatedAt": "..."
    }
  }
}
```

Statuses: `staged` (spec+plan on master) → `running` → `shipped` | `escalated`. `baseSha` is
recorded at spawn time (the master SHA the card's worktree starts from) — D3's schema guard
diffs from it. Iron rule (same as the human resume protocol): **the file is data, gh/git is
authority** — on every start the runner re-derives each card's true phase from GitHub before
acting.

Two mechanical rules the PR #107 version left implicit, now explicit:

- **Single instance:** the runner takes a lock file (`<state dir>/.runner.lock`, pid+start
  time) at startup and refuses to start if a live process holds it — two concurrent loops
  would double-spawn sessions and PRs.
- **Write locality:** mid-card state writes (`running`, `sessionId`, `baseSha`) are LOCAL
  (uncommitted) until the card's post-verify docs PR commits them (D6). That is safe because
  transcripts — the thing sessionId points at — live on the same machine; a lost disk loses
  both together.

### D3 — Done is script-verified, never agent-claimed

The executor's final `SHIPPED <pr> <sha>` line is a signal only. The runner accepts a card as
shipped when ALL of these deterministic checks pass (no-cascade as code):

1. `gh api pulls/<pr>` → `merged == true`
2. merge commit has **2 parents** (regular merge — owner re-ratified; squash/rebase = fail)
3. merge sha is an ancestor of `origin/master`
4. every PR check concluded `success` (subject to the codified flake rule, D6)
5. the card's worktree is gone and its remote branch deleted
6. schema guard: `git diff <baseSha>..origin/master -- <schema-lock paths>` is empty unless
   the card's plan **front-matter** declares `allowsSchemaChange: true`. Convention (new,
   binding on Stage A): plans carry YAML front-matter; **absent front-matter or absent key ⇒
   `false`**. The schema-lock path list is campaign config in the state file (for ai-dict:
   `packages/app/src/domain/types.ts` — the E1 protection), not hardcoded.

### D4 — Resume matrix (crash/stop at ANY point; script is stateless)

On every start, per current card, derived from reality:

| Observed reality                    | Action                                                                                                                                                          |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| PR merged, state not yet `shipped`  | verify (D3) + record only — no session                                                                                                                          |
| PR open                             | attempt `resume: sessionId` with a "continue from CI wait/merge" prompt; **if the resume attempt fails** (no transcript, SDK error), spawn fresh with a state digest |
| branch/worktree exist, no PR        | attempt resume if a sessionId is recorded; else REVERT_AND_REDO (delete worktree + branch, fresh session) — the doctrine B5's executor proved                   |
| no trace                            | fresh session                                                                                                                                                    |
| escalation file exists for the card | EXIT: "answer pending"                                                                                                                                           |

There is no session-listing API in the SDK — resumability is probed by **attempting** the
resume (cheap: the failure is immediate and typed), never by listing.

`<state dir>/STOP` file → runner finishes the in-flight verify step and exits cleanly
(owner's soft-stop).

### D5 — Escalation: the loop stops, the human decides

Triggers: executor returns `NEEDS_DIRECTION`, D3 verification fails twice for a card, a plan
file is missing for the next card (`PLANNING_NEEDED`), or an owner-only item surfaces (the
owner-only list is campaign config in the state file). The runner writes
`<escalations-dir>/<card>.md` (question + context + options), sets the card `escalated`, and
exits with a distinct code. It then **best-effort** commits the state + escalation via D6 —
but the escalation is valid even if that commit fails (the common cause of escalation IS
broken CI): the local file + exit code stand alone, and the next run retries the commit
first. The human (a Shaman session) answers by appending a ruling to the committed
`answers.md`; every executor brief embeds that file, and re-running the script resumes.

### D6 — State commits and the flake rule, codified

After each card the runner updates state via its own docs PR in the target repo (branch →
commit → push → PR → wait checks → `gh pr merge --merge`). CI-check policy, encoding the
ai-dict campaign's rulings: retry a failed check up to 3 times (10-min spacing); if after
retries the ONLY failure is an advisory third-party check failing at bootstrap (the
SonarCloud-504 signature) **and** the diff is docs-only → merge with the exception recorded
in the PR body; any other red → treat as escalation (D5). Code PRs (the executor's own)
never auto-waive — that path always escalates, matching the owner's B5 ruling.

### D7 — Observability without tokens

The runner streams each session's SDK messages to `<logs-dir>/<card>-<sessionId>.log`,
prints one-line phase transitions to stdout, and relies on the existing worker-report
convention inside the session (the brief keeps requiring report-file heartbeats). No LLM
summarization anywhere in the loop.

## 4. What this replaces / keeps

- Replaces: the Shaman-as-loop (dispatch, wait, mechanical verify, state bookkeeping).
- Keeps: Stage-A planning by human+Fable; the executor Warchief exactly as proven on B5
  (TDD Hunters, dual-skinner audit, PR conventions, the target repo's evidence policy);
  the target repo's ROADMAP §8 as the decision record; walls unchanged (no-squash,
  master-green, campaign constraints, owner-only E-items).
- Non-goal: the runner never writes specs/plans, never merges with a red substantive check,
  never answers escalations, never runs two cards concurrently (v1 is strictly sequential).

## 5. Cost model

Loop: 0 tokens. Per card: one executor session (plus its internal Hunter/Skinner subagent
usage, as today). Stage-A planning cost is unchanged but now runs in disposable interactive
sessions instead of accumulating in one.

## 6. Risks

- **bypassPermissions**: the session can run anything the shell can. Mitigations: private
  repos, no secrets on disk, worktree isolation, script verification, STOP file, wall-clock
  abort. Accepted by owner ruling.
- **SDK drift**: `query()` options are pinned in one module (`session.ts`) so an SDK upgrade
  touches one file. The three claims the PR #107 spec got wrong are exactly the kind of
  drift this contains.
- **Agent duplication**: the tribe agents also exist as a `~/.claude/agents` copy on this
  machine; sessions load them via `plugins` only (D1), so a stale user-scope copy cannot
  shadow the plugin's definitions inside executor sessions.
- **State/reality divergence**: mitigated structurally by D2's verify-first rule.
