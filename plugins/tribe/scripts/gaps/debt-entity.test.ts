// debt-entity.test.ts — the plan Task 1 debt-entity parser scenarios (a-d), against a fixture
// string copied verbatim from the probed instance shape (spec §1 / plan Global Constraints).
import { describe, expect, test } from 'bun:test';
import {
  parseDebtEntity,
  InvalidBaselineError,
  MissingMeterRowError,
  MissingMeterSectionError,
  type DebtEntity,
} from './debt-entity.ts';

const FIXTURE_PATH = '.c3/documents/debt/debt-bare-catch-handlers.md';

// Probed instance shape (plan Global Constraints): no `status:` in frontmatter, Meter table
// with header + separator + one data row.
const HAPPY_PATH_FIXTURE = `---
id: debt-bare-catch-handlers
---

## Meter

| Check | Anti Rule | Origin Gap | Baseline |
| --- | --- | --- | --- |
| grep -rn 'catch {}' src/handlers/ | rule-no-bare-catch | G-007 | 9 |

## Description

Tracker found bare catch handlers swallowing errors in the handlers directory.
`;

describe('parseDebtEntity — happy path (plan Task 1 step b)', () => {
  test('parses frontmatter id + Meter row into a DebtEntity, absent status defaults to open', () => {
    const entity = parseDebtEntity(HAPPY_PATH_FIXTURE, FIXTURE_PATH);

    const expected: DebtEntity = {
      id: 'debt-bare-catch-handlers',
      slug: 'bare-catch-handlers',
      check: "grep -rn 'catch {}' src/handlers/",
      antiRule: 'rule-no-bare-catch',
      originGap: 'G-007',
      baseline: 9,
      status: 'open',
      path: FIXTURE_PATH,
    };
    expect(entity).toEqual(expected);
  });
});

describe('parseDebtEntity — status (plan Task 1 step c)', () => {
  test('status: closed in frontmatter parses as closed', () => {
    const fixture = HAPPY_PATH_FIXTURE.replace(
      'id: debt-bare-catch-handlers\n',
      'id: debt-bare-catch-handlers\nstatus: closed\n',
    );

    const entity = parseDebtEntity(fixture, FIXTURE_PATH);

    expect(entity.status).toBe('closed');
  });
});

describe('parseDebtEntity — refusals (plan Task 1 step d)', () => {
  test('missing "## Meter" section throws a named error', () => {
    const fixture = `---
id: debt-bare-catch-handlers
---

## Description

No Meter section at all.
`;
    expect(() => parseDebtEntity(fixture, FIXTURE_PATH)).toThrow(MissingMeterSectionError);
  });

  test('Meter section without a data row throws a named error', () => {
    const fixture = `---
id: debt-bare-catch-handlers
---

## Meter

| Check | Anti Rule | Origin Gap | Baseline |
| --- | --- | --- | --- |

## Description

Header and separator only, no data row.
`;
    expect(() => parseDebtEntity(fixture, FIXTURE_PATH)).toThrow(MissingMeterRowError);
  });

  test('non-numeric Baseline throws a named error', () => {
    const fixture = HAPPY_PATH_FIXTURE.replace(
      "| grep -rn 'catch {}' src/handlers/ | rule-no-bare-catch | G-007 | 9 |",
      "| grep -rn 'catch {}' src/handlers/ | rule-no-bare-catch | G-007 | nine |",
    );
    expect(() => parseDebtEntity(fixture, FIXTURE_PATH)).toThrow(InvalidBaselineError);
  });
});
