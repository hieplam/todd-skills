# P9 — schema-lock opt-outs validated at authoring/preflight, not discovered at verify

- **Status:** RATIFIED 2026-08-12 (delegated).
- **Incident:** log lines 165–189. Five plans scheduled explicit `Modify:
  packages/app/src/ports.ts` tasks but were authored before the schemaGuard existed, so
  none carried `allowsSchemaChange: true` front-matter. A1 tripped the guard post-merge;
  PR #185 had to patch all five plans mid-campaign.

## Decision

`validate-plan.sh` learns the schema-lock rule, and campaign preflight runs it over every
card's plan — so a plan that schedules a locked-path change without declaring it fails
BEFORE any session spawns (shift-left from verify-time to authoring/preflight-time).

## Implementation guide (fresh session, smaller model)

### Step 1 — `plugins/tribe/scripts/validate-plan.sh`

Add an optional flag `--schema-lock-paths <comma-separated-paths>` (follow the script's
existing flag-parsing style; read the script first — it is 12KB and already validates plan
structure).

New check, active only when the flag is given:

- A plan "schedules a locked-path change" when any line matches
  `^\s*-?\s*(Modify|Create|Delete):\s*<lockPath>` for any of the given paths
  (exact path match, not substring of a longer path).
- Front-matter detection must mirror the runner's reader exactly
  (`runner/core/verify.ts:301-308`, `readAllowsSchemaChange`): a leading `---` block
  containing a line `allowsSchemaChange: true`. Absent block or absent key ⇒ false.
- Fail (non-zero exit) with a message naming the plan, the matched task line, and the
  fix: "add `allowsSchemaChange: true` front-matter — designed schema changes must be
  declared by the card's own plan (ruling UC-3, 08-08 campaign)".
- A plan that only MENTIONS a locked path in prose (no task line) does not trip the check.

Tests: `plugins/tribe/scripts/tests/` — read how existing script tests are structured and
add cases: task line + no front-matter → fail; task line + front-matter → pass; prose
mention only → pass; no flag given → check skipped entirely.

### Step 2 — preflight in the skill

`plugins/tribe/skills/orchestrate-campaign/SKILL.md`: in the preflight/launch checklist
(near where `doctor.sh` is mentioned), add: run
`validate-plan.sh --schema-lock-paths <campaign schemaLockPaths> <plan>` for EVERY card
before the first launch — this catches pre-guard-era plans (the 08-08 case) and
newly-authored ones alike.

### Acceptance

Running step 2 against the 08-08 campaign's 17 plans at its start would have failed
exactly the five plans PR #185 later patched (A1, A2, A3, A5, A12) and passed A14/A7
(their plans promise no ports.ts change — log lines 181–184).
