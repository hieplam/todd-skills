# Spec — Idea 06: the campaign codex (`docs/tribe/CODEX.md`)

**Card:** idea-06-campaign-codex. **Status:** spec for a future implementation campaign.
**Base:** `6a46391` (origin/master). **Branch:** `planning/idea-06-campaign-codex`.

---

## 1. Problem

Read this first, because the rest of the spec only makes sense against it.

The tribe already freezes *per-card* intelligence. It does not freeze *cross-card* intelligence.

**What is frozen today.** The Shaman hands the Warchief one idea card verbatim plus a **Standing
Constraints** block (`plugins/tribe/agents/shaman.md:79-86`) — the constraint envelope elicited
once from the owner (`shaman.md:207`: *"This becomes the Standing Constraints block"*). The
Warchief then authors a spec and a plan for **that one card**. Every Hunter dispatched for that
card gets a brief built from those artifacts (`warchief.md:367-372`).

**What is not frozen.** The decisions that repeat *across* cards — naming conventions, the test
pattern the repo actually uses, error-handling style, commit-trailer discipline, the rulings the
Shaman keeps making in the Decision Log (`shaman.md:95-98`) — live nowhere durable. Concretely:

- Each Hunter is a **fresh context window** (`hunter.md:46-55`: it receives exactly one task brief
  and nothing else). Ten Hunters across a five-card campaign will each independently *re-derive*
  the same conventions from the same repo, and will not derive the same answer. That is the
  1,448-independent-opinions problem the Bun migration solved with `PORTING.md`
  (handoff §2.1, Why #1: *"không có spec chung thì 1,448 'ý kiến' khác nhau về cùng một pattern"*
  — without a shared spec, 1,448 different opinions about the same pattern).
- A convention that is **global** cannot be derived from **local** context at all. A Hunter
  editing one file cannot see that four other cards in the campaign chose the opposite convention
  (handoff §2.1, Why #2: the lifetime question needs whole-codebase control-flow tracing, so it
  must be *computed once, globally*, and serialized "for other claudes to look at").
- The reviewers have **no reference document** for convention conformance. The Tracker's rule
  sources are enumerated explicitly (`tracker.md:33-35`: global `~/.claude/rules`, `CLAUDE.md`,
  `.claude/rules/`, `.editorconfig`, C3) and it is forbidden from inventing standards
  (`tracker.md:21`, `:89`). So a cross-card convention that exists only in the Shaman's head is,
  to the Tracker, **not a rule at all** — it cannot enforce it, and correctly refuses to.
  Style compliance stays best-effort, exactly the complaint the Bun blog records
  (handoff §2.1, Why #3).
- A Decision Log ruling made on **card 2** never reaches the Hunters of **card 4**. The Shaman
  appends the ruling and re-dispatches *that* Warchief (`shaman.md:95-98`); nothing carries it
  forward. The ruling is durable as prose, but not as an *input to anyone's brief*.

**And the structural boundary makes this unfixable by messaging.** The Shaman **never speaks to a
Hunter** (`shaman.md:53`) and never reads the Warchief's spec/plan/diff (`shaman.md:104`). So
there is no channel through which cross-card knowledge can reach the agents that need it. The
only thing that legitimately crosses every boundary in this tribe is a **file**.

**The infrastructure cost.** Because every brief is bespoke prose, every stateless agent spawns
with a **different prefix** — no shared prompt-cache prefix. Bun's run shows the size of what is
being left on the table: 72B cached reads vs 5.9B uncached, ≈12:1 (handoff §2.1, and idea file
`bun-rust-migrate-ideas.md:140-141`), attributable to every agent sharing one identical
`PORTING.md` + `LIFETIMES.tsv` prefix.

**Problem, in one line:** the tribe has no per-campaign artifact that turns a repeated **judgment
call** into a **lookup** — so consistency, reviewability, and prompt-cache all pay for it.

---

## 2. Proposed design

One new file, one new script, five prompt edits.

### 2.1 The artifact: `docs/tribe/CODEX.md`

A **single canonical path** (as the card names it), not a per-campaign filename. Rationale: the
agent prompts are static files and must reference the codex by a fixed path; history and
per-campaign identity live in git plus the header block, not in the filename. Grep target stays
stable forever.

Two parts: a **frozen header block**, then **one greppable lookup table**.

```markdown
# Tribe Campaign Codex

campaign: bun-rust-migrate
codex-version: 3
frozen-at: 2026-07-12T09:00:00Z
base-sha: 6a46391
status: frozen
review: PASS (skinner, round 1)

| ID | Scope | Category | Decision | Source | Check | Severity | State |
|----|-------|----------|----------|--------|-------|----------|-------|
| CDX-001 | `plugins/tribe/scripts/*.sh` | testing | Every script ships a fixture test at `scripts/tests/test-NAME.sh` printing TAP `ok -` / `not ok -` and exiting non-zero on failure. | `plugins/tribe/scripts/tests/test-validate-plan.sh:1-13` | `test -f plugins/tribe/scripts/tests/test-$(basename $F .sh).sh` | Blocker | active |
| CDX-002 | `plugins/tribe/scripts/*.sh` | error-handling | Exit 2 means setup error; 0 means ran-successfully regardless of verdict; the verdict goes in JSON on stdout, logs to stderr. | `plugins/tribe/scripts/validate-plan.sh:37-38` | `grep -q 'Exit codes: 0 = ran successfully' $F` | Blocker | active |
| CDX-003 | `**/*` | commit | Every commit carries a `Tribe-Card:` trailer in the final paragraph; no co-authored trailers. | `DL-004` | `git log -1 --format=%(trailers:key=Tribe-Card)` | Blocker | active |
| CDX-004 | `plugins/tribe/agents/*.md` | structure | A behavioral rule states its own enforcement mechanism inline (which script or agent checks it); a rule nobody can check is not written. | `plugins/tribe/agents/tracker.md:21` | `manual` | Should-fix | active |
```

**Column contract** (this *is* the schema):

| Column | Contract |
|---|---|
| `ID` | `CDX-NNN`, unique, **stable forever**. This is the citation handle: reviewers cite findings by it (`tracker.md:59`, `:92` require citing a rule "exactly as named in the rule source" — the ID *is* that name). |
| `Scope` | A glob. The row applies to a changed file only if the glob matches it. Mirrors the `paths:` frontmatter mechanism the Tracker already honours (`tracker.md:33`). |
| `Category` | One of: `naming`, `testing`, `error-handling`, `structure`, `security`, `commit`, `tripwire`. Greppable facet. |
| `Decision` | **Exactly one imperative line.** The lookup answer. Not a paragraph, not a discussion. This is the LIFETIMES.tsv discipline: an agent looks up one row, it does not *read* the document (handoff §2.1: greppable table format → cheap in tokens, low ambiguity). |
| `Source` | **Mandatory provenance:** either `file:line` (a fact grounded in the repo) or `DL-NNN` (a Decision Log ruling). A row with no resolvable source is deleted, never softened. This column is what makes the codex *mechanically auditable* — see §2.3. |
| `Check` | A shell command that verifies the row, or the literal `manual`. Gives the Tracker its "one concrete, checkable item per rule" (`tracker.md:37`) for free. **Pipes inside the command must be escaped (`\|`)** — the cell holds a shell command and shell commands pipe, so an unescaped `|` would be read as a column separator. `validate-codex.sh` splits on unescaped pipes only and unescapes the cell afterwards, so the stored command is the real one. |
| `Severity` | `Blocker` or `Should-fix`. **This column is the Tracker/Skinner boundary** — see §2.5. |
| `State` | `active` or `superseded`. Append-only amendments (§2.4) need this. |

### 2.2 Who writes it, and when

The **Shaman**, in Mode 2, as a new step **before dispatching the first card** — inserted between
the existing resume step 0 and pick step 1 (`shaman.md:299-343`).

**Gate: multi-card campaigns only** (batch ≥ 2 cards). A single-card batch has no cross-card
consistency problem to solve, and forging a codex for it is pure overhead. This is a How-level
sizing call, made here.

Why the Shaman and not the Warchief: the codex is **What-level** content (conventions and
rulings — the same class of thing as the Standing Constraints block, which the Shaman already
owns, `shaman.md:207`). It is distilled from the repo and the **Decision Log**, which only the
Shaman writes (`shaman.md:95-98`, `:148-149`). The Warchief must not author it, because the
Warchief sees exactly one card and the codex's whole purpose is to be *cross*-card.

Source material for the distillation: the repo's own governance (`CLAUDE.md`, `.claude/rules/`,
C3, existing scripts), the roadmap's **Decision Log**, and the Standing Constraints block.

### 2.3 Who reviews it — and the boundary this deliberately crosses

**One Skinner round, on the codex itself**, before it freezes. (Bun reviewed both `PORTING.md`
and `LIFETIMES.tsv` adversarially before using them — handoff §2.1 How #2, #3.)

This is **the one place a Skinner audits a What-level artifact**, and the boundary needs stating
precisely, because a careless reading makes it look like the Skinner is being handed product
authority it must never have.

**It is not.** The Skinner's charter is one question — *"is the work that claims to be done
actually done?"* — answered against a **requirement contract** (`skinner.md:20-22`), by
**running the proof, never by reading claims** (`skinner.md:9`; the "Run the proof" step at
`skinner.md:141-150`). Nothing in that charter is about *code*. What changes here is only the
**artifact class** under audit (a document, not a diff). The **question** is unchanged.

The contract it audits against is **caller-given** — level 1 of its own contract chain
(`skinner.md:79-80`: *"an explicit spec/plan path or requirement statement the caller passed
you"*). The Shaman passes the **codex charter**: the column contract of §2.1 plus these five
acceptance criteria. The Skinner verifies, by executing:

1. **Every `Source` resolves and supports its `Decision`.** Open the `file:line`; read it; does it
   actually say what the row claims? (A fabricated or drifted citation is the single most
   dangerous failure a lookup table can have — every downstream agent will trust it blindly.)
2. **Every `Check` command executes** and is deterministic (or is honestly marked `manual`).
3. **No two `active` rows contradict** — same `Scope` × `Category`, incompatible `Decision`s.
4. **Every `Decision` is one unambiguous imperative line** — no prose, no hedging, no "prefer X
   generally".
5. **Schema integrity** — IDs unique and well-formed, all columns present, enum values legal.
   (Mechanically pre-checked by `validate-codex.sh`, §2.6, so the Skinner spends its judgment on
   1–4, not on parsing.)

**The hard boundary, stated as a rule for the prompt:** the Skinner rules on whether a row is
**grounded, unambiguous, non-contradictory, and checkable**. It does **not** rule on whether a
convention is the *right* convention — that is What, and What is the Shaman's alone. If the
Skinner believes a convention is wrong-headed, it says so as an **observation**, never as a FAIL.
A FAIL may only be raised on criteria 1–5.

**Remediation is decisive, and asymmetric on purpose:** the Shaman is the writer, so the Shaman
fixes its own document — at most **2 fix rounds**. If a row still cannot be evidenced after that,
**the row is deleted, not softened**. A short codex of rows that are all true beats a long codex
containing one row that lies: every stateless agent trusts every row equally, so one bad row
poisons every card in the campaign. This mirrors the Skinner's own standing bias
(`skinner.md:56-57`: uncertainty is never PASS).

### 2.4 Freeze, and the one legal way to amend

**Freeze** = the commit that sets `status: frozen` with `codex-version: N`. From that moment the
file is **byte-stable for the campaign**. Byte-stability is not fussiness — it is the entire
prompt-cache mechanism (§2.7) and the entire consistency guarantee.

**Amendment** — the card asks specifically whether Decision Log rulings may amend it mid-campaign.
**Yes, and that is the *only* legal path.** A ruling is exactly the event that produces new
cross-card knowledge, and the failure mode this whole idea exists to kill is *"a ruling made on
card 2 never reaches card 4"*. Refusing mid-campaign amendment would preserve that bug.

The amendment protocol, which keeps byte-stability and consistency intact anyway:

- **Append-only.** New knowledge = a **new row with a new ID**. A superseded row is **never edited
  in place**: it is flipped to `State: superseded` and the new row references it. Stable IDs mean
  a finding cited as `CDX-007` in a merged PR still means the same thing a year later.
- **Trigger: a Decision Log ruling, and nothing else.** No agent may propose a codex edit
  directly; it flows as `NEEDS_DIRECTION` → Shaman ruling → Decision Log → codex amendment. The
  `Source` column of the new row is the `DL-NNN` id. Provenance is therefore total: every row is
  traceable either to the repo or to a recorded ruling.
- **Bump + re-review the delta.** `codex-version: N+1`, new `frozen-at`. The Skinner round re-runs
  **on the new/changed rows only** — not the whole table.
- **Version pinning — the rule that makes this safe.** A card **in flight keeps the codex version
  it was dispatched with**; the amendment applies to cards dispatched *after* it. The Warchief
  records `codex-version: N` in its state file (`docs/tribe/state/CARD-SLUG.md`) at intake.

  Why pinning is mandatory: mutating a frozen document underneath a running Hunter does two bad
  things at once — it **silently invalidates that Hunter's brief** (it was briefed on version N and
  will never learn of N+1), and it **breaks the shared cache prefix** for every agent still in
  flight. Pinning converts an amendment from a race into an ordinary generational boundary.

### 2.5 Who reads it — the three consumers, and the Severity boundary

- **Hunter** — the codex is **first** in its brief, verbatim (§2.7). Its rule: *look up the row,
  do not re-derive the convention.* A Hunter that re-derives a convention already in the codex has
  wasted the artifact.
- **Tracker** — gains `docs/tribe/CODEX.md` as **one more rule source read fresh** (added to the
  list at `tracker.md:33-35`). It derives one checkable item per **`active`** row whose `Scope`
  glob matches a changed file, and cites findings by `CDX-NNN`. This slots into a mechanism that
  already exists — the Tracker reads rules from files on every run and never from memory
  (`tracker.md:21`) — so the codex needs **no new Tracker machinery at all**, only a path. Its
  refusal to invent standards (`tracker.md:89`) is precisely why the codex *promotes* a convention
  into something it is finally allowed to enforce.
- **Skinner** — enforces **only `Severity: Blocker` rows** as done-gating. This is not a new
  policy; it is the existing one made mechanical. The Skinner is already told to enforce only
  what gates done-ness and to **not replicate the Tracker's checklist** (`skinner.md:109-112`).
  The `Severity` column encodes that split **in the data**: `Blocker` rows gate done-ness
  (Skinner + Tracker), `Should-fix` rows are convention conformance (Tracker only).

### 2.6 The mechanical gate: `plugins/tribe/scripts/validate-codex.sh`

Same philosophy and shape as `validate-plan.sh` (`validate-plan.sh:34-38`: mechanical
well-formedness only; judgment stays with the agents; JSON verdict on stdout; exit 2 = setup
error). It checks: header keys present; `codex-version` an integer; `status` legal; ID format and
uniqueness; every column present per row; `Decision` is a single line; `Source` non-empty and
matching `file:line` or `DL-NNN`; `Severity` and `State` in their enums.

It exists so the Skinner round is spent on **grounding and contradiction** (criteria 1–4), not on
parsing a table. Cheap gate first, expensive judgment second.

### 2.7 Prompt-cache: ordering is load-bearing

Prompt caching matches a **prefix**. Therefore, in **every** Hunter brief and **every**
Skinner/Tracker dispatch, the content is ordered:

1. **the codex, verbatim** (identical bytes for every agent in the campaign)
2. the card / spec context
3. the task brief
4. volatile per-agent context

Put a single per-task line *above* the codex and the shared prefix is destroyed for every agent in
the campaign. The ordering is therefore stated as a **rule in the Warchief's brief contract**, not
left to taste. This is the mechanism behind Bun's ≈12:1 cached:uncached ratio
(`bun-rust-migrate-ideas.md:140-141`).

---

## 3. Scope fence

**In scope (the future implementation campaign):**
- New: `plugins/tribe/scripts/validate-codex.sh` + its fixture tests.
- New: `docs/tribe/CODEX.template.md` (the schema, so the Shaman has a form to fill).
- Prompt edits, one section each: `shaman.md` (forge/review/freeze/amend lifecycle),
  `skinner.md` (codex-review protocol + the What-boundary), `tracker.md` (codex as a rule source),
  `warchief.md` (codex-first brief ordering + `codex-version` in the state file), `hunter.md`
  (codex is first in the brief; look up, do not re-derive).

**Explicitly out:**
- **Authoring the actual content** of a codex for any real campaign. The tribe ships the
  *mechanism*; the Shaman fills it per campaign.
- Any change to the roadmap's What/Why, the Decision Log format, or the escalation register.
- Any automatic codex generation, LLM-written rows without a Shaman, or agent-proposed edits
  bypassing the Decision Log.
- Retrofitting the codex onto single-card campaigns.
- **This planning card touches zero files under `plugins/`** — see §4.

---

## 4. Scope fence of *this* (planning-only) card

This card produces **only** `docs/tribe/planning/idea-06-campaign-codex/spec.md` + `plan.md` and
`docs/tribe/state/idea-06-campaign-codex.md`. **Zero changes under `plugins/`** (tripwire —
auto-fail). All prompt text and script code in the plan is *intended* text for a future campaign
to apply, carried inside fenced blocks; nothing is applied here.

---

## 5. Testing / verification strategy

The repo's harness is standalone bash, TAP-style, no CI workflows
(`plugins/tribe/scripts/tests/test-validate-plan.sh:1-13`: `ok -` / `not ok -`, exit non-zero on
any failure). The plan's TDD follows it exactly.

- **`validate-codex.sh`** — fixture tests, red first: a golden codex passes; each malformation
  (duplicate ID, missing `Source`, multi-line `Decision`, illegal `Severity`, missing header key)
  fails with the specific check named in the JSON. Exit-2 setup errors are asserted too, matching
  `validate-plan.sh`'s contract.
- **Prompt edits are tested mechanically, not by vibes.** Each prompt file gets a wiring test
  (`test-codex-wiring-NAME.sh`) that greps the file for the load-bearing clauses: e.g. the Tracker
  file must name `docs/tribe/CODEX.md` in its rule-source list; the Warchief file must state the
  codex-first ordering; the Skinner file must contain the observation-not-FAIL boundary rule. A
  prompt rule nobody can check is a prompt rule that silently rots — the repo's existing scripts
  are exactly this philosophy applied to plans and resume state.
- **Template round-trip** — `docs/tribe/CODEX.template.md` must itself pass `validate-codex.sh`.

## 6. Evidence plan

The future campaign's PR carries:
- **Before:** `validate-codex.sh` does not exist; `grep -rn 'CODEX' plugins/tribe/agents/` returns
  nothing — i.e. no agent has a codex rule source. Terminal screenshot.
- **After:** the full test suite green (`test-validate-codex.sh` + the five wiring tests), and a
  **worked example**: a seeded codex run through `validate-codex.sh` printing `"verdict": "pass"`,
  plus one deliberately-broken row printing a `fail` with the offending check named. Terminal
  screenshot of both.
- **Behavioral proof:** a sample Hunter brief rendered with the codex first, showing the byte-
  identical prefix — the artifact of the prompt-cache claim.
Screenshots suffice (no UI in this repo); no video needed.

## 7. Risks & rollback

| Risk | Mitigation |
|---|---|
| **A wrong row poisons every card.** Every stateless agent trusts every row equally. | Mandatory `Source` provenance + the Skinner grounding round + `validate-codex.sh`. Unevidenced rows are **deleted, not softened** (§2.3). |
| **Codex rot** — the codex drifts from the repo it cites. | `Source` is `file:line`; the Skinner *runs* the citation check. Rows are re-verified on each amendment; a campaign starts from a fresh forge, not a stale file. |
| **Bloat** — the codex becomes a document you read instead of a table you grep. | Hard schema: `Decision` is one imperative line. Enforced by `validate-codex.sh`, not by taste. |
| **Ceremony tax on small work.** | Multi-card campaigns only (§2.2). |
| **Skinner scope creep into What.** | The observation-not-FAIL rule (§2.3), stated in `skinner.md` and asserted by its wiring test. |
| **Amendment races an in-flight card.** | Version pinning (§2.4): in-flight cards keep their dispatched version. |
| **Rollback** | The whole feature is one file plus five additive prompt sections. Revert the PR: the codex path simply stops being referenced; no agent depends on it existing (each consumer treats an absent `docs/tribe/CODEX.md` as "no codex this campaign" and behaves exactly as today). This graceful-absence rule is itself a plan requirement. |

---

## 8. Interactions with other ideas

**Idea 10 (harvest false-starts into rules) — the load-bearing pairing.** Idea 10 turns each
recurring failure pattern into an enforceable rule ("a >3-line comment justifying a workaround =
Blocker"; "a new stub / `todo!` in the diff = Blocker"; "a weakened or skipped test = Blocker" —
the last already a Hunter anti-goal at `hunter.md:103-104` but **not yet a rule the Tracker can
check**), and it names *this* codex as one of the two possible sinks
(`bun-rust-migrate-ideas.md:242-246`).

This spec makes idea 10 a **drop-in, with no schema change required**, and that is a hard
requirement of the design, not a coincidence:
- The `Category` enum **already reserves `tripwire`** (§2.1) for exactly these rows.
- The `Severity: Blocker` value is what makes a harvested tripwire **done-gating** for the Skinner
  and **checkable** for the Tracker (§2.5) — which is precisely the gap idea 10 identifies.
- The **amendment protocol is the write path idea 10 needs** (§2.4): a harvested pattern arrives
  as a Shaman ruling → Decision Log entry `DL-NNN` → a new codex row whose `Source` is that
  `DL-NNN`. Append-only, provenance intact, mid-campaign, without a race.
- The `Check` column gives the harvested rule its mechanical enforcement (e.g.
  `! git diff | grep -q 'todo!'`), closing idea 10's loop: pattern → rule → automatically
  enforced on every subsequent review.

**Dependency direction:** idea 6 must ship **before** idea 10 can use the codex as its sink; idea
10 is not a prerequisite of idea 6 (this ships and is useful with a codex containing zero
`tripwire` rows). If idea 10 ships first, its rules land in `.claude/rules/` and are later
*migrated* into codex rows — a lossless move, since `Source` accepts `file:line`.

**Idea 1 (stateless cells) & the prompt-cache prefix.** The codex-first ordering (§2.7) only pays
off in proportion to how many stateless agents share the prefix. Idea 1 multiplies the agent count
per unit of work; the two compound. Neither blocks the other.

**Idea 7 (mechanical work queue) & Idea 8 (`integrate-wave.sh`).** Same philosophy — push what is
deterministic into code, leave agents only judgment. `validate-codex.sh` is a sibling of
`validate-plan.sh` / `heartbeat-check.sh` / `resume-check.sh` and should live and be tested
alongside them. No file overlap, no ordering constraint.

**Bonus idea (trial run before fanning out).** A campaign's first card is the natural place to
*test* the freshly-frozen codex: if the first card's Hunters still re-derive conventions the codex
should have answered, the codex is incomplete — amend before fanning out. Complementary; not a
dependency.
