// module: src/mappers/orderMapper
import type { Order } from '../types';

export interface OrderDto {
  id: string;
  customerId: string;
  totalCents: number;
  createdAtUtc: string;
}

export function toDto(order: Order): OrderDto {
  return { id: order.id, customerId: order.customerId, totalCents: order.totalCents, createdAtUtc: order.createdAtUtc };
}

export function toSummaryDto(order: Order): Pick<OrderDto, 'id' | 'totalCents'> {
  return { id: order.id, totalCents: order.totalCents };
}
