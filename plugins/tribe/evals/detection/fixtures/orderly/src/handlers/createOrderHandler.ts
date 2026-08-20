// module: src/handlers/createOrderHandler
import type { CreateOrderInput, createOrderService } from '../services/orderService';

export function createOrderHandler(orderService: ReturnType<typeof createOrderService>) {
  return (input: CreateOrderInput) => orderService.createOrder(input);
}
