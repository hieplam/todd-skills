// module: src/migrations/003_create_products
import type { Db } from '../db';

export function up003(db: Db): void {
  void db;
}

export function down003(db: Db): void {
  db.products.clear();
}
