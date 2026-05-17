import type { PatternCell, PatternResult, WorkshopBoardLayout } from '../../../features/workshop/model/types';
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
  boardLayout: WorkshopBoardLayout;
  activeColorKey: string | null;
  currentCellKey: string | null;
  completedCellKeys: Set<string>;
  selectedBlockCellKeys: Set<string>;
  completionProgress: number;
  showGuide: boolean;
  placementMode: boolean;
  handedness: 'left' | 'right';
  width: number;
  height: number;
  clip: CanvasClipArea;
}) {
  const { canvas, pattern, cells, viewport, boardLayout, activeColorKey, currentCellKey, completedCellKeys, selectedBlockCellKeys, completionProgress, showGuide, placementMode, width, height, clip } = params;
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

  ctx.save();
  ctx.shadowColor = 'rgba(216,180,226,.20)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = 'rgba(255,255,255,.62)';
  drawRoundRect(ctx, viewport.tx - 6, viewport.ty - 6, boardWidth + 12, boardHeight + 12, 14);
  ctx.fill();
  ctx.restore();

  if (showGuide && currentBoardCell) {
    ctx.save();
    ctx.fillStyle = 'rgba(255,218,193,.22)';
    ctx.fillRect(viewport.tx, viewport.ty + currentBoardCell.y * viewport.cellPx, boardWidth, viewport.cellPx);
    ctx.fillRect(viewport.tx + currentBoardCell.x * viewport.cellPx, viewport.ty, viewport.cellPx, boardHeight);
    ctx.restore();
  }

  const gap = viewport.cellPx >= 15 ? Math.max(1.2, viewport.cellPx * 0.08) : viewport.cellPx >= 8 ? 0.8 : 0;
  const drawCircle = viewport.cellPx >= 10;

  for (const cell of visibleCells) {
    const x = viewport.tx + (boardLayout.patternOffsetX + cell.x) * viewport.cellPx;
    const y = viewport.ty + (boardLayout.patternOffsetY + cell.y) * viewport.cellPx;
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
    // 虚线分割线：每5格，颜色 #C7DFF7
    ctx.save();
    ctx.strokeStyle = '#C7DFF7';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 10]);
    ctx.beginPath();

    // 左手模式：从图纸最右侧开始，往左每5格画一条（不受视图滚动影响）
    if (params.handedness === 'left') {
      // 从 pattern.width - 5 开始，向左递减
      for (let column = boardLayout.boardWidth - 5; column >= 0; column -= 5) {
        const x = Math.round(viewport.tx + column * viewport.cellPx) + 0.5;
        ctx.moveTo(x, viewport.ty + visible.startRow * viewport.cellPx);
        ctx.lineTo(x, viewport.ty + (visible.endRow + 1) * viewport.cellPx);
      }
    } else {
      // 右手模式：从左上开始，往右每5格画一条
      for (let column = Math.ceil(visible.startCol / 5) * 5; column <= visible.endCol + 1; column += 5) {
        if (column >= 0 && column < boardLayout.boardWidth) {
          const x = Math.round(viewport.tx + column * viewport.cellPx) + 0.5;
          ctx.moveTo(x, viewport.ty + visible.startRow * viewport.cellPx);
          ctx.lineTo(x, viewport.ty + (visible.endRow + 1) * viewport.cellPx);
        }
      }
    }

    // 横线：两种模式都从顶部开始往下画
    const dashStartRow = Math.ceil(visible.startRow / 5) * 5;
    for (let row = dashStartRow; row <= visible.endRow + 1; row += 5) {
      const y = Math.round(viewport.ty + row * viewport.cellPx) + 0.5;
      ctx.moveTo(viewport.tx + visible.startCol * viewport.cellPx, y);
      ctx.lineTo(viewport.tx + (visible.endCol + 1) * viewport.cellPx, y);
    }
    ctx.stroke();
    ctx.restore();

    // 实线分割线：每10格，加粗处理
    ctx.save();
    ctx.strokeStyle = 'rgba(180,143,204,.28)';
    ctx.lineWidth = viewport.cellPx >= 16 ? 3 : 2;
    ctx.setLineDash([]);
    ctx.beginPath();

    // 左手模式：从图纸最右侧开始，往左每10格画一条
    if (params.handedness === 'left') {
      for (let column = boardLayout.boardWidth - 10; column >= 0; column -= 10) {
        const x = Math.round(viewport.tx + column * viewport.cellPx) + 0.5;
        ctx.moveTo(x, viewport.ty + visible.startRow * viewport.cellPx);
        ctx.lineTo(x, viewport.ty + (visible.endRow + 1) * viewport.cellPx);
      }
    } else {
      // 右手模式：从左上开始，往右每10格画一条
      for (let column = Math.max(0, Math.ceil(visible.startCol / 10) * 10); column <= visible.endCol + 1; column += 10) {
        const x = Math.round(viewport.tx + column * viewport.cellPx) + 0.5;
        ctx.moveTo(x, viewport.ty + visible.startRow * viewport.cellPx);
        ctx.lineTo(x, viewport.ty + (visible.endRow + 1) * viewport.cellPx);
      }
    }

    for (let row = Math.max(0, Math.ceil(visible.startRow / 10) * 10); row <= visible.endRow + 1; row += 10) {
      const y = Math.round(viewport.ty + row * viewport.cellPx) + 0.5;
      ctx.moveTo(viewport.tx + visible.startCol * viewport.cellPx, y);
      ctx.lineTo(viewport.tx + (visible.endCol + 1) * viewport.cellPx, y);
    }
    ctx.stroke();
    ctx.restore();
  }

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

  if (selectedBlockCellKeys.size > 0) {
    ctx.save();
    ctx.strokeStyle = '#4C2B6F';
    ctx.lineWidth = Math.max(2.5, Math.min(6, viewport.cellPx * 0.18));
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(255,255,255,.72)';
    ctx.shadowBlur = 7;
    ctx.beginPath();

    for (const cell of cells) {
      if (!selectedBlockCellKeys.has(cell.coordKey)) continue;
      const boardX = boardLayout.patternOffsetX + cell.x;
      const boardY = boardLayout.patternOffsetY + cell.y;
      const x = viewport.tx + boardX * viewport.cellPx;
      const y = viewport.ty + boardY * viewport.cellPx;
      const size = viewport.cellPx;
      const topKey = `${cell.x},${cell.y - 1}`;
      const rightKey = `${cell.x + 1},${cell.y}`;
      const bottomKey = `${cell.x},${cell.y + 1}`;
      const leftKey = `${cell.x - 1},${cell.y}`;

      if (!selectedBlockCellKeys.has(topKey)) {
        ctx.moveTo(x, y);
        ctx.lineTo(x + size, y);
      }
      if (!selectedBlockCellKeys.has(rightKey)) {
        ctx.moveTo(x + size, y);
        ctx.lineTo(x + size, y + size);
      }
      if (!selectedBlockCellKeys.has(bottomKey)) {
        ctx.moveTo(x + size, y + size);
        ctx.lineTo(x, y + size);
      }
      if (!selectedBlockCellKeys.has(leftKey)) {
        ctx.moveTo(x, y + size);
        ctx.lineTo(x, y);
      }
    }

    ctx.stroke();
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = placementMode ? '#E8A87C' : 'rgba(232,168,124,.52)';
  ctx.lineWidth = placementMode ? 3 : 2;
  ctx.setLineDash(placementMode ? [8, 6] : []);
  ctx.strokeRect(viewport.tx + patternX, viewport.ty + patternY, patternWidth, patternHeight);
  ctx.restore();

  if (!placementMode) {
    const progressInset = Math.max(2, Math.min(6, viewport.cellPx * 0.16));
    const progressX = viewport.tx + patternX - progressInset;
    const progressY = viewport.ty + patternY - progressInset;
    const progressWidth = patternWidth + progressInset * 2;
    const progressHeight = patternHeight + progressInset * 2;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,.82)';
    ctx.lineWidth = Math.max(4, Math.min(8, viewport.cellPx * 0.22));
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeRect(progressX, progressY, progressWidth, progressHeight);
    ctx.strokeStyle = '#7B4FA0';
    ctx.shadowColor = 'rgba(123,79,160,.32)';
    ctx.shadowBlur = 8;
    drawRectProgress(ctx, progressX, progressY, progressWidth, progressHeight, completionProgress);
    ctx.restore();
  }

  ctx.save();
  ctx.strokeStyle = 'rgba(93,83,74,.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(viewport.tx, viewport.ty, boardWidth, boardHeight);
  ctx.restore();

  ctx.restore();
}
