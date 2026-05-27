import type { BeadBrandKey } from './brand';

export const ALL_PALETTE_GROUP = 'all';

export type PaletteGroupType = 'all' | 'letter' | 'number';

export type PaletteGroup = {
  key: string;
  label: string;
  type: PaletteGroupType;
  sortValue: number;
};

function getNumberPaletteGroup(code: string): PaletteGroup | null {
  const numberMatch = code.match(/\d+/);
  if (!numberMatch) return null;

  const value = Number(numberMatch[0]);
  if (!Number.isFinite(value)) return null;

  const start = Math.floor(value / 10) * 10;
  const label = start === 0 ? '0-9' : `${start}-${start + 9}`;

  return {
    key: `number:${start}`,
    label,
    type: 'number',
    sortValue: start,
  };
}

export function getPaletteGroupForCode(brandKey: BeadBrandKey, vendorCode: string): PaletteGroup {
  const code = vendorCode.trim().toUpperCase();
  const letterMatch = code.match(/^[A-Z]+/);

  if (brandKey !== 'PANPAN' && letterMatch) {
    const label = letterMatch[0];
    return {
      key: `letter:${label}`,
      label,
      type: 'letter',
      sortValue: label.charCodeAt(0),
    };
  }

  return getNumberPaletteGroup(code) ?? {
    key: `letter:${code || '?'}`,
    label: code || '?',
    type: 'letter',
    sortValue: Number.MAX_SAFE_INTEGER,
  };
}

export function buildPaletteGroups<T>(
  brandKey: BeadBrandKey,
  palette: T[],
  getVendorCode: (color: T) => string,
) {
  const groupMap = new Map<string, PaletteGroup>();

  for (const color of palette) {
    const group = getPaletteGroupForCode(brandKey, getVendorCode(color));
    if (!groupMap.has(group.key)) groupMap.set(group.key, group);
  }

  const groups = Array.from(groupMap.values()).sort((a, b) => {
    if (a.type !== b.type) {
      if (a.type === 'letter') return -1;
      if (b.type === 'letter') return 1;
    }

    if (a.sortValue !== b.sortValue) return a.sortValue - b.sortValue;
    return a.label.localeCompare(b.label);
  });

  return [
    {
      key: ALL_PALETTE_GROUP,
      label: '全部',
      type: 'all',
      sortValue: -1,
    },
    ...groups,
  ] satisfies PaletteGroup[];
}
