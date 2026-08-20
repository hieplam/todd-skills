// module: src/repositories/customerRepository
import type { Db } from '../db';
import type { Customer } from '../types';
import type { Option } from './orderRepository';

export function createCustomerRepository(db: Db) {
  return {
    findById(id: string): Option<Customer> {
      const customer = db.customers.get(id);
      return customer === undefined ? { some: false } : { some: true, value: customer };
    },
    getById(id: string): Customer {
      const customer = db.customers.get(id);
      if (customer === undefined) throw new Error(`customer not found: ${id}`);
      return customer;
    },
    save(customer: Customer): void {
      db.customers.set(customer.id, customer);
    },
  };
}
