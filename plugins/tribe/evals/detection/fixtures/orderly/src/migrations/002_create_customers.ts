// module: src/migrations/002_create_customers
import type { Db } from '../db';

export function up002(db: Db): void {
  void db;
}

export function down002(db: Db): void {
  db.customers.clear();
}
