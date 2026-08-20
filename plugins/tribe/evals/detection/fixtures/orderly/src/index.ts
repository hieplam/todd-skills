// module: src/index
import { systemClock } from './clock';
import { createDb } from './db';
import { createCustomerRepository } from './repositories/customerRepository';
import { createOrderRepository } from './repositories/orderRepository';
import { createProductRepository } from './repositories/productRepository';
import { createCustomerService } from './services/customerService';
import { createOrderService } from './services/orderService';
import { createProductService } from './services/productService';

export function buildApp() {
  const db = createDb();
  const orderRepo = createOrderRepository(db);
  const customerRepo = createCustomerRepository(db);
  const productRepo = createProductRepository(db);
  return {
    orderService: createOrderService({ orderRepo, clock: systemClock }),
    customerService: createCustomerService({ customerRepo }),
    productService: createProductService({ productRepo, clock: systemClock }),
  };
}
