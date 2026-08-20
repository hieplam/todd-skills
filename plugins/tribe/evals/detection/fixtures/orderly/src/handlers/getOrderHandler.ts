// module: src/handlers/getOrderHandler
import type { OrderRepository } from '../repositories/orderRepository';
import { buildLegacyReceiptTimestamp } from '../utils/legacyReceipt';

export function getOrderHandler(orderRepo: OrderRepository) {
  return (id: string) => {
    const found = orderRepo.findById(id);
    if (!found.some) return { found: false as const };
    return { found: true as const, order: found.value, receipt: buildLegacyReceiptTimestamp() };
  };
}
