// module: src/services/orderService
import type { Clock } from '../clock';
import { errorCodes } from '../errorCodes';
import { mintId } from '../ids';
import type { OrderRepository } from '../repositories/orderRepository';
import type { Result, Order } from '../types';

export interface CreateOrderInput {
  customerId: string;
  productId: string;
  quantity: number;
  unitPriceCents: number;
}

export function createOrderService(deps: { orderRepo: OrderRepository; clock: Clock }) {
  return {
    createOrder(input: CreateOrderInput): Result<Order> {
      if (!Number.isFinite(input.quantity) || input.quantity <= 0) {
        // DEVIATION (C6): ad-hoc string reason instead of an errorCodes member.
        return { ok: false, reason: 'order total must be positive' };
      }
      if (!input.customerId) {
        return { ok: false, reason: errorCodes.VALIDATION_FAILED };
      }
      const order: Order = {
        id: mintId('order'),
        customerId: input.customerId,
        productId: input.productId,
        quantity: input.quantity,
        totalCents: input.unitPriceCents * input.quantity,
        createdAtUtc: deps.clock.nowUtc(),
      };
      deps.orderRepo.save(order);
      return { ok: true, value: order };
    },
    cancelOrder(id: string): Result<void> {
      const found = deps.orderRepo.findById(id);
      if (!found.some) return { ok: false, reason: errorCodes.ORDER_NOT_FOUND };
      return { ok: true, value: undefined };
    },
  };
}
