# Task 4/6 report — `orchestrate-campaign` skill (spec §O1, §O3, §O6)

Hunter report to the Warchief. Branch: `feat/campaign-orchestration`, worked directly on it,
checked out at HEAD `5511492` (no worktree/new branch, per brief). Repo root:
`/Users/todd.lam/WORK/_TestScripts/todd-skills`. Owned files only:
`plugins/tribe/skills/orchestrate-campaign/` — did not touch
`plugins/tribe/scripts/runner/README.md` or `plugins/tribe/agents/*.md` (Task 5's lane, running
in parallel).

## Amendment — W-F6 fix (Warchief audit of `477408f`)

The Warchief's audit found a real defect none of my static gates could catch: Stage B's
documented commands invoked the runner by a **bare repo-relative path**
(`bun plugins/tribe/scripts/runner/run.ts`), which only resolves when the invoking session's
shell `cwd` happens to already be the `todd-skills` repo root. Since §O1's whole premise is that
this skill triggers from ANY session — ordinarily one whose `cwd` is the **target** repo, not
this plugin's own repo — the skill's very first Stage B instruction failed everywhere except by
accident. Reproduced exactly as the audit described (see "Live proof" below).

**Fix:** Stage B now opens with a runner-location **resolution step**, modeled byte-for-byte on
the same two-tier technique `agents/shaman.md` already uses to resolve its own sibling
`heartbeat-check.sh` (`$CLAUDE_PLUGIN_ROOT` first, then a `readlink -f` walk of this skill's own
installed symlink back to the plugin root) — reusing an existing, already-battle-tested pattern
rather than inventing a new one:

```sh
runner_dir="${CLAUDE_PLUGIN_ROOT:-}/scripts/runner"
[ -f "$runner_dir/run.ts" ] || runner_dir="$(dirname "$(dirname "$(readlink -f ~/.claude/skills/orchestrate-campaign)")")/scripts/runner"
```

All three `bun … run.ts` invocations in the skill (Stage B's dry-run + real-trigger, Stage C's
re-trigger) now read `bun "$runner_dir/run.ts"` instead of the bare relative path. A third
explicit case is stated for when neither tier resolves: ask the owner where the plugin is
installed rather than silently guessing or falling back to the broken relative path. `--repo
<target-repo>` is untouched — it is what still points every run at its actual target; the
resolution step is explicit that this never requires a `cd` (the runner's own `--repo`-derived
`cwd` for every `git`/`gh` call, confirmed by re-reading `loop.ts`'s exec call sites, which all
pass `cwd: repoRoot`/`resolved.repoRoot` explicitly — never the shell's own cwd).

`~/.claude/skills/orchestrate-campaign` (the fixed install location this skill's own symlink
lives at) is not a W1 violation: it is the fixed, universal Claude Code install location for
*this skill itself* (exactly the same class of reference `shaman.md` already makes to
`~/.claude/agents/shaman.md` in its own resolution fallback), not an environment-specific
value belonging to any particular *campaign* or *target repo*. Re-ran the W1 grep after the edit
to confirm mechanically, not just by argument (see gates below).

### Live proof (mandatory — a static grep is not evidence for this class of bug)

**Step 1 — reproduced the bug** exactly as the audit reported, from a scratch target repo outside
`todd-skills`:

```
$ cd /tmp/scratch-target-repo && pwd
/tmp/scratch-target-repo
$ bun plugins/tribe/scripts/runner/run.ts \
    --repo /tmp/scratch-target-repo --state campaign/campaign-state.json \
    --model sonnet --answers campaign/answers.md --escalations-dir campaign/escalations --dry-run
error: Module not found "plugins/tribe/scripts/runner/run.ts"
```

**Step 2 — ran the fixed resolution + the fixed Stage B command, copy-pasted from the amended
`SKILL.md` itself**, from the same non-repo `cwd`, against a scratch campaign state
(`/tmp/scratch-target-repo/campaign/campaign-state.json`, one card `A1`, `branch: null`, git-init'd
but otherwise untouched by this repo):

```
$ cd /tmp/scratch-target-repo && pwd
/tmp/scratch-target-repo
$ runner_dir="${CLAUDE_PLUGIN_ROOT:-}/scripts/runner"
$ [ -f "$runner_dir/run.ts" ] || runner_dir="$(dirname "$(dirname "$(readlink -f ~/.claude/skills/orchestrate-campaign)")")/scripts/runner"
$ echo "resolved runner_dir=$runner_dir"
resolved runner_dir=/Users/todd.lam/WORK/_TestScripts/todd-skills/plugins/tribe/scripts/runner
$ bun "$runner_dir/run.ts" \
    --repo /tmp/scratch-target-repo --state campaign/campaign-state.json \
    --model sonnet --answers campaign/answers.md --escalations-dir campaign/escalations --dry-run
{
  "cardId": "A1",
  "phase": null,
  "planningNeeded": {
    "cardId": "A1",
    "missing": [
      "spec",
      "plan"
    ]
  }
}
```

Resolves and prints a real dry-run plan (`planningNeeded` is the correct, honest answer here —
the scratch card's `spec`/`plan` genuinely don't exist on disk; this is `deriveCardPhase`/
`nextCard` working exactly as documented, not a fixture error). `$CLAUDE_PLUGIN_ROOT` was unset in
this shell, so the proof exercises the **fallback** tier — the one path most likely to be hit by a
session whose harness didn't set the plugin-root env var, i.e. exactly the local symlink-install
case this repo itself uses.

### Gates re-run after the fix

```
$ ./install.sh tribe
  ok      skill  orchestrate-campaign (already linked)
  ...
Done: 0 linked, 6 already linked, 0 backed up, 0 warning(s).

$ grep -rn "ai-dict\|todd-skills\|/Users/" plugins/tribe/skills/orchestrate-campaign/
(empty, exit 1)

$ grep -rn "loop\.ts\|state\.ts\|report\.ts\|github\.ts\|verify\.ts" plugins/tribe/skills/orchestrate-campaign/
(empty, exit 1)
```

All three still clean. `SKILL.md` is now 311 lines (was 283) — still well under the ~500-line
skill-creator guideline.

Committed as an amendment to `477408f` (same task, unpushed branch) per the Warchief's ruling —
see the amended commit for the final hash.

## Note on TDD / this task's shape

This task's deliverable is **prose instructions** (`SKILL.md`), not executable code — the brief
itself frames it that way ("The skill is *instructions*, not code"). There is no unit under test
in the usual RED→GREEN sense; the provable claims here are the four **grep gates** the brief
names (§ "Gates before committing") plus the install script's own idempotent-link behavior. I
treated each grep gate as the "test": I ran it once against the empty/absent file (implicitly
true — no file existed, so every grep gate passed vacuously) and then against the finished file,
fixing one real gate failure along the way (see "Gate 3 caught a real mistake" below). That is
the closest honest analog to red→green this task has.

## What I created

`plugins/tribe/skills/orchestrate-campaign/SKILL.md` (283 lines) — the only file this task's
brief names. No `scripts/`/`references/`/`assets/` — the skill is pure instructions, so bundling
code would have been scope creep the brief didn't ask for.

### Mapping to spec §O1 / §O3 / §O6

- **§O1 (entry/trigger)** — frontmatter `description` names the exact trigger phrases from the
  spec verbatim: `"orchestration"`, `"orchestrate these ideas"`, `"run these N cards"`,
  `"do these tasks in orchestration"` (gate 4, verified below). Body opens with "Assume Shaman
  authority", matching §O1's "the skill instructs the invoking session to assume Shaman
  authority for the campaign."
- **§O2 (Stage A authorship policy)** — "Stage A — Planning" step 2 states the exact policy
  (few/complex → author yourself; ~10–20 trivial → one planning-Warchief per card) and instructs
  recording `planning.mode: "shaman" | "warchief-fanout"` in the state file.
- **§O3 (trigger contract)** — "Stage B — Trigger the runner (background)" is sequenced exactly
  as §O3 orders it: `--dry-run` first, then the real run in the background, then "on exit
  notification: read the report; the exit code is a hint, the report is the truth" (quoted
  near-verbatim from the design). The "A campaign can outlive this session" section states §O3's
  "all state is on disk … a new session re-enters via the same skill" point explicitly, including
  that a resuming session should NOT try to reconstruct anything from a prior conversation.
- **§O6 (Stage C round-trip)** — "Stage C — Round-trip" implements the exact three-part protocol:
  (1) per-escalated-card decision (Shaman-authority ruling → `answers.md`; owner-only or too-hard
  → leave parked, keyed off the state file's own `ownerOnlyEscalations` list), (2) re-trigger with
  `--cards <answered>,<not_reached> --include-escalated`, (3) enforce the `autoAnswerRounds <= 2`
  cap (W7) by name, with the exact rationale from the design (repeated escalation on the same
  card = the question is harder than judged, not a licence for a third guess).
- Also covers **F12 closure** explicitly: "Stage A — Planning" step 3 states nothing else in the
  system authors the state file, and gives the full schema (see below) so a Shaman-authority
  session has something concrete to write.
- **Stage D (final report + no-cascade read)**: instructs invoking the `verify-shipped` skill
  **by name** (the Skill tool), never its script path, for every `shipped` card before repeating
  the claim in the owner-facing report — the design's explicit "no-cascade read."

## Facts the runner's own README did **not** provide — direct input to Task 5

I checked `plugins/tribe/scripts/runner/README.md` again immediately before writing this report
(`git status --porcelain` confirms Task 5 has not yet touched it as of this commit) and found
**two gaps**, not one:

1. **No state-file schema at all** (the gap the brief already named/expected). Per the brief's
   explicit, scoped permission ("the one place I permit reading the source — and only to report
   the doc gap, not to couple to internals"), I read `plugins/tribe/scripts/runner/state.ts` and
   `types.ts`'s zod/TypeScript shapes to write the schema table embedded in the skill
   (`v`, `campaign`, `mergePolicy`, `sequence`, `schemaLockPaths`, `docsOnlyPaths`,
   `ownerOnlyEscalations`, and every per-card field including the Task 1 additions `dependsOn`/
   `autoAnswerRounds`). The skill's own text flags this as "a known gap" and points back to this
   report rather than silently presenting the schema as already-documented.
2. **No mention of `campaign-report.json`/`.md` anywhere in the README** — not just missing the
   schema, the artifact isn't named at all today (no "Report contract" section, no
   `campaign-report` string anywhere: `grep -n "schema\|campaign-report"
   plugins/tribe/scripts/runner/README.md` → empty, checked immediately before writing this
   report). I did **not** need to read `report.ts` to write the skill's report-contract material
   — the brief itself already handed me the exact vocabulary (`shipped | escalated | blocked |
   not_reached`, `pending[]`, `stats`, `blockedOn`, `escalationFile`, `question`,
   `autoAnswerRounds`) matching spec §O5's frozen JSON shape, so the skill's report-reading
   instructions are grounded in the brief/spec, not in source I read past the one permitted
   exception. Flagging this as a second Task 5 documentation gap regardless — a "Report contract"
   section belongs in the README alongside the exit-code table, and today there is none.

Both gaps mean: today, an orchestrator session reading only the README could not, on its own,
author a valid state file or know the report artifact exists. The skill I wrote is self-contained
against this gap (it embeds the schema and the report vocabulary directly) but it will drift from
the README until Task 5 lands its own documentation — worth a cross-check once Task 5 merges, to
confirm the two documents agree rather than silently diverging into two sources of truth.

## Gates run

### Gate 1 — `./install.sh tribe` installs with zero warnings

```
$ ./install.sh tribe
Installing into /Users/todd.lam/.claude (symlinks -> /Users/todd.lam/WORK/_TestScripts/todd-skills)
tribe:
  ok      agent  hunter.md (already linked)
  ok      agent  shaman.md (already linked)
  ok      agent  skinner.md (already linked)
  ok      agent  tracker.md (already linked)
  ok      agent  warchief.md (already linked)
  linked  skill  orchestrate-campaign
  ok      CLAUDE.md review-agents.md (already present)
  hook    install.sh ran

Done: 1 linked, 5 already linked, 0 backed up, 0 warning(s).
```

`0 warning(s)` — confirmed. `skills/<name>/` is in the whitelist exactly as the brief said, and
the new `orchestrate-campaign` skill linked cleanly on the first run.

### Gate 2 — W1 stateless grep

```
$ grep -rn "ai-dict\|todd-skills\|/Users/" plugins/tribe/skills/orchestrate-campaign/
(no output, exit 1)
```
Empty — no hardcoded repo/path/machine value anywhere in the skill.

### Gate 3 — contract-only grep (caught a real mistake)

First run:
```
$ grep -rn "loop\.ts\|state\.ts\|report\.ts\|github\.ts\|verify\.ts" plugins/tribe/skills/orchestrate-campaign/
plugins/tribe/skills/orchestrate-campaign/SKILL.md:163:#### The runner's CLI contract (flags, exit codes — read this, never `loop.ts`/`state.ts`)
```
My first draft's section header literally named `loop.ts`/`state.ts` — even though the sentence's
*intent* was "don't name these", the literal substring still violated the gate as written (the
gate is dumb-mechanical by design, on purpose: it can't tell intent from citation). I reworded the
header to drop the literal filenames entirely (`"The runner's CLI contract (flags, exit codes —
the only interface this skill uses)"`) and re-ran:
```
$ grep -rn "loop\.ts\|state\.ts\|report\.ts\|github\.ts\|verify\.ts" plugins/tribe/skills/orchestrate-campaign/
(no output, exit 1)
```
Empty. This is the one place a naive first draft drifted toward naming internals (even while
warning against it), which is exactly the kind of mistake a mechanical gate exists to catch
instead of trusting a self-read.

### Gate 4 — trigger phrases present in the description

```
$ grep -n "orchestration" plugins/tribe/skills/orchestrate-campaign/SKILL.md | head -3
5:  in between except the irreversible few. Trigger on "orchestration", "orchestrate these ideas",
6:  "run these N cards", "do these tasks in orchestration", or any request to run a batch of
22:loop the owner wants: say "orchestration: do these N ideas" once, and get back one report that
$ grep -n "orchestrate these ideas" plugins/tribe/skills/orchestrate-campaign/SKILL.md
5:...
$ grep -n "run these N cards" plugins/tribe/skills/orchestrate-campaign/SKILL.md
6:...
$ grep -n "do these tasks in orchestration" plugins/tribe/skills/orchestrate-campaign/SKILL.md
6:...
```
All four trigger phrases appear verbatim inside the frontmatter `description` (lines 5–6).

## Plan-file checkbox note (deviation from the generic Hunter protocol, matching this campaign's own precedent)

`docs/superpowers/plans/2026-07-16-campaign-orchestration.md` contains **no `- [ ]` checkboxes
anywhere** (confirmed: `grep -n "\- \[ \]\|\- \[x\]" docs/superpowers/plans/2026-07-16-campaign-orchestration.md`
→ empty) — this plan tracks tasks via prose ("Commit (N/6)") and the `Tribe-Task: N/6` commit
trailer, not a checkbox list. `git log --oneline -- docs/superpowers/plans/2026-07-16-campaign-orchestration.md`
shows exactly one commit touching that file (its original authoring commit); none of Tasks
1–3's commits (`38f4232`, `35a91e8`, `f05a387`) edited it either — the done-record for this
campaign lives entirely in the commit content + trailers, tracked separately in
`.claude/state/campaign-orchestration.md` (which the Warchief/team-lead owns, not any Hunter — it
was already mid-flight-modified at session start, outside my named file scope). I followed the
same precedent: no plan-file edit in this commit.

## Ambiguities / things a reviewer should challenge

1. **The report-contract README gap (item 2 above) is broader than the brief anticipated.** The
   brief only flagged the *state-schema* gap as expected/pre-authorized reading; I found the
   report-contract section is *also* entirely absent from the README. I did not need to read
   `report.ts` to close this for the skill (the brief's own "Facts you must get RIGHT" section
   already gave me the exact vocabulary), so no rule was bent — but Task 5's scope ("runner
   README: … the report contract") should double as closing this, and I want it on record that it
   isn't a redundant ask.
2. **"Land the docs PR" (Stage A step 5) names a merge policy (regular, no squash) but doesn't
   specify who merges it.** The design doc doesn't say whether the Shaman-authority session merges
   its own Stage A docs PR autonomously or whether that step, too, needs some review gate (the
   `shaman.md` contract is silent on the Shaman ever landing a PR itself — normally the Warchief
   merges). I wrote the instruction as "land the docs PR … via a regular merge" without
   prescribing a mechanism, since the brief and design don't pin one and this felt like a How
   detail the invoking session should resolve contextually (worktree/PR conventions already
   established elsewhere in the repo) rather than something I should invent a specific mechanism
   for. Flagging as a assumption, not a silent decision — if the Warchief wants an explicit
   merge-actor named, that's a design clarification, not something I should guess into the skill.
3. **No product/What-Why decision surfaced.** Everything above is either explicit brief content,
   a documented and gated choice (the header reword), or a flagged doc gap for Task 5/the
   Warchief — nothing here required inventing a What/Why answer.

## Assumptions a reviewer should specifically challenge

- **The state-file schema embedded in the skill is my own reading of `state.ts`/`types.ts`**,
  exactly as the brief pre-authorized, but it is still *my* transcription, not a copy-paste of an
  authoritative doc (none exists yet). If Task 5's README schema section ends up shaped even
  slightly differently (field order, an extra example field), the two documents will disagree
  until reconciled — worth a diff-check once Task 5 lands.
- **`ownerOnlyEscalations` field name** — taken directly from `state.ts`'s `CampaignStateSchema`/
  `types.ts`'s `CampaignState` interface (the exact field name), used in the skill exactly as
  found. If Task 5 or a future Warchief ruling renames this field, the skill's schema table and
  its Stage-C "check the state file's own `ownerOnlyEscalations` list" instruction would both need
  updating together.
- **I did not write a bundled `scripts/`/`references/` directory** — the brief's task text says
  "Files: … SKILL.md" (singular), so I treated any bundled resource as out of scope. If a future
  reviewer wants the runner command/flags table split into a `references/` file (per skill-creator
  convention for files nearing the 500-line guideline), that's a separate, deliberate follow-up —
  283 lines is well under the ~500-line guideline today, so I judged a split premature.
