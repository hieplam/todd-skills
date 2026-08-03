# Spec — Idea 02: Absolute context asymmetry (the Skinner never sees the code side's reasoning)

**Card:** `idea-02-context-isolation`
**Branch:** `planning/idea-02-context-isolation`
**Status:** spec for a FUTURE implementation campaign (this campaign produces spec + plan only)
**Source:** `docs/tribe/ideas/bun-rust-migrate-ideas.md:39-58` ("Idea 2"), handoff `§2.2`, `§4.1`

---

## 1. Problem

### 1.1 What the tribe promises, and where the promise leaks

The tribe already believes in adversarial review. `skinner.md:19-24` opens with the right instinct —
*"Do not believe anything the codework (or the verifier) claims"* — and `skinner.md:36-37` says
*"Anchor on neither the code nor the verifier's narrative."*

But that is a **disposition, not a seal**. Nothing in the tribe's prompts actually *prevents* the
code-writing side's narrative from being loaded into the Skinner's context window in the first
place. Telling an LLM "don't be persuaded by the argument I am about to show you" is not the same as
not showing it the argument. Four concrete holes, each grounded:

| # | Location | The hole |
|---|----------|----------|
| H1 | `warchief.md:441-454` (step 6) | The audit step names what the dispatch **should** contain — *"pointed at YOUR spec + plan and the repo's rules"* — but **forbids nothing**. It is an inclusion hint, not an allowlist. Adding "and here's what the Hunter reported" violates no rule that exists today. |
| H2 | `hunter.md:113-124` | The Hunter is *required* to write a reasoning-rich report file (RED proof, explanations, **concerns**). `hunter.md:122-123` then says, in one breath: *"the Warchief reads the report file for depth **and** audits your diff with the `skinner`."* The two acts are juxtaposed with nothing separating them — the prompt practically invites forwarding. |
| H3 | `warchief.md:370` | The Warchief hands every Hunter a report-file path and receives its `DONE` / `DONE_WITH_CONCERNS` return message. So at the moment it dispatches the Skinner, the Warchief is **holding** the narrative. Leakage is the path of least resistance: it is *helpful-looking* context, free to paste, and no rule says no. |
| H4 | `skinner.md:79-80` | The Skinner's contract chain, level 1, is **"Caller-given — an explicit spec/plan path or requirement statement the caller passed you."** The Skinner accepts whatever the caller passes and has **no mechanism to refuse** contaminated input. Even a Skinner that *wants* to stay cold has no rule authorizing it to reject the Hunter's report if one arrives. |

**H1+H3 are the outbound hole (nothing stops the sender). H2 is the invitation. H4 is the inbound
hole (nothing stops the receiver).** A rule that patches only one side leaves the channel open.

### 1.2 Why this matters — the rationale, from the source

From `docs/tribe/ideas/bun-rust-migrate-ideas.md:41-46`, quoted verbatim:

> **What Bun did:** the reviewer sees only the diff — **never the implementer's reasoning** — because
> *"the Claude that wrote the code wants the code to get accepted"*: reading the implementer's
> self-justification "persuades" the reviewer into letting bugs through. The three real bugs caught
> (use-after-free in `Box<uv::Pipe>`, `trunc()` on negative mtimes, eager evaluation in `unwrap_or`) all
> compiled cleanly and looked plausible — only a cold context caught them.

And the handoff's framing of *why* the contexts are split (`§2.2`):

> "Claude viết code thì muốn code được merge; Claude review thì muốn tìm ra lỗi" — chống
> self-preferential bias. Giấu reasoning của implementer để reviewer không bị "thuyết phục" bởi lời
> biện minh.
> *("The Claude that writes code wants the code merged; the Claude that reviews wants to find bugs" —
> against self-preferential bias. Hide the implementer's reasoning so the reviewer is not "persuaded"
> by its justification.)*

The decisive detail is that **all three real bugs compiled cleanly and looked plausible.** They were
not caught by scrutiny of a claim; they were caught by a context that had never been told the code was
fine. A Skinner that has read *"RED proof captured, all 61 tests green, no concerns"* is no longer
cold — it is auditing a conclusion it has already been handed. The audit degrades from an independent
re-derivation into a **confirmation pass**, and its PASS stops being evidence of anything.

This is the exact bias channel that is the entire reason adversarial review exists in the tribe. The
tribe pays for a second model, a second context window, and a fix-loop — and today a single pasted
paragraph can silently refund all of it. **Sealing this channel is the precondition for every other
audit-quality idea in the backlog** (which is why the ideas file's build order opens with it:
`docs/tribe/ideas/bun-rust-migrate-ideas.md:277-279`, "**2 → 1 → 5 → 4**").

### 1.3 The failure is silent

There is no symptom. A contaminated audit returns `AUDIT: PASS` in exactly the format an uncontaminated
one does. Nothing in the report, the PR, or CI distinguishes "the Skinner independently re-derived the
truth" from "the Skinner was talked into agreeing." The tribe cannot currently tell the difference
between a real audit and a theatrical one — which is why the fix must be a **mechanically checkable
rule**, not a stronger exhortation to be careful.

---

## 2. Proposed design

One principle, sealed on both sides, and made checkable.

> **The Skinner's dispatch context is an allowlist. Anything the code-writing side said — as opposed to
> anything it *committed* — is inadmissible.**

### 2.1 The Allowlist (the whole of it)

A Skinner dispatch may contain **only** these four things:

1. **The contract** — the spec and/or plan (paths or content), authored *before* the code existed.
2. **The diff** — the change under audit, in full, identified mechanically (a git range, PR number, or
   file paths). Everything the code side committed is in here, including tests.
3. **The repo's rules** — `CLAUDE.md`, `.claude/rules/`, C3 docs, and the like.
4. **Mechanical scope** — *which* change to audit and *where*: the git range / PR number / worktree
   path, the base branch, and the report-file path for the Skinner's **own** output.

**Anything not on this list is banned.** An allowlist, not a blocklist, is load-bearing: narrative is
infinitely re-phrasable ("the Hunter's report", "a summary of the Hunter's report", "context on what
was tried", "FYI it was tricky"), so enumerating forbidden phrasings would fail. The Warchief assembles
the dispatch from the four items above and adds nothing.

### 2.2 The Banned categories (illustrative, since the allowlist governs)

Named explicitly because they are the tempting ones:

- The **Hunter's report file** — its path or any excerpt. (This is the single most likely leak: the
  Warchief holds the path already.)
- The Hunter's **return message** — `DONE` / `DONE_WITH_CONCERNS`, its test summary, its concerns.
- The **Warchief's own narrative** about the build: "the Hunter was careful", "this was a clean run",
  "note the tricky part in X", "the failing test at first was expected", "I already reviewed this."
- **Prior Skinner reports on the same code**, and any fixer's explanation of *why* it fixed something
  (fix rounds 2 and 3 start as cold as round 1 — see §2.5).
- Any **attention-steering** that is judgmental rather than mechanical (§2.4).

### 2.3 The diff is the only channel from the code side to the reviewer

This is the pressure-relief valve that keeps the rule from being a straitjacket, and it must be stated
in the rule itself: **the ban is on out-of-band narrative, never on artifacts in the diff.**

If the code-writing side has something it needs the reviewer to know, it says it **in committed code**:
a test, a fixture, an assertion, a code comment, a doc change. Those travel *inside the diff* — the
Skinner reads them as ordinary parts of the change and, decisively, **runs them itself** rather than
believing a claim about them. Committed artifacts are falsifiable; prose is not. That is the whole
distinction the rule encodes:

> **Prose persuades; artifacts get run.** The reviewer can only be misled by the first.

(This is also precisely the seal sibling card **idea-05** depends on: a fixer that wants to argue "your
finding does not reproduce" must commit a **falsification test**, not send a memo. See §7.)

### 2.4 Mechanical scope vs. judgmental steering — the one fine line

The Warchief *must* tell the Skinner **which** diff to audit; a per-task audit is scoped to that task's
commit range. That is legitimate and stays in the allowlist (item 4). The line:

| Allowed (mechanical) | Banned (judgmental) |
|---|---|
| "Audit commit range `abc123..def456`." | "Focus on the caching logic — that's where it got hairy." |
| "Audit the diff on branch X vs `origin/master`." | "The Hunter says the edge case is handled; verify that." |
| "Task 3 of the plan is the contract for this diff." | "Tasks 1–2 already passed audit, so just check 3." |

A pointer to *where the bytes are* is address information. A pointer to *what to think about them* is
anchoring — it imports the code side's model of its own work, which is exactly what handing over the
reasoning does, only shorter.

### 2.5 Every audit starts cold — including re-audits and the final one

Both dispatch directions in `warchief.md:441-443` are covered, plus the fix-loop:

- **Per-task audit** — allowlist, scoped to that task's commit range.
- **Fix-round re-audits (rounds 2, 3)** — dispatched to a **fresh** Skinner, with the allowlist, and
  **without** the previous audit's findings, without the fixer's explanation, and without "here's what
  we changed in response." A re-audit that carries the previous round's narrative is a re-audit in name
  only. The fixer's answer to a finding must already be in the diff (§2.3).
- **Final whole-branch audit** — allowlist, scoped to the full branch range vs. the base. It carries
  **no** accumulated per-task audit history and **no** "all tasks already passed" preamble. It is the
  coldest read of the whole change and must stay that way.

### 2.6 Two-sided enforcement (the outbound seal + the inbound quarantine)

**Outbound — `warchief.md` step 6** gets the allowlist as a **dispatch-content checklist** the Warchief
must satisfy before every Skinner dispatch (the four allowed items, the ban, the mechanical-vs-judgmental
line, and the fresh-Skinner-per-round rule).

**Inbound — `skinner.md` Operating rules** gets the mirror: the Skinner **refuses a contaminated
dispatch**. If its dispatch contains any code-side narrative, it stops and returns
`AUDIT: FAIL — CONTAMINATED: <what leaked>` without auditing.

Why refusal rather than "ignore it and carry on": once the narrative is in the context window, "ignore
it" is unenforceable and unverifiable — the tokens are already there and the bias is already applied.
The **only** remedy that restores a cold context is a **fresh Skinner with a clean dispatch** (a new
agent = a new context window). This mirrors the file's existing `UN-AUDITABLE:` stop pattern
(`skinner.md:96-98`), so it is idiomatic to the prompt rather than a bolt-on.

Two properties this refusal must have, or it does more harm than good:

1. **It is a verdict on the *dispatch*, not on the code.** The `CONTAMINATED:` prefix exists so the
   Warchief routes it correctly: **re-dispatch a fresh Skinner with a clean brief** — never send the
   code to a fixer Hunter over it. Nothing about the code has been judged.
2. **It does not consume a fix-round** from step 6's 3-round cap. A Warchief briefing bug must not burn
   the code's fix budget (and, worse, push a healthy card toward a bogus `NEEDS_DIRECTION`).

Belt-and-suspenders on purpose: the outbound rule is what normally holds, but the Skinner is also
dispatched by callers *other* than the Warchief (its own description invites owner self-audits and
"review this PR"). A one-sided rule would protect only the Warchief path; the inbound quarantine
protects every path.

### 2.7 Close the invitation in `hunter.md`

`hunter.md:122-123` currently reads *"the Warchief reads the report file for depth and audits your diff
with the `skinner`"* — one sentence that puts the report file and the Skinner side by side. It gets one
clarifying clause: the report is for the **Warchief's** eyes; **the Skinner never sees it**, and
anything the Hunter needs the auditor to know belongs in the **diff** (a test, an assertion, a comment).
This turns the Hunter's own prompt from an accidental invitation into a restatement of the seal — and it
tells the Hunter where to put the thing it was tempted to write a paragraph about.

---

## 3. Scope fence

**In scope** (the future implementation campaign edits exactly these):

- `plugins/tribe/agents/warchief.md` — step 6: the dispatch-content checklist (allowlist, ban,
  mechanical-vs-judgmental, fresh Skinner per round, `CONTAMINATED:` routing + it costs no fix-round).
- `plugins/tribe/agents/skinner.md` — Operating rules: the inbound quarantine + the `CONTAMINATED:`
  refusal; and the contract-chain level-1 caveat (`skinner.md:79-80`) that caller-given material is
  admissible **only** as contract/diff/rules/scope.
- `plugins/tribe/agents/hunter.md` — the `hunter.md:122-123` clarifying clause (§2.7).
- `plugins/tribe/scripts/tests/test-context-isolation.sh` — **new**: the mechanical governance test (§4).

**Explicitly out of scope** (each is another card's territory; naming them keeps this card small):

- Adding a **second** Skinner, or any change to how many reviewers run → **idea 01**.
- Giving reviewers **different inputs** (contract-lens vs cold-lens) → **idea 03**. This card holds the
  input set *constant and clean*; idea 03 is what later varies it deliberately.
- Reviewer **disagreement routing** → idea 04. **Fixer authority to drop claims** → idea 05.
- Any change to the **fix-loop's 3-round cap** itself, the Hunter's TDD loop, wave orchestration, the
  report-file/heartbeat mechanics, or `validate-plan.sh` / `resume-check.sh`.
- Any **runtime/programmatic enforcement** (e.g. a hook that scans dispatch payloads). The tribe's
  agents are prompts; the enforcement surface for this card is prompt text + a static governance test.
  A dispatch-payload interceptor is a plausible future card — it is not this one.
- Rewriting the Hunter's report file format, or removing it. The report **stays** (the Warchief needs
  it); only its *audience* is fixed.

**Tripwire for this planning campaign:** zero changes under `plugins/` on this branch. This branch
carries `docs/tribe/planning/idea-02-context-isolation/**` and `docs/tribe/state/**` only. The plan's
tasks describe the `plugins/` edits verbatim; a **future** campaign applies them.

---

## 4. Testing / verification strategy

A prompt-text rule still gets a real, runnable, red-first proof. The repo already has the right
convention: TAP-style bash tests under `plugins/tribe/scripts/tests/` (`test-validate-plan.sh`,
`test-resume-check.sh`), run directly, no network.

**New:** `plugins/tribe/scripts/tests/test-context-isolation.sh` — a **governance test** asserting the
seal exists in the prompts. It is genuinely red before the edits and green after (this is the TDD cycle
for a prompt change: the artifact under test is the prompt, and the assertion is that the required rule
is present and reachable).

Assertions (each a `ok`/`not ok` line, in the existing style):

| # | Assertion |
|---|-----------|
| T1 | `warchief.md` step 6 contains a dispatch-content allowlist naming all four permitted items. |
| T2 | `warchief.md` step 6 explicitly bans the Hunter's report file / return message / Warchief narrative from the Skinner dispatch. |
| T3 | `warchief.md` step 6 states the diff-carries-artifacts exception (artifacts in the diff are always allowed). |
| T4 | `warchief.md` step 6 requires a **fresh** Skinner per fix-round, with no prior findings carried in. |
| T5 | `warchief.md` step 6 states a `CONTAMINATED:` FAIL is a dispatch fault: re-dispatch clean, do **not** send to a fixer, and it does **not** consume a fix-round. |
| T6 | `skinner.md` Operating rules contain the inbound quarantine rule + the exact `CONTAMINATED:` refusal token. |
| T7 | `skinner.md` contract-chain level 1 carries the caveat that caller-given material is limited to contract/diff/rules/scope. |
| T8 | `hunter.md` states the report file is for the Warchief only and never reaches the Skinner. |
| T9 | **Anti-regression:** the seal does not ban artifacts in the diff — `skinner.md`/`warchief.md` must still direct the Skinner to read the full diff (protects idea-05's falsification-test channel; see §7). |

**Human verification (the part a grep cannot do):** the rule text must be unambiguous to a *reader*.
The future campaign's Skinner audit (of its own diff, cold) is the real check that the wording is
enforceable rather than merely present.

**Gates:** `bash plugins/tribe/scripts/tests/test-context-isolation.sh` → all `ok`, exit 0; plus the
existing `test-validate-plan.sh` and `test-resume-check.sh` still green (no regression). The repo has
no CI workflows today, so these run locally and their output is the evidence.

---

## 5. Evidence plan

Non-visual, prompt-only change → **screenshot-class evidence** (per the Warchief's evidence rule: a
screenshot for a trivial/visual change), captured as terminal output blocks in the PR body:

1. **BEFORE (red):** `test-context-isolation.sh` on the base commit → failing assertions (the seal is
   absent). This is the honest RED proof that the hole is real.
2. **AFTER (green):** the same script on the branch → all `ok`, exit 0.
3. **The rule text itself:** the `warchief.md` / `skinner.md` / `hunter.md` diff hunks in the PR — for a
   governance change, the diff *is* the deliverable and belongs in the body.
4. **No-regression:** `test-validate-plan.sh` + `test-resume-check.sh` green on the branch.
5. **Dogfood (the real proof):** the future campaign's own final Skinner audit is dispatched under the
   new rule (allowlist-only) and returns `AUDIT: PASS` — the card's rule proving itself on the diff that
   introduces it. Its report is the closing evidence.

---

## 6. Risks & rollback

| Risk | Likelihood | Mitigation |
|---|---|---|
| **The rule over-reaches and starves the Skinner of legitimate context** (e.g. a Warchief stops passing the plan, or stops saying which range to audit). | Low | The allowlist is *positive*: contract, diff, rules, and mechanical scope are all explicitly **required**. §2.4's table gives the exact line. T9 guards the diff channel. |
| **The `CONTAMINATED:` FAIL gets mistaken for a code failure**, and a Warchief sends healthy code to a fixer Hunter (or burns fix-rounds toward a bogus `NEEDS_DIRECTION`). | Medium — this is the sharpest risk | Handled head-on in §2.6: the prefix exists to route it, step 6 states it is a dispatch fault, re-dispatch clean, **never** to a fixer, and it **does not consume a fix-round**. T5 asserts exactly this. |
| **False-positive contamination** — a Skinner refuses over a harmless mechanical scope line. | Low–Medium | The Skinner refuses on *code-side narrative*, and §2.4's mechanical/judgmental table is mirrored into `skinner.md` so both sides read the same line. Cost of a false positive is one cheap re-dispatch; cost of a false negative is a theatrical audit. Bias toward refusal is the right trade — and it matches `skinner.md:56-57`'s existing "bias toward FAIL" stance. |
| **A prompt rule is not a hard boundary** — a Warchief can still paste narrative, and nothing at runtime stops it. | Certain (accepted) | True and acknowledged in §3: this card buys the *rule* and a *static check that the rule exists*. The inbound quarantine is what gives it teeth at runtime (the Skinner is the second line). A dispatch-payload interceptor is a future card, deliberately not this one. |
| **Context bloat** — step 6 grows long enough that the rule is skimmed. | Low | The checklist is a compact table + four bullets, replacing prose that already had to be read. |

**Rollback:** revert the single squash-merge commit. There is no data, no migration, and no state — the
agents are prompt files; reverting restores the previous behavior exactly. The new test script is
additive and disappears with the revert. Blast radius is one commit.

---

## 7. Interactions with other ideas

This card is the **foundation of the adversarial-review cluster** — the ideas file's own build order
opens with it (`docs/tribe/ideas/bun-rust-migrate-ideas.md:277-279`: "**2 → 1 → 5 → 4**"), because the other cluster
cards *assume* a clean reviewer context and would silently inherit the leak if it shipped without them.

| Idea | Interaction | Conflict? |
|---|---|---|
| **01 — 4-role cell: 2 Skinners in parallel** | **Strong dependency: 01 needs this card to be worth anything.** Two Skinners buy recall via `p²` — but that math holds *only if their errors are decorrelated* (handoff `§4.1`). Feed both the same Hunter narrative and you get one shared blind spot and "two reviewers" that are really one reviewer written twice ("hai gọng hàn dính vào nhau thì thành cái que"). This card's allowlist is what keeps the two contexts independent, and §2.5 already generalizes: *every* audit dispatch is cold, however many there are. | **No conflict** — 01 applies the allowlist N times. My rule needs no change when 01 lands; the checklist is per-dispatch, not per-campaign. |
| **02 — this card** | — | — |
| **03 — decorrelate via INPUT asymmetry (contract-lens vs cold-lens)** | **The one card that deliberately *narrows* the allowlist, and must not be misread as widening it.** Idea 03's "cold lens" reviewer is given the diff **without** the contract. That is a *subtraction* from my allowlist (drop item 1 for reviewer B) — perfectly compatible. The rule to preserve when 03 lands: the allowlist is a **ceiling, not a floor**; a variant may show a reviewer *less*, never *more*, and never anything from the banned list. **This card should be worded so that constraint reads naturally** — hence "may contain **only**", framing it as a maximum. **But: semantic agreement is not textual safety.** 03 edits the *same two regions this card edits* — the brief-contents clause of `warchief.md` step 6, and `skinner.md`'s Operating rules — because 03's cold brief states its forbidden-contents list exactly where my ban lives. Their spec reaches the identical conclusion and says so in bold (`idea-03.../spec.md:394`: *"both rewrite the brief-contents clause of step 6, and both edit `skinner.md`'s Operating rules. **Do not run 02 and 03 concurrently.**"*). | **No semantic conflict, but a hard scheduling constraint: 02 and 03 must NOT share an implementation wave.** Their `owns_files` overlap on `warchief.md` + `skinner.md`, so a concurrent wave would collide at the wave merge. **Sequence them** (either order works: if 02 lands first, 03 extends the list 02 wrote; if 03 lands first, 02 tightens lens A's brief only). Plus the wording constraint: keep the allowlist framed as a **ceiling**. |
| **04 — disagreement routing table** | Sits *downstream* of the audit: it routes what reviewers report. It never adds to a reviewer's inbound context, so it does not touch the seal. One shared invariant: a reviewer's finding must never be shown to *another* reviewer (that is anchoring). My §2.2 already bans prior Skinner reports from a Skinner dispatch, which covers 04's needs for free. | **No conflict; mildly enabling.** |
| **05 — fixer may drop claims (reproduce-first)** | **The sibling that depends on this card's exact boundary, and I verified it against their spec.** Idea 05's fixer sometimes needs to tell the reviewer "your finding is wrong" — and the naive way (pass the fixer's explanation to the next Skinner) would punch straight through this seal. Their spec (`idea-05.../spec.md:135-145, 337-345`) refuses that and routes the counter-evidence as a **committed falsification test in the diff**. My §2.3 is the mirror of that contract: **out-of-band narrative is banned; artifacts in the diff are always admissible** — and **T9 exists specifically to prevent a future edit from over-tightening my rule into banning the diff channel.** The two cards are designed to interlock. | **No conflict — mutually reinforcing.** Ship order-independent. |
| **06 — frozen CODEX.md per campaign** | A campaign-wide artifact of locked decisions. **Sharp question my rule must answer:** may a CODEX go into a Skinner dispatch? **Yes — if and only if it is a *contract* artifact** (decisions frozen *before/independently of* the code, like the spec) rather than a *narrative* one (a running log of what the Hunter did and why). It enters as allowlist item 1. If 06 ships a CODEX that accumulates implementer commentary, that portion is inadmissible. | **No conflict, but a boundary 06 must respect.** Recommend 06's spec state which sections are contract-class. My rule stays as-is either way. |
| **07 — mechanical work queue** | Generates *tasks* deterministically instead of by planner prose. Upstream of implementation; touches no reviewer input. Weakly synergistic (a machine-generated task list is contract-class, narrative-free by construction). | **No conflict.** |
| **08 — `integrate-wave.sh`** | Pushes wave orchestration into code. It automates *around* the audit. Small, useful adjacency: **if 08 ever scripts the Skinner dispatch, the allowlist becomes mechanically enforceable** — the script constructs the dispatch and physically cannot paste a report file. That would upgrade this card from "rule + static check" to "structurally impossible", which is the ideal end state. | **No conflict; 08 is the natural upgrade path** for this card's weakest property (§6, "a prompt rule is not a hard boundary"). |
| **09 — ephemeral Warchief per wave** | Refreshes the Warchief's context on a cycle. **Quietly *helps* this card:** the Warchief is the vessel that *holds* the Hunter narrative (H3), so a Warchief whose context is periodically discarded is a Warchief with less leakable material. Conversely this card helps 09: with the seal in place, a fresh Warchief that has *lost* the Hunter's narrative has lost nothing the auditor was ever allowed to see. | **No conflict; synergistic.** |
| **10 — meta-loop: repeated pattern → new Tracker rule** | The governance-evolution loop. This card is *itself* an instance of what 10 institutionalizes ("fix the process, not the code"), and my new governance test is exactly the kind of mechanical tripwire 10 wants. If 10 ships, a violation of this seal spotted in the wild becomes a Tracker rule automatically. | **No conflict; this card is a worked example of 10.** |

**Net:** zero **semantic** conflicts across all nine — but one **scheduling** constraint that the
Shaman must honor when it sequences waves. In full:

1. **Hard dependency inbound (01):** two Skinners are worth nothing without this seal — feed both the
   same Hunter narrative and you have one reviewer written twice, not two.
2. **Scheduling constraint (03) — the one that can actually break a build:** 02 and 03 **must not share
   an implementation wave.** They agree completely on *meaning* and collide completely on *text* — both
   rewrite step 6's brief-contents clause and `skinner.md`'s Operating rules, so their `owns_files`
   overlap and a concurrent wave would conflict at the merge. Sequence them, either order. (Idea 03's
   own spec independently reaches this conclusion: `idea-03.../spec.md:394`.)
3. **Interlock verified against the sibling's committed spec (05):** out-of-band narrative is banned;
   artifacts in the diff are always admissible — which is exactly the channel 05's falsification test
   travels down. **T9 exists to keep a future edit from over-tightening my rule and severing it.**
4. **Wording constraint (03, again):** the allowlist must read as a **ceiling**, so a later card may
   show a reviewer *less* but never *more*.
5. **Boundary question for the Shaman (06):** a CODEX is admissible **only** if it is contract-class
   (decisions frozen before/independently of the code), never narrative-class (a running log of what
   the Hunter did and why). Recommend 06's spec label which sections are which.
