// module: src/migrations/001_create_orders
import type { Db } from '../db';

export function up001(db: Db): void {
  void db;
}

export function down001(db: Db): void {
  db.orders.clear();
}
