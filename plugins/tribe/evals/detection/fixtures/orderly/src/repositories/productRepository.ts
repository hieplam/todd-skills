// module: src/repositories/productRepository
import type { Db } from '../db';
import type { Product } from '../types';

export function createProductRepository(db: Db) {
  return {
    // DEVIATION (C2): returns null instead of an Option<Product> shape.
    findById(id: string): Product | null {
      const product = db.products.get(id);
      return product === undefined ? null : { ...product };
    },
    getById(id: string): Product {
      const product = db.products.get(id);
      if (product === undefined) throw new Error(`product not found: ${id}`);
      return { ...product };
    },
    save(product: Product): void {
      db.products.set(product.id, { ...product });
    },
  };
}

export type ProductRepository = ReturnType<typeof createProductRepository>;
