// Tests for brief.ts (Task 5a): executor brief rendering from the committed template,
// including the embedded --answers file content (spec §D5). Fixtures are deliberately
// neutral (no repo names, no campaign-specific values) — the stateless-capability wall.
import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { BRIEF_TEMPLATE_PATH, executorBrief } from './brief.ts';
import type { BriefCard, BriefState } from './brief.ts';

const TEMPLATE = readFileSync(BRIEF_TEMPLATE_PATH, 'utf8');

function fixtureCard(overrides: Partial<BriefCard> = {}): BriefCard {
  return {
    id: 'C7',
    spec: 'docs/superpowers/specs/2026-01-01-c7-spec.md',
    plan: 'docs/superpowers/plans/2026-01-01-c7-plan.md',
    ...overrides,
  };
}

function fixtureState(overrides: Partial<BriefState> = {}): BriefState {
  return {
    campaign: 'sample-campaign',
    mergePolicy: 'merge',
    ownerOnlyEscalations: ['schema-lock-change', 'breaking-change'],
    ...overrides,
  };
}

const FIXTURE_ANSWERS = '## 2026-01-01 -- sample ruling\n\nUse the neutral fixture path for all future sessions.\n';

const EXPECTED_BRIEF = `# Executor Brief — card C7 (sample-campaign)

## Executor mode

You are dispatched as the Warchief for exactly one campaign card, running headless inside a
single fresh session with no memory of any other card. Read the spec below silently for
context — you do not re-open design decisions recorded there. Drive the committed plan
test-first, dispatch Hunters per task, audit with the Skinner, and land ONE green,
regular-merged PR on the target repo's master. You never contact the campaign owner
directly, never invent a design decision the plan doesn't already make, and never widen
scope beyond this card.

## Card

- Card: C7
- Spec (target repo, master): docs/superpowers/specs/2026-01-01-c7-spec.md
- Plan (target repo, master): docs/superpowers/plans/2026-01-01-c7-plan.md

## Goal

Ship C7 end-to-end: implement the plan at docs/superpowers/plans/2026-01-01-c7-plan.md against the spec at docs/superpowers/specs/2026-01-01-c7-spec.md, gates green, one regular-merged PR on the target repo's master.

## Walls (non-negotiable)

- Merge policy for this campaign is \`merge\` — regular merge order, NEVER squash.
- The target repo's own CLAUDE.md and \`.claude/rules\` are binding; do not import
  conventions from elsewhere.
- Owner-only items for this campaign (escalate, never decide): schema-lock-change, breaking-change
- Stay inside this card's plan. No scope creep, no adjacent refactors, no speculative
  generality.

## Evidence policy

Every task is test-first: a failing test before the code, gates (formatter/linter/
type-checker/tests) green before commit, and a real commit carrying the code, its test, and
the plan's ticked checkboxes together. Claims of done are worthless without the gate output
that proves them — paste gate output verbatim into worker reports.

## Merge order

Land the PR with a REGULAR merge (\`gh pr merge --merge\`). Squash and rebase merges are
forbidden for this campaign — the merge commit must carry both parents.

## Worker reports

Every dispatched worker (Hunter, Skinner) writes its report to:
.claude/state/sample-campaign/reports/C7.md

## Answers (committed rulings — read before escalating)

Before raising any question, check whether it is already answered here. If it is, follow
the ruling; do not ask again.

${FIXTURE_ANSWERS}

## Terminal contract

End your final message with EXACTLY one of:

- \`SHIPPED <pr> <sha>\` — the PR number and the merge commit sha, once verified merged.
- \`NEEDS_DIRECTION: <question>\` — a specific, answerable question, when you cannot proceed
  without a human ruling. Do not guess an answer to unblock yourself.

No other terminal line is a valid signal.
`;

describe('executorBrief', () => {
  test('renders the committed template with card/state substitutions and the embedded answers content (snapshot)', () => {
    const rendered = executorBrief(fixtureCard(), fixtureState(), FIXTURE_ANSWERS, TEMPLATE);
    expect(rendered).toBe(EXPECTED_BRIEF);
  });

  test('embeds the answers file content verbatim so a past ruling reaches every future session', () => {
    const distinctiveRuling = '## ruling\n\nAlways use the neutral fixture, never a real repo name.\n';
    const rendered = executorBrief(fixtureCard(), fixtureState(), distinctiveRuling, TEMPLATE);
    expect(rendered).toContain(distinctiveRuling);
  });

  test('never squash: the regular-merge order is explicit', () => {
    const rendered = executorBrief(fixtureCard(), fixtureState(), FIXTURE_ANSWERS, TEMPLATE);
    expect(rendered).toContain('gh pr merge --merge');
    expect(rendered).toContain('NEVER squash');
  });

  test('renders a distinct brief per card id and per campaign (no hardcoded values)', () => {
    const rendered = executorBrief(
      fixtureCard({ id: 'X9', spec: 'docs/superpowers/specs/x9.md', plan: 'docs/superpowers/plans/x9.md' }),
      fixtureState({ campaign: 'other-campaign', ownerOnlyEscalations: [] }),
      FIXTURE_ANSWERS,
      TEMPLATE,
    );
    expect(rendered).toContain('card X9 (other-campaign)');
    expect(rendered).toContain('.claude/state/other-campaign/reports/X9.md');
    expect(rendered).toContain('(none declared for this campaign)');
  });
});
