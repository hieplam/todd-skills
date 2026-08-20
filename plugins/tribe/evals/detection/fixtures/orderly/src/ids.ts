// module: src/ids
export const idPrefixes = {
  order: 'ord_',
  customer: 'cus_',
  product: 'prd_',
} as const;

export type EntityKind = keyof typeof idPrefixes;

export function mintId(kind: EntityKind): string {
  return `${idPrefixes[kind]}${crypto.randomUUID()}`;
}

export function isValidId(kind: EntityKind, id: string): boolean {
  return id.startsWith(idPrefixes[kind]);
}
