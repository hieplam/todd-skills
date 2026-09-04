/**
 * Markdown-subset renderer (spec D6). Pure: takes a string, returns an HTML
 * string. This is the ONLY place transcript markdown becomes HTML and the
 * ONLY place transcript content is escaped. Escaping always happens BEFORE
 * markup is added, so no input can ever inject an element or an attribute.
 *
 * Supported subset and nothing more: fenced code blocks, inline code, bold,
 * italic, ATX headings, bullet and numbered lists, links, paragraphs, hard
 * line breaks. Everything else renders as escaped text.
 *
 * Fenced blocks are segmented out of the input FIRST, each segment is
 * rendered independently, and the results are concatenated. Nothing is ever
 * written into an assembled string as a placeholder and later re-scanned for
 * -- that shape let a fence's own rendered markup collide with unrelated
 * content (see the F21 regression test).
 */

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch]!);
}

const FENCE_RE = /```([a-zA-Z0-9_-]*)\r?\n([\s\S]*?)```/g;
const HEADING_RE = /^(#{1,6})\s+(.*)$/;
const BULLET_LINE_RE = /^-\s+(.*)$/;
const NUMBERED_LINE_RE = /^\d+\.\s+(.*)$/;
// Bounded (`{0,N}`) and newline-excluding so a run of unmatched `[` cannot
// force the engine to rescan to the end of the string from every start
// position (F23): each attempt is now capped, keeping the whole pass linear.
const LINK_RE = /\[([^\]\n]{0,500})\]\(([^)\n]{0,2000})\)/g;
// Gate the href with the runtime's real URL parser rather than a regex
// allowlist (F31): a regex can only reject the shapes its author thought
// of, while `//host`, `/\host`, and whitespace-prefixed hosts (the WHATWG
// parser strips ASCII tab/CR/LF before resolving) all still resolve to an
// arbitrary external origin through a hand-rolled pattern. `URL` is a
// deterministic, side-effect-free global -- using it adds no world import
// and keeps this module pure.
//
// A SINGLE base is not enough (F35): an href that shares the base's scheme
// but omits the literal `//` -- e.g. `https:/evil.com` or `https:evil.com`
// -- is resolved by WHATWG as a *relative path* under that one base, so
// `u.origin` stays the base's origin and the gate wrongly allows it. The
// real page has no scheme in common with a `https://viewer.invalid/` base
// when served over plain HTTP, so a browser resolves that same literal
// href to the attacker's origin instead. Requiring same-origin under TWO
// bases of DIFFERENT schemes closes this: an href with no scheme and no
// authority of its own resolves to the base origin under both schemes;
// one that smuggles in a scheme (like `https:/evil.com`) only matches one
// of the two and is rejected.
function isAllowedHref(href: string): boolean {
  if (/^https?:\/\//i.test(href)) {
    try {
      const u = new URL(href);
      return u.protocol === 'http:' || u.protocol === 'https:';
    } catch {
      return false;
    }
  }
  try {
    const a = new URL(href, 'http://viewer.invalid/');
    const b = new URL(href, 'https://viewer.invalid/');
    return a.origin === 'http://viewer.invalid' && b.origin === 'https://viewer.invalid';
  } catch {
    return false;
  }
}

interface Segment {
  fenced: boolean;
  text: string;
  lang: string;
}

function segmentFences(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  FENCE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = FENCE_RE.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ fenced: false, text: text.slice(lastIndex, match.index), lang: '' });
    }
    segments.push({ fenced: true, text: match[2] ?? '', lang: match[1] ?? '' });
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) {
    segments.push({ fenced: false, text: text.slice(lastIndex), lang: '' });
  }
  return segments;
}

export function renderMarkdown(text: string): string {
  return segmentFences(text).map(renderSegment).join('');
}

function renderSegment(segment: Segment): string {
  if (segment.fenced) {
    // Strip a trailing CRLF, bare LF, or bare CR (F33, F37): stripping only
    // `\n` left a stray `\r` inside <code> for a Windows-style (CRLF)
    // fenced block; matching only `\r?\n` still left a lone trailing `\r`
    // (classic-Mac line ending, no following `\n`) inside <code>.
    const content = escapeHtml(segment.text.replace(/\r\n$|\n$|\r$/, ''));
    const cls = segment.lang ? ` class="lang-${segment.lang}"` : '';
    return `<pre><code${cls}>${content}</code></pre>`;
  }

  const blocks = segment.text
    // Normalize CRLF blank-line separators before splitting so a
    // Windows-style transcript still gets separate blocks, with no stray
    // `\r` left inside the rendered text (F24).
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0);

  return blocks.map(renderBlock).join('');
}

function renderBlock(block: string): string {
  const heading = block.match(HEADING_RE);
  if (heading) {
    const level = heading[1]!.length;
    return `<h${level}>${renderInline(heading[2]!)}</h${level}>`;
  }

  const lines = block.split('\n');

  if (lines.every((line) => BULLET_LINE_RE.test(line))) {
    const items = lines.map((line) => `<li>${renderInline(line.match(BULLET_LINE_RE)![1]!)}</li>`).join('');
    return `<ul>${items}</ul>`;
  }

  if (lines.every((line) => NUMBERED_LINE_RE.test(line))) {
    const items = lines.map((line) => `<li>${renderInline(line.match(NUMBERED_LINE_RE)![1]!)}</li>`).join('');
    return `<ol>${items}</ol>`;
  }

  return `<p>${lines.map(renderInline).join('<br>')}</p>`;
}

// Combined emphasis first (F25): matching `***...***` before the separate
// bold/italic passes below produces valid nesting instead of two
// independent passes emitting overlapping, mismatched tags.
function applyEmphasisAndCode(text: string): string {
  let out = text;
  out = out.replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>');
  out = out.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  out = out.replace(/\*(.+?)\*/g, '<em>$1</em>');
  out = out.replace(/`([^`]+?)`/g, '<code>$1</code>');
  return out;
}

function renderInline(raw: string): string {
  const escaped = escapeHtml(raw);
  // Segment the escaped string on LINK_RE FIRST, then run the emphasis and
  // inline-code passes only over the non-link text and over each link's
  // LABEL -- never over an href (F32). Running those passes over the whole
  // string before LINK_RE extracted the href let `*`/`` ` `` characters
  // inside a URL turn into tag markup landing inside the `href` attribute,
  // and let an emphasis span opened inside an href close outside the
  // anchor. Same discipline as the fence segmentation above: segment,
  // render each piece independently, concatenate -- never splice a
  // placeholder into the string and re-scan for it.
  let result = '';
  let lastIndex = 0;
  LINK_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = LINK_RE.exec(escaped)) !== null) {
    if (match.index > lastIndex) {
      result += applyEmphasisAndCode(escaped.slice(lastIndex, match.index));
    }
    const full = match[0];
    const label = match[1] ?? '';
    const href = match[2] ?? '';
    if (isAllowedHref(href)) {
      result += `<a href="${href}" rel="noreferrer noopener" target="_blank">${applyEmphasisAndCode(label)}</a>`;
    } else {
      // A disallowed href degrades exactly as before: the original matched
      // text goes through the same text path as ordinary content, never as
      // a live anchor.
      result += applyEmphasisAndCode(full);
    }
    lastIndex = match.index + full.length;
  }
  if (lastIndex < escaped.length) {
    result += applyEmphasisAndCode(escaped.slice(lastIndex));
  }
  return result;
}
