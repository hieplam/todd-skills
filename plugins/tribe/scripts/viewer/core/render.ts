// Pure server-side render: CampaignStatus[] -> self-contained HTML string (spec §7, D3).
//
// One exported function. No external assets (inline <style>, no client JS — the refresh IS
// the poll). Every dynamic string is HTML-escaped through `escapeHtml` before interpolation —
// a hostile campaign slug or state value must never become markup/script.
import { compareForRender } from './derive.ts';
import type { CampaignStatus, CardRow, Liveness } from './model.ts';

const HEADER_LINE = 'Read-only view of on-disk state. GitHub is authority for PR/merge truth.';

const STYLE = `
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 2rem; color: #1a1a1a; background: #fafafa; }
  header p.disclaimer { color: #555; font-size: 0.9rem; }
  section.campaign { border: 1px solid #ddd; border-radius: 6px; padding: 1rem 1.25rem; margin-bottom: 1.5rem; background: #fff; }
  .badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 4px; font-weight: 600; font-size: 0.8rem; color: #fff; }
  .badge-running { background: #1a7f37; }
  .badge-crashed { background: #cf222e; }
  .badge-exited { background: #57606a; }
  .badge-never_run { background: #9a6700; }
  .stop-banner { background: #ffebe9; border: 1px solid #cf222e; color: #82071e; padding: 0.5rem 0.75rem; border-radius: 4px; margin: 0.5rem 0; }
  .error-panel { background: #fff8c5; border: 1px solid #d4a72c; color: #4d3800; padding: 0.5rem 0.75rem; border-radius: 4px; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.5rem; }
  th, td { text-align: left; padding: 0.25rem 0.5rem; border-bottom: 1px solid #eee; font-size: 0.9rem; }
  pre { background: #f6f8fa; border: 1px solid #ddd; border-radius: 4px; padding: 0.5rem; overflow-x: auto; font-size: 0.8rem; max-height: 20rem; }
  .escalation { border-left: 3px solid #9a6700; padding-left: 0.6rem; margin: 0.4rem 0; }
`;

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function badgeFor(liveness: Liveness): string {
  switch (liveness.kind) {
    case 'running':
      return `<span class="badge badge-running">RUNNING</span> pid ${liveness.pid}, started ${escapeHtml(liveness.startedAt)}`;
    case 'crashed':
      return `<span class="badge badge-crashed">CRASHED</span> pid ${liveness.pid} (dead), started ${escapeHtml(liveness.startedAt)}`;
    case 'exited':
      return `<span class="badge badge-exited">EXITED</span> reason ${escapeHtml(liveness.reason)}, exit ${liveness.exitCode}, ended ${escapeHtml(liveness.endedAt)}`;
    case 'never_run':
      return `<span class="badge badge-never_run">NEVER RUN</span>`;
  }
}

function renderCardRow(card: CardRow): string {
  return `<tr>
    <td>${escapeHtml(card.id)}</td>
    <td>${escapeHtml(card.status)}</td>
    <td>${card.pr === null ? '' : card.pr}</td>
    <td>${card.updatedAt === null ? '' : escapeHtml(card.updatedAt)}</td>
    <td>${card.blockedOn === null ? '' : escapeHtml(card.blockedOn)}</td>
  </tr>`;
}

function renderCards(cards: CampaignStatus['cards']): string {
  if (!Array.isArray(cards)) {
    return `<div class="error-panel">Card table unavailable: ${escapeHtml(cards.error)}</div>`;
  }
  if (cards.length === 0) return '<p>No cards recorded.</p>';
  return `<table>
    <thead><tr><th>Card</th><th>Status</th><th>PR</th><th>Updated</th><th>Blocked on</th></tr></thead>
    <tbody>${cards.map(renderCardRow).join('')}</tbody>
  </table>`;
}

function renderEscalations(pending: CampaignStatus['pendingEscalations']): string {
  if (pending.length === 0) return '';
  return `<h4>Pending escalations</h4>${pending
    .map(
      (e) =>
        `<div class="escalation"><strong>${escapeHtml(e.cardId)}</strong>: ${escapeHtml(e.reason)}</div>`,
    )
    .join('')}`;
}

function renderReports(reports: CampaignStatus['reports']): string {
  if (reports.length === 0) return '';
  return `<h4>Worker reports</h4><ul>${reports
    .map((r) => `<li>${escapeHtml(r.cardId)}.md (${r.sizeBytes} bytes)</li>`)
    .join('')}</ul>`;
}

function renderSessionTail(tail: CampaignStatus['sessionTail']): string {
  if (tail === null) return '';
  const lines = tail.lines.map(escapeHtml).join('\n');
  return `<h4>Session tail — ${escapeHtml(tail.file)} (${tail.ageSeconds}s ago, ${tail.sizeBytes} bytes)</h4>
    <pre>${lines}</pre>`;
}

function renderErrors(errors: string[]): string {
  if (errors.length === 0) return '';
  return `<div class="error-panel">${errors.map(escapeHtml).join('<br>')}</div>`;
}

function renderCampaign(status: CampaignStatus): string {
  return `<section class="campaign">
    <h2>${escapeHtml(status.repoKey)} / ${escapeHtml(status.campaignSlug)}</h2>
    <p>${badgeFor(status.liveness)}</p>
    <p>home: <code>${escapeHtml(status.homeDir)}</code></p>
    ${status.stopRequested ? '<div class="stop-banner">STOP requested</div>' : ''}
    ${renderErrors(status.errors)}
    ${renderCards(status.cards)}
    ${renderEscalations(status.pendingEscalations)}
    ${renderReports(status.reports)}
    ${renderSessionTail(status.sessionTail)}
  </section>`;
}

export function renderPage(statuses: CampaignStatus[], meta: { tribeRoot: string; nowIso: string }): string {
  const body =
    statuses.length === 0
      ? '<p>no campaigns recorded yet.</p>'
      : [...statuses].sort(compareForRender).map(renderCampaign).join('\n');

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Tribe campaign status</title>
  <style>${STYLE}</style>
</head>
<body>
  <header>
    <h1>Tribe campaign status</h1>
    <p class="disclaimer">${HEADER_LINE}</p>
    <p>tribe root: <code>${escapeHtml(meta.tribeRoot)}</code> &middot; as of ${escapeHtml(meta.nowIso)}</p>
  </header>
  <main>
    ${body}
  </main>
</body>
</html>`;
}
