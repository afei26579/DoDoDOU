import type { PatternCell, PatternResult } from '../../features/workshop/model/types';

export type PatternMode = 'smart' | 'color-block' | 'edge-first' | 'region-first' | 'row-by-row';
export type BeadingConnectivity = '4' | '8' | 'smart';
export type BeadingAxis = 'row' | 'column';
export type BeadingHandedness = 'left' | 'right';

export type BeadingPaletteItem = {
  colorId: string;
  vendorCode: string;
  hex: string;
  count: number;
};

export type BeadingBlockReason = 'connected' | 'diagonal-bridge' | 'edge' | 'region' | 'row' | 'column' | 'smart';

export type BeadingBlock = {
  key: string;
  groupKey: string;
  label: string;
  colorKey: string;
  cells: PatternCell[];
  anchorX: number;
  anchorY: number;
  reason: BeadingBlockReason;
};

export type BeadingGroup = {
  key: string;
  label: string;
  colorKey?: string;
  cells: PatternCell[];
  blocks: BeadingBlock[];
};

export type BeadingPlan = {
  mode: PatternMode;
  groups: BeadingGroup[];
  blocks: BeadingBlock[];
};

type BuildPlanOptions = {
  mode: PatternMode;
  handedness: BeadingHandedness;
  connectivity?: BeadingConnectivity;
  axis?: BeadingAxis;
  regionSize?: number;
};

type CellCoordinate = {
  x: number;
  y: number;
};

const ORTHOGONAL_NEIGHBORS = [
  { dx: 0, dy: -1 },
  { dx: 1, dy: 0 },
  { dx: 0, dy: 1 },
  { dx: -1, dy: 0 },
];

const DIAGONAL_NEIGHBORS = [
  { dx: -1, dy: -1 },
  { dx: 1, dy: -1 },
  { dx: 1, dy: 1 },
  { dx: -1, dy: 1 },
];

export function getCellKey(cell: { colorId: string; vendorCode: string; hex: string }) {
  return `${cell.colorId}-${cell.vendorCode}-${normalizeHex(cell.hex)}`;
}

export function getCellCoordKey(cell: CellCoordinate) {
  return `${cell.x},${cell.y}`;
}

export function normalizeHex(hex: string) {
  if (hex === 'transparent') return hex;
  return hex.startsWith('#') ? hex : `#${hex}`;
}

export function isTransparentCellHex(hex: string) {
  return hex === 'transparent';
}

function isUsableCell(cell: PatternCell) {
  return !cell.isExternal && Boolean(cell.vendorCode) && Boolean(cell.hex) && !isTransparentCellHex(cell.hex);
}

function getNeighborKey(x: number, y: number, dx: number, dy: number) {
  return `${x + dx},${y + dy}`;
}

function sortCellsByHandedness<T extends CellCoordinate>(cells: T[], handedness: BeadingHandedness) {
  return [...cells].sort((a, b) => {
    if (a.y !== b.y) return a.y - b.y;
    if (a.x !== b.x) return handedness === 'left' ? b.x - a.x : a.x - b.x;
    return 0;
  });
}

function getAnchor(cells: PatternCell[], handedness: BeadingHandedness) {
  return sortCellsByHandedness(cells, handedness)[0] ?? cells[0];
}

function shouldConnectDiagonal(cellMap: Map<string, PatternCell>, cell: PatternCell, dx: number, dy: number, connectivity: BeadingConnectivity, cellCount: number) {
  if (connectivity === '8') return true;
  if (connectivity === '4') return false;

  const previous = cellMap.get(getNeighborKey(cell.x, cell.y, -dx, -dy));
  const next = cellMap.get(getNeighborKey(cell.x, cell.y, dx * 2, dy * 2));
  const bridgeA = cellMap.get(getNeighborKey(cell.x, cell.y, dx, 0));
  const bridgeB = cellMap.get(getNeighborKey(cell.x, cell.y, 0, dy));

  return Boolean(previous || next || bridgeA || bridgeB || cellCount <= 80);
}

export function buildPalette(pattern: PatternResult): BeadingPaletteItem[] {
  const paletteByKey = new Map<string, BeadingPaletteItem>();

  for (const cell of pattern.cells) {
    if (!isUsableCell(cell)) continue;
    const hex = normalizeHex(cell.hex);
    const key = getCellKey(cell);
    const next = paletteByKey.get(key) ?? {
      colorId: cell.colorId,
      vendorCode: cell.vendorCode,
      hex,
      count: 0,
    };
    next.count += 1;
    paletteByKey.set(key, next);
  }

  return Array.from(paletteByKey.values()).sort((a, b) => b.count - a.count);
}

function getCellsByColor(cells: PatternCell[]) {
  const cellsByColor = new Map<string, PatternCell[]>();
  for (const cell of cells) {
    if (!isUsableCell(cell)) continue;
    const normalizedCell = { ...cell, hex: normalizeHex(cell.hex) };
    const colorKey = getCellKey(normalizedCell);
    const bucket = cellsByColor.get(colorKey) ?? [];
    bucket.push(normalizedCell);
    cellsByColor.set(colorKey, bucket);
  }
  return cellsByColor;
}

export function buildConnectedBlocks(params: {
  cells: PatternCell[];
  groupKey: string;
  label: string;
  handedness: BeadingHandedness;
  connectivity?: BeadingConnectivity;
  reason?: BeadingBlockReason;
}) {
  const { cells, groupKey, label, handedness, connectivity = '4', reason = 'connected' } = params;
  const orderedCells = sortCellsByHandedness(cells, handedness);
  const cellMap = new Map<string, PatternCell>();
  for (const cell of orderedCells) {
    cellMap.set(getCellCoordKey(cell), cell);
  }

  const visited = new Set<string>();
  const blocks: BeadingBlock[] = [];

  for (const cell of orderedCells) {
    const seedKey = getCellCoordKey(cell);
    if (visited.has(seedKey)) continue;

    const queue: PatternCell[] = [cell];
    const connected: PatternCell[] = [];
    let usedDiagonal = false;
    visited.add(seedKey);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      connected.push(current);

      const neighborSpecs = [
        ...ORTHOGONAL_NEIGHBORS.map((neighbor) => ({ ...neighbor, diagonal: false })),
        ...DIAGONAL_NEIGHBORS.map((neighbor) => ({ ...neighbor, diagonal: true })),
      ];

      for (const neighborSpec of neighborSpecs) {
        if (neighborSpec.diagonal && !shouldConnectDiagonal(cellMap, current, neighborSpec.dx, neighborSpec.dy, connectivity, orderedCells.length)) continue;
        const neighbor = cellMap.get(getNeighborKey(current.x, current.y, neighborSpec.dx, neighborSpec.dy));
        if (!neighbor) continue;
        const neighborKey = getCellCoordKey(neighbor);
        if (visited.has(neighborKey)) continue;
        if (neighborSpec.diagonal) usedDiagonal = true;
        visited.add(neighborKey);
        queue.push(neighbor);
      }
    }

    const orderedConnected = sortCellsByHandedness(connected, handedness);
    const anchor = getAnchor(orderedConnected, handedness);
    const colorKey = getCellKey(orderedConnected[0]);
    blocks.push({
      key: `${groupKey}-${colorKey}-${anchor.x},${anchor.y}`,
      groupKey,
      label,
      colorKey,
      cells: orderedConnected,
      anchorX: anchor.x,
      anchorY: anchor.y,
      reason: usedDiagonal ? 'diagonal-bridge' : reason,
    });
  }

  return blocks.sort((a, b) => compareAnchors(a, b, handedness));
}

function compareAnchors(a: Pick<BeadingBlock, 'anchorX' | 'anchorY'>, b: Pick<BeadingBlock, 'anchorX' | 'anchorY'>, handedness: BeadingHandedness) {
  if (a.anchorX !== b.anchorX) return handedness === 'left' ? b.anchorX - a.anchorX : a.anchorX - b.anchorX;
  if (a.anchorY !== b.anchorY) return a.anchorY - b.anchorY;
  return 0;
}

function createPlan(mode: PatternMode, groups: BeadingGroup[]): BeadingPlan {
  return {
    mode,
    groups,
    blocks: groups.flatMap((group) => group.blocks),
  };
}

export function buildColorBlockPlan(pattern: PatternResult, options: Pick<BuildPlanOptions, 'handedness' | 'connectivity'>): BeadingPlan {
  const palette = buildPalette(pattern);
  const cellsByColor = getCellsByColor(pattern.cells);
  const groups = palette.map((item) => {
    const colorKey = `${item.colorId}-${item.vendorCode}-${item.hex}`;
    const cells = sortCellsByHandedness(cellsByColor.get(colorKey) ?? [], options.handedness);
    const blocks = buildConnectedBlocks({
      cells,
      groupKey: colorKey,
      label: item.vendorCode,
      handedness: options.handedness,
      connectivity: options.connectivity,
    });
    return { key: colorKey, label: item.vendorCode, colorKey, cells, blocks };
  });
  return createPlan('color-block', groups);
}

export function buildRowByRowPlan(pattern: PatternResult, options: Pick<BuildPlanOptions, 'handedness' | 'axis'>): BeadingPlan {
  const axis = options.axis ?? 'row';
  const cells = pattern.cells.filter(isUsableCell).map((cell) => ({ ...cell, hex: normalizeHex(cell.hex) }));
  const maxPrimary = axis === 'row' ? pattern.height : pattern.width;
  const groups: BeadingGroup[] = [];

  for (let primary = 0; primary < maxPrimary; primary += 1) {
    const lineCells = cells.filter((cell) => (axis === 'row' ? cell.y === primary : cell.x === primary));
    if (lineCells.length === 0) continue;

    const reverseBase = options.handedness === 'left';
    const reverse = primary % 2 === 0 ? reverseBase : !reverseBase;
    const orderedLineCells = [...lineCells].sort((a, b) => {
      const av = axis === 'row' ? a.x : a.y;
      const bv = axis === 'row' ? b.x : b.y;
      return reverse ? bv - av : av - bv;
    });

    const groupKey = `${axis}-${primary}`;
    const blocks: BeadingBlock[] = [];
    let run: PatternCell[] = [];

    const flushRun = () => {
      if (run.length === 0) return;
      const anchor = run[0];
      const colorKey = getCellKey(anchor);
      blocks.push({
        key: `${groupKey}-${colorKey}-${anchor.x},${anchor.y}`,
        groupKey,
        label: axis === 'row' ? `第 ${primary + 1} 行` : `第 ${primary + 1} 列`,
        colorKey,
        cells: run,
        anchorX: anchor.x,
        anchorY: anchor.y,
        reason: axis,
      });
      run = [];
    };

    for (const cell of orderedLineCells) {
      const previous = run[run.length - 1];
      const sameColor = previous && getCellKey(previous) === getCellKey(cell);
      const adjacent = previous && Math.abs((axis === 'row' ? previous.x - cell.x : previous.y - cell.y)) === 1;
      if (previous && (!sameColor || !adjacent)) flushRun();
      run.push(cell);
    }
    flushRun();

    groups.push({
      key: groupKey,
      label: axis === 'row' ? `第 ${primary + 1} 行` : `第 ${primary + 1} 列`,
      cells: lineCells,
      blocks,
    });
  }

  return createPlan('row-by-row', groups);
}

export function buildRegionFirstPlan(pattern: PatternResult, options: Pick<BuildPlanOptions, 'handedness' | 'connectivity' | 'regionSize'>): BeadingPlan {
  const regionSize = options.regionSize ?? 10;
  const cells = pattern.cells.filter(isUsableCell).map((cell) => ({ ...cell, hex: normalizeHex(cell.hex) }));
  const regionColumns = Math.ceil(pattern.width / regionSize);
  const regionRows = Math.ceil(pattern.height / regionSize);
  const groups: BeadingGroup[] = [];

  for (let ry = 0; ry < regionRows; ry += 1) {
    const regionXs = Array.from({ length: regionColumns }, (_, index) => index);
    if (options.handedness === 'left') regionXs.reverse();

    for (const rx of regionXs) {
      const startX = rx * regionSize;
      const startY = ry * regionSize;
      const regionCells = cells.filter((cell) => cell.x >= startX && cell.x < startX + regionSize && cell.y >= startY && cell.y < startY + regionSize);
      if (regionCells.length === 0) continue;

      const cellsByColor = getCellsByColor(regionCells);
      const colorEntries = Array.from(cellsByColor.entries()).sort((a, b) => b[1].length - a[1].length);
      const groupKey = `region-${rx}-${ry}`;
      const blocks = colorEntries.flatMap(([colorKey, colorCells]) => buildConnectedBlocks({
        cells: colorCells,
        groupKey,
        label: `区域 ${rx + 1}-${ry + 1}`,
        handedness: options.handedness,
        connectivity: options.connectivity,
        reason: 'region',
      }).map((block) => ({ ...block, key: `${groupKey}-${colorKey}-${block.anchorX},${block.anchorY}` })));

      groups.push({
        key: groupKey,
        label: `区域 ${rx + 1}-${ry + 1}`,
        cells: regionCells,
        blocks,
      });
    }
  }

  return createPlan('region-first', groups);
}

function getEdgeScore(pattern: PatternResult, cellMap: Map<string, PatternCell>, cell: PatternCell) {
  let score = 0;
  if (cell.x === 0 || cell.y === 0 || cell.x === pattern.width - 1 || cell.y === pattern.height - 1) score += 5;

  for (const neighbor of ORTHOGONAL_NEIGHBORS) {
    const next = cellMap.get(getNeighborKey(cell.x, cell.y, neighbor.dx, neighbor.dy));
    if (!next || !isUsableCell(next)) {
      score += 4;
      continue;
    }
    if (getCellKey(next) !== getCellKey(cell)) score += 2;
  }

  return score;
}

export function buildEdgeFirstPlan(pattern: PatternResult, options: Pick<BuildPlanOptions, 'handedness' | 'connectivity'>): BeadingPlan {
  const colorPlan = buildColorBlockPlan(pattern, options);
  const cellMap = new Map<string, PatternCell>();
  for (const cell of pattern.cells) {
    if (isUsableCell(cell)) cellMap.set(getCellCoordKey(cell), { ...cell, hex: normalizeHex(cell.hex) });
  }

  const blocks = [...colorPlan.blocks]
    .map((block) => {
      const edgeScore = block.cells.reduce((sum, cell) => sum + getEdgeScore(pattern, cellMap, cell), 0) / block.cells.length;
      return { ...block, groupKey: 'edge-first', reason: 'edge' as const, edgeScore };
    })
    .sort((a, b) => {
      if (b.edgeScore !== a.edgeScore) return b.edgeScore - a.edgeScore;
      if (b.cells.length !== a.cells.length) return b.cells.length - a.cells.length;
      return compareAnchors(a, b, options.handedness);
    });

  return createPlan('edge-first', [{
    key: 'edge-first',
    label: '边缘优先',
    cells: blocks.flatMap((block) => block.cells),
    blocks,
  }]);
}

export function buildSmartPlan(pattern: PatternResult, options: Pick<BuildPlanOptions, 'handedness' | 'connectivity'>): BeadingPlan {
  const basePlan = buildColorBlockPlan(pattern, { ...options, connectivity: options.connectivity ?? 'smart' });
  const cellMap = new Map<string, PatternCell>();
  for (const cell of pattern.cells) {
    if (isUsableCell(cell)) cellMap.set(getCellCoordKey(cell), { ...cell, hex: normalizeHex(cell.hex) });
  }

  const centerX = (pattern.width - 1) / 2;
  const centerY = (pattern.height - 1) / 2;
  const maxDistance = Math.max(1, Math.hypot(centerX, centerY));
  const blocks = [...basePlan.blocks]
    .map((block) => {
      const edgeScore = block.cells.reduce((sum, cell) => sum + getEdgeScore(pattern, cellMap, cell), 0) / block.cells.length;
      const sizeScore = Math.min(1, block.cells.length / 36);
      const distance = Math.hypot(block.anchorX - centerX, block.anchorY - centerY) / maxDistance;
      const anchorScore = block.anchorX === 0 || block.anchorY === 0 || block.anchorX === pattern.width - 1 || block.anchorY === pattern.height - 1 ? 1 : 1 - distance;
      const score = edgeScore * 0.35 + sizeScore * 8 * 0.25 + anchorScore * 6 * 0.2 + block.cells.length * 0.02;
      return { ...block, groupKey: 'smart', reason: 'smart' as const, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return compareAnchors(a, b, options.handedness);
    });

  return createPlan('smart', [{
    key: 'smart',
    label: '智能规划',
    cells: blocks.flatMap((block) => block.cells),
    blocks,
  }]);
}

export function buildBeadingPlan(pattern: PatternResult, options: BuildPlanOptions): BeadingPlan {
  if (options.mode === 'row-by-row') return buildRowByRowPlan(pattern, options);
  if (options.mode === 'region-first') return buildRegionFirstPlan(pattern, options);
  if (options.mode === 'edge-first') return buildEdgeFirstPlan(pattern, options);
  if (options.mode === 'smart') return buildSmartPlan(pattern, options);
  return buildColorBlockPlan(pattern, options);
}
