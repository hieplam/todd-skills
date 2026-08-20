// module: src/foundation.test
import { describe, expect, test } from 'bun:test';
import { systemClock } from './clock';
import { createDb } from './db';
import { errorCodes } from './errorCodes';
import { idPrefixes, isValidId, mintId } from './ids';

describe('systemClock', () => {
  test('nowUtc returns an ISO 8601 string', () => {
    expect(systemClock.nowUtc()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('ids', () => {
  test('mintId prefixes by entity kind', () => {
    expect(mintId('order').startsWith(idPrefixes.order)).toBe(true);
    expect(mintId('customer').startsWith(idPrefixes.customer)).toBe(true);
  });

  test('isValidId checks the prefix', () => {
    expect(isValidId('order', 'ord_abc')).toBe(true);
    expect(isValidId('order', 'cus_abc')).toBe(false);
  });
});

describe('errorCodes', () => {
  test('is a closed set of string constants', () => {
    expect(errorCodes.ORDER_NOT_FOUND).toBe('ORDER_NOT_FOUND');
  });
});

describe('createDb', () => {
  test('returns fresh empty maps each call', () => {
    const a = createDb();
    const b = createDb();
    a.orders.set('x', {} as never);
    expect(b.orders.size).toBe(0);
  });
});
