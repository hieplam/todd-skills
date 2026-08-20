// module: src/services/services.test
import { describe, expect, test } from 'bun:test';
import { systemClock } from '../clock';
import { createDb } from '../db';
import { createCustomerRepository } from '../repositories/customerRepository';
import { createOrderRepository } from '../repositories/orderRepository';
import { createProductRepository } from '../repositories/productRepository';
import { createCustomerService } from './customerService';
import { createNotificationService } from './notificationService';
import { createOrderService } from './orderService';
import { applyLoyaltyMarkup } from './pricingService';
import { createProductService } from './productService';

describe('orderService', () => {
  test('createOrder returns a Result, never throws, on the happy path', () => {
    const db = createDb();
    const service = createOrderService({ orderRepo: createOrderRepository(db), clock: systemClock });
    const result = service.createOrder({ customerId: 'cus_1', productId: 'prd_1', quantity: 2, unitPriceCents: 500 });
    expect(result.ok).toBe(true);
  });

  test('the ad-hoc-string deviation path still returns ok:false (a smell, not a bug)', () => {
    const db = createDb();
    const service = createOrderService({ orderRepo: createOrderRepository(db), clock: systemClock });
    const result = service.createOrder({ customerId: 'cus_1', productId: 'prd_1', quantity: 0, unitPriceCents: 500 });
    expect(result).toEqual({ ok: false, reason: 'order total must be positive' });
  });

  test('createOrder rejects a NaN quantity instead of silently persisting it', () => {
    const db = createDb();
    const service = createOrderService({ orderRepo: createOrderRepository(db), clock: systemClock });
    const result = service.createOrder({ customerId: 'cus_1', productId: 'prd_1', quantity: NaN, unitPriceCents: 500 });
    expect(result.ok).toBe(false);
  });
});

describe('customerService', () => {
  test('createCustomer returns a Result and a createdAtUtc field', () => {
    const db = createDb();
    const service = createCustomerService({ customerRepo: createCustomerRepository(db) });
    const result = service.createCustomer('Ada');
    expect(result.ok).toBe(true);
    if (result.ok) expect(typeof result.value.createdAtUtc).toBe('string');
  });
});

describe('productService (clean)', () => {
  test('createProduct returns a Result using the injected clock', () => {
    const db = createDb();
    const service = createProductService({ productRepo: createProductRepository(db), clock: systemClock });
    const result = service.createProduct({ name: 'Widget', priceCents: 999, internalCostCents: 400 });
    expect(result.ok).toBe(true);
  });

  test('createProduct rejects a NaN priceCents instead of silently persisting it', () => {
    const db = createDb();
    const service = createProductService({ productRepo: createProductRepository(db), clock: systemClock });
    const result = service.createProduct({ name: 'Widget', priceCents: NaN, internalCostCents: 400 });
    expect(result.ok).toBe(false);
  });
});

describe('pricingService (seeded deviation site)', () => {
  test('applyLoyaltyMarkup still returns a plausible integer cents value', () => {
    expect(applyLoyaltyMarkup(1000)).toBe(1100);
  });
});

describe('notificationService (seeded deviation site)', () => {
  test('sendOrderConfirmation throws when the order has no customer', () => {
    const service = createNotificationService({ clock: systemClock });
    expect(() => service.sendOrderConfirmation({ id: 'ord_1', customerId: '', productId: 'p', quantity: 1, totalCents: 0, createdAtUtc: '' })).toThrow();
  });

  test('sendOrderConfirmation succeeds on the happy path', () => {
    const service = createNotificationService({ clock: systemClock });
    const result = service.sendOrderConfirmation({ id: 'ord_1', customerId: 'cus_1', productId: 'p', quantity: 1, totalCents: 0, createdAtUtc: '' });
    expect(typeof result.sentAtUtc).toBe('string');
  });
});
