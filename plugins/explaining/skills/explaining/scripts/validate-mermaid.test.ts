import { describe, expect, test } from 'bun:test';
import {
  classifyOutcome,
  decodeHtmlEntities,
  EXIT_CODE,
  extractMermaidSources,
  hintFor,
  validateSources,
} from './validate-mermaid';

describe('extractMermaidSources', () => {
  test('pulls the diagram out of a div.mermaid and decodes entities', () => {
    const html = '<html><body><div class="mermaid">flowchart TD\n  A[&quot;a &amp; b&quot;] --&gt; B</div></body></html>';
    expect(extractMermaidSources(html)).toEqual(['flowchart TD\n  A["a & b"] --> B']);
  });

  test('accepts pre.mermaid and extra classes', () => {
    expect(extractMermaidSources('<pre class="diagram mermaid">graph LR\n A-->B</pre>'))
      .toEqual(['graph LR\n A-->B']);
  });

  test('returns nothing when the page carries no mermaid container', () => {
    expect(extractMermaidSources('<html><body><p>just prose</p></body></html>')).toEqual([]);
  });

  test('decodes &amp; last so &amp;lt; does not become a tag', () => {
    expect(decodeHtmlEntities('&amp;lt;')).toBe('&lt;');
  });
});

describe('hintFor', () => {
  test('maps an unquoted paren label to the quoting rule', () => {
    expect(hintFor("Parse error on line 2:\nExpecting 'SQE', got 'PS'")).toMatch(/wrap .* in double quotes/i);
  });

  test('maps a pipe in a label to the quoting rule', () => {
    expect(hintFor("Expecting 'SQE', got 'PIPE'")).toMatch(/wrap .* in double quotes/i);
  });

  test('maps an unrecognized leading slash to the quoting rule', () => {
    expect(hintFor('Lexical error on line 2. Unrecognized text.')).toMatch(/double quotes/i);
  });

  test('maps an invented diagram type to the diagram-type rule', () => {
    expect(hintFor('No diagram type detected matching given configuration for text: sparklegraph LR'))
      .toMatch(/diagram type/i);
  });

  test('maps an abbreviated dotted link to the full-form rule', () => {
    expect(hintFor("Expecting 'LINK', 'UNICODE_TEXT', 'EDGE_TEXT', got '1'")).toMatch(/-\.-x/);
  });

  test('always returns actionable advice, even for an unknown error', () => {
    expect(hintFor('something nobody has seen before').length).toBeGreaterThan(20);
  });
});

describe('classifyOutcome and its exit codes', () => {
  test('no artifact found is INVALID, not COULD_NOT_VALIDATE', () => {
    expect(classifyOutcome({ artifacts: 0, sources: 0, parser: 'ready', errors: [] }))
      .toBe('INVALID');
  });

  test('artifact without a mermaid container is INVALID', () => {
    expect(classifyOutcome({ artifacts: 1, sources: 0, parser: 'ready', errors: [] }))
      .toBe('INVALID');
  });

  test('an unavailable parser is COULD_NOT_VALIDATE, never INVALID', () => {
    expect(classifyOutcome({ artifacts: 1, sources: 1, parser: 'unavailable', errors: [] }))
      .toBe('COULD_NOT_VALIDATE');
  });

  test('a parse error is INVALID', () => {
    expect(classifyOutcome({ artifacts: 1, sources: 1, parser: 'ready', errors: ['boom'] }))
      .toBe('INVALID');
  });

  test('everything parsed is VALID', () => {
    expect(classifyOutcome({ artifacts: 1, sources: 1, parser: 'ready', errors: [] }))
      .toBe('VALID');
  });

  test('exit codes are 0 valid, 1 invalid, 2 could-not-validate', () => {
    expect(EXIT_CODE).toEqual({ VALID: 0, INVALID: 1, COULD_NOT_VALIDATE: 2 });
  });
});

describe('validateSources against the real parser', () => {
  test('the safe-syntax forms the skill mandates all parse', async () => {
    const errors = await validateSources([
      'flowchart TD\n  A["do (this)"] --> B[end]',
      'flowchart TD\n  A -.-x B\n  A -.-o C',
      'flowchart TD\n  A["say #quot;hi#quot;"] --> B',
      'sequenceDiagram\n  participant A\n  participant B\n  loop every minute\n    A--xB: ping\n  end',
    ]);
    expect(errors).toEqual([]);
  });

  test('the unsafe counterparts are rejected by a real parse', async () => {
    const errors = await validateSources([
      'flowchart TD\n  A[do (this)] --> B[end]',
      'sparklegraph LR\n  A --> B',
    ]);
    expect(errors.length).toBe(2);
  });
});
