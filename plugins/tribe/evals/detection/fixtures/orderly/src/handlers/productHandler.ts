// module: src/handlers/productHandler
import type { Db } from '../db';

export function productHandler(db: Db) {
  return (id: string) => {
    // DEVIATION (C7): reaches into db directly instead of going through productRepository.
    const product = db.products.get(id);
    return product ? { found: true as const, product } : { found: false as const };
  };
}
