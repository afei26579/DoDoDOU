export const beadBrandKeys = ['MARD', 'COCO', 'MANMAN', 'PANPAN', 'MIXIAOWO'] as const;

export type BeadBrandKey = (typeof beadBrandKeys)[number];

export const beadBrandLabels: Record<BeadBrandKey, string> = {
  MARD: 'MARD',
  COCO: 'COCO',
  MANMAN: '漫漫',
  PANPAN: '盼盼',
  MIXIAOWO: '咪小窝',
};

const legacyBrandKeyMap: Record<string, BeadBrandKey> = {
  MARD: 'MARD',
  COCO: 'COCO',
  MANMAN: 'MANMAN',
  PANPAN: 'PANPAN',
  MIXIAOWO: 'MIXIAOWO',
  '漫漫': 'MANMAN',
  '盼盼': 'PANPAN',
  '咪小窝': 'MIXIAOWO',
  '婕极': 'MANMAN',
  '鐩肩浖': 'PANPAN',
  '鍜皬绐?': 'MIXIAOWO',
};

export function isBeadBrandKey(value: unknown): value is BeadBrandKey {
  return typeof value === 'string' && beadBrandKeys.includes(value as BeadBrandKey);
}

export function normalizeBeadBrandKey(value: unknown, fallback: BeadBrandKey = 'MARD'): BeadBrandKey {
  if (typeof value !== 'string') return fallback;
  return legacyBrandKeyMap[value] ?? fallback;
}

export function getBeadBrandLabel(brandKey: BeadBrandKey) {
  return beadBrandLabels[brandKey];
}
