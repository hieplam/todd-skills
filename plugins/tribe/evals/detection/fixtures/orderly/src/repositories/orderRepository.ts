// module: src/repositories/orderRepository
import type { Db } from '../db';
import type { Order } from '../types';

export type Option<T> = { some: true; value: T } | { some: false };

export function createOrderRepository(db: Db) {
  return {
    findById(id: string): Option<Order> {
      const order = db.orders.get(id);
      return order === undefined ? { some: false } : { some: true, value: { ...order } };
    },
    getById(id: string): Order {
      const order = db.orders.get(id);
      if (order === undefined) throw new Error(`order not found: ${id}`);
      return { ...order };
    },
    save(order: Order): void {
      db.orders.set(order.id, { ...order });
    },
  };
}
