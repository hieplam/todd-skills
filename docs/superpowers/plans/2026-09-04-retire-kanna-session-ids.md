# Plan: retire the Kanna session-id bridge

**Card:** `retire-kanna-session-ids` · **Spec:** `docs/superpowers/specs/2026-09-04-retire-kanna-session-ids-design.md`
**Worktree:** `/Users/hip/repo/todd-skills-wt/retire-kanna-session-ids` · **Branch:** `chore/retire-kanna-session-ids` · **Base:** `d63a7d27e52c9881ff6e1cfd1c78e6177eaa2638`

Two tasks, two commits, one wave. Task 2 depends on Task 1 only for commit order, not for file
content — they touch disjoint paths.

## Global Constraints

- Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.
- Purity: core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see `~/.claude/rules/pure-core.md`).
- Every command runs from the worktree root
  `/Users/hip/repo/todd-skills-wt/retire-kanna-session-ids`. Never touch the main checkout at
  `/Users/hip/repo/todd-skills` (it carries the owner's uncommitted work) and never touch the
  sibling worktrees under `/Users/hip/repo/todd-skills-wt/`.
- **Never edit these files** — another Warchief owns them concurrently in its own worktree:
  `plugins/tribe/scripts/tests/test-input-asymmetry.sh`,
  `plugins/tribe/scripts/tests/test-review-cell-v3.sh`, `plugins/tribe/scripts/pre-gate.sh`.
- **Never touch `docs/superpowers/` history** other than the two files this card itself adds
  (its spec and this plan, both already committed). The older specs and plans that mention
  `list-session-ids` are history and stay exactly as written.
- Commit messages carry **no** `Co-Authored-By` trailer of any kind, and no agent name anywhere.
- Every commit's final paragraph carries both trailer lines, e.g.
  `git commit -m "subject" -m $'Tribe-Card: retire-kanna-session-ids\nTribe-Task: 1/2'`.
- Tick this plan's task checkboxes in the same commit as the code for that task.
- The C3 CLI is invoked as `bunx @c3x/cli@11.6.3` — there is no `c3` or `c3x` binary on PATH.

## Definition of the red/green proof (shared by both tasks)

Save this assertion block once, outside the repo, and run it before and after. It is the card's
G1, executed:

```bash
cat > /tmp/g1-assert.sh <<'SH'
#!/usr/bin/env bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
fail=0
a="$(git ls-files plugins/tribe/scripts/kanna)"
[ -z "$a" ] && echo "ok: git ls-files plugins/tribe/scripts/kanna is empty" || { echo "FAIL: still tracked: $a"; fail=1; }
[ ! -e plugins/tribe/scripts/tests/test-list-session-ids.sh ] \
  && echo "ok: test-list-session-ids.sh is gone" || { echo "FAIL: test file still present"; fail=1; }
b="$(grep -rn list-session-ids plugins .c3 README.md install.sh || true)"
[ -z "$b" ] && echo "ok: grep -rn list-session-ids plugins .c3 README.md install.sh is empty" \
  || { echo "FAIL: remaining hits:"; echo "$b"; fail=1; }
exit "$fail"
SH
chmod +x /tmp/g1-assert.sh
bash /tmp/g1-assert.sh; echo "exit=$?"
```

Expected at base (RED, before Task 1): three `FAIL:` lines and `exit=1`.
Expected after Task 2 (GREEN): three `ok:` lines and `exit=0`.

---

### Task 1: delete the script, its test, and repoint the runner README

- Delete: `plugins/tribe/scripts/kanna/list-session-ids.sh` (removes the whole `kanna/` directory)
- Delete: `plugins/tribe/scripts/tests/test-list-session-ids.sh`
- Modify: `plugins/tribe/scripts/runner/README.md:212-219` (retitle and rewrite the section)

- [ ] **Step 1: Watch it fail.**

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
bash /tmp/g1-assert.sh; echo "exit=$?"
```

Expected: `FAIL: still tracked: plugins/tribe/scripts/kanna/list-session-ids.sh`,
`FAIL: test file still present`, `FAIL: remaining hits:` listing four paths
(`.c3/c3-2-plugins/c3-215-tribe.md:78`, `plugins/tribe/scripts/kanna/list-session-ids.sh:2`,
`plugins/tribe/scripts/kanna/list-session-ids.sh:7`,
`plugins/tribe/scripts/runner/README.md:215`,
`plugins/tribe/scripts/tests/test-list-session-ids.sh:2`,
`plugins/tribe/scripts/tests/test-list-session-ids.sh:5`), and `exit=1`.

- [ ] **Step 2: Remove the two files.**

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
git rm -q plugins/tribe/scripts/kanna/list-session-ids.sh
git rm -q plugins/tribe/scripts/tests/test-list-session-ids.sh
rmdir plugins/tribe/scripts/kanna 2>/dev/null || true
ls -d plugins/tribe/scripts/kanna 2>&1 || echo "kanna directory gone"
```

Expected: the last line prints `kanna directory gone` (the `ls` fails because the directory no
longer exists). No shim, no stub, no redirect script is created in its place.

- [ ] **Step 3: Rewrite the README section.**

Replace `plugins/tribe/scripts/runner/README.md` lines 212 through 219 — that is exactly this
block, verbatim as it stands today:

```markdown
### Visualizing campaign sessions in Kanna

Every card's executor session persists to `~/.claude/projects/<encoded-repo>/<sessionId>.jsonl`.
To watch them in Kanna: `plugins/tribe/scripts/kanna/list-session-ids.sh <home>/campaign-state.json`
copies all recorded session ids to the clipboard; paste the list into Kanna's sidebar Import
dialog. Active
sessions import as a live view. Treat runner-owned sessions as view-only — sending a message
from Kanna takes over the session and will conflict with the runner's own resume.
```

with exactly this block:

```markdown
### Watching campaign sessions

Every card's executor session persists to `~/.claude/projects/<encoded-repo>/<sessionId>.jsonl`.
Watch them through the [live viewer](#live-viewer) the runner auto-starts — open the
`campaign viewer:` URL it prints on stdout and pick the card; it tails those transcripts
read-only, so there is no session id to copy and no way to take over a runner-owned session.
```

Keep the section exactly where it is (between the `### Per-card fields` table and
`### Worked example`), keep the blank lines around it, and do not add a new section anywhere.

Verify:

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
awk 'NR>=210 && NR<=220 {printf "%d|%s|\n", NR, $0}' plugins/tribe/scripts/runner/README.md
grep -c '^### ' plugins/tribe/scripts/runner/README.md
```

Expected: line 212 is `### Watching campaign sessions`, line 216 is the last line of the new
paragraph, line 217 is blank, and line 218 begins `### Worked example`. The `grep -c` count is
**unchanged** from base (run the same `grep -c` on `git show HEAD:plugins/tribe/scripts/runner/README.md`
to compare) — proving a section was rewritten, not added.

- [ ] **Step 4: Prove the shell suite is delta-zero.**

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
bash plugins/tribe/scripts/pre-gate.sh --repo "$PWD" --range HEAD..HEAD \
  --tests-dir plugins/tribe/scripts/tests \
  --report /tmp/pregate-task1.md 2>&1 | tail -20
```

Expected: 17 suites listed (one fewer than base, because `test-list-session-ids.sh` is gone).
Exactly two are red and they are the inherited pair — `test-fresh-machine.sh` at `exit 1`
(`25 passed, 1 failed`) and `test-input-asymmetry.sh` at `exit 2`. Every other suite reports
`exit 0`. If any *other* suite turns red, stop and report `BLOCKED` rather than editing it.

- [ ] **Step 5: Commit**

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
git add -A plugins/tribe/scripts docs/superpowers/plans/2026-09-04-retire-kanna-session-ids.md
git status --short
git commit -m "chore(tribe): delete the Kanna session-id bridge script and test" \
  -m "The campaign live viewer (PR #111) tails every card's transcript read-only, so the
manual copy-session-ids-into-Kanna path is redundant — and it could hijack a live
runner-owned session. Owner ruled: delete, no shim.

The runner README section that pointed at Kanna now points at the live viewer." \
  -m $'Tribe-Card: retire-kanna-session-ids\nTribe-Task: 1/2'
git log -1 --format='%H%n---%n%(trailers)'
```

Expected: `git status --short` shows the two deletions (`D`), the modified README (`M`), and the
modified plan file (`M`, its Task 1 checkboxes ticked). The trailers print exactly
`Tribe-Card: retire-kanna-session-ids` and `Tribe-Task: 1/2`, with no `Co-Authored-By` line.

---

### Task 2: remove the c3-215 Contract row through an ADR change-unit

- Create: `.c3/adr/adr-20260904-retire-kanna-session-ids.md` (written by `c3x add adr`)
- Create: `.c3/changes/adr-20260904-retire-kanna-session-ids/01-drop-kanna-contract-row.patch.md`
- Modify: `.c3/c3-2-plugins/c3-215-tribe.md` (written by `c3x change apply`, never by hand)

`.c3/` facts are sealed. Hand-editing the markdown breaks the seal and is not a legal mutation —
`c3x change apply` is the only path. Do not open `.c3/c3-2-plugins/c3-215-tribe.md` in an editor.

- [ ] **Step 1: Re-read the live cite handle.**

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
bunx @c3x/cli@11.6.3 read c3-215 --section Contract --cite 2>&1 | grep 'scripts/kanna'
```

Expected: one line of the form
`c3-215#n1626@v1:sha256:aa31c384fd777dda33f0dc2b820d2420455d5a22816084dd2a85ea081edc0d12 "scripts/kanna/list-session-ids.sh | OUT | Reads a campaign state JSON, ..."`.
The node number (`n1626`) is cache-assigned and may differ — **use whatever this command prints
right now**, never the number transcribed here. Copy the whole handle up to (not including) the
opening double quote.

- [ ] **Step 2: Author the ADR body and create the entity.**

Read the required sections first, then write the body to a scratch file and hand it to `c3x add`:

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
bunx @c3x/cli@11.6.3 schema adr 2>&1 | head -40
```

Expected: the required core is `Goal`, `Context`, `Decision`, `Affected Topology`,
`Verification`; the work-order sections are optional and thin included sections are rejected, so
include only the required five.

Write `/tmp/adr-retire-kanna.md` with those five sections. Content requirements, each of which the
schema enforces:

- **Goal** — one concrete paragraph: remove the `scripts/kanna/list-session-ids.sh` Contract row
  from `c3-215`, because the surface it documents has been deleted from the repo.
- **Context** — the live viewer shipped in PR #111 (`scripts/viewer/serve.ts`'s `GET /live`
  surface, already its own Contract row in `c3-215`) supersedes the manual Kanna import path; the
  manual path could take over a runner-owned session; the owner ruled to delete it on 2026-09-04.
- **Decision** — delete the row outright rather than rewriting it as deprecated: the fact
  documents a file that no longer exists, so any surviving row would be a false claim.
- **Affected Topology** — one row for `c3-215`, type `component`, with a real `Evidence` cite.
  Take that cite from `bunx @c3x/cli@11.6.3 read c3-215 --section Purpose --cite` and use a
  **prose** node, not a table row: a table-row cite embeds a raw `|` inside this ADR's own table
  cell, which `c3x` 11.6.3's serializer cannot round-trip (the same limitation
  `.c3/adr/adr-20260821-explaining-illustration-scope.md` records as F23). Governance review
  column: name this change-unit's single patch as the review.
- **Verification** — name the executable commands: `bash /tmp/g1-assert.sh`,
  `bunx @c3x/cli@11.6.3 check --only c3-215`, `bunx @c3x/cli@11.6.3 check`, and the `pre-gate.sh`
  suite sweep, each with the outcome expected.

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
bunx @c3x/cli@11.6.3 add adr retire-kanna-session-ids --file /tmp/adr-retire-kanna.md 2>&1
ls .c3/adr/ | grep retire-kanna
```

Expected: the command reports the created entity and `ls` prints
`adr-20260904-retire-kanna-session-ids.md`. If `c3x add` rejects a section as thin or ungrounded,
fix that section and re-run — do not weaken the schema and do not hand-write the file into
`.c3/adr/`.

- [ ] **Step 3: Scaffold the change-unit and author the one delete patch.**

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
bunx @c3x/cli@11.6.3 change new adr-20260904-retire-kanna-session-ids 2>&1
```

Expected: `change-unit adr-20260904-retire-kanna-session-ids ready at <path>`.

Now write the patch. A block patch with an **empty body** is the delete form (`c3x change --help`:
"a block patch (anchored by a cite handle) replaces / inserts / deletes one block"). The file is
frontmatter only — nothing after the closing `---`:

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
HANDLE="$(bunx @c3x/cli@11.6.3 read c3-215 --section Contract --cite 2>/dev/null \
  | grep 'scripts/kanna' | awk '{print $1}')"
echo "handle=$HANDLE"
printf -- '---\ntarget: c3-215\nscope: block\nbase: %s\n---\n' "$HANDLE" \
  > .c3/changes/adr-20260904-retire-kanna-session-ids/01-drop-kanna-contract-row.patch.md
cat .c3/changes/adr-20260904-retire-kanna-session-ids/01-drop-kanna-contract-row.patch.md
```

Expected: `handle=c3-215#n<number>@v1:sha256:<64 hex chars>` (non-empty — if it is empty, stop:
the section or the row moved, and the anchor must be re-derived by hand), then a five-line file
whose last line is `---` with no body after it.

- [ ] **Step 4: Preview, then apply.**

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
bunx @c3x/cli@11.6.3 change view adr-20260904-retire-kanna-session-ids 2>&1
bunx @c3x/cli@11.6.3 change apply adr-20260904-retire-kanna-session-ids --dry-run 2>&1
```

Expected: `view` prints
`ok     01-drop-kanna-contract-row.patch.md → c3-215 (block) [pending]` and
`would apply 1 · would reject 0`; the dry run prints
`would apply 01-drop-kanna-contract-row.patch.md → c3-215 (block)`. A `drifted` state means the
anchor is stale — re-run Step 3 to re-read the handle rather than forcing the apply.

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
bunx @c3x/cli@11.6.3 change apply adr-20260904-retire-kanna-session-ids 2>&1
git status --short
```

Expected: `applied 01-drop-kanna-contract-row.patch.md → c3-215 (block)`, then a `git status`
listing **four** entries: `M .c3/c3-2-plugins/c3-215-tribe.md` (wanted),
`?? .c3/adr/adr-20260904-retire-kanna-session-ids.md` and
`?? .c3/changes/adr-20260904-retire-kanna-session-ids/` (wanted), plus the unrelated reseal churn
`M .c3/adr/adr-20260821-explaining-illustration-scope.md` and
`M .c3/c3-2-plugins/c3-201-explaining.md`.

- [ ] **Step 5: Discard the unrelated reseal churn.**

That churn is destructive: `c3x` 11.6.3 re-serializes those two facts and drops the trailing
`Governance review` cell of a table row in the 2026-08-21 ADR. Restore both files — content and
seal together, so they stay self-consistent:

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
git checkout -- .c3/adr/adr-20260821-explaining-illustration-scope.md \
                .c3/c3-2-plugins/c3-201-explaining.md
git status --short
git diff --stat -- .c3
```

Expected: `git status --short` no longer mentions either file; `git diff --stat -- .c3` shows
exactly one modified tracked file, `.c3/c3-2-plugins/c3-215-tribe.md`, with 2 insertions and 3
deletions (the seal line rewritten plus the removed Contract row).

- [ ] **Step 6: Run the C3 gates and the G1 proof.**

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
bunx @c3x/cli@11.6.3 check --only c3-215; echo "only-215 exit=$?"
bunx @c3x/cli@11.6.3 check; echo "full exit=$?"
bunx @c3x/cli@11.6.3 check --include-adr --only adr-20260904-retire-kanna-session-ids
echo "adr exit=$?"
bash /tmp/g1-assert.sh; echo "g1 exit=$?"
git status --short
```

Expected, matching the base capture in the spec: `check --only c3-215` prints
`Checked 46 docs — all clear` with `only-215 exit=0`; the full `check` prints
`Checked 46 docs — 2 errors` naming `c3-213` and `c3-216` and nothing else, with `full exit=1`
(identical to base — those two are inherited and out of scope, so do **not** fix them); the ADR
check exits 0; `/tmp/g1-assert.sh` prints three `ok:` lines with `g1 exit=0`. `git status --short`
must show no stray `.c3/c3.db-shm` or `.c3/c3.db-wal`; delete them with
`rm -f .c3/c3.db-shm .c3/c3.db-wal` if they appear.

- [ ] **Step 7: Commit**

```bash
cd /Users/hip/repo/todd-skills-wt/retire-kanna-session-ids
git add .c3/adr/adr-20260904-retire-kanna-session-ids.md \
        .c3/changes/adr-20260904-retire-kanna-session-ids \
        .c3/c3-2-plugins/c3-215-tribe.md \
        docs/superpowers/plans/2026-09-04-retire-kanna-session-ids.md
git status --short
git commit -m "docs(c3): drop the c3-215 Contract row for the deleted Kanna bridge" \
  -m "The scripts/kanna/list-session-ids.sh surface no longer exists, so its Contract row
was a false claim. Removed through adr-20260904-retire-kanna-session-ids and its single
block patch — the only legal mutation path for a sealed fact.

c3x check is unchanged: c3-215 clear, the inherited c3-213/c3-216 errors untouched.
The unrelated reseal churn c3x 11.6.3 emits on apply was discarded." \
  -m $'Tribe-Card: retire-kanna-session-ids\nTribe-Task: 2/2'
git log -1 --format='%H%n---%n%(trailers)'
git status --short
```

Expected: the commit lands with trailers `Tribe-Card: retire-kanna-session-ids` and
`Tribe-Task: 2/2` and no `Co-Authored-By` line; the final `git status --short` is empty (a clean
tree).

## Task checkboxes

- [ ] Task 1 — script, test and README (tick in Task 1's commit)
- [ ] Task 2 — c3-215 Contract row via ADR change-unit (tick in Task 2's commit)

## Report back

Report to the Warchief with `DONE` (or `DONE_WITH_CONCERNS`), the commit sha, and the verbatim
output of every "Expected" block above that differed from what the plan predicted. If a command
fails in a way this plan does not describe — a rejected ADR section, a drifted anchor that
re-reading does not fix, an unexpected suite turning red — stop and report `NEEDS_CONTEXT` or
`BLOCKED` rather than improvising a workaround.
