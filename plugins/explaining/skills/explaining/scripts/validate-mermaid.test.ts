import { describe, expect, spyOn, test } from 'bun:test';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  classifyOutcome,
  decodeHtmlEntities,
  EXIT_CODE,
  extractMermaidSources,
  hintFor,
  main,
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

  // F10: a legal single-quoted class attribute must be recognized, not silently dropped.
  test('accepts a single-quoted class attribute (F10)', () => {
    expect(extractMermaidSources("<div class='mermaid'>flowchart TD\n A-->B</div>"))
      .toEqual(['flowchart TD\n A-->B']);
  });

  // F11: a fake `class="..."` substring inside an unrelated attribute value must not
  // beat the real `class="mermaid"` attribute — extraction must be attribute-aware.
  test('the real class attribute wins over a fake class="..." inside another attribute (F11)', () => {
    const html = '<div class="mermaid" note=\'see class="other" here\'>flowchart TD\n A-->B</div>';
    expect(extractMermaidSources(html)).toEqual(['flowchart TD\n A-->B']);
  });

  // F13: a nested same-tag element inside the mermaid container must not truncate
  // extraction at the first inner closing tag. Guarantee: for well-formed HTML (every
  // opening tag has a matching closing tag), depth-tracked scanning finds the TRUE
  // matching closing tag of the container, so nothing after a nested inner element is
  // dropped.
  test('a nested same-tag element does not truncate extraction (F13)', () => {
    const html = '<div class="mermaid">flowchart TD\n A --> B\n <div>note</div>\n C --> D</div>';
    expect(extractMermaidSources(html))
      .toEqual(['flowchart TD\n A --> B\n <div>note</div>\n C --> D']);
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

  // F12: no artifact must be INVALID even when the parser is unavailable — an absent
  // deliverable is the agent's failure and must never be excused as UNGRADED.
  test('no artifact is INVALID even when the parser is unavailable (F12)', () => {
    expect(classifyOutcome({ artifacts: 0, sources: 0, parser: 'unavailable', errors: [] }))
      .toBe('INVALID');
  });

  // F12 guard: an artifact that DOES exist but cannot be checked must still be
  // COULD_NOT_VALIDATE — this must not regress while fixing the no-artifact case above.
  test('an existing artifact with an unavailable parser is still COULD_NOT_VALIDATE (F12 guard)', () => {
    expect(classifyOutcome({ artifacts: 1, sources: 1, parser: 'unavailable', errors: [] }))
      .toBe('COULD_NOT_VALIDATE');
  });
});

describe('main() CLI — clean verdicts on bad input (F14)', () => {
  test('a nonexistent --file folds into a clean INVALID verdict, not a crash', async () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    try {
      const exitCode = await main(['--file', '/tmp/validate-mermaid-does-not-exist-12345.html']);
      expect(exitCode).toBe(EXIT_CODE.INVALID);
    } finally {
      errorSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  test('--file with no following value errors out cleanly with a nonzero exit', async () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const exitCode = await main(['--file']);
      expect(exitCode).not.toBe(0);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });

  test('--html-glob with no following value errors out cleanly with a nonzero exit', async () => {
    const errorSpy = spyOn(console, 'error').mockImplementation(() => {});
    try {
      const exitCode = await main(['--html-glob']);
      expect(exitCode).not.toBe(0);
      expect(errorSpy).toHaveBeenCalled();
    } finally {
      errorSpy.mockRestore();
    }
  });
});

// F15: --html-glob is fed straight into Bun's Glob.scan(), which walks the filesystem
// relative to cwd — so an absolute-path pattern never matches and the CLI falsely
// reports "0 diagrams found" (INVALID) for a real, valid artifact.
describe('--html-glob finds artifacts regardless of pattern form (F15)', () => {
  const HTML = '<!DOCTYPE html><html><body><div class="mermaid">flowchart TD\n' +
    '  A --> B</div></body></html>';

  function withArtifact<T>(run: (dir: string) => Promise<T>): Promise<T> {
    const dir = mkdtempSync(join(tmpdir(), 'validate-mermaid-f15-'));
    mkdirSync(join(dir, 'sub'));
    writeFileSync(join(dir, 'out.html'), HTML);
    writeFileSync(join(dir, 'sub', 'out.html'), HTML);
    return run(dir).finally(() => rmSync(dir, { recursive: true, force: true }));
  }

  async function runMain(cwd: string, argv: string[]): Promise<number> {
    const logSpy = spyOn(console, 'log').mockImplementation(() => {});
    const originalCwd = process.cwd();
    process.chdir(cwd);
    try {
      return await main(argv);
    } finally {
      process.chdir(originalCwd);
      logSpy.mockRestore();
    }
  }

  test('form 1: an absolute path to a specific file', async () => {
    await withArtifact(async (dir) => {
      const exitCode = await runMain(dir, ['--html-glob', join(dir, 'out.html')]);
      expect(exitCode).toBe(EXIT_CODE.VALID);
    });
  });

  test('form 2: an absolute glob with a wildcard', async () => {
    await withArtifact(async (dir) => {
      const exitCode = await runMain(dir, ['--html-glob', join(dir, '*.html')]);
      expect(exitCode).toBe(EXIT_CODE.VALID);
    });
  });

  test('form 3: a relative path with a directory component', async () => {
    await withArtifact(async (dir) => {
      const exitCode = await runMain(dir, ['--html-glob', 'sub/out.html']);
      expect(exitCode).toBe(EXIT_CODE.VALID);
    });
  });

  test('form 4: a bare relative filename (must still work)', async () => {
    await withArtifact(async (dir) => {
      const exitCode = await runMain(dir, ['--html-glob', 'out.html']);
      expect(exitCode).toBe(EXIT_CODE.VALID);
    });
  });

  test('form 5: a relative wildcard, the eval harness usage (must still work)', async () => {
    await withArtifact(async (dir) => {
      const exitCode = await runMain(dir, ['--html-glob', '*.html']);
      expect(exitCode).toBe(EXIT_CODE.VALID);
    });
  });

  test('an absolute pattern that matches no file is still the no-artifact INVALID path', async () => {
    await withArtifact(async (dir) => {
      const exitCode = await runMain(dir, ['--html-glob', join(dir, 'nope-*.html')]);
      expect(exitCode).toBe(EXIT_CODE.INVALID);
    });
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
