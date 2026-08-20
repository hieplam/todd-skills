// module: src/db
import type { Customer, Order, Product } from './types';

export interface Db {
  orders: Map<string, Order>;
  customers: Map<string, Customer>;
  products: Map<string, Product>;
}

export function createDb(): Db {
  return { orders: new Map(), customers: new Map(), products: new Map() };
}
