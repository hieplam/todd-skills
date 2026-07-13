# tribe-state: idea-04-disagreement-routing
roadmap: bun-rust-migrate-ideas.md
worktree: /Users/todd.lam/WORK/_TestScripts/todd-skills-worktrees/impl-idea-04
branch: feat/idea-04-disagreement-routing
report: /private/tmp/claude-503/-Users-todd-lam-WORK--TestScripts-todd-skills/84a1f98b-a3c1-4a06-a79a-4db91db65822/scratchpad/campaign/reports/impl-idea-04.md
base-sha: d21724cc0c032cb7fb8ef3bc9e48c269e5a7bc4c
plan: docs/tribe/planning/idea-04-disagreement-routing/plan.md

## Milestones
- [x] spec committed (on master, planning campaign)
- [x] plan committed (on master, planning campaign — validate-plan.sh PASS, 5 tasks)
- [ ] wave 1 integrated (tasks 1-5; single wave, single worktree)

## Campaign type

IMPLEMENTATION. The spec and plan are settled law, already on master. This campaign applies the
prompt edits the plan describes: Warchief step 6 gains the confidence classes, the routing table,
the conflict ladder and the two ledger columns; a new mechanical conformance suite; four evals.

## Rulings in force (D12a — recorded BEFORE the work they authorize)

- **D12a** (standing): a ruling is an ARTIFACT, not a claim — it lands here before dispatch.
- **D14** (standing): per-clause mutation is the acceptance bar for every tripwire assertion.
  Task 5's negative guards are each proven to bite by injecting the forbidden clause (the plan
  scripts exactly that), never by a whole-file revert. Tasks 1-4's positive assertions are proven
  red→green by the TDD order the plan mandates: assertions written and RUN before the prompt edit
  exists.
- **AG-3** (informational): the card's "run a third review round" rung is bounded by the plan's own
  one-tie-break-per-finding-key cap and its "a tie-break is not a fix round" accounting rule.

## Warchief composition rulings (this campaign)

The plan was authored against a step 6 that idea 03 has since superseded. Per the Shaman's dispatch
("compose with the CURRENT law the way 03 composed with 01 — deliberate supersession, never silent
deletion"), these are ruled BEFORE task 1 dispatches, so no Hunter guesses and no NEEDS_CONTEXT
round is spent on them:

- **W1 — Insertion anchor.** The plan says "immediately after idea 01's merge law … and before idea
  05's fixer-brief template". On current master that range resolves unambiguously: the new blocks go
  **immediately before the paragraph beginning `**The fixer brief — a finding is a hypothesis, not an
  order.**`** — i.e. after Law 3 / Law 4 / the round-pass criteria / the 3-round cap / the
  adjudication paragraph, and after idea 02's dispatch-content checklist, which stays contiguous.
  Both plan anchors are satisfied; nothing existing is deleted, reworded or reordered.
- **W2 — Tag supersession is bridged, not assumed.** The plan's prose assumes idea 01's two-valued
  tag (`[both]` / `[one]`). Idea 03 superseded it with a three-valued tag (`[both]` /
  `[contract-only]` / `[cold-only]`), whose table already carries a "Maps onto idea 01's tag"
  column. The plan's class definitions hold verbatim and land verbatim — plus **one added mapping
  sentence** in the class block, the deliberate-supersession bridge the spec's §7 idea-03 section
  itself mandates (spec:439-450, 498-503):

  > **Mapping from Law 3's tags.** `[both]` → `agreed`. `[contract-only]` and `[cold-only]` →
  > `single` — *including* the case where the contract lens PASSed and the cold lens flagged a line:
  > A was **silent** there, and silence is not dissent (Rule A). A pair becomes `conflicting` only
  > when both lenses flagged the **same location** with **mutually unsatisfiable** remedies (Rule B).

  Additive prompt text, inside the plan's own file fence (`warchief.md`, step 6 only). It changes no
  plan assertion and is what lets the card compose with shipped law instead of the law the plan was
  written against.
- **W3 — Law 4's escalation wording (follow-up F12) is NOT this campaign's to fix.** Out of fence.
- **W4 — D14 mutation sweep over EVERY assertion in the new suite (authorizes task 5).** Task 1's
  RED run surfaced that the plan's `class token: single` assertion (regex `` `?single`? ``) was
  ALREADY green before the prompt edit existed: idea 05's shipped fixer-brief text uses the word
  `single` for its confidence-class field. The assertion therefore passes even if the `single` class
  row is deleted — which is precisely the failure D14 exists to catch ("delete only the guarded
  clause, prove that assertion goes red"). A tripwire that cannot go red is decoration.
  **Ruling:** task 5 runs a per-clause mutation sweep over EVERY assertion in
  `test-disagreement-routing.sh` (positive and negative), and any assertion that does not go red
  when its own guarded clause alone is deleted is TIGHTENED until it does — anchoring to the table
  row rather than the bare token. This is a strengthening of the plan's tests in service of the
  plan's own stated intent (spec §4: "greps the prompt text for the invariants a careless future
  edit would silently delete"); it weakens no assertion and adds no scope beyond the plan's own
  test file.

- **W5 — the assertion-quality bar, applied at birth to every task (supersedes the plan's literal
  regex strings, never its assertions).** Three audit rounds on task 1 established that the plan's
  grep regexes are illustrative, not load-bearing: they are line-based phrase greps, and the repo's
  own sibling suite (`test-dual-skinner-cell.sh:15-17`) already documents why that is wrong —
  *"Agent prompts are hard-wrapped prose, so a sentence routinely straddles a newline. grep is
  line-based and would miss it. Flatten every haystack."* **What is settled law is each assertion's
  NAME and the invariant it guards; the regex is the How, and the How is mine.** Every assertion in
  `test-disagreement-routing.sh`, in every task, must meet all three bars:
  1. **Flattened haystack.** Match against a whitespace-flattened region (the sibling suite's `flat()`
     convention), so a benign markdown reflow cannot produce a false failure.
  2. **Per-clause anchoring (D14/W4).** Deleting ONLY the clause the assertion names must turn that
     assertion — and only that assertion — red. A phrase restated elsewhere in step 6 must not hold
     it green.
  3. **Conjunct completeness.** If the assertion's name makes a compound claim ("is `single`, never
     `conflicting`"), the regex must check every conjunct. An alternation that passes on either half
     alone does not guard the claim its name makes.
  Both mutation classes (clause-deletion AND benign reflow) are run for every assertion before a task
  is called done. This is why tasks 2-5's briefs carry the bar up front instead of discovering it in
  an audit loop.

## OPEN — NEEDS_DIRECTION pending (2026-07-13)

**Task 1 is code-complete and green; its audit loop hit the 3-round fix cap with one Confirmed
`[cold-only]` Important (F7) outstanding.** State for a resuming Warchief:

- Branch `feat/idea-04-disagreement-routing` @ `e1b55e6`, tree clean. Suite 8/8 green; all 6 neighbour
  suites green (175 assertions). `skinner.md` / `hunter.md` untouched.
- Fix rounds spent: **3 of 3**. F1-F6 all routed, all FIXED, none ever re-raised (the loop converged:
  Critical → Critical → Important → Important; the contract lens has PASSed in rounds 3 and 4).
- **F7** (cold-only, Important, Confirmed): the Rule A / Rule B assertions anchor on the whole sentence
  being wrapped in ONE bold span, so a meaning-preserving re-bolding (`**Rule A** — silence is not
  dissent.`) would redden them. Pre-designed fix, one line each: drop the `\*\*…\*\*` requirement and
  anchor on word order (`Rule A .{1,3} silence is not dissent`), which stays unique to the clause — W2's
  restatement puts "(Rule A)" *after* the phrase — so D14 per-clause anchoring survives while bold
  relocation no longer breaks it.
- Tasks 2-5 are NOT started. Their briefs must carry **W5** up front so assertions are born at the bar
  rather than discovered at it.

## Scope fence (from the plan's Global Constraints)

Touch only: `plugins/tribe/agents/warchief.md` (step 6 only),
`plugins/tribe/scripts/tests/test-disagreement-routing.sh` (new),
`plugins/tribe/evals/evals.json`, this state file, and this card's own plan checkboxes.
**Auto-fail:** any edit to `plugins/tribe/agents/skinner.md` or `plugins/tribe/agents/hunter.md`.
