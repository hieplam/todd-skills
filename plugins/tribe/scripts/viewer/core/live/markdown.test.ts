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
