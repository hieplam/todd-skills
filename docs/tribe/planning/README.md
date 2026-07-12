# Planning campaign: Bun-rewrite ideas → tribe specs + plans

10 idea cards from `bun-rust-migrate-ideas.md` (root), each turned into a spec + a
validate-plan.sh-passing plan by a dedicated Warchief in its own worktree (planning-only:
nothing under `plugins/` changed). Every spec carries an "Interactions with other ideas"
section; the constraints below are the union of those sections, verified pairwise-consistent.

| # | Card | Plan tasks | Spec/plan |
|---|------|-----------|-----------|
| 01 | dual-skinner-cell — step-6 audit becomes a 2-Skinner cell (4 laws) | 4 | `idea-01-dual-skinner-cell/` |
| 02 | context-isolation — allowlist seal on Skinner dispatch, CONTAMINATED refusal | 3 | `idea-02-context-isolation/` |
| 03 | input-asymmetry — contract lens vs cold lens (delta on 01, ruling D3) | 4 | `idea-03-input-asymmetry/` |
| 04 | disagreement-routing — adjudication table over 2 reviewers' findings | 5 | `idea-04-disagreement-routing/` |
| 05 | fixer-adjudication — findings are hypotheses; reproduce-first fixer | 4 | `idea-05-fixer-adjudication/` |
| 06 | campaign-codex — frozen greppable CODEX.md forged per campaign | 7 | `idea-06-campaign-codex/` |
| 07 | mechanical-queue — build-queue.sh, queue.tsv as plan task source | 6 | `idea-07-mechanical-queue/` |
| 08 | integrate-wave-script — integrate-wave.sh replaces step-5 prose | 8 | `idea-08-integrate-wave-script/` |
| 09 | ephemeral-warchief — intentional HANDOFF exit per wave | 9 | `idea-09-ephemeral-warchief/` |
| 10 | meta-loop-tripwires — findings ledger + self-minted tripwire rules | 8 | `idea-10-meta-loop-tripwires/` |

## Implementation-campaign sequencing constraints (binding, from the specs)

- **step-6 cluster:** `05 → 01/03 → 04`. 05 first (cheap-discard layer before reviewer volume
  doubles); 04 last. 01's plan carries a mandatory anchor check so its step-6 rewrite composes
  with (never overwrites) 05's fixer template/ledger/standoff rule.
- **02 ⊥ 03:** textual collision on the step-6 brief-contents clause + skinner.md Operating
  rules — never the same wave; either order works.
- **step-5 cluster:** 07, 08, 09 pairwise overlap warchief.md step 5 — each in its own wave.
  **08 before 09** (08 is 09's precondition). Whichever of 08/09 lands first MUST carry the
  `base-sha`/`wave-base-sha` split fix (latent resume bug found by 09's grounding).
- **06 before 10:** the codex is 10's tripwire-rule sink (`Category: tripwire` reserved).

## Owner rulings encoded (Decision Log)

- **D3:** card 03 is a delta layered on card 01's baseline.
- **D4:** tripwire ratification = Shaman-only, under 4 machine-checkable conditions
  (recurred in ≥2 cards; backtest fires ≤25% of last 20 merged commits; Decision Log entry;
  blocker budget cap 12), owner veto + auto-escalation for repo-wide high-blast rules;
  the Warchief never ratifies. Grep-guarded in idea-10's plan.

## Follow-up card candidates surfaced during planning (not in this PR)

1. `resume-check.sh` misreads planning-only campaigns — `REVERT_AND_REDO` would have destroyed
   a staged 429-line deliverable (idea-02 resume). Candidate: `mode: planning` state-file field.
2. Latent bug: `base-sha` re-record vs resume-check trailer-scan floor → post-wave-merge resume
   collapses to task 1 (fix designed inside idea-09's plan; extract if 09 is deferred).
3. Skinner worktree footgun: `cp -r` of a linked worktree points at the shared gitdir — two
   Skinners' simulation commits landed on a real branch (both self-recovered, branch verified
   intact). Candidate rule: simulate in `git clone`/`git archive`, never `cp -r` a worktree.
4. idea-03's branch commits are unsigned (ssh-sign hung in that sandbox) — irrelevant after
   squash-merge, noted for the record.
