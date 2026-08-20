// module: src/mappers/mappers.test
import { describe, expect, test } from 'bun:test';
import { toDto as customerToDto } from './customerMapper';
import { toDto as orderToDto, toSummaryDto } from './orderMapper';
import { toDto as productToDto } from './productMapper';

const ORDER = { id: 'ord_1', customerId: 'cus_1', productId: 'prd_1', quantity: 1, totalCents: 100, createdAtUtc: 'x' };
const CUSTOMER = { id: 'cus_1', name: 'Ada', createdAtUtc: 'x' };
const PRODUCT = { id: 'prd_1', name: 'Widget', priceCents: 100, internalCostCents: 40, createdAtUtc: 'x' };

describe('orderMapper / customerMapper (clean)', () => {
  test('toDto and toSummaryDto both strip to the public shape', () => {
    expect(orderToDto(ORDER)).not.toHaveProperty('productId');
    expect(toSummaryDto(ORDER)).toEqual({ id: 'ord_1', totalCents: 100 });
    expect(customerToDto(CUSTOMER)).not.toHaveProperty('createdAtUtc');
  });
});

describe('productMapper (seeded deviation site)', () => {
  test('toDto leaks internalCostCents (the seeded C9 deviation)', () => {
    expect(productToDto(PRODUCT)).toHaveProperty('internalCostCents', 40);
  });
});
