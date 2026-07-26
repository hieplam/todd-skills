---
name: orchestrate-campaign
description: >-
  Turns one owner directive into ONE final consolidated report, with zero owner intervention
  in between except the irreversible few. Trigger on "orchestration", "orchestrate these ideas",
  "run these N cards", "do these tasks in orchestration", or any request to run a batch of
  roadmap cards unattended end-to-end from any session — the main chat, a Shaman, or a
  Warchief. Use this whenever the ask is "kick off N cards and tell me when they're all
  shipped or blocked", not "build this one card" (that stays the Warchief/Hunter path) and not
  "what should we build" (that's roadmap authorship, What/Why — a different job). This skill
  assumes Shaman authority for the campaign, authors the campaign state file the campaign
  runner requires as input, triggers the runner's CLI in the background, answers its
  escalations into answers.md within Shaman authority (never touching what only the owner may
  decide), re-triggers up to a bounded auto-answer cap, and composes the one owner-facing
  report — independently re-verifying every card the runner claims shipped before repeating
  that claim.
---

# Orchestrate Campaign

This skill is **instructions, not code** — it directs *you*, the invoking session, through the
loop the owner wants: say "orchestration: do these N ideas" once, and get back one report that
accounts for every card as shipped or blocked. You do the judgment (planning, answering,
reporting); the campaign runner (a separate CLI, invoked only through its documented flags and
exit codes below — never by reading its source) does the deterministic, zero-token looping.

## Assume Shaman authority

For the duration of this campaign you act with the authority `agents/shaman.md` describes as
"Mode 2 — run the campaign": you make the ordinary calls yourself and escalate to the owner only
the register (irreversible data shapes, product-promise changes, new permissions/trust surface,
privacy-surface changes). You never write source code and never design How yourself — cards still
go through the Warchief/Hunter chain; your job is running the campaign's outer loop around that.

## Inputs — nothing here is ever hardcoded (wall W1)

Every value below is environment-specific and MUST come from the owner's directive or the
campaign's own docs — never invent or reuse a value from a previous campaign:

| Placeholder | What it is |
| --- | --- |
| `<target-repo>` | The repo root the campaign runs against. |
| `<state-path>` | Where the campaign state JSON lives, relative to `<target-repo>`. |
| `<model>` | The executor model tier passed to each card's session. |
| `<answers-path>` | Where the committed rulings file (`answers.md`) lives, relative to `<target-repo>`. |
| `<escalations-dir>` | Where escalation files are written, relative to `<target-repo>`. |
| `<campaign-slug>` | The campaign's own identifier, used inside the state file. |

`--home` (below) is **computed**, never one of the placeholders above: it is always
`"$(plugins/tribe/scripts/tribe-home.sh <target-repo>)/campaigns/<campaign-slug>"` — `tribe-home.sh`
is the only place that knows the `~/.tribe` key derivation (wall W1: this skill never re-derives
it, and never types a literal `~/.tribe/...` path).

If you catch yourself writing a real repo name, a real path, or a real model name into this
skill's own instructions (as opposed to a value you filled into a live invocation), stop — that
value belongs in the campaign's own docs, not here.

## The loop, stage by stage

### Stage A — Planning (you author the handoff)

1. **Confirm/ideate the cards** (What/Why) with the owner if anything is unclear — this is the
   one part of the loop where the owner may still be present; the zero-intervention objective
   starts at the trigger below, not before.
2. **Choose the authorship mode** for the How docs (specs/plans), per the owner-ruled policy:
   - **Few cards (≲3) or genuinely complex work** → you author the specs+plans yourself. Dispatch
     overhead isn't worth it when the thinking itself is the value.
   - **Many trivial cards (~10–20)** → dispatch one **planning-Warchief** per card (a `warchief`
     dispatch whose job is "author this one card's spec+plan and return them — no
     implementation"), then review and stage what comes back.
   - Record which mode you used as `planning.mode: "shaman"` or `planning.mode: "warchief-fanout"`
     inside the state file (see schema below) — a resuming session needs to know how the docs
     were produced without re-deriving it.
3. **Author `<state-path>` yourself.** Nothing else in the system creates this file — the runner
   requires it as an input but never authors it, and Stage A owns planning artifacts. See "The
   campaign state file" below for the exact schema to write.
4. **Author the `<answers-path>` scaffold** — an empty (or header-only) markdown file. Only you
   (or the owner) ever append rulings to this file, in every stage below — the runner never
   writes to it (wall W3: judgment stays in sessions, never migrates into the runner).
5. **Land the docs PR** (state file + answers scaffold + specs/plans) to `<target-repo>`'s master
   via `gh pr merge --merge`. Cards are now `staged`.

#### The campaign state file (`<state-path>`)

The runner README's own `## State file schema` section is the **authoritative** contract for
this schema (field-by-field types, required/optional, and the load-time validation errors) —
this skill depends on that documentation, never on the runner's source, per the owner's rule to
depend on a capability's contract rather than keep a private copy of it. The shape looks like
this — a short worked example for this skill's own convenience, not a competing specification;
every optional field may simply be omitted rather than written as `null`/`[]` when unused:

```json
{
  "v": 1,
  "campaign": "<campaign-slug>",
  "planning": { "mode": "shaman" },
  "mergePolicy": "<e.g. \"regular\" — the merge strategy card PRs must use>",
  "sequence": ["<card-id>", "<card-id>", "..."],
  "schemaLockPaths": ["<path whose diff must stay empty unless a card's plan opts out>"],
  "docsOnlyPaths": ["<path prefix treated as docs-only for the runner's flake waiver>"],
  "ownerOnlyEscalations": ["<trigger name that must always escalate to the owner>"],
  "cards": {
    "<card-id>": {
      "status": "staged",
      "spec": "<path to the card's spec.md, or null>",
      "plan": "<path to the card's plan.md, or null>",
      "branch": null,
      "baseSha": null,
      "pr": null,
      "mergeSha": null,
      "sessionId": null,
      "updatedAt": null,
      "dependsOn": ["<other-card-id-this-one-must-not-start-before>"],
      "autoAnswerRounds": 0
    }
  }
}
```

- `sequence` is the dependency-ordered card order; every id in it (and every id named in a
  `dependsOn`) must have a matching entry under `cards`.
- Every card you write starts `"status": "staged"`, `"autoAnswerRounds": 0`, and no `dependsOn`
  unless that card genuinely must not start before another one ships — an undeclared dependency
  behaves as pure sequential order (today's default), so only declare one you mean.
- `ownerOnlyEscalations` is *your* Stage-A authored list — carry over the roadmap's own
  Escalation register verbatim (irreversible data shapes, product-promise changes, new
  permissions, privacy). A trigger name on this list escalates to the owner unconditionally in
  Stage C, no matter how confident you are that you could rule on it yourself.
- `planning.mode` and any other field beyond the ones shown above are preserved by the runner
  across every read/write, so it is safe to carry extra campaign bookkeeping in the state file if
  you need it.

### Stage B — Trigger the runner (background)

The runner is a CLI in the same plugin; you compose with it **only through its documented flags
and exit codes** — never by reading or naming its source files.

**First, resolve the runner's own location — never assume a bare relative path resolves.** This
skill can be triggered from ANY session (§O1), whose working directory is normally
`<target-repo>` — the campaign you're running, not wherever this skill's own plugin happens to
live. A bare relative script path only works by accident, when your shell's cwd happens to be
this plugin's own repo; it fails everywhere else.

**Do not hand-write the resolution — run the bundled resolver.** It ships beside this file, so
`<skill-dir>` is the base directory announced when this skill loaded:

```sh
runner_dir="$(bash "<skill-dir>/resolve-runner.sh")" || exit 1
```

- On success it prints the runner directory's **absolute** path and exits 0, having already proven
  `run.ts` exists there. It checks `$CLAUDE_PLUGIN_ROOT` first (a native/marketplace-cached
  install, where `scripts/` is a sibling of `skills/`), then locates itself through the symlink a
  local install creates — covering both install shapes.
- On failure it prints **nothing** to stdout and exits 3 with a named diagnostic on stderr. Take
  that exit at face value: surface the diagnostic to the owner and stop. **Never substitute a
  guess or a bare relative path** — that is the one failure this resolver exists to make
  impossible, so re-introducing it by hand defeats the purpose.

Why a script rather than a line of shell here: the expression this replaced failed *open*. On a
machine where the skill was not installed under `~/.claude/skills`, `readlink -f` printed nothing
and exited 1; `$(…)` swallowed the exit code, `dirname ""` returned `.`, and the whole thing
collapsed to `./scripts/runner` — resolved against the target repo. `scripts/tests/test-fresh-machine.sh`
holds that wall.

This never touches your own working directory and never requires a `cd` — `--repo <target-repo>`
(unchanged, below) is what points every run at its actual target; the runner sets its own `cwd`
for every `git`/`gh` call from that flag, never from your shell's cwd. Use `$runner_dir/run.ts` as
the script path in every invocation that follows.

**Then preflight the machine — once per campaign, before the first real run.** The runner shells
out to `bun` and `gh` and drives the Agent SDK; each is provisioned per machine, so a fresh clone
can install cleanly and still fail hours into a run:

```sh
bash "$(dirname "$(dirname "$runner_dir")")/scripts/doctor.sh"
```

It exits 0 when every prerequisite is present, or exits 1 naming each gap and its remedy. On a
non-zero exit, relay the gaps to the owner and stop — do not start a campaign on a machine that
cannot finish it.

1. **Always `--dry-run` first** — zero side effects (no lock acquired, nothing written, no
   session spawned). Sanity-check the derived next action before committing to a real run:

   ```sh
   bun "$runner_dir/run.ts" \
     --repo <target-repo> \
     --state <state-path> \
     --model <model> \
     --answers <answers-path> \
     --escalations-dir <escalations-dir> \
     --home "$(plugins/tribe/scripts/tribe-home.sh <target-repo>)/campaigns/<campaign-slug>" \
     --dry-run
   ```

2. **Then launch the real run in the background** (same flags, no `--dry-run`). Record the exact
   command, the start time, and the log location in your own working notes — you will need them
   if this session ends before the run does.

   ```sh
   bun "$runner_dir/run.ts" \
     --repo <target-repo> \
     --state <state-path> \
     --model <model> \
     --answers <answers-path> \
     --escalations-dir <escalations-dir> \
     --home "$(plugins/tribe/scripts/tribe-home.sh <target-repo>)/campaigns/<campaign-slug>"
   ```

   The harness notifies you when a background command exits — treat that notification itself as
   the "report is ready" signal. Do not poll or guess; wait for it.

3. **On the exit notification, read `campaign-report.json`** next to the state file. **The exit
   code is a hint, the report is the truth** — always read the report before deciding what to do
   next, even if the exit code alone looks final.

#### The runner's CLI contract (flags, exit codes — the only interface this skill uses)

| Flag | Required | Meaning |
| --- | --- | --- |
| `--repo` | yes | Target repo root. |
| `--state` | yes | Campaign state JSON path, relative to `--repo`. |
| `--model` | yes | Executor model tier. |
| `--answers` | yes | Path to the rulings file, relative to `--repo`. |
| `--escalations-dir` | yes | Path to the escalations directory, relative to `--repo`. |
| `--home` | yes | The campaign's machine-local operational home — always computed as `"$(plugins/tribe/scripts/tribe-home.sh <target-repo>)/campaigns/<campaign-slug>"`, **never** typed literally (`tribe-home.sh` is the only place that knows the `~/.tribe` key derivation). |
| `--logs-dir` | no | Session log destination. |
| `--session-timeout` | no | Wall-clock abort per executor session. |
| `--dry-run` | no | Derive and print the next action with zero side effects. |
| `--cards` | no | Comma-separated card ids — restrict the loop to only these. |
| `--max-cards` | no | Stop after processing this many cards this run. |
| `--include-escalated` | no | Reconsider a card whose escalation file already exists. |

The six required flags have **no default** — omitting any of them is a usage error, not a value
worth guessing.

| Exit code | Meaning |
| --- | --- |
| `0` | Ran to done, or `--dry-run` completed, or `STOP` was present at startup. |
| `1` | `.runner.lock` is held by a live process, or a CLI argument error. |
| `2` | The pass finished; **at least one escalation is pending.** This is NOT "aborted at the first question" — the runner parks the escalated card and keeps going, and only exits once nothing else is progressable. |
| `3` | A spawned session ended incomplete (no further resume path); state was already recorded, so the next run resumes it automatically — this is not a human-decision escalation. |

`campaign-report.json` (+ its human-readable `campaign-report.md` twin) is written next to the
state file on **every** real exit path above — but **not** on `--dry-run` (zero side effects) and
**not** on a refused start (exit `1` from a held lock). Its per-card `outcome` is one of `shipped
| escalated | blocked | not_reached`; a `shipped` card carries `pr`/`mergeSha`; an `escalated`
card carries `escalationFile`, a one-line `question` digest, and `autoAnswerRounds`; a `blocked`
card carries `blockedOn`. Top-level `pending` lists every card still needing the owner, and
`stats` totals each outcome. Treat this JSON (never the exit code alone, never your own memory of
what you dispatched) as the single source of truth for "what happened."

`.runner.lock` (next to the state file) makes a double-trigger safe — a second instance refuses
to start rather than double-spawning sessions. `STOP` (also next to the state file) is the
owner's manual brake: drop it there to have the next run exit cleanly before touching a card, or
to have an in-flight run finish its current card and stop before starting the next.

### Stage C — Round-trip: answer, re-trigger, cap (per design §O6)

On every exit notification where the report shows `pending` cards:

1. **For each `escalated` card**, read its `escalationFile`. Two outcomes:
   - **Within your Shaman authority** (scope clarifications, How tradeoffs, sequencing) — append
     your ruling to `<answers-path>` yourself (this is the only writer of that file besides the
     owner; the runner itself never writes there — wall W3). Note the card as answered.
   - **Owner-only** (anything on the state file's own `ownerOnlyEscalations` list — data shapes,
     product promises, new permissions, privacy) **or genuinely too hard to call** — leave it
     parked. Never rule on an owner-only trigger yourself, no matter how confident you are.
2. **If you answered at least one card**, re-trigger the runner scoped to exactly the cards that
   can now progress — the ones you just answered plus every `not_reached` card from the report
   (so the rest of the sequence keeps moving, not just the answered card):

   ```sh
   bun "$runner_dir/run.ts" \
     --repo <target-repo> \
     --state <state-path> \
     --model <model> \
     --answers <answers-path> \
     --escalations-dir <escalations-dir> \
     --home "$(plugins/tribe/scripts/tribe-home.sh <target-repo>)/campaigns/<campaign-slug>" \
     --cards <answered-card-id>,<...>,<not-reached-card-id>,<...> \
     --include-escalated
   ```
   (`$runner_dir` — resolved once in Stage B; re-use it here rather than re-resolving. `--home`
   resolves to the SAME campaign home every time — it is re-computed rather than cached because
   `tribe-home.sh` is a pure function of `<target-repo>`, so this is not a fresh value.)

3. **Track `autoAnswerRounds` per card and enforce the cap of 2** (wall W7). Before answering an
   escalation, check that card's `autoAnswerRounds` in the latest report: if it is already `2`,
   do NOT answer it again — leave it parked for the owner unconditionally. Repeated escalation on
   the same card means the question is harder than you judged the first time; a third
   auto-answer attempt is exactly the runaway loop this cap exists to prevent (an unattended
   orchestrator that keeps guessing at a question it doesn't understand, burning tokens
   overnight against the runner with nobody awake to notice).
4. **Repeat Stage B → Stage C** until an exit notification's report shows nothing you can answer
   and nothing progressable remains (every card is `shipped`, or parked as `escalated`/`blocked`
   with no further auto-answer round available).

## Stage D — The one final owner report

Once nothing more is answerable or progressable, read the **last** `campaign-report.json` and
build the single message the owner reads:

1. **For every card the report marks `shipped`, independently re-verify it before repeating the
   claim.** Invoke the **`verify-shipped` skill by name** (never by reading or calling its script
   path directly — depend on its contract, not its implementation) with that card's `pr` and its
   worktree path. This is the design's no-cascade read: the runner's own claim that a card
   shipped is not evidence on its own. Treat a `verify-shipped` failure as `blocked`, not
   `shipped`, in your final report.
2. **Compose ONE report** to the owner, covering every card in the campaign:
   - **Shipped** — PR number, merge sha, and the `verify-shipped` verdict.
   - **Escalated / blocked** — the question (or `blockedOn` dependency), why it needs the owner,
     and how many auto-answer rounds it already used.
   - Overall `stats` (shipped / escalated / blocked / not-reached counts) and pointers to the
     report files and escalation files, so the owner can go deeper without you re-deriving
     anything.

This is the ONE message the owner reads — no partial status updates in between beyond the
irreversible escalations the register requires.

## A campaign can outlive this session

A multi-card campaign can run for hours; the session that triggered it may not still be open
when it finishes. That is fine by design — **every piece of state lives on disk**: the state
JSON, the report, the escalation files, `answers.md`, and the session logs. If you are a *new*
session picking this up cold, do not try to reconstruct anything from a prior conversation:
re-enter through this same skill, read the latest `campaign-report.json` next to `<state-path>`,
and continue from Stage C (or Stage B, if nothing has been triggered yet). You are always a
*viewer and answerer* of state that lives on disk — the running process and its memory never
live inside you.

## Walls this skill exists to hold

- **W1 — stateless.** No repo, path, model, or campaign value is ever written into this file
  itself; every one of those is a placeholder filled in at invocation time.
- **W3 — judgment stays in sessions.** `answers.md` is written only by you (a session) or the
  owner — never by the runner. If you ever see the runner's own commits touching that file,
  something is badly wrong; stop and report it rather than continuing the loop.
- **W7 — bounded auto-answer.** At most 2 auto-answer rounds per card. A card still escalating
  after that parks for the owner, full stop — do not attempt a third ruling.
