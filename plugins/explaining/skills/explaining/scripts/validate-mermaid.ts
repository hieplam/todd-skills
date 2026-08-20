// Embedded mermaid validator for the `explaining` skill.
//
// Pure core (decodeHtmlEntities, extractMermaidSources, hintFor, classifyOutcome,
// EXIT_CODE) is exported for direct unit testing and has no side effects. The impure
// edge (loadParser, validateSources, the CLI in main()) constructs the jsdom shim,
// imports mermaid, reads files, and installs the dependency on demand.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Glob } from 'bun';

// ---------------------------------------------------------------------------
// Pure core
// ---------------------------------------------------------------------------

/** Decode the four HTML entities the extractor needs, `&amp;` LAST so a doubly
 * escaped entity like `&amp;lt;` becomes the literal text `&lt;` rather than a tag. */
export function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Pull mermaid source text out of every `div`/`pre` whose `class` attribute
 * contains the word `mermaid` (extra classes allowed), decoding entities and
 * dropping anything that trims to empty. */
export function extractMermaidSources(html: string): string[] {
  const pattern = /<(div|pre)\b[^>]*\bclass\s*=\s*"([^"]*)"[^>]*>([\s\S]*?)<\/\1>/gi;
  const sources: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const classes = match[2].split(/\s+/);
    if (!classes.includes('mermaid')) continue;
    const decoded = decodeHtmlEntities(match[3]).trim();
    if (decoded.length > 0) sources.push(decoded);
  }
  return sources;
}

const FALLBACK_HINT =
  'Use only mermaid safe syntax: write dotted link ends in full (-.-x, -.-o); wrap a ' +
  'label in double quotes when it contains ( ) [ ] { } | or ", or when it starts with ' +
  '/ or \\; write a literal double quote inside a quoted label as #quot;.';

/** Map a real mermaid error string to remediation advice. Falls back to naming the
 * safe-syntax rules wholesale when the error text does not match a known signature. */
export function hintFor(errorText: string): string {
  if (/got 'PS'/.test(errorText) || /got 'PIPE'/.test(errorText)) {
    return 'Wrap the label in double quotes — it contains a character ' +
      '( ) [ ] { } | or " that mermaid cannot parse unquoted.';
  }
  if (/Lexical error on line \d+\. Unrecognized text\./.test(errorText)) {
    return 'A label starting with / or \\ is unrecognized text — wrap the label in ' +
      'double quotes.';
  }
  if (/No diagram type detected/.test(errorText)) {
    return 'The diagram type on the first line is not a real mermaid diagram type — ' +
      'use a supported one (e.g. flowchart, sequenceDiagram, classDiagram).';
  }
  if (/Expecting 'LINK', 'UNICODE_TEXT', 'EDGE_TEXT'/.test(errorText)) {
    return 'Write the dotted link end in full — -.-x or -.-o, never an abbreviated form.';
  }
  return FALLBACK_HINT;
}

export const EXIT_CODE = { VALID: 0, INVALID: 1, COULD_NOT_VALIDATE: 2 } as const;

export type Outcome = 'VALID' | 'INVALID' | 'COULD_NOT_VALIDATE';

/** Decide the overall outcome. Parser availability is checked FIRST — an unavailable
 * parser is COULD_NOT_VALIDATE regardless of anything else. Otherwise, no artifacts,
 * no sources, or any error is INVALID (an absent deliverable is the agent's failure,
 * not the harness's); everything else is VALID. */
export function classifyOutcome(input: {
  artifacts: number;
  sources: number;
  parser: 'ready' | 'unavailable';
  errors: unknown[];
}): Outcome {
  if (input.parser === 'unavailable') return 'COULD_NOT_VALIDATE';
  if (input.artifacts === 0 || input.sources === 0 || input.errors.length > 0) return 'INVALID';
  return 'VALID';
}

// ---------------------------------------------------------------------------
// Impure edge
// ---------------------------------------------------------------------------

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

type MermaidModule = { parse: (text: string) => Promise<unknown> };
type ParserHandle = { mermaid: MermaidModule } | 'unavailable';

async function buildJsdomShimAndImportMermaid(): Promise<MermaidModule> {
  const { JSDOM } = await import('jsdom');
  const dom = new JSDOM('<!DOCTYPE html><body></body>', { pretendToBeVisual: true });
  const g = globalThis as Record<string, unknown>;
  g.window = dom.window;
  g.document = dom.window.document;
  g.navigator = dom.window.navigator;
  g.Element = dom.window.Element;
  g.SVGElement = dom.window.SVGElement;
  g.HTMLElement = dom.window.HTMLElement;
  g.Node = dom.window.Node;
  g.DOMParser = dom.window.DOMParser;
  g.NodeFilter = dom.window.NodeFilter;
  g.getComputedStyle = dom.window.getComputedStyle;

  const mermaidModule = (await import('mermaid')) as unknown as {
    default: MermaidModule & { initialize: (opts: unknown) => void };
  };
  const mermaid = mermaidModule.default;
  mermaid.initialize({ startOnLoad: false, securityLevel: 'loose' });
  return mermaid;
}

async function loadParserUncached(): Promise<ParserHandle> {
  try {
    return { mermaid: await buildJsdomShimAndImportMermaid() };
  } catch {
    // On-demand install, once, then retry.
    try {
      const proc = Bun.spawn(['bun', 'install', '--cwd', SCRIPT_DIR], {
        stdout: 'ignore',
        stderr: 'ignore',
      });
      const exitCode = await proc.exited;
      if (exitCode !== 0) return 'unavailable';
      return { mermaid: await buildJsdomShimAndImportMermaid() };
    } catch {
      return 'unavailable';
    }
  }
}

let cachedParser: Promise<ParserHandle> | null = null;

/** Build the jsdom shim and dynamic-import mermaid. On ANY failure — including a
 * failed on-demand `bun install` — resolves to 'unavailable' rather than throwing,
 * so a missing dependency or missing network never surfaces as a parse failure.
 * Memoized: the shim/import/install sequence runs at most once per process. */
export async function loadParser(): Promise<ParserHandle> {
  if (cachedParser === null) cachedParser = loadParserUncached();
  return cachedParser;
}

export type SourceError = { source: string; message: string; hint: string };

/** Validate each source against the real parser. Resolves `[]` when every source
 * parses (including when the parser itself is unavailable — callers that need to
 * distinguish "could not check" from "all clear" call loadParser() themselves and
 * feed its status into classifyOutcome). Otherwise returns the failures with a
 * remediation hint attached. */
export async function validateSources(sources: string[]): Promise<SourceError[]> {
  const parser = await loadParser();
  if (parser === 'unavailable') return [];
  const failures: SourceError[] = [];
  for (const source of sources) {
    try {
      await parser.mermaid.parse(source);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ source, message, hint: hintFor(message) });
    }
  }
  return failures;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv: string[]): { htmlGlob: string; file: string | null } {
  let htmlGlob = '*.html';
  let file: string | null = null;
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--html-glob') htmlGlob = argv[++i];
    else if (argv[i] === '--file') file = argv[++i];
  }
  return { htmlGlob, file };
}

async function collectSources(htmlGlob: string, file: string | null): Promise<{
  artifacts: number;
  sources: string[];
}> {
  if (file !== null) {
    const text = await readFile(resolve(file), 'utf8');
    const trimmed = text.trim();
    return { artifacts: 1, sources: trimmed.length > 0 ? [trimmed] : [] };
  }

  const glob = new Glob(htmlGlob);
  const matches: string[] = [];
  for await (const match of glob.scan({ cwd: process.cwd(), absolute: true })) {
    matches.push(match);
  }
  let sources: string[] = [];
  for (const path of matches) {
    if (!existsSync(path)) continue;
    const html = await readFile(path, 'utf8');
    sources = sources.concat(extractMermaidSources(html));
  }
  return { artifacts: matches.length, sources };
}

export async function main(argv: string[]): Promise<number> {
  const { htmlGlob, file } = parseArgs(argv);
  const { artifacts, sources } = await collectSources(htmlGlob, file);

  const parser = await loadParser();
  let errors: SourceError[] = [];
  if (parser !== 'unavailable' && sources.length > 0) {
    errors = await validateSources(sources);
  }

  const outcome = classifyOutcome({
    artifacts,
    sources: sources.length,
    parser: parser === 'unavailable' ? 'unavailable' : 'ready',
    errors,
  });

  console.log(`${outcome}: ${sources.length} diagram(s) found, ${errors.length} error(s)`);
  for (const failure of errors) {
    console.log(`  - ${failure.message}`);
    console.log(`    hint: ${failure.hint}`);
  }
  if (outcome === 'COULD_NOT_VALIDATE') {
    console.log('  (mermaid parser unavailable — ship the file anyway, unvalidated)');
  }

  return EXIT_CODE[outcome];
}

if (import.meta.main) {
  const exitCode = await main(process.argv.slice(2));
  process.exit(exitCode);
}
