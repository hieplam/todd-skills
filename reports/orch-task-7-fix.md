# Task 7-fix report — W-F7: one schema source of truth, document `planning`

Fix Hunter report to the Warchief. Repo root: `/Users/todd.lam/WORK/_TestScripts/todd-skills`.
Worked directly on `feat/campaign-orchestration`, HEAD `8835d0f` at start (no worktree/new
branch, per brief; sole writer to this branch for the duration of this task).

## Finding W-F7 — reproduced first, both parts

Per the brief's fixer-mode rule, a "missing/stale doc claim" finding is reproduced by running
the named check and citing `file:line` — the absence/staleness itself IS the reproduction.

### Part 1 reproduction — the stale claim, present before the fix

```
$ grep -n "does not yet show this schema\|known gap" plugins/tribe/skills/orchestrate-campaign/SKILL.md
80:The campaign runner's own documentation does not yet show this schema (a known gap — see this
```
(cited at `SKILL.md:80`, confirmed present before any edit). Meanwhile
`plugins/tribe/scripts/runner/README.md:43-146` already carries a full `## State file schema`
section (top-level field table, per-card field table, worked example, validation-error table) —
landed by Task 5, after Task 4's `SKILL.md` text was written. The claim was true when written,
false now. Reproduced: TRUE, fix required.

### Part 2 reproduction — `planning` absent from the README's own top-level table

Read `README.md`'s "Top-level fields" table (`README.md:56-65`, before this fix) field by
field: `v`, `campaign`, `mergePolicy`, `sequence`, `schemaLockPaths`, `docsOnlyPaths`,
`ownerOnlyEscalations`, `cards` — no `planning` row. Cross-checked against:

- `docs/superpowers/specs/2026-07-16-campaign-orchestration-design.md:130-131` (§O2): *"The
  chosen mode is recorded in the campaign state (`planning: { mode: "shaman" |
  "warchief-fanout" }`) so a resuming session knows how the docs were produced."* — the design
  requires this field to exist in Stage-A-authored state.
- `plugins/tribe/skills/orchestrate-campaign/SKILL.md`'s own worked example already writes
  `"planning": { "mode": "shaman" }` (line 88, unchanged by this fix).
- `README.md:48` (before fix) claimed: *"This section documents the schema completely enough to
  author a valid file from this README alone"* — yet a Shaman following the README alone would
  never learn to write `planning`, contradicting that claim's stated purpose (author *this*
  design's Stage-A files, not merely a zod-legal file).

Reproduced: TRUE (the field is genuinely absent from the table I read at those line numbers),
fix required.

## Verification of every fact before writing anything (brief's "verify, do not assume")

- **`state.ts` schema is `looseObject` and declares no `planning` key** — confirmed by reading
  `plugins/tribe/scripts/runner/state.ts:83-115`: `CardSchema = z.looseObject({...})` and
  `CampaignStateSchema = z.looseObject({ v, campaign, mergePolicy, sequence, schemaLockPaths,
  docsOnlyPaths, ownerOnlyEscalations, cards })` — no `planning` field declared anywhere, and the
  comment at `state.ts:85-87` states plainly: *"`looseObject` (zod v4) keeps unknown keys on the
  parsed object instead of stripping them ... required so a load -> serialize round-trip
  preserves fields this runner doesn't itself know about."*
- **§O2's exact wording and the two mode values** — confirmed verbatim at
  `docs/superpowers/specs/2026-07-16-campaign-orchestration-design.md:121-135` (quoted above).
  Exactly two values: `"shaman"`, `"warchief-fanout"`.
- **The README's schema-section intro sentence** — confirmed at (pre-fix) `README.md:48`, quoted
  above; made true by adding the `planning` row (below).

## The fix

### Part 1 — `SKILL.md`, before/after (exact text)

**Before** (`SKILL.md:80-82`):
```
The campaign runner's own documentation does not yet show this schema (a known gap — see this
skill's report to the Warchief). Author exactly this shape; every optional field may simply be
omitted rather than written as `null`/`[]` when unused:
```

**After:**
```
The runner README's own `## State file schema` section is the **authoritative** contract for
this schema (field-by-field types, required/optional, and the load-time validation errors) —
this skill depends on that documentation, never on the runner's source, per the owner's rule to
depend on a capability's contract rather than keep a private copy of it. The shape looks like
this — a short worked example for this skill's own convenience, not a competing specification;
every optional field may simply be omitted rather than written as `null`/`[]` when unused:
```

The worked JSON example immediately below (already correct, already includes `"planning": {
"mode": "shaman" }`) is unchanged — kept as the brief allows ("you may keep a short worked
example... an example is an illustration, not a competing specification"). No second
field-by-field table was added or kept in the skill; the bullet notes immediately below the
example (sequence/status/ownerOnlyEscalations/planning.mode authoring guidance) are Stage-A
*authoring* guidance specific to what the Shaman-authority session must do, not a restatement of
the README's type/required-ness table, so they were left untouched — removing them would be
scope creep past W-F7.

### Part 2 — `README.md`, before/after (exact text)

**Before** (`README.md`'s top-level table had no `planning` row; `campaign` was directly
followed by `mergePolicy`):
```
| `campaign` | `string` | yes | Free-form campaign name/id. Echoed verbatim as `campaign` in the report contract. |
| `mergePolicy` | `string` | yes | Free-form; carried through into every executor brief, not itself interpreted by this runner. |
```

**After** (new row inserted between them, ordering matches `SKILL.md`'s own example):
```
| `campaign` | `string` | yes | Free-form campaign name/id. Echoed verbatim as `campaign` in the report contract. |
| `planning` | `{ mode: "shaman" \| "warchief-fanout" }` | **optional** | Records which Stage-A authorship mode produced this campaign's specs/plans (design §O2) — `"shaman"` when the orchestrating session authored the How docs itself, `"warchief-fanout"` when it dispatched one planning-Warchief per card — so a session resuming the campaign later knows without re-deriving it. Not declared in `state.ts`'s `CampaignStateSchema`/`CardSchema` at all: both use `z.looseObject`, which preserves unknown top-level keys through a load→save cycle instead of stripping them (the same property that keeps the v1 byte-identical round-trip true), so `planning` — and any future campaign metadata a caller invents — survives even though the runner itself never reads or interprets it. |
| `mergePolicy` | `string` | yes | Free-form; carried through into every executor brief, not itself interpreted by this runner. |
```

Facts asserted in the new row, each individually verified above: optional (no schema
declaration), the two literal mode values (§O2), who writes it and who reads it (Stage-A author
writes it; a resuming session reads it; the runner itself never reads/interprets it), and the
survival mechanism (`z.looseObject`'s unknown-key passthrough — the same mechanism the file
already documents for the v1 byte-identical round-trip guarantee).

The README's own worked example (`README.md`'s "Worked example" section) was left unchanged —
the brief's fix target was the top-level field *table*, not the example; the mandatory
end-to-end proof below adds `planning` to a state file built from the example, which is exactly
what the brief's proof section asks for.

## Live end-to-end proof (mandatory, F12-style, with `planning` included)

Built a scratch repo, wrote a state file combining the README's worked example (`A1` card) plus
a `planning` field, touched the spec/plan files it references, ran the real runner CLI with
`--dry-run` (no mocks):

```
$ git init -q  (scratch repo)
$ mkdir -p docs/cards && touch docs/cards/A1-spec.md docs/cards/A1-plan.md && git add -A && git commit -q -m init

$ cat campaign-state.json
{
  "v": 1,
  "campaign": "widget-export",
  "planning": { "mode": "shaman" },
  "mergePolicy": "regular-merge-only",
  "sequence": ["A1"],
  "schemaLockPaths": ["src/schema/"],
  "docsOnlyPaths": ["docs/"],
  "ownerOnlyEscalations": ["data-shape-change"],
  "cards": {
    "A1": {
      "status": "staged",
      "spec": "docs/cards/A1-spec.md",
      "plan": "docs/cards/A1-plan.md",
      "branch": null, "baseSha": null, "pr": null, "mergeSha": null,
      "sessionId": null, "updatedAt": null
    }
  }
}

$ bun plugins/tribe/scripts/runner/run.ts \
    --repo <scratch-repo> --state campaign-state.json --model sonnet \
    --answers answers.md --escalations-dir escalations --dry-run
{
  "cardId": "A1",
  "phase": {
    "kind": "fresh"
  }
}
$ echo "exit code: $?"
exit code: 0
```

A real, runnable phase (`{"cardId": "A1", "phase": {"kind": "fresh"}}`) — `planning` does not
break parsing, exactly as the brief expects. `--dry-run` writes nothing (by design, zero side
effects), so the state file on disk afterward is untouched, `planning` included.

**Additional load→serialize round-trip check** (direct call to `loadState`/`serializeState` from
`state.ts`, no mocks, against the same fixture) — went beyond the `--dry-run` proof to confirm
`planning` specifically survives a real parse→reserialize cycle, not merely a no-op dry run:

```
loaded planning field: {"mode":"shaman"}
```

The reserialized JSON also carries `"planning": { "mode": "shaman" }` — present and
value-correct. One honest caveat: the reserialized field is **relocated to the end of the
top-level object**, not byte-identical in position to the source, because zod's `looseObject`
emits schema-declared keys first and then appends unknown keys in a second pass. This does not
contradict anything the README now states — the README's byte-identical round-trip claim
(`README.md:50-52`) is scoped to *"a pre-existing v1 file with **none of** them [the new
fields]"*, which `planning` is not; a file that carries an unknown top-level field was never
promised positional byte-identity, only survival of the field itself. I did not add a
byte-position claim to the README because it wasn't asked for and the existing test suite
(`state.test.ts`'s "preserves unknown top-level and per-card fields across a load -> serialize
cycle") already only asserts value-preservation, not position — matching what I verified.

## Gates

1. **Tests/tsc unchanged (docs-only task):**
   ```
   $ bun test   (from plugins/tribe/scripts/runner/)
   172 pass
   0 fail
   450 expect() calls
   Ran 172 tests across 8 files. [233.00ms]

   $ bunx tsc --noEmit
   (no output — clean)
   ```
   Identical to the pre-fix baseline (172/0, clean) — confirms no code was touched, only docs.

2. **W1 — no hardcoded paths:**
   ```
   $ grep -rn "ai-dict\|todd-skills\|/Users/" plugins/tribe/skills/orchestrate-campaign/ plugins/tribe/scripts/runner/README.md
   (no output, grep exit 1 — empty, as required)
   ```

3. **Contract-only — SKILL.md names no runner source file:**
   ```
   $ grep -rn "loop\.ts\|state\.ts\|report\.ts\|github\.ts\|verify\.ts\|types\.ts" plugins/tribe/skills/orchestrate-campaign/
   (no output, grep exit 1 — empty, as required)
   ```
   (README.md is allowed and does cite `state.ts`/`loop.ts`/`report.ts` elsewhere — it is the
   contract document itself, not gated by this check.)

4. **Stale claim gone:**
   ```
   $ grep -n "does not yet show this schema\|known gap" plugins/tribe/skills/orchestrate-campaign/SKILL.md
   (no output, grep exit 1 — empty, as required)
   ```

5. **`planning` now documented in the README's field table:**
   ```
   $ grep -n "planning" plugins/tribe/scripts/runner/README.md
   47:planning; see `plugins/tribe/agents/shaman.md`'s Mode 2). This section documents the schema
   60:| `planning` | `{ mode: "shaman" \| "warchief-fanout" }` | **optional** | ... |
   ```

## Scope discipline

Touched exactly two files: `plugins/tribe/skills/orchestrate-campaign/SKILL.md` (one paragraph
replaced) and `plugins/tribe/scripts/runner/README.md` (one table row inserted). No code files
touched (`state.ts`, `loop.ts`, `report.ts`, `run.ts`, `types.ts`, tests — all untouched, gate 1
proves it). `.claude/state/campaign-orchestration.md` (the Warchief's own file, already modified
in the working tree before this task started) was left alone and is not part of this commit. No
plan-file checkboxes exist in `docs/superpowers/plans/2026-07-16-campaign-orchestration.md` (it
uses prose task numbering, not `- [ ]` markdown checkboxes — confirmed by grep, no matches) so
none were ticked; the brief itself also scoped the commit to exactly these two files plus this
report.

## Ledger (fixer-mode disposition)

- **W-F7 Part 1 (stale "not yet documented" claim in `SKILL.md`): FIXED.** Reproduced via grep
  citing the stale line (`SKILL.md:80`, quoted above) before the fix; fixed by replacing the
  paragraph to name the README's `## State file schema` section as authoritative. Reproduction
  and fix land in this same commit.
- **W-F7 Part 2 (`planning` missing from README's top-level table): FIXED.** Reproduced by
  reading the table's exact row list (`v`, `campaign`, `mergePolicy`, `sequence`,
  `schemaLockPaths`, `docsOnlyPaths`, `ownerOnlyEscalations`, `cards` — no `planning`) before the
  fix, cross-checked against §O2's exact requirement and `SKILL.md`'s own example; fixed by
  inserting the `planning` row with a fact-checked description. Reproduction and fix land in this
  same commit, plus a live `--dry-run` proof and a direct `loadState`/`serializeState` check
  confirming the field survives.

## Where I disagree with (or want to flag on) the ruling

Nothing in the ruling is wrong as far as I can verify — every fact checked out exactly as
briefed (`looseObject`, no schema-declared `planning`, §O2's two values, the runner never reading
the field). One thing worth the Warchief's attention, not a disagreement: the load→serialize
round-trip relocates unknown top-level keys to the end of the object (verified above) — the
README's byte-identical claim already only covers files with *none* of the new fields, so this
doesn't make anything in the README false, but if a future doc pass ever wants to claim
byte-identical position for files *carrying* `planning`, that would be a false claim today and
would need a `state.ts` change (e.g. preserving original key order), not a doc fix. I did not
raise this to a finding since nothing currently claims it and the brief didn't ask about it — just
flagging it as something I noticed while doing the mandated proof.
