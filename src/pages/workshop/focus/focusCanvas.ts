import type { PatternCell, PatternResult, WorkshopBoardLayout } from '../../../features/workshop/model/types';
import {
  drawBeadBoardBorder,
  drawBeadBoardCells,
  drawBeadBoardDividers,
  drawBeadBoardGrid,
  drawBeadBoardSurface,
} from '../../../lib/pattern/beadBoardCanvas';
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

export function getFitViewport(pattern: PatternResult, width: number, height: number, boardLayout?: WorkshopBoardLayout | null): FocusViewport {
  const boardWidthCells = boardLayout?.boardWidth ?? pattern.width;
  const boardHeightCells = boardLayout?.boardHeight ?? pattern.height;
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
  const fit = Math.min((area.width - pad * 2) / boardWidthCells, (area.height - pad * 2) / boardHeightCells);
  const minCellPx = clamp(fit * 0.55, 0.7, 6);
  const maxCellPx = 72;
  const cellPx = clamp(fit, minCellPx, maxCellPx);
  const boardWidth = boardWidthCells * cellPx;
  const boardHeight = boardHeightCells * cellPx;

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

export function getVisibleRange(size: { width: number; height: number }, viewport: FocusViewport, width: number, clip: CanvasClipArea): VisibleRange {
  return {
    startCol: clamp(Math.floor((-viewport.tx) / viewport.cellPx) - 1, 0, size.width - 1),
    endCol: clamp(Math.ceil((width - viewport.tx) / viewport.cellPx) + 1, 0, size.width - 1),
    startRow: clamp(Math.floor((clip.top - viewport.ty) / viewport.cellPx) - 1, 0, size.height - 1),
    endRow: clamp(Math.ceil((clip.bottom - viewport.ty) / viewport.cellPx) + 1, 0, size.height - 1),
  };
}

export function screenToCell(viewport: FocusViewport, clientX: number, clientY: number) {
  return {
    x: Math.floor((clientX - viewport.tx) / viewport.cellPx),
    y: Math.floor((clientY - viewport.ty) / viewport.cellPx),
  };
}

function drawRectProgress(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
) {
  const clamped = clamp(progress, 0, 1);
  if (clamped <= 0 || width <= 0 || height <= 0) return;

  const perimeter = (width + height) * 2;
  let remaining = perimeter * clamped;
  const segments = [
    { x1: x, y1: y, x2: x + width, y2: y, length: width },
    { x1: x + width, y1: y, x2: x + width, y2: y + height, length: height },
    { x1: x + width, y1: y + height, x2: x, y2: y + height, length: width },
    { x1: x, y1: y + height, x2: x, y2: y, length: height },
  ];

  ctx.beginPath();
  for (const segment of segments) {
    if (remaining <= 0) break;
    const length = Math.min(segment.length, remaining);
    const ratio = segment.length > 0 ? length / segment.length : 0;
    ctx.moveTo(segment.x1, segment.y1);
    ctx.lineTo(
      segment.x1 + (segment.x2 - segment.x1) * ratio,
      segment.y1 + (segment.y2 - segment.y1) * ratio,
    );
    remaining -= length;
  }
  ctx.stroke();
}

function drawRectProgressFlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  offset: number,
) {
  const clamped = clamp(progress, 0, 1);
  if (clamped <= 0 || width <= 0 || height <= 0) return;
  const perimeter = (width + height) * 2;
  const progressLength = perimeter * clamped;
  const headLength = Math.min(14, Math.max(6, progressLength));
  const headEnd = progressLength <= headLength ? progressLength : (offset * 86) % progressLength;
  const headStart = Math.max(0, headEnd - headLength);

  ctx.setLineDash([headLength, perimeter]);
  ctx.lineDashOffset = -headStart;
  drawRectProgress(ctx, x, y, width, height, progress);
}

function getRectPerimeterPoint(x: number, y: number, width: number, height: number, progress: number) {
  const clamped = clamp(progress, 0, 1);
  const perimeter = (width + height) * 2;
  let distance = perimeter * clamped;

  if (distance <= width) {
    return { x: x + distance, y };
  }
  distance -= width;

  if (distance <= height) {
    return { x: x + width, y: y + distance };
  }
  distance -= height;

  if (distance <= width) {
    return { x: x + width - distance, y: y + height };
  }
  distance -= width;

  return { x, y: y + height - distance };
}

function drawCompletionSweepPoint(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  progress: number,
  cellPx: number,
) {
  if (width <= 0 || height <= 0) return;

  const point = getRectPerimeterPoint(x, y, width, height, progress);
  const radius = Math.max(4, Math.min(9, cellPx * 0.24));
  const glowRadius = radius * 4.2;
  const pulse = Math.sin(clamp(progress, 0, 1) * Math.PI);
  const glow = ctx.createRadialGradient(point.x, point.y, 0, point.x, point.y, glowRadius);
  glow.addColorStop(0, `rgba(255,255,255,${0.92 + pulse * 0.08})`);
  glow.addColorStop(0.22, 'rgba(255,218,193,0.86)');
  glow.addColorStop(1, 'rgba(255,218,193,0)');

  ctx.save();
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(point.x, point.y, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#fff7df';
  ctx.shadowColor = 'rgba(255,218,193,.95)';
  ctx.shadowBlur = 14 + pulse * 8;
  ctx.beginPath();
  ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function getDisplayColumn(totalColumns: number, handedness: 'left' | 'right', physicalColumn: number) {
  return handedness === 'right' ? physicalColumn + 1 : totalColumns - physicalColumn;
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
  boardLayout: WorkshopBoardLayout;
  viewport: FocusViewport;
  width: number;
  clip: CanvasClipArea;
  sideRulerTop: number;
  sideRulerHeight: number;
  currentCell: { x: number; y: number } | null;
  handedness: 'left' | 'right';
}): RulerData {
  const { boardLayout, viewport, width, clip, sideRulerTop, sideRulerHeight, currentCell, handedness } = params;
  const range = getVisibleRange({ width: boardLayout.boardWidth, height: boardLayout.boardHeight }, viewport, width, clip);
  const step = getRulerStep(viewport.cellPx);
  const currentDisplayColumn = currentCell ? getDisplayColumn(boardLayout.boardWidth, handedness, currentCell.x) : 1;
  const columns: RulerLabel[] = [];
  const rows: RulerLabel[] = [];

  for (let column = range.startCol; column <= range.endCol; column += 1) {
    const screenX = viewport.tx + (column + 0.5) * viewport.cellPx;
    if (screenX < -40 || screenX > width + 40) continue;
    const displayColumn = getDisplayColumn(boardLayout.boardWidth, handedness, column);
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

function getHexLuminance(hex: string) {
  const normalized = hex.replace('#', '');
  const expanded = normalized.length === 3
    ? normalized.split('').map((digit) => `${digit}${digit}`).join('')
    : normalized;
  const value = Number.parseInt(expanded, 16);
  if (Number.isNaN(value) || expanded.length !== 6) return 1;
  const channels = [
    (value >> 16) & 255,
    (value >> 8) & 255,
    value & 255,
  ].map((channel) => {
    const normalizedChannel = channel / 255;
    return normalizedChannel <= 0.03928
      ? normalizedChannel / 12.92
      : Math.pow((normalizedChannel + 0.055) / 1.055, 2.4);
  });

  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function drawTransparentCell(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const cellSize = size / 4;
  const light = '#F7F5F1';
  const dark = '#E2DED6';

  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      ctx.fillStyle = (row + column) % 2 === 0 ? light : dark;
      ctx.fillRect(
        x + column * cellSize,
        y + row * cellSize,
        Math.ceil(cellSize) + 0.5,
        Math.ceil(cellSize) + 0.5,
      );
    }
  }
}

function drawCompletedCellMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, drawCircle: boolean, selectedColor: boolean, hex: string) {
  if (size < 10) return;

  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const dotRadius = Math.max(1.4, Math.min(4.2, size * 0.12));
  const ringInset = Math.max(3, size * 0.24);
  const isDarkCell = getHexLuminance(hex) < 0.28;
  const dotColor = isDarkCell
    ? `rgba(255,246,226,${selectedColor ? 0.72 : 0.82})`
    : `rgba(93,83,74,${selectedColor ? 0.42 : 0.5})`;
  const ringColor = isDarkCell
    ? `rgba(255,246,226,${selectedColor ? 0.36 : 0.46})`
    : `rgba(93,83,74,${selectedColor ? 0.18 : 0.24})`;

  ctx.save();
  ctx.fillStyle = dotColor;
  ctx.beginPath();
  ctx.arc(centerX, centerY, dotRadius, 0, Math.PI * 2);
  ctx.fill();

  if (size >= 20) {
    ctx.strokeStyle = ringColor;
    ctx.lineWidth = Math.max(1, size * 0.045);
    if (drawCircle) {
      ctx.beginPath();
      ctx.arc(centerX, centerY, Math.max(dotRadius + 3, size / 2 - ringInset), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeRect(x + ringInset, y + ringInset, size - ringInset * 2, size - ringInset * 2);
    }
  }
  ctx.restore();
}

export function drawFocusCanvas(params: {
  canvas: HTMLCanvasElement;
  pattern: PatternResult;
  cells: FocusBoardCell[];
  viewport: FocusViewport;
  boardLayout: WorkshopBoardLayout;
  activeColorKey: string | null;
  currentCellKey: string | null;
  completedCellKeys: Set<string>;
  selectedBlockCellKeys: Set<string>;
  completionProgress: number;
  completionGlowProgress?: number;
  progressFlowOffset: number;
  showGuide: boolean;
  placementMode: boolean;
  handedness: 'left' | 'right';
  width: number;
  height: number;
  clip: CanvasClipArea;
}) {
  const {
    canvas,
    pattern,
    cells,
    viewport,
    boardLayout,
    activeColorKey,
    currentCellKey,
    completedCellKeys,
    selectedBlockCellKeys,
    completionProgress,
    completionGlowProgress = 0,
    progressFlowOffset,
    showGuide,
    placementMode,
    width,
    height,
    clip,
  } = params;
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

  const boardWidth = boardLayout.boardWidth * viewport.cellPx;
  const boardHeight = boardLayout.boardHeight * viewport.cellPx;
  const patternX = boardLayout.patternOffsetX * viewport.cellPx;
  const patternY = boardLayout.patternOffsetY * viewport.cellPx;
  const patternWidth = pattern.width * viewport.cellPx;
  const patternHeight = pattern.height * viewport.cellPx;
  const visible = getVisibleRange({ width: boardLayout.boardWidth, height: boardLayout.boardHeight }, viewport, width, clip);
  const visibleCells = cells.filter((cell) => {
    const boardX = boardLayout.patternOffsetX + cell.x;
    const boardY = boardLayout.patternOffsetY + cell.y;
    return boardX >= visible.startCol && boardX <= visible.endCol && boardY >= visible.startRow && boardY <= visible.endRow;
  });
  const currentCell = currentCellKey ? cells.find((cell) => cell.coordKey === currentCellKey) ?? null : null;
  const currentBoardCell = currentCell
    ? {
        x: boardLayout.patternOffsetX + currentCell.x,
        y: boardLayout.patternOffsetY + currentCell.y,
      }
    : null;

  drawBeadBoardSurface(ctx, viewport.tx, viewport.ty, boardWidth, boardHeight);

  if (showGuide && currentBoardCell) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,218,193,.22)';
    ctx.fillRect(viewport.tx, viewport.ty + currentBoardCell.y * viewport.cellPx, boardWidth, viewport.cellPx);
    ctx.fillRect(viewport.tx + currentBoardCell.x * viewport.cellPx, viewport.ty, viewport.cellPx, boardHeight);
    ctx.restore();
  }

  drawBeadBoardCells({
    ctx,
    cells: visibleCells,
    originX: viewport.tx,
    originY: viewport.ty,
    cellPx: viewport.cellPx,
    patternOffsetX: boardLayout.patternOffsetX,
    patternOffsetY: boardLayout.patternOffsetY,
    visibleRange: visible,
    activeColorKey,
    completedCellKeys,
    isDrawableCell,
    getCoordKey: (cell) => cell.coordKey,
    getColorKey: (cell) => cell.colorKey,
  });

  drawBeadBoardGrid({
    ctx,
    originX: viewport.tx,
    originY: viewport.ty,
    cellPx: viewport.cellPx,
    visibleRange: visible,
  });

  drawBeadBoardDividers({
    ctx,
    originX: viewport.tx,
    originY: viewport.ty,
    cellPx: viewport.cellPx,
    visibleRange: visible,
    boardWidth: boardLayout.boardWidth,
    handedness: params.handedness,
  });

  if (currentBoardCell) {
    const x = viewport.tx + currentBoardCell.x * viewport.cellPx;
    const y = viewport.ty + currentBoardCell.y * viewport.cellPx;
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

  const drawBlockOutline = (cellKeys: Set<string>, color: string, widthScale: number, shadowColor: string) => {
    if (cellKeys.size === 0) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(2, Math.min(6, viewport.cellPx * widthScale));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = shadowColor;
    ctx.shadowBlur = 7;
    ctx.setLineDash([Math.max(6, viewport.cellPx * 0.48), Math.max(4, viewport.cellPx * 0.32)]);
    ctx.beginPath();

    for (const cell of cells) {
      if (!cellKeys.has(cell.coordKey)) continue;
      const boardX = boardLayout.patternOffsetX + cell.x;
      const boardY = boardLayout.patternOffsetY + cell.y;
      const x = viewport.tx + boardX * viewport.cellPx;
      const y = viewport.ty + boardY * viewport.cellPx;
      const size = viewport.cellPx;
      const topKey = `${cell.x},${cell.y - 1}`;
      const rightKey = `${cell.x + 1},${cell.y}`;
      const bottomKey = `${cell.x},${cell.y + 1}`;
      const leftKey = `${cell.x - 1},${cell.y}`;

      if (!cellKeys.has(topKey)) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y);
      }
      if (!cellKeys.has(rightKey)) {
        ctx.moveTo(x + size, y);
        ctx.lineTo(x + size, y + size);
      }
      if (!cellKeys.has(bottomKey)) {
        ctx.moveTo(x + size, y + size);
        ctx.lineTo(x, y + size);
      }
      if (!cellKeys.has(leftKey)) {
        ctx.moveTo(x, y + size);
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.restore();
  };

  if (selectedBlockCellKeys.size > 0) {
    drawBlockOutline(
      selectedBlockCellKeys,
      '#4C2B6F',
      0.18,
      'rgba(255,255,255,.72)',
    );
  }

  if (placementMode) {
    ctx.save();
    ctx.strokeStyle = '#E8A87C';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 6]);
    ctx.strokeRect(viewport.tx + patternX, viewport.ty + patternY, patternWidth, patternHeight);
    ctx.restore();
  } else {
    const progressInset = Math.max(2, Math.min(6, viewport.cellPx * 0.16));
    const progressX = viewport.tx + patternX - progressInset;
    const progressY = viewport.ty + patternY - progressInset;
    const progressWidth = patternWidth + progressInset * 2;
    const progressHeight = patternHeight + progressInset * 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(93,83,74,.18)';
    ctx.lineWidth = Math.max(4, Math.min(8, viewport.cellPx * 0.22));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeRect(progressX, progressY, progressWidth, progressHeight);
    ctx.strokeStyle = '#7BC56E';
    ctx.shadowColor = 'rgba(123,197,110,.28)';
    ctx.shadowBlur = 8;
    drawRectProgress(ctx, progressX, progressY, progressWidth, progressHeight, completionProgress);
    if (completionGlowProgress <= 0) {
      ctx.strokeStyle = 'rgba(232,255,220,.9)';
      ctx.shadowColor = 'rgba(232,255,220,.62)';
      ctx.shadowBlur = 10;
      ctx.lineWidth = Math.max(3, Math.min(5, viewport.cellPx * 0.14));
      drawRectProgressFlow(ctx, progressX, progressY, progressWidth, progressHeight, completionProgress, progressFlowOffset);
    }
    ctx.restore();

    if (completionGlowProgress > 0) {
      drawCompletionSweepPoint(
        ctx,
        progressX,
        progressY,
        progressWidth,
        progressHeight,
        completionGlowProgress,
        viewport.cellPx,
      );
    }
  }

  drawBeadBoardBorder(ctx, viewport.tx, viewport.ty, boardWidth, boardHeight);

  ctx.restore();
}
