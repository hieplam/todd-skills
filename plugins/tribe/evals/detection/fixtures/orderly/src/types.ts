// module: src/types
export type Result<T> = { ok: true; value: T } | { ok: false; reason: string };

export interface Order {
  id: string;
  customerId: string;
  productId: string;
  quantity: number;
  totalCents: number;
  createdAtUtc: string;
}

export interface Customer {
  id: string;
  name: string;
  createdAtUtc: string;
}

export interface Product {
  id: string;
  name: string;
  priceCents: number;
  internalCostCents: number;
  createdAtUtc: string;
}
