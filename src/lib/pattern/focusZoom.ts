import type { PatternResult } from '../../features/workshop/model/types';

export type FocusQuadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type FocusWindowBounds = {
  startX: number;
  startY: number;
  size: number;
};

export type FocusZoomRulerPosition = {
  horizontal: 'top' | 'bottom';
  vertical: 'left' | 'right';
};

export type FocusWindowAnchor = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

export type FocusBlockCell = {
  x: number;
  y: number;
  colorId: string;
  vendorCode: string;
  hex: string;
  isExternal?: boolean;
};

const DEFAULT_BORDER_COLOR = 'rgba(93, 83, 74, 0.16)';
const DEFAULT_GRID_COLOR = 'rgba(93, 83, 74, 0.10)';
const DEFAULT_RULER_BG = '#e8e2d4';
const DEFAULT_RULER_TEXT = '#4a4030';
const DEFAULT_RULER_LINE = '#b0a090';
const DEFAULT_FOCUS_OVERLAY = 'rgba(216, 180, 226, 0.18)';
const DEFAULT_PAGE_SEPARATOR_COLOR = 'rgba(244, 109, 122, 0.92)';

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseHexColor(hex: string) {
  const normalized = hex.startsWith('#') ? hex.slice(1) : hex;
  if (normalized.length !== 6) return null;
  const value = Number.parseInt(normalized, 16);
  if (Number.isNaN(value)) return null;
  return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
}

function getPerceivedBrightness(hex: string) {
  const rgb = parseHexColor(hex);
  if (!rgb) return 255;
  return rgb.r * 0.299 + rgb.g * 0.587 + rgb.b * 0.114;
}

function getRulerTextColor() {
  return DEFAULT_RULER_TEXT;
}

function getFocusColorStroke(hex: string) {
  return getPerceivedBrightness(hex) >= 150 ? 'rgba(34, 34, 34, 0.92)' : 'rgba(255, 255, 255, 0.96)';
}

function getFocusColorShadow(hex: string) {
  return getPerceivedBrightness(hex) >= 150 ? 'rgba(0, 0, 0, 0.18)' : 'rgba(255, 255, 255, 0.30)';
}

export function getQuadrant(pattern: PatternResult, blockCells: FocusBlockCell[]): FocusQuadrant {
  const xs = blockCells.map((cell) => cell.x);
  const ys = blockCells.map((cell) => cell.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const blockCenterX = (minX + maxX) / 2;
  const blockCenterY = (minY + maxY) / 2;
  const centerX = pattern.width / 2;
  const centerY = pattern.height / 2;

  if (blockCenterX <= centerX && blockCenterY <= centerY) return 'top-left';
  if (blockCenterX > centerX && blockCenterY <= centerY) return 'top-right';
  if (blockCenterX <= centerX && blockCenterY > centerY) return 'bottom-left';
  return 'bottom-right';
}

export function getRulerPosition(quadrant: FocusQuadrant): FocusZoomRulerPosition {
  switch (quadrant) {
    case 'top-left':
      return { horizontal: 'top', vertical: 'left' };
    case 'top-right':
      return { horizontal: 'top', vertical: 'right' };
    case 'bottom-left':
      return { horizontal: 'bottom', vertical: 'left' };
    case 'bottom-right':
      return { horizontal: 'bottom', vertical: 'right' };
  }
}

function getBlockBounds(blockCells: FocusBlockCell[]) {
  const xs = blockCells.map((cell) => cell.x);
  const ys = blockCells.map((cell) => cell.y);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
}

export function getFocusWindowBounds(pattern: PatternResult, blockCells: FocusBlockCell[], minSize = 10, anchor?: FocusWindowAnchor): FocusWindowBounds {
  const size = Math.max(1, minSize);
  if (blockCells.length === 0) {
    return { startX: 0, startY: 0, size };
  }

  const { minX, maxX, minY, maxY } = getBlockBounds(blockCells);
  const windowAnchor = anchor ?? getQuadrant(pattern, blockCells);

  let startX = minX;
  let startY = minY;
  if (windowAnchor === 'top-right' || windowAnchor === 'bottom-right') {
    startX = maxX - size + 1;
  }
  if (windowAnchor === 'bottom-left' || windowAnchor === 'bottom-right') {
    startY = maxY - size + 1;
  }

  startX = clamp(startX, 0, Math.max(0, pattern.width - size));
  startY = clamp(startY, 0, Math.max(0, pattern.height - size));

  return { startX, startY, size };
}

export function getFocusPanBounds(pattern: PatternResult, blockCells: FocusBlockCell[], windowBounds: FocusWindowBounds, anchor: FocusWindowAnchor): FocusWindowBounds & {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  const size = Math.max(1, windowBounds.size);
  const globalMinX = 0;
  const globalMaxX = Math.max(0, pattern.width - size);
  const globalMinY = 0;
  const globalMaxY = Math.max(0, pattern.height - size);

  if (blockCells.length === 0) {
    const startX = clamp(windowBounds.startX, globalMinX, globalMaxX);
    const startY = clamp(windowBounds.startY, globalMinY, globalMaxY);
    return { startX, startY, size, minX: startX, maxX: startX, minY: startY, maxY: startY };
  }

  const { minX, maxX, minY, maxY } = getBlockBounds(blockCells);
  const spanX = maxX - minX + 1;
  const spanY = maxY - minY + 1;
  const overflowX = Math.max(0, spanX - size);
  const overflowY = Math.max(0, spanY - size);
  const initialStartX = clamp(windowBounds.startX, globalMinX, globalMaxX);
  const initialStartY = clamp(windowBounds.startY, globalMinY, globalMaxY);

  let localMinX = initialStartX;
  let localMaxX = initialStartX;
  if (overflowX > 0) {
    if (anchor === 'top-right' || anchor === 'bottom-right') {
      localMinX = initialStartX - overflowX;
      localMaxX = initialStartX;
    } else {
      localMinX = initialStartX;
      localMaxX = initialStartX + overflowX;
    }
  }

  let localMinY = initialStartY;
  let localMaxY = initialStartY;
  if (overflowY > 0) {
    if (anchor === 'bottom-left' || anchor === 'bottom-right') {
      localMinY = initialStartY - overflowY;
      localMaxY = initialStartY;
    } else {
      localMinY = initialStartY;
      localMaxY = initialStartY + overflowY;
    }
  }

  const minPanX = clamp(Math.min(localMinX, localMaxX), globalMinX, globalMaxX);
  const maxPanX = clamp(Math.max(localMinX, localMaxX), globalMinX, globalMaxX);
  const minPanY = clamp(Math.min(localMinY, localMaxY), globalMinY, globalMaxY);
  const maxPanY = clamp(Math.max(localMinY, localMaxY), globalMinY, globalMaxY);
  const startX = clamp(initialStartX, minPanX, maxPanX);
  const startY = clamp(initialStartY, minPanY, maxPanY);

  return { startX, startY, size, minX: minPanX, maxX: maxPanX, minY: minPanY, maxY: maxPanY };
}

function drawCellBackground(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fill: string) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, width, height);
}

function drawTransparentCellBackground(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number) {
  ctx.fillStyle = '#F3F1EC';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#E4DFD6';
  const stepX = Math.max(4, width / 3);
  const stepY = Math.max(4, height / 3);
  for (let row = 0; row < 3; row += 1) {
    for (let col = 0; col < 3; col += 1) {
      if ((row + col) % 2 === 0) continue;
      ctx.fillRect(x + col * stepX, y + row * stepY, stepX, stepY);
    }
  }
}

function drawRulerTick(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, isMajor: boolean) {
  ctx.save();
  ctx.strokeStyle = DEFAULT_RULER_LINE;
  ctx.lineWidth = isMajor ? 1.2 : 0.8;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.restore();
}

export function drawPatternFocusZoomView(params: {
  canvas: HTMLCanvasElement;
  pattern: PatternResult;
  blockCells: FocusBlockCell[];
  activeColorKey?: string | null;
  windowBounds?: FocusWindowBounds;
  rulerPosition?: FocusZoomRulerPosition;
  completedCellKeys?: string[];
  tileSize?: number;
  rulerThickness?: number;
  gridLineColor?: string;
  borderColor?: string;
}) {
  const {
    canvas,
    pattern,
    blockCells,
    activeColorKey = null,
    windowBounds,
    rulerPosition,
    completedCellKeys = [],
    tileSize = 26,
    rulerThickness = 26,
    gridLineColor = DEFAULT_GRID_COLOR,
    borderColor = DEFAULT_BORDER_COLOR,
  } = params;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const bounds = windowBounds ?? getFocusWindowBounds(pattern, blockCells, 10);
  const ruler = rulerPosition ?? getRulerPosition(getQuadrant(pattern, blockCells));
  const size = Math.max(10, bounds.size);
  const contentWidth = size * tileSize;
  const contentHeight = size * tileSize;
  const totalWidth = contentWidth + rulerThickness;
  const totalHeight = contentHeight + rulerThickness;

  canvas.width = totalWidth;
  canvas.height = totalHeight;
  ctx.clearRect(0, 0, totalWidth, totalHeight);
  ctx.fillStyle = DEFAULT_RULER_BG;
  ctx.fillRect(0, 0, totalWidth, totalHeight);

  const xOffset = ruler.vertical === 'left' ? rulerThickness : 0;
  const yOffset = ruler.horizontal === 'top' ? rulerThickness : 0;
  const activeColorSet = activeColorKey ? new Set(blockCells.map((cell) => `${cell.colorId}-${cell.vendorCode}-${cell.hex}`)) : null;
  const completedSet = new Set(completedCellKeys);
  const blockCellSet = new Set(blockCells.map((cell) => `${cell.x},${cell.y}`));
  const cellLookup = new Map<string, PatternResult['cells'][number]>();
  for (const cell of pattern.cells) {
    cellLookup.set(`${cell.x},${cell.y}`, cell);
  }

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const gridX = bounds.startX + col;
      const gridY = bounds.startY + row;
      const drawX = xOffset + col * tileSize;
      const drawY = yOffset + row * tileSize;
      const cell = cellLookup.get(`${gridX},${gridY}`);
      const cellKey = `${gridX},${gridY}`;
      const isBlockCell = blockCellSet.has(cellKey);
      const isCompleted = completedSet.has(cellKey);
      const isActiveColor = activeColorSet ? Boolean(cell && activeColorSet.has(`${cell.colorId}-${cell.vendorCode}-${cell.hex}`)) : true;

      if (!cell || cell.isExternal || cell.hex === 'transparent' || !isBlockCell) {
        drawTransparentCellBackground(ctx, drawX, drawY, tileSize, tileSize);
      } else {
        drawCellBackground(ctx, drawX, drawY, tileSize, tileSize, cell.hex);
      }

      ctx.save();
      ctx.strokeStyle = gridLineColor;
      ctx.lineWidth = 1;
      ctx.strokeRect(drawX + 0.5, drawY + 0.5, tileSize - 1, tileSize - 1);
      ctx.restore();

      if (isCompleted && isActiveColor) {
        ctx.save();
        ctx.fillStyle = 'rgba(132, 193, 102, 0.34)';
        ctx.fillRect(drawX, drawY, tileSize, tileSize);
        ctx.fillStyle = 'rgba(255, 255, 255, 0.12)';
        ctx.fillRect(drawX, drawY, tileSize, tileSize);
        ctx.restore();
      }

      if (isBlockCell) {
        const inset = Math.max(1.4, tileSize * 0.08);
        const targetHex = cell?.hex ?? '#D8B4E2';
        ctx.save();
        ctx.shadowColor = getFocusColorShadow(targetHex);
        ctx.shadowBlur = Math.max(2, tileSize * 0.18);
        ctx.lineWidth = Math.max(1.6, tileSize * 0.12);
        ctx.strokeStyle = getFocusColorStroke(targetHex);
        ctx.strokeRect(drawX + inset, drawY + inset, tileSize - inset * 2, tileSize - inset * 2);
        ctx.restore();
      }
    }
  }

  ctx.save();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(xOffset + 0.5, yOffset + 0.5, contentWidth - 1, contentHeight - 1);
  ctx.restore();

  ctx.save();
  ctx.fillStyle = 'rgba(196, 155, 212, 0.06)';
  ctx.fillRect(xOffset, yOffset, contentWidth, contentHeight);
  ctx.restore();

  const majorEvery = 1;

  ctx.save();
  ctx.fillStyle = DEFAULT_RULER_BG;
  if (ruler.horizontal === 'top') {
    ctx.fillRect(xOffset, 0, contentWidth, rulerThickness);
  } else {
    ctx.fillRect(xOffset, yOffset + contentHeight, contentWidth, rulerThickness);
  }
  if (ruler.vertical === 'left') {
    ctx.fillRect(0, yOffset, rulerThickness, contentHeight);
  } else {
    ctx.fillRect(xOffset + contentWidth, yOffset, rulerThickness, contentHeight);
  }
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = DEFAULT_RULER_LINE;
  ctx.lineWidth = 1;
  if (ruler.horizontal === 'top') {
    ctx.beginPath();
    ctx.moveTo(xOffset, rulerThickness - 0.5);
    ctx.lineTo(xOffset + contentWidth, rulerThickness - 0.5);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(xOffset, yOffset + contentHeight + 0.5);
    ctx.lineTo(xOffset + contentWidth, yOffset + contentHeight + 0.5);
    ctx.stroke();
  }
  if (ruler.vertical === 'left') {
    ctx.beginPath();
    ctx.moveTo(rulerThickness - 0.5, yOffset);
    ctx.lineTo(rulerThickness - 0.5, yOffset + contentHeight);
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(xOffset + contentWidth + 0.5, yOffset);
    ctx.lineTo(xOffset + contentWidth + 0.5, yOffset + contentHeight);
    ctx.stroke();
  }
  ctx.restore();

  ctx.save();
  ctx.fillStyle = getRulerTextColor();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const showLabels = size <= 24;
  for (let col = 0; col < size; col += 1) {
    const label = `${bounds.startX + col + 1}`;
    const isMajor = col % majorEvery === 0 || col === size - 1;
    const x = xOffset + col * tileSize + tileSize / 2;
    if (ruler.horizontal === 'top') {
      drawRulerTick(ctx, xOffset + col * tileSize + 0.5, rulerThickness - (isMajor ? 9 : 5), xOffset + col * tileSize + 0.5, rulerThickness - 1, isMajor);
      if (showLabels && isMajor) {
        ctx.font = `500 8px system-ui, sans-serif`;
        ctx.fillText(label, x, rulerThickness / 2 - 1);
      }
    } else {
      drawRulerTick(ctx, xOffset + col * tileSize + 0.5, yOffset + contentHeight + 1, xOffset + col * tileSize + 0.5, yOffset + contentHeight + (isMajor ? 12 : 7), isMajor);
      if (showLabels && isMajor) {
        ctx.font = `500 8px system-ui, sans-serif`;
        ctx.fillText(label, x, yOffset + contentHeight + rulerThickness / 2 + 1);
      }
    }
  }

  for (let row = 0; row < size; row += 1) {
    const label = `${bounds.startY + row + 1}`;
    const isMajor = row % majorEvery === 0 || row === size - 1;
    const y = yOffset + row * tileSize + tileSize / 2;
    if (ruler.vertical === 'left') {
      drawRulerTick(ctx, rulerThickness - (isMajor ? 9 : 5), yOffset + row * tileSize + 0.5, rulerThickness - 1, yOffset + row * tileSize + 0.5, isMajor);
      if (showLabels && isMajor) {
        ctx.font = `500 8px system-ui, sans-serif`;
        ctx.fillText(label, rulerThickness / 2 - 1, y);
      }
    } else {
      drawRulerTick(ctx, xOffset + contentWidth + 1, yOffset + row * tileSize + 0.5, xOffset + contentWidth + (isMajor ? 9 : 5), yOffset + row * tileSize + 0.5, isMajor);
      if (showLabels && isMajor) {
        ctx.font = `500 8px system-ui, sans-serif`;
        ctx.fillText(label, xOffset + contentWidth + rulerThickness / 2 + 1, y);
      }
    }
  }
  ctx.restore();

  if (blockCells.length > 0) {
    const { minX, maxX, minY, maxY } = getBlockBounds(blockCells);
    const spanX = maxX - minX + 1;
    const spanY = maxY - minY + 1;
    ctx.save();
    ctx.strokeStyle = DEFAULT_PAGE_SEPARATOR_COLOR;
    ctx.lineWidth = Math.max(2, tileSize * 0.1);
    ctx.setLineDash([Math.max(5, tileSize * 0.28), Math.max(3, tileSize * 0.16)]);
    ctx.lineCap = 'round';

    if (spanX > size) {
      for (let splitX = minX + size; splitX <= maxX; splitX += size) {
        if (splitX <= bounds.startX || splitX >= bounds.startX + size) continue;
        const drawX = xOffset + (splitX - bounds.startX) * tileSize;
        ctx.beginPath();
        ctx.moveTo(drawX, yOffset);
        ctx.lineTo(drawX, yOffset + contentHeight);
        ctx.stroke();
      }
    }

    if (spanY > size) {
      for (let splitY = minY + size; splitY <= maxY; splitY += size) {
        if (splitY <= bounds.startY || splitY >= bounds.startY + size) continue;
        const drawY = yOffset + (splitY - bounds.startY) * tileSize;
        ctx.beginPath();
        ctx.moveTo(xOffset, drawY);
        ctx.lineTo(xOffset + contentWidth, drawY);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  ctx.save();
  ctx.fillStyle = DEFAULT_FOCUS_OVERLAY;
  for (const cell of blockCells) {
    if (cell.x < bounds.startX || cell.x >= bounds.startX + size || cell.y < bounds.startY || cell.y >= bounds.startY + size) continue;
    const localX = xOffset + (cell.x - bounds.startX) * tileSize;
    const localY = yOffset + (cell.y - bounds.startY) * tileSize;
    ctx.fillRect(localX, localY, tileSize, tileSize);
  }
  ctx.restore();
}
