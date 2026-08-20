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
