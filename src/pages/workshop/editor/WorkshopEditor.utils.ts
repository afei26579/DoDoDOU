import { buildPalette, getVendorCode, hexToRgb, type PatternPaletteColor } from '../../../lib/pattern/color-system';
import type { ColorSystem } from '../../../features/workshop/model/types';
import {
  drawBeadBoard,
  type BeadBoardCell,
  type BeadBoardVisibleRange,
  type BeadShape,
  type TransparentCellBackground,
} from '../../../lib/pattern/beadBoardCanvas';

export const PALETTE = [
  '#000000','#1C1C1C','#383838','#555555','#717171','#8D8D8D','#AAAAAA','#C6C6C6','#E2E2E2','#FFFFFF',
  '#FF0000','#FF3300','#FF6600','#FF8800','#FFAA00','#FFCC00','#FFEE00','#EEFF00','#CCFF00','#88FF00',
  '#44FF00','#00FF00','#00FF44','#00FF88','#00FFCC','#00FFEE','#00EEFF','#00CCFF','#00AAFF','#0088FF',
  '#0066FF','#0044FF','#0022FF','#0000FF','#2200FF','#4400FF','#6600FF','#8800FF','#AA00FF','#CC00FF',
  '#EE00FF','#FF00EE','#FF00CC','#FF00AA','#FF0088','#FF0066','#FF0044','#FF0022','#FF0011','#FF0000',
  '#8B0000','#A52A2A','#B22222','#CD5C5C','#DC143C','#FF4500','#FF6347','#FF7F50','#FFA07A','#FFDAB9',
  '#8B4513','#A0522D','#D2691E','#CD853F','#DEB887','#F5DEB3','#FAEBD7','#FAF0E6','#FFF8DC','#FFFFF0',
  '#006400','#008000','#228B22','#2E8B57','#3CB371','#20B2AA','#008B8B','#008080','#00CED1','#5F9EA0',
  '#4169E1','#0000CD','#000080','#00008B','#191970','#6A5ACD','#483D8B','#7B68EE','#9370DB','#8A2BE2',
  '#D8B4E2','#C49AD4','#EDD9F5','#B5EAD7','#FFDAC1','#FFB7B2','#FF9AA2','#FFEAA7','#A8E6CF','#7FDBFF',
];

export const QUICK_COLORS = ['#000000','#FFFFFF','#FF0000','#FF6600','#FFD700','#00CC44','#0088FF','#AA00FF','#FF88CC','#D8B4E2'];
export const TRANSPARENT_GRID_LIGHT = '#F7F5F1';
export const TRANSPARENT_GRID_DARK = '#E2DED6';
export const EDITOR_GRID_LINE_COLOR = 'rgba(180,143,204,.52)';
export const EDITOR_GRID_MINOR_LINE_COLOR = '#C7DFF7';
export const EDITOR_GRID_MAJOR_LINE_COLOR = 'rgba(180,143,204,.72)';
export const EDITOR_GRID_BORDER_COLOR = '#B48FCC';
export const EDITOR_GRID_MINOR_VISIBLE_CELL_PX = 10;
export const EDITOR_GRID_LINE_VISIBLE_CELL_PX = 18;
const COLOR_CODE_MIN_VISIBLE_CELL_PX = 12;
const COLOR_CODE_DARK_TEXT = '#5D534A';
const COLOR_CODE_LIGHT_TEXT = '#FFFFFF';
const MAX_MAIN_CANVAS_DIMENSION = 6144;
export type EditorBeadShape = Exclude<BeadShape, 'auto'>;
export type EditorBackgroundMode = TransparentCellBackground;
export type EditorCanvasRenderMeta = {
  cellSize: number;
  cssWidth: number;
  cssHeight: number;
  visibleCellSize: number;
};

export function createEmptyGrid(cols: number, rows: number) {
  return Array.from({ length: rows }, () => Array(cols).fill(''));
}

export function floodFill(grid: string[][], row: number, col: number, fillColor: string) {
  const target = grid[row]?.[col] ?? '';
  if (target === fillColor) return grid;
  const next = grid.map((line) => [...line]);
  const stack = [{ row, col }];
  const visited = new Set<string>();

  while (stack.length) {
    const current = stack.pop();
    if (!current) break;
    const key = `${current.row},${current.col}`;
    if (visited.has(key) || current.row < 0 || current.row >= next.length || current.col < 0 || current.col >= (next[0]?.length ?? 0)) continue;
    if ((next[current.row][current.col] ?? '') !== target) continue;
    visited.add(key);
    next[current.row][current.col] = fillColor;
    stack.push({ row: current.row - 1, col: current.col }, { row: current.row + 1, col: current.col }, { row: current.row, col: current.col - 1 }, { row: current.row, col: current.col + 1 });
  }

  return next;
}

export function toCellPoint(clientX: number, clientY: number, canvas: HTMLCanvasElement | null, cols: number, rows: number) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  const cellW = rect.width / cols;
  const cellH = rect.height / rows;
  const col = Math.floor(x / cellW);
  const row = Math.floor(y / cellH);
  if (row < 0 || row >= rows || col < 0 || col >= cols) return null;
  return { row, col };
}

function isTransparentCell(hex: string) {
  return !hex || hex === 'transparent';
}

function drawTransparentCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const checkerSize = size / 4;

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      ctx.fillStyle = (row + column) % 2 === 0 ? TRANSPARENT_GRID_LIGHT : TRANSPARENT_GRID_DARK;
      ctx.fillRect(
        x + column * checkerSize,
        y + row * checkerSize,
        Math.ceil(checkerSize) + 0.5,
        Math.ceil(checkerSize) + 0.5,
      );
    }
  }
}

function drawEditorGridLines(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  cols: number,
  rows: number,
  cellSize: number,
  visibleCellSize: number,
  showDividers: boolean,
) {
  if (visibleCellSize >= EDITOR_GRID_LINE_VISIBLE_CELL_PX) {
    ctx.save();
    ctx.strokeStyle = EDITOR_GRID_LINE_COLOR;
    ctx.lineWidth = 0.75;
    ctx.beginPath();
    for (let col = 1; col < cols; col += 1) {
      if (col % 5 === 0) continue;
      const x = Math.round(col * cellSize) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let row = 1; row < rows; row += 1) {
      if (row % 5 === 0) continue;
      const y = Math.round(row * cellSize) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (visibleCellSize >= EDITOR_GRID_MINOR_VISIBLE_CELL_PX) {
    ctx.save();
    ctx.strokeStyle = EDITOR_GRID_MINOR_LINE_COLOR;
    ctx.lineWidth = 1.25;
    ctx.setLineDash([3, 2]);
    ctx.beginPath();
    for (let col = 5; col < cols; col += 5) {
      if (col % 10 === 0) continue;
      const x = Math.round(col * cellSize) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let row = 5; row < rows; row += 5) {
      if (row % 10 === 0) continue;
      const y = Math.round(row * cellSize) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (showDividers) {
    ctx.save();
    ctx.strokeStyle = EDITOR_GRID_MAJOR_LINE_COLOR;
    ctx.lineWidth = 1.75;
    ctx.beginPath();
    for (let col = 10; col < cols; col += 10) {
      const x = Math.round(col * cellSize) + 0.5;
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
    }
    for (let row = 10; row < rows; row += 10) {
      const y = Math.round(row * cellSize) + 0.5;
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = EDITOR_GRID_BORDER_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, Math.max(0, width - 2), Math.max(0, height - 2));
  ctx.restore();
}

function getRelativeLuminance(hex: string) {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;

  const channels = [rgb.r, rgb.g, rgb.b].map((value) => {
    const normalized = value / 255;
    return normalized <= 0.03928
      ? normalized / 12.92
      : ((normalized + 0.055) / 1.055) ** 2.4;
  });

  return (0.2126 * channels[0]) + (0.7152 * channels[1]) + (0.0722 * channels[2]);
}

function getContrastRatio(a: string, b: string) {
  const l1 = getRelativeLuminance(a);
  const l2 = getRelativeLuminance(b);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);

  return (lighter + 0.05) / (darker + 0.05);
}

function getReadableCodeTextColor(hex: string) {
  const darkContrast = getContrastRatio(hex, COLOR_CODE_DARK_TEXT);
  const lightContrast = getContrastRatio(hex, COLOR_CODE_LIGHT_TEXT);

  return darkContrast >= lightContrast ? COLOR_CODE_DARK_TEXT : COLOR_CODE_LIGHT_TEXT;
}

function getNearestPaletteColor(hex: string, palette: PatternPaletteColor[]) {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;

  let nearest: PatternPaletteColor | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const color of palette) {
    const distance =
      ((rgb.r - color.rgb.r) ** 2) +
      ((rgb.g - color.rgb.g) ** 2) +
      ((rgb.b - color.rgb.b) ** 2);

    if (distance >= nearestDistance) continue;
    nearest = color;
    nearestDistance = distance;
  }

  return nearest;
}

function getDisplayVendorCode(hex: string, colorSystem: ColorSystem, palette: PatternPaletteColor[]) {
  const exactCode = getVendorCode(hex, colorSystem);
  if (exactCode && exactCode !== '?') return exactCode;

  return getNearestPaletteColor(hex, palette)?.vendorCode ?? '';
}

function drawColorCodes(
  ctx: CanvasRenderingContext2D,
  grid: string[][],
  cellSize: number,
  colorSystem: ColorSystem,
  range: BeadBoardVisibleRange = {
    startCol: 0,
    endCol: (grid[0]?.length ?? 1) - 1,
    startRow: 0,
    endRow: grid.length - 1,
  },
) {
  const codeCache = new Map<string, string>();
  const palette = buildPalette(colorSystem);

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';

  for (let r = range.startRow; r <= range.endRow; r += 1) {
    const row = grid[r];
    if (!row) continue;

    for (let c = range.startCol; c <= range.endCol; c += 1) {
      const hex = row[c];
      if (isTransparentCell(hex)) continue;

      const normalizedHex = hex.toUpperCase();
      const code = codeCache.get(normalizedHex) ?? getDisplayVendorCode(normalizedHex, colorSystem, palette);
      codeCache.set(normalizedHex, code);
      if (!code) continue;

      const fontSize = Math.max(
        4,
        Math.min(cellSize * 0.34, (cellSize - 5) / Math.max(1, code.length * 0.68)),
      );
      const fillColor = getReadableCodeTextColor(normalizedHex);
      const strokeColor = fillColor === COLOR_CODE_LIGHT_TEXT
        ? 'rgba(93, 83, 74, 0.32)'
        : 'rgba(255, 255, 255, 0.62)';

      ctx.font = `700 ${fontSize}px Nunito, Arial, sans-serif`;
      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = Math.max(1.4, fontSize * 0.22);
      ctx.fillStyle = fillColor;
      ctx.strokeText(
        code,
        (c * cellSize) + (cellSize / 2),
        (r * cellSize) + (cellSize / 2),
        cellSize - 2,
      );
      ctx.fillText(
        code,
        (c * cellSize) + (cellSize / 2),
        (r * cellSize) + (cellSize / 2),
        cellSize - 2,
      );
    }
  }

  ctx.restore();
}

function getRenderCellSize(cols: number, rows: number, cssCellSize: number, visibleCellSize: number) {
  const pixelRatio = typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
  const targetCellSize = Math.ceil(Math.max(cssCellSize, visibleCellSize) * pixelRatio);
  const maxCellSize = Math.max(1, Math.floor(MAX_MAIN_CANVAS_DIMENSION / Math.max(cols, rows, 1)));

  return Math.max(1, Math.min(targetCellSize, maxCellSize));
}

function buildBoardCellsFromGrid(grid: string[][]): BeadBoardCell[] {
  return grid.flatMap((row, y) => row.map((hex, x) => ({
    x,
    y,
    hex: hex || 'transparent',
  })));
}

function buildBoardCellsFromRange(grid: string[][], range: BeadBoardVisibleRange): BeadBoardCell[] {
  const cells: BeadBoardCell[] = [];

  for (let y = range.startRow; y <= range.endRow; y += 1) {
    const row = grid[y];
    if (!row) continue;

    for (let x = range.startCol; x <= range.endCol; x += 1) {
      cells.push({
        x,
        y,
        hex: row[x] || 'transparent',
      });
    }
  }

  return cells;
}

function getChangedCellRange(
  changedCells: Array<{ row: number; col: number }>,
  cols: number,
  rows: number,
): BeadBoardVisibleRange | null {
  if (!changedCells.length || cols <= 0 || rows <= 0) return null;

  let startCol = cols - 1;
  let endCol = 0;
  let startRow = rows - 1;
  let endRow = 0;

  for (const cell of changedCells) {
    if (cell.col < 0 || cell.col >= cols || cell.row < 0 || cell.row >= rows) continue;
    startCol = Math.min(startCol, cell.col);
    endCol = Math.max(endCol, cell.col);
    startRow = Math.min(startRow, cell.row);
    endRow = Math.max(endRow, cell.row);
  }

  if (startCol > endCol || startRow > endRow) return null;

  return {
    startCol: Math.max(0, startCol - 1),
    endCol: Math.min(cols - 1, endCol + 1),
    startRow: Math.max(0, startRow - 1),
    endRow: Math.min(rows - 1, endRow + 1),
  };
}

function paintPreviewCells(
  previewCanvas: HTMLCanvasElement,
  bubbleCanvas: HTMLCanvasElement | null,
  grid: string[][],
  changedCells: Array<{ row: number; col: number }>,
  cols: number,
  rows: number,
) {
  const pCtx = previewCanvas.getContext('2d');
  if (!pCtx || previewCanvas.width !== cols || previewCanvas.height !== rows) return;

  const seen = new Set<string>();
  for (const cell of changedCells) {
    if (cell.col < 0 || cell.col >= cols || cell.row < 0 || cell.row >= rows) continue;
    const key = `${cell.row},${cell.col}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const hex = grid[cell.row]?.[cell.col] ?? '';
    pCtx.clearRect(cell.col, cell.row, 1, 1);
    if (!isTransparentCell(hex)) {
      pCtx.fillStyle = hex;
      pCtx.fillRect(cell.col, cell.row, 1, 1);
    }
  }

  const bCtx = bubbleCanvas?.getContext('2d');
  if (!bubbleCanvas || !bCtx || !bubbleCanvas.isConnected) return;

  bubbleCanvas.width = 32;
  bubbleCanvas.height = 32;
  bCtx.imageSmoothingEnabled = false;
  bCtx.clearRect(0, 0, 32, 32);
  bCtx.drawImage(previewCanvas, 0, 0, 32, 32);
}

export function paintGridToCanvas({
  canvas,
  previewCanvas,
  bubbleCanvas,
  grid,
  cols,
  rows,
  bgColor,
  showGrid,
  showDividers,
  showColorCodes,
  beadShape,
  backgroundMode,
  colorSystem,
  displayWidth,
  displayHeight,
  visibleCellSize,
}: {
  canvas: HTMLCanvasElement;
  previewCanvas: HTMLCanvasElement;
  bubbleCanvas: HTMLCanvasElement | null;
  grid: string[][];
  cols: number;
  rows: number;
  bgColor: string;
  showGrid: boolean;
  showDividers: boolean;
  showColorCodes: boolean;
  beadShape: EditorBeadShape;
  backgroundMode: EditorBackgroundMode;
  colorSystem: ColorSystem;
  displayWidth?: number;
  displayHeight?: number;
  visibleCellSize?: number;
}): EditorCanvasRenderMeta | null {
  const ctx = canvas.getContext('2d');
  const pCtx = previewCanvas.getContext('2d');
  const bCtx = bubbleCanvas?.getContext('2d');
  if (!ctx || !pCtx) return null;

  const cssWidth = displayWidth ?? cols * 16;
  const cssHeight = displayHeight ?? rows * 16;
  const cssCellSize = Math.max(1, Math.min(cssWidth / Math.max(cols, 1), cssHeight / Math.max(rows, 1)));
  const visibleSize = visibleCellSize ?? cssCellSize;
  const cellSize = getRenderCellSize(cols, rows, cssCellSize, visibleSize);
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  canvas.style.width = `${cssWidth}px`;
  canvas.style.height = `${cssHeight}px`;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawBeadBoard({
    ctx,
    cells: buildBoardCellsFromGrid(grid),
    boardWidth: cols,
    boardHeight: rows,
    cellPx: cellSize,
    visibleCellPx: visibleSize,
    showGrid,
    showDividers,
    beadShape,
    transparentCellBackground: backgroundMode,
  });
  if (showColorCodes && visibleSize >= COLOR_CODE_MIN_VISIBLE_CELL_PX) {
    drawColorCodes(ctx, grid, cellSize, colorSystem);
  }

  previewCanvas.width = cols;
  previewCanvas.height = rows;
  pCtx.clearRect(0, 0, cols, rows);
  grid.forEach((row, r) => row.forEach((hex, c) => {
    if (isTransparentCell(hex)) {
      return;
    }
    pCtx.fillStyle = hex;
    pCtx.fillRect(c, r, 1, 1);
  }));

  if (bCtx && bubbleCanvas) {
    bubbleCanvas.width = 32;
    bubbleCanvas.height = 32;
    bCtx.clearRect(0, 0, 32, 32);
    const scX = 32 / cols;
    const scY = 32 / rows;
    grid.forEach((row, r) => row.forEach((hex, c) => {
      if (isTransparentCell(hex)) return;
      const x = Math.floor(c * scX);
      const y = Math.floor(r * scY);
      const width = Math.max(1, Math.ceil(scX));
      const height = Math.max(1, Math.ceil(scY));
      bCtx.fillStyle = hex;
      bCtx.fillRect(x, y, width, height);
    }));
  }

  return {
    cellSize,
    cssWidth,
    cssHeight,
    visibleCellSize: visibleSize,
  };
}

export function paintGridCellsToCanvas({
  canvas,
  previewCanvas,
  bubbleCanvas,
  grid,
  changedCells,
  cols,
  rows,
  showGrid,
  showDividers,
  showColorCodes,
  beadShape,
  backgroundMode,
  colorSystem,
  visibleCellSize,
}: {
  canvas: HTMLCanvasElement;
  previewCanvas: HTMLCanvasElement;
  bubbleCanvas: HTMLCanvasElement | null;
  grid: string[][];
  changedCells: Array<{ row: number; col: number }>;
  cols: number;
  rows: number;
  showGrid: boolean;
  showDividers: boolean;
  showColorCodes: boolean;
  beadShape: EditorBeadShape;
  backgroundMode: EditorBackgroundMode;
  colorSystem: ColorSystem;
  visibleCellSize: number;
}) {
  const ctx = canvas.getContext('2d');
  if (!ctx || cols <= 0 || rows <= 0 || canvas.width <= 0 || canvas.height <= 0) return;

  const cellSize = canvas.width / cols;
  const range = getChangedCellRange(changedCells, cols, rows);
  if (!range) return;

  const padding = Math.max(3, cellSize * 0.2);
  const clearX = Math.max(0, range.startCol * cellSize - padding);
  const clearY = Math.max(0, range.startRow * cellSize - padding);
  const clearWidth = Math.min(canvas.width - clearX, (range.endCol - range.startCol + 1) * cellSize + padding * 2);
  const clearHeight = Math.min(canvas.height - clearY, (range.endRow - range.startRow + 1) * cellSize + padding * 2);

  ctx.clearRect(clearX, clearY, clearWidth, clearHeight);
  ctx.fillStyle = 'rgba(255,255,255,.62)';
  ctx.fillRect(clearX, clearY, clearWidth, clearHeight);
  drawBeadBoard({
    ctx,
    cells: buildBoardCellsFromRange(grid, range),
    boardWidth: cols,
    boardHeight: rows,
    cellPx: cellSize,
    visibleCellPx: visibleCellSize,
    visibleRange: range,
    showSurface: false,
    showGrid,
    showDividers,
    showBorder: true,
    beadShape,
    transparentCellBackground: backgroundMode,
  });

  if (showColorCodes && visibleCellSize >= COLOR_CODE_MIN_VISIBLE_CELL_PX) {
    drawColorCodes(ctx, grid, cellSize, colorSystem, range);
  }

  paintPreviewCells(previewCanvas, bubbleCanvas, grid, changedCells, cols, rows);
}

export function exportGridAsImage(grid: string[][], cols: number, rows: number, bgColor: string) {
  const ec = document.createElement('canvas');
  const csz = 16;
  ec.width = cols * csz;
  ec.height = rows * csz;
  const ctx = ec.getContext('2d');
  if (!ctx) return;
  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, ec.width, ec.height);
  grid.forEach((row, r) => row.forEach((hex, c) => {
    if (!hex || hex === 'transparent') return;
    ctx.fillStyle = hex;
    ctx.fillRect(c * csz, r * csz, csz, csz);
  }));
  const a = document.createElement('a');
  a.download = `pindoudou_${Date.now()}.png`;
  a.href = ec.toDataURL('image/png');
  a.click();
}
