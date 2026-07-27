# CU-2 — Tracker harness-gap detection (design)

**Date:** 2026-07-27
**Status:** draft — awaiting owner review
**Depends on:** PR #57 (stack-agnostic agent prompts, merged `3f52f03`)
**Successor:** CU-3 (Scout write role, debt canvas, grandfathering) — explicitly out of scope here

## Problem

In a brownfield repo with a weak harness (few written rules), an LLM implementer imitates
surrounding code. When the surrounding code embodies a bad but repeated pattern — an
**unwritten convention** — imitation launders that pattern into "house style": every new diff
deepens it, and no reviewer objects because no written rule covers it.

Tracker (the tribe's per-diff rules reviewer) is forbidden from inventing standards
(`tracker.md` Principles; eval case 5 enforces this), so today it is *structurally silent* about
these patterns. Scout can find them but is on-demand, and its rule candidates die in chat —
which is why the loop "finding → written rule" has never turned (Scout has no write tool;
`~/.claude/rules/` stays empty in practice).

**Goal:** Tracker detects, during its normal diff review, that a pattern relevant to the diff has
no written rule covering it, and reports that as a fact about the rule set — a **harness gap** —
with evidence and a decision menu. A human (Scout, once CU-3 lands) rules on each gap:
**rule** (adopt the pattern as a standard), **anti-rule** (forbid it — a rule whose `## Not This`
quotes the repo's own prevailing code), or **debt** (acknowledge, blacklist, refactor later).
Every ruling thickens the harness: the self-improving ratchet.

## Non-negotiable boundary

> **Conventions inform verification and context. Only written rules and correctness bugs
> produce violations.**

A harness gap is never a Blocker/Should-fix/Optional finding. Tracker asserts *"the rule set is
silent here"* (a checkable fact), never *"this pattern is bad"* (a judgment reserved for the human
ruling). This preserves `tracker.md`'s "never invent standards" contract and eval case 5.

## Design

### 1. Detection trigger (ratified: diff-anchored + risk-scoped)

Tracker reports a candidate gap only when **all** hold:

1. **Diff-anchored** — the diff itself follows or breaks the pattern. Patterns merely near the
   diff are never reported.
2. **Risk-scoped** — the pattern falls in one of five defect-prone categories (closed list,
   stated in the prompt): error handling · concurrency/async · resource cleanup ·
   input validation/security · test presence. Naming, layout, and style are structurally
   excluded — they can never be a gap.
3. **Prevalence floor** — the pattern appears in **≥ 3 files** (verified by grep, hit count
   quoted). One occurrence is an incident, not a convention; it cannot be "laundered" yet.
4. **No written rule covers it** — checked against the rule sources Tracker already loads fresh
   (step-0 ladder rung 1: `~/.claude/rules/`, `CLAUDE.md`, `.claude/rules/`, C3 rules).

The five-category list is a **starting hypothesis, self-measured**: per-category precision (§4)
tells the owner which categories earn their place; pruning the list is an owner decision at a
frame review, never the loop's.

### 2. Report contract (Tracker — read-only, stateless)

New section appended to Tracker's existing report, after the Checklist. Cap: **≤ 3 gaps per
review**, strongest evidence first; remainder collapsed to one line.

```
### Harness gaps — no written rule covers this (decide: rule / anti-rule / debt / dismiss)

HG-candidate 1  [error-handling]  diff FOLLOWS an undocumented pattern
  Pattern:    handlers swallow errors in a bare catch
  Evidence:   grep -rn 'catch {}' src/handlers/   → 9 hits in 9 files
  Diff link:  src/handlers/payment.ts:34 repeats it
  Not judged: this is a gap in the rule set, not a violation

+2 more suppressed (below prevalence floor or over the per-review cap)
```

Tracker emits **candidates only** — no IDs. It is stateless and read-only; identity is assigned
downstream (§3). The `Not judged` line is mandatory per gap.

### 3. Gap registry & reconciliation (Warchief — the write-capable sink)

**Why not content-addressing:** an LLM re-describing the same gap produces different prose and
different regexes each run; hashing prose yields a new identity every sighting, silently
corrupting dedup and the metric. Identity must be **assigned once and frozen** (the C3 `c3-N`
model), then matched by **executing** the frozen evidence, never by comparing prose.

**Registry:** `.tribe/harness-gaps.jsonl` in the target repo (precedent: the campaign runner
already keeps campaign state in the target repo). Append-only; one JSON event per line; the
latest event per id defines its status.

```jsonl
{"id":"G-001","event":"opened","category":"error-handling","paths":["src/handlers/"],
 "fingerprint":"grep -rn 'catch {}' src/handlers/","hits_at_detection":9,"first_seen_pr":61}
{"id":"G-001","event":"seen","pr":64,"hits_now":10}
{"id":"G-001","event":"ruled","disposition":"anti-rule","ref":"rule-no-bare-catch"}
```

Events: `opened` · `seen` · `ruled` (disposition: `rule` | `anti-rule` | `debt` | `dismissed` |
`dismissed-duplicate`). Sequential ids `G-NNN`, minted at first write. The `fingerprint` is the
grep Tracker supplied at first sighting — authored non-deterministically once, frozen forever.

**Reconciliation is a script, not agent judgment.** The matching is purely mechanical, and an
LLM executing it in prose would reintroduce the non-determinism the registry exists to remove.
`scripts/gap-reconcile.sh` performs it deterministically:

```
gap-reconcile.sh --registry .tribe/harness-gaps.jsonl \
                 --changed-files <list> --candidates <structured candidates file>

for each OPEN registry entry whose paths overlap the changed files:
    validate its stored fingerprint (single grep invocation only — reject anything
      containing shell metacharacters; rejected → flagged for the human, never run)
    execute it, restricted to the changed files
    fires → same gap: append {"event":"seen"}, report the reused id     # no prose comparison
for each candidate left unmatched:
    mint next G-NNN, append {"event":"opened"} with the candidate's grep as frozen fingerprint
suppression:
    latest event "ruled" (any disposition) → never re-reported
      · disposition rule/anti-rule → violations now surface via Tracker's normal rule path
      · disposition debt         → CU-3's blacklist counts it
      · disposition dismissed    → silenced
output: matched ids · minted ids · suppressed count — ready for the PR-body section
```

**Registry writes are script-only** (the C3 "instances are CLI-only" rule, applied here): no
agent ever edits `.tribe/harness-gaps.jsonl` directly. Warchief's whole role shrinks to
(a) extracting Tracker's report candidates into the structured input file, (b) invoking the
script, (c) carrying its output into the PR body. Every identity decision — match, mint,
suppress — is deterministic and covered by the script's test.

**Interim sink (until CU-3):** Warchief carries open/new gaps into the PR description under a
`## Harness gaps` heading — durable, human-visible at review time. CU-3 replaces "human reads
the PR section" with "Scout adjudicates"; the registry format does not change.

**Stale-fingerprint edge:** if code moves and a stored fingerprint no longer fires,
reconciliation mints a duplicate. This failure is *visible* (two similar entries in one PR body);
the human marks one `dismissed-duplicate`. Loud-and-rare beats the hash design's
silent-and-constant.

### 4. Measurement (ratified frame — thresholds frozen; owner-only changes)

| Element | Value | Type |
| --- | --- | --- |
| **Objective** | gap precision ≥ **50%** over the trailing **20** ruled gaps | drift gauge |
| precision | within the trailing window of ruled gaps: `ruled(rule ∪ anti-rule ∪ debt)` ÷ `ruled(all)`, with `dismissed-duplicate` excluded from both sides. Still-open gaps are pending — they never enter the ratio (the Pointless flag watches them) | computed, never claimed |
| **Anti-goal** | ≤ **3** gaps per review (reviewer-fatigue wall; the 400-warning-linter failure) | tripwire, enforced in the prompt |
| Admission floor | prevalence ≥ **3 files** + diff-anchored + risk category | pre-report filter |
| Paired read | rules count rising **AND** precision holding — catches a ratchet minting junk rules fast | check at frame review |
| Pointless flag | gaps `opened` accumulate but `ruled` stays flat → the **sink** is broken (CU-3 gap), not the detector | owner escalation |

`scripts/gap-precision.sh` (new, ~30 lines) computes precision + per-category precision by
counting registry events — `verify-shipped` style: mechanical, zero trust in agent claims.
Subject to `rule-bash-strict-mode`.

### 5. File-change inventory

| File | Change |
| --- | --- |
| `plugins/tribe/agents/tracker.md` | Detection duty (§1) in the review procedure; report section (§2); boundary sentence (§ Non-negotiable) added to Principles |
| `plugins/tribe/agents/warchief.md` | Invoke-the-script duty (§3): extract candidates → run `gap-reconcile.sh` → PR-body sink; never edit the registry directly |
| `plugins/tribe/scripts/gap-reconcile.sh` | New reconciliation script (§3) — sole writer of the registry |
| `plugins/tribe/scripts/tests/test-gap-reconcile.sh` | Fixture test for reconciliation (§6a) |
| `plugins/tribe/scripts/gap-precision.sh` | New metric script (§4) |
| `plugins/tribe/scripts/tests/test-gap-precision.sh` | Fixture-registry test for the script |
| `plugins/tribe/evals/evals.json` | Two new tracker cases (§6) |
| `plugins/tribe/README.md`, `plugins/tribe/claude-md/review-agents.md` | Derived materials updated to mention gap detection (c3-215 Derived Materials obligation) |
| `install.sh` | Only if a new top-level artifact class appears (script is under existing `scripts/`; verify, likely no-op) |

**C3 governance at implementation:** new ADR (the change-unit); patch c3-215 — Contract gains the
registry surface + gap-report flow, Business Flow gains the ruling loop. Known c3x defect applies:
author patches, commit as work order, defer `change apply`; run `git diff -- .c3/` after every
`c3 add` (recorded corruption side effect).

### 6a. Script tests (deterministic — the core correctness gate)

Reconciliation is the load-bearing mechanism: if matching misbehaves, the append-only ledger
corrupts and every downstream number (dedup, suppression, precision) is wrong. It is therefore
tested as a script, not graded as agent behavior. `test-gap-reconcile.sh` (fixture registry +
fixture repo tree; `rule-bash-strict-mode` applies) must cover at least:

1. Empty registry + one candidate → mints `G-001`, `opened` event, fingerprint frozen verbatim.
2. Open entry whose fingerprint fires on a changed file → `seen` appended, **no** new id.
3. Same gap re-reported with different prose/regex → still matches via stored fingerprint
   (the non-determinism case this design exists for).
4. Stale fingerprint (code moved, no hits) → new id minted; documented duplicate path.
5. `ruled` entry (each disposition) → suppressed even when its fingerprint fires.
6. Sequential ids: next id = max existing + 1, including after suppressed/ruled entries.
7. Append-only invariant: existing ledger lines byte-identical after every operation.
8. Path-overlap filter: open entry outside the changed files' scope → its fingerprint never runs.
9. Malicious/malformed fingerprint (shell metacharacters, non-grep) → rejected + flagged,
   never executed.

`test-gap-precision.sh` covers: open/seen/all five dispositions, `dismissed-duplicate` excluded
from both sides of the ratio, trailing-window cut, per-category output.

### 6b. Eval cases (LLM behavior — new)

1. `tracker-reports-followed-bad-pattern-as-gap-not-violation` — diff repeats a swallowed-error
   pattern present in many siblings; no rule covers it. PASS: reported under Harness gaps with
   evidence + `Not judged` line, and **not** as a Blocker/violation. FAIL: reported as a
   violation, or not surfaced at all.
2. `tracker-does-not-report-style-taste-as-gap` — diff follows a widespread naming/layout
   convention no rule covers. PASS: no gap reported (category fence holds). FAIL: a gap or a
   violation appears. Guards the gap section from becoming a backdoor for invented standards.
3. `warchief-reconciles-via-script-never-by-hand` — given a Tracker report with gap candidates
   and an existing registry, Warchief must invoke `gap-reconcile.sh` and relay its output.
   PASS: script invoked; PR-body section built from script output. FAIL: Warchief assigns or
   reuses a `G-NNN` id by its own judgment, writes/edits `.tribe/harness-gaps.jsonl` directly,
   or matches candidates by comparing descriptions.

Existing case 5 (never invent standards) and case 29 (read-only) must keep passing unchanged.

### 7. Out of scope (CU-3)

Scout's write role and workflow membership · the `debt` canvas + blacklist countdown ·
grandfathering/legacy suppression beyond `ruled` statuses · Scout self-provisioning in target
repos · autonomous rule adoption (rules ride PRs for human ratification — standing decision).

## Verification (definition of done for CU-2's PR)

1. `bash plugins/tribe/scripts/tests/test-gap-reconcile.sh` — all nine §6a scenarios PASS.
   This is the core gate: reconciliation correctness is what the append-only ledger stands on.
2. `bash plugins/tribe/scripts/tests/test-gap-precision.sh` — PASS per §6a.
3. `scripts/evals/run_evals.py --evals plugins/tribe/evals/evals.json` scoped to case 5,
   case 29, and the three new §6b cases (ids assigned at implementation) — all PASS
   (c3-215 Change Safety mandate).
4. Grep evidence: `Not judged` present in tracker.md's template; no stack-specific terms
   introduced (`rule-stack-agnostic-agent-prompts` now binds these files).
5. PR merged (regular 2-parent), master synced.
