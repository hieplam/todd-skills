# P10 — `ANTHROPIC_API_KEY` guard in the campaign runner

- **Status:** RATIFIED by owner, 2026-08-12. Not yet implemented.
- **Parent:** [fix-list README](README.md) · Source incident: `ai-dict` campaign diary
  `docs/superpowers/campaign/2026-aug-08-log.md`, lines 82–92.

## Incident (what actually happened)

The runner was launched with the shell's cwd left inside the `ai-dict` repo. Bun
auto-loads `.env` files from the process cwd, so the repo's `.env.local` — whose
`ANTHROPIC_API_KEY` is a no-credit key — was injected into the runner process environment,
and every spawned executor session inherited it. Evidence from the B6 session log:
`"apiKeySource":"ANTHROPIC_API_KEY"` → `billing_error: "Credit balance is too low"`
(HTTP 400, req_011CdqY5UM8MGJH995JkubgL). **All 13 spawned sessions died; the launch was
dead in 36 seconds (exit 3).**

Recovery that worked (same day): relaunch from a neutral cwd with
`env -u ANTHROPIC_API_KEY` — the new session showed `apiKeySource: none` (Claude Code
login) and the whole 17-card campaign then ran on login auth. This proves the in-process
unset is sufficient for the inheritance path.

The trap was **already documented in session memory** ("runner cwd/.env key trap") and was
stepped on anyway — the exact prose-vs-mechanical failure this fix-list exists to close.

## Ratified decision (owner ruling, verbatim intent)

The tribe **never** uses `ANTHROPIC_API_KEY`; executor sessions must authenticate via
Claude Code login.

1. **Unset before spawning:** the runner always deletes `ANTHROPIC_API_KEY` from its own
   process environment at startup, before any session spawn. If it was set, print one
   warning line saying it was removed.
2. **Scrub `.env.local` without asking:** if `<repoRoot>/.env.local` contains an
   `ANTHROPIC_API_KEY` line, the runner deletes that line — no confirmation prompt
   (owner: "xóa không cần hỏi" / delete without asking).

### Accepted risk (recorded, owner-accepted)

A target repo whose application legitimately needs `ANTHROPIC_API_KEY` in `.env.local`
(e.g. an app that calls the Anthropic API from local dev) would have the line silently
removed on every real run. The owner explicitly accepted this: the tribe never uses the
variable and the owner's repos do not depend on it. Revisit only if the tribe ever targets
such a repo.

## Spec

### Behavior

| Situation | Real run | `--dry-run` |
| --- | --- | --- |
| `ANTHROPIC_API_KEY` set in runner process env | delete from `process.env` + one warning line to stderr | same (process-local, not a world side effect) |
| `<repoRoot>/.env.local` has an `ANTHROPIC_API_KEY` line | rewrite the file with the line(s) removed + one warning line naming the file | warn only, do NOT write — dry-run stays "zero side effects by construction" (`cli/main.ts:228`) |
| `.env.local` absent or clean | nothing, no output | nothing |

Both steps run on **every** invocation (fresh launch and re-trigger) and are idempotent.
Ordering: both complete in `main()` before `runLoop` is called, hence before any session
spawn.

### Design (pure core, impure edges)

- **New pure module `runner/core/env-guard.ts`:**

  ```ts
  /** Removes every line assigning ANTHROPIC_API_KEY (with or without `export `),
   *  preserving all other lines byte-for-byte. */
  export function scrubEnvContent(content: string): { cleaned: string; removed: number }
  ```

  Match: `/^\s*(export\s+)?ANTHROPIC_API_KEY\s*=/` per line. Comment lines mentioning the
  variable are NOT removed (only assignments). Preserve the file's trailing-newline state.

- **Edge wiring in `cli/main.ts` `main()`** (composition root — per the file's existing
  precedent, the wiring itself is not unit-tested; all decisions live in the pure module):
  1. Top of `main()`: env unset + warning.
  2. After `parseArgs` succeeds: read `<repoRoot>/.env.local` if it exists →
     `scrubEnvContent` → if `removed > 0`: write back (real run) or warn-only (dry-run).

- **`plugins/tribe/scripts/doctor.sh`:** add a preflight check that WARNS when
  `ANTHROPIC_API_KEY` is set in the environment or present in the target repo's
  `.env.local` (doctor only reports; the runner enforces).

### Out of scope (extend only by a new ruling)

- Other Bun-autoloaded files (`.env`, `.env.development`, `.env.production`, …) are NOT
  scrubbed — the incident vector was `.env.local` only.
- Other credential variables (`ANTHROPIC_AUTH_TOKEN`, provider keys) — not part of the
  incident; do not creep.

### Tests / acceptance

- **Unit (`env-guard.test.ts`):** key present (plain / `export ` / indented / multiple
  occurrences) → removed and counted; other lines and comments byte-identical; file
  without the key → `removed: 0`, content unchanged; trailing newline preserved either
  way.
- **Acceptance (manual, mirrors the incident):** launch the runner from a cwd whose
  `.env.local` sets `ANTHROPIC_API_KEY` → runner prints both warnings, spawned session log
  shows `apiKeySource: none` (the incident showed `"apiKeySource":"ANTHROPIC_API_KEY"`),
  and the repo's `.env.local` no longer contains the line.

### Delivery

Small, self-contained change in `todd-skills` → worktree + PR per repo rules (fits a
single tribe card or a direct PR; owner's Definition of Done: merged, master up to date).

## Implementation guide (fresh session, smaller model)

Paths under `plugins/tribe/scripts/runner/`. Run: `cd plugins/tribe/scripts/runner && bun test`.

1. **Create `core/env-guard.ts`** with `scrubEnvContent` exactly as specced above
   (per-line regex `/^\s*(export\s+)?ANTHROPIC_API_KEY\s*=/`; keep all other lines
   byte-identical; preserve presence/absence of trailing newline).
2. **Create `core/env-guard.test.ts`** with the enumerated cases (plain / `export ` /
   indented / multiple / absent / comment-line mentioning the var is KEPT / trailing
   newline preserved).
3. **Wire in `cli/main.ts` `main()`** (line ~200):
   - First statements: if `process.env.ANTHROPIC_API_KEY !== undefined` →
     `delete process.env.ANTHROPIC_API_KEY;` +
     `console.error('campaign runner: ANTHROPIC_API_KEY was set in the environment — removed (the tribe authenticates via Claude Code login, never this variable)');`
   - After `parseArgs` succeeds (after line ~207): build
     `join(parsed.config.repoRoot, '.env.local')`; if it exists (use `existsSync` from
     `node:fs`, matching the file's import style), read it, `scrubEnvContent`; if
     `removed > 0`: when `parsed.config.dryRun` → `console.error` warn only; else write
     the cleaned content back + `console.error` naming the file and count.
4. **`plugins/tribe/scripts/doctor.sh`:** add a check block (follow the script's existing
   check style): WARN when `ANTHROPIC_API_KEY` is set in the environment, and WARN when
   `grep -qE '^\s*(export\s+)?ANTHROPIC_API_KEY\s*=' <repo>/.env.local` matches. Doctor
   warns; the runner enforces.
