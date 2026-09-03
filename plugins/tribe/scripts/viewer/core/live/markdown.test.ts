import { expect, test } from 'bun:test';
import { escapeHtml, renderMarkdown } from './markdown.ts';

test('escapes every dangerous character before any markup is added', () => {
  expect(escapeHtml(`<img src=x onerror="1">&'`)).toBe('&lt;img src=x onerror=&quot;1&quot;&gt;&amp;&#39;');
  expect(renderMarkdown('<script>alert(1)</script>')).not.toContain('<script>');
});

test('renders the supported subset', () => {
  expect(renderMarkdown('**bold** and *it* and `code`')).toBe('<p><strong>bold</strong> and <em>it</em> and <code>code</code></p>');
  expect(renderMarkdown('## Heading')).toBe('<h2>Heading</h2>');
  expect(renderMarkdown('- one\n- two')).toBe('<ul><li>one</li><li>two</li></ul>');
  expect(renderMarkdown('[kanna](https://example.test/x)')).toBe('<p><a href="https://example.test/x" rel="noreferrer noopener" target="_blank">kanna</a></p>');
});

test('a fenced block keeps its content verbatim and escaped', () => {
  expect(renderMarkdown('```ts\nconst a = 1 < 2;\n```')).toBe('<pre><code class="lang-ts">const a = 1 &lt; 2;</code></pre>');
});

test('a javascript: link is rendered as plain text, never as an anchor', () => {
  expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a ');
});

// F21: a NUL byte (fully reachable from transcript JSON via the \u0000 escape
// sequence, which JSON.parse decodes to a real NUL character) must never
// collide with the fence-segmentation mechanism. Written as the escape
// sequence below, never as a raw control byte in the source.
test('F21: a NUL byte in transcript content never collides with fence segmentation', () => {
  const nul = '\u0000';
  expect(renderMarkdown(` ${nul}0${nul} `)).toBe(`<p>${nul}0${nul}</p>`);
  expect(renderMarkdown('```\nfenced\n```\n\n' + nul + '0' + nul)).toBe(
    `<pre><code>fenced</code></pre><p>${nul}0${nul}</p>`,
  );
});

// F22: a protocol-relative URL (`//host/...`) must never be treated as a
// same-origin relative link -- it silently navigates off-origin.
test('F22: a protocol-relative href is rejected, never rendered as a live link', () => {
  expect(renderMarkdown('[click](//evil.example.com/phish)')).not.toContain('<a ');
});

// F23: link matching must stay roughly linear even over a long run of
// unmatched `[` (ordinary tool-output/code content). The old regex went
// quadratic: ~2.4s at 80,000 chars. A generous bound below still catches a
// regression while tolerating machine variance.
test('F23: link matching stays bounded under a long run of unmatched brackets', () => {
  const input = '['.repeat(50_000);
  const start = performance.now();
  renderMarkdown(input);
  const elapsed = performance.now() - start;
  expect(elapsed).toBeLessThan(500);
});

// F24: a CRLF blank line must still separate blocks, with no stray \r
// leaking into the rendered output.
test('F24: a CRLF blank line separates blocks with no stray carriage return', () => {
  expect(renderMarkdown('## Heading\r\n\r\nSome text')).toBe('<h2>Heading</h2><p>Some text</p>');
});

// F25: combined bold+italic emphasis must nest validly, not overlap.
test('F25: combined bold and italic emphasis nests instead of overlapping', () => {
  expect(renderMarkdown('***text***')).toBe('<p><strong><em>text</em></strong></p>');
});

// F31: a regex allowlist rejected only a literal second `/`, so a
// backslash or an ASCII whitespace control character before the host
// still produced a live anchor a browser resolves to an arbitrary
// external origin. The real URL parser closes the whole class.
test('F31: a backslash-prefixed href is rejected, never rendered as a live link', () => {
  expect(renderMarkdown('[x](/\\evil.example.com/phish)')).not.toContain('<a ');
});

test('F31: a tab-prefixed href is rejected, never rendered as a live link', () => {
  expect(renderMarkdown('[x](/\t/evil.com/p)')).not.toContain('<a ');
});

test('F31: ordinary relative and absolute hrefs are still allowed', () => {
  expect(renderMarkdown('[x](/local/path)')).toContain('<a href="/local/path"');
  expect(renderMarkdown('[x](https://ok.example/x)')).toContain('<a href="https://ok.example/x"');
});

// F32: the emphasis/inline-code passes ran over the whole inline string
// BEFORE LINK_RE extracted the href, so `*`/`` ` `` characters inside a
// URL rewrote into tag markup landing inside the href attribute, and an
// emphasis span opened inside an href could close outside the anchor.
test('F32: a `*` inside an href never becomes markup inside the href attribute', () => {
  const out = renderMarkdown('[x](https://evil.com/**pwn**)');
  expect(out).toContain('href="https://evil.com/**pwn**"');
  expect(out).not.toContain('<strong>pwn</strong>"');
});

test('F32: a backtick inside an href never becomes markup inside the href attribute', () => {
  const out = renderMarkdown('[x](https://ex.com/a`b`c)');
  expect(out).toContain('href="https://ex.com/a`b`c"');
  expect(out).not.toContain('<code>b</code>');
});

test('F32: an emphasis marker inside an href never leaks a span across the anchor boundary', () => {
  const out = renderMarkdown('see [x](https://ex.com/a*b) and 5*6 stars');
  expect(out).toBe('<p>see <a href="https://ex.com/a*b" rel="noreferrer noopener" target="_blank">x</a> and 5*6 stars</p>');
});

// F33: the fenced-block trailing-newline strip only matched a bare `\n`,
// leaving a stray `\r` inside <code> for a CRLF transcript.
test('F33: a CRLF-terminated fenced block leaves no stray carriage return', () => {
  expect(renderMarkdown('```\r\ncode\r\n```')).toBe('<pre><code>code</code></pre>');
});
