// core/live/page.ts — server-rendered live page shell (spec §7, Task 9).
//
// A shell only: header (campaign identity, read-only disclaimer, link back to `/`), an empty
// process-list aside, an empty transcript main, and the two asset tags. All content arrives over
// SSE from the browser client (Task 10) — this module renders no data, just the frame it lands
// in. Structural numbers (container width, type scale, reading measure, panel caps, spacing
// rhythm) follow `plugins/tribe/rules/html-illustration.md`; the palette matches the existing
// status page (`core/render.ts`) for continuity.
import { escapeHtml } from '../render.ts';

const STYLE = `
  html { font-size: 20.7px; }
  body { font-size: 21.85px; line-height: 1.65; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; color: #1a1a1a; background: #fafafa; }
  .wrap { max-width: min(1780px, 94vw); margin: 0 auto; padding: 40px 40px 120px; }
  header p.disclaimer { color: #555; font-size: 0.9rem; }
  header h1 { font-size: clamp(2.6rem, 3.4vw, 3.8rem); margin: 0 0 8px; }
  header nav a { color: #1a7f37; }
  main.layout { display: flex; gap: 32px; align-items: flex-start; margin-top: 40px; }
  aside.processes { max-width: 420px; flex: 0 0 320px; border: 1px solid #ddd; border-radius: 6px; padding: 22px 26px; background: #fff; }
  section.transcript { max-width: 1360px; flex: 1 1 auto; border: 1px solid #ddd; border-radius: 6px; padding: 22px 26px; background: #fff; font-size: 0.95rem; }
  section.transcript p { max-width: 72ch; margin: 0 0 16px; }
  @media (max-width: 900px) {
    html { font-size: 16px; }
    body { font-size: 17px; }
    .wrap { padding: 0 20px 72px; max-width: 100vw; }
    main.layout { flex-direction: column; }
    aside.processes, section.transcript { max-width: 100%; }
  }
`;

export function renderLivePage(input: { repoKey: string; slug: string; processId: string | null }): string {
  const repoAttr = escapeHtml(input.repoKey);
  const slugAttr = escapeHtml(input.slug);
  const processAttr = input.processId === null ? '' : ` data-process="${escapeHtml(input.processId)}"`;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Live — ${repoAttr} / ${slugAttr}</title>
<link rel="stylesheet" href="/app.css">
<style>${STYLE}</style>
</head>
<body>
<div class="wrap" id="live-root" data-repo="${repoAttr}" data-slug="${slugAttr}"${processAttr}>
<header>
<h1>${repoAttr} / ${slugAttr}</h1>
<p class="disclaimer">This is a read-only live view. Nothing on this page writes, executes, or sends anything.</p>
<nav><a href="/">&larr; back to status</a></nav>
</header>
<main class="layout">
<aside class="processes" id="process-list"></aside>
<section class="transcript" id="transcript"></section>
</main>
</div>
<script type="module" src="/app.js"></script>
</body>
</html>`;
}
