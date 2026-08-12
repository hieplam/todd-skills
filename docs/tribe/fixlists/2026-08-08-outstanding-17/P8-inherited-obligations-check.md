# P8 — inherited-obligations cross-check for batch-authored spec waves

- **Status:** RATIFIED 2026-08-12 (delegated).
- **Incident:** log lines 299–314. B13's design doc explicitly handed an obligation to
  "B14's own future spec" (b13-related-words-design.md:869-871); B14's spec — authored the
  SAME DAY — never received it. Skinner B caught it at implementation time, costing two
  escalation rounds (rulings R6, R7) and a follow-up card (B16).

## Decision

Spec-wave authoring gains a mandatory cross-check: every outbound handoff sentence in any
spec (existing or in the wave) must be acknowledged by the receiving spec. A grep-based
helper surfaces candidates; the Shaman confirms coverage and commits the ledger with the
wave.

## Implementation guide (fresh session, smaller model)

### Step 1 — helper script `plugins/tribe/scripts/check-spec-handoffs.sh`

Bash script, args: `check-spec-handoffs.sh <specs-dir> [<more-dirs>...]`.

- Greps all `*.md` under the given dirs, case-insensitive, for handoff phrases —
  one `grep -rinE` with this pattern (extend freely at implementation):

  ```
  deferred to|deferred until|handed to|hands off to|future spec|own spec will|
  out of scope for this card.*(spec|card)|will be addressed (in|by)
  ```

- Output: one line per hit — `<file>:<line>: <matched text>` — followed by a summary
  count. Exit 0 always when only listing; add `--strict` flag: exit 1 if there are hits
  and no `handoffs.md` ledger file exists next to the specs.
- The script FINDS CANDIDATES; it does not judge. Judgment is the Shaman's (step 3).
- Make it executable; follow the style of the sibling scripts in
  `plugins/tribe/scripts/` (e.g. `archive-card.sh` for arg handling).
- **Installer:** check `install.sh` (repo root) and `plugins/tribe/install.sh` — if either
  enumerates scripts individually, add this one (repo rule: new scripts must be fully
  installed by install.sh).

### Step 2 — ledger convention

`handoffs.md`, committed next to the wave's specs:

```
# Handoff ledger — <wave name>
| From (spec:line) | Obligation | Receiving spec | Acknowledged at |
```

Every script hit either appears as a row (with the receiving spec's section reference in
"Acknowledged at") or is explicitly listed under a "Non-obligations" heading with a
one-line reason (false positive).

### Step 3 — wire into the authoring flow (docs edits)

- `plugins/tribe/skills/orchestrate-campaign/SKILL.md`: in Stage A (spec/plan authoring
  or adoption — search "Stage A"), add a numbered step: run
  `check-spec-handoffs.sh` over the wave's spec dir + the dir of already-shipped specs;
  produce/refresh `handoffs.md`; a wave with unacknowledged handoffs does not launch.
- `plugins/tribe/agents/shaman.md`: in the roadmap/authoring mode section, add the
  obligation as concept (one paragraph): batch-authored specs are written blind to each
  other — the handoff ledger is what makes obligations survive the batch.

### Acceptance

Running the script over the ai-dict specs of the 08-08 campaign flags
b13-related-words-design.md:869-871 ("B14's own future spec") — the exact dropped handoff
that cost rulings R6/R7.
