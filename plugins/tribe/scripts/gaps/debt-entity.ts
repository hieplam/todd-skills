// debt-entity.ts — parses a `debt` canvas instance's markdown body into a `DebtEntity` (Task 1,
// spec §1 "The `debt` entity"). Pure module: no `fs`, no `child_process`, no network I/O — the
// caller reads the markdown text (from disk or a git tree) and hands it here; IO lives at the
// caller's edge (`debt-tree.ts`, `gap-rule.ts`), never in this file.

/** Spec §1: a debt entity — an existing violation of a paired anti-rule, counted by a
 * mechanical `check`, tracked back to its origin gap, burning down to zero. */
export interface DebtEntity {
  id: string;
  slug: string;
  check: string;
  antiRule: string;
  originGap: string;
  baseline: number;
  status: 'open' | 'closed';
  path: string;
}

/** Thrown when the markdown has no `## Meter` heading at all. */
export class MissingMeterSectionError extends Error {
  constructor(path: string) {
    super(`debt entity ${path}: missing "## Meter" section`);
    this.name = 'MissingMeterSectionError';
  }
}

/** Thrown when a `## Meter` section exists but carries no data row (only a header row, or a
 * header + separator row, with nothing after). */
export class MissingMeterRowError extends Error {
  constructor(path: string) {
    super(`debt entity ${path}: "## Meter" section has no table data row`);
    this.name = 'MissingMeterRowError';
  }
}

/** Thrown when the Meter row's `Baseline` cell is not a number. */
export class InvalidBaselineError extends Error {
  constructor(path: string, raw: string) {
    super(`debt entity ${path}: non-numeric Baseline "${raw}"`);
    this.name = 'InvalidBaselineError';
  }
}

const DEBT_ID_PREFIX = 'debt-';

/** Parses the frontmatter block (`---\n...\n---`) into its `id`/`status` fields — the only
 * frontmatter keys this entity type reads (spec §1). */
function parseFrontmatter(markdown: string, path: string): { id: string; status?: string } {
  const match = /^---\n([\s\S]*?)\n---/.exec(markdown);
  if (!match) {
    throw new Error(`debt entity ${path}: missing frontmatter`);
  }
  const fields: Record<string, string> = {};
  for (const line of match[1]!.split('\n')) {
    const kv = /^(\w+):\s*(.*)$/.exec(line.trim());
    if (kv) {
      fields[kv[1]!] = kv[2]!.trim();
    }
  }
  if (!fields.id) {
    throw new Error(`debt entity ${path}: frontmatter missing "id"`);
  }
  return { id: fields.id, status: fields.status };
}

/** Extracts the body of a `## <name>` section — everything after the heading up to (but not
 * including) the next `## ` heading, or end of document. Returns `undefined` if the heading is
 * absent. */
function extractSection(markdown: string, name: string): string | undefined {
  const headingRegex = new RegExp(`^##\\s+${name}\\s*$`, 'm');
  const heading = headingRegex.exec(markdown);
  if (!heading) return undefined;
  const rest = markdown.slice(heading.index + heading[0].length);
  const nextHeading = /^##\s+/m.exec(rest);
  return nextHeading ? rest.slice(0, nextHeading.index) : rest;
}

/** A markdown table separator row (e.g. `| --- | --- | --- | --- |`) — cells containing only
 * dashes/colons, never real data. */
function isSeparatorRow(line: string): boolean {
  return /^\|[\s:|-]+\|$/.test(line);
}

/** Splits one `| a | b | c |` table row into trimmed cells. */
function splitTableRow(line: string): string[] {
  return line
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((cell) => cell.trim());
}

/** Finds the Meter table's first data row (skipping the header row and any separator row) and
 * returns its cells: `[Check, Anti Rule, Origin Gap, Baseline]` (spec §1's column order).
 * Returns `undefined` if no data row is present. */
function extractMeterDataRow(section: string): string[] | undefined {
  const tableLines = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'));
  if (tableLines.length === 0) return undefined;

  const dataLines = tableLines.slice(1).filter((line) => !isSeparatorRow(line));
  if (dataLines.length === 0) return undefined;

  return splitTableRow(dataLines[0]!);
}

/** Parses a debt canvas instance's markdown into a `DebtEntity` (plan Task 1 / spec §1).
 * `path` is carried through unchanged for reporting/lookup by the caller. */
export function parseDebtEntity(markdown: string, path: string): DebtEntity {
  const { id, status } = parseFrontmatter(markdown, path);
  const slug = id.startsWith(DEBT_ID_PREFIX) ? id.slice(DEBT_ID_PREFIX.length) : id;

  const meterSection = extractSection(markdown, 'Meter');
  if (meterSection === undefined) {
    throw new MissingMeterSectionError(path);
  }

  const row = extractMeterDataRow(meterSection);
  if (!row) {
    throw new MissingMeterRowError(path);
  }

  const [check, antiRule, originGap, baselineRaw] = row;
  const baseline = Number(baselineRaw);
  if (!Number.isFinite(baseline)) {
    throw new InvalidBaselineError(path, baselineRaw ?? '');
  }

  return {
    id,
    slug,
    check: check!,
    antiRule: antiRule!,
    originGap: originGap!,
    baseline,
    status: status === 'closed' ? 'closed' : 'open',
    path,
  };
}
