export type BeadBoardVisibleRange = {
  startCol: number;
  endCol: number;
  startRow: number;
  endRow: number;
};

export type BeadBoardCell = {
  x: number;
  y: number;
  hex: string;
  isExternal?: boolean;
  vendorCode?: string;
  coordKey?: string;
  colorKey?: string;
};

type Handedness = 'left' | 'right';
export type BeadShape = 'auto' | 'circle' | 'square';
export type TransparentCellBackground = 'checker' | 'white';

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
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

function isTransparentHex(hex: string) {
  return !hex || hex === 'transparent';
}

function defaultIsDrawableCell(cell: BeadBoardCell) {
  return !cell.isExternal && !isTransparentHex(cell.hex) && (cell.vendorCode === undefined || Boolean(cell.vendorCode));
}

function defaultCoordKey(cell: BeadBoardCell) {
  return cell.coordKey ?? `${cell.x},${cell.y}`;
}

function defaultColorKey(cell: BeadBoardCell) {
  return cell.colorKey ?? cell.hex;
}

function drawTransparentCell(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  size: number,
  background: TransparentCellBackground,
) {
  if (background === 'white') {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x, y, Math.ceil(size) + 0.5, Math.ceil(size) + 0.5);
    return;
  }

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

function getPixelScale(cellPx: number, visibleCellPx: number) {
  return Math.max(1, cellPx / Math.max(1, visibleCellPx));
}

export function drawBeadBoardSurface(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  boardWidth: number,
  boardHeight: number,
) {
  ctx.save();
  ctx.shadowColor = 'rgba(216,180,226,.20)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = 'rgba(255,255,255,.62)';
  drawRoundRect(ctx, originX - 6, originY - 6, boardWidth + 12, boardHeight + 12, 14);
  ctx.fill();
  ctx.restore();
}

export function drawBeadBoardCells<TCell extends BeadBoardCell>(params: {
  ctx: CanvasRenderingContext2D;
  cells: TCell[];
  originX: number;
  originY: number;
  cellPx: number;
  visibleCellPx?: number;
  patternOffsetX?: number;
  patternOffsetY?: number;
  visibleRange?: BeadBoardVisibleRange;
  activeColorKey?: string | null;
  completedCellKeys?: Set<string>;
  isDrawableCell?: (cell: TCell) => boolean;
  getCoordKey?: (cell: TCell) => string;
  getColorKey?: (cell: TCell) => string;
  beadShape?: BeadShape;
  transparentCellBackground?: TransparentCellBackground;
}) {
  const {
    ctx,
    cells,
    originX,
    originY,
    cellPx,
    visibleCellPx = cellPx,
    patternOffsetX = 0,
    patternOffsetY = 0,
    visibleRange,
    activeColorKey = null,
    completedCellKeys = new Set<string>(),
    isDrawableCell = defaultIsDrawableCell as (cell: TCell) => boolean,
    getCoordKey = defaultCoordKey as (cell: TCell) => string,
    getColorKey = defaultColorKey as (cell: TCell) => string,
    beadShape = 'auto',
    transparentCellBackground = 'checker',
  } = params;
  const gap = visibleCellPx >= 15 ? Math.max(1.2, cellPx * 0.08) : visibleCellPx >= 8 ? Math.max(0.8, getPixelScale(cellPx, visibleCellPx) * 0.8) : 0;
  const drawCircle = beadShape === 'circle' || (beadShape === 'auto' && visibleCellPx >= 10);

  for (const cell of cells) {
    const boardX = patternOffsetX + cell.x;
    const boardY = patternOffsetY + cell.y;
    if (
      visibleRange &&
      (boardX < visibleRange.startCol ||
        boardX > visibleRange.endCol ||
        boardY < visibleRange.startRow ||
        boardY > visibleRange.endRow)
    ) {
      continue;
    }

    const x = originX + boardX * cellPx;
    const y = originY + boardY * cellPx;
    const isSelectedColor = activeColorKey ? getColorKey(cell) === activeColorKey : true;
    const done = completedCellKeys.has(getCoordKey(cell));
    const drawable = isDrawableCell(cell);

    ctx.save();
    ctx.globalAlpha = isSelectedColor ? 1 : done ? 0.26 : 0.18;
    if (!drawable) {
      drawTransparentCell(ctx, x, y, cellPx, transparentCellBackground);
    } else if (drawCircle) {
      ctx.fillStyle = done ? shade(cell.hex, -10, 0.74) : cell.hex;
      ctx.beginPath();
      ctx.arc(x + cellPx / 2, y + cellPx / 2, Math.max(1.5, cellPx / 2 - gap), 0, Math.PI * 2);
      ctx.fill();
      if (isSelectedColor && visibleCellPx >= 15) {
        ctx.strokeStyle = 'rgba(123,79,160,.35)';
        ctx.lineWidth = Math.max(1, cellPx * 0.06);
        ctx.stroke();
      }
      if (visibleCellPx >= 18) {
        ctx.fillStyle = 'rgba(255,255,255,.35)';
        ctx.beginPath();
        ctx.arc(x + cellPx * 0.38, y + cellPx * 0.34, cellPx * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
      if (done) drawCompletedCellMark(ctx, x, y, cellPx, true, isSelectedColor, cell.hex);
    } else {
      ctx.fillStyle = done ? shade(cell.hex, -10, 0.74) : cell.hex;
      ctx.fillRect(x, y, Math.ceil(cellPx) + 0.5, Math.ceil(cellPx) + 0.5);
      if (done) drawCompletedCellMark(ctx, x, y, cellPx, false, isSelectedColor, cell.hex);
    }
    ctx.restore();
  }
}

export function drawBeadBoardGrid(params: {
  ctx: CanvasRenderingContext2D;
  originX: number;
  originY: number;
  cellPx: number;
  visibleCellPx?: number;
  visibleRange: BeadBoardVisibleRange;
}) {
  const { ctx, originX, originY, cellPx, visibleCellPx = cellPx, visibleRange } = params;
  if (visibleCellPx < 7) return;

  const pixelScale = getPixelScale(cellPx, visibleCellPx);
  ctx.save();
  ctx.strokeStyle = visibleCellPx >= 18 ? 'rgba(93,83,74,.18)' : 'rgba(93,83,74,.10)';
  ctx.lineWidth = pixelScale;
  ctx.beginPath();
  for (let column = visibleRange.startCol; column <= visibleRange.endCol + 1; column += 1) {
    const x = Math.round(originX + column * cellPx) + 0.5;
    ctx.moveTo(x, originY + visibleRange.startRow * cellPx);
    ctx.lineTo(x, originY + (visibleRange.endRow + 1) * cellPx);
  }
  for (let row = visibleRange.startRow; row <= visibleRange.endRow + 1; row += 1) {
    const y = Math.round(originY + row * cellPx) + 0.5;
    ctx.moveTo(originX + visibleRange.startCol * cellPx, y);
    ctx.lineTo(originX + (visibleRange.endCol + 1) * cellPx, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawBeadBoardDividers(params: {
  ctx: CanvasRenderingContext2D;
  originX: number;
  originY: number;
  cellPx: number;
  visibleCellPx?: number;
  visibleRange: BeadBoardVisibleRange;
  boardWidth: number;
  handedness?: Handedness;
}) {
  const { ctx, originX, originY, cellPx, visibleCellPx = cellPx, visibleRange, boardWidth, handedness = 'right' } = params;
  if (visibleCellPx < 4) return;

  const pixelScale = getPixelScale(cellPx, visibleCellPx);
  ctx.save();
  ctx.strokeStyle = '#C7DFF7';
  ctx.lineWidth = 2 * pixelScale;
  ctx.setLineDash([5 * pixelScale, 10 * pixelScale]);
  ctx.beginPath();

  if (handedness === 'left') {
    for (let column = boardWidth - 5; column >= 0; column -= 5) {
      const x = Math.round(originX + column * cellPx) + 0.5;
      ctx.moveTo(x, originY + visibleRange.startRow * cellPx);
      ctx.lineTo(x, originY + (visibleRange.endRow + 1) * cellPx);
    }
  } else {
    for (let column = Math.ceil(visibleRange.startCol / 5) * 5; column <= visibleRange.endCol + 1; column += 5) {
      if (column >= 0 && column < boardWidth) {
        const x = Math.round(originX + column * cellPx) + 0.5;
        ctx.moveTo(x, originY + visibleRange.startRow * cellPx);
        ctx.lineTo(x, originY + (visibleRange.endRow + 1) * cellPx);
      }
    }
  }

  for (let row = Math.ceil(visibleRange.startRow / 5) * 5; row <= visibleRange.endRow + 1; row += 5) {
    const y = Math.round(originY + row * cellPx) + 0.5;
    ctx.moveTo(originX + visibleRange.startCol * cellPx, y);
    ctx.lineTo(originX + (visibleRange.endCol + 1) * cellPx, y);
  }
  ctx.stroke();
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = 'rgba(180,143,204,.28)';
  ctx.lineWidth = (visibleCellPx >= 16 ? 3 : 2) * pixelScale;
  ctx.setLineDash([]);
  ctx.beginPath();

  if (handedness === 'left') {
    for (let column = boardWidth - 10; column >= 0; column -= 10) {
      const x = Math.round(originX + column * cellPx) + 0.5;
      ctx.moveTo(x, originY + visibleRange.startRow * cellPx);
      ctx.lineTo(x, originY + (visibleRange.endRow + 1) * cellPx);
    }
  } else {
    for (let column = Math.max(0, Math.ceil(visibleRange.startCol / 10) * 10); column <= visibleRange.endCol + 1; column += 10) {
      const x = Math.round(originX + column * cellPx) + 0.5;
      ctx.moveTo(x, originY + visibleRange.startRow * cellPx);
      ctx.lineTo(x, originY + (visibleRange.endRow + 1) * cellPx);
    }
  }

  for (let row = Math.max(0, Math.ceil(visibleRange.startRow / 10) * 10); row <= visibleRange.endRow + 1; row += 10) {
    const y = Math.round(originY + row * cellPx) + 0.5;
    ctx.moveTo(originX + visibleRange.startCol * cellPx, y);
    ctx.lineTo(originX + (visibleRange.endCol + 1) * cellPx, y);
  }
  ctx.stroke();
  ctx.restore();
}

export function drawBeadBoardBorder(
  ctx: CanvasRenderingContext2D,
  originX: number,
  originY: number,
  boardWidth: number,
  boardHeight: number,
) {
  ctx.save();
  ctx.strokeStyle = 'rgba(93,83,74,.22)';
  ctx.lineWidth = 2;
  ctx.strokeRect(originX, originY, boardWidth, boardHeight);
  ctx.restore();
}

export function drawBeadBoard<TCell extends BeadBoardCell>(params: {
  ctx: CanvasRenderingContext2D;
  cells: TCell[];
  boardWidth: number;
  boardHeight: number;
  originX?: number;
  originY?: number;
  cellPx: number;
  visibleCellPx?: number;
  visibleRange?: BeadBoardVisibleRange;
  showSurface?: boolean;
  showGrid?: boolean;
  showDividers?: boolean;
  showBorder?: boolean;
  handedness?: Handedness;
  beadShape?: BeadShape;
  transparentCellBackground?: TransparentCellBackground;
}) {
  const {
    ctx,
    cells,
    boardWidth,
    boardHeight,
    originX = 0,
    originY = 0,
    cellPx,
    visibleCellPx = cellPx,
    visibleRange = {
      startCol: 0,
      endCol: boardWidth - 1,
      startRow: 0,
      endRow: boardHeight - 1,
    },
    showSurface = true,
    showGrid = true,
    showDividers = true,
    showBorder = true,
    handedness = 'right',
    beadShape = 'auto',
    transparentCellBackground = 'checker',
  } = params;
  const pixelWidth = boardWidth * cellPx;
  const pixelHeight = boardHeight * cellPx;

  if (showSurface) drawBeadBoardSurface(ctx, originX, originY, pixelWidth, pixelHeight);
  drawBeadBoardCells({
    ctx,
    cells,
    originX,
    originY,
    cellPx,
    visibleCellPx,
    visibleRange,
    beadShape,
    transparentCellBackground,
  });
  if (showGrid) drawBeadBoardGrid({ ctx, originX, originY, cellPx, visibleCellPx, visibleRange });
  if (showGrid && showDividers) drawBeadBoardDividers({ ctx, originX, originY, cellPx, visibleCellPx, visibleRange, boardWidth, handedness });
  if (showBorder) drawBeadBoardBorder(ctx, originX, originY, pixelWidth, pixelHeight);
}
