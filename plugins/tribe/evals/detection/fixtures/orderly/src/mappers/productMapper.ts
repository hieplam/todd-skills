// module: src/mappers/productMapper
import type { Product } from '../types';

export interface ProductDto {
  id: string;
  name: string;
  priceCents: number;
  internalCostCents: number;
}

// DEVIATION (C9): toDto leaks internalCostCents, an internal-only field every sibling mapper's
// toDto strips — same method name, diverged meaning.
export function toDto(product: Product): ProductDto {
  return { id: product.id, name: product.name, priceCents: product.priceCents, internalCostCents: product.internalCostCents };
}
