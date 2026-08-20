// module: src/repositories/repositories.test
import { describe, expect, test } from 'bun:test';
import { createDb } from '../db';
import { createCustomerRepository } from './customerRepository';
import { createOrderRepository } from './orderRepository';
import { createProductRepository } from './productRepository';

describe('orderRepository', () => {
  test('findById returns an option shape, never null', () => {
    const repo = createOrderRepository(createDb());
    const result = repo.findById('missing');
    expect(result).toEqual({ some: false });
  });

  test('getById throws when absent', () => {
    const repo = createOrderRepository(createDb());
    expect(() => repo.getById('missing')).toThrow();
  });

  test('mutating the local object after save() does not affect what is read back', () => {
    const repo = createOrderRepository(createDb());
    const order = {
      id: 'o1',
      customerId: 'c1',
      productId: 'p1',
      quantity: 1,
      totalCents: 100,
      createdAtUtc: '2026-01-01T00:00:00.000Z',
    };
    repo.save(order);
    order.quantity = 999;
    expect(repo.getById('o1').quantity).toBe(1);
  });

  test('mutating an object returned by getById does not affect what is read back later', () => {
    const repo = createOrderRepository(createDb());
    const order = {
      id: 'o1',
      customerId: 'c1',
      productId: 'p1',
      quantity: 1,
      totalCents: 100,
      createdAtUtc: '2026-01-01T00:00:00.000Z',
    };
    repo.save(order);
    const fetched = repo.getById('o1');
    fetched.quantity = 999;
    expect(repo.getById('o1').quantity).toBe(1);
  });
});

describe('customerRepository', () => {
  test('findById returns an option shape, never null', () => {
    const repo = createCustomerRepository(createDb());
    expect(repo.findById('missing')).toEqual({ some: false });
  });
});

describe('productRepository (seeded deviation site)', () => {
  test('findById returns null when absent (the seeded C2 deviation)', () => {
    const repo = createProductRepository(createDb());
    expect(repo.findById('missing')).toBeNull();
  });

  test('getById still asserts (throws) when absent', () => {
    const repo = createProductRepository(createDb());
    expect(() => repo.getById('missing')).toThrow();
  });
});
