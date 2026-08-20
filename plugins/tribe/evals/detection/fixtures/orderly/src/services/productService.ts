// module: src/services/productService
import type { Clock } from '../clock';
import { errorCodes } from '../errorCodes';
import { mintId } from '../ids';
import type { ProductRepository } from '../repositories/productRepository';
import type { Product, Result } from '../types';

export function createProductService(deps: { productRepo: ProductRepository; clock: Clock }) {
  return {
    createProduct(input: { name: string; priceCents: number; internalCostCents: number }): Result<Product> {
      if (input.priceCents <= 0) return { ok: false, reason: errorCodes.INVALID_PRICE };
      const product: Product = {
        id: mintId('product'),
        name: input.name,
        priceCents: input.priceCents,
        internalCostCents: input.internalCostCents,
        createdAtUtc: deps.clock.nowUtc(),
      };
      deps.productRepo.save(product);
      return { ok: true, value: product };
    },
    getProduct(id: string): Result<Product> {
      const found = deps.productRepo.findById(id);
      if (found === null) return { ok: false, reason: errorCodes.PRODUCT_NOT_FOUND };
      return { ok: true, value: found };
    },
  };
}
