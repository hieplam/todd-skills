# Plan — Blind-reader review for the `explaining` skill (Rule 5)

**Card:** `i106-blind-reader-review` (campaign `gh-issues-2026-09`, GitHub issue #106)
**Lands at:** `docs/superpowers/plans/2026-09-02-explaining-blind-reader-review.md`
**Spec (frozen, Shaman-authored):** lands at
`docs/superpowers/specs/2026-09-02-explaining-blind-reader-review-design.md`
**Base:** `master` @ `5e8c095`.
**Author:** planning Warchief, 2026-09-02. Implementation is a separate full-build dispatch.

10 tasks, strictly sequential, one commit each. Task 1 is a gate: nothing after it is
dispatched until it is green.

---

## What this plan builds, in one paragraph

The `explaining` skill gets a fifth rule. Before a long explanation or an on-disk artifact is
delivered, the author writes the draft to a file and dispatches one fresh subagent — a **blind
reader** whose entire input is a rendered brief carrying the file path, the audience, and the
language, and nothing else. The reader reports what it could not follow, severity `BLOCK` or
`NIT`. The author fixes every `BLOCK`, rewrites the file, dispatches a **new** reader, and stops
at `READER: PASS` or after round 3. Every round is appended to a machine-readable log next to the
draft; a new skill-local check script reads that log and is what the eval harness gates on; the
final answer always carries one line saying how the review ended.

## Goal and verification coverage (spec §5, §6)

| Spec item | Covered by |
| --- | --- |
| G1 mechanism fires end to end | Task 1 (de-risk), Task 5 (the rule), Task 6 (eval case 4), Task 8 (evidence run, gate: 2 of 3) |
| G2 the reader is genuinely blind | Task 2 (template with the seal), Task 3 (`missingInvariants` + `findLeakedNgram` core), Task 4 (the check enforces both), Task 8 (measured) |
| G3 it catches something | Task 3 (`requireCatch` in `evaluateLog`), Task 8 (tallied post-hoc from preserved logs with `--require-catch`) |
| G4 bounded cost | Task 3 (`maxRounds` in `evaluateLog`), Task 5 (hard cap in the rule text), Task 8 (cost and wall-clock delta vs the pre-change skill dir) |
| G5 no regression | Task 9 (case 3 re-run, both modes, 3 runs) |
| G6 governed | Task 5 (self-check item 4), Task 6 (evals case 4), Task 7 (README), Task 10 (change-unit, ADR, `c3-201` sync) |
| §6.1 `bun test` green | Tasks 3, 4, 6 (each ends on a green suite) |
| §6.2 harness case 4, 3 runs, haiku executor | Task 8 |
| §6.3 harness case 3, both modes, 3 runs | Task 9 |
| §6.4 `grep -c "Rule 5"` and a 4-item self-check | Task 5 |
| §6.5 diff file list inside the scope fence | Global Constraints, verified per task |
| §6.6 two skinner reports, tracker, scout | The executing Warchief's audit loop, per task and once across the branch |
| §6.7 change-unit, ADR, `c3-201` updated | Task 10 |
| §6.8 evidence document under `docs/superpowers/evidence/` | Tasks 8 and 9 write one shared document |

## Frozen decisions this plan honours

`D106-1` reader is the judge, hard cap 3 rounds. `D106-2` threshold is an on-disk artifact or
600 words or more. `D106-3` reader model `sonnet` by default, documented as a knob. `D106-4`
degrade to the self-check when no dispatch tool exists. `D106-5` the ending line is always
visible. `D106-6` the brief template ships inside the skill directory, no new agent file.

## How-level decisions this plan makes (the Warchief's authority per the card)

| Id | Decision | Why |
| --- | --- | --- |
| H1 | The log is `<draft-file-name>.review.jsonl`, one JSON object per round, next to the draft | JSONL appends cleanly round by round and survives a crash mid-review; a sibling path needs no configuration |
| H2 | The check script is `scripts/check-review-log.ts`, skill-local, with its own `bun test` suite | Same shape as `validate-mermaid.ts`; `install.sh` symlinks the whole skill directory, so no installer change |
| H3 | The eval prompt reaches the check through an explicit `--prompt` argument in the check command, and a skill-local test asserts that argument equals the case prompt byte for byte | The harness gives a check no other channel to the prompt; the consistency test removes the drift risk that duplication would otherwise create |
| H4 | The template carries `BRIEF-START` and `BRIEF-END` markers; the invariant lines between them are what a rendered brief must reproduce | Lets the template also carry rendering notes that must NOT appear in the brief, and makes "matches the template shape" a mechanical test rather than a judgment |
| H5 | G3 (the reader catches something) is measured post-hoc by re-running the check with `--require-catch` over the preserved logs, and is NOT part of the `checks[]` command | A draft that is genuinely clean in round 1 must not be scored as a broken mechanism; conflating G1 and G3 in one exit code would do exactly that |
| H6 | Leakage is measured as a shared run of 12 normalized words between the rendered brief and the eval prompt | Spec §2.3 fixes the number; normalizing to lowercase words makes it robust to punctuation and re-wrapping |
| H7 | Rounds are validated as consecutive from 1, with a `PASS` only in the final round | Catches a log that was written after the fact rather than round by round |

---

## Global Constraints

- **Implementer: dispatch each implementation/fix task to the `hunter` subagent — never a generic
  implementer.** Tasks 8 and 9 are the exception named in `warchief.md` step 7: capturing evidence
  by running the repo harness is the Warchief's own delivery duty, and a Hunter must never spend
  the eval budget.
- **Purity: core logic stays deterministic and side-effect-free; every outside-world dependency
  (database, network, filesystem, clock, random, global state) enters through an abstraction
  injected from the edge — never constructed inside core logic (see
  `~/.claude/rules/pure-core.md`).** For `check-review-log.ts` that means: parsing, normalizing,
  leak detection, template matching and the pass/fail decision are exported pure functions with no
  I/O; reading files, scanning the glob and returning an exit code live only in `main`.
- **Scope fence (card).** In: `plugins/explaining/**`, `docs/superpowers/{specs,plans,evidence}/**`,
  `.c3/**`. Out: every other plugin, `install.sh`, any new agent definition file, and any edit to
  the text of Rules 1 through 4. `scripts/evals/**` is touched ONLY if a harness gap blocks a
  check — this plan is designed so that no harness change is needed, and a task that discovers
  otherwise stops and reports rather than editing the harness.
- **Never edit the text of Rules 1 through 4, the Overview, or the Evidence section of
  `SKILL.md`.** Task 5 appends Rule 5 and adds one self-check item; nothing else in that file moves.
- **Environment facts, binding on every task:**
  - A parallel session owns the worktree `/Users/hip/repo/todd-skills-wt/campaign-live-viewer`.
    **Never read from, write to, or run git commands against that path.**
  - `master` carries three pre-existing dirty files that are **not yours and must never be
    staged**: `.vscode/launch.json` (modified), `plugins/tribe/scripts/kanna/list-session-ids.sh`
    (deleted), `plugins/tribe/scripts/viewer/package.json` (modified). Stage explicit paths with
    `git add <path>`; never `git add -A` or `git commit -a`.
  - `bun` is 1.3.14. `python3` is 3.9.6 — no 3.10+ syntax evaluated at runtime.
  - There is **no `c3` and no `c3x` binary on PATH**, and no GNU `timeout`. The C3 entry point is
    the skill wrapper: `C3X_MODE=agent bash "$C3X" <command>` where
    `C3X=/Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/bin/c3x.sh`.
    The skill is a router over that wrapper; read
    `/Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/references/change.md`
    and follow it verbatim.
  - `bunx @c3x/cli` is NOT to be used; the wrapper above is the installed runtime.
- **Governance gate baseline.** On the base commit, `C3X_MODE=agent bash "$C3X" check` reports
  exactly **2 errors** — `c3-213` and `c3-216`, both "ungrounded derivation in Derived Materials
  row 1". They are pre-existing and not yours to fix. The gate is: still exactly those two, no new
  ones.
- **Never `bun add` into the repo root.** The check script needs no new dependency at all — plain
  `bun` plus `node:fs`. If a task believes it needs one, it stops and reports instead.
- **Do not run `scripts/evals/run_evals.py` against the live `claude` CLI in any Hunter task.**
  Hunter tasks prove themselves with `bun test`, `python3 -m unittest`, and `--dry-run`. The paid
  measurements are tasks 8 and 9, run by the Warchief.
- **Commit discipline:** tick this plan's checkboxes in the SAME commit as the code, stage explicit
  paths only, and stamp every commit with `Tribe-Card: i106-blind-reader-review` and
  `Tribe-Task: N/10` as two lines of the commit message's single final paragraph.
  **Never add an agent name as a co-author** (owner rule).
- **Blacklist:** no open entity under `.c3/documents/debt/` exists in this repo at the base commit;
  nothing on this card designs a blacklisted pattern back in.

---

### Task 1: De-risk — prove a skill can dispatch a fresh subagent inside the harness leg

**Why:** spec §7 risk 3. Rule 5 is worthless if the isolated `claude -p` process the eval harness
spawns cannot dispatch a subagent. This task answers that in one cheap run, on the harness's own
`with_skill` flags, before a single line of the rule is written. Every later task assumes a green
result here.

**This task changes no product code.** Its deliverable is a committed transcript.

- Create: `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review-derisk.md`

**Steps**

- [x] **Step 1: Run the probe.** From a throwaway directory, replicate the harness's `with_skill`
  invocation exactly — the flags come from `scripts/evals/run_evals.py` `run_claude()`
  (`--output-format stream-json --verbose --no-session-persistence`,
  `--permission-mode bypassPermissions`, `--setting-sources project --strict-mcp-config`) and the
  executor model is the owner's cheap-model rule:

```bash
PROBE=$(mktemp -d)
cd "$PROBE"
env -u CLAUDECODE claude -p 'Dispatch one fresh subagent using your Agent or Task tool, requesting the model sonnet. The subagent brief must be exactly: reply with the single line SUBAGENT-OK 7919 and nothing else. When it returns, write its reply verbatim into reader-result.txt in the current working directory, then print one final line reading MAIN-SAW: followed by that reply.' \
  --output-format stream-json --verbose --no-session-persistence \
  --model claude-haiku-4-5-20251001 \
  --permission-mode bypassPermissions \
  --setting-sources project --strict-mcp-config \
  > probe.stream.json 2> probe.stderr.txt
echo "exit=$?"
```

- [x] **Step 2: Read the three answers out of the stream.** Each is a separate question and each
  goes in the transcript:

```bash
cd "$PROBE"
echo "--- did a dispatch tool get called at all ---"
grep -o '"name":"[A-Za-z]*"' probe.stream.json | sort | uniq -c
echo "--- was a model override accepted on that call ---"
grep -o '"model":"[^"]*"' probe.stream.json | sort | uniq -c
echo "--- did the main session read the subagent reply back ---"
cat reader-result.txt 2>/dev/null || echo "NO reader-result.txt"
grep -c 'SUBAGENT-OK 7919' probe.stream.json
```

  Expected on a green result: the tool tally contains `Task` (or `Agent`) at least once,
  `reader-result.txt` contains `SUBAGENT-OK 7919`, and the final `result` event carries
  `MAIN-SAW: SUBAGENT-OK 7919`. The model tally answers the knob question: if a value other than
  the executor model appears on the dispatch, an explicit reader-model override is accepted; if
  only the executor model appears, it is not, and Rule 5 records `reader_model` as the model
  actually used.

- [x] **Step 3: Write the transcript.** Create
  `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review-derisk.md` containing: the
  exact command, the exit code, the three greps above with their real output, the file content of
  `reader-result.txt`, and a one-line verdict — `DISPATCH AVAILABLE` or `DISPATCH UNAVAILABLE` —
  plus one line stating whether a reader-model override was accepted.

- [x] **Step 4: Commit** — stage only the new evidence file and this plan, message
  `de-risk: prove subagent dispatch inside the harness with_skill leg`, with
  `Tribe-Card: i106-blind-reader-review` and `Tribe-Task: 1/10` as the final paragraph.

**Expected result and the branch it creates**

- **Green (`DISPATCH AVAILABLE`)** — continue to task 2 unchanged.
- **Red (`DISPATCH UNAVAILABLE`)** — the Hunter reports `BLOCKED` with the transcript path and
  stops. The Warchief does **not** design around it: it returns `NEEDS_DIRECTION` to the Shaman
  with the transcript attached and this framing — Rule 5 can still ship as prose with its
  `D106-4` degrade path, but G1 cannot be evidenced by the harness, so either the card's G1 gate
  moves to a different proof surface or the rule does not ship. That is a What question (does a
  rule ship without eval evidence, against `c3-201`'s frozen fact), and it belongs to the Shaman.

---

### Task 2: The blind-reader brief template

**Why:** spec §2.1 item 3 and `D106-6`. This file is the seal ported from
`docs/tribe/planning/idea-02-context-isolation/spec.md` §1.1 into prose review: the reader's input
is an allowlist of three values, and the template is what makes "the brief carried nothing else" a
checkable claim rather than an intention.

- Create: `plugins/explaining/skills/explaining/references/blind-reader-brief.md`
- Create: `plugins/explaining/skills/explaining/scripts/blind-reader-brief.test.ts`

**Steps**

- [ ] **Step 1: Write the failing test.** Create
  `plugins/explaining/skills/explaining/scripts/blind-reader-brief.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const TEMPLATE = resolve(SCRIPT_DIR, '..', 'references', 'blind-reader-brief.md');

describe('blind-reader brief template', () => {
  const text = readFileSync(TEMPLATE, 'utf8');

  test('marks the renderable region with BRIEF-START and BRIEF-END', () => {
    const start = text.indexOf('BRIEF-START');
    const end = text.indexOf('BRIEF-END');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
  });

  test('carries exactly the three allowed slots, each once', () => {
    const slots = [...text.matchAll(/\{\{([a-z_]+)\}\}/g)].map((m) => m[1]);
    expect(slots.sort()).toEqual(['artifact_path', 'audience', 'language']);
  });

  test('every slot sits inside the renderable region', () => {
    const region = text.slice(text.indexOf('BRIEF-START'), text.indexOf('BRIEF-END'));
    for (const slot of ['artifact_path', 'audience', 'language']) {
      expect(region).toContain(`{{${slot}}}`);
    }
  });

  test('instructs the terminal verdict line the rule parses', () => {
    expect(text).toContain('READER: PASS');
    expect(text).toContain('READER: FAIL');
  });

  test('asks for the hardest passage even on a clean read (spec risk 1)', () => {
    expect(text.toLowerCase()).toContain('hardest passage');
  });

  test('names the reader model knob outside the renderable region', () => {
    const notes = text.slice(text.indexOf('BRIEF-END'));
    expect(notes).toContain('sonnet');
  });

  test('never names the forbidden inputs inside the renderable region', () => {
    const region = text.slice(text.indexOf('BRIEF-START'), text.indexOf('BRIEF-END'));
    for (const banned of ['user prompt', 'the author', 'source', 'reasoning', 'previous round']) {
      expect(region.toLowerCase()).not.toContain(banned);
    }
  });
});
```

  Run it and watch it fail:

```bash
cd /Users/hip/repo/todd-skills/plugins/explaining/skills/explaining/scripts
bun test blind-reader-brief.test.ts
```

  Expected: every test fails — the template file does not exist yet.

- [ ] **Step 2: Write the template.** Create
  `plugins/explaining/skills/explaining/references/blind-reader-brief.md` with exactly this
  content:

```markdown
# Blind-reader brief (template)

Render the region between the two markers below by replacing each slot with its value, and
send that rendered text as the subagent's entire brief. Change nothing else in the region:
the eval check asserts every non-slot line survives verbatim, and the rendered text is what
the review log records.

<!-- BRIEF-START -->
Read the file at {{artifact_path}}. It was written for {{audience}}, in {{language}}.

You are a first-time reader. You have no other context, and you must not go looking for any:
do not read other files, do not search anywhere, do not guess at what the author meant. Judge
only what is on the page.

Report every place you could not follow, in the order they appear. Give each one as three
labelled lines:

LOCATION: a short quoted phrase, or the heading it sits under
WHAT BROKE: one sentence, in your own words
SEVERITY: BLOCK if you could not understand it, NIT if you understood it but it read rough

Look especially for: a term used before it is introduced, a jump between two ideas with no
bridge, a claim with nothing concrete to anchor it, a sentence you had to read twice, and a
section whose purpose is never stated.

Report the single hardest passage even when nothing blocked you, as a NIT.

End your reply with exactly one terminal line, and nothing after it: READER: PASS when you
found zero BLOCK findings, or READER: FAIL n BLOCK when you found n of them.
<!-- BRIEF-END -->

## Rendering notes (never send these to the reader)

- The three slots are the only values that may cross into the brief: `{{artifact_path}}` is the
  path of the file on disk, `{{audience}}` is one short phrase, `{{language}}` is the language
  the file is written in. Nothing else crosses — not the user's request, not your sources, not
  your reasoning, not the draft text pasted inline, and not any earlier round's findings. A
  reader that has been told what the draft was supposed to say can no longer tell you what it
  actually says.
- Reader model: `sonnet` by default, the same tier the tribe's reviewer agent uses. This is the
  knob to turn when a draft is unusually long or unusually cheap to read. If the dispatch tool
  in this session does not accept a model override, dispatch with the session default and record
  the model actually used in the review log.
- Dispatch a fresh subagent every round. Never a fork of the current session, and never the
  current session itself: the whole value is a context that has never seen the draft before.
```

- [ ] **Step 3: Prove it green.**

```bash
cd /Users/hip/repo/todd-skills/plugins/explaining/skills/explaining/scripts
bun test blind-reader-brief.test.ts
```

  Expected: 7 pass, 0 fail.

- [ ] **Step 4: Commit** — stage
  `plugins/explaining/skills/explaining/references/blind-reader-brief.md`,
  `plugins/explaining/skills/explaining/scripts/blind-reader-brief.test.ts` and this plan;
  message `explaining: add the blind-reader brief template`, with
  `Tribe-Card: i106-blind-reader-review` and `Tribe-Task: 2/10`.

---

### Task 3: The review-log check — pure core

**Why:** spec §2.3. This is the machine that decides whether the review actually happened, and
per the purity rule it is written as pure functions first: parse, normalize, detect leakage, match
the template, decide. No file touches this task at all.

- Create: `plugins/explaining/skills/explaining/scripts/check-review-log.ts`
- Create: `plugins/explaining/skills/explaining/scripts/check-review-log.test.ts`

**Steps**

- [ ] **Step 1: Write the failing test.** Create
  `plugins/explaining/skills/explaining/scripts/check-review-log.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import {
  EXIT_CODE,
  LEAK_NGRAM,
  MAX_ROUNDS,
  evaluateLog,
  findLeakedNgram,
  formatSummary,
  missingInvariants,
  ngrams,
  normalizeWords,
  parseReviewLog,
  templateInvariants,
} from './check-review-log';

const INVARIANTS = ['You are a first-time reader.', 'SEVERITY: BLOCK or NIT'];
const PROMPT = 'Explain how a write-ahead log keeps a database durable and crash consistent across a restart of the process';

function brief(extra = ''): string {
  return `Read the file at draft.md. It was written for a backend developer, in English.\nYou are a first-time reader.\nSEVERITY: BLOCK or NIT\n${extra}`;
}

function round(n: number, blocks: number, extra = ''): string {
  const findings = [];
  for (let i = 0; i < blocks; i++) {
    findings.push({ severity: 'BLOCK', location: `phrase ${i}`, issue: 'could not follow' });
  }
  return JSON.stringify({
    round: n,
    reader_model: 'sonnet',
    brief: brief(extra),
    findings,
    block_count: blocks,
    verdict: blocks === 0 ? 'PASS' : 'FAIL',
    author_action: blocks === 0 ? '' : 'rewrote the second section',
  });
}

describe('parseReviewLog', () => {
  test('parses a well-formed two-round log', () => {
    const { rounds, errors } = parseReviewLog(`${round(1, 2)}\n${round(2, 0)}\n`);
    expect(errors).toEqual([]);
    expect(rounds.map((r) => r.round)).toEqual([1, 2]);
    expect(rounds[0].block_count).toBe(2);
    expect(rounds[1].verdict).toBe('PASS');
  });

  test('an empty log is an error, not an empty success', () => {
    expect(parseReviewLog('\n  \n').errors).toContain('log is empty');
  });

  test('rejects a line that is not JSON', () => {
    const { errors } = parseReviewLog('not json at all\n');
    expect(errors[0]).toContain('not valid JSON');
  });

  test('rejects a block_count that disagrees with the findings', () => {
    const bad = JSON.stringify({ round: 1, brief: brief(), findings: [], block_count: 2, verdict: 'FAIL' });
    expect(parseReviewLog(bad).errors[0]).toContain('block_count');
  });

  test('rejects a verdict that contradicts the block count', () => {
    const bad = JSON.stringify({
      round: 1, brief: brief(),
      findings: [{ severity: 'BLOCK', location: 'a', issue: 'b' }],
      block_count: 1, verdict: 'PASS',
    });
    expect(parseReviewLog(bad).errors[0]).toContain('contradicts');
  });

  test('rejects a finding with an unknown severity', () => {
    const bad = JSON.stringify({
      round: 1, brief: brief(),
      findings: [{ severity: 'MAYBE', location: 'a', issue: 'b' }],
      block_count: 0, verdict: 'PASS',
    });
    expect(parseReviewLog(bad).errors[0]).toContain('severity');
  });
});

describe('leak detection', () => {
  test('normalizes to lowercase words and drops punctuation', () => {
    expect(normalizeWords('Read, the FILE at draft.md!')).toEqual(['read', 'the', 'file', 'at', 'draft', 'md']);
  });

  test('ngrams slides a window of n words', () => {
    expect(ngrams(['a', 'b', 'c'], 2)).toEqual(['a b', 'b c']);
  });

  test('finds a shared run of exactly the window length', () => {
    const twelve = PROMPT.split(' ').slice(0, LEAK_NGRAM).join(' ');
    expect(findLeakedNgram(brief(twelve), PROMPT, LEAK_NGRAM)).not.toBeNull();
  });

  test('a shorter overlap is legitimate and does not trip it', () => {
    const eleven = PROMPT.split(' ').slice(0, LEAK_NGRAM - 1).join(' ');
    expect(findLeakedNgram(brief(eleven), PROMPT, LEAK_NGRAM)).toBeNull();
  });
});

describe('template matching', () => {
  const template = [
    '# heading that is not part of the brief',
    '<!-- BRIEF-START -->',
    'Read the file at {{artifact_path}}.',
    '',
    'You are a first-time reader.',
    '<!-- BRIEF-END -->',
    'Rendering notes that must never be sent.',
  ].join('\n');

  test('takes only the non-slot lines between the markers', () => {
    expect(templateInvariants(template)).toEqual(['You are a first-time reader.']);
  });

  test('returns nothing when the markers are absent', () => {
    expect(templateInvariants('no markers here')).toEqual([]);
  });

  test('re-wrapped whitespace still matches', () => {
    expect(missingInvariants('You are\na first-time    reader.', ['You are a first-time reader.'])).toEqual([]);
  });

  test('reports the invariant line a rewritten brief dropped', () => {
    expect(missingInvariants('a brief of my own invention', INVARIANTS)).toEqual(INVARIANTS);
  });
});

describe('evaluateLog', () => {
  const opts = { invariants: INVARIANTS, prompt: PROMPT };

  test('accepts a review that reached PASS inside the cap', () => {
    const { rounds } = parseReviewLog(`${round(1, 2)}\n${round(2, 0)}`);
    expect(evaluateLog(rounds, opts)).toEqual({ ok: true, reasons: [] });
  });

  test('accepts a review that ran out at the cap still failing', () => {
    const { rounds } = parseReviewLog(`${round(1, 3)}\n${round(2, 2)}\n${round(3, 1)}`);
    expect(evaluateLog(rounds, opts).ok).toBe(true);
  });

  test('rejects a fourth round', () => {
    const { rounds } = parseReviewLog(`${round(1, 3)}\n${round(2, 2)}\n${round(3, 1)}\n${round(4, 0)}`);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain(`cap is ${MAX_ROUNDS}`);
  });

  test('rejects an empty round list', () => {
    expect(evaluateLog([], opts).reasons).toContain('no review round recorded');
  });

  test('rejects giving up before the cap while still failing', () => {
    const { rounds } = parseReviewLog(`${round(1, 3)}\n${round(2, 1)}`);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain('before the cap');
  });

  test('rejects a PASS round followed by more rounds', () => {
    const { rounds } = parseReviewLog(`${round(1, 0)}\n${round(2, 1)}`);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain('the loop continued');
  });

  test('rejects round numbers that are not consecutive from 1', () => {
    const { rounds } = parseReviewLog(`${round(2, 1)}\n${round(3, 0)}`);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain('consecutive');
  });

  test('rejects a brief that does not reproduce the template', () => {
    const bad = JSON.stringify({ round: 1, brief: 'read the file and tell me if it is good', findings: [], block_count: 0, verdict: 'PASS' });
    const { rounds } = parseReviewLog(bad);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain('does not match the template');
  });

  test('rejects a brief carrying a long run of the prompt', () => {
    const twelve = PROMPT.split(' ').slice(0, LEAK_NGRAM).join(' ');
    const { rounds } = parseReviewLog(`${round(1, 0, twelve)}`);
    expect(evaluateLog(rounds, opts).reasons.join(' ')).toContain('leaks');
  });

  test('require-catch demands a round-1 finding and a fall in round 2', () => {
    const clean = parseReviewLog(`${round(1, 0)}`).rounds;
    expect(evaluateLog(clean, { ...opts, requireCatch: true }).reasons.join(' ')).toContain('round 1 found no BLOCK');
    const flat = parseReviewLog(`${round(1, 2)}\n${round(2, 2)}\n${round(3, 2)}`).rounds;
    expect(evaluateLog(flat, { ...opts, requireCatch: true }).reasons.join(' ')).toContain('did not fall below');
    const good = parseReviewLog(`${round(1, 2)}\n${round(2, 0)}`).rounds;
    expect(evaluateLog(good, { ...opts, requireCatch: true }).ok).toBe(true);
  });

  test('require-catch is off by default, so a clean first read passes', () => {
    const clean = parseReviewLog(`${round(1, 0)}`).rounds;
    expect(evaluateLog(clean, opts).ok).toBe(true);
  });
});

describe('formatSummary', () => {
  test('prints one greppable line per log', () => {
    const { rounds } = parseReviewLog(`${round(1, 2)}\n${round(2, 0)}`);
    expect(formatSummary('draft.md.review.jsonl', rounds))
      .toBe('REVIEW-LOG: file=draft.md.review.jsonl rounds=2 blocks=2,0 verdict=PASS');
  });

  test('the exit codes are the harness three-outcome vocabulary', () => {
    expect(EXIT_CODE).toEqual({ PASS: 0, FAIL: 1, CANNOT_RUN: 2 });
  });
});
```

  Run it and watch it fail:

```bash
cd /Users/hip/repo/todd-skills/plugins/explaining/skills/explaining/scripts
bun test check-review-log.test.ts
```

  Expected: the run errors out on a missing module — `check-review-log.ts` does not exist.

- [ ] **Step 2: Write the pure core.** Create
  `plugins/explaining/skills/explaining/scripts/check-review-log.ts` with exactly this content
  (the impure edge arrives in task 4; this file is complete and importable as it stands):

```ts
// Review-log check for the `explaining` skill's Rule 5 (blind-reader review).
//
// Pure core (parseReviewLog, normalizeWords, ngrams, findLeakedNgram, templateInvariants,
// missingInvariants, evaluateLog, formatSummary, EXIT_CODE) is exported for direct unit
// testing and performs no I/O. The impure edge (argument parsing against the real argv,
// reading the template and the logs, the exit code) lives in main().

export const EXIT_CODE = { PASS: 0, FAIL: 1, CANNOT_RUN: 2 } as const;

/** Shared run of this many normalized words between a brief and the prompt counts as
 * leakage (spec 2.3). Short overlaps are legitimate: the audience phrase is derived
 * from the prompt on purpose. */
export const LEAK_NGRAM = 12;

/** The hard cap from D106-1. A fourth round is never legal. */
export const MAX_ROUNDS = 3;

export type Severity = 'BLOCK' | 'NIT';

export interface Finding {
  severity: Severity;
  location: string;
  issue: string;
}

export interface RoundRecord {
  round: number;
  reader_model?: string;
  brief: string;
  findings: Finding[];
  block_count: number;
  verdict: 'PASS' | 'FAIL';
  author_action?: string;
}

/** Pure: parse a review log (one JSON object per line) into records plus shape errors.
 * A record that fails validation is reported and dropped, never half-accepted. */
export function parseReviewLog(text: string): { rounds: RoundRecord[]; errors: string[] } {
  const rounds: RoundRecord[] = [];
  const errors: string[] = [];
  const lines = text.split('\n').map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) {
    errors.push('log is empty');
    return { rounds, errors };
  }
  lines.forEach((line, index) => {
    const where = `line ${index + 1}`;
    let value: unknown;
    try {
      value = JSON.parse(line);
    } catch {
      errors.push(`${where}: not valid JSON`);
      return;
    }
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      errors.push(`${where}: not a JSON object`);
      return;
    }
    const record = value as Record<string, unknown>;
    if (!Number.isInteger(record.round) || (record.round as number) < 1) {
      errors.push(`${where}: round must be an integer of at least 1`);
      return;
    }
    if (typeof record.brief !== 'string' || record.brief.trim().length === 0) {
      errors.push(`${where}: brief must be a non-empty string`);
      return;
    }
    if (!Array.isArray(record.findings)) {
      errors.push(`${where}: findings must be an array`);
      return;
    }
    const findings: Finding[] = [];
    for (const raw of record.findings) {
      const finding = raw as Record<string, unknown> | null;
      if (
        finding === null || typeof finding !== 'object'
        || (finding.severity !== 'BLOCK' && finding.severity !== 'NIT')
        || typeof finding.location !== 'string' || typeof finding.issue !== 'string'
      ) {
        errors.push(`${where}: every finding needs severity BLOCK or NIT, a location and an issue`);
        return;
      }
      findings.push({
        severity: finding.severity as Severity,
        location: finding.location,
        issue: finding.issue,
      });
    }
    const blocks = findings.filter((finding) => finding.severity === 'BLOCK').length;
    if (record.block_count !== blocks) {
      errors.push(`${where}: block_count ${String(record.block_count)} does not match ${blocks} BLOCK finding(s)`);
      return;
    }
    if (record.verdict !== 'PASS' && record.verdict !== 'FAIL') {
      errors.push(`${where}: verdict must be PASS or FAIL`);
      return;
    }
    if ((record.verdict === 'PASS') !== (blocks === 0)) {
      errors.push(`${where}: verdict ${record.verdict} contradicts ${blocks} BLOCK finding(s)`);
      return;
    }
    rounds.push({
      round: record.round as number,
      reader_model: typeof record.reader_model === 'string' ? record.reader_model : undefined,
      brief: record.brief,
      findings,
      block_count: blocks,
      verdict: record.verdict,
      author_action: typeof record.author_action === 'string' ? record.author_action : undefined,
    });
  });
  return { rounds, errors };
}

/** Pure: lowercase words with punctuation dropped — the unit both leak sides compare in,
 * so re-wrapping or re-punctuating a leaked sentence does not hide it. */
export function normalizeWords(text: string): string[] {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/)
    .filter((word) => word.length > 0);
}

/** Pure: every sliding window of n words. */
export function ngrams(words: string[], n: number): string[] {
  const out: string[] = [];
  for (let i = 0; i + n <= words.length; i++) out.push(words.slice(i, i + n).join(' '));
  return out;
}

/** Pure: the first n-word run the brief shares with the prompt, or null when clean. */
export function findLeakedNgram(brief: string, prompt: string, n: number): string | null {
  const inBrief = new Set(ngrams(normalizeWords(brief), n));
  for (const gram of ngrams(normalizeWords(prompt), n)) {
    if (inBrief.has(gram)) return gram;
  }
  return null;
}

/** Pure: the template lines a rendered brief must reproduce — the non-empty, slot-free
 * lines between the BRIEF-START and BRIEF-END markers. Everything outside the markers is
 * rendering guidance for the author and must NOT appear in the brief. */
export function templateInvariants(template: string): string[] {
  const lines = template.split('\n');
  const start = lines.findIndex((line) => line.includes('BRIEF-START'));
  const end = lines.findIndex((line) => line.includes('BRIEF-END'));
  if (start < 0 || end < 0 || end <= start) return [];
  return lines.slice(start + 1, end)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.includes('{{'));
}

/** Pure: which invariant lines the rendered brief dropped. Both sides are compared with
 * whitespace flattened, so a differently wrapped but word-identical brief still matches. */
export function missingInvariants(brief: string, invariants: string[]): string[] {
  const flat = brief.replace(/\s+/g, ' ').trim();
  return invariants.filter((line) => !flat.includes(line.replace(/\s+/g, ' ').trim()));
}

export interface EvaluateOptions {
  invariants: string[];
  prompt: string;
  requireCatch?: boolean;
  leakNgram?: number;
  maxRounds?: number;
}

export interface Evaluation {
  ok: boolean;
  reasons: string[];
}

/** Pure: the whole pass/fail decision for one review log. */
export function evaluateLog(rounds: RoundRecord[], options: EvaluateOptions): Evaluation {
  const reasons: string[] = [];
  const maxRounds = options.maxRounds ?? MAX_ROUNDS;
  const window = options.leakNgram ?? LEAK_NGRAM;

  if (rounds.length === 0) reasons.push('no review round recorded');
  if (rounds.length > maxRounds) {
    reasons.push(`${rounds.length} rounds recorded, cap is ${maxRounds}`);
  }

  rounds.forEach((record, index) => {
    if (record.round !== index + 1) {
      reasons.push(`round numbers are not consecutive from 1 (saw ${record.round} at position ${index + 1})`);
    }
    const missing = missingInvariants(record.brief, options.invariants);
    if (missing.length > 0) {
      reasons.push(`round ${record.round}: brief does not match the template, missing: ${missing[0]}`);
    }
    const leak = findLeakedNgram(record.brief, options.prompt, window);
    if (leak !== null) {
      reasons.push(`round ${record.round}: brief leaks ${window} words of the prompt: ${leak}`);
    }
    if (index < rounds.length - 1 && record.verdict === 'PASS') {
      reasons.push(`round ${record.round}: verdict PASS but the loop continued`);
    }
  });

  const last = rounds[rounds.length - 1];
  if (last !== undefined && last.verdict !== 'PASS' && rounds.length < maxRounds) {
    reasons.push(`review stopped at round ${rounds.length} still failing, before the cap of ${maxRounds}`);
  }

  if (options.requireCatch === true && rounds.length > 0) {
    if (rounds[0].block_count < 1) reasons.push('round 1 found no BLOCK finding');
    if (rounds.length > 1 && rounds[1].block_count >= rounds[0].block_count) {
      reasons.push(`round 2 block count ${rounds[1].block_count} did not fall below round 1 (${rounds[0].block_count})`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

/** Pure: one greppable line per log, so a preserved artifact can be tallied afterwards. */
export function formatSummary(file: string, rounds: RoundRecord[]): string {
  const blocks = rounds.map((record) => record.block_count).join(',');
  const verdict = rounds.length > 0 ? rounds[rounds.length - 1].verdict : 'NONE';
  return `REVIEW-LOG: file=${file} rounds=${rounds.length} blocks=${blocks === '' ? 'none' : blocks} verdict=${verdict}`;
}
```

- [ ] **Step 3: Prove it green, and prove nothing else moved.**

```bash
cd /Users/hip/repo/todd-skills/plugins/explaining/skills/explaining/scripts
bun test check-review-log.test.ts
bun test
```

  Expected: the new file passes every one of its tests, and the full suite (the two existing
  script suites plus the template suite from task 2) is green with 0 failures.

- [ ] **Step 4: Commit** — stage the two new script files and this plan; message
  `explaining: review-log check, pure core`, with `Tribe-Card: i106-blind-reader-review` and
  `Tribe-Task: 3/10`.

---

### Task 4: The review-log check — CLI edge and exit codes

**Why:** the harness decides pass, fail or ungraded from an exit code alone
(`classify_check_outcome` in `scripts/evals/run_evals.py`: 0 pass, 1 behavioral fail, anything
else ungraded). This task adds the thin impure edge that turns the pure decision into that
contract, and nothing else.

- Modify: `plugins/explaining/skills/explaining/scripts/check-review-log.ts`
- Modify: `plugins/explaining/skills/explaining/scripts/check-review-log.test.ts`

**Steps**

- [ ] **Step 1: Write the failing test.** Append to
  `plugins/explaining/skills/explaining/scripts/check-review-log.test.ts` (and extend its import
  list with `main` and `parseArgs`):

```ts
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const TEMPLATE_TEXT = [
  '# not part of the brief',
  '<!-- BRIEF-START -->',
  'Read the file at {{artifact_path}}. It was written for {{audience}}, in {{language}}.',
  'You are a first-time reader.',
  'SEVERITY: BLOCK or NIT',
  '<!-- BRIEF-END -->',
  'notes',
].join('\n');

function scratch(): string {
  return mkdtempSync(join(tmpdir(), 'check-review-log-'));
}

describe('parseArgs', () => {
  test('defaults the glob and the directory', () => {
    const args = parseArgs(['--prompt', 'p']);
    expect(args.logGlob).toBe('*.review.jsonl');
    expect(args.dir).toBe('.');
    expect(args.requireCatch).toBe(false);
    expect(args.error).toBeNull();
  });

  test('a missing --prompt is a setup error, not a verdict', () => {
    expect(parseArgs([]).error).toContain('--prompt');
  });

  test('an unknown flag is a setup error', () => {
    expect(parseArgs(['--prompt', 'p', '--nope']).error).toContain('unknown argument');
  });
});

describe('main() exit codes', () => {
  test('exits 2 when the arguments cannot be understood', async () => {
    expect(await main([])).toBe(EXIT_CODE.CANNOT_RUN);
  });

  test('exits 2 when the brief template cannot be read', async () => {
    const dir = scratch();
    try {
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', join(dir, 'absent.md')]))
        .toBe(EXIT_CODE.CANNOT_RUN);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exits 1 when no review log exists — the review did not happen', async () => {
    const dir = scratch();
    const template = join(dir, 'template.md');
    writeFileSync(template, TEMPLATE_TEXT);
    try {
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', template]))
        .toBe(EXIT_CODE.FAIL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exits 0 on a well-formed two-round log', async () => {
    const dir = scratch();
    const template = join(dir, 'template.md');
    writeFileSync(template, TEMPLATE_TEXT);
    writeFileSync(join(dir, 'draft.md.review.jsonl'), `${round(1, 2)}\n${round(2, 0)}\n`);
    try {
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', template]))
        .toBe(EXIT_CODE.PASS);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('exits 1 on a fourth round', async () => {
    const dir = scratch();
    const template = join(dir, 'template.md');
    writeFileSync(template, TEMPLATE_TEXT);
    writeFileSync(join(dir, 'draft.md.review.jsonl'),
      `${round(1, 3)}\n${round(2, 2)}\n${round(3, 1)}\n${round(4, 0)}\n`);
    try {
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', template]))
        .toBe(EXIT_CODE.FAIL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('--require-catch turns a clean first read into a fail, for post-hoc tallying', async () => {
    const dir = scratch();
    const template = join(dir, 'template.md');
    writeFileSync(template, TEMPLATE_TEXT);
    writeFileSync(join(dir, 'draft.md.review.jsonl'), `${round(1, 0)}\n`);
    try {
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', template]))
        .toBe(EXIT_CODE.PASS);
      expect(await main(['--prompt', PROMPT, '--dir', dir, '--template', template, '--require-catch']))
        .toBe(EXIT_CODE.FAIL);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

  Run it and watch it fail:

```bash
cd /Users/hip/repo/todd-skills/plugins/explaining/skills/explaining/scripts
bun test check-review-log.test.ts
```

  Expected: the import of `main` and `parseArgs` fails — neither is exported yet.

- [ ] **Step 2: Write the edge.** Append to
  `plugins/explaining/skills/explaining/scripts/check-review-log.ts`:

```ts
import { Glob } from 'bun';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

export interface CliArgs {
  dir: string;
  logGlob: string;
  prompt: string | null;
  template: string | null;
  requireCatch: boolean;
  error: string | null;
}

/** Pure: argv to options. A malformed invocation is a SETUP error (exit 2), never a
 * verdict on the artifact — the harness routes exit 2 to ungraded for exactly this. */
export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dir: '.', logGlob: '*.review.jsonl', prompt: null, template: null,
    requireCatch: false, error: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === '--require-catch') {
      args.requireCatch = true;
      continue;
    }
    const value = argv[i + 1];
    if (flag === '--log-glob' || flag === '--prompt' || flag === '--template' || flag === '--dir') {
      if (value === undefined) {
        args.error = `${flag} needs a value`;
        return args;
      }
      i++;
      if (flag === '--log-glob') args.logGlob = value;
      else if (flag === '--prompt') args.prompt = value;
      else if (flag === '--template') args.template = value;
      else args.dir = value;
      continue;
    }
    args.error = `unknown argument: ${flag}`;
    return args;
  }
  if (args.prompt === null) args.error = 'missing required --prompt';
  return args;
}

/** Impure edge: read the template and every matching log, run the pure decision, print,
 * and return the exit code the harness reads. */
export async function main(argv: string[]): Promise<number> {
  const args = parseArgs(argv);
  if (args.error !== null) {
    console.error(`CANNOT-RUN: ${args.error}`);
    return EXIT_CODE.CANNOT_RUN;
  }
  const templatePath = args.template
    ?? resolve(SCRIPT_DIR, '..', 'references', 'blind-reader-brief.md');
  let invariants: string[];
  try {
    invariants = templateInvariants(await readFile(templatePath, 'utf8'));
  } catch (error) {
    console.error(`CANNOT-RUN: cannot read the brief template at ${templatePath}: ${String(error)}`);
    return EXIT_CODE.CANNOT_RUN;
  }
  if (invariants.length === 0) {
    console.error(`CANNOT-RUN: the brief template at ${templatePath} carries no invariant lines between its markers`);
    return EXIT_CODE.CANNOT_RUN;
  }

  const files: string[] = [];
  try {
    for await (const file of new Glob(args.logGlob).scan({ cwd: args.dir, onlyFiles: true })) {
      files.push(file);
    }
  } catch (error) {
    console.error(`CANNOT-RUN: cannot scan ${args.dir} for ${args.logGlob}: ${String(error)}`);
    return EXIT_CODE.CANNOT_RUN;
  }
  files.sort();
  if (files.length === 0) {
    console.log(`INVALID: no review log matched ${args.logGlob} in ${args.dir} — the blind-reader review left no record`);
    return EXIT_CODE.FAIL;
  }

  let failed = false;
  for (const file of files) {
    let text: string;
    try {
      text = await readFile(resolve(args.dir, file), 'utf8');
    } catch (error) {
      console.error(`CANNOT-RUN: cannot read ${file}: ${String(error)}`);
      return EXIT_CODE.CANNOT_RUN;
    }
    const { rounds, errors } = parseReviewLog(text);
    const evaluation = evaluateLog(rounds, {
      invariants,
      prompt: args.prompt as string,
      requireCatch: args.requireCatch,
    });
    console.log(formatSummary(file, rounds));
    for (const problem of [...errors, ...evaluation.reasons]) {
      failed = true;
      console.log(`INVALID: ${file}: ${problem}`);
    }
  }
  if (failed) return EXIT_CODE.FAIL;
  console.log(`VALID: ${files.length} review log(s) checked, 0 error(s)`);
  return EXIT_CODE.PASS;
}

if (import.meta.main) {
  process.exit(await main(Bun.argv.slice(2)));
}
```

- [ ] **Step 3: Prove it green, including as a real CLI.**

```bash
cd /Users/hip/repo/todd-skills/plugins/explaining/skills/explaining/scripts
bun test
WORK=$(mktemp -d)
bun check-review-log.ts --dir "$WORK" --prompt 'anything at all'; echo "no-log exit=$?"
bun check-review-log.ts --dir "$WORK"; echo "no-prompt exit=$?"
```

  Expected: `bun test` fully green; the no-log invocation prints an `INVALID:` line and exits 1;
  the no-prompt invocation prints a `CANNOT-RUN:` line and exits 2. Those two exit codes are the
  behavioral-fail and harness-failure legs of the harness contract.

- [ ] **Step 4: Commit** — stage the two script files and this plan; message
  `explaining: review-log check CLI and exit-code contract`, with
  `Tribe-Card: i106-blind-reader-review` and `Tribe-Task: 4/10`.

---

### Task 5: Rule 5 in `SKILL.md`, plus self-check item 4

**Why:** spec §2.1 and §2.2. This is the rule itself. Rules 1 through 4, the Overview and the
Evidence section are frozen by the scope fence: this task appends one section and adds one
self-check line, and touches nothing else in the file.

- Modify: `plugins/explaining/skills/explaining/SKILL.md`

**Steps**

- [ ] **Step 1: Capture the guard.** Record what must not move, so step 3 can prove it did not:

```bash
cd /Users/hip/repo/todd-skills
git show HEAD:plugins/explaining/skills/explaining/SKILL.md \
  | sed -n '/^## Rule 1/,/^## Self-check/p' > /tmp/rules-1-to-4-before.txt
wc -l /tmp/rules-1-to-4-before.txt
```

  Expected: the extract is non-empty and covers Rules 1 through 4.

- [ ] **Step 2: Insert Rule 5 between Rule 4 and the self-check.** Add this section verbatim,
  immediately before the `## Self-check before finishing` heading:

```markdown
## Rule 5 — Blind-reader review before delivery

You cannot see what a reader lacks, because you have the context that makes every jump feel
smooth. The self-check below is you grading your own homework; this rule is the part a reader
does.

**When.** The deliverable is a file on disk (HTML or markdown), or the explanatory prose runs to
600 words or more. Shorter answers keep the self-check alone.

**Draft to disk first.** Write the complete draft to a file — the artifact itself, or
`explanation.md` in the working directory when the deliverable is prose. The review runs on the
file, never on pasted text: the path is the reader's entire input, and that is what keeps the
reader blind.

**Dispatch one blind reader per round.** A fresh subagent — never a fork of this session, never
this session itself — briefed with `references/blind-reader-brief.md` from this skill directory,
its three slots filled in: the file path, the audience in one short phrase, and the language.
Reader model: `sonnet` by default. Nothing else crosses into that brief: not the user's request,
not your sources, not your reasoning, not the draft text inline, not an earlier round's findings.
A reader that has been told what the draft was supposed to say can no longer tell you what it
actually says.

**Fix and loop, three rounds at the most.** Fix every `BLOCK` finding, rewrite the file, and
dispatch a NEW reader — fresh context again. Stop at `READER: PASS`, or after round 3. Never a
fourth round. A `NIT` may be dismissed; record the one-clause reason in the log.

**Log every round.** Append one JSON object per round to a file named after the draft with
`.review.jsonl` appended (a draft at `explanation.md` logs to `explanation.md.review.jsonl`):

```json
{"round": 1, "reader_model": "sonnet", "brief": "the rendered brief, verbatim", "findings": [{"severity": "BLOCK", "location": "the quoted phrase", "issue": "what broke, in the reader's words"}], "block_count": 1, "verdict": "FAIL", "author_action": "what you changed before the next round"}
```

`block_count` is the number of `BLOCK` findings and `verdict` is `PASS` exactly when that count
is zero. Check the log with
`bun scripts/check-review-log.ts --prompt "the request you were given"` from the directory
holding the draft: exit `0` means the review is well-formed, exit `1` names what is wrong, exit
`2` means the checker itself could not run.

**Say how it ended.** The final answer carries exactly one line about the review, never silence:

- `Blind-reader review: PASS after 2 round(s)`
- `Blind-reader review: ended at cap with 1 open BLOCK finding(s)` followed by the list

**Degrade, never block.** If this session has no subagent dispatch tool, skip the review, keep the
self-check, and say so in one line:
`Blind-reader review: skipped (no subagent dispatch available in this session).`
```

  Then extend the self-check list with a fourth item:

```markdown
4. Did the blind-reader review run to a verdict, and did the answer say how it ended? (Rule 5)
```

- [ ] **Step 3: Prove the rule landed and Rules 1 through 4 did not move.**

```bash
cd /Users/hip/repo/todd-skills
grep -c "Rule 5" plugins/explaining/skills/explaining/SKILL.md
sed -n '/^## Rule 1/,/^## Self-check/p' plugins/explaining/skills/explaining/SKILL.md \
  | grep -v "^## Rule 5" > /tmp/rules-1-to-4-after.txt
diff <(grep -v '^$' /tmp/rules-1-to-4-before.txt) \
     <(sed -n '/^## Rule 1/,/^## Rule 5/p' plugins/explaining/skills/explaining/SKILL.md \
       | sed '/^## Rule 5/,$d' | grep -v '^$')
sed -n '/^## Self-check/,/^## Evidence/p' plugins/explaining/skills/explaining/SKILL.md | grep -c '^[0-9]\.'
```

  Expected: the `Rule 5` count is at least 1; the `diff` of the Rules 1 through 4 region is empty
  (nothing but the appended Rule 5 differs); the self-check now lists exactly 4 numbered items.

- [ ] **Step 4: Commit** — stage `plugins/explaining/skills/explaining/SKILL.md` and this plan;
  message `explaining: add Rule 5, blind-reader review before delivery`, with
  `Tribe-Card: i106-blind-reader-review` and `Tribe-Task: 5/10`.

---

### Task 6: Eval case 4 and its consistency test

**Why:** spec §2.3 and `c3-201`'s frozen fact — no rule addition without new eval evidence. This
case is the measurement instrument for G1, G2 and G4.

**The prompt must not mention a review, a reader, a subagent, a diagram or a file.** The behavior
under test is deciding to run the review; a prompt that asks for it measures obedience instead of
the rule. The prompt must also contain no single-quote character, because it is embedded in the
check command as a single-quoted argument that the harness splits with `shlex`.

- Modify: `plugins/explaining/skills/explaining/evals/evals.json`
- Create: `plugins/explaining/skills/explaining/scripts/evals-case4.test.ts`

**Steps**

- [ ] **Step 1: Write the failing test.** Create
  `plugins/explaining/skills/explaining/scripts/evals-case4.test.ts`:

```ts
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const FIXTURE = resolve(SCRIPT_DIR, '..', 'evals', 'evals.json');

describe('evals case 4 — the blind-reader review case', () => {
  const data = JSON.parse(readFileSync(FIXTURE, 'utf8'));
  const case4 = data.evals.find((c: { id: number }) => c.id === 4);

  test('the existing cases are untouched and case 4 is appended', () => {
    expect(data.evals.map((c: { id: number }) => c.id)).toEqual([1, 2, 3]. concat([4]));
    expect(case4).toBeDefined();
  });

  test('the prompt never names the behavior under test', () => {
    const prompt = case4.prompt.toLowerCase();
    for (const word of ['review', 'reader', 'subagent', 'agent', 'blind', 'critique',
                         'diagram', 'mermaid', 'html', 'file', 'disk']) {
      expect(prompt).not.toContain(word);
    }
  });

  test('the prompt carries no single quote, which would break the check command', () => {
    expect(case4.prompt).not.toContain("'");
  });

  test('the check runs the review-log checker from the skill directory', () => {
    expect(case4.checks).toHaveLength(1);
    const command: string = case4.checks[0].command;
    expect(command).toContain('{skill_dir}/scripts/check-review-log.ts');
    expect(command).toContain('--log-glob');
  });

  test('the prompt the check is given is the case prompt, byte for byte', () => {
    const command: string = case4.checks[0].command;
    const match = command.match(/--prompt '([^']*)'$/);
    expect(match).not.toBeNull();
    expect(match![1]).toBe(case4.prompt);
  });

  test('the draft and the log are both preserved as artifacts', () => {
    expect(case4.artifacts).toContain('*.review.jsonl');
    expect(case4.artifacts).toContain('*.md');
  });

  test('the prompt is long enough in scope to cross the 600-word threshold', () => {
    expect(case4.prompt.split(/\s+/).length).toBeGreaterThan(30);
  });
});
```

  Run it and watch it fail:

```bash
cd /Users/hip/repo/todd-skills/plugins/explaining/skills/explaining/scripts
bun test evals-case4.test.ts
```

  Expected: every test fails — there is no case with id 4.

- [ ] **Step 2: Add the case.** Append to the `evals` array in
  `plugins/explaining/skills/explaining/evals/evals.json`, leaving cases 1, 2 and 3 byte-identical:

```json
    {
      "id": 4,
      "name": "write-ahead-log-explained-and-blind-read",
      "prompt": "Explain how a write-ahead log keeps a database durable and crash consistent: what gets written and in what order, how a checkpoint interacts with log truncation, what an fsync actually guarantees, and how recovery replays the log after a crash. Write it for a backend developer who has never implemented one.",
      "expected_output": "A long, self-contained explanation of write-ahead logging that a backend developer with no prior exposure can follow: every term outside a general backend baseline (write-ahead log, checkpoint, log truncation, fsync, redo, log sequence number, durability, crash consistency) is defined or contextualized at first use, and each abstract claim about ordering, durability or recovery is anchored by a concrete worked example, a record-layout or code snippet, or a verifiable fact rather than asserted. The deliverable is left on disk as a file in the working directory rather than existing only in the reply, and the reply ends with exactly one line reporting how its own pre-delivery review ended: a PASS after some number of rounds, an end-at-cap listing the open blocking findings, or a one-line statement that the review could not run in this session. A reply that never writes a file, or that never reports a review outcome, does not satisfy this.",
      "files": [],
      "checks": [
        {
          "name": "blind-reader-review-log",
          "command": "bun {skill_dir}/scripts/check-review-log.ts --log-glob *.review.jsonl --prompt 'Explain how a write-ahead log keeps a database durable and crash consistent: what gets written and in what order, how a checkpoint interacts with log truncation, what an fsync actually guarantees, and how recovery replays the log after a crash. Write it for a backend developer who has never implemented one.'"
        }
      ],
      "artifacts": ["*.md", "*.review.jsonl", "*.html"]
    }
```

- [ ] **Step 3: Prove it green, and prove the harness would really run it.**

```bash
cd /Users/hip/repo/todd-skills/plugins/explaining/skills/explaining/scripts
bun test
cd /Users/hip/repo/todd-skills
python3 -c "import json;json.load(open('plugins/explaining/skills/explaining/evals/evals.json'))" && echo "json ok"
python3 scripts/evals/run_evals.py \
  --evals plugins/explaining/skills/explaining/evals/evals.json \
  --eval-id 4 --mode with_skill --dry-run
python3 -m unittest discover -s scripts/evals/tests -t .
```

  Expected: `bun test` fully green; the fixture parses; the dry run exits 0 and names eval 4 with
  no `claude -p` call made; the harness's own unit tests stay green (they assert every fixture in
  the repo resolves to a real subject and that planned check argv point at files that exist, which
  now includes `check-review-log.ts`).

- [ ] **Step 4: Commit** — stage the fixture, the new test and this plan; message
  `explaining: eval case 4 for the blind-reader review`, with
  `Tribe-Card: i106-blind-reader-review` and `Tribe-Task: 6/10`.

---

### Task 7: Plugin README, and proof the installer needs no change

**Why:** the project rule that docs move in the same PR, and the card's requirement that
`install.sh` stay out of scope. `install.sh` symlinks `skills/<name>/` whole
(`install.sh:96`), so a new file inside the already-linked skill directory installs itself —
this task proves that claim rather than asserting it.

- Modify: `plugins/explaining/README.md`

**Steps**

- [ ] **Step 1: Rewrite the two affected sections.** In `plugins/explaining/README.md`:
  rename the heading `## The four rules (skills/explaining/SKILL.md)` to `## The five rules
  (skills/explaining/SKILL.md)`, append item 5, rename `## The two scripts` to `## The three
  scripts` and add the checker, and add one short paragraph on the brief template. The added
  rule item and script bullet read:

```markdown
5. **Blind-reader review before delivery.** Before a file-on-disk deliverable or an
   explanation of 600 words or more is handed over, the draft goes to disk and one fresh
   subagent reads it with no other context — its brief carries the path, the audience and the
   language and nothing else. It reports what it could not follow as `BLOCK` or `NIT`; the
   author fixes every `BLOCK` and re-dispatches a new reader, at most three rounds, logging
   every round next to the draft, and the answer always says how the review ended. With no
   subagent dispatch available the rule degrades to the self-check and says so.
```

```markdown
- **`check-review-log.ts`** — reads the `*.review.jsonl` log Rule 5 leaves next to a draft and
  decides whether the review really happened: rounds present and consecutive, never more than
  three, terminated by a `PASS` or by the cap, every rendered brief reproducing the shipped
  template, and no run of 12 or more words shared between a brief and the original request (the
  context-isolation seal, made machine-checkable). Exits `0` when the log is sound, `1` when it
  is not, and `2` when the checker itself could not run — the same three-outcome vocabulary the
  eval harness reads. `--require-catch` additionally demands that round 1 found something and
  round 2 found less, which is how the "the reader actually catches things" evidence is tallied
  after a run rather than gated during it.
```

  The brief-template paragraph states that `references/blind-reader-brief.md` ships inside the
  skill directory so the eval harness installs it with the skill (it copies the whole directory
  except `evals/` and `node_modules/`), that its three slots are the only values allowed to reach
  the reader, and that the reader model is a documented knob defaulting to `sonnet`.

- [ ] **Step 2: Prove the installer needs no change.**

```bash
cd /Users/hip/repo/todd-skills
sed -n '90,100p' install.sh
grep -rn "explaining" install.sh || echo "no per-plugin special case for explaining (auto-discovery)"
ls -l ~/.claude/skills/explaining
ls ~/.claude/skills/explaining/references/ ~/.claude/skills/explaining/scripts/check-review-log.ts
```

  Expected: `install.sh` links `skills/<name>/` generically with no per-plugin entry; the
  installed path is a symlink to the repo directory, so both the new `references/` directory and
  the new script are already visible through it with no installer edit. If any of those listings
  fail, STOP and report — an installer change is outside this card's fence and needs the Shaman.

- [ ] **Step 3: Verify the README claims against the files.**

```bash
cd /Users/hip/repo/todd-skills
grep -c "five rules" plugins/explaining/README.md
grep -c "three scripts" plugins/explaining/README.md
grep -c "check-review-log.ts" plugins/explaining/README.md
grep -c "blind-reader-brief.md" plugins/explaining/README.md
```

  Expected: each count is at least 1, and no stale "four rules" or "two scripts" phrase survives.

- [ ] **Step 4: Commit** — stage `plugins/explaining/README.md` and this plan; message
  `explaining: document Rule 5, the brief template and the review-log checker`, with
  `Tribe-Card: i106-blind-reader-review` and `Tribe-Task: 7/10`.

---

### Task 8: Evidence run — case 4 (G1, G2, G3, G4)

**Why:** spec §6 item 2 and §2.3. This is the paid measurement that decides whether Rule 5 ships.
**Run by the Warchief**, not a Hunter: capturing evidence through the repo harness is the
Warchief's own delivery duty, and the eval budget is not a Hunter's to spend.

- Create: `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review.md`
- Create: `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review-benchmark.json`
- Create: preserved artifacts under
  `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review-artifacts/`

**Steps**

- [ ] **Step 1: Run case 4, with the skill, three runs, on the cheap executor model.** Model ids
  verbatim from spec §6 item 2:

```bash
cd /Users/hip/repo/todd-skills
python3 scripts/evals/run_evals.py \
  --evals plugins/explaining/skills/explaining/evals/evals.json \
  --eval-id 4 --mode with_skill --runs 3 --jobs 3 \
  --exec-model claude-haiku-4-5-20251001 --grader-model sonnet \
  --out-dir /tmp/i106-case4 2>&1 | tee /tmp/i106-case4/run.log
```

  Expected: 3 executor runs and up to 3 grader runs complete; `benchmark.json` reports
  `with_skill` pass rate over graded runs; each run directory carries an `artifacts/` folder
  holding a draft and a `*.review.jsonl`. The G1 gate is at least 2 of 3 passing.

- [ ] **Step 2: Re-verify one preserved log by hand, and tally G2, G3 and G4.** The check's own
  stdout is only captured by the harness on a non-pass, so re-run it over the preserved artifacts
  where it is readable:

```bash
cd /tmp/i106-case4
for d in $(find . -type d -name artifacts); do
  echo "== $d"
  bun /Users/hip/repo/todd-skills/plugins/explaining/skills/explaining/scripts/check-review-log.ts \
    --dir "$d" \
    --prompt 'Explain how a write-ahead log keeps a database durable and crash consistent: what gets written and in what order, how a checkpoint interacts with log truncation, what an fsync actually guarantees, and how recovery replays the log after a crash. Write it for a backend developer who has never implemented one.'
  echo "gate exit=$?"
  bun /Users/hip/repo/todd-skills/plugins/explaining/skills/explaining/scripts/check-review-log.ts \
    --dir "$d" --require-catch \
    --prompt 'Explain how a write-ahead log keeps a database durable and crash consistent: what gets written and in what order, how a checkpoint interacts with log truncation, what an fsync actually guarantees, and how recovery replays the log after a crash. Write it for a backend developer who has never implemented one.'
  echo "catch exit=$?"
done
```

  Expected: one `REVIEW-LOG:` summary line per preserved log, giving rounds, per-round block
  counts and the final verdict. The plain invocation exiting 0 is G1 and G2 for that run (the
  template match and the 12-word leak test are inside it). The `--require-catch` invocation
  exiting 0 is G3 for that run; the card's G3 gate is at least 2 of 3. Rounds never exceeding 3
  in any summary line is G4's hard half.

- [ ] **Step 3: Measure the cost delta against the pre-change skill (G4, report only).** Export
  the base-commit skill directory and point the harness at it with `--skill-dir`:

```bash
cd /Users/hip/repo/todd-skills
rm -rf /tmp/i106-preskill && mkdir -p /tmp/i106-preskill
git archive 5e8c095 plugins/explaining/skills/explaining | tar -x -C /tmp/i106-preskill
python3 scripts/evals/run_evals.py \
  --evals plugins/explaining/skills/explaining/evals/evals.json \
  --eval-id 4 --mode with_skill --runs 1 \
  --skill-dir /tmp/i106-preskill/plugins/explaining/skills/explaining \
  --exec-model claude-haiku-4-5-20251001 --grader-model sonnet \
  --out-dir /tmp/i106-case4-pre 2>&1 | tee /tmp/i106-case4-pre/run.log
```

  Expected: the run completes and its `benchmark.json` carries `total_cost_usd`, `duration_ms`
  and token usage for the pre-change skill on the same prompt. Its machine check is expected to
  be **ungraded**, not failed: `{skill_dir}` resolves into the exported pre-change directory where
  `check-review-log.ts` does not exist, and the harness routes a check that cannot run to ungraded
  by design. The evidence document must say so plainly — this cell measures cost, never quality.

- [ ] **Step 4: Write the evidence document.** Create
  `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review.md` in the shape of
  `docs/tribe/planning/explaining-illustration/evidence/EVIDENCE.md`: the exact command lines, the
  model ids verbatim, total cost, ungraded and setup-error counts, a per-cell result table, a
  per-goal section (G1 through G4) each quoting the real numbers and the `REVIEW-LOG:` summary
  lines, and at least one full review log quoted inline with its rendered brief. Copy the run's
  `benchmark.json` to
  `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review-benchmark.json` and copy at
  least one draft plus its log into the artifacts directory.

- [ ] **Step 5: Commit** — stage only the evidence files and this plan; message
  `evidence: blind-reader review, eval case 4 on haiku`, with
  `Tribe-Card: i106-blind-reader-review` and `Tribe-Task: 8/10`.

**If the gates miss:** G1 below 2 of 3, or G3 below 2 of 3, is not something to retry into
submission. Record the numbers, and return `NEEDS_DIRECTION` to the Shaman with them — spec §7
risk 1 is explicit that a theater result does not ship. One rerun is legitimate only when the
failure is a harness failure (ungraded runs, a timeout), never when it is a behavioral one.

---

### Task 9: Regression run — case 3 (G5)

**Why:** spec §6 item 3 and G5. Rule 5 sits in the same prompt as Rule 4, and a longer skill body
can quietly cost the older behavior. This re-measures case 3 against its recorded evidence.
**Run by the Warchief**, same reason as task 8.

- Modify: `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review.md`

**Steps**

- [ ] **Step 1: Re-run case 3, both modes, three runs.**

```bash
cd /Users/hip/repo/todd-skills
python3 scripts/evals/run_evals.py \
  --evals plugins/explaining/skills/explaining/evals/evals.json \
  --eval-id 3 --mode both --runs 3 --jobs 3 \
  --exec-model sonnet --grader-model sonnet \
  --out-dir /tmp/i106-case3 2>&1 | tee /tmp/i106-case3/run.log
```

  Expected: `with_skill` passes at least 2 of 3, and `without_skill` produces a valid HTML
  artifact in 0 of 3 — the rates recorded in
  `docs/tribe/planning/explaining-illustration/evidence/EVIDENCE.md`. The executor model is
  `sonnet` here to match the recorded baseline it is being compared against, not the cheap model
  used for the new case.

- [ ] **Step 2: Append the regression section to the evidence document.** Add a `## G5 — no
  regression on case 3` section quoting: the command, both pass rates, the pre-change rates from
  the prior card's evidence file, ungraded counts, and a one-line verdict. If `with_skill` comes
  in below 2 of 3, record it and STOP — that is a regression, not a rounding error, and it goes to
  the Shaman with the numbers rather than being explained away.

- [ ] **Step 3: Commit** — stage the evidence document and this plan; message
  `evidence: case 3 regression check after Rule 5`, with
  `Tribe-Card: i106-blind-reader-review` and `Tribe-Task: 9/10`.

---

### Task 10: Governance — C3 change-unit, ADR, and the `c3-201` sync

**Why:** G6 and spec §2.4. `c3-201` currently describes a skill with no blind-reader rule, no
`references/` directory and a two-script `scripts/` directory. Left uncorrected, `c3x check` and
every future audit read the component doc as still true. The ADR comes last on purpose: it cites
the evidence document tasks 8 and 9 produced, which is exactly what `c3-201`'s frozen fact — never
a rule addition without new eval evidence — demands.

**The C3 skill is the entry point and the wrapper is how it is invoked.** Read
`/Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/references/change.md` in
full and follow it verbatim; the commands below are that reference applied to this card, not a
substitute for reading it.

- Create: `.c3/adr/adr-20260902-explaining-blind-reader-review.md` (through the wrapper, never by hand)
- Create: `.c3/changes/adr-20260902-explaining-blind-reader-review/` patch files
- Modify (through `change apply` only): `.c3/c3-2-plugins/c3-201-explaining.md`

**Steps**

- [ ] **Step 1: Run the mandatory file-context gate and read the schema.**

```bash
export C3X=/Users/hip/.claude/plugins/marketplaces/c3-skill-marketplace/skills/c3/bin/c3x.sh
cd /Users/hip/repo/todd-skills
C3X_MODE=agent bash "$C3X" check
C3X_MODE=agent bash "$C3X" lookup plugins/explaining/skills/explaining/SKILL.md
C3X_MODE=agent bash "$C3X" schema adr
C3X_MODE=agent bash "$C3X" read c3-201 --full
```

  Expected: `check` reports exactly the 2 pre-existing errors (`c3-213`, `c3-216`) and no others;
  `lookup` names `c3-201` as the owner plus its governing refs and rules; `schema adr` leads with
  its REJECT-IF list, which the ADR body must honor.

- [ ] **Step 2: Author the ADR and create the change-unit.** Write the body to a scratch file
  **outside** `.c3/`, then register it:

```bash
cd /Users/hip/repo/todd-skills
C3X_MODE=agent bash "$C3X" add adr explaining-blind-reader-review --file /tmp/i106-adr-body.md
C3X_MODE=agent bash "$C3X" change new adr-20260902-explaining-blind-reader-review
```

  The ADR body records: the goal (bring `c3-201` back in sync with a five-rule skill that ships a
  brief template and a third script); the context (Rule 5, the review log, the brief template, the
  new eval case 4, grounded in file paths); the decision (the patch list below); the decisions
  `D106-1` through `D106-6` verbatim as the bounds; and the evidence bound — the pass rates and
  cost from `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review.md`, cited by
  path, which is what satisfies "never rule additions without new eval evidence". Record
  `Parent Delta: none` with its evidence: `c3-2` membership is unchanged and no member framing
  moved.

  Expected: the ADR is created with a generated id of the form
  `adr-20260902-explaining-blind-reader-review`, and `change new` creates the matching folder
  under `.c3/changes/`.

- [ ] **Step 3: Cite the blocks, author the patches, preview, accept and apply.**

```bash
cd /Users/hip/repo/todd-skills
C3X_MODE=agent bash "$C3X" read c3-201 --section Contract --cite
C3X_MODE=agent bash "$C3X" read c3-201 --section "Derived Materials" --cite
C3X_MODE=agent bash "$C3X" read c3-201 --section "Parent Fit" --cite
```

  Author these patches into `.c3/changes/adr-20260902-explaining-blind-reader-review/`, each a
  single primitive, each anchored on a cite handle from the commands above, and each supplying
  only the cells of the row it replaces:

  1. `01-contract-skillmd-row.patch.md` — `scope: block` on the Contract row for
     `skills/explaining/SKILL.md`: the body carries five rules including Rule 5 (blind-reader
     review before delivery), and names the review log plus eval case
     `write-ahead-log-explained-and-blind-read` as its evidence.
  2. `02-derived-skillmd-row.patch.md` — `scope: block` on Derived Materials row 1: the Evidence
     cell additionally cites
     `docs/superpowers/evidence/2026-09-02-explaining-blind-reader-review.md`.
  3. `03-derived-scripts-row.patch.md` — `scope: block` on the Derived Materials scripts row:
     add `check-review-log.ts` and its exit-code contract (0 sound, 1 unsound, 2 could not run).
  4. `04-derived-brief-template-row.patch.md` — `scope: insert`, based on the cite handle of the
     row it follows: a new Derived Materials row for
     `plugins/explaining/skills/explaining/references/blind-reader-brief.md`, deriving from the
     Contract row for `SKILL.md` (Rule 5's dispatch paragraph), allowed variance wording only,
     with the three slots and the absence of any other input as the invariant, evidenced by
     `bun test` in the skill's `scripts/` directory.
  5. `05-parent-fit-boundary.patch.md` — `scope: block` on the Parent-Fit Boundary cell: widen it
     to name the review-log checker and the brief template alongside the illustration
     validator/renderer, and keep the standing "no hooks, no agents" boundary — Rule 5 dispatches
     a subagent but adds no agent definition file (`D106-6`).

  Then preview and flip:

```bash
cd /Users/hip/repo/todd-skills
C3X_MODE=agent bash "$C3X" change view adr-20260902-explaining-blind-reader-review
C3X_MODE=agent bash "$C3X" change status adr-20260902-explaining-blind-reader-review
C3X_MODE=agent bash "$C3X" change accept adr-20260902-explaining-blind-reader-review
C3X_MODE=agent bash "$C3X" change apply adr-20260902-explaining-blind-reader-review
C3X_MODE=agent bash "$C3X" check
```

  Expected: `change view` shows 5 pending patches with no drift; `apply` lands all five
  atomically; the closing `check` reports exactly the same 2 pre-existing errors and no new one.
  If `apply` rejects, fix the patch body and re-apply — never hand-edit
  `.c3/c3-2-plugins/c3-201-explaining.md`, which is a frozen fact.

- [ ] **Step 4: Prove the sync landed.**

```bash
cd /Users/hip/repo/todd-skills
C3X_MODE=agent bash "$C3X" read c3-201 --section Contract
C3X_MODE=agent bash "$C3X" read c3-201 --section "Derived Materials"
git status --porcelain .c3 | head -20
```

  Expected: both sections name Rule 5, the review log, `check-review-log.ts` and
  `blind-reader-brief.md`; `git status` lists the ADR, the change folder, the updated `c3-201`
  and `.c3/c3.db`, and nothing outside `.c3/`.

- [ ] **Step 5: Commit** — stage `.c3/` and this plan only; message
  `c3: change-unit and ADR for the explaining blind-reader review`, with
  `Tribe-Card: i106-blind-reader-review` and `Tribe-Task: 10/10`.

---

## What the Warchief does after task 10

1. Run the final whole-branch gates: `bun test` in the skill's `scripts/` directory,
   `python3 -m unittest discover -s scripts/evals/tests -t .`, and
   `C3X_MODE=agent bash "$C3X" check` (still exactly the 2 pre-existing errors).
2. Confirm the diff file list sits inside the scope fence, and that the three pre-existing dirty
   files were never staged: `git diff --stat origin/master...HEAD`.
3. Run the final whole-branch dual-skinner audit plus the tracker, and adjudicate every
   Critical/Important finding on evidence.
4. Open the PR with the evidence document linked and its numbers quoted in the body: the case-4
   pass rate against G1, the leak and template results against G2, the round-1/round-2 block
   counts against G3, the cost delta against G4, and the case-3 rates against G5.
5. Wait for every CI check to CONCLUDE green (`gh pr checks <pr> --watch`, foreground). **Do not
   merge.** This campaign's merge policy is Shaman-only: end with
   `NEEDS_DIRECTION: merge-pr #<pr> — <one-line evidence digest>` (pass rates for G1/G3, the
   G5 rates, both skinner report paths). The Shaman verifies the evidence, merges with a regular
   2-parent merge, deletes the branch, removes the worktree, and fast-forwards master.

## Estimated size

**10 tasks.** 6 Hunter tasks (2, 3, 4, 5, 6, 7), 1 Hunter de-risk task (1), 1 Hunter governance
task (10), 2 Warchief-run evidence tasks (8, 9).

**Wall-clock estimate: 7 to 10 hours**, of which roughly 1 hour is paid harness time.

| Phase | Estimate |
| --- | --- |
| Task 1 de-risk, including the probe run and its audit | 30 to 45 min |
| Tasks 2 through 7 (Hunter build, each with a dual-skinner audit round) | 4 to 6 h |
| Task 8 evidence (3 with-skill runs on haiku plus 1 pre-change cost run, plus writing it up) | 60 to 90 min |
| Task 9 regression (6 executor and 6 grader calls on sonnet) | 30 to 45 min |
| Task 10 governance (change-unit, 5 patches, apply, check) | 45 to 60 min |
| Final whole-branch audit, PR, CI, merge | 45 to 60 min |
