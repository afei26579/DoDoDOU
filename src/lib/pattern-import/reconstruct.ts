import type { PatternCell, PatternPaletteEntry, PatternResult } from '../../features/workshop/model/types';

export const TRANSPARENT_COLOR_ID = '__TRANSPARENT__';

export function normalizeImportHex(value: string) {
  const trimmed = value.trim();
  if (trimmed.toLowerCase() === 'transparent') return 'transparent';

  const raw = trimmed.startsWith('#') ? trimmed.slice(1) : trimmed;
  if (/^[0-9a-fA-F]{3}$/.test(raw)) {
    return `#${raw.split('').map((char) => `${char}${char}`).join('')}`.toUpperCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(raw)) return `#${raw.toUpperCase()}`;

  return trimmed;
}

export function isTransparentPatternCell(cell: Pick<PatternCell, 'hex' | 'isExternal'>) {
  return cell.isExternal || !cell.hex || cell.hex === 'transparent';
}

export function createTransparentPatternCell(x: number, y: number): PatternCell {
  return {
    x,
    y,
    colorId: TRANSPARENT_COLOR_ID,
    vendorCode: '',
    hex: 'transparent',
    isExternal: true,
  };
}

export function normalizePatternCell(cell: PatternCell): PatternCell {
  if (!cell.hex || cell.hex === 'transparent' || cell.isExternal) {
    return createTransparentPatternCell(cell.x, cell.y);
  }

  const hex = normalizeImportHex(cell.hex);
  const colorId = cell.colorId?.trim() || hex;

  return {
    x: cell.x,
    y: cell.y,
    colorId,
    vendorCode: cell.vendorCode?.trim() || colorId,
    hex,
  };
}

export function sortPatternCells(cells: PatternCell[]) {
  return [...cells].sort((a, b) => (a.y - b.y) || (a.x - b.x));
}

function getPaletteKey(cell: PatternCell) {
  return cell.colorId || cell.hex;
}

export function rebuildPatternPaletteFromCells(cells: PatternCell[]): PatternPaletteEntry[] {
  const paletteCounts = new Map<string, PatternPaletteEntry>();

  for (const cell of cells) {
    if (isTransparentPatternCell(cell)) continue;
    const normalized = normalizePatternCell(cell);
    const key = getPaletteKey(normalized);
    const current = paletteCounts.get(key);
    if (current) {
      current.count += 1;
      continue;
    }

    paletteCounts.set(key, {
      colorId: normalized.colorId,
      vendorCode: normalized.vendorCode,
      hex: normalized.hex,
      count: 1,
    });
  }

  return Array.from(paletteCounts.values()).sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.vendorCode.localeCompare(b.vendorCode, 'zh-Hans-CN');
  });
}

export function rebuildPatternStatsFromCells(cells: PatternCell[]) {
  const palette = rebuildPatternPaletteFromCells(cells);
  return {
    totalCells: palette.reduce((sum, entry) => sum + entry.count, 0),
    colorCount: palette.length,
  };
}

export function reconstructPatternResult(params: {
  width: number;
  height: number;
  cells: PatternCell[];
}): PatternResult {
  const cellsByCoordinate = new Map<string, PatternCell>();
  for (const cell of params.cells) {
    cellsByCoordinate.set(`${cell.x},${cell.y}`, normalizePatternCell(cell));
  }

  const cells: PatternCell[] = [];
  for (let y = 0; y < params.height; y += 1) {
    for (let x = 0; x < params.width; x += 1) {
      cells.push(cellsByCoordinate.get(`${x},${y}`) ?? createTransparentPatternCell(x, y));
    }
  }

  const palette = rebuildPatternPaletteFromCells(cells);

  return {
    width: params.width,
    height: params.height,
    cells,
    palette,
    stats: {
      totalCells: palette.reduce((sum, entry) => sum + entry.count, 0),
      colorCount: palette.length,
    },
  };
}
