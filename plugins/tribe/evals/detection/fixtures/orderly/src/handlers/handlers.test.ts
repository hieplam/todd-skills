// module: src/handlers/handlers.test
import { describe, expect, test } from 'bun:test';
import { systemClock } from '../clock';
import { createDb } from '../db';
import { createCustomerRepository } from '../repositories/customerRepository';
import { createOrderRepository } from '../repositories/orderRepository';
import { createCustomerService } from '../services/customerService';
import { createOrderService } from '../services/orderService';
import { createCustomerHandler } from './createCustomerHandler';
import { createOrderHandler } from './createOrderHandler';
import { getOrderHandler } from './getOrderHandler';
import { productHandler } from './productHandler';

describe('createOrderHandler / getOrderHandler (clean)', () => {
  test('a created order can be fetched back with a receipt block', () => {
    const db = createDb();
    const orderRepo = createOrderRepository(db);
    const orderService = createOrderService({ orderRepo, clock: systemClock });
    const create = createOrderHandler(orderService);
    const created = create({ customerId: 'cus_1', productId: 'prd_1', quantity: 1, unitPriceCents: 100 });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const get = getOrderHandler(orderRepo);
    const fetched = get(created.value.id);
    expect(fetched.found).toBe(true);
  });
});

describe('createCustomerHandler (clean)', () => {
  test('creates a customer via the service', () => {
    const db = createDb();
    const handler = createCustomerHandler(createCustomerService({ customerRepo: createCustomerRepository(db) }));
    expect(handler('Ada').ok).toBe(true);
  });
});

describe('productHandler (seeded deviation site)', () => {
  test('still returns a correct result despite bypassing the repository', () => {
    const db = createDb();
    db.products.set('prd_1', { id: 'prd_1', name: 'Widget', priceCents: 100, internalCostCents: 40, createdAtUtc: '' });
    const handler = productHandler(db);
    expect(handler('prd_1')).toEqual({ found: true, product: db.products.get('prd_1')! });
  });
});
