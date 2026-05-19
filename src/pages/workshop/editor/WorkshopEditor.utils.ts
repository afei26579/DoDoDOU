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

function drawTinyTransparentCell(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, row: number, column: number) {
  ctx.fillStyle = (row + column) % 2 === 0 ? TRANSPARENT_GRID_LIGHT : TRANSPARENT_GRID_DARK;
  ctx.fillRect(x, y, width, height);
}

function drawEditorGridLines(ctx: CanvasRenderingContext2D, width: number, height: number, cols: number, rows: number, cellSize: number, visibleCellSize: number) {
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

  ctx.save();
  ctx.strokeStyle = EDITOR_GRID_BORDER_COLOR;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, Math.max(0, width - 2), Math.max(0, height - 2));
  ctx.restore();
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
  displayWidth?: number;
  displayHeight?: number;
  visibleCellSize?: number;
}) {
  const ctx = canvas.getContext('2d');
  const pCtx = previewCanvas.getContext('2d');
  const bCtx = bubbleCanvas?.getContext('2d');
  if (!ctx || !pCtx) return;

  const cellSize = 16;
  canvas.width = cols * cellSize;
  canvas.height = rows * cellSize;
  canvas.style.width = displayWidth ? `${displayWidth}px` : `${canvas.width}px`;
  canvas.style.height = displayHeight ? `${displayHeight}px` : `${canvas.height}px`;

  ctx.fillStyle = bgColor;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  grid.forEach((row, r) => row.forEach((hex, c) => {
    if (isTransparentCell(hex)) {
      drawTransparentCell(ctx, c * cellSize, r * cellSize, cellSize);
      return;
    }
    ctx.fillStyle = hex;
    ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
  }));
  if (showGrid) {
    drawEditorGridLines(ctx, canvas.width, canvas.height, cols, rows, cellSize, visibleCellSize ?? cellSize);
  }

  previewCanvas.width = cols;
  previewCanvas.height = rows;
  pCtx.fillStyle = bgColor;
  pCtx.fillRect(0, 0, cols, rows);
  grid.forEach((row, r) => row.forEach((hex, c) => {
    if (isTransparentCell(hex)) {
      drawTinyTransparentCell(pCtx, c, r, 1, 1, r, c);
      return;
    }
    pCtx.fillStyle = hex;
    pCtx.fillRect(c, r, 1, 1);
  }));

  if (bCtx && bubbleCanvas) {
    bubbleCanvas.width = 32;
    bubbleCanvas.height = 32;
    bCtx.fillStyle = bgColor;
    bCtx.fillRect(0, 0, 32, 32);
    const scX = 32 / cols;
    const scY = 32 / rows;
    grid.forEach((row, r) => row.forEach((hex, c) => {
      const x = Math.floor(c * scX);
      const y = Math.floor(r * scY);
      const width = Math.max(1, Math.ceil(scX));
      const height = Math.max(1, Math.ceil(scY));
      if (isTransparentCell(hex)) {
        drawTinyTransparentCell(bCtx, x, y, width, height, r, c);
        return;
      }
      bCtx.fillStyle = hex;
      bCtx.fillRect(x, y, width, height);
    }));
  }
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
