// module: src/mappers/customerMapper
import type { Customer } from '../types';

export interface CustomerDto {
  id: string;
  name: string;
}

export function toDto(customer: Customer): CustomerDto {
  return { id: customer.id, name: customer.name };
}
