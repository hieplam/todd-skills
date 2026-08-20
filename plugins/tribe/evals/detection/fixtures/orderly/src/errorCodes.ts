// module: src/errorCodes
export const errorCodes = {
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  CUSTOMER_NOT_FOUND: 'CUSTOMER_NOT_FOUND',
  PRODUCT_NOT_FOUND: 'PRODUCT_NOT_FOUND',
  INVALID_PRICE: 'INVALID_PRICE',
  DUPLICATE_ORDER: 'DUPLICATE_ORDER',
  VALIDATION_FAILED: 'VALIDATION_FAILED',
} as const;

export type ErrorCode = (typeof errorCodes)[keyof typeof errorCodes];
