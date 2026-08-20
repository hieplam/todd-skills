// module: src/migrations/index.test
import { describe, expect, test } from 'bun:test';
import { createDb } from '../db';
import { migrations } from './index';

describe('migrations registry', () => {
  test('every registered migration runs up then down without error', () => {
    const db = createDb();
    for (const m of migrations) {
      expect(() => m.up(db)).not.toThrow();
      expect(() => m.down(db)).not.toThrow();
    }
  });

  test('registers exactly the three orders/customers/products migrations', () => {
    expect(migrations.map((m) => m.name)).toEqual(['001_create_orders', '002_create_customers', '003_create_products']);
  });
});
