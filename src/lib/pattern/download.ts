import type { ColorSystem, PatternResult } from '../../features/workshop/model/types';
import { getVendorCode } from './color-system';

export const DEFAULT_DOWNLOAD_AUTHOR_NAME = '嘟豆豆(Dodoudou)';

export type DownloadPatternOptions = {
  authorName: string;
  patternName: string;
  showGrid: boolean;
  gridGap: number;
  gridColor: string;
  showSymbol: boolean;
  showSymbolStats: boolean;
  addWatermark: boolean;
  highDefinition?: boolean;
  brand: ColorSystem;
  patternResult: PatternResult;
};

type CanvasLike = HTMLCanvasElement | OffscreenCanvas;
type CanvasContextLike = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

type PaletteItem = {
  id: string;
  color: string;
  name: string;
  count: number;
};

type Layout = {
  G: number;
  cellSize: number;
  divStep: number;
  gridW: number;
  gridH: number;
  cols: number;
  rows: number;
  padTop: number;
  padLR: number;
  padBot: number;
  rulerSz: number;
  rulerFS: number;
  titleFS: number;
  subFS: number;
  titleH: number;
  cellLabelFS: number;
  swW: number;
  swH: number;
  swGapX: number;
  swGapY: number;
  swBotPad: number;
  SW_COLS: number;
  swRows: number;
  swIdFS: number;
  swCntFS: number;
  listTitleFS: number;
  swAreaW: number;
  swAreaH: number;
  listH: number;
  contentW: number;
  canvasW: number;
  canvasH: number;
  xContent: number;
  xRulerL: number;
  xGrid: number;
  xRulerR: number;
  xSwatches: number;
  yTitle: number;
  yRulerTop: number;
  yGrid: number;
  yRulerBot: number;
  yRulerL: number;
  yList: number;
  ySwatches: number;
};

function r(n: number) {
  return Math.max(1, Math.round(n));
}

function line(ctx: CanvasContextLike, x1: number, y1: number, x2: number, y2: number) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function drawDash(ctx: CanvasContextLike, x1: number, y1: number, x2: number, y2: number, color: string, lw: number) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = lw;
  ctx.setLineDash([6, 4]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function rrect(ctx: CanvasContextLike, x: number, y: number, w: number, h: number, rd: number) {
  ctx.beginPath();
  ctx.moveTo(x + rd, y);
  ctx.lineTo(x + w - rd, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rd);
  ctx.lineTo(x + w, y + h - rd);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rd, y + h);
  ctx.lineTo(x + rd, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rd);
  ctx.lineTo(x, y + rd);
  ctx.quadraticCurveTo(x, y, x + rd, y);
  ctx.closePath();
}

function lum(hex: string) {
  const c = hex.replace('#', '');
  const rv = Number.parseInt(c.slice(0, 2), 16) / 255;
  const gv = Number.parseInt(c.slice(2, 4), 16) / 255;
  const bv = Number.parseInt(c.slice(4, 6), 16) / 255;
  const f = (v: number) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  return 0.2126 * f(rv) + 0.7152 * f(gv) + 0.0722 * f(bv);
}

function createCanvas(width: number, height: number, scale = 1): CanvasLike {
  const scaledWidth = Math.max(1, Math.floor(width * scale));
  const scaledHeight = Math.max(1, Math.floor(height * scale));
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(scaledWidth, scaledHeight);
  const canvas = document.createElement('canvas');
  canvas.width = scaledWidth;
  canvas.height = scaledHeight;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  return canvas;
}

function getExportScale(options: DownloadPatternOptions) {
  return options.highDefinition ? 3 : 1;
}

function getPalette(patternResult: PatternResult, brand: ColorSystem): PaletteItem[] {
  return patternResult.palette.map((entry) => ({
    id: getVendorCode(entry.hex, brand),
    color: entry.hex === 'transparent' ? '#ffffff' : entry.hex,
    name: entry.hex,
    count: entry.count,
  }));
}

function buildDemoGrid(patternResult: PatternResult) {
  const grid: (PatternResult['cells'][number] | null)[][] = [];
  for (let y = 0; y < patternResult.height; y += 1) {
    const row: (PatternResult['cells'][number] | null)[] = [];
    for (let x = 0; x < patternResult.width; x += 1) {
      row.push(patternResult.cells.find((cell) => cell.x === x && cell.y === y) ?? null);
    }
    grid.push(row);
  }
  return grid;
}

function calcLayout(cols: number, rows: number, cellSize: number, divStep: number, paletteCount: number): Layout {
  const gridW = cols * cellSize;
  const gridH = rows * cellSize;
  const G = Math.max(gridW, gridH);

  const padTop = G / 20;
  const padLR = G / 40;
  const padBot = G / 10;

  const rulerSz = G / 30;
  const rulerFS = Math.max(7, G / 60);

  const titleFS = G / 20;
  const subFS = G / 40;
  const titleH = titleFS + padTop * 0.4 + subFS;

  const cellLabelFS = cellSize * 0.36;

  const swW = G / 10;
  const swH = G / 20;
  const swGapX = G / 80;
  const swGapY = G / 60;
  const swBotPad = G / 40;
  const SW_COLS = 8;
  const swRows = Math.ceil(paletteCount / SW_COLS);
  const swIdFS = Math.max(8, swH * 0.5 * 0.55);
  const swCntFS = Math.max(7, swH * 0.5 * 0.48);
  const listTitleFS = subFS;
  const swCols = Math.min(paletteCount, SW_COLS);
  const swAreaW = swCols * swW + Math.max(0, swCols - 1) * swGapX;
  const swAreaH = swRows * swH + Math.max(0, swRows - 1) * swGapY;
  const listH = listTitleFS + padTop * 0.3 + swAreaH;

  const gridGroupW = rulerSz + gridW + rulerSz;
  const contentW = Math.max(gridGroupW, swAreaW);
  const canvasW = padLR + contentW + padLR;
  const canvasH = padTop + titleH + padTop + rulerSz + gridH + rulerSz + padTop + listH + swBotPad + padBot;

  const xContent = padLR;
  const xRulerL = xContent + (contentW - gridGroupW) / 2;
  const xGrid = xRulerL + rulerSz;
  const xRulerR = xGrid + gridW;
  const xSwatches = xContent + (contentW - swAreaW) / 2;
  const yTitle = padTop;
  const yRulerTop = padTop + titleH + padTop;
  const yGrid = yRulerTop + rulerSz;
  const yRulerBot = yGrid + gridH;
  const yRulerL = yGrid;
  const yList = yRulerBot + rulerSz + padTop;
  const ySwatches = yList + listTitleFS + padTop * 0.3;

  return {
    G, cellSize, divStep, gridW, gridH, cols, rows, padTop, padLR, padBot, rulerSz, rulerFS, titleFS, subFS, titleH,
    cellLabelFS, swW, swH, swGapX, swGapY, swBotPad, SW_COLS, swRows, swIdFS, swCntFS, listTitleFS, swAreaW, swAreaH, listH,
    contentW, canvasW, canvasH, xContent, xRulerL, xGrid, xRulerR, xSwatches, yTitle, yRulerTop, yGrid, yRulerBot, yRulerL, yList, ySwatches,
  };
}

function rulerNumbers(total: number, divStep: number) {
  const res: Array<{ centerIdx: number; label: string }> = [];
  for (let c = 0; c <= total; c += divStep) {
    if (c === 0) res.push({ centerIdx: 0, label: '1' });
    else res.push({ centerIdx: c - 1, label: String(c) });
  }
  return res;
}

function drawRulerTop(ctx: CanvasContextLike, L: Layout) {
  const { xGrid, yRulerTop, rulerSz, rulerFS, cellSize, cols, divStep } = L;
  ctx.fillStyle = '#e8e2d4';
  ctx.fillRect(r(xGrid), r(yRulerTop), r(L.gridW), r(rulerSz));
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4a4030';
  ctx.font = `500 ${r(rulerFS)}px "Noto Sans SC", sans-serif`;
  rulerNumbers(cols, divStep).forEach(({ centerIdx, label }) => {
    if (centerIdx >= cols) return;
    ctx.fillText(label, xGrid + centerIdx * cellSize + cellSize / 2, yRulerTop + rulerSz / 2);
  });
  ctx.strokeStyle = '#b0a090';
  ctx.lineWidth = Math.max(0.5, L.G / 3000);
  ctx.strokeRect(r(xGrid), r(yRulerTop), r(L.gridW), r(rulerSz));
}

function drawRulerBottom(ctx: CanvasContextLike, L: Layout) {
  const { xGrid, yRulerBot, rulerSz, rulerFS, cellSize, cols, divStep } = L;
  ctx.fillStyle = '#e8e2d4';
  ctx.fillRect(r(xGrid), r(yRulerBot), r(L.gridW), r(rulerSz));
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4a4030';
  ctx.font = `500 ${r(rulerFS)}px "Noto Sans SC", sans-serif`;
  rulerNumbers(cols, divStep).forEach(({ centerIdx, label }) => {
    if (centerIdx >= cols) return;
    ctx.fillText(label, xGrid + centerIdx * cellSize + cellSize / 2, yRulerBot + rulerSz / 2);
  });
  ctx.strokeStyle = '#b0a090';
  ctx.lineWidth = Math.max(0.5, L.G / 3000);
  ctx.strokeRect(r(xGrid), r(yRulerBot), r(L.gridW), r(rulerSz));
}

function drawRulerLeft(ctx: CanvasContextLike, L: Layout) {
  const { xRulerL, yGrid, rulerSz, rulerFS, cellSize, rows, divStep } = L;
  ctx.fillStyle = '#e8e2d4';
  ctx.fillRect(r(xRulerL), r(yGrid), r(rulerSz), r(L.gridH));
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4a4030';
  ctx.font = `500 ${r(rulerFS)}px "Noto Sans SC", sans-serif`;
  rulerNumbers(rows, divStep).forEach(({ centerIdx, label }) => {
    if (centerIdx >= rows) return;
    ctx.fillText(label, xRulerL + rulerSz / 2, yGrid + centerIdx * cellSize + cellSize / 2);
  });
  ctx.strokeStyle = '#b0a090';
  ctx.lineWidth = Math.max(0.5, L.G / 3000);
  ctx.strokeRect(r(xRulerL), r(yGrid), r(rulerSz), r(L.gridH));
}

function drawRulerRight(ctx: CanvasContextLike, L: Layout) {
  const { xRulerR, yGrid, rulerSz, rulerFS, cellSize, rows, divStep } = L;
  ctx.fillStyle = '#e8e2d4';
  ctx.fillRect(r(xRulerR), r(yGrid), r(rulerSz), r(L.gridH));
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#4a4030';
  ctx.font = `500 ${r(rulerFS)}px "Noto Sans SC", sans-serif`;
  rulerNumbers(rows, divStep).forEach(({ centerIdx, label }) => {
    if (centerIdx >= rows) return;
    ctx.fillText(label, xRulerR + rulerSz / 2, yGrid + centerIdx * cellSize + cellSize / 2);
  });
  ctx.strokeStyle = '#b0a090';
  ctx.lineWidth = Math.max(0.5, L.G / 3000);
  ctx.strokeRect(r(xRulerR), r(yGrid), r(rulerSz), r(L.gridH));
}

function drawSwatches(ctx: CanvasContextLike, L: Layout, palette: PaletteItem[]) {
  const { xSwatches, ySwatches, swW, swH, swGapX, swGapY, SW_COLS, swIdFS, swCntFS } = L;
  const halfH = swH / 2;
  const rad = Math.max(3, swH * 0.12);
  palette.forEach((p, i) => {
    const col = i % SW_COLS;
    const row = Math.floor(i / SW_COLS);
    const sx = xSwatches + col * (swW + swGapX);
    const sy = ySwatches + row * (swH + swGapY);
    ctx.save();
    rrect(ctx, sx, sy, swW, swH, rad);
    ctx.clip();
    ctx.fillStyle = p.color;
    ctx.fillRect(sx, sy, swW, halfH);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(sx, sy + halfH, swW, halfH);
    ctx.restore();
    ctx.strokeStyle = '#c0b8ac';
    ctx.lineWidth = Math.max(1, L.G / 3500);
    rrect(ctx, sx, sy, swW, swH, rad);
    ctx.stroke();
    ctx.strokeStyle = '#d4cec6';
    ctx.lineWidth = Math.max(0.5, L.G / 5000);
    line(ctx, sx, sy + halfH, sx + swW, sy + halfH);
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillStyle = lum(p.color) > 0.35 ? 'rgba(0,0,0,0.75)' : 'rgba(255,255,255,0.92)';
    ctx.font = `700 ${r(swIdFS)}px "Noto Sans SC", sans-serif`;
    ctx.fillText(p.id, sx + swW / 2, sy + halfH / 2);
    ctx.fillStyle = '#1e1a12';
    ctx.font = `400 ${r(swCntFS)}px "Noto Sans SC", sans-serif`;
    ctx.fillText(String(p.count), sx + swW / 2, sy + halfH + halfH / 2);
  });
}

function drawToCanvas(canvas: CanvasLike, patternResult: PatternResult, options: DownloadPatternOptions, scale: number) {
  const { authorName, patternName, showGrid, gridGap, gridColor, showSymbolStats, brand } = options;
  const normalizedPatternName = patternName.trim() || 'Dodoudou';
  const normalizedAuthorName = authorName.trim();
  const cols = patternResult.width;
  const rows = patternResult.height;
  const cellSize = 30;
  const divStep = Math.max(1, Math.round(gridGap || 10));
  const palette = getPalette(patternResult, brand);
  const L = calcLayout(cols, rows, cellSize, divStep, palette.length);
  const grid = buildDemoGrid(patternResult);

  canvas.width = Math.round(L.canvasW * scale);
  canvas.height = Math.round(L.canvasH * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.scale(scale, scale);

  ctx.fillStyle = '#f5f0e8';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fdfaf4';
  ctx.fillRect(0, 0, canvas.width, Math.round(L.yRulerTop - L.padTop * 0.3));

  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1e1a12';
  ctx.font = `700 ${r(L.titleFS)}px "Noto Sans SC", sans-serif`;
  ctx.fillText(normalizedPatternName, L.xContent, L.yTitle, L.contentW);

  ctx.fillStyle = '#7a6e5e';
  ctx.font = `400 ${r(L.subFS)}px "Noto Sans SC", sans-serif`;
  const total = palette.reduce((s, p) => s + p.count, 0);
  const authorSuffix = normalizedAuthorName ? `  ·  设计：${normalizedAuthorName}` : '';
  ctx.fillText(`${cols} × ${rows}  ·  共 ${total} 颗  ·  分割线每 ${divStep} 格${authorSuffix}`, L.xContent, L.yTitle + L.titleFS + L.padTop * 0.4, L.contentW);
  const gridLineColor = gridColor || '#c0b49a';
  drawDash(ctx, L.xContent, L.yRulerTop - L.padTop * 0.22, L.xContent + L.contentW, L.yRulerTop - L.padTop * 0.22, gridLineColor, Math.max(0.8, L.G / 1200));

  drawRulerTop(ctx, L);
  drawRulerBottom(ctx, L);
  drawRulerLeft(ctx, L);
  drawRulerRight(ctx, L);

  for (let r2 = 0; r2 < rows; r2 += 1) {
    for (let c2 = 0; c2 < cols; c2 += 1) {
      const cell = grid[r2][c2];
      const x1 = Math.floor(L.xGrid + c2 * cellSize);
      const y1 = Math.floor(L.yGrid + r2 * cellSize);
      const x2 = Math.floor(L.xGrid + (c2 + 1) * cellSize);
      const y2 = Math.floor(L.yGrid + (r2 + 1) * cellSize);
      ctx.fillStyle = cell ? cell.hex : '#ffffff';
      ctx.fillRect(x1, y1, x2 - x1 + 1, y2 - y1 + 1);
    }
  }

  if (cellSize >= 16 && options.showSymbol) {
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.font = `600 ${r(L.cellLabelFS)}px "Noto Sans SC", sans-serif`;
    for (let r2 = 0; r2 < rows; r2 += 1) {
      for (let c2 = 0; c2 < cols; c2 += 1) {
        const cell = grid[r2][c2];
        if (!cell || cell.hex === 'transparent') continue;
        const symbol = cell.vendorCode || getVendorCode(cell.hex, brand);
        if (!symbol || symbol === '?') continue;
        ctx.fillStyle = lum(cell.hex) > 0.35 ? 'rgba(0,0,0,0.60)' : 'rgba(255,255,255,0.80)';
        ctx.fillText(symbol, L.xGrid + (c2 + 0.5) * cellSize, L.yGrid + (r2 + 0.5) * cellSize);
      }
    }
    ctx.textAlign = 'left';
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.09)';
  ctx.lineWidth = Math.max(0.3, L.G / 8000);
  for (let c2 = 0; c2 <= cols; c2 += 1) {
    const x = Math.round(L.xGrid + c2 * cellSize);
    line(ctx, x, L.yGrid, x, L.yGrid + L.gridH);
  }
  for (let r2 = 0; r2 <= rows; r2 += 1) {
    const y = Math.round(L.yGrid + r2 * cellSize);
    line(ctx, L.xGrid, y, L.xGrid + L.gridW, y);
  }

  if (showGrid) {
    ctx.strokeStyle = gridLineColor;
    ctx.lineWidth = Math.max(0.8, L.G / 1800);
    for (let c2 = 0; c2 <= cols; c2 += divStep) {
      const x = Math.round(L.xGrid + c2 * cellSize);
      line(ctx, x, L.yGrid, x, L.yGrid + L.gridH);
    }
    for (let r2 = 0; r2 <= rows; r2 += divStep) {
      const y = Math.round(L.yGrid + r2 * cellSize);
      line(ctx, L.xGrid, y, L.xGrid + L.gridW, y);
    }
  }

  ctx.strokeStyle = '#1e1a12';
  ctx.lineWidth = Math.max(1.5, L.G / 900);
  ctx.strokeRect(Math.round(L.xGrid), Math.round(L.yGrid), Math.round(L.gridW), Math.round(L.gridH));

  drawDash(ctx, L.xContent, L.yList - L.padTop * 0.22, L.xContent + L.contentW, L.yList - L.padTop * 0.22, '#c0b49a', Math.max(0.8, L.G / 1200));
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#1e1a12';
  ctx.font = `600 ${r(L.listTitleFS)}px "Noto Sans SC", sans-serif`;
  ctx.fillText('物料清单', L.xContent, L.yList);

  if (showSymbolStats) {
    drawSwatches(ctx, L, palette);
  }

  if (!showSymbolStats) {
    ctx.save();
    ctx.fillStyle = 'rgba(93,83,74,0.62)';
    ctx.font = `700 ${r(L.subFS)}px "Noto Sans SC", sans-serif`;
    ctx.fillText('物料清单已关闭', L.xContent, L.ySwatches + L.swAreaH + L.swGapY);
    ctx.restore();
  }

  if (options.addWatermark && authorName.trim()) {
    ctx.save();
    ctx.globalAlpha = 0.11;
    ctx.fillStyle = '#c593d4';
    ctx.font = `800 ${Math.max(14, Math.round(cellSize * 0.28))}px "Noto Sans SC", sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.translate(L.canvasW / 2, L.canvasH / 2);
    ctx.rotate(-Math.PI / 6);
    for (let y = -L.canvasH; y < L.canvasH * 1.5; y += 96) {
      for (let x = -L.canvasW; x < L.canvasW * 1.5; x += 220) {
        ctx.fillText(authorName.trim(), x, y);
      }
    }
    ctx.restore();
  }
}

async function canvasToBlob(canvas: CanvasLike) {
  if ('convertToBlob' in canvas) return canvas.convertToBlob({ type: 'image/png' });
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob((blob) => {
      if (!blob) reject(new Error('Failed to create image blob'));
      else resolve(blob);
    }, 'image/png');
  });
}

function formatDownloadFileName(options: DownloadPatternOptions, scale: number) {
  const patternName = options.patternName.trim() || 'Dodoudou';
  const authorName = options.authorName.trim();
  const date = new Date();
  const yyyy = String(date.getFullYear());
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const safePattern = patternName.replace(/[\\/:*?"<>|\s]+/g, '_');
  const safeAuthor = authorName.replace(/[\\/:*?"<>|\s]+/g, '_');
  const safeDate = `${yyyy}${mm}${dd}`;
  const authorSuffix = safeAuthor ? `_${safeAuthor}` : '';
  const scaleSuffix = scale > 1 ? `_${scale}x` : '';
  return `${safePattern}${authorSuffix}${scaleSuffix}_${safeDate}.png`;
}

function isIosSafari() {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  const isIos = /iP(ad|hone|od)/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isWebKit = /WebKit/.test(ua);
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  return isIos && isWebKit && !isOtherIosBrowser;
}

function openIosSafariDownloadWindow() {
  if (!isIosSafari()) return null;
  const downloadWindow = window.open('', '_blank');
  if (!downloadWindow) return null;

  downloadWindow.opener = null;
  downloadWindow.document.title = 'Preparing download';
  downloadWindow.document.body.style.margin = '0';
  downloadWindow.document.body.style.fontFamily = 'system-ui, -apple-system, BlinkMacSystemFont, sans-serif';
  downloadWindow.document.body.innerHTML = '<div style="min-height:100vh;display:grid;place-items:center;color:#5d534a;background:#fdfaf4">Preparing download...</div>';
  return downloadWindow;
}

function createNamedObjectUrl(blob: Blob, fileName: string) {
  if (typeof File === 'undefined') return URL.createObjectURL(blob);
  return URL.createObjectURL(new File([blob], fileName, { type: blob.type || 'image/png' }));
}

function triggerBlobDownload(blob: Blob, fileName: string, fallbackWindow: Window | null) {
  const url = createNamedObjectUrl(blob, fileName);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  link.style.display = 'none';
  document.body.appendChild(link);

  const cleanup = () => {
    window.setTimeout(() => {
      link.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };

  if (fallbackWindow && !fallbackWindow.closed) {
    fallbackWindow.location.href = url;
    cleanup();
    return;
  }

  link.click();
  cleanup();
}

export async function downloadPatternImage(options: DownloadPatternOptions) {
  const scale = getExportScale(options);
  const fileName = formatDownloadFileName(options, scale);
  const iosSafariDownloadWindow = openIosSafariDownloadWindow();
  const canvas = createCanvas(1, 1, scale);
  drawToCanvas(canvas, options.patternResult, options, scale);
  const blob = await canvasToBlob(canvas);
  triggerBlobDownload(blob, fileName, iosSafariDownloadWindow);
}

export function renderDownloadPatternCanvas(canvas: HTMLCanvasElement, options: DownloadPatternOptions) {
  drawToCanvas(canvas, options.patternResult, options, 1);
}
