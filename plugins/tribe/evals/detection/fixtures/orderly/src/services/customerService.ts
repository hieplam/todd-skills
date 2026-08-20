// module: src/services/customerService
import { errorCodes } from '../errorCodes';
import type { CustomerRepository } from '../repositories/customerRepository';
import type { Customer, Result } from '../types';

export function createCustomerService(deps: { customerRepo: CustomerRepository }) {
  return {
    createCustomer(name: string): Result<Customer> {
      if (!name) return { ok: false, reason: errorCodes.VALIDATION_FAILED };
      const customer: Customer = {
        // DEVIATION (C5): mints a bare id with no type prefix instead of mintId('customer').
        id: crypto.randomUUID(),
        name,
        // DEVIATION (C4): calls Date.now() directly instead of taking an injected Clock.
        createdAtUtc: new Date(Date.now()).toISOString(),
      };
      deps.customerRepo.save(customer);
      return { ok: true, value: customer };
    },
    getCustomer(id: string): Result<Customer> {
      const found = deps.customerRepo.findById(id);
      if (!found.some) return { ok: false, reason: errorCodes.CUSTOMER_NOT_FOUND };
      return { ok: true, value: found.value };
    },
  };
}
