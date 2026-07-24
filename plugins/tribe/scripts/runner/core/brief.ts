// Executor brief rendering from the committed template (Task 5a, spec §D5).
//
// Reads a single committed asset (`brief-template.md`, shipped alongside this module) and
// fills it in from the campaign card/state passed by the caller — no repo names, paths,
// model names, or campaign values are hardcoded here (stateless-capability wall). The
// `answersContent` param is the raw text of the committed `--answers` rulings file; it is
// embedded verbatim so a human's ruling on a past escalation reaches every future session
// (spec §D5).
import { join } from 'node:path';

/** Minimal, local view of a campaign card needed to render a brief — decoupled from the
 * full `Card` shape in `types.ts` (Task 5 must not edit that file). */
export interface BriefCard {
  id: string;
  spec: string | null;
  plan: string | null;
}

/** Minimal, local view of campaign state needed to render a brief. */
export interface BriefState {
  campaign: string;
  mergePolicy: string;
  ownerOnlyEscalations: string[];
}

/** Absolute path of the committed template asset — pure path computation; the CALLER reads
 * it (through its own injected IO seam) and passes the content in. */
export const BRIEF_TEMPLATE_PATH = join(import.meta.dir, 'brief-template.md');

function renderTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(vars, key)) {
      throw new Error(`brief-template.md: unknown placeholder {{${key}}}`);
    }
    return vars[key] as string;
  });
}

/** Spec §5.3: the worker report lives in the campaign's machine-local home — injected by
 * the caller, ABSOLUTE (executor sessions run with cwd = --repo, so a repo-relative path
 * can no longer express it). The old `.claude/state/...` hardcode violated this module's
 * own stateless-capability header and is gone. */
export function reportPathFor(homeDir: string, cardId: string): string {
  return join(homeDir, 'reports', `${cardId}.md`);
}

function goalFor(card: BriefCard): string {
  const plan = card.plan ?? '(missing)';
  const spec = card.spec ?? '(missing)';
  return `Ship ${card.id} end-to-end: implement the plan at ${plan} against the spec at ${spec}, gates green, one regular-merged PR on the target repo's master.`;
}

/** Renders the committed brief template for one campaign card and embeds the committed
 * `--answers` rulings file content verbatim (spec §D5). */
export function executorBrief(
  card: BriefCard,
  state: BriefState,
  answersContent: string,
  template: string,
  reportPath: string,
): string {
  const ownerOnly =
    state.ownerOnlyEscalations.length > 0
      ? state.ownerOnlyEscalations.join(', ')
      : '(none declared for this campaign)';

  return renderTemplate(template, {
    CARD_ID: card.id,
    CAMPAIGN: state.campaign,
    SPEC_PATH: card.spec ?? '(missing)',
    PLAN_PATH: card.plan ?? '(missing)',
    GOAL: goalFor(card),
    MERGE_POLICY: state.mergePolicy,
    OWNER_ONLY_ESCALATIONS: ownerOnly,
    REPORT_PATH: reportPath,
    ANSWERS_CONTENT: answersContent,
  });
}
