# Campaign Orchestration — the driver's seat for the campaign runner (design)

Owner directives (2026-07-16, this session): the campaign runner (PR #37) shipped as the
*engine* — a manually-executed CLI — but the owner's idea was a single conversation-level
flow: **"orchestration: do these N ideas"** said in any chat session → the tribe plans What
and How → **the session itself triggers the runner CLI** → the runner loops deterministically,
**parking escalated cards and continuing** → the owner receives **one consolidated report**
when all loops are done. This design adds that missing orchestration layer. It amends the
runner's D5 (exit-on-escalation) and adds a report contract; everything else in
[`2026-07-16-campaign-runner-design.md`](2026-07-16-campaign-runner-design.md) stands.

> Implementation plan: [`../plans/2026-07-16-campaign-orchestration.md`](../plans/2026-07-16-campaign-orchestration.md).
> Findings this design closes: **F12** (the Shaman→runner handoff does not exist — nothing
> authors `campaign-state.json`, no agent knows the runner exists) and the README's own
> "run this by hand" workflow. Owner rulings already in force and NOT re-opened here:
> the Shaman authors the state file (F12 ruling); no squash merges; the runner never
> exercises judgment.

## 1. Problem

The runner works — smoke-proven against real GitHub — but nobody built the driver's seat:

1. **No trigger.** The README instructs a human to execute `bun run.ts ...` in a terminal.
   No agent, skill, or session behavior knows the runner exists (`grep -ril "campaign
   runner" plugins/tribe/agents/` → nothing).
2. **No handoff (F12).** All 11 runner flags are inputs; nothing *creates* the campaign
   state file the runner requires. The plan's original seeder (an ai-dict docs PR) was
   struck by owner directive, and nothing replaced it.
3. **No report contract.** The runner emits exit codes and log files. A calling session has
   no single artifact to read that says "here is what shipped, here is what's blocked".
4. **Exit-on-escalation stalls unattended batches.** D5 says: write the escalation file,
   EXIT. For the owner's target workload — 10–20 mostly-trivial cards run overnight — one
   ambiguous card on position 1 wedges the other 19 behind a question no one is awake to
   answer.

## 2. Frame (reverse-tornado: objective, walls, no-cascade read)

**Objective (metric + target):** from ONE owner directive ("orchestration: do these N
ideas") to ONE final report, with **owner interventions in between = 0** (the sole designed
exception: an irreversible escalation, which is the point of the escalation ladder). Proven
by a live campaign of N ≥ 2 cards where the final report accounts for exactly N cards as
`shipped` or `blocked`, and every `shipped` card passes the D3 six-point replay
independently (via `verify-shipped`), not the runner's own claim — that independent replay
is the no-cascade read.

**Anti-goal walls (each with its metric, frozen for this effort):**

| # | Wall | Metric | Type |
| --- | --- | --- | --- |
| W1 | Statelessness (standing, owner skill-authoring rule) | hardcoded env-specific values in `plugins/tribe/` orchestration+runner source == 0 (grep gate) | tripwire |
| W2 | Zero-LLM loop (standing, runner acceptance #5) | SDK/model imports in `loop.ts`/`run.ts` == 0 — judgment must NOT migrate into the runner | tripwire |
| W3 | Judgment stays in sessions (new) | escalation answers authored by the runner == 0; every `answers.md` ruling traces to an orchestrator session or the owner | tripwire |
| W4 | No squash (standing, `rule-no-squash-merge`) | merges with parent count ≠ 2 == 0 | tripwire |
| W5 | Real-CLI proof (learning F4: mocked seams cannot validate invocations) | new/changed `gh`/`git` command strings never executed against a real CLI == 0 before trust | tripwire |
| W6 | Dependency safety (new, consequence of park-and-continue) | cards started while a declared dependency is parked == 0 | tripwire |
| W7 | Bounded auto-answer (new) | auto-answer rounds per card ≤ 2, then the card parks for the owner — prevents an orchestrator↔runner infinite loop | drift gauge |

Inner integrity wall (always): `anti_goal_bypass_or_dishonesty_count == 0` — hitting the
objective by weakening a wall is not success.

## 3. Architecture — the loop around the loop

The runner's deterministic loop (Stage B) is unchanged in kind. What's new is the
**orchestrator loop around it**: judgment work (planning, answering, reporting) stays in
LLM sessions; mechanical work (dispatch, verify, record) stays in the runner. Same
capability/instance split as before — the orchestration skill is stateless tribe machinery;
all campaign instance data lives in the target repo.

```
OWNER: "orchestration: do these 4 ideas"        (any session — main chat, or a
  │                                              Shaman/Warchief already in play)
  ▼
STAGE A — PLANNING (orchestrator session, Shaman authority)
  A1  Confirm/ideate the cards (What/Why) with the owner if needed
  A2  Author the How docs per the AUTHORSHIP POLICY (O2):
        few or complex cards  → the session authors specs+plans itself
        many trivial cards    → dispatch one planning-Warchief per card
  A3  Author campaign-state.json + answers.md scaffold      ← closes F12
  A4  Docs PR → target repo master (cards now `staged`)
  │
  ▼
STAGE B — EXECUTION (runner, headless, 0 tokens in the loop)
  orchestrator triggers:  bun plugins/tribe/scripts/runner/run.ts ... (background)
  loop: next progressable card → one executor session (a Warchief inside)
        → D3 script-verify → state PR → next card
  D5′ AMENDMENT (O4): escalation ⇒ PARK the card (status `escalated`),
        write the escalation file, CONTINUE to the next card whose
        dependencies are not parked; exit only when no progressable card remains
  on EVERY exit: write campaign-report.json + .md (O5)      ← the report contract
  │
  ▼
STAGE C — ROUND-TRIP & REPORT (orchestrator, woken by process exit)
  read campaign-report.json
  for each escalated card:
      within Shaman authority?  → append ruling to answers.md, mark re-runnable
      irreversible / too hard?  → leave parked (owner will see it)
  answered cards exist?  → re-trigger the runner scoped to them (≤ 2 rounds/card, W7)
  else → compose the ONE final owner report: shipped (PR, sha, D3-verified)
         + blocked (card, question, why it needs the owner) + stats
```

## 4. Design points

### O1 — Entry: an installable tribe skill, trigger word "orchestration"

The entry point is a **skill** (`plugins/tribe/skills/orchestrate-campaign/`), not a new
agent, because the owner wants to trigger from *any* session — the main chat, a Shaman, or
a Warchief ("it can be option 1, 2 or just a simple chat session"). A skill is exactly
that: a capability any session invokes. Trigger phrases: "orchestration", "orchestrate
these ideas", "run these N cards", "do these tasks in orchestration". `skills/` is in
install.sh's component whitelist, so it installs cleanly (unlike the runner itself, which
stays repo-invoked under `scripts/` per `ref-plugin-layout`).

The skill instructs the invoking session to assume **Shaman authority** for the campaign
(Stage A authorship, Stage C answering). It composes with the runner via the runner's
**CLI contract only** (flags, exit codes, the report file) — never by reaching into
`loop.ts`/`state.ts` internals. Both live in the tribe plugin, so this is one plugin's
internal contract, but the discipline holds: if the runner's flags change, the skill reads
the runner README, not the source.

### O2 — Stage A authorship policy (owner-ruled this session: "mix")

Who writes the How docs depends on the batch:

| Batch shape | Authorship | Why |
| --- | --- | --- |
| Few cards (≲3) or genuinely complex work needing brainstorm | The orchestrator session authors specs+plans itself | The owner's "shaman author all … when need to brainstorm for really complex task" — dispatch overhead isn't worth it, and the thinking is the value |
| Many trivial cards (~10–20) | Dispatch one **planning-Warchief** per card to author its spec+plan; the session reviews and stages them | The owner's "dispatch warchief to brainstorm is a fair win" — parallel, cheap, and How-authorship is Warchief territory anyway |

The chosen mode is recorded in the campaign state (`planning: { mode: "shaman" |
"warchief-fanout" }`) so a resuming session knows how the docs were produced. Either way,
**the Shaman-authority session authors `campaign-state.json` itself** (F12 owner ruling:
state is a planning artifact; Stage A owns planning artifacts). The state schema the
Shaman must produce is documented in the runner README (a gap today — the README names
`--state` as required but never shows the schema; this design fixes that).

### O3 — Trigger contract

The orchestrator launches the runner as a **background process** from the session (the
harness notifies the session when a background command exits — that notification IS the
"report is ready" signal). Sequence, per invocation:

1. `--dry-run` first (zero side effects) — sanity-check the derived next action.
2. Real run in the background; record the command, start time, and log location in the
   session.
3. On exit notification: read `campaign-report.json` (O5). The exit code is a hint; the
   report is the truth.

The runner's existing `.runner.lock` makes a double-trigger safe (second instance refuses
to start), and the `STOP` file remains the owner's manual brake. Long campaigns can
outlive the triggering session; that is acceptable because ALL state is on disk (state
JSON, report, escalations, logs) — a new session re-enters via the same skill, reads the
report, and continues Stage C. The session is a *viewer and answerer*; the process and its
memory never live in the session.

### O4 — D5′ amendment: park-and-continue (replaces exit-on-escalation)

Today D5 exits the whole run on the first escalation. Amended behavior:

- On an escalation trigger (executor `NEEDS_DIRECTION`, D3 verify fails twice,
  `PLANNING_NEEDED`), the runner: writes `<escalations-dir>/<card>.md` (unchanged), marks
  the card `escalated` (unchanged), **and moves to the next progressable card** instead of
  exiting.
- **Progressable** = `staged`, and no card it declares in a new optional per-card
  `dependsOn: ["<card-id>", ...]` field is currently `escalated`/`blocked`/unshipped. A
  card whose dependency is parked becomes `blocked` (new status) — parked transitively,
  never started (wall W6). Cards with no `dependsOn` (the common case for trivial batches)
  are independent by declaration.
- The run exits when **no progressable card remains** — all cards are `shipped`,
  `escalated`, or `blocked`. Exit code 2 now means "finished the pass; ≥1 escalation is
  pending" (not "aborted at the first question").
- Everything else in D5 stands: the escalation file is written first and unconditionally;
  the best-effort state commit; answers land in `answers.md`; the runner never answers.

Why escalations still exist even with clear specs/plans (the owner asked): (1) the
executor hits a genuine What/Why ambiguity mid-implementation — reality diverges from what
the plan assumed; (2) D3 verification fails twice — usually broken CI/infra, not a plan
defect; (3) a card's spec/plan file is missing. Rare with good Stage A work, but the path
must exist because the runner is forbidden from judgment (wall W3).

### O5 — Report contract: `campaign-report.json` (+ `.md` twin)

Written to the state file's directory on **every** exit path (done, escalations pending,
STOP, session-incomplete, even argument errors where the state was loadable). This is the
ONLY artifact the orchestrator needs to read — one report per runner invocation, which
composes into the owner's "one report when all loops are done" because the orchestrator
only speaks to the owner after the final round.

```json
{
  "v": 1,
  "campaign": "…",
  "run": { "startedAt": "…", "endedAt": "…", "exitCode": 2, "reason": "escalations_pending" },
  "cards": {
    "B3": { "outcome": "shipped",   "pr": 41, "mergeSha": "…" },
    "B4": { "outcome": "escalated", "escalationFile": "docs/…/escalations/B4.md",
             "question": "one-line digest", "autoAnswerRounds": 1 },
    "B8": { "outcome": "blocked",   "blockedOn": "B4" },
    "A6": { "outcome": "not_reached" }
  },
  "pending": ["B4"],
  "stats": { "shipped": 1, "escalated": 1, "blocked": 1, "notReached": 1 }
}
```

The `.md` twin is the same content rendered for a human — the owner's "way to see what
the blocks are when they come back", readable straight from the target repo without any
session at all.

### O6 — Stage C round-trip: answer, re-trigger, cap

On each exit notification the orchestrator, holding Shaman authority (Mode 2 of the Shaman
contract — answer NEEDS_DIRECTION itself, escalate to the owner only the irreversible few):

1. For each `escalated` card: read the escalation file. If the question is within Shaman
   authority (scope clarifications, How tradeoffs, sequencing) → append a ruling to the
   committed `answers.md` and mark the card re-runnable. If it is owner-only (data shapes,
   product promises, new permissions, privacy — the campaign's `ownerOnly` config list) or
   the Shaman judges it too hard → leave it parked.
2. If any card was answered → re-trigger the runner with `--cards <answered> --include-escalated`
   (plus the full remaining sequence for `not_reached` cards). Each card gets **at most 2
   auto-answer rounds** (wall W7, tracked as `autoAnswerRounds` in the report/state); a
   card still escalating after that parks for the owner — repeated escalation means the
   question is harder than the Shaman judged.
3. When nothing is answerable and nothing is progressable → compose the **final owner
   report**: every card accounted for as shipped (PR, sha — independently D3-verified) or
   blocked (question + why it needs the owner), plus stats and pointers to the report/
   escalation files. This is the ONE message the owner reads.

### O7 — What stays true (non-goals, unchanged walls)

- The runner still never designs, never answers, never relaxes a wall, never runs two
  cards concurrently (v1 sequential; park-and-continue changes *order*, not concurrency).
- The orchestration skill hardcodes nothing environment-specific: repo, state path, model,
  answers path all flow from the owner's directive / campaign docs to CLI flags (wall W1).
- Stage A remains interactive where it matters — the owner can still be consulted during
  planning; the zero-intervention objective starts at the trigger, not before.
- No new merge shapes: state PRs and card PRs merge regular, 2 parents (wall W4).

## 5. Risks

- **Auto-answer quality.** A wrong Shaman ruling ships a wrong card. Mitigations: rulings
  are committed to `answers.md` (auditable, one file); the `ownerOnly` list is campaign
  config the owner writes in Stage A; W7 caps how far auto-answering can run ahead; and D3
  still gates every ship mechanically.
- **Session lifetime vs campaign length.** A 20-card campaign can run for many hours; the
  triggering session may die. Accepted: all state is on disk (O3); any new session
  re-enters via the skill. The report `.md` means even a session-less owner sees status.
- **Dependency declarations are honor-system.** `dependsOn` is only as good as Stage A's
  authorship. An undeclared dependency behaves exactly as today (sequential order), so the
  failure mode is no worse than the shipped runner.
- **The known UNVERIFIED surface carries over.** `gh pr create/merge`/`git push` (the
  runner's mutating path) has still never run against reality. This effort's live-smoke
  acceptance (plan) is the designed place to finally close that — it needs a disposable
  GitHub repo the owner authorizes.
