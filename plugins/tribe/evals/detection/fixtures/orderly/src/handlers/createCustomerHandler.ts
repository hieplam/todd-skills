// module: src/handlers/createCustomerHandler
import type { createCustomerService } from '../services/customerService';

export function createCustomerHandler(customerService: ReturnType<typeof createCustomerService>) {
  return (name: string) => customerService.createCustomer(name);
}
