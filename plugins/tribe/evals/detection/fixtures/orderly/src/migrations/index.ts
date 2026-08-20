// module: src/migrations/index
import { down001, up001 } from './001_create_orders';
import { down002, up002 } from './002_create_customers';
import { down003, up003 } from './003_create_products';
import type { Db } from '../db';

export interface Migration {
  name: string;
  up: (db: Db) => void;
  down: (db: Db) => void;
}

// DEVIATION (C8): 004_create_refunds.ts exists with a correctly paired up004/down004 but is
// missing from this registry.
export const migrations: Migration[] = [
  { name: '001_create_orders', up: up001, down: down001 },
  { name: '002_create_customers', up: up002, down: down002 },
  { name: '003_create_products', up: up003, down: down003 },
];
