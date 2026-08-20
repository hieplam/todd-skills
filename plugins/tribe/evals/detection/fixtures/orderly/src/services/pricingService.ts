// module: src/services/pricingService
export function applyLoyaltyMarkup(priceCents: number): number {
  // DEVIATION (C10): converts to float dollars and multiplies by a float factor instead of
  // staying in integer cents throughout.
  const priceDollars = priceCents / 100;
  const markedUpDollars = priceDollars * 1.1;
  return Math.round(markedUpDollars * 100);
}
