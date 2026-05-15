import type { PatternCell, PatternResult } from '../../../features/workshop/model/types';
import { getCellCoordKey, getCellKey, isTransparentCellHex, normalizeHex } from '../../../lib/pattern/beadingPlan';

export type FocusViewport = {
  cellPx: number;
  tx: number;
  ty: number;
  minCellPx: number;
  maxCellPx: number;
};

export type FocusBoardCell = PatternCell & {
  coordKey: string;
  colorKey: string;
  hex: string;
};

export type VisibleRange = {
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number;
};

export type CanvasClipArea = {
  top: number;
  bottom: number;
};

export type RulerLabel = {
  key: string;
  value: number;
  x: number;
  y: number;
  major: boolean;
  current: boolean;
};

export type RulerData = {
  columns: RulerLabel[];
  rows: RulerLabel[];
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function getCanvasClipArea(height: number) {
  const top = 98;
  const bottom = height - 104;
  return { top, bottom: Math.max(top + 80, bottom) };
}

export function getFitViewport(pattern: PatternResult, width: number, height: number): FocusViewport {
  const top = 104;
  const bottom = 166;
  const side = 18;
  const area = {
    x: side,
    y: top,
    width: Math.max(80, width - side * 2),
    height: Math.max(80, height - top - bottom),
  };
  const pad = 12;
  const fit = Math.min((area.width - pad * 2) / pattern.width, (area.height - pad * 2) / pattern.height);
  const minCellPx = clamp(fit * 0.55, 0.7, 6);
  const maxCellPx = 72;
  const cellPx = clamp(fit, minCellPx, maxCellPx);
  const boardWidth = pattern.width * cellPx;
  const boardHeight = pattern.height * cellPx;

  return {
    cellPx,
    minCellPx,
    maxCellPx,
    tx: area.x + (area.width - boardWidth) / 2,
    ty: area.y + (area.height - boardHeight) / 2,
  };
}

export function normalizeCells(pattern: PatternResult): FocusBoardCell[] {
  return pattern.cells.map((cell) => {
    const hex = normalizeHex(cell.hex);
    return {
      ...cell,
      hex,
      coordKey: getCellCoordKey(cell),
      colorKey: getCellKey({ ...cell, hex }),
    };
  });
}

export function isDrawableCell(cell: Pick<PatternCell, 'isExternal' | 'hex' | 'vendorCode'>) {
  return !cell.isExternal && Boolean(cell.vendorCode) && Boolean(cell.hex) && !isTransparentCellHex(cell.hex);
}

export function getVisibleRange(pattern: PatternResult, viewport: FocusViewport, width: number, clip: CanvasClipArea): VisibleRange {
  return {
    startCol: clamp(Math.floor((-viewport.tx) / viewport.cellPx) - 1, 0, pattern.width - 1),
    endCol: clamp(Math.ceil((width - viewport.tx) / viewport.cellPx) + 1, 0, pattern.width - 1),
    startRow: clamp(Math.floor((clip.top - viewport.ty) / viewport.cellPx) - 1, 0, pattern.height - 1),
    endRow: clamp(Math.ceil((clip.bottom - viewport.ty) / viewport.cellPx) + 1, 0, pattern.height - 1),
  };
}

export function screenToCell(viewport: FocusViewport, clientX: number, clientY: number) {
  return {
    x: Math.floor((clientX - viewport.tx) / viewport.cellPx),
    y: Math.floor((clientY - viewport.ty) / viewport.cellPx),
  };
}

export function getDisplayColumn(pattern: PatternResult, handedness: 'left' | 'right', physicalColumn: number) {
  return handedness === 'right' ? physicalColumn + 1 : pattern.width - physicalColumn;
}

function getRulerStep(cellPx: number) {
  if (cellPx >= 24) return 1;
  if (cellPx >= 15) return 2;
  if (cellPx >= 9) return 5;
  if (cellPx >= 5) return 10;
  return 20;
}

function shouldShowLabel(index: number, step: number, currentIndex: number) {
  return index === currentIndex || index === 0 || (index + 1) % step === 0;
}

export function buildRulerData(params: {
  pattern: PatternResult;
  viewport: FocusViewport;
  width: number;
  clip: CanvasClipArea;
  sideRulerTop: number;
  sideRulerHeight: number;
  currentCell: { x: number; y: number } | null;
  handedness: 'left' | 'right';
}): RulerData {
  const { pattern, viewport, width, clip, sideRulerTop, sideRulerHeight, currentCell, handedness } = params;
  const range = getVisibleRange(pattern, viewport, width, clip);
  const step = getRulerStep(viewport.cellPx);
  const currentDisplayColumn = currentCell ? getDisplayColumn(pattern, handedness, currentCell.x) : 1;
  const columns: RulerLabel[] = [];
  const rows: RulerLabel[] = [];

  for (let column = range.startCol; column <= range.endCol; column += 1) {
    const screenX = viewport.tx + (column + 0.5) * viewport.cellPx;
    if (screenX < -40 || screenX > width + 40) continue;
    const displayColumn = getDisplayColumn(pattern, handedness, column);
    const current = currentCell?.x === column;
    if (!shouldShowLabel(displayColumn - 1, step, currentDisplayColumn - 1)) continue;
    columns.push({
      key: `c-${column}`,
      value: displayColumn,
      x: screenX,
      y: 15,
      major: displayColumn === 1 || displayColumn % 10 === 0,
      current,
    });
  }

  for (let row = range.startRow; row <= range.endRow; row += 1) {
    const screenY = viewport.ty + (row + 0.5) * viewport.cellPx;
    const localY = screenY - sideRulerTop;
    if (localY < -30 || localY > sideRulerHeight + 30) continue;
    const displayRow = row + 1;
    const current = currentCell?.y === row;
    if (!shouldShowLabel(row, step, currentCell?.y ?? 0)) continue;
    rows.push({
      key: `r-${row}`,
      value: displayRow,
      x: 17,
      y: localY,
      major: displayRow === 1 || displayRow % 10 === 0,
      current,
    });
  }

  return { columns, rows };
}

function drawRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function shade(hex: string, percent = 0, alpha = 1) {
  const normalized = hex.replace('#', '');
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) return `rgba(216,180,226,${alpha})`;
  const r = clamp(Math.round(((value >> 16) & 255) + (percent / 100) * 255), 0, 255);
  const g = clamp(Math.round(((value >> 8) & 255) + (percent / 100) * 255), 0, 255);
  const b = clamp(Math.round((value & 255) + (percent / 100) * 255), 0, 255);
  return `rgba(${r},${g},${b},${alpha})`;
}

function drawTransparentCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  ctx.fillStyle = '#F3F1EC';
  ctx.fillRect(x, y, Math.ceil(size) + 0.5, Math.ceil(size) + 0.5);
  if (size < 7) return;
  ctx.fillStyle = '#E4DFD6';
  const checker = size / 2;
  ctx.fillRect(x, y, checker, checker);
  ctx.fillRect(x + checker, y + checker, checker, checker);
}

export function drawFocusCanvas(params: {
  canvas: HTMLCanvasElement;
  pattern: PatternResult;
  cells: FocusBoardCell[];
  viewport: FocusViewport;
  activeColorKey: string | null;
  currentCellKey: string | null;
  completedCellKeys: Set<string>;
  showGuide: boolean;
  width: number;
  height: number;
  clip: CanvasClipArea;
}) {
  const { canvas, pattern, cells, viewport, activeColorKey, currentCellKey, completedCellKeys, showGuide, width, height, clip } = params;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#EDD9F5';
  for (let y = 16; y < height; y += 28) {
    for (let x = 16; x < width; x += 28) {
      ctx.beginPath();
      ctx.arc(x, y, 1.15, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, clip.top, width, clip.bottom - clip.top);
  ctx.clip();

  const boardWidth = pattern.width * viewport.cellPx;
  const boardHeight = pattern.height * viewport.cellPx;
  const visible = getVisibleRange(pattern, viewport, width, clip);
  const visibleCells = cells.filter((cell) => cell.x >= visible.startCol && cell.x <= visible.endCol && cell.y >= visible.startRow && cell.y <= visible.endRow);
  const currentCell = currentCellKey ? cells.find((cell) => cell.coordKey === currentCellKey) ?? null : null;

  ctx.save();
  ctx.shadowColor = 'rgba(216,180,226,.20)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = 'rgba(255,255,255,.62)';
  drawRoundRect(ctx, viewport.tx - 6, viewport.ty - 6, boardWidth + 12, boardHeight + 12, 14);
  ctx.fill();
  ctx.restore();

  if (showGuide && currentCell) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,218,193,.22)';
    ctx.fillRect(viewport.tx, viewport.ty + currentCell.y * viewport.cellPx, boardWidth, viewport.cellPx);
    ctx.fillRect(viewport.tx + currentCell.x * viewport.cellPx, viewport.ty, viewport.cellPx, boardHeight);
    ctx.restore();
  }

  const gap = viewport.cellPx >= 15 ? Math.max(1.2, viewport.cellPx * 0.08) : viewport.cellPx >= 8 ? 0.8 : 0;
  const drawCircle = viewport.cellPx >= 10;

  for (const cell of visibleCells) {
    const x = viewport.tx + cell.x * viewport.cellPx;
    const y = viewport.ty + cell.y * viewport.cellPx;
    const isSelectedColor = activeColorKey ? cell.colorKey === activeColorKey : true;
    const done = completedCellKeys.has(cell.coordKey);
    const drawable = isDrawableCell(cell);

    ctx.save();
    ctx.globalAlpha = isSelectedColor ? 1 : 0.18;
    if (!drawable) {
      drawTransparentCell(ctx, x, y, viewport.cellPx);
    } else if (drawCircle) {
      ctx.fillStyle = done ? shade(cell.hex, -8, 0.62) : cell.hex;
      ctx.beginPath();
      ctx.arc(x + viewport.cellPx / 2, y + viewport.cellPx / 2, Math.max(1.5, viewport.cellPx / 2 - gap), 0, Math.PI * 2);
      ctx.fill();
      if (isSelectedColor && viewport.cellPx >= 15) {
        ctx.strokeStyle = 'rgba(123,79,160,.35)';
        ctx.lineWidth = Math.max(1, viewport.cellPx * 0.06);
        ctx.stroke();
      }
      if (viewport.cellPx >= 18) {
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath();
        ctx.arc(x + viewport.cellPx * 0.38, y + viewport.cellPx * 0.34, viewport.cellPx * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = done ? shade(cell.hex, -8, 0.62) : cell.hex;
      ctx.fillRect(x, y, Math.ceil(viewport.cellPx) + 0.5, Math.ceil(viewport.cellPx) + 0.5);
    }
    ctx.restore();
  }

  if (viewport.cellPx >= 7) {
    ctx.save();
    ctx.strokeStyle = viewport.cellPx >= 18 ? 'rgba(93,83,74,.18)' : 'rgba(93,83,74,.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let column = visible.startCol; column <= visible.endCol + 1; column += 1) {
      const x = Math.round(viewport.tx + column * viewport.cellPx) + 0.5;
      ctx.moveTo(x, viewport.ty + visible.startRow * viewport.cellPx);
      ctx.lineTo(x, viewport.ty + (visible.endRow + 1) * viewport.cellPx);
    }
    for (let row = visible.startRow; row <= visible.endRow + 1; row += 1) {
      const y = Math.round(viewport.ty + row * viewport.cellPx) + 0.5;
      ctx.moveTo(viewport.tx + visible.startCol * viewport.cellPx, y);
      ctx.lineTo(viewport.tx + (visible.endCol + 1) * viewport.cellPx, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (viewport.cellPx >= 4) {
    ctx.save();
    ctx.strokeStyle = 'rgba(180,143,204,.24)';
    ctx.lineWidth = viewport.cellPx >= 16 ? 2 : 1;
    ctx.beginPath();
    for (let column = Math.max(0, Math.ceil(visible.startCol / 10) * 10); column <= visible.endCol + 1; column += 10) {
      const x = Math.round(viewport.tx + column * viewport.cellPx) + 0.5;
      ctx.moveTo(x, viewport.ty + visible.startRow * viewport.cellPx);
      ctx.lineTo(x, viewport.ty + (visible.endRow + 1) * viewport.cellPx);
    }
    for (let row = Math.max(0, Math.ceil(visible.startRow / 10) * 10); row <= visible.endRow + 1; row += 10) {
      const y = Math.round(viewport.ty + row * viewport.cellPx) + 0.5;
      ctx.moveTo(viewport.tx + visible.startCol * viewport.cellPx, y);
      ctx.lineTo(viewport.tx + (visible.endCol + 1) * viewport.cellPx, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  if (currentCell) {
    const x = viewport.tx + currentCell.x * viewport.cellPx;
    const y = viewport.ty + currentCell.y * viewport.cellPx;
    ctx.save();
    ctx.strokeStyle = '#E8A87C';
    ctx.lineWidth = Math.max(3, Math.min(5, viewport.cellPx * 0.16));
    ctx.shadowColor = 'rgba(232,168,124,.55)';
    ctx.shadowBlur = 12;
    ctx.strokeRect(x + 1, y + 1, viewport.cellPx - 2, viewport.cellPx - 2);
    if (viewport.cellPx >= 20) {
      ctx.fillStyle = 'rgba(255,218,193,.22)';
      ctx.fillRect(x + 2, y + 2, viewport.cellPx - 4, viewport.cellPx - 4);
    }
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(93,83,74,.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(viewport.tx, viewport.ty, boardWidth, boardHeight);
  ctx.restore();

  ctx.restore();
}
