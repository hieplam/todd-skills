# Spec — Idea 07: Mechanical work queue (`build-queue.sh`)

**Card:** idea-07-mechanical-queue
**Status:** planning-only deliverable (spec + plan). Implementation happens in a future campaign.
**Branch:** `planning/idea-07-mechanical-queue`

---

## 1. Problem (grounded in the code)

Tribe's task list is **prose written by an LLM and then re-read by an LLM**.

- The Warchief authors the plan by hand with the writing-plans skill: *"Decompose into bite-sized
  TDD tasks, each with exact file paths, the actual test code, the actual implementation"*
  (`plugins/tribe/agents/warchief.md:288-296`).
- It then re-reads that same prose to dispatch: *"Extract each task to a brief file. Dispatch a
  fresh Hunter per task"* (`plugins/tribe/agents/warchief.md:367-374`).
- `plugins/tribe/scripts/validate-plan.sh` already mechanises the plan's **form** — task sections
  exist, no placeholders, every task has a code block, an expected result, and exactly one Commit
  step (`validate-plan.sh:143-247`). But it validates the *shape of the prose*; the **source of the
  tasks is still the Warchief's narration**.

For heterogeneous feature work that is correct — decomposition is judgment, and judgment is what
the Warchief is for. For **homogeneous fix/repair work** it is a liability. When a card is "fix the
47 failing tests", "clear the 210 lint errors", "raise coverage on these 30 files", the task list is
not a judgment call at all: it is a **mechanical fact that a tool already knows**. Asking an LLM to
transcribe 47 known failures into 47 prose task sections buys nothing and costs three specific
failure modes:

1. **Goal drift / dropped items.** Item #1,337 quietly never gets a task section. Nothing in the
   system notices, because the only record that it existed was the same context window that forgot
   it.
2. **Transcription noise.** The failure the Hunter reads is the Warchief's *paraphrase* of the
   stacktrace, not the stacktrace. Detail is lost exactly where it is load-bearing.
3. **No mechanical done-check.** "Is the sweep finished?" is answered by an LLM re-reading its own
   checklist, rather than by re-running the proof command and observing zero failures.

This is the one place Bun's rewrite is a direct, boring lesson (`bun-rust-migrate-ideas.md:158-176`;
handoff `§1.4` layer 3): the queue of ~16,000 `cargo check` errors and the per-failure stacktrace
files were **machine output**. The agents only *consumed* the queue. Determinism where no judgment
is needed; judgment reserved for where it is.

Tribe is already three-quarters of the way to this philosophy — `heartbeat-check.sh`,
`resume-check.sh` and `validate-plan.sh` all exist precisely to stop an LLM from re-deriving a
deterministic fact by prose reasoning. The queue is the missing fourth.

---

## 2. Proposed design

Two artifacts and one rule.

### 2.1 `plugins/tribe/scripts/build-queue.sh` — the queue generator

Runs the repo's proof command, parses each failure into one line of `queue.tsv`, and writes the
full raw failure block for each row to its own detail file. **Deterministic, offline, idempotent.**

It follows the existing script family's conventions exactly (`validate-plan.sh`, `resume-check.sh`,
`heartbeat-check.sh`): a bash wrapper for arg handling and setup errors, a `python3` heredoc for the
real work, **JSON summary on stdout only**, logs on stderr, `-h/--help` printing the header comment,
`set -euo pipefail`.

**Usage**

```
build-queue.sh [--proof CMD] [--parser NAME] [--out FILE] [--repo-root DIR] [--dry-run]
```

**Input — how the proof command is discovered.** Guessing silently is the failure mode to design
out, so discovery is a fixed precedence chain and the chosen command is always echoed into the JSON
summary and the stderr log:

| # | Source | Notes |
|---|--------|-------|
| 1 | `--proof CMD` | Explicit wins. The Warchief should normally pass this. |
| 2 | `TRIBE_PROOF_CMD` env var | For campaign scripts that set it once. |
| 3 | `package.json` → `scripts.test` | Read with `python3`'s `json`, never a regex. |
| 4 | `Cargo.toml` present | `cargo check --message-format=json` |
| 5 | `Makefile` with a `test:` target | `make test` |

If none of the five yields a command → **exit 2** (setup error) with
`no proof command: pass --proof or set TRIBE_PROOF_CMD`. The script never invents one.

**Parsers.** `--parser` selects the failure parser; default `auto` infers from the proof command and
the output shape, and falls back to `generic`. Supported: `pytest`, `jest`, `eslint`, `cargo`,
`generic`. `generic` matches the two universal failure shapes — `path:line:col: message` and
`FAIL path` — so an unknown toolchain still produces a usable queue rather than an error. The parser
actually used is reported in the JSON.

**Output 1 — `queue.tsv` schema.** Tab-separated, one failure per line, a `#`-prefixed header so
that `grep -v '^#' queue.tsv | wc -l` is exactly the task count:

```
#id	file	digest	detail
7f3a1c9e2b04	src/auth/token.ts	TypeError: cannot read property exp of undefined	queue.d/7f3a1c9e2b04.txt
b19d55a0c7e1	src/auth/token.ts	expected 401 received 200	queue.d/b19d55a0c7e1.txt
```

| Column | Meaning | Invariant |
|--------|---------|-----------|
| `id` | `sha1(file + "\t" + digest)` truncated to 12 hex chars | **Content-derived, therefore stable across re-runs** — the same failure keeps the same id. This is what makes the queue idempotent and lets a commit trailer reference a row. |
| `file` | Repo-relative path of the failing file | Absolute paths normalised to repo-relative. |
| `digest` | One-line normalised error summary | Volatile bits stripped (ANSI codes, timestamps, durations, memory addresses, absolute path prefixes, PIDs) so the digest — and hence the id — is stable run to run. Tabs/newlines forbidden; truncated to 160 chars. |
| `detail` | Path to the full raw failure block | `queue.d/ID.txt`, relative to `queue.tsv`. This is the stacktrace the Hunter and the Skinner actually read. |

Rows are **sorted by `(file, digest)`**, so an unchanged failure set produces a byte-identical
`queue.tsv`, and `git diff` on the queue is meaningful ("3 rows drained, 0 new").

**Output 2 — JSON summary on stdout**, the family's contract:

```json
{
  "queue_file": "docs/tribe/queues/regression-sweep/queue.tsv",
  "proof_cmd": "npx jest --ci",
  "proof_cmd_source": "--proof",
  "parser": "jest",
  "proof_exit_code": 1,
  "row_count": 2,
  "queue_empty": false,
  "detail_dir": "docs/tribe/queues/regression-sweep/queue.d"
}
```

**Exit codes** — deliberately identical to the rest of the family: **`0` = ran successfully
regardless of how many failures were found; `2` = setup error.** A non-zero proof command is the
*normal, expected* case (that is why there is a queue at all), so it is never an error of this
script; the signal lives in `queue_empty` / `row_count`, exactly as `validate-plan.sh` puts its
pass/fail in `verdict` rather than in its exit status.

**Idempotency (a hard requirement, tested).** Re-running refreshes the queue in place:
- unchanged tree → byte-identical `queue.tsv` (stable ids + stable sort + digest normalisation);
- failures fixed → those rows disappear, and their **stale `queue.d/*.txt` detail files are pruned**
  so the detail dir never accumulates ghosts;
- all failures fixed → zero rows, `"queue_empty": true`. **That is the sweep's mechanical
  done-check** — the oracle Bun had and tribe lacks.

### 2.2 Queue-backed plans — how `validate-plan.sh` treats them

The design question the card asks: does the plan *embed* the TSV or *reference* it, and how do tasks
stay a "single unit of work"?

**The plan references a frozen, committed queue. It never embeds the rows.** Embedding would
reintroduce the exact transcription step the idea exists to delete.

A queue-backed plan declares the queue and carries **exactly one task section, which is a
template**:

```markdown
## Work Queue

Queue: ../../queues/regression-sweep/queue.tsv

### Task 1: Fix one queue row (queue template)

Queue-Template: true

- [ ] **Step 1: Reproduce** — run the proof command narrowed to this row's `file`
- [ ] **Step 2: Write/keep the failing test red**
- [ ] **Step 3: Minimal fix, suite green**
- [ ] **Step 4: Commit**
```

`validate-plan.sh` gains a **queue-backed mode**, triggered by the `Queue:` declaration:

- resolve the queue path **relative to the plan file**; it must exist and be non-empty (else `fail`);
- parse the rows; `task_count` becomes the **number of queue rows**, not the number of Markdown task
  sections;
- require **exactly one** task section, and that it is marked `Queue-Template: true`;
- the template still must satisfy every existing per-task check — a fenced code block, an expected
  result, and **exactly one Commit step**;
- emit `"queue_backed": true`, `"queue_file"`, `"queue_rows": N` in the JSON.

That last bullet is how **"single unit of work" survives**: the template describes *one row's*
red→green→commit cycle, so one row = one task = one Hunter = one commit, and the crash-safety budget
(`warchief.md:293-296` — a dead task is discarded and redone, so task size caps redo cost) is
unchanged. The Warchief instantiates the template N times at dispatch (`Tribe-Task: i/N`), rather
than narrating N task sections. **Non-queue plans are completely unaffected** — the new mode only
activates on an explicit `Queue:` declaration, so every existing plan validates exactly as it does
today.

### 2.3 The new Warchief rule (prompt text)

- **Step 3 (Write the plan)** gains: when the card is **homogeneous fix/repair work** (regression
  sweep, lint sweep, coverage sweep, mechanical refactor across N files), the plan **must be
  queue-backed** — run `build-queue.sh`, commit `queue.tsv` + `queue.d/` as campaign artifacts, and
  write one template task. Narrating the failure list in prose is forbidden for this card class.
- **Step 5 (Orchestrate)** gains: dispatch **one Hunter per queue row** (each Hunter's brief carries
  the row's `file` + the raw `detail` file — *not* the Warchief's paraphrase of it), and **before
  delivery, re-run `build-queue.sh` and require `queue_empty: true`.** A sweep is not done because
  an LLM ticked its boxes; it is done because the queue drained to zero.

---

## 3. Scope fence

**In scope (this planning campaign):** `docs/tribe/planning/idea-07-mechanical-queue/spec.md` and
`plan.md`, plus `docs/tribe/state/idea-07-mechanical-queue.md`.

**In scope for the FUTURE implementation campaign this plan briefs:**
- new `plugins/tribe/scripts/build-queue.sh`
- new `plugins/tribe/scripts/tests/test-build-queue.sh`
- queue-backed mode added to `plugins/tribe/scripts/validate-plan.sh` (+ fixtures in
  `plugins/tribe/scripts/tests/test-validate-plan.sh`)
- the step 3 / step 5 rule text in `plugins/tribe/agents/warchief.md`, and the script's entry in
  `plugins/tribe/README.md`

**Explicitly OUT (both campaigns):**
- **ZERO changes under `plugins/` on this branch** — tripwire, auto-fail. The plan's code blocks are
  *intended* content for a future campaign; nothing is applied here.
- No queue **claiming / leasing / status column**, and no worker pool. Re-running the generator *is*
  the status (a fixed row disappears), so a mutable status column would be a second source of truth
  that can disagree with the proof command. Out of scope on purpose.
- No parallel *execution* engine — the queue produces tasks; how many Hunters run at once stays the
  Warchief's existing wave machinery.
- No changes to `heartbeat-check.sh` or `resume-check.sh`.
- No network, and no attempt to install a repo's test toolchain — the script runs the proof command
  the repo already has, or exits 2.

---

## 4. Testing / verification strategy

Fixture tests in `plugins/tribe/scripts/tests/test-build-queue.sh`, following the existing style of
`test-validate-plan.sh` verbatim: `set -euo pipefail`, `mktemp -d` + `trap` cleanup, `ok`/`bad`/
`check` counters, a `jget` python3 heredoc to read JSON fields, `printf '%d passed, %d failed'` and
`exit $((FAIL > 0))`. **Offline, hermetic, no network and no real test runner:** the "proof command"
in every fixture is a throwaway shell script that prints canned pytest / jest / eslint / cargo output
and exits non-zero. That keeps the tests fast and makes the parser the thing under test.

Coverage:
1. **Discovery precedence** — `--proof` beats `TRIBE_PROOF_CMD` beats `package.json` beats `Cargo.toml`
   beats `Makefile`; none present → exit 2 with the documented message.
2. **Schema** — header line, 4 columns, tab-separated, no embedded tabs/newlines, `detail` files
   exist and hold the raw block.
3. **Id stability** — the same failure yields the same id across two runs; a changed failure yields a
   different id; volatile noise (timestamps, durations, absolute paths, ANSI codes) does **not**
   change the id.
4. **Idempotency** — two consecutive runs on an unchanged tree produce a byte-identical `queue.tsv`;
   a drained failure removes its row **and** prunes its detail file; all-green → 0 rows and
   `queue_empty: true`.
5. **Parsers** — one fixture per parser (`pytest`, `jest`, `eslint`, `cargo`, `generic`), plus `auto`
   inferring correctly, plus an unknown toolchain degrading to `generic` rather than erroring.
6. **Exit codes** — 0 on a failing proof command (normal), 0 on a green one, 2 on every setup error.
7. **validate-plan.sh queue mode** — a queue-backed plan passes with `task_count == queue_rows`; a
   `Queue:` pointing at a missing/empty file fails; a queue-backed plan with 2 task sections fails;
   a template with 2 Commit steps fails; **a normal plan still validates exactly as before**
   (regression fixture — this is the one that protects every existing plan).

Every test is runnable by hand — `bash plugins/tribe/scripts/tests/test-build-queue.sh` — matching
how this repo runs its script tests today (there is no CI workflow in the repo; the test scripts are
the gate).

---

## 5. Evidence plan

The implementation campaign is a CLI/prompt change, so the evidence is **terminal transcripts, not
screenshots** (there is no UI):

1. **Before:** on a scratch repo with N seeded failing tests, the current flow — the Warchief's
   prose plan listing the failures — captured as the plan file, plus `validate-plan.sh` output
   showing `task_count` derived from prose sections.
2. **After:** `build-queue.sh --proof ...` output — the JSON summary, `cat queue.tsv` showing N rows,
   `ls queue.d/`, and `validate-plan.sh` on the queue-backed plan showing `queue_backed: true` and
   `queue_rows: N` with a single template task.
3. **The drain:** fix the seeded failures, re-run `build-queue.sh`, show `"queue_empty": true` and
   `queue.tsv` with zero rows — the mechanical done-check working end to end.
4. **Idempotency:** `build-queue.sh && cp queue.tsv a && build-queue.sh && diff a queue.tsv` → no
   diff.
5. Full test-suite output: `bash plugins/tribe/scripts/tests/test-build-queue.sh` and
   `test-validate-plan.sh`, both green with counts.

---

## 6. Risks & rollback

| Risk | Mitigation |
|------|------------|
| **Parser brittleness** — every test runner formats failures differently; a parser that half-works silently produces a wrong queue. | `generic` fallback always produces *something*; the JSON always reports which parser ran; `row_count` is printed so a human/Warchief instantly sees "47 failures, 3 rows" as wrong. Parsers are additive: a new one is a new fixture + a new branch, never a rewrite. |
| **Digest instability** → unstable ids → a "refresh" that looks like a full churn (every row deleted and re-added). | Normalisation of volatile bits is an explicit, separately tested requirement (test 3). This is the single most important invariant in the script and it has its own fixture. |
| **False confidence in the mechanical done-check** — a queue drains to zero because the proof command was weakened (a test deleted/skipped), not because bugs were fixed. | The queue is a *complement* to, never a replacement for, the Skinner audit (which runs the proof itself and reads the diff). The Hunter anti-goal "never weaken or skip a test" already governs; idea 10 would make it a checkable tripwire. Called out in the rule text. |
| **Scope creep into a work-stealing scheduler** (claiming, leases, status columns). | Explicitly fenced out in §3. The queue is a *derived artifact*, regenerable at any moment from the proof command; a mutable status column would be a second, divergeable source of truth. |
| **The rule fires on the wrong card class** — a Warchief force-fits a heterogeneous feature card into a queue. | The rule is scoped to homogeneous fix/repair cards and the Warchief keeps the judgment call of which class a card is. `build-queue.sh` on a green repo returns 0 rows, which is a loud, harmless "this is not that kind of card". |
| **Prompt-file collision with idea 08**, which also edits `warchief.md` step 5. | Called out in §7 with a concrete sequencing recommendation. |

**Rollback:** the change is additive and inert until used. `build-queue.sh` is a new file nothing
else calls; `validate-plan.sh`'s queue mode only activates on an explicit `Queue:` declaration, so
every existing plan is byte-for-byte unaffected. Rollback = revert the PR; no data migration, no
state to unwind (`queue.tsv` is a derived artifact — deleting it loses nothing that re-running the
proof command cannot rebuild).

---

## 7. Interactions with other ideas

**Idea 08 — push wave orchestration into code (`integrate-wave.sh`). Two real interactions:**
- *Convention sharing (helpful).* Both add a script to `plugins/tribe/scripts/` + a fixture test to
  `scripts/tests/`, and both must match the family contract this spec pins down: bash wrapper +
  `python3` heredoc, **JSON on stdout only**, logs on stderr, `-h` prints the header, `set -euo
  pipefail`, **exit 0 = ran, 2 = setup error, verdict in the JSON rather than the exit status**.
  Idea 08 wants one extra distinction (a "conflict" exit code so the Warchief can escalate); that is
  compatible — it is a *third* code alongside 0/2, not a redefinition of them. Recommend both plans
  cite this same contract so the two scripts do not drift into two dialects.
- *File collision (must be sequenced).* **Both ideas edit `plugins/tribe/agents/warchief.md`** —
  idea 07 touches step 3 (queue-backed plans) and step 5 (one Hunter per row, drain check); idea 08
  rewrites step 5's wave algorithm to call `integrate-wave.sh`. Same file, overlapping section →
  their `owns_files` are **not** disjoint, so under the Warchief's own wave rule
  (`warchief.md:377-380`) they **cannot run concurrently in the same wave**. Recommendation: land
  them in **different waves** (either order works; the later one rebases onto the earlier), or fold
  both prompt edits into a single task owned by one sub-plan. Flagging this now is the whole point of
  this section — discovered at merge time it is a `NEEDS_DIRECTION` and a stalled wave.

**Idea 01 — the 4-role cell (1 Hunter + 2 Skinners + 1 Fixer). This is the natural consumer of the
queue, and the schema is built for it:**
- **One queue row = one work item = one cell.** That is precisely Bun's shape (each failing test's
  stacktrace saved to a file → one cell per failure, `bun-rust-migrate-ideas.md:160-163`). Idea 01
  supplies the cell; idea 07 supplies the item stream the cells consume. Neither depends on the
  other to ship — they compose, and either can land first.
- The row's stable `id` gives the cell a **durable identity** (usable in a commit trailer, a brief
  filename, a report line) that survives a crash and a queue refresh — which is what makes
  "re-dispatch the cell for row `7f3a1c9e`" a well-defined instruction.
- The row's `detail` file is a **cold, raw artifact**: the Skinner can be handed the stacktrace
  without ever seeing the Hunter's reasoning. That is exactly **idea 02's** context-isolation rule
  (the reviewer sees only the diff + the contract, never the implementer's self-justification), and
  a queue-backed sweep makes it trivially enforceable — the contract for a cell literally *is* one
  TSV row plus one raw text file.

**Idea 06 (frozen CODEX.md) / Idea 09 (persistent policy, ephemeral instance):** `queue.tsv` is the
same species of artifact as CODEX.md — campaign state that lives in **files, not in a context
window**. It makes the ephemeral-instance model stronger: a freshly re-dispatched Warchief does not
need to remember which of 47 failures are left; it re-runs `build-queue.sh` and the remaining rows
*are* the remaining work. Queue-backed sweeps are therefore the cheapest possible resume.

**Idea 10 (mechanical tripwires):** repeated failure classes become visible as **digest clusters** in
the queue (many rows sharing one normalised digest = one root cause, or one recurring anti-pattern),
which is exactly the "same pattern ≥2 times → write a tripwire rule" trigger idea 10 wants. A future,
out-of-scope enhancement: a `--group-by-digest` flag turning the queue into a root-cause histogram.

**No dependency:** idea 07 ships standalone. It needs nothing from ideas 01, 02, 06, 08, 09 or 10,
and blocks none of them — the only hard coordination requirement is the `warchief.md` sequencing
against idea 08 above.
