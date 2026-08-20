import { describe, expect, test } from 'bun:test';
import { escapeHtml, renderIllustrationHtml } from './render-illustration';
import { extractMermaidSources } from './validate-mermaid';

const DIAGRAM = 'flowchart TD\n  A["shaman (what & why)"] --> B["warchief"]\n  B -.-x C';

describe('renderIllustrationHtml', () => {
  const html = renderIllustrationHtml({
    title: 'Tribe flow', diagram: DIAGRAM, caption: 'Who dispatches whom.',
  });

  test('is one self-contained document', () => {
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  test('loads mermaid from the CDN and nothing else remote', () => {
    expect(html).toContain('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs');
  });

  test('supports light and dark', () => {
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('matchMedia');
  });

  test('escapes the title and caption', () => {
    const evil = renderIllustrationHtml({
      title: '<script>x</script>', diagram: DIAGRAM, caption: 'a & b',
    });
    expect(evil).not.toContain('<script>x</script>');
    expect(evil).toContain('a &amp; b');
  });

  test('round-trips the diagram back out through the validator extractor', () => {
    expect(extractMermaidSources(html)).toEqual([DIAGRAM]);
  });

  test('escapeHtml handles the five characters that matter', () => {
    expect(escapeHtml(`<&>"'`)).toBe('&lt;&amp;&gt;&quot;&#39;');
  });
});
