// module: src/utils/legacyReceipt
// DEVIATION (C3): uses a local Date (not the injected Clock) and names the field `createdAt`
// instead of the repo-wide `*AtUtc` convention.
export function buildLegacyReceiptTimestamp(): { createdAt: string } {
  return { createdAt: new Date().toString() };
}
